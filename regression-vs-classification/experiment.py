"""Regression vs. classification heads for continuous targets: a toy experiment.

One command reproduces every plot and table:

    python experiment.py            # full run (3 seeds, ~a few minutes on CPU)
    python experiment.py --quick    # smoke test

The same small MLP backbone is trained with different heads/losses on 1D and 2D
synthetic data whose regions range from "easy" (unimodal, low noise) to
"ambiguous" (bimodal). Everything is written to ./plots and ./results.md.
"""
import argparse
import json
import math
import os
import pickle
import time
from multiprocessing import Pool

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from matplotlib.animation import FuncAnimation, PillowWriter

HERE = os.path.dirname(os.path.abspath(__file__))
PLOTS = os.path.join(HERE, "plots")

# ----------------------------------------------------------------------------
# Data
# ----------------------------------------------------------------------------
REGIONS = ["unimodal, clean", "unimodal + 10% outliers", "bimodal 70/30", "bimodal 50/50"]
P_SECOND = [0.0, 0.0, 0.3, 0.5]  # probability of the second mode, per region
P_OUTLIER = [0.0, 0.1, 0.0, 0.0]  # probability of a uniformly random label
NOISE_1D = 0.015
NOISE_2D = 0.01
R_OUTER, R_INNER = 0.38, 0.14  # 2D: the two contours of a letter "O"


def region_of(x):
    return torch.clamp((x * 4).long(), 0, 3)


def upper(x):
    return 0.72 + 0.07 * torch.sin(4 * math.pi * x)


def lower(x):
    return 0.28 + 0.07 * torch.sin(4 * math.pi * x + 1.0)


def ring(t, r):
    th = 2 * math.pi * t
    return torch.stack([0.5 + r * torch.cos(th), 0.5 + r * torch.sin(th)], -1)


class Task1D:
    name, in_dim, out_dim = "1d", 1, 1

    @staticmethod
    def modes(x):
        """Noise-free valid answers, shape (N, 2, 1); NaN where a mode does not exist."""
        a, b = upper(x), lower(x)
        b = torch.where(region_of(x) >= 2, b, torch.full_like(b, float("nan")))
        return torch.stack([a, b], 1).unsqueeze(-1)

    @staticmethod
    def sample(n, gen, x=None):
        if x is None:
            x = torch.rand(n, generator=gen)
        r = region_of(x)
        pick_b = torch.rand(n, generator=gen) < torch.tensor(P_SECOND)[r]
        y = torch.where(pick_b, lower(x), upper(x)) + NOISE_1D * torch.randn(n, generator=gen)
        out = torch.rand(n, generator=gen) < torch.tensor(P_OUTLIER)[r]
        y = torch.where(out, torch.rand(n, generator=gen), y)
        return x[:, None], y.clamp(0, 1)[:, None], r


class Task2D:
    """Input t in [0,1] (think: 'which point along the path'), target = 2D point that
    lies on the outer ring, or (in the ambiguous regions) possibly on the inner ring."""

    name, in_dim, out_dim = "2d", 1, 2

    @staticmethod
    def modes(t):
        a, b = ring(t, R_OUTER), ring(t, R_INNER)
        b = torch.where((region_of(t) >= 2)[:, None], b, torch.full_like(b, float("nan")))
        return torch.stack([a, b], 1)

    @staticmethod
    def sample(n, gen, t=None):
        if t is None:
            t = torch.rand(n, generator=gen)
        r = region_of(t)
        pick_b = torch.rand(n, generator=gen) < torch.tensor(P_SECOND)[r]
        y = torch.where(pick_b[:, None], ring(t, R_INNER), ring(t, R_OUTER))
        y = y + NOISE_2D * torch.randn(n, 2, generator=gen)
        out = torch.rand(n, generator=gen) < torch.tensor(P_OUTLIER)[r]
        y = torch.where(out[:, None], torch.rand(n, 2, generator=gen), y)
        return t[:, None], y.clamp(0, 1), r

    @staticmethod
    def dist_to_valid_curve(p, t):
        """Distance from predicted point to the nearest *valid* contour (analytic for circles)."""
        rad = (p - 0.5).norm(dim=-1)
        d_out = (rad - R_OUTER).abs()
        d_in = (rad - R_INNER).abs()
        return torch.where(region_of(t) >= 2, torch.minimum(d_out, d_in), d_out)


TASKS = {"1d": Task1D, "2d": Task2D}

# ----------------------------------------------------------------------------
# Model: shared backbone + swappable head
# ----------------------------------------------------------------------------


class Backbone(nn.Module):
    def __init__(self, in_dim=1, n_freq=12, width=128, depth=3):
        super().__init__()
        self.register_buffer("freqs", math.pi * torch.arange(1, n_freq + 1).float())
        layers, d = [], in_dim * (1 + 2 * n_freq)
        for _ in range(depth):
            layers += [nn.Linear(d, width), nn.ReLU()]
            d = width
        self.net = nn.Sequential(*layers)
        self.width = width

    def forward(self, x):
        z = x[..., None] * self.freqs  # Fourier features make the MLP fit quickly
        return self.net(torch.cat([x, torch.sin(z).flatten(1), torch.cos(z).flatten(1)], -1))


def hl_gauss(y, k, sigma_bins):
    """HL-Gauss soft label: probability mass of N(y, sigma) falling in each of k bins on
    [0,1]. sigma_bins=0 gives a hard one-hot label. y: (...,) -> (..., k)."""
    if sigma_bins == 0:
        return F.one_hot((y * k).long().clamp(0, k - 1), k).float()
    edges = torch.linspace(0, 1, k + 1)
    cdf = torch.special.ndtr((edges - y[..., None]) / (sigma_bins / k))
    q = cdf[..., 1:] - cdf[..., :-1]
    return q / q.sum(-1, keepdim=True).clamp_min(1e-12)


def soft_ce(logits, q):
    return -(q * F.log_softmax(logits, -1)).sum(-1)


