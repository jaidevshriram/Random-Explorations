# Part 2: plan for a head/loss ablation on the MapTR-style SVG model

Goal: change **only** the coordinate head, the coordinate loss and the geometric matching cost. Keep the backbone, the queries, the class head, the data, the schedule and the evaluation fixed. Then compare the variants on geometry metrics, not on loss values.

## 1. Variants

| id | coordinate head (per query, per point, per axis) | training loss | decode |
|---|---|---|---|
| A (baseline) | 1 scalar | L1 | the value |
| B | 1 scalar | Huber (β ≈ 1–2 px) | the value |
| C | 256 bins | CE, HL-Gauss soft labels (σ = 0.75 bin) | argmax **and** expected value |
| C-hard | 256 bins | CE, one-hot labels | argmax / mean |
| D | 16 coarse × 16 fine, fine conditioned on coarse | CE on the coarse bin + CE on the fine bin (chain rule) | greedy coarse→fine / mean |
| E | 16 coarse bins + one offset per coarse bin | CE + L1 on the offset of the GT bin | argmax bin + its offset |

Notes:
- Pick K so that one bin is about 1 px or less at your canvas size. 256 bins fits a 256 px canvas; use 512–1024 bins (or D/E) for higher resolution. With argmax decoding, error can't go below roughly bin width/√12, so keep that floor well under your target accuracy.
- Logit memory is `Q × P × 2 × K`. For example, 100 queries × 32 points × 2 × 256 ≈ 1.6M floats per image, which is fine. When K gets large, D cuts the logits per axis from K to √K + K, or to 2√K if the fine bins are shared. The toy experiment shows that the shared-fine version breaks when two plausible answers fall at different positions inside their coarse bins, so prefer conditional fine bins.
- The CE loss has a different scale from L1, so sweep the coordinate-loss weight over about 3 values (e.g. 0.5, 1, 2 × "CE ≈ L1 loss at init") for every variant. Otherwise you are comparing loss weights, not heads.

## 2. Hungarian matching with a bin head

The matching cost should rank (query, GT) pairs the same way the training loss will, which is the DETR principle. There are two candidates:

1. **L1 of the decoded expected coordinate.** This is cheap and has the same units as the baseline. It inherits regression's problem, though: a query whose distribution is split between two shapes has its mean *between* them, so it looks bad for both.
2. **Negative log-likelihood of the GT bins** (recommended). Per pair: `cost[q, g] = mean over points and axes of −Σ_k q_gt[g, p, a, k] · log p[q, p, a, k]`, where `q_gt` is the HL-Gauss soft label. This is a single einsum, cost `Q × G × P × 2 × K`, and it equals the training loss of that pair. A bimodal query gets a reasonable cost for *both* shapes.
   - Per-point NLL is unbounded. One badly placed point with near-zero probability can dominate the cost, so clamp it, e.g. `min(nll, log K)`, which is the uniform-distribution value.
   - Early in training every distribution is near uniform and NLL ≈ log K for every pair. The class cost then decides the matching, which is the same thing that happens with L1. If the matching flip-flops early on, add a small L1-of-expected-value term for the first few epochs.
3. Ablate both costs, crossed with variant C (C+L1cost, C+NLLcost). Log the **fraction of queries whose matched GT changes between epochs**: matching instability is the usual reason DETR-style training is "finicky".

## 3. Point-order invariance

A closed path with P points has 2P equivalent orderings: P cyclic shifts × 2 directions. An open path has 2 (forward, reversed). MapTR handles this with a set of equivalent permutations, and the bin head works the same way:

- Precompute, for every GT, the stack of permuted point sequences, shape `G × M × P × 2` with M = 2P or 2, and its soft labels.
- Matching cost: `cost[q, g] = min over m of cost(q, g, m)`. With NLL this is the einsum above with an extra M axis, then a min over it.
- Loss: use the same min over m for the matched pair, so the loss and the cost agree on the ordering.
- Resample every GT path to exactly P points evenly spaced along its arc length *before* building the permutations. Otherwise "shift by one" means different distances on different paths.

## 4. Targets: sampled points or Bézier control points?

- **Sampled points along the path** (MapTR style, recommended to start with): every target lies *on* the shape, so per-point error is a real geometric error. Both Chamfer and bin heads behave well, and a smooth Bézier can be fitted afterwards if you need SVG commands.
- **Bézier control points**: more compact and closer to SVG, but the targets are ill-posed. Control points sit off the curve, many control-point sets draw nearly the same curve (split a segment, move a handle), and the number of segments varies. That label ambiguity is exactly where bins help more than L1. On the other hand, per-control-point errors no longer measure what you care about.
- If you predict control points, also evaluate (and optionally supervise) **points sampled from the predicted curve**. Bézier evaluation is differentiable, so you can add a Chamfer or point loss on the curve computed from the bin head's expected control points.
- Run the head ablation on the sampled-points representation first, so you only change one thing at a time.

## 5. Watch out for ghost points (from the 2D toy experiment)

Separate softmaxes for x and y, and separate softmaxes for each point, can each commit to a *different* plausible answer. That produces x from shape A with y from shape B (see `plots/10_ghost_points_2d.png`), or points 1–5 from one contour and 6–10 from another. In the full model this is less severe than in the toy, because Hungarian matching makes each query specialise in one instance. Still measure it:
- **Path self-consistency**: Chamfer distance from each predicted point to its *matched* GT path, compared with Chamfer to *any* GT path. A large gap means the points are mixing instances.
- If ghosts show up, use one of these fixes: a joint (x, y) softmax per point (64×64 = 4096 bins; affordable with the 2-level trick), predicting y conditioned on x, or decoding with the expected value on unimodal points and argmax only where the distribution is clearly multimodal.

## 6. Evaluation (all in pixels on a fixed canvas, e.g. 256²)

1. **Chamfer distance** between each predicted path and its matched GT, both densely resampled, reported as mean and median. Report **AP at Chamfer thresholds** (e.g. 0.5 / 1 / 2 / 4 px, as MapTR does in metres) so missing or extra paths are penalised too.
2. **Point error percentiles** after the best cyclic shift and direction: p50, p90, p99. Bins tend to win on p50, because they snap exactly onto a mode, and on p99, because they don't average two modes into nonsense.
3. **Rasterised IoU**: render the prediction and the GT, e.g. with `cairosvg`, or `pydiffvg` if you later want it differentiable. Use fill IoU for closed paths and stroke IoU (stroke width ~2 px) for open paths. This catches outputs that are "close in points but visually wrong", such as self-intersections and ghost points.
4. **Convergence and stability**: plot metric vs epoch for 3 seeds per variant, plus the matching-flip rate from §2. "Finicky" should show up as spread between seeds.
5. Break all metrics down by shape type: small, large, closed, open, and "ambiguous" (e.g. symmetric shapes or overlapping contours), in the same way as the per-region breakdown in the toy experiment.

## 7. Suggested order of work

1. Implement C (256 bins, soft labels) with the **L1-on-expected-value** matching cost. This is the smallest diff from the baseline, and checks that the head trains at all.
2. Switch to the NLL matching cost and compare matching-flip rate, Chamfer and p90.
3. Add Huber (B), C-hard, D and E. Use 3 seeds each.
4. Only if p50 is stuck at the bin-width floor, increase K or move to D.
5. Only if ghost points show up in the metrics in §5, try the joint-(x, y) head.
