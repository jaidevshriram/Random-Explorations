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
C_A, C_B = "#ECEFF1", "#90A4AE"  # two neutral shades for "answer A" / "answer B"
REGION_COLORS = ["#83C167", "#58C4DD", "#FF9F43", "#FC6255"]
R_OUTER, R_INNER = 0.38, 0.14


def wav_duration(path):
    with wave.open(path) as w:
        return w.getnframes() / w.getframerate()


class NScene(Scene):
    """A scene narrated beat by beat: say() starts the next clip and returns its length,
    sync() waits until it has finished."""

    narration = NARRATION  # scene name -> list of beats; other videos override this

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
        self._timing.append((t, t + d, subtitle(self.narration[name][i])))
        self._end = t + d
        return d

    def play(self, *args, **kwargs):
        super().play(*args, **kwargs)
        self._check_layout()

    def _check_layout(self):
        """Flag text that leaves the frame or overlaps other text (written out in tear_down)."""
        texts = []

        def walk(m):
            if isinstance(m, (SingleStringMathTex, Text)):
                # a Tex's colour lives on its parts; the object itself reports opacity 0
                if max((p.get_fill_opacity() for p in m.family_members_with_points()), default=0) > 0.05 and m.width > 0:
                    texts.append(m)
            else:
                for sm in m.submobjects:
                    walk(sm)

        for m in self.mobjects:
            walk(m)
        if not hasattr(self, "_layout"):
            self._layout = {}
        xl, yl = config.frame_width / 2 - 0.05, config.frame_height / 2 - 0.05
        name = lambda m: getattr(m, "tex_string", None) or getattr(m, "text", "?")
        for m in texts:
            if m.get_left()[0] < -xl or m.get_right()[0] > xl or m.get_bottom()[1] < -yl or m.get_top()[1] > yl:
                self._layout.setdefault(f"out of frame: {name(m)[:60]!r}", self.renderer.time)
        for i, a in enumerate(texts):
            for b in texts[i + 1:]:
                w = min(a.get_right()[0], b.get_right()[0]) - max(a.get_left()[0], b.get_left()[0])
                h = min(a.get_top()[1], b.get_top()[1]) - max(a.get_bottom()[1], b.get_bottom()[1])
                if w > 0 and h > 0 and w * h > 0.15 * min(a.width * a.height, b.width * b.height):
                    self._layout.setdefault(f"overlap: {name(a)[:40]!r} / {name(b)[:40]!r}", self.renderer.time)

    def sync(self, pad=0.45):
        rest = self._end + pad - self.renderer.time
        if rest > 0.02:
            self.wait(rest)

    def tear_down(self):
        os.makedirs(os.path.join(BUILD, "timing"), exist_ok=True)
        with open(os.path.join(BUILD, "timing", f"{type(self).__name__}.json"), "w") as f:
            json.dump(self._timing, f)
        os.makedirs(os.path.join(BUILD, "layout"), exist_ok=True)
        with open(os.path.join(BUILD, "layout", f"{type(self).__name__}.txt"), "w") as f:
            f.write("\n".join(f"from t={t:.0f}s {msg}" for msg, t in sorted(getattr(self, "_layout", {}).items(), key=lambda kv: kv[1])))


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
            g.add(spring(p, d.get_center(), stroke_width=1.6 + 0.8 * min(L / 4, 1), stroke_color=C_L2, stroke_opacity=0.6))
        return g.set_z_index(-1)

    return always_redraw(build)


def net_pull(nl, tracker, dots, scale=1.0):
    """Arrow under the marker showing the total pull of the springs (sum of label - prediction)."""

    def build():
        p = nl.n2p(tracker.get_value())
        f = scale * np.mean([d.get_center()[0] - p[0] for d in dots])
        y = p + 1.25 * DOWN
        if abs(f) < 0.08:
            return VGroup(Tex(r"net pull $= 0$", font_size=30, color=C_GOOD).move_to(y + 0.05 * DOWN))
        arr = Arrow(y, y + RIGHT * f, buff=0, color=C_L2, stroke_width=5, max_tip_length_to_length_ratio=0.3)
        lab = Tex("net pull", font_size=28, color=C_L2).next_to(arr, DOWN, buff=0.06)
        return VGroup(arr, lab)

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
        # teaser: the same ambiguous labels, regression vs bins
        nl = number_line(y=0.2, length=9)
        rng = np.random.default_rng(5)
        vals = np.sort(np.concatenate([0.25 + 0.02 * rng.standard_normal(9), 0.75 + 0.02 * rng.standard_normal(9)]))
        dots = VGroup(*[Dot(p, radius=0.07, color=C_LAB) for p in dot_plot(nl, vals, step=0.16)])
        tl = Tex("labels for one input", font_size=32, color=C_LAB).next_to(dots, UP, buff=0.3)
        self.play(Create(nl), LaggedStart(*[FadeIn(dt, shift=0.4 * DOWN) for dt in dots], lag_ratio=0.05), FadeIn(tl), run_time=1.8)
        mean = float(vals.mean())
        tri = Triangle(color=C_L2, fill_opacity=1, stroke_width=0).scale(0.15).move_to(nl.n2p(mean) + 0.25 * DOWN)
        rl = Tex(r"regression: \emph{here}?", font_size=34, color=C_L2).next_to(tri, DOWN, buff=0.15)
        self.play(FadeIn(tri, shift=0.3 * UP), Write(rl), run_time=1.2)
        nl2 = number_line(y=-2.6, length=9)
        hb = bars_from(nl2, mixture_hist(30, w=(0.5, 0.5), mu=(0.25, 0.75), sd=0.03), 5.5)
        bl = Tex("bins: two peaks", font_size=34, color=C_BIN).next_to(nl2, DOWN, buff=0.2)
        self.play(Create(nl2), LaggedStart(*[GrowFromEdge(b, DOWN) for b in hb], lag_ratio=0.03), Write(bl), run_time=1.6)
        self.wait(max(1.0, d * 0.72 - 6.6))
        teaser = VGroup(nl, dots, tl, tri, rl, nl2, hb, bl)
        qn = Tex(r"What does each loss \emph{actually} ask for?", font_size=56)
        self.play(teaser.animate.scale(0.7).to_edge(DOWN, buff=0.3).set_opacity(0.8), run_time=1.0)
        qn.to_edge(UP, buff=1.2)
        self.play(Write(qn), run_time=1.5)
        self.sync(pad=0.8)


