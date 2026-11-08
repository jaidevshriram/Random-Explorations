# Plan: bin (classification) coordinate head in MapTRv2, trained on Modal

Goal: test the toy experiment's main finding in a real model. Train MapTRv2 twice with identical settings: once with its L1 point regression, once with a per-coordinate bin head (softmax + HL-Gauss cross-entropy). Compare map quality, convergence and matching stability.

All code references are to `hustvl/MapTR`, branch `maptrv2`, commit `e03f097`. This plan contains no code yet. The code and the Modal launcher will live next to this file as a patch applied on top of a fresh MapTR clone.

---

## 1. Hypothesis and what counts as success

- **Hypothesis.** Early in training the Hungarian matching is unstable, so a query's point targets are effectively multimodal. L1 then pulls the query toward an in-between shape, which slows convergence. Bins hold several hypotheses until the matching settles (see the toy experiment and video).
- **Success:**
  - mAP is higher at the same schedule (nuScenes AP at Chamfer thresholds 0.5 / 1.0 / 1.5 m, per class).
  - Or the same mAP is reached in fewer epochs.
  - The fraction of queries whose matched ground truth changes between epochs is lower.
- **Also report:** point-error percentiles (p50 / p90 / p99, after the best ordering) and the ghost/self-consistency check in §5. A null result is still useful.

## 2. Where the changes go

MapTRv2 regresses each point in normalised `[0, 1]` coordinates:
- A regression branch outputs a delta.
- The delta is added to `inverse_sigmoid(reference)` and passed through `sigmoid`.
- This happens in **two** places: the decoder's iterative reference refinement, and the head's per-layer outputs.

Everything below sits behind one config switch, so the baseline run uses unmodified code paths:

```python
pts_bbox_head=dict(..., coord_head=dict(type='l1'))          # baseline (default)
pts_bbox_head=dict(..., coord_head=dict(type='bins', num_bins=256, sigma_bins=0.75,
                                        decode='peak_window', window=2,
                                        ce_weight=..., l1_weight=0.0))
```

| Step | File : lines | Change |
|---|---|---|
| Output layer | `projects/mmdet3d_plugin/maptr/dense_heads/maptrv2_head.py:210–215` (`_init_layers`) | The final `Linear(embed_dims, code_size)` becomes `Linear(embed_dims, code_size * num_bins)` for bins. Initialise the bias so the starting distribution is a broad bump at the reference point. |
| Decoder refinement | `projects/mmdet3d_plugin/maptr/modules/decoder.py:63–74` | Today: `sigmoid(reg_branch(output) + inverse_sigmoid(ref))`, detached, becomes the next reference. Bins: decode the logits (see below) and pass the decoded point, detached, as the next reference. |
| Head outputs | `maptrv2_head.py:385–397` (`forward`) | Same decode for each layer's `outputs_pts_coord`. Also return the logits (`all_pts_logits`, plus the one-to-many copy) so the loss and the matcher can use them. |
| Loss | `maptrv2_head.py:700–720` (`loss_single`) | Add soft cross-entropy between the logits of positive queries and HL-Gauss labels built from `normalized_pts_targets`. These targets are already put in the matched order (`assigned_shift`, around L548). Keep `loss_dir` on the decoded points (it is differentiable through the softmax). Optionally keep a small L1 on the decoded points (weight swept: 0 / 0.5×). |
| Matching cost | `projects/mmdet3d_plugin/maptr/assigners/maptr_assigner.py:185–203`, new class next to `OrderedPtsL1Cost` in `maptr/losses/map_loss.py:501` | Run B keeps `OrderedPtsL1Cost` on the decoded points (no change). Run C adds `OrderedPtsNLLCost`: cost(q, g, order) = mean over points and axes of −log p(bin of the ground truth), clamped at log K per point. The assigner already takes the min over the orders. The logits reach the assigner through a new keyword argument at `maptrv2_head.py:519`. |
| Config | `projects/configs/maptrv2/maptrv2_nusc_r50_24ep.py:90–206` | New config files that inherit from this one and set `coord_head` and the matcher. The schedule, seeds and everything else stay identical. |

