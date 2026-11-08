"""Manim scenes for the regression-vs-classification explainer. Rendered by make_video.py,
which first generates the narration clips that each scene syncs to."""
import json
import os
import sys
import wave

import numpy as np
from manim import *

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from narration import NARRATION, subtitle  # noqa: E402

BUILD = os.path.join(HERE, "build")
AUDIO = os.path.join(BUILD, "audio")
DATA = np.load(os.path.join(HERE, "video_data.npz"))

config.background_color = "#121418"
C_L2, C_L1, C_HUB, C_BIN = "#FC6255", "#FF9F43", "#C5D86D", "#58C4DD"
C_Y, C_LAB, C_GOOD, C_GHOST = "#FFD93D", "#A0A4AB", "#83C167", "#FF5C8A"
REGION_COLORS = ["#83C167", "#58C4DD", "#FF9F43", "#FC6255"]
R_OUTER, R_INNER = 0.38, 0.14


def wav_duration(path):
    with wave.open(path) as w:
        return w.getnframes() / w.getframerate()


class NScene(Scene):
    """A scene narrated beat by beat: say() starts the next clip and returns its length,
    sync() waits until it has finished."""

    def setup(self):
        self._beat, self._end, self._timing = 0, 0.0, []

    def say(self):
        name, i = type(self).__name__, self._beat
        if i == 0:
            self.wait(0.7)
        self._beat += 1
        path = os.path.join(AUDIO, f"{name}_{i}.wav")
        d = wav_duration(path)
        t = self.renderer.time
        self.add_sound(path)
        self._timing.append((t, t + d, subtitle(NARRATION[name][i])))
        self._end = t + d
        return d

    def sync(self, pad=0.45):
        rest = self._end + pad - self.renderer.time
        if rest > 0.02:
            self.wait(rest)

    def tear_down(self):
        os.makedirs(os.path.join(BUILD, "timing"), exist_ok=True)
        with open(os.path.join(BUILD, "timing", f"{type(self).__name__}.json"), "w") as f:
            json.dump(self._timing, f)


# ----------------------------------------------------------------------------- helpers


def number_line(y=-2.6, length=11.5):
    return NumberLine(x_range=[0, 1, 0.1], length=length, color=GREY_B, tick_size=0.05).shift(y * UP)


def dot_plot(nl, values, base=0.22, step=0.15):
    """Stacked dot plot positions above a number line (values must be sorted)."""
    cols, out = {}, []
    y0 = nl.n2p(0)[1]
    for v in values:
        c = int(round(nl.n2p(v)[0] / step))
        k = cols.get(c, 0)
        cols[c] = k + 1
        out.append(np.array([c * step, y0 + base + k * step, 0]))
    return out


def marker(nl, tracker, color=C_Y):
    def build():
        p = nl.n2p(tracker.get_value())
        tri = Triangle(color=color, fill_opacity=1, stroke_width=0).scale(0.13).move_to(p + 0.22 * DOWN)
        lab = MathTex(r"\hat y", color=color).scale(0.8).move_to(p + 0.62 * DOWN)
        return VGroup(tri, lab)

    return always_redraw(build)


def spring(a, b, coils=9, amp=0.07, **kw):
    a, b = np.array(a, dtype=float), np.array(b, dtype=float)
    d = b - a
    L = np.linalg.norm(d)
    if L < 1e-3:
        return VMobject()
    u = d / L
    n = np.array([-u[1], u[0], 0])
    m = 2 * coils
    amp = amp * min(1.0, L / 1.2)
    pts = [a] + [a + d * (0.12 + 0.76 * j / m) + n * (amp * (1 if j % 2 else -1) if 0 < j < m else 0)
                 for j in range(m + 1)] + [b]
    return VMobject(**kw).set_points_as_corners(pts)


def springs(nl, tracker, dots):
    def build():
        p = nl.n2p(tracker.get_value())
        g = VGroup()
        for d in dots:
            L = np.linalg.norm(d.get_center() - p)
            g.add(spring(p, d.get_center(), stroke_width=1.6 + 0.8 * min(L / 4, 1),
                         stroke_color=interpolate_color(ManimColor(C_BIN), ManimColor(C_L2), min(L / 4.5, 1)),
                         stroke_opacity=0.75))
        return g.set_z_index(-1)

    return always_redraw(build)


def ropes(nl, tracker, dots):
    def build():
        p = nl.n2p(tracker.get_value())
        return VGroup(*[Line(p, d.get_center(), stroke_width=1.6, color=C_L1, stroke_opacity=0.6) for d in dots]).set_z_index(-1)

    return always_redraw(build)


def landscape_axes(nl, y_bottom=0.25, height=2.0):
    ax = Axes(x_range=[0, 1, 1], y_range=[0, 1.05, 1], x_length=nl.get_length(), y_length=height, tips=False,
              axis_config={"color": GREY_D, "include_ticks": False})
    ax.shift(nl.n2p(0) - ax.c2p(0, 0)).shift((y_bottom - nl.n2p(0)[1]) * UP)
    return ax


def expected_loss(values, kind):
    v = np.asarray(values)

    def f(x):
        r = x - v
        return np.mean(r ** 2) if kind == "l2" else np.mean(np.abs(r))

    xs = np.linspace(0, 1, 401)
    ys = np.array([f(x) for x in xs])
    lo, hi = ys.min(), ys.max()
    return lambda x: (f(x) - lo) / (hi - lo)


def bars_from(nl, probs, height, color=C_BIN, gap=0.12, opacity=0.85):
    k = len(probs)
    w = nl.get_length() / k
    g = VGroup()
    for i, p in enumerate(probs):
        h = max(float(p) * height, 0.002)
        r = Rectangle(width=w * (1 - gap), height=h, stroke_width=0, fill_color=color, fill_opacity=opacity)
        r.move_to(nl.n2p((i + 0.5) / k), aligned_edge=DOWN).shift(0.02 * UP)
        g.add(r)
    return g


def polyline(ax, xs, ys, **kw):
    return VMobject(**kw).set_points_as_corners([ax.c2p(x, y) for x, y in zip(xs, ys)])


def mixture_hist(k, w=(0.3, 0.7), mu=(0.28, 0.75), sd=0.03):
    c = (np.arange(k) + 0.5) / k
    p = sum(wi * np.exp(-0.5 * ((c - m) / sd) ** 2) for wi, m in zip(w, mu))
    return p / p.sum()


def heat_image(arr, cmap_rgb, gamma=0.5):
    """arr[x, y] -> RGBA image with y up."""
    a = (arr / arr.max()) ** gamma
    a = np.flipud(a.T)
    img = np.zeros((*a.shape, 4), dtype=np.uint8)
    img[..., :3] = cmap_rgb(a)
    img[..., 3] = (np.clip(a * 2.5, 0, 1) * 255).astype(np.uint8)
    return img