class S02_Springs(NScene):
    def construct(self):
        rng = np.random.default_rng(3)
        nl = number_line(y=-2.0)
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
        npull = net_pull(nl, yv, dots)
        self.play(FadeIn(npull), run_time=0.6)
        self.play(yv.animate.set_value(clustered.mean()), run_time=d * 0.45, rate_func=smooth)
        mean_lab = Tex("mean", color=C_Y, font_size=32).next_to(mk, RIGHT, buff=0.15)
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
        nl = number_line(y=-2.0)
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
        self.play(FadeOut(med), FadeOut(vt), run_time=0.3)
        self.play(*[dt.animate.move_to(p) for dt, p in zip(dots, dot_plot(nl, even))], run_time=2)
        self.play(FadeIn(vt), run_time=0.4)
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
            dt = Dot(nl.n2p(labels[i]) + 3.6 * UP, color=C_LAB, radius=0.09)
            self.play(FadeIn(dt), run_time=0.25)
            self.play(dt.animate.move_to(nl.n2p(labels[i]) + 0.1 * UP), run_time=0.6)
            self.play(FadeOut(dt, scale=0.3), n.animate.set_value(i + 1), run_time=0.7)
        self.sync()

        # beat 2: rain, histogram
        d = self.say()
        rain = []
        for v in labels[3:]:
            dt = Dot(nl.n2p(v) + (3.4 + 0.6 * rng.random()) * UP, color=C_LAB, radius=0.06)
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
        hb = bars_from(mini, hard, 1.6, color=C_LAB)
        sb = bars_from(mini, soft, 1.6 * 2.2, color=C_LAB)
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

        # beat 3: zoom into one peak: argmax snaps to a bin centre, the local average does not
        d = self.say()
        self.play(FadeOut(gap), FadeOut(same), FadeOut(fulcrum), FadeOut(ev), f.animate.set_value(mean), run_time=0.6)
        self.remove(tb)
        self.add(nl, bars)
        main = VGroup(nl, bars)
        self.play(main.animate.set_opacity(0), run_time=0.6)
        zl = NumberLine(x_range=[0, 7, 1], length=9, color=GREY_B, include_ticks=False).shift(0.4 * DOWN)
        zedges = VGroup(*[Line(zl.n2p(i), zl.n2p(i) + 0.15 * UP, color=GREY_C) for i in range(8)])
        true_v = 3.85  # in bin units: between the centres of bins 3 (3.5) and 4 (4.5)
        zp = np.exp(-0.5 * ((np.arange(7) + 0.5 - true_v) / 0.9) ** 2)
        zp /= zp.sum()
        zb = VGroup(*[Rectangle(width=9 / 7 * 0.85, height=6 * v, stroke_width=0, fill_color=C_BIN, fill_opacity=0.85)
                      .move_to(zl.n2p(i + 0.5), aligned_edge=DOWN) for i, v in enumerate(zp)])
        zt = Tex("zoom: one peak", font_size=34, color=GREY_B).move_to(LEFT * 4.6 + UP * 2.2)
        self.play(Create(zl), Create(zedges), LaggedStart(*[GrowFromEdge(b, DOWN) for b in zb], lag_ratio=0.08),
                  FadeIn(zt), run_time=1.5)
        tick = Line(zl.n2p(true_v) + 0.1 * DOWN, zl.n2p(true_v) + 2.9 * UP, color=C_GOOD, stroke_width=5)
        tt = Tex("true value", font_size=32, color=C_GOOD).next_to(tick, UP, buff=0.1)
        self.play(Create(tick), FadeIn(tt), run_time=1.0)
        am_v = float(np.argmax(zp) + 0.5)
        tri_a = Triangle(color=C_BIN, fill_opacity=1, stroke_width=0).scale(0.16).move_to(zl.n2p(am_v) + 0.3 * DOWN)
        ta = Tex(r"argmax:\\a bin centre", font_size=30, color=C_BIN).next_to(tri_a, DOWN, buff=0.1).shift(0.9 * LEFT)
        self.play(FadeIn(tri_a, shift=0.3 * UP), FadeIn(ta), run_time=1.0)
        lm_v = float((zp * (np.arange(7) + 0.5)).sum())
        tri_m = Triangle(color=C_Y, fill_opacity=1, stroke_width=0).scale(0.16).move_to(zl.n2p(lm_v) + 0.3 * DOWN)
        tm = Tex(r"average:\\on the true value", font_size=30, color=C_Y).next_to(tri_m, DOWN, buff=0.1).shift(1.1 * RIGHT)
        self.play(FadeIn(tri_m, shift=0.3 * UP), FadeIn(tm), run_time=1.0)
        self.sync()

        # beat 4: the recipe
        d = self.say()
        self.play(FadeOut(VGroup(zl, zedges, zb, zt, tick, tt, tri_a, ta, tri_m, tm)), main.animate.set_opacity(1), run_time=0.8)
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
        ax = Axes(x_range=[0, 1, 0.25], y_range=[0, 1, 0.5], x_length=8.2, y_length=5.0, tips=False,
                  axis_config={"color": GREY_C, "include_ticks": False}).shift(2.0 * LEFT + 0.55 * DOWN)
        xl = Tex(r"input $x$", font_size=34, color=GREY_B).next_to(ax.x_axis, DOWN, buff=0.15)
        yl = Tex(r"label $y$", font_size=34, color=GREY_B).rotate(PI / 2).next_to(ax.y_axis, LEFT, buff=0.15)
        rng = np.random.default_rng(0)
        x = rng.random(700)
        reg = np.minimum((x * 4).astype(int), 3)
        up = 0.72 + 0.07 * np.sin(4 * np.pi * x)
        lo = 0.28 + 0.07 * np.sin(4 * np.pi * x + 1.0)
        pick = rng.random(700) < np.array([0, 0, 0.3, 0.5])[reg]
        y = np.where(pick, lo, up) + 0.015 * rng.standard_normal(700)
        out = (reg == 1) & (rng.random(700) < 0.1)
        y = np.clip(np.where(out, rng.random(700), y), 0, 1)
        pts = VGroup(*[Dot(ax.c2p(a, b), radius=0.03, color="#C8CCD2") for a, b in zip(x, y)])
        gx = np.linspace(0, 1, len(DATA["l2_1d"]))
        X0 = 0.875
        k0 = int(np.argmin(np.abs(gx - X0)))

        # slice panel on the right: a vertical number line for y at x = X0
        top, bot = ax.c2p(0, 1)[1], ax.c2p(0, 0)[1]
        px = 4.3

        def p_of(v):
            return np.array([px, bot + v * (top - bot), 0])

        pline = Line(p_of(0), p_of(1), color=GREY_B)
        ptitle = Tex(r"one slice:\\ $x = 0.875$", font_size=30, color=C_Y).next_to(pline, UP, buff=0.2)

        # beat 0: the new axes
        d = self.say()
        self.play(Create(ax), Write(xl), Write(yl), run_time=1.5)
        self.play(LaggedStart(*[FadeIn(p) for p in pts], lag_ratio=0.002), run_time=d * 0.45)
        self.sync()

        # beat 1: each vertical slice is one number line from before
        d = self.say()
        strip = Rectangle(width=ax.x_length * 0.04, height=ax.y_length, color=C_Y, stroke_width=3,
                          fill_opacity=0.08).move_to(ax.c2p(X0, 0.5))
        self.play(Create(strip), run_time=1.0)
        sel = [i for i in range(len(x)) if abs(x[i] - X0) < 0.02]
        copies = VGroup(*[pts[i].copy().set_color(C_Y) for i in sel])
        self.play(Create(pline), Write(ptitle), run_time=1.0)
        self.play(*[c.animate.move_to(p_of(y[i]) + RIGHT * (0.12 + 0.1 * (j % 4))) for j, (c, i) in enumerate(zip(copies, sel))],
                  run_time=2.0)
        c = (np.arange(40) + 0.5) / 40
        true_h = 0.5 * np.exp(-0.5 * ((c - (0.28 + 0.07 * np.sin(4 * np.pi * X0 + 1))) / 0.02) ** 2) + \
            0.5 * np.exp(-0.5 * ((c - (0.72 + 0.07 * np.sin(4 * np.pi * X0))) / 0.02) ** 2)
        true_h /= true_h.max()
        hist = VGroup(*[Rectangle(width=1.6 * h + 0.001, height=(top - bot) / 40 * 0.85, stroke_width=0, fill_color=GREY_B,
                                  fill_opacity=0.6).move_to(p_of(cc), aligned_edge=LEFT) for cc, h in zip(c, true_h)])
        self.play(FadeOut(copies), LaggedStart(*[GrowFromEdge(b, LEFT) for b in hist], lag_ratio=0.02), run_time=1.5)
        two = Tex("two answers", font_size=30, color=GREY_B).next_to(pline, DOWN, buff=0.15)
        self.play(FadeIn(two), run_time=0.6)
        self.sync()

        # beat 2: the four regions
        d = self.say()
        names = ["one clean\\\\answer", "a few junk\\\\labels", "two answers\\\\70/30", "two answers\\\\50/50"]
        shades = VGroup(*[Rectangle(width=ax.x_length / 4, height=ax.y_length, stroke_width=0, fill_color=WHITE,
                                    fill_opacity=0.07 if i % 2 == 0 else 0.02).move_to(ax.c2p(0.125 + 0.25 * i, 0.5))
                          for i in range(4)])
        rl = VGroup(*[Tex(n, font_size=30, color=GREY_A).next_to(ax.c2p(0.125 + 0.25 * i, 1), UP, buff=0.1)
                      for i, n in enumerate(names)])
        for i in range(4):
            self.play(FadeIn(shades[i]), Write(rl[i]), run_time=min(1.2, d / 5))
        self.sync()

        def side_marker(v, color, label):
            tri = Triangle(color=color, fill_opacity=1, stroke_width=0).scale(0.11).rotate(-PI / 2).move_to(p_of(v) + 0.2 * LEFT)
            lab = Tex(label, font_size=28, color=color).next_to(tri, LEFT, buff=0.08)
            return VGroup(tri, lab)

        # beat 3: L2
        d = self.say()
        l2 = polyline(ax, gx, DATA["l2_1d"], color=C_L2, stroke_width=5)
        self.play(Create(l2), run_time=d * 0.5, rate_func=linear)
        m2 = side_marker(DATA["l2_1d"][k0], C_L2, "L2")
        self.play(FadeIn(m2, shift=0.2 * LEFT), run_time=0.8)
        self.sync()

        # beat 4: L1, three training runs
        d = self.say()
        seeds = DATA["l1_1d_seeds"]
        l1s = VGroup(*[polyline(ax, gx, seeds[i], color=C_L1, stroke_width=4) for i in range(len(seeds))])
        self.play(Create(l1s[0]), run_time=d * 0.35, rate_func=linear)
        runs = Tex(r"L1: 3 training runs", font_size=30, color=C_L1).move_to(ax.c2p(0.62, 0.06))
        self.play(Create(l1s[1]), Create(l1s[2]), FadeIn(runs), run_time=d * 0.3, rate_func=linear)
        m1 = VGroup(*[Triangle(color=C_L1, fill_opacity=1, stroke_width=0).scale(0.09).rotate(-PI / 2)
                      .move_to(p_of(seeds[i][k0]) + 0.2 * LEFT) for i in range(len(seeds))])
        m1.add(Tex("L1", font_size=28, color=C_L1).next_to(m1, LEFT, buff=0.08))
        self.play(FadeIn(m1, shift=0.2 * LEFT), run_time=0.8)
        l1 = l1s
        self.sync()

        # beat 5: the bin head's histogram for every x
        d = self.say()
        dens = DATA["bins_density_1d"].astype(np.float32)
        a = np.sqrt(dens / dens.max(1, keepdims=True)).T[::-1]
        img = np.zeros((*a.shape, 4), dtype=np.uint8)
        img[..., 0], img[..., 1], img[..., 2] = 88, 196, 221
        img[..., 3] = (np.clip(a, 0, 1) * 230).astype(np.uint8)
        im = ImageMobject(img).stretch_to_fit_width(ax.x_length).stretch_to_fit_height(ax.y_length).move_to(ax.c2p(0.5, 0.5))
        self.play(l2.animate.set_stroke(opacity=0.25), l1.animate.set_stroke(opacity=0.25), pts.animate.set_opacity(0.2),
                  FadeOut(shades), FadeOut(runs), run_time=0.8)
        self.play(FadeIn(im), run_time=2.0)
        pb = dens[k0] / dens[k0].max()
        cb = (np.arange(256) + 0.5) / 256
        pred_curve = VMobject(color=C_BIN, stroke_width=4).set_points_as_corners(
            [p_of(cc) + RIGHT * 1.6 * h for cc, h in zip(cb, pb)])
        self.play(Create(pred_curve), run_time=1.5)
        self.sync()

        # beat 6: argmax
        d = self.say()
        # dots, not a line: a line would draw the jumps straight through the empty gap
        am = VGroup(*[Dot(ax.c2p(a, b), radius=0.035, color=WHITE) for a, b in zip(gx[::2], DATA["bins_am_1d"][::2])])
        self.play(LaggedStart(*[FadeIn(p) for p in am], lag_ratio=0.01), run_time=d * 0.45)
        mb = side_marker(DATA["bins_am_1d"][k0], WHITE, "bins")
        self.play(FadeIn(mb, shift=0.2 * LEFT), run_time=0.8)
        self.sync()

        # beat 7: the numbers, as bars
        d = self.say()
        everything = Group(*[m for m in self.mobjects])
        self.play(FadeOut(everything), run_time=0.8)
        head = Tex(r"average distance to the \emph{nearest} correct answer\\(the two ambiguous regions)", font_size=38).to_edge(UP, buff=0.5)
        vals = [("L2", 0.17, C_L2), ("L1", 0.04, C_L1), ("bins", 0.002, C_BIN)]
        rows = VGroup()
        for i, (n, v, col) in enumerate(vals):
            lab = Tex(n, font_size=44, color=col).move_to(LEFT * 5 + UP * (0.9 - 1.3 * i))
            bar = Rectangle(width=max(v / 0.17 * 8, 0.03), height=0.6, stroke_width=0, fill_color=col, fill_opacity=0.9)
            bar.next_to(lab, RIGHT, buff=0.5).align_to(LEFT * 4.2, LEFT)
            num = Tex(f"{v:g}", font_size=40, color=col).next_to(bar, RIGHT, buff=0.25)
            rows.add(VGroup(lab, bar, num))
        self.play(Write(head), run_time=1.2)
        for r in rows:
            self.play(FadeIn(r[0]), GrowFromEdge(r[1], LEFT), FadeIn(r[2]), run_time=0.9)
        times = Tex(r"$\approx 85\times$ better than L2, $20\times$ better than L1", font_size=38,
                    color=C_BIN).next_to(rows[2], DOWN, buff=0.6).align_to(rows[2][1], LEFT)
        self.play(Write(times), run_time=1.0)
        self.sync(pad=0.8)


