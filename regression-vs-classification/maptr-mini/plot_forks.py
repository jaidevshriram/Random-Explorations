"""Figures for the lane-forks experiment (seed-0 models).

plots/forks_examples.png: validation forks; every valid route (grey) and each head's prediction.
plots/forks_samples.png: the same forks; 16 sampled routes from the autoregressive joint coarse+offset head.
plots/forks_bars.png: off-route rate and min-ADE per head on forks and on single-route lanes (mean +- std over seeds).
"""
import glob
import json
import os

import matplotlib
import numpy as np
import torch

matplotlib.use("Agg")
import matplotlib.pyplot as plt

import forks_train as ft

HERE = os.path.dirname(os.path.abspath(__file__))
torch.set_num_threads(4)
HEADS = ["l2", "l1", "bins", "cbins", "jcbins", "ar_l1", "ar_cbins"]
NAMES = {"l2": "L2", "l1": "L1", "bins": "bins (x, y separate)", "cbins": "coarse+offset (x, y separate)",
         "jcbins": "joint 2D coarse+offset", "ar_l1": "autoregressive L1", "ar_cbins": "autoregressive joint 2D coarse+offset"}
COL = {"l2": "tab:red", "l1": "tab:orange", "bins": "tab:cyan", "cbins": "tab:purple", "jcbins": "tab:pink",
       "ar_l1": "tab:brown", "ar_cbins": "tab:blue"}

d = np.load(os.path.join(HERE, "forks.npz"))
img, tgt, n = d["val_img"], d["val_tgt"], d["val_n"]
rng = np.random.default_rng(3)
idx = rng.choice(np.where(n == 2)[0], 6, replace=False)
x = torch.as_tensor(img[idx], dtype=torch.float32) / 255.0
preds, models = {}, {}
for h in HEADS:
    p = os.path.join(HERE, "models", f"runs_forks_{h}_s0.pt")
    if not os.path.exists(p):
        continue
    m = ft.Net(h)
    m.load_state_dict(torch.load(p))
    m.eval()
    models[h] = m
    with torch.no_grad():
        preds[h] = ft.denorm(m(x)[0]).numpy()


def background(ax, i):
    im = img[i]
    ax.imshow(np.stack([im[1] * 0.12 + 20, im[1] * 0.12 + 20, im[1] * 0.12 + 20], -1).astype(np.uint8) + (im[0][..., None] > 0) * 60,
              extent=[ft.LAT, -ft.LAT, 0, ft.FWD])
    for k in range(n[i]):
        ax.plot(tgt[i, k, :, 1], tgt[i, k, :, 0], "-", color="0.85", lw=7, alpha=0.6, solid_capstyle="round")
    ax.plot(0, 0, "w^", ms=8)
    ax.set_xticks([]), ax.set_yticks([])


fig, axes = plt.subplots(2, 3, figsize=(15, 10))
for ax, i, j in zip(axes.flat, idx, range(len(idx))):
    background(ax, i)
    for h, p in preds.items():
        ax.plot(p[j, :, 1], p[j, :, 0], "o-", color=COL[h], lw=2, ms=4, label=NAMES[h])
axes.flat[0].legend(fontsize=8, loc="lower left")
fig.suptitle("Real AV2 forks: the wide grey bands are the valid routes; the label was one of them at random.\n"
             "L2 averages the branches; separate x/y bins mix them; the autoregressive joint head follows one branch.", fontsize=12)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "plots", "forks_examples.png"), dpi=100)

if "ar_cbins" in models:
    fig, axes = plt.subplots(2, 3, figsize=(15, 10))
    gen = torch.Generator().manual_seed(0)
    with torch.no_grad():
        smp = [ft.denorm(models["ar_cbins"](x, sample=True, gen=gen)[0]).numpy() for _ in range(16)]
    for ax, i, j in zip(axes.flat, idx, range(len(idx))):
        background(ax, i)
        for s in smp:
            ax.plot(s[j, :, 1], s[j, :, 0], "o-", color="tab:blue", lw=1, ms=3, alpha=0.5)
    fig.suptitle("16 routes sampled from the autoregressive joint coarse+offset head: the samples split between the real branches.", fontsize=12)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "plots", "forks_samples.png"), dpi=100)

# bars over seeds
rows = {}
for h in HEADS:
    runs = [json.load(open(f))["evals"][-1] for f in sorted(glob.glob(os.path.join(HERE, "runs_forks", f"{h}_s*.json")))]
    if runs:
        rows[h] = runs
fig, axes = plt.subplots(1, 3, figsize=(16, 4.8))
for ax, key, title in [(axes[0], "fork_offroute", "forks: fraction of predictions off every route (>2 m)"),
                       (axes[1], "fork_minADE", "forks: distance to the nearest valid route (m)"),
                       (axes[2], "single_minADE", "single-route lanes: error (m)")]:
    hs = list(rows)
    m = [np.mean([r[key] for r in rows[h]]) for h in hs]
    s = [np.std([r[key] for r in rows[h]]) for h in hs]
    ax.barh(range(len(hs)), m, xerr=s, color=[COL[h] for h in hs])
    ax.set_yticks(range(len(hs)))
    ax.set_yticklabels([NAMES[h] for h in hs] if ax is axes[0] else [""] * len(hs))
    ax.invert_yaxis()
    ax.set_title(title, fontsize=10)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "plots", "forks_bars.png"), dpi=100)

# results table
lines = ["| Head | seeds | forks: off-route | forks: min-ADE (m) | forks: ADE vs. the drawn label (m) | forks: sample coverage | single: min-ADE (m) | single: off-route |",
         "|---|---|---|---|---|---|---|---|"]
for h, runs in rows.items():
    f = lambda k: f"{np.mean([r[k] for r in runs]):.3f} ± {np.std([r[k] for r in runs]):.3f}" if k in runs[0] else "n/a"
    lines.append(f"| {NAMES[h]} | {len(runs)} | {f('fork_offroute')} | {f('fork_minADE')} | {f('fork_ADE_label')} | {f('fork_sample_coverage')} | {f('single_minADE')} | {f('single_offroute')} |")
open(os.path.join(HERE, "results_forks.md"), "w").write("\n".join(lines) + "\n")
print("\n".join(lines))
