# Image Reconstruction Bench (PSNR / SSIM)

How well can Claude redraw a photo? Claude is shown a classic test image (Lena,
Baboon, Fruits...) and has to reproduce it as an **SVG**. The SVG is rasterized
and scored against the original with **PSNR** (primary) and **SSIM**. Claude
gets its render, its score and an error heatmap back each round and keeps
refining until it says `DONE` or runs out of rounds.

## Quick start

```bash
pip install -r requirements.txt
python bench.py fetch          # download the 8 reference images into images/
python bench.py leaderboard    # score everything in submissions/ -> LEADERBOARD.md
```

### Have Claude reconstruct the images (API)

```bash
export ANTHROPIC_API_KEY=...   # or `ant auth login`
python bench.py run --entry opus-5-5-high                          # all 8 images, 8 rounds each
python bench.py run --entry quick-test --images opencv_logo --max-rounds 3
python bench.py leaderboard
```

Options: `--model` (default `claude-opus-5-5`), `--effort` (default `high`),
`--max-rounds` (default 8), `--budget` (SVG byte limit, default 32768).

Each image costs up to `max-rounds` requests, and the conversation grows every
round (each SVG plus two feedback images), so a full 8x8 run is a real spend.
Prompt caching is on, so earlier rounds are re-read at the cached rate. Try a
single image with `--max-rounds 3` first to see the cost.

The best round by PSNR becomes `submissions/<entry>/<image>.svg`. Every
round's SVG and a per-round log (scores, stop reason, token usage) are kept in
`submissions/<entry>/rounds/<image>/`.

### Or let Claude Code do it (no API key)

`check` scores one SVG and writes the render and heatmap as PNGs Claude Code
can look at, so an agent session can run the same loop by hand. Paste
something like:

> Reconstruct `images/lena.png` as an SVG in `submissions/claude-code/lena.svg`.
> Look at the reference image, write the SVG, then run
> `python bench.py check lena submissions/claude-code/lena.svg` and look at the
> render and heatmap it writes. Keep improving the PSNR until you can't anymore.
> Rules: max 32768 bytes, no `<image>`, `<text>`, `data:` URIs or external refs.

## The reference set

From OpenCV's [`samples/data`](https://github.com/opencv/opencv/tree/4.10.0/samples/data)
(pinned to tag 4.10.0, checked by sha256), flattened to RGB on white and
downscaled so the long side is at most 512 px:

| id | source | size |
|----|--------|------|
| `lena` | lena.jpg | 512x512 |
| `baboon` | baboon.jpg | 512x512 |
| `fruits` | fruits.jpg | 512x480 |
| `butterfly` | butterfly.jpg | 493x356 |
| `starry_night` | starry_night.jpg | 512x409 |
| `smarties` | smarties.png | 413x356 |
| `messi` | messi5.jpg | 512x320 |
| `opencv_logo` | opencv-logo.png | 387x512 |

The images are downloaded, not committed. Lena is included because it's the
classic test image, but many journals no longer accept it. Delete it from
`REFERENCE_SET` in `reconbench/images.py` if you'd rather not use it.

## Rules

A submission is `submissions/<entry>/<image_id>.svg` for each image, plus an
optional `meta.json` (`model`, `notes`, ...). The rules make sure the SVG
actually *draws* the image instead of smuggling it in:

- **Byte budget:** 32 KB per SVG by default. Without a limit, one `<rect>` per
  pixel would score near infinity.
- **No raster or external content:** `<image>`, `<feImage>`, `<foreignObject>`,
  `<script>`, `data:` URIs, `@import`, and any `href`/`url()` that isn't a
  `#fragment` are rejected.
- **No `<text>`:** font rendering differs between machines. Letters have to be
  drawn as paths.
- The root `width`/`height` are forced to the reference size, so SVG units are
  pixels unless the SVG brings its own `viewBox`. Undrawn areas are white.
  Rendering uses [resvg](https://github.com/linebender/resvg), so results are
  the same on every machine.

A missing or invalid image is scored as a flat 50% gray canvas, so skipping
an image is never better than trying.

## Metrics

- **PSNR** (dB): `10 * log10(255^2 / MSE)` over all pixels and RGB channels.
  Higher is better. Very roughly: about 15 dB is a blurry blob, 20 dB is the
  shapes in the right places, and 30 dB or more is hard to tell from the original.
- **SSIM**: Wang et al. 2004 with an 11x11 Gaussian window (sigma 1.5),
  averaged over RGB channels. It matches
  `skimage.metrics.structural_similarity(..., gaussian_weights=True, sigma=1.5,
  use_sample_covariance=False, data_range=255, channel_axis=-1)` to about 1e-14.
  SSIM rewards flat regions, so a single mean-colour rectangle can beat a
  coarse grid on SSIM even though it loses badly on PSNR.

The leaderboard ranks entries by mean PSNR over all 8 images, with SSIM as the
tie-breaker.

## Baselines

`python bench.py baselines` regenerates two non-Claude entries that show the
floor under the same rules:

- `baseline-flat-color`: one rectangle of the mean colour (about 12.8 dB)
- `baseline-grid-16x16`: a 16x16 grid of block averages (about 16.7 dB, ~15 KB)

## Layout

```
bench.py                 CLI: fetch | baselines | run | check | leaderboard
reconbench/images.py     reference set, download + preprocessing
reconbench/metrics.py    PSNR, SSIM, error heatmap (numpy only)
reconbench/render.py     SVG validation and rasterization
reconbench/scoring.py    scoring of one SVG / an entry / all entries
reconbench/agent.py      Claude reconstruction loop (Anthropic API)
reconbench/leaderboard.py  LEADERBOARD.md writer
submissions/<entry>/     one directory per leaderboard entry
tests/                   pytest suite (python -m pytest tests)
```
