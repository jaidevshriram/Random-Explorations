"""The reference image set: classic test images from OpenCV's samples/data."""

import hashlib
import io
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMAGES_DIR = ROOT / "images"

# Pinned to a release tag so the bench is reproducible.
OPENCV_BASE = "https://raw.githubusercontent.com/opencv/opencv/4.10.0/samples/data/"

# Longest side of each reference after preprocessing. Keeps images small enough
# that Claude sees them at full resolution and SVGs stay tractable.
MAX_SIDE = 512

# id -> (source filename, sha256 of the downloaded file)
REFERENCE_SET = {
    "lena": ("lena.jpg", "7de7ed51a1594fff247f4cae2301eceacf5313d6011e37b4a4c8733f7bb72c07"),
    "baboon": ("baboon.jpg", "1a1dd18d78eec44420af3b0b7f08ee3d41c982916cae3ce203d7ff35d754cc0f"),
    "fruits": ("fruits.jpg", "9c031d80a1c52da5eca790db896baffec6a7e52bf786cdb7bbfca5c7f880e6a1"),
    "butterfly": ("butterfly.jpg", "34a99716b78ded10eae87b4880de739d3e68cc7dd1a96812bb28f469d5eeaea8"),
    "starry_night": ("starry_night.jpg", "accda7a19a90f22a4a922fdc8c230167d7abf5f80882171e2cee125c5f12481d"),
    "smarties": ("smarties.png", "ad3f751c053fdcf432687c1bc0e56a61a9119d2bb2ae29365f8aa6534fc77417"),
    "messi": ("messi5.jpg", "1d570e49654e84c7a943918537bd9e5e1ef82920152e147c834006e235be97c9"),
    "opencv_logo": ("opencv-logo.png", "f98b67a2813c9749faad7648d4c8214b74ac26447cc35711fad1cdef06123ce0"),
}


def image_path(image_id: str) -> Path:
    return IMAGES_DIR / f"{image_id}.png"


def preprocess(raw: bytes) -> Image.Image:
    """Decode, flatten alpha onto white, and downscale to MAX_SIDE."""
    im = Image.open(io.BytesIO(raw))
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        im = Image.alpha_composite(bg, im)
    im = im.convert("RGB")
    scale = MAX_SIDE / max(im.size)
    if scale < 1:
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    return im


def fetch_all(force: bool = False) -> None:
    IMAGES_DIR.mkdir(exist_ok=True)
    for image_id, (filename, sha) in REFERENCE_SET.items():
        out = image_path(image_id)
        if out.exists() and not force:
            print(f"  {image_id:<14} already present")
            continue
        with urllib.request.urlopen(OPENCV_BASE + filename, timeout=60) as r:
            raw = r.read()
        got = hashlib.sha256(raw).hexdigest()
        if got != sha:
            raise RuntimeError(f"{filename}: sha256 mismatch (got {got}, expected {sha})")
        im = preprocess(raw)
        im.save(out)
        print(f"  {image_id:<14} {im.width}x{im.height}  <- {filename}")


def load_reference(image_id: str) -> Image.Image:
    path = image_path(image_id)
    if not path.exists():
        raise FileNotFoundError(f"{path} missing - run `python bench.py fetch` first")
    return Image.open(path).convert("RGB")