def magma_like(a):
    stops = np.array([[0, 0, 4], [80, 18, 123], [182, 54, 121], [251, 136, 97], [252, 253, 191]], dtype=float)
    x = a * (len(stops) - 1)
    i = np.clip(x.astype(int), 0, len(stops) - 2)
    f = (x - i)[..., None]
    return (stops[i] * (1 - f) + stops[i + 1] * f).astype(np.uint8)


# ----------------------------------------------------------------------------- scenes


class S01_Intro(NScene):
    def construct(self):
        title = Tex(r"Regression vs.\ Classification", font_size=64)
        sub = Tex(r"for predicting continuous numbers", font_size=36, color=GREY_B).next_to(title, DOWN)
        self.add(title, sub)
        self.wait(0.8)

        # beat 0: a vector shape, one point, its x coordinate
        d = self.say()
        anchors = [(-2.2, -0.6), (-1.6, 1.1), (0.0, 1.7), (1.5, 1.2), (2.3, -0.2), (1.2, -1.4), (-0.6, -1.5)]
        shape = VMobject(color=WHITE, stroke_width=4).set_points_smoothly([np.array([x, y, 0]) for x, y in anchors + anchors[:1]])
        shape.shift(0.6 * UP)
        pts = VGroup(*[Dot(np.array([x, y + 0.6, 0]), color=C_BIN, radius=0.07) for x, y in anchors])
        self.play(FadeOut(title), FadeOut(sub), run_time=0.6)
        self.play(Create(shape), LaggedStart(*[FadeIn(p, scale=0.5) for p in pts], lag_ratio=0.15), run_time=d * 0.35)
        target = pts[3]
        nl = number_line(y=-2.7, length=10)
        nl_lab = MathTex("x", color=GREY_B).next_to(nl, RIGHT)
        xval = 0.5 + target.get_center()[0] / 10
        drop = DashedLine(target.get_center(), nl.n2p(xval), color=C_Y)
        q = MathTex(r"x = \,?", color=C_Y).next_to(nl.n2p(xval), DOWN)
        self.play(target.animate.scale(1.8).set_color(C_Y), Create(nl), FadeIn(nl_lab), run_time=1)
        self.play(Create(drop), Write(q), run_time=1.2)
        self.sync()

        # beat 1: regression
        d = self.say()
        self.play(FadeOut(VGroup(drop, nl, nl_lab, q)), run_time=0.5)
        art = VGroup(shape, pts)
        self.play(art.animate.scale(0.45).to_corner(UL, buff=0.4), run_time=1)
        net1 = RoundedRectangle(corner_radius=0.2, width=1.8, height=1.2, color=GREY_B).shift(LEFT * 1.6 + UP * 1.0)
        net1_l = Tex("network").scale(0.7).move_to(net1)
        arr1 = Arrow(net1.get_right(), net1.get_right() + 2.2 * RIGHT, color=GREY_B)
        out1 = MathTex(r"\hat y = 0.62", color=C_Y).next_to(arr1, RIGHT)
        loss1 = MathTex(r"\mathcal{L} = (\hat y - y)^2", r"\;\text{ or }\;", r"|\hat y - y|").scale(0.8).next_to(out1, DOWN, buff=0.35)
        loss1[0].set_color(C_L2)
        loss1[2].set_color(C_L1)
        lab1 = Tex("Regression", color=C_L2).next_to(net1, UP)
        self.play(FadeIn(net1), Write(net1_l), Write(lab1), run_time=1)
        self.play(GrowArrow(arr1), Write(out1), run_time=1)
        self.play(Write(loss1), run_time=1.5)
        self.sync()

        # beat 2: classification
        d = self.say()
        net2 = net1.copy().shift(3.3 * DOWN)
        net2_l = Tex("network").scale(0.7).move_to(net2)
        arr2 = Arrow(net2.get_right(), net2.get_right() + 2.2 * RIGHT, color=GREY_B)
        mini = NumberLine(x_range=[0, 1, 0.1], length=4, color=GREY_B, tick_size=0.04).next_to(arr2, RIGHT).shift(0.5 * DOWN)
        probs = mixture_hist(20, w=(0.0, 1.0), mu=(0.3, 0.62), sd=0.07)
        bars = bars_from(mini, probs, 6)
        lab2 = Tex("Classification", color=C_BIN).next_to(net2, UP)
        loss2 = MathTex(r"\mathcal{L} = -\log p_{\text{bin}(y)}", color=C_BIN).scale(0.8).next_to(mini, DOWN, buff=0.3)
        self.play(FadeIn(net2), Write(net2_l), Write(lab2), run_time=1)
        self.play(GrowArrow(arr2), Create(mini), run_time=1)
        self.play(LaggedStart(*[GrowFromEdge(b, DOWN) for b in bars], lag_ratio=0.05), run_time=1.6)
        self.play(Write(loss2), run_time=1.2)
        self.sync()

        # beat 3: the question
        d = self.say()
        everything = VGroup(art, net1, net1_l, arr1, out1, loss1, lab1, net2, net2_l, arr2, mini, bars, lab2, loss2)
        self.play(FadeOut(everything), run_time=1)
        qn = Tex(r"What does each loss\\ \emph{actually} ask for?", font_size=60)
        self.play(Write(qn), run_time=2)
        self.sync(pad=0.8)


