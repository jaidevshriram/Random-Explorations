# Study tools

`../study.html` is a hand-placed redraw of a reference street illustration,
used to measure how close code-drawn art can get. The reference image is not
in the repo.

- `score.py <render.png> <reference.png>` prints PSNR and SSIM and writes an error heatmap.
- `fit.py <reference.png> <probe.png> <../study-fit.js>` fits one colour per shape.
  The probe image is a screenshot of `study.html?probe`, where every fill is
  painted in a unique id colour so the script can tell which pixels each shape covers.

- `align.js '<passes>' '' '<corner steps>' <reference.png>` tunes each shape's placement:
  a shift and size correction per shape, then each polygon corner on its own. It only
  moves what is already drawn, and writes `../study-adj.js`.

The loop is: `align.js`, screenshot `study.html?probe`, `fit.py`, `score.py`.
On the street reference this took the redraw from 13.2 dB (freehand) to 18.5 dB.

`study.html` accepts `?noadj` (ignore placement corrections), `?nofit` (ignore the fitted colours), `?o=rrggbb`
(outline colour) and `?lw=1.2` (outline width multiplier).

## Tracing, for comparison

`trace.py <reference.png> <target dB> <min square px> <../study-traced-data.js>`
fits an adaptive grid of flat-colour squares to the reference automatically and
writes them out; `../study-traced.html` draws them. This is image compression,
not drawing. It exists to show what a PSNR number costs: on the street
reference, 29 dB took about 222,000 squares, most of them one or two pixels
wide, where the hand-placed redraw uses about 480 shapes and scores 17 dB. The
generated data file is ignored by git.
