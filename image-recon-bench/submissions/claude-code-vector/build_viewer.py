"""Build viewer.html: an interactive inspector for the semantic SVG.

The page embeds the SVG as-is plus the reference image, and lists the semantic
hierarchy (object > material > shade > part) read from the SVG's own groups and
data-* attributes. Per-part pixel counts and errors come from an ownership
render: every part painted in a unique colour, no antialiasing.

    python submissions/claude-code-vector/build_viewer.py
"""

import base64
import io
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np
import resvg_py
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT))
from reconbench.scoring import score_svg  # noqa: E402

NS = "{http://www.w3.org/2000/svg}"
ET.register_namespace("", NS[1:-1])

svg_text = (HERE / "lego_r19.svg").read_text()
ref_png = (ROOT / "images" / "lego_r19.png").read_bytes()
ref = np.asarray(Image.open(io.BytesIO(ref_png)).convert("RGB")).astype(np.float64)
H, W = ref.shape[:2]
scores, _ = score_svg("lego_r19", svg_text)

# --- ownership render: who is visible at each pixel -----------------------------
root = ET.fromstring(svg_text)
owners = []  # owner name per id colour (index + 1)
parent = {c: g for g in root.iter() for c in g}
for p in root.iter(f"{NS}path"):  # every path once, in document order
    g = parent[p]
    while g.get("data-level") != "object":
        g = parent[g]
    owners.append(p.get("id") or f"{g.get('data-object')}:silhouette")
    colour = "#%06x" % len(owners)
    for attr in ("fill", "stroke", "color"):
        if attr in p.attrib:
            p.set(attr, colour)
    if "color" not in p.attrib:
        p.set("color", colour)
for g in root.iter(f"{NS}g"):
    if g.get("transform"):
        g.set("shape-rendering", "crispEdges")
root.set("width", str(W))
root.set("height", str(H))
png = resvg_py.svg_to_bytes(svg_string=ET.tostring(root, encoding="unicode"))
own = np.asarray(Image.open(io.BytesIO(bytes(png))).convert("RGB")).astype(np.int64)
own = (own[..., 0] << 16 | own[..., 1] << 8 | own[..., 2]).ravel()

_, test = score_svg("lego_r19", svg_text)
err = ((ref - test.astype(np.float64)) ** 2).mean(axis=2).ravel()
cnt = np.bincount(own, minlength=len(owners) + 1)
sse = np.bincount(own, weights=err, minlength=len(owners) + 1)
stats = {}
for i, name in enumerate(owners, start=1):
    if cnt[i]:
        stats[name] = [int(cnt[i]), round(float(np.sqrt(sse[i] / cnt[i])), 1)]
total_sse = float(err.sum())

data = {
    "psnr": round(scores["psnr"], 2), "ssim": round(scores["ssim"], 4), "bytes": scores["bytes"],
    "width": W, "height": H, "stats": stats, "totalSSE": total_sse,
    "sse": {name: round(float(sse[i]), 1) for i, name in enumerate(owners, start=1) if cnt[i]},
}
page = (HERE / "viewer_template.html").read_text()
page = page.replace("/*__DATA__*/null", json.dumps(data, separators=(",", ":")))
page = page.replace("__REF__", "data:image/png;base64," + base64.b64encode(ref_png).decode())
page = page.replace("<!--__SVG__-->", svg_text.replace('<?xml version="1.0"?>', ""))
(HERE / "viewer.html").write_text(page)
print(f"wrote {HERE / 'viewer.html'} ({len(page) / 1e6:.1f} MB, {len(stats)} owners)")