class Head(nn.Module):
    """Every head maps backbone features to `out`, defines loss(out, y) per sample
    (summed over output coords), decode(out) -> {name: prediction} and optionally
    density(out) -> (N, D, 256) probability over a common 256-bin grid (for plots)."""

    kind = "regression"
    decodes = ("point",)

    def __init__(self, feat, d, n_out):
        super().__init__()
        self.d = d
        self.lin = nn.Linear(feat, d * n_out)

    def forward(self, h):
        return self.lin(h).view(h.shape[0], self.d, -1)

    def density(self, out):
        return None


class RegressionHead(Head):
    def __init__(self, feat, d, loss="l2", beta=0.05):
        super().__init__(feat, d, 1)
        nn.init.constant_(self.lin.bias, 0.5)
        self.loss_type, self.beta = loss, beta

    def loss(self, out, y):
        p = out[..., 0]
        if self.loss_type == "l2":
            l = F.mse_loss(p, y, reduction="none")
        elif self.loss_type == "l1":
            l = F.l1_loss(p, y, reduction="none")
        else:
            l = F.smooth_l1_loss(p, y, reduction="none", beta=self.beta)
        return l.sum(-1)

    def decode(self, out):
        return {"point": out[..., 0]}


class BinHead(Head):
    """Single-level: K bins, softmax, cross-entropy against HL-Gauss (or one-hot) labels."""

    kind, decodes = "bins", ("argmax", "mean")

    def __init__(self, feat, d, k=256, sigma_bins=0.75):
        super().__init__(feat, d, k)
        self.k, self.sigma = k, sigma_bins
        self.register_buffer("centers", (torch.arange(k) + 0.5) / k)

    def loss(self, out, y):
        return soft_ce(out, hl_gauss(y, self.k, self.sigma)).sum(-1)

    def decode(self, out):
        p = out.softmax(-1)
        return {"argmax": self.centers[p.argmax(-1)], "mean": (p * self.centers).sum(-1)}

    def density(self, out):
        return out.softmax(-1)


class TwoLevelHead(Head):
    """Coarse (16) x fine (16) bins = the same 256-bin grid, factored as p(c) p(f|c).

    shared_fine=False: one fine distribution per coarse bin (16 + 16*16 logits). The target
      is the 256-bin HL-Gauss label split by the chain rule, so the loss equals the
      single-level 256-bin cross-entropy exactly: a reparameterisation, not a new objective.
    shared_fine=True: one fine distribution shared by all coarse bins (16 + 16 logits);
      cheap, but it assumes "position within the coarse bin" is the same for every mode.
    """

    kind, decodes = "bins", ("argmax", "mean")

    def __init__(self, feat, d, kc=16, kf=16, sigma_bins=0.75, shared_fine=False):
        super().__init__(feat, d, kc + (kf if shared_fine else kc * kf))
        self.kc, self.kf, self.sigma, self.shared = kc, kf, sigma_bins, shared_fine
        self.register_buffer("centers", ((torch.arange(kc * kf) + 0.5) / (kc * kf)).view(kc, kf))

    def split(self, out):
        lc = out[..., : self.kc]
        lf = out[..., self.kc :]
        if self.shared:
            lf = lf[..., None, :].expand(*lf.shape[:-1], self.kc, self.kf)
        else:
            lf = lf.reshape(*lf.shape[:-1], self.kc, self.kf)
        return lc, lf

    def loss(self, out, y):
        lc, lf = self.split(out)
        q = hl_gauss(y, self.kc * self.kf, self.sigma).view(*y.shape, self.kc, self.kf)
        qc = q.sum(-1)
        if self.shared:  # fine target = where in its coarse bin the label falls
            return (soft_ce(lc, qc) + soft_ce(lf[..., 0, :], q.sum(-2))).sum(-1)
        qf = q / qc[..., None].clamp_min(1e-12)
        fine = (qc * soft_ce(lf, qf)).sum(-1)  # E_{c~q}[ CE(q(f|c), p(f|c)) ]
        return (soft_ce(lc, qc) + fine).sum(-1)

    def joint(self, out):
        lc, lf = self.split(out)
        return lc.softmax(-1)[..., None] * lf.softmax(-1)

    def decode(self, out):
        lc, lf = self.split(out)
        c = lc.argmax(-1)  # greedy coarse-to-fine decoding
        f = torch.gather(lf, -2, c[..., None, None].expand(*c.shape, 1, self.kf))[..., 0, :].argmax(-1)
        am = (c * self.kf + f + 0.5) / (self.kc * self.kf)
        return {"argmax": am, "mean": (self.joint(out) * self.centers).sum((-1, -2))}

    def density(self, out):
        return self.joint(out).flatten(-2)


