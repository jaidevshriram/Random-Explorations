"""Non-Claude reference points: what a dumb algorithm gets under the same rules."""

import json

import numpy as np

from .images import REFERENCE_SET, load_reference
from .scoring import SUBMISSIONS_DIR


def flat_svg(arr: np.ndarray) -> str:
    h, w = arr.shape[:2]
    r, g, b = arr.reshape(-1, 3).mean(axis=0).round().astype(int)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}">'
        f'<rect width="{w}" height="{h}" fill="#{r:02x}{g:02x}{b:02x}"/></svg>\n'
    )


def grid_svg(arr: np.ndarray, n: int) -> str:
    """n x n grid of block-average colors (cells cover the canvas exactly)."""
    h, w = arr.shape[:2]
    xs = np.linspace(0, w, n + 1).round().astype(int)
    ys = np.linspace(0, h, n + 1).round().astype(int)
    rects = []
    for j in range(n):
        for i in range(n):
            block = arr[ys[j] : ys[j + 1], xs[i] : xs[i + 1]].reshape(-1, 3)
            r, g, b = block.mean(axis=0).round().astype(int)
            rects.append(
                f'<rect x="{xs[i]}" y="{ys[j]}" width="{xs[i + 1] - xs[i]}" '
                f'height="{ys[j + 1] - ys[j]}" fill="#{r:02x}{g:02x}{b:02x}"/>'
            )
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}">' + "".join(rects) + "</svg>\n"


BASELINES = {
    "baseline-flat-color": ("Single rectangle of the image's mean color.", flat_svg),
    "baseline-grid-16x16": ("16x16 grid of block-average colors.", lambda a: grid_svg(a, 16)),
}


def generate() -> None:
    for entry, (desc, make) in BASELINES.items():
        out = SUBMISSIONS_DIR / entry
        out.mkdir(parents=True, exist_ok=True)
        for image_id in REFERENCE_SET:
            (out / f"{image_id}.svg").write_text(make(np.asarray(load_reference(image_id))))
        (out / "meta.json").write_text(json.dumps({"model": "-", "kind": "baseline", "notes": desc}, indent=2) + "\n")
        print(f"  wrote submissions/{entry}/")
