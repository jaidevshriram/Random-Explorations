# Per-shape colour fit: read the id render, keep interior pixels of each shape,
# and give that shape the reference's mean colour over them.
import sys, numpy as np
from PIL import Image
ref = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(np.int64); pr = np.asarray(Image.open(sys.argv[2]).convert('RGBA')).astype(np.int64)
ids = (pr[..., 0] << 16) | (pr[..., 1] << 8) | pr[..., 2]; ids[(pr[..., 3] < 255) | (ids > 20000)] = 0
same = np.ones(ids.shape, bool)
for dy in (-1, 0, 1):
    for dx in (-1, 0, 1): same &= (np.roll(np.roll(ids, dy, 0), dx, 1) == ids)
ids = np.where(same, ids, 0)
n = int(ids.max()) + 1; flat = ids.ravel(); cnt = np.bincount(flat, minlength=n)
sums = [np.bincount(flat, weights=ref[..., k].ravel(), minlength=n) for k in range(3)]
fit = []
for i in range(1, n):
    fit.append('"#%02x%02x%02x"' % tuple(int(round(sums[k][i] / cnt[i])) for k in range(3)) if cnt[i] >= 24 else 'null')
open(sys.argv[3], 'w').write('// Fitted fill colours, one per fill call in study.html, in order. Generated; see study.html.\nwindow.STUDY_FIT = [' + ','.join(fit) + '];\n')
print('fitted', sum(f != 'null' for f in fit), 'of', len(fit), 'fills')
