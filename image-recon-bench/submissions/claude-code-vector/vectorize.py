"""Semantic vectorization of lego_r19.

Unlike ../claude-code-session (drawn by eye), this entry reads the reference,
with one constraint: every path is a semantically cohesive piece of the scene
(a face of a part, a beam, a wheel, a gap), never free-floating primitives or
pixel-grid tracing. The SVG carries the semantic hierarchy

    object (bucket, boom, cab, body, tracks, base plate, red light)
      > material (yellow, black, gray, beige, brown, red)
        > shade (a shading level of that material within the object)
          > part (one connected region, one <path>)

as nested <g> groups and data-* attributes, so it can be inspected directly
(see viewer.html, built by build_viewer.py).

Pipeline:
1. Upsample the reference (U x) so outlines can land between pixels.
2. Give every pixel an object from hand-drawn object regions, then cluster
   shading levels within each object (k-means in Lab).
3. Trace each connected region of at least MIN_AREA pixels as one polygon.
4. Lay down each object's silhouette (windows and gaps cut out) with a fitted
   gradient, then stack its parts on top, shallowest first, so a part never
   hides one nested inside it. Larger parts get a fitted linear gradient.
5. Render an ownership map (which part is visible where) and refit every
   colour/gradient to the pixels it actually covers.

Traced contours run through the centres of boundary pixels, which in SVG sit at
+0.5, so the drawing is shifted half a (supersampled) pixel and every part is
stroked in its own colour (via currentColor) to cover its edge pixels.

    python submissions/claude-code-vector/vectorize.py > submissions/claude-code-vector/lego_r19.svg

Needs opencv-python-headless. Every tunable in P can be overridden from the
environment (e.g. U=1 KO=8); the defaults were picked by sweeping them against
the score.
"""

import io
import json
import os
import sys
from pathlib import Path

import cv2
import numpy as np
import resvg_py
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
P = {  # tunables (areas and lengths in original pixels)
    "U": 2, "KO": 12, "MIN_AREA": 4.0, "EPS": 0.3, "GRAD_AREA": 40.0, "HOLE_AREA": 60.0,
    "SW": 1.3, "REFIT": 2,
}
for k in P:
    if k in os.environ:
        P[k] = type(P[k])(os.environ[k])
U = P["U"]

src = cv2.imread(str(ROOT / "images" / "lego_r19.png"))
H0, W0 = src.shape[:2]
img = cv2.resize(src, (W0 * U, H0 * U), interpolation=cv2.INTER_CUBIC) if U > 1 else src
H, W = img.shape[:2]
yy, xx = np.mgrid[0:H, 0:W]
rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB).astype(np.float32)
flat = rgb.reshape(-1, 3)
lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
background = img.min(axis=2) >= 245
crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 50, 0.5)

# --- objects (hand-drawn, coarse regions in original pixels; first match wins) -------
OBJECTS = {
    "red-light": [(535, 170), (560, 170), (560, 200), (535, 200)],
    "bucket": [(85, 110), (320, 115), (350, 200), (345, 235), (275, 285), (85, 250)],
    "cab": [(460, 180), (630, 180), (630, 320), (495, 320), (470, 260)],
    "tracks": [(385, 400), (640, 360), (670, 400), (665, 455), (440, 530), (385, 520)],
    "body": [(390, 290), (650, 290), (660, 400), (385, 415)],
    "boom-and-grille": [(270, 190), (480, 190), (480, 470), (280, 470)],
    "base-plate": [(30, 400), (760, 400), (760, 680), (30, 680)],
}
ORDER = ["base-plate", "tracks", "body", "boom-and-grille", "cab", "bucket", "red-light"]  # bottom to top

pix_obj = np.full((H, W), -1, np.int32)
names = list(OBJECTS)
for oi, name in reversed(list(enumerate(names))):  # first listed wins
    m = np.zeros((H, W), np.uint8)
    cv2.fillPoly(m, [np.array(OBJECTS[name]) * U], 1)
    pix_obj[m.astype(bool)] = oi
tracks = pix_obj == names.index("tracks")
pix_obj[(pix_obj < 0) & (yy > 420 * U)] = names.index("base-plate")
pix_obj[pix_obj < 0] = names.index("boom-and-grille")
# beige/brown plate tones below the tractor belong to the plate, not whatever box covers them
warm = (hsv[..., 0] < 22) & (hsv[..., 1] < 140) & (hsv[..., 2] > 60) & (yy > 400 * U) & ~tracks
pix_obj[warm] = names.index("base-plate")


def material(c):
    """Name a colour by material."""
    r, g, b = (int(v) for v in c)
    mx, mn = max(r, g, b), min(r, g, b)
    sat = (mx - mn) / max(mx, 1)
    if r > 150 and g < 90 and b < 90:
        return "red"
    if sat < 0.18:
        return "black" if mx < 70 else "gray"
    if (r > 150 and g > 110 and sat > 0.55) or (sat > 0.75 and r > 120):
        return "yellow"
    return "beige" if mx > 180 else "brown"