class CoarseOffsetHead(Head):
    """16 coarse bins (cross-entropy) + one regressed offset per coarse bin (L1, trained
    only for the ground-truth bin), like class-specific box regression in Faster R-CNN."""

    kind, decodes = "bins", ("argmax", "mean")

    def __init__(self, feat, d, kc=16, sigma_bins=0.75 / 16):
        super().__init__(feat, d, 2 * kc)
        self.kc, self.sigma = kc, sigma_bins  # coarse soft label as narrow as a 256-bin one

    def loss(self, out, y):
        lc, off = out[..., : self.kc], out[..., self.kc :]
        c = (y * self.kc).long().clamp(0, self.kc - 1)
        u = y * self.kc - c  # position inside the GT coarse bin, in [0, 1)
        o = torch.gather(off, -1, c[..., None])[..., 0]
        return (soft_ce(lc, hl_gauss(y, self.kc, self.sigma)) + F.l1_loss(o, u, reduction="none")).sum(-1)

    def decode(self, out):
        lc, off = out[..., : self.kc], out[..., self.kc :]
        p = lc.softmax(-1)
        vals = (torch.arange(self.kc) + off) / self.kc
        c = p.argmax(-1, keepdim=True)
        return {"argmax": torch.gather(vals, -1, c)[..., 0], "mean": (p * vals).sum(-1)}

    def density(self, out):  # coarse probabilities spread uniformly over their fine bins
        return out[..., : self.kc].softmax(-1).repeat_interleave(256 // self.kc, -1) / (256 // self.kc)


class Joint2DHead(Head):
    """2D only: a single softmax over a 64x64 grid of (x, y) cells, so the head can say
    'outer ring OR inner ring' about the *point*, not about each coordinate separately."""

    kind, decodes = "bins", ("argmax", "mean")

    def __init__(self, feat, d, k=64, sigma_bins=0.75):
        assert d == 2
        super().__init__(feat, 1, k * k)
        self.k, self.sigma = k, sigma_bins
        c = (torch.arange(k) + 0.5) / k
        self.register_buffer("cells", torch.stack(torch.meshgrid(c, c, indexing="ij"), -1).view(-1, 2))

    def loss(self, out, y):
        q = hl_gauss(y[:, 0], self.k, self.sigma)[:, :, None] * hl_gauss(y[:, 1], self.k, self.sigma)[:, None, :]
        return soft_ce(out[:, 0], q.flatten(1))

    def decode(self, out):
        p = out[:, 0].softmax(-1)
        return {"argmax": self.cells[p.argmax(-1)], "mean": p @ self.cells}

    def grid(self, out):
        return out[:, 0].softmax(-1).view(-1, self.k, self.k)


HEADS = {
    "L2": lambda f, d: RegressionHead(f, d, "l2"),
    "L1": lambda f, d: RegressionHead(f, d, "l1"),
    "Huber": lambda f, d: RegressionHead(f, d, "huber"),
    "Bins256 soft": lambda f, d: BinHead(f, d, 256, 0.75),
    "Bins256 hard": lambda f, d: BinHead(f, d, 256, 0.0),
    "2-level 16x16": lambda f, d: TwoLevelHead(f, d, shared_fine=False),
    "2-level shared fine": lambda f, d: TwoLevelHead(f, d, shared_fine=True),
    "Coarse+offset": lambda f, d: CoarseOffsetHead(f, d),
    "Joint 2D 64x64": lambda f, d: Joint2DHead(f, d),
}
HEADS_1D = [h for h in HEADS if h != "Joint 2D 64x64"]
HEADS_2D = list(HEADS)
COLORS = {
    "L2": "#d62728", "L1": "#ff7f0e", "Huber": "#bcbd22", "Bins256 soft": "#1f77b4",
    "Bins256 hard": "#17becf", "2-level 16x16": "#2ca02c", "2-level shared fine": "#9467bd",
    "Coarse+offset": "#8c564b", "Joint 2D 64x64": "#e377c2",
}


class Model(nn.Module):
    def __init__(self, task, head):
        super().__init__()
        self.backbone = Backbone(task.in_dim)
        self.head = HEADS[head](self.backbone.width, task.out_dim)

    def forward(self, x):
        return self.head(self.backbone(x))


# ----------------------------------------------------------------------------
# Metrics (always in target units)
# ----------------------------------------------------------------------------


def metrics(task, pred, x, y, r):
    """pred, y: (N, D). Returns overall and per-region error statistics."""
    err = (pred - y).norm(dim=-1)  # error vs. the (noisy, possibly other-mode) sampled label
    modes = task.modes(x[:, 0])  # (N, 2, D)
    dmode = (pred[:, None] - modes).norm(dim=-1)
    dvalid = torch.nan_to_num(dmode, nan=float("inf")).min(1).values  # to nearest valid answer
    out = {}

    def stats(mask):
        e, v = err[mask], dvalid[mask]
        s = {"mean": e.mean().item(), "median": e.median().item(), "p90": e.quantile(0.9).item(),
             "valid_mean": v.mean().item(), "valid_median": v.median().item(), "valid_p90": v.quantile(0.9).item()}
        if task is Task2D:
            s["curve_mean"] = Task2D.dist_to_valid_curve(pred[mask], x[mask, 0]).mean().item()
        return s

    out["all"] = stats(torch.ones_like(r, dtype=torch.bool))
    for i in range(4):
        out[f"r{i}"] = stats(r == i)
    return out


# ----------------------------------------------------------------------------
# Training
# ----------------------------------------------------------------------------


def train_one(job):
    task_name, head_name, seed, cfg = job
    torch.set_num_threads(1)
    task = TASKS[task_name]
    torch.manual_seed(seed)
    gen = torch.Generator().manual_seed(seed)
    model = Model(task, head_name)
    opt = torch.optim.Adam(model.parameters(), lr=cfg["lr"])
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, cfg["steps"], eta_min=cfg["lr"] * 0.05)
    ev_x, ev_y, ev_r = task.sample(cfg["n_eval"], torch.Generator().manual_seed(1234))
    grid_x = torch.linspace(0, 1, cfg["n_grid"])[:, None]
    log = {"step": [], "loss": [], "eval_step": [], "eval": [], "snaps": []}
    t0 = time.time()

    def evaluate():
        with torch.no_grad():
            out = model(ev_x)
            return {k: metrics(task, v.view(len(ev_x), -1), ev_x, ev_y, ev_r) for k, v in model.head.decode(out).items()}

    def grid_preds(with_density=True):
        with torch.no_grad():
            out = model(grid_x)
            g = {"decode": {k: v.view(len(grid_x), -1).tolist() for k, v in model.head.decode(out).items()}}
            if with_density and model.head.density(out) is not None:
                g["density"] = model.head.density(out).numpy().astype(np.float32)
            return g

    run_loss = 0.0
    for step in range(1, cfg["steps"] + 1):
        x, y, _ = task.sample(cfg["batch"], gen)
        loss = model.head.loss(model(x), y).mean()
        opt.zero_grad()
        loss.backward()
        opt.step()
        sched.step()
        run_loss += loss.item()
        if step % cfg["log_every"] == 0:
            log["step"].append(step)
            log["loss"].append(run_loss / cfg["log_every"])
            run_loss = 0.0
        if step % cfg["eval_every"] == 0 or step == 1:
            log["eval_step"].append(step)
            log["eval"].append(evaluate())
        if seed == 0 and (step % cfg["snap_every"] == 0 or step == 1):
            log["snaps"].append((step, grid_preds(with_density=task_name == "1d")))

    log["final"] = evaluate()
    log["grid"] = grid_preds()
    log["time"] = time.time() - t0
    with torch.no_grad():
        # per-sample gradient of the loss w.r.t. the head output, vs. error (1D only)
        if task_name == "1d":
            x, y, r = task.sample(3000, torch.Generator().manual_seed(99))
            out = model(x).detach().requires_grad_(True)
            with torch.enable_grad():
                model.head.loss(out, y).sum().backward()
            g = out.grad[:, 0]
            pred = list(model.head.decode(out.detach()).values())[-1].view(-1, 1)
            log["grad"] = {"err": (pred - y).abs()[:, 0].tolist(), "region": r.tolist(),
                           "push": (g.abs().sum(-1) * (0.5 if g.shape[-1] > 1 else 1.0)).tolist()}
        # joint density on a grid (2D) for the "ghost points" figure
        if task_name == "2d":
            ts = torch.tensor([[0.125], [0.625], [0.875]])
            o = model(ts)
            if isinstance(model.head, Joint2DHead):
                log["grid2d"] = model.head.grid(o).numpy()
            elif model.head.density(o) is not None:
                dens = model.head.density(o)  # (3, 2, 256): independent per-coordinate marginals
                log["grid2d"] = (dens[:, 0, :, None] * dens[:, 1, None, :]).numpy()
    return task_name, head_name, seed, log


