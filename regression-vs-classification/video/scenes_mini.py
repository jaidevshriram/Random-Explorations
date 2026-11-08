"""Manim scenes for the mini-MapTR explainer. Shares the style and helpers of scenes.py."""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "maptr-mini"))

from scenes import *  # noqa: F401,F403  (NScene, colours, helpers)
from narration_mini import NARRATION as MINI  # noqa: E402
import mini_maptr as mm  # noqa: E402

C_OPEN, C_CLOSED = "#4DB6AC", "#BA68C8"  # the two shape classes


class MScene(NScene):
    narration = MINI


def sample_images(seed, n):
    rng = np.random.default_rng(seed)
    return [mm.make_sample(rng)[:3] for _ in range(n)]  # (image, labels, points)


def image_mob(img, size):
    rgb = np.repeat(img[..., None], 3, axis=2)
    m = ImageMobject(rgb).set_resampling_algorithm(RESAMPLING_ALGORITHMS["nearest"])
    m.stretch_to_fit_width(size).stretch_to_fit_height(size)
    return m


def to_scene(mob, size, xy):
    """Image coordinates in [0, 1] (y pointing down) -> scene point on an image mobject."""
    return mob.get_corner(UL) + RIGHT * xy[0] * size + DOWN * xy[1] * size


def shape_mob(mob, size, pts, closed, color, width=4, dots=True):
    path = [to_scene(mob, size, p) for p in pts]
    if closed:
        path = path + path[:1]
    line = VMobject(color=color, stroke_width=width).set_points_as_corners(path)
    g = VGroup(line)
    if dots:
        g.add(*[Dot(to_scene(mob, size, p), radius=0.05, color=color) for p in pts])
    return g


def frame_box(mob):
    return SurroundingRectangle(mob, buff=0, color=GREY_C, stroke_width=2)


class M01_Intro(MScene):
    def construct(self):
        title = Tex(r"Does it survive in a MapTR-style model?", font_size=50).to_edge(UP, buff=0.5)
        # left: the toy result
        nl = NumberLine(x_range=[0, 1, 0.1], length=5, color=GREY_B, tick_size=0.04).move_to(LEFT * 3.6 + 0.6 * DOWN)
        hb = bars_from(nl, mixture_hist(24, w=(0.4, 0.6), mu=(0.25, 0.75), sd=0.04), 5)
        tri = Triangle(color=C_L2, fill_opacity=1, stroke_width=0).scale(0.13).move_to(nl.n2p(0.55) + 0.25 * DOWN)
        lt = Tex(r"toy problem:\\bins keep both answers", font_size=32, color=C_BIN).next_to(nl, DOWN, buff=0.5)
        # right: a MapTR-style model
        box = RoundedRectangle(corner_radius=0.15, width=4.6, height=2.6, color=GREY_B).move_to(RIGHT * 3.4 + 0.3 * UP)
        qs = VGroup(*[Circle(radius=0.12, color=C_Y, fill_opacity=0.8, stroke_width=0) for _ in range(6)]).arrange(RIGHT, buff=0.25)
        qs.move_to(box.get_top() + 0.5 * DOWN)
        ql = Tex("queries", font_size=28, color=C_Y).next_to(qs, DOWN, buff=0.15)
        hm = Tex(r"Hungarian matching", font_size=30).move_to(box.get_center() + 0.3 * DOWN)
        sh = Tex(r"$\rightarrow$ shapes as point sets", font_size=30).next_to(hm, DOWN, buff=0.2)
        rt = Tex(r"your real model:\\MapTR style", font_size=32, color=GREY_A).next_to(box, DOWN, buff=0.5)

        d = self.say()
        self.play(Write(title), run_time=1.5)
        self.play(Create(nl), LaggedStart(*[GrowFromEdge(b, DOWN) for b in hb], lag_ratio=0.03), FadeIn(tri), Write(lt), run_time=2)
        self.play(Create(box), LaggedStart(*[FadeIn(q, scale=0.5) for q in qs], lag_ratio=0.1), FadeIn(ql), run_time=1.5)
        self.play(Write(hm), Write(sh), Write(rt), run_time=1.5)
        q = Tex("?", font_size=120, color=C_Y).move_to(0.3 * DOWN)
        self.play(FadeIn(q, scale=1.5), run_time=0.8)
        self.sync()

        d = self.say()
        self.play(FadeOut(Group(*self.mobjects)), run_time=0.8)
        a = VGroup(Tex(r"MapTR on nuScenes", font_size=40), Tex(r"rented GPUs, $\ge \$30$", font_size=36, color=C_L2)).arrange(DOWN, buff=0.2)
        b = VGroup(Tex(r"miniature MapTR", font_size=40), Tex(r"a laptop CPU, \$0", font_size=36, color=C_GOOD)).arrange(DOWN, buff=0.2)
        a.move_to(LEFT * 3.4)
        b.move_to(RIGHT * 3.4)
        arr = Arrow(a.get_right(), b.get_left(), color=GREY_B, buff=0.4)
        first = Tex("first", font_size=32, color=GREY_B).next_to(arr, UP, buff=0.1)
        self.play(FadeIn(a), run_time=0.8)
        self.play(GrowArrow(arr), FadeIn(first), FadeIn(b), run_time=1.2)
        self.play(Circumscribe(b, color=C_GOOD), run_time=1.2)
        self.sync(pad=0.8)