class S02_Springs(NScene):
    def construct(self):
        rng = np.random.default_rng(3)
        nl = number_line()
        title = Tex(r"L2 loss: springs", color=C_L2, font_size=46).to_corner(UL)
        clustered = np.sort(np.clip(0.42 + 0.06 * rng.standard_normal(40), 0, 1))
        bimodal = np.sort(np.concatenate([0.27 + 0.018 * rng.standard_normal(12), 0.76 + 0.018 * rng.standard_normal(28)]))
        pos1, pos2 = dot_plot(nl, clustered), dot_plot(nl, bimodal)
        dots = VGroup(*[Dot(p, radius=0.06, color=C_LAB) for p in pos1])
        yv = ValueTracker(0.12)
        mk = marker(nl, yv)

        # beat 0
        d = self.say()
        self.play(Create(nl), run_time=0.8)
        lab = Tex("training labels for one input", font_size=30, color=C_LAB).next_to(dots, UP, buff=0.3)
        self.play(LaggedStart(*[FadeIn(dt, shift=0.6 * DOWN) for dt in dots], lag_ratio=0.04), FadeIn(lab), run_time=d * 0.45)
        self.play(FadeIn(mk, shift=0.3 * UP), run_time=0.8)
        self.sync()

        # beat 1: springs, slide to the mean
        d = self.say()
        sp = springs(nl, yv, dots)
        formula = MathTex(r"\mathcal{L}_2 = (\hat y - y)^2", color=C_L2).to_corner(UR)
        self.play(FadeOut(lab), Write(title), Write(formula), run_time=1)
        self.play(Create(sp), run_time=1.5)
        self.play(yv.animate.set_value(clustered.mean()), run_time=d * 0.45, rate_func=smooth)
        mean_lab = Tex("mean", color=C_Y, font_size=32).next_to(mk, DOWN, buff=0.05)
        self.play(FadeIn(mean_lab), run_time=0.5)
        self.sync()

        # beat 2: labels become bimodal
        d = self.say()
        self.play(FadeOut(mean_lab), run_time=0.3)
        self.play(*[dt.animate.move_to(p) for dt, p in zip(dots, pos2)], run_time=d * 0.55, rate_func=smooth)
        b70 = Tex(r"70\%", color=C_LAB, font_size=34).next_to(VGroup(*dots[12:]), UP)
        b30 = Tex(r"30\%", color=C_LAB, font_size=34).next_to(VGroup(*dots[:12]), UP)
        self.play(FadeIn(b70), FadeIn(b30), run_time=0.8)
        self.sync()

        # beat 3: back to the mean, which is in the gap
        d = self.say()
        self.play(yv.animate.set_value(bimodal.mean()), run_time=d * 0.4, rate_func=smooth)
        gap = DashedVMobject(Rectangle(width=2.9, height=1.6, color=C_L2).move_to(nl.n2p(0.5) + 0.9 * UP))
        gap_l = Tex("no label is here", color=C_L2, font_size=30).next_to(gap, UP, buff=0.1)
        self.play(Create(gap), Write(gap_l), run_time=1.2)
        self.sync()

        # beat 4: the loss landscape
        d = self.say()
        self.play(FadeOut(gap), FadeOut(gap_l), FadeOut(b70), FadeOut(b30), run_time=0.5)
        ax = landscape_axes(nl, y_bottom=0.8, height=1.9)
        f = expected_loss(bimodal, "l2")
        curve = ax.plot(f, color=C_L2, stroke_width=4)
        ax_lab = Tex("average loss over the labels", font_size=28, color=GREY_B).next_to(ax.c2p(1, 1.05), LEFT, buff=0)
        self.play(Create(ax), Create(curve), FadeIn(ax_lab), run_time=1.5)
        ball = always_redraw(lambda: Dot(ax.c2p(yv.get_value(), f(yv.get_value())), color=C_Y, radius=0.1))
        self.play(FadeIn(ball), run_time=0.3)
        self.play(yv.animate.set_value(0.08), run_time=1.2)
        self.play(yv.animate.set_value(bimodal.mean()), run_time=2.5, rate_func=rate_functions.ease_out_bounce)
        bottom = Tex(r"bottom of the bowl $=$ mean", font_size=32, color=C_Y).next_to(ax.c2p(bimodal.mean(), 0.15), UP, buff=0.05)
        self.play(FadeIn(bottom), run_time=0.6)
        self.sync(pad=0.8)


class S03_Ropes(NScene):
    def construct(self):
        rng = np.random.default_rng(3)
        rng.standard_normal(40)
        nl = number_line()
        bimodal = np.sort(np.concatenate([0.27 + 0.018 * rng.standard_normal(12), 0.76 + 0.018 * rng.standard_normal(28)]))
        even = np.sort(np.concatenate([0.27 + 0.018 * rng.standard_normal(20), 0.76 + 0.018 * rng.standard_normal(20)]))
        dots = VGroup(*[Dot(p, radius=0.06, color=C_LAB) for p in dot_plot(nl, bimodal)])
        yv = ValueTracker(bimodal.mean())
        mk = marker(nl, yv)
        sp = springs(nl, yv, dots)
        self.add(nl, dots, mk, sp)
        title = Tex(r"L1 loss: ropes", color=C_L1, font_size=46).to_corner(UL)
        formula = MathTex(r"\mathcal{L}_1 = |\hat y - y|", color=C_L1).to_corner(UR)

        # beat 0
        d = self.say()
        rp = ropes(nl, yv, dots)
        self.play(Write(title), Write(formula), run_time=1)
        self.play(FadeOut(sp), FadeIn(rp), run_time=1.5)
        self.sync()

        # beat 1: vote -> median
        d = self.say()

        def votes():
            v = yv.get_value()
            left = sum(dt.get_center()[0] < nl.n2p(v)[0] for dt in dots)
            right = len(dots) - left
            p = nl.n2p(v)
            return VGroup(MathTex(rf"\leftarrow {left}", color=C_L1).scale(0.75).move_to(p + 1.0 * DOWN + 0.75 * LEFT),
                          MathTex(rf"{right} \rightarrow", color=C_L1).scale(0.75).move_to(p + 1.0 * DOWN + 0.75 * RIGHT))

        vt = always_redraw(votes)
        self.play(FadeIn(vt), run_time=0.8)
        self.wait(1.5)
        self.play(yv.animate.set_value(np.median(bimodal)), run_time=d * 0.35, rate_func=smooth)
        med = Tex("median", color=C_Y, font_size=32).next_to(nl.n2p(np.median(bimodal)), DOWN, buff=1.4)
        self.play(FadeIn(med), run_time=0.5)
        self.sync()

        # beat 2: 50/50 -> flat, drifting
        d = self.say()
        self.play(FadeOut(med), run_time=0.3)
        self.play(*[dt.animate.move_to(p) for dt, p in zip(dots, dot_plot(nl, even))], run_time=2)
        ax = landscape_axes(nl, y_bottom=0.8, height=1.9)
        f = expected_loss(even, "l1")
        curve = ax.plot(f, color=C_L1, stroke_width=4)
        flat = Tex("flat!", color=C_L1, font_size=34).next_to(ax.c2p(0.5, 0.05), UP)
        self.play(Create(ax), Create(curve), run_time=1.5)
        ball = always_redraw(lambda: Dot(ax.c2p(yv.get_value(), f(yv.get_value())), color=C_Y, radius=0.1))
        self.play(FadeIn(ball), FadeIn(flat), run_time=0.5)
        for v in (0.36, 0.62, 0.45, 0.68, 0.5):
            self.play(yv.animate.set_value(v), run_time=0.9, rate_func=smooth)
        self.sync()

        # beat 3: gradient magnitude vs error
        d = self.say()
        self.play(*[FadeOut(m) for m in (nl, dots, mk, rp, vt, ax, curve, ball, flat, title, formula)], run_time=0.8)
        g = Axes(x_range=[0, 0.5, 0.1], y_range=[0, 3, 1], x_length=8, y_length=4.6, tips=False,
                 axis_config={"color": GREY_B}).shift(0.3 * DOWN + 1.6 * LEFT)
        gx = Tex(r"error $|\hat y - y|$", font_size=32).next_to(g.x_axis, DOWN)
        gy = Tex(r"how hard it pushes", font_size=32).rotate(PI / 2).next_to(g.y_axis, LEFT)
        head = Tex("How hard does each loss push?", font_size=44).to_edge(UP)
        self.play(Create(g), Write(gx), Write(gy), Write(head), run_time=1.5)
        beta = 0.1
        l2 = g.plot(lambda e: e / beta, x_range=[0, 0.3], color=C_L2, stroke_width=5)
        l1 = g.plot(lambda e: 1.0, x_range=[0, 0.5], color=C_L1, stroke_width=5)
        hub = DashedVMobject(g.plot(lambda e: min(e / beta, 1.0), x_range=[0, 0.5], color=C_HUB, stroke_width=5), num_dashes=40)
        t2 = Tex(r"L2: grows with error", color=C_L2, font_size=32).next_to(g.c2p(0.3, 3), RIGHT)
        t1 = Tex(r"L1: constant", color=C_L1, font_size=32).next_to(g.c2p(0.5, 1), RIGHT).shift(0.25 * UP)
        th = Tex(r"Huber: spring, then rope", color=C_HUB, font_size=32).next_to(g.c2p(0.5, 1), RIGHT).shift(0.3 * DOWN)
        self.play(Create(l2), FadeIn(t2), run_time=2)
        out = Dot(g.c2p(0.28, 2.8), color=C_L2)
        out_l = Tex("an outlier", font_size=28, color=C_L2).next_to(out, LEFT)
        self.play(FadeIn(out), FadeIn(out_l), run_time=0.6)
        self.play(Create(l1), FadeIn(t1), run_time=1.6)
        self.play(Create(hub), FadeIn(th), run_time=1.6)
        self.sync(pad=0.8)