# ----------------------------------------------------------------------------
# Plots
# ----------------------------------------------------------------------------


def region_lines(ax, labels=True, y=1.02):
    for b in (0.25, 0.5, 0.75):
        ax.axvline(b, color="k", lw=0.6, ls=":", alpha=0.6)
    if labels:
        for i, name in enumerate(REGIONS):
            ax.text(0.125 + 0.25 * i, y, name, ha="center", va="bottom", fontsize=7, transform=ax.get_xaxis_transform())


def fig_data_1d():
    x, y, _ = Task1D.sample(4000, torch.Generator().manual_seed(0))
    fig, ax = plt.subplots(figsize=(10, 3.6))
    ax.scatter(x[:, 0], y[:, 0], s=2, c="0.4", alpha=0.5)
    xs = torch.linspace(0, 1, 400)
    m = Task1D.modes(xs)
    ax.plot(xs, m[:, 0, 0], "g-", lw=1, label="mode A (valid answer)")
    ax.plot(xs, m[:, 1, 0], "g--", lw=1, label="mode B (valid answer)")
    region_lines(ax)
    ax.set(xlabel="input x", ylabel="target y", xlim=(0, 1), ylim=(0, 1))
    ax.legend(loc="lower left", fontsize=8)
    ax.set_title("1D data: four regions, from easy to ambiguous", pad=18)
    fig.tight_layout()
    fig.savefig(os.path.join(PLOTS, "01_data_1d.png"), dpi=130)
    plt.close(fig)


def fig_loss_landscape():
    """Expected loss as a function of a *constant* prediction, for each region's target
    distribution. The minimum of each curve is what that loss will predict."""
    g = torch.Generator().manual_seed(0)
    xr = [0.125, 0.375, 0.625, 0.875]
    yhat = torch.linspace(0, 1, 501)
    fig, axes = plt.subplots(2, 4, figsize=(15, 6.2), gridspec_kw={"height_ratios": [1, 1.3]}, sharex=True)
    for i, x0 in enumerate(xr):
        # exact mode/outlier proportions, so the 50/50 case is truly balanced
        n = 20000
        xx = torch.full((n,), x0)
        nb, no = int(P_SECOND[i] * n), int(P_OUTLIER[i] * n)
        y = torch.cat([lower(xx[:nb]), upper(xx[nb:])]) + NOISE_1D * torch.randn(n, generator=g)
        y[:no] = torch.rand(no, generator=g)
        y = y.clamp(0, 1)
        ax = axes[0, i]
        ax.hist(y.numpy(), bins=128, range=(0, 1), color="0.55", density=True)
        ax.set_title(f"{REGIONS[i]}  (x={x0})", fontsize=9)
        ax.set_yticks([])
        if i == 0:
            ax.set_ylabel("target distribution\n(what CE learns)")
        ax = axes[1, i]
        r = yhat[:, None] - y[None]
        curves = {"L2": (r ** 2).mean(1), "L1": r.abs().mean(1),
                  "Huber": F.smooth_l1_loss(r, torch.zeros_like(r), beta=0.05, reduction="none").mean(1)}
        for name, c in curves.items():
            c = (c - c.min()) / (c.max() - c.min())
            ax.plot(yhat, c, color=COLORS[name], label=name)
            j = c.argmin()
            # where L1 is (almost) flat, every point in that interval is (almost) optimal
            flat = yhat[c <= c[j] + 0.01]
            if name == "L1" and flat[-1] - flat[0] > 0.05:
                for a in (ax, axes[0, i]):
                    a.axvspan(flat[0], flat[-1], color=COLORS[name], alpha=0.2)
                continue
            ax.plot(yhat[j], c[j], "o", color=COLORS[name], ms=7, mec="k")
            axes[0, i].axvline(yhat[j], color=COLORS[name], lw=1.5)
        ax.set_xlabel("constant prediction ŷ")
        if i == 0:
            ax.set_ylabel("expected loss (rescaled)")
            ax.legend(fontsize=8)
    axes[1, 3].text(0.5, 0.92, "L1 is flat (shaded): anything\nbetween the modes is optimal",
                    ha="center", va="top", fontsize=8, transform=axes[1, 3].transAxes, color=COLORS["L1"])
    fig.suptitle("What each regression loss is minimised by: L2 → mean, L1 → median, Huber → robust mean.  "
                 "Vertical lines on the histograms = where each loss will put its prediction.", fontsize=10)
    fig.tight_layout()
    fig.savefig(os.path.join(PLOTS, "02_loss_landscape.png"), dpi=130)
    plt.close(fig)


