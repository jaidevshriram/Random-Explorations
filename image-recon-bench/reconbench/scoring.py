"""Score submission directories against the reference set.

A submission is a directory `submissions/<entry>/` holding `<image_id>.svg`
for each reference image, plus an optional `meta.json` describing how it was
made. Missing or rule-breaking images are scored as a flat 50% gray canvas, so
skipping an image is never better than attempting it.
"""

import json
import math
from pathlib import Path

import numpy as np

from .images import REFERENCE_SET, load_reference
from .metrics import psnr, ssim
from .render import DEFAULT_BYTE_BUDGET, InvalidSubmission, render_svg

SUBMISSIONS_DIR = Path(__file__).resolve().parent.parent / "submissions"

# Cap used when averaging so a (practically impossible) exact match doesn't make the mean inf.
PSNR_CAP = 100.0


def score_array(ref: np.ndarray, test: np.ndarray) -> dict:
    return {"psnr": min(psnr(ref, test), PSNR_CAP), "ssim": ssim(ref, test)}


def score_svg(image_id: str, svg: str, byte_budget: int = DEFAULT_BYTE_BUDGET) -> tuple[dict, np.ndarray]:
    """Render and score one SVG. Raises InvalidSubmission on rule violations."""
    ref = np.asarray(load_reference(image_id))
    h, w = ref.shape[:2]
    test = render_svg(svg, w, h, byte_budget)
    result = score_array(ref, test)
    result["bytes"] = len(svg.encode("utf-8"))
    return result, test


def _penalty(image_id: str) -> dict:
    ref = np.asarray(load_reference(image_id))
    return score_array(ref, np.full_like(ref, 128))


def load_meta(entry_dir: Path) -> dict:
    path = entry_dir / "meta.json"
    return json.loads(path.read_text()) if path.exists() else {}


def score_entry(entry_dir: Path, byte_budget: int = DEFAULT_BYTE_BUDGET) -> dict:
    per_image = {}
    for image_id in REFERENCE_SET:
        path = entry_dir / f"{image_id}.svg"
        if not path.exists():
            per_image[image_id] = {**_penalty(image_id), "status": "missing"}
            continue
        try:
            result, _ = score_svg(image_id, path.read_text(encoding="utf-8"), byte_budget)
            per_image[image_id] = {**result, "status": "ok"}
        except InvalidSubmission as e:
            per_image[image_id] = {**_penalty(image_id), "status": "invalid", "error": str(e)}

    ok = [r for r in per_image.values() if r["status"] == "ok"]
    return {
        "entry": entry_dir.name,
        "meta": load_meta(entry_dir),
        "byte_budget": byte_budget,
        "mean_psnr": float(np.mean([r["psnr"] for r in per_image.values()])),
        "mean_ssim": float(np.mean([r["ssim"] for r in per_image.values()])),
        "coverage": f"{len(ok)}/{len(per_image)}",
        "mean_bytes": int(np.mean([r["bytes"] for r in ok])) if ok else 0,
        "images": per_image,
    }


def score_all(byte_budget: int = DEFAULT_BYTE_BUDGET) -> list[dict]:
    entries = sorted(p for p in SUBMISSIONS_DIR.iterdir() if p.is_dir()) if SUBMISSIONS_DIR.exists() else []
    results = [score_entry(p, byte_budget) for p in entries]
    results.sort(key=lambda r: (-r["mean_psnr"], -r["mean_ssim"]))
    return results


def fmt_psnr(x: float) -> str:
    return "inf" if math.isinf(x) else f"{x:.2f}"
