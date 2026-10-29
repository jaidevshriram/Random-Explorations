# Image Reconstruction Bench (PSNR / SSIM)

How well can Claude redraw a photo? Claude is shown the Lego bulldozer from
[NeRF](https://www.matthewtancik.com/nerf) and has to reproduce it as an **SVG**. The SVG is rasterized
and scored against the original with **PSNR** (primary) and **SSIM**. Claude
gets its render, its score and an error heatmap back each round and keeps
refining until it says `DONE` or runs out of rounds.

## Quick start

```bash
pip install -r requirements.txt
python bench.py fetch          # download the reference image(s) into images/
python bench.py leaderboard    # score everything in submissions/ -> LEADERBOARD.md
```

### Have Claude reconstruct the image (API)

```bash
export ANTHROPIC_API_KEY=...   # or `ant auth login`
python bench.py run --entry opus-5-5-high                       # 8 rounds per image
python bench.py run --entry quick-test --max-rounds 3
python bench.py leaderboard
```

Options: `--model` (default `claude-opus-5-5`), `--effort` (default `high`),
`--max-rounds` (default 8), `--budget` (optional SVG byte limit; none by default).

Each image costs up to `max-rounds` requests, and the conversation grows every
round (each SVG plus two feedback images). Prompt caching is on, so earlier
rounds are re-read at the cached rate. Try `--max-rounds 3` first to see the
cost.

Claude gets the reference twice in its first message: as-is, and with a pixel
grid (`python bench.py grid lego_r19` writes the same view) for reading
coordinates.

The best round by PSNR becomes `submissions/<entry>/<image>.svg`. Every
round's SVG and a per-round log (scores, stop reason, token usage) are kept in
`submissions/<entry>/rounds/<image>/`.

### Or let Claude Code do it (no API key)

`check` scores one SVG and writes the render and heatmap as PNGs Claude Code
can look at, so an agent session can run the same loop by hand. Paste
something like:

> Reconstruct `images/lego_r19.png` as an SVG in `submissions/my-entry/lego_r19.svg`.
> Look at the reference (and `python bench.py grid lego_r19`), write the SVG, then run
> `python bench.py check lego_r19 submissions/my-entry/lego_r19.svg` and look at
> the render and heatmap it writes. Keep improving the PSNR until you can't anymore.
> Drawing tools and code are fine, but don't read or vectorize the reference's
> pixels. Rules: no `<image>`, `<text>`, `data:` URIs or external refs.

Two entries were made this way in a Claude Code session, each with the script
that generates it:

- `submissions/claude-code-session/` (`draw.py`, about 18 dB): drawn entirely by
  eye. No code reads the reference; only the render, heatmap and score were used.
- `submissions/claude-code-vector/` (`vectorize.py`, about 28 dB): a *semantic*
  vectorizer that does read the reference. It segments the image into
  materials and shading levels within each object (bucket, boom, cab, body,
  tracks, base plate), traces each region as one part, and keeps the parts that
  remove the most error per byte. The SVG has one group per object and one path
  per shade within it, so every vector is a real piece of the scene, not
  free-floating primitives. Needs `pip install opencv-python-headless`.

The leaderboard's Method column (`kind` in `meta.json`) keeps hand-drawn and
vectorized entries apart.

## The reference set

| id | source | size |
|----|--------|------|
| `lego_r19` | `nerf_synthetic/lego/train/r_19.png` | 800x800 |

The frame comes from the NeRF authors' official `nerf_synthetic.zip` (the
Google Drive folder linked from [bmild/nerf](https://github.com/bmild/nerf),
CC BY 3.0). The archive is 1.27 GB, so `fetch` reads only the needed entries
with HTTP range requests and checks the PNG's sha256. Like NeRF's evaluation,
the RGBA render is composited onto white at full 800x800 resolution. The image
is downloaded, not committed.

To add more views, add `"id": ("nerf_synthetic/<scene>/<split>/r_<n>.png",
"<sha256>")` entries to `REFERENCE_SET` in `reconbench/images.py`.

## Rules

A submission is `submissions/<entry>/<image_id>.svg` for each image, plus an
optional `meta.json` (`model`, `notes`, ...). The rules make sure the SVG
actually *draws* the image instead of smuggling it in:

- **Draw parts, not pixels:** every shape should be a meaningful piece of the
  scene (a face, a beam, a wheel, a gap). One `<rect>` per pixel would score
  near infinity, so pixel-grid tracing doesn't count. There is no byte limit by
  default; pass `--budget N` to score a size-limited track.
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

The leaderboard ranks entries by mean PSNR over the reference set, with SSIM
as the tie-breaker.

The heatmap shown after each round is `|reference - render|` averaged over
channels and amplified 2x (it saturates at an error of 128).

## Baselines

`python bench.py baselines` regenerates two non-Claude entries that show the
floor under the same rules:

- `baseline-flat-color`: one rectangle of the mean colour (11.57 dB)
- `baseline-grid-16x16`: a 16x16 grid of block averages (17.11 dB, ~15 KB)

## Layout

```
bench.py                 CLI: fetch | baselines | run | check | grid | leaderboard
reconbench/images.py     reference set, download + preprocessing
reconbench/metrics.py    PSNR, SSIM, error heatmap (numpy only)
reconbench/render.py     SVG validation and rasterization
reconbench/scoring.py    scoring of one SVG / an entry / all entries
reconbench/agent.py      Claude reconstruction loop (Anthropic API)
reconbench/leaderboard.py  LEADERBOARD.md writer
submissions/<entry>/     one directory per leaderboard entry
tests/                   pytest suite (python -m pytest tests)
```
