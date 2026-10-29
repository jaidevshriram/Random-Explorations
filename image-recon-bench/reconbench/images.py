"""The reference image set: the Lego bulldozer from the NeRF synthetic dataset.

Frames come from the authors' official `nerf_synthetic.zip` (Google Drive
folder linked from https://github.com/bmild/nerf). The archive is 1.27 GB, so
we read only the entries we need with HTTP range requests.
"""

import hashlib
import io
import urllib.request
import zipfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMAGES_DIR = ROOT / "images"

NERF_SYNTHETIC_URL = (
    "https://drive.usercontent.google.com/download"
    "?id=1OsiBs2udl32-1CqTXCitmov4NQCYdA9g&export=download&confirm=t"
)

# id -> (path inside nerf_synthetic.zip, sha256 of that PNG)
REFERENCE_SET = {
    "lego_r19": (
        "nerf_synthetic/lego/train/r_19.png",
        "74feffe719c46965e0b656ef738de9bfea62223a1cd8e7c805343bb56ddf4d3d",
    ),
}


class _RangeFile(io.RawIOBase):
    """Read-only, seekable view of a remote file, fetched with HTTP Range requests."""

    def __init__(self, url: str):
        self.url = url
        self.pos = 0
        req = urllib.request.Request(url, headers={"Range": "bytes=0-0"})
        with urllib.request.urlopen(req, timeout=60) as r:
            self.size = int(r.headers["Content-Range"].rsplit("/", 1)[1])

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, offset, whence=io.SEEK_SET):
        base = {io.SEEK_SET: 0, io.SEEK_CUR: self.pos, io.SEEK_END: self.size}[whence]
        self.pos = base + offset
        return self.pos

    def readinto(self, b):
        if self.pos >= self.size or len(b) == 0:
            return 0
        end = min(self.pos + len(b), self.size) - 1
        req = urllib.request.Request(self.url, headers={"Range": f"bytes={self.pos}-{end}"})
        with urllib.request.urlopen(req, timeout=120) as r:
            data = r.read()
        b[: len(data)] = data
        self.pos += len(data)
        return len(data)


def image_path(image_id: str) -> Path:
    return IMAGES_DIR / f"{image_id}.png"


def preprocess(raw: bytes) -> Image.Image:
    """Composite the RGBA render onto white, as NeRF does for the synthetic scenes."""
    im = Image.open(io.BytesIO(raw)).convert("RGBA")
    bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
    return Image.alpha_composite(bg, im).convert("RGB")


def fetch_all(force: bool = False) -> None:
    IMAGES_DIR.mkdir(exist_ok=True)
    todo = {i: v for i, v in REFERENCE_SET.items() if force or not image_path(i).exists()}
    for image_id in REFERENCE_SET.keys() - todo.keys():
        print(f"  {image_id:<14} already present")
    if not todo:
        return
    print("  reading the official nerf_synthetic.zip (only the needed entries)...")
    archive = zipfile.ZipFile(io.BufferedReader(_RangeFile(NERF_SYNTHETIC_URL), buffer_size=1 << 20))
    for image_id, (member, sha) in todo.items():
        raw = archive.read(member)
        got = hashlib.sha256(raw).hexdigest()
        if got != sha:
            raise RuntimeError(f"{member}: sha256 mismatch (got {got}, expected {sha})")
        im = preprocess(raw)
        im.save(image_path(image_id))
        print(f"  {image_id:<14} {im.width}x{im.height}  <- {member}")


def load_reference(image_id: str) -> Image.Image:
    path = image_path(image_id)
    if not path.exists():
        raise FileNotFoundError(f"{path} missing - run `python bench.py fetch` first")
    return Image.open(path).convert("RGB")


def grid_overlay(im: Image.Image, step: int = 50) -> Image.Image:
    """Copy of `im` with a labelled pixel grid, so coordinates can be read off by eye."""
    from PIL import ImageDraw

    out = im.convert("RGB").copy()
    draw = ImageDraw.Draw(out, "RGBA")
    for x in range(0, out.width, step):
        major = x % (2 * step) == 0
        draw.line([(x, 0), (x, out.height)], fill=(255, 0, 255, 140 if major else 60))
        if major:
            draw.text((x + 2, 2), str(x), fill=(200, 0, 200, 255))
    for y in range(0, out.height, step):
        major = y % (2 * step) == 0
        draw.line([(0, y), (out.width, y)], fill=(255, 0, 255, 140 if major else 60))
        if major:
            draw.text((2, y + 2), str(y), fill=(200, 0, 200, 255))
    return out
