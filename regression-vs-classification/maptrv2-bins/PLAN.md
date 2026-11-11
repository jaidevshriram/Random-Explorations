# Plan: bin (classification) coordinate head in MapTRv2

Goal: test the toy experiment's main finding in a real model. Train MapTRv2 twice with identical settings: once with its L1 point regression, once with a per-coordinate bin head (softmax + HL-Gauss cross-entropy). Compare map quality, convergence and matching stability.

All code references are to `hustvl/MapTR`, branch `maptrv2`, commit `e03f097`. This plan contains no code yet. The code and the launcher will live next to this file as a patch applied on top of a fresh MapTR clone.


> **Status: not recommended.** On real Argoverse 2 maps (`../maptr-mini/README.md`, AV2 section), a MapTRv2-style model with bins was much worse than L1. The variants tried were absolute bins, relative bins, and loss weights from 0.03 to 1.0. Runs B/C below are not worth GPU money unless a new hypothesis predicts a gain. Bins did win where a decoder has to *choose* between valid answers: autoregressive joint-2D coarse+offset on AV2 lane forks (`../maptr-mini/README.md`). That fits an autoregressive lane-graph or SVG decoder, not MapTR's matched set prediction.

> **Update (MapTR-faithful CPU experiment, see `../maptr-mini/README.md`):**
> - With clean labels, the per-coordinate bin head (runs B/C below) made no reliable difference.
> - With ambiguous labels it was worse than L1. L1 committed to one of the two answers, while the bin head predicted one broad bump spanning both, which decodes to a point between them.
> - The matching was not more stable with bins.
>
> Before spending GPU money on runs B/C:
> 1. Check whether real map labels contain this kind of ambiguity.
> 2. Understand why the bin head does not form two peaks.

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

Start with **12 epochs per arm** (see §6), and extend to 24 only if the curves are interesting.

## 5. Evaluation and logging

- **Built-in:** `tools/dist_test_map.sh` gives AP per class (divider, pedestrian crossing, boundary) at 0.5 / 1.0 / 1.5 m and the mAP. Evaluate every 2 epochs (checkpoint interval is already 2) to get convergence curves, not just final numbers.
- **Matching stability:** on a fixed set of 200 training samples, record each one-to-one query's matched ground truth every epoch. Report the fraction that change, per epoch and per run.
- **Point error:** after the best ordering, p50 / p90 / p99 of the point-to-point error in metres, for matched predictions.
- **Ghost / self-consistency check:** the fraction of predicted points more than 1 m from their matched ground-truth polyline but less than 0.5 m from a different one. That is points borrowed from another element, the shape-level ghost.
- **Optional:** rasterised IoU of predicted vs ground-truth polylines, drawn 2 px wide on a 200×400 grid.

## 6. Compute: cost and constraints

**Measured, not guessed.** The authors' published training log for MapTR-tiny (R50, 24 epochs, 8× RTX 3090) runs from 2022-11-06 20:55 to 2022-11-07 09:53:
- about **13 h wall-clock**, which is about **104 GPU-hours** (880 iterations per epoch, about 1.1–2 s per iteration, 10.3 GB per GPU);
- final mAP 50.0.

MapTRv2 adds one-to-many queries and auxiliary segmentation and depth losses. Allow about 1.2–1.5×, so **about 125–160 3090-hours per 24-epoch run**. Step 0 (§4) replaces this with a measured figure.

**Which GPUs.**
- MapTRv2 pins PyTorch 1.9.1 + CUDA 11.1.
- That supports the RTX 3090 / A5000 / A6000 / A40 (sm_86) and the A100 (sm_80).
- It does **not** support the RTX 4090 / L40S (sm_89) or the H100 (sm_90).
- The 3090 is what the authors used, so the baseline is directly comparable to their log.

| Provider (prices checked 2026-11-08) | GPU | $/GPU-h | One 24-epoch run | One 12-epoch run |
|---|---|---|---|---|
| RunPod Community Cloud | RTX 3090 | 0.22 | **≈ $28–35** | ≈ $14–18 |
| RunPod Secure Cloud | RTX 3090 | 0.50 | ≈ $63–80 | ≈ $32–40 |
| Vast.ai marketplace | RTX 3090 | ≈ 0.08–0.27 (varies, can be interrupted) | ≈ $10–43 | ≈ $5–22 |
| Modal | A100 40 GB (≈1.7× a 3090, an assumption) | 2.10 | ≈ $155–200 | ≈ $78–100 |

