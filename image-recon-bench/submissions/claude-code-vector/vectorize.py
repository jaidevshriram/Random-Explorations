"""Piece-based semantic vectorization of lego_r19.

The structure comes from a segmentation of the image into LEGO pieces
(segmentation/pieces.png, made with SAM 2.1 plus prompts I placed by eye; see
segmentation/README.md). The vectorizer only fills that structure in:

    object (bucket, boom, cab, body, tracks, base plate, red light)
      > piece (one LEGO piece, e.g. a Technic beam, a connector, a gear)
        > shade (a shading level inside that piece)
          > part (one connected region of that shade, one <path>)

Every piece is one <g data-level="piece"> carrying data-object, data-name,
data-kind and data-material; its first path is the piece's own outline
(data-role="base"), the rest are shading regions inside it. Pixels that no piece
covers are kept as an explicit "unsegmented" piece per object, not hidden.

Pipeline:
1. Upsample the reference (U x) so outlines can land between pixels.
2. Read the piece map; give each piece an object (majority of hand-drawn object
   regions) and a material and kind (from its colour and shape; kinds are
   heuristic guesses unless the piece was named when prompted).
3. Inside each piece, cluster shading levels (k-means in RGB; up to KP levels,
   about sqrt(area)/SQRT_K of them) and trace each connected region of at least
   MIN_AREA pixels as one polygon.
4. Draw every piece's outline (holes cut) with a fitted gradient, then its
   shading regions on top; pieces are drawn in nesting order, so a pin sitting in
   a beam's hole is drawn after the beam.
5. Render an ownership map and refit every colour/gradient to the pixels it
   actually covers.

Traced contours run through the centres of boundary pixels, which in SVG sit at
+0.5, so the drawing is shifted half a (supersampled) pixel and every path is
stroked in its own colour to cover its edge pixels.

    python submissions/claude-code-vector/vectorize.py > submissions/claude-code-vector/lego_r19.svg

Needs opencv-python-headless. Tunables in P can be overridden from the environment.
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

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
P = {  # areas and lengths in original pixels
    "U": 2, "KP": 8, "PX_PER_SHADE": 120.0, "MIN_AREA": 4.0, "EPS": 0.3, "GRAD_AREA": 10.0,
    "HOLE_AREA": 30.0, "SW": 1.05, "REFIT": 2, "SQRT_K": 3.0,
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
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
background = img.min(axis=2) >= 245
crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 50, 0.5)

# --- objects: hand-drawn coarse regions (original pixels), first match wins ----------
OBJECTS = {
    "red-light": [(535, 170), (560, 170), (560, 200), (535, 200)],
    "bucket": [(85, 110), (320, 115), (350, 200), (345, 235), (275, 285), (85, 250)],
    "cab": [(460, 180), (630, 180), (630, 320), (495, 320), (470, 260)],
    "tracks": [(385, 400), (640, 360), (670, 400), (665, 455), (440, 530), (385, 520)],
    "body": [(390, 290), (650, 290), (660, 400), (385, 415)],
    "boom-and-grille": [(270, 190), (480, 190), (480, 470), (280, 470)],
    "base-plate": [(30, 400), (760, 400), (760, 680), (30, 680)],
}
names = list(OBJECTS)
pix_obj = np.full((H, W), -1, np.int32)
for oi, name in reversed(list(enumerate(names))):
    m = np.zeros((H, W), np.uint8)
    cv2.fillPoly(m, [np.array(OBJECTS[name]) * U], 1)
    pix_obj[m.astype(bool)] = oi
pix_obj[(pix_obj < 0) & (yy > 420 * U)] = names.index("base-plate")
pix_obj[pix_obj < 0] = names.index("boom-and-grille")
warm = (hsv[..., 0] < 22) & (hsv[..., 1] < 140) & (hsv[..., 2] > 60) & (yy > 400 * U)
pix_obj[warm] = names.index("base-plate")
redbox = pix_obj == names.index("red-light")
pix_obj[redbox & ~((rgb[..., 0] > 120) & (rgb[..., 1] < 0.6 * rgb[..., 0]))] = names.index("cab")


def material(c, obj):
    """Name a colour by material, given its object: on the tractor a warm colour is
    yellow plastic however dark; on the base plate warm colours are beige or brown."""
    r, g, b = (int(v) for v in c)
    mx, mn = max(r, g, b), min(r, g, b)
    sat = (mx - mn) / max(mx, 1)
    if r > 150 and g < 90 and b < 90:
        return "red"
    if sat < 0.18:
        return "black" if mx < 70 else "gray"
    if obj == "base-plate":
        if r > 150 and g > 110 and sat > 0.6:
            return "yellow"
        return "beige" if mx > 180 else "brown"
    return "yellow" if r > b + 25 else ("black" if mx < 70 else "gray")


def kind_of(mask0, mat):
    """Heuristic piece kind from material and shape (original-resolution mask)."""
    area = int(mask0.sum())
    cs, _ = cv2.findContours(mask0.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c = max(cs, key=cv2.contourArea)
    (_, _), (w, h), _ = cv2.minAreaRect(c)
    elong = max(w, h) / max(min(w, h), 1)
    per = cv2.arcLength(c, True)
    roundness = 4 * np.pi * cv2.contourArea(c) / max(per * per, 1)
    if mat == "gray":
        if area > 1200 and roundness > 0.5:
            return "gear or wheel"
        return "axle or pin" if elong > 2.5 else "connector or pin"
    if mat == "black":
        if area > 3000:
            return "track chain"
        return "rod or axle" if elong > 2.5 else "round brick"
    if mat == "yellow":
        return "beam" if elong > 2.5 else "brick or plate"
    if mat == "brown":
        return "brick or plate"
    if mat == "beige":
        return "plate"
    return "light" if mat == "red" else "piece"


# --- pieces ----------------------------------------------------------------------------
seg = HERE / "segmentation"
pmap0 = cv2.imread(str(seg / "pieces.png"), cv2.IMREAD_UNCHANGED).astype(np.int32)
pinfo = {p["id"]: p for p in json.load(open(seg / "pieces.json"))["pieces"]}
pmap = cv2.resize(pmap0, (W, H), interpolation=cv2.INTER_NEAREST) if U > 1 else pmap0.copy()
pmap[background] = 0
# pixels no piece covers: one explicit "unsegmented" pseudo-piece per object
for oi, name in enumerate(names):
    rest = (pmap == 0) & ~background & (pix_obj == oi)
    if rest.any():
        pid = 10000 + oi
        pmap[rest] = pid
        pinfo[pid] = {"id": pid, "name": f"unsegmented ({name})", "source": "unsegmented", "object": name}

OBJ_FROM_PREFIX = {"plate": "base-plate", "boom": "boom-and-grille", "bucket": "bucket", "cab": "cab", "body": "body"}
pieces = []
for pid in sorted(int(v) for v in np.unique(pmap) if v > 0):
    idx = np.flatnonzero(pmap == pid)
    info = pinfo[pid]
    named = "/" in info["name"]
    obj = info.get("object") or (OBJ_FROM_PREFIX.get(info["name"].split("/")[0]) if named else None) or \
        names[np.bincount(pix_obj.ravel()[idx], minlength=len(names)).argmax()]
    mat = material(np.median(flat[idx], axis=0), obj)
    if info["source"] == "unsegmented":
        kind, label = "unsegmented", info["name"]
    elif named:
        kind = label = info["name"].split("/")[-1]
    else:
        kind = kind_of(pmap0 == pid, mat)
        label = f"{mat} {kind}"
    pieces.append({"pid": pid, "idx": idx, "obj": obj, "mat": mat, "kind": kind, "name": label,
                   "source": info["source"]})


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
    return c[np.any(c != np.roll(c, 1, axis=0), axis=1)]


def hexcol(c):
    return "#%02x%02x%02x" % tuple(int(round(min(max(v, 0), 255))) for v in c)


def linear_gradient(idx, gid):
    """Least-squares colour ~ a + b*x + c*y over pixels idx, as a 2-stop
    <linearGradient> along the steepest luminance change: (rendered colours, svg) or None."""
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
    svg = (f'<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="{a[0] - .5:.1f}" y1="{a[1] - .5:.1f}" '
           f'x2="{b[0] - .5:.1f}" y2="{b[1] - .5:.1f}"><stop stop-color="{hexcol(ca)}"/>'
           f'<stop offset="1" stop-color="{hexcol(cb)}"/></linearGradient>')
    return ca * (1 - t) + cb * t, svg


def fill_for(idx, gid, allow_grad):
    mean = flat[idx].mean(axis=0)
    if allow_grad:
        g = linear_gradient(idx, gid)
        if g and ((flat[idx] - g[0]) ** 2).sum() < ((flat[idx] - mean) ** 2).sum():
            return f"url(#{gid})", g[1]
    return hexcol(mean), None


# --- shades and parts inside each piece ------------------------------------------------
min_area, grad_area = P["MIN_AREA"] * U * U, P["GRAD_AREA"] * U * U
parts = []
for pc in pieces:
    idx = pc["idx"]
    area0 = len(idx) / (U * U)
    k = int(min(P["KP"], max(1, round(np.sqrt(area0) / P["SQRT_K"]) if P["SQRT_K"] else area0 // P["PX_PER_SHADE"])))
    if k > 1:
        cv2.setRNGSeed(0)
        _, lb, cen = cv2.kmeans(flat[idx], k, None, crit, 3, cv2.KMEANS_PP_CENTERS)
        lb = lb.ravel()
        light = cen @ np.array([0.3, 0.59, 0.11])
        rank = {int(j): r for r, j in enumerate(np.argsort(-light), start=1)}
    else:
        lb, rank = np.zeros(len(idx), np.int64), {0: 1}
    ys, xs = idx // W, idx % W
    y0, x0 = ys.min(), xs.min()
    h, w = ys.max() - y0 + 1, xs.max() - x0 + 1
    for j in range(k):
        region = np.zeros((h, w), np.uint8)
        sel = lb == j
        region[ys[sel] - y0, xs[sel] - x0] = 1
        num, comp, stats, _ = cv2.connectedComponentsWithStats(region, connectivity=8)
        for i in range(1, num):
            if stats[i, cv2.CC_STAT_AREA] < min_area:
                continue
            bx, by, bw, bh = stats[i, :4]
            sub = (comp[by:by + bh, bx:bx + bw] == i).astype(np.uint8)
            c = outline(sub, P["EPS"] * U)
            if len(c) < 3:
                continue
            sidx = np.flatnonzero(sub)
            pidx = (sidx // bw + by + y0) * W + (sidx % bw + bx + x0)
            parts.append({"piece": pc["pid"], "shade": f"shade-{rank[j]}", "d": path_data(c + (bx + x0, by + y0)),
                          "idx": pidx, "area": int(stats[i, cv2.CC_STAT_AREA])})

# piece outlines (holes cut) and nesting order between pieces
cover = np.zeros((H, W), np.int16)
for pc in pieces:
    mask = np.zeros(H * W, np.uint8)
    mask[pc["idx"]] = 1
    mask = cv2.morphologyEx(mask.reshape(H, W), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    cs, _ = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    cs = [cv2.approxPolyDP(c, P["EPS"] * U, True).reshape(-1, 2) for c in cs
          if abs(cv2.contourArea(c)) >= P["HOLE_AREA"] * U * U]
    pc["d"] = "".join(path_data(c) for c in cs if len(c) >= 3)
    filled = np.zeros((H, W), np.uint8)
    cs_out, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    cv2.fillPoly(filled, cs_out, 1)
    cover += filled
for pc in pieces:
    pc["depth"] = int(np.median(cover.ravel()[pc["idx"]])) - 1
for n, pt in enumerate(parts):
    pt["id"] = f"p{pt['piece']}-{n}"
    pt["paint"] = fill_for(pt["idx"], f"g{pt['id']}", pt["area"] >= grad_area)
for pc in pieces:
    pc["paint"] = fill_for(pc["idx"], f"b{pc['pid']}", True)
draw_order = sorted(pieces, key=lambda pc: (pc["depth"], -len(pc["idx"])))
parts_of = {pc["pid"]: [] for pc in pieces}
for n, pt in enumerate(parts):
    pt["n"] = n
    parts_of[pt["piece"]].append(pt)
for lst in parts_of.values():
    lst.sort(key=lambda pt: -pt["area"])  # within a piece, enclosed regions come after their surroundings


# --- emit -------------------------------------------------------------------------------
def paint_attr(paint, code=None):
    if code is not None:
        return f'color="#{code:06x}"'
    fill, _ = paint
    return f'fill="{fill}" stroke="{fill}"' if fill.startswith("url") else f'color="{fill}"'


def render(label=False):
    """The SVG. With label=True every path is painted in a unique id colour without
    antialiasing: an ownership map of who is visible where."""
    defs, body = [], []
    for pc in draw_order:
        mine = parts_of[pc["pid"]]
        if not label:
            defs += [x for x in [pc["paint"][1]] + [pt["paint"][1] for pt in mine] if x]
        out = [f'<g id="piece-{pc["pid"]}" data-level="piece" data-object="{pc["obj"]}" data-name="{pc["name"]}" '
               f'data-kind="{pc["kind"]}" data-material="{pc["mat"]}" data-source="{pc["source"]}">',
               f'<path data-role="base" d="{pc["d"]}" fill-rule="evenodd" '
               f'{paint_attr(pc["paint"], 0xF00000 + pc["pid"] if label else None)}/>']
        for pt in mine:
            out.append(f'<path id="{pt["id"]}" data-shade="{pt["shade"]}" data-area="{pt["area"] / U / U:g}" '
                       f'd="{pt["d"]}" {paint_attr(pt["paint"], pt["n"] + 1 if label else None)}/>')
        out.append("</g>")
        body.append("".join(out))
    head = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}">'
            f'<defs>{"".join(defs)}</defs><rect width="{W}" height="{H}" fill="#fff"/>')
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

    for pt in parts:
        px = owned(pt["n"] + 1)
        if len(px) >= 3:
            pt["paint"] = fill_for(px, f"g{pt['id']}", pt["area"] >= grad_area)
    for pc in pieces:
        px = owned(0xF00000 + pc["pid"])
        if len(px) >= 3:
            pc["paint"] = fill_for(px, f"b{pc['pid']}", True)

svg = render()
sys.stdout.write(svg)
print(f"{len(pieces)} pieces, {len(parts)} shading regions, {len(svg.encode())} bytes", file=sys.stderr)
