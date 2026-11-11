# Mini MapTR: L1 regression vs bin heads, on CPU

**Latest results: the MapTR-faithful model (`maptr_faithful.py`)**, described in the next section. The original simplified model and its diagnostics follow after it.

## MapTR-faithful model

This version copies MapTRv2's head mechanics from its code (`hustvl/MapTR`, branch `maptrv2`, commit `e03f097`):
- hierarchical point queries (instance embedding + point embedding);
- iterative reference-point refinement (`sigmoid(Δ + inverse_sigmoid(ref))`, detached);
- decoupled inter- and intra-instance self-attention;
- deformable cross-attention;
- per-layer classification and regression branches;
- focal loss and focal matching cost (weight 2);
- L1 point loss and point matching cost summed over all coordinates (weight 5), with a direction loss;
- AdamW 6e-4 with warm-up, cosine decay and gradient clip 35.

What differs from MapTRv2:
- a CNN feature map instead of the camera-to-BEV encoder;
- width 64;
- no one-to-many matching, i.e. the MapTR v1 setting. Keeping it made a run take about a day on CPU; `--k-one2many 6` turns it on.

Checks and settings:
- **Precision gate (passed):** L1 reaches a median Chamfer error of 0.59 px on closed loops, well below the 2.5 px double-line ambiguity.
- **Bin head:** 128 bins per coordinate, plus a log-prior bump at the reference point.
- **Bin cross-entropy weight:** chosen by a bracketed check (0.01: 0.391, 0.03: 0.522, 0.1: 0.512, 0.3: 0.441, 1.0: 0.421 mAP at 4k steps), so 0.03.

Main runs: 3 seeds per head, 8,000 steps, batch 16. Full tables: `results_faithful.md`; diagnostics: `results_faithful_diagnostics.json`, `results_pairing.json`.

| | L1 (MapTR) | bins |
|---|---|---|
| **Clean labels:** final mAP | 0.680 ± 0.009 | 0.667 ± 0.004 |
| Clean labels: mAP at step 2,000 | 0.460 | 0.365 |
| Clean labels: closed-loop median error | 0.59 px | 0.58 px |
| **Double lines:** final mAP | **0.600 ± 0.008** | 0.564 ± 0.004 |
| Double lines: open-curve AP @ 1 / 2 / 3 px | 0.054 / **0.393** / 0.631 | 0.002 / 0.167 / 0.578 |
| Double lines: closed-loop AP @ 1 / 2 / 3 px | 0.663 / 0.896 / 0.961 | **0.730** / 0.929 / 0.978 |
| Double lines: open curves closer to a stroke than to the midline | **82%** | 47% |
| Double lines: points within 1 px of a stroke / of the midline | 67% / 15% | 39% / 36% |
| Matching flip rate, first half (clean / double lines) | 0.30 / 0.29 | 0.33 / 0.35 |

### What the data shows

1. **Clean labels: no reliable difference at the end.**
   - The final mAP gap is about one standard deviation.
   - L1 learns faster early.
   - Precision is the same.
2. **Bins do not stabilise the matching.** Their flip rate is, if anything, slightly higher.
3. **Ambiguous labels: L1 commits to a stroke; it does not average.** 82% of its open-curve predictions are closer to a stroke than to the midline. The toy experiment's argument (L1 lands between the modes) does not hold in this model.
4. **Ambiguous labels: the bin head does *not* represent the two answers as two peaks. It predicts one broad bump spanning both strokes.**
   - Probability within ±1 px of the peak: 0.36 on double lines, 0.76 on closed loops, 0.99 for the training labels.
   - A strict two-peak test (two separate maxima with a dip between them) fires on about 0% of histograms (`check_sharpness.py`).
   - Decoding a broad bump lands near its middle, i.e. between the strokes. See `plots/bin_labels.png`.
   - *Correction:* an earlier version of this README said 93% of histograms were two-peaked and that the misses came from x and y pairing different peaks (`check_ghosts.py`, `check_pairing.py`). That two-peak test was broken: it fires on 86% of closed-loop histograms too, where there is only one answer. Those numbers are retracted.
5. **On unambiguous closed loops in the double-line data,** the bin head is more precise (AP@1px 0.730 vs 0.663). In the clean-label runs the closed-loop errors are equal.

### What this means for the real model (evidence so far, not a general claim)

- Nothing here supports switching MapTR's coordinate head to per-coordinate bins. With clean labels the head makes no reliable difference; with ambiguous labels it is worse.
- **The hypothesis, part by part:**
  - *"Bins stabilise the matching"*: not seen.
  - *"L1 averages two answers"*: not seen. L1 commits to a stroke, plausibly because at an exact 50/50 split L1's loss is flat between the two answers and the image evidence (the ink) decides. Averaging is what L2 does.
  - *"Bins keep both answers"*: not seen. This head produced one broad bump instead. Why is open; candidates are the small cross-entropy weight chosen by mAP (0.03), which leaves even single-answer histograms broad, and the decoded reference feeding back into the next layer.
- This only matters for the real model if real map labels contain this kind of ambiguity, which is still untested.
- Limitations:
  - synthetic data;
  - small width;
  - no one-to-many matching;
  - 3 seeds;
  - one specific kind of ambiguity (an exact 50/50 split, 2.5 px from either stroke to the midline).

## Original simplified model


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
