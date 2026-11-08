"""Build the explainer video: narration audio -> manim scenes -> one mp4 with subtitles.

    python make_video.py                 # 1080p30, all scenes
    python make_video.py --quality low   # fast 480p preview
    python make_video.py --scenes S04_Bins S05_Decode

Needs: manim (+ LaTeX), ffmpeg, piper-tts, and ../logs.pkl from `python ../experiment.py`
(only to refresh video_data.npz, which is checked in).
"""
import argparse
import hashlib
import json
import os
import pickle
import subprocess
import sys
import urllib.request
import wave
from concurrent.futures import ThreadPoolExecutor

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, "build")
AUDIO = os.path.join(BUILD, "audio")
sys.path.insert(0, HERE)
from narration import NARRATION  # noqa: E402

VOICE = "en_US-ryan-high"
VOICE_URL = f"https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/high/{VOICE}.onnx"


def extract_data():
    """Pull the few arrays the video needs out of the experiment's logs into a small npz."""
    src = os.path.join(HERE, "..", "logs.pkl")
    dst = os.path.join(HERE, "video_data.npz")
    if not os.path.exists(src):
        if os.path.exists(dst):
            return
        sys.exit("run `python ../experiment.py` first (needs logs.pkl)")
    with open(src, "rb") as f:
        logs, _ = pickle.load(f)
    d1, d2 = logs["1d"], logs["2d"]
    np.savez_compressed(
        dst,
        l2_1d=np.array(d1["L2"][0]["grid"]["decode"]["point"])[:, 0],
        l1_1d=np.array(d1["L1"][0]["grid"]["decode"]["point"])[:, 0],
        bins_am_1d=np.array(d1["Bins256 soft"][0]["grid"]["decode"]["argmax"])[:, 0],
        bins_density_1d=d1["Bins256 soft"][0]["grid"]["density"][:, 0, :].astype(np.float16),
        l2_2d=np.array(d2["L2"][0]["grid"]["decode"]["point"]),
        bins_am_2d=np.array(d2["Bins256 soft"][0]["grid"]["decode"]["argmax"]),
        ghost_factored=d2["Bins256 soft"][0]["grid2d"][2].astype(np.float32),
        ghost_joint=d2["Joint 2D 64x64"][0]["grid2d"][2].astype(np.float32),
    )


def make_audio():
    os.makedirs(AUDIO, exist_ok=True)
    model = os.path.join(BUILD, f"{VOICE}.onnx")
    for url, path in ((VOICE_URL, model), (VOICE_URL + ".json", model + ".json")):
        if not os.path.exists(path):
            print("downloading", url)
            urllib.request.urlretrieve(url, path)
    jobs = []
    for scene, beats in NARRATION.items():
        for i, text in enumerate(beats):
            wav = os.path.join(AUDIO, f"{scene}_{i}.wav")
            tag = wav + ".sha"
            h = hashlib.sha1(text.encode()).hexdigest()
            if os.path.exists(wav) and os.path.exists(tag) and open(tag).read() == h:
                continue
            jobs.append((text, wav, tag, h))

    def tts(job):
        text, wav, tag, h = job
        subprocess.run([sys.executable, "-m", "piper", "-m", model, "-f", wav, "--length-scale", "1.08",
                        "--sentence-silence", "0.3"], input=text.encode(), check=True, capture_output=True)
        open(tag, "w").write(h)

    with ThreadPoolExecutor(4) as ex:
        list(ex.map(tts, jobs))
    print(f"audio: {len(jobs)} clips generated")


def render(scenes, quality):
    flags = {"high": ["-r", "1920,1080", "--frame_rate", "30"], "low": ["-ql"]}[quality]

    def one(scene):
        cmd = ["manim", *flags, "--media_dir", os.path.join(BUILD, "media"), "--disable_caching",
               "-o", f"{scene}.mp4", os.path.join(HERE, "scenes.py"), scene]
        r = subprocess.run(cmd, cwd=HERE, capture_output=True, text=True)
        if r.returncode:
            print(r.stdout[-3000:], r.stderr[-3000:])
            raise RuntimeError(f"render failed: {scene}")
        print("rendered", scene, flush=True)

    with ThreadPoolExecutor(4) as ex:
        list(ex.map(one, scenes))


def find_video(scene):
    for root, _, files in os.walk(os.path.join(BUILD, "media", "videos")):
        if f"{scene}.mp4" in files and "partial_movie_files" not in root:
            return os.path.join(root, f"{scene}.mp4")
    raise FileNotFoundError(scene)


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                         capture_output=True, text=True, check=True)
    return float(out.stdout)


def srt_time(t):
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def assemble(scenes, out):
    offset, cues, parts = 0.0, [], []
    for scene in scenes:
        vid = find_video(scene)
        parts.append(vid)
        with open(os.path.join(BUILD, "timing", f"{scene}.json")) as f:
            for start, end, text in json.load(f):
                cues.append((offset + start, offset + end, text))
        offset += duration(vid)
    srt = os.path.splitext(out)[0] + ".srt"
    with open(srt, "w") as f:
        for i, (a, b, text) in enumerate(cues, 1):
            f.write(f"{i}\n{srt_time(a)} --> {srt_time(b)}\n{text}\n\n")
    lst = os.path.join(BUILD, "concat.txt")
    with open(lst, "w") as f:
        f.writelines(f"file '{p}'\n" for p in parts)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-i", srt,
                    "-map", "0:v", "-map", "0:a", "-map", "1", "-c:v", "libx264", "-crf", "23", "-preset", "medium",
                    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-c:s", "mov_text",
                    "-metadata:s:s:0", "language=eng", "-movflags", "+faststart", out], check=True)
    print(f"wrote {out} ({offset / 60:.1f} min) and {srt}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--quality", choices=["high", "low"], default="high")
    ap.add_argument("--scenes", nargs="*", default=list(NARRATION))
    ap.add_argument("--out", default=os.path.join(HERE, "regression_vs_classification.mp4"))
    args = ap.parse_args()
    extract_data()
    make_audio()
    render(args.scenes, args.quality)
    assemble(args.scenes, args.out)


if __name__ == "__main__":
    main()