class S07_CoarseFine(NScene):
    def construct(self):
        K = 16
        W = 12.0
        y_top = 2.3
        bw = W / K

        def cell_center(i):
            return np.array([-W / 2 + (i + 0.5) * bw, y_top, 0])

        cells = VGroup(*[Rectangle(width=bw, height=0.45, stroke_color=GREY_C, stroke_width=2).move_to(cell_center(i))
                         for i in range(K)])
        title = Tex("Many bins: coarse, then fine", font_size=42).to_edge(UP, buff=0.25)
        coarse = np.zeros(K)
        coarse[4], coarse[11] = 0.5, 0.5
        cbars = VGroup(*[Rectangle(width=bw * 0.7, height=max(1.1 * v, 0.001), stroke_width=0, fill_color=C_BIN,
                                   fill_opacity=0.85).move_to(cell_center(i) + 0.26 * UP, aligned_edge=DOWN)
                         for i, v in enumerate(coarse)])
        lab_c = Tex(r"1.\ which of 16 coarse bins?", font_size=32, color=C_BIN).next_to(cells, DOWN, buff=0.2)

        def zoom_box(i, center, width, color=C_Y):
            box = Rectangle(width=width, height=0.6, stroke_color=color, stroke_width=3).move_to(center)
            lines = VGroup(*[Line(box.get_corner(DL) + RIGHT * width * j / K, box.get_corner(UL) + RIGHT * width * j / K,
                                  color=GREY_C, stroke_width=1.5) for j in range(1, K)])
            cone = VGroup(DashedLine(cells[i].get_corner(DL), box.get_corner(UL), color=color, stroke_width=2),
                          DashedLine(cells[i].get_corner(DR), box.get_corner(UR), color=color, stroke_width=2))
            return box, lines, cone

        def fine_bars(box, probs, color=C_BIN, scale=2.4):
            w = box.width
            return VGroup(*[Rectangle(width=w / K * 0.75, height=max(scale * v, 0.001), stroke_width=0, fill_color=color,
                                      fill_opacity=0.85).move_to(box.get_corner(UL) + RIGHT * w * (j + 0.5) / K, aligned_edge=DOWN)
                            for j, v in enumerate(probs)])

        def bump(center, sd=0.8):
            b = np.exp(-0.5 * ((np.arange(K) - center) / sd) ** 2)
            return b / b.sum()

        # beat 0: the cost of a joint histogram motivates the two-step trick
        d = self.say()
        cost = VGroup(Tex(r"a joint $(x, y)$ histogram at 256 bins per axis:", font_size=40),
                      Tex(r"$256 \times 256 = 65{,}536$ bins per point", font_size=52, color=C_L2)).arrange(DOWN, buff=0.35)
        self.play(Write(cost[0]), run_time=1.2)
        self.play(Write(cost[1]), run_time=1.2)
        self.wait(max(0.5, d * 0.35 - 2.4))
        self.play(FadeOut(cost), run_time=0.6)
        self.play(Write(title), Create(cells), run_time=1.5)
        self.play(FadeIn(cbars, shift=0.2 * UP), Write(lab_c), run_time=1.2)
        self.sync()

        # beat 1: zoom into one coarse bin
        d = self.say()
        self.play(cells[11].animate.set_stroke(C_Y, 4), FadeOut(lab_c), run_time=0.5)
        box, lines, cone = zoom_box(11, np.array([0, -0.3, 0]), 10)
        fb = fine_bars(box, bump(12))
        lab_f = Tex(r"2.\ where inside it? (16 fine bins)", font_size=32, color=C_BIN).next_to(box, DOWN, buff=0.25)
        self.play(Create(cone), Create(box), run_time=1.2)
        self.play(Create(lines), FadeIn(fb, shift=0.2 * UP), Write(lab_f), run_time=1.5)
        self.sync()

        # beat 2: one fine histogram per coarse bin == one big softmax
        d = self.say()
        eq = Tex(r"each coarse bin gets its own fine histogram\\$=$ one big softmax with $16\times16 = 256$ bins",
                 font_size=34).next_to(lab_f, DOWN, buff=0.45)
        self.play(Write(eq), run_time=2.0)
        ok = Tex("nothing lost", font_size=36, color=C_GOOD).next_to(eq, DOWN, buff=0.25)
        self.play(FadeIn(ok, scale=1.2), run_time=0.8)
        self.sync()

        # beat 3: two answers, at different spots inside their coarse bins
        d = self.say()
        self.play(FadeOut(VGroup(box, lines, cone, fb, lab_f, eq, ok)), cells[11].animate.set_stroke(GREY_C, 2), run_time=0.8)
        boxA, linesA, coneA = zoom_box(4, np.array([-3.4, 0.1, 0]), 5.6, color=C_A)
        boxB, linesB, coneB = zoom_box(11, np.array([3.4, 0.1, 0]), 5.6, color=C_B)
        dotA = Dot(boxA.get_left() + RIGHT * 5.6 * 0.25, color=C_A, radius=0.12)
        dotB = Dot(boxB.get_left() + RIGHT * 5.6 * 0.75, color=C_B, radius=0.12)
        tA = Tex(r"answer A:\\near the left of its bin", font_size=30, color=C_A).next_to(boxA, DOWN, buff=0.25)
        tB = Tex(r"answer B:\\near the right of its bin", font_size=30, color=C_B).next_to(boxB, DOWN, buff=0.25)
        self.play(Create(coneA), Create(boxA), Create(linesA), Create(coneB), Create(boxB), Create(linesB), run_time=1.5)
        self.play(FadeIn(dotA, scale=1.5), Write(tA), run_time=1.2)
        self.play(FadeIn(dotB, scale=1.5), Write(tB), run_time=1.2)
        self.sync()

        # beat 4: a shared fine histogram mixes them
        d = self.say()
        shared_box = Rectangle(width=7, height=0.6, stroke_color=C_HUB, stroke_width=3).move_to(2.6 * DOWN)
        shared_lines = VGroup(*[Line(shared_box.get_corner(DL) + RIGHT * 7 * j / K, shared_box.get_corner(UL) + RIGHT * 7 * j / K,
                                     color=GREY_C, stroke_width=1.5) for j in range(1, K)])
        sh = 0.45 * bump(4) + 0.55 * bump(12)
        sbars = VGroup(*[Rectangle(width=7 / K * 0.75, height=max(3.4 * v, 0.001), stroke_width=0,
                                   fill_color=C_A if j < 8 else C_B, fill_opacity=0.85)
                         .move_to(shared_box.get_corner(UL) + RIGHT * 7 * (j + 0.5) / K, aligned_edge=DOWN)
                         for j, v in enumerate(sh)])
        st = Tex("one shared fine histogram", font_size=30, color=C_HUB).next_to(shared_box, DOWN, buff=0.15)
        self.play(FadeOut(tA), FadeOut(tB), run_time=0.4)
        self.play(Create(shared_box), Create(shared_lines), Write(st),
                  TransformFromCopy(dotA, sbars[:8]), TransformFromCopy(dotB, sbars[8:]), run_time=2.0)
        self.play(cells[4].animate.set_stroke(C_A, 5), Indicate(cbars[4], color=C_A), run_time=1.0)
        self.play(Indicate(sbars[12], color=C_L2, scale_factor=1.3), run_time=1.0)
        bad = Cross(scale_factor=0.16, stroke_color=C_L2, stroke_width=7).move_to(boxA.get_left() + RIGHT * 5.6 * 0.75)
        bl = Tex(r"A's bin $+$ B's spot $=$ neither", font_size=32, color=C_L2).next_to(boxA, DOWN, buff=0.25)
        self.play(FadeIn(bad, scale=1.5), Write(bl), run_time=1.2)
        self.sync()

        # beat 5: the takeaway
        d = self.say()
        self.play(FadeOut(Group(*self.mobjects)), run_time=0.8)
        take = VGroup(Tex(r"Worth it when one softmax would be huge,", font_size=40, color=C_BIN),
                      Tex(r"like a joint $(x, y)$ histogram: pick $x$, then $y$ given $x$.", font_size=40, color=C_BIN),
                      Tex(r"Always let the fine choice depend on the coarse one.", font_size=40, color=C_GOOD)).arrange(DOWN, buff=0.35)
        self.play(Write(take), run_time=2.0)
        self.sync(pad=0.8)


