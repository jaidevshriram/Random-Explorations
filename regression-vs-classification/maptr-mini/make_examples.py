"""Figures for the MapTR-faithful double-line experiment (seed-0 models).

  plots/examples_random.png    6 validation images picked at random (seeded, not cherry-picked):
                               L1 prediction vs bin prediction next to the two acceptable strokes
  plots/bin_labels.png         what the bin head is trained on for one point, the best possible prediction,
                               and what it actually predicts (a double-line point and a closed-loop point)
"""
import os

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import torch

import maptr_faithful as mf
import mini_maptr as mm

HERE = os.path.dirname(os.path.abspath(__file__))
S, K = mm.S, mf.K_BINS
C_L1, C_BIN, C_GT = "#d62728", "#1f77b4", "#2ca02c"


def load(head):
    mf.K_ONE2MANY = 0
    m = mf.FaithfulMapTR(head, d=64)
    m.load_state_dict(torch.load(os.path.join(HERE, "models", f"runs_f_amb_{head}_s0.pt")))
    return m.eval()


@torch.no_grad()
def run(model, img):
    out = model(torch.as_tensor(img, dtype=torch.float32)[None, None] / 255.0)[-1]
    o = {"prob": out["logits"].sigmoid()[0].numpy(), "pts": out["pts"][0].numpy()}
    if "bins" in out:
        o["bins"] = out["bins"].softmax(-1)[0].numpy()
    return o


def detections(o, thr=0.3):
    return [(q, int(o["prob"][q].argmax())) for q in range(mf.N_ONE2ONE) if o["prob"][q].max() > thr]


def draw_gt(ax, alts, labels):
    for a, l in zip(alts, labels):
        for k, s in enumerate(a):
            pts = np.vstack([s, s[:1]]) if l == 1 else s
            ax.plot(pts[:, 0] * S, pts[:, 1] * S, color=C_GT, lw=1.2, alpha=0.9, ls="-" if k == 0 else "--")


def draw_pred(ax, o, color):
    for q, c in detections(o):
        p = o["pts"][q] * S
        if c == 1:
            p = np.vstack([p, p[:1]])
        ax.plot(p[:, 0], p[:, 1], "-", color=color, lw=1.0)
        ax.plot(p[:, 0], p[:, 1], "o", color=color, ms=2.2)


def fig_random(models, d):
    imgs, labels, alts = d["va_img"], d["va_lab"], d["va_alt"]
    rng = np.random.default_rng(2026)
    pick = [i for i in rng.permutation(len(imgs)) if 0 in list(labels[i])][:6]
    fig, axes = plt.subplots(3, 4, figsize=(14, 10.8))
    for k, i in enumerate(pick):
        for j, (head, color) in enumerate((("l1", C_L1), ("bins", C_BIN))):
            ax = axes.flat[2 * k + j]
            ax.imshow(imgs[i], cmap="gray", vmin=0, vmax=255, extent=(0, S, S, 0), alpha=0.55)
            draw_gt(ax, alts[i], labels[i])
            draw_pred(ax, run(models[head], imgs[i]), color)
            ax.set(xticks=[], yticks=[], title=f"val #{i}: {'L1 (MapTR)' if head == 'l1' else 'bins'}")
            ax.title.set_color(color)
    fig.suptitle("Randomly chosen validation images (double-line data). Green: the acceptable answers (open curves: "
                 "both strokes, solid and dashed).\nRed: L1 prediction. Blue: bin prediction (decoded). Dots = the 20 "
                 "predicted points.", fontsize=11)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "plots", "examples_random.png"), dpi=130)
    plt.close(fig)
    return pick


def peaks(p, sep=4):
    c = (np.arange(len(p)) + 0.5) / len(p)
    i = int(p.argmax())
    j = int(np.where(np.abs(np.arange(len(p)) - i) >= sep, p, -1).argmax())
    pos = lambda m: float((p[max(0, m - 2):m + 3] * c[max(0, m - 2):m + 3]).sum() / p[max(0, m - 2):m + 3].sum())
    return pos(i), pos(j)


def nearest_on(line, p):
    a, b = line[:-1], line[1:]
    ab = b - a
    t = np.clip(((p - a) * ab).sum(-1) / (ab ** 2).sum(-1), 0, 1)
    proj = a + t[:, None] * ab
    return proj[np.argmin(np.linalg.norm(proj - p, axis=1))]


def find_ghost(model, d):
    """First validation point (in order) that is two-peaked on both axes and decoded > 1 px from both strokes."""
    imgs, labels, alts = d["va_img"], d["va_lab"], d["va_alt"]
    for i in range(len(imgs)):
        if list(labels[i]).count(0) != 1:
            continue
        a = alts[i][list(labels[i]).index(0)]
        o = run(model, imgs[i])
        for q, c in detections(o):
            if c != 0:
                continue
            for j in range(mf.P):
                p = o["pts"][q, j]
                da = np.linalg.norm(p - nearest_on(a[0], p)) * S
                db = np.linalg.norm(p - nearest_on(a[1], p)) * S
                bx, by = o["bins"][q, j, 0], o["bins"][q, j, 1]
                two = all(np.sort(h)[-1] < 0.5 and h[np.abs(np.arange(K) - h.argmax()) >= 4].max() > 0.05
                          for h in (bx, by))
                if min(da, db) > 1.5 and two and min(da, db) < 4:
                    return i, q, j, o, a
    return None