class M02_World(MScene):
    def construct(self):
        samples = sample_images(7, 3)
        size = 3.4
        ims = Group(*[image_mob(s[0], size) for s in samples]).arrange(RIGHT, buff=0.6).shift(0.2 * DOWN)
        frames = VGroup(*[frame_box(m) for m in ims])
        cap = Tex(r"$64 \times 64$ pixels, 1--3 shapes each", font_size=34, color=GREY_B).next_to(ims, DOWN, buff=0.4)
        title = Tex("The miniature world", font_size=46).to_edge(UP, buff=0.5)

        d = self.say()
        self.play(Write(title), run_time=1.0)
        self.play(LaggedStart(*[FadeIn(Group(m, f)) for m, f in zip(ims, frames)], lag_ratio=0.3), Write(cap), run_time=2.5)
        self.sync()

        d = self.say()
        overlays = VGroup()
        for m, (img, labels, pts) in zip(ims, samples):
            for l, p in zip(labels, pts):
                overlays.add(shape_mob(m, size, p, closed=bool(l), color=C_CLOSED if l else C_OPEN))
        self.play(ims.animate.set_opacity(0.35), run_time=0.6)
        self.play(LaggedStart(*[Create(o) for o in overlays], lag_ratio=0.15), run_time=3.0)
        legend = VGroup(
            VGroup(Dot(color=C_OPEN), Tex("open curve", font_size=32, color=C_OPEN)).arrange(RIGHT, buff=0.15),
            VGroup(Dot(color=C_CLOSED), Tex("closed loop", font_size=32, color=C_CLOSED)).arrange(RIGHT, buff=0.15),
            Tex("16 points each", font_size=32, color=GREY_A)).arrange(RIGHT, buff=0.8).next_to(ims, DOWN, buff=0.4)
        self.play(FadeOut(cap), FadeIn(legend), run_time=0.8)
        like = Tex(r"like MapTR's lane dividers and pedestrian crossings", font_size=32, color=GREY_B).next_to(legend, DOWN, buff=0.3)
        self.play(FadeIn(like), run_time=0.8)
        self.sync(pad=0.8)


