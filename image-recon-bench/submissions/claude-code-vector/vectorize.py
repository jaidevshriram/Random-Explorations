"""Semantic vectorization of lego_r19.

Unlike ../claude-code-session (drawn by eye), this entry reads the reference,
with one constraint: every path must be a semantically cohesive piece of the
scene, not pixel soup. The pipeline:

1. Give every pixel an object (bucket, boom, cab, body, tracks, base plate,
   red light) from hand-drawn object regions, then cluster shading levels
   within each object (k-means in Lab on a mean-shift smoothed copy, which
   flattens studs and holes but keeps part edges), and clean the result with a
   majority filter.
2. Trace each connected region as one polygon: a face, beam, wheel or gap.
3. Lay down each object's silhouette (windows and gaps cut out) with a fitted
   gradient, then keep the parts that remove the most squared error per byte
   against it, until the 32 KB budget is spent. Within an object, parts of the
   same shade share one <path>; large parts may get their own linear gradient.
   Parts with nothing nested inside them are drawn last, so they merge freely.
4. Render an ownership map (which part is visible where) and refit each
   shade to the pixels it actually covers.

Geometry detail that matters a lot: traced contours run through the centres of
boundary pixels, which in SVG sit at +0.5, so the drawing is shifted half a
pixel and every part is stroked in its own colour (via currentColor) to cover
its edge pixels. Path data is relative, uses h/v for axis-aligned steps and
lets minus signs act as separators.

The SVG has one <g> per object, one path per shade inside it.

    python submissions/claude-code-vector/vectorize.py > submissions/claude-code-vector/lego_r19.svg

Needs opencv-python-headless. Every tunable in P can be overridden from the
environment (e.g. KO=8 BLUR=1.2); the defaults were picked by sweeping them
against the score.
"""

import io
import os
import sys
from pathlib import Path

import cv2
import numpy as np
import resvg_py
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
P = {  # tunables, overridable from the environment for experiments
    "K": 10, "MODE": 1, "MIN_AREA": 4, "EPS": 1.1, "GRAD_AREA": 300, "HOLE_AREA": 60, "BUDGET": 32700, "SHADES": 12, "BLUR": 0.5, "MS_SP": 12, "MS_SR": 30, "KO": 8, "SW": 1.3, "REFIT": 1, "SMOOTH": 1, "LEAVES": 1,
}
for k in P:
    if k in os.environ:
        P[k] = type(P[k])(os.environ[k])

img = cv2.imread(str(ROOT / "images" / "lego_r19.png"))
H, W = img.shape[:2]
yy, xx = np.mgrid[0:H, 0:W]
rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB).astype(np.float32)
# Segmentation can run on an edge-preserving smoothed copy (mean shift), which
# flattens texture such as studs and holes while keeping part boundaries; fills
# always use the original colours.
seg_src = cv2.pyrMeanShiftFiltering(img, P["MS_SP"], P["MS_SR"]) if P["MS_SP"] else img
lab = cv2.cvtColor(seg_src, cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(np.float32)

# --- 1. materials + shading ---------------------------------------------------
background = img.min(axis=2) >= 245
fg = ~background.ravel()
crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 50, 0.5)
# Global clustering (used when KO == 0; with KO > 0 it is replaced per object below)
cv2.setRNGSeed(0)
_, lbl_fg, centers = cv2.kmeans(lab[fg], P["K"], None, crit, 3, cv2.KMEANS_PP_CENTERS)
labels = np.full(H * W, P["K"], np.int32)  # index K = background
labels[fg] = lbl_fg.ravel()
labels = labels.reshape(H, W)
centers_rgb = cv2.cvtColor(centers.reshape(1, -1, 3).astype(np.uint8), cv2.COLOR_LAB2RGB)[0]


def material(c):
    """Name a colour cluster by material and shading level."""
    r, g, b = (int(v) for v in c)
    mx, mn = max(r, g, b), min(r, g, b)
    sat = (mx - mn) / max(mx, 1)
    if r > 150 and g < 90 and b < 90:
        return "red"
    if sat < 0.18:
        return "black" if mx < 70 else "gray"
    if r > 150 and g > 110 and sat > 0.55:
        return "yellow"
    if sat > 0.75 and r > 120:
        return "yellow"
    if mx > 180:
        return "beige"
    return "brown"


