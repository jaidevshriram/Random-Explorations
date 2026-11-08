"""Do a predicted curve's points pick the same stroke of a double line, or hop between strokes?
Uses the saved seed-0 models and the double-line validation set."""
import json
import os

import numpy as np
import torch

import analyze_predictions as ap
import mini_maptr as mm

HERE = os.path.dirname(os.path.abspath(__file__))


def seg_dist(p, line):
    """Distance (px) from points p (N,2) to a polyline (M,2)."""
    a, b = line[:-1], line[1:]
    ab = b - a
    t = np.clip(((p[:, None] - a[None]) * ab[None]).sum(-1) / (ab ** 2).sum(-1)[None], 0, 1)
    proj = a[None] + t[..., None] * ab[None]
    return np.linalg.norm(p[:, None] - proj, axis=-1).min(1) * mm.S


d = np.load(os.path.join(HERE, "data_amb.npz"), allow_pickle=True)
imgs, labels, alts = d["va_img"], d["va_lab"], d["va_alt"]
out = {}
for head in ("l1", "bins"):
    prob, pts = ap.predict(ap.load(head), imgs)
    cons, on_any, near_mid, n = [], [], [], 0
    for i in range(len(imgs)):
        for a, l in zip(alts[i], labels[i]):
            if l != 0:
                continue
            cand = [q for q in range(pts.shape[1]) if prob[i, q, :-1].argmax() == 0 and prob[i, q, 0] > 0.3]
            if not cand:
                continue
            q = min(cand, key=lambda q: min(mm.chamfer_px(pts[i, q], s) for s in list(a) + [a.mean(0)]))
            p = pts[i, q]
            da, db, dm = seg_dist(p, a[0]), seg_dist(p, a[1]), seg_dist(p, a.mean(0))
            pick_a = da < db
            cons.append(max(pick_a.mean(), 1 - pick_a.mean()))  # 1.0 = all points on the same stroke
            on_any.append((np.minimum(da, db) < 1.0).mean())     # points within 1 px of some stroke
            near_mid.append((dm < 1.0).mean())                   # points within 1 px of the midline
            n += 1
    out[head] = {"curves": n,
                 "mean_fraction_of_points_choosing_the_majority_stroke": float(np.mean(cons)),
                 "mean_fraction_of_points_within_1px_of_a_stroke": float(np.mean(on_any)),
                 "mean_fraction_of_points_within_1px_of_the_midline": float(np.mean(near_mid))}
print(json.dumps(out, indent=1))
json.dump(out, open(os.path.join(HERE, "results_consistency.json"), "w"), indent=1)
