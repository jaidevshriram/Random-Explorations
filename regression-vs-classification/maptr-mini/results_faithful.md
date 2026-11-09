# MapTR-faithful mini: results

## Clean labels

| head | seeds | final mAP | AP@1px | AP@2px | AP@3px | closed-loop median error (px) | mAP at step 2000 | mean flip rate, first half |
|---|---|---|---|---|---|---|---|---|
| bins (CE weight 0.03) | 3 | 0.667 ± 0.004 | 0.442 ± 0.010 | 0.719 ± 0.004 | 0.841 ± 0.005 | 0.58 ± 0.01 | 0.365 ± 0.004 | 0.327 ± 0.017 |
| L1 regression (MapTR) | 3 | 0.680 ± 0.009 | 0.475 ± 0.006 | 0.733 ± 0.012 | 0.830 ± 0.011 | 0.59 ± 0.03 | 0.460 ± 0.003 | 0.303 ± 0.013 |

## Double lines (ambiguous labels)

| head | seeds | final mAP | AP@1px | AP@2px | AP@3px | closed-loop median error (px) | mAP at step 2000 | mean flip rate, first half |
|---|---|---|---|---|---|---|---|---|
| bins (CE weight 0.03) | 3 | 0.564 ± 0.004 | 0.366 ± 0.001 | 0.548 ± 0.006 | 0.778 ± 0.011 | 0.61 ± 0.01 | 0.360 ± 0.005 | 0.349 ± 0.009 |
| L1 regression (MapTR) | 3 | 0.600 ± 0.008 | 0.358 ± 0.016 | 0.645 ± 0.010 | 0.796 ± 0.003 | 0.66 ± 0.06 | 0.423 ± 0.004 | 0.294 ± 0.016 |

## Double lines: per-class AP and where the predictions land (mean ± std over seeds)

| metric | L1 | bins |
|---|---|---|
| AP_open@1px | 0.054 ± 0.005 | 0.002 ± 0.000 |
| AP_open@2px | 0.393 ± 0.013 | 0.167 ± 0.010 |
| AP_open@3px | 0.631 ± 0.002 | 0.578 ± 0.018 |
| AP_closed@1px | 0.663 ± 0.027 | 0.730 ± 0.003 |
| AP_closed@2px | 0.896 ± 0.009 | 0.929 ± 0.009 |
| AP_closed@3px | 0.961 ± 0.005 | 0.978 ± 0.005 |
| open_curves | 969.667 ± 3.300 | 972.333 ± 6.650 |
| fraction_curves_closer_to_a_stroke_than_midline | 0.819 ± 0.018 | 0.466 ± 0.009 |
| median_chamfer_to_nearest_stroke_px | 1.381 ± 0.026 | 2.209 ± 0.005 |
| median_chamfer_to_midline_px | 2.451 ± 0.026 | 2.095 ± 0.026 |
| points_on_majority_stroke | 0.875 ± 0.002 | 0.773 ± 0.002 |
| points_within_1px_of_a_stroke | 0.674 ± 0.012 | 0.386 ± 0.010 |
| points_within_1px_of_midline | 0.151 ± 0.010 | 0.356 ± 0.009 |
