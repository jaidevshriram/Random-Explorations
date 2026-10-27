"""Narration, one list of beats per scene. Each beat becomes one audio clip; the scene
animates in sync with it. Edit the text here and re-run make_video.py."""

NARRATION = {
    "S01_Intro": [
        "Suppose a neural network has to output a number. Say, the x coordinate of one point on a vector shape.",
        "The obvious approach is regression. Output the number directly, and penalize its distance to the label.",
        "A popular alternative sounds almost wasteful. Chop the range into bins, and treat the problem as classification.",
        "Why would throwing away precision ever help? To see it, we have to look at what each loss is actually asking for.",
    ],
    "S02_Springs": [
        "Freeze the input, and look at every training label that goes with it. Here they're tightly clustered. "
        "The prediction, this yellow marker, is a single number.",
        "Squared error, or L2, connects the prediction to every label with a spring. The farther away a label is, "
        "the harder its spring pulls. The prediction settles where all the pulls cancel out. That's the mean.",
        "Now make the labels ambiguous. For the very same input, seventy percent of the labels say the point is "
        "up here, and thirty percent say it's down there.",
        "The springs still cancel at the mean, and the mean lands right in the gap. A value that no label ever had.",
        "This isn't a training bug. Plot the average loss for every possible prediction, and the bottom of the "
        "bowl really is in the gap. L2 found exactly what it was asked for.",
    ],
    "S03_Ropes": [
        "Absolute error, or L1, swaps the springs for ropes, and every rope pulls with the same force, "
        "no matter how far away its label is.",
        "So it becomes a vote. Twenty eight ropes pull right, twelve pull left, and the prediction gets dragged "
        "all the way into the majority cluster. That's the median.",
        "But at fifty fifty, the vote is tied everywhere in between. The loss goes completely flat, and the "
        "prediction just drifts wherever initialization and noise happen to leave it.",
        "Here's the same story as a picture of how hard each loss pushes. L2's push grows with the error, so one "
        "wild outlier can dominate. L1 pushes equally hard at any distance. Huber loss is spring-like up close, "
        "and rope-like far away.",
    ],
    "S04_Bins": [
        "Classification does something different. Cut the range into bins, and give every bin its own score. "
        "A softmax turns those scores into probabilities.",
        "Cross entropy rewards putting probability on whichever bin the label falls into. "
        "Each label nudges up its own bin, and nothing else.",
        "So there's no tug of war. The seventy percent and the thirty percent push on different bins, and both "
        "peaks simply grow. The network learns the whole histogram.",
        "One refinement. Instead of a one-hot target, spread each label over its neighbors as a small Gaussian. "
        "That tells the network that neighboring bins are almost the same answer.",
    ],
    "S05_Decode": [
        "But in the end we still need one number. If we take the most likely bin, the argmax, we commit to one "
        "peak, and that is always a real answer.",
        "If instead we take the expected value, the probability weighted average, we're finding the balance point "
        "of the histogram.",
        "And the balance point is the mean. Right back in the gap. Exactly the L2 answer.",
        "The expected value isn't useless, though. Inside a single peak it interpolates between bins, and it's "
        "more precise than argmax. So the best recipe is: pick the peak, then average within it.",
    ],
    "S06_Results": [
        "Here's what that looks like for real. The same small network, trained on four regions: clean labels, "
        "outliers, seventy thirty, and fifty fifty.",
        "With L2, the prediction falls into the gap as soon as the labels become ambiguous.",
        "L1 sticks with the majority, then drifts once the split is even.",
        "The bin head lights up both curves. Its argmax hops between them, but every point it lands on is a correct "
        "answer. In the ambiguous regions, its error is about a hundred times smaller.",
    ],
    "S07_CoarseFine": [
        "What about very many bins? Two-level bins first choose one of sixteen coarse bins, then one of sixteen "
        "fine bins inside it.",
        "If the fine choice depends on the coarse one, this is just the same two hundred fifty six way softmax, "
        "factored into two steps. Same loss, same results.",
        "But if one fine distribution is shared by every coarse bin, the two modes have to agree on where they sit "
        "inside their bins. When they don't, one of them borrows the other's position, and lands in the wrong place.",
    ],
    "S08_LetterO": [
        "Now, two dimensions, which is closer to vector graphics. A point travels around the letter O. In some "
        "stretches, it might belong to the outer contour, or to the inner one.",
        "L2 averages the two possibilities, and draws a phantom ring between them. A contour that doesn't exist.",
        "The bin head mostly snaps onto a real contour. But look closely at the fifty fifty stretch.",
        "With separate softmaxes for x and for y, each axis makes its own choice. Their product puts probability "
        "on four corners. Two real points, and two ghosts: x from the outer point, y from the inner one.",
        "A single softmax over x y cells can say, this point, or that point. And the ghosts disappear.",
    ],
    "S09_Summary": [
        "Back to the vector model. With Hungarian matching, early in training, a query gets matched to different "
        "shapes from one batch to the next. That's an ambiguous target, and regression responds by averaging "
        "the shapes together.",
        "A bin head can hold several hypotheses while the matching settles, and commit later.",
        "So. L2 predicts the mean. L1 predicts the median. Bins learn the whole distribution. Then decode with care: "
        "take the peak, refine inside it, and watch out for ghosts.",
    ],
}