mat_of = [material(c) for c in centers_rgb] + ["background"]

# --- 2. clean up: majority filter over cluster labels -------------------------
n = P["K"] + 1
votes = np.stack([cv2.boxFilter((labels == k).astype(np.float32), -1, (P["MODE"], P["MODE"]))
                  for k in range(n)])
labels = votes.argmax(axis=0)

# --- 3. object regions (hand-drawn, coarse) -----------------------------------
OBJECTS = {  # polygon per object; parts are assigned by centroid, first match wins
    "red-light": [(535, 170), (560, 170), (560, 200), (535, 200)],
    "bucket": [(85, 110), (320, 115), (350, 200), (345, 235), (275, 285), (85, 250)],
    "cab": [(460, 180), (630, 180), (630, 320), (495, 320), (470, 260)],
    "tracks": [(385, 400), (640, 360), (670, 400), (665, 455), (440, 530), (385, 520)],
    "body": [(390, 290), (650, 290), (660, 400), (385, 415)],
    "boom-and-grille": [(270, 190), (480, 190), (480, 470), (280, 470)],
    "base-plate": [(30, 400), (760, 400), (760, 680), (30, 680)],
}
ORDER = ["base-plate", "tracks", "body", "boom-and-grille", "cab", "bucket", "red-light"]  # bottom to top
obj_masks = {}
for name, poly in OBJECTS.items():
    m = np.zeros((H, W), np.uint8)
    cv2.fillPoly(m, [np.array(poly, np.int32)], 1)
    obj_masks[name] = m.astype(bool)


def object_of(cx, cy, mat):
    if mat in ("beige", "brown") and cy > 400 and not obj_masks["tracks"][cy, cx]:
        return "base-plate"
    for name, m in obj_masks.items():
        if m[cy, cx]:
            return name
    return "base-plate" if cy > 420 else "boom-and-grille"


# Per-object segmentation (KO > 0): every pixel first gets an object, then shades
# are clustered within each object, so each object gets its own shading levels
# and no part straddles two objects.
obj_names = list(OBJECTS)
label_obj = None
if P["KO"]:
    pix_obj = np.full((H, W), -1, np.int32)
    hsv_ = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    warm = (hsv_[..., 0] < 22) & (hsv_[..., 1] < 140) & (hsv_[..., 2] > 60) & (yy > 400) & ~obj_masks["tracks"]
    for oi, name in reversed(list(enumerate(obj_names))):  # first listed wins
        pix_obj[obj_masks[name]] = oi
    pix_obj[(pix_obj < 0) & (yy > 420)] = obj_names.index("base-plate")
    pix_obj[pix_obj < 0] = obj_names.index("boom-and-grille")
    pix_obj[warm] = obj_names.index("base-plate")
    fgm = ~background
    labels = np.full((H, W), -1, np.int32)
    label_obj, mat_of = [], []
    for oi, name in enumerate(obj_names):
        sel = fgm & (pix_obj == oi)
        if sel.sum() < P["KO"] * 4:
            continue
        cv2.setRNGSeed(0)
        _, lb, cen = cv2.kmeans(lab.reshape(H, W, 3)[sel], P["KO"], None, crit, 3, cv2.KMEANS_PP_CENTERS)
        labels[sel] = lb.ravel() + len(label_obj)
        crgb = cv2.cvtColor(cen.reshape(1, -1, 3).astype(np.uint8), cv2.COLOR_LAB2RGB)[0]
        label_obj += [name] * P["KO"]
        mat_of += [material(c) for c in crgb]
    P["K"] = len(label_obj)
    labels[labels < 0] = P["K"]  # background
    mat_of.append("background")
    votes = np.stack([cv2.boxFilter((labels == k).astype(np.float32), -1, (P["MODE"], P["MODE"]))
                      for k in range(P["K"] + 1)])
    labels = votes.argmax(axis=0)


