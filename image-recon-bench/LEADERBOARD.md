# Leaderboard

_Generated 2026-10-29 by `python bench.py leaderboard`. Ranked by mean PSNR (dB) over 8 images; SSIM as tie-breaker. Byte budget: 32768 bytes per SVG._

| # | Entry | Model | Mean PSNR | Mean SSIM | Coverage | Avg bytes |
|---|-------|-------|----------:|----------:|:--------:|----------:|
| 1 | baseline-grid-16x16 | - | 16.66 | 0.4435 | 8/8 | 15520 |
| 2 | baseline-flat-color | - | 12.76 | 0.4430 | 8/8 | 119 |

## Per-image PSNR (dB) / SSIM

| Entry | lena | baboon | fruits | butterfly | starry_night | smarties | messi | opencv_logo |
|-------|------:|------:|------:|------:|------:|------:|------:|------:|
| baseline-grid-16x16 | 19.31 / 0.540 | 17.11 / 0.199 | 21.28 / 0.507 | 13.59 / 0.278 | 15.55 / 0.131 | 15.55 / 0.749 | 17.89 / 0.445 | 12.98 / 0.698 |
| baseline-flat-color | 14.88 / 0.548 | 13.35 / 0.188 | 14.78 / 0.456 | 11.28 / 0.262 | 13.31 / 0.119 | 10.62 / 0.798 | 14.40 / 0.423 | 9.47 / 0.750 |
