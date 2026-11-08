"""Mechanism check for experiment 2 (double lines), using the saved seed-0 models.

For every matched open-curve prediction on the validation set, measure the Chamfer distance (px) to
the nearest stroke and to the midline between the two strokes. A prediction "on a stroke" is what
bins should do; "in the middle" is what averaging (L1/L2) does. Also reports AP per class.

    python analyze_predictions.py      # needs models/runs_vis_{l1,bins}_s0.pt  (mini_maptr.py --save-models)
"""
import json
import os

import numpy as np
import torch

import mini_maptr as mm

HERE = os.path.dirname(os.path.abspath(__file__))


def load(head):
    m = mm.MiniMapTR(head)
    m.load_state_dict(torch.load(os.path.join(HERE, "models", f"runs_vis_{head}_s0.pt")))
    return m.eval()


@torch.no_grad()
def predict(model, imgs):
    outs = []
    for s in range(0, len(imgs), 100):
        out = model(torch.as_tensor(imgs[s:s + 100], dtype=torch.float32)[:, None] / 255.0)[-1]
        prob = out["logits"].softmax(-1)
        outs.append((prob, out["pts"]))
    prob = torch.cat([o[0] for o in outs])
    pts = torch.cat([o[1] for o in outs])
    return prob.numpy(), pts.numpy()


def main():
    d = np.load(os.path.join(HERE, "data_amb.npz"), allow_pickle=True)
    imgs, labels, alts = d["va_img"], d["va_lab"], d["va_alt"]
    report, examples = {}, {}
    for head in ("l1", "bins"):
        prob, pts = predict(load(head), imgs)
        # AP per class, as in mini_maptr.evaluate
        ap = {}
        for c, name in enumerate(mm.CLASSES):
            preds = [(i, float(prob[i, q, c]), pts[i, q]) for i in range(len(imgs)) for q in range(pts.shape[1])
                     if prob[i, q, :-1].argmax() == c]
            gts = {i: [a for a, l in zip(alts[i], labels[i]) if l == c] for i in range(len(imgs))}
            ap[name] = {f"{t:g}px": mm.average_precision(preds, gts, t) for t in (1.0, 2.0, 3.0)}
        # stroke vs midline for open curves: for each GT double line, the best-scoring open prediction near it
        on_stroke, d_stroke, d_mid = [], [], []
        ex = []
        for i in range(len(imgs)):
            for a, l in zip(alts[i], labels[i]):
                if l != 0:
                    continue
                mid = a.mean(0)
                cand = [q for q in range(pts.shape[1]) if prob[i, q, :-1].argmax() == 0 and prob[i, q, 0] > 0.3]
                if not cand:
                    continue
                q = min(cand, key=lambda q: min(mm.chamfer_px(pts[i, q], s) for s in list(a) + [mid]))
                ds = min(mm.chamfer_px(pts[i, q], s) for s in a)
                dm = mm.chamfer_px(pts[i, q], mid)
                d_stroke.append(ds), d_mid.append(dm), on_stroke.append(ds < dm)
                ex.append((i, q))
        report[head] = {
            "AP": ap,
            "open_curves_matched": len(on_stroke),
            "fraction_closer_to_a_stroke_than_to_the_midline": float(np.mean(on_stroke)),
            "median_px_to_nearest_stroke": float(np.median(d_stroke)),
            "median_px_to_midline": float(np.median(d_mid)),
        }
        examples[head] = {"pts": pts, "ex": ex}
    print(json.dumps(report, indent=1))
    with open(os.path.join(HERE, "results_mechanism.json"), "w") as f:
        json.dump(report, f, indent=1)
    # example predictions for the video: images with exactly one open curve, both models detected it
    keep = []
    for i in range(len(imgs)):
        if list(labels[i]).count(0) == 1 and len(keep) < 6:
            ql = [q for (j, q) in examples["l1"]["ex"] if j == i]
            qb = [q for (j, q) in examples["bins"]["ex"] if j == i]
            if ql and qb:
                k = list(labels[i]).index(0)
                keep.append({"img": i, "strokes": alts[i][k].tolist(),
                             "l1": examples["l1"]["pts"][i, ql[0]].tolist(), "bins": examples["bins"]["pts"][i, qb[0]].tolist()})
    with open(os.path.join(HERE, "examples_amb.json"), "w") as f:
        json.dump(keep, f)


if __name__ == "__main__":
    main()