class S04_Bins(NScene):
    def construct(self):
        K = 24
        nl = number_line()
        title = Tex(r"Classification: bins", color=C_BIN, font_size=46).to_corner(UL)
        edges = VGroup(*[Line(nl.n2p(i / K) + 0.0 * UP, nl.n2p(i / K) + 0.18 * UP, color=GREY_C, stroke_width=2) for i in range(K + 1)])
        rng = np.random.default_rng(7)
        first = [0.745, 0.77, 0.29]
        rest = np.where(rng.random(117) < 0.7, 0.76 + 0.02 * rng.standard_normal(117), 0.27 + 0.02 * rng.standard_normal(117))
        labels = np.clip(np.concatenate([first, rest]), 0.001, 0.999)
        n = ValueTracker(0)
        H = 7.0

        def probs():
            k = n.get_value()
            full = int(np.floor(k))
            c = np.bincount((labels[:full] * K).astype(int), minlength=K).astype(float)
            if full < len(labels):
                c[int(labels[full] * K)] += k - full
            p = c + 0.6
            return p / p.sum()

        bars = always_redraw(lambda: bars_from(nl, probs(), H))
        formula = MathTex(r"p_i = \frac{e^{z_i}}{\sum_j e^{z_j}}", color=C_BIN).to_corner(UR)

        # beat 0
        d = self.say()
        self.play(Write(title), Create(nl), run_time=1)
        self.play(Create(edges), run_time=1)
        self.play(FadeIn(bars), Write(formula), run_time=1.5)
        sm = Tex("one probability per bin", font_size=30, color=C_BIN).next_to(nl, UP, buff=0.75)
        self.play(FadeIn(sm), run_time=0.6)
        self.sync()

        # beat 1: a few labels, slowly
        d = self.say()
        self.play(FadeOut(sm), run_time=0.4)
        ce = MathTex(r"\mathcal{L} = -\log p_{\,\text{bin}(y)}", color=C_BIN).next_to(formula, DOWN, aligned_edge=RIGHT)
        self.play(Write(ce), run_time=1)
        for i in range(3):
            dt = Dot(nl.n2p(labels[i]) + 3.6 * UP, color=C_Y, radius=0.08)
            self.play(FadeIn(dt), run_time=0.25)
            self.play(dt.animate.move_to(nl.n2p(labels[i]) + 0.1 * UP), run_time=0.6)
            self.play(FadeOut(dt, scale=0.3), n.animate.set_value(i + 1), run_time=0.7)
        self.sync()

        # beat 2: rain, histogram
        d = self.say()
        rain = []
        for v in labels[3:]:
            dt = Dot(nl.n2p(v) + (3.4 + 0.6 * rng.random()) * UP, color=C_Y, radius=0.05)
            rain.append(dt)
        anims = [dt.animate.move_to(nl.n2p(v) + 0.1 * UP).set_opacity(0) for dt, v in zip(rain, labels[3:])]
        self.add(*rain)
        self.play(LaggedStart(*anims, lag_ratio=0.03, run_time=5.0), n.animate(run_time=5.0, rate_func=linear).set_value(len(labels)))
        self.remove(*rain)
        peaks = [0.27, 0.76]
        ups = VGroup(*[Arrow(nl.n2p(v) + 0.4 * UP, nl.n2p(v) + 1.4 * UP, color=C_GOOD, buff=0).shift(
            (probs()[int(v * K)] * H + 0.2) * UP) for v in peaks])
        msg = Tex("both peaks grow --- no tug of war", font_size=36, color=C_GOOD).to_edge(UP).shift(0.6 * DOWN)
        self.play(FadeOut(ce), FadeOut(formula), run_time=0.4)
        self.play(LaggedStart(*[GrowArrow(a) for a in ups], lag_ratio=0.3), Write(msg), run_time=1.5)
        self.sync()

        # beat 3: soft labels
        d = self.say()
        self.play(FadeOut(ups), FadeOut(msg), run_time=0.6)
        box = RoundedRectangle(width=4.6, height=2.6, corner_radius=0.15, color=GREY_C).move_to(1.7 * UP + 0.2 * RIGHT)
        mini = NumberLine(x_range=[0, 1, 1], length=4.2, color=GREY_B, include_ticks=False).move_to(box.get_bottom() + 0.45 * UP)
        k = 9
        hard = np.zeros(k)
        hard[4] = 1
        soft = np.exp(-0.5 * ((np.arange(k) - 4) / 1.0) ** 2)
        soft /= soft.sum()
        hb = bars_from(mini, hard, 1.6, color=C_Y)
        sb = bars_from(mini, soft, 1.6 * 2.2, color=C_Y)
        t_h = Tex("one-hot target", font_size=30).next_to(box.get_top(), DOWN, buff=0.12)
        t_s = Tex("soft target (HL-Gauss)", font_size=30).next_to(box.get_top(), DOWN, buff=0.12)
        self.play(Create(box), Create(mini), FadeIn(hb), Write(t_h), run_time=1.5)
        self.wait(1.0)
        self.play(Transform(hb, sb), Transform(t_h, t_s), run_time=2)
        self.sync(pad=0.8)


