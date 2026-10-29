# Leaderboard

_Generated 2026-10-29 by `python bench.py leaderboard`. Ranked by mean PSNR (dB) over 1 image; SSIM as tie-breaker. No byte limit._

| # | Entry | Model | Method | Mean PSNR | Mean SSIM | Coverage | Avg bytes |
|---|-------|-------|--------|----------:|----------:|:--------:|----------:|
| 1 | claude-code-vector | Claude (Claude Code session) | semantic vectorizer | 32.25 | 0.9656 | 1/1 | 1368674 |
| 2 | claude-code-session | Claude (Claude Code session) | hand-drawn | 18.24 | 0.7811 | 1/1 | 4472 |
| 3 | baseline-grid-16x16 | - | baseline | 17.11 | 0.7535 | 1/1 | 15592 |
| 4 | baseline-flat-color | - | baseline | 11.57 | 0.7592 | 1/1 | 119 |

## Per-image PSNR (dB) / SSIM

| Entry | lego_r19 |
|-------|------:|
| claude-code-vector | 32.25 / 0.966 |
| claude-code-session | 18.24 / 0.781 |
| baseline-grid-16x16 | 17.11 / 0.753 |
| baseline-flat-color | 11.57 / 0.759 |