class M03_Model(MScene):
    def construct(self):
        title = Tex("MapTR in miniature", font_size=46).to_edge(UP, buff=0.4)
        img, labels, pts = sample_images(3, 1)[0]
        im = image_mob(img, 1.8).move_to(LEFT * 5.6 + 0.6 * UP)
        fr = frame_box(im)
        cnn = RoundedRectangle(corner_radius=0.12, width=1.5, height=1.2, color=GREY_B).move_to(LEFT * 3.3 + 0.6 * UP)
        cnn_l = Tex("CNN", font_size=32).move_to(cnn)
        grid = VGroup(*[Square(0.16, stroke_width=1, color=GREY_C) for _ in range(36)]).arrange_in_grid(6, 6, buff=0.02)
        grid.move_to(LEFT * 1.3 + 0.6 * UP)
        gl = Tex("features", font_size=26, color=GREY_B).next_to(grid, DOWN, buff=0.15)
        dec = RoundedRectangle(corner_radius=0.12, width=2.6, height=1.2, color=GREY_B).move_to(RIGHT * 1.6 + 0.6 * UP)
        dec_l = Tex(r"transformer\\decoder", font_size=28).move_to(dec)
        qs = VGroup(*[Circle(radius=0.09, color=C_Y, fill_opacity=0.9, stroke_width=0) for _ in range(12)]).arrange(RIGHT, buff=0.08)
        qs.next_to(dec, UP, buff=0.45)
        ql = Tex("12 queries", font_size=28, color=C_Y).next_to(qs, UP, buff=0.12)
        out = Tex(r"each query:\\class $+$ 16 points", font_size=30).move_to(RIGHT * 5.2 + 0.6 * UP)
        arrows = VGroup(Arrow(fr.get_right(), cnn.get_left(), buff=0.1, color=GREY_B),
                        Arrow(cnn.get_right(), grid.get_left(), buff=0.1, color=GREY_B),
                        Arrow(grid.get_right(), dec.get_left(), buff=0.1, color=GREY_B),
                        Arrow(qs.get_bottom(), dec.get_top(), buff=0.05, color=C_Y),
                        Arrow(dec.get_right(), out.get_left(), buff=0.1, color=GREY_B))

        d = self.say()
        self.play(Write(title), FadeIn(im), Create(fr), run_time=1.2)
        self.play(GrowArrow(arrows[0]), Create(cnn), Write(cnn_l), run_time=1.0)
        self.play(GrowArrow(arrows[1]), LaggedStart(*[FadeIn(s) for s in grid], lag_ratio=0.01), FadeIn(gl), run_time=1.2)
        self.play(GrowArrow(arrows[2]), Create(dec), Write(dec_l), run_time=1.0)
        self.play(LaggedStart(*[FadeIn(q, scale=0.5) for q in qs], lag_ratio=0.05), FadeIn(ql), GrowArrow(arrows[3]), run_time=1.5)
        self.sync()

        d = self.say()
        self.play(GrowArrow(arrows[4]), Write(out), run_time=1.2)
        only = Tex(r"the only change:", font_size=34, color=C_Y).move_to(1.3 * DOWN)
        self.play(FadeIn(only), Indicate(out, color=C_Y), run_time=1.2)
        left = VGroup(Tex(r"baseline: one number per coordinate", font_size=32, color=C_L2),
                      MathTex(r"x = 0.42", font_size=40, color=C_L2),
                      Tex(r"trained with L1", font_size=30, color=C_L2)).arrange(DOWN, buff=0.2).move_to(LEFT * 3.4 + 2.6 * DOWN)
        mini = NumberLine(x_range=[0, 1, 1], length=3.0, color=GREY_B, include_ticks=False)
        mb = bars_from(mini, mixture_hist(32, w=(0.0, 1.0), mu=(0.3, 0.42), sd=0.04), 3.2)
        right = VGroup(Tex(r"bin head: a histogram per coordinate", font_size=32, color=C_BIN), VGroup(mini, mb),
                       Tex(r"64 bins, trained with cross-entropy", font_size=30, color=C_BIN)).arrange(DOWN, buff=0.2)
        right.move_to(RIGHT * 3.4 + 2.6 * DOWN)
        self.play(FadeIn(left), run_time=1.2)
        self.play(FadeIn(right[0]), Create(mini), LaggedStart(*[GrowFromEdge(b, DOWN) for b in mb], lag_ratio=0.03),
                  FadeIn(right[2]), run_time=1.8)
        self.sync(pad=0.8)


