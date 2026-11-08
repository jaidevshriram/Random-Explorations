"""MapTR-faithful mini model: the same comparison as mini_maptr.py, with MapTRv2's head mechanics.

Copied from MapTRv2 (hustvl/MapTR, branch maptrv2, commit e03f097):
  * hierarchical queries: instance embedding + point embedding -> one query per point (`instance_pts`)
  * reference points: Linear(query_pos -> 2).sigmoid(); every decoder layer refines them
    (pred = sigmoid(reg_branch(h) + inverse_sigmoid(ref)), detached as the next reference)
  * decoder layer: inter-instance self-attn (masked between one-to-one / one-to-many groups),
    intra-instance self-attn, deformable cross-attn (8 heads x 4 points, 1 level), FFN, post-norm
  * separate cls / reg branches per layer; class score from the mean of the point features
  * focal loss (x2) for classes; point L1 summed over all coordinates (x5); direction cosine (x0.005)
  * matching cost: focal cost (x2) + L1 summed over all coordinates (x5), min over equivalent orderings
  * one-to-many matching: GT repeated k=6 times for an extra query group, lambda = 1
  * AdamW 6e-4, weight decay 0.01, 500-step linear warm-up, cosine decay, grad clip 35

Not copied: the camera -> BEV encoder (a small CNN gives a 32x32 feature map instead), 6 cameras,
aux segmentation and depth losses.

Coordinate heads compared (everything else identical):
  l1   : MapTR's regression of a correction to the reference point
  bins : 128 bins per coordinate; logits = network output + a log-prior bump at the reference
         (the bin analogue of predicting a correction); HL-Gauss cross-entropy summed over
         coordinates (weight W_CE); decode = peak, then mean within +-2 bins; matching uses the L1
         cost on the decoded points

    python maptr_faithful.py --gate               # L1 only, 1 seed: check the precision floor first
    python maptr_faithful.py --sweep              # bins cross-entropy weight, 1 seed, short
    python maptr_faithful.py [--ambiguous]        # l1 vs bins, 3 seeds
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

import mini_maptr as mm

HERE = os.path.dirname(os.path.abspath(__file__))
P = 20  # MapTR's fixed_ptsnum_per_line
mm.P = P
N_ONE2ONE, K_ONE2MANY = 8, 6
N_CLS = len(mm.CLASSES)
W_FOCAL, W_PTS, W_DIR, LAMBDA_ONE2MANY = 2.0, 5.0, 0.005, 1.0
K_BINS, PRIOR_SIGMA = 128, 0.1


def inverse_sigmoid(x, eps=1e-5):
    x = x.clamp(0, 1)
    return torch.log(x.clamp(min=eps) / (1 - x).clamp(min=eps))

# ----------------------------------------------------------------------------- model


class DeformAttn(nn.Module):
    """Single-level multi-scale deformable attention (Deformable DETR), in plain PyTorch."""

    def __init__(self, d, heads=8, points=4):
        super().__init__()
        self.h, self.p, self.d = heads, points, d
        self.off = nn.Linear(d, heads * points * 2)
        self.w = nn.Linear(d, heads * points)
        self.v = nn.Linear(d, d)
        self.o = nn.Linear(d, d)
        nn.init.zeros_(self.off.weight)
        th = torch.arange(heads, dtype=torch.float32) * (2 * math.pi / heads)
        grid = torch.stack([th.cos(), th.sin()], -1)
        grid = (grid / grid.abs().max(-1, keepdim=True)[0])[:, None, :].repeat(1, points, 1)
        grid = grid * torch.arange(1, points + 1, dtype=torch.float32)[None, :, None]
        self.off.bias.data = grid.flatten()
        nn.init.zeros_(self.w.weight)
        nn.init.zeros_(self.w.bias)

    def forward(self, q, ref, feat):
        B, N, d = q.shape
        H, W = feat.shape[-2:]
        dh = d // self.h
        v = self.v(feat.flatten(2).transpose(1, 2)).transpose(1, 2).reshape(B * self.h, dh, H, W)
        off = self.off(q).view(B, N, self.h, self.p, 2) / torch.tensor([W, H], dtype=q.dtype)
        loc = ref[:, :, None, None, :] + off
        grid = (loc * 2 - 1).permute(0, 2, 1, 3, 4).reshape(B * self.h, N, self.p, 2)
        samp = F.grid_sample(v, grid, align_corners=False)  # (B*h, dh, N, p)
        w = self.w(q).view(B, N, self.h, self.p).softmax(-1).permute(0, 2, 1, 3).reshape(B * self.h, 1, N, self.p)
        out = (samp * w).sum(-1).view(B, self.h, dh, N).permute(0, 3, 1, 2).reshape(B, N, d)
        return self.o(out)


class DecoderLayer(nn.Module):
    """MapTRv2 DecoupledDetrTransformerDecoderLayer: inter-instance self-attn, intra-instance
    self-attn, deformable cross-attn, FFN; post-norm."""

    def __init__(self, d, ff=256, drop=0.1):
        super().__init__()
        self.inter = nn.MultiheadAttention(d, 8, dropout=drop, batch_first=True)
        self.intra = nn.MultiheadAttention(d, 8, dropout=drop, batch_first=True)
        self.cross = DeformAttn(d)
        self.ffn = nn.Sequential(nn.Linear(d, ff), nn.ReLU(), nn.Dropout(drop), nn.Linear(ff, d))
        self.norms = nn.ModuleList([nn.LayerNorm(d) for _ in range(4)])
        self.drop = nn.Dropout(drop)

    def forward(self, x, pos, ref, feat, V, mask):
        B, _, d = x.shape
        a = (x + pos).view(B, V, P, d).transpose(1, 2).reshape(B * P, V, d)
        val = x.view(B, V, P, d).transpose(1, 2).reshape(B * P, V, d)
        out = self.inter(a, a, val, attn_mask=mask, need_weights=False)[0]
        x = self.norms[0](x + self.drop(out.view(B, P, V, d).transpose(1, 2).reshape(B, V * P, d)))
        a = (x + pos).reshape(B * V, P, d)
        out = self.intra(a, a, x.reshape(B * V, P, d), need_weights=False)[0]
        x = self.norms[1](x + self.drop(out.reshape(B, V * P, d)))
        x = self.norms[2](x + self.drop(self.cross(x + pos, ref, feat)))
        return self.norms[3](x + self.drop(self.ffn(x)))


def bin_centers(k=K_BINS):
    return (torch.arange(k, dtype=torch.float32) + 0.5) / k


def decode(lg, window=2):
    """Peak bin, then the probability-weighted mean within +-window bins."""
    p = lg.softmax(-1)
    idx = torch.arange(lg.shape[-1])
    w = p * ((idx - p.argmax(-1, keepdim=True)).abs() <= window)
    return (w * bin_centers(lg.shape[-1])).sum(-1) / w.sum(-1).clamp_min(1e-9)


class FaithfulMapTR(nn.Module):
    def __init__(self, head, d=128, layers=6):
        super().__init__()
        self.head, self.d = head, d
        self.V = N_ONE2ONE * (1 + K_ONE2MANY)
        g = lambda c: nn.GroupNorm(8, c)
        self.enc = nn.Sequential(nn.Conv2d(1, 32, 3, 1, 1), g(32), nn.ReLU(), nn.Conv2d(32, 64, 3, 2, 1), g(64), nn.ReLU(),
                                 nn.Conv2d(64, 128, 3, 1, 1), g(128), nn.ReLU(), nn.Conv2d(128, d, 3, 1, 1), g(d), nn.ReLU(),
                                 nn.Conv2d(d, d, 1))
        self.pos_feat = nn.Parameter(torch.randn(1, d, mm.S // 2, mm.S // 2) * 0.02)
        self.inst = nn.Embedding(self.V, 2 * d)
        self.pts = nn.Embedding(P, 2 * d)
        self.ref = nn.Linear(d, 2)
        self.layers = nn.ModuleList([DecoderLayer(d) for _ in range(layers)])
        out = 2 if head == "l1" else 2 * K_BINS
        mk_cls = lambda: nn.Sequential(nn.Linear(d, d), nn.LayerNorm(d), nn.ReLU(), nn.Linear(d, d), nn.LayerNorm(d),
                                       nn.ReLU(), nn.Linear(d, N_CLS))
        mk_reg = lambda: nn.Sequential(nn.Linear(d, d), nn.ReLU(), nn.Linear(d, d), nn.ReLU(), nn.Linear(d, out))
        self.cls = nn.ModuleList([mk_cls() for _ in range(layers)])
        self.reg = nn.ModuleList([mk_reg() for _ in range(layers)])
        bias = -math.log((1 - 0.01) / 0.01)  # focal-loss prior init, as in MapTR
        for c in self.cls:
            nn.init.constant_(c[-1].bias, bias)
        if head != "l1":
            for r in self.reg:
                nn.init.zeros_(r[-1].weight)
                nn.init.zeros_(r[-1].bias)

    def forward(self, x):
        B = x.shape[0]
        V = self.V if self.training else N_ONE2ONE
        feat = self.enc(x) + self.pos_feat
        emb = (self.pts.weight[None] + self.inst.weight[:V, None]).flatten(0, 1)  # (V*P, 2d)
        pos, q = emb.split(self.d, -1)
        pos, h = pos[None].expand(B, -1, -1), q[None].expand(B, -1, -1)
        ref = self.ref(pos).sigmoid()
        mask = torch.zeros(V, V, dtype=torch.bool)
        mask[N_ONE2ONE:, :N_ONE2ONE] = True
        mask[:N_ONE2ONE, N_ONE2ONE:] = True
        outs = []
        for l, layer in enumerate(self.layers):
            h = layer(h, pos, ref, feat, V, mask)
            cls = self.cls[l](h.view(B, V, P, self.d).mean(2))
            r = self.reg[l](h)
            o = {"logits": cls}
            if self.head == "l1":
                pts = (r + inverse_sigmoid(ref)).sigmoid()
            else:
                lg = r.view(B, V * P, 2, K_BINS)
                prior = -0.5 * ((bin_centers()[None, None, None] - ref[..., None]) / PRIOR_SIGMA) ** 2
                lg = lg + prior
                pts = decode(lg)
                o["bins"] = lg.view(B, V, P, 2, K_BINS)
            o["pts"] = pts.view(B, V, P, 2)
            outs.append(o)
            ref = pts.detach()
        return outs

# ----------------------------------------------------------------------------- matching and losses


def focal_cost(logits, labels, alpha=0.25, gamma=2.0, eps=1e-12):
    """mmdet FocalLossCost: [Q, G]."""
    p = logits.sigmoid()
    neg = -(1 - p + eps).log() * (1 - alpha) * p.pow(gamma)
    pos = -(p + eps).log() * alpha * (1 - p).pow(gamma)
    return pos[:, labels] - neg[:, labels]


@torch.no_grad()
def match(logits, pts, labels, gt_orders):
    """MapTRAssigner: focal cost x2 + OrderedPtsL1Cost (sum over all coordinates) x5, min over orders."""
    Q = pts.shape[0]
    pc = torch.empty(Q, len(gt_orders))
    best = torch.empty(Q, len(gt_orders), dtype=torch.long)
    flat = pts.reshape(Q, -1)
    for g, go in enumerate(gt_orders):
        c = torch.cdist(flat, go.reshape(go.shape[0], -1), p=1)  # (Q, O)
        pc[:, g], best[:, g] = c.min(1)
    C = W_FOCAL * focal_cost(logits, labels) + W_PTS * pc
    qi, gi = linear_sum_assignment(C.numpy())
    return qi, gi, best[qi, gi].numpy()


def sigmoid_focal(logits, target, alpha=0.25, gamma=2.0):
    p = logits.sigmoid()
    ce = F.binary_cross_entropy_with_logits(logits, target, reduction="none")
    pt = p * target + (1 - p) * (1 - target)
    return (ce * (1 - pt) ** gamma * (alpha * target + (1 - alpha) * (1 - target))).sum()


def dir_cos(pred, tgt):
    dp, dt = pred[:, 1:] - pred[:, :-1], tgt[:, 1:] - tgt[:, :-1]
    return (1 - F.cosine_similarity(dp, dt, dim=-1)).sum()


def hl_gauss(y, k=K_BINS, sigma=0.75):
    edges = torch.linspace(0, 1, k + 1)
    cdf = torch.special.ndtr((edges - y[..., None]) / (sigma / k))
    q = cdf[..., 1:] - cdf[..., :-1]
    return q / q.sum(-1, keepdim=True).clamp_min(1e-12)


def group_loss(out, sl, labels_b, orders_b, k, head, w_ce):
    """Loss of one decoder layer for one query group (sl), with GT repeated k times."""
    B = out["logits"].shape[0]
    tgt_cls = torch.zeros_like(out["logits"][:, sl])
    l_pts, l_dir, n_pos = 0.0, 0.0, 0
    assign = []
    for b in range(B):
        labels = torch.as_tensor(np.tile(labels_b[b], k))
        orders = orders_b[b] * k
        lg, pts = out["logits"][b, sl], out["pts"][b, sl]
        qi, gi, oi = match(lg.detach(), pts.detach(), labels, orders)
        assign.append((qi, gi))
        tgt_cls[b, qi, labels[gi]] = 1.0
        tgt = torch.stack([orders[g][o] for g, o in zip(gi, oi)])  # (n, P, 2)
        if head == "l1":
            l_pts = l_pts + (pts[qi] - tgt).abs().sum()
        else:
            lgb = out["bins"][b, sl][qi]
            l_pts = l_pts + -(hl_gauss(tgt) * lgb.log_softmax(-1)).sum()
        l_dir = l_dir + dir_cos(pts[qi] * mm.S, tgt * mm.S)
        n_pos += len(qi)
    n_pos = max(n_pos, 1)
    w = W_PTS if head == "l1" else w_ce
    loss = W_FOCAL * sigmoid_focal(out["logits"][:, sl], tgt_cls) / n_pos + w * l_pts / n_pos + W_DIR * l_dir / n_pos
    return loss, assign


def loss_fn(outs, labels_b, orders_b, head, w_ce):
    total, assign_last = 0.0, None
    for out in outs:
        l1, a = group_loss(out, slice(0, N_ONE2ONE), labels_b, orders_b, 1, head, w_ce)
        total = total + l1
        if K_ONE2MANY:
            l2, _ = group_loss(out, slice(N_ONE2ONE, None), labels_b, orders_b, K_ONE2MANY, head, w_ce)
            total = total + LAMBDA_ONE2MANY * l2
        assign_last = a
    return total, assign_last

# ----------------------------------------------------------------------------- evaluation


@torch.no_grad()
def predict(model, imgs):
    model.eval()
    probs, pts = [], []
    for s in range(0, len(imgs), 100):
        out = model(torch.as_tensor(imgs[s:s + 100], dtype=torch.float32)[:, None] / 255.0)[-1]
        probs.append(out["logits"].sigmoid())
        pts.append(out["pts"])
    model.train()
    return torch.cat(probs).numpy(), torch.cat(pts).numpy()


def evaluate(model, data, thrs=(1.0, 2.0, 3.0)):
    imgs, labels, _, alts = data
    prob, pts = predict(model, imgs)
    res = {}
    for thr in thrs:
        aps = []
        for c in range(N_CLS):
            preds = [(i, float(prob[i, q, c]), pts[i, q]) for i in range(len(imgs)) for q in range(N_ONE2ONE)]
            gts = {i: [a for a, l in zip(alts[i], labels[i]) if l == c] for i in range(len(imgs))}
            aps.append(mm.average_precision(preds, gts, thr))
        res[f"AP@{thr:g}px"] = float(np.mean(aps))
    res["mAP"] = float(np.mean([res[f"AP@{t:g}px"] for t in thrs]))
    # precision floor: Chamfer of the best confident prediction for each closed (never ambiguous) loop
    ch = []
    for i in range(len(imgs)):
        for a, l in zip(alts[i], labels[i]):
            if l == 1:
                cand = [q for q in range(N_ONE2ONE) if prob[i, q, 1] > 0.3]
                if cand:
                    ch.append(min(mm.chamfer_px(pts[i, q], a[0]) for q in cand))
    res["closed_median_chamfer_px"] = float(np.median(ch)) if ch else None
    return res

# ----------------------------------------------------------------------------- training


def run(job):
    global K_ONE2MANY
    head, seed, cfg = job
    K_ONE2MANY = cfg["k_one2many"]
    torch.set_num_threads(1)
    torch.manual_seed(seed)
    rng = np.random.default_rng(seed)
    d = np.load(os.path.join(HERE, cfg["data"]), allow_pickle=True)
    tr = (d["tr_img"], d["tr_lab"], d["tr_pts"])
    va = (d["va_img"], d["va_lab"], d["va_pts"], d["va_alt"])
    if cfg.get("n_val"):
        va = tuple(x[: cfg["n_val"]] for x in va)
    tr_orders = [[torch.as_tensor(mm.orders(p, l)) for p, l in zip(ps, ls)] for ps, ls in zip(tr[2], tr[1])]
    model = FaithfulMapTR(head, d=cfg["d"])
    opt = torch.optim.AdamW(model.parameters(), lr=cfg["lr"], weight_decay=0.01)
    warm, total = 500, cfg["steps"]

    def lr_at(s):
        if s < warm:
            return 1 / 3 + (1 - 1 / 3) * s / warm
        return 1e-3 + (1 - 1e-3) * 0.5 * (1 + math.cos(math.pi * (s - warm) / max(1, total - warm)))

    sched = torch.optim.lr_scheduler.LambdaLR(opt, lr_at)
    probe = np.arange(256)
    prev = None
    log = {"head": head, "seed": seed, "cfg": {k: v for k, v in cfg.items()}, "evals": []}
    t0 = time.time()
    for step in range(1, total + 1):
        bi = rng.integers(0, len(tr[0]), cfg["batch"])
        x = torch.as_tensor(tr[0][bi], dtype=torch.float32)[:, None] / 255.0
        loss, _ = loss_fn(model(x), [tr[1][i] for i in bi], [tr_orders[i] for i in bi], head, cfg["w_ce"])
        opt.zero_grad()
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), 35.0)
        opt.step()
        sched.step()
        if step % cfg["eval_every"] == 0 or step == total:
            res = evaluate(model, va)
            model.eval()
            with torch.no_grad():  # matching flip rate on fixed training images (final layer, one-to-one)
                out = model(torch.as_tensor(tr[0][probe], dtype=torch.float32)[:, None] / 255.0)[-1]
                cur = {}
                for b, i in enumerate(probe):
                    qi, gi, _ = match(out["logits"][b], out["pts"][b], torch.as_tensor(tr[1][i]), tr_orders[i])
                    for q_, g_ in zip(qi, gi):
                        cur[(int(i), int(g_))] = int(q_)
            model.train()
            res["flip_rate"] = None if prev is None else float(np.mean([cur[k] != prev[k] for k in cur]))
            prev = cur
            res.update(step=step, loss=float(loss.detach()), minutes=(time.time() - t0) / 60)
            log["evals"].append(res)
            print(f"{head:5s} seed {seed} w_ce {cfg['w_ce']} step {step:5d} loss {float(loss.detach()):8.3f} "
                  f"mAP {res['mAP']:.3f} closed-median {res['closed_median_chamfer_px']} px "
                  f"flip {res['flip_rate']} ({res['minutes']:.1f} min)", flush=True)
    os.makedirs(os.path.join(HERE, cfg["out"]), exist_ok=True)
    name = f"{head}_s{seed}" + (f"_w{cfg['w_ce']:g}" if cfg.get("tag_w") else "")
    with open(os.path.join(HERE, cfg["out"], name + ".json"), "w") as f:
        json.dump(log, f)
    if cfg.get("save_models"):
        os.makedirs(os.path.join(HERE, "models"), exist_ok=True)
        torch.save(model.state_dict(), os.path.join(HERE, "models", f"{cfg['out']}_{name}.pt"))
    return log


def ensure_data(path, ambiguous):
    if os.path.exists(path):
        return
    tr, va = mm.make_dataset(20000, 0, ambiguous), mm.make_dataset(1000, 1, ambiguous)
    obj = lambda x: np.array(x + [None], dtype=object)[:-1]
    np.savez_compressed(path, tr_img=tr[0], tr_lab=obj(tr[1]), tr_pts=obj(tr[2]),
                        va_img=va[0], va_lab=obj(va[1]), va_pts=obj(va[2]), va_alt=obj(va[3]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--heads", nargs="*", default=["l1", "bins"])
    ap.add_argument("--seeds", type=int, default=3)
    ap.add_argument("--steps", type=int, default=8000)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--w-ce", type=float, default=1.0)
    ap.add_argument("--ambiguous", action="store_true")
    ap.add_argument("--gate", action="store_true", help="L1 only, 1 seed: measure the precision floor")
    ap.add_argument("--sweep", nargs="*", type=float, default=None, help="bins: try these cross-entropy weights")
    ap.add_argument("--time-only", action="store_true")
    ap.add_argument("--save-models", action="store_true")
    ap.add_argument("--k-one2many", type=int, default=0,
                    help="MapTRv2 one-to-many matching (6 in MapTRv2); 0 = MapTR v1 (one-to-one only)")
    ap.add_argument("--d", type=int, default=128, help="model width (MapTR uses 256)")
    args = ap.parse_args()
    tag = "_amb" if args.ambiguous else ""
    data = f"data_f{tag}.npz"
    ensure_data(os.path.join(HERE, data), args.ambiguous)
    base = dict(steps=args.steps, batch=args.batch, lr=6e-4, eval_every=500, data=data, w_ce=args.w_ce,
                save_models=args.save_models, k_one2many=args.k_one2many, d=args.d)
    if args.time_only:
        base.update(steps=20, eval_every=10 ** 9, n_val=50, out="runs_f_tmp")
        for h in args.heads:
            t = time.time()
            run((h, 0, base))
            print(f"{h}: {(time.time() - t) / 20:.2f} s/step (batch {args.batch})")
        return
    if args.gate:
        jobs = [("l1", 0, dict(base, out=f"runs_f{tag}_gate"))]
    elif args.sweep:
        jobs = [("bins", 0, dict(base, w_ce=w, out=f"runs_f{tag}_sweep", tag_w=True)) for w in args.sweep]
    else:
        jobs = [(h, s, dict(base, out=f"runs_f{tag}")) for s in range(args.seeds) for h in args.heads]
    with Pool(min(len(jobs), os.cpu_count())) as pool:
        pool.map(run, jobs)


if __name__ == "__main__":
    main()
