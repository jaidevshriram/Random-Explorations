"""Mini MapTR: a zero-cost proof of concept for bin (classification) coordinate heads in a
DETR/MapTR-style vector model with Hungarian matching.

Synthetic images contain 1-3 vector elements (open curves and closed shapes). A small CNN +
transformer decoder predicts each element as a fixed set of points with a class. Training uses
Hungarian matching with MapTR's permutation-equivalent orderings (open: 2 directions; closed:
every start point x 2 directions). Only the coordinate head / loss / matching cost change:

    l1        : sigmoid regression, L1 loss, L1 matching cost              (MapTR baseline)
    bins      : 64 bins per coordinate, HL-Gauss cross-entropy, L1 cost on decoded points
    bins_nll  : same head, matching cost = negative log-likelihood of the GT bins

Metric: MapTR-style AP at Chamfer thresholds (1, 2, 3 px on a 64 px canvas), averaged over the
two classes, plus the matching flip rate (how often an element's matched query changes between
evaluations). Runs on CPU:

    python mini_maptr.py              # 3 heads x 3 seeds, ~1 h on 4 cores
    python mini_maptr.py --quick      # smoke test
"""
import argparse
import json
import math
import os
import time
from multiprocessing import Pool

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image, ImageDraw
from scipy.optimize import linear_sum_assignment

HERE = os.path.dirname(os.path.abspath(__file__))
S = 64  # canvas size (px)
P = 16  # points per element
MAX_EL = 3
CLASSES = ["open", "closed"]

# ----------------------------------------------------------------------------- data


def resample(pts, n, closed):
    """n points evenly spaced along the arc length of a dense polyline."""
    if closed:
        pts = np.vstack([pts, pts[:1]])
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    t = np.linspace(0, s[-1], n + 1 if closed else n)[: n]
    return np.stack([np.interp(t, s, pts[:, 0]), np.interp(t, s, pts[:, 1])], 1)


AMBIG_HALF_GAP = 2.5 / S  # --ambiguous: the two strokes of a double line are 5 px apart


def random_element(rng, ambiguous=False):
    """Returns (label, target points, [dense strokes to draw], closed, [acceptable answers])."""
    if rng.random() < 0.5:  # open: cubic Bezier
        while True:
            c = rng.uniform(0.08, 0.92, size=(4, 2))
            if np.linalg.norm(c[0] - c[3]) > 0.35:
                break
        t = np.linspace(0, 1, 200)[:, None]
        dense = (1 - t) ** 3 * c[0] + 3 * (1 - t) ** 2 * t * c[1] + 3 * (1 - t) * t ** 2 * c[2] + t ** 3 * c[3]
        if not ambiguous:
            p = resample(dense, P, False)
            return 0, p, [dense], False, [p]
        # a double line: the label follows one of the two strokes at random (like a double lane marking
        # annotated on either stroke); at evaluation either stroke counts as correct
        tan = np.gradient(dense, axis=0)
        nrm = np.stack([-tan[:, 1], tan[:, 0]], 1) / np.linalg.norm(tan, axis=1, keepdims=True)
        a, b = dense + AMBIG_HALF_GAP * nrm, dense - AMBIG_HALF_GAP * nrm
        alts = [resample(a, P, False), resample(b, P, False)]
        return 0, alts[int(rng.random() < 0.5)], [a, b], False, alts
    r0 = rng.uniform(0.1, 0.22)  # closed: wobbly ellipse
    ctr = rng.uniform(0.1 + r0 * 1.4, 0.9 - r0 * 1.4, size=2)
    th = np.linspace(0, 2 * np.pi, 200, endpoint=False)
    k, a, phi, ecc = rng.integers(2, 5), rng.uniform(0, 0.25), rng.uniform(0, 2 * np.pi), rng.uniform(0.6, 1.4)
    r = r0 * (1 + a * np.sin(k * th + phi))
    dense = np.stack([ctr[0] + ecc * r * np.cos(th), ctr[1] + r / ecc * np.sin(th)], 1)
    p = resample(dense, P, True)
    return 1, p, [dense], True, [p]


def make_sample(rng, ambiguous=False):
    n = rng.integers(1, MAX_EL + 1)
    els = [random_element(rng, ambiguous) for _ in range(n)]
    img = Image.new("L", (S * 2, S * 2), 0)
    d = ImageDraw.Draw(img)
    for _, _, strokes, closed, _ in els:
        for dense in strokes:
            pts = dense * S * 2
            if closed:
                pts = np.vstack([pts, pts[:1]])
            d.line([tuple(p) for p in pts], fill=255, width=4)
    img = np.asarray(img.resize((S, S), Image.LANCZOS), dtype=np.uint8)
    labels = np.array([e[0] for e in els])
    pts = np.stack([e[1] for e in els]).astype(np.float32)
    alts = [np.stack(e[4]).astype(np.float32) for e in els]
    return img, labels, pts, alts