class S05_Decode(NScene):
    def construct(self):
        K = 48
        nl = number_line(y=-1.6)
        p = mixture_hist(K)
        c = (np.arange(K) + 0.5) / K
        mean = float((p * c).sum())
        am = float(c[p.argmax()])
        H = 11.0
        bars = bars_from(nl, p, H)
        title = Tex(r"Decoding: from a histogram to one number", font_size=44).to_edge(UP)
        self.add(nl, bars)

        # beat 0: argmax
        d = self.say()
        self.play(Write(title), run_time=1.2)
        top = bars[int(p.argmax())].get_top()
        arr = Arrow(top + 1.3 * UP, top + 0.1 * UP, color=C_GOOD, buff=0)
        t_am = Tex("argmax", color=C_GOOD, font_size=36).next_to(arr, UP)
        self.play(GrowArrow(arr), Write(t_am), run_time=1.2)
        good = Tex("a real answer", color=C_GOOD, font_size=30).next_to(t_am, RIGHT)
        self.play(FadeIn(good), run_time=0.6)
        self.sync()

        # beat 1: expected value = balance point
        d = self.say()
        self.play(FadeOut(arr), FadeOut(t_am), FadeOut(good), run_time=0.5)
        f = ValueTracker(am)
        beam = VGroup(nl, bars)
        self.remove(nl, bars)

        def tilted():
            ang = float(np.clip((f.get_value() - mean) * 1.3, -0.25, 0.25))
            return beam.copy().rotate(ang, about_point=nl.n2p(f.get_value()))

        tb = always_redraw(tilted)
        fulcrum = always_redraw(lambda: Triangle(color=C_Y, fill_opacity=1, stroke_width=0).scale(0.22).move_to(
            nl.n2p(f.get_value()) + 0.2 * DOWN))
        self.add(tb, fulcrum)
        ev = MathTex(r"\mathbb{E}[\hat y] = \sum_i p_i\, c_i", color=C_Y).to_corner(UR).shift(0.8 * DOWN)
        self.play(FadeIn(fulcrum), Write(ev), run_time=1.0)
        self.wait(0.6)
        self.play(f.animate.set_value(mean), run_time=d * 0.45, rate_func=smooth)
        self.sync()

        # beat 2: it is the mean, in the gap
        d = self.say()
        gap = DashedVMobject(Rectangle(width=3.2, height=2.0, color=C_L2).move_to(nl.n2p(0.48) + 1.1 * UP))
        same = Tex(r"the mean --- same as L2!", color=C_L2, font_size=36).next_to(gap, UP, buff=0.15)
        self.play(Create(gap), Write(same), run_time=1.5)
        self.sync()

        # beat 3: argmax, then local mean
        d = self.say()
        self.play(FadeOut(gap), FadeOut(same), FadeOut(fulcrum), f.animate.set_value(mean), run_time=0.6)
        self.remove(tb)
        self.add(nl, bars)
        win = Rectangle(width=nl.get_length() * 0.14, height=3.2, color=C_GOOD, fill_opacity=0.08).move_to(
            nl.n2p(am) + 1.55 * UP)
        t_win = Tex(r"1.\ pick the peak", color=C_GOOD, font_size=32).next_to(win, UP, buff=0.1)
        self.play(Create(win), Write(t_win), run_time=1.2)
        sel = (np.abs(c - am) < 0.07)
        local = float((p[sel] * c[sel]).sum() / p[sel].sum())
        lm = Triangle(color=C_Y, fill_opacity=1, stroke_width=0).scale(0.15).move_to(nl.n2p(local) + 0.25 * DOWN)
        t_lm = Tex(r"2.\ average inside it", color=C_Y, font_size=32).next_to(lm, DOWN)
        self.play(FadeIn(lm, shift=0.3 * UP), Write(t_lm), run_time=1.2)
        self.sync(pad=0.8)