# --- shades: k-means within each object ----------------------------------------------
labels = np.full((H, W), -1, np.int32)
shade_info = []  # per label: (object, material, shade name)
for oi, name in enumerate(names):
    sel = ~background & (pix_obj == oi)
    k = min(P["KO"], max(1, int(sel.sum()) // 50))
    cv2.setRNGSeed(0)
    _, lb, cen = cv2.kmeans(lab[sel], k, None, crit, 3, cv2.KMEANS_PP_CENTERS)
    crgb = cv2.cvtColor(cen.reshape(1, -1, 3).astype(np.uint8), cv2.COLOR_LAB2RGB)[0]
    mats = [material(c) for c in crgb]
    # shades numbered from lightest to darkest within each material of this object
    rank = {}
    for j in sorted(range(k), key=lambda j: -cen[j][0]):
        rank[j] = sum(1 for i in rank if mats[i] == mats[j]) + 1
    base = len(shade_info)
    labels[sel] = lb.ravel() + base
    shade_info += [(name, mats[j], f"{mats[j]}-{rank[j]}") for j in range(k)]


# --- geometry helpers ------------------------------------------------------------------
def path_data(c):
    """Closed polygon as compact SVG path data (absolute start, relative steps)."""
    out = f"M{int(c[0][0])},{int(c[0][1])}l"
    for i, ((a, b), (x, y)) in enumerate(zip(c[:-1], c[1:])):
        dx, dy = int(x - a), int(y - b)
        out += f"{'' if i == 0 or dx < 0 else ' '}{dx}{'' if dy < 0 else ','}{dy}"
    return out + "z"


def outline(region, eps):
    cs, _ = cv2.findContours(region, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c = cv2.approxPolyDP(max(cs, key=cv2.contourArea), eps, True).reshape(-1, 2)
    keep = np.any(c != np.roll(c, 1, axis=0), axis=1)
    return c[keep]


def hexcol(c):
    return "#%02x%02x%02x" % tuple(int(round(min(max(v, 0), 255))) for v in c)


def linear_gradient(idx, gid):
    """Least-squares colour ~ a + b*x + c*y over pixels idx, as a 2-stop
    <linearGradient> along the direction of steepest luminance change.
    Returns (rendered colours at idx, svg) or None."""
    px, x, y = flat[idx], xx.ravel()[idx] + 0.5, yy.ravel()[idx] + 0.5
    X = np.stack([np.ones(len(idx)), x, y], 1)
    coef, *_ = np.linalg.lstsq(X, px, rcond=None)
    g = coef[1:] @ np.array([0.3, 0.59, 0.11])
    if np.linalg.norm(g) < 1e-4:
        return None
    ux, uy = g / np.linalg.norm(g)
    proj = x * ux + y * uy
    p0, p1 = np.percentile(proj, 1), np.percentile(proj, 99)
    if p1 - p0 < 1:
        return None
    mx, my = x.mean(), y.mean()
    base = mx * ux + my * uy
    a = (mx + (p0 - base) * ux, my + (p0 - base) * uy)
    b = (mx + (p1 - base) * ux, my + (p1 - base) * uy)
    ca, cb = (np.clip(coef[0] + coef[1] * u + coef[2] * v, 0, 255) for u, v in (a, b))
    t = np.clip((proj - p0) / (p1 - p0), 0, 1)[:, None]
    # coordinates are in the drawing's frame, which is shifted by half a pixel
    svg = (f'<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="{a[0] - .5:.1f}" y1="{a[1] - .5:.1f}" '
           f'x2="{b[0] - .5:.1f}" y2="{b[1] - .5:.1f}"><stop stop-color="{hexcol(ca)}"/>'
           f'<stop offset="1" stop-color="{hexcol(cb)}"/></linearGradient>')
    return ca * (1 - t) + cb * t, svg


def fill_for(idx, gid, allow_grad):
    """Best flat or gradient fill for pixels idx: (svg fill value, def or None)."""
    mean = flat[idx].mean(axis=0)
    if allow_grad:
        g = linear_gradient(idx, gid)
        if g and ((flat[idx] - g[0]) ** 2).sum() < ((flat[idx] - mean) ** 2).sum():
            return f"url(#{gid})", g[1]
    return hexcol(mean), None


# --- parts -------------------------------------------------------------------------------
min_area, grad_area = P["MIN_AREA"] * U * U, P["GRAD_AREA"] * U * U
parts = []
for lbl, (obj, mat, shade) in enumerate(shade_info):
    num, comp, stats, _ = cv2.connectedComponentsWithStats((labels == lbl).astype(np.uint8), connectivity=8)
    for i in range(1, num):
        if stats[i, cv2.CC_STAT_AREA] < min_area:
            continue
        x0, y0, w, h = stats[i, :4]
        region = (comp[y0:y0 + h, x0:x0 + w] == i).astype(np.uint8)
        c = outline(region, P["EPS"] * U)
        if len(c) < 3:
            continue
        sub = np.flatnonzero(region)
        idx = (sub // w + y0) * W + (sub % w + x0)
        parts.append({"obj": obj, "mat": mat, "shade": shade, "poly": c + (x0, y0), "idx": idx,
                      "area": int(stats[i, cv2.CC_STAT_AREA])})

# Nesting depth: how many other parts' filled outlines cover this part. Parts are
# drawn shallowest first, so a part never hides one nested inside it.
cover = np.zeros((H, W), np.int16)
for p in parts:
    m = np.zeros((H, W), np.uint8)
    cv2.fillPoly(m, [p["poly"]], 1)
    cover += m
for p in parts:
    p["depth"] = int(np.median(cover.ravel()[p["idx"]])) - 1

# --- object underlays: silhouette with holes, gradient-filled ---------------------------
underlays = {}
for obj in ORDER:
    mask = np.zeros((H, W), np.uint8)
    for p in parts:
        if p["obj"] == obj:
            mask.ravel()[p["idx"]] = 1
    if not mask.any():
        continue
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    cs, _ = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    d = "".join(path_data(cv2.approxPolyDP(c, 1.5 * U, True).reshape(-1, 2))
                for c in cs if abs(cv2.contourArea(c)) >= P["HOLE_AREA"] * U * U)
    underlays[obj] = {"d": d, "idx": np.flatnonzero(mask)}

for n, p in enumerate(parts):
    p["id"] = f"{p['obj']}.{p['shade']}.{n}"
    p["d"] = path_data(p["poly"])
for p in parts:
    p["paint"] = fill_for(p["idx"], f"g{p['id']}", p["area"] >= grad_area)
for obj, u in underlays.items():
    u["paint"] = fill_for(u["idx"], f"u{obj}", True)


# --- emit -------------------------------------------------------------------------------
def paint_attr(paint, label_code=None):
    if label_code is not None:
        return f'color="#{label_code:06x}"'
    fill, _ = paint
    return f'fill="{fill}" stroke="{fill}"' if fill.startswith("url") else f'color="{fill}"'


def render(label=False):
    """The SVG. With label=True every part and underlay is painted in a unique
    id colour without antialiasing: an ownership map of who is visible where."""
    defs, body = [], []
    for oi, obj in enumerate(ORDER):
        if obj not in underlays:
            continue
        u = underlays[obj]
        code = 0xFF0000 + oi if label else None
        if not label and u["paint"][1]:
            defs.append(u["paint"][1])
        out = [f'<g id="{obj}" data-level="object">',
               f'<path data-role="silhouette" d="{u["d"]}" fill-rule="evenodd" {paint_attr(u["paint"], code)}/>']
        mine = [n for n, p in enumerate(parts) if p["obj"] == obj]
        mine.sort(key=lambda n: (parts[n]["depth"], -parts[n]["area"]))
        # consecutive parts of the same material share a <g data-level="material">
        cur = None
        for n in mine:
            p = parts[n]
            if p["mat"] != cur:
                if cur is not None:
                    out.append("</g>")
                out.append(f'<g data-level="material" data-material="{p["mat"]}">')
                cur = p["mat"]
            if not label and p["paint"][1]:
                defs.append(p["paint"][1])
            out.append(f'<path id="{p["id"]}" data-shade="{p["shade"]}" data-area="{p["area"] / U / U:g}" d="{p["d"]}" '
                       f'{paint_attr(p["paint"], n + 1 if label else None)}/>')
        if cur is not None:
            out.append("</g>")
        out.append("</g>")
        body.append("".join(out))
    head = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}">'
            f'<defs>{"".join(defs)}</defs><rect width="{W}" height="{H}" fill="#fff"/>')
    # half-pixel shift + self-coloured stroke: see the module docstring
    open_g = (f'<g transform="translate(.5 .5)" fill="currentColor" stroke="currentColor" '
              f'stroke-width="{P["SW"] * U}" stroke-linejoin="round"'
              + (' shape-rendering="crispEdges">' if label else ">"))
    return head + "\n" + open_g + "\n" + "\n".join(body) + "\n</g></svg>\n"


# --- colour refit from the ownership map ------------------------------------------------
for _ in range(P["REFIT"]):
    png = resvg_py.svg_to_bytes(svg_string=render(label=True))
    own = np.asarray(Image.open(io.BytesIO(bytes(png))).convert("RGB")).astype(np.int64)
    own = (own[..., 0] << 16 | own[..., 1] << 8 | own[..., 2]).ravel()
    order = np.argsort(own, kind="stable")
    ids = own[order]

    def owned(code):
        lo, hi = np.searchsorted(ids, [code, code + 1])
        return order[lo:hi]

    for n, p in enumerate(parts):
        px = owned(n + 1)
        if len(px) >= 3:
            p["paint"] = fill_for(px, f"g{p['id']}", p["area"] >= grad_area)
    for oi, obj in enumerate(ORDER):
        if obj in underlays:
            px = owned(0xFF0000 + oi)
            if len(px) >= 3:
                underlays[obj]["paint"] = fill_for(px, f"u{obj}", True)

svg = render()
sys.stdout.write(svg)
print(f"{len(parts)} parts, {sum(1 for p in parts if p['paint'][1])} gradients, {len(svg.encode())} bytes",
      file=sys.stderr)
if os.environ.get("META"):  # hierarchy summary for the viewer
    json.dump({"U": U, "shades": shade_info}, open(os.environ["META"], "w"))
