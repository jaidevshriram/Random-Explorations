# Impact frames for the music video: at a few big hits, two frames are replaced by stark,
# hand-drawn-style flashes (a negative with radial speed lines, then a white-on-black cut-out),
# with a prismatic colour split. Frames are replaced, never inserted, so the audio stays in sync.
# python3 impact.py song.json src_dir out_dir orb_x orb_y
import sys, os, json, math, random
import numpy as np
from PIL import Image, ImageDraw

cue_p, src, out, ox, oy = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4]), float(sys.argv[5])
C = json.load(open(cue_p))
FPS = 15
peak = max(C['sections'], key=lambda s: s['energy'])
db = [t for t in C['downbeats'] if t >= peak['t0'] - 0.05]
hits = [peak['t0']]
if len(db) > 16: hits.append(db[16])          # the phrase change 16 bars into the peak
hits.append(peak['t1'])                         # the cut out of the peak
frames = {}
for k, t in enumerate(hits):
    f = math.ceil(t * FPS - 1e-6)
    frames[f] = ('neg', k)
    frames[f + 1] = ('cut', k)

def lines(d, w, h, col, seed, n=80):
    rnd = random.Random(seed)
    for _ in range(n):
        a = rnd.random() * 2 * math.pi
        r0 = rnd.uniform(200, 480)
        wd = rnd.uniform(0.004, 0.02)
        r1 = 2400
        pts = [(ox + math.cos(a - wd * 0.15) * r0, oy + math.sin(a - wd * 0.15) * r0),
               (ox + math.cos(a + wd * 0.15) * r0, oy + math.sin(a + wd * 0.15) * r0),
               (ox + math.cos(a + wd) * r1, oy + math.sin(a + wd) * r1),
               (ox + math.cos(a - wd) * r1, oy + math.sin(a - wd) * r1)]
        d.polygon(pts, fill=col)

def impact(path, kind, seed):
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    L = a @ np.array([0.299, 0.587, 0.114], np.float32)
    if kind == 'neg':
        # posterised negative, banded by the frame's own brightness so a near-white flash still
        # leaves shapes: the brightest light goes black, the glow grey, the rest paper-white
        hi, mid = np.percentile(L, 88), np.percentile(L, 60)
        n = np.where(L > hi, 0, np.where(L > mid, 150, 255)).astype(np.uint8)
        col = 0
    else:
        n = np.where(L > np.percentile(L, 72), 255, 0).astype(np.uint8)
        col = 255
    im = Image.fromarray(n, 'L')
    lines(ImageDraw.Draw(im), im.width, im.height, col, seed)
    m = np.asarray(im)
    # a prism's colour split: red one way, blue the other
    out_rgb = np.stack([np.roll(m, 7, axis=1), m, np.roll(m, -7, axis=1)], -1)
    return Image.fromarray(out_rgb, 'RGB')

os.makedirs(out, exist_ok=True)
names = sorted(f for f in os.listdir(src) if f.endswith('.jpg'))
for nm in names:
    f = int(nm[1:5])
    dst = os.path.join(out, nm)
    if os.path.lexists(dst): os.remove(dst)
    if f in frames:
        kind, k = frames[f]
        impact(os.path.join(src, nm), kind, 100 + k).save(dst, quality=94)
    else:
        os.symlink(os.path.abspath(os.path.join(src, nm)), dst)
print('impact frames at', sorted(frames), 'times', [round(t, 2) for t in hits])
