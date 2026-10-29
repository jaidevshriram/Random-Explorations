"""Turn pooled SAM masks into a piece hierarchy and a piece-level partition.

    python pieces.py masks_a.npz [masks_b.npz ...]  -> pieces.npz + review images
"""

import sys

import cv2
import numpy as np

D = "/tmp/claude-0/-home-user-Random-Explorations/e6f36c93-02ea-587f-a087-8233594dcd55/scratchpad/sam/"
img = cv2.imread("/home/user/Random-Explorations/image-recon-bench/images/lego_r19.png")
H, W = img.shape[:2]
fg = img.min(2) < 245

ms, src, pname = [], [], []
for f in sys.argv[1:]:
    z = np.load(D + f)
    for n_, m in enumerate(z["masks"]):
        ms.append(m & fg)
        src.append(f)
        pname.append(str(z["names"][n_]) if "names" in z.files else "")
ms = np.stack(ms)
forced = np.array([s_.startswith("chosen") for s_ in src])
pname = np.array(pname)
area = ms.reshape(len(ms), -1).sum(1).astype(np.float64)
keep = area >= 20
ms, area, forced, pname = ms[keep], area[keep], forced[keep], pname[keep]

# de-duplicate near-identical masks (IoU > 0.9) across runs
small = ms[:, ::2, ::2].reshape(len(ms), -1).astype(np.float32)
inter = small @ small.T
a2 = small.sum(1)
iou = inter / (a2[:, None] + a2[None] - inter + 1e-6)
order = np.argsort(-area)
dup = np.zeros(len(ms), bool)
for i in range(len(ms)):
    if dup[i]:
        continue
    same = (iou[i] > 0.9) & ~dup
    same[i] = False
    dup |= same & (area <= area[i]) & ~forced
ms, area, inter, a2, forced, pname = ms[~dup], area[~dup], inter[~dup][:, ~dup], a2[~dup], forced[~dup], pname[~dup]
n = len(ms)
contain = inter / (a2[:, None] + 1e-6)  # contain[i, j] = share of i inside j

# parent = smallest clearly larger mask that contains it
parent = np.full(n, -1)
for i in range(n):
    cands = [j for j in range(n) if j != i and area[j] > 1.2 * area[i] and contain[i, j] > 0.85]
    if cands:
        parent[i] = min(cands, key=lambda j: area[j])
children = {j: [i for i in range(n) if parent[i] == j] for j in range(n)}
kid_cover = np.array([sum(area[i] for i in children[j]) / area[j] for j in range(n)])
assembly = (((kid_cover > 0.5) & (np.array([len(children[j]) for j in range(n)]) >= 2)) | (area > 60000)) & ~forced
is_piece = np.array([not assembly[i] and (forced[i] or parent[i] < 0 or assembly[parent[i]]) for i in range(n)])
# a mask inside a hand-chosen piece is a sub-part of it (studs on the roof plate), not a piece
for i in range(n):
    if is_piece[i] and not forced[i] and parent[i] >= 0 and forced[parent[i]]:
        is_piece[i] = False
print(f"{n} unique masks: {assembly.sum()} assemblies, {is_piece.sum()} pieces, {n - assembly.sum() - is_piece.sum()} sub-parts")

# partition at piece level: smaller pieces win where pieces overlap
lab = np.full((H, W), -1, np.int32)
pieces = np.flatnonzero(is_piece)
for i in pieces[np.argsort(-area[pieces])]:
    lab[ms[i]] = i
print("foreground covered by pieces: %.1f%%" % (100 * ((lab >= 0) & fg).sum() / fg.sum()))
np.savez_compressed(D + "pieces.npz", masks=ms, area=area, parent=parent, assembly=assembly, is_piece=is_piece, lab=lab, names=pname, forced=forced)

# review images: pieces in random colours with their index, uncovered foreground in magenta hatching
rng = np.random.default_rng(3)
pal = rng.integers(50, 230, (n, 3))
vis = np.where(lab[..., None] >= 0, pal[np.maximum(lab, 0)], 255).astype(np.uint8)
unc = fg & (lab < 0)
hatch = ((np.add.outer(np.arange(H), np.arange(W)) // 3) % 2 == 0)
vis[unc & hatch] = (255, 0, 255)
vis[unc & ~hatch] = img[unc & ~hatch]
edges = np.zeros((H, W), bool)
edges[:-1] |= lab[:-1] != lab[1:]
edges[:, :-1] |= lab[:, :-1] != lab[:, 1:]
vis[edges] = 0
blend = (0.35 * img + 0.65 * vis).astype(np.uint8)
big = cv2.resize(blend, None, fx=2, fy=2, interpolation=cv2.INTER_NEAREST)
for i in pieces:
    ys, xs = np.nonzero(lab == i)
    if len(ys) < 60:
        continue
    k = len(ys) // 2
    o = np.argsort(ys * W + xs)[k]
    cv2.putText(big, str(i), (int(xs[o]) * 2 - 6, int(ys[o]) * 2 + 4), cv2.FONT_HERSHEY_PLAIN, 0.8, (0, 0, 0), 2)
    cv2.putText(big, str(i), (int(xs[o]) * 2 - 6, int(ys[o]) * 2 + 4), cv2.FONT_HERSHEY_PLAIN, 0.8, (255, 255, 255), 1)
cv2.imwrite(D + "pieces_full.png", blend[100:700, 30:770])
for name, (x0, y0, x1, y1) in {"bucket": (80, 100, 360, 300), "boom": (260, 140, 490, 480), "cab": (440, 160, 670, 380),
                              "tracks": (380, 340, 680, 540), "plate": (30, 380, 760, 670)}.items():
    cv2.imwrite(D + f"review_{name}.png", big[2 * y0:2 * y1, 2 * x0:2 * x1])