class S06_Results(NScene):
    def construct(self):
        ax = Axes(x_range=[0, 1, 0.25], y_range=[0, 1, 0.5], x_length=11.5, y_length=5.4, tips=False,
                  axis_config={"color": GREY_C, "include_ticks": False}).shift(0.45 * DOWN)
        xl = MathTex("x", color=GREY_B).next_to(ax.x_axis, DOWN, buff=0.1)
        yl = MathTex("y", color=GREY_B).next_to(ax.y_axis, LEFT, buff=0.1)
        rng = np.random.default_rng(0)
        x = rng.random(700)
        reg = np.minimum((x * 4).astype(int), 3)
        up = 0.72 + 0.07 * np.sin(4 * np.pi * x)
        lo = 0.28 + 0.07 * np.sin(4 * np.pi * x + 1.0)
        pick = rng.random(700) < np.array([0, 0, 0.3, 0.5])[reg]
        y = np.where(pick, lo, up) + 0.015 * rng.standard_normal(700)
        out = (reg == 1) & (rng.random(700) < 0.1)
        y = np.clip(np.where(out, rng.random(700), y), 0, 1)
        pts = VGroup(*[Dot(ax.c2p(a, b), radius=0.018, color=C_LAB, fill_opacity=0.7) for a, b in zip(x, y)])
        divs = VGroup(*[DashedLine(ax.c2p(b, 0), ax.c2p(b, 1), color=GREY_D) for b in (0.25, 0.5, 0.75)])
        names = ["clean", "outliers", r"70/30", r"50/50"]
        rl = VGroup(*[Tex(nm, font_size=30, color=c).next_to(ax.c2p(0.125 + 0.25 * i, 1), UP, buff=0.12)
                      for i, (nm, c) in enumerate(zip(names, REGION_COLORS))])
        gx = np.linspace(0, 1, len(DATA["l2_1d"]))

        # beat 0
        d = self.say()
        self.play(Create(ax), FadeIn(xl), FadeIn(yl), run_time=1)
        self.play(LaggedStart(*[FadeIn(p) for p in pts], lag_ratio=0.002), run_time=2)
        self.play(Create(divs), LaggedStart(*[Write(r) for r in rl], lag_ratio=0.3), run_time=2)
        self.sync()

        # beat 1: L2
        d = self.say()
        l2 = polyline(ax, gx, DATA["l2_1d"], color=C_L2, stroke_width=5)
        t2 = Tex("L2", color=C_L2, font_size=36).next_to(ax.c2p(1, DATA["l2_1d"][-1]), RIGHT)
        self.play(Create(l2), run_time=d * 0.6, rate_func=linear)
        self.play(FadeIn(t2), run_time=0.4)
        self.sync()

        # beat 2: L1
        d = self.say()
        l1 = polyline(ax, gx, DATA["l1_1d"], color=C_L1, stroke_width=5)
        t1 = Tex("L1", color=C_L1, font_size=36).next_to(ax.c2p(1, DATA["l1_1d"][-1]), RIGHT)
        self.play(Create(l1), run_time=d * 0.6, rate_func=linear)
        self.play(FadeIn(t1), run_time=0.4)
        self.sync()

        # beat 3: bins
        d = self.say()
        dens = DATA["bins_density_1d"].astype(np.float32)
        a = dens / dens.max(1, keepdims=True)
        a = np.sqrt(a).T[::-1]  # (256 y, 300 x), y up
        img = np.zeros((*a.shape, 4), dtype=np.uint8)
        img[..., 0], img[..., 1], img[..., 2] = 88, 196, 221
        img[..., 3] = (np.clip(a, 0, 1) * 230).astype(np.uint8)
        im = ImageMobject(img).stretch_to_fit_width(ax.x_length).stretch_to_fit_height(ax.y_length)
        im.move_to(ax.c2p(0.5, 0.5))
        self.play(l2.animate.set_stroke(opacity=0.25), l1.animate.set_stroke(opacity=0.25), t1.animate.set_opacity(0.3),
                  t2.animate.set_opacity(0.3), pts.animate.set_opacity(0.25), run_time=0.8)
        self.play(FadeIn(im), run_time=1.5)
        am = polyline(ax, gx, DATA["bins_am_1d"], color=C_Y, stroke_width=3)
        tb = Tex("bins (argmax)", color=C_Y, font_size=32).to_corner(UR, buff=0.25)
        self.play(Create(am), FadeIn(tb), run_time=d * 0.35, rate_func=linear)
        tab = VGroup(
            Tex(r"error, ambiguous regions:", font_size=30),
            Tex(r"L2 \;0.17", color=C_L2, font_size=30), Tex(r"L1 \;0.04", color=C_L1, font_size=30),
            Tex(r"bins \;0.002", color=C_Y, font_size=30)).arrange(RIGHT, buff=0.4).to_edge(DOWN, buff=0.15)
        self.play(FadeIn(tab), run_time=0.8)
        self.sync(pad=0.8)


class S07_CoarseFine(NScene):
    def construct(self):
        K = 16
        top = number_line(y=1.4, length=12)
        bw = top.get_length() / K
        cells = VGroup(*[Rectangle(width=bw, height=0.45, stroke_color=GREY_C, stroke_width=2).move_to(
            top.n2p((i + 0.5) / K) + 0.225 * UP) for i in range(K)])
        title = Tex("Two-level bins: coarse, then fine", font_size=44).to_edge(UP)
        pc = MathTex(r"p(c)", color=C_BIN).next_to(cells, LEFT, buff=0.15)

        # beat 0
        d = self.say()
        self.play(Write(title), Create(top), Create(cells), run_time=1.5)
        coarse = np.zeros(K)
        coarse[4], coarse[11] = 0.48, 0.52
        cb = VGroup(*[Rectangle(width=bw * 0.8, height=max(1.4 * v, 0.001), stroke_width=0, fill_color=C_BIN,
                                fill_opacity=0.85).move_to(top.n2p((i + 0.5) / K) + 0.47 * UP, aligned_edge=DOWN)
                      for i, v in enumerate(coarse)])
        self.play(FadeIn(cb, shift=0.2 * UP), FadeIn(pc), run_time=1)
        sel = 11
        self.play(cells[sel].animate.set_stroke(C_Y, 4), run_time=0.5)
        big = Rectangle(width=9, height=0.6, stroke_color=C_Y, stroke_width=3).move_to(2.0 * DOWN)
        cone = VGroup(DashedLine(cells[sel].get_corner(DL), big.get_corner(UL), color=C_Y, stroke_width=2),
                      DashedLine(cells[sel].get_corner(DR), big.get_corner(UR), color=C_Y, stroke_width=2))
        fine_lines = VGroup(*[Line(big.get_corner(DL) + RIGHT * 9 * j / K, big.get_corner(UL) + RIGHT * 9 * j / K,
                                   color=GREY_C, stroke_width=1.5) for j in range(1, K)])
        fine = np.exp(-0.5 * ((np.arange(K) - 12) / 0.8) ** 2)
        fine /= fine.sum()
        fb = VGroup(*[Rectangle(width=9 / K * 0.8, height=max(2.6 * v, 0.001), stroke_width=0, fill_color=C_BIN,
                                fill_opacity=0.85).move_to(big.get_corner(UL) + RIGHT * 9 * (j + 0.5) / K, aligned_edge=DOWN)
                      for j, v in enumerate(fine)])
        pf = MathTex(r"p(f \mid c)", color=C_BIN).next_to(big, LEFT, buff=0.2)
        self.play(Create(cone), Create(big), run_time=1)
        self.play(Create(fine_lines), FadeIn(fb, shift=0.2 * UP), FadeIn(pf), run_time=1.5)
        self.sync()

        # beat 1: conditional == one big softmax
        d = self.say()
        eq = MathTex(r"p(c)\,p(f\mid c)", r"\;=\;", r"\text{one 256-way softmax}").next_to(big, DOWN, buff=0.6)
        eq[0].set_color(C_BIN)
        self.play(Write(eq), run_time=2)
        ok = Tex(r"same loss, same results", color=C_GOOD, font_size=34).next_to(eq, DOWN, buff=0.2)
        self.play(FadeIn(ok), run_time=0.8)
        self.sync()

        # beat 2: shared fine distribution borrows the other mode's offset
        d = self.say()
        shared = np.exp(-0.5 * ((np.arange(K) - 4) / 0.8) ** 2) * 0.45 + np.exp(-0.5 * ((np.arange(K) - 12) / 0.8) ** 2) * 0.55
        shared /= shared.sum()
        fb2 = VGroup(*[Rectangle(width=9 / K * 0.8, height=max(2.6 * v * 1.6, 0.001), stroke_width=0, fill_color=C_HUB,
                                 fill_opacity=0.85).move_to(big.get_corner(UL) + RIGHT * 9 * (j + 0.5) / K, aligned_edge=DOWN)
                       for j, v in enumerate(shared)])
        pf2 = MathTex(r"p(f)", r"\text{ shared}", color=C_HUB).scale(0.9).next_to(big, LEFT, buff=0.2)
        self.play(FadeOut(eq), FadeOut(ok), cells[sel].animate.set_stroke(GREY_C, 2), FadeOut(cone), run_time=0.6)
        self.play(Transform(fb, fb2), Transform(pf, pf2), run_time=1.2)
        true_a = Dot(top.n2p((4 + 0.25) / K), color=C_GOOD, radius=0.09)
        true_b = Dot(top.n2p((11 + 0.75) / K), color=C_GOOD, radius=0.09)
        tl = Tex("true answers", color=C_GOOD, font_size=28).next_to(true_b, DOWN, buff=0.25)
        self.play(FadeIn(true_a), FadeIn(true_b), FadeIn(tl), run_time=0.8)
        self.play(cells[4].animate.set_stroke(C_Y, 4), run_time=0.5)
        pred = Cross(scale_factor=0.14, stroke_color=C_L2, stroke_width=6).move_to(top.n2p((4 + 0.75) / K))
        pl = Tex(r"coarse bin 4 $+$ the other mode's offset", color=C_L2, font_size=28).next_to(pred, DOWN, buff=0.3)
        self.play(FadeIn(pred, scale=1.5), Write(pl), run_time=1.5)
        self.play(Indicate(fb[12], color=C_L2), run_time=1.0)
        self.sync(pad=0.8)