class S08_LetterO(NScene):
    def construct(self):
        S = 6.4
        ax = Axes(x_range=[0, 1, 1], y_range=[0, 1, 1], x_length=S, y_length=S, tips=False,
                  axis_config={"color": GREY_D, "include_ticks": False}).shift(2.9 * LEFT + 0.2 * DOWN)
        th = np.linspace(0, 2 * np.pi, 240)

        def ring_pt(t, r):
            return 0.5 + r * np.cos(2 * np.pi * t), 0.5 + r * np.sin(2 * np.pi * t)

        outer = polyline(ax, 0.5 + R_OUTER * np.cos(th), 0.5 + R_OUTER * np.sin(th), color=WHITE, stroke_width=3)
        inner = polyline(ax, 0.5 + R_INNER * np.cos(th), 0.5 + R_INNER * np.sin(th), color=WHITE, stroke_width=3)
        title = Tex(r"2D: the letter O", font_size=44).to_corner(UL)
        side = RIGHT * 3.6

        # beat 0: the letter
        d = self.say()
        self.play(Write(title), Create(outer), Create(inner), run_time=1.8)
        lo_ = Tex("outer ring", font_size=30, color=GREY_B).next_to(ax.c2p(0.5, 0.5 + R_OUTER), UP, buff=0.1)
        li_ = Tex("inner ring", font_size=30, color=GREY_B).move_to(ax.c2p(0.5, 0.5 + R_INNER + 0.06))
        self.play(FadeIn(lo_), FadeIn(li_), run_time=0.8)
        self.sync()

        # beat 1: input = position along the path, output = a point; the same four regions, one per quarter
        d = self.say()
        tt = ValueTracker(0.03)
        ray = always_redraw(lambda: DashedLine(ax.c2p(0.5, 0.5), ax.c2p(*ring_pt(tt.get_value(), R_OUTER + 0.08)),
                                               color=GREY_B, stroke_width=2))
        pt = always_redraw(lambda: Dot(ax.c2p(*ring_pt(tt.get_value(), R_OUTER)), color=C_Y, radius=0.11))
        io = VGroup(Tex(r"input: position along the path", font_size=34, color=GREY_B),
                    Tex(r"output: a point $(x, y)$", font_size=34, color=C_Y)).arrange(DOWN, aligned_edge=LEFT, buff=0.3)
        io.move_to(side + 2.4 * UP)
        self.play(Create(ray), FadeIn(pt), Write(io[0]), run_time=1.2)
        self.play(Write(io[1]), run_time=1.0)
        qnames = ["clean", r"junk\\labels", "70/30", "50/50"]
        qlab = VGroup(*[Tex(n, font_size=30, color=GREY_A).move_to(ax.c2p(*ring_pt(0.125 + 0.25 * i, 0.47)))
                        for i, n in enumerate(qnames)])
        for i in range(4):
            self.play(tt.animate.set_value(0.25 * i + 0.2), FadeIn(qlab[i]), run_time=max(0.8, (d - 3) / 4.5), rate_func=smooth)
        self.sync()

        # beat 2: the 50/50 quarter: half the labels say inner
        d = self.say()
        quarter = AnnularSector(inner_radius=0, outer_radius=S * 0.47, angle=PI / 2, start_angle=-PI / 2,
                                color=C_GHOST, fill_opacity=0.12, stroke_width=0).move_arc_center_to(ax.c2p(0.5, 0.5))
        self.play(tt.animate.set_value(0.875), FadeIn(quarter), run_time=1.8)
        po, pi_ = ax.c2p(*ring_pt(0.875, R_OUTER)), ax.c2p(*ring_pt(0.875, R_INNER))
        rng = np.random.default_rng(2)
        labs = VGroup(*[Dot((po if k % 2 == 0 else pi_) + 0.07 * rng.standard_normal(3) * np.array([1, 1, 0]),
                            color=C_LAB, radius=0.07) for k in range(12)])
        t5 = Tex(r"same input: half the labels on\\the outer ring, half on the inner", font_size=32,
                 color=C_GHOST).move_to(side + 0.9 * UP)
        self.play(FadeOut(pt), LaggedStart(*[FadeIn(l_, scale=2) for l_ in labs], lag_ratio=0.15), Write(t5), run_time=d * 0.55)
        self.sync()

        # beat 3: L2, quarter by quarter
        d = self.say()
        self.play(FadeOut(ray), FadeOut(labs), run_time=0.4)
        l2 = DATA["l2_2d"]
        tq = np.linspace(0, 1, len(l2))
        segs = [polyline(ax, l2[(tq >= q / 4) & (tq <= (q + 1) / 4 + 0.004), 0], l2[(tq >= q / 4) & (tq <= (q + 1) / 4 + 0.004), 1],
                         color=C_L2, stroke_width=5) for q in range(4)]
        notes = [r"clean: on the ring", r"junk labels: pulled inward", r"70/30: 70\% of the way out",
                 r"50/50: exactly halfway"]
        nt = VGroup(*[Tex(n, font_size=30, color=C_L2) for n in notes]).arrange(DOWN, aligned_edge=LEFT, buff=0.2)
        nt.next_to(t5, DOWN, buff=0.85).align_to(t5, LEFT)
        l2h = Tex("L2:", font_size=34, color=C_L2).next_to(nt, UP, buff=0.2).align_to(nt, LEFT)
        self.play(FadeIn(l2h), run_time=0.4)
        for q in range(4):
            self.play(Create(segs[q]), FadeIn(nt[q]), run_time=max(0.9, (d - 1.5) / 4.6), rate_func=linear)
        l2c = VGroup(*segs)
        self.sync()

        # beat 4: bins land on the real rings, except for a few strays in the 50/50 quarter
        d = self.say()
        bp = DATA["bins_am_2d"]
        rb = np.linalg.norm(bp - 0.5, axis=1)
        stray = (np.abs(rb - R_OUTER) > 0.03) & (np.abs(rb - R_INNER) > 0.03)
        bdots = VGroup(*[Dot(ax.c2p(a, b), radius=0.045, color=C_BIN) for a, b in bp])
        tb = Tex(r"bins (argmax): on the real rings\dots", font_size=32, color=C_BIN).next_to(nt, DOWN, buff=0.4).align_to(nt, LEFT)
        self.play(l2c.animate.set_stroke(opacity=0.25), nt.animate.set_opacity(0.4), l2h.animate.set_opacity(0.4), run_time=0.6)
        self.play(LaggedStart(*[FadeIn(b) for b in bdots], lag_ratio=0.006), Write(tb), run_time=d * 0.45)
        sp_ = bp[stray]
        ring_c = Circle(radius=0.8, color=C_GHOST, stroke_width=4).move_to(ax.c2p(*sp_.mean(0)))
        ring_c = DashedVMobject(ring_c, num_dashes=24)
        q_ = Tex(r"\dots except these strays", font_size=32, color=C_GHOST).next_to(tb, DOWN, buff=0.2).align_to(tb, LEFT)
        self.play(Create(ring_c), *[bdots[i].animate.set_color(C_GHOST).scale(1.4) for i in np.where(stray)[0]],
                  Write(q_), run_time=1.5)
        self.sync()

        # beat 5: zoom into the 50/50 quarter; the x and y histograms
        d = self.say()
        self.play(FadeOut(Group(*self.mobjects)), run_time=0.8)
        g = DATA["ghost_factored"].astype(np.float64)
        ix0, ix1, iy0, iy1 = 115, 243, 13, 141  # crop [0.449, 0.949] x [0.051, 0.551]
        x0, x1, y0, y1 = ix0 / 256, ix1 / 256, iy0 / 256, iy1 / 256
        Z = Axes(x_range=[x0, x1, 1], y_range=[y0, y1, 1], x_length=5.4, y_length=5.4, tips=False,
                 axis_config={"color": GREY_D, "include_ticks": False}).shift(1.2 * RIGHT + 0.55 * UP)
        tz = np.linspace(0.73, 1.02, 120)
        zo = polyline(Z, *ring_pt(tz, R_OUTER), color=WHITE, stroke_width=3)
        zi = polyline(Z, *ring_pt(tz, R_INNER), color=WHITE, stroke_width=3)
        zt = Tex(r"zoom:\\the 50/50 quarter,\\one input", font_size=32, color=C_GHOST).to_corner(UL)
        self.play(Create(Z), Create(zo), Create(zi), Write(zt), run_time=1.5)
        xo, yo = ring_pt(0.875, R_OUTER)
        xi, yi = ring_pt(0.875, R_INNER)
        px_m = g.sum(1)[ix0:ix1]
        py_m = g.sum(0)[iy0:iy1]
        cell = 5.4 / (ix1 - ix0)
        base_x = Z.c2p(x0, y0)[1] - 1.25
        base_y = Z.c2p(x0, y0)[0] - 1.25
        bx = VGroup(*[Rectangle(width=cell, height=1.0 * v / px_m.max() + 0.001, stroke_width=0, fill_color=C_BIN,
                                fill_opacity=0.9).move_to([Z.c2p(x0 + (k + 0.5) / 256, y0)[0], base_x, 0], aligned_edge=DOWN)
                      for k, v in enumerate(px_m)])
        by = VGroup(*[Rectangle(height=cell, width=1.0 * v / py_m.max() + 0.001, stroke_width=0, fill_color=C_BIN,
                                fill_opacity=0.9).move_to([base_y, Z.c2p(x0, y0 + (k + 0.5) / 256)[1], 0], aligned_edge=LEFT)
                      for k, v in enumerate(py_m)])
        lx = Tex(r"histogram for $x$", font_size=30, color=C_BIN).next_to(bx, DOWN, buff=0.12)
        ly = Tex(r"histogram\\for $y$", font_size=30, color=C_BIN).next_to(by, LEFT, buff=0.15)
        self.play(FadeIn(bx, shift=0.2 * UP), Write(lx), run_time=1.5)
        self.play(FadeIn(by, shift=0.2 * RIGHT), Write(ly), run_time=1.5)
        self.sync()

        # beat 6: picking x and y separately -> four combinations, two are ghosts
        d = self.say()
        guides = VGroup(*[DashedLine([Z.c2p(v, y0)[0], base_x + 1.0, 0], Z.c2p(v, y1), color=GREY_B, stroke_width=2)
                          for v in (xo, xi)],
                        *[DashedLine([base_y + 1.0, Z.c2p(x0, v)[1], 0], Z.c2p(x1, v), color=GREY_B, stroke_width=2)
                          for v in (yo, yi)])
        self.play(Create(guides), run_time=1.5)
        img = ImageMobject(heat_image(g[ix0:ix1, iy0:iy1], magma_like)).stretch_to_fit_width(5.4).stretch_to_fit_height(5.4)
        img.move_to(Z.c2p((x0 + x1) / 2, (y0 + y1) / 2))
        self.play(FadeIn(img), run_time=1.0)
        real = VGroup(*[Circle(radius=0.3, color=C_GOOD, stroke_width=5).move_to(Z.c2p(*p)) for p in ((xo, yo), (xi, yi))])
        ghosts = VGroup(*[Circle(radius=0.3, color=C_GHOST, stroke_width=5).move_to(Z.c2p(*p)) for p in ((xo, yi), (xi, yo))])
        tr = VGroup(*[Tex("real", font_size=30, color=C_GOOD).next_to(c_, DR, buff=0.02) for c_ in real])
        tg = VGroup(*[Tex("ghost", font_size=30, color=C_GHOST).next_to(c_, UR, buff=0.02) for c_ in ghosts])
        self.play(Create(real), FadeIn(tr), run_time=1.2)
        self.play(Create(ghosts), FadeIn(tg), run_time=1.2)
        expl = Tex(r"ghost $=$ outer ring's $x$\\ $+$ inner ring's $y$", font_size=30, color=C_GHOST).to_corner(UR).shift(0.6 * DOWN)
        self.play(Write(expl), run_time=1.2)
        self.sync()

        # beat 7: one histogram over (x, y) together
        d = self.say()
        gj = DATA["ghost_joint"].astype(np.float64)
        jx0, jx1, jy0, jy1 = 29, 61, 3, 35  # [0.453, 0.953] x [0.047, 0.547]
        imj = ImageMobject(heat_image(gj[jx0:jx1, jy0:jy1], magma_like))
        imj.stretch_to_fit_width(Z.c2p(jx1 / 64, y0)[0] - Z.c2p(jx0 / 64, y0)[0])
        imj.stretch_to_fit_height(Z.c2p(x0, jy1 / 64)[1] - Z.c2p(x0, jy0 / 64)[1])
        imj.move_to(Z.c2p((jx0 + jx1) / 128, (jy0 + jy1) / 128))
        jt = Tex(r"one histogram over $(x, y)$ together:\\only the two real points", font_size=30,
                 color=C_GOOD).to_corner(UR).shift(0.6 * DOWN)
        self.play(FadeOut(VGroup(bx, by, lx, ly, guides, expl)), run_time=0.6)
        self.play(FadeTransform(img, imj), FadeOut(ghosts), FadeOut(tg), Write(jt), run_time=1.8)
        self.sync(pad=0.8)


