"""Narration for the mini-MapTR explainer (one list of beats per scene)."""

NARRATION = {
    "M01_Intro": [
        "In the last video, a toy problem showed that predicting coordinates with bins can beat regression, "
        "when the answer is ambiguous. But your real model is a MapTR style transformer, with queries and "
        "Hungarian matching. Does the effect survive there?",
        "Training MapTR on nuScenes would cost at least tens of dollars of GPU time. So first, a free test: "
        "a miniature MapTR, small enough to train on a laptop CPU.",
    ],
    "M02_World": [
        "Here's the miniature world. Each image is sixty four by sixty four pixels, with one to three shapes "
        "drawn in it. Some are open curves. Others are closed loops.",
        "The model has to output each shape as sixteen points, plus a label: open, or closed. That's exactly "
        "what MapTR does with lane dividers and pedestrian crossings.",
    ],
    "M03_Model": [
        "The model is MapTR in miniature. A small convolutional network turns the image into features. "
        "Twelve queries read those features through a transformer decoder.",
        "Each query outputs a class, and sixteen points. And here is the only thing we change. The baseline "
        "outputs each coordinate as one number, trained with L1. The bin head outputs a histogram of sixty four "
        "bins for each coordinate, trained with cross entropy.",
    ],
    "M04_Matching": [
        "Which query should predict which shape? Hungarian matching pairs them up, using a cost for every "
        "possible pair.",
        "But the same shape can be written down in several ways. An open curve can run in either direction. "
        "A closed loop can start at any of its sixteen points, and go either way round. That's thirty two "
        "equivalent orderings. The cost uses whichever ordering fits best, just like MapTR.",
        "For the bin head, we try two matching costs. The same L1 distance, computed on the decoded points. "
        "Or the negative log likelihood: how little probability the histograms put on the true points.",
    ],
    "M05_Score": [
        "To score it, we use MapTR's own metric. A predicted shape counts as correct if its Chamfer distance to "
        "a true shape is under a threshold: one, two, or three pixels. Averaging the precision over those "
        "thresholds gives the m A P.",
        "We also track how often the matching changes its mind: the fraction of shapes whose matched query "
        "changes between checkpoints. Each setup was trained three times, for eight thousand steps.",
    ],
}