def fig_predictions_1d(logs, cfg):
    x, y, _ = Task1D.sample(3000, torch.Generator().manual_seed(0))
    gx = np.linspace(0, 1, cfg["n_grid"])
    fig, axes = plt.subplots(2, 4, figsize=(18, 7.5), sharex=True, sharey=True)
    for ax, head in zip(axes.flat, HEADS_1D):
        g = logs["1d"][head][0]["grid"]
        if "density" in g:
            d = g["density"][:, 0, :].T
            ax.imshow(np.sqrt(d / d.max(0, keepdims=True)), origin="lower", extent=(0, 1, 0, 1),
                      aspect="auto", cmap="Blues", vmin=0, vmax=1.3)
        ax.scatter(x[:, 0], y[:, 0], s=1.5, c="0.35", alpha=0.35)
        dec = g["decode"]
        if "point" in dec:
            ax.plot(gx, np.array(dec["point"])[:, 0], color=COLORS[head], lw=2.5, label="prediction")
        else:
            ax.plot(gx, np.array(dec["argmax"])[:, 0], color="#d62728", lw=1.8, label="argmax (mode)")
            ax.plot(gx, np.array(dec["mean"])[:, 0], color="k", lw=1.3, ls="--", label="expected value (mean)")
        region_lines(ax, labels=ax in axes[0])
        ax.set_title(head, pad=16 if ax in axes[0] else 4, color=COLORS[head], fontweight="bold")
        ax.legend(loc="lower left", fontsize=7)
        ax.set(xlim=(0, 1), ylim=(0, 1))
    for ax in axes[1]:
        ax.set_xlabel("input x")
    for ax in axes[:, 0]:
        ax.set_ylabel("target y")
    fig.suptitle("Predictions (lines) over training samples (dots). Blue background = predicted probability "
                 "p(y | x) of the bin heads (per-column normalised, sqrt scale). Seed 0.", fontsize=11)
    fig.tight_layout()
    fig.savefig(os.path.join(PLOTS, "03_predictions_1d.png"), dpi=120)
    plt.close(fig)


def fig_distributions(logs, cfg):
    heads = [h for h in HEADS_1D if HEADS[h](8, 1).kind == "bins"]
    xs = [0.125, 0.375, 0.625, 0.875]
    gx = np.linspace(0, 1, cfg["n_grid"])
    centers = (np.arange(256) + 0.5) / 256
    fig, axes = plt.subplots(len(heads), 4, figsize=(16, 2.1 * len(heads)), sharex=True)
    g = torch.Generator().manual_seed(0)
    true = [Task1D.sample(20000, g, x=torch.full((20000,), x0))[1][:, 0].numpy() for x0 in xs]
    for i, head in enumerate(heads):
        grid = logs["1d"][head][0]["grid"]
        for j, x0 in enumerate(xs):
            ax = axes[i, j]
            k = int(np.argmin(np.abs(gx - x0)))
            ax.hist(true[j], bins=256, range=(0, 1), density=True, color="0.8", label="true p(y|x)")
            ax.plot(centers, grid["density"][k, 0] * 256, color=COLORS[head], lw=1.4, label="predicted")
            for reg, ls in (("L2", "-"), ("L1", "--")):
                ax.axvline(logs["1d"][reg][0]["grid"]["decode"]["point"][k][0], color=COLORS[reg], ls=ls, lw=1.3, label=f"{reg} prediction")
            ax.axvline(grid["decode"]["argmax"][k][0], color="k", lw=1, ls=":", label="argmax")
            ax.set_yticks([])
            if i == 0:
                ax.set_title(f"x = {x0}: {REGIONS[j]}", fontsize=9)
            if j == 0:
                ax.set_ylabel(head, fontsize=9, color=COLORS[head], fontweight="bold")
    axes[0, 0].legend(fontsize=6.5, loc="upper left")
    for ax in axes[-1]:
        ax.set_xlabel("y")
    fig.suptitle("Predicted distributions (softmax) at four inputs vs. the true label distribution (grey). "
                 "Bin heads keep both peaks; L2 (red) sits between them; L1 (orange) jumps to the majority.", fontsize=10)
    fig.tight_layout()
    fig.savefig(os.path.join(PLOTS, "04_distributions_1d.png"), dpi=120)
    plt.close(fig)


def primary_decode(head):
    return "point" if head in ("L2", "L1", "Huber") else "argmax"