class M04_Matching(MScene):
    def construct(self):
        title = Tex("Hungarian matching", font_size=46).to_edge(UP, buff=0.4)
        img, labels, pts = sample_images(11, 1)[0]
        size = 4.2
        im = image_mob(img, size).move_to(LEFT * 3.5 + 0.4 * DOWN).set_opacity(0.4)
        fr = frame_box(im)
        shapes = VGroup(*[shape_mob(im, size, p, bool(l), C_CLOSED if l else C_OPEN, dots=False) for l, p in zip(labels, pts)])
        qboxes = VGroup(*[VGroup(Circle(radius=0.22, color=C_Y, stroke_width=3), Tex(f"q{i + 1}", font_size=26, color=C_Y))
                          for i in range(4)]).arrange(DOWN, buff=0.45).move_to(RIGHT * 2.6 + 0.4 * DOWN)
        for qb in qboxes:
            qb[1].move_to(qb[0])

        d = self.say()
        self.play(Write(title), FadeIn(im), Create(fr), run_time=1.2)
        self.play(LaggedStart(*[Create(s) for s in shapes], lag_ratio=0.3), FadeIn(qboxes), run_time=1.8)
        pairs = [(0, 1), (1, 3)] if len(shapes) >= 2 else [(0, 1)]
        links = VGroup(*[Line(shapes[s].get_center(), qboxes[q][0].get_left(), color=GREY_A, stroke_width=3) for s, q in pairs])
        self.play(LaggedStart(*[Create(l_) for l_ in links], lag_ratio=0.4), run_time=1.6)
        rest = [i for i in range(4) if i not in [q for _, q in pairs]]
        no = VGroup(*[Tex("no object", font_size=24, color=GREY_B).next_to(qboxes[i], RIGHT, buff=0.15) for i in rest])
        self.play(FadeIn(no), run_time=0.8)
        self.sync()

        # beat 1: equivalent orderings
        d = self.say()
        self.play(FadeOut(Group(*[m for m in self.mobjects if m is not title])), run_time=0.8)
        t = np.linspace(0, 1, 16)
        open_pts = np.stack([-5.0 + 3.6 * t, 0.2 + 0.9 * np.sin(np.pi * t * 1.2)], 1)
        th = np.linspace(0, 2 * np.pi, 16, endpoint=False)
        loop_pts = np.stack([2.8 + 1.5 * np.cos(th), 0.2 + 1.1 * np.sin(th)], 1)
        op = VMobject(color=C_OPEN, stroke_width=5).set_points_as_corners([[*p, 0] for p in open_pts])
        lp = VMobject(color=C_CLOSED, stroke_width=5).set_points_as_corners([[*p, 0] for p in np.vstack([loop_pts, loop_pts[:1]])])
        odots = VGroup(*[Dot([*p, 0], radius=0.06, color=C_OPEN) for p in open_pts])
        ldots = VGroup(*[Dot([*p, 0], radius=0.06, color=C_CLOSED) for p in loop_pts])
        self.play(Create(op), FadeIn(odots), Create(lp), FadeIn(ldots), run_time=1.5)
        a1 = Arrow([*open_pts[-3], 0], [*open_pts[-1], 0] + RIGHT * 0.3, color=C_Y, buff=0)
        start = Dot([*open_pts[0], 0], radius=0.13, color=C_Y)
        ot = Tex(r"2 orderings", font_size=34, color=C_OPEN).move_to(LEFT * 3.2 + 2.2 * DOWN)
        self.play(FadeIn(start), GrowArrow(a1), run_time=0.8)
        a1b = Arrow([*open_pts[2], 0], [*open_pts[0], 0] + LEFT * 0.3, color=C_Y, buff=0)
        self.play(start.animate.move_to([*open_pts[-1], 0]), ReplacementTransform(a1, a1b), FadeIn(ot), run_time=1.0)
        k = ValueTracker(0)
        ls = always_redraw(lambda: Dot([*loop_pts[int(k.get_value()) % 16], 0], radius=0.13, color=C_Y))
        lt = Tex(r"$16 \text{ starts} \times 2 \text{ directions} = 32$ orderings", font_size=34, color=C_CLOSED).move_to(RIGHT * 2.8 + 2.2 * DOWN)
        self.add(ls)
        self.play(k.animate.set_value(15.9), run_time=2.5, rate_func=linear)
        self.play(FadeIn(lt), run_time=0.8)
        best = Tex(r"the matching cost uses the best-fitting ordering", font_size=34, color=GREY_A).to_edge(DOWN, buff=0.4)
        self.play(FadeIn(best), run_time=0.8)
        self.sync()

        # beat 2: two matching costs for the bin head
        d = self.say()
        self.remove(ls)
        self.play(FadeOut(Group(*[m for m in self.mobjects if m is not title])), run_time=0.8)
        c1 = VGroup(Tex(r"bins + L1 cost", font_size=36, color=C_BIN),
                    MathTex(r"\text{cost} = \tfrac{1}{32}\sum |\,\text{decode}(p) - y\,|", font_size=40)).arrange(DOWN, buff=0.3)
        c2 = VGroup(Tex(r"bins + NLL cost", font_size=36, color="#9467bd"),
                    MathTex(r"\text{cost} = \tfrac{1}{32}\sum -\log p\big(\text{bin}(y)\big)", font_size=40)).arrange(DOWN, buff=0.3)
        VGroup(c1, c2).arrange(DOWN, buff=0.9).move_to(0.2 * DOWN)
        self.play(FadeIn(c1), run_time=1.2)
        self.play(FadeIn(c2), run_time=1.2)
        self.sync(pad=0.8)