def path_data(c):
    """Closed polygon as compact SVG path data: absolute start, then relative steps,
    using h/v for axis-aligned steps when that is shorter. A minus sign doubles as
    a separator ('3,-2' then '-1,4' is written '3-2-1,4')."""
    out = f"M{int(c[0][0])},{int(c[0][1])}"
    cmd = None
    for (a, b), (x, y) in zip(c[:-1], c[1:]):
        dx, dy = int(x - a), int(y - b)
        if dx == 0 or dy == 0:
            letter, nums = ("v", [dy]) if dx == 0 else ("h", [dx])
            l_cost = (cmd != "l") + len(f"{dx},{dy}") + (cmd == "l" and dx >= 0)
            hv_cost = (cmd != letter) + len(str(nums[0])) + (cmd == letter and nums[0] >= 0)
            if hv_cost < l_cost:
                out += (letter if cmd != letter else ("" if nums[0] < 0 else " ")) + str(nums[0])
                cmd = letter
                continue
        if cmd != "l":
            out += f"l{dx}{'' if dy < 0 else ','}{dy}"
        else:
            out += f"{'' if dx < 0 else ' '}{dx}{'' if dy < 0 else ','}{dy}"
        cmd = "l"
    return out + "z"


def simplify(c, eps):
    """Polygon for a pixel contour: smooth the staircase first (circular moving
    average), so Douglas-Peucker keeps real corners rather than pixel steps."""
    c = c.reshape(-1, 2).astype(np.float32)
    w = P["SMOOTH"]
    if w > 1 and len(c) > 2 * w:
        k = np.ones(w, np.float32) / w
        pad = np.concatenate([c[-(w // 2):], c, c[: w // 2]])
        c = np.stack([np.convolve(pad[:, j], k, "valid") for j in range(2)], 1)[: len(c)]
    c = cv2.approxPolyDP(c.reshape(-1, 1, 2), eps, True).reshape(-1, 2)
    c = np.round(c).astype(np.int32)
    keep = np.any(c != np.roll(c, 1, axis=0), axis=1)  # drop repeats from rounding
    return c[keep]


def join_subpaths(ds):
    """Concatenate closed subpaths, starting each one after the first with a
    relative 'm' from the previous subpath's start (where 'z' leaves the pen)."""
    out, prev = [], None
    for d in ds:
        k = next(n for n, ch in enumerate(d[1:], 1) if ch in "lhv")
        x, y = (int(v) for v in d[1:k].split(","))
        if prev is None:
            out.append(d)
        else:
            dx, dy = x - prev[0], y - prev[1]
            out.append(f"m{dx}{'' if dy < 0 else ','}{dy}{d[k:]}")
        prev = (x, y)
    return "".join(out)


def linear_gradient(idx, gid="{id}"):
    """Fit colour ~ a + b*x + c*y over pixels idx; return (rendered colours, <linearGradient>)
    with two stops along the direction of steepest luminance change, or None."""
    px, x, y = rgb.reshape(-1, 3)[idx], xx.ravel()[idx], yy.ravel()[idx]
    X = np.stack([np.ones(len(idx)), x, y], 1).astype(np.float32)
    coef, *_ = np.linalg.lstsq(X, px, rcond=None)
    g = coef[1:] @ np.array([0.3, 0.59, 0.11])
    if np.linalg.norm(g) < 1e-3:
        return None
    ux, uy = g / np.linalg.norm(g)
    proj = x * ux + y * uy
    p0, p1 = np.percentile(proj, 2), np.percentile(proj, 98)
    mx, my = x.mean(), y.mean()
    base = mx * ux + my * uy
    a = (mx + (p0 - base) * ux, my + (p0 - base) * uy)
    b = (mx + (p1 - base) * ux, my + (p1 - base) * uy)
    ca, cb = (np.clip(coef[0] + coef[1] * u + coef[2] * v, 0, 255) for u, v in (a, b))
    t = np.clip((proj - p0) / max(p1 - p0, 1e-6), 0, 1)[:, None]  # what the renderer does
    fit = ca * (1 - t) + cb * t
    hexes = ["#%02x%02x%02x" % tuple(int(v) for v in c) for c in (ca, cb)]
    return fit, (f'<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" '
                 f'x1="{a[0]:.0f}" y1="{a[1]:.0f}" x2="{b[0]:.0f}" y2="{b[1]:.0f}">'
                 f'<stop stop-color="{hexes[0]}"/><stop offset="1" stop-color="{hexes[1]}"/></linearGradient>')


# --- 4. trace parts -------------------------------------------------------------
silhouettes = {}  # object -> union of its parts
cands = []  # one per traced part: geometry, flat fill, optional gradient upgrade
for k in range(P["K"]):
    mask = (labels == k).astype(np.uint8)
    num, comp, stats, cents = cv2.connectedComponentsWithStats(mask, connectivity=8)
    for i in range(1, num):
        area = stats[i, cv2.CC_STAT_AREA]
        if area < P["MIN_AREA"]:
            continue
        part = comp == i
        contours, _ = cv2.findContours(part.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        c = max(contours, key=cv2.contourArea)
        c = simplify(c, P["EPS"])
        if len(c) < 3:
            continue
        px = rgb[part]
        mean = px.mean(axis=0)
        cand = {"area": area, "idx": np.flatnonzero(part), "d": path_data(c), "mean": mean, "poly": c,
                "fill": "#%02x%02x%02x" % tuple(int(round(v)) for v in mean), "grad": None}
        if area >= P["GRAD_AREA"]:
            g = linear_gradient(cand["idx"])
            if g:
                cand["grad"] = {"gain": float(((px - mean) ** 2).sum() - ((px - g[0]) ** 2).sum()), "def": g[1]}
        cx, cy = (min(max(int(v), 0), lim - 1) for v, lim in zip(cents[i], (W, H)))
        cand["obj"] = label_obj[k] if label_obj else object_of(cx, cy, mat_of[k])
        silhouettes.setdefault(cand["obj"], np.zeros((H, W), np.uint8))[part] = 1
        cands.append(cand)

# Nesting depth: how many other parts' filled outlines cover this part. Parts
# are drawn shallowest first, so a part never hides one nested inside it.
cover = np.zeros((H, W), np.int16)
for c in cands:
    m = np.zeros((H, W), np.uint8)
    cv2.fillPoly(m, [c["poly"]], 1)
    cover += m
for c in cands:
    c["depth"] = int(np.median(cover.ravel()[c["idx"]])) - 1

# Shades: per object, snap part colours to a small palette so parts of the same
# shade (e.g. "lit yellow faces of the bucket") share one <path> element.
for obj in silhouettes:
    mine = [c for c in cands if c["obj"] == obj]
    cols = np.array([c["mean"] for c in mine], np.float32)
    k = min(P["SHADES"], len(mine))
    if k < len(mine):
        _, lab_, pal = cv2.kmeans(cols, k, None, crit, 3, cv2.KMEANS_PP_CENTERS)
        for c, l in zip(mine, lab_.ravel()):
            c["mean"] = pal[l]
    for c in mine:
        c["fill"] = "#%02x%02x%02x" % tuple(int(round(v)) for v in c["mean"])

# --- 5. object underlays ---------------------------------------------------------
# Each object's whole silhouette in its mean colour, traced with its holes
# (windows, gaps between beams) so those stay background. Hairline gaps between
# neighbouring parts then show the object rather than white.
# The underlay is shaded with a fitted linear gradient (light falling across the
# object), which is also what parts are measured against below.
underlays, under_defs = {}, []
under_canvas = np.full((H * W, 3), 255, np.float32)
for n_obj, (obj, sil) in enumerate(silhouettes.items()):
    sil = cv2.morphologyEx(sil, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    cs, _ = cv2.findContours(sil, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    idx = np.flatnonzero(sil)
    d = join_subpaths([path_data(simplify(c, 1.5))
                       for c in cs if abs(cv2.contourArea(c)) >= P["HOLE_AREA"]])
    g = linear_gradient(idx, f"u{n_obj}")
    if g:
        under_canvas[idx] = g[0]
        under_defs.append(g[1])
        fill = f"url(#u{n_obj})"
    else:
        under_canvas[idx] = rgb.reshape(-1, 3)[idx].mean(axis=0)
        fill = "#%02x%02x%02x" % tuple(int(v) for v in under_canvas[idx[0]])
    paint = f'fill="{fill}" stroke="{fill}"' if fill.startswith("url") else f'color="{fill}"'
    underlays[obj] = (None, f'<path d="{d}" fill-rule="evenodd" {paint}/>', d, idx, fill)

# --- 6. spend the byte budget where it buys the most -----------------------------
# A part's gain is the squared error it removes compared with leaving its
# object's underlay colour there; its cost is the bytes it adds.
flat = rgb.reshape(-1, 3)
options = []
for i, c in enumerate(cands):
    under = under_canvas[c["idx"]]
    gain = float(((flat[c["idx"]] - under) ** 2).sum() - ((flat[c["idx"]] - c["mean"]) ** 2).sum())
    options.append((gain / (len(c["d"]) + 2), i, "part"))
    if c["grad"]:
        options.append((c["grad"]["gain"] / (len(c["grad"]["def"]) + 10), i, "grad"))
options.sort(reverse=True)


def leaves(chosen):
    """Chosen parts with no other chosen part nested inside them. Those can be
    drawn last in their object, so they merge into one path per shade."""
    by_depth = {}
    for i in chosen:
        by_depth.setdefault(cands[i]["depth"], []).append(i)
    containers = set()
    for d, members in by_depth.items():
        idmap = np.full(H * W, -1, np.int32)
        for i in members:
            m = np.zeros((H, W), np.uint8)
            cv2.fillPoly(m, [cands[i]["poly"]], 1)
            idmap[m.ravel().astype(bool)] = i
        for j in chosen:
            if cands[j]["depth"] > d:
                hit = idmap[cands[j]["idx"][len(cands[j]["idx"]) // 2]]
                if hit >= 0:
                    containers.add(int(hit))
    return set(chosen) - containers


def render(chosen, grads, label=False):
    """The SVG for the chosen parts. With label=True, every part and underlay is
    painted in a unique id colour without blur or antialiasing, which gives an
    ownership map: which part is actually visible at each pixel."""
    global leaf_set
    leaf_set = leaves(chosen) if P["LEAVES"] and not label else set()
    defs, body = [], []
    for obj in ORDER:
        if obj not in underlays:
            continue
        mine = [i for i in chosen if cands[i]["obj"] == obj]
        late = leaf_set & set(mine) if not label else set()
        paths = []
        for depth in sorted({cands[i]["depth"] for i in mine}) + ["leaves"]:
            groups = {}
            for i in mine:
                if (depth == "leaves") != (i in late) or (depth != "leaves" and cands[i]["depth"] != depth):
                    continue
                if label:
                    paths.append(f'<path d="{cands[i]["d"]}" color="#%06x"/>' % (i + 1))
                elif i in grads:
                    gid = f"g{len(defs)}"
                    defs.append(cands[i]["grad"]["def"].replace("{id}", gid))
                    paths.append(f'<path d="{cands[i]["d"]}" fill="url(#{gid})" stroke="url(#{gid})"/>')
                else:
                    groups.setdefault(cands[i]["fill"], []).append(cands[i]["d"])
            paths += [f'<path d="{join_subpaths(ds)}" color="{fill}"/>' for fill, ds in groups.items()]
        # objects stacked bottom to top; inside one, parts drawn shallowest first
        under = underlays[obj][1]
        if label:
            under = f'<path d="{underlays[obj][2]}" fill-rule="evenodd" color="#%06x"/>' % (0xFF0000 + ORDER.index(obj))
        body.append(f'<g id="{obj}">' + under + "".join(paths) + "</g>")
    return "\n".join([
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">',
        f'<defs><filter id="b"><feGaussianBlur stdDeviation="{P["BLUR"]}"/></filter>' + "".join(under_defs + defs) + "</defs>",
        # Contours run through the centres of boundary pixels, which in SVG sit at
        # +0.5: shift everything by half a pixel, and stroke each part in its own
        # colour (via currentColor) so it also covers the outer half of its edge pixels.
        '<rect width="800" height="800" fill="#fff"/>'
        + ('<g shape-rendering="crispEdges">' if label else '<g filter="url(#b)">') +
        f'<g transform="translate(.5 .5)" fill="currentColor" stroke="currentColor" stroke-width="{P["SW"]}" stroke-linejoin="round">',
        *body, "</g></g></svg>"]) + "\n"


chosen, grads = set(), set()
size = len(render(chosen, grads).encode())
for _ in range(4):  # byte estimates run high (merged paths share overhead): re-sync and top up
    for n, (ratio, i, kind) in enumerate(options):
        if ratio <= 0:
            break
        if i in chosen and (kind == "part" or i in grads):
            continue
        add = 0
        if i not in chosen:
            add += len(cands[i]["d"]) + 2
        if kind == "grad":
            add += len(cands[i]["grad"]["def"]) + 10
        if size + add > P["BUDGET"]:
            continue
        chosen.add(i)
        if kind == "grad":
            grads.add(i)
        size += add
    size = len(render(chosen, grads).encode())
svg = render(chosen, grads)
while len(svg.encode()) > P["BUDGET"]:  # estimates were slightly off: drop the weakest parts
    worst = min(chosen, key=lambda i: next(r for r, j, k in options if j == i and k == "part"))
    chosen.discard(worst); grads.discard(worst)
    svg = render(chosen, grads)

# --- 7. colour refit -----------------------------------------------------------
# Part colours so far are means over each part's raw region, but after stacking
# and stroking a part shows on a slightly different set of pixels. Render the
# ownership map and give each shade the mean colour of the pixels it really owns.
for _ in range(P["REFIT"]):
    png = resvg_py.svg_to_bytes(svg_string=render(chosen, grads, label=True))
    own = np.asarray(Image.open(io.BytesIO(bytes(png))).convert("RGB")).astype(np.int64)
    own = (own[..., 0] << 16 | own[..., 1] << 8 | own[..., 2]).ravel()
    flat_ref = rgb.reshape(-1, 3)
    groups = {}  # same grouping as render(): shared <path> elements get one colour
    lv = leaves(chosen) if P["LEAVES"] else set()
    for i in chosen:
        if i not in grads:
            slot = "leaves" if i in lv else cands[i]["depth"]
            groups.setdefault((cands[i]["obj"], slot, cands[i]["fill"]), []).append(i)
    order = np.argsort(own, kind="stable")
    ids_sorted = own[order]
    def owned(code):
        lo, hi = np.searchsorted(ids_sorted, [code, code + 1])
        return order[lo:hi]
    for members in groups.values():
        px = np.concatenate([owned(i + 1) for i in members])
        if len(px):
            mean = flat_ref[px].mean(axis=0)
            fill = "#%02x%02x%02x" % tuple(int(round(v)) for v in mean)
            for i in members:
                cands[i]["mean"], cands[i]["fill"] = mean, fill
    for obj, u in underlays.items():
        if not u[4].startswith("url"):  # flat underlays only; gradient ones keep their fit
            px = owned(0xFF0000 + ORDER.index(obj))
            if len(px):
                fill = "#%02x%02x%02x" % tuple(int(round(v)) for v in flat_ref[px].mean(axis=0))
                underlays[obj] = (None, u[1].replace(f'color="{u[4]}"', f'color="{fill}"'), u[2], u[3], fill)
    svg = render(chosen, grads)
while len(svg.encode()) > P["BUDGET"]:  # the refit can merge/split groups: re-check the budget
    worst = min(chosen, key=lambda i: next(r for r, j, k in options if j == i and k == "part"))
    chosen.discard(worst); grads.discard(worst)
    svg = render(chosen, grads)

sys.stdout.write(svg)
print(f"{len(chosen)}/{len(cands)} parts, {len(grads)} gradients, {len(svg.encode())} bytes", file=sys.stderr)
