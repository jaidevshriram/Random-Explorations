import sys, numpy as np
from PIL import Image, ImageDraw
ref = np.asarray(Image.open(sys.argv[2]).convert('RGB'), dtype=np.float64)
img = Image.open(sys.argv[1]).convert('RGB')
if img.size != (ref.shape[1], ref.shape[0]): img = img.resize((ref.shape[1], ref.shape[0]), Image.LANCZOS)
out = np.asarray(img, dtype=np.float64)
err = (ref - out) ** 2
mse = err.mean(); psnr = 10 * np.log10(255 ** 2 / mse)
# SSIM with an 8x8 box window on luma
def luma(a): return a @ np.array([0.299, 0.587, 0.114])
def box(a, k=8):
    c = np.cumsum(np.cumsum(np.pad(a, ((1, 0), (1, 0))), 0), 1)
    return (c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]) / (k * k)
x, y = luma(ref), luma(out); mx, my = box(x), box(y)
vx, vy, cxy = box(x * x) - mx * mx, box(y * y) - my * my, box(x * y) - mx * my
C1, C2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
ssim = (((2 * mx * my + C1) * (2 * cxy + C2)) / ((mx * mx + my * my + C1) * (vx + vy + C2))).mean()
print(f'PSNR {psnr:.2f} dB   SSIM {ssim:.3f}   MSE {mse:.0f}')
# where the error is: tiles sorted by share of total error
TH, TW = 8, 14; h, w = ref.shape[0] // TH, ref.shape[1] // TW
tiles = [(err[r*h:(r+1)*h, c*w:(c+1)*w].sum(), r, c) for r in range(TH) for c in range(TW)]
tot = err.sum(); tiles.sort(reverse=True)
import os, sys
if os.environ.get('TILES'): print('worst tiles (x0,y0 share%):', '  '.join(f'({c*w},{r*h} {100*e/tot:.1f})' for e, r, c in tiles[:14]))
hm = np.clip(np.sqrt(err.mean(2)) * 2.2, 0, 255).astype(np.uint8)
Image.fromarray(hm).resize((836, 470)).save('heat.png')
