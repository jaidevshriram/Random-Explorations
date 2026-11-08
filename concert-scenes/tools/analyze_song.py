# Analyse a song into a cue sheet for the light show: beats, downbeats, onsets, loudness,
# low/mid/high bands and sections. python3 analyze_song.py in.wav out.json
import sys, json
import numpy as np, librosa, scipy.ndimage as ndi
wav, out = sys.argv[1], sys.argv[2]
y, sr = librosa.load(wav, sr=22050, mono=True)
dur = len(y) / sr
hop = 512
tempo, beats = librosa.beat.beat_track(y=y, sr=sr, hop_length=hop, units='frames', tightness=100)
tempo = float(np.atleast_1d(tempo)[0])
bt = librosa.frames_to_time(beats, sr=sr, hop_length=hop)
oenv = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
onsets = librosa.onset.onset_detect(onset_envelope=oenv, sr=sr, hop_length=hop, units='time', backtrack=False)
S = np.abs(librosa.stft(y, n_fft=2048, hop_length=hop))
freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
def band(lo, hi):
    m = (freqs >= lo) & (freqs < hi)
    return np.sqrt((S[m] ** 2).mean(0))
low, mid, high = band(30, 160), band(160, 2500), band(2500, 10000)
rms = librosa.feature.rms(S=S, frame_length=2048, hop_length=hop)[0]
ft = librosa.frames_to_time(np.arange(S.shape[1]), sr=sr, hop_length=hop)
def norm(x):
    x = np.log1p(x / (np.percentile(x, 50) + 1e-9))
    lo, hi = np.percentile(x, 3), np.percentile(x, 99)
    return np.clip((x - lo) / (hi - lo + 1e-9), 0, 1)
FPS = 30
tt = np.arange(0, dur, 1 / FPS)
res = lambda x: np.interp(tt, ft, x)
feat = {k: res(norm(v)) for k, v in dict(rms=rms, low=low, mid=mid, high=high).items()}
feat['onset'] = res(np.clip(oenv / (np.percentile(oenv, 99) + 1e-9), 0, 1))
# smooth loudness for section-level energy
energy = ndi.gaussian_filter1d(feat['rms'], FPS * 1.5)
# downbeats: of the 4 phases of the beat grid, the one with the most bass on it
lowb = np.interp(bt, tt, feat['low'])
phase = int(np.argmax([lowb[p::4].mean() for p in range(4)])) if len(bt) >= 8 else 0
downbeats = bt[phase::4]
# sections: agglomerative clustering of beat-synchronous chroma + mfcc, boundaries snapped to downbeats
chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop)
mfcc = librosa.feature.mfcc(y=y, sr=sr, hop_length=hop, n_mfcc=13)
F = np.vstack([librosa.util.normalize(chroma, axis=0), librosa.util.normalize(mfcc, axis=1)])
Fs = librosa.util.sync(F, beats, aggregate=np.median)
k = int(np.clip(round(dur / 22), 5, 12))
bnd = librosa.segment.agglomerative(Fs, k)
bnd_t = sorted(set([0.0] + [float(bt[min(b, len(bt) - 1)]) for b in bnd if b > 0] + [dur]))
snap = lambda t: float(downbeats[np.argmin(np.abs(downbeats - t))]) if 0 < t < dur else t
bnd_t = sorted(set(snap(t) for t in bnd_t))
secs = []
for a, b in zip(bnd_t[:-1], bnd_t[1:]):
    if b - a < 2: continue
    m = (tt >= a) & (tt < b)
    secs.append({'t0': round(a, 3), 't1': round(b, 3), 'energy': round(float(feat['rms'][m].mean()), 3),
                 'low': round(float(feat['low'][m].mean()), 3), 'high': round(float(feat['high'][m].mean()), 3)})
# rank sections by energy into levels 0..3 (quiet, mid, high, peak)
es = np.array([s['energy'] for s in secs])
q = np.percentile(es, [30, 60, 85])
for s in secs: s['level'] = int(np.searchsorted(q, s['energy']))
cue = {'duration': round(dur, 3), 'tempo': round(tempo, 2), 'fps': FPS,
       'beats': [round(float(t), 3) for t in bt], 'downbeats': [round(float(t), 3) for t in downbeats],
       'onsets': [round(float(t), 3) for t in onsets], 'sections': secs,
       **{k: [round(float(v), 3) for v in feat[k]] for k in feat}, 'energy': [round(float(v), 3) for v in energy]}
json.dump(cue, open(out, 'w'))
print('tempo', round(tempo, 1), 'beats', len(bt), 'onsets', len(onsets), 'duration', round(dur, 1))
for s in secs: print(f"{s['t0']:7.2f}-{s['t1']:7.2f}  level {s['level']}  energy {s['energy']:.2f}  low {s['low']:.2f}  high {s['high']:.2f}")
