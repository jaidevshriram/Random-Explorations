# Study tools

`../study.html` is a hand-placed redraw of a reference street illustration,
used to measure how close code-drawn art can get. The reference image is not
in the repo.

- `score.py <render.png> <reference.png>` prints PSNR and SSIM and writes an error heatmap.
- `fit.py <reference.png> <probe.png> <../study-fit.js>` fits one colour per shape.
  The probe image is a screenshot of `study.html?probe`, where every fill is
  painted in a unique id colour so the script can tell which pixels each shape covers.

`study.html` accepts `?nofit` (ignore the fitted colours), `?o=rrggbb`
(outline colour) and `?lw=1.2` (outline width multiplier).
