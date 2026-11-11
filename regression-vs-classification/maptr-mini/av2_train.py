"""MapTR-faithful mini model on Argoverse 2 map patches (av2_data.py): L1 regression vs bin head.

Same head mechanics as maptr_faithful.py (point queries, reference refinement, decoupled self-attn,
deformable cross-attn, focal loss/cost, L1 summed over coordinates x5, direction loss, MapTR schedule);
here with MapTR's AV2 setting: 3 classes, 60 x 30 m patches, targets with gt_shift_pts_pattern='v2'
(random <= 19 start vertices for polygons, redrawn every time a sample is used), the direction loss in
metres, and Chamfer AP at 0.5 / 1.0 / 1.5 m per class.

Input: 3-channel 100 x 200 raster (0.3 m/px). With --occlude, random car-sized occluders (4.5 x 2 m,
random heading; 0-8 per patch, redrawn every time for training, fixed for validation) blank the input
while the targets stay the full map, so the hidden parts must be inferred.

    python av2_train.py --gate                   # L1, 1 seed: precision floor
    python av2_train.py [--occlude] --seeds 2    # l1 vs bins
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
from scipy.optimize import linear_sum_assignment

import maptr_faithful as mf

HERE = os.path.dirname(os.path.abspath(__file__))
P, N_CLS, N_Q = 20, 3, 24
H, W = 100, 200  # raster rows (y, 30 m) x columns (x, 60 m)
XR, YR = 60.0, 30.0
W_FOCAL, W_PTS, W_DIR = 2.0, 5.0, 0.005
K_BINS = mf.K_BINS
K_REL, R_REL = 64, 0.125  # rbins: bins over the correction ref + delta, delta in [-R, R] (normalized; +-7.5 m in x, +-3.75 m in y)
CLASSES = ["divider", "ped_crossing", "boundary"]


def to_metres(p):
    m = np.empty_like(p) if isinstance(p, np.ndarray) else torch.empty_like(p)
    m[..., 0] = p[..., 0] * XR - XR / 2
    m[..., 1] = p[..., 1] * YR - YR / 2
    return m


class AV2MapTR(nn.Module):
    def __init__(self, head, d=64, layers=6):
        super().__init__()
        self.head, self.d = head, d
        g = lambda c: nn.GroupNorm(8, c)
        self.enc = nn.Sequential(nn.Conv2d(3, 32, 3, 1, 1), g(32), nn.ReLU(), nn.Conv2d(32, 64, 3, 2, 1), g(64), nn.ReLU(),
                                 nn.Conv2d(64, d, 3, 1, 1), g(d), nn.ReLU(), nn.Conv2d(d, d, 3, 1, 1), g(d), nn.ReLU(),
                                 nn.Conv2d(d, d, 1))
        self.pos_feat = nn.Parameter(torch.randn(1, d, H // 2, W // 2) * 0.02)
        self.inst = nn.Embedding(N_Q, 2 * d)
        self.pts = nn.Embedding(P, 2 * d)
        self.ref = nn.Linear(d, 2)
        self.layers = nn.ModuleList([mf.DecoderLayer(d) for _ in range(layers)])
        out = {"l1": 2, "bins": 2 * K_BINS, "rbins": 2 * K_REL}[head]
        mk_cls = lambda: nn.Sequential(nn.Linear(d, d), nn.LayerNorm(d), nn.ReLU(), nn.Linear(d, d), nn.LayerNorm(d),
                                       nn.ReLU(), nn.Linear(d, N_CLS))
        mk_reg = lambda: nn.Sequential(nn.Linear(d, d), nn.ReLU(), nn.Linear(d, d), nn.ReLU(), nn.Linear(d, out))
        self.cls = nn.ModuleList([mk_cls() for _ in range(layers)])
        self.reg = nn.ModuleList([mk_reg() for _ in range(layers)])
        for c in self.cls:
            nn.init.constant_(c[-1].bias, -math.log((1 - 0.01) / 0.01))
        if head != "l1":
            for r in self.reg:
                nn.init.zeros_(r[-1].weight)
                nn.init.zeros_(r[-1].bias)

    def forward(self, x):
        B = x.shape[0]
        feat = self.enc(x) + self.pos_feat
        emb = (self.pts.weight[None] + self.inst.weight[:, None]).flatten(0, 1)
        pos, q = emb.split(self.d, -1)
        pos, h = pos[None].expand(B, -1, -1), q[None].expand(B, -1, -1)
        ref = self.ref(pos).sigmoid()
        outs = []
        for l, layer in enumerate(self.layers):
            h = layer(h, pos, ref, feat, N_Q, None)
            o = {"logits": self.cls[l](h.view(B, N_Q, P, self.d).mean(2))}
            r = self.reg[l](h)
            if self.head == "l1":
                pts = (r + mf.inverse_sigmoid(ref)).sigmoid()
            elif self.head == "rbins":
                lg = r.view(B, N_Q * P, 2, K_REL) - 0.5 * ((mf.bin_centers(K_REL) - 0.5) / 0.25) ** 2
                u = mf.decode(lg)
                pts = (ref + (2 * u - 1) * R_REL).clamp(0, 1)
                o["bins"] = lg.view(B, N_Q, P, 2, K_REL)
                o["ref"] = ref.view(B, N_Q, P, 2)
            else:
                lg = r.view(B, N_Q * P, 2, K_BINS)
                lg = lg + -0.5 * ((mf.bin_centers()[None, None, None] - ref[..., None]) / mf.PRIOR_SIGMA) ** 2
                pts = mf.decode(lg)
                o["bins"] = lg.view(B, N_Q, P, 2, K_BINS)
            o["pts"] = pts.view(B, N_Q, P, 2)
            outs.append(o)
            ref = pts.detach()
        return outs


def pick_orders(orders, rng):
    """gt_shift_pts_pattern='v2': polygons keep at most 19 start vertices, chosen at random each time."""
    out = []
    for o in orders:
        if o.shape[0] > P - 1:
            o = o[rng.choice(o.shape[0], P - 1, replace=False)]
        out.append(torch.as_tensor(o))
    return out


@torch.no_grad()
def match(logits, pts, labels, orders):
    Q = pts.shape[0]
    pc = torch.empty(Q, len(orders))
    best = torch.empty(Q, len(orders), dtype=torch.long)
    flat = pts.reshape(Q, -1)
    for g, go in enumerate(orders):
        c = torch.cdist(flat, go.reshape(go.shape[0], -1), p=1)
        pc[:, g], best[:, g] = c.min(1)
    C = W_FOCAL * mf.focal_cost(logits, labels) + W_PTS * pc
    qi, gi = linear_sum_assignment(C.numpy())
    return qi, gi, best[qi, gi].numpy()


def loss_fn(outs, labels_b, orders_b, head, w_ce):
    total = 0.0
    for out in outs:
        B = out["logits"].shape[0]
        tgt_cls = torch.zeros_like(out["logits"])
        l_pts, l_dir, n_pos = 0.0, 0.0, 0
        for b in range(B):
            labels = torch.as_tensor(labels_b[b])
            lg, pts = out["logits"][b], out["pts"][b]
            qi, gi, oi = match(lg.detach(), pts.detach(), labels, orders_b[b])
            tgt_cls[b, qi, labels[gi]] = 1.0
            tgt = torch.stack([orders_b[b][g][o] for g, o in zip(gi, oi)])
            if head == "l1":
                l_pts = l_pts + (pts[qi] - tgt).abs().sum()
            elif head == "rbins":
                u = ((tgt - out["ref"][b][qi]) / (2 * R_REL) + 0.5).clamp(0, 1)
                l_pts = l_pts + -(mf.hl_gauss(u, k=K_REL) * out["bins"][b][qi].log_softmax(-1)).sum()
            else:
                l_pts = l_pts + -(mf.hl_gauss(tgt) * out["bins"][b][qi].log_softmax(-1)).sum()
            l_dir = l_dir + mf.dir_cos(to_metres(pts[qi]), to_metres(tgt))
            n_pos += len(qi)
        n_pos = max(n_pos, 1)
        w = W_PTS if head == "l1" else w_ce
        total = total + W_FOCAL * mf.sigmoid_focal(out["logits"], tgt_cls) / n_pos + w * l_pts / n_pos + W_DIR * l_dir / n_pos
    return total


def occlude(img, rng, n_max=8):
    """Blank 0..n_max car-sized boxes (4.5 x 2 m, random heading) in a (3, H, W) uint8 raster."""
    img = img.copy()
    yy, xx = np.mgrid[0:H, 0:W]
    xm, ym = (xx + 0.5) * XR / W - XR / 2, (yy + 0.5) * YR / H - YR / 2
    for _ in range(rng.integers(0, n_max + 1)):
        cx, cy, th = rng.uniform(-XR / 2, XR / 2), rng.uniform(-YR / 2, YR / 2), rng.uniform(0, math.pi)
        dx, dy = xm - cx, ym - cy
        u, v = dx * math.cos(th) + dy * math.sin(th), -dx * math.sin(th) + dy * math.cos(th)
        img[:, (np.abs(u) < 2.25) & (np.abs(v) < 1.0)] = 0
    return img


def chamfer_m(a, b):
    d = np.linalg.norm(a[:, None] - b[None], axis=-1)
    return 0.5 * (d.min(1).mean() + d.min(0).mean())


def ap(preds, gts, thr):
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
        d = np.array([chamfer_m(pts, gp) for gp in g])
        d[used[img]] = np.inf
        j = int(d.argmin())
        if d[j] < thr:
            tp[i], used[img][j] = 1, True
    ctp = np.cumsum(tp)
    rec, prec = ctp / n_gt, ctp / np.arange(1, len(preds) + 1)
    mrec, mpre = np.concatenate([[0], rec, [1]]), np.concatenate([[0], prec, [0]])
    for i in range(len(mpre) - 2, -1, -1):
        mpre[i] = max(mpre[i], mpre[i + 1])
    idx = np.where(mrec[1:] != mrec[:-1])[0]
    return float(((mrec[idx + 1] - mrec[idx]) * mpre[idx + 1]).sum())


@torch.no_grad()
def predict(model, imgs):
    model.eval()
    probs, pts = [], []
    for s in range(0, len(imgs), 50):
        out = model(torch.as_tensor(imgs[s:s + 50], dtype=torch.float32) / 255.0)[-1]
        probs.append(out["logits"].sigmoid())
        pts.append(out["pts"])
    model.train()
    return torch.cat(probs).numpy(), torch.cat(pts).numpy()


def evaluate(model, imgs, labels, raw):
    """MapTR-style Chamfer AP (metres) at 0.5 / 1.0 / 1.5 m, per class; GT = the 20-point targets."""
    prob, pts = predict(model, imgs)
    pts_m = to_metres(pts)
    res = {}
    for c, name in enumerate(CLASSES):
        preds = [(i, float(prob[i, q, c]), pts_m[i, q]) for i in range(len(imgs)) for q in range(N_Q)]
        gts = {i: [g for g, l in zip(raw[i], labels[i]) if l == c] for i in range(len(imgs))}
        for t in (0.5, 1.0, 1.5):
            res[f"AP_{name}@{t}m"] = ap(preds, gts, t)
        res[f"AP_{name}"] = float(np.mean([res[f"AP_{name}@{t}m"] for t in (0.5, 1.0, 1.5)]))
    res["mAP"] = float(np.mean([res[f"AP_{n}"] for n in CLASSES]))
    # precision floor: median Chamfer (m) of the best confident prediction per GT element
    ch = []
    for i in range(len(imgs)):
        for g, l in zip(raw[i], labels[i]):
            cand = [q for q in range(N_Q) if prob[i, q, l] > 0.3]
            if cand:
                ch.append(min(chamfer_m(pts_m[i, q], g) for q in cand))
    res["median_chamfer_m"] = float(np.median(ch)) if ch else None
    return res


def run(job):
    head, seed, cfg = job
    torch.set_num_threads(1)
    torch.manual_seed(seed)
    rng = np.random.default_rng(seed)
    d = np.load(os.path.join(HERE, "av2_patches.npz"), allow_pickle=True)
    tr_img, tr_lab, tr_ord = d["tr_img"], d["tr_lab"], d["tr_orders"]
    va_img, va_lab = d["va_img"], d["va_lab"]
    va_raw = [[mf_target_m(o) for o in os_] for os_ in d["va_orders"]]  # GT = sampled 20-point targets (metres)
    if cfg["occlude"]:
        vr = np.random.default_rng(12345)
        va_img = np.stack([occlude(x, vr) for x in va_img])
    if cfg.get("n_val"):
        va_img, va_lab, va_raw = va_img[:cfg["n_val"]], va_lab[:cfg["n_val"]], va_raw[:cfg["n_val"]]
    model = AV2MapTR(head, d=cfg["d"])
    opt = torch.optim.AdamW(model.parameters(), lr=cfg["lr"], weight_decay=0.01)
    warm, total = 500, cfg["steps"]
    sched = torch.optim.lr_scheduler.LambdaLR(
        opt, lambda s: 1 / 3 + (2 / 3) * s / warm if s < warm else 1e-3 + (1 - 1e-3) * 0.5 * (1 + math.cos(math.pi * (s - warm) / max(1, total - warm))))
    log = {"head": head, "seed": seed, "cfg": cfg, "evals": []}
    t0 = time.time()
    for step in range(1, total + 1):
        bi = rng.integers(0, len(tr_img), cfg["batch"])
        imgs = np.stack([occlude(tr_img[i], rng) for i in bi]) if cfg["occlude"] else tr_img[bi]
        x = torch.as_tensor(imgs, dtype=torch.float32) / 255.0
        loss = loss_fn(model(x), [tr_lab[i] for i in bi], [pick_orders(tr_ord[i], rng) for i in bi], head, cfg["w_ce"])
        opt.zero_grad()
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), 35.0)
        opt.step()
        sched.step()
        if step % cfg["eval_every"] == 0 or step == total:
            res = evaluate(model, va_img, va_lab, va_raw)
            res.update(step=step, loss=float(loss.detach()), minutes=(time.time() - t0) / 60)
            log["evals"].append(res)
            print(f"{head:5s} seed {seed} occl {cfg['occlude']} step {step:5d} loss {float(loss.detach()):8.2f} mAP {res['mAP']:.3f} "
                  f"(div {res['AP_divider']:.3f} ped {res['AP_ped_crossing']:.3f} bnd {res['AP_boundary']:.3f}) "
                  f"median chamfer {res['median_chamfer_m']} m ({res['minutes']:.0f} min)", flush=True)
    tag = "_occ" if cfg["occlude"] else ""
    os.makedirs(os.path.join(HERE, cfg["out"]), exist_ok=True)
    with open(os.path.join(HERE, cfg["out"], f"{head}_s{seed}.json"), "w") as f:
        json.dump(log, f)
    os.makedirs(os.path.join(HERE, "models"), exist_ok=True)
    torch.save(model.state_dict(), os.path.join(HERE, "models", f"{cfg['out']}_{head}_s{seed}.pt"))
    return log


def mf_target_m(orders):
    return to_metres(np.asarray(orders[0], dtype=np.float32))


def main():
    ap_ = argparse.ArgumentParser()
    ap_.add_argument("--heads", nargs="*", default=["l1", "bins"])
    ap_.add_argument("--seeds", type=int, default=2)
    ap_.add_argument("--steps", type=int, default=8000)
    ap_.add_argument("--batch", type=int, default=8)
    ap_.add_argument("--w-ce", type=float, default=0.03)
    ap_.add_argument("--d", type=int, default=64)
    ap_.add_argument("--occlude", action="store_true")
    ap_.add_argument("--gate", action="store_true")
    ap_.add_argument("--time-only", action="store_true")
    ap_.add_argument("--out", default=None)
    a = ap_.parse_args()
    cfg = dict(steps=a.steps, batch=a.batch, lr=6e-4, eval_every=1000, w_ce=a.w_ce, d=a.d, occlude=a.occlude,
               out=a.out or ("runs_av2_occ" if a.occlude else "runs_av2"))
    if a.time_only:
        for h in a.heads:
            c = dict(cfg, steps=10, eval_every=10 ** 9, n_val=20, out="runs_av2_tmp")
            t = time.time()
            run((h, 0, c))
            print(f"{h}: {(time.time() - t) / 10:.2f} s/step (batch {a.batch}, d {a.d})", flush=True)
        return
    jobs = [("l1", 0, dict(cfg, out=cfg["out"] + "_gate"))] if a.gate else \
        [(h, s, cfg) for s in range(a.seeds) for h in a.heads]
    with Pool(min(len(jobs), os.cpu_count())) as pool:
        pool.map(run, jobs)


if __name__ == "__main__":
    main()
