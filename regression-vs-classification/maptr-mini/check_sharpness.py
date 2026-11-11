"""Control for the 'two-peaked' diagnosis: how sharp are the bin head's histograms, and does the
two-peak test also fire on closed loops (one right answer)? Saved MapTR-faithful bin models, double-line val."""
import glob
import json
import os

import numpy as np
import torch

import maptr_faithful as mf
import mini_maptr as mm

HERE = os.path.dirname(os.path.abspath(__file__))
K = mf.K_BINS


def two_peaks(p, sep=4, mass=0.2):  # the test used in check_ghosts.py / check_pairing.py
    i = int(p.argmax())
    far = np.abs(np.arange(K) - i) >= sep
    j = int(np.where(far, p, -1).argmax())
    return p[max(0, i - 2):i + 3].sum() >= mass and p[max(0, j - 2):j + 3].sum() >= mass


def separated_peaks(p, gap_bins=6, min_rel=0.5):
    """Stricter: two local maxima >= gap_bins apart, the lower >= min_rel of the higher, with a dip between
    them below 60% of the lower peak."""
    sm = np.convolve(p, np.ones(3) / 3, mode="same")
    mx = [i for i in range(1, K - 1) if sm[i] >= sm[i - 1] and sm[i] > sm[i + 1]]
    mx = sorted(mx, key=lambda i: -sm[i])[:2]
    if len(mx) < 2:
        return False
    a, b = sorted(mx)
    lo = min(sm[a], sm[b])
    return b - a >= gap_bins and lo >= min_rel * max(sm[a], sm[b]) and sm[a:b + 1].min() < 0.6 * lo


d = np.load(os.path.join(HERE, "data_f_amb.npz"), allow_pickle=True)
imgs, labels, alts = d["va_img"], d["va_lab"], d["va_alt"]
label_mass = float(mf.hl_gauss(torch.tensor([0.5]))[0][63 - 1:64 + 2].sum())  # +-1 px of the peak, for a label
out = {"label_mass_within_1px": label_mass}
for path in sorted(glob.glob(os.path.join(HERE, "models", "runs_f_amb_bins_s*.pt"))):
    mf.K_ONE2MANY = 0
    model = mf.FaithfulMapTR("bins", d=64)
    model.load_state_dict(torch.load(path))
    model.eval()
    stats = {0: [], 1: []}
    with torch.no_grad():
        for s in range(0, len(imgs), 100):
            o = model(torch.as_tensor(imgs[s:s + 100], dtype=torch.float32)[:, None] / 255.0)[-1]
            prob, bins = o["logits"].sigmoid().numpy(), o["bins"].softmax(-1).numpy()
            for b in range(len(prob)):
                for q in range(mf.N_ONE2ONE):
                    c = int(prob[b, q].argmax())
                    if prob[b, q, c] < 0.3:
                        continue
                    for j in range(mf.P):
                        for ax in (0, 1):
                            h = bins[b, q, j, ax]
                            i = int(h.argmax())
                            stats[c].append((h[max(0, i - 2):i + 3].sum(), two_peaks(h), separated_peaks(h)))
    r = {}
    for c, name in ((0, "open (double lines)"), (1, "closed (one answer)")):
        a = np.array(stats[c], dtype=float)
        r[name] = {"histograms": len(a), "mass_within_1px_of_peak": float(a[:, 0].mean()),
                   "old_two_peak_test_fires": float(a[:, 1].mean()), "strict_two_peak_test_fires": float(a[:, 2].mean())}
    out[os.path.basename(path)] = r
print(json.dumps(out, indent=1))
json.dump(out, open(os.path.join(HERE, "results_sharpness.json"), "w"), indent=1)