class M05_Score(MScene):
    def construct(self):
        title = Tex("How it's scored", font_size=46).to_edge(UP, buff=0.4)
        th = np.linspace(0, 2 * np.pi, 16, endpoint=False)
        true = np.stack([-2.6 + 1.6 * np.cos(th), 0.3 + 1.2 * np.sin(th)], 1)
        rng = np.random.default_rng(0)
        pred = np.stack([-2.45 + 1.5 * np.cos(th + 0.1), 0.25 + 1.25 * np.sin(th + 0.1)], 1) + 0.05 * rng.standard_normal((16, 2))
        tm = VMobject(color=C_GOOD, stroke_width=5).set_points_as_corners([[*p, 0] for p in np.vstack([true, true[:1]])])
        pm = VMobject(color=C_Y, stroke_width=4).set_points_as_corners([[*p, 0] for p in np.vstack([pred, pred[:1]])])
        pd = VGroup(*[Dot([*p, 0], radius=0.05, color=C_Y) for p in pred])
        tl = Tex("true shape", font_size=30, color=C_GOOD).next_to(tm, UP, buff=0.15)
        pl = Tex("prediction", font_size=30, color=C_Y).next_to(tm, DOWN, buff=0.15)

        d = self.say()
        self.play(Write(title), Create(tm), FadeIn(tl), run_time=1.2)
        self.play(Create(pm), FadeIn(pd), FadeIn(pl), run_time=1.2)
        near = VGroup(*[Line([*p, 0], [*true[np.argmin(((true - p) ** 2).sum(1))], 0], color=GREY_A, stroke_width=2) for p in pred])
        self.play(Create(near), run_time=1.0)
        ch = MathTex(r"\text{Chamfer} = \text{average distance to the nearest point}", font_size=34).move_to(RIGHT * 2.6 + 1.6 * UP)
        self.play(Write(ch), run_time=1.2)
        rows = VGroup(*[Tex(f"under {t} px?", font_size=34) for t in (1, 2, 3)]).arrange(DOWN, buff=0.3, aligned_edge=LEFT)
        rows.move_to(RIGHT * 2.2 + 0.1 * DOWN)
        self.play(LaggedStart(*[FadeIn(r) for r in rows], lag_ratio=0.3), run_time=1.2)
        mp = Tex(r"average precision over the 3 thresholds $=$ mAP", font_size=34, color=C_BIN).move_to(RIGHT * 2.6 + 1.9 * DOWN)
        self.play(Write(mp), run_time=1.2)
        self.sync()

        d = self.say()
        self.play(FadeOut(Group(*[m for m in self.mobjects if m is not title])), run_time=0.8)
        loop = Circle(radius=1.1, color=C_CLOSED, stroke_width=5).move_to(LEFT * 3.2 + 0.4 * UP)
        c1 = Tex(r"checkpoint 1:\\matched to query 3", font_size=32).next_to(loop, RIGHT, buff=0.6).shift(0.6 * UP)
        c2 = Tex(r"checkpoint 2:\\matched to query 7", font_size=32, color=C_GHOST).next_to(c1, DOWN, buff=0.5).align_to(c1, LEFT)
        flip = Tex(r"$\Rightarrow$ a flip", font_size=34, color=C_GHOST).next_to(c2, RIGHT, buff=0.3)
        self.play(Create(loop), FadeIn(c1), run_time=1.2)
        self.play(FadeIn(c2), FadeIn(flip), run_time=1.2)
        runs = Tex(r"3 setups $\times$ 3 training runs $\times$ 8{,}000 steps", font_size=36, color=GREY_A).to_edge(DOWN, buff=0.8)
        self.play(Write(runs), run_time=1.5)
        self.sync(pad=0.8)


