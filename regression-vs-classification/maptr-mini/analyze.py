"""Summarise runs*/*.json into plots and a results table.

    python analyze.py            # experiment 1 (clean labels):     runs/     -> plots/curves.png, results.md
    python analyze.py --amb      # experiment 2 (ambiguous labels): runs_amb/ -> plots/curves_amb.png, results_amb.md
"""
import glob
import json
import os
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
TAG = "_amb" if "--amb" in sys.argv else ""
NAMES = {"l1": "L1 regression (MapTR baseline)", "bins": "bins, L1 matching cost", "bins_nll": "bins, NLL matching cost"}
COLORS = {"l1": "#d62728", "bins": "#1f77b4", "bins_nll": "#9467bd"}

runs = {}
for f in sorted(glob.glob(os.path.join(HERE, f"runs{TAG}", "*.json"))):
    r = json.load(open(f))
    runs.setdefault(r["head"], []).append(r)

fig, axes = plt.subplots(1, 3, figsize=(17, 4.6))
for head, rs in runs.items():
    steps = [e["step"] for e in rs[0]["evals"]]
    for ax, key in zip(axes, ["mAP", "AP@1px", "flip_rate"]):
        v = np.array([[np.nan if e[key] is None else e[key] for e in r["evals"]] for r in rs], dtype=float)
        v[:, np.all(np.isnan(v), 0)] = np.nan if key != "flip_rate" else v[:, np.all(np.isnan(v), 0)]
        ax.plot(steps, np.nanmean(v, 0), color=COLORS[head], label=f"{NAMES[head]} ({len(rs)} seeds)", lw=2)
        ax.fill_between(steps, np.nanmin(v, 0), np.nanmax(v, 0), color=COLORS[head], alpha=0.2)
for ax, t in zip(axes, ["mAP (Chamfer AP at 1/2/3 px, mean)", "AP at the strict 1 px threshold",
                        "matching flip rate (fraction of elements whose\nmatched query changed since the last eval)"]):
    ax.set(title=t, xlabel="training step")
axes[0].legend(fontsize=8)
axes[2].set_yscale("log")
fig.tight_layout()
os.makedirs(os.path.join(HERE, "plots"), exist_ok=True)
fig.savefig(os.path.join(HERE, "plots", f"curves{TAG}.png"), dpi=120)

lines = ["| head | seeds | final mAP | AP@1px | AP@2px | AP@3px | mAP at 25% of training | mean flip rate, first half | mean flip rate, second half |",
         "|---|---|---|---|---|---|---|---|---|"]
for head, rs in runs.items():
    def stat(f):
        v = np.array([f(r) for r in rs], dtype=float)
        return f"{v.mean():.3f} ± {v.std():.3f}"
    n = len(rs[0]["evals"])
    fl = lambda r, a, b: np.nanmean([np.nan if e["flip_rate"] is None else e["flip_rate"] for e in r["evals"][a:b]])
    lines.append(f"| {NAMES[head]} | {len(rs)} | {stat(lambda r: r['evals'][-1]['mAP'])} | "
                 f"{stat(lambda r: r['evals'][-1]['AP@1px'])} | {stat(lambda r: r['evals'][-1]['AP@2px'])} | "
                 f"{stat(lambda r: r['evals'][-1]['AP@3px'])} | {stat(lambda r: r['evals'][n // 4 - 1]['mAP'])} | "
                 f"{stat(lambda r: fl(r, 1, n // 2))} | {stat(lambda r: fl(r, n // 2, n))} |")
open(os.path.join(HERE, f"results{TAG}.md"), "w").write("\n".join(lines) + "\n")
print("\n".join(lines))
