"""Original, procedurally generated background music: a slow, soft piano arpeggio over a
warm pad, with a simple reverb. Deterministic (seeded), so every build sounds the same.

    python music.py 330 out.wav   # 330 seconds of music
"""
import sys
import wave

import numpy as np

SR = 44100


def midi_hz(n):
    return 440.0 * 2 ** ((n - 69) / 12)


# D major, I - vi - IV - V(sus) with soft 7ths/9ths. (bass, chord tones for the arpeggio)
PROGRESSION = [
    (50, [62, 66, 69, 73, 76]),  # Dmaj9
    (47, [62, 66, 69, 71, 74]),  # Bm7
    (43, [62, 67, 71, 74, 78]),  # Gmaj7
    (45, [61, 64, 69, 71, 76]),  # A(add9)
]
CHORD_SECONDS = 4.8
ARP = [0, 2, 1, 3, 4, 2, 3, 1]  # order of chord tones within a chord, one note per step


def piano_note(freq, dur, vel, rng):
    t = np.arange(int(dur * SR)) / SR
    out = np.zeros_like(t)
    for k in range(1, 7):
        detune = 1 + rng.normal(0, 0.0004)
        decay = 1.6 / k ** 0.7  # higher partials die faster
        out += (1 / k ** 1.6) * np.sin(2 * np.pi * freq * k * detune * t) * np.exp(-t / decay)
    attack = np.minimum(t / 0.008, 1)
    release = np.clip((dur - t) / 0.3, 0, 1)
    return vel * out * attack * release


def pad_chord(freqs, dur):
    t = np.arange(int(dur * SR)) / SR
    out = np.zeros_like(t)
    for f in freqs:
        for d in (-0.15, 0.15):  # two slightly detuned voices -> slow chorus
            out += np.sin(2 * np.pi * (f + d) * t + np.sin(2 * np.pi * 0.2 * t) * 0.3)
            out += 0.25 * np.sin(2 * np.pi * 2 * (f + d) * t)
    env = np.minimum(t / 1.5, 1) * np.clip((dur - t) / 1.5, 0, 1)
    return out * env / len(freqs)


def reverb(x, seed, seconds=3.0, wet=0.35):
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = rng.standard_normal(n) * np.exp(-t / 0.9)
    ir = np.convolve(ir, np.ones(24) / 24, mode="same")  # darken the tail
    ir /= np.sqrt((ir ** 2).sum())
    block = 1 << 18
    size = 1 << int(np.ceil(np.log2(block + n)))
    H = np.fft.rfft(ir, size)
    y = np.zeros(len(x) + n)
    for s in range(0, len(x), block):
        seg = x[s:s + block]
        y[s:s + size] += np.fft.irfft(np.fft.rfft(seg, size) * H, size)[: min(size, len(y) - s)]
    return (1 - wet) * x + wet * y[: len(x)] * 3


def make_music(duration, path, seed=0):
    rng = np.random.default_rng(seed)
    n = int((duration + 6) * SR)
    piano = np.zeros(n)
    pad = np.zeros(n)
    step = CHORD_SECONDS / len(ARP)
    c, t0 = 0, 0.0
    while t0 < duration + 2:
        bass, tones = PROGRESSION[c % len(PROGRESSION)]
        # pad: bass + three chord tones an octave down, overlapping into the next chord
        seg = pad_chord([midi_hz(bass), midi_hz(tones[0] - 12), midi_hz(tones[1] - 12), midi_hz(tones[2] - 12)],
                        CHORD_SECONDS + 1.5)
        a = int(t0 * SR)
        pad[a:a + len(seg)] += seg[: n - a]
        for j, idx in enumerate(ARP):
            if rng.random() < 0.18:  # leave some gaps so it breathes
                continue
            start = t0 + j * step + rng.normal(0, 0.012)
            vel = 0.55 + 0.3 * rng.random() + (0.15 if j == 0 else 0)
            note = piano_note(midi_hz(tones[idx]), 3.0, vel, rng)
            a = int(max(start, 0) * SR)
            piano[a:a + len(note)] += note[: n - a]
        c += 1
        t0 += CHORD_SECONDS
    dry = 0.55 * piano + 0.35 * pad
    left, right = reverb(dry, seed + 1), reverb(dry, seed + 2)
    stereo = np.stack([left, right], 1)[: int(duration * SR)]
    # fade in / out
    k = np.arange(len(stereo)) / SR
    stereo *= (np.minimum(k / 2.0, 1) * np.clip((duration - k) / 4.0, 0, 1))[:, None]
    stereo *= 0.6 / np.abs(stereo).max()
    with wave.open(path, "w") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((stereo * 32767).astype(np.int16).tobytes())


if __name__ == "__main__":
    make_music(float(sys.argv[1]), sys.argv[2])
