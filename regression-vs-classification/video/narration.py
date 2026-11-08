"""Narration, one list of beats per scene. Each beat becomes one audio clip; the scene
animates in sync with it. Edit the text here and re-run make_video.py."""

NARRATION = {
    "S01_Intro": [
        'Suppose a neural network has to output a number. Say, the x coordinate of one point on a vector shape.',
        'The obvious approach is regression. Output the number directly, and penalize its distance to the label.',
        'A popular alternative sounds almost wasteful. Chop the range into bins, and treat the problem as classification.',
        "Why would throwing away precision ever help? Here's a hint. When the right answer is ambiguous, regression can confidently predict a value that is never right, while bins keep both answers. To see why, let's look at what each loss is actually asking for.",
    ],
    "S02_Springs": [
        "Freeze the input, and look at every training label that goes with it. Here they're tightly clustered. The prediction, this yellow marker, is a single number.",
        'Squared error, or L2, connects the prediction to every label with a spring. The farther away a label is, the harder its spring pulls. The arrow underneath shows the total pull. The prediction slides until the pulls cancel out, and that point is the mean.',
        "Now make the labels ambiguous. For the very same input, seventy percent of the labels say the point is up here, and thirty percent say it's down there.",
        'The springs still cancel at the mean, and the mean lands right in the gap. A value that no label ever had.',
        "This isn't a training bug. Plot the average loss for every possible prediction, and the bottom of the bowl really is in the gap. L2 found exactly what it was asked for.",
    ],
    "S03_Ropes": [
        'Absolute error, or L1, swaps the springs for ropes, and every rope pulls with the same force, no matter how far away its label is.',
        "So it becomes a vote. Twenty eight ropes pull right, twelve pull left, and the prediction gets dragged all the way into the majority cluster. That's the median.",
        'But at fifty fifty, the vote is tied everywhere in between. The loss goes completely flat, and the prediction just drifts wherever initialization and noise happen to leave it.',
        "Here's the same story as a picture of how hard each loss pushes. L2's push grows with the error, so one wild outlier can dominate. L1 pushes equally hard at any distance. Hoober loss is spring-like up close, and rope-like far away.",
    ],
    "S04_Bins": [
        'Classification does something different. Cut the range into bins, and give every bin its own score. A soft max turns those scores into probabilities.',
        'Cross entropy rewards putting probability on whichever bin the label falls into. Each label nudges its own bin up, and takes a little probability away from all the others.',
        "So there's no tug of war over a single number. The seventy percent and the thirty percent push up different bins, and both peaks grow, until each bin's probability matches the fraction of labels that land in it. The network learns the whole histogram.",
        'One refinement. Instead of a one-hot target, spread each label over its neighbors as a small Gaussian. That tells the network that neighboring bins are almost the same answer.',
    ],
    "S05_Decode": [
        'But in the end we still need one number. If we take the most likely bin, the arg max, we commit to one peak, and that is always a real answer.',
        "If instead we take the expected value, the probability weighted average, we're finding the balance point of the histogram.",
        'And the balance point is the mean. Right back in the gap. Exactly the L2 answer.',
        "The expected value isn't useless, though. Let's zoom into one peak. The true value sits between two bin centers. The arg max can only land on a bin's center, so it misses a little. But the average inside the peak lands right on the true value.",
        'So the best recipe is: pick the peak, then average inside it.',
    ],
    "S06_Results": [
        "Now let's see it on real training runs. Until now we froze a single input. Here, the input x varies along the horizontal axis, and the label y is on the vertical axis.",
        'Each vertical slice of this plot is one of the number lines from before. Take the slice at x equals zero point eight seven five. Its labels pile up in two places: two possible answers.',
        'The plot has four regions. First, one clean answer. Then one answer with a few junk labels. Then two answers, seventy thirty. And finally two answers, fifty fifty.',
        "Here's the network trained with L2. It's fine while there's one answer. But as soon as there are two, it falls into the gap between them, just like the springs predicted.",
        "Trained with L1, it follows the majority answer at seventy thirty. But at fifty fifty it's a coin toss. Here are three training runs: they land in three different places, all off the curves.",
        'The bin head predicts a whole histogram at every x. Brighter means more probability. It lights up both curves. On our slice, it has two peaks, right where the labels are.',
        'Its arg max picks one peak at each x. In the fifty fifty region it jumps back and forth between the curves, but every point it picks is on a real curve, never in the gap.',
        "Here's how far each prediction lands from the nearest correct answer, in the two ambiguous regions. We measure distance to the nearest answer, because a prediction in the gap is useless, even if it's halfway between two right answers. L2 is off by zero point one seven. L1 by zero point zero four. The bins by zero point zero zero two. That's about eighty five times better than L2, and twenty times better than L1.",
    ],
    "S08_LetterO": [
        "Now let's move to two dimensions, which is closer to your vector shapes. Picture the letter O. It has an outer ring, and an inner ring.",
        'The input is a position along the path. The output is a point, with an x and a y coordinate. Going around the O, we use the same four regions as before, one per quarter: clean labels, junk labels, seventy thirty, and fifty fifty. In the last two, the two answers are the outer ring and the inner ring.',
        'Look at the fifty fifty quarter. For the very same input, half of the labels put the point on the outer ring, and half put it on the inner ring.',
        "Here's L2, quarter by quarter. With clean labels, it follows the outer ring. The junk labels pull it inward a little. At seventy thirty, it lands seventy percent of the way out. And at fifty fifty, exactly halfway between the rings, where the letter has no ink at all.",
        "The bin head lands on the real rings. Except for these few strays, all in the fifty fifty quarter. Let's zoom in and see where they come from.",
        'This is one input, in that quarter. The model has one histogram for x, along the bottom, and a separate histogram for y, on the left. Each has two peaks: one for the outer ring, and one for the inner ring.',
        "Because x and y are picked separately, any combination is possible. That's four points. Two of them are real. The other two take the outer ring's x and the inner ring's y. They're ghosts, on neither ring.",
        'A single histogram over x and y together only puts probability on the two real points. The ghosts are gone. But that histogram has a cost.',
    ],
    "S07_CoarseFine": [
        'At two hundred fifty six bins per axis, a joint histogram over x and y has sixty five thousand bins, for every point. That brings back our question about multi-level bins. The idea is to pick in two steps. First, which of sixteen coarse bins.',
        'Then zoom into that coarse bin, and pick one of sixteen fine bins inside it.',
        'If every coarse bin gets its own fine histogram, the two steps together are exactly one big softmax with two hundred fifty six bins. Nothing is lost.',
        "A cheaper version uses one fine histogram for all coarse bins. Here's the catch. Our two answers sit in different coarse bins, and at different spots inside them. Answer A is near the left of its bin. Answer B is near the right of its bin.",
        "A single shared fine histogram has to hold both spots at once. So we can end up with answer A's coarse bin, combined with answer B's spot. That point is neither answer.",
        "So, in one dimension, a two hundred fifty six way softmax is cheap, and you don't need this. It's worth it when one softmax would be huge, like the joint x y histogram: pick x first, then y given x. And always let the fine choice depend on the coarse one.",
    ],
    "S09_Summary": [
        'Back to your vector model. Each query predicts a whole shape. Early in training, the Hungarian matching keeps changing its mind. In one batch, this query is matched to the circle. In the next, to the square.',
        "That's the same ambiguity as before, now for a whole shape. Regression averages the two targets, and predicts a blob that is neither shape.",
        'What would bins do? Look at one point of the shape. Its histogram has two peaks: one where the circle puts that point, and one where the square puts it.',
        "But if every point picks its own peak separately, some points come from the circle, and others from the square. You get a chimera that's neither shape. It's the ghost problem again, now for whole shapes.",
        'So when the whole shape is ambiguous, the points have to decide together. Decode the shape jointly, or one point at a time, so that once the first point picks the circle, every later point follows. Making the matching itself more stable helps too.',
        'So. L2 predicts the mean. L1 predicts the median. Bins learn the whole distribution. Decode by taking the peak, then averaging inside it. And whenever choices have to agree, like x and y, or the points of a shape, decide them together.',
    ],
}

# Some words are spelled phonetically above so the TTS voice says them right;
# subtitles use the real spelling.
SPELLING = {"Hoober": "Huber", "arg max": "argmax", "soft maxes": "softmaxes", "soft max": "softmax"}


def subtitle(text):
    for spoken, written in SPELLING.items():
        text = text.replace(spoken, written)
    return text
