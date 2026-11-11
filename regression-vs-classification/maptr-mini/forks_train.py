"""Where does this lane go? L1 / L2 regression vs bin heads on real AV2 lane forks (forks.npz).

Every head sees the same CNN features and predicts the next 20 m of route as 5 points. The training label is
one valid route picked at random each time (at a fork there are 2-4). Heads:
  l2, l1        regress the 10 coordinates (MSE / L1)
  bins          64 bins per coordinate (HL-Gauss CE), peak + window-mean decode; x and y independent
  cbins         Tesla-style coarse + fine per coordinate: 16 coarse cells (CE) + a regressed offset in each (L1)
  jcbins        joint 2D per point: one of 16x16 cells (CE) + an (x, y) offset in it (L1); points independent
  ar_l1         autoregressive: point k is regressed (L1) given points 1..k-1
  ar_cbins      autoregressive, joint 2D: point k = one of 16x16 cells (CE) + an (x, y) offset in it (L1), given
                points 1..k-1 ("language of lanes"-style)
Autoregressive heads are teacher-forced with the label's previous points in training and fed their own
decoded points at test time.

Metrics on the validation set, separately for single-route samples and forks:
  min-ADE   mean point distance to the NEAREST valid route (m)
  off-route fraction of predictions whose worst point is > 2 m from every valid route (not a real route)
  ADE-label mean point distance to one randomly drawn valid route (the usual metric with a single label)
  coverage  (bin heads) sample 16 decodes; fraction of a fork's routes hit within 2 m (mode coverage)
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

HERE = os.path.dirname(os.path.abspath(__file__))
NP, K, KC = 5, 64, 16
FWD, LAT = 24.0, 12.0


def norm(p):  # ego metres -> [0, 1]^2
    return torch.stack([p[..., 0] / FWD, (p[..., 1] + LAT) / (2 * LAT)], -1).clamp(0, 1)


def denorm(u):
    return torch.stack([u[..., 0] * FWD, u[..., 1] * 2 * LAT - LAT], -1)


def hl_gauss(y, k, sigma=0.75):
    edges = torch.linspace(0, 1, k + 1)
    cdf = torch.special.ndtr((edges - y[..., None]) / (sigma / k))
    q = cdf[..., 1:] - cdf[..., :-1]
    return q / q.sum(-1, keepdim=True).clamp_min(1e-12)


def window_decode(lg, window=2):
    p = lg.softmax(-1)
    idx = torch.arange(lg.shape[-1])
    w = p * ((idx - p.argmax(-1, keepdim=True)).abs() <= window)
    c = (idx.float() + 0.5) / lg.shape[-1]
    return (w * c).sum(-1) / w.sum(-1).clamp_min(1e-9)


class Net(nn.Module):
    def __init__(self, head, d=256):
        super().__init__()
        self.head = head
        g = lambda c: nn.GroupNorm(8, c)
        self.enc = nn.Sequential(
            nn.Conv2d(3, 32, 3, 2, 1), g(32), nn.ReLU(), nn.Conv2d(32, 64, 3, 2, 1), g(64), nn.ReLU(),
            nn.Conv2d(64, 64, 3, 2, 1), g(64), nn.ReLU(), nn.Conv2d(64, 64, 3, 2, 1), g(64), nn.ReLU(),
            nn.Flatten(), nn.Linear(64 * 16, d), nn.ReLU())
        if head.startswith("ar_"):
            self.prev = nn.Linear(2 * NP, d)  # previous points (zeros for the ones not yet decoded)
            self.step = nn.Embedding(NP, d)
            out = 2 if head == "ar_l1" else KC * KC * 3
            self.mlp = nn.Sequential(nn.Linear(d, d), nn.ReLU(), nn.Linear(d, d), nn.ReLU(), nn.Linear(d, out))
        else:
            out = {"l2": 2 * NP, "l1": 2 * NP, "bins": 2 * NP * K, "cbins": 2 * NP * 2 * KC, "jcbins": NP * KC * KC * 3}[head]
            self.mlp = nn.Sequential(nn.Linear(d, d), nn.ReLU(), nn.Linear(d, d), nn.ReLU(), nn.Linear(d, out))

    def ar_step(self, f, prev_u, k):
        """Outputs for point k given the previous points prev_u (B, NP, 2) in [0, 1] (only < k used)."""
        mask = (torch.arange(NP) < k).float()[None, :, None]
        h = f + self.prev((prev_u * mask).flatten(1)) + self.step.weight[k]
        return self.mlp(h)

    def forward(self, x, tgt_u=None, sample=False, gen=None):
        """Returns decoded points (B, NP, 2) in [0, 1] and the raw outputs needed by the loss."""
        f = self.enc(x)
        B = x.shape[0]
        if not self.head.startswith("ar_"):
            r = self.mlp(f)
            if self.head in ("l1", "l2"):
                return r.view(B, NP, 2).sigmoid(), r
            if self.head == "bins":
                lg = r.view(B, NP, 2, K)
                if sample:
                    c = torch.multinomial(lg.softmax(-1).view(-1, K), 1, generator=gen).view(B, NP, 2)
                    return (c.float() + 0.5) / K, lg
                return window_decode(lg), lg
            if self.head == "jcbins":
                lg, off = r[:, :NP * KC * KC].view(B, NP, KC * KC), r[:, NP * KC * KC:].view(B, NP, KC * KC, 2).sigmoid()
                if sample:
                    c = torch.multinomial(lg.softmax(-1).view(-1, KC * KC), 1, generator=gen).view(B, NP)
                else:
                    c = lg.argmax(-1)
                o = off.gather(2, c[:, :, None, None].expand(B, NP, 1, 2))[:, :, 0]
                return torch.stack([(c // KC).float() + o[..., 0], (c % KC).float() + o[..., 1]], -1) / KC, (lg, off)
            r = r.view(B, NP, 2, 2 * KC)
            lg, off = r[..., :KC], r[..., KC:].sigmoid()
            if sample:
                c = torch.multinomial(lg.softmax(-1).view(-1, KC), 1, generator=gen).view(B, NP, 2, 1)
            else:
                c = lg.argmax(-1, keepdim=True)
            return ((c + off.gather(-1, c)) / KC)[..., 0], (lg, off)
        # autoregressive
        outs, cur = [], torch.zeros(B, NP, 2)
        for k in range(NP):
            prev = tgt_u if tgt_u is not None else cur
            r = self.ar_step(f, prev, k)
            outs.append(r)
            if self.head == "ar_l1":
                p = r.sigmoid()
            else:
                lg, off = r[:, :KC * KC], r[:, KC * KC:].view(B, KC * KC, 2).sigmoid()
                if sample:
                    c = torch.multinomial(lg.softmax(-1), 1, generator=gen)[:, 0]
                else:
                    c = lg.argmax(-1)
                o = off[torch.arange(B), c]
                p = torch.stack([(c // KC).float() + o[:, 0], (c % KC).float() + o[:, 1]], -1) / KC
            cur = cur.clone()
            cur[:, k] = p.detach()
        return cur, outs


def loss_fn(model, x, tgt_u, w_ce):
    head = model.head
    if head.startswith("ar_"):
        _, outs = model(x, tgt_u=tgt_u)
        loss = 0.0
        for k, r in enumerate(outs):
            t = tgt_u[:, k]
            if head == "ar_l1":
                loss = loss + (r.sigmoid() - t).abs().sum(-1).mean()
            else:
                B = t.shape[0]
                ci = (t * KC).long().clamp(0, KC - 1)
                cell = ci[:, 0] * KC + ci[:, 1]
                lg, off = r[:, :KC * KC], r[:, KC * KC:].view(B, KC * KC, 2).sigmoid()
                o = off[torch.arange(B), cell]
                loss = loss + w_ce * F.cross_entropy(lg, cell) + ((ci.float() + o) / KC - t).abs().sum(-1).mean()
        return loss
    pts, r = model(x)
    if head == "l2":
        return ((pts - tgt_u) ** 2).sum((1, 2)).mean() * 10
    if head == "l1":
        return (pts - tgt_u).abs().sum((1, 2)).mean()
    if head == "bins":
        return -(hl_gauss(tgt_u, K) * r.log_softmax(-1)).sum((1, 2, 3)).mean() * w_ce
    lg, off = r
    if head == "jcbins":
        B = tgt_u.shape[0]
        ci = (tgt_u * KC).long().clamp(0, KC - 1)
        cell = ci[..., 0] * KC + ci[..., 1]
        o = off.gather(2, cell[:, :, None, None].expand(B, NP, 1, 2))[:, :, 0]
        ce = F.cross_entropy(lg.reshape(-1, KC * KC), cell.reshape(-1), reduction="sum") / B
        return w_ce * ce + ((ci.float() + o) / KC - tgt_u).abs().sum((1, 2)).mean()
    ci = (tgt_u * KC).long().clamp(0, KC - 1)
    o = off.gather(-1, ci[..., None])[..., 0]
    ce = -(hl_gauss(tgt_u, KC, sigma=0.3) * lg.log_softmax(-1)).sum((1, 2, 3)).mean()
    return w_ce * ce + ((ci.float() + o) / KC - tgt_u).abs().sum((1, 2)).mean()


def route_dist(pred_m, routes_m, n):
    """Per sample: mean and max point distance to each valid route -> (B, 4) each; invalid routes = inf."""
    d = np.linalg.norm(pred_m[:, None] - routes_m, axis=-1)  # (B, 4, NP)
    valid = np.arange(4)[None] < n[:, None]
    return np.where(valid, d.mean(-1), np.inf), np.where(valid, d.max(-1), np.inf)


@torch.no_grad()
def evaluate(model, img, tgt, n, seed=0):
    model.eval()
    preds, samples = [], []
    gen = torch.Generator().manual_seed(seed)
    for s in range(0, len(img), 500):
        x = torch.as_tensor(img[s:s + 500], dtype=torch.float32) / 255.0
        preds.append(denorm(model(x)[0]).numpy())
        if model.head not in ("l1", "l2", "ar_l1"):
            samples.append(np.stack([denorm(model(x, sample=True, gen=gen)[0]).numpy() for _ in range(16)], 1))
    model.train()
    pred = np.concatenate(preds)
    mean_d, max_d = route_dist(pred, tgt, n)
    rng = np.random.default_rng(seed)
    pick = (rng.random(len(n)) * n).astype(int)
    res = {}
    for name, sel in (("single", n == 1), ("fork", n >= 2)):
        res[f"{name}_minADE"] = float(mean_d[sel].min(1).mean())
        res[f"{name}_minADE_median"] = float(np.median(mean_d[sel].min(1)))
        res[f"{name}_offroute"] = float((max_d[sel].min(1) > 2.0).mean())
        res[f"{name}_ADE_label"] = float(mean_d[sel, pick[sel]].mean())
    if samples:
        smp = np.concatenate(samples)  # (B, 16, NP, 2)
        sel = np.where(n >= 2)[0]
        cov, valid_s = [], []
        for i in sel:
            d = np.linalg.norm(smp[i][:, None] - tgt[i][None, :n[i]], axis=-1).max(-1)  # (16, routes)
            cov.append((d.min(0) < 2.0).mean())
            valid_s.append((d.min(1) < 2.0).mean())
        res["fork_sample_coverage"] = float(np.mean(cov))
        res["fork_sample_on_route"] = float(np.mean(valid_s))
    return res


def run(job):
    head, seed, cfg = job
    torch.set_num_threads(1)
    torch.manual_seed(seed)
    rng = np.random.default_rng(seed)
    d = np.load(os.path.join(HERE, "forks.npz"))
    tr_img, tr_tgt, tr_n = d["train_img"], d["train_tgt"], d["train_n"]
    va_img, va_tgt, va_n = d["val_img"], d["val_tgt"], d["val_n"]
    model = Net(head)
    opt = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=0.01)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=1e-3, total_steps=cfg["steps"], pct_start=0.05)
    log = {"head": head, "seed": seed, "cfg": cfg, "evals": []}
    t0 = time.time()
    for step in range(1, cfg["steps"] + 1):
        bi = rng.integers(0, len(tr_img), cfg["batch"])
        pick = (rng.random(len(bi)) * tr_n[bi]).astype(int)  # one valid route, drawn fresh every time
        tgt_u = norm(torch.as_tensor(tr_tgt[bi, pick]))
        x = torch.as_tensor(tr_img[bi], dtype=torch.float32) / 255.0
        loss = loss_fn(model, x, tgt_u, cfg["w_ce"])
        opt.zero_grad()
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), 10.0)
        opt.step()
        sched.step()
        if step % cfg["eval_every"] == 0 or step == cfg["steps"]:
            res = evaluate(model, va_img, va_tgt, va_n)
            res.update(step=step, minutes=(time.time() - t0) / 60)
            log["evals"].append(res)
            print(f"{head:8s} s{seed} step {step:5d} single minADE {res['single_minADE']:.2f} off {res['single_offroute']:.3f} | "
                  f"fork minADE {res['fork_minADE']:.2f} off {res['fork_offroute']:.3f} ADE-label {res['fork_ADE_label']:.2f}"
                  + (f" cov {res['fork_sample_coverage']:.2f}" if "fork_sample_coverage" in res else "")
                  + f" ({res['minutes']:.0f} min)", flush=True)
    os.makedirs(os.path.join(HERE, cfg["out"]), exist_ok=True)
    json.dump(log, open(os.path.join(HERE, cfg["out"], f"{head}_s{seed}.json"), "w"))
    os.makedirs(os.path.join(HERE, "models"), exist_ok=True)
    torch.save(model.state_dict(), os.path.join(HERE, "models", f"{cfg['out']}_{head}_s{seed}.pt"))


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--heads", nargs="*", default=["l2", "l1", "bins", "cbins", "ar_l1", "ar_cbins"])
    a.add_argument("--seeds", type=int, default=3)
    a.add_argument("--steps", type=int, default=6000)
    a.add_argument("--batch", type=int, default=64)
    a.add_argument("--w-ce", type=float, default=0.1)
    a.add_argument("--procs", type=int, default=4)
    a.add_argument("--out", default="runs_forks")
    a.add_argument("--skip-done", action="store_true")
    args = a.parse_args()
    cfg = dict(steps=args.steps, batch=args.batch, w_ce=args.w_ce, eval_every=max(args.steps // 6, 1), out=args.out)
    jobs = [(h, s, cfg) for s in range(args.seeds) for h in args.heads
            if args.skip_done is False or not os.path.exists(os.path.join(HERE, cfg["out"], f"{h}_s{s}.json"))]
    with Pool(args.procs) as p:
        p.map(run, jobs)


if __name__ == "__main__":
    main()