**Design choice: absolute vs. relative bins.**
- **Absolute (start here):** each layer predicts a distribution over absolute normalised positions. It's simple and matches the toy experiment. The reference is only used for deformable-attention sampling.
- **Relative (D-FINE style):** each layer refines a distribution of offsets around the reference, which is finer at later layers.
- Run the absolute version first, and try relative only if it underperforms.

**Decoding.** Take the bin with the highest probability, then the probability-weighted mean within ±2 bins of it. This keeps sub-bin precision without averaging two modes. Use the same decode for the reference update and at test time.

## 3. Bin design

- **Resolution:** the map area is 30 m × 60 m (`point_cloud_range = [-15, -30, …, 15, 30, …]`). With 256 bins per axis, a bin is 0.12 m × 0.23 m, small next to the 0.5 m strictest threshold. With the window decode, quantisation error is well below that.
- **Soft labels:** HL-Gauss with σ = 0.75 bins.
- **Memory:**
  - 350 queries (50 one-to-one + 300 one-to-many) × 20 points × 2 axes × 256 bins ≈ 3.6 M logits per decoder layer per sample.
  - × 6 layers × batch 4 ≈ 86 M values, roughly 1 GB including softmax gradients.
  - That fits on A100s next to the current 10–12 GB per-GPU footprint.
- **Multi-level bins.**
  - They don't help per coordinate: a conditional two-level head is the same distribution as one 256-way softmax, as the toy experiment showed.
  - They pay off for a joint (x, y) distribution per point, which removes ghost points: 256² = 65,536 cells is too many.
  - **Follow-up run D:** a coarse 16×16 cell (256 logits), then a fine 16×16 position inside it. Condition the fine logits on the chosen cell by adding a learned cell embedding to the query feature (teacher-forced with the ground-truth cell during training). That is 512 logits per point instead of 65,536.
  - Only worth doing if run B or C shows ghost points (§5).

## 4. Run matrix

All runs: R50, nuScenes, the authors' 24-epoch schedule, same seed and same number of GPUs. Add a second seed for A and B if the budget allows, because single-seed differences of under 1 mAP are noise.

| Run | Coordinate head | Matching cost | Purpose |
|---|---|---|---|
| A | L1 regression (unchanged) | `OrderedPtsL1Cost` | baseline (the paper reports 61.5 mAP) |
| B | 256 bins, HL-Gauss CE | `OrderedPtsL1Cost` on decoded points | the head change alone |
| C | 256 bins, HL-Gauss CE | `OrderedPtsNLLCost` | head plus a matching cost consistent with it |
| D (optional) | joint (x, y) coarse→fine | NLL | ghost-free variant |

Before any full run, train A and B on nuScenes-mini for about 200 iterations. That checks for a falling loss, a sensible matching flip rate and identical data pipelines, and gives the real seconds per iteration used to fix the budget (§6).

## 5. Evaluation and logging

- **Built-in:** `tools/dist_test_map.sh` gives AP per class (divider, pedestrian crossing, boundary) at 0.5 / 1.0 / 1.5 m and the mAP. Evaluate every 2 epochs (checkpoint interval is already 2) to get convergence curves, not just final numbers.
- **Matching stability:** on a fixed set of 200 training samples, record each one-to-one query's matched ground truth every epoch. Report the fraction that change, per epoch and per run.
- **Point error:** after the best ordering, p50 / p90 / p99 of the point-to-point error in metres, for matched predictions.
- **Ghost / self-consistency check:** the fraction of predicted points more than 1 m from their matched ground-truth polyline but less than 0.5 m from a different one. That is points borrowed from another element, the shape-level ghost.
- **Optional:** rasterised IoU of predicted vs ground-truth polylines, drawn 2 px wide on a 200×400 grid.

## 6. Compute on Modal: cost and constraints

