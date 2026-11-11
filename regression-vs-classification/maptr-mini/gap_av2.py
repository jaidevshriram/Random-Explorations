"""Train vs validation median Chamfer (m) of the AV2 pilot models: is the bin head's deficit a generalisation gap?"""
import json, numpy as np, torch
import av2_train as at
torch.set_num_threads(4)
d = np.load('av2_patches.npz', allow_pickle=True)
def med(model, img, lab, ords):
    raw = [[at.mf_target_m(o) for o in os_] for os_ in ords]
    prob, pts = at.predict(model, img); pts = at.to_metres(pts)
    ch = [min([at.chamfer_m(pts[i, q], g) for q in range(at.N_Q) if prob[i, q, c] > 0.3] or [np.inf]) for i in range(len(img)) for g, c in zip(raw[i], lab[i])]
    return float(np.median(ch))
res = {}
for run, heads in [('runs_av2_pilot', ['l1', 'bins', 'rbins'])]:
    for h in heads:
        m = at.AV2MapTR(h); m.load_state_dict(torch.load(f'models/{run}_{h}_s0.pt'))
        res[h] = dict(train=med(m, d['tr_img'][:300], d['tr_lab'][:300], d['tr_orders'][:300]),
                      val=med(m, d['va_img'][:300], d['va_lab'][:300], d['va_orders'][:300]))
        print(h, res[h], flush=True)
json.dump(res, open('results_av2_gap.json', 'w'), indent=1)
