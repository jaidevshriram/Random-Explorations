"""Direct test of the x/y pairing explanation for the bin head's off-stroke points on double lines.

For every point with a two-peaked histogram on both axes, take each axis's two peaks (peak position =
probability-weighted mean within +-2 bins of the peak). The decoder pairs the higher x peak with the
higher y peak. If that point is > 1 px from both strokes, check whether any of the other three pairings
lands within 1 px of a stroke: if so, the miss comes from choosing x and y independently.
"""
import glob
import json
import os

import numpy as np
import torch

import maptr_faithful as mf
import mini_maptr as mm

HERE = os.path.dirname(os.path.abspath(__file__))


def peaks(p, sep=4):
    k = len(p)
    c = (np.arange(k) + 0.5) / k
    i = int(p.argmax())
    far = np.abs(np.arange(k) - i) >= sep
    j = int(np.where(far, p, -1).argmax())
    pos = lambda m: float((p[max(0, m - 2):m + 3] * c[max(0, m - 2):m + 3]).sum() / p[max(0, m - 2):m + 3].sum())
    mass = lambda m: float(p[max(0, m - 2):m + 3].sum())
    return (pos(i), mass(i)), (pos(j), mass(j))


def dist_to(line, pts):
    a, b = line[:-1], line[1:]
    ab = b - a
    t = np.clip(((pts[:, None] - a[None]) * ab[None]).sum(-1) / (ab ** 2).sum(-1)[None], 0, 1)
    return np.linalg.norm(pts[:, None] - (a[None] + t[..., None] * ab[None]), axis=-1).min(1) * mm.S


d = np.load(os.path.join(HERE, "data_f_amb.npz"), allow_pickle=True)
imgs, labels, alts = d["va_img"], d["va_lab"], d["va_alt"]
res = []
for path in sorted(glob.glob(os.path.join(HERE, "models", "runs_f_amb_bins_s*.pt"))):
    mf.K_ONE2MANY = 0
    model = mf.FaithfulMapTR("bins", d=64)
    model.load_state_dict(torch.load(path))
    model.eval()
    n_bi = off = fixable = both_weak = 0
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
                        (x1, mx1), (x2, mx2) = peaks(bins[b, q, j, 0])
                        (y1, my1), (y2, my2) = peaks(bins[b, q, j, 1])
                        if min(mx2, my2) < 0.2:
                            continue  # not two-peaked on both axes
                        n_bi += 1
                        combos = np.array([[x1, y1], [x1, y2], [x2, y1], [x2, y2]])
                        dd = np.minimum(dist_to(a[0], combos), dist_to(a[1], combos))
                        if dd[0] > 1.0:
                            off += 1
                            fixable += bool((dd[1:] <= 1.0).any())
                            both_weak += max(mx1, mx2) < 0.6 and max(my1, my2) < 0.6
    res.append(dict(model=os.path.basename(path), points_two_peaked_on_both_axes=n_bi,
                    fraction_decoded_off_both_strokes=off / max(n_bi, 1),
                    fraction_of_those_where_another_pairing_lands_on_a_stroke=fixable / max(off, 1),
                    fraction_of_those_with_near_equal_peaks=both_weak / max(off, 1)))
print(json.dumps(res, indent=1))
json.dump(res, open(os.path.join(HERE, "results_pairing.json"), "w"), indent=1)
