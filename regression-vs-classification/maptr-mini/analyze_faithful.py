"""Results and diagnostics for the MapTR-faithful runs.

    python analyze_faithful.py      # curves + tables for runs_f/ (clean) and runs_f_amb/ (double lines),
                                    # plus per-class AP and stroke/midline diagnostics from the saved
                                    # double-line models (models/runs_f_amb_{l1,bins}_s*.pt)
"""
import glob
import json
import os

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import torch

import maptr_faithful as mf
import mini_maptr as mm

HERE = os.path.dirname(os.path.abspath(__file__))
NAMES = {"l1": "L1 regression (MapTR)", "bins": "bins (CE weight 0.03)"}
COLORS = {"l1": "#d62728", "bins": "#1f77b4"}


def load_runs(folder):
    runs = {}
    for f in sorted(glob.glob(os.path.join(HERE, folder, "*.json"))):
        r = json.load(open(f))
        runs.setdefault(r["head"], []).append(r)
    return runs


def summary(folder, tag):
    runs = load_runs(folder)
    fig, axes = plt.subplots(1, 3, figsize=(17, 4.6))
    for head, rs in runs.items():
        steps = [e["step"] for e in rs[0]["evals"]]
        for ax, key in zip(axes, ["mAP", "closed_median_chamfer_px", "flip_rate"]):
            v = np.array([[np.nan if e[key] is None else e[key] for e in r["evals"]] for r in rs], dtype=float)
            ax.plot(steps, np.nanmean(v, 0), color=COLORS[head], lw=2, label=f"{NAMES[head]} ({len(rs)} seeds)")
            ax.fill_between(steps, np.nanmin(v, 0), np.nanmax(v, 0), color=COLORS[head], alpha=0.2)
    for ax, t in zip(axes, ["mAP (Chamfer AP at 1/2/3 px)", "median Chamfer error on closed loops (px)",
                            "matching flip rate"]):
        ax.set(title=t, xlabel="training step")
    axes[1].set_yscale("log")
    axes[2].set_yscale("log")
    axes[0].legend(fontsize=8)
    fig.tight_layout()
    os.makedirs(os.path.join(HERE, "plots"), exist_ok=True)
    fig.savefig(os.path.join(HERE, "plots", f"faithful{tag}.png"), dpi=120)
    lines = ["| head | seeds | final mAP | AP@1px | AP@2px | AP@3px | closed-loop median error (px) | mAP at step 2000 | mean flip rate, first half |",
             "|---|---|---|---|---|---|---|---|---|"]
    for head, rs in runs.items():
        def stat(f, fmt="{:.3f}"):
            v = np.array([f(r) for r in rs], dtype=float)
            return f"{fmt.format(v.mean())} ± {fmt.format(v.std())}"
        n = len(rs[0]["evals"])
        at = lambda r, s: [e for e in r["evals"] if e["step"] == s][0]
        fl = lambda r: np.nanmean([np.nan if e["flip_rate"] is None else e["flip_rate"] for e in r["evals"][1:n // 2]])
        lines.append(f"| {NAMES[head]} | {len(rs)} | {stat(lambda r: r['evals'][-1]['mAP'])} | "
                     f"{stat(lambda r: r['evals'][-1]['AP@1px'])} | {stat(lambda r: r['evals'][-1]['AP@2px'])} | "
                     f"{stat(lambda r: r['evals'][-1]['AP@3px'])} | {stat(lambda r: r['evals'][-1]['closed_median_chamfer_px'], '{:.2f}')} | "
                     f"{stat(lambda r: at(r, 2000)['mAP'])} | {stat(fl)} |")
    return "\n".join(lines)


def seg_dist(p, line):
    a, b = line[:-1], line[1:]
    ab = b - a
    t = np.clip(((p[:, None] - a[None]) * ab[None]).sum(-1) / (ab ** 2).sum(-1)[None], 0, 1)
    return np.linalg.norm(p[:, None] - (a[None] + t[..., None] * ab[None]), axis=-1).min(1) * mm.S


def diagnostics():
    d = np.load(os.path.join(HERE, "data_f_amb.npz"), allow_pickle=True)
    imgs, labels, alts = d["va_img"], d["va_lab"], d["va_alt"]
    out = {}
    for head in ("l1", "bins"):
        per_seed = []
        for path in sorted(glob.glob(os.path.join(HERE, "models", f"runs_f_amb_{head}_s*.pt"))):
            mf.K_ONE2MANY = 0
            model = mf.FaithfulMapTR(head, d=64)
            model.load_state_dict(torch.load(path))
            prob, pts = mf.predict(model, imgs)
            r = {}
            for c, name in enumerate(mm.CLASSES):
                preds = [(i, float(prob[i, q, c]), pts[i, q]) for i in range(len(imgs)) for q in range(mf.N_ONE2ONE)]
                gts = {i: [a for a, l in zip(alts[i], labels[i]) if l == c] for i in range(len(imgs))}
                for t in (1.0, 2.0, 3.0):
                    r[f"AP_{name}@{t:g}px"] = mm.average_precision(preds, gts, t)
            on_stroke, d_stroke, d_mid, cons, near_stroke, near_mid = [], [], [], [], [], []
            for i in range(len(imgs)):
                for a, l in zip(alts[i], labels[i]):
                    if l != 0:
                        continue
                    cand = [q for q in range(mf.N_ONE2ONE) if prob[i, q, 0] > 0.3]
                    if not cand:
                        continue
                    mid = a.mean(0)
                    q = min(cand, key=lambda q: min(mm.chamfer_px(pts[i, q], s) for s in list(a) + [mid]))
                    p = pts[i, q]
                    ds, dm = min(mm.chamfer_px(p, s) for s in a), mm.chamfer_px(p, mid)
                    d_stroke.append(ds), d_mid.append(dm), on_stroke.append(ds < dm)
                    da, db, dmid = seg_dist(p, a[0]), seg_dist(p, a[1]), seg_dist(p, mid)
                    pick = da < db
                    cons.append(max(pick.mean(), 1 - pick.mean()))
                    near_stroke.append((np.minimum(da, db) < 1.0).mean())
                    near_mid.append((dmid < 1.0).mean())
            r.update(open_curves=len(on_stroke),
                     fraction_curves_closer_to_a_stroke_than_midline=float(np.mean(on_stroke)),
                     median_chamfer_to_nearest_stroke_px=float(np.median(d_stroke)),
                     median_chamfer_to_midline_px=float(np.median(d_mid)),
                     points_on_majority_stroke=float(np.mean(cons)),
                     points_within_1px_of_a_stroke=float(np.mean(near_stroke)),
                     points_within_1px_of_midline=float(np.mean(near_mid)))
            per_seed.append(r)
        out[head] = {k: [float(np.mean([s[k] for s in per_seed])), float(np.std([s[k] for s in per_seed]))]
                     for k in per_seed[0]} if per_seed else {}
        out[head]["seeds"] = len(per_seed)
    return out


if __name__ == "__main__":
    text = ["# MapTR-faithful mini: results", "", "## Clean labels", "", summary("runs_f", ""), "",
            "## Double lines (ambiguous labels)", "", summary("runs_f_amb", "_amb"), ""]
    diag = diagnostics()
    json.dump(diag, open(os.path.join(HERE, "results_faithful_diagnostics.json"), "w"), indent=1)
    text += ["## Double lines: per-class AP and where the predictions land (mean ± std over seeds)", "",
             "| metric | L1 | bins |", "|---|---|---|"]
    for k in diag["l1"]:
        if k == "seeds":
            continue
        f = lambda h: f"{diag[h][k][0]:.3f} ± {diag[h][k][1]:.3f}" if diag[h] else "-"
        text.append(f"| {k} | {f('l1')} | {f('bins')} |")
    open(os.path.join(HERE, "results_faithful.md"), "w").write("\n".join(text) + "\n")
    print("\n".join(text))