**Prices** are from [modal.com/pricing](https://modal.com/pricing), checked 2026-11-08:
- A100 40 GB ≈ $2.10/h
- A100 80 GB ≈ $2.50/h
- H100 ≈ $3.95/h
- The Starter plan includes $30/month of credit.
- Modal advertises startup credits and up to $10k of credits for academics.

**H100s are not an option.** MapTRv2 pins PyTorch 1.9.1 + CUDA 11.1, which predates the H100 (it needs CUDA ≥ 11.8). A100s (sm_80) are supported.

**Rough budget.** The authors trained on 8× RTX 3090 and don't publish wall-clock times, so the figures below are an estimate to replace with the measurement from step 0.

| Item | Estimate |
|---|---|
| Image build (compile mmcv-full and the GKT op, one-off and then cached) | ~1 h of CPU, a few $ |
| nuScenes-mini debugging and timing (1 GPU) | $5–15 |
| One full 24-epoch R50 run, 8× A100 40 GB | ~100–200 GPU-h ≈ $210–420 |
| A + B | ≈ $420–840 |
| + C | + $210–420 |

**Cheaper alternatives,** applied to every arm alike:
- Halve the schedule to 12 epochs; MapTRv2 converges quickly, and the convergence curves are part of the result.
- Use the R18 backbone.
- Use 4 GPUs: the same GPU-hours, but double the wall-clock time.

**Modal specifics the launcher must handle:**
- **Image:** `nvidia/cuda:11.1.1-cudnn8-devel-ubuntu20.04`, Python 3.8, `torch==1.9.1+cu111`.
- **mmcv:** `mmcv-full==1.4.0` built from source with `MMCV_WITH_OPS=1 TORCH_CUDA_ARCH_LIST="8.0"`.
- **Other packages:** `mmdet==2.14.0`, `mmsegmentation==0.14.1`, `timm`, `mmdetection3d` installed with `setup.py develop`, the `geometric_kernel_attn` op, and `requirement.txt`.
- **Volumes:** one for nuScenes data (`/data/nuscenes`, `/data/can_bus`) and one for run outputs (checkpoints, logs, evaluation JSON).
- **Time limits:** Modal caps how long one function call may run, so a 24-epoch run must be chunked. Each call trains N epochs and resumes from the last checkpoint in the volume (`--resume-from`). Checkpoint every epoch, not every 2.
- **Multi-GPU:** one container with `gpu="A100:8"` running `tools/dist_train.sh`.

## 7. Data (your part: it needs your nuScenes account)

1. Create a free account at nuscenes.org and accept the terms.
2. Download the v1.0 trainval metadata and sensor blobs (about 300 GB in total), the map expansion v1.3 and the CAN bus expansion.
3. Put them on the data volume, either with `modal volume put` from a machine that has the files, or with a Modal function that downloads from the links nuScenes gives you. Keep those links private: not in chat, not in the repo.
4. Run the converter once, on CPU, inside the image:
   `python tools/maptrv2/custom_nusc_map_converter.py --root-path /data/nuscenes --out-dir /data/nuscenes --extra-tag nuscenes --version v1.0 --canbus /data`.
   It writes the `nuscenes_map_infos_temporal_{train,val}.pkl` files the configs expect.
5. Download nuScenes-mini (about 4 GB) too, for the debugging stage.

## 8. Steps when we start building

1. **Patch** (in this folder): the head, decoder, loss, NLL cost and configs from §2. Add pure-PyTorch unit tests (no GPU, no mmcv) for:
   - the HL-Gauss labels and the cross-entropy;
   - the decode, checking sub-bin precision and that one of two modes is picked rather than the middle;
   - the NLL cost against a brute-force loop, including the min over orders.
2. **Modal launcher:** the image, the volumes, and `prepare_data`, `train` (chunked and resumable) and `evaluate` functions.
3. **Smoke test** on nuScenes-mini, then measure seconds per iteration to fix the budget.
4. **Full runs** A and B, then C, and analysis (§5).

## Risks and open questions

- **The old stack** (mmcv 1.4 / CUDA 11.1) is the most likely time sink, so build the image first, before writing model code.
- **The decoder couples layers** through the reference. If absolute bins make early layers' references noisy, train with the decoded-mean reference for the first epoch, or use relative bins.
- **Loss scales differ** (cross-entropy vs L1 weight 5.0). Run a short three-point sweep of `ce_weight` on mini to match the gradient magnitude, and keep everything else identical.
- **Single seeds** can't resolve differences under about 1 mAP. Budget for a second seed before drawing conclusions from small gaps.
