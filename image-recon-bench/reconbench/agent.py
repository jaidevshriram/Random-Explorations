"""The reconstruction loop: show Claude the reference, let it iterate on an SVG.

Each round Claude replies with a full SVG; the harness renders it, scores it,
and sends back the render, PSNR/SSIM and an error heatmap. The loop ends when
Claude says DONE or the round limit is hit. The best-scoring round is kept as
the submission; every round is saved for inspection.
"""

import base64
import io
import json
import re
from pathlib import Path

import anthropic
import numpy as np
from PIL import Image

from .images import load_reference
from .metrics import error_heatmap
from .render import DEFAULT_BYTE_BUDGET, InvalidSubmission
from .scoring import SUBMISSIONS_DIR, score_svg

SYSTEM = """You are taking part in an image-reconstruction benchmark. You are shown a \
reference image and must reproduce it as an SVG, as faithfully as possible. Your SVG is \
rasterized and scored against the reference with PSNR (primary metric) and SSIM.

Rules (submissions that break them are rejected):
- The canvas size is given in each task. The root <svg> width/height are forced to it, \
so draw in pixel coordinates (or use a viewBox with the same aspect ratio).
- The SVG must fit in the stated byte budget (UTF-8 bytes).
- Not allowed: <image>, <feImage>, <foreignObject>, <script>, <text>/<tspan>, data: \
URIs, @import, or any href/url() that is not a #fragment. Paths, shapes, gradients, \
patterns, filters such as feGaussianBlur, opacity, clipPath and mask are all fine.
- Undrawn areas render as white.

Every turn, reply with the complete SVG in a single ```svg fenced block (no other code \
blocks). After each attempt you get back your render, its PSNR/SSIM, and an error \
heatmap (bright = wrong). PSNR is mean squared error in disguise: getting colors and \
large shapes right matters most, and a soft, slightly blurry edge in roughly the right \
place usually beats a crisp edge in the wrong place. Spend your byte budget where the \
heatmap is brightest.

When you believe you cannot improve the score further, reply with just DONE and no SVG."""

_SVG_BLOCK = re.compile(r"```(?:svg|xml)?\s*\n(.*?)```", re.S)


