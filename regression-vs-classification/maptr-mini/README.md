# Mini MapTR: L1 regression vs bin heads, on CPU

A $0 check of whether the toy experiment's finding (bins beat regression when targets are ambiguous) carries over to a DETR/MapTR-style vector model with Hungarian matching. Everything runs on CPU (`python mini_maptr.py`, about 1.5 h for 9 runs on 4 cores).

## Setup

- **Data:** 64×64 synthetic images with 1–3 elements: open curves (cubic Béziers) and closed loops (wobbly ellipses).
- **Targets:** each element is 16 points plus a class.
- **Model:** small CNN encoder, 12 instance queries, 3-layer transformer decoder, auxiliary losses on every layer.
- **Matching:** Hungarian matching over MapTR's equivalent orderings (open: 2 directions; closed: 16 starting points × 2 directions).
- **Score:** Chamfer AP at 1 / 2 / 3 px (MapTR's metric, rescaled to the canvas), plus a matching flip rate.
- **Heads compared** (everything else identical):

| Head | Output | Training loss | Matching cost |
|---|---|---|---|
| `l1` | 2 numbers per point (sigmoid) | L1 (weight 5) | L1 (weight 5) |
| `bins` | 64 bins per coordinate, peak then window-mean decode | HL-Gauss cross-entropy | L1 on the decoded points |
| `bins_nll` | as `bins` | as `bins` | negative log-likelihood of the GT bins |

## Results (3 seeds each, 8,000 steps)

**Experiment 1: clean labels** (`results.md`, `plots/curves.png`)

| Head | mAP | AP@1px | AP@2px | AP@3px |
|---|---|---|---|---|
| L1 | **0.294 ± 0.014** | 0.026 | 0.269 | 0.588 |
| bins, L1 cost | 0.241 ± 0.003 | 0.007 | 0.227 | 0.488 |
| bins, NLL cost | 0.215 ± 0.032 | 0.004 | 0.175 | 0.467 |

**Experiment 2: ambiguous labels** (`--ambiguous`; `results_amb.md`, `plots/curves_amb.png`). Open curves are drawn as double lines 5 px apart, and the label follows one stroke at random; at evaluation either stroke counts as correct.

| Head | mAP | AP@1px | AP@2px | AP@3px |
|---|---|---|---|---|
| L1 | **0.263 ± 0.005** | 0.014 | 0.186 | 0.588 |
| bins, L1 cost | 0.222 ± 0.004 | 0.005 | 0.181 | 0.479 |

**Matching flip rate:** about the same for every head in both experiments.

## What the diagnostics show

These use the seed-0 models retrained with saved weights on the experiment 2 data (`analyze_predictions.py`, `point_consistency.py`).

1. **On unambiguous closed loops the heads are about equal at 2–3 px:**
   - AP@2px 0.345 (L1) vs 0.375 (bins); AP@3px 0.780 vs 0.786.
   - Both have a median Chamfer error of 1.8 px.
   - L1 is better only at the strict 1 px threshold (0.031 vs 0.007).
2. **On the ambiguous double lines, neither head commits to a stroke.**
   - The median distance to the nearest stroke (2.8 px L1, 3.3 px bins) is about the same as to the midline.
   - About a third of the points sit within 1 px of a stroke.
   - Points partly hop between strokes: 71% (L1) and 68% (bins) of a curve's points pick its majority stroke.
3. **Precision is the limiting factor.** The models' error floor (about 1.8 px median) is as large as the ambiguity (2.5 px from either stroke to the midline). So experiment 2 cannot show the toy's mechanism either way. It is inconclusive, not evidence against it.

## What this does and doesn't support

- **Supported:** in this mini setting, bins give no gain on clean labels and are worse at the strictest threshold, and they don't make matching more stable.
- **Not supported:** any claim that one loss is generally better. The mini model differs from MapTR exactly where the coordinate head plugs in:
  - MapTR uses **hierarchical point queries** (one query per point); here one query predicts all 16 points.
  - MapTR uses **iterative reference-point refinement** (each decoder layer predicts a correction); here there is none.
  - MapTR adds **one-to-many matching**; here it is one-to-one only.
- **Not tested:** whether real MapTR labels contain the kind of ambiguity where the toy experiment showed bins helping.
