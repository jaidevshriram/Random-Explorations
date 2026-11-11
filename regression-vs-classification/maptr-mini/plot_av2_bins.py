"""Figure: what the AV2 bin head's outputs and labels look like (plots/av2_bins.png).

Top: one validation patch; ground truth, L1 predictions and bin-head predictions (8k-step models, seed 0).
Bottom: for one point of a divider and of a pedestrian crossing, the x and y training label (HL-Gauss over 128
bins) next to what the bin head predicts.
"""
import os

import matplotlib
import numpy as np
import torch

matplotlib.use("Agg")
import matplotlib.pyplot as plt

import av2_train as at
import maptr_faithful as mf

HERE = os.path.dirname(os.path.abspath(__file__))
torch.set_num_threads(4)
d = np.load(os.path.join(HERE, "av2_patches.npz"), allow_pickle=True)
models = {}
for h in ("l1", "bins"):
    m = at.AV2MapTR(h)
    m.load_state_dict(torch.load(os.path.join(HERE, "models", f"runs_av2_long_{h}_s0.pt")))
    m.eval()
    models[h] = m

# a patch with all three classes
i = next(i for i in range(len(d["va_lab"])) if set(d["va_lab"][i]) == {0, 1, 2} and len(d["va_lab"][i]) >= 6)
img = torch.as_tensor(d["va_img"][i:i + 1], dtype=torch.float32) / 255.0
gts = [at.mf_target_m(o) for o in d["va_orders"][i]]
labs = d["va_lab"][i]
with torch.no_grad():
    outs = {h: m(img)[-1] for h, m in models.items()}

col = {0: "tab:orange", 1: "tab:blue", 2: "tab:green"}
fig = plt.figure(figsize=(15, 9))
gs = fig.add_gridspec(2, 4, height_ratios=[1, 1])
top = gs[0, :].subgridspec(1, 3)
for k, (title, h) in enumerate([("ground truth (20 points per element)", None), ("L1 head", "l1"), ("bin head (128 bins per coordinate)", "bins")]):
    ax = fig.add_subplot(top[0, k])
    ax.imshow(d["va_img"][i].transpose(1, 2, 0).max(-1), cmap="Greys", alpha=0.25, extent=[-30, 30, -15, 15], origin="lower")
    if h is None:
        for g, l in zip(gts, labs):
            ax.plot(g[:, 0], g[:, 1], "o-", ms=2, color=col[l])
    else:
        o = outs[h]
        prob, pts = o["logits"].sigmoid()[0].numpy(), at.to_metres(o["pts"][0].numpy())
        for q in range(at.N_Q):
            c = int(prob[q].argmax())
            if prob[q, c] > 0.3:
                ax.plot(pts[q, :, 0], pts[q, :, 1], "o-", ms=2, color=col[c])
    ax.set_title(title, fontsize=10)
    ax.set_xlim(-30, 30), ax.set_ylim(-15, 15), ax.set_aspect("equal")
    ax.set_xlabel("x (m, forward)")

# histograms: best-matching bin query for one divider and one ped crossing
o = outs["bins"]
prob, pts, bins = o["logits"].sigmoid()[0].numpy(), at.to_metres(o["pts"][0].numpy()), o["bins"][0].softmax(-1).numpy()
centers = mf.bin_centers().numpy()
slot = 0
for cls in (0, 1):
    g_idx = [j for j, l in enumerate(labs) if l == cls][0]
    g = gts[g_idx]
    q = min(range(at.N_Q), key=lambda q: at.chamfer_m(pts[q], g) if prob[q, cls] > 0.1 else np.inf)
    j = 5
    p_pred = pts[q, j]
    nearest = g[np.argmin(np.linalg.norm(g - p_pred, axis=1))]  # the GT point this predicted point is nearest to
    tgt_u = torch.as_tensor([(nearest[0] + 30) / 60, (nearest[1] + 15) / 30], dtype=torch.float32)
    lab = mf.hl_gauss(tgt_u).numpy()
    for ax_i, (axis, span, off) in enumerate([("x", 60, -30), ("y", 30, -15)]):
        ax = fig.add_subplot(gs[1, slot])
        slot += 1
        m = centers * span + off
        ax.bar(m, lab[ax_i], width=span / 128, color="0.6", label="HL-Gauss label of the nearest GT point")
        ax.bar(m, bins[q, j, ax_i], width=span / 128, color=col[cls], alpha=0.7, label="bin head prediction")
        ax.axvline(p_pred[ax_i], color="k", lw=1, ls="--", label="decoded value")
        lo = nearest[ax_i] - 6
        ax.set_xlim(lo, lo + 12)
        ax.set_title(f"{at.CLASSES[cls]}, point {j}: {axis} ({span / 128:.2f} m per bin)", fontsize=10)
        ax.set_xlabel(f"{axis} (m)")
        if slot == 1:
            ax.legend(fontsize=8)
fig.suptitle("Bin head on AV2: across a divider (y) the histogram is as sharp as the label; along it (x) it is broad, because nothing\n"
             "marks where point 5 sits on a straight line. Pedestrian crossings: x and y are picked independently, so the polygons zigzag.", fontsize=11)
fig.tight_layout()
os.makedirs(os.path.join(HERE, "plots"), exist_ok=True)
fig.savefig(os.path.join(HERE, "plots", "av2_bins.png"), dpi=110)
print("patch", i)
