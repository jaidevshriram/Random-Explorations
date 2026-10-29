import math
from types import SimpleNamespace

import numpy as np
import pytest

from reconbench import agent
from reconbench.images import image_path
from reconbench.metrics import psnr, ssim
from reconbench.render import InvalidSubmission, render_svg, validate_svg

needs_images = pytest.mark.skipif(not image_path("lego_r19").exists(), reason="run `python bench.py fetch` first")

OK = '<svg xmlns="http://www.w3.org/2000/svg">{}</svg>'


def test_identical_images():
    a = np.random.default_rng(0).integers(0, 256, (32, 32, 3), dtype=np.uint8)
    assert math.isinf(psnr(a, a))
    assert ssim(a, a) == pytest.approx(1.0)


def test_psnr_known_value():
    a = np.zeros((8, 8, 3), np.uint8)
    b = np.full_like(a, 255)
    assert psnr(a, b) == pytest.approx(0.0)


@pytest.mark.parametrize("body", [
    '<image href="ref.png" width="10" height="10"/>',
    '<rect fill="url(http://x/y)" width="1" height="1"/>',
    '<rect style="fill:url(data:image/png;base64,AAAA)" width="1" height="1"/>',
    '<use href="other.svg#a"/>',
    '<text x="0" y="10">hi</text>',
    '<foreignObject width="1" height="1"/>',
    '<filter id="f"><feImage href="ref.png"/></filter>',
    '<style>@import url(x.css);</style>',
])
def test_rejects_smuggling(body):
    with pytest.raises(InvalidSubmission):
        validate_svg(OK.format(body))


def test_rejects_entities_and_budget():
    with pytest.raises(InvalidSubmission):
        validate_svg('<!DOCTYPE svg [<!ENTITY a "b">]>' + OK.format(""))
    with pytest.raises(InvalidSubmission):
        validate_svg(OK.format("<!--" + "x" * 100 + "-->"), byte_budget=50)


def test_allows_internal_references():
    svg = OK.format(
        '<defs><linearGradient id="g"><stop offset="0" stop-color="red"/></linearGradient>'
        '<filter id="b"><feGaussianBlur stdDeviation="2"/></filter><rect id="r" width="5" height="5"/></defs>'
        '<rect width="10" height="10" fill="url(#g)" filter="url(#b)"/><use href="#r"/>'
    )
    validate_svg(svg)


def test_render_forces_canvas_size():
    arr = render_svg('<svg xmlns="http://www.w3.org/2000/svg" width="5" height="5"><rect width="20" height="10" fill="#f00"/></svg>', 20, 10)
    assert arr.shape == (10, 20, 3)
    assert tuple(arr[5, 10]) == (255, 0, 0)
    blank = render_svg(OK.format(""), 4, 4)
    assert (blank == 255).all()  # undrawn = white


def test_extract_svg():
    assert agent.extract_svg("hi\n```svg\n<svg></svg>\n```") == "<svg></svg>"
    assert agent.extract_svg("bare <svg a='1'></svg> text") == "<svg a='1'></svg>"
    assert agent.extract_svg("DONE") is None


class FakeStream:
    def __init__(self, text):
        self.msg = SimpleNamespace(
            content=[SimpleNamespace(type="text", text=text)],
            stop_reason="end_turn", stop_details=None, model="fake",
            usage=SimpleNamespace(input_tokens=10, output_tokens=5,
                                  cache_read_input_tokens=0, cache_creation_input_tokens=0),
        )

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def get_final_message(self):
        return self.msg


@needs_images
def test_reconstruct_loop(tmp_path):
    replies = iter([
        "```svg\n<svg xmlns='http://www.w3.org/2000/svg'><rect width='800' height='800' fill='#f0e8d8'/></svg>\n```",
        "```svg\n<svg xmlns='http://www.w3.org/2000/svg'><image href='x.png'/></svg>\n```",
        "```svg\n<svg xmlns='http://www.w3.org/2000/svg'><rect width='800' height='800' fill='#000'/></svg>\n```",
        "DONE",
    ])
    calls = []

    def stream(**kw):
        calls.append(kw)
        return FakeStream(next(replies))

    client = SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(stream=stream)))
    log = agent.reconstruct(client, "lego_r19", tmp_path, "m", "high", max_rounds=8)

    assert [r["status"] for r in log["rounds"]] == ["ok", "invalid", "ok", "done"]
    assert log["best"]["round"] == 1  # near-white beats solid black on a mostly white image
    assert (tmp_path / "lego_r19.svg").read_text().count("#f0e8d8") == 1
    # history is append-only, alternates user/assistant, and ends on the assistant's DONE
    roles = [m["role"] for m in calls[-1]["messages"]]
    assert roles == ["user", "assistant"] * 4
    assert len(calls) == 4