def pick_point(model, d, cls):
    """First validation element of class cls (0 open, 1 closed) with a confident detection; its middle point."""
    imgs, labels, alts = d["va_img"], d["va_lab"], d["va_alt"]
    for i in range(len(imgs)):
        if list(labels[i]).count(cls) != 1:
            continue
        a = alts[i][list(labels[i]).index(cls)]
        o = run(model, imgs[i])
        dets = [q for q, c in detections(o, 0.5) if c == cls]
        if dets:
            q = min(dets, key=lambda q: min(mm.chamfer_px(o["pts"][q], s) for s in a))
            return i, q, mf.P // 2, o, a
    return None


def fig_labels(models, d):
    imgs = d["va_img"]
    c = (np.arange(K) + 0.5) / K
    w = S / K
    fig, axes = plt.subplots(2, 3, figsize=(16, 8.6), gridspec_kw={"width_ratios": [1, 1.4, 1.4]})
    for row, cls in enumerate((0, 1)):
        i, q, j, o, a = pick_point(models["bins"], d, cls)
        p = o["pts"][q, j]
        targets = [nearest_on(s, p) for s in a]  # the acceptable answers for this point
        ax = axes[row, 0]
        ax.imshow(imgs[i], cmap="gray", vmin=0, vmax=255, extent=(0, S, S, 0))
        for k, s in enumerate(a):
            ss = np.vstack([s, s[:1]]) if cls == 1 else s
            ax.plot(ss[:, 0] * S, ss[:, 1] * S, color=C_GT, lw=1, ls="-" if k == 0 else "--")
        for k, t in enumerate(targets):
            ax.plot(t[0] * S, t[1] * S, "o" if k == 0 else "s", color=C_GT, mfc=C_GT if k == 0 else "none", ms=8,
                    label="label, stroke A" if (cls == 0 and k == 0) else "label, stroke B" if cls == 0 else "label")
        ax.plot(p[0] * S, p[1] * S, "x", color=C_BIN, ms=10, mew=2.5, label="bin head's decoded point")
        lo, hi = p * S - 7, p * S + 7
        ax.set(xlim=(lo[0], hi[0]), ylim=(hi[1], lo[1]),
               title=f"val #{i}: {'double line (2 right answers)' if cls == 0 else 'closed loop (1 right answer)'}")
        ax.legend(fontsize=7, loc="lower left")
        for k, name in enumerate(("x", "y")):
            ax = axes[row, 1 + k]
            labs = [mf.hl_gauss(torch.tensor(float(t[k]))).numpy() for t in targets]
            ideal = np.mean(labs, 0)
            h = o["bins"][q, j, k]
            ctr = int(np.mean([l.argmax() for l in labs]))
            sl = slice(max(0, ctr - 18), min(K, ctr + 19))
            xs = c[sl] * S
            if cls == 0:
                ax.bar(xs, labs[0][sl], width=w * 0.9, color=C_GT, alpha=0.45, label="label if stroke A")
                ax.bar(xs, labs[1][sl], width=w * 0.9, color="none", edgecolor=C_GT, hatch="//", label="label if stroke B")
                ax.plot(xs, ideal[sl], "--", color="k", lw=1.5, label="best possible prediction (50/50 mix)")
            else:
                ax.bar(xs, labs[0][sl], width=w * 0.9, color=C_GT, alpha=0.45, label="label (HL-Gauss, σ = 0.75 bin)")
            ax.plot(xs, h[sl], "-o", color=C_BIN, ms=3, lw=2, label="bin head's prediction")
            ax.axvline(p[k] * S, color=C_BIN, ls=":", lw=2, label="decoded value")
            ax.set(xlabel=f"{name} (px); one bar = one bin = 0.5 px", ylabel="probability", title=f"{name} coordinate")
            ax.legend(fontsize=7)
    fig.suptitle("Bin labels vs bin predictions (MapTR-faithful bin head, seed 0). Each point's label is a narrow bump "
                 "per axis.\nTop: on a double line the label is stroke A or B at random, so the best prediction is two "
                 "narrow peaks; the model instead predicts one broad bump.\nBottom: on a closed loop (one answer) the "
                 "prediction is a single, sharper peak.", fontsize=10)
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "plots", "bin_labels.png"), dpi=130)
    plt.close(fig)


if __name__ == "__main__":
    d = np.load(os.path.join(HERE, "data_f_amb.npz"), allow_pickle=True)
    models = {h: load(h) for h in ("l1", "bins")}
    print("random examples:", fig_random(models, d))
    fig_labels(models, d)