class S08_LetterO(NScene):
    def construct(self):
        S = 6.2
        ax = Axes(x_range=[0, 1, 1], y_range=[0, 1, 1], x_length=S, y_length=S, tips=False,
                  axis_config={"color": GREY_D, "include_ticks": False}).shift(3.3 * LEFT + 0.2 * DOWN)
        th = np.linspace(0, 2 * np.pi, 200)
        rings = VGroup(*[polyline(ax, 0.5 + r * np.cos(th), 0.5 + r * np.sin(th), color=GREY_B, stroke_width=2)
                         for r in (R_OUTER, R_INNER)])
        rng = np.random.default_rng(1)
        t = rng.random(450)
        reg = np.minimum((t * 4).astype(int), 3)
        inner = rng.random(450) < np.array([0, 0, 0.3, 0.5])[reg]
        r = np.where(inner, R_INNER, R_OUTER)
        px = 0.5 + r * np.cos(2 * np.pi * t) + 0.01 * rng.standard_normal(450)
        py = 0.5 + r * np.sin(2 * np.pi * t) + 0.01 * rng.standard_normal(450)
        samples = VGroup(*[Dot(ax.c2p(a, b), radius=0.025, color=REGION_COLORS[g], fill_opacity=0.8)
                           for a, b, g in zip(px, py, reg)])
        title = Tex(r"2D: the letter O", font_size=44).to_corner(UL)
        legend = VGroup(*[VGroup(Dot(color=c, radius=0.06), Tex(n, font_size=26)).arrange(RIGHT, buff=0.12)
                          for c, n in zip(REGION_COLORS, ["outer only", r"outer $+$ outliers", r"70/30 outer/inner",
                                                          r"50/50 outer/inner"])]).arrange(DOWN, aligned_edge=LEFT, buff=0.15)
        legend.to_edge(RIGHT, buff=0.8).shift(0.5 * UP)

        # beat 0
        d = self.say()
        self.play(Write(title), Create(rings), run_time=1.5)
        self.play(LaggedStart(*[FadeIn(s) for s in samples], lag_ratio=0.004), FadeIn(legend), run_time=2.5)
        tt = ValueTracker(0)
        traveler = always_redraw(lambda: Dot(ax.c2p(0.5 + R_OUTER * np.cos(2 * np.pi * tt.get_value()),
                                                    0.5 + R_OUTER * np.sin(2 * np.pi * tt.get_value())), color=WHITE, radius=0.1))
        self.add(traveler)
        self.play(tt.animate.set_value(1), run_time=max(d - 4.5, 2), rate_func=linear)
        self.remove(traveler)
        self.sync()

        # beat 1: L2 phantom ring
        d = self.say()
        self.play(samples.animate.set_opacity(0.35), run_time=0.5)
        l2 = DATA["l2_2d"]
        l2c = polyline(ax, l2[:, 0], l2[:, 1], color=C_L2, stroke_width=5)
        tl2 = Tex("L2", color=C_L2, font_size=40).next_to(legend, DOWN, buff=0.6, aligned_edge=LEFT)
        self.play(Create(l2c), FadeIn(tl2), run_time=d * 0.55, rate_func=linear)
        ph = Tex("a phantom ring", color=C_L2, font_size=32).next_to(tl2, DOWN, aligned_edge=LEFT)
        self.play(FadeIn(ph), run_time=0.6)
        self.sync()

        # beat 2: bins argmax
        d = self.say()
        self.play(l2c.animate.set_stroke(opacity=0.2), FadeOut(ph), tl2.animate.set_opacity(0.3), run_time=0.5)
        bp = DATA["bins_am_2d"]
        bdots = VGroup(*[Dot(ax.c2p(a, b), radius=0.04, color=C_Y) for a, b in bp])
        tb = Tex("bins, argmax", color=C_Y, font_size=36).next_to(tl2, DOWN, aligned_edge=LEFT)
        self.play(LaggedStart(*[FadeIn(b) for b in bdots], lag_ratio=0.01), FadeIn(tb), run_time=d * 0.5)
        quad = Rectangle(width=S * 0.5, height=S * 0.5, color=C_GHOST).move_to(ax.c2p(0.75, 0.25))
        self.play(Create(quad), run_time=1.0)
        self.sync()

        # beat 3: ghosts from p(x) p(y)
        d = self.say()
        left = VGroup(ax, rings, samples, l2c, bdots, quad)
        self.play(FadeOut(legend), FadeOut(tl2), FadeOut(tb), left.animate.scale(0.62).to_edge(LEFT, buff=0.4).shift(0.3 * DOWN),
                  run_time=1.0)
        G = 4.6
        g = DATA["ghost_factored"].astype(np.float64)
        img = ImageMobject(heat_image(g, magma_like)).stretch_to_fit_width(G).stretch_to_fit_height(G)
        img.move_to(RIGHT * 3.2 + 0.1 * DOWN)
        frame = Rectangle(width=G, height=G, color=GREY_C).move_to(img)

        def to_img(x, y):
            return img.get_corner(DL) + np.array([x * G, y * G, 0])

        px_m, py_m = g.sum(1), g.sum(0)
        px_b = px_m.reshape(64, 4).sum(1)
        py_b = py_m.reshape(64, 4).sum(1)
        bx = VGroup(*[Rectangle(width=G / 64, height=0.9 * v / px_b.max(), stroke_width=0, fill_color=C_BIN, fill_opacity=0.9)
                      .move_to(to_img((i + 0.5) / 64, 0) + 0.12 * DOWN, aligned_edge=UP) for i, v in enumerate(px_b)])
        by = VGroup(*[Rectangle(height=G / 64, width=0.9 * v / py_b.max(), stroke_width=0, fill_color=C_BIN, fill_opacity=0.9)
                      .move_to(to_img(0, (i + 0.5) / 64) + 0.12 * LEFT, aligned_edge=RIGHT) for i, v in enumerate(py_b)])
        lx = MathTex(r"p(x)", color=C_BIN).scale(0.8).next_to(bx, DOWN, buff=0.1)
        ly = MathTex(r"p(y)", color=C_BIN).scale(0.8).next_to(by, LEFT, buff=0.1)
        self.play(FadeIn(bx, shift=0.2 * UP), FadeIn(by, shift=0.2 * RIGHT), Write(lx), Write(ly), run_time=1.5)
        prod = MathTex(r"p(x)\,p(y)", color=WHITE).scale(0.9).next_to(frame, UP, buff=0.15)
        self.play(FadeIn(img), Create(frame), Write(prod), run_time=1.5)
        tq = 0.875
        outer = (0.5 + R_OUTER * np.cos(2 * np.pi * tq), 0.5 + R_OUTER * np.sin(2 * np.pi * tq))
        innr = (0.5 + R_INNER * np.cos(2 * np.pi * tq), 0.5 + R_INNER * np.sin(2 * np.pi * tq))
        real = VGroup(*[Circle(radius=0.22, color=C_GOOD, stroke_width=4).move_to(to_img(*p)) for p in (outer, innr)])
        ghosts = VGroup(*[Circle(radius=0.22, color=C_GHOST, stroke_width=4).move_to(to_img(*p))
                          for p in ((outer[0], innr[1]), (innr[0], outer[1]))])
        tr = Tex("real", color=C_GOOD, font_size=28).next_to(real[0], DOWN, buff=0.08)
        tg = Tex("ghost", color=C_GHOST, font_size=28).next_to(ghosts[0], UP, buff=0.08)
        self.play(Create(real), FadeIn(tr), run_time=1.0)
        self.play(Create(ghosts), FadeIn(tg), run_time=1.0)
        self.sync()

        # beat 4: joint softmax
        d = self.say()
        gj = DATA["ghost_joint"].astype(np.float64)
        imj = ImageMobject(heat_image(gj, magma_like)).stretch_to_fit_width(G).stretch_to_fit_height(G).move_to(img)
        prodj = MathTex(r"p(x, y)", r"\text{ (joint)}").scale(0.9).move_to(prod)
        self.play(FadeOut(bx), FadeOut(by), FadeOut(lx), FadeOut(ly), run_time=0.6)
        self.play(FadeTransform(img, imj), Transform(prod, prodj), run_time=1.6)
        self.play(FadeOut(ghosts), FadeOut(tg), run_time=0.8)
        self.sync(pad=0.8)


