"""Sanity check: can each head memorise 8 fixed AV2 patches? Reports median Chamfer (m) on those same patches."""
import sys, math, numpy as np, torch, torch.nn as nn
import av2_train as at
head, steps, w = sys.argv[1], int(sys.argv[2]), float(sys.argv[3])
torch.set_num_threads(1); torch.manual_seed(0); rng = np.random.default_rng(0)
d = np.load('av2_patches.npz', allow_pickle=True)
idx = np.arange(8)
img, lab, ords = d['tr_img'][idx], d['tr_lab'][idx], d['tr_orders'][idx]
raw = [[at.mf_target_m(o) for o in os_] for os_ in ords]
m = at.AV2MapTR(head); opt = torch.optim.AdamW(m.parameters(), lr=6e-4, weight_decay=0.01)
x = torch.as_tensor(img, dtype=torch.float32) / 255.0
for s in range(1, steps + 1):
    loss = at.loss_fn(m(x), list(lab), [at.pick_orders(o, rng) for o in ords], head, w)
    opt.zero_grad(); loss.backward(); nn.utils.clip_grad_norm_(m.parameters(), 35.0); opt.step()
    if s % 100 == 0:
        m.eval()
        with torch.no_grad():
            o = m(x)[-1]
        m.train()
        prob, pts = o['logits'].sigmoid().numpy(), at.to_metres(o['pts'].numpy())
        ch = [min(at.chamfer_m(pts[i, q], g) for q in range(at.N_Q) if prob[i, q, c] >= np.sort(prob[i, :, c])[-len(lab[i])]) for i in range(8) for g, c in zip(raw[i], lab[i])]
        print(f"{head} w{w} step {s} loss {float(loss):.2f} median chamfer {np.median(ch):.2f} m", flush=True)