def fig_training_curves(logs, task, heads, fname):
    fig, axes = plt.subplots(2, 5, figsize=(20, 7.5))
    steps = logs[task][heads[0]][0]["eval_step"]
    keys = ["all", "r0", "r1", "r2", "r3"]
    titles = ["all regions"] + REGIONS
    for col, (key, title) in enumerate(zip(keys, titles)):
        ax = axes[0, col]
        for head in heads:
            dec = primary_decode(head)
            v = np.array([[e[dec][key]["valid_mean"] for e in run["eval"]] for run in logs[task][head]])
            ax.plot(steps, v.mean(0), color=COLORS[head], label=head, lw=1.5)
            ax.fill_between(steps, v.min(0), v.max(0), color=COLORS[head], alpha=0.2)
        ax.set_yscale("log")
        ax.set_title(title, fontsize=10)
        ax.set_xlabel("step")
        if col == 0:
            ax.set_ylabel("mean distance to nearest valid answer\n(target units, log)")
            ax.legend(fontsize=7)
    loss_axes = axes[1]
    groups = [["L2", "L1", "Huber"], ["Bins256 soft", "Bins256 hard"], ["2-level 16x16", "2-level shared fine"],
              ["Coarse+offset"] + (["Joint 2D 64x64"] if "Joint 2D 64x64" in heads else [])]
    for ax, grp in zip(loss_axes, groups):
        for head in grp:
            for s, run in enumerate(logs[task][head]):
                ax.plot(run["step"], run["loss"], color=COLORS[head], lw=0.9, alpha=0.8, label=head if s == 0 else None)
        ax.set_yscale("log")
        ax.set_xlabel("step")
        ax.legend(fontsize=7)
        ax.set_title("training loss (each seed one line)", fontsize=9)
    ax = loss_axes[4]
    # seed spread of the final error: a stability summary
    names = heads
    vals = [[run["final"][primary_decode(h)]["all"]["valid_mean"] for run in logs[task][h]] for h in names]
    for i, (h, v) in enumerate(zip(names, vals)):
        ax.scatter([i] * len(v), v, color=COLORS[h], s=25)
    ax.set_xticks(range(len(names)))
    ax.set_xticklabels(names, rotation=60, ha="right", fontsize=7)
    ax.set_yscale("log")
    ax.set_title("final error, one dot per seed", fontsize=9)
    fig.suptitle(f"{task.upper()} training curves: error in target units (top, mean ± min/max over seeds) "
                 "and raw training loss (bottom; not comparable across heads)", fontsize=11)
    fig.tight_layout()
    fig.savefig(os.path.join(PLOTS, fname), dpi=110)
    plt.close(fig)


def fig_gradients(logs):
    fig, axes = plt.subplots(1, 3, figsize=(17, 4.8))
    ax = axes[0]
    e = np.geomspace(1e-3, 0.5, 400)
    beta = 0.05
    ax.plot(e, e / beta, color=COLORS["L2"], lw=2,
            label="L2:  ∝ |e|  (grows without bound; scaled to match Huber near 0)")
    ax.plot(e, np.ones_like(e), color=COLORS["L1"], lw=2, label="L1:  |∂L/∂ŷ| = 1  (constant, any error)")
    ax.plot(e, np.minimum(e / beta, 1), color=COLORS["Huber"], lw=2, ls=(0, (4, 2)),
            label="Huber (β=0.05): like L2 below β, like L1 above")
    # CE on 256 bins: predicted bump of width s at ŷ vs HL-Gauss target at y = ŷ + e
    c = (np.arange(256) + 0.5) / 256
    for s_bins, ls in ((2, "-"), (12, "--")):
        tv = []
        for ei in e:
            p = np.exp(-0.5 * ((c - 0.25) / (s_bins / 256)) ** 2)
            p /= p.sum()
            q = hl_gauss(torch.tensor(0.25 + ei), 256, 0.75).numpy()
            tv.append(0.5 * np.abs(p - q).sum())
        ax.plot(e, tv, color=COLORS["Bins256 soft"], ls=ls,
                label=f"CE (256 bins): ½‖∂L/∂logits‖₁, predicted bump width {s_bins} bins")
    ax.set(xscale="log", yscale="log", xlabel="error |ŷ − y|  (target units, log)",
           ylabel="gradient magnitude (log)", ylim=(0.015, 15))
    ax.annotate("under L2, an outlier 0.5 away\npushes 10× harder than a\nsample 0.05 away", xy=(0.5, 10), xytext=(0.03, 6),
                fontsize=7, color=COLORS["L2"], arrowprops=dict(arrowstyle="->", color=COLORS["L2"]))
    ax.legend(fontsize=7)
    ax.set_title("(a) How hard does each loss push, as a function of error?", fontsize=10)

    ax = axes[1]
    gl = logs["1d"]["Bins256 soft"][0]["grad"]
    err, push, reg = map(np.array, (gl["err"], gl["push"], gl["region"]))
    for i in range(4):
        m = reg == i
        ax.scatter(err[m], push[m], s=4, alpha=0.5, label=REGIONS[i])
    ax.set_xscale("symlog", linthresh=0.01)
    ax.set(xlabel="|E[ŷ] − y|  (symlog)", ylabel="½‖∂CE/∂logits‖₁  (mass to move)")
    ax.set_title("(b) Trained Bins256-soft head: per-sample push vs error", fontsize=10)
    ax.legend(fontsize=7, markerscale=3)

    ax = axes[2]
    # Gradient a 70/30 bimodal batch sends to (i) a single regressed number, (ii) 256 logits
    g = torch.Generator().manual_seed(0)
    _, y, _ = Task1D.sample(4000, g, x=torch.full((4000,), 0.625))
    y = y[:, 0]
    q = hl_gauss(y, 256, 0.75).mean(0).numpy()
    p = np.full(256, 1 / 256)
    ax.bar(c, -(p - q), width=1 / 256, color=COLORS["Bins256 soft"], label="CE: −∂L/∂logits (uniform start)")
    yhat = 0.5
    pull_up = ((y > yhat).float() * (y - yhat)).sum().item() / len(y)
    pull_dn = ((y < yhat).float() * (yhat - y)).sum().item() / len(y)
    ax.annotate("", xy=(yhat + 0.25 * pull_up / max(pull_up, pull_dn), 0.75 * ax.get_ylim()[1]), xytext=(yhat, 0.75 * ax.get_ylim()[1]),
                arrowprops=dict(color=COLORS["L2"], lw=2.5, arrowstyle="->"))
    ax.annotate("", xy=(yhat - 0.25 * pull_dn / max(pull_up, pull_dn), 0.75 * ax.get_ylim()[1]), xytext=(yhat, 0.75 * ax.get_ylim()[1]),
                arrowprops=dict(color=COLORS["L2"], lw=2.5, arrowstyle="->"))
    ax.plot([yhat], [0.75 * ax.get_ylim()[1]], "o", color=COLORS["L2"], ms=8, label="L2: one number pulled both ways")
    ax.set(xlabel="y", ylabel="push per bin", xlim=(0, 1))
    ax.set_title("(c) 70/30 batch: regression gets a tug-of-war,\nCE raises both peaks independently", fontsize=10)
    ax.legend(fontsize=7, loc="upper left")
    fig.tight_layout()
    fig.savefig(os.path.join(PLOTS, "07_gradients.png"), dpi=120)
    plt.close(fig)