def _png_block(arr: np.ndarray) -> dict:
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format="PNG")
    data = base64.standard_b64encode(buf.getvalue()).decode()
    return {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": data}}


def extract_svg(text: str) -> str | None:
    for block in _SVG_BLOCK.findall(text):
        if "<svg" in block:
            return block.strip()
    m = re.search(r"<svg\b.*</svg>", text, re.S)
    return m.group(0) if m else None


def reconstruct(
    client: anthropic.Anthropic,
    image_id: str,
    out_dir: Path,
    model: str,
    effort: str,
    max_rounds: int,
    byte_budget: int = DEFAULT_BYTE_BUDGET,
) -> dict:
    ref = np.asarray(load_reference(image_id))
    h, w = ref.shape[:2]
    rounds_dir = out_dir / "rounds" / image_id
    rounds_dir.mkdir(parents=True, exist_ok=True)

    messages = [{
        "role": "user",
        "content": [
            _png_block(ref),
            {"type": "text", "text": (
                f"Reference image `{image_id}`. Canvas: {w}x{h} pixels. "
                f"Byte budget: {byte_budget} bytes. You have up to {max_rounds} rounds. "
                "Round 1: send your first SVG."
            )},
        ],
    }]
    log = {"image": image_id, "model": model, "effort": effort, "rounds": [], "usage": {}}
    usage = {"input_tokens": 0, "output_tokens": 0, "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0}
    best = None

    for rnd in range(1, max_rounds + 1):
        with client.beta.messages.stream(
            model=model,
            max_tokens=64000,
            system=SYSTEM,
            messages=messages,
            thinking={"type": "adaptive"},
            output_config={"effort": effort},
            cache_control={"type": "ephemeral"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        ) as stream:
            resp = stream.get_final_message()
        for k in usage:
            usage[k] += getattr(resp.usage, k, 0) or 0
        messages.append({"role": "assistant", "content": resp.content})

        entry = {"round": rnd, "stop_reason": resp.stop_reason, "served_by": resp.model}
        if resp.stop_reason == "refusal":
            entry["status"] = "refusal"
            log["rounds"].append(entry)
            print(f"    round {rnd}: refused ({resp.stop_details})")
            break

        text = "".join(b.text for b in resp.content if b.type == "text")
        svg = extract_svg(text)
        last = rnd == max_rounds
        if svg is None:
            if "DONE" in text:
                entry["status"] = "done"
                log["rounds"].append(entry)
                print(f"    round {rnd}: Claude says DONE")
                break
            entry["status"] = "no_svg"
            hint = " Your reply hit max_tokens and was cut off." if resp.stop_reason == "max_tokens" else ""
            feedback = [{"type": "text", "text": f"No ```svg block found in your reply.{hint} Send the full SVG."}]
        else:
            (rounds_dir / f"round_{rnd:02d}.svg").write_text(svg, encoding="utf-8")
            try:
                scores, test = score_svg(image_id, svg, byte_budget)
            except InvalidSubmission as e:
                entry.update(status="invalid", error=str(e))
                print(f"    round {rnd}: invalid - {e}")
                feedback = [{"type": "text", "text": f"Round {rnd} was rejected: {e}. Fix it and resend."}]
            else:
                entry.update(status="ok", **scores)
                if best is None or scores["psnr"] > best[0]["psnr"]:
                    best = (scores, svg, rnd)
                print(f"    round {rnd}: PSNR {scores['psnr']:.2f} dB  SSIM {scores['ssim']:.4f}  {scores['bytes']} B")
                feedback = [
                    {"type": "text", "text": "Your render:"},
                    _png_block(test),
                    {"type": "text", "text": "Error heatmap (|ref - render|, 4x amplified):"},
                    _png_block(error_heatmap(ref, test)),
                    {"type": "text", "text": (
                        f"Round {rnd}: PSNR {scores['psnr']:.2f} dB, SSIM {scores['ssim']:.4f}, "
                        f"{scores['bytes']}/{byte_budget} bytes. Best so far: "
                        f"{best[0]['psnr']:.2f} dB (round {best[2]})."
                    )},
                ]
        log["rounds"].append(entry)
        if last:
            break
        remaining = max_rounds - rnd
        feedback.append({"type": "text", "text": (
            f"{remaining} round{'s' if remaining != 1 else ''} left. "
            "Send an improved full SVG, or DONE if you can't improve."
        )})
        messages.append({"role": "user", "content": feedback})

    log["usage"] = usage
    if best:
        (out_dir / f"{image_id}.svg").write_text(best[1], encoding="utf-8")
        log["best"] = {"round": best[2], **best[0]}
    (rounds_dir / "log.json").write_text(json.dumps(log, indent=2) + "\n")
    return log


def run(entry: str, image_ids: list[str], model: str, effort: str, max_rounds: int, byte_budget: int) -> None:
    client = anthropic.Anthropic()
    out_dir = SUBMISSIONS_DIR / entry
    out_dir.mkdir(parents=True, exist_ok=True)
    meta_path = out_dir / "meta.json"
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    meta.update(model=model, kind="claude-loop", effort=effort, max_rounds=max_rounds, byte_budget=byte_budget)
    meta_path.write_text(json.dumps(meta, indent=2) + "\n")

    for image_id in image_ids:
        print(f"  {image_id}")
        log = reconstruct(client, image_id, out_dir, model, effort, max_rounds, byte_budget)
        u = log["usage"]
        print(f"    tokens: {u['input_tokens']} in (+{u['cache_read_input_tokens']} cached), {u['output_tokens']} out")
