"""Render scored entries as LEADERBOARD.md (+ a machine-readable results.json)."""

import json
from datetime import date
from pathlib import Path

from .images import REFERENCE_SET
from .scoring import fmt_psnr

ROOT = Path(__file__).resolve().parent.parent


def to_markdown(results: list[dict]) -> str:
    ids = list(REFERENCE_SET)
    lines = [
        "# Leaderboard",
        "",
        f"_Generated {date.today().isoformat()} by `python bench.py leaderboard`. "
        f"Ranked by mean PSNR (dB) over {len(ids)} image{'s' if len(ids) != 1 else ''}; SSIM as tie-breaker. "
        + (f"Byte budget: {results[0]['byte_budget']} bytes per SVG._" if results and results[0]["byte_budget"]
           else "No byte limit._"),
        "",
        "| # | Entry | Model | Method | Mean PSNR | Mean SSIM | Coverage | Avg bytes |",
        "|---|-------|-------|--------|----------:|----------:|:--------:|----------:|",
    ]
    for i, r in enumerate(results, 1):
        model = r["meta"].get("model", "-")
        kind = r["meta"].get("kind", "-")
        lines.append(
            f"| {i} | {r['entry']} | {model} | {kind} | {r['mean_psnr']:.2f} | {r['mean_ssim']:.4f} "
            f"| {r['coverage']} | {r['mean_bytes']} |"
        )

    lines += ["", "## Per-image PSNR (dB) / SSIM", ""]
    lines.append("| Entry | " + " | ".join(ids) + " |")
    lines.append("|-------|" + "|".join("------:" for _ in ids) + "|")
    for r in results:
        cells = []
        for image_id in ids:
            im = r["images"][image_id]
            cell = f"{fmt_psnr(im['psnr'])} / {im['ssim']:.3f}"
            if im["status"] != "ok":
                cell += f" ({im['status']})"
            cells.append(cell)
        lines.append(f"| {r['entry']} | " + " | ".join(cells) + " |")

    problems = [(r["entry"], i, im["error"]) for r in results for i, im in r["images"].items() if im.get("error")]
    if problems:
        lines += ["", "## Invalid submissions", ""]
        lines += [f"- `{entry}/{image_id}.svg`: {err}" for entry, image_id, err in problems]
    return "\n".join(lines) + "\n"


def write(results: list[dict]) -> Path:
    out = ROOT / "LEADERBOARD.md"
    out.write_text(to_markdown(results))
    (ROOT / "results.json").write_text(json.dumps(results, indent=2) + "\n")
    return out