def fig_predictions_2d(logs, cfg, decode_key, fname, title):
    t, y, _ = Task2D.sample(3000, torch.Generator().manual_seed(0))
    gt = np.linspace(0, 1, cfg["n_grid"])
    reg_colors = ["#2ca02c", "#1f77b4", "#ff7f0e", "#d62728"]
    th = np.linspace(0, 2 * np.pi, 300)
    fig, axes = plt.subplots(2, 5, figsize=(20, 9.0))
    axes.flat[0].scatter(y[:, 0], y[:, 1], s=2, c=[reg_colors[i] for i in region_of(t[:, 0])], alpha=0.5)
    axes.flat[0].set_title("training samples\n(colour = region of t)", fontsize=10)
    for ax, head in zip(axes.flat[1:], HEADS_2D):
        dec = logs["2d"][head][0]["grid"]["decode"]
        k = "point" if "point" in dec else decode_key
        p = np.array(dec[k])
        ax.scatter(y[:, 0], y[:, 1], s=1, c="0.8")
        ax.scatter(p[:, 0], p[:, 1], s=7, c=[reg_colors[min(int(v * 4), 3)] for v in gt])
        ax.set_title(f"{head}" + ("" if k == "point" else f"  [{k}]"), color=COLORS[head], fontweight="bold", fontsize=10)
    for ax in axes.flat:
        for r in (R_OUTER, R_INNER):
            ax.plot(0.5 + r * np.cos(th), 0.5 + r * np.sin(th), "k-", lw=0.5, alpha=0.5)
        ax.set(xlim=(0, 1), ylim=(0, 1), aspect="equal", xticks=[], yticks=[])
    handles = [plt.Line2D([], [], marker="o", ls="", color=c, label=n) for c, n in zip(reg_colors, REGIONS)]
    fig.legend(handles=handles, loc="lower center", ncol=4, fontsize=9)
    fig.suptitle(title, fontsize=11)
    fig.tight_layout(rect=(0, 0.04, 1, 1), h_pad=2.5)
    fig.savefig(os.path.join(PLOTS, fname), dpi=110)
    plt.close(fig)


def fig_ghosts(logs):
    heads = ["Bins256 soft", "2-level 16x16", "Joint 2D 64x64"]
    titles = ["per-coordinate bins:\np(x)·p(y)", "per-coordinate 2-level:\np(x)·p(y)", "joint 2D bins:\np(x, y)"]
    ts = [0.125, 0.625, 0.875]
    th = np.linspace(0, 2 * np.pi, 300)
    fig, axes = plt.subplots(len(ts), 3, figsize=(11, 11))
    for j, (head, ttl) in enumerate(zip(heads, titles)):
        g = logs["2d"][head][0]["grid2d"]
        for i, t0 in enumerate(ts):
            ax = axes[i, j]
            ax.imshow(np.sqrt(g[i].T), origin="lower", extent=(0, 1, 0, 1), cmap="magma")
            for r in (R_OUTER, R_INNER):
                ax.plot(0.5 + r * np.cos(th), 0.5 + r * np.sin(th), "w-", lw=0.4, alpha=0.6)
            for r in (R_OUTER, R_INNER):
                pt = ring(torch.tensor([t0]), r)[0]
                ax.plot(*pt, "o", mfc="none", mec="c", ms=12, mew=1.5)
            ax.set(xticks=[], yticks=[])
            if i == 0:
                ax.set_title(ttl, fontsize=10)
            if j == 0:
                ax.set_ylabel(f"t = {t0}\n{REGIONS[int(t0 * 4)]}", fontsize=10)
    fig.suptitle("Ghost points: per-coordinate softmaxes can't say 'outer OR inner point' — their product puts\n"
                 "mass on 4 corners (2 real, cyan circles; 2 ghosts). A joint softmax keeps only the 2 real ones.", fontsize=10)
    fig.tight_layout()
    fig.savefig(os.path.join(PLOTS, "10_ghost_points_2d.png"), dpi=110)
    plt.close(fig)


def gif_training(logs, cfg):
    heads = ["L2", "L1", "Huber", "Bins256 soft"]
    x, y, _ = Task1D.sample(2000, torch.Generator().manual_seed(0))
    gx = np.linspace(0, 1, cfg["n_grid"])
    snaps = {h: logs["1d"][h][0]["snaps"] for h in heads}
    fig, axes = plt.subplots(1, 4, figsize=(16, 4), sharey=True)
    def draw(f):
        for ax, h in zip(axes, heads):
            ax.clear()
            step, g = snaps[h][f]
            if "density" in g:
                d = g["density"][:, 0, :].T
                ax.imshow(np.sqrt(d / d.max(0, keepdims=True)), origin="lower", extent=(0, 1, 0, 1), aspect="auto", cmap="Blues", vmin=0, vmax=1.3)
            ax.scatter(x[:, 0], y[:, 0], s=1, c="0.4", alpha=0.3)
            k = "point" if "point" in g["decode"] else "argmax"
            ax.plot(gx, np.array(g["decode"][k])[:, 0], color=COLORS[h] if k == "point" else "#d62728", lw=2.2)
            region_lines(ax, labels=False)
            ax.set(xlim=(0, 1), ylim=(0, 1), title=f"{h}   step {step}")
        fig.tight_layout()
    anim = FuncAnimation(fig, draw, frames=len(snaps[heads[0]]))
    anim.save(os.path.join(PLOTS, "05_training.gif"), writer=PillowWriter(fps=6))
    plt.close(fig)