def make_dataset(n, seed, ambiguous=False):
    rng = np.random.default_rng(seed)
    imgs, labels, pts, alts = [], [], [], []
    for _ in range(n):
        i, l, p, a = make_sample(rng, ambiguous)
        imgs.append(i), labels.append(l), pts.append(p), alts.append(a)
    return np.stack(imgs), labels, pts, alts


def orders(pts, label):
    """All equivalent orderings of one element's points: (O, P, 2)."""
    if label == 0:
        return np.stack([pts, pts[::-1]])
    shifts = [np.roll(pts, -k, axis=0) for k in range(P)]
    return np.stack(shifts + [s[::-1] for s in shifts])

# ----------------------------------------------------------------------------- model


class MiniMapTR(nn.Module):
    def __init__(self, head, n_query=12, d=128, layers=3, k_bins=64):
        super().__init__()
        self.head, self.k = head, k_bins
        g = lambda c: nn.GroupNorm(8, c)
        self.enc = nn.Sequential(nn.Conv2d(1, 32, 3, 2, 1), g(32), nn.ReLU(), nn.Conv2d(32, 64, 3, 2, 1), g(64), nn.ReLU(),
                                 nn.Conv2d(64, 128, 3, 2, 1), g(128), nn.ReLU(), nn.Conv2d(128, d, 3, 1, 1))
        self.pos = nn.Parameter(torch.randn(1, (S // 8) ** 2, d) * 0.02)
        self.query = nn.Parameter(torch.randn(n_query, d) * 0.5)
        self.layers = nn.ModuleList([nn.TransformerDecoderLayer(d, 4, 256, dropout=0.0, batch_first=True)
                                     for _ in range(layers)])
        self.norm = nn.LayerNorm(d)
        self.cls = nn.Linear(d, len(CLASSES) + 1)  # last = no object
        out = P * 2 * (k_bins if head != "l1" else 1)
        self.coord = nn.Sequential(nn.Linear(d, d), nn.ReLU(), nn.Linear(d, d), nn.ReLU(), nn.Linear(d, out))

    def forward(self, x):
        mem = self.enc(x).flatten(2).transpose(1, 2) + self.pos
        h = self.query.expand(x.shape[0], -1, -1)
        outs = []
        for layer in self.layers:  # predictions after every layer (auxiliary losses, as in DETR/MapTR)
            h = layer(h, mem)
            z = self.norm(h)
            c = self.coord(z)
            if self.head == "l1":
                outs.append({"logits": self.cls(z), "pts": c.view(*c.shape[:2], P, 2).sigmoid()})
            else:
                lg = c.view(*c.shape[:2], P, 2, self.k)
                outs.append({"logits": self.cls(z), "bins": lg, "pts": decode(lg)})
        return outs


def centers(k):
    return (torch.arange(k) + 0.5) / k


def decode(lg, window=2):
    """Pick the peak bin, then average within +-window bins of it (sub-bin precision, no mode mixing)."""
    k = lg.shape[-1]
    p = lg.softmax(-1)
    idx = torch.arange(k)
    near = (idx - p.argmax(-1, keepdim=True)).abs() <= window
    w = p * near
    return (w * centers(k)).sum(-1) / w.sum(-1).clamp_min(1e-9)


def hl_gauss(y, k, sigma=0.75):
    edges = torch.linspace(0, 1, k + 1)
    cdf = torch.special.ndtr((edges - y[..., None]) / (sigma / k))
    q = cdf[..., 1:] - cdf[..., :-1]
    return q / q.sum(-1, keepdim=True).clamp_min(1e-12)

# ----------------------------------------------------------------------------- matching + loss

W_CLS, W_L1, W_CE, W_NLL_COST = 2.0, 5.0, 1.0, 1.0


def pts_cost(out_b, gt_orders, cost):
    """[Q, G] cost (min over each GT's equivalent orderings) and the argmin ordering."""
    Q = out_b["pts"].shape[0]
    C = torch.full((Q, len(gt_orders)), float("inf"))
    best = torch.zeros((Q, len(gt_orders)), dtype=torch.long)
    for g, go in enumerate(gt_orders):  # go: (O, P, 2)
        if cost == "l1":
            c = (out_b["pts"][:, None] - go[None]).abs().mean((-1, -2))  # (Q, O)
        else:
            logp = out_b["bins"].log_softmax(-1)  # (Q, P, 2, K)
            k = logp.shape[-1]
            idx = (go * k).long().clamp(0, k - 1)  # (O, P, 2)
            nll = -torch.gather(logp[:, None].expand(-1, go.shape[0], -1, -1, -1), -1,
                                idx[None, ..., None].expand(Q, -1, -1, -1, 1))[..., 0]
            c = nll.clamp(max=math.log(k)).mean((-1, -2))
        C[:, g], best[:, g] = c.min(1)
    return C, best


@torch.no_grad()
def match(out_b, labels, gt_orders, cost):
    prob = out_b["logits"].softmax(-1)
    pc, best = pts_cost(out_b, gt_orders, cost)
    w = W_L1 if cost == "l1" else W_NLL_COST
    C = -W_CLS * prob[:, labels] + w * pc
    qi, gi = linear_sum_assignment(C.numpy())
    return qi, gi, best[qi, gi]


def loss_fn(outs, batch_labels, batch_orders, head, cost):
    total = 0.0
    assign_last = None
    for li, out in enumerate(outs):
        B, Q = out["logits"].shape[:2]
        cls_t = torch.full((B, Q), len(CLASSES), dtype=torch.long)
        l_pts, n_pos = 0.0, 0
        assign = []
        for b in range(B):
            ob = {k: v[b] for k, v in out.items()}
            labels = torch.as_tensor(batch_labels[b])
            qi, gi, oi = match({k: v.detach() for k, v in ob.items()}, labels, batch_orders[b], cost)
            assign.append((qi, gi))
            cls_t[b, qi] = labels[gi]
            tgt = torch.stack([batch_orders[b][g][o] for g, o in zip(gi, oi)])  # (n, P, 2)
            if head == "l1":
                l_pts = l_pts + W_L1 * (ob["pts"][qi] - tgt).abs().mean((-1, -2)).sum()
            else:
                q = hl_gauss(tgt, ob["bins"].shape[-1])
                l_pts = l_pts + W_CE * -(q * ob["bins"][qi].log_softmax(-1)).sum(-1).mean((-1, -2)).sum()
            n_pos += len(qi)
        wcls = torch.ones(len(CLASSES) + 1)
        wcls[-1] = 0.1
        l_cls = F.cross_entropy(out["logits"].flatten(0, 1), cls_t.flatten(), weight=wcls)
        total = total + l_cls + l_pts / max(n_pos, 1)
        assign_last = assign
    return total, assign_last

# ----------------------------------------------------------------------------- evaluation


def chamfer_px(a, b):
    d = np.linalg.norm(a[:, None] - b[None], axis=-1) * S
    return 0.5 * (d.min(1).mean() + d.min(0).mean())


def average_precision(preds, gts, thr):
    """preds: list of (img, score, pts); gts: dict img -> list of pts. VOC all-point AP."""
    n_gt = sum(len(v) for v in gts.values())
    if n_gt == 0:
        return float("nan")
    preds = sorted(preds, key=lambda p: -p[1])
    used = {k: np.zeros(len(v), bool) for k, v in gts.items()}
    tp = np.zeros(len(preds))
    for i, (img, _, pts) in enumerate(preds):
        g = gts.get(img, [])
        if not g:
            continue
        d = np.array([min(chamfer_px(pts, a) for a in gp) for gp in g])  # gp: acceptable answers (A, P, 2)
        d[used[img]] = np.inf
        j = int(d.argmin())
        if d[j] < thr:
            tp[i], used[img][j] = 1, True
    ctp = np.cumsum(tp)
    rec = ctp / n_gt
    prec = ctp / np.arange(1, len(preds) + 1)
    mrec = np.concatenate([[0], rec, [1]])
    mpre = np.concatenate([[0], prec, [0]])
    for i in range(len(mpre) - 2, -1, -1):
        mpre[i] = max(mpre[i], mpre[i + 1])
    idx = np.where(mrec[1:] != mrec[:-1])[0]
    return float(((mrec[idx + 1] - mrec[idx]) * mpre[idx + 1]).sum())


@torch.no_grad()
def evaluate(model, data, thrs=(1.0, 2.0, 3.0)):
    imgs, labels, pts, alts = data
    model.eval()
    preds = {c: [] for c in range(len(CLASSES))}
    for s in range(0, len(imgs), 100):
        out = model(torch.as_tensor(imgs[s:s + 100], dtype=torch.float32)[:, None] / 255.0)[-1]
        prob = out["logits"].softmax(-1)[..., :-1]
        sc, cl = prob.max(-1)
        for b in range(len(sc)):
            for q in range(sc.shape[1]):
                preds[int(cl[b, q])].append((s + b, float(sc[b, q]), out["pts"][b, q].numpy()))
    res = {}
    for thr in thrs:
        aps = []
        for c in range(len(CLASSES)):
            gts = {i: [a for a, l in zip(alts[i], labels[i]) if l == c] for i in range(len(imgs))}
            aps.append(average_precision(preds[c], gts, thr))
        res[f"AP@{thr:g}px"] = float(np.mean(aps))
    res["mAP"] = float(np.mean([res[f"AP@{t:g}px"] for t in thrs]))
    model.train()
    return res

# ----------------------------------------------------------------------------- training


def run(job):
    head, seed, cfg = job
    torch.set_num_threads(1)
    torch.manual_seed(seed)
    rng = np.random.default_rng(seed)
    d = np.load(os.path.join(HERE, cfg["data"]), allow_pickle=True)
    tr = (d["tr_img"], d["tr_lab"], d["tr_pts"])
    va_alt = d["va_alt"] if "va_alt" in d.files else [p[:, None] for p in d["va_pts"]]  # older data files
    va = (d["va_img"], d["va_lab"], d["va_pts"], va_alt)
    tr_orders = [[torch.as_tensor(orders(p, l)) for p, l in zip(ps, ls)] for ps, ls in zip(tr[2], tr[1])]
    cost = "nll" if head == "bins_nll" else "l1"
    model = MiniMapTR("l1" if head == "l1" else "bins")
    opt = torch.optim.AdamW(model.parameters(), lr=cfg["lr"], weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, cfg["lr"], total_steps=cfg["steps"], pct_start=0.05)
    probe = np.arange(256)  # fixed training images for the matching flip rate
    prev = None
    log = {"head": head, "seed": seed, "evals": []}
    t0 = time.time()
    for step in range(1, cfg["steps"] + 1):
        bi = rng.integers(0, len(tr[0]), cfg["batch"])
        x = torch.as_tensor(tr[0][bi], dtype=torch.float32)[:, None] / 255.0
        loss, _ = loss_fn(model(x), [tr[1][i] for i in bi], [tr_orders[i] for i in bi], model.head, cost)
        opt.zero_grad()
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step()
        sched.step()
        if step % cfg["eval_every"] == 0 or step == cfg["steps"]:
            res = evaluate(model, va)
            with torch.no_grad():  # which query each probe element is matched to (final layer)
                x = torch.as_tensor(tr[0][probe], dtype=torch.float32)[:, None] / 255.0
                out = model(x)[-1]
                cur = {}
                for b, i in enumerate(probe):
                    qi, gi, _ = match({k: v[b] for k, v in out.items()}, torch.as_tensor(tr[1][i]), tr_orders[i], cost)
                    for q, g in zip(qi, gi):
                        cur[(int(i), int(g))] = int(q)
            res["flip_rate"] = None if prev is None else float(np.mean([cur[k] != prev[k] for k in cur]))
            prev = cur
            res.update(step=step, loss=float(loss.detach()), minutes=(time.time() - t0) / 60)
            log["evals"].append(res)
            print(f"{head:9s} seed {seed} step {step:5d}  loss {float(loss.detach()):.3f}  mAP {res['mAP']:.3f}  "
                  f"flip {res['flip_rate']}", flush=True)
    os.makedirs(os.path.join(HERE, cfg["out"]), exist_ok=True)
    with open(os.path.join(HERE, cfg["out"], f"{head}_s{seed}.json"), "w") as f:
        json.dump(log, f)
    return log


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--heads", nargs="*", default=["l1", "bins", "bins_nll"])
    ap.add_argument("--seeds", type=int, default=3)
    ap.add_argument("--steps", type=int, default=8000)
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--ambiguous", action="store_true", help="open curves become double lines labelled on either stroke")
    args = ap.parse_args()
    tag = "_amb" if args.ambiguous else ""
    cfg = dict(steps=args.steps, batch=32, lr=3e-4, eval_every=500, data=f"data{tag}.npz", out=f"runs{tag}")
    n_tr, n_va = 20000, 1000
    if args.quick:
        cfg.update(steps=60, eval_every=30)
        n_tr, n_va = 500, 100
        args.seeds = 1
    path = os.path.join(HERE, cfg["data"])
    if not os.path.exists(path) or args.quick:
        tr, va = make_dataset(n_tr, 0, args.ambiguous), make_dataset(n_va, 1, args.ambiguous)
        obj = lambda x: np.array(x + [None], dtype=object)[:-1]  # keep ragged per-image lists as object arrays
        np.savez_compressed(path, tr_img=tr[0], tr_lab=obj(tr[1]), tr_pts=obj(tr[2]),
                            va_img=va[0], va_lab=obj(va[1]), va_pts=obj(va[2]), va_alt=obj(va[3]))
    jobs = [(h, s, cfg) for s in range(args.seeds) for h in args.heads]
    with Pool(min(len(jobs), os.cpu_count())) as pool:
        pool.map(run, jobs)
    if args.quick:
        os.remove(path)


if __name__ == "__main__":
    main()
