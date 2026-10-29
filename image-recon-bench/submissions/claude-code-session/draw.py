"""Hand-drawn reconstruction of lego_r19, written as a small SVG generator.

Every coordinate and colour below was read off the reference by eye (using
`python bench.py grid lego_r19` and zoomed crops). Nothing here reads the
reference pixels; the only feedback used was the render, heatmap and score
from `python bench.py check`.

    python submissions/claude-code-session/draw.py > submissions/claude-code-session/lego_r19.svg
"""

parts = []


def poly(points, fill, extra=""):
    pts = " ".join(f"{x},{y}" for x, y in points)
    parts.append(f'<polygon points="{pts}" fill="{fill}"{extra}/>')


def circle(cx, cy, r, fill):
    parts.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"/>')


def rod(x1, y1, x2, y2, w=6, color="#1e1e22"):
    parts.append(
        f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" '
        f'stroke-width="{w}" stroke-linecap="round"/>'
    )


def beam(x1, y1, x2, y2, w, fill="#f2bf1a"):
    """A straight Technic beam from (x1,y1) to (x2,y2), w pixels wide."""
    dx, dy = x2 - x1, y2 - y1
    n = (dx * dx + dy * dy) ** 0.5
    ox, oy = -dy / n * w / 2, dx / n * w / 2
    poly([(round(x1 + ox), round(y1 + oy)), (round(x2 + ox), round(y2 + oy)),
          (round(x2 - ox), round(y2 - oy)), (round(x1 - ox), round(y1 - oy))], fill)


YELLOW = "#d6a015"
YELLOW_LIT = "#ffd43c"
YELLOW_SHADE = "#c89410"
GRAY = "#8a8a92"
GRAY_DARK = "#8d8d96"
BLACK = "#1f1f22"
TRACTOR_BLUR = 4  # chosen by trying 3-7 against the score

# --- base plate -------------------------------------------------------------
poly([(40, 490), (527, 371), (742, 457), (742, 465), (180, 640)], "#d9c398")
poly([(180, 640), (742, 465), (742, 476), (184, 655)], "#e6c49a")
poly([(40, 490), (180, 640), (184, 655), (40, 500)], "#d8b086")
poly([(40, 482), (300, 420), (303, 436), (44, 498)], "#8e5a3c")
poly([(180, 622), (742, 451), (742, 465), (180, 640)], "#98633f")
# shadow of the tractor on the plate
poly([(395, 470), (520, 445), (665, 440), (690, 470), (520, 528), (430, 528)], "#7a6a4c")

parts.append('</g><g filter="url(#t)">')

# --- far side: track, grille and front block --------------------------------
poly([(286, 380), (306, 378), (311, 448), (292, 446)], BLACK)
poly([(280, 332), (314, 328), (316, 382), (284, 384)], "#4a4a50")
poly([(300, 378), (346, 372), (348, 452), (304, 454)], BLACK)
for y in (386, 400, 413, 426, 439):
    poly([(300, y), (346, y - 4), (346, y + 4), (300, y + 8)], "#9a9aa2")
poly([(305, 420), (390, 418), (392, 466), (307, 463)], YELLOW)
beam(365, 342, 378, 458, 30, YELLOW)

# --- body ---------------------------------------------------------------------
poly([(392, 305), (540, 295), (635, 305), (637, 372), (392, 404)], YELLOW)
poly([(473, 323), (633, 323), (633, 370), (475, 372)], "#e0b020")
poly([(475, 370), (633, 368), (633, 384), (480, 396)], YELLOW_SHADE)
poly([(395, 380), (472, 374), (474, 404), (395, 408)], GRAY)
circle(555, 312, 16, GRAY)
circle(492, 385, 17, GRAY)
poly([(590, 310), (634, 312), (636, 372), (592, 372)], YELLOW)
# hose loop on the right
parts.append('<path d="M632,322 Q662,345 650,385" fill="none" stroke="#d6d6de" stroke-width="7"/>')

# --- near track -------------------------------------------------------------
parts.append(
    f'<path d="M398,402 L636,370 Q660,385 660,420 Q660,446 650,452 L436,522 '
    f'Q396,522 392,475 Q390,415 398,402 Z" fill="{BLACK}"/>'
)
poly([(450, 418), (605, 394), (612, 442), (455, 466)], YELLOW_SHADE)
circle(457, 462, 41, GRAY)
circle(457, 462, 16, GRAY_DARK)
circle(610, 428, 36, GRAY)
circle(610, 428, 14, GRAY_DARK)

# --- cab ----------------------------------------------------------------------
poly([(475, 193), (615, 195), (617, 203), (477, 203)], YELLOW_LIT)
poly([(477, 203), (617, 203), (618, 215), (478, 215)], "#eab616")
poly([(550, 215), (595, 215), (595, 228), (552, 228)], YELLOW_SHADE)
poly([(550, 217), (562, 217), (562, 297), (550, 297)], YELLOW_SHADE)
beam(483, 216, 420, 385, 32, YELLOW)
beam(528, 214, 502, 330, 18, YELLOW)
poly([(598, 205), (620, 205), (616, 318), (596, 318)], YELLOW)
poly([(443, 247), (460, 247), (460, 280), (443, 280)], BLACK)
poly([(542, 177), (552, 177), (552, 195), (542, 195)], "#d4141a")

# --- boom -----------------------------------------------------------------------
beam(298, 258, 420, 340, 36, YELLOW)
beam(394, 202, 366, 336, 30, YELLOW)
poly([(345, 280), (470, 290), (476, 360), (395, 395), (352, 335)], YELLOW)
poly([(282, 256), (338, 258), (336, 292), (292, 288)], YELLOW_SHADE)

# --- bucket ---------------------------------------------------------------------
poly([(187, 117), (312, 122), (330, 150), (342, 197), (340, 225), (325, 240), (300, 258),
      (272, 273), (230, 272), (150, 258), (95, 240), (90, 228), (127, 220)], YELLOW)
poly([(200, 124), (308, 128), (316, 222), (200, 222)], YELLOW_LIT)
poly([(90, 228), (127, 220), (260, 245), (272, 273), (230, 272), (150, 258), (95, 240)], "#f6c22a")

# --- rods and connectors ------------------------------------------------------
rod(325, 145, 380, 210)
rod(400, 240, 455, 305)
rod(487, 242, 600, 285)
rod(423, 370, 537, 343)
rod(460, 300, 493, 310, 5)
for cx, cy in ((325, 147), (400, 240), (453, 298), (537, 248), (615, 288), (520, 320),
               (530, 343), (433, 370), (350, 315), (453, 450)):
    circle(cx, cy, 8, "#a8a8b0")

print('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">')
print('<defs><filter id="s"><feGaussianBlur stdDeviation="1.5"/></filter>'
      f'<filter id="t"><feGaussianBlur stdDeviation="{TRACTOR_BLUR}"/></filter></defs>')
print('<rect width="800" height="800" fill="#fff"/><g filter="url(#s)">')
print("\n".join(parts))
print("</g></svg>")
