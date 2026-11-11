import sys, numpy as np, torch
sys.path.insert(0, '.')
import av2_train as at, maptr_faithful as mf
torch.set_num_threads(1)
d = np.load('av2_patches.npz', allow_pickle=True)
va_img, va_lab = d['va_img'][:150], d['va_lab'][:150]
va_raw = [[at.mf_target_m(o) for o in os_] for os_ in d['va_orders'][:150]]
for head in ['l1', 'bins']:
    m = at.AV2MapTR(head); m.load_state_dict(torch.load(f'models/runs_av2_pilot_{head}_s0.pt')); m.eval()
    with torch.no_grad():
        outs = m(torch.as_tensor(va_img, dtype=torch.float32) / 255.0)
    for l in (0, 2, 5):
        o = outs[l]; prob = o['logits'].sigmoid().numpy(); pts = at.to_metres(o['pts'].numpy())
        per = {c: [] for c in range(3)}
        for i in range(len(va_img)):
            for g, c in zip(va_raw[i], va_lab[i]):
                cand = [q for q in range(at.N_Q) if prob[i, q, c] > 0.3]
                if cand: per[c].append(min(at.chamfer_m(pts[i, q], g) for q in cand))
        s = ' '.join(f"{at.CLASSES[c]} med {np.median(v) if v else float('nan'):.2f}m n{len(v)}" for c, v in per.items())
        extra = ''
        if head == 'bins':
            p = o['bins'].softmax(-1)
            pk = p.argmax(-1, keepdim=True); idx = torch.arange(p.shape[-1])
            near = (p * ((idx - pk).abs() <= 1)).sum(-1)
            extra = f" | mass within 1 bin of peak {near.mean():.2f}"
        print(head, 'layer', l, s, extra)
