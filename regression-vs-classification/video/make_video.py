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
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
import wave
from concurrent.futures import ThreadPoolExecutor

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, "build")
AUDIO = os.path.join(BUILD, "audio")
sys.path.insert(0, HERE)
from music import make_music  # noqa: E402
from narration import NARRATION, subtitle  # noqa: E402

VOICE = "en_US-ryan-high"
VOICE_URL = f"https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/high/{VOICE}.onnx"
# ElevenLabs premade voice "Chris". The API key is read from ELEVENLABS_API_KEY.
ELEVEN_VOICE_ID = "iP95p4xoKVk53GoZ742B"
ELEVEN_MODEL = "eleven_multilingual_v2"


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
        l1_1d_seeds=np.stack([np.array(r["grid"]["decode"]["point"])[:, 0] for r in d1["L1"]]),
        bins_am_1d=np.array(d1["Bins256 soft"][0]["grid"]["decode"]["argmax"])[:, 0],
        bins_density_1d=d1["Bins256 soft"][0]["grid"]["density"][:, 0, :].astype(np.float16),
        l2_2d=np.array(d2["L2"][0]["grid"]["decode"]["point"]),
        bins_am_2d=np.array(d2["Bins256 soft"][0]["grid"]["decode"]["argmax"]),
        ghost_factored=d2["Bins256 soft"][0]["grid2d"][2].astype(np.float32),
        ghost_joint=d2["Joint 2D 64x64"][0]["grid2d"][2].astype(np.float32),
    )


def piper_tts(text, wav, prev_text, next_text):
    model = os.path.join(BUILD, f"{VOICE}.onnx")
    for url, path in ((VOICE_URL, model), (VOICE_URL + ".json", model + ".json")):
        if not os.path.exists(path):
            print("downloading", url)
            urllib.request.urlretrieve(url, path)
    subprocess.run([sys.executable, "-m", "piper", "-m", model, "-f", wav, "--length-scale", "1.08",
                    "--sentence-silence", "0.3"], input=text.encode(), check=True, capture_output=True)


def eleven_tts(text, wav, prev_text, next_text, seed=None):
    # Piper needs phonetic spellings; ElevenLabs reads the real words fine.
    # Neighbouring lines keep the intonation flowing across clips.
    body = json.dumps({"text": subtitle(text), "model_id": ELEVEN_MODEL, "previous_text": subtitle(prev_text),
                       "next_text": subtitle(next_text),
                       "voice_settings": {"stability": 0.5, "similarity_boost": 0.75, "style": 0.0},
                       **({"seed": seed} if seed is not None else {})}).encode()
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVEN_VOICE_ID}?output_format=mp3_44100_128", data=body,
        headers={"xi-api-key": os.environ.get("ELEVENLABS_API_KEY", "proxy-injected"),
                 "Content-Type": "application/json"})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                mp3 = r.read()
            break
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == 4:
                raise RuntimeError(f"ElevenLabs {e.code}: {e.read()[:300]}")
            time.sleep(2 ** attempt)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "mp3", "-i", "-", "-ac", "1", "-ar", "44100", wav],
                   input=mp3, check=True)


def make_audio(voice):
    os.makedirs(AUDIO, exist_ok=True)
    tts = {"piper": piper_tts, "elevenlabs": eleven_tts}[voice]
    flat = [(scene, i, text) for scene, beats in NARRATION.items() for i, text in enumerate(beats)]
    jobs = []
    for k, (scene, i, text) in enumerate(flat):
        prev_text = flat[k - 1][2] if k > 0 else ""
        next_text = flat[k + 1][2] if k + 1 < len(flat) else ""
        wav = os.path.join(AUDIO, f"{scene}_{i}.wav")
        tag = wav + ".sha"
        h = hashlib.sha1(f"{voice}|{prev_text}|{text}|{next_text}".encode()).hexdigest()
        if os.path.exists(wav) and os.path.exists(tag) and open(tag).read() == h:
            continue
        jobs.append((text, wav, tag, h, prev_text, next_text))

    def run(job):
        text, wav, tag, h, prev_text, next_text = job
        tts(text, wav, prev_text, next_text)
        open(tag, "w").write(h)

    with ThreadPoolExecutor(2 if voice == "elevenlabs" else 4) as ex:
        list(ex.map(run, jobs))
    print(f"audio ({voice}): {len(jobs)} clips generated")
    if voice == "elevenlabs" and jobs:
        verify_clips(jobs)


def words(text):
    return len(re.findall(r"[A-Za-z]+|[0-9]+", text))