**Recommended budget.**

| Item | Cost |
|---|---|
| Debugging on nuScenes-mini (any one GPU, or a free Kaggle/Colab T4) | $0–5 |
| Runs A + B, 12 epochs each, RunPod community 3090s | ≈ $30–40 |
| Extending A + B to 24 epochs if the 12-epoch curves are interesting | + ≈ $30–40 |
| Run C | + ≈ $15–35 |
| Storage for nuScenes (about 300 GB on a network volume, roughly $0.05–0.10/GB-month) | ≈ $15–30 per month while it's kept |

**Why 12 epochs is a fair first test.** The hypothesis is about early training, when the matching is still unstable. So the mAP-vs-epoch curves of A and B over the first 12 epochs already answer the main question, and both arms get the same schedule.

**Practical notes:**
- **Interruptions:** community and marketplace GPUs can be interrupted. Checkpoint every epoch and resume with `--resume-from`.
- **Image:** use one Docker image, the same one on any provider. `nvidia/cuda:11.1.1-cudnn8-devel-ubuntu20.04`, Python 3.8, `torch==1.9.1+cu111`, `mmcv-full==1.4.0` built with `MMCV_WITH_OPS=1 TORCH_CUDA_ARCH_LIST="8.0;8.6"`, `mmdet==2.14.0`, `mmsegmentation==0.14.1`, `timm`, `mmdetection3d` with `setup.py develop`, the `geometric_kernel_attn` op, and `requirement.txt`.
- **GPUs per machine:** 8×3090 machines are not always available. 4×3090 gives the same GPU-hours over twice the wall-clock time, and the same cost.
- **Keep the effective batch size** the same as the authors' (8 GPUs × 4) by adjusting `samples_per_gpu` or using gradient accumulation, so the learning rate stays valid.
- **Modal** remains an option if you have credits, e.g. their academic programme (up to $10k) or startup credits. Same image, A100s only; it caps per-call runtime, so chunk the run and resume.

## 7. Data (your part: it needs your nuScenes account)

1. Create a free account at nuscenes.org and accept the terms.
2. Download the v1.0 trainval metadata and sensor blobs (about 300 GB in total), the map expansion v1.3 and the CAN bus expansion.
3. Put them on the provider's persistent network volume. Either download directly on a cheap CPU pod using the links nuScenes gives you, or upload from a machine that has the files. Keep those links private: not in chat, not in the repo.
4. Run the converter once, on CPU, inside the image:
   `python tools/maptrv2/custom_nusc_map_converter.py --root-path /data/nuscenes --out-dir /data/nuscenes --extra-tag nuscenes --version v1.0 --canbus /data`.
   It writes the `nuscenes_map_infos_temporal_{train,val}.pkl` files the configs expect.
5. Download nuScenes-mini (about 4 GB) too, for the debugging stage.

## 8. Steps when we start building

1. **Patch** (in this folder): the head, decoder, loss, NLL cost and configs from §2. Add pure-PyTorch unit tests (no GPU, no mmcv) for:
   - the HL-Gauss labels and the cross-entropy;
   - the decode, checking sub-bin precision and that one of two modes is picked rather than the middle;
   - the NLL cost against a brute-force loop, including the min over orders.
2. **Launcher:** a Docker image plus scripts for `prepare_data`, `train` (resumable) and `evaluate`, runnable on RunPod/Vast (default) or Modal.
3. **Smoke test** on nuScenes-mini, then measure seconds per iteration to fix the budget.
4. **Full runs** A and B, then C, and analysis (§5).

## Risks and open questions

- **The old stack** (mmcv 1.4 / CUDA 11.1) is the most likely time sink, so build the image first, before writing model code.
- **The decoder couples layers** through the reference. If absolute bins make early layers' references noisy, train with the decoded-mean reference for the first epoch, or use relative bins.
- **Loss scales differ** (cross-entropy vs L1 weight 5.0). Run a short three-point sweep of `ce_weight` on mini to match the gradient magnitude, and keep everything else identical.
- **Single seeds** can't resolve differences under about 1 mAP. Budget for a second seed before drawing conclusions from small gaps.