# ----------------------------------------------------------------------------- results

RUN_COLORS = {"l1": C_L2, "bins": C_BIN, "bins_nll": "#9467bd"}
RUN_NAMES = {"l1": "L1 regression", "bins": "bins, L1 cost", "bins_nll": "bins, NLL cost"}


def load_runs(folder):
    import glob
    import json
    runs = {}
    for f in sorted(glob.glob(os.path.join(HERE, "..", "maptr-mini", folder, "*.json"))):
        r = json.load(open(f))
        runs.setdefault(r["head"], []).append(r)
    return runs


def curve(ax, runs, head, key):
    """Mean line and min-max band over seeds for one head."""
    rs = runs[head]
    steps = np.array([e["step"] for e in rs[0]["evals"]])
    v = np.array([[np.nan if e[key] is None else e[key] for e in r["evals"]] for r in rs], dtype=float)
    ok = ~np.isnan(v).all(0)
    steps, v = steps[ok], v[:, ok]
    lo, hi, mean = v.min(0), v.max(0), v.mean(0)
    col = RUN_COLORS[head]
    band = Polygon(*[ax.c2p(s, y) for s, y in zip(steps, hi)], *[ax.c2p(s, y) for s, y in zip(steps[::-1], lo[::-1])],
                   stroke_width=0, fill_color=col, fill_opacity=0.25)
    line = VMobject(color=col, stroke_width=5).set_points_as_corners([ax.c2p(s, y) for s, y in zip(steps, mean)])
    return band, line, mean[-1]


def result_axes(y_max, y_step, y_label, width=9.0, height=5.0):
    ax = Axes(x_range=[0, 8000, 2000], y_range=[0, y_max, y_step], x_length=width, y_length=height, tips=False,
              axis_config={"color": GREY_B, "include_numbers": True, "font_size": 26},
              x_axis_config={"decimal_number_config": {"num_decimal_places": 0}},
              y_axis_config={"decimal_number_config": {"num_decimal_places": 2}})
    xl = Tex("training step", font_size=30, color=GREY_B).next_to(ax.x_axis, DOWN, buff=0.45)
    yl = Tex(y_label, font_size=30, color=GREY_B).rotate(PI / 2).next_to(ax.y_axis, LEFT, buff=0.6)
    return ax, VGroup(xl, yl)