class S09_Summary(NScene):
    def construct(self):
        n = 32
        s = np.linspace(0, 1, n, endpoint=False)
        circ = np.stack([np.cos(2 * np.pi * s), np.sin(2 * np.pi * s)], 1) * 1.2 + np.array([-3.6, 0.9])
        ang = 2 * np.pi * s
        sq = np.stack([np.cos(ang), np.sin(ang)], 1)
        sq = sq / np.abs(sq).max(1, keepdims=True) * 1.1 + np.array([3.6, 0.9])

        def path(p, **kw):
            return VMobject(**kw).set_points_as_corners([np.array([x, y, 0]) for x, y in np.vstack([p, p[:1]])])

        title = Tex("Back to your vector model", font_size=44).to_edge(UP, buff=0.3)
        gt_c = path(circ, color=C_GOOD, stroke_width=4)
        gt_s = path(sq, color=C_GOOD, stroke_width=4)
        gl = VGroup(Tex("target: circle", font_size=30, color=C_GOOD).next_to(gt_c, UP, buff=0.2),
                    Tex("target: square", font_size=30, color=C_GOOD).next_to(gt_s, UP, buff=0.2))
        q0 = 0.5 * np.stack([np.cos(2 * np.pi * s), np.sin(2 * np.pi * s)], 1) * (1 + 0.25 * np.sin(5 * 2 * np.pi * s))[:, None] \
            + np.array([0, -2.2])
        query = path(q0, color=C_Y, stroke_width=4)
        ql = Tex("one query's prediction", font_size=30, color=C_Y).next_to(query, DOWN, buff=0.15)

        # beat 0: the matching flips between batches
        d = self.say()
        self.play(Write(title), Create(gt_c), Create(gt_s), FadeIn(gl), run_time=1.5)
        self.play(Create(query), FadeIn(ql), run_time=1.0)
        for b, tgt in enumerate((gt_c, gt_s, gt_c, gt_s)):
            arr = Arrow(query.get_top(), tgt.get_bottom(), color=C_Y, buff=0.2)
            bl = Tex(f"batch {b + 1}", font_size=32, color=C_Y).next_to(arr.get_center(), LEFT if b % 2 == 0 else RIGHT, buff=0.2)
            self.play(GrowArrow(arr), FadeIn(bl), Indicate(tgt, color=C_Y, scale_factor=1.05), run_time=1.0 if b < 2 else 0.6)
            self.play(FadeOut(arr), FadeOut(bl), run_time=0.3)
        self.sync()

        # beat 1: regression averages the two targets
        d = self.say()
        avg = path((circ + sq) / 2 + np.array([0, -0.4]), color=C_L2, stroke_width=5)
        tl2 = Tex(r"regression: the average of both --- neither shape", font_size=32, color=C_L2).next_to(avg, DOWN, buff=0.3)
        self.play(Transform(query, avg), FadeOut(ql), run_time=2.2)
        self.play(Write(tl2), run_time=1.0)
        self.sync()

        # beat 2: per-point bins: one point's histogram has two peaks
        d = self.say()
        self.play(FadeOut(query), FadeOut(tl2), run_time=0.8)
        k = 4  # one point of the shape (the corner at 45 degrees)
        pc_, ps_ = np.array([*circ[k], 0]), np.array([*sq[k], 0])
        glow = VGroup(*[Dot(p_, radius=0.16, color=C_BIN) for p_ in (pc_, ps_)])
        link = DashedLine(pc_, ps_, color=C_BIN, stroke_width=2)
        tk = Tex(r"one point of the shape: its histogram has two peaks", font_size=32, color=C_BIN).move_to(1.9 * DOWN)
        mini = NumberLine(x_range=[0, 1, 1], length=3.2, color=GREY_B, include_ticks=False).move_to(0.5 * DOWN)
        mh = bars_from(mini, mixture_hist(20, w=(0.5, 0.5), mu=(0.2, 0.8), sd=0.05), 3.5)
        ml = VGroup(Tex("circle", font_size=26, color=C_BIN).next_to(mini.n2p(0.2), DOWN, buff=0.1),
                    Tex("square", font_size=26, color=C_BIN).next_to(mini.n2p(0.8), DOWN, buff=0.1))
        self.play(FadeIn(glow, scale=2), Create(link), Write(tk), run_time=1.5)
        self.play(Create(mini), LaggedStart(*[GrowFromEdge(b, DOWN) for b in mh], lag_ratio=0.03), FadeIn(ml), run_time=1.2)
        self.play(Indicate(glow, color=C_BIN, scale_factor=1.4), run_time=1.0)
        self.sync()

        # beat 3: every point choosing its own peak -> a chimera shape
        d = self.say()
        pick = np.arange(n) < n // 2  # e.g. the first half of the points chose the circle, the rest the square
        chim = np.where(pick[:, None], circ, sq)
        chimera = path(chim, color=C_GHOST, stroke_width=4)
        tc_ = Tex(r"each point picks its own peak: a chimera, on neither shape", font_size=32, color=C_GHOST).move_to(2.6 * DOWN)
        self.play(FadeOut(glow), FadeOut(link), FadeOut(mini), FadeOut(mh), FadeOut(ml), run_time=0.5)
        cdots = VGroup(*[Dot(np.array([*p_, 0]), radius=0.07, color=C_GHOST) for p_ in chim])
        self.play(LaggedStart(*[FadeIn(c_, scale=2) for c_ in cdots], lag_ratio=0.05), run_time=2.0)
        self.play(Create(chimera), Write(tc_), run_time=2.0)
        self.sync()

        # beat 4: the points must decide together
        d = self.say()
        self.play(FadeOut(chimera), FadeOut(cdots), FadeOut(tc_), FadeOut(tk), run_time=0.8)
        first = Dot(np.array([*circ[0], 0]), radius=0.12, color=C_Y)
        tf = Tex(r"decode together: the first point picks the circle\dots", font_size=32, color=C_Y).move_to(1.9 * DOWN)
        self.play(FadeIn(first, scale=2), Write(tf), run_time=1.2)
        follow = VGroup(*[Dot(np.array([*p_, 0]), radius=0.08, color=C_Y) for p_ in circ[1:]])
        tf2 = Tex(r"\dots and every later point follows", font_size=32, color=C_Y).next_to(tf, DOWN, buff=0.15)
        self.play(LaggedStart(*[FadeIn(f_, scale=1.5) for f_ in follow], lag_ratio=0.08), FadeIn(tf2), run_time=2.5)
        self.play(gt_c.animate.set_stroke(C_Y, 6), run_time=0.8)
        self.sync()

        # beat 5: summary card
        d = self.say()
        self.play(FadeOut(Group(*self.mobjects)), run_time=0.8)
        lines = VGroup(
            Tex(r"L2 $\;\rightarrow\;$ the mean", color=C_L2),
            Tex(r"L1 $\;\rightarrow\;$ the median", color=C_L1),
            Tex(r"Bins $\;\rightarrow\;$ the whole distribution", color=C_BIN),
            Tex(r"Decode: take the peak, then average inside it", color=C_Y),
            Tex(r"Choices that must agree ($x$ and $y$, the points of a shape):\\decide them together", color=C_GOOD),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.45).move_to(ORIGIN)
        for ln in lines:
            self.play(Write(ln), run_time=min(1.6, d / 5))
        self.sync(pad=2.5)
