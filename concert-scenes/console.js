// Light desk: wires the page's controls to the arena scene (window.__arena, window.__scene) and
// turns the monitor into a camera you can pan, zoom and fly between views with. Grab the
// satellite on the monitor to turn it in 3D.
(() => {
  const A = window.__arena, SC = window.__scene;
  if (!A || !SC) return;
  const { LX, LIVE, FIX, ORDER, CAMERA, ORB } = A;
  const S = SC.state, painter = SC.painter;
  const $ = id => document.getElementById(id);
  const press = (el, on) => el.setAttribute('aria-pressed', on ? 'true' : 'false');
  const wrap180 = a => ((((a + 180) % 360) + 360) % 360) - 180;

  // ---------- faders ----------
  const faders = [];
  function fader(id, get, set) {
    const inp = $(id), out = inp.parentElement.querySelector('output');
    const unit = inp.dataset.unit ?? '', step = +inp.step;
    const show = () => {
      const v = +inp.value;
      inp.style.setProperty('--fill', ((v - inp.min) / (inp.max - inp.min)) * 100 + '%');
      out.textContent = unit === '%' ? Math.round(v * 100) + '%' : unit === '×' ? v.toFixed(1) + '×' : (step >= 1 ? Math.round(v) : v.toFixed(step < 0.1 ? 2 : 1)) + unit;
    };
    inp.addEventListener('input', () => { set(+inp.value); show(); });
    const f = { sync() { const v = get(); if (v !== undefined && document.activeElement !== inp) inp.value = v; show(); } };
    f.sync();
    faders.push(f);
    return f;
  }
  const syncAll = () => faders.forEach(f => f.sync());

  // ---------- head selection ----------
  const BACK = FIX.map((f, i) => (f.back ? i : -1)).filter(i => i >= 0);
  const BAND = FIX.map((f, i) => (f.band ? i : -1)).filter(i => i >= 0);
  let sel = ORDER.slice();
  const selOf = k => (k === 'all' ? ORDER.slice() : k === 'back' ? BACK : k === 'band' ? BAND : [+k]);
  $('sel').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    sel = selOf(b.dataset.sel);
    $('sel').querySelectorAll('button').forEach(x => press(x, x === b));
    syncAll();
    markSwatch($('fx-col'), LIVE.rainbow ? 'rainbow' : LIVE.fx[sel[0]].col);
  });
  for (const k of ['beam', 'proj', 'laser', 'fan', 'burst']) fader('lv-' + k, () => LIVE.fx[sel[0]][k] || 0, v => sel.forEach(i => (LIVE.fx[i][k] = v)));

  // ---------- satellite ----------
  fader('yaw', () => Math.round(wrap180(LIVE.yaw)), v => (LIVE.yaw = v));
  fader('pitch', () => Math.round(LIVE.pitch), v => (LIVE.pitch = v));
  fader('roll', () => Math.round(wrap180(LIVE.rot)), v => (LIVE.rot = v));
  fader('turn', () => LIVE.turn, v => (LIVE.turn = v));
  fader('spin', () => LIVE.spin, v => (LIVE.spin = v));
  fader('tumble', () => LIVE.tumble, v => (LIVE.tumble = v));
  $('square').onclick = () => {
    Object.assign(LIVE, { yaw: 0, pitch: 0, rot: 0, turn: 0, spin: 0, tumble: 0, autoRot: 0 });
    A.resetMotion();
    syncAll();
  };
  // auto-rotate keeps its speed while off, so switching it back on resumes at the same pace
  let autoSpeed = 1;
  fader('auto-speed', () => autoSpeed, v => { autoSpeed = v; if (LIVE.autoRot > 0) LIVE.autoRot = v; });

  // ---------- aim, gobos, lasers ----------
  fader('tilt', () => LIVE.tilt, v => (LIVE.tilt = v));
  fader('tilt-scan', () => LIVE.tiltScan, v => (LIVE.tiltScan = v));
  fader('laser-tilt', () => LIVE.laserTilt, v => (LIVE.laserTilt = v));
  fader('laser-scan', () => LIVE.laserScan, v => (LIVE.laserScan = v));
  fader('gobo-zoom', () => LIVE.goboZoom, v => (LIVE.goboZoom = v));
  fader('gobo', () => LIVE.goboSpeed, v => (LIVE.goboSpeed = v));
  fader('spread', () => LIVE.fanSpread, v => (LIVE.fanSpread = v));
  fader('scan', () => LIVE.fanScan, v => (LIVE.fanScan = v));
  fader('twist', () => LIVE.fanTwist, v => (LIVE.fanTwist = v));
  fader('burst-n', () => LIVE.burstCount, v => (LIVE.burstCount = v));
  fader('burst-w', () => LIVE.burstSpread, v => (LIVE.burstSpread = v));
  fader('smoke', () => LIVE.smoke, v => (LIVE.smoke = v));
  fader('disperse', () => LIVE.disperse, v => (LIVE.disperse = v));
  const gp = $('gobo-pick');
  for (const name of [...A.GOBOS, 'mix']) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.gobo = name;
    b.textContent = name === 'mix' ? 'Mixed' : name;
    gp.append(b);
  }
  const syncGobo = () => gp.querySelectorAll('button').forEach(b => press(b, b.dataset.gobo === LIVE.gobo));
  gp.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    LIVE.gobo = b.dataset.gobo;
    // picking a pattern with no gobo light up brings the selected heads' gobos in
    if (sel.every(i => !(LIVE.fx[i].proj > 0))) sel.forEach(i => (LIVE.fx[i].proj = 1));
    syncGobo();
    syncAll();
  });
  syncGobo();
  const toggle = (id, get, set) => {
    const b = $(id);
    b.onclick = () => { set(!get()); press(b, get()); };
    const t = { sync: () => press(b, get()) };
    t.sync();
    faders.push(t);
  };
  toggle('prism', () => LIVE.prism > 0, on => (LIVE.prism = on ? 3 : 0));
  // groups of heads rigged on the ball (for the live desk and the shows alike)
  for (const g of ['ring', 'band', 'back']) toggle('grp-' + g, () => LIVE.groups[g], on => { LIVE.groups[g] = on; A.SHOW_GROUPS[g] = on; });
  toggle('auto-rot', () => LIVE.autoRot > 0, on => (LIVE.autoRot = on ? autoSpeed : 0));
  // strobe: the rate fader remembers its value while the strobe is off
  let strobeRate = 9;
  toggle('strobe-on', () => LIVE.strobe > 0, on => (LIVE.strobe = on ? strobeRate : 0));
  fader('strobe-rate', () => strobeRate, v => { strobeRate = v; if (LIVE.strobe > 0) LIVE.strobe = v; });
  fader('strobe-duty', () => LIVE.strobeDuty, v => (LIVE.strobeDuty = v));
  fader('strobe-frac', () => LIVE.strobeFrac, v => (LIVE.strobeFrac = v));
  fader('strobe-shuffle', () => LIVE.strobeShuffle, v => (LIVE.strobeShuffle = v));
  toggle('strobe-white', () => LIVE.strobeWhite, on => (LIVE.strobeWhite = on));
  toggle('strobe-reaim', () => LIVE.strobeReaim, on => (LIVE.strobeReaim = on));
  toggle('strobe-vary', () => LIVE.strobeVary, on => (LIVE.strobeVary = on));
  toggle('strobe-all', () => LIVE.strobeAll, on => (LIVE.strobeAll = on));
  $('strobe-burst').onclick = () => {
    // a ready-made look: every head on the burst only, white, strobing, the rig drifting
    ORDER.forEach(i => Object.assign(LIVE.fx[i], { beam: 0, proj: 0, laser: 0, fan: 0, burst: 1.2 }));
    Object.assign(LIVE, { strobe: strobeRate, strobeWhite: true, strobeReaim: true, burstCount: Math.max(LIVE.burstCount, 64), burstSpread: 12 });
    if (!(LIVE.autoRot > 0)) LIVE.autoRot = autoSpeed;
    syncAll();
  };
  toggle('spot-lock', () => LIVE.spotLock, on => (LIVE.spotLock = on));

  // ---------- colours ----------
  const PALETTE = [
    ['Teal', [40, 215, 205]], ['Amber', [255, 175, 70]], ['Magenta', [255, 80, 190]], ['Green', [80, 255, 120]],
    ['Red', [255, 50, 60]], ['Blue', [80, 120, 255]], ['Violet', [170, 90, 255]], ['White', [235, 240, 255]],
  ];
  const SPOTS = [['Cool', [120, 210, 218]], ['Warm', [255, 185, 110]], ['White', [240, 240, 232]], ['Rose', [255, 130, 190]], ['Blue', [130, 160, 255]]];
  const css = c => `rgb(${c.map(v => v | 0)})`;
  const same = (a, b) => Array.isArray(a) && Array.isArray(b) && a.every((v, i) => Math.abs(v - b[i]) < 1);
  function swatches(el, list, extra, pick) {
    for (const [name, c] of extra) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = c; b.title = name; b.setAttribute('aria-label', name); b.dataset.key = c;
      el.append(b);
    }
    for (const [name, c] of list) {
      const b = document.createElement('button');
      b.type = 'button'; b.title = name; b.setAttribute('aria-label', name); b.style.setProperty('--c', css(c)); b.dataset.rgb = c.join(',');
      el.append(b);
    }
    el.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      pick(b.dataset.key || b.dataset.rgb.split(',').map(Number));
      el.querySelectorAll('button').forEach(x => press(x, x === b));
    });
  }
  function markSwatch(el, v) {
    el.querySelectorAll('button').forEach(b => press(b, typeof v === 'string' ? b.dataset.key === v : !!b.dataset.rgb && same(b.dataset.rgb.split(',').map(Number), v)));
  }
  swatches($('fx-col'), PALETTE, [['Rainbow chase', 'rainbow']], v => {
    if (v === 'rainbow') { LIVE.rainbow = true; return; }
    LIVE.rainbow = false;
    sel.forEach(i => (LIVE.fx[i].col = v.slice()));
  });
  swatches($('spot-col'), SPOTS, [], v => (LIVE.spotCol = v.slice()));
  swatches($('eye-col'), PALETTE, [['Follow the rig', 'follow']], v => (LIVE.eyeCol = v === 'follow' ? null : v.slice()));
  const syncColours = () => {
    markSwatch($('fx-col'), LIVE.rainbow ? 'rainbow' : LIVE.fx[sel[0]].col);
    markSwatch($('spot-col'), LIVE.spotCol);
    markSwatch($('eye-col'), LIVE.eyeCol || 'follow');
  };
  syncColours();
  fader('spot', () => LIVE.spot, v => (LIVE.spot = v));
  fader('eye', () => LIVE.eye, v => (LIVE.eye = v));

  // ---------- crowd, camera, master ----------
  fader('crowd-light', () => LX.crowd, v => (LX.crowd = v));
  fader('crowd-speed', () => S.speed.audience ?? 1, v => (S.speed.audience = v));
  fader('crowd-energy', () => A.crowd.energy ?? 1, v => (A.crowd.energy = v));
  toggle('cam-on', () => CAMERA.on, on => (CAMERA.on = on));
  toggle('cam-ae', () => CAMERA.autoExpo, on => (CAMERA.autoExpo = on));
  fader('cam-glare', () => CAMERA.glare, v => (CAMERA.glare = v));
  fader('cam-flare', () => CAMERA.flare, v => (CAMERA.flare = v));
  fader('cam-dirt', () => CAMERA.dirt, v => (CAMERA.dirt = v));
  fader('cam-bloom', () => CAMERA.bloom, v => (CAMERA.bloom = v));
  fader('master', () => S.intensity, v => (S.intensity = v));
  fader('tempo', () => S.bpm, v => (S.bpm = v));

  // ---------- modes ----------
  const HASH = { paint: 'painting', show: 'showcase', live: 'live' };
  let showPlaying = true;
  function setMode(m, fromHash) {
    A.setMode(m);
    $('mode').querySelectorAll('button').forEach(b => press(b, b.dataset.mode === m));
    $('p-show').hidden = m !== 'show';
    $('p-live').hidden = m !== 'live';
    S.speed.lights = m === 'show' ? (showPlaying ? 1 : 0) : 1;
    if (m !== 'show') audio.pause();
    if (!fromHash && location.hash !== '#' + HASH[m]) history.replaceState(null, '', '#' + HASH[m]);
    if (m === 'live') { syncAll(); syncColours(); syncGobo(); }
  }
  $('mode').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.mode); });
  const fromHash = () => {
    const h = location.hash.slice(1);
    // no hash: keep whatever mode the page started in (e.g. ?live=... or ?show)
    setMode(h === 'live' ? 'live' : h === 'painting' ? 'paint' : h === 'showcase' ? 'show' : A.mode() === 'paint' ? 'show' : A.mode(), true);
  };
  window.addEventListener('hashchange', fromHash);

  // copy what's on screen (the showcase, or the painting) onto the live desk
  function takeOver() {
    Object.assign(LIVE, {
      yaw: wrap180(LX.yaw), pitch: LX.pitch, rot: wrap180(LX.rot), turn: 0, spin: 0, tumble: 0,
      tilt: LX.tilt, tiltScan: LX.tiltScan, laserTilt: LX.laserTilt, fanTwist: LX.fanTwist,
      gobo: LX.gobo, goboZoom: LX.goboZoom, prism: LX.prism, spot: LX.spot, spotCol: LX.spotCol.slice(), eye: LX.eye, eyeCol: null, rainbow: false,
      smoke: LX.smoke, disperse: LX.disperse,
    });
    FIX.forEach((f, i) => { if (!f.spot) Object.assign(LIVE.fx[i], { col: LX.col[i].map(v => Math.round(v)), ...LX.lv[i] }); });
    A.resetMotion();
    setMode('live');
  }
  $('take').onclick = takeOver;

  // ---------- showcase transport ----------
  const scrub = $('scrub'), chapters = $('chapters');
  function buildChapters() {
    chapters.textContent = '';
    scrub.max = A.SHOW_LENGTH;
    A.CHAPTERS.forEach(([name, t]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = name;
      b.style.left = (t / A.SHOW_LENGTH) * 100 + '%';
      if (t / A.SHOW_LENGTH > 0.8) b.classList.add('end'); // label hangs left of its mark near the end
      b.onclick = () => { S.clocks.lights = t + 0.01; if (LX.program === 'song' && audio.src) audio.currentTime = t + 0.01; };
      chapters.append(b);
    });
  }
  buildChapters();
  // ---------- your song: analyse a dropped audio file, then play it with the lights locked to it ----------
  const audio = new Audio();
  audio.preload = 'auto';
  let songName = '';
  const pickProgram = p => {
    A.setProgram(p);
    $('program').querySelectorAll('button').forEach(x => press(x, x.dataset.prog === p));
    S.clocks.lights = 0;
    if (p !== 'song') { audio.pause(); S.speed.lights = showPlaying ? 1 : 0; } // the song had the clock
    buildChapters();
  };
  $('program').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.prog === 'song' && !window.SONG) { $('song-file').click(); return; }
    pickProgram(b.dataset.prog);
    if (b.dataset.prog === 'song') playSong(0);
  });
  $('song-file').addEventListener('change', async () => {
    const f = $('song-file').files[0];
    if (!f) return;
    $('song-status').textContent = 'Analysing ' + f.name + '…';
    try {
      const cue = await window.analyzeSong(await f.arrayBuffer());
      window.SONG = cue;
      songName = f.name.replace(/\.[^.]+$/, '');
      if (audio.src) URL.revokeObjectURL(audio.src);
      audio.src = URL.createObjectURL(f);
      $('song-status').textContent = `${songName} · ${Math.round(cue.tempo)} BPM · ${Math.floor(cue.duration / 60)}:${String(Math.round(cue.duration % 60)).padStart(2, '0')}`;
      pickProgram('song');
      playSong(0);
    } catch (err) {
      $('song-status').textContent = 'Could not read that file as audio.';
    }
  });
  function playSong(t) {
    if (!audio.src) return;
    audio.currentTime = t;
    showPlaying = true;
    $('play').textContent = '❚❚';
    audio.play().catch(() => {});
  }
  // while a song plays, the light clock is the audio clock
  const songClock = () => {
    if (A.mode() === 'show' && LX.program === 'song' && audio.src) {
      S.speed.lights = 0;
      if (!audio.paused) S.clocks.lights = audio.currentTime;
    }
    requestAnimationFrame(songClock);
  };
  requestAnimationFrame(songClock);
  $('play').onclick = () => {
    showPlaying = !showPlaying;
    S.speed.lights = showPlaying ? 1 : 0;
    if (LX.program === 'song' && audio.src) { if (showPlaying) audio.play().catch(() => {}); else audio.pause(); }
    $('play').textContent = showPlaying ? '❚❚' : '▶';
    $('play').setAttribute('aria-label', showPlaying ? 'Pause showcase' : 'Play showcase');
  };
  let scrubbing = false;
  scrub.addEventListener('pointerdown', () => (scrubbing = true));
  window.addEventListener('pointerup', () => (scrubbing = false));
  scrub.addEventListener('input', () => { S.clocks.lights = +scrub.value; if (LX.program === 'song' && audio.src) audio.currentTime = +scrub.value; });
  function tickReadout() {
    if (A.mode() === 'show') {
      const t = ((S.clocks.lights % A.SHOW_LENGTH) + A.SHOW_LENGTH) % A.SHOW_LENGTH;
      if (!scrubbing) scrub.value = t;
      scrub.style.setProperty('--fill', (t / A.SHOW_LENGTH) * 100 + '%');
      $('time').textContent = `${t.toFixed(1)} / ${A.SHOW_LENGTH} s`;
      let ci = 0;
      A.CHAPTERS.forEach(([, ct], k) => { if (t >= ct) ci = k; });
      $('chapter-name').textContent = A.CHAPTERS[ci][0];
      chapters.querySelectorAll('button').forEach((b, k) => b.classList.toggle('on', k === ci));
    }
    requestAnimationFrame(tickReadout);
  }
  requestAnimationFrame(tickReadout);

  // ---------- look and motion ----------
  const setQuality = q => {
    $('quality').querySelectorAll('button').forEach(b => press(b, b.dataset.q === q));
    if (!painter) return;
    if (q === 'raw') S.paint = false;
    else { S.paint = true; painter.setScale(q === 'fast' ? 0.5 : 1, q === 'fast' ? 2 : 4); }
  };
  $('quality').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setQuality(b.dataset.q); });
  if (!painter) $('quality').querySelectorAll('button').forEach(b => (b.disabled = b.dataset.q !== 'raw'));
  $('motion').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    S.handmade = b.dataset.m === 'hand';
    $('motion').querySelectorAll('button').forEach(x => press(x, x === b));
  });

  // ---------- monitor camera: pan, zoom, views, and grabbing the satellite ----------
  const vp = $('vp'), cv = $('c'), zoomOut = $('zoom-val');
  const V = { s: 1, x: 0, y: 0 };
  let anim = null;
  const size = () => [vp.clientWidth, vp.clientHeight];
  function clampV(v) {
    const [w, h] = size();
    v.s = Math.min(6, Math.max(1, v.s));
    v.x = Math.min(0, Math.max(w - w * v.s, v.x));
    v.y = Math.min(0, Math.max(h - h * v.s, v.y));
    return v;
  }
  function apply() {
    clampV(V);
    cv.style.transform = `translate(${V.x}px, ${V.y}px) scale(${V.s})`;
    zoomOut.textContent = V.s.toFixed(1) + '×';
  }
  function zoomAt(px, py, s2) {
    const k = Math.min(6, Math.max(1, s2)) / V.s;
    V.x = px - (px - V.x) * k;
    V.y = py - (py - V.y) * k;
    V.s *= k;
    apply();
  }
  function flyTo(target, ms = 650) {
    const from = { ...V }, t0 = performance.now();
    cancelAnimationFrame(anim);
    const step = now => {
      const u = Math.min(1, (now - t0) / ms), e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
      V.s = from.s + (target.s - from.s) * e;
      V.x = from.x + (target.x - from.x) * e;
      V.y = from.y + (target.y - from.y) * e;
      apply();
      if (u < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }
  // a view: canvas point to centre on and how far in
  const VIEWS = { all: [768, 512, 1], orb: [763, 225, 3.2], stage: [766, 700, 2.6], crowd: [768, 880, 1.9], stands: [330, 300, 2.3] };
  function viewTarget(name) {
    const [cx, cy, s] = VIEWS[name], [w, h] = size(), k = w / cv.width;
    return clampV({ s, x: w / 2 - cx * k * s, y: h / 2 - cy * k * s });
  }
  $('views').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    $('views').querySelectorAll('button').forEach(x => press(x, x === b));
    flyTo(viewTarget(b.dataset.view));
  });
  const clearView = () => $('views').querySelectorAll('button').forEach(x => press(x, false));
  $('zoom-in').onclick = () => { const [w, h] = size(); clearView(); zoomAt(w / 2, h / 2, V.s * 1.4); };
  $('zoom-out').onclick = () => { const [w, h] = size(); clearView(); zoomAt(w / 2, h / 2, V.s / 1.4); };
  vp.addEventListener('wheel', e => {
    e.preventDefault();
    const r = vp.getBoundingClientRect();
    clearView();
    zoomAt(e.clientX - r.left, e.clientY - r.top, V.s * Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });
  vp.addEventListener('dblclick', e => { if (e.target === cv || e.target === vp) { clearView(); press($('views').querySelector('[data-view="all"]'), true); flyTo(viewTarget('all')); } });

  // monitor pixel → canvas pixel
  const toCanvas = (px, py) => { const k = vp.clientWidth / cv.width; return [(px - V.x) / V.s / k, (py - V.y) / V.s / k]; };
  const onOrb = (px, py) => { const [X, Y] = toCanvas(px, py); return ((X - ORB.x) / (ORB.rx * 1.25)) ** 2 + ((Y - ORB.y) / (ORB.ry * 1.25)) ** 2 < 1; };
  const pts = new Map();
  let drag = null;
  vp.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    const r = vp.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    vp.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, [px, py]);
    cancelAnimationFrame(anim);
    if (pts.size === 2) { const [a, b] = [...pts.values()]; drag = { pinch: true, d: Math.hypot(a[0] - b[0], a[1] - b[1]), s: V.s }; return; }
    if (onOrb(px, py)) {
      if (A.mode() !== 'live') takeOver();
      drag = { orb: true, px, py };
    } else drag = { pan: true, px, py, x: V.x, y: V.y };
    vp.classList.add('dragging');
  });
  vp.addEventListener('pointermove', e => {
    const r = vp.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    if (!drag) { vp.classList.toggle('grab-orb', onOrb(px, py)); return; }
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, [px, py]);
    if (drag.pinch && pts.size === 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      clearView();
      zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, drag.s * (d / drag.d));
    } else if (drag.orb) {
      // sideways turns the ball (its face follows the pointer), up-down tips it, shift rolls it
      const dx = px - drag.px, dy = py - drag.py;
      drag.px = px; drag.py = py;
      const k = 0.6 / V.s;
      if (e.shiftKey) LIVE.rot = wrap180(LIVE.rot + dx * k);
      else {
        LIVE.yaw = wrap180(LIVE.yaw - dx * k);
        LIVE.pitch = Math.max(-90, Math.min(90, LIVE.pitch + dy * k));
      }
      syncAll();
    } else if (drag.pan) {
      clearView();
      V.x = drag.x + (px - drag.px);
      V.y = drag.y + (py - drag.py);
      apply();
    }
  });
  const end = e => {
    pts.delete(e.pointerId);
    if (pts.size === 0) { drag = null; vp.classList.remove('dragging'); }
    else if (drag && drag.pinch) { const [p] = [...pts.values()]; drag = { pan: true, px: p[0], py: p[1], x: V.x, y: V.y }; }
  };
  vp.addEventListener('pointerup', end);
  vp.addEventListener('pointercancel', end);
  window.addEventListener('resize', apply);

  // ---------- start ----------
  if (matchMedia('(max-width: 760px)').matches) setQuality('fast');
  fromHash();
  apply();
})();
