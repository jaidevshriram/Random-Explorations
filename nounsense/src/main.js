/* Main: drawing, input, sound and the page around the canvas.
 *
 * The scene is drawn like a comic panel: a flat-colour sky with halftone bands,
 * two inked background layers baked once per world, heavy outlines on the
 * ground, and lettered sound effects and speech balloons on top.
 */
(function (NN) {
  'use strict';
  const { P, rough, rng, sprite } = NN.art;
  const VW = 1100, VH = 620, LS = 2;
  let Z = 1.6, WW = VW / Z, WH = VH / Z, BASE = 290, HORIZON = (520 - BASE) * Z;   // camera zoom is set per world
  const INK = '#1f1a17';
  const $ = (id) => document.getElementById(id);
  const view = $('game');                                                      // what the player sees (WebGL)
  const cv = document.createElement('canvas'), ctx = cv.getContext('2d');      // the scene, drawn unlit
  const uiCv = document.createElement('canvas'), u = uiCv.getContext('2d');    // lettering and outlines, never darkened
  const lmCv = document.createElement('canvas'), lm = lmCv.getContext('2d');   // light map: ambient colour plus every light
  const glCv = document.createElement('canvas'), gl = glCv.getContext('2d');   // the lights alone, for bloom
  const FONT = '"Comic Neue", "Comic Sans MS", "Chalkboard SE", sans-serif', SFXFONT = 'Bangers, Impact, "Arial Black", sans-serif';
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- saved progress (per browser; the game works without it) --------------
  const store = { found: [], worlds: {}, muted: false, last: 0 };
  try { Object.assign(store, JSON.parse(localStorage.getItem('nounsense.v2') || '{}')); } catch (e) { /* private window */ }
  const save = () => { try { localStorage.setItem('nounsense.v2', JSON.stringify(store)); } catch (e) { /* ignore */ } };
  const prog = (id) => (store.worlds[id] = store.worlds[id] || { stars: 0, used: [] });

  let sim, L, levelIndex = NN.levels[store.last] && !NN.levels[store.last].hidden ? store.last : 0, started = false, boil = 0, hover = null, selected = null, toastT = 0, layers = null;
  const cam = { x: 0, y: BASE };
  const mouse = { sx: VW / 2, sy: VH / 3, x: 0, y: 0, inside: false, downAt: null };
  const keys = {}, pressed = {};

  // ---- sound: a tiny synth, started by the first click -----------------------
  let ac = null;
  function tone(f, dur, type, vol, slide) {
    if (!ac || store.muted) return;
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
    o.type = type || 'square'; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + dur);
    g.gain.setValueAtTime(vol || 0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, low) {
    if (!ac || store.muted) return;
    const n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = low || 1800; g.gain.value = vol || 0.08;
    src.buffer = buf; src.connect(f); f.connect(g); g.connect(ac.destination); src.start();
  }
  const SOUNDS = {
    jump: () => tone(330, 0.12, 'square', 0.04, 1.8), land: () => noise(0.06, 0.05, 500), flap: () => tone(520, 0.07, 'triangle', 0.04, 1.4), poof: () => noise(0.14, 0.07, 2600),
    pick: () => tone(660, 0.07, 'triangle', 0.05, 1.3), munch: () => tone(150, 0.06, 'square', 0.04, 0.7), hurt: () => tone(220, 0.22, 'sawtooth', 0.06, 0.4), clang: () => tone(900, 0.12, 'square', 0.04, 0.9),
    boing: () => tone(180, 0.25, 'sine', 0.08, 3), splash: () => noise(0.3, 0.09, 900), boom: () => { noise(0.45, 0.14, 500); tone(80, 0.3, 'sine', 0.1, 0.5); }, fire: () => noise(0.25, 0.05, 1400),
    hiss: () => noise(0.3, 0.04, 5000), zap: () => tone(1200, 0.16, 'sawtooth', 0.04, 0.25), swing: () => noise(0.08, 0.05, 3000), toot: () => tone(392, 0.4, 'square', 0.06), crack: () => noise(0.1, 0.1, 6000),
    lull: () => [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'sine', 0.05), i * 140)), grow: () => tone(160, 0.6, 'triangle', 0.06, 4), lose: () => tone(300, 0.4, 'sawtooth', 0.05, 0.3),
    win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'square', 0.05), i * 130)), nope: () => tone(140, 0.15, 'square', 0.04),
  };
  const sfx = (n) => { if (SOUNDS[n]) try { SOUNDS[n](); } catch (e) { /* audio is optional */ } };

  // ---- music: a small generative tune per world, scheduled a moment ahead of the clock ----
  // Each world has a key, a tempo and four chords. A soft pad holds the chord, a bass marks the bar, and a
  // music-box voice wanders the scale. The wander is seeded per phrase and three phrases repeat, so it reads as a tune.
  const TUNES = {
    town: { bpm: 96, root: 57, scale: [0, 2, 4, 7, 9], chords: [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]], wave: 'triangle' },
    manor: { bpm: 70, root: 50, scale: [0, 2, 3, 7, 8], chords: [[0, 3, 7], [8, 12, 15], [5, 8, 12], [7, 10, 14]], wave: 'sine' },
    port: { bpm: 104, root: 55, scale: [0, 2, 5, 7, 9], chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]], wave: 'triangle' },
    hollow: { bpm: 80, root: 52, scale: [0, 2, 4, 7, 9, 11], chords: [[0, 4, 7, 11], [5, 9, 12, 16], [9, 12, 16], [7, 11, 14]], wave: 'sine' },
  };
  let mus = null;
  function musicInit() {
    if (!ac || mus) return;
    const out = ac.createGain(); out.gain.value = store.muted ? 0 : 1; out.connect(ac.destination);
    const dly = ac.createDelay(1), fb = ac.createGain(), wet = ac.createGain(); dly.delayTime.value = 0.36; fb.gain.value = 0.3; wet.gain.value = 0.5;
    dly.connect(fb); fb.connect(dly); dly.connect(wet); wet.connect(out);
    mus = { out, dly, next: 0, step: 0, r: rng(7), last: 3 };
  }
  function mnote(midi, t, dur, vol, type, echo) {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + (dur > 1.5 ? 0.6 : 0.012)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(mus.out); if (echo) g.connect(mus.dly); o.start(t); o.stop(t + dur + 0.05);
  }
  function musicTick() {
    if (!ac || !mus || !started || ac.state !== 'running' || store.muted) return;
    const T = TUNES[L.theme] || TUNES.town, sp = 30 / T.bpm;      // one step is an eighth note
    if (mus.next < ac.currentTime) mus.next = ac.currentTime + 0.05;
    while (mus.next < ac.currentTime + 0.6) {                    // far enough ahead that a slow frame does not leave a gap
      const st = mus.step % 8, bar = Math.floor(mus.step / 8), ch = T.chords[bar % T.chords.length], t = mus.next;
      if (mus.step % 32 === 0) { mus.r = rng(L.W + (Math.floor(mus.step / 32) % 3) * 17); mus.last = 3; }
      if (st === 0) { for (const n of ch) mnote(T.root + n, t, sp * 8.4, 0.02, 'sine'); mnote(T.root - 12 + ch[0], t, sp * 7, 0.045, 'triangle'); }
      if (st === 4) mnote(T.root - 5 + ch[0], t, sp * 3, 0.026, 'triangle');
      if (mus.r() < (st % 2 === 0 ? 0.64 : 0.28)) {
        mus.last = Math.max(0, Math.min(T.scale.length * 2 - 1, mus.last + Math.round((mus.r() - 0.5) * 4)));
        mnote(T.root + 12 + T.scale[mus.last % T.scale.length] + 12 * Math.floor(mus.last / T.scale.length), t, sp * 3.4, 0.034, T.wave, true);
      }
      mus.next += sp; mus.step++;
    }
  }

  // ---- worlds: palettes and background recipes -----------------------------------
  const THEMES = {
    forest: { ambient: '#8f86c4', sky: ['#241d4a', '#553a78', '#d9837f'], haze: '#6a4d8a', stars: 70, bodies: [[850, 110, 46, '#f3e3b0'], [960, 170, 20, '#bfe0d8']],
      ground: { moss: { body: '#3b3257', body2: '#322a4c', cap: '#3fb59a', line: '#5b4f80', glow: '#a8f5d8' }, pit: { body: '#231d3a', cap: '#231d3a', line: '#3b3257' } }, water: ['rgba(79,224,192,0.72)', '#d6fff3'] },
    sky: { sky: ['#2f8fb0', '#8fd0c8', '#fbe3a8'], haze: '#bfe5dc', stars: 0, bodies: [[230, 150, 70, '#f2b56b', 1]],
      ground: { dust: { body: '#b96a3a', body2: '#a35a30', cap: '#e9a35a', line: '#8a4a28' }, island: { body: '#8a5a44', body2: '#74493a', cap: '#7cc46a', line: '#5b3a2e', glow: '#fff3b0' } }, water: ['rgba(90,151,208,0.6)', '#ffffff'] },
    keep: { ambient: '#7a82b8', sky: ['#0b0e22', '#1a2150', '#3b3f7a'], haze: '#161b40', stars: 120, bodies: [[230, 130, 84, '#6fa8d6', 2]],
      ground: { moon: { body: '#454a66', body2: '#3a3f58', cap: '#8a8fa8', line: '#2c3048' }, keep: { body: '#34395a', body2: '#2b3050', cap: '#676d96', line: '#1f2340', bricks: 1 }, pit: { body: '#1a1d33', cap: '#1a1d33', line: '#2c3048' } }, water: ['rgba(87,201,143,0.7)', '#d9ffe9'] },
    manor: { custom: true, ambient: '#8a80b4', haze: '#3a2a40', ground: { floor: { body: '#4a3038', cap: '#7a5140', line: '#3a2630' } }, water: ['rgba(90,151,208,0.6)', '#ffffff'] },
    hollow: { custom: true, ambient: '#7a84c2', haze: '#3a4a86', ground: { turf: { body: '#54425f', cap: '#3f9a86', line: '#33294a' }, pit: { body: '#3d3657', cap: '#3d3657', line: '#33294a' } }, water: ['rgba(96,205,225,0.6)', '#e6fffa'] },
    town: { custom: true, ambient: '#b4b8de', haze: '#c9d6ea', ground: { street: { body: '#4c5169', cap: '#cfcabf', line: '#3a3f55' }, pit: { body: '#2f3349', cap: '#2f3349', line: '#3a3f55' } }, water: ['rgba(90,151,208,0.6)', '#ffffff'] },
    port: { custom: true, ambient: '#b8a0d4', haze: '#e0a0b8', midHaze: 0.3, ground: { dock: { body: '#35284a', cap: '#c79a66', line: '#2e2240' }, pit: { body: '#4a3a70', cap: '#4a3a70', line: '#3b3458' } }, water: ['rgba(206,190,236,0.66)', '#ffffff'] },
  };
  // background props, in the same shape language as the dictionary art
  const BG = {
    peak: [['p', [-100, 100, -46, -50, -18, -24, 14, -100, 56, -10, 100, 100], 'navy', 3], ['p', [-2, -64, 14, -100, 36, -52, 20, -62, 8, -46], 'white', 2]],
    shroom: (c, s) => [['p', [-18, 100, -12, 0, 12, 0, 18, 100], 'cream', 4], ['p', [-100, 4, -82, -58, 0, -100, 82, -58, 100, 4, 60, 18, -60, 18], c, 9], ['e', -42, -38, 16, 12, s], ['e', 18, -62, 14, 10, s], ['e', 52, -22, 12, 9, s], ['l', [-58, 16, 58, 16], 1.5]],
    curltree: [['p', [-12, 100, -8, 10, 8, 10, 12, 100], 'dbrown', 3], ['g', 'teal', [['e', -30, -10, 46, 34], ['e', 34, -16, 44, 32], ['e', 0, -52, 52, 38]]], ['l', [-10, -52, 6, -64, 18, -50, 6, -42], 2], ['l', [-40, -8, -26, -18, -18, -6], 2]],
    spire: [['p', [-70, 100, -30, -100, 14, -40, 70, 100], 'sky', 1.5], ['l', [-30, -100, -10, 100], 1.4], ['l', [14, -40, 30, 100], 1.4], ['p', [20, 100, 50, -10, 96, 100], 'sky+', 1.5]],
    mesa: [['p', [-100, 100, -80, -40, -40, -60, 30, -56, 60, -20, 100, 100], 'orange', 5], ['l', [-74, -10, 54, -4], 1.6], ['l', [-84, 30, 76, 36], 1.6]],
    skyrock: [['p', [-100, -30, -60, 0, -30, 70, 0, 30, 30, 100, 60, 10, 100, -30], 'brown', 5], ['p', [-104, -34, -70, -70, 60, -74, 104, -34, 60, -22, -60, -22], 'green', 6], ['l', [-40, 10, -30, 40], 1.5], ['l', [34, 20, 40, 60], 1.5]],
    puff: [['g', 'white', [['e', -44, 16, 52, 60], ['e', 38, 16, 60, 64], ['e', -4, -28, 54, 60]]]],
    tower: [['r', -46, -52, 92, 152, 'navy', 3], ['p', [-64, -50, 0, -100, 64, -50], 'purple', 2], ['r', -14, -24, 28, 34, 'yellow', 6], ['r', -14, 34, 28, 34, 'yellow', 6], ['l', [-46, 12, 46, 12], 1.5], ['l', [0, -100, 0, -118], 2], ['p', [0, -118, 26, -110, 0, -102], 'red', 1]],
    wall: [['r', -100, -30, 200, 130, 'navy', 2], ['r', -100, -62, 24, 34, 'navy', 2], ['r', -56, -62, 24, 34, 'navy', 2], ['r', -12, -62, 24, 34, 'navy', 2], ['r', 32, -62, 24, 34, 'navy', 2], ['r', 76, -62, 24, 34, 'navy', 2], ['l', [-100, 10, 100, 10], 1.5], ['l', [-100, 50, 100, 50], 1.5]],
    crag: [['p', [-100, 100, -70, 10, -40, 40, -10, -70, 20, -10, 50, -50, 100, 100], 'dgrey', 3], ['l', [-10, -70, -4, 20], 1.5], ['l', [50, -50, 44, 30], 1.5]],
    dish: [['l', [0, 100, 0, 0], 3], ['p', [-80, -10, -40, -70, 30, -90, 70, -40, 0, 0], 'grey', 4], ['l', [-10, -40, 40, -100], 2], ['d', 42, -102, 3, 'red']],
    arch: [['g', 'navy', [['r', -100, -100, 30, 200, 2], ['r', 70, -100, 30, 200, 2], ['r', -100, -100, 200, 34, 2]]], ['p', [-70, -66, 0, -30, 70, -66], 'navy-', 2], ['r', -92, -20, 14, 44, 'yellow', 5], ['r', 78, -20, 14, 44, 'yellow', 5]],
    banner: [['l', [0, -100, 0, 100], 2.4], ['p', [0, -92, 80, -92, 80, 40, 40, 16, 0, 40], 'purple', 2], ['e', 40, -40, 16, 14, 'yellow']],
    sailship: [['l', [-20, 30, -20, -100], 2.6], ['l', [40, 30, 40, -70], 2.6], ['p', [-16, -92, 30, -60, -16, -20], 'cream', 2], ['p', [44, -64, 80, -40, 44, -6], 'cream', 2], ['p', [-100, 30, 100, 30, 76, 100, -76, 100], 'dbrown', 5], ['p', [-20, -100, -50, -90, -20, -80], 'red', 1]],
    crane: [['l', [-20, 100, -20, -80], 4], ['l', [-20, -80, 90, -60], 4], ['l', [-20, -40, 40, -70], 2], ['l', [80, -62, 80, 0], 1.6], ['r', 66, 0, 28, 26, 'orange', 3], ['r', -44, 70, 48, 30, 'dgrey', 3]],
    crates: [['r', -100, 0, 90, 100, 'tan', 3], ['l', [-100, 0, -10, 100], 1.5], ['r', 0, 30, 70, 70, 'tan-', 3], ['r', -60, -70, 70, 70, 'tan', 3], ['e', 70, 60, 26, 40, 'brown'], ['l', [46, 50, 94, 50], 1.5]],
    lamp: [['l', [0, 100, 0, -70], 3.4], ['l', [0, -70, 40, -84], 3], ['r', 30, -86, 30, 40, 'yellow', 5], ['r', -14, 86, 28, 14, 'dgrey', 2]],
    mast: [['l', [0, 100, 0, -100], 5, 'dbrown'], ['l', [-70, -40, 70, -40], 3.4, 'dbrown'], ['l', [-54, 30, 54, 30], 3.4, 'dbrown'], ['p', [-66, -36, 66, -36, 56, 22, -56, 22], 'cream', 3], ['p', [-50, 34, 50, 34, 44, 84, -44, 84], 'cream', 3], ['l', [-40, -8, 40, -8], 1.3], ['p', [0, -100, 44, -90, 0, -78], 'ink', 1], ['d', 16, -90, 2.4, 'white'], ['e', 0, -56, 26, 8, 'dbrown']],
    cabin: [['r', -100, -20, 200, 120, 'brown', 3], ['p', [-110, -18, -96, -60, 96, -60, 110, -18], 'dbrown', 3], ['r', -70, 10, 40, 40, 'yellow', 8], ['r', -6, 10, 40, 40, 'yellow', 8], ['r', 56, 0, 34, 100, 'dbrown', 3], ['l', [-100, 66, 50, 66], 1.5]],
    comet: [['p', [-60, 30, -104, -10, -96, 70, -50, 60], 'red', 3], ['e', 0, 12, 78, 58, 'grey', -10], ['p', [56, -44, 104, -66, 86, -6], 'red', 4], ['e', 12, 2, 30, 30, 'dgrey'], ['e', 12, 2, 20, 20, 'sky'], ['l', [-52, 40, -20, 54, 22, 50], 1.5], ['l', [-40, -34, -10, -44], 1.5], ['d', -30, 20, 2, 'dgrey'], ['d', 44, 34, 2, 'dgrey'],
      ['p', [-80, 100, -70, 66, -20, 60, 40, 70, 80, 100], 'dgrey', 4], ['l', [-66, -50, -76, -78, -62, -100], 2.4, 'white'], ['l', [-40, -56, -46, -84], 2.4, 'white']],
    signpost: [['r', -8, -20, 16, 120, 'brown', 2], ['p', [-100, -100, 100, -100, 100, -30, -100, -30], 'tan', 3]],
  };
  const SCENES = {
    forest: {
      far: (S, w, h) => { for (let x = 60; x < w; x += 330) S(BG.peak, x + (x % 97), h, 380, 250 + (x % 120)); },
      mid: (S, w, h, r) => { for (let x = 30; x < w; x += 150 + r() * 160) { const k = r(); if (k < 0.5) S(BG.shroom(k < 0.25 ? 'purple' : 'pink', 'white'), x, h, 90 + r() * 90, 110 + r() * 130); else if (k < 0.8) S(BG.curltree, x, h, 120, 150 + r() * 70); else S(BG.spire, x, h, 60, 110 + r() * 80); } },
    },
    sky: {
      far: (S, w, h) => { for (let x = 100; x < w; x += 400) S(BG.mesa, x, h, 360, 170 + (x % 90)); },
      mid: (S, w, h, r) => { for (let x = 60; x < w; x += 260 + r() * 200) { S(BG.skyrock, x, h - 200 - r() * 520, 130 + r() * 110, 90 + r() * 50); S(BG.puff, x + 120, h - 120 - r() * 600, 120 + r() * 80, 44); } },
    },
    keep: {
      far: (S, w, h) => { for (let x = 40; x < w; x += 260) S(BG.crag, x, h, 300, 150 + (x % 110)); for (let x = w * 0.5; x < w; x += 170) S(BG.tower, x, h, 90, 300 + (x % 140)); },
      mid: (S, w, h, r) => { for (let x = 80; x < w * 0.38; x += 200 + r() * 200) S(r() < 0.5 ? BG.dish : BG.crag, x, h, 90, 110 + r() * 50); for (let x = w * 0.42; x < w; x += 190) { S(BG.wall, x, h, 190, 190); S(BG.banner, x + 40, h - 60, 46, 120); } },
    },
    port: {
      far: (S, w, h, r) => { for (let x = 80; x < w; x += 300 + r() * 160) S(r() < 0.6 ? BG.sailship : BG.crane, x, h - 6, 170, 190 + r() * 60); },
      mid: (S, w, h, r) => { for (let x = 60; x < w * 0.3; x += 150 + r() * 120) S(r() < 0.5 ? BG.crates : BG.lamp, x, h, 100, 100 + r() * 60); },
    },
  };
  // props that sit in the world itself, behind the action
  const PROPS = {
    manor: [], town: [], hollow: [], forest: [], sky: [{ a: BG.skyrock, x: 1560, y: -420, w: 220, h: 120 }],
    keep: [{ a: BG.arch, x: 1500, y: 520, w: 260, h: 250 }, { a: BG.arch, x: 1800, y: 520, w: 260, h: 250 }, { a: BG.arch, x: 2100, y: 520, w: 260, h: 250 }, { a: BG.banner, x: 1650, y: 440, w: 50, h: 130 }, { a: BG.banner, x: 1950, y: 440, w: 50, h: 130 }],
    port: [],
  };

  let dotPat = {};
  function dots(color, r, gap) {
    const k = color + r + gap;
    if (!dotPat[k]) {
      const c = document.createElement('canvas'); c.width = c.height = gap * 2;
      const g = c.getContext('2d'); g.fillStyle = color;
      for (const [x, y] of [[gap / 2, gap / 2], [gap * 1.5, gap * 1.5]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
      dotPat[k] = ctx.createPattern(c, 'repeat');
    }
    return dotPat[k];
  }
  function stampInto(c) {
    let n = 0;
    return (ops, x, bottom, w, h, flip) => {
      const s = sprite({ noun: '_bg' + (n++) + Math.round(w) + 'x' + Math.round(h), w: Math.round(w), h: Math.round(h), art: ops, still: true });
      c.save(); c.translate(x, bottom - h / 2); if (flip) c.scale(-1, 1);
      c.drawImage(s.frames[0], -s.w / 2, -s.h / 2, s.w, s.h); c.restore();
    };
  }
  function bake(par, paint, hazeAlpha, T, raw) {
    const w = Math.ceil(VW + (L.W - WW) * par * Z) + 60, extra = Math.ceil((BASE - (L.sky - 120)) * Z * par), h = VH + extra;
    const c0 = document.createElement('canvas'); c0.width = Math.ceil(w * LS); c0.height = Math.ceil(h * LS);
    const c = c0.getContext('2d'); c.scale(LS, LS);
    paint(raw ? c : stampInto(c), w, extra + HORIZON + 4, rng(par * 1000 + 7));
    c.globalCompositeOperation = 'source-atop'; c.globalAlpha = hazeAlpha; c.fillStyle = T.haze; c.fillRect(0, 0, w, h);
    return { cv: c0, w, h, extra, par, horizon: extra + HORIZON + 4 };
  }
  // Baked scene layers are several screens wide. Cut them into tiles so each frame only touches the ones in
  // view and no single texture is bigger than phones allow. Tiles with nothing on them are dropped.
  function tileLayer(l) {
    if (!l || l.tiles) return l;
    const src = l.cv, sc = src.width / L.W, TW = 512, tiles = [], probe = document.createElement('canvas'); probe.width = probe.height = 24;
    const pc = probe.getContext('2d', { willReadFrequently: true });
    for (let x = 0; x < L.W; x += TW) {
      const w = Math.min(TW + 1, L.W - x), t = document.createElement('canvas'); t.width = Math.ceil(w * sc); t.height = src.height;
      t.getContext('2d').drawImage(src, -Math.round(x * sc), 0);
      pc.clearRect(0, 0, 24, 24); pc.drawImage(t, 0, 0, 24, 24);
      const d = pc.getImageData(0, 0, 24, 24).data; let any = false; for (let i = 3; i < d.length; i += 4) if (d[i]) { any = true; break; }
      if (any) tiles.push({ cv: t, x, w: t.width / sc });
    }
    src.width = src.height = 0;                                   // let the big canvas go
    return { tiles, top: l.top, h: l.h };
  }
  function drawLayer(l) { for (const t of l.tiles) if (t.x < cam.x + WW + 4 && t.x + t.w > cam.x - 4) ctx.drawImage(t.cv, t.x, l.top, t.w, l.h); }
  function buildWorldArt() {
    const T = THEMES[L.theme], S = SCENES[L.theme];
    if (T.custom) {   // the town is drawn from architectural parts, see town.js
      const sky = document.createElement('canvas'); sky.width = VW * LS; sky.height = VH * LS;
      const c = sky.getContext('2d'); c.scale(LS, LS); NN.town.sky(c, VW, VH);
      if (L.theme === 'manor') { const m = NN.manor.build(L, 2); c.fillStyle = '#3a2a40'; c.fillRect(0, 0, VW, VH); layers = { sky, far: null, mid: null, front: m.front, over: m.over, lights: m.lights }; return; }
      const P = NN[L.theme];
      if (P && P.build && P.far) {                               // worlds with a full painter: hollow, port
        const pw = P.build(L, 2); c.clearRect(0, 0, VW, VH); P.sky(c, VW, VH);
        layers = { sky, far: bake(0.14, P.far, 0, T, true), mid: bake(0.4, P.mid, T.midHaze || 0.1, T, true), front: pw.front, over: pw.over, lights: pw.lights, emitters: pw.emitters, animate: pw.animate, liveLights: pw.liveLights, skyLights: P.skyLights ? P.skyLights(VW, VH) : [] };
        return;
      }
      const f = NN.town.front(L.W, L.start.y, 2, L.holes);
      layers = { sky, far: bake(0.14, NN.town.far, 0, T, true), mid: bake(0.4, NN.town.mid, 0.16, T, true), front: f, over: f.over, lights: f.lights, emitters: f.emitters, train: NN.town.train() };
      return;
    }
    // sky: flat bands joined by rows of halftone dots, stars, moons and planets with a hard ink edge
    const sky = document.createElement('canvas'); sky.width = VW * LS; sky.height = VH * LS;
    const c = sky.getContext('2d'); c.scale(LS, LS);
    const cuts = [0, VH * 0.36, VH * 0.62];
    T.sky.forEach((col, i) => { c.fillStyle = col; c.fillRect(0, cuts[i], VW, VH - cuts[i]); });
    for (let i = 1; i < 3; i++) { c.fillStyle = T.sky[i]; for (let k = 0; k < 6; k++) for (let x = (k % 2) * 7; x < VW + 14; x += 14) { c.beginPath(); c.arc(x, cuts[i] - 6 - k * 11, 5.4 - k * 0.85, 0, 7); c.fill(); } }
    const r = rng(L.W);
    c.fillStyle = '#fff8dc'; for (let i = 0; i < T.stars; i++) { const x = r() * VW, y = r() * VH * 0.6, s = 0.8 + r() * 1.6; c.beginPath(); c.moveTo(x, y - s * 2); c.lineTo(x + s * 0.6, y - s * 0.6); c.lineTo(x + s * 2, y); c.lineTo(x + s * 0.6, y + s * 0.6); c.lineTo(x, y + s * 2); c.lineTo(x - s * 0.6, y + s * 0.6); c.lineTo(x - s * 2, y); c.lineTo(x - s * 0.6, y - s * 0.6); c.fill(); }
    for (const [x, y, rad, col, kind] of T.bodies) {
      c.lineWidth = 3; c.strokeStyle = INK; c.fillStyle = col; c.beginPath(); c.arc(x, y, rad, 0, 7); c.fill();
      c.save(); c.beginPath(); c.arc(x, y, rad, 0, 7); c.clip(); c.fillStyle = dots('rgba(31,26,23,0.28)', 2.2, 7); c.beginPath(); c.arc(x + rad * 0.5, y + rad * 0.4, rad * 1.05, 0, 7); c.fill();
      if (kind === 2) { c.fillStyle = 'rgba(255,255,255,0.5)'; for (const [dx, dy, rr] of [[-0.3, -0.3, 0.35], [0.2, 0.1, 0.28], [-0.1, 0.45, 0.22]]) { c.beginPath(); c.ellipse(x + dx * rad, y + dy * rad, rr * rad * 1.5, rr * rad * 0.6, 0.3, 0, 7); c.fill(); } }
      c.restore(); c.beginPath(); c.arc(x, y, rad, 0, 7); c.stroke();
      if (kind === 1) { c.lineWidth = 5; c.beginPath(); c.ellipse(x, y, rad * 1.7, rad * 0.36, -0.35, 0.12, Math.PI - 0.12); c.stroke(); c.strokeStyle = '#ffe9b0'; c.lineWidth = 2; c.stroke(); }
    }
    layers = { sky, far: bake(0.22, S.far, 0.55, T), mid: bake(0.5, S.mid, 0.3, T) };
  }

  function newGame(index) {
    if (index !== undefined) levelIndex = index;
    L = NN.levels[levelIndex];
    store.last = levelIndex; save();
    sim = NN.createSim({ toast: showToast, changed: updateHud, won: onWin, sfx }, L);
    Z = L.zoom || 1.6; WW = VW / Z; WH = VH / Z; BASE = L.zoom ? 520 - WH * 0.84 : 290; HORIZON = (520 - BASE) * Z;
    cam.x = 0; cam.y = BASE; hover = null; selected = null;
    smoke.length = 0; buildWorldArt(); layers.front = tileLayer(layers.front); layers.over = tileLayer(layers.over);
    $('win').hidden = true; $('toast').classList.remove('show');          // a message from the last world must not follow you into this one
    $('cap').textContent = L.caption; $('cap').classList.add('show'); capT = 7;
    $('lvlname').textContent = `${NN.levels.filter((l, i) => !l.hidden && i <= levelIndex).length}. ${L.name}`;
    $('introtitle').textContent = L.name; $('introbody').textContent = L.story;
    renderWorldPicker(); select(null); updateHud();
  }

  // ---- drawing helpers -----------------------------------------------------------
  const R = (seed) => rng(((seed | 0) * 131 + boil * 977 + 5) >>> 0);
  const visible = (x, pad) => x > cam.x - (pad || 60) && x < cam.x + WW + (pad || 60);
  const chestSpec = Object.assign({}, NN.lexicon.resolve('big treasure').spec, { noun: '_seedchest', still: true });   // a chest of spare star seeds, for indoor worlds
  const heroSpec = { noun: '_nib', w: 34, h: 60, art: { a: 'person', top: 'teal', legs: 'navy', shoe: 'dbrown', hat: 'goggles', hair: 'red', satchel: 1 } };

  function shadow(x, y, rx, a) { ctx.fillStyle = `rgba(20,14,30,${a})`; ctx.beginPath(); ctx.ellipse(x, y + 1, rx, Math.max(2.5, rx * 0.16), 0, 0, 7); ctx.fill(); }
  function blit(spec, x, y, o) {
    o = o || {};
    const s = sprite(spec, o.pose || 0), f = s.frames[(boil + (o.id || 0)) % s.frames.length];
    ctx.save();
    ctx.translate(x, y);
    if (o.angle) ctx.rotate(o.angle);
    if (o.k) { ctx.translate(0, spec.h / 2); ctx.scale(o.k, o.k); ctx.translate(0, -spec.h / 2); }
    if (o.sy) { ctx.translate(0, spec.h / 2); ctx.scale(2 - o.sy, o.sy); ctx.translate(0, -spec.h / 2); }   // squash and stretch from the feet
    ctx.scale(o.flip ? -1 : 1, o.flipY ? -1 : 1);
    if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
    ctx.drawImage(f, -s.w / 2, -s.h / 2, s.w, s.h);
    ctx.restore();
  }
  // eyes are drawn live so creatures can look around, blink and react
  function drawEyes(spec, x, y, facing, st) {
    const eyes = sprite(spec, 0).eyes;
    if (!eyes.length) return;
    const r0 = Math.max(1.8, Math.min(3.6, Math.min(spec.w, spec.h) * 0.075)) * (st.k || 1);
    for (const [nx, ny, k] of eyes) {
      const ex = x + facing * nx / 100 * spec.w / 2 * (st.k || 1), ey = y + (st.flipY ? -1 : 1) * ny / 100 * spec.h / 2 * (st.k || 1) + (st.dy || 0), r = r0 * (k || 1) * (st.wide ? 1.3 : 1);
      ctx.strokeStyle = INK; ctx.lineCap = 'round';
      if (st.closed || st.happy) {
        ctx.lineWidth = 1.7; ctx.beginPath();
        if (st.happy) ctx.arc(ex, ey + r * 0.5, r, Math.PI * 1.12, Math.PI * 1.88); else { ctx.moveTo(ex - r, ey); ctx.lineTo(ex + r, ey); }
        ctx.stroke(); continue;
      }
      ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(ex + st.lx * r * 0.25, ey + st.ly * r * 0.2, r * 0.52, r * (k ? 0.72 : 0.6), 0, 0, 7); ctx.fill();   // tall oval dots
      if (st.angry) { ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ex - facing * r * 1.4, ey - r * 1.9); ctx.lineTo(ex + facing * r * 1.2, ey - r * 0.9); ctx.stroke(); }
    }
  }
  const blinking = (id) => ((sim.time + id * 0.61) % 3.4) < 0.13;
  function label(text, x, y, size, color, font) {
    u.font = `${font ? '' : 'bold '}${size || 16}px ${font || FONT}`; u.textAlign = 'center'; u.textBaseline = 'middle';
    u.lineWidth = 4.5; u.strokeStyle = '#fff9e8'; u.lineJoin = 'round'; u.strokeText(text, x, y);
    u.fillStyle = color || INK; u.fillText(text, x, y);
  }
  function balloon(text, x, y, a) {
    u.font = `bold 13px ${FONT}`;
    const w = u.measureText(text).width + 18, h = 24;
    u.globalAlpha = a; u.fillStyle = '#fffdf4'; u.strokeStyle = INK; u.lineWidth = 2.4; u.lineJoin = 'round';
    u.beginPath(); u.ellipse(x, y - 22, w / 2, h / 2, 0, 0, 7); u.fill(); u.stroke();
    u.beginPath(); u.moveTo(x - 6, y - 12); u.lineTo(x - 2, y); u.lineTo(x + 5, y - 12); u.fill(); u.stroke();
    u.fillStyle = '#fffdf4'; u.fillRect(x - 7, y - 16, 13, 5);
    u.fillStyle = INK; u.textAlign = 'center'; u.textBaseline = 'middle'; u.fillText(text, x, y - 21.5);
    u.globalAlpha = 1;
  }
  function burst(text, x, y, k, a, seed) {
    const r = rng(seed), n = 12, rad = 11 + text.length * 4.2;
    u.save(); u.translate(x, y); u.rotate((r() - 0.5) * 0.4); u.scale(k, k); u.globalAlpha = a;
    u.beginPath();
    for (let i = 0; i < n * 2; i++) { const an = i / (n * 2) * Math.PI * 2, rr = (i % 2 ? 0.72 : 1.08 + r() * 0.2); u.lineTo(Math.cos(an) * rad * rr * 1.25, Math.sin(an) * rad * rr * 0.7); }
    u.closePath(); u.fillStyle = '#fff3a0'; u.strokeStyle = INK; u.lineWidth = 2.6; u.lineJoin = 'round'; u.fill(); u.stroke();
    u.font = `20px ${SFXFONT}`; u.textAlign = 'center'; u.textBaseline = 'middle';
    u.lineWidth = 4; u.strokeStyle = INK; u.strokeText(text, 0, 1); u.fillStyle = '#e8483a'; u.fillText(text, 0, 1);
    u.restore();
  }

  // ---- backdrop and ground -----------------------------------------------------------
  function drawBackdrop() {
    ctx.drawImage(layers.sky, 0, 0, VW, VH);
    for (const l of [layers.far, layers.mid]) if (l) ctx.drawImage(l.cv, -cam.x * l.par * Z, -l.extra + (BASE - cam.y) * Z * l.par, l.w, l.h);
    if (layers.train) { const l = layers.mid, t = reduceMotion ? 8 : sim.time, tx = ((t * 70) % (l.w + 520)) - 420; ctx.drawImage(layers.train, tx - cam.x * l.par * Z, -l.extra + (BASE - cam.y) * Z * l.par + l.horizon - 184, 396, 36); }   // the monorail crosses the viaduct
  }
  function drawBlock(t) {
    const T = THEMES[L.theme], st = T.ground[t.kind] || Object.values(T.ground)[0];
    const x0 = Math.max(t.x0, cam.x - 40), x1 = Math.min(t.x1, cam.x + WW + 40), y0 = t.y0, y1 = Math.min(t.y1, cam.y + WH + 40);
    if (x1 <= x0 || y0 > cam.y + WH + 20) return;
    if (t.kind === 'street') { NN.town.street(ctx, t, x0, x1, y1, reduceMotion ? 0 : sim.time); return; }
    if (NN[L.theme] && NN[L.theme].ground) { NN[L.theme].ground(ctx, t, x0, x1, y1); return; }
    const r0 = rng(t.x0 * 7 + t.y0 * 3 + 11);
    if (t.kind === 'island') {
      // a floating island: flat top, ragged rock hanging underneath
      const pts = [t.x0, y0 + 30]; let x = t.x0;
      while (x < t.x1) { const w = 50 + r0() * 90, d = 60 + r0() * 150; pts.push(Math.min(t.x1, x + w * 0.5), y0 + d, Math.min(t.x1, x + w), y0 + 34 + r0() * 30); x += w; }
      pts.push(t.x1, y0 + 30);
      ctx.beginPath(); ctx.moveTo(t.x0, y0); ctx.lineTo(t.x1, y0); for (let i = pts.length - 2; i >= 0; i -= 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath();
      ctx.fillStyle = st.body; ctx.fill();
      ctx.save(); ctx.clip(); ctx.fillStyle = dots('rgba(31,26,23,0.3)', 2, 7); ctx.fillRect(x0, y0 + 60, x1 - x0, 200); ctx.restore();
      ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke();
    } else {
      ctx.fillStyle = st.body; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.fillStyle = st.body2 || st.body; ctx.fillRect(x0, y0 + 120, x1 - x0, y1 - y0 - 120);
      ctx.fillStyle = dots('rgba(20,14,30,0.22)', 2.1, 7); ctx.fillRect(x0, y0 + 96, x1 - x0, 30);
      // texture: bricks, planks or loose hatching
      ctx.strokeStyle = st.line; ctx.lineWidth = 2; ctx.lineCap = 'round';
      if (st.bricks || st.planks) {
        for (let y = y0 + (st.planks ? 34 : 30); y < y1; y += st.planks ? 26 : 30) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); }
        if (st.bricks) for (let y = y0 + 30, row = 0; y < y1; y += 30, row++) for (let x = t.x0 + (row % 2 ? 30 : 0); x < x1; x += 60) if (x > x0) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 30); ctx.stroke(); }
        if (st.planks && !st.hull) for (let x = t.x0 + 40; x < x1; x += 110) if (x > x0 - 20) { ctx.fillStyle = st.line; ctx.fillRect(x, y0 + 16, 14, y1 - y0); }
        if (st.hull) for (let x = t.x0 + 30; x < x1; x += 70) for (let y = y0 + 47; y < y1; y += 52) if (x > x0) { ctx.fillStyle = '#e9c98a'; ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 7); ctx.fill(); }
      } else {
        const n = Math.round((t.x1 - t.x0) / 22);
        for (let i = 0; i < n; i++) { const x = t.x0 + 10 + r0() * (t.x1 - t.x0 - 30), y = y0 + 34 + r0() * 300, k = 8 + r0() * 16; if (x > x0 - 30 && x < x1 + 10 && y < y1) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + k, y + k * 0.35); ctx.stroke(); } }
      }
      // the walkable top: a bright cap with a scalloped lower edge
      if (t.kind !== 'pit') {
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + 14);
        if (st.bricks || st.planks) ctx.lineTo(x0, y0 + 14);
        else for (let x = Math.ceil(x1 / 26) * 26; x >= x0 - 26; x -= 26) ctx.quadraticCurveTo(x + 13, y0 + 24 + ((x * 7) % 9), x, y0 + 13);
        ctx.closePath(); ctx.fillStyle = st.cap; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.stroke();
        if (st.bricks || st.planks) { ctx.lineWidth = 1.6; for (let x = Math.ceil(x0 / 46) * 46; x < x1; x += 46) { ctx.beginPath(); ctx.moveTo(x, y0 + 1); ctx.lineTo(x, y0 + 13); ctx.stroke(); } }
      }
      ctx.strokeStyle = INK; ctx.lineWidth = 3.4; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(t.x0, y1); ctx.lineTo(t.x0, y0); ctx.lineTo(t.x1, y0); ctx.lineTo(t.x1, y1); ctx.stroke();
    }
    // things growing on top
    if (t.kind === 'pit') return;
    const r = rng(t.x0 * 5 + 9);
    for (let x = t.x0 + 26; x < t.x1 - 20; x += 46 + r() * 90) {
      const k = r(), h = 6 + r() * 8;
      if (!visible(x)) continue;
      ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      if (st.glow && k < 0.5) { ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 - h); ctx.stroke(); ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x, y0 - h - 2, 4.4, 0, 7); ctx.fill(); ctx.fillStyle = st.glow; ctx.beginPath(); ctx.arc(x, y0 - h - 2, 3, 0, 7); ctx.fill(); }
      else if (t.kind === 'moon' || t.kind === 'dust') { ctx.fillStyle = st.body2; ctx.beginPath(); ctx.ellipse(x, y0 + 6, 9 + h, 3.5, 0, 0, 7); ctx.fill(); ctx.stroke(); }
      else if (!st.bricks && !st.planks) { ctx.beginPath(); ctx.moveTo(x - 4, y0); ctx.lineTo(x - 2, y0 - h); ctx.lineTo(x, y0); ctx.lineTo(x + 3, y0 - h * 0.8); ctx.lineTo(x + 6, y0); ctx.stroke(); }
    }
    if (st.hull) { ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.fillStyle = st.cap; for (let x = Math.max(t.x0 + 6, Math.ceil(x0 / 60) * 60); x < x1; x += 60) { ctx.fillRect(x - 3, y0 - 26, 6, 26); ctx.strokeRect(x - 3, y0 - 26, 6, 26); } ctx.beginPath(); ctx.moveTo(Math.max(t.x0 + 3, x0), y0 - 26); ctx.lineTo(x1, y0 - 26); ctx.stroke(); }
  }
  function drawWorld() {
    if (layers.front) drawLayer(layers.front);
    for (const pf of smoke) { const k = pf.age / 2.6; ctx.globalAlpha = Math.max(0, 0.85 - k); ctx.beginPath(); ctx.arc(pf.x + pf.age * 7, pf.y - pf.age * 20, 5 + pf.age * 5, 0, 7); ctx.fillStyle = '#f6f1e6'; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = INK; ctx.stroke(); ctx.globalAlpha = 1; }
    for (const t of L.terrain) if (t.trench) {   // the far wall of a trench, in shadow
      const st = THEMES[L.theme].ground.pit;
      if (THEMES[L.theme].custom) { const tg = ctx.createLinearGradient(0, t.trench, 0, t.y0); tg.addColorStop(0, st.body); tg.addColorStop(1, st.line); ctx.fillStyle = tg; ctx.fillRect(t.x0, t.trench + 4, t.x1 - t.x0, t.y0 - t.trench); for (let yy = t.trench + 26; yy < t.y0; yy += 24) { ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(t.x0, yy, t.x1 - t.x0, 2); } }   // a plain shaded far wall
      else { ctx.fillStyle = st.line; ctx.fillRect(t.x0, t.trench + 4, t.x1 - t.x0, t.y0 - t.trench); ctx.fillStyle = dots('rgba(10,8,20,0.35)', 2.2, 7); ctx.fillRect(t.x0, t.trench + 4, t.x1 - t.x0, t.y0 - t.trench); }
    }
    for (const t of L.terrain) if (t.kind === 'pit') drawBlock(t);
    for (const pr of PROPS[L.theme]) if (visible(pr.x, pr.w)) blit({ noun: '_prop' + pr.w + 'x' + pr.h + pr.x, w: pr.w, h: pr.h, art: pr.a, still: true }, pr.x, pr.y - pr.h / 2);
    if (layers.animate) layers.animate(ctx, reduceMotion ? 0 : sim.time, 'back', cam, WW, WH);
    for (const t of L.terrain) if (t.kind !== 'pit') drawBlock(t);
    // the crashed ship, where fresh star seeds come from
    const d = L.depot;
    if (visible(d.x, 200)) { if (L.depotKind === 'chest') { shadow(d.x, d.y, 34, 0.22); blit(chestSpec, d.x, d.y - chestSpec.h / 2); starSeed(d.x - 8, d.y - 44 + Math.sin(sim.time * 2) * 2, 6); starSeed(d.x + 12, d.y - 40 + Math.cos(sim.time * 2.3) * 2, 5); } else { shadow(d.x, d.y, 70, 0.22); blit({ noun: '_comet', w: 170, h: 120, art: BG.comet, still: true }, d.x, d.y - 54); } }
    for (const sg of L.signs || []) if (visible(sg.x, 120)) { blit({ noun: '_sign', w: 96, h: 80, art: BG.signpost, still: true }, sg.x, L.start.y - 40); label(sg.text, sg.x, L.start.y - 66, 12); }
  }
  function drawWater() {
    const T = THEMES[L.theme], t = reduceMotion ? 0 : sim.time;
    for (const w of L.water || []) {
      const bottom = Math.min(...L.terrain.filter((b) => b.kind === 'pit' && b.x0 <= w.x0 + 4 && b.x1 >= w.x1 - 4).map((b) => b.y0).concat(w.y + 120));
      ctx.fillStyle = T.water[0]; ctx.fillRect(w.x0, w.y, w.x1 - w.x0, bottom - w.y + 2);
      ctx.fillStyle = dots('rgba(255,255,255,0.35)', 1.8, 8); ctx.fillRect(w.x0, w.y + 8, w.x1 - w.x0, 22);
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        for (let x = w.x0; x <= w.x1; x += 12) { const y = w.y + k * 16 + Math.sin(x * 0.05 + t * 2 + k * 1.7) * 3; if (x === w.x0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.strokeStyle = k ? T.water[1] : (T.custom ? 'rgba(36,44,96,0.75)' : INK); ctx.lineWidth = k ? 1.6 : (T.custom ? 2.2 : 3); ctx.globalAlpha = k ? 0.7 : 1; ctx.stroke(); ctx.globalAlpha = 1;
      }
    }
  }

  function flames(e, small) {
    const hh = Math.min(e.h, WH);
    const n = Math.max(1, Math.min(8, Math.round(e.w * hh / 2600)));
    const r = R(e.id * 17 + Math.floor(sim.time * 12));
    const top = Math.max(e.y - e.h / 2, cam.y - 20), bot = Math.min(e.y + e.h / 2, cam.y + WH + 20);
    for (let i = 0; i < n; i++) {
      const x = e.x + (r() - 0.5) * e.w * 0.9, y = top + (bot - top) * (n === 1 ? 0.5 : r()), s = (small ? 7 : 11) + r() * 8;
      rough.poly(ctx, [x - s * 0.7, y + s * 0.6, x - s * 0.8, y - s * 0.2, x - s * 0.3, y - s * 0.5, x, y - s * 1.6, x + s * 0.4, y - s * 0.5, x + s * 0.8, y - s * 0.1, x + s * 0.7, y + s * 0.6], { r, fill: P.orange, lw: 2, step: 99, amp: 1.2 });
      rough.poly(ctx, [x - s * 0.3, y + s * 0.5, x - s * 0.3, y, x, y - s * 0.8, x + s * 0.3, y, x + s * 0.3, y + s * 0.5], { r, fill: P.yellow, lw: 0, step: 99 });
    }
  }
  // a climbing plant drawn to whatever height it has grown to
  // a curtain of thornvines hanging from the canopy: wavy strands, thorns, leaves and glowing buds
  function drawThorns(e) {
    const bottom = e.y + e.h / 2, top = Math.max(e.y - e.h / 2, cam.y - 30), sway = reduceMotion ? 0 : Math.sin(sim.time * 0.9);
    const offs = [-27, -14, 0, 13, 27];
    const xAt = (i, y) => e.x + offs[i] + Math.sin(y * 0.031 + i * 1.9) * 8 + Math.sin(y * 0.011 + i) * 5 + sway * (i % 2 ? 1.4 : -1.4);
    for (let i = 0; i < 5; i++) {
      for (const [lw, col] of [[9, INK], [5.4, i % 2 ? '#3f9a78' : '#57b488']]) {
        ctx.beginPath(); ctx.moveTo(xAt(i, top), top);
        for (let y = top + 12; y < bottom; y += 12) ctx.lineTo(xAt(i, y), y);
        ctx.lineTo(xAt(i, bottom), bottom); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
      }
      for (let y = Math.ceil(top / 26) * 26 + i * 5, k = Math.round(y / 26) + i; y < bottom - 8; y += 26, k++) {
        const x = xAt(i, y), sd = k % 2 ? 1 : -1;
        ctx.beginPath(); ctx.moveTo(x + sd * 2, y - 4); ctx.lineTo(x + sd * 11, y - 1); ctx.lineTo(x + sd * 2, y + 4); ctx.closePath(); ctx.fillStyle = '#f1f6d0'; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = INK; ctx.stroke();
        if (k % 4 === 0) { ctx.save(); ctx.translate(x - sd * 11, y + 9); ctx.rotate(sd * 0.6); ctx.beginPath(); ctx.ellipse(0, 0, 10, 5, 0, 0, 7); ctx.fillStyle = '#7fd0a8'; ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore(); }
        if (k % 7 === 3) { ctx.beginPath(); ctx.arc(x - sd * 8, y + 2, 5.5, 0, 7); ctx.fillStyle = '#f6a2de'; ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = INK; ctx.stroke(); ctx.beginPath(); ctx.arc(x - sd * 9, y, 1.6, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); }
      }
    }
    // the tangle where they meet the ground
    for (const [dx, r] of [[-30, 13], [-8, 17], [16, 14], [34, 10]]) { ctx.beginPath(); ctx.arc(e.x + dx, bottom - r * 0.5, r, Math.PI * 0.9, Math.PI * 2.1); ctx.strokeStyle = INK; ctx.lineWidth = 8; ctx.stroke(); ctx.strokeStyle = '#3f9a78'; ctx.lineWidth = 4.6; ctx.stroke(); }
  }
  function drawVine(e) {
    const bottom = e.y + e.h / 2, top = e.y - e.h / 2, sway = reduceMotion ? 0 : Math.sin(sim.time * 1.2) * 2;
    const xAt = (y) => e.x + Math.sin((bottom - y) * 0.045) * 9 + sway * (bottom - y) / 400;
    for (const [lw, col] of [[10, INK], [6.5, P.green]]) {
      ctx.beginPath(); ctx.moveTo(xAt(bottom), bottom);
      for (let y = bottom - 12; y > top; y -= 12) ctx.lineTo(xAt(y), y);
      ctx.lineTo(xAt(top), top); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
    }
    for (let y = bottom - 34, i = 0; y > top + 14; y -= 44, i++) {
      if (y < cam.y - 30 || y > cam.y + WH + 30) continue;
      const s = i % 2 ? 1 : -1, x = xAt(y);
      ctx.save(); ctx.translate(x + s * 15, y - 4); ctx.rotate(s * -0.5);
      ctx.beginPath(); ctx.ellipse(0, 0, 15, 7.5, 0, 0, 7); ctx.fillStyle = i % 3 ? P.green : P.lime; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(11, 0); ctx.lineWidth = 1.2; ctx.stroke(); ctx.restore();
    }
    const tx = xAt(top);
    ctx.beginPath(); ctx.arc(tx + 7, top - 2, 7, Math.PI, Math.PI * 2.6); ctx.strokeStyle = INK; ctx.lineWidth = 5.4; ctx.stroke(); ctx.strokeStyle = P.lime; ctx.lineWidth = 3; ctx.stroke();
    if (e.spec.grow && e.spec.grow.thirsty && e.h < e.spec.grow.to && !sim.isWet(e)) label('so thirsty…', e.x, top - 22 + Math.sin(sim.time * 2) * 2, 12, P.dgreen);
  }

  const layerOf = (e) => (e.placing ? 9 : e.native && !e.spec.alive ? 1 : e.spec.traps ? 5 : e.spec.alive || e.spec.wasAlive ? 4 : e.spec.rideable ? 3 : e.spec.solid ? 2 : (e.spec.anchored || e.spec.floating) ? 0 : 6);
  function drawEnt(e) {
    if (e.heldBy || !visible(e.x, e.w / 2 + 80)) return;
    const s = e.spec, live = s.alive && sim.active(e);
    if (s.custom === 'vine') { drawVine(e); if (e.burning > 0) flames(e); return; }
    if (s.custom === 'thorns') { drawThorns(e); if (e.burning > 0) flames(e); return; }
    const pose = (live || e.mountedBy) && e.moving && !s.flies && !s.swims ? [1, 0, 2, 0][Math.floor(e.walkT * 11) % 4] : live && e.waveUntil > sim.time ? 5 : 0;   // four-step walk; pose 5 is a wave
    let y = e.y, angle = s.upright ? 0 : e.body.angle;
    if ((s.flies || s.swims) && (live || e.mountedBy) && !reduceMotion) y += Math.sin(sim.time * 5 + e.id) * 2.5;
    if (!e.placing && !(e.native && e.h > 400) && !s.swims) { if (s.floating || (s.flies && s.alive)) shadow(e.x, sim.groundBelow(e.x, e.y), Math.min(40, e.w * 0.3), 0.1); else if (s.upright || Math.abs(angle) < 0.2) shadow(e.x, e.y + e.h / 2, Math.min(90, e.w * 0.46), 0.22); }
    const g = e.goal, vy = e.body.velocity.y;
    let sy = 0;
    if (s.alive && !reduceMotion) {
      sy = 1 + Math.max(-0.1, Math.min(0.12, -vy * 0.02));
      if (live && !e.moving) sy += Math.sin(sim.time * 2.6 + e.id) * 0.018;                 // breathing
      if (live && e.moving && !s.flies && !s.swims) { y -= Math.abs(Math.sin(e.walkT * 14)) * 2.2; angle += e.facing * 0.045; }
      if (e.eatP > 0) sy += Math.sin(sim.time * 22) * 0.04;                                   // chewing
    }
    const k = L.zoom && (s.alive || s.wasAlive || s.carry) ? 1.28 : 1, ey = y + e.h / 2 * (1 - k);
    blit(s, e.x, y, { pose, id: e.id, angle, sy, k, flip: e.facing < 0, flipY: !!s.wasAlive, alpha: e.placing ? 0.62 : s.stealth ? 0.3 : e.flash > 0 ? 0.5 : 1 });
    if (e === sim.natives.goal && sim.won) { ctx.fillStyle = 'rgba(255,240,150,0.5)'; ctx.beginPath(); ctx.arc(e.x, e.y - e.h * 0.32, 34 + Math.sin(sim.time * 6) * 4, 0, 7); ctx.fill(); ctx.fillStyle = '#fff6b0'; ctx.fillRect(e.x - 9, e.y - e.h * 0.43, 18, 20); }
    if (s.alive || s.wasAlive) {
      const t = (live && g && g.t) || sim.player, dx = t.x - e.x, dy = t.y - e.y, d = Math.hypot(dx, dy) || 1;
      drawEyes(s, e.x, ey, e.facing, { k, flipY: !!s.wasAlive, lx: dx / d, ly: dy / d, closed: !live || blinking(e.id), happy: live && e.eatP > 0,
        wide: live && ((g && g.type === 'flee') || e.burning > 0 || e.flash > 0), angry: live && g && g.type === 'attack' });
      if (live && g && g.type === 'flee') label('!', e.x + e.facing * e.w * 0.3, e.y - e.h / 2 - 12 - Math.abs(Math.sin(sim.time * 9)) * 3, 22, P.red, SFXFONT);
      else if (live && g && g.type === 'follow' && Math.floor(sim.time * 0.5 + e.id) % 3 === 0) label('♥', e.x, e.y - e.h / 2 - 12, 13, P.red);
    }
    if (e.burning > 0) flames(e); else if (s.aflame && !e.doused) flames(e, true);
    if (e.fuse > 0) label(Math.ceil(e.fuse) + '', e.x, e.y - e.h / 2 - 14, 22, P.red, SFXFONT);
    if (s.alive && !s.frozen && e.asleepUntil > sim.time) label('Z z z', e.x + 12, e.y - e.h / 2 - 10 + Math.sin(sim.time * 2) * 3, 15, P.navy, SFXFONT);
    if (e.stunUntil > sim.time) { rough.ellipse(ctx, e.x, e.y, e.w / 2 + 6, e.h / 2 + 6, { r: R(e.id + 9), lw: 1.6 }); rough.line(ctx, [e.x - e.w / 2, e.y - 6, e.x + e.w / 2, e.y + 6], { r: R(e.id + 10), lw: 1.3 }); rough.line(ctx, [e.x - e.w / 2, e.y + 6, e.x + e.w / 2, e.y - 6], { r: R(e.id + 11), lw: 1.3 }); }
    if (e.eatP > 0 && e.goal && e.goal.t) { const t = e.goal.t; rough.line(ctx, [t.x - 14, t.y - t.h / 2 - 10, t.x - 14 + 28 * Math.min(1, e.eatP / (t.isParcel ? 1.1 : t.native ? 4.5 : Math.max(0.6, Math.min(3, t.w * t.h / 900)))), t.y - t.h / 2 - 10], { r: R(3), lw: 3.5, color: P.red, step: 99, amp: 0.2 }); }
  }

  const gearSpot = { wings: [0, -6, 1], jetpack: [-11, -2, 1], cape: [-9, 4, 1], balloon: [13, -44], umbrella: [9, -40], parachute: [0, -54], armor: [0, 0], pogo: [0, 14], skates: [0, 22], boots: [0, 22] };
  function drawHeld(p, back) {
    const e = p.held;
    if (!e) return;
    const spot = gearSpot[e.spec.noun], isBack = !!(spot && spot[2]);
    if (isBack !== back) return;
    const swing = e.useT > 0 ? Math.sin((0.25 - e.useT) / 0.25 * Math.PI) * 1.2 : 0;
    if (spot) blit(e.spec, p.x + p.facing * spot[0], p.y + spot[1], { id: e.id, flip: p.facing < 0 });
    else blit(e.spec, p.x + p.facing * (15 + swing * 6), p.y + 2 - swing * 4, { id: e.id, flip: p.facing < 0, angle: p.facing * (0.25 + swing) });
    if (e.spec.hot || e.spec.aflame) flames({ id: e.id, x: p.x + p.facing * 15, y: p.y - 16, w: 12, h: 12 }, true);
  }
  function starSeed(x, y, s) {
    ctx.fillStyle = 'rgba(255,236,140,0.35)'; ctx.beginPath(); ctx.arc(x, y, s * 1.9, 0, 7); ctx.fill();
    ctx.beginPath(); for (let i = 0; i < 10; i++) { const an = i / 10 * Math.PI * 2 - Math.PI / 2 + sim.time * 0.8, rr = i % 2 ? s * 0.5 : s * 1.1; ctx.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); }
    ctx.closePath(); ctx.fillStyle = '#ffe36a'; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.fill(); ctx.stroke();
  }
  function drawPlayer() {
    const p = sim.player;
    if (p.invuln > 0 && !sim.won && Math.floor(sim.time * 14) % 2) return;
    drawHeld(p, true);
    const pose = p.moving ? [1, 0, 2, 0][Math.floor(p.walkT * 12) % 4] : 0;
    const vy = p.mount ? 0 : p.body.velocity.y, hurt = p.invuln > 0 && !sim.won, k = p.scale * (L.zoom ? 1.28 : 1);
    const sy = reduceMotion ? 0 : 1 + Math.max(-0.12, Math.min(0.14, -vy * 0.022)) + (p.moving ? 0 : Math.sin(sim.time * 2.6) * 0.015);
    const bob = p.moving && !reduceMotion ? Math.abs(Math.sin(p.walkT * 15)) * 2.4 : 0;
    const yy = p.y + p.h / 2 - 30 - bob;                                   // sprite centre, feet on the ground at any size
    shadow(p.x, p.y + p.h / 2, 15 * k, p.grounded || p.mount ? 0.25 : 0.1);
    blit(heroSpec, p.x, yy, { pose, sy, k, flip: p.facing < 0, id: 1, angle: p.moving ? p.facing * 0.05 : 0, alpha: p.mods.stealth ? 0.35 : 1 });
    drawEyes(heroSpec, p.x, p.y + p.h / 2 - 30 * k - bob, p.facing, { k, lx: p.facing * 0.8, ly: Math.max(-0.6, Math.min(0.8, vy * 0.12)), closed: !hurt && blinking(1), happy: sim.won, wide: hurt || vy > 6 });
    if (p.hasParcel && !sim.won) starSeed(p.x - p.facing * 17 * k, p.y - 22 * k + Math.sin(sim.time * 3) * 3, 7);
    drawHeld(p, false);
  }

  function drawFx() {
    for (const f of sim.fx) {
      const k = f.age / f.life, a = Math.max(0, 1 - k);
      ctx.globalAlpha = a; u.globalAlpha = a;
      switch (f.type) {
        case 'puff': rough.ellipse(ctx, f.x, f.y, (f.size || 6) * (0.6 + k), (f.size || 6) * (0.6 + k), { r: R(f.x), fill: P[f.color] || P.white, lw: 1.8 }); break;
        case 'smoke': rough.ellipse(ctx, f.x, f.y, (f.size || 6) * (0.6 + k * 1.4), (f.size || 6) * (0.6 + k * 1.4), { r: R(f.x), fill: 'rgba(93,88,82,0.5)', lw: 0 }); break;
        case 'flame': rough.ellipse(ctx, f.x, f.y, (f.size || 8) * (1 - k * 0.6), (f.size || 8) * (1 - k * 0.6), { r: R(f.x), fill: k < 0.4 ? P.yellow : P.orange, lw: 1.8 }); break;
        case 'spark': ctx.fillStyle = P.yellow; ctx.beginPath(); ctx.arc(f.x, f.y, 2.5, 0, 7); ctx.fill(); break;
        case 'drop': case 'rain': ctx.strokeStyle = '#8fd0ff'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x - f.vx * 1.5, f.y - (f.vy || 3) * 1.4); ctx.stroke(); break;
        case 'star': { const pts = []; for (let i = 0; i < 10; i++) { const an = i / 10 * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? 4 : 9; pts.push(f.x + Math.cos(an) * rr, f.y + Math.sin(an) * rr); } rough.poly(ctx, pts, { r: R(f.life * 1000), fill: P.yellow, lw: 1.6, step: 99, amp: 0.4 }); break; }
        case 'note': label('♪', f.x, f.y, 22, P.purple); break;
        case 'text': label(f.text, f.x, f.y, 13); break;
        case 'speech': balloon(f.text, f.x, f.y, Math.min(1, a * 3)); break;
        case 'bang': burst(f.text, f.x, f.y - k * 10, Math.min(1, 0.4 + k * 5), Math.min(1, a * 2.5), Math.round(f.life * 1000 + f.x)); break;
        case 'splash': for (let i = -2; i <= 2; i++) rough.line(ctx, [f.x + i * 7, f.y, f.x + i * 13, f.y - 26 * k - 8 + Math.abs(i) * 5], { r: R(i + 40), lw: 2.4, color: '#8fd0ff', step: 99 }); break;
        case 'boom': for (let i = 0; i < 10; i++) { const an = i / 10 * Math.PI * 2, r0 = 12 + k * 30, r1 = 26 + k * 60; rough.line(ctx, [f.x + Math.cos(an) * r0, f.y + Math.sin(an) * r0, f.x + Math.cos(an) * r1, f.y + Math.sin(an) * r1], { r: R(i), lw: 3, color: i % 2 ? P.orange : P.yellow, step: 99 }); } break;
        case 'hit': for (let i = 0; i < 5; i++) { const an = i / 5 * Math.PI * 2 + 0.4; rough.line(ctx, [f.x + Math.cos(an) * 5, f.y + Math.sin(an) * 5, f.x + Math.cos(an) * 14, f.y + Math.sin(an) * 14], { r: R(i), lw: 2.2, step: 99 }); } break;
        case 'swing': { const pts = []; for (let i = 0; i <= 6; i++) { const an = (-1.1 + i / 6 * 2.2); pts.push(f.x + Math.cos(an) * 22 * f.dir, f.y + Math.sin(an) * 26); } rough.line(ctx, pts, { r: R(8), lw: 2.6, color: '#ffffff', step: 99 }); break; }
        case 'ring': rough.ellipse(ctx, f.x, f.y, 20 + k * 180, 20 + k * 120, { r: R(9), lw: 2, ink: '#ffffff' }); break;
        case 'zap': { const pts = [f.x, f.y]; const r = R(f.x2); for (let i = 1; i < 6; i++) pts.push(f.x + (f.x2 - f.x) * i / 6 + (r() - 0.5) * 22, f.y + (f.y2 - f.y) * i / 6 + (r() - 0.5) * 22); pts.push(f.x2, f.y2); rough.line(ctx, pts, { r, lw: 3, color: P.yellow, step: 99 }); break; }
        case 'flash': ctx.globalAlpha = a * 0.7; ctx.fillStyle = P.white; ctx.fillRect(cam.x, cam.y, WW, WH); break;
      }
      ctx.globalAlpha = 1; u.globalAlpha = 1;
    }
  }

  function bracket(e, color) {
    const x0 = e.x - e.w / 2 - 7, x1 = e.x + e.w / 2 + 7, y0 = Math.max(e.y - e.h / 2 - 7, cam.y + 8), y1 = Math.min(e.y + e.h / 2 + 7, cam.y + WH - 8), k = 9;
    u.strokeStyle = INK; u.lineCap = 'round'; u.lineJoin = 'round';
    for (const [lw, c] of [[5.5, INK], [2.6, color]]) {
      u.lineWidth = lw; u.strokeStyle = c; u.beginPath();
      u.moveTo(x0, y0 + k); u.lineTo(x0, y0); u.lineTo(x0 + k, y0); u.moveTo(x1 - k, y0); u.lineTo(x1, y0); u.lineTo(x1, y0 + k);
      u.moveTo(x1, y1 - k); u.lineTo(x1, y1); u.lineTo(x1 - k, y1); u.moveTo(x0 + k, y1); u.lineTo(x0, y1); u.lineTo(x0, y1 - k); u.stroke();
    }
    return y0;
  }
  function drawHints() {
    const p = sim.player, d = sim.dragging();
    if (selected && (selected.removed || (selected.isPlayer && false))) select(null);
    if (selected) { const y = bracket(selected, '#ffe36a'); label(selected.name, selected.x, y - 12, 13); }
    if (hover && !d && !hover.removed && hover !== selected) { const y = bracket(hover, '#ffffff'); label(hover.name, hover.x, y - 12, 13); }
    if (d) label(d.fresh ? d.name + ': click to place' : d.name, d.x, d.y - d.h / 2 - 18, 14);
    if (!started || sim.won) return;
    const t = sim.interactTarget();
    if (t && !d) label(t.spec.launcher ? 'E: launch' : t.spec.rideable && !t.spec.carry ? 'E: ride' : 'E: pick up', t.x, t.y - t.h / 2 - (hover === t || selected === t ? 44 : 16), 13, P.navy);
    else if (p.mount) label('E: hop off' + (p.mount.spec.breath ? '  ·  F: breathe fire' : ''), p.x, p.y - 44, 13, P.navy);
    else if (p.held && p.held.spec.use && sim.time - (p.heldSince || 0) < 4) label('F: use  ·  Q: drop', p.x, p.y - 46, 13, P.navy);
    if (!p.hasParcel && visible(L.depot.x, 200)) label('fresh star seeds here', L.depot.x, L.depot.y - 128, 13, P.red);
  }

  // every light in view: the ones baked into the scenery plus anything in the world that glows
  function collectLights() {
    const out = (layers.lights || []).filter((l) => visible(l.x, l.r + 40)).map((l) => (l.r < 30 && !reduceMotion ? Object.assign({}, l, { a: l.a * (0.55 + 0.45 * Math.sin(sim.time * 3 + l.x)) }) : l));   // small lights twinkle
    const p = sim.player, add = (x, y, r, color, a) => out.push({ x, y, r, color, a });
    if (layers.liveLights) for (const l of layers.liveLights(reduceMotion ? 0 : sim.time)) if (visible(l.x, l.r + 40)) out.push(l);
    for (const l of layers.skyLights || []) add(cam.x + l.x / Z, cam.y + l.y / Z, l.r / Z, l.color, l.a);   // the moon stays put on screen
    for (const e of sim.ents) {
      if (e.removed || e.placing) continue;
      const s = e.spec, x = e.heldBy ? p.x + p.facing * 15 : e.x, y = e.heldBy ? p.y - 10 : e.y;
      if (e.burning > 0 || (s.hot && !e.doused) || s.aflame) add(x, y, 130 + Math.min(140, e.w) + Math.sin(sim.time * 17 + e.id) * 8, '255,170,90', 1);
      else if (s.light) add(x, y, s.warm ? 560 : 140 + Math.min(110, e.w), s.tags.includes('crystal') ? '150,220,255' : '255,228,170', 0.95);
      if (s.portal) add(x, y, 100, '120,240,220', 0.7);
      if (s.custom === 'thorns' && !(e.burning > 0)) for (let ly = e.y + e.h / 2 - 70; ly > cam.y - 60; ly -= 150) add(e.x, ly, 70, '246,150,220', 0.28);
      if (s.tags.includes('ghost')) add(x, y, 96, '205,225,255', 0.62);
      if (s.strike) add(x, y, 420, '255,255,220', 1);
    }
    if (p.hasParcel && !sim.won) add(p.x - p.facing * 17, p.y - 22, 78, '255,236,150', 0.55);
    if (sim.won) add(L.goal.x, L.goal.y - 70, 300 + Math.sin(sim.time * 6) * 20, '255,240,170', 1);
    return out;
  }
  let lit = false;
  function drawLights() {
    const T = THEMES[L.theme];
    lit = !!T.ambient;
    if (!lit) return;
    const k = lmCv.width / VW;                                 // low resolution on purpose: it softens for free
    for (const [c, bg] of [[lm, T.ambient], [gl, '#000']]) { c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.fillStyle = bg; c.fillRect(0, 0, lmCv.width, lmCv.height); c.setTransform(k * Z, 0, 0, k * Z, -cam.x * k * Z, -cam.y * k * Z); c.globalCompositeOperation = 'lighter'; }
    for (const l of collectLights()) for (const c of [lm, gl]) {
      const g = c.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      g.addColorStop(0, `rgba(${l.color},${l.a})`); g.addColorStop(0.4, `rgba(${l.color},${l.a * 0.42})`); g.addColorStop(1, `rgba(${l.color},0)`);
      c.fillStyle = g; c.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
  }

  // ---- the renderer: scene x light map, plus bloom, grading and a vignette -----------
  let px = null, v2 = null;
  function initRenderer() {
    try {
      const app = new PIXI.Application({ view, width: cv.width, height: cv.height, autoStart: false, antialias: false, backgroundColor: 0x1f1a17 });
      const spr = (c) => { const sp = new PIXI.Sprite(PIXI.Texture.from(c)); sp.width = cv.width; sp.height = cv.height; return sp; };
      const scene = spr(cv), light = spr(lmCv), glowS = spr(glCv), ui = spr(uiCv);
      light.blendMode = PIXI.BLEND_MODES.MULTIPLY;
      const bloom = new PIXI.BlurFilter(12, 4); bloom.blendMode = PIXI.BLEND_MODES.ADD; glowS.filters = [bloom]; glowS.blendMode = PIXI.BLEND_MODES.ADD; glowS.alpha = 0.1;
      const vc = document.createElement('canvas'); vc.width = 256; vc.height = 144;
      const vg = vc.getContext('2d'), gr = vg.createRadialGradient(128, 72, 40, 128, 72, 160); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.7, '#f1ecf6'); gr.addColorStop(1, '#a79bbd'); vg.fillStyle = gr; vg.fillRect(0, 0, 256, 144);
      const vig = spr(vc); vig.blendMode = PIXI.BLEND_MODES.MULTIPLY;
      // a little paper grain over everything keeps flat colour from looking like plastic
      const nc = document.createElement('canvas'); nc.width = nc.height = 160; const ng = nc.getContext('2d'), nr = rng(5);
      for (let i = 0; i < 1500; i++) { ng.fillStyle = nr() > 0.5 ? 'rgba(20,16,40,0.035)' : 'rgba(255,250,235,0.035)'; ng.fillRect(nr() * 160, nr() * 160, 1 + nr() * 1.8, 1 + nr() * 1.8); }
      const grain = new PIXI.TilingSprite(PIXI.Texture.from(nc), cv.width, cv.height);
      const world = new PIXI.Container(); world.addChild(scene, light, glowS, vig, grain);
      const grade = new PIXI.ColorMatrixFilter(); grade.saturate(0.08, false); grade.contrast(0.05, true); world.filters = [grade];
      app.stage.addChild(world, ui);
      px = { app, scene, light, glowS, ui, vig };
    } catch (e) { console.warn('WebGL renderer unavailable, drawing without it:', e.message); px = null; v2 = view.getContext('2d'); view.width = cv.width; view.height = cv.height; }
  }
  function present() {
    if (px) {
      px.light.visible = px.glowS.visible = lit;
      for (const sp of [px.scene, px.light, px.glowS, px.ui]) sp.texture.baseTexture.update();
      px.app.renderer.render(px.app.stage);
    } else if (v2) {
      v2.globalCompositeOperation = 'source-over'; v2.drawImage(cv, 0, 0);
      if (lit) { v2.globalCompositeOperation = 'multiply'; v2.drawImage(lmCv, 0, 0, cv.width, cv.height); v2.globalCompositeOperation = 'lighter'; v2.globalAlpha = 0.3; v2.drawImage(glCv, 0, 0, cv.width, cv.height); v2.globalAlpha = 1; }
      v2.globalCompositeOperation = 'source-over'; v2.drawImage(uiCv, 0, 0);
    }
  }

  const perf = { scene: 0, lights: 0, present: 0 };
  function draw() {
    const k = cv.width / VW, t0 = performance.now();
    ctx.setTransform(k, 0, 0, k, 0, 0);
    u.setTransform(1, 0, 0, 1, 0, 0); u.clearRect(0, 0, uiCv.width, uiCv.height); u.setTransform(k * Z, 0, 0, k * Z, -cam.x * k * Z, -cam.y * k * Z);
    drawBackdrop();
    ctx.save();
    ctx.scale(Z, Z); ctx.translate(-cam.x, -cam.y);
    drawWorld();
    const list = sim.ents.slice().sort((a, b) => layerOf(a) - layerOf(b) || a.id - b.id);
    for (const e of list) if (layerOf(e) < 4) drawEnt(e);
    if (sim.player.mount) { drawEnt(sim.player.mount); drawPlayer(); }
    for (const e of list) if (layerOf(e) >= 4 && e !== sim.player.mount) drawEnt(e);
    if (!sim.player.mount) drawPlayer();
    if (layers.over) drawLayer(layers.over);   // railings and such, in front of the action
    if (layers.animate) layers.animate(ctx, reduceMotion ? 0 : sim.time, 'front', cam, WW, WH);
    drawWater();
    drawFx();
    drawHints();
    ctx.restore();
    // the panel border
    u.setTransform(k, 0, 0, k, 0, 0); u.strokeStyle = INK; u.lineWidth = 7; u.strokeRect(3.5, 3.5, VW - 7, VH - 7);
    const t1 = performance.now(); drawLights(); const t2 = performance.now(); present(); const t3 = performance.now();
    perf.scene += (t1 - t0 - perf.scene) * 0.1; perf.lights += (t2 - t1 - perf.lights) * 0.1; perf.present += (t3 - t2 - perf.present) * 0.1;   // rolling averages in ms, readable as NN.game.perf
  }

  // ---- loop -----------------------------------------------------------------
  let last = 0, acc = 0, capT = 0, smokeT = 0;
  const smoke = [];
  function frame(ts) {
    const dt = Math.min(0.1, (ts - last) / 1000 || 0); last = ts; acc += dt;
    if (!reduceMotion) boil = Math.floor(ts / 150) % 3;
    let steps = 0;
    while (acc >= 1 / 60 && steps < 4) {
      const p = sim.player, before = p.held;
      sim.step(started ? { left: keys.left, right: keys.right, up: keys.up, down: keys.down, jump: keys.jump, jumpPressed: pressed.jump, upPressed: pressed.up, interactPressed: pressed.interact, usePressed: pressed.use, dropPressed: pressed.drop } : {});
      if (p.held !== before) p.heldSince = sim.time;
      for (const kk in pressed) pressed[kk] = false;
      acc -= 1 / 60; steps++;
    }
    if (steps === 4) acc = 0;
    musicTick();
    // camera
    const p = sim.player, d = sim.dragging();
    if (d && mouse.inside) {
      if (mouse.sx < 70) cam.x -= 8; if (mouse.sx > VW - 70) cam.x += 8;
      if (mouse.sy < 50) cam.y -= 6; if (mouse.sy > VH - 50) cam.y += 6;
      cam.y = Math.max(L.sky - 120, Math.min(BASE, cam.y));
    } else {
      cam.x += (p.x - WW * 0.42 + p.facing * 40 - cam.x) * 0.08;
      const gy = sim.groundBelow(p.x, p.y - 30);                // keep whatever the hero stands on low in the frame, so high ground does not fill the screen with dirt
      cam.y += (Math.min(BASE, Math.max(L.sky - 120, Math.min(p.y - WH * 0.53, gy - WH * 0.84))) - cam.y) * 0.1;
    }
    cam.x = Math.max(0, Math.min(L.W - WW, cam.x));
    mouse.x = mouse.sx / Z + cam.x; mouse.y = mouse.sy / Z + cam.y;
    if (d) sim.dragTo(mouse.x, mouse.y);
    hover = d || !mouse.inside ? null : sim.pick(mouse.x, mouse.y, true);
    view.style.cursor = d ? 'grabbing' : hover ? (hover.native || hover.isPlayer ? 'pointer' : 'grab') : 'default';
    // chimney smoke
    smokeT -= dt; if (smokeT <= 0 && !reduceMotion) { smokeT = 0.5; for (const [ex, ey] of layers.emitters || []) if (visible(ex, 100)) smoke.push({ x: ex, y: ey, age: 0 }); }
    for (let i = smoke.length - 1; i >= 0; i--) { smoke[i].age += dt; if (smoke[i].age > 2.6) smoke.splice(i, 1); }
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
    if (capT > 0 && started) { capT -= dt; if (capT <= 0) $('cap').classList.remove('show'); }
    draw();
    requestAnimationFrame(frame);
  }

  // ---- page: HUD, captions, summoning and describing -------------------------------------------------
  function showToast(text) { const t = $('toast'); t.textContent = text; t.classList.add('show'); toastT = 4.6; }
  function updateHud() {
    if (!sim) return;
    const p = sim.player;
    $('hearts').textContent = '♥'.repeat(Math.max(0, p.hp)) + '♡'.repeat(Math.max(0, 3 - p.hp));
    $('parcel').textContent = p.hasParcel ? 'Star seed: safe' : 'Star seed: lost';
    $('parcel').classList.toggle('bad', !p.hasParcel);
    $('words').textContent = `Words: ${sim.words.length} (par ${L.par})`;
    $('page').textContent = `On the page: ${sim.spawnedCount()}/${sim.maxObjects}`;
    $('found').textContent = `${store.found.length} of ${NN.lexicon.nounCount}`;
    $('foundlist').textContent = store.found.length ? store.found.map(NN.lexicon.displayName).sort().join(', ') : 'Nothing yet. Every new thing you summon is written down here.';
  }
  function setMsg(text, suggestion) {
    const m = $('msg');
    m.textContent = text || '';
    if (suggestion) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'linkish'; b.textContent = `Did you mean "${suggestion}"?`;
      b.addEventListener('click', () => { $('word').value = suggestion; submit(suggestion); });
      m.appendChild(document.createTextNode(' ')); m.appendChild(b);
    }
  }
  function select(e) {
    selected = e || null;
    $('word').placeholder = selected ? `Describe the ${selected.name}: sleepy, tiny, friendly, flying…` : 'bridge, sleepy bear, hot air balloon…';
    $('wordlabel').textContent = selected ? 'Describe it' : 'Write a word';
    $('write').classList.toggle('describing', !!selected);
  }
  function submit(text) {
    if (!started) start();
    if (sim.won) return;
    const onlyAdj = NN.lexicon.onlyAdjectives(text);
    if (selected && onlyAdj) {
      const r = sim.describe(selected, text);
      if (!r.ok) { sfx('nope'); setMsg(r.error, r.suggestion); return; }
      setMsg(`Now it is a ${r.name}.`); $('word').value = ''; $('word').blur(); updateHud(); return;
    }
    if (!selected && onlyAdj) { sfx('nope'); setMsg('That is a describing word. Click a creature, a thing or Nib first, then write it.'); return; }
    summon(text);
  }
  function summon(text) {
    if (sim.dragging() && sim.dragging().fresh) sim.release();
    const p = sim.player, place = mouse.inside || coarse;
    const x = place ? mouse.x : p.x + p.facing * 70, y = place ? mouse.y : p.y - 110;
    const r = sim.spawn(text, x, y, place);
    if (!r.ok) { sfx('nope'); setMsg(r.error, r.suggestion); return; }
    if (!place) { const e = r.ent; sim.grab(e, true); sim.dragTo(p.x + p.facing * (e.w / 2 + 44), p.y - 110); sim.release(); }
    if (!store.found.includes(r.noun)) { store.found.push(r.noun); save(); }
    setMsg(place ? `"${r.name}" is ready. Click where you want it.` : `Summoned: ${r.name}.`);
    $('word').value = ''; $('word').blur();
    select(null); updateHud();
  }
  $('write').addEventListener('submit', (ev) => { ev.preventDefault(); const v = $('word').value.trim(); if (v) submit(v); });

  function onWin(res) {
    const pr = prog(L.id), nouns = [...new Set(res.words.map((w) => w.noun))];
    const stale = nouns.filter((n) => pr.used.includes(n));
    const stars = 1 + (res.words.length <= L.par ? 1 : 0) + (res.words.length <= L.par && !stale.length ? 1 : 0);
    $('stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    $('wintitle').textContent = res.words.length === 0 ? 'Beacon lit without a single word!' : res.words.length === 1 ? 'Beacon lit. One-word wonder!' : 'Beacon lit!';
    const lines = [];
    lines.push(res.words.length ? `You wrote ${res.words.length} word${res.words.length === 1 ? '' : 's'} in ${Math.round(res.time)} seconds: ${res.words.map((w) => w.name).join(', ')}.` : `Done in ${Math.round(res.time)} seconds.`);
    if (res.words.length > L.par) lines.push(`Second star: light it in ${L.par} words or fewer.`);
    else if (stale.length) lines.push(`Third star: ${L.par} words or fewer, none of them used in an earlier win here (${stale.map((n) => n.replace('adj:', '')).join(', ')}).`);
    else lines.push('All three stars. Those words are now spent for the third star in this world, so find another way.');
    if (res.parcelsLost) lines.push(`Star seeds lost along the way: ${res.parcelsLost}.`);
    $('winbody').textContent = lines.join(' ');
    for (const n of nouns) if (!pr.used.includes(n)) pr.used.push(n);
    pr.stars = Math.max(pr.stars, stars); save();
    $('next').hidden = nextWorld() < 0;
    $('win').hidden = false;
    ($('next').hidden ? $('again') : $('next')).focus();
    renderWorldPicker(); updateHud();
  }
  const nextWorld = () => NN.levels.findIndex((l, i) => i > levelIndex && !l.hidden);
  function renderWorldPicker() {
    const box = $('worlds'); box.textContent = ''; let num = 0;
    NN.levels.forEach((lv, i) => {
      if (lv.hidden) return;
      num++;
      const b = document.createElement('button'), st = prog(lv.id).stars;
      b.type = 'button'; b.className = 'btn world' + (i === levelIndex ? ' on' : '');
      b.textContent = `${num}. ${lv.name}  ${'★'.repeat(st)}${'☆'.repeat(3 - st)}`;
      b.addEventListener('click', () => { newGame(i); started = false; $('intro').hidden = false; });
      box.appendChild(b);
    });
  }
  function start() {
    started = true; $('intro').hidden = true;
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; } }
    if (ac && ac.state === 'suspended') ac.resume();
    musicInit();
  }
  $('start').addEventListener('click', () => { start(); view.focus(); });
  $('again').addEventListener('click', () => { newGame(); view.focus(); });
  $('next').addEventListener('click', () => { newGame(nextWorld()); view.focus(); });
  $('restart').addEventListener('click', () => { newGame(); setMsg('World reset.'); });
  $('pick').addEventListener('click', () => { started = false; $('intro').hidden = false; $('win').hidden = true; });
  $('clear').addEventListener('click', () => { sim.clearAll(); setMsg('Page cleared.'); });
  $('mute').addEventListener('click', () => { store.muted = !store.muted; save(); $('mute').textContent = store.muted ? 'Sound: off' : 'Sound: on'; if (mus) mus.out.gain.value = store.muted ? 0 : 1; });
  $('mute').textContent = store.muted ? 'Sound: off' : 'Sound: on';
  let hintI = 0;
  $('hint').addEventListener('click', () => { setMsg('Hint: ' + L.hints[hintI++ % L.hints.length]); });

  // ---- input -----------------------------------------------------------------
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const keymap = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', Space: 'jump', KeyE: 'interact', KeyF: 'use', KeyQ: 'drop' };
  window.addEventListener('keydown', (ev) => {
    const typing = document.activeElement === $('word');
    if (ev.code === 'Escape') { $('word').blur(); const d = sim.dragging(); if (d && d.fresh) sim.erase(d); select(null); return; }
    if (typing || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.code === 'Enter' || ev.code === 'KeyT' || ev.code === 'Slash') { if (document.activeElement && document.activeElement.tagName === 'BUTTON' && ev.code === 'Enter') return; ev.preventDefault(); $('word').focus(); return; }
    if ((ev.code === 'KeyX' || ev.code === 'Delete' || ev.code === 'Backspace') && (hover || sim.dragging())) { ev.preventDefault(); sim.erase(sim.dragging() || hover); return; }
    const k = keymap[ev.code];
    if (!k) return;
    if (document.activeElement && document.activeElement.tagName === 'BUTTON' && ev.code === 'Space') return;
    ev.preventDefault();
    if (!started) start();
    if (!keys[k]) pressed[k] = true;
    keys[k] = true;
  });
  window.addEventListener('keyup', (ev) => { const k = keymap[ev.code]; if (k) keys[k] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  function setMouse(ev) {
    const r = view.getBoundingClientRect();
    mouse.sx = (ev.clientX - r.left) * VW / r.width; mouse.sy = (ev.clientY - r.top) * VH / r.height;
    mouse.x = mouse.sx / Z + cam.x; mouse.y = mouse.sy / Z + cam.y; mouse.inside = true;
  }
  view.addEventListener('pointermove', (ev) => { setMouse(ev); if (sim.dragging()) sim.dragTo(mouse.x, mouse.y); });
  view.addEventListener('pointerleave', () => { if (!sim.dragging()) mouse.inside = false; });
  view.addEventListener('pointerdown', (ev) => {
    setMouse(ev);
    $('word').blur();
    if (!started) start();
    const d = sim.dragging();
    if (ev.button === 2) { sim.erase(d || sim.pick(mouse.x, mouse.y)); return; }
    if (d && d.fresh) { sim.dragTo(mouse.x, mouse.y); sim.release(); setMsg(''); return; }
    const e = sim.pick(mouse.x, mouse.y, true);
    mouse.downAt = { sx: mouse.sx, sy: mouse.sy, t: performance.now(), e };
    if (e && !e.native && !e.isPlayer && sim.grab(e)) { try { view.setPointerCapture(ev.pointerId); } catch (err) { /* older browsers */ } }
  });
  window.addEventListener('pointerup', () => {
    const d = sim.dragging(), dn = mouse.downAt;
    if (d && !d.fresh) sim.release();
    // a click that did not drag selects what was clicked, ready to be described
    if (dn && Math.hypot(mouse.sx - dn.sx, mouse.sy - dn.sy) < 6 && performance.now() - dn.t < 500) { select(dn.e && !dn.e.removed ? dn.e : null); if (dn.e) { sfx('pick'); if (!coarse) $('word').focus(); } }
    mouse.downAt = null;
  });
  view.addEventListener('contextmenu', (ev) => ev.preventDefault());
  for (const b of document.querySelectorAll('[data-key]')) {
    const k = b.dataset.key;
    const down = (ev) => { ev.preventDefault(); if (!started) start(); if (!keys[k]) pressed[k] = true; keys[k] = true; };
    const up = () => { keys[k] = false; };
    b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up);
  }

  // ---- boot -----------------------------------------------------------------
  function resize() { const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = uiCv.width = VW * dpr; cv.height = uiCv.height = VH * dpr; lmCv.width = glCv.width = VW / 2; lmCv.height = glCv.height = VH / 2; }
  resize();
  initRenderer();
  if (document.fonts && document.fonts.load) { document.fonts.load('20px Bangers'); document.fonts.load('bold 14px "Comic Neue"'); }
  newGame();
  requestAnimationFrame(frame);

  // for tests and the curious
  NN.game = { get sim() { return sim; }, get level() { return L; }, submit, summon, start, keys, pressed, cam, mouse, newGame, store, select, perf, get audio() { return { ac, mus }; } };
})(window.NN);
