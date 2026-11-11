"""SUPERSEDED: the two-peak test here also fires on single-answer closed loops (see check_sharpness.py), so its
conclusions are retracted. Kept for the record.

Is the bin head's in-between behaviour on double lines caused by x and y choosing peaks independently?

For each point of each matched double-line prediction (saved MapTR-faithful bin models, 3 seeds):
  * bimodal: the x or y histogram has two separated peaks (>= 4 bins apart), each holding >= 20% of the mass
  * for the decoded point, which stroke its x and its y agree with: the stroke point nearest to the decoded
    point is found on each stroke; an axis "agrees" with a stroke if it is within 0.5 px of that stroke
    point's coordinate on that axis and further from the other stroke's
  * mixed: x agrees with one stroke and y with the other (a ghost)
"""
import glob
import json
import os

import numpy as np
import torch

import maptr_faithful as mf
import mini_maptr as mm

HERE = os.path.dirname(os.path.abspath(__file__))


def nearest_on(line, p):
    a, b = line[:-1], line[1:]
    ab = b - a
    t = np.clip(((p - a) * ab).sum(-1) / (ab ** 2).sum(-1), 0, 1)
    proj = a + t[:, None] * ab
    return proj[np.argmin(np.linalg.norm(proj - p, axis=1))]


def two_peaks(p, sep=4, mass=0.2):
    k = len(p)
    i = int(p.argmax())
    m1 = p[max(0, i - 2):i + 3].sum()
    far = np.abs(np.arange(k) - i) >= sep
    if not far.any():
        return False
    j = int(np.where(far, p, -1).argmax())
    m2 = p[max(0, j - 2):j + 3].sum()
    return m1 >= mass and m2 >= mass


d = np.load(os.path.join(HERE, "data_f_amb.npz"), allow_pickle=True)
imgs, labels, alts = d["va_img"], d["va_lab"], d["va_alt"]
res = []
for path in sorted(glob.glob(os.path.join(HERE, "models", "runs_f_amb_bins_s*.pt"))):
    mf.K_ONE2MANY = 0
    model = mf.FaithfulMapTR("bins", d=64)
    model.load_state_dict(torch.load(path))
    model.eval()
    n = bim = mixed = agree_one = between = 0
    mixed_between = 0
    with torch.no_grad():
        for s in range(0, len(imgs), 100):
            out = model(torch.as_tensor(imgs[s:s + 100], dtype=torch.float32)[:, None] / 255.0)[-1]
            prob, pts, bins = out["logits"].sigmoid().numpy(), out["pts"].numpy(), out["bins"].softmax(-1).numpy()
            for b in range(len(prob)):
                i = s + b
                for a, l in zip(alts[i], labels[i]):
                    if l != 0:
                        continue
                    cand = [q for q in range(mf.N_ONE2ONE) if prob[b, q, 0] > 0.3]
                    if not cand:
                        continue
                    mid = a.mean(0)
                    q = min(cand, key=lambda q: min(mm.chamfer_px(pts[b, q], t) for t in list(a) + [mid]))
                    for j in range(mf.P):
                        p = pts[b, q, j]
                        na, nb = nearest_on(a[0], p[None].repeat(1, 0)), nearest_on(a[1], p[None].repeat(1, 0))
                        agree = []
                        for ax in (0, 1):
                            da, db = abs(p[ax] - na[ax]) * mm.S, abs(p[ax] - nb[ax]) * mm.S
                            agree.append("a" if da < 0.5 and da < db else "b" if db < 0.5 and db < da else None)
                        off = min(np.linalg.norm(p - na), np.linalg.norm(p - nb)) * mm.S > 1.0
                        n += 1
                        bim += two_peaks(bins[b, q, j, 0]) or two_peaks(bins[b, q, j, 1])
                        is_mixed = agree[0] is not None and agree[1] is not None and agree[0] != agree[1]
                        mixed += is_mixed
                        between += off
                        mixed_between += is_mixed and off
    res.append(dict(model=os.path.basename(path), points=n, fraction_bimodal=bim / n,
                    fraction_off_both_strokes_by_1px=between / n, fraction_mixed_x_y=mixed / n,
                    fraction_of_off_stroke_points_that_are_mixed=mixed_between / max(between, 1)))
print(json.dumps(res, indent=1))
json.dump(res, open(os.path.join(HERE, "results_ghosts.json"), "w"), indent=1)