class S09_Summary(NScene):
    def construct(self):
        n = 32
        s = np.linspace(0, 1, n, endpoint=False)
        circ = np.stack([np.cos(2 * np.pi * s), np.sin(2 * np.pi * s)], 1) * 1.2 + np.array([-4.2, 0.6])
        # square traced with the same parameter, same start point and direction
        ang = 2 * np.pi * s
        sq = np.stack([np.cos(ang), np.sin(ang)], 1)
        sq = sq / np.abs(sq).max(1, keepdims=True) * 1.1 + np.array([1.4, 0.6])

        def path(p, **kw):
            return VMobject(**kw).set_points_as_corners([np.array([x, y, 0]) for x, y in np.vstack([p, p[:1]])])

        gt_c = path(circ, color=C_GOOD, stroke_width=4)
        gt_s = path(sq, color=C_GOOD, stroke_width=4)
        lab_gt = Tex("two ground-truth shapes", color=C_GOOD, font_size=30).move_to(2.6 * UP + 1.4 * LEFT)
        q0 = 0.35 * np.stack([np.cos(2 * np.pi * s), np.sin(2 * np.pi * s)], 1) * (1 + 0.3 * np.sin(5 * 2 * np.pi * s))[:, None] + np.array([-1.4, -2.3])
        query = path(q0, color=C_Y, stroke_width=4)
        ql = Tex("one query", color=C_Y, font_size=30).next_to(query, DOWN, buff=0.15)

        # beat 0: matching flips; regression averages
        d = self.say()
        self.play(Create(gt_c), Create(gt_s), FadeIn(lab_gt), run_time=1.2)
        self.play(Create(query), FadeIn(ql), run_time=1.0)
        for tgt in (gt_c, gt_s, gt_c, gt_s):
            ln = DashedLine(query.get_top(), tgt.get_bottom(), color=GREY_B)
            self.play(Create(ln), Indicate(tgt, color=C_Y, scale_factor=1.05), run_time=0.7)
            self.play(FadeOut(ln), run_time=0.25)
        avg = path((circ + sq) / 2, color=C_L2, stroke_width=5)
        tl2 = Tex("regression: the average of both", color=C_L2, font_size=32).next_to(avg, DOWN, buff=0.3)
        self.play(Transform(query, avg), FadeOut(ql), run_time=2)
        self.play(FadeIn(tl2), run_time=0.6)
        self.sync()

        # beat 1: bins keep both hypotheses
        d = self.say()
        h1, h2 = query.copy(), query.copy()
        self.play(Transform(h1, path(circ, color=C_BIN, stroke_width=6)), Transform(h2, path(sq, color=C_BIN, stroke_width=6)),
                  FadeOut(query), FadeOut(tl2), run_time=2)
        tb = Tex("bins: keep both hypotheses, commit later", color=C_BIN, font_size=32).move_to(2.3 * DOWN)
        self.play(FadeIn(tb), run_time=0.8)
        self.play(h2.animate.set_stroke(opacity=0.15), h1.animate.set_stroke(C_Y, 7), run_time=1.0)
        self.sync()

        # beat 2: summary card
        d = self.say()
        self.play(*[FadeOut(m) for m in (gt_c, gt_s, lab_gt, h1, h2, tb)], run_time=0.8)
        lines = VGroup(
            Tex(r"L2 $\;\rightarrow\;$ the mean", color=C_L2),
            Tex(r"L1 $\;\rightarrow\;$ the median", color=C_L1),
            Tex(r"Bins $\;\rightarrow\;$ the whole distribution", color=C_BIN),
            Tex(r"Decode with care: take the peak, refine inside it,\\ and watch out for ghosts", color=C_Y),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.45).move_to(ORIGIN)
        for ln in lines:
            self.play(Write(ln), run_time=min(1.6, d / 5))
        self.sync(pad=2.0)
