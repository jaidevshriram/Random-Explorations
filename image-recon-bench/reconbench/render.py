"""Validate and rasterize SVG submissions.

The rules exist so a submission has to *draw* the image rather than smuggle it
in: no embedded or linked raster data, no external references, no text (font
rendering differs between machines), and a hard byte budget so that "one
<rect> per pixel" is not a strategy.
"""

import io
import re
import xml.etree.ElementTree as ET

import numpy as np
import resvg_py
from PIL import Image

DEFAULT_BYTE_BUDGET = 32 * 1024

SVG_NS = "http://www.w3.org/2000/svg"
FORBIDDEN_ELEMENTS = {
    "image", "feImage", "foreignObject", "script", "iframe", "video", "audio",
    "canvas", "text", "tspan", "textPath", "font", "font-face",
}
_URL_RE = re.compile(r"url\(\s*(['\"]?)\s*([^)'\"]*)\1\s*\)", re.I)


class InvalidSubmission(ValueError):
    pass


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def validate_svg(svg: str, byte_budget: int = DEFAULT_BYTE_BUDGET) -> ET.Element:
    """Raise InvalidSubmission if the SVG breaks the rules; return the parsed root."""
    size = len(svg.encode("utf-8"))
    if size > byte_budget:
        raise InvalidSubmission(f"SVG is {size} bytes, over the {byte_budget}-byte budget")
    if re.search(r"<!(DOCTYPE|ENTITY)", svg, re.I):
        raise InvalidSubmission("DOCTYPE/ENTITY declarations are not allowed")
    if re.search(r"@import|data:", svg, re.I):
        raise InvalidSubmission("@import and data: URIs are not allowed")
    try:
        root = ET.fromstring(svg)
    except ET.ParseError as e:
        raise InvalidSubmission(f"not well-formed XML: {e}") from e
    if _local(root.tag) != "svg":
        raise InvalidSubmission(f"root element is <{_local(root.tag)}>, expected <svg>")

    for el in root.iter():
        name = _local(el.tag)
        if name in FORBIDDEN_ELEMENTS:
            raise InvalidSubmission(f"<{name}> is not allowed")
        for attr, value in el.attrib.items():
            if _local(attr) == "href" and not value.strip().startswith("#"):
                raise InvalidSubmission(f"external reference not allowed: {attr}={value!r}")
            _check_urls(value)
        if name == "style" and el.text:
            _check_urls(el.text)
    return root


def _check_urls(text: str) -> None:
    for m in _URL_RE.finditer(text):
        if not m.group(2).strip().startswith("#"):
            raise InvalidSubmission(f"external url() not allowed: {m.group(0)!r}")


def render_svg(svg: str, width: int, height: int, byte_budget: int = DEFAULT_BYTE_BUDGET) -> np.ndarray:
    """Validate and rasterize an SVG to an (H, W, 3) uint8 array on a white background.

    The root's width/height are forced to the reference size, so the SVG's user
    units are pixels unless it declares its own viewBox.
    """
    root = validate_svg(svg, byte_budget)
    root.set("width", str(width))
    root.set("height", str(height))
    ET.register_namespace("", SVG_NS)
    ET.register_namespace("xlink", "http://www.w3.org/1999/xlink")
    try:
        png = resvg_py.svg_to_bytes(svg_string=ET.tostring(root, encoding="unicode"), skip_system_fonts=True)
    except ValueError as e:
        raise InvalidSubmission(f"render failed: {e}") from e
    im = Image.open(io.BytesIO(bytes(png))).convert("RGBA")
    if im.size != (width, height):
        raise InvalidSubmission(f"rendered at {im.size}, expected {(width, height)}")
    bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
    return np.asarray(Image.alpha_composite(bg, im).convert("RGB"))
