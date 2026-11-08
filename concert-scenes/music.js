// In-browser song analysis: the same kind of cue sheet tools/analyze_song.py writes, computed from
// a dropped audio file with Web Audio. Beats come from the onset envelope (tempo by autocorrelation,
// then a beat grid snapped to nearby onsets); downbeats are the bar phase with the most bass;
// sections are runs of similar loudness, snapped to downbeats and ranked by energy.
window.analyzeSong = async function analyzeSong(arrayBuffer) {
  const FPS = 30;
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  const buf = await ctx.decodeAudioData(arrayBuffer);
  ctx.close && ctx.close();
  const sr = buf.sampleRate, dur = buf.duration, n = Math.floor(dur * FPS);

  // the three bands, filtered natively in an offline graph (bass, body, air)
  async function band(type, freq, q) {
    const off = new OfflineAudioContext(1, buf.length, sr);
    const src = off.createBufferSource();
    src.buffer = buf;
    let node = src;
    for (const [t, f] of type) { const b = off.createBiquadFilter(); b.type = t; b.frequency.value = f; if (q) b.Q.value = q; node.connect(b); node = b; }
    node.connect(off.destination);
    src.start();
    return (await off.startRendering()).getChannelData(0);
  }
  const [lowS, midS, highS] = await Promise.all([
    band([['lowpass', 160]]),
    band([['highpass', 160], ['lowpass', 2500]]),
    band([['highpass', 2500]]),
  ]);
  const mono = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) mono[i] += d[i] / buf.numberOfChannels; }
  const hop = sr / FPS;
  const rmsOf = s => {
    const out = new Float32Array(n);
    for (let f = 0; f < n; f++) {
      const a = Math.floor(f * hop), b = Math.min(s.length, Math.floor((f + 1) * hop));
      let e = 0;
      for (let i = a; i < b; i++) e += s[i] * s[i];
      out[f] = Math.sqrt(e / Math.max(1, b - a));
    }
    return out;
  };
  const pct = (arr, p) => { const s = Float32Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
  // log-compress around the median, then spread the 3rd..99th percentile over 0..1
  const norm = x => {
    const med = pct(x, 50) + 1e-9, y = x.map(v => Math.log1p(v / med)), lo = pct(y, 3), hi = pct(y, 99);
    return y.map(v => Math.min(1, Math.max(0, (v - lo) / (hi - lo + 1e-9))));
  };
  const rms = norm(rmsOf(mono)), low = norm(rmsOf(lowS)), mid = norm(rmsOf(midS)), high = norm(rmsOf(highS));
  const smooth = (x, sigma) => {
    const r = Math.ceil(sigma * 3), w = [];
    for (let k = -r; k <= r; k++) w.push(Math.exp(-(k * k) / (2 * sigma * sigma)));
    const ws = w.reduce((a, b) => a + b, 0);
    return x.map((_, i) => { let s = 0; for (let k = -r; k <= r; k++) s += x[Math.min(x.length - 1, Math.max(0, i + k))] * w[k + r]; return s / ws; });
  };
  const energy = smooth(rms, FPS * 1.5);

  // onset envelope at 100 fps (finer than the 30 fps features, for tempo and beats): rises in the
  // bands' log energy, weighted toward the drums
  const OF = 100, on = Math.floor(dur * OF), ohop = sr / OF;
  const rmsAt = (s, rate, count) => {
    const out = new Float32Array(count), hp = sr / rate;
    for (let f = 0; f < count; f++) {
      const a = Math.floor(f * hp), b = Math.min(s.length, Math.floor((f + 1) * hp));
      let e = 0;
      for (let i = a; i < b; i++) e += s[i] * s[i];
      out[f] = Math.log(1e-4 + Math.sqrt(e / Math.max(1, b - a)));
    }
    return out;
  };
  const oL = rmsAt(lowS, OF, on), oM = rmsAt(midS, OF, on), oH = rmsAt(highS, OF, on);
  let onsetF = new Float32Array(on);
  for (let f = 1; f < on; f++) onsetF[f] = 1.2 * Math.max(0, oL[f] - oL[f - 1]) + 0.6 * Math.max(0, oM[f] - oM[f - 1]) + 0.8 * Math.max(0, oH[f] - oH[f - 1]);
  // remove the slow trend so sustained loud passages don't swamp the beat
  { const sm = smooth(Array.from(onsetF), 8); onsetF = onsetF.map((v, i) => Math.max(0, v - sm[i])); }
  const oNorm = pct(onsetF, 99) + 1e-9;
  onsetF = onsetF.map(v => Math.min(1, v / oNorm));
  const onset = new Float32Array(n);
  for (let f = 0; f < n; f++) onset[f] = onsetF[Math.min(on - 1, Math.round((f / FPS) * OF))];

  // tempo: autocorrelation with a harmonic comb (a true beat period also lines up at double and
  // half), weighted by a log-normal prior round 120 BPM, then refined to sub-frame precision
  const acF = new Float32Array(Math.round((60 / 50) * OF) * 2 + 2);
  for (let lag = 1; lag < acF.length; lag++) { let s = 0; for (let f = lag; f < on; f++) s += onsetF[f] * onsetF[f - lag]; acF[lag] = s; }
  const acAt = l => { const i = Math.floor(l), u = l - i; return i + 1 < acF.length ? acF[i] * (1 - u) + acF[i + 1] * u : 0; };
  // candidate periods: the local peaks of the comb; rhythms with a triplet feel give several
  // near-equal ones, so each is then judged by how much onset its best beat grid actually lands on
  const lagLo = Math.round((60 / 190) * OF), lagHi = Math.round((60 / 65) * OF), comb = [];
  for (let lag = lagLo; lag <= lagHi; lag++) comb[lag] = acAt(lag) + 0.5 * acAt(lag * 2) + 0.25 * acAt(lag / 2);
  const peaks = [];
  for (let lag = lagLo + 1; lag < lagHi; lag++) if (comb[lag] >= comb[lag - 1] && comb[lag] >= comb[lag + 1]) peaks.push(lag);
  peaks.sort((a, b) => comb[b] - comb[a]);
  const gridMean = lag => {
    let best = 0;
    for (let ph = 0; ph < lag; ph += 1) {
      let s = 0, c = 0;
      for (let f = ph; f < on; f += lag) { s += onsetF[Math.round(f)]; c++; }
      best = Math.max(best, s / Math.max(1, c));
    }
    return best;
  };
  // of the candidates nearly as strong as the best, take the one closest to a typical song tempo
  let bestLag = peaks[0] || 50, bestScore = -1;
  window.__tempoDebug = peaks.slice(0, 6).map(l => [+((60 * OF) / l).toFixed(1), +(comb[l] / comb[peaks[0]]).toFixed(2), +gridMean(l).toFixed(3)]);
  for (const lag of peaks.slice(0, 6)) {
    if (comb[lag] < 0.7 * comb[peaks[0]]) continue;
    const bpm = (60 * OF) / lag, sc = -Math.abs(Math.log2(bpm / 128));
    if (sc > bestScore) { bestScore = sc; bestLag = lag; }
  }
  const a0 = acF[bestLag - 1], a1 = acF[bestLag], a2 = acF[bestLag + 1], den = a0 - 2 * a1 + a2;
  const period = bestLag + (den < 0 ? (0.5 * (a0 - a2)) / den : 0);
  const tempo = (60 * OF) / period;

  // beats by dynamic programming (as librosa does): each beat takes the best earlier beat about a
  // period back, penalised for straying from the tempo; then trace back from the strongest end
  const tight = 100, score = new Float32Array(on), back = new Int32Array(on).fill(-1);
  for (let f = 0; f < on; f++) {
    let best = 0, bi = -1;
    for (let pv = Math.max(0, Math.round(f - 2 * period)); pv <= f - Math.round(period / 2); pv++) {
      const c = score[pv] - tight * Math.log((f - pv) / period) ** 2;
      if (c > best || bi < 0) { best = c; bi = pv; }
    }
    score[f] = onsetF[f] + (bi >= 0 ? Math.max(0, best) : 0);
    back[f] = bi >= 0 && best > 0 ? bi : -1;
  }
  let endF = on - 1, endBest = -1;
  for (let f = Math.max(0, on - Math.round(period * 2)); f < on; f++) if (score[f] > endBest) { endBest = score[f]; endF = f; }
  const beatsF = [];
  for (let f = endF; f >= 0; f = back[f]) { beatsF.push(f); if (back[f] < 0) break; }
  const beats = beatsF.reverse().map(f => f / OF);
  // downbeats: of the four bar phases, the one with the most bass on it
  const at = (arr, t) => arr[Math.min(n - 1, Math.max(0, Math.round(t * FPS)))];
  let dph = 0, dbest = -1;
  for (let p = 0; p < 4; p++) { let s = 0, c = 0; for (let k = p; k < beats.length; k += 4) { s += at(low, beats[k]); c++; } if (c && s / c > dbest) { dbest = s / c; dph = p; } }
  const downbeats = beats.filter((_, k) => k % 4 === dph);

  // sections: loudness levels (by quantile), short runs merged away, boundaries on downbeats
  const q = [pct(energy, 30), pct(energy, 60), pct(energy, 85)];
  const lev = energy.map(e => (e > q[2] ? 3 : e > q[1] ? 2 : e > q[0] ? 1 : 0));
  let runs = [];
  for (let f = 0; f < n; f++) { if (!runs.length || runs[runs.length - 1].l !== lev[f]) runs.push({ a: f, b: f + 1, l: lev[f] }); else runs[runs.length - 1].b = f + 1; }
  const minLen = 8 * FPS;
  for (let changed = true; changed && runs.length > 1;) {
    changed = false;
    let k = -1, shortest = Infinity;
    runs.forEach((r, i) => { if (r.b - r.a < minLen && r.b - r.a < shortest) { shortest = r.b - r.a; k = i; } });
    if (k < 0) break;
    const r = runs[k], left = runs[k - 1], right = runs[k + 1];
    const into = !left ? right : !right ? left : Math.abs(left.l - r.l) <= Math.abs(right.l - r.l) ? left : right;
    into.a = Math.min(into.a, r.a); into.b = Math.max(into.b, r.b);
    runs.splice(k, 1);
    for (let i = runs.length - 1; i > 0; i--) if (runs[i].l === runs[i - 1].l) { runs[i - 1].b = runs[i].b; runs.splice(i, 1); }
    changed = true;
  }
  const snap = t => (downbeats.length ? downbeats.reduce((b, d) => (Math.abs(d - t) < Math.abs(b - t) ? d : b), downbeats[0]) : t);
  const sections = runs.map((r, i) => {
    const t0 = i === 0 ? 0 : snap(r.a / FPS), t1 = i === runs.length - 1 ? dur : snap(r.b / FPS);
    let e = 0, lo = 0, hi = 0;
    for (let f = r.a; f < r.b; f++) { e += rms[f]; lo += low[f]; hi += high[f]; }
    const c = Math.max(1, r.b - r.a);
    return { t0: +t0.toFixed(3), t1: +t1.toFixed(3), energy: +(e / c).toFixed(3), low: +(lo / c).toFixed(3), high: +(hi / c).toFixed(3), level: r.l };
  }).filter(s => s.t1 - s.t0 > 2);
  const r3 = x => Array.from(x, v => +v.toFixed(3));
  return {
    duration: +dur.toFixed(3), tempo: +tempo.toFixed(2), fps: FPS,
    beats: beats.map(t => +t.toFixed(3)), downbeats: downbeats.map(t => +t.toFixed(3)), onsets: [],
    sections, rms: r3(rms), low: r3(low), mid: r3(mid), high: r3(high), onset: r3(onset), energy: r3(energy),
  };
};