def verify_clips(jobs):
    """ElevenLabs occasionally repeats the end of a sentence. Transcribe each new clip and
    regenerate (with a different seed) any that has clearly more words than its script."""
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("faster-whisper not installed: skipping the narration check")
        return
    model = WhisperModel("small.en", device="cpu", compute_type="int8")

    def heard(wav):
        raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", wav, "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
                             capture_output=True, check=True).stdout
        a = np.frombuffer(raw, np.int16).astype(np.float32) / 32768
        return " ".join(seg.text for seg in model.transcribe(a, beam_size=5)[0])

    for text, wav, tag, h, prev_text, next_text in jobs:
        # numbers are spelled out in the script but transcribed as digits, so compare loosely
        for seed in (11, 22, 33):
            got = heard(wav)
            if words(got) <= words(subtitle(text)) * 1.15 + 2:
                break
            print(f"  {os.path.basename(wav)}: extra speech ({words(got)} vs {words(subtitle(text))} words), regenerating")
            eleven_tts(text, wav, prev_text, next_text, seed=seed)


def render(scenes, quality):
    flags = {"high": ["-r", "1920,1080", "--frame_rate", "30"], "low": ["-ql"]}[quality]

    def one(scene):
        cmd = ["manim", *flags, "--media_dir", os.path.join(BUILD, "media"), "--disable_caching",
               "-o", f"{scene}.mp4", os.path.join(HERE, "scenes.py"), scene]
        r = subprocess.run(cmd, cwd=HERE, capture_output=True, text=True)
        if r.returncode:  # parallel renders can race on manim's shared LaTeX cache; retry once
            r = subprocess.run(cmd, cwd=HERE, capture_output=True, text=True)
        if r.returncode:
            print(r.stdout[-3000:], r.stderr[-3000:])
            raise RuntimeError(f"render failed: {scene}")
        print("rendered", scene, flush=True)
        report = os.path.join(BUILD, "layout", f"{scene}.txt")
        if os.path.exists(report) and open(report).read().strip():
            print(f"  layout warnings in {scene}:\n    " + open(report).read().strip().replace("\n", "\n    "), flush=True)

    with ThreadPoolExecutor(4) as ex:
        list(ex.map(one, scenes))


QUALITY_DIR = {"high": "1080p30", "low": "480p15"}


def find_video(scene, quality):
    path = os.path.join(BUILD, "media", "videos", "scenes", QUALITY_DIR[quality], f"{scene}.mp4")
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    return path


def padded(vid, dur):
    """manim's audio track ends with the last sound, a little before the video does; pad it to the
    video's length so that joining the scenes doesn't pull later narration ahead of its animation."""
    out = os.path.join(BUILD, "padded", os.path.basename(vid))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", vid, "-c:v", "copy", "-af", f"apad=whole_dur={dur}",
                    "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "1", out], check=True)
    return out


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                         capture_output=True, text=True, check=True)
    return float(out.stdout)


def srt_time(t):
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def assemble(scenes, out, quality="high", music=True):
    offset, cues, parts = 0.0, [], []
    for scene in scenes:
        vid = find_video(scene, quality)
        dur = duration(vid)
        parts.append(padded(vid, dur))
        with open(os.path.join(BUILD, "timing", f"{scene}.json")) as f:
            for start, end, text in json.load(f):
                cues.append((offset + start, offset + end, text))
        offset += dur
    srt = os.path.splitext(out)[0] + ".srt"
    with open(srt, "w") as f:
        for i, (a, b, text) in enumerate(cues, 1):
            f.write(f"{i}\n{srt_time(a)} --> {srt_time(b)}\n{text}\n\n")
    lst = os.path.join(BUILD, "concat.txt")
    with open(lst, "w") as f:
        f.writelines(f"file '{p}'\n" for p in parts)
    if music:
        # quiet music bed, ducked further whenever the narration is speaking
        mus = os.path.join(BUILD, "music.wav")
        make_music(offset, mus)
        audio_in = ["-i", mus]
        mix = ["-filter_complex",
               "[0:a]loudnorm=I=-16:TP=-1.5:LRA=11,aformat=channel_layouts=stereo,asplit=2[v1][v2];"
               "[2:a]volume=0.15[m];"
               "[m][v1]sidechaincompress=threshold=0.015:ratio=5:attack=80:release=900[md];"
               "[v2][md]amix=inputs=2:duration=first:normalize=0[a]", "-map", "[a]"]
    else:
        audio_in, mix = [], ["-af", "loudnorm=I=-16:TP=-1.5:LRA=11"]
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-i", srt,
                    *audio_in, "-map", "0:v", *mix, *(["-map", "0:a"] if not music else []), "-map", "1", "-c:v", "libx264", "-crf", "23", "-preset", "medium",
                    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-c:s", "mov_text",
                    "-metadata:s:s:0", "language=eng", "-movflags", "+faststart", out], check=True)
    print(f"wrote {out} ({offset / 60:.1f} min) and {srt}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--quality", choices=["high", "low"], default="high")
    ap.add_argument("--voice", choices=["elevenlabs", "piper"], default="elevenlabs")
    ap.add_argument("--no-music", action="store_true")
    ap.add_argument("--scenes", nargs="*", default=list(NARRATION))
    ap.add_argument("--out", default=os.path.join(HERE, "regression_vs_classification.mp4"))
    args = ap.parse_args()
    extract_data()
    make_audio(args.voice)
    render(args.scenes, args.quality)
    assemble(args.scenes, args.out, args.quality, music=not args.no_music)


if __name__ == "__main__":
    main()