class M06_Result1(MScene):
    def construct(self):
        runs = load_runs("runs")
        title = Tex("Result 1: clean labels", font_size=44).to_edge(UP, buff=0.3)
        ax, labels = result_axes(0.32, 0.1, "mAP")
        VGroup(ax, labels).shift(1.4 * LEFT + 0.35 * DOWN)

        d = self.say()
        self.play(Write(title), Create(ax), FadeIn(labels), run_time=1.5)
        finals = {}
        for head in ("l1", "bins", "bins_nll"):
            band, line, final = curve(ax, runs, head, "mAP")
            finals[head] = final
            lab = Tex(RUN_NAMES[head], font_size=30, color=RUN_COLORS[head])
            self.play(FadeIn(band), Create(line), run_time=max(1.2, (d - 2) / 3.6), rate_func=linear)
            lab.next_to(line.get_end(), RIGHT, buff=0.2)
            self.add(lab)
        self.sync()

        d = self.say()
        early = Rectangle(width=ax.c2p(1500, 0)[0] - ax.c2p(0, 0)[0], height=ax.y_length, color=C_Y, fill_opacity=0.08,
                          stroke_width=2).move_to(ax.c2p(750, 0.16))
        et = Tex("bins: a slow start", font_size=30, color=C_Y).next_to(early, UP, buff=0.1)
        self.play(Create(early), FadeIn(et), run_time=1.2)
        tab = VGroup(*[Tex(f"{RUN_NAMES[h]}: {finals[h]:.3f}", font_size=32, color=RUN_COLORS[h])
                       for h in ("l1", "bins", "bins_nll")]).arrange(DOWN, aligned_edge=LEFT, buff=0.2)
        tab.to_corner(DR, buff=0.5).shift(0.6 * UP)
        th = Tex("final mAP", font_size=32, color=GREY_A).next_to(tab, UP, buff=0.2, aligned_edge=LEFT)
        self.play(FadeIn(th), LaggedStart(*[FadeIn(t) for t in tab], lag_ratio=0.3), run_time=1.5)
        self.sync()

        d = self.say()
        self.play(FadeOut(Group(*[m for m in self.mobjects if m is not title])), run_time=0.8)
        ax2, labels2 = result_axes(0.25, 0.05, "matching flip rate")
        VGroup(ax2, labels2).shift(1.0 * LEFT + 0.35 * DOWN)
        self.play(Create(ax2), FadeIn(labels2), run_time=1.0)
        for head in ("l1", "bins", "bins_nll"):
            band, line, _ = curve(ax2, runs, head, "flip_rate")
            self.play(FadeIn(band), Create(line), run_time=1.0, rate_func=linear)
        same = Tex("about the same for all three", font_size=34, color=GREY_A).move_to(ax2.c2p(5200, 0.18))
        self.play(FadeIn(same), run_time=0.8)
        self.sync(pad=0.8)


class M07_Why(MScene):
    def construct(self):
        img, labels, pts, _ = mm.make_sample(np.random.default_rng(21))
        size = 4.0
        im = image_mob(img, size).move_to(LEFT * 3.6 + 0.2 * DOWN)
        fr = frame_box(im)
        k = 0
        sh = shape_mob(im, size, pts[k], bool(labels[k]), C_GOOD)
        tl = Tex(r"label: exactly on the stroke", font_size=32, color=C_GOOD).next_to(fr, DOWN, buff=0.3)

        d = self.say()
        self.play(FadeIn(im), Create(fr), run_time=1.0)
        self.play(Create(sh), FadeIn(tl), run_time=1.5)
        one = Tex(r"one right answer\\per point", font_size=36, color=C_GOOD).move_to(RIGHT * 3.2 + 1.8 * UP)
        self.play(FadeIn(one), run_time=0.8)
        nl1 = NumberLine(x_range=[0, 1, 1], length=3.4, color=GREY_B, include_ticks=False).move_to(RIGHT * 3.2 + 0.1 * DOWN)
        hb = bars_from(nl1, mixture_hist(32, w=(0.0, 1.0), mu=(0.3, 0.55), sd=0.03), 3.0)
        r1 = Tex(r"bins: one peak, 64 outputs", font_size=30, color=C_BIN).next_to(nl1, DOWN, buff=0.15)
        r2 = Tex(r"L1: one number", font_size=30, color=C_L2).next_to(r1, DOWN, buff=0.35)
        self.play(Create(nl1), LaggedStart(*[GrowFromEdge(b, DOWN) for b in hb], lag_ratio=0.02), FadeIn(r1), run_time=1.5)
        self.play(FadeIn(r2), run_time=0.8)
        self.sync()

        d = self.say()
        self.play(FadeOut(Group(*self.mobjects)), run_time=0.8)
        nl = number_line(y=-0.6, length=8)
        bars = bars_from(nl, mixture_hist(40, w=(0.5, 0.5), mu=(0.25, 0.75), sd=0.03), 7)
        tri = Triangle(color=C_L2, fill_opacity=1, stroke_width=0).scale(0.15).move_to(nl.n2p(0.5) + 0.25 * DOWN)
        rec = Tex(r"the toy problem: bins won only with \emph{two} right answers", font_size=36).to_edge(UP, buff=1.0)
        self.play(Write(rec), Create(nl), LaggedStart(*[GrowFromEdge(b, DOWN) for b in bars], lag_ratio=0.02),
                  FadeIn(tri), run_time=2.0)
        add = Tex("so: add ambiguity", font_size=42, color=C_Y).to_edge(DOWN, buff=1.0)
        self.play(Write(add), run_time=1.0)
        self.sync(pad=0.8)


