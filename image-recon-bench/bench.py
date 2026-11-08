#!/usr/bin/env python3
"""PSNR / SSIM bench for images Claude reconstructs as SVG.

  python bench.py fetch                       # download the reference images
  python bench.py baselines                   # (re)generate non-Claude baseline entries
  python bench.py run --entry my-run          # have Claude reconstruct every image
  python bench.py check lego_r19 x.svg        # score one SVG, write render + heatmap
  python bench.py grid lego_r19               # reference with a pixel grid, for eyeballing coordinates
  python bench.py leaderboard                 # score all submissions -> LEADERBOARD.md
"""

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image

from reconbench import baselines, images, leaderboard, scoring
from reconbench.metrics import error_heatmap
from reconbench.render import DEFAULT_BYTE_BUDGET, InvalidSubmission


def cmd_fetch(args):
    images.fetch_all(force=args.force)


def cmd_baselines(args):
    baselines.generate()


def cmd_run(args):
    from reconbench import agent  # needs the anthropic SDK; keep other commands usable without it

    ids = args.images.split(",") if args.images else list(images.REFERENCE_SET)
    unknown = [i for i in ids if i not in images.REFERENCE_SET]
    if unknown:
        sys.exit(f"unknown image ids: {unknown}; choose from {list(images.REFERENCE_SET)}")
    agent.run(args.entry, ids, args.model, args.effort, args.max_rounds, args.budget)


def cmd_check(args):
    """Score a single SVG. Handy when Claude Code itself is iterating on a file."""
    svg = Path(args.svg).read_text(encoding="utf-8")
    try:
        result, test = scoring.score_svg(args.image, svg, args.budget)
    except InvalidSubmission as e:
        sys.exit(f"INVALID: {e}")
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    ref = np.asarray(images.load_reference(args.image))
    Image.fromarray(test).save(out / f"{args.image}_render.png")
    Image.fromarray(error_heatmap(ref, test)).save(out / f"{args.image}_heatmap.png")
    print(f"{args.image}: PSNR {scoring.fmt_psnr(result['psnr'])} dB  SSIM {result['ssim']:.4f}  "
          f"{result['bytes']} bytes" + (f" (budget {args.budget})" if args.budget else ""))
    print(f"render:  {out / f'{args.image}_render.png'}")
    print(f"heatmap: {out / f'{args.image}_heatmap.png'}")


def cmd_grid(args):
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    path = out / f"{args.image}_grid.png"
    images.grid_overlay(images.load_reference(args.image)).save(path)
    print(path)


def cmd_leaderboard(args):
    results = scoring.score_all(args.budget)
    path = leaderboard.write(results)
    print(leaderboard.to_markdown(results))
    print(f"wrote {path}")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("fetch", help="download and preprocess the reference images")
    s.add_argument("--force", action="store_true", help="re-download even if present")
    s.set_defaults(func=cmd_fetch)

    s = sub.add_parser("baselines", help="generate the non-Claude baseline entries")
    s.set_defaults(func=cmd_baselines)

    s = sub.add_parser("run", help="have Claude reconstruct images via the API")
    s.add_argument("--entry", required=True, help="submission name, e.g. opus-5-5-high")
    s.add_argument("--images", help="comma-separated ids (default: all)")
    s.add_argument("--model", default="claude-opus-5-5")
    s.add_argument("--effort", default="high", choices=["low", "medium", "high", "xhigh", "max"])
    s.add_argument("--max-rounds", type=int, default=8)
    s.add_argument("--budget", type=int, default=DEFAULT_BYTE_BUDGET, help="optional max SVG bytes (default: no limit)")
    s.set_defaults(func=cmd_run)

    s = sub.add_parser("check", help="score one SVG against one reference image")
    s.add_argument("image", choices=list(images.REFERENCE_SET))
    s.add_argument("svg")
    s.add_argument("--out", default="scratch", help="where to write render/heatmap PNGs")
    s.add_argument("--budget", type=int, default=DEFAULT_BYTE_BUDGET, help="optional max SVG bytes (default: no limit)")
    s.set_defaults(func=cmd_check)

    s = sub.add_parser("grid", help="write the reference with a pixel grid overlay")
    s.add_argument("image", choices=list(images.REFERENCE_SET))
    s.add_argument("--out", default="scratch")
    s.set_defaults(func=cmd_grid)

    s = sub.add_parser("leaderboard", help="score every submission and write LEADERBOARD.md")
    s.add_argument("--budget", type=int, default=DEFAULT_BYTE_BUDGET, help="optional max SVG bytes (default: no limit)")
    s.set_defaults(func=cmd_leaderboard)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