# ----------------------------------------------------------------------------
# Tables
# ----------------------------------------------------------------------------


def write_results(logs, cfg):
    def fmt(vals):
        return f"{np.mean(vals):.4f} ± {np.std(vals):.4f}"

    lines = ["# Results", "",
             f"Seeds: {cfg['seeds']}, steps: {cfg['steps']}, batch: {cfg['batch']}. All numbers are in target units "
             "(the unit square), mean ± std over seeds, on 4000 held-out samples.", "",
             "* **err vs label** = |prediction − sampled noisy label| (what you'd measure against a single annotation).",
             "* **dist to valid** = distance to the nearest noise-free valid answer (either mode in the bimodal regions, "
             "the clean curve in the outlier region). This is the number that says whether the output is *a correct answer*.", ""]
    for task, heads in (("1d", HEADS_1D), ("2d", HEADS_2D)):
        runs = logs[task]
        lines += [f"## {task.upper()}", "", "### Overall", ""]
        cols = ["err mean", "err median", "err p90", "valid mean", "valid median", "valid p90"]
        keys = ["mean", "median", "p90", "valid_mean", "valid_median", "valid_p90"]
        if task == "2d":
            cols.append("dist to valid curve")
            keys.append("curve_mean")
        lines += ["| head | decode | " + " | ".join(cols) + " |", "|" + "---|" * (len(cols) + 2)]
        for h in heads:
            for dec in runs[h][0]["final"]:
                row = [fmt([r["final"][dec]["all"][k] for r in runs[h]]) for k in keys]
                lines.append(f"| {h} | {dec} | " + " | ".join(row) + " |")
        lines += ["", "### Distance to nearest valid answer, by region (mean)", "",
                  "| head | decode | " + " | ".join(REGIONS) + " |", "|" + "---|" * 6]
        for h in heads:
            for dec in runs[h][0]["final"]:
                row = [fmt([r["final"][dec][f"r{i}"]["valid_mean"] for r in runs[h]]) for i in range(4)]
                lines.append(f"| {h} | {dec} | " + " | ".join(row) + " |")
        lines += ["", "### Median distance to nearest valid answer, by region", "",
                  "| head | decode | " + " | ".join(REGIONS) + " |", "|" + "---|" * 6]
        for h in heads:
            for dec in runs[h][0]["final"]:
                row = [fmt([r["final"][dec][f"r{i}"]["valid_median"] for r in runs[h]]) for i in range(4)]
                lines.append(f"| {h} | {dec} | " + " | ".join(row) + " |")
        lines.append("")
    with open(os.path.join(HERE, "results.md"), "w") as f:
        f.write("\n".join(lines))
    summary = {t: {h: {d: {k: float(np.mean([r["final"][d]["all"][k] for r in logs[t][h]])) for k in logs[t][h][0]["final"][d]["all"]}
                       for d in logs[t][h][0]["final"]} for h in logs[t]} for t in logs}
    with open(os.path.join(HERE, "results.json"), "w") as f:
        json.dump(summary, f, indent=1)


# ----------------------------------------------------------------------------


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--seeds", type=int, default=3)
    ap.add_argument("--steps", type=int, default=3000)
    ap.add_argument("--batch", type=int, default=512)
    ap.add_argument("--lr", type=float, default=2e-3)
    ap.add_argument("--workers", type=int, default=os.cpu_count())
    ap.add_argument("--heads", nargs="*", default=None, help="subset of heads to train")
    ap.add_argument("--quick", action="store_true", help="tiny run to check everything works")
    ap.add_argument("--plots-only", action="store_true", help="re-draw plots from the saved logs.pkl")
    args = ap.parse_args()
    cfg = dict(seeds=args.seeds, steps=args.steps, batch=args.batch, lr=args.lr, n_eval=4000, n_grid=300,
               log_every=25, eval_every=100, snap_every=100)
    if args.quick:
        cfg.update(seeds=1, steps=200, eval_every=50, snap_every=50)
    os.makedirs(PLOTS, exist_ok=True)
    fig_data_1d()
    fig_loss_landscape()

    jobs = [(t, h, s, cfg) for t, hs in (("1d", HEADS_1D), ("2d", HEADS_2D)) for h in hs
            if args.heads is None or h in args.heads for s in range(cfg["seeds"])]
    logs_path = os.path.join(HERE, "logs.pkl")
    if args.plots_only:
        with open(logs_path, "rb") as f:
            logs, cfg = pickle.load(f)
    else:
        t0 = time.time()
        logs = {"1d": {}, "2d": {}}
        with Pool(args.workers) as pool:
            for i, (t, h, s, log) in enumerate(pool.imap_unordered(train_one, jobs)):
                logs[t].setdefault(h, [None] * cfg["seeds"])[s] = log
                print(f"[{i + 1:2d}/{len(jobs)}] {t} {h:20s} seed {s}  {log['time']:5.1f}s", flush=True)
        print(f"training done in {time.time() - t0:.0f}s, plotting...")
        if args.heads is not None:
            return
        with open(logs_path, "wb") as f:
            pickle.dump((logs, cfg), f)
    fig_predictions_1d(logs, cfg)
    fig_distributions(logs, cfg)
    gif_training(logs, cfg)
    fig_training_curves(logs, "1d", HEADS_1D, "06_training_curves_1d.png")
    fig_gradients(logs)
    fig_predictions_2d(logs, cfg, "argmax", "08_predictions_2d.png",
                       "2D ('letter O'): predicted point for every t along the path. Bin heads decoded with argmax.")
    fig_predictions_2d(logs, cfg, "mean", "09_predictions_2d_mean_decode.png",
                       "Same, but bin heads decoded with the expected value: the mean falls between the rings, just like L2.")
    fig_ghosts(logs)
    fig_training_curves(logs, "2d", HEADS_2D, "11_training_curves_2d.png")
    write_results(logs, cfg)
    print("wrote plots/ and results.md")


if __name__ == "__main__":
    main()