class M08_Ambiguous(MScene):
    def construct(self):
        title = Tex("Experiment 2: double lines", font_size=44).to_edge(UP, buff=0.4)
        rng = np.random.default_rng(31)
        samples = []
        while len(samples) < 3:  # images whose first element is an open curve
            s = mm.make_sample(rng, ambiguous=True)
            if s[1][0] == 0:
                samples.append(s)
        size = 3.4
        ims = Group(*[image_mob(s[0], size) for s in samples]).arrange(RIGHT, buff=0.6).shift(0.1 * DOWN)
        frames = VGroup(*[frame_box(m) for m in ims])

        d = self.say()
        self.play(Write(title), LaggedStart(*[FadeIn(Group(m, f)) for m, f in zip(ims, frames)], lag_ratio=0.3), run_time=2.0)
        labs = VGroup()
        for m, (img, labels, pts, alts) in zip(ims, samples):
            labs.add(shape_mob(m, size, pts[0], False, C_Y, width=3))
        self.play(ims.animate.set_opacity(0.6), run_time=0.4)
        self.play(LaggedStart(*[Create(l_) for l_ in labs], lag_ratio=0.3), run_time=2.0)
        lt = Tex(r"label: one of the two strokes, at random", font_size=34, color=C_Y).next_to(ims, DOWN, buff=0.4)
        self.play(FadeIn(lt), run_time=0.8)
        # flip each label to the other stroke and back: two annotators
        other = VGroup()
        for m, (img, labels, pts, alts) in zip(ims, samples):
            alt = alts[0][1] if np.allclose(alts[0][0], pts[0]) else alts[0][0]
            other.add(shape_mob(m, size, alt, False, C_Y, width=3))
        self.play(Transform(labs, other), run_time=1.2)
        self.sync()

        d = self.say()
        self.play(FadeOut(lt), run_time=0.4)
        m0 = ims[0]
        a0, b0 = samples[0][3][0]
        okA = shape_mob(m0, size, a0, False, C_GOOD, width=3, dots=False)
        okB = shape_mob(m0, size, b0, False, C_GOOD, width=3, dots=False)
        mid = shape_mob(m0, size, (a0 + b0) / 2, False, C_L2, width=3, dots=False)
        ok_t = Tex(r"either stroke: correct", font_size=32, color=C_GOOD).next_to(ims, DOWN, buff=0.4)
        mid_t = Tex(r"in between: 2.5 px from both, wrong at 1 and 2 px", font_size=32, color=C_L2).next_to(ok_t, DOWN, buff=0.2)
        self.play(FadeOut(labs), Create(okA), Create(okB), FadeIn(ok_t), run_time=1.5)
        self.play(Create(mid), FadeIn(mid_t), run_time=1.5)
        self.sync(pad=0.8)
