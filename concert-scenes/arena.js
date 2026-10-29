// Arena scene: the painted bowl, crowd, satellite rig and its lights.
(() => {
  const W = 1536, H = 1024, TAU = CS.TAU, D2R = Math.PI / 180;
  const ORB = { x: 763, y: 219, rx: 84, ry: 77, ring: 66 };
  const STAGE = { x: 766, y: 770, rx: 221, ry: 13, d: 32 };
  const PERF = { x: 760, y: 772, s: 1.25 };
  let R = CS.rng(11);
  const rr = (a, b) => a + (b - a) * R();

  // Calibration knobs, tuned by hill-climbing SSIM against the reference painting.
  // `?tune={...}` overrides them for experiments.
  const TUNE = {
    beamGain: 1.3, beamScatter: 0.18, beamHalf: 1.14, halo: 0.03, pool: 0.85, overlay: 1, twinkle: 1.2,
    lightBase: 0.08, lightFill: 0.12, lightBeam: 0.3, tierL: 1.65, slabL: 1, farL: 1.1, nearL: 0.75,
    frontDark: 0.62, rampR: 0.75, rampG: 0.98, rampB: 1.05, liftR: 1, liftG: 4, liftB: 17, topAlpha: 0.9,
    rim: 0.75, b0: 0.93, b1: 0.4, b2: 1.135, b3: 0.83, b4: 1.36, b5: 1.25, b6: 0.775, stageGlow: 0.35,
    shirtL: 2.3, fog: 0.38, backLift: 0.12, soffitL: 0.6, fasciaL: 0.95, shadow: 0.6, floorHaze: 0.09, headL: 0.4, crowdTop: 0.55, crowdLight: 1,
  };
  try { Object.assign(TUNE, JSON.parse(new URLSearchParams(location.search).get('tune') || '{}')); } catch (e) {}

  // Fixtures on the orb's inner ring. Angles/half-widths/strengths measured from the
  // reference (screen degrees, clockwise from +x). The bottom can is the follow spot.
  // pa = where the can sits on the ring, a = where its beam points.
  // gain/p: beam brightness ≈ gain·(r/100)^-p, fitted to profiles along each reference beam.
  const FIX = [
    { pa: -150.7, a: -150, half: 6, len: 520, gain: 0.532, p: 1.093 },
    { pa: -26.6, a: -38.5, half: 8.5, len: 450, gain: 1.600, p: 1.500 },
    { pa: 17.4, a: 9, half: 6, len: 860, gain: 0.763, p: 1.190 },
    { pa: 41.5, a: 55.5, half: 9.5, len: 660, gain: 1.049, p: 1.500 },
    { pa: 90, a: 90, half: 10.5, len: 560, gain: 0.489, p: 0.614, spot: true },
    { pa: 139.3, a: 131, half: 6.5, len: 690, gain: 0.803, p: 1.500 },
    { pa: 164, a: 177, half: 5.5, len: 840, gain: 0.913, p: 1.196 },
    { pa: -90, a: -90, half: 4, len: 0 }, // top can, unlit
    // heads on the back of the sphere, aimed behind the performer at the far stands (pe: how far
    // round the back they sit, e: how steeply they aim away). The painting never shows them; they
    // come into view as the satellite turns.
    { pa: -135, a: -135, pe: 50, e: 52, half: 7, len: 700, gain: 0.6, p: 1.3, back: true, extra: true },
    { pa: -45, a: -45, pe: 50, e: 52, half: 7, len: 700, gain: 0.6, p: 1.3, back: true, extra: true },
    { pa: 45, a: 45, pe: 50, e: 52, half: 7, len: 700, gain: 0.6, p: 1.3, back: true, extra: true },
    { pa: 135, a: 135, pe: 50, e: 52, half: 7, len: 700, gain: 0.6, p: 1.3, back: true, extra: true },
    // an equator band between the front ring and the back four, so some head always faces any way
    // the ball is turned (all aimed along the ball's surface: e = pe)
    ...[22.5, 67.5, 112.5, 157.5, -157.5, -112.5, -67.5, -22.5].map(pa => ({ pa, a: pa, pe: 8, e: 8, half: 6.5, len: 700, gain: 0.7, p: 1.3, band: true, extra: true })),
  ];
  // the rig's groups, each switchable on the desk
  const groupOf = f => (f.back ? 'back' : f.band ? 'band' : 'ring');

  // ---------- live lighting controls ----------
  // Every fixture on the satellite carries four kinds of light, each on its own level:
  //   beam  - the wide haze cones of the painting
  //   proj  - a gobo projector: a cone split into spinning sub-beams that pattern what they hit
  //   laser - one hard line
  //   fan   - a multi-beam laser: a spread of lines that can breathe and scan
  // plus a colour, a rotation of the whole ring, and the follow spot as its own fader.
  // The showcase timeline (?show, or the button) drives them; otherwise the painting is untouched.
  const TEAL = [40, 215, 205];
  const DEFAULT_LV = { beam: 1, proj: 0, laser: 0, fan: 0, burst: 0 };
  const LX = {
    on: new URLSearchParams(location.search).has('show'), program: ['beams', 'song'].includes(new URLSearchParams(location.search).get('show')) ? new URLSearchParams(location.search).get('show') : 'main', rot: 0, spot: 1, spotCol: [120, 210, 218], goboSpin: 0, fanSpread: 24, fanScan: 0,
    eye: 1, eyeCol: TEAL.slice(), // the lamp facing the audience on the front of the satellite
    yaw: 0, pitch: 0, spotLock: true,   // 3D orientation (with rot = roll); the follow spot can keep tracking the stage
    gobo: 'dots', goboZoom: 17, prism: 0, // projector stencil ('mix': a different one per fixture), cone half-angle, 3-facet prism
    crowd: 0.7,                           // how strongly moving light lands on the crowd (the desk's fader, never animated)
    groups: { ring: true, band: true, back: true }, // which groups of heads are rigged (the desk's switches)
    // lasers aim on their own two axes: elevation out of the ring toward the audience (+) or away (-),
    // a scan across it, and the plane a multi-beam fan opens in (0: the ring's plane, 90: a sheet
    // raking from the far stands down to the people at the camera)
    laserTilt: 0, laserScan: 0, fanTwist: 0,
    burstCount: 44, burstSpread: 6, burstPh: 0, // burst: single beams evenly in every direction off the sphere, each wandering a little
    fireFrac: 1, fireWin: 0, // share of laser lines firing at once, and which draw of that share (changes as fireWin steps)
    smoke: 0, smokeT: 0,   // haze density (0 clear air .. 1 thick smoke the beams billow through) and its drift
    disperse: 0,           // prism dispersion: hairline red/blue fringes on beams and lasers, and lens fringing
    goboSeed: 0,           // shuffles which stencil each head carries when gobo is 'mix'
    projCol: null,         // the projectors' own colour (null: each head's colour)
    projAlpha: 1,          // how solid the projected light is (low: a translucent veil of pattern)
    gain: 1,               // programme-level brightness push on top of the master
    // every can is a moving head on the ring: it tilts out of the ring toward the audience (+) or
    // away (-), each by its own amount when tiltScan is up
    tilt: 0, tiltScan: 0, tiltPh: 0,
    col: FIX.map(() => TEAL.slice()), lv: FIX.map(() => ({ ...DEFAULT_LV })), label: '', labelA: 0,
  };
  const ease = x => x * x * (3 - 2 * x);
  const seg = (t, a, b) => ease(CS.clamp((t - a) / (b - a), 0, 1));
  const win = (t, a, b, f = 0.5) => seg(t, a, a + f) * (1 - seg(t, b - f, b)); // on between a and b
  const mixc = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  const hsl = (h, sat, l) => {
    const f = n => { const k = (n + h / 30) % 12, a = sat * Math.min(l, 1 - l); return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))); };
    return [f(0), f(8), f(4)];
  };
  // ring: left, up-left, up-right, right, down-right, down-left; then the back four; then the band
  const ORDER = [6, 0, 1, 2, 3, 5, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
  const SPOT_TEAL = [120, 210, 218], SPOT_AMBER = [255, 185, 110];
  const AMBER = [255, 175, 70], MAGENTA = [255, 80, 190], GREEN = [80, 255, 120], RED = [255, 50, 60], BLUE = [80, 120, 255], VIOLET = [170, 90, 255];

  // the follow spot's beam in the spot colour (a teal spot gives back the painting's beam colour)
  const spotBeamCol = () => mixc(TEAL, LX.spotCol, CS.clamp(Math.hypot(...LX.spotCol.map((v, k) => v - [120, 210, 218][k])) / 60, 0, 1));

  // The camera that took the picture. It reacts to light like a real one: a fixture aimed down the
  // lens veils the frame in its colour and flares (starburst, ghosts, lit-up dirt on the glass),
  // and auto-exposure pulls the rest of the frame down, then recovers.
  const CAMERA = { on: true, glare: 1, flare: 1, dirt: 0.7, bloom: 0.6, autoExpo: true };

  // Live desk: the console (or ?live={...}) sets these and they are applied every frame.
  const LIVE = {
    rot: 0, spin: 0, yaw: 0, turn: 0, pitch: 0, tumble: 0, spotLock: true,
    autoRot: 0, // auto-rotate speed (0 = off): the rig drifts round in all three axes on its own
    groups: { ring: true, band: true, back: true },
    smoke: 0, disperse: 0, // haze density and prism fringes on the live desk
    // strobe (rate 0 = off): gates the heads on and off; options for white flashes, re-aiming the
    // burst every flash, varying its density per flash, and flashing the spot and front lamp too
    strobe: 0, strobeDuty: 0.45, strobeWhite: true, strobeReaim: true, strobeVary: true, strobeAll: false,
    strobeFrac: 0.6, strobeShuffle: 0.1, // while strobing, only this share of laser lines fires, re-drawn every strobeShuffle seconds
    spot: 1, spotCol: [120, 210, 218], goboSpeed: 1.8, gobo: 'dots', goboZoom: 17, prism: 0, fanSpread: 26, fanScan: 14, rainbow: false,
    laserTilt: 0, laserScan: 20, fanTwist: 0, tilt: 0, tiltScan: 0, tiltSpeed: 0.8, burstCount: 44, burstSpread: 6, burstSpeed: 1,
    eye: 1, eyeCol: null, // null: follow the rig's colour
    fx: FIX.map(() => ({ col: TEAL.slice(), beam: 1, proj: 0, laser: 0, fan: 0, burst: 0 })),
  };
  {
    const q = new URLSearchParams(location.search).get('live');
    if (q !== null) {
      LX.on = true;
      LX.mode = 'live';
      try {
        const o = JSON.parse(q || '{}');
        for (const k of ['rot', 'spin', 'yaw', 'turn', 'pitch', 'tumble', 'spotLock', 'spot', 'spotCol', 'goboSpeed', 'gobo', 'goboZoom', 'prism', 'fanSpread', 'fanScan', 'rainbow', 'eye', 'eyeCol', 'laserTilt', 'laserScan', 'fanTwist', 'tilt', 'tiltScan', 'tiltSpeed', 'burstCount', 'burstSpread', 'burstSpeed', 'autoRot', 'strobe', 'strobeDuty', 'strobeWhite', 'strobeReaim', 'strobeVary', 'strobeAll', 'strobeFrac', 'strobeShuffle', 'groups', 'smoke', 'disperse']) if (k in o) LIVE[k] = o[k];
        if ('crowd' in o) LX.crowd = o.crowd;
        for (const k in CAMERA) if (k in o) CAMERA[k] = o[k];
        LIVE.fx.forEach((F, i) => { if (FIX[i].spot) return; for (const k of ['col', 'beam', 'proj', 'laser', 'fan', 'burst']) if (k in o) F[k] = Array.isArray(o[k]) ? o[k].slice() : o[k]; });
      } catch (e) {}
    }
  }
  // Speeds (spin, turn, gobo wheel, drifts) accumulate frame by frame, so moving a speed fader never
  // makes the rig jump.
  const ACC = { t: null, spin: 0, turn: 0, gobo: 0, tilt: 0, burst: 0, auto: 0, strobe: 0, shuffle: 0 };
  function liveAt(t) {
    const dt = ACC.t === null ? 0 : CS.clamp(t - ACC.t, 0, 0.2);
    ACC.t = t;
    ACC.spin += LIVE.spin * dt;
    ACC.turn += LIVE.turn * dt;
    ACC.gobo += LIVE.goboSpeed * dt;
    ACC.tilt += LIVE.tiltSpeed * dt;
    ACC.burst += LIVE.burstSpeed * dt;
    ACC.auto += LIVE.autoRot * dt;
    ACC.strobe += LIVE.strobe * dt;
    ACC.shuffle += dt / Math.max(0.02, LIVE.strobeShuffle);
    // auto-rotate: turning, nodding and rolling at once, at uneven rates so it never repeats exactly
    const au = ACC.auto, auto = LIVE.autoRot > 0 || au !== 0;
    LX.rot = LIVE.rot + ACC.spin + (auto ? 14 * au : 0);
    // tumble: a slow, uneven drift in yaw and pitch on top of the set orientation
    LX.yaw = LIVE.yaw + ACC.turn + (auto ? 22 * au + 18 * Math.sin(au * 0.31) : 0) + LIVE.tumble * (Math.sin(t * 0.37) * 0.8 + Math.sin(t * 0.13 + 1) * 0.4);
    LX.pitch = LIVE.pitch + (auto ? 32 * Math.sin(au * 0.53) + 12 * Math.sin(au * 1.37 + 1) : 0) + LIVE.tumble * (Math.sin(t * 0.29 + 2) * 0.6 + Math.sin(t * 0.11) * 0.3);
    LX.spotLock = LIVE.spotLock;
    LX.groups = LIVE.groups;
    LX.smoke = LIVE.smoke;
    LX.smokeT = t;
    LX.disperse = LIVE.disperse;
    LX.gain = 1;
    LX.projCol = null;
    LX.projAlpha = 1;
    LX.goboSeed = 0;
    LX.fireFrac = 1;
    LX.spot = LIVE.spot;
    LX.spotCol = LIVE.spotCol;
    LX.goboSpin = ACC.gobo;
    LX.gobo = LIVE.gobo;
    LX.goboZoom = LIVE.goboZoom;
    LX.prism = LIVE.prism;
    LX.fanSpread = LIVE.fanSpread * (0.65 + 0.35 * Math.sin(t * 1.4));
    LX.fanScan = LIVE.fanScan * Math.sin(t * 2.1);
    LX.laserTilt = LIVE.laserTilt;
    LX.laserScan = LIVE.laserScan * Math.sin(t * 0.9);
    LX.fanTwist = LIVE.fanTwist;
    LX.tilt = LIVE.tilt;
    LX.tiltScan = LIVE.tiltScan;
    LX.tiltPh = ACC.tilt;
    LX.burstCount = LIVE.burstCount;
    LX.burstSpread = LIVE.burstSpread;
    LX.burstPh = ACC.burst;
    FIX.forEach((f, i) => {
      const F = LIVE.fx[i];
      Object.assign(LX.lv[i], f.spot ? DEFAULT_LV : { beam: F.beam, proj: F.proj, laser: F.laser, fan: F.fan, burst: F.burst || 0 });
      LX.col[i] = f.spot ? spotBeamCol() : LIVE.rainbow ? hsl((t * 60 + i * 50) % 360, 0.95, 0.6) : F.col.slice();
    });
    LX.eye = LIVE.eye;
    LX.eyeCol = LIVE.eyeCol ? LIVE.eyeCol.slice() : rigColour();
    LX.fireFrac = LIVE.strobe > 0 ? LIVE.strobeFrac : 1;
    LX.fireWin = Math.floor(ACC.shuffle);
    if (LIVE.strobe > 0) {
      // the strobe gates the heads; each flash can re-aim the burst and pick its own density
      const n = Math.floor(ACC.strobe), on = ACC.strobe - n < LIVE.strobeDuty;
      const r = Math.sin(n * 91.7) * 43758.5453, rn = r - Math.floor(r);
      if (LIVE.strobeReaim) LX.burstPh = ACC.burst + n * 3.7;
      if (LIVE.strobeVary) LX.burstCount = Math.max(6, Math.round(LIVE.burstCount * (0.3 + 1.4 * rn)));
      FIX.forEach((f, i) => {
        if (f.spot) return;
        if (!on) Object.assign(LX.lv[i], { beam: 0, proj: 0, laser: 0, fan: 0, burst: 0 });
        else if (LIVE.strobeWhite) LX.col[i] = [240, 246, 255];
      });
      if (LIVE.strobeAll) { LX.spot *= on ? 1 : 0.06; LX.eye *= on ? 1 : 0; }
      if (!LIVE.eyeCol) LX.eyeCol = rigColour(); // a lamp following the rig follows the flashes
    }
    LX.label = '';
    LX.labelA = 0;
  }

  // the blend of what the ring is putting out, weighted by level (the front lamp follows it)
  function rigColour() {
    let w = 0;
    const c = [0, 0, 0];
    ORDER.forEach(i => { const L2 = LX.lv[i], k = Math.max(L2.beam, L2.proj, L2.laser, L2.fan, L2.burst) + 1e-3; w += k; for (let j = 0; j < 3; j++) c[j] += LX.col[i][j] * k; });
    return c.map(v => v / w);
  }

  // 30-second showcase. The satellite rolls once all the way round across it, turns a full circle
  // in yaw, tips and tumbles, and its heads tilt out of the ring: everything rides it in 3D.
  // amplitudes of the showcase's moves, tuned so heads cross the lens at chosen moments
  const SHOWP = { beamYaw: 85, beamPitch: -30, turnPitch: 18 };
  // Two programmes. 'main' is the full show (with a white strobe cut in before the finale);
  // 'beams' is beams only, choreographed to keep crossing the camera's lens.
  const STROBE = { at: 24.5, len: 4.5 };
  const SHOW_GROUPS = { ring: true, band: true, back: true }; // the desk can switch groups off for the shows too
  const PROGRAMS = { main: 30 + STROBE.len, beams: 20, get song() { return window.SONG ? window.SONG.duration : 30; } };
  function showAt(t) {
    LX.fireFrac = 1;
    LX.smoke = 0;
    LX.disperse = 0;
    LX.gain = 1;
    LX.goboSeed = 0;
    LX.projCol = null;
    LX.projAlpha = 1;
    LX.groups = SHOW_GROUPS;
    if (LX.program === 'beams') { beamsAt(t); return; }
    if (LX.program === 'song') { songAt(t); return; }
    const L = PROGRAMS.main;
    t = ((t % L) + L) % L;
    const inStrobe = t >= STROBE.at && t < STROBE.at + STROBE.len;
    mainAt(t < STROBE.at ? t : inStrobe ? STROBE.at : t - STROBE.len);
    if (inStrobe) strobeAt(t - STROBE.at);
  }

  // White strobe: every head throws the burst in white and flashes, faster and faster; each flash
  // re-aims the whole spray and the density climbs in steps, the rig snapping round on the beat.
  const STROBE_DENSITY = [10, 24, 48, 96, 160];
  function strobeAt(u) {
    const beats = (u * 84) / 60;
    // flash rate: sixteenths, then sixteenth triplets, then thirty-seconds
    const div = u < 1.2 ? 4 : u < 3 ? 6 : 8, ph = beats * div, n = Math.floor(ph), on = ph - n < 0.5;
    const step = Math.min(STROBE_DENSITY.length - 1, Math.floor(u / 0.9));
    const R1 = Math.sin(n * 91.7) * 43758.5453, r1 = R1 - Math.floor(R1);
    LX.burstCount = Math.round(STROBE_DENSITY[step] * (0.75 + 0.5 * r1));
    LX.burstSpread = 14;
    LX.burstPh = n * 3.7;
    // only 60% of the spray fires at once, and which 60% changes every tenth of a second
    LX.fireFrac = 0.6;
    LX.fireWin = Math.floor(u / 0.1);
    const env = seg(u, 0, 0.15) * (1 - seg(u, STROBE.len - 0.15, STROBE.len));
    ORDER.forEach(i => {
      Object.assign(LX.lv[i], { beam: 0, proj: 0, laser: 0, fan: 0, burst: on ? 1.3 * env : 0 });
      LX.col[i] = [240, 246, 255];
    });
    // the rig snaps to a new orientation on every eighth note and holds there
    const b8 = beats * 2, k8 = Math.floor(b8), snap = ease(Math.min(1, (b8 - k8) * 3));
    LX.yaw = 45 * (k8 + snap);
    LX.pitch = 25 * Math.sin(k8 * 2.1) * (1 - snap) + 25 * Math.sin((k8 + 1) * 2.1) * snap;
    LX.tilt = 0;
    LX.tiltScan = 0;
    LX.spot = on ? 0.7 : 0.08;
    LX.spotCol = [235, 240, 255];
    LX.col[4] = spotBeamCol();
    LX.eye = on ? 1 : 0;
    LX.eyeCol = [240, 246, 255];
    LX.label = 'WHITE STROBE  \u00b7  dense lasers, density climbing';
    LX.labelA = win(u, 0.1, STROBE.len - 0.1, 0.3);
  }

  // Second programme: only the haze beams, swung so they cross the lens again and again; the
  // camera flares, veils, stops down, recovers. Keys are (time, yaw, pitch); each crossing is
  // placed mid-move, where it is fastest (orientations found with the lens search).
  const BEAM_KEYS = [
    [0, 0, 0], [2.0, 0, 0], [2.9, 10, -67], [4.0, 62, -67], [5.6, -70, -64], [6.4, -110, -20], [7.4, -135, 8],
    [8.8, -175, 8], [9.8, -215, 8], [10.6, -250, -10], [14.0, -330, -25], [17.4, -400, 10], [20, -360, 0],
  ];
  const BEAM_SPOT = [
    [0, [200, 225, 255], 1], [2.0, [200, 225, 255], 1], [2.8, [255, 226, 180], 1.25], [5.6, [255, 226, 180], 1.2],
    [6.4, [255, 140, 70], 0.6], [9.8, [255, 140, 70], 0.7], [10.6, [130, 160, 255], 1], [13.8, [130, 160, 255], 1],
    [14.4, [255, 120, 200], 1.2], [17.2, [255, 120, 200], 1.1], [18.4, [120, 210, 218], 1], [20, [120, 210, 218], 1],
  ];
  const keyed = (keys, t) => {
    let k = 0;
    while (k < keys.length - 2 && t > keys[k + 1][0]) k++;
    const a = keys[k], b = keys[k + 1], u = ease(CS.clamp((t - a[0]) / (b[0] - a[0]), 0, 1));
    return a.slice(1).map((v, j) => (Array.isArray(v) ? mixc(v, b[j + 1], u) : v + (b[j + 1] - v) * u));
  };
  function beamsAt(t) {
    const L = PROGRAMS.beams;
    t = ((t % L) + L) % L;
    let label = '', la = 0;
    const cap = (txt, a, b) => { if (t >= a && t < b) { label = txt; la = win(t, a, b); } };
    const [yaw, pitch] = keyed(BEAM_KEYS, t);
    const tum = win(t, 14, 17.4, 0.6);
    LX.yaw = yaw + 25 * Math.sin(t * 2.3) * tum;
    LX.pitch = pitch + 30 * Math.sin(t * 1.7 + 1) * tum;
    LX.rot = 360 * seg(t, 10.6, 19.6);
    LX.tilt = 30 * win(t, 10.6, 14, 0.6);
    LX.tiltScan = 18 * win(t, 10.6, 17.4, 0.6);
    LX.tiltPh = t * 1.5;
    LX.spotLock = true;
    const [sc, sl] = keyed(BEAM_SPOT, t);
    LX.spotCol = sc;
    LX.spot = sl;
    const beat = (t * 84) / 60;
    for (let i = 0; i < FIX.length; i++) { LX.col[i] = TEAL.slice(); Object.assign(LX.lv[i], DEFAULT_LV); }
    const warm = win(t, 2.0, 5.8, 0.6), turn = win(t, 5.6, 10.2, 0.6), rake = win(t, 10.2, 14.2, 0.6), all = win(t, 14, 17.8, 0.6);
    ORDER.forEach((i, k) => {
      let c = TEAL.slice();
      c = mixc(c, k % 2 ? [255, 175, 70] : [255, 225, 160], warm);
      c = mixc(c, FIX[i].back ? [215, 235, 255] : [255, 80, 190], turn);
      c = mixc(c, k % 2 ? [120, 100, 255] : [80, 150, 255], rake);
      c = mixc(c, hsl(((t - 14) * 110 + k * 36) % 360, 0.95, 0.6), all);
      LX.col[i] = c;
      const pk = 0.5 + 0.5 * Math.cos((beat + k / ORDER.length) * TAU);
      LX.lv[i].beam = 1 - (rake + all) * 0.6 * (1 - pk * pk);
    });
    const bandK = win(t, 2.0, 17.8, 0.6);
    FIX.forEach((f, i) => { if (f.band) for (const k in LX.lv[i]) LX.lv[i][k] *= bandK; });
    LX.col[4] = spotBeamCol();
    LX.eyeCol = rigColour();
    LX.eye = 1;
    cap('BEAMS AND THE CAMERA', 0.2, 1.9);
    cap('INTO THE LENS  \u00b7  flare, veil, exposure pulling down', 2.1, 5.7);
    cap('FROM BEHIND  \u00b7  the back heads find the camera', 5.9, 9.9);
    cap('RAKING THE CROWD  \u00b7  heads tilted toward us', 10.1, 13.9);
    cap('TUMBLE', 14.1, 17.3);
    cap('BACK TO THE PAINTING', 17.6, 19.9);
    LX.label = label;
    LX.labelA = la;
  }

  // ---------- music ----------
  // A cue sheet in window.SONG (analyze_song.py, or the desk's own analysis of a dropped file):
  // beats, downbeats, sections ranked by energy, and loudness/bands per frame. The song programme:
  // calm and still until the song's loudest section (a white spot, a few dim teal heads leaning to
  // the audience, breathing with the music; dimmer through the quiet stretch), then the peak is the
  // birth of the cosmos (white strobe, a random share of a white spray, random gobos through a prism
  // over the crowd, thick smoke, hairline spectra, the ball tumbling), then it settles home.
  const bsearch = (a, t) => { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] <= t) lo = m + 1; else hi = m; } return lo - 1; };
  const songPeak = C => C.sections.reduce((m, s, i, a) => (s.energy > a[m].energy ? i : m), 0);
  // the ball through the peak: starts square on, tumbles, and keeps turning
  function cosmosRig(t, P) {
    const u = t - P.t0, r = seg(t, P.t0, P.t0 + 3);
    return [
      (360 * u) / 26 + 35 * Math.sin(u * 0.53) * r,
      (-12 + 18 * Math.sin(u * 0.61 + 0.4)) * r, // mostly inside the follow spot's reach
      (360 * u) / 17,
    ];
  }
  function songAt(t) {
    const C = window.SONG;
    if (!C || !C.sections || !C.sections.length) { mainAt(((t % 30) + 30) % 30); return; }
    t = ((t % C.duration) + C.duration) % C.duration;
    const fi = Math.min(C.rms.length - 1, Math.floor(t * C.fps));
    const en = C.energy[fi], hi = C.high[fi], lo = C.low[fi];
    const bi = Math.max(0, bsearch(C.beats, t)), b0 = C.beats[bi] ?? 0, b1 = C.beats[bi + 1] ?? b0 + 60 / C.tempo;
    const bph = CS.clamp((t - b0) / Math.max(0.05, b1 - b0), 0, 1), kick = Math.exp(-bph * 5) * (0.35 + 0.65 * lo);
    const di = Math.max(0, bsearch(C.downbeats, t));
    const pk = songPeak(C), P = C.sections[pk];
    const si = Math.max(0, C.sections.findIndex(s => t >= s.t0 && t < s.t1));
    const S0 = C.sections[si];
    for (let i = 0; i < FIX.length; i++) { LX.col[i] = TEAL.slice(); Object.assign(LX.lv[i], DEFAULT_LV, { beam: FIX[i].spot ? 1 : 0 }); }
    LX.spotLock = true;
    LX.tiltScan = 0;
    LX.tiltPh = t;
    LX.laserTilt = 0;
    LX.prism = 0;
    LX.label = '';
    LX.labelA = 0;
    const WHITE = [236, 241, 250];
    if (t < P.t0) {
      // calm: the rig square on and still; a white spot; the ring heads a soft teal leaning toward
      // the audience, breathing with the music; the quiet stretch before the peak dims everything
      LX.yaw = LX.pitch = LX.rot = 0;
      LX.tilt = 14;
      // how "quiet" we are: sections ranked lowest, smoothed in and out over a couple of seconds
      const quietAt = x => { const s = C.sections.find(q => x >= q.t0 && x < q.t1); return s && s.level === 0 ? 1 : 0; };
      let q = 0;
      for (let k = -4; k <= 4; k++) q += quietAt(t + k * 0.5) / 9;
      const chorus = S0.level >= 2 ? 1 : 0;
      const base = (0.16 + 0.1 * chorus + 0.18 * en) * (1 - 0.8 * q);
      ORDER.forEach(i => { if (groupOf(FIX[i]) === 'ring') { LX.lv[i].beam = base; LX.col[i] = TEAL.slice(); } });
      LX.spot = (1 - 0.4 * q) * (1 - seg(t, P.t0 - 0.35, P.t0 - 0.05)); // a breath of darkness right before the drop
      LX.spotCol = WHITE;
      LX.eye = 0.35 + 0.25 * en;
      LX.eyeCol = [150, 225, 220];
      LX.smoke = 0.25 * q;
    } else if (t < P.t1) {
      // the birth of the cosmos
      const [yw, pt, rl] = cosmosRig(t, P);
      LX.yaw = yw; LX.pitch = pt; LX.rot = rl;
      LX.tilt = 30;
      LX.tiltScan = 14;
      LX.tiltPh = t * 0.9;
      LX.smoke = 0.95;
      LX.disperse = 1;
      LX.gain = 1.2;
      const hit = 1 - seg(t, P.t0, P.t0 + 0.5); // the first downbeat lands as a white flash
      // strobe on sixteenths; a random 60% of the spray fires, re-drawn every tenth of a second
      const beats16 = (t - P.t0) * (C.tempo / 60) * 4, n = Math.floor(beats16), on = beats16 - n < 0.5;
      const R1 = Math.sin(n * 91.7) * 43758.5453, r1 = R1 - Math.floor(R1);
      LX.burstCount = Math.round((40 + 100 * hi) * (0.7 + 0.6 * r1));
      LX.burstSpread = 14;
      LX.burstPh = n * 3.7;
      LX.fireFrac = 0.6;
      LX.fireWin = Math.floor(t / 0.1);
      LX.gobo = 'mix';
      LX.goboSeed = di;               // new stencils every bar
      LX.goboZoom = 22;
      LX.prism = 3;
      LX.goboSpin = t * 2.4;
      // the projections: a pale, translucent light brown drifting through warm tones
      const wt = [[214, 172, 128], [222, 160, 150], [226, 196, 140], [200, 168, 140]], wu = ((t - P.t0) / 6) % wt.length, wk = Math.floor(wu);
      LX.projCol = mixc(wt[wk], wt[(wk + 1) % wt.length], ease(wu - wk));
      LX.projAlpha = 0.42;
      const silver = [[240, 244, 255], [205, 210, 222], [255, 249, 238]];
      ORDER.forEach((i, k) => {
        LX.col[i] = silver[k % 3];
        LX.lv[i].beam = (0.25 + 0.55 * kick) * (FIX[i].back ? 0.7 : 1) + 1.2 * hit;
        LX.lv[i].proj = FIX[i].back ? 0 : 1.05 + 0.45 * kick;
        LX.lv[i].burst = on ? 1.25 : 0;
      });
      // she stays a small figure under it all: the spot drops to about half, breathing with the kick
      LX.spot = 0.48 + 0.14 * kick;
      LX.spotCol = [214, 220, 232];
      LX.eye = on ? 1 : 0.2;
      LX.eyeCol = WHITE;
    } else {
      // after the peak: the smoke hangs, the strobe is gone, the ball turns home, the spot holds her
      const [yw, pt, rl] = cosmosRig(P.t1, P), h = seg(t, P.t1, Math.min(C.duration, P.t1 + 9));
      const home = v => Math.round(v / 360) * 360;
      LX.yaw = yw + (home(yw) - yw) * h;
      LX.pitch = pt * (1 - h);
      LX.rot = rl + (home(rl) - rl) * h;
      LX.tilt = 30 * (1 - h) + 14 * h;
      LX.tiltScan = 14 * (1 - h);
      LX.tiltPh = t * 0.9;
      LX.smoke = 0.95 * (1 - seg(t, P.t1, P.t1 + 12));
      LX.disperse = 1 - seg(t, P.t1, P.t1 + 4);
      const fade = 1 - seg(t, C.duration - 6, C.duration);
      ORDER.forEach((i, k) => {
        LX.col[i] = mixc([236, 241, 250], TEAL, h);
        LX.lv[i].beam = FIX[i].extra ? 0.3 * (1 - h) : (0.3 + 0.2 * en) * fade;
      });
      LX.spot = 1 * Math.max(0.35, fade);
      LX.spotCol = WHITE;
      LX.eye = 0.4 * fade;
      LX.eyeCol = [150, 225, 220];
    }
    LX.smokeT = t;
    LX.col[4] = spotBeamCol();
  }

  function mainAt(t) {
    let label = '', la = 0;
    const cap = (txt, a, b) => { if (t >= a && t < b) { label = txt; la = win(t, a, b); } };
    for (let i = 0; i < FIX.length; i++) { LX.col[i] = TEAL.slice(); Object.assign(LX.lv[i], DEFAULT_LV); }
    LX.rot = 360 * seg(t, 2.5, 28.6);
    LX.spotLock = true;
    // a full turn in yaw brings the heads on the back round to face us; another in the finale
    const turn = 360 * seg(t, 6.7, 10.3) + 360 * seg(t, 24.8, 28.1);
    LX.yaw = turn
      + SHOWP.beamYaw * Math.sin((t - 2.5) * 1.3) * win(t, 2.6, 6.6, 0.6) // beams sweep left-right
      + 30 * Math.sin((t - 10.5) * 0.9) * win(t, 10.6, 15.4, 0.6)  // gobos slide across the crowd
      + 50 * Math.sin((t - 15.5) * 1.6) * win(t, 15.6, 19.4, 0.5); // lasers swing
    LX.pitch = SHOWP.beamPitch * win(t, 2.6, 6.6, 0.8)              // tipped toward the audience
      + SHOWP.turnPitch * win(t, 7.4, 9.9, 0.6)                     // a back head looks down the lens mid-turn
      + 18 * Math.sin((t - 10.5) * 1.4) * win(t, 10.6, 15.4, 0.6)
      + 35 * Math.sin((t - 24.5) * 2.2) * win(t, 24.6, 28.2, 0.5);
    // heads tilt out of the ring: toward us for the beams, away onto the stands for the gobos,
    // steeply toward us for the laser ceiling
    LX.tilt = 25 * win(t, 2.6, 6.6, 0.8) - 22 * win(t, 10.6, 15.4, 0.6) + 45 * win(t, 19.6, 24.4, 0.6);
    LX.tiltScan = 15 * win(t, 2.6, 6.6) + 12 * win(t, 24.6, 28.2);
    LX.tiltPh = t * 1.2;
    LX.laserTilt = (5 + 35 * Math.sin((t - 15.5) * 1.5)) * win(t, 15.6, 19.6, 0.4);
    LX.laserScan = 15;
    LX.fanTwist = 70 * seg(t, 22, 23.5);
    // the follow spot has its own story: cool white, a hot warm push for the beams, out while the
    // rig turns and back deep amber, rose under the gobos, cold blue for the lasers, green-white for
    // the fans, cycling on the beat at the end, home to the painting's teal
    const SPOT_KEYS = [
      [0, [200, 225, 255], 1], [2.4, [200, 225, 255], 1], [3.2, [255, 226, 180], 1.3], [6.4, [255, 226, 180], 1.25],
      [9.5, [255, 130, 60], 1.35], [10.4, [255, 140, 70], 1.2], [11.2, [255, 120, 200], 1], [15.2, [255, 120, 200], 1],
      [16, [130, 160, 255], 0.95], [19.3, [130, 160, 255], 0.95], [20, [180, 255, 200], 1.05], [24.3, [180, 255, 200], 1.05],
      [28.4, [120, 210, 218], 1], [30, [120, 210, 218], 1],
    ];
    let kk = 0;
    while (kk < SPOT_KEYS.length - 2 && t > SPOT_KEYS[kk + 1][0]) kk++;
    const [ta, ca, la0] = SPOT_KEYS[kk], [tb, cb, lb0] = SPOT_KEYS[kk + 1], ku = ease(CS.clamp((t - ta) / (tb - ta), 0, 1));
    LX.spotCol = mixc(ca, cb, ku);
    // out while the rig turns, back with a punch
    LX.spot = (la0 + (lb0 - la0) * ku) * (1 - seg(t, 6.9, 7.6) + seg(t, 9.6, 10.2));
    LX.goboSpin = t * 1.8;
    LX.gobo = ['dots', 'rings', 'breakup', 'star'][CS.clamp(Math.floor((t - 10.5) / 1.25), 0, 3)];
    LX.goboZoom = 17;
    LX.prism = t > 14.3 && t < 15.6 ? 3 : 0;
    LX.fanSpread = 14 + 30 * (0.5 + 0.5 * Math.sin(t * 1.4));
    LX.fanScan = 12 * Math.sin(t * 2.1);
    const beat = (t * 84) / 60;

    cap('LIVE PROCEDURAL LIGHTING', 0.2, 2.4);

    cap('BEAMS  ·  swinging through the arena in 3D', 2.6, 6.5);
    ORDER.forEach((i, k) => { LX.lv[i].beam = 1 - 0.7 * win(t, 2.8, 6.4) * (0.5 + 0.5 * Math.cos(t * 4 - k * 0.9)); });
    // the teal of the painting gives way: ice blue to violet to magenta across the ring
    const beamsCol = win(t, 2.7, 6.8, 0.9);
    ORDER.forEach((i, k) => { LX.col[i] = mixc(LX.col[i], [[90, 140, 255], [140, 100, 255], [200, 80, 255], [255, 70, 200], [140, 100, 255], [90, 140, 255]][k % 6], beamsCol); });

    cap('A FULL TURN  ·  the heads behind the performer come round', 6.7, 10.4);
    // ring heads go deep red-amber, the back four ice white so they read as they come round
    const turnCol = win(t, 6.6, 10.6, 0.6);
    ORDER.forEach(i => { LX.col[i] = mixc(LX.col[i], FIX[i].back ? [215, 235, 255] : [255, 90, 40], turnCol); });

    cap('GOBO PROJECTORS  ·  patterns printed on the crowd', 10.6, 15.4);
    const proj = win(t, 10.5, 15.6, 0.6);
    ORDER.forEach((i, k) => {
      LX.lv[i].proj = proj;
      LX.lv[i].beam *= 1 - proj;
      LX.col[i] = mixc(LX.col[i], k % 2 ? MAGENTA : AMBER, proj);
    });

    cap('LASERS  ·  one per head, then a dense spray onto the crowd', 15.6, 19.5);
    LX.burstCount = 44;
    LX.burstSpread = 6;
    LX.burstPh = t * 1.1;
    const las = win(t, 15.5, 19.7, 0.4);
    const dense = seg(t, 16.8, 17.6);
    ORDER.forEach((i, k) => {
      LX.lv[i].laser = las * (1 - dense);
      LX.lv[i].burst = las * dense;
      LX.lv[i].beam *= 1 - las * 0.85;
      LX.col[i] = mixc(LX.col[i], [GREEN, RED, BLUE][k % 3], las);
    });

    cap('MULTI-BEAM LASERS  ·  sheets over the crowd', 19.7, 24.4);
    const fan = win(t, 19.5, 24.7, 0.4);
    [6, 2, 3, 5, 8, 10].forEach((i, k) => { LX.lv[i].fan = fan; LX.col[i] = mixc(LX.col[i], [GREEN, MAGENTA, VIOLET, GREEN, MAGENTA, VIOLET][k], fan); });
    ORDER.forEach(i => { LX.lv[i].beam *= 1 - fan * 0.9; });

    cap('EVERYTHING  ·  tumbling in three axes', 24.6, 28.1);
    const all = win(t, 24.5, 28.4, 0.5);
    if (all > 0) {
      ORDER.forEach((i, k) => {
        const pk = 0.5 + 0.5 * Math.cos((beat + k / ORDER.length) * TAU);
        LX.lv[i].beam = (1 - all) * LX.lv[i].beam + all * (0.3 + 0.8 * pk * pk);
        LX.col[i] = mixc(LX.col[i], hsl(((t - 24.5) * 120 + k * 36) % 360, 0.95, 0.6), all);
      });
      LX.lv[0].laser = LX.lv[1].laser = LX.lv[9].laser = all;
      LX.lv[6].fan = LX.lv[2].fan = all * 0.8;
      LX.spot = 1 - all * 0.5 * (0.5 + 0.5 * Math.cos(beat * TAU));
    }
    // the equator band stays dark while the rig looks like the painting (intro and home)
    const bandK = win(t, 2.6, 28.2, 0.6);
    FIX.forEach((f, i) => { if (f.band) for (const k in LX.lv[i]) LX.lv[i][k] *= bandK; });
    LX.col[4] = spotBeamCol();
    LX.eyeCol = rigColour();
    LX.eye = 1 - (all > 0 ? 0.35 * all * (0.5 + 0.5 * Math.cos(beat * TAU * 2)) : 0);
    cap('BACK TO THE PAINTING', 28.3, 29.9);
    LX.label = label;
    LX.labelA = la;
  }

  // ---------- palette ----------
  // navy ramp sampled from the painting: shadow → lit crowd → beam-lit haze
  const RAMP = [[0, [2, 6, 14]], [0.3, [7, 20, 34]], [0.6, [20, 48, 66]], [1, [52, 100, 116]], [1.6, [90, 160, 170]]];
  function navyRGB(L) {
    L = CS.clamp(L, 0, 1.6);
    let i = 0;
    while (i < RAMP.length - 2 && L > RAMP[i + 1][0]) i++;
    const [l0, c0] = RAMP[i], [l1, c1] = RAMP[i + 1];
    const t = (L - l0) / (l1 - l0);
    return [CS.lerp(c0[0], c1[0], t) * TUNE.rampR, CS.lerp(c0[1], c1[1], t) * TUNE.rampG, CS.lerp(c0[2], c1[2], t) * TUNE.rampB];
  }
  const rgb = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  const navy = (L, k = 1) => rgb(navyRGB(L).map(v => v * k));

  // light reaching a point: soft room fill + the beams raking across the bowl
  function lightAt(x, y) {
    const dx = x - ORB.x, dy = y - ORB.y, r = Math.hypot(dx, dy) + 1;
    let L = TUNE.lightBase + TUNE.lightFill * Math.exp(-(((x - 768) / 650) ** 2 + ((y - 520) / 380) ** 2));
    const ang = Math.atan2(dy, dx) / D2R;
    for (const f of FIX) {
      if (!f.len || f.extra) continue;
      let da = Math.abs(((ang - f.a + 540) % 360) - 180);
      const reach = r < f.len * 1.05 ? 1 : Math.exp(-(r - f.len) / 120);
      L += TUNE.lightBeam * Math.exp(-((da / (f.half * 1.6)) ** 2)) * reach * (f.spot ? 1.2 : 0.8);
    }
    return L;
  }

  // ---------- arena architecture ----------
  // balcony lines drop toward the centre, steeper near the camera-side edges
  const line = (yl, yc, yr) => x => {
    const u = (x - ORB.x) / ORB.x;
    return u < 0 ? yc + (yl - yc) * Math.pow(-u, 1.1) : yc + (yr - yc) * Math.pow(u, 1.1);
  };
  const L_ = {
    t1Top: line(62, 150, 80), t1Bot: line(140, 262, 195), t2Top: line(255, 318, 290),
    t2Bot: line(385, 452, 420), t3Top: line(445, 482, 470), t3Bot: line(540, 590, 580), floor: line(600, 615, 610),
  };
  const TIERS = [
    { top: L_.t1Top, bot: L_.t1Bot, hr: 4.7 },
    { top: L_.t2Top, bot: L_.t2Bot, hr: 5.4 },
    { top: L_.t3Top, bot: L_.t3Bot, hr: 6.1 },
  ];
  const SLABS = [[L_.t1Bot, L_.t2Top], [L_.t2Bot, L_.t3Top], [L_.t3Bot, L_.floor]];
  const floorR = y => {
    const u = Math.max(0, (y - 610) / 410);
    return 1.6 + 50 * u ** 2.1 + 25 * u ** 6; // the nearest heads balloon, as in the painting
  };

  let arena, arenaBase, arenaFlat, overlay, beamTex = {}, glowCyan, glowWarm, glowSoft, glowWhite, twinkles = [], dust = [], people = [];
  const whiteTex = {}, tintCv = {}, glowCache = new Map();
  // keep a texture's alpha (its brightness pattern) and give it a new colour
  function recolor(src, col, dst) {
    const g = dst.getContext('2d');
    g.globalCompositeOperation = 'copy';
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`;
    g.fillRect(0, 0, dst.width, dst.height);
    g.globalCompositeOperation = 'source-over';
    return dst;
  }
  const glowFor = col => {
    const key = col.map(v => (v / 16) | 0).join(',');
    let c = glowCache.get(key);
    if (!c) {
      // a long session of fades would otherwise keep minting colours: recycle the oldest past 192
      if (glowCache.size >= 192) { const [k0, c0] = glowCache.entries().next().value; glowCache.delete(k0); c = c0; }
      c = recolor(glowWhite, col.map(v => Math.min(255, v * 1.1 + 25)), c || CS.canvas(128, 128));
    } else glowCache.delete(key);
    glowCache.set(key, c);
    return c;
  };

  // Beam texture for one fixture. Brightness falls with absolute distance from the
  // lamp (fitted to the reference): side beams ~(1+r/90)^-1.6, the spot ~(1+r/400)^-1.2.
  function makeBeam(seed, f) {
    const w = 512, h = 192, c = CS.canvas(w, h), g = c.getContext('2d');
    const id = g.createImageData(w, h), d = id.data, n = CS.noise2(seed);
    for (let x = 0; x < w; x++) {
      const t = x / w, r = t * f.len + 65;
      const half = (0.06 + 0.94 * t) * h / 2;
      let along = (f.gain / 0.81) * Math.pow(Math.max(r, 60) / 100, -f.p);
      along *= CS.smooth(0, 0.02, t) * (1 - CS.smooth(f.spot ? 0.9 : 0.8, 1, t));
      for (let y = 0; y < h; y++) {
        const v = (y - h / 2) / half, av = Math.abs(v);
        if (av > 1.15) continue;
        const edge = 1 - CS.smooth(0.8, 1.06, av);
        // streaks run along the rays; haze breaks them up in patches
        const streak = 0.6 + 0.55 * CS.fbm(n, v * 4 + 7, t * 1.4, 3);
        const haze = 0.7 + 0.45 * CS.fbm(n, x * 0.02 + 40, y * 0.035, 4);
        const core = Math.exp(-v * v / 0.25);
        const a = CS.clamp(edge * streak * haze * along * (0.85 + 0.25 * core), 0, 1);
        const i = (y * w + x) * 4;
        const wht = CS.clamp(a * 1.6 - 0.35, 0, 1); // hottest parts bleach toward white
        d[i] = 10 + 170 * wht;
        d[i + 1] = 196 + 50 * wht;
        d[i + 2] = 192 + 50 * wht;
        d[i + 3] = a * 255;
      }
    }
    g.putImageData(id, 0, 0);
    return c;
  }

  // ---------- depth ----------
  // nearness: 0 at the far end of the bowl … 1 right at the camera. The stands get nearer
  // toward the sides (and a little with each lower tier); the floor toward the frame bottom.
  const nearStand = (x, ti) => CS.clamp((0.16 + 0.74 * Math.pow(Math.abs(x - ORB.x) / ORB.x, 1.2)) * (0.86 + 0.07 * ti), 0, 1);
  const nearFloor = y => CS.clamp(Math.pow(Math.max(0, (y - 595) / 430), 1.4), 0, 1);
  // colour of the air at a point: deep navy, lifted wherever beams pass through it
  function hazeAt(x, y) {
    const k = CS.clamp(lightAt(x, y) - TUNE.lightBase, 0, 1.5);
    return [10 + 26 * k, 28 + 86 * k, 42 + 92 * k];
  }
  // aerial perspective: distant surfaces lose contrast around their local level and sink into the haze
  function shade(L, n, x, y, Lref = L) {
    const fog = CS.clamp(TUNE.fog * (1 - n), 0, 1);
    const c = navyRGB(Lref + (L - Lref) * (0.35 + 0.65 * n)), h = hazeAt(x, y);
    return rgb([CS.lerp(c[0], h[0], fog), CS.lerp(c[1], h[1], fog), CS.lerp(c[2], h[2], fog)]);
  }

  // palette colour with a little warmth (skin, auburn hair) and the haze of distance
  function tone(L, warm, n, x, y) {
    const c = navyRGB(L), h = hazeAt(x, y), fog = CS.clamp(TUNE.fog * (1 - n), 0, 1);
    c[0] += warm * L * 45; c[1] += warm * L * 10; c[2] -= warm * L * 25;
    return rgb([CS.lerp(c[0], h[0], fog), CS.lerp(c[1], h[1], fog), CS.lerp(c[2], h[2], fog)]);
  }
  const LIGHT = { x: STAGE.x, y: STAGE.y - 120 };

  function band(g, top, bot) {
    g.beginPath();
    for (let x = 0; x <= W; x += 12) g.lineTo(x, top(x));
    for (let x = W; x >= 0; x -= 12) g.lineTo(x, bot(x));
    g.closePath();
  }

  // a person in the stands: a dark figure against the lit air behind it, with a rim of
  // light where a beam or the haze catches the head and shoulders
  // a person in the stands, facing the stage (so roughly toward us): face and chest catch
  // the stage and beam light, hair dark on top, seating in shadow behind
  function dabPerson(g, x, y, hr, L, n) {
    y -= R() < 0.3 ? hr * rr(0.2, 0.6) : 0; // some stand taller
    const sw = hr * rr(1.4, 1.85);
    g.fillStyle = shade(L * rr(0.3, 0.75), n, x, y, L * 0.5);
    g.beginPath();
    g.moveTo(x - sw, y + hr * 3.2);
    g.quadraticCurveTo(x - sw * 1.02, y + hr * 1.2, x - hr * 0.45, y + hr * 0.95);
    g.lineTo(x + hr * 0.45, y + hr * 0.95);
    g.quadraticCurveTo(x + sw * 1.02, y + hr * 1.2, x + sw, y + hr * 3.2);
    g.fill();
    const face = navyRGB(L * (R() < 0.25 ? rr(0.3, 0.55) : rr(0.6, 1.15)));
    face[0] += 10 * L; face[2] -= 6 * L; // a little skin warmth
    const fog = CS.clamp(TUNE.fog * (1 - n), 0, 1), h = hazeAt(x, y);
    g.fillStyle = rgb(face.map((v, i) => CS.lerp(v, h[i], fog)));
    g.beginPath(); g.ellipse(x, y, hr * 0.74, hr * 0.92, 0, 0, TAU); g.fill();
    // hair over the top of the head
    g.fillStyle = shade(L * 0.22, n, x, y, L * 0.6);
    g.beginPath(); g.ellipse(x, y - hr * 0.3, hr * 0.8, hr * 0.68, 0, Math.PI, TAU); g.fill();
    if (R() < 0.45) { g.beginPath(); g.ellipse(x, y + hr * 0.2, hr * 0.85, hr * 0.95, 0, Math.PI * 0.95, Math.PI * 2.05); g.fill(); g.fillStyle = rgb(face.map((v, i) => CS.lerp(v, h[i], fog))); g.beginPath(); g.ellipse(x, y + hr * 0.15, hr * 0.5, hr * 0.7, 0, 0, TAU); g.fill(); }
  }

  // the lit air / seating seen between the bodies of a crowd band
  function backdrop(g, top, bot, ti, k) {
    for (let x = 0; x < W; x += 4) {
      const y0 = top(x), y1 = bot(x), n = ti < 0 ? 0.3 : nearStand(x, ti);
      const L = (lightAt(x, (y0 + y1) / 2) + TUNE.backLift) * k;
      const gr = g.createLinearGradient(0, y0, 0, y1);
      gr.addColorStop(0, shade(L * 0.3, n, x, y0));
      gr.addColorStop(1, shade(L * 0.5, n, x, y1));
      g.fillStyle = gr;
      g.fillRect(x, y0, 4.5, y1 - y0);
    }
  }

  // brush stroke laid along a curve's tangent (for architecture)
  function along(g, curve, x, y, len, th, col) {
    g.fillStyle = col;
    g.save();
    g.translate(x, y);
    g.rotate(Math.atan2(curve(x + 8) - curve(x - 8), 16) + rr(-0.05, 0.05));
    g.fillRect(-len / 2, -th / 2, len, th);
    g.restore();
  }

  function buildArena() {
    const c = CS.canvas(W, H), g = c.getContext('2d');
    // roof and far wall, lost in haze
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#020812');
    bg.addColorStop(0.5, '#05111d');
    bg.addColorStop(1, '#030912');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 9000; i++) {
      const x = rr(0, W), y = rr(0, 640);
      g.fillStyle = shade(lightAt(x, y) * rr(0.35, 0.8), 0.3, x, y);
      g.globalAlpha = 0.35;
      g.save(); g.translate(x, y); g.rotate(rr(-0.6, 0.6));
      g.fillRect(-rr(6, 18), -rr(2, 5), rr(12, 36), rr(4, 10));
      g.restore();
    }
    g.globalAlpha = 1;

    // crowds in the stands: heads shrink and fade with distance
    TIERS.forEach((T, ti) => {
      backdrop(g, T.top, T.bot, ti, TUNE.tierL);
      // seat rows follow the balcony curve; back (top) rows first so each row hides the bodies behind
      const hc = T.bot(ORB.x) - T.top(ORB.x);
      const rows = Math.max(3, Math.floor(hc / (T.hr * 1.65)));
      for (let k = 0; k < rows; k++) {
        const s = (k + 0.5) / rows;
        for (let x = -6; x < W + 6; ) {
          const n = nearStand(x, ti) * (0.92 + 0.08 * s);
          const hr = T.hr * (0.6 + 0.8 * n);
          const y = CS.lerp(T.top(x), T.bot(x), s) + rr(-0.9, 0.9) * hr;
          if (R() < 0.93) dabPerson(g, x, y, hr * rr(0.85, 1.15), lightAt(x, y) * rr(0.6, 1.15) * TUNE.tierL, n);
          if (R() < 0.065) twinkles.push({ x: x + rr(-2, 2), y: y + rr(-1, 4), s: 3.5 + 7 * n, a0: 0.45 + 0.55 * n, ph: rr(0, TAU), sp: rr(0.4, 2) });
          x += hr * 1.7 * rr(0.6, 1.4);
        }
      }
      // shadow cast by the balcony overhang onto the top rows
      for (let x = 0; x < W; x += 6) {
        const y0 = T.top(x), h = (T.bot(x) - y0) * 0.5;
        const sg = g.createLinearGradient(0, y0, 0, y0 + h);
        sg.addColorStop(0, `rgba(0,3,9,${TUNE.shadow})`);
        sg.addColorStop(1, 'rgba(0,3,9,0)');
        g.fillStyle = sg;
        g.fillRect(x, y0, 6, h);
      }
    });

    // balconies as solid slabs: lit front face (thicker where nearer) over a dark soffit
    SLABS.forEach(([top, bot], si) => {
      const fBot = x => Math.min(bot(x) - 2, top(x) + 5 + 30 * nearStand(x, si));
      band(g, top, bot);
      g.fillStyle = navy(0.05);
      g.fill();
      for (let i = 0; i < 2600; i++) {
        const x = rr(0, W), t = R(), y = CS.lerp(fBot(x), bot(x), t), n = nearStand(x, si);
        // the underside stays dark except where a beam rakes across it
        const L = (0.04 + TUNE.soffitL * Math.max(0, lightAt(x, y) - 0.16) * 1.8) * (1 - 0.6 * t);
        along(g, top, x, y, rr(18, 55) * (0.5 + n), rr(2, 6), shade(L * rr(0.7, 1.25), n, x, y, L));
      }
      band(g, top, fBot);
      g.fillStyle = navy(0.22);
      g.fill();
      for (let i = 0; i < 1800; i++) {
        const x = rr(0, W), t = R(), y = CS.lerp(top(x), fBot(x), t), n = nearStand(x, si);
        const L = (lightAt(x, y) * TUNE.fasciaL + 0.12) * (1.2 - 0.55 * t);
        along(g, top, x, y, rr(14, 40) * (0.5 + n), rr(1.5, 4) * (0.6 + n), shade(L * rr(0.8, 1.2), n, x, y, L));
      }
      // bright lip along the top edge, dark crease where the face meets the soffit
      g.lineWidth = 1.6;
      for (let x = 0; x < W; x += 12) {
        // the lip fades into the haze with distance
        const a = CS.clamp((0.12 + 0.6 * lightAt(x, top(x)) * TUNE.fasciaL) * (0.25 + 0.75 * nearStand(x, si)), 0, 0.9);
        g.strokeStyle = `rgba(120,200,212,${a})`;
        g.beginPath(); g.moveTo(x, top(x)); g.lineTo(x + 12, top(x + 12)); g.stroke();
      }
      g.strokeStyle = 'rgba(0,4,10,0.65)';
      g.lineWidth = 2;
      g.beginPath();
      for (let x = 0; x <= W; x += 12) g.lineTo(x, fBot(x));
      g.stroke();
    });

    // suites: warm lit windows tucked under the balconies
    const suites = [[270, 0], [140, 0], [1350, 0], [405, 1], [455, 1], [960, 1], [1230, 1], [240, 2], [180, 2], [1340, 2], [1440, 2], [1065, 1]];
    for (const [sx, ti] of suites) {
      const n = nearStand(sx, ti);
      const sy = TIERS[ti].top(sx) + 4;
      const w = (10 + 12 * n) * rr(0.9, 1.1), h = w * 0.75;
      const sg = g.createLinearGradient(0, sy, 0, sy + h);
      sg.addColorStop(0, `rgba(170,150,120,${0.2 + 0.2 * n})`);
      sg.addColorStop(1, `rgba(90,75,60,${0.12 + 0.12 * n})`);
      g.fillStyle = sg;
      g.fillRect(sx, sy, w, h);
      g.fillStyle = 'rgba(6,12,20,0.6)';
      for (let k = 0; k < 2; k++) { g.beginPath(); g.ellipse(sx + w * (0.3 + 0.4 * k), sy + h * 0.7, w * 0.12, h * 0.35, 0, 0, TAU); g.fill(); }
      twinkles.push({ x: sx + w * 0.7, y: sy + h * 0.4, s: 5 + 5 * n, a0: 0.7, ph: rr(0, TAU), sp: 0.5 });
    }

    // the far floor, too small to animate: tiny heads backlit by stage haze
    backdrop(g, L_.floor, () => 760, -1, TUNE.farL * 1.2);
    for (let y = 598; y < 742; y += Math.max(1.6, floorR(y) * 1.05)) {
      const r = floorR(y);
      for (let x = -4; x < W + 4; x += r * 1.9 * rr(0.8, 1.25)) {
        const yy = y + rr(-r * 0.3, r * 0.3);
        if (((x - STAGE.x) / 240) ** 2 + ((yy - 778) / 44) ** 2 < 1) continue;
        const glow = TUNE.stageGlow * Math.exp(-Math.hypot(x - STAGE.x, (yy - STAGE.y) * 1.8) / 420);
        dabPerson(g, x, yy, r * rr(0.85, 1.15), (lightAt(x, yy) + glow) * rr(0.4, 0.95) * TUNE.farL, nearFloor(yy));
        if (R() < 0.05) twinkles.push({ x, y: yy - r * 1.2, s: 3 + r * 1.4, a0: 0.75, ph: rr(0, TAU), sp: rr(0.4, 1.6) });
      }
    }
    return c;
  }

  function buildPeople() {
    for (let y = 742; y < 1090; ) {
      const r = floorR(y);
      for (let x = -50 + rr(0, r); x < W + 50; x += r * 1.95 * rr(0.75, 1.3)) {
        const yy = y + rr(-r * 0.45, r * 0.45);
        if (((x - STAGE.x) / 245) ** 2 + ((yy - 778) / 46) ** 2 < 1) continue;
        const p = CS.makePerson(R, x, yy, r * rr(0.85, 1.15), { arms: 0 });
        // the crowd around the stage catches its spill; the nearest rows fall toward silhouette
        const n = nearFloor(yy);
        const glow = TUNE.stageGlow * Math.exp(-Math.hypot(x - STAGE.x, (yy - STAGE.y) * 1.8) / 420);
        const L = (lightAt(x, yy - r) + glow) * rr(0.45, 0.9) * TUNE.nearL * (1 - TUNE.frontDark * CS.smooth(800, 1000, yy));
        p.L = L;
        p.lit = Math.min(0.95, TUNE.rim * Math.exp(-Math.hypot(LIGHT.x - x, (LIGHT.y - yy) * 1.6) / 900) + 0.08);
        // raised arms catch the stage and haze light, so they read lighter than backs
        p.lside = Math.sign(LIGHT.x - x) || 1;
        p.armDark = tone(0.12 + L * 1.2, 0.15, n, x, yy);
        p.armC = tone(0.3 + 0.6 * p.lit + L, 0.2, n, x, yy);
        p.skinC = tone(0.4 + 0.7 * p.lit + L, 0.7, n, x, yy);
        p.sprite = CS.bakePerson(p, {
          lx: LIGHT.x, ly: LIGHT.y, rim: TUNE.rim, rimMin: 0.08, falloff: 900, rimColor: '120,210,218', sheen: Math.min(1.4, p.lit * 2.2),
          headL: TUNE.headL / 0.4, shirtL: TUNE.shirtL, tone: (l, w = 0) => tone(l, w, n, x, yy),
        });
        people.push(p);
      }
      y += r * 1.12;
    }
    // a couple of kids up on someone's shoulders, arms in the air; drawn just before their
    // carrier so the carrier's head hides their lower body, as it would from behind
    const carriers = people.filter(q => q.r > 13 && q.r < 24 && Math.abs(q.x - STAGE.x) < 520 && !q.arm);
    for (let k = 0; k < 2 && carriers.length; k++) {
      const c = carriers.splice(Math.floor(R() * carriers.length), 1)[0];
      const p = CS.makePerson(R, c.x + rr(-0.1, 0.1) * c.r, c.y - c.r * 2.7, c.r * 0.82, { arms: 1 });
      Object.assign(p, { arm: false, sortY: c.y - 0.01, turn: 0 });
      p.L = c.L * 1.3;
      p.lit = Math.min(0.95, c.lit * 1.15);
      p.lside = c.lside; p.armDark = c.armDark; p.armC = c.armC; p.skinC = c.skinC;
      const n = nearFloor(c.y), x = p.x, yy = p.y;
      p.sprite = CS.bakePerson(p, {
        lx: LIGHT.x, ly: LIGHT.y, rim: TUNE.rim, rimMin: 0.08, falloff: 900, rimColor: '120,210,218', sheen: 1,
        headL: TUNE.headL / 0.4, shirtL: TUNE.shirtL, tone: (l, w = 0) => tone(l, w, n, x, yy),
      });
      people.push(p);
    }
    people.sort((a, b) => (a.sortY ?? a.y) - (b.sortY ?? b.y));
  }

  function init() {
    FIX.forEach((f, i) => { if (f.len) beamTex[i] = makeBeam(3 + i * 7, f); });
    beamTex.wash = makeBeam(91, FIX[4]);
    // white copies (for the hot core when beams are recoloured) and per-beam scratch canvases
    FIX.forEach((f, i) => { if (f.len) { whiteTex[i] = recolor(beamTex[i], [255, 255, 255], CS.canvas(512, 192)); tintCv[i] = CS.canvas(512, 192); } });
    glowWhite = CS.glow(255, 255, 255, 128);
    glowCyan = CS.glow(90, 230, 220, 128);
    glowSoft = CS.glow(70, 200, 200, 128, 0.4);
    glowWarm = CS.glow(255, 185, 115, 32, 0.12);
    rebuild();
    overlay = CS.paintOverlay(W, H, 5, { strokes: 30000, strength: 0.8, vignette: 0.55 });
    for (let i = 0; i < 420; i++) dust.push({ u: R(), v: R() * 2 - 1, s: 0.6 + R() * 1.5, ph: R() * TAU, sp: 0.01 + R() * 0.03 });
  }

  // static layers depend on TUNE; rebuilt deterministically (same seed) when it changes
  function rebuild() {
    R = CS.rng(11);
    twinkles = [];
    people = [];
    arena = buildArena();
    // the same arena with no beam light baked in (live fixtures light it instead), and evenly
    // lit (what can catch light, for the receiver)
    arenaBase = buildVariant({ lightBeam: 0 });
    arenaFlat = buildVariant({ lightBeam: 0, lightBase: 0.55, lightFill: 0, fog: 0, backLift: 0.3 });
    buildPeople();
    // what in the stands can catch moving light: the arena's own lit surfaces, as a grey mask
    rcvStatic = CS.canvas(W / 2, H / 2);
    const rg = rcvStatic.getContext('2d');
    rg.filter = 'grayscale(1) brightness(2.6) contrast(1.15)';
    rg.drawImage(arenaFlat, 0, 0, W / 2, H / 2);
    viewBuild();
  }
  // rebuild the arena layer with some knobs overridden; same seed so the layout is identical
  function buildVariant(over) {
    const saved = {}, tw = twinkles;
    for (const k in over) { saved[k] = TUNE[k]; TUNE[k] = over[k]; }
    R = CS.rng(11);
    twinkles = [];
    const c = buildArena();
    twinkles = tw;
    Object.assign(TUNE, saved);
    return c;
  }
  const CHAPTERS = {
    main: [['Intro', 0], ['Beams', 2.6], ['Full turn', 6.7], ['Gobos', 10.6], ['Lasers', 15.6], ['Fans', 19.7], ['Strobe', 24.5], ['Everything', 29.1], ['Home', 32.8]],
    beams: [['Intro', 0], ['Into the lens', 2.1], ['From behind', 5.9], ['Raking', 10.1], ['Tumble', 14.1], ['Home', 17.6]],
    get song() {
      const C = window.SONG;
      if (!C) return [['Song', 0]];
      const pk = songPeak(C);
      return C.sections.map((s, i) => [i === pk ? 'Cosmos' : i > pk ? 'Outro' : ['Quiet', 'Verse', 'Build', 'Chorus'][s.level], s.t0]);
    },
  };
  // hooks for the light desk (console.js) and the optimisation harness
  window.__arena = {
    TUNE, rebuild, LX, LIVE, FIX, ORDER, CAMERA, ORB, SHOW_GROUPS, groupOf, get GOBOS() { return GOBO_NAMES; },
    get CHAPTERS() { return CHAPTERS[LX.program]; },
    get SEATS() { return SEATS; }, setView: v => setView(v), get view() { return VIEW; },
    get SHOW_LENGTH() { return PROGRAMS[LX.program]; },
    PROGRAMS: Object.keys(PROGRAMS),
    setProgram(p) { if (PROGRAMS[p]) LX.program = p; },
    // forget accumulated spin/turn (after "square on" or taking over from the showcase)
    resetMotion() { ACC.spin = 0; ACC.turn = 0; ACC.auto = 0; },
    debug: { SHOWP, showGlare: t => { showAt(t); frameLights({ clocks: { lights: t }, intensity: 1, bpm: 84 }); return glare.reduce((a, q) => a + q.k, 0); }, fixture3: (...a) => fixture3(...a), offLens: (...a) => offLens(...a), glare: () => glare, lasers: () => [lasers.length, lasers.slice(0, 64).map(l => Math.round(l.P1[0] * 7 + l.P1[2] * 3) % 97).join(',').slice(0, 40)], canvases: () => ({ lightCv, rcvCv, pplCv }) },
    get crowd() { return crowdOpts; },
    setMode(m) { LX.on = m !== 'paint'; LX.mode = m === 'live' ? 'live' : 'show'; },
    mode() { return LX.on ? (LX.mode === 'live' ? 'live' : 'show') : 'paint'; },
  };

  // ---------- orb ----------
  const ringRot = t => Math.sin(t * 0.23) * 3.5 + Math.sin(t * 0.071) * 2; // degrees, gentle rocking
  function fixturePos(f, t) {
    const rot = f.spot ? 0 : ringRot(t) + (LX.on ? LX.rot : 0);
    const pa = (f.pa + rot) * D2R, ba = (f.a + rot) * D2R;
    const x = ORB.x + Math.cos(pa) * ORB.ring, y = ORB.y + Math.sin(pa) * ORB.ring * 0.94;
    // aim at a far point on the ray from the orb centre, so the beam lines up with the reference
    const tx = ORB.x + Math.cos(ba) * 700, ty = ORB.y + Math.sin(ba) * 700;
    return { a: Math.atan2(ty - y, tx - x), x, y };
  }

  function drawBeam(g, tex, ox, oy, ang, len, half, alpha, widthMul = 1) {
    const w = 2 * len * Math.tan(half * D2R) * widthMul;
    g.save();
    g.translate(ox, oy);
    g.rotate(ang);
    g.globalAlpha = CS.clamp(alpha, 0, 1);
    g.drawImage(tex, 0, -w / 2, len, w);
    g.restore();
  }

  function drawOrb(g, t, I) {
    const { x, y, rx, ry } = ORB;
    // hanging truss
    g.strokeStyle = '#0f2733';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(x - 3, 0); g.lineTo(x - 3, y - ry - 8); g.moveTo(x + 3, 0); g.lineTo(x + 3, y - ry - 8);
    for (let yy = 4; yy < y - ry - 10; yy += 8) { g.moveTo(x - 3, yy); g.lineTo(x + 3, yy + 6); }
    g.stroke();
    g.fillStyle = '#0b1c26';
    g.beginPath(); g.moveTo(x - 9, y - ry + 2); g.lineTo(x - 4, y - ry - 10); g.lineTo(x + 4, y - ry - 10); g.lineTo(x + 9, y - ry + 2); g.fill();

    // glass interior: dark, but lets the beams behind show through a little
    const inner = g.createRadialGradient(x - rx * 0.15, y - ry * 0.1, rx * 0.15, x, y, rx);
    inner.addColorStop(0, 'rgba(3,12,20,0.85)');
    inner.addColorStop(0.75, 'rgba(6,22,32,0.75)');
    inner.addColorStop(1, 'rgba(30,90,105,0.7)');
    g.fillStyle = inner;
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill();

    // back half of the ring truss (seen through the glass)
    const rot = (ringRot(t) + (LX.on ? LX.rot : 0)) * D2R;
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.strokeStyle = '#03080c';
    g.lineWidth = 7;
    g.beginPath(); g.ellipse(0, 0, ORB.ring - 4, (ORB.ring - 4) * 0.93, 0, 0, TAU); g.stroke();
    g.strokeStyle = 'rgba(190,110,60,0.35)';
    g.lineWidth = 1;
    g.beginPath(); g.ellipse(0, 0, ORB.ring - 7, (ORB.ring - 7) * 0.93, 0, 0.3, 1.4); g.stroke();
    g.beginPath(); g.ellipse(0, 0, ORB.ring - 7, (ORB.ring - 7) * 0.93, 0, 3.4, 4.2); g.stroke();
    g.strokeStyle = 'rgba(80,150,170,0.25)';
    g.beginPath(); g.ellipse(0, 0, ORB.ring - 1, (ORB.ring - 1) * 0.93, 0, 0, TAU); g.stroke();
    g.restore();

    // cans: short cylinders pointing outward, lens at the outer end
    FIX.forEach((f, idx) => {
      if (f.extra) return;
      const p = fixturePos(f, t);
      const L2 = LX.lv[idx], lc = LX.on ? LX.col[idx] : TEAL;
      const lv = LX.on ? (f.spot ? LX.spot : Math.max(L2.beam, L2.proj, L2.laser, L2.fan, L2.burst)) : 1;
      const dx = Math.cos(p.a), dy = Math.sin(p.a);
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.a);
      const body = g.createLinearGradient(0, -8, 0, 8);
      body.addColorStop(0, '#15303a');
      body.addColorStop(0.35, '#07141a');
      body.addColorStop(1, '#020608');
      g.fillStyle = body;
      g.beginPath(); g.roundRect(-13, -11, 17, 22, 3); g.fill();
      g.fillStyle = '#04090c';
      g.beginPath(); g.ellipse(4, 0, 5.5, 11.5, 0, 0, TAU); g.fill();
      const lit = (f.len ? 1 : 0.35) * (0.25 + 0.75 * Math.min(1, lv));
      const hot = mixc(lc, [255, 255, 255], 0.8), mid = mixc(lc, [255, 255, 255], 0.35), edge = lc.map(v => v * 0.6);
      const lens = g.createRadialGradient(6, 0, 0, 6, 0, 11);
      lens.addColorStop(0, `rgba(${hot.map(v => v | 0)},${lit})`);
      lens.addColorStop(0.5, `rgba(${mid.map(v => v | 0)},${lit})`);
      lens.addColorStop(1, `rgba(${edge.map(v => v | 0)},${lit * 0.8})`);
      g.fillStyle = lens;
      g.beginPath(); g.ellipse(6, 0, 5, 10.5, 0, 0, TAU); g.fill();
      g.restore();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = CS.clamp(0.8 * lit * I, 0, 1);
      g.drawImage(LX.on ? glowFor(lc) : glowCyan, p.x + dx * 9 - 30, p.y + dy * 9 - 30, 60, 60);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    });

    // front lamp facing the camera
    const hs = g.createRadialGradient(x - 5, y - 6, 2, x, y, 21);
    hs.addColorStop(0, '#1d3a44');
    hs.addColorStop(1, '#03090c');
    g.fillStyle = hs;
    g.beginPath(); g.arc(x, y, 21, 0, TAU); g.fill();
    // the front lamp, facing the audience: its own colour and level in show/live mode
    const ec = LX.on ? LX.eyeCol : TEAL, ev = LX.on ? LX.eye : 1;
    const rgbs = c => c.map(v => Math.min(255, v) | 0).join(',');
    const fl = g.createRadialGradient(x, y, 0, x, y, 15);
    fl.addColorStop(0, `rgba(${rgbs(mixc(ec, [255, 255, 255], 0.9))},${0.25 + 0.75 * ev})`);
    fl.addColorStop(0.35, `rgba(${rgbs(mixc(ec, [255, 255, 255], 0.55))},${0.25 + 0.75 * ev})`);
    fl.addColorStop(0.8, `rgba(${rgbs(mixc(ec, [255, 255, 255], 0.1))},${0.3 + 0.7 * ev})`);
    fl.addColorStop(1, `rgb(${rgbs(ec.map(v => v * 0.45))})`);
    g.fillStyle = fl;
    g.beginPath(); g.arc(x, y, 15, 0, TAU); g.fill();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = CS.clamp(0.9 * I * ev, 0, 1);
    g.drawImage(LX.on ? glowFor(ec) : glowCyan, x - 50, y - 50, 100, 100);
    g.globalAlpha = 1;

    // glass: fresnel rim, specular arc, small glints
    g.globalCompositeOperation = 'source-over';
    // glass catches the rig's own colour
    const gc = LX.on ? mixc([110, 215, 220], rigColour(), 0.6).map(v => v | 0).join(',') : '110,215,220';
    const fr = g.createRadialGradient(x, y, rx * 0.7, x, y, rx);
    fr.addColorStop(0, `rgba(${gc},0)`);
    fr.addColorStop(1, `rgba(${gc},0.32)`);
    g.fillStyle = fr;
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill();
    g.strokeStyle = LX.on ? `rgba(${mixc([150, 235, 232], rigColour(), 0.5).map(v => v | 0).join(',')},0.75)` : 'rgba(150,235,232,0.75)';
    g.lineWidth = 1.6;
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.stroke();
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = 'rgba(200,255,250,0.25)';
    g.lineWidth = 4;
    g.beginPath(); g.ellipse(x, y, rx - 6, ry - 6, 0, 3.6, 4.5); g.stroke();
    g.lineWidth = 1.5;
    g.strokeStyle = 'rgba(220,255,252,0.5)';
    g.beginPath(); g.ellipse(x, y, rx - 5, ry - 5, 0, 3.75, 4.3); g.stroke();
    g.globalAlpha = 0.5;
    g.drawImage(glowSoft, x + rx * 0.45 - 8, y - ry * 0.62 - 8, 16, 16);
    // stage light bouncing up into the underside of the glass
    g.globalAlpha = 0.35 * I;
    g.drawImage(glowSoft, x - 40, y + ry - 30, 80, 40);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  function drawStage(g, I, spot = 1) {
    const { x, y, rx, ry, d } = STAGE;
    // in show/live the deck is only as visible as the light on it: the spot's pool and the room's bounce
    const sl = LX.on ? CS.clamp(0.06 + 0.5 * spot + 0.5 * amb, 0, 1) : 1;
    const k3 = c => `rgb(${(c[0] * sl) | 0},${(c[1] * sl) | 0},${(c[2] * sl) | 0})`;
    const side = g.createLinearGradient(x - rx, 0, x + rx, 0);
    side.addColorStop(0, k3([2, 7, 12]));
    side.addColorStop(0.5, k3([11, 31, 42]));
    side.addColorStop(1, k3([2, 7, 12]));
    g.fillStyle = side;
    g.beginPath();
    g.moveTo(x - rx, y);
    g.lineTo(x - rx, y + d);
    g.ellipse(x, y + d, rx, ry, 0, Math.PI, 0, true);
    g.lineTo(x + rx, y);
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI, false);
    g.fill();
    g.strokeStyle = `rgba(80,160,175,${0.3 * sl})`;
    g.lineWidth = 1.2;
    g.beginPath(); g.ellipse(x, y + d, rx, ry, 0, 0, Math.PI); g.stroke();

    g.fillStyle = k3([18, 52, 68]);
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill();
    g.save();
    g.translate(x - 4, y);
    g.scale(1, (ry / rx) * 1.1);
    const pool = g.createRadialGradient(0, 0, 0, 0, 0, rx * 0.85);
    const sc = LX.on ? LX.spotCol : SPOT_TEAL, hotc = mixc(sc, [255, 255, 255], 0.7).map(v => v | 0), midc = sc.map(v => v | 0), lowc = sc.map(v => (v * 0.5) | 0);
    pool.addColorStop(0, `rgba(${hotc},${TUNE.pool * I * spot})`);
    pool.addColorStop(0.4, `rgba(${midc},${0.7 * TUNE.pool * I * spot})`);
    pool.addColorStop(0.75, `rgba(${lowc},${0.35 * TUNE.pool * I * spot})`);
    pool.addColorStop(1, 'rgba(20,60,70,0)');
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = pool;
    g.beginPath(); g.arc(0, 0, rx * 0.85, 0, TAU); g.fill();
    g.restore();
    g.globalCompositeOperation = 'source-over';
    const rimc = LX.on ? mixc(LX.spotCol, [255, 255, 255], 0.35).map(v => v | 0).join(',') : '150,235,230';
    g.strokeStyle = `rgba(${rimc},${(0.25 * sl + 0.45 * spot) * Math.min(1, I)})`;
    g.lineWidth = 1.8;
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.stroke();
    g.strokeStyle = `rgba(120,220,215,${0.25 * sl})`;
    g.lineWidth = 1;
    g.beginPath(); g.ellipse(x, y, rx * 0.9, ry * 0.8, 0, 0, TAU); g.stroke();
  }

  // ---------- the rig in 3D (show / live) ----------
  // A pinhole camera at the audience's eye, fitted to the painting: x right, y down, z into the
  // picture. The satellite hangs above the stage at its depth; the crowd's heads make a floor
  // plane; the stands are a bowl (cylinder) round the arena; there is a roof above. The painting
  // itself is the zero orientation, so nothing moves until the rig is turned.
  const CAM = { F: 1000, cx: 768, cy: 560 };
  const HF = 10;                                       // crowd-head plane, below eye level
  const Z0 = (CAM.F * HF) / (STAGE.y - CAM.cy);        // stage (and satellite) depth
  const O3 = [((ORB.x - CAM.cx) * Z0) / CAM.F, ((ORB.y - CAM.cy) * Z0) / CAM.F, Z0]; // satellite centre
  const RING3 = (ORB.ring * Z0) / CAM.F, RS = (ORB.rx * Z0) / CAM.F, RB = 46, ROOF = O3[1] - 22, ZNEAR = 4;
  const CROWN_Z = Math.sqrt(RS * RS - RING3 * RING3); // how far forward of the centre the ring of heads sits
  // The eye. At rest it is the painting's own (origin, level, F 1000). Another seat moves it (E),
  // turns it (yaw, + to the right), tips it (pitch, + looking down) and zooms; toCam maps the world
  // into that eye's frame. With the eye at rest every function below reduces to the original.
  const VIEW = { E: [0, 0, 0], yaw: 0, pitch: 0, zoom: 1, on: false, cyw: 1, syw: 0, cp: 1, sp: 0, Fz: CAM.F, Oc: null };
  const camDir = v => {
    if (!VIEW.on) return v;
    let [x, y, z] = v;
    [x, z] = [x * VIEW.cyw - z * VIEW.syw, x * VIEW.syw + z * VIEW.cyw];
    [y, z] = [y * VIEW.cp - z * VIEW.sp, y * VIEW.sp + z * VIEW.cp];
    return [x, y, z];
  };
  const toCam = P => (VIEW.on ? camDir([P[0] - VIEW.E[0], P[1] - VIEW.E[1], P[2] - VIEW.E[2]]) : P);
  const camDepth = P => (VIEW.on ? toCam(P)[2] : P[2]);
  const proj0 = P => { const c = toCam(P); return [CAM.cx + (VIEW.Fz * c[0]) / c[2], CAM.cy + (VIEW.Fz * c[1]) / c[2]]; };
  // the ball and the stage on screen from the current eye (at rest: the painting's)
  const ORBV = { x: ORB.x, y: ORB.y, rx: ORB.rx, ry: ORB.ry, s: 1 };
  const STAGEV = { x: STAGE.x, y: STAGE.y, s: 1, sq: 1 };
  // draw stage-anchored 2D art (deck, pools, spill) as seen from the current eye
  const stageXf = g => { if (VIEW.on) g.transform(STAGEV.s, 0, 0, STAGEV.s * STAGEV.sq, STAGEV.x - STAGEV.s * STAGE.x, STAGEV.y - STAGEV.s * STAGEV.sq * STAGE.y); };
  const stagePt = (x, y) => [STAGEV.x + STAGEV.s * (x - STAGE.x), STAGEV.y + STAGEV.s * STAGEV.sq * (y - STAGE.y)];
  // The painter drew the satellite square-on although we look up at it. Geometry on and near the
  // sphere is projected about the sphere's centre (perspective scale, no skew), blending into the
  // true projection a little way out, so the lamp sits mid-sphere at rest as in the painting.
  function proj(P) {
    const dx = P[0] - O3[0], dy = P[1] - O3[1], dz = P[2] - O3[2], r = Math.hypot(dx, dy, dz);
    const q = proj0(P);
    if (r > RS * 3.5) return q;
    const Pc = toCam(P), Oc = VIEW.on ? VIEW.Oc : O3, k = Oc[2] / Pc[2];
    const o = [ORBV.x + (VIEW.Fz * (Pc[0] - Oc[0]) * k) / Oc[2], ORBV.y + (VIEW.Fz * (Pc[1] - Oc[1]) * k) / Oc[2]];
    const w = CS.clamp((r - RS * 1.5) / (RS * 2), 0, 1);
    return [o[0] + (q[0] - o[0]) * w, o[1] + (q[1] - o[1]) * w];
  }
  const add3 = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
  const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const norm3 = v => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };
  const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  // body → world: roll (spins the ring in its own plane), then pitch (top toward/away from us), then yaw
  function rot3(v) {
    const r = LX.rot * D2R, pt = LX.pitch * D2R, yw = LX.yaw * D2R;
    let [x, y, z] = v;
    [x, y] = [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
    [y, z] = [y * Math.cos(pt) - z * Math.sin(pt), y * Math.sin(pt) + z * Math.cos(pt)];
    [x, z] = [x * Math.cos(yw) + z * Math.sin(yw), -x * Math.sin(yw) + z * Math.cos(yw)];
    return [x, y, z];
  }
  // the same without the roll: what the ball itself does when the ring spins inside it
  function rotYP(v) {
    const pt = LX.pitch * D2R, yw = LX.yaw * D2R;
    let [x, y, z] = v;
    [y, z] = [y * Math.cos(pt) - z * Math.sin(pt), y * Math.sin(pt) + z * Math.cos(pt)];
    [x, z] = [x * Math.cos(yw) + z * Math.sin(yw), -x * Math.sin(yw) + z * Math.cos(yw)];
    return [x, y, z];
  }
  // rotate v about unit axis k by angle a (Rodrigues)
  function axisRot(v, k, a) {
    const c = Math.cos(a), s1 = Math.sin(a), kv = cross3(k, v), d = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
    return [v[0] * c + kv[0] * s1 + k[0] * d * (1 - c), v[1] * c + kv[1] * s1 + k[1] * d * (1 - c), v[2] * c + kv[2] * s1 + k[2] * d * (1 - c)];
  }
  // where a ray from C along d meets the room: crowd floor, stands, roof, or (never past) the camera
  function hit3(C, d) {
    let t = 1e9, surf = 'none';
    if (d[1] > 1e-4) { const tf = (HF - C[1]) / d[1]; if (tf > 0 && tf < t) { t = tf; surf = 'floor'; } }
    if (d[1] < -1e-4) { const tr = (ROOF - C[1]) / d[1]; if (tr > 0 && tr < t) { t = tr; surf = 'roof'; } }
    const ax = d[0], az = d[2], bx = C[0], bz = C[2] - Z0, A = ax * ax + az * az;
    if (A > 1e-6) {
      const B = 2 * (ax * bx + az * bz), Cc = bx * bx + bz * bz - RB * RB, disc = B * B - 4 * A * Cc;
      if (disc > 0) { const tc = (-B + Math.sqrt(disc)) / (2 * A); if (tc > 0 && tc < t) { t = tc; surf = 'stand'; } }
    }
    if (d[2] < -1e-4) { const tz = (ZNEAR - C[2]) / d[2]; if (tz > 0 && tz < t) { t = tz; surf = 'near'; } }
    return { t, surf, floor: surf === 'floor', P: add3(C, d, t) };
  }
  // a cone from C along d, as the screen-space beam the 2D drawing code understands
  function beam3(C, d, half) {
    const h = hit3(C, d), S2 = proj(C), E = proj(h.P);
    const len = Math.max(1, Math.hypot(E[0] - S2[0], E[1] - S2[1]));
    const wEnd = (VIEW.Fz * 2 * h.t * Math.tan(half * D2R)) / camDepth(h.P);
    return { x: S2[0], y: S2[1], a: Math.atan2(E[1] - S2[1], E[0] - S2[0]), len, half: Math.atan(wEnd / 2 / len) / D2R, ex: E[0], ey: E[1], floor: h.floor, surf: h.surf, t: h.t, P: h.P };
  }
  // a head's aim in the satellite's own frame: its direction in the ring, tilted out of the ring by
  // the head tilt (+ toward the audience) and, for lasers, their own extra elevation
  function aimBody(f, i, extra = 0) {
    const el = f.spot ? 0 : (LX.tilt + LX.tiltScan * Math.sin(LX.tiltPh + i * 1.9) + extra - (f.e || 0)) * D2R;
    const a = f.a * D2R;
    return [Math.cos(a) * Math.cos(el), Math.sin(a) * Math.cos(el), -Math.sin(el)];
  }
  // a fixture's place and aim on the satellite this frame
  function fixture3(f, i = FIX.indexOf(f)) {
    // ring heads sit on a circle round the ball's face (the painting's ring); back heads on its far
    // side; the follow spot hangs at the bottom pole
    const pe = (f.pe || 0) * D2R, pa = f.pa * D2R;
    const pb = f.spot ? [0, RS, 0] : f.extra ? [RS * Math.cos(pa) * Math.cos(pe), RS * Math.sin(pa) * Math.cos(pe), RS * Math.sin(pe)] : [RING3 * Math.cos(pa), RING3 * Math.sin(pa) * 0.94, -CROWN_Z];
    // roll spins the ring of heads; yaw and pitch turn the whole ball (the spot is off the ring)
    const R3 = f.spot ? rotYP : rot3;
    const C = add3(O3, R3(pb)), n = norm3(R3(pb));
    // a head throws its light outward: never more than HEAD_REACH from the surface normal where it sits
    const d = towards(n, R3(aimBody(f, i)), HEAD_REACH);
    if (!f.spot) return { C, d, n, aimK: 1 };
    if (!LX.spotLock) {
      const off = Math.acos(CS.clamp(dot3(d, norm3(sub3(PERF3, C))), -1, 1)) / D2R;
      return { C, d, n, aimK: Math.exp(-((off / 6) ** 2)) };
    }
    // the follow spot tracks the performer, but only within its reach of straight down from the
    // pole: turn the ball too far and the beam slides off her
    const want = norm3(sub3(PERF3, C)), aim = towards(n, want, SPOT_REACH);
    const miss = Math.acos(CS.clamp(dot3(aim, want), -1, 1)) / D2R;
    return { C, d: aim, n, aimK: Math.exp(-((miss / 6) ** 2)) };
  }
  // dir, unless it is more than `reach` from the axis n; then the direction `reach` from n toward it
  function towards(n, dir, reach) {
    dir = norm3(dir);
    const ang = Math.acos(CS.clamp(dot3(n, dir), -1, 1));
    if (ang <= reach) return dir;
    const ax = cross3(n, dir), m = Math.hypot(ax[0], ax[1], ax[2]);
    return m < 1e-6 ? n.slice() : norm3(axisRot(n, ax.map(v => v / m), reach));
  }
  const HEAD_REACH = 40 * D2R, LASER_REACH = 45 * D2R;
  const SPOT_REACH = 40 * D2R; // how far the follow spot can swing from straight down on the ball
  // where the follow spot aims: the stage floor at the performer's feet
  const PERF3 = [((PERF.x - CAM.cx) * Z0) / CAM.F, HF, Z0];
  // how much of the follow spot is actually on the performer this frame (1 = square on her)
  let spotAim = 1;
  const spotTrack = () => (LX.on ? fixture3(FIX[4], 4).aimK : 1);

  let lasers = []; // this frame's laser lines in 3D (and on screen): soft in the paint, crisp on top
  let glare = [];  // light reaching the camera's lens this frame: fixtures and lasers aimed at it
  let domCol = null; // dominant colour of what's lit this frame
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  // haze scatters mostly forward: a cone swung toward the camera glows far brighter than one aimed
  // away (1 for a cone across the view, ~2.25 straight at us, ~0.45 straight away)
  const fromEye = C => (VIEW.on ? sub3(C, VIEW.E) : C);
  const fwdScatter = (C, d) => { const v = fromEye(C); return Math.pow(1.5, -2 * dot3(d, v) / Math.hypot(v[0], v[1], v[2])); };
  // angle (degrees) between a ray from C along d and the line from C to the camera
  const offLens = (C, d) => { const v = fromEye(C); return Math.acos(CS.clamp(-dot3(d, v) / Math.hypot(v[0], v[1], v[2]), -1, 1)) / D2R; };

  // Hand-made frames: each one redraws the lights a touch differently, as an animator redrawing
  // every cel would: aims wander a fraction of a degree, cones breathe, levels flicker. hb is the
  // hand-made frame number (null when motion is smooth); hj(k) is a repeatable -1..1 for slot k.
  let hb = null;
  const hj = k => { if (hb === null) return 0; const x = Math.sin(k * 127.1 + hb * 311.7) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; };
  const hjv = (k, amp) => [hj(k) * amp, hj(k + 0.37) * amp, hj(k + 0.71) * amp];

  // whether laser line `id` is among the share firing in this draw (a fresh random pick per fireWin)
  const fires = id => { if (LX.fireFrac >= 1) return true; const x = Math.sin(id * 12.9898 + LX.fireWin * 78.233) * 43758.5453; return x - Math.floor(x) < LX.fireFrac; };
  // one laser line from C along dir; strength k; reaches the lens → glare
  function shootFrom(C, dir, k, col, start, id) {
    if (id !== undefined && !fires(id)) return;
    if (hb !== null) { dir = norm3(add3(dir, hjv(lasers.length * 3 + 101, 0.0025))); k *= 1 + 0.08 * hj(lasers.length + 501); }
    const h = hit3(C, dir), P0 = add3(C, dir, start), P1 = h.P;
    lasers.push({ P0, P1, s0: proj(P0), s1: proj(P1), col, a: k, surf: h.surf, toward: Math.max(0, -dir[2]) });
    const tl = offLens(C, dir);
    // straight down the lens a laser blinds; a few degrees off, the haze round its line still flares
    if (tl < 7) glare.push({ C, k: k * (3.2 * Math.exp(-((tl / 0.9) ** 2)) + 0.18 * Math.exp(-((tl / 3.5) ** 2))), col, size: 0.008, laser: true });
  }
  // The burst: single beams spread evenly over the whole sphere (a Fibonacci lattice in the
  // satellite's frame), each leaving the glass along its own direction and wandering a little.
  // Each beam belongs to the nearest head, which sets its colour and level.
  const burstCache = new Map();
  function burstDirs(n) {
    if (!burstCache.has(n)) {
      const Rb = CS.rng(707 + n), heads = FIX.map((f, i) => ({ f, i })).filter(h => h.f.len && !h.f.spot);
      const out = [];
      for (let k = 0; k < n; k++) {
        const y = 1 - (2 * (k + 0.5)) / n, r = Math.sqrt(1 - y * y), a = k * 2.399963 + 0.3;
        const d = [r * Math.cos(a), y, r * Math.sin(a)];
        let best = heads[0], bd = -2;
        for (const h of heads) {
          const e = (h.f.e || 0) * D2R, hd = [Math.cos(h.f.a * D2R) * Math.cos(e), Math.sin(h.f.a * D2R) * Math.cos(e), Math.sin(e)];
          const dd = dot3(hd, d);
          if (dd > bd) { bd = dd; best = h; }
        }
        const e1 = norm3(cross3(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), e2 = cross3(d, e1);
        out.push({ d, e1, e2, head: best.i, sp: 0.5 + Rb(), p1: Rb() * TAU, p2: Rb() * TAU, k: 0.6 + 0.4 * Rb() });
      }
      burstCache.set(n, out);
    }
    return burstCache.get(n);
  }

  // resolve every fixture for this frame: where it sits and aims, levels, colour, tinted texture
  function frameLights(S) {
    const tL = S.clocks.lights, I = S.intensity * (LX.on ? LX.gain : 1);
    const pulse = 0.9 + 0.1 * Math.pow(0.5 + 0.5 * Math.cos(((tL * S.bpm) / 60) * TAU), 3);
    const list = [];
    lasers = [];
    glare = [];
    hb = LX.on && S.handmade ? S.boilF || 0 : null;
    FIX.forEach((f, i) => {
      if (!f.len || (f.extra && !LX.on) || (LX.on && !f.spot && !LX.groups[groupOf(f)])) return;
      const lv = LX.on ? LX.lv[i] : DEFAULT_LV, col = LX.on ? LX.col[i] : TEAL;
      const flick = f.spot ? 1 : 0.94 + 0.06 * Math.sin(tL * 3.1 + i * 2.3);
      const a = I * flick * (f.spot ? (LX.on ? LX.spot : 1) : pulse) * TUNE.beamGain * (TUNE['b' + i] ?? 1) * (1 + 0.07 * hj(i * 17 + 6));
      const tex = LX.on && lv.beam + lv.proj > 0 ? recolor(beamTex[i], col, tintCv[i]) : beamTex[i];
      const half0 = f.half * TUNE.beamHalf * (1 + 0.05 * hj(i * 17 + 5));
      let B, C = null, d = null;
      if (!LX.on) {
        // the painting's own beams (and a follow spot that keeps tracking the performer)
        const p = fixturePos(f, tL);
        B = { x: p.x, y: p.y, a: p.a + 0.006 * hj(i * 17 + 4), len: f.len, half: half0, floor: false, facing: 0 };
      } else {
        ({ C, d } = fixture3(f, i));
        if (hb !== null) d = norm3(add3(d, hjv(i * 17 + 1, 0.006)));
        B = beam3(add3(C, d, 0.45), d, half0); // from the lens, at the can's outer end
      }
      // a cone that opens across more of the frame (one coming toward us) spreads the same light
      // over more of the picture: dim it by how much wider it is than its side-on width
      const fw = d ? fwdScatter(C, d) * Math.pow(CS.clamp(half0 / Math.max(half0, B.half), 0.03, 1), 0.85) : 1;
      list.push({ f, i, lv, col, a, tex, B, C, d, half0, fw });
      if (!d || a <= 0) return;
      // a cone looking down the lens: its core, and the haze glow around it when merely close
      const th = offLens(C, d), hp = LX.goboZoom;
      const kb = lv.beam * (1.6 * Math.exp(-((th / half0) ** 2)) + 0.22 * Math.exp(-((th / (half0 * 3.5)) ** 2)));
      const kp = lv.proj * 0.9 * LX.projAlpha * Math.exp(-((th / hp) ** 2));
      if (kb > 0.01) glare.push({ C, k: kb * a, col, size: 0.012 + 0.03 * Math.exp(-((th / half0) ** 2)) });
      if (kp > 0.01) glare.push({ C, k: kp * a, col: LX.projCol || col, size: 0.015 });
      if (lv.laser <= 0 && lv.fan <= 0) return;
      // lasers: their own aim, out of the ring's plane and scanning, so they reach the far stands,
      // the floor and the people right at the camera
      const ab = f.a * D2R, side = [-Math.sin(ab), Math.cos(ab), 0], nrm = norm3(sub3(C, O3));
      const dl = towards(nrm, rot3(aimBody(f, i, LX.laserTilt + LX.laserScan * Math.sin(i * 1.7))), LASER_REACH);
      const shoot = (dir, k, id) => shootFrom(C, dir, k * I, col, 0.35, id);
      if (lv.laser > 0) shoot(dl, lv.laser, 1000 + i);
      if (lv.fan > 0) {
        // the fan opens about an axis that turns with the satellite: fanTwist 0 lays it in the
        // ring's plane, 90 stands it up as a sheet from the far stands to the front rows
        const n = rot3([0, 0, 1]), sw = rot3(side), tw = LX.fanTwist * D2R;
        const axis = norm3(add3(n.map(v => v * Math.cos(tw)), sw, Math.sin(tw)));
        for (let k = 0; k < 13; k++) shoot(towards(nrm, axisRot(dl, axis, (LX.fanScan + (k / 12 - 0.5) * LX.fanSpread) * D2R), LASER_REACH + 10 * D2R), lv.fan * 0.8, 2000 + i * 16 + k);
      }
    });
    if (LX.on) {
      const tW = Math.tan(LX.burstSpread * D2R);
      for (const [bk, b] of burstDirs(LX.burstCount).entries()) {
        const lvb = LX.lv[b.head].burst;
        if (!(lvb > 0) || !LX.groups[groupOf(FIX[b.head])]) continue;
        const ph = LX.burstPh * b.sp, u = Math.sin(ph + b.p1) * tW, v = Math.cos(ph * 0.83 + b.p2) * tW;
        const db = norm3(add3(b.d, add3(b.e1.map(c => c * u), b.e2, v)));
        const dw = rot3(db);
        shootFrom(add3(O3, dw, RS * 1.02), dw, lvb * b.k * I, LX.col[b.head], 0, bk);
      }
    }
    return list;
  }

  // red and blue copies of each beam texture, for dispersion fringes
  const fringeCache = {};
  const fringeTex = i => fringeCache[i] || (fringeCache[i] = { r: recolor(beamTex[i], [255, 60, 40], CS.canvas(512, 192)), b: recolor(beamTex[i], [60, 110, 255], CS.canvas(512, 192)) });

  // Smoke: a tileable churning field the beams' glow is multiplied through, and that the room's
  // light picks out on its own.
  let smokeTex = null;
  function smokeField() {
    if (smokeTex) return smokeTex;
    const N = 256, c = CS.canvas(N, N), g = c.getContext('2d'), id = g.createImageData(N, N), n = CS.noise2(515, 8), n2 = CS.noise2(516, 16);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const v = CS.fbm(n, x / 32, y / 32, 4, 8) * 0.7 + CS.fbm(n2, x / 16, y / 16, 3, 16) * 0.3;
      const k = Math.round(255 * CS.clamp(0.15 + 1.5 * (v - 0.3), 0.12, 1)), o = (y * N + x) * 4;
      id.data[o] = id.data[o + 1] = id.data[o + 2] = k;
      id.data[o + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    return (smokeTex = c);
  }
  // fill a context with the smoke field, drifting with LX.smokeT, at a scale
  function fillSmoke(g, w, h, scale, dx, dy) {
    const pat = g.createPattern(smokeField(), 'repeat');
    g.save();
    g.translate(dx, dy);
    g.scale(scale, scale);
    g.fillStyle = pat;
    g.fillRect(-dx / scale, -dy / scale, w / scale, h / scale);
    g.restore();
  }

  // a pool of light where a cone lands on the floor crowd
  function pool(g, b, col, a, foot) {
    const x = b.x + Math.cos(b.a) * b.len, y = b.y + Math.sin(b.a) * b.len;
    const w = Math.min(500, b.len * Math.tan(b.half * D2R) * (foot ? 1.5 : 1.1)), sq = b.surf === 'stand' ? 0.8 : 0.3;
    g.globalAlpha = CS.clamp(a * (foot ? 0.9 : 0.3), 0, 1);
    g.drawImage(glowFor(col), x - w, y - w * sq, w * 2, w * sq * 2);
    g.globalAlpha = 1;
  }

  // ---------- gobos ----------
  // A projector's gobo is a metal stencil in its gate: holes (dots) and slots (polylines) on the
  // unit disc. The lens throws the stencil down the cone, so in the haze each hole is its own shaft,
  // and wherever the cone lands (heads on the floor, faces in the stands) it prints the pattern,
  // turning with the gobo wheel and with the satellite.
  const circ = (r, n, a0 = 0) => Array.from({ length: n + 1 }, (_, k) => [r * Math.cos(a0 + (k / n) * TAU), r * Math.sin(a0 + (k / n) * TAU)]);
  const chord = c => { const e = Math.sqrt(1 - c * c) * 0.96; return e; };
  const GOBOS = (() => {
    const G = {}, GR = CS.rng(404);
    G.dots = { dots: [[0, 0, 0.13], ...circ(0.72, 8).slice(0, 8).map(([u, v]) => [u, v, 0.13])] };
    G.rings = { lines: [circ(0.95, 44), circ(0.5, 26)], w: 0.075 };
    G.tunnel = { lines: [circ(0.97, 56)], w: 0.07 };
    G.star = { lines: Array.from({ length: 7 }, (_, k) => { const a = (k / 7) * TAU; return [[0.15 * Math.cos(a), 0.15 * Math.sin(a)], [Math.cos(a) * 0.98, Math.sin(a) * 0.98]]; }), w: 0.085 };
    G.grid = { lines: [-0.62, 0, 0.62].flatMap(c => [[[c, -chord(c)], [c, chord(c)]], [[-chord(c), c], [chord(c), c]]]), w: 0.065 };
    G.bars = { lines: [-0.75, -0.375, 0, 0.375, 0.75].map(c => [[c, -chord(c)], [c, chord(c)]]), w: 0.1 };
    G.spiral = { lines: [Array.from({ length: 61 }, (_, k) => { const q = k / 60, r = 0.12 + 0.86 * q, a = q * TAU * 1.6; return [r * Math.cos(a), r * Math.sin(a)]; })], w: 0.075 };
    G.flower = { lines: Array.from({ length: 6 }, (_, k) => { const a = (k / 6) * TAU; return Array.from({ length: 17 }, (_, j) => { const q = (j / 16) * TAU, pu = 0.55 + 0.38 * Math.cos(q), pv = 0.2 * Math.sin(q); return [pu * Math.cos(a) - pv * Math.sin(a), pu * Math.sin(a) + pv * Math.cos(a)]; }); }), w: 0.06 };
    const bd = [];
    for (let n = 0; bd.length < 30 && n < 4000; n++) {
      const r = 0.95 * Math.sqrt(GR()), a = GR() * TAU, z = 0.06 + GR() * 0.1, u = r * Math.cos(a), v = r * Math.sin(a);
      if (Math.hypot(u, v) + z > 1) continue;
      if (bd.every(([x, y, q]) => Math.hypot(x - u, y - v) > (q + z) * 1.15)) bd.push([u, v, z]);
    }
    G.breakup = { dots: bd };
    for (const k in G) {
      const g = G[k];
      g.dots = g.dots || [];
      g.lines = g.lines || [];
      // slots resampled finely for printing (perspective bends them), coarser for haze shafts
      const resample = (ln, step) => {
        const out = [];
        for (let j = 0; j < ln.length - 1; j++) {
          const [u0, v0] = ln[j], [u1, v1] = ln[j + 1], n = Math.max(1, Math.round(Math.hypot(u1 - u0, v1 - v0) / step));
          for (let m = 0; m < n; m++) out.push([u0 + ((u1 - u0) * m) / n, v0 + ((v1 - v0) * m) / n]);
        }
        out.push(ln[ln.length - 1]);
        return out;
      };
      g.polys = g.lines.map(ln => resample(ln, 0.045));
      g.shafts = g.dots.map(d => d.slice()).concat(g.lines.flatMap(ln => resample(ln, 0.085).map(([u, v]) => [u, v, g.w * 0.5])));
      g.shaftK = Math.min(1, 2.4 / Math.sqrt(g.shafts.length));
    }
    return G;
  })();
  const GOBO_NAMES = Object.keys(GOBOS);
  const discCache = new Map();
  const discFor = col => {
    const key = col.map(v => (v / 16) | 0).join(',');
    if (!discCache.has(key)) {
      if (discCache.size >= 192) discCache.delete(discCache.keys().next().value);
      const c = CS.canvas(64, 64), g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      const cs = col.map(v => Math.min(255, v * 1.05 + 20) | 0).join(',');
      gr.addColorStop(0, `rgba(${cs},1)`); gr.addColorStop(0.62, `rgba(${cs},0.92)`); gr.addColorStop(0.85, `rgba(${cs},0.35)`); gr.addColorStop(1, `rgba(${cs},0)`);
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      discCache.set(key, c);
    }
    return discCache.get(key);
  };
  const goboOf = i => (LX.gobo === 'mix' ? GOBOS[GOBO_NAMES[(ORDER.indexOf(i) + (LX.goboSeed | 0) * 3 + GOBO_NAMES.length * 64) % GOBO_NAMES.length]] : GOBOS[LX.gobo]) || GOBOS.dots;

  // one projector: shafts in the haze (foot=false), or the printed pattern (foot=true)
  const projTint = {};
  function drawGobo(g, L, ap, foot) {
    const { f, i, C, d } = L;
    // the projector can carry its own colour, independent of the head's beam
    const col = LX.projCol || L.col;
    const tex = LX.projCol ? recolor(beamTex[i], col, projTint[i] || (projTint[i] = CS.canvas(512, 192))) : L.tex;
    ap *= LX.projAlpha;
    const G = goboOf(i), ab = f.a * D2R;
    // the gate's axes ride the satellite, squared up to the beam's axis
    const ax0 = rot3([-Math.sin(ab), Math.cos(ab), 0]), ax = norm3(add3(ax0, d, -dot3(ax0, d))), ay = cross3(d, ax);
    const tH = Math.tan(LX.goboZoom * D2R), spin = LX.goboSpin * (i % 2 ? -1 : 1), cs = Math.cos(spin), sn = Math.sin(spin);
    // a prism splits the cone into three turning copies of the pattern
    const copies = LX.prism ? [0, 1, 2].map(k => { const pa = LX.goboSpin * 0.45 + (k * TAU) / 3; return [0.5 * Math.cos(pa), 0.5 * Math.sin(pa), 0.55, 0.5]; }) : [[0, 0, 1, 1]];
    const dirOf = (u, v, cp) => {
      const uu = cp[0] + cp[2] * (u * cs - v * sn), vv = cp[1] + cp[2] * (u * sn + v * cs);
      return norm3([d[0] + tH * (uu * ax[0] + vv * ay[0]), d[1] + tH * (uu * ax[1] + vv * ay[1]), d[2] + tH * (uu * ax[2] + vv * ay[2])]);
    };
    if (!foot) {
      const Bc = beam3(C, d, LX.goboZoom * (LX.prism ? 1.5 : 1));
      drawBeam(g, tex, Bc.x, Bc.y, Bc.a, Bc.len, Bc.half, ap * 0.07);
      const sStep = LX.prism ? 2 : 1;
      for (const cp of copies) for (let si = 0; si < G.shafts.length; si += sStep) {
        const [u, v, r] = G.shafts[si];
        const b = beam3(C, dirOf(u, v, cp), Math.atan(r * cp[2] * tH) / D2R);
        drawBeam(g, tex, b.x, b.y, b.a, b.len, b.half, ap * G.shaftK * cp[3]);
      }
      return;
    }
    const ok = h => h.surf === 'floor' || h.surf === 'stand';
    const fall = h => CS.clamp(40 / (h.t + 12), 0.3, 1.5); // the further it throws, the thinner the light
    const e = 0.02;
    const at = (u, v, cp) => {
      const h = hit3(C, dirOf(u, v, cp));
      if (!ok(h)) return null;
      const E = proj(h.P), hu = proj(hit3(C, dirOf(u + e, v, cp)).P), hv = proj(hit3(C, dirOf(u, v + e, cp)).P);
      return { h, E, ju: [(hu[0] - E[0]) / e, (hu[1] - E[1]) / e], jv: [(hv[0] - E[0]) / e, (hv[1] - E[1]) / e] };
    };
    const rgbc = col.map(v => Math.min(255, v * 1.05 + 20) | 0).join(',');
    g.lineCap = 'round';
    for (const cp of copies) {
      const k0 = ap * cp[3];
      for (const [u, v, r] of G.dots) {
        const q = at(u, v, cp);
        if (!q) continue;
        const z = r;
        if (Math.hypot(q.ju[0], q.ju[1]) * z > 400) continue;
        g.save();
        g.transform(q.ju[0] * z, q.ju[1] * z, q.jv[0] * z, q.jv[1] * z, q.E[0], q.E[1]);
        for (let k = CS.clamp(k0 * fall(q.h) * 1.8, 0, 2.5); k > 0.01; k -= 1) { g.globalAlpha = Math.min(1, k); g.drawImage(discFor(col), -1, -1, 2, 2); }
        g.globalAlpha = 1;
        g.restore();
      }
      for (const ln of G.polys) {
        let prev = null;
        for (let li = 0; li < ln.length; li += LX.prism && li < ln.length - 2 ? 2 : 1) {
          const [u, v] = ln[li];
          const q = at(u, v, cp);
          if (q && prev && Math.hypot(q.E[0] - prev.E[0], q.E[1] - prev.E[1]) < 160) {
            const wpx = G.w * 0.5 * (Math.hypot(...q.ju) + Math.hypot(...q.jv) + Math.hypot(...prev.ju) + Math.hypot(...prev.jv)) / 2;
            const a = CS.clamp(k0 * fall(q.h) * 1.6, 0, 1);
            g.strokeStyle = `rgba(${rgbc},${a * 0.35})`;
            g.lineWidth = Math.min(120, wpx * 1.9);
            g.beginPath(); g.moveTo(prev.E[0], prev.E[1]); g.lineTo(q.E[0], q.E[1]); g.stroke();
            g.strokeStyle = `rgba(${rgbc},${a * 0.8})`;
            g.lineWidth = Math.min(80, wpx);
            g.beginPath(); g.moveTo(prev.E[0], prev.E[1]); g.lineTo(q.E[0], q.E[1]); g.stroke();
          }
          prev = q;
        }
      }
    }
  }

  // a laser line in perspective: thin at the satellite, swelling as it comes toward the camera
  // (on screen 1/z runs linearly along the line, so a trapezoid is exact)
  function laserQuad(g, s2, wMul, alpha, cut = 1) {
    const [x0, y0] = s2.s0, x1 = x0 + (s2.s1[0] - x0) * cut, y1 = y0 + (s2.s1[1] - y0) * cut;
    const z0 = camDepth(s2.P0), z1 = z0 + (camDepth(s2.P1) - z0) * cut;
    const w0 = (wMul * VIEW.Fz) / z0 * 0.05, w1 = Math.min(60, (wMul * VIEW.Fz) / Math.max(1, z1) * 0.05);
    const L2 = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / L2, ny = (x1 - x0) / L2;
    g.globalAlpha = CS.clamp(alpha, 0, 1);
    g.beginPath();
    g.moveTo(x0 + nx * w0, y0 + ny * w0); g.lineTo(x1 + nx * w1, y1 + ny * w1);
    g.lineTo(x1 - nx * w1, y1 - ny * w1); g.lineTo(x0 - nx * w0, y0 - ny * w0);
    g.fill();
    g.globalAlpha = 1;
  }
  // where a laser lands: a hot spot sized by its distance from the camera
  function laserHit(g, s2, alpha, mul = 1) {
    if (s2.surf !== 'floor' && s2.surf !== 'stand') return;
    const r = Math.min(70, (VIEW.Fz / camDepth(s2.P1)) * 0.09 * mul);
    g.globalAlpha = CS.clamp(alpha, 0, 1);
    g.drawImage(glowFor(s2.col), s2.s1[0] - r, s2.s1[1] - r * 0.6, r * 2, r * 1.2);
    g.globalAlpha = 1;
  }

  // all fixtures' light. foot=false: the volumetric shafts in the hazy air.
  // foot=true: the footprint version for the crowd-lighting buffer (wider, pools stronger).
  function drawLights(g, list, foot, lasFilter = null) {
    g.globalCompositeOperation = 'lighter';
    for (const L of list) {
      const { f, lv, col, a, tex, B } = L;
      const beam = (b, alpha, wm = 1) => drawBeam(g, tex, b.x, b.y, b.a, b.len, b.half, alpha, wm);
      if (lv.beam > 0 && a > 0) {
        const ab = a * lv.beam * (foot ? 1 : L.fw);
        if (!foot) {
          beam(B, ab);
          if (ab > 1) beam(B, ab - 1);
          if (LX.on && LX.disperse > 0) {
            // a prism's hairline spectrum: a red edge one side, a blue edge the other
            const fr = fringeTex(L.i);
            drawBeam(g, fr.r, B.x, B.y, B.a + 0.005, B.len, B.half * 1.02, ab * 0.2 * LX.disperse);
            drawBeam(g, fr.b, B.x, B.y, B.a - 0.005, B.len, B.half * 1.02, ab * 0.2 * LX.disperse);
          }
          if (LX.on) drawBeam(g, whiteTex[L.i], B.x, B.y, B.a, B.len, B.half, ab * 0.16); // hot core
          beam(B, ab * TUNE.beamScatter, 2.1);
        }
        // (the footprint pass lights only where the cone lands: the pool below, never the whole wedge)
        if (LX.on && (B.floor || B.surf === 'stand') && (!f.spot || spotAim < 0.95)) pool(g, B, col, a * lv.beam * (f.spot ? 1 - spotAim : 1), foot);
      }
      if (lv.proj > 0 && a > 0 && L.d) drawGobo(g, L, a * lv.proj * (foot ? 1 : L.fw), foot);
    }
    for (const s2 of lasers) {
      if (lasFilter && !lasFilter(s2)) continue;
      const c = s2.col.map(v => v | 0).join(',');
      g.fillStyle = `rgb(${c})`;
      // forward scatter: a laser coming toward us glows brighter in the haze
      const fwd = 1 + 1.5 * s2.toward * s2.toward;
      if (!foot) {
        laserQuad(g, s2, 5, s2.a * 0.1 * fwd);
        laserQuad(g, s2, 1.6, s2.a * 0.35 * fwd);
        laserHit(g, s2, s2.a * 0.7);
      } else laserHit(g, s2, s2.a, 1.6);
    }
    g.globalCompositeOperation = 'source-over';
  }

  // ---------- the satellite in 3D ----------
  // Glass sphere, ring truss and cans as real geometry: the ring is a projected circle split into
  // its far half (seen through the glass) and near half; each can is a cylinder along its aim with
  // a lens cap that faces us or turns away; the front lamp rides the sphere's surface.
  function hull(pts) {
    pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of pts) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  const poly = (g, pts) => { g.beginPath(); pts.forEach((q, k) => (k ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.closePath(); };
  // circle of radius r round centre P, perpendicular to unit n, projected
  function disc3(P, n, r, m = 18) {
    const u = norm3(cross3(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), v = cross3(n, u), out = [];
    for (let k = 0; k < m; k++) { const a = (k / m) * TAU; out.push(proj(add3(P, add3(u.map(c => c * Math.cos(a)), v, Math.sin(a)), r))); }
    return out;
  }
  const facingCam = (P, n) => -dot3(n, norm3(P)); // >0: the surface at P with normal n faces the lens
  // the satellite is drawn square-on (see proj), so what of it faces us is judged along the view axis
  const facingOrb = n => -camDir(n)[2];

  function drawCan(g, cn, I) {
    const { f, idx, C, d } = cn;
    const A = add3(C, d, -0.12), T = add3(C, d, 0.45), rc = 0.47;
    const dA = disc3(A, d, rc), dT = disc3(T, d, rc);
    const body = hull(dA.concat(dT));
    const sA = proj(A), sT = proj(T);
    const bg = g.createLinearGradient(sA[0], sA[1], sT[0], sT[1]);
    const ck = 0.12 + 0.88 * Math.min(1, amb);
    bg.addColorStop(0, `rgb(${4 * ck | 0},${9 * ck | 0},${12 * ck | 0})`); bg.addColorStop(1, `rgb(${18 * ck | 0},${42 * ck | 0},${51 * ck | 0})`);
    g.fillStyle = bg;
    poly(g, body); g.fill();
    g.strokeStyle = `rgba(90,160,175,${0.12 + 0.2 * Math.min(1, amb)})`; g.lineWidth = 0.8;
    poly(g, body); g.stroke();
    const fc = facingOrb(d);
    const L2 = LX.lv[idx], lc = LX.col[idx];
    const lvl = f.spot ? LX.spot : LX.groups[groupOf(f)] ? Math.max(L2.beam, L2.proj, L2.laser, L2.fan, L2.burst) : 0;
    if (fc > -0.2) {
      // the lens (edge-on when the head aims across our view): lit in the head's colour, brightest
      // looking straight down it
      const lit = (f.len ? 1 : 0.35) * Math.min(1, 0.05 * Math.min(1, amb) + 0.95 * Math.min(1, lvl));
      const hot = mixc(lc, [255, 255, 255], 0.8), mid = mixc(lc, [255, 255, 255], 0.35), edge = lc.map(v => v * 0.6);
      const ocz = VIEW.on ? VIEW.Oc[2] : O3[2], r = 10.5 * ORBV.s * (ocz / camDepth(T));
      const lens = g.createRadialGradient(sT[0], sT[1], 0, sT[0], sT[1], r);
      lens.addColorStop(0, `rgba(${hot.map(v => v | 0)},${lit})`);
      lens.addColorStop(0.5, `rgba(${mid.map(v => v | 0)},${lit})`);
      lens.addColorStop(1, `rgba(${edge.map(v => v | 0)},${lit * 0.8})`);
      // the lens rim projects to an ellipse: full height across the can, foreshortened along it
      // (kept a few pixels wide edge-on, as the painting shows it)
      const k = ORBV.s * (ocz / camDepth(T)), ang = Math.atan2(sT[1] - sA[1], sT[0] - sA[0]);
      const lr = 10.5 * k, lw = Math.max(3.2 * k, lr * Math.abs(d[2]));
      g.save();
      g.translate(sT[0], sT[1]); g.rotate(ang);
      g.fillStyle = '#020507';
      g.beginPath(); g.ellipse(0, 0, lw + 1, lr + 1, 0, 0, TAU); g.fill();
      g.restore();
      g.fillStyle = lens;
      g.save();
      g.translate(sT[0], sT[1]); g.rotate(ang);
      g.translate(-sT[0], -sT[1]);
      g.beginPath(); g.ellipse(sT[0], sT[1], lw * 0.9, lr * 0.9, 0, 0, TAU); g.fill();
      g.restore();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = CS.clamp(0.8 * lit * I * (0.35 + 0.65 * Math.max(0, fc)), 0, 1);
      const gs = 60 * (0.6 + 0.6 * Math.max(0, fc));
      g.drawImage(glowFor(lc), sT[0] - gs / 2, sT[1] - gs / 2, gs, gs);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    } else {
      g.fillStyle = '#081419';
      poly(g, dA); g.fill();
    }
  }

  // The satellite in 3D, as a solid ball: an opaque dark sphere that reflects the room's light, a
  // ring band round its face where the heads mount, a seam round its middle, heads on whichever
  // side faces us, and the front lamp. Lights only ever leave it outward.
  function drawOrb3D(g, t, I) {
    const { x, y, rx, ry } = ORBV, lit = Math.min(1, amb), bl = 0.1 + 0.9 * lit;
    const sh = c => `rgb(${(c[0] * bl) | 0},${(c[1] * bl) | 0},${(c[2] * bl) | 0})`;
    g.strokeStyle = sh([15, 39, 51]);
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(x - 3, 0); g.lineTo(x - 3, y - ry - 8); g.moveTo(x + 3, 0); g.lineTo(x + 3, y - ry - 8);
    for (let yy = 4; yy < y - ry - 10; yy += 8) { g.moveTo(x - 3, yy); g.lineTo(x + 3, yy + 6); }
    g.stroke();
    g.fillStyle = sh([11, 28, 38]);
    g.beginPath(); g.moveTo(x - 9, y - ry + 2); g.lineTo(x - 4, y - ry - 10); g.lineTo(x + 4, y - ry - 10); g.lineTo(x + 9, y - ry + 2); g.fill();

    // the ball: only as visible as the light in the room makes it
    const body = g.createRadialGradient(x - rx * 0.3, y - ry * 0.35, rx * 0.05, x, y, rx);
    body.addColorStop(0, sh([19, 39, 47])); body.addColorStop(0.55, sh([8, 21, 28])); body.addColorStop(1, sh([3, 8, 11]));
    g.fillStyle = body;
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill();
    g.save();
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.clip();
    // the stage's light on its underside, and the rig's own colour round its rim
    const sc = LX.spotCol.map(v => v | 0).join(','), under = g.createRadialGradient(x, y + ry * 1.05, 0, x, y + ry * 1.05, rx * 1.1);
    under.addColorStop(0, `rgba(${sc},${0.3 * LX.spot * spotAim})`); under.addColorStop(1, `rgba(${sc},0)`);
    g.fillStyle = under; g.fillRect(x - rx, y - ry, rx * 2, ry * 2);
    const rc = mixc([110, 215, 220], rigColour(), 0.6).map(v => v | 0).join(','), fr = g.createRadialGradient(x, y, rx * 0.72, x, y, rx);
    fr.addColorStop(0, `rgba(${rc},0)`); fr.addColorStop(1, `rgba(${rc},${0.3 * lit})`);
    g.fillStyle = fr; g.fillRect(x - rx, y - ry, rx * 2, ry * 2);

    // surface lines that turn with the rig: only the parts on the side facing us
    const band = (pts, w, dark, hi) => {
      for (let k = 0; k < pts.length - 1; k++) {
        const a = pts[k], b = pts[k + 1];
        const fa = facingOrb(sub3(a.P, O3)), fb = facingOrb(sub3(b.P, O3));
        if (fa < 0 && fb < 0) continue;
        g.strokeStyle = dark; g.lineWidth = w;
        g.beginPath(); g.moveTo(a.s[0], a.s[1]); g.lineTo(b.s[0], b.s[1]); g.stroke();
        if (hi) { g.strokeStyle = hi; g.lineWidth = 1; g.beginPath(); g.moveTo(a.s[0], a.s[1] - w * 0.4); g.lineTo(b.s[0], b.s[1] - w * 0.4); g.stroke(); }
      }
    };
    const circleOn = (fn, n = 72) => Array.from({ length: n + 1 }, (_, k) => { const P = add3(O3, rot3(fn((k / n) * TAU))); return { P, s: proj(P) }; });
    g.lineCap = 'round';
    band(circleOn(a => [RS * Math.cos(a), RS * Math.sin(a), 0]), 2, 'rgba(1,4,6,0.9)', `rgba(110,190,205,${0.35 * lit})`);
    band(circleOn(a => [RING3 * 1.02 * Math.cos(a), RING3 * 1.02 * Math.sin(a) * 0.94, -CROWN_Z * 0.97]), 7, '#03080c', `rgba(110,190,205,${0.42 * lit})`);
    g.lineCap = 'butt';
    g.restore();

    // heads on the side facing us, far ones first
    const cans = FIX.map((f, idx) => ({ f, idx, ...fixture3(f, idx) }))
      .filter(cn => facingOrb(norm3(sub3(cn.C, O3))) > -0.18)
      .sort((a, b) => b.C[2] - a.C[2]);
    for (const cn of cans) drawCan(g, cn, I);

    // the front lamp rides the ball: a disc on its surface, foreshortened as it turns away
    const e = rot3([0, 0, -1]), P = add3(O3, e, RS * 0.99), fc = facingOrb(e);
    if (fc > 0) {
      const ec = LX.eyeCol, ev = LX.eye * (0.35 + 0.65 * fc);
      const rgbs = c => c.map(v => Math.min(255, v) | 0).join(',');
      const sp = proj(P), r = 15 * ORBV.s * ((VIEW.on ? VIEW.Oc[2] : O3[2]) / camDepth(P));
      g.fillStyle = '#03090c';
      poly(g, disc3(P, e, 1.0, 24)); g.fill();
      const fl = g.createRadialGradient(sp[0], sp[1], 0, sp[0], sp[1], r);
      const gl = 0.06 * lit; // the unlit lamp glass only catches the room
      fl.addColorStop(0, `rgba(${rgbs(mixc(ec, [255, 255, 255], 0.9))},${gl + 0.94 * ev})`);
      fl.addColorStop(0.35, `rgba(${rgbs(mixc(ec, [255, 255, 255], 0.55))},${gl + 0.94 * ev})`);
      fl.addColorStop(0.8, `rgba(${rgbs(mixc(ec, [255, 255, 255], 0.1))},${gl + 0.94 * ev})`);
      fl.addColorStop(1, `rgba(${rgbs(ec.map(v => v * 0.45))},${0.1 * lit + 0.9 * Math.min(1, ev * 2)})`);
      g.fillStyle = fl;
      poly(g, disc3(P, e, 0.72, 24)); g.fill();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = CS.clamp(0.9 * I * ev * fc, 0, 1);
      g.drawImage(glowFor(ec), sp[0] - 50, sp[1] - 50, 100, 100);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }

    // a glossy coat: rim line and a soft specular from the room, fixed while the ball turns
    g.strokeStyle = `rgba(${mixc([150, 235, 232], rigColour(), 0.5).map(v => v | 0).join(',')},${0.04 + 0.7 * lit})`;
    g.lineWidth = 1.6;
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.stroke();
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = `rgba(200,255,250,${0.25 * lit})`;
    g.lineWidth = 4;
    g.beginPath(); g.ellipse(x, y, rx - 6, ry - 6, 0, 3.6, 4.5); g.stroke();
    g.globalAlpha = 0.5 * lit;
    g.drawImage(glowSoft, x - rx * 0.45 - 10, y - ry * 0.55 - 8, 20, 16);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  // Indirect light: whatever the rig puts into the room bounces round the bowl and is what lets us
  // see the stands and the crowd at all. The painting's own state (six beams and the spot at full)
  // is 1; with every fixture dark almost nothing is left (exit signs, phones, the desk).
  // Heads on the back light the far stands, so less of their light comes back toward us.
  function bounceLight() {
    let k = 0;
    FIX.forEach((f, i) => {
      if (!f.len || (!f.spot && !LX.groups[groupOf(f)])) return;
      const L2 = LX.lv[i];
      k += f.spot ? 0.6 * LX.spot : (f.back ? 0.6 : f.band ? 0.8 : 1) * (L2.beam + 0.5 * L2.proj * LX.projAlpha + 0.12 * L2.laser + 0.25 * L2.fan + 0.25 * L2.burst);
    });
    return k / 6.6;
  }
  let amb = 1; // this frame's indirect light on everything not lit directly (show/live only)
  // the room's light on the performer's sides: the rig's colour, as strong as the bounce
  const perfHaze = () => (LX.on ? [mixc(rigColour(), [255, 255, 255], 0.25), Math.min(1, amb)] : [[110, 210, 205], 1]);

  function render(g, S) {
    if (LX.on) (LX.mode === 'live' ? liveAt : showAt)(S.clocks.lights);
    amb = LX.on ? CS.clamp(0.03 + 0.97 * bounceLight() * Math.min(1.5, S.intensity * LX.gain), 0.03, 1.25) : 1;
    const tL = S.clocks.lights, tA = S.clocks.audience, tP = S.clocks.performer;
    spotAim = spotTrack();
    // what reaches the stage and the performer is only the part of the spot still on her
    const I = S.intensity * (LX.on ? LX.gain : 1), spot = LX.on ? LX.spot * spotAim : 1;
    const beat = (tL * S.bpm) / 60;
    const pulse = 0.9 + 0.1 * Math.pow(0.5 + 0.5 * Math.cos(beat * TAU), 3);

    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    const base = VIEW.on ? viewBase : arenaBase;
    g.drawImage(LX.on ? base : arena, 0, 0);
    if (amb < 1) { g.fillStyle = `rgba(0,0,0,${1 - amb})`; g.fillRect(0, 0, W, H); }
    else if (amb > 1) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = amb - 1; g.drawImage(base, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
    const sc = LX.on ? LX.spotCol : SPOT_TEAL, scs = sc.map(v => v | 0).join(',');

    // stage light hanging in the air at crowd level behind the stage: silhouettes the far floor
    g.save();
    stageXf(g);
    g.translate(STAGE.x, 655);
    g.scale(1, 0.16);
    let fh = g.createRadialGradient(0, 0, 0, 0, 0, 820);
    fh.addColorStop(0, `rgba(${scs},${TUNE.floorHaze * I * (0.35 + 0.65 * spot)})`);
    fh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fh;
    g.fillRect(-820, -820, 1640, 1640);
    g.restore();

    const list = frameLights(S);
    // Light that leaves the face of the ball toward us is in front of it; the rest is behind. The
    // two halves of the haze are drawn either side of the ball.
    const isFront = L => !!L.d && L.C[2] < O3[2] && L.d[2] < 0.1;
    const lasFront = s2 => s2.P0[2] < O3[2];
    frontLights = list.filter(isFront);
    if (LX.on) {
      hazeInto(hzB, list.filter(L => !isFront(L)), s2 => !lasFront(s2));
      hazeOnto(g, hzB);
    } else drawLights(g, list, false);

    if (LX.on) {
      // the room picks up the dominant colour of whatever is lit
      let wsum = 0;
      const wc = [0, 0, 0];
      list.forEach(L => { if (!L.f.spot) { const k = Math.max(L.lv.beam, L.lv.proj * 0.8, L.lv.laser * 0.4, L.lv.fan * 0.6, L.lv.burst * 0.6); wsum += k; for (let j = 0; j < 3; j++) wc[j] += L.col[j] * k; } });
      domCol = null;
      if (wsum > 0) {
        const wash = g.createRadialGradient(ORBV.x, ORBV.y + 150 * ORBV.s, 50 * ORBV.s, ORBV.x, ORBV.y + 150 * ORBV.s, 950 * ORBV.s);
        const c = wc.map(v => (v / wsum) | 0), k = Math.min(1, wsum / 6);
        domCol = { c, k };
        wash.addColorStop(0, `rgba(${c},${0.12 * k * I})`);
        wash.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = wash;
        g.fillRect(0, 0, W, H);
      }
    }

    if (LX.on && LX.smoke > 0) {
      // the smoke itself, lit by whatever is in the room
      const sk = LX.smoke * Math.min(1.2, amb) * 0.16;
      if (sk > 0.003) {
        const sm = smokeCv.getContext('2d');
        sm.globalCompositeOperation = 'copy';
        fillSmoke(sm, smokeCv.width, smokeCv.height, 1.8, LX.smokeT * 6, LX.smokeT * 2);
        sm.globalCompositeOperation = 'source-over';
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = Math.min(1, sk);
        g.drawImage(smokeCv, 0, 0, W, H);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
      }
    }

    // halo of scattered light around the orb
    const halo = g.createRadialGradient(ORBV.x, ORBV.y, 60 * ORBV.s, ORBV.x, ORBV.y, 300 * ORBV.s);
    const hc = LX.on ? rigColour().map(v => v | 0).join(',') : '40,170,175';
    halo.addColorStop(0, `rgba(${hc},${(LX.on ? 0.08 * Math.min(1, amb) : TUNE.halo) * I})`);
    halo.addColorStop(0.25, `rgba(${hc},${(LX.on ? 0.03 * Math.min(1, amb) : TUNE.halo * 0.35) * I})`);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = halo;
    g.fillRect(ORBV.x - 300 * ORBV.s, ORBV.y - 300 * ORBV.s, 600 * ORBV.s, 600 * ORBV.s);

    // dust in the follow spot
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = `rgb(${mixc(sc, [255, 255, 255], 0.6).map(v => v | 0)})`;
    // motes along wherever the spot's beam actually is (on her or not)
    const SB = (list.find(L => L.f.spot) || {}).B, spotLv = LX.on ? LX.spot : 1;
    if (SB) {
      const ca = Math.cos(SB.a), sa = Math.sin(SB.a), tH = Math.tan(SB.half * D2R);
      for (const p of dust) {
        const u = 0.12 + 0.8 * ((p.u + tL * p.sp) % 1), r = u * SB.len, half = r * tH;
        const off = p.v * half * 0.95 + Math.sin(tL * 0.6 + p.ph) * 4;
        g.globalAlpha = (0.12 + 0.28 * Math.abs(Math.sin(tL * 1.3 + p.ph))) * (1 - Math.abs(p.v) * 0.6) * I * spotLv;
        g.fillRect(SB.x + ca * r - sa * off, SB.y + sa * r + ca * off, p.s, p.s);
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';

    (LX.on ? drawOrb3D : drawOrb)(g, tL, I * pulse);
    if (LX.on) { hazeInto(hzF, frontLights, lasFront); hazeOnto(g, hzF); }

    // people go to the frame and to a buffer that receives the moving light
    // people go to the frame and to a buffer that receives the moving light. In show mode they
    // are drawn unlit, and their stage rim light is laid back on in the spot's live colour/level
    // (each person erases the rims behind them first, so occlusion holds).
    crowdOpts.armLit = LX.on ? `rgba(${mixc(sc, [255, 255, 255], 0.2).map(v => v | 0)},${0.35 + 0.5 * spot})` : undefined;
    const po = crowdOpts, pg = pplCv.getContext('2d'), rc = rimCv.getContext('2d');
    const cf = crowdFrame.getContext('2d');
    // people go down in batches; each batch is dimmed to this frame's indirect light in one pass
    const flushPeople = () => {
      if (!LX.on) return;
      pg.drawImage(crowdFrame, 0, 0); // the receiver gets the people undimmed
      if (amb < 1) { cf.globalCompositeOperation = 'source-atop'; cf.fillStyle = `rgba(0,0,0,${1 - amb})`; cf.fillRect(0, 0, W, H); cf.globalCompositeOperation = 'source-over'; }
      g.drawImage(crowdFrame, 0, 0);
      cf.clearRect(0, 0, W, H);
    };
    const person = p => {
      if (!LX.on) { CS.drawBaked(g, p, tA, po); return; }
      personOn(cf, p, tA, po, 'base');
      if (p.r * (VIEW.on ? p.vs : 1) < 2.2) return; // too small to carry a visible rim
      rc.globalCompositeOperation = 'destination-out';
      personOn(rc, p, tA, po, 'base');
      rc.globalCompositeOperation = 'source-over';
      personOn(rc, p, tA, po, 'lite');
    };
    const flushRims = keep => {
      if (!LX.on) return;
      rc.globalCompositeOperation = 'source-in';
      rc.fillStyle = `rgb(${scs})`;
      rc.fillRect(0, 0, W, H);
      rc.globalCompositeOperation = 'source-over';
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = Math.min(1, spot);
      g.drawImage(rimCv, 0, 0);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      if (keep) { const fg = rimFrontCv.getContext('2d'); fg.globalCompositeOperation = 'copy'; fg.drawImage(rimCv, 0, 0); fg.globalCompositeOperation = 'source-over'; }
      rc.clearRect(0, 0, W, H);
    };
    if (LX.on) { pg.clearRect(0, 0, W, H); rc.clearRect(0, 0, W, H); }
    let i = 0;
    if (VIEW.on) VIEW.back.forEach(person);
    else for (; i < people.length && (people[i].sortY ?? people[i].y) < STAGE.y + 4; i++) person(people[i]);
    flushPeople();
    flushRims(false);
    g.save();
    stageXf(g);
    drawStage(g, I, spot);
    g.restore();
    const pp = stagePt(PERF.x, PERF.y);
    CS.drawPerformer(g, pp[0], pp[1], PERF.s * STAGEV.s, tP, S.bpm, 'lit', spot, sc, ...perfHaze());
    if (VIEW.on) VIEW.front.forEach(person);
    else for (; i < people.length; i++) person(people[i]);
    flushPeople();
    flushRims(true);
    if (LX.on) {
      // a shaft above the heads is nearer than the people seen behind it: lay the haze back over them
      const hp = hzP.getContext('2d');
      hp.globalCompositeOperation = 'copy';
      hp.drawImage(hzB, 0, 0);
      hp.globalCompositeOperation = 'lighter';
      hp.drawImage(hzF, 0, 0);
      hp.globalCompositeOperation = 'destination-in';
      hp.drawImage(pplCv, 0, 0, hzP.width, hzP.height);
      hp.globalCompositeOperation = 'source-over';
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.85;
      g.drawImage(hzP, 0, 0, W, H);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }

    if (LX.on) {
      // moving light on the crowd: this frame's footprints × what can catch light (stands + people)
      const lg = lightCv.getContext('2d');
      lg.setTransform(1, 0, 0, 1, 0, 0);
      lg.globalCompositeOperation = 'source-over';
      lg.fillStyle = '#000';
      lg.fillRect(0, 0, lightCv.width, lightCv.height);
      lg.setTransform(0.5, 0, 0, 0.5, 0, 0);
      drawLights(lg, list, true);
      lg.setTransform(1, 0, 0, 1, 0, 0);
      if (domCol) {
        // the room's ambient light, in the colour of whatever is lit, falls on every surface
        lg.globalCompositeOperation = 'lighter';
        lg.fillStyle = `rgba(${domCol.c},${0.07 * domCol.k * I * Math.min(1.5, LX.crowd)})`;
        lg.fillRect(0, 0, lightCv.width, lightCv.height);
      }
      const rg = rcvCv.getContext('2d');
      rg.globalCompositeOperation = 'copy';
      rg.drawImage(VIEW.on ? viewRcv : rcvStatic, 0, 0);
      rg.globalCompositeOperation = 'source-over';
      rg.filter = 'grayscale(1) brightness(7)';
      rg.drawImage(pplCv, 0, 0, rcvCv.width, rcvCv.height);
      rg.filter = 'none';
      lg.globalCompositeOperation = 'multiply';
      lg.drawImage(rcvCv, 0, 0);
      lg.globalCompositeOperation = 'source-over';
      g.globalCompositeOperation = 'lighter';
      addTimes(g, lightCv, TUNE.crowdLight * LX.crowd, W, H);
      g.globalCompositeOperation = 'source-over';
    }

    // stage spill washing over the nearest heads around it
    g.globalCompositeOperation = 'lighter';
    g.save();
    stageXf(g);
    g.translate(STAGE.x, STAGE.y + 30);
    g.scale(1, 0.3);
    fh = g.createRadialGradient(0, 0, 0, 0, 0, 480);
    fh.addColorStop(0, `rgba(${scs},${0.1 * I * spot})`);
    fh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fh;
    g.fillRect(-480, -480, 960, 960);
    g.restore();
    g.globalCompositeOperation = 'source-over';

    // the canvas texture's light flecks shouldn't glow in a dark room
    g.globalAlpha = CS.clamp(TUNE.overlay * (LX.on ? Math.min(1, 0.15 + amb) : 1), 0, 1);
    g.drawImage(overlay, 0, 0);
    g.globalAlpha = 1;
    // nothing in the painting goes fully black: lift the floor to deep navy
    g.globalCompositeOperation = 'lighten';
    g.fillStyle = `rgb(${TUNE.liftR | 0},${TUNE.liftG | 0},${TUNE.liftB | 0})`;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
  }

  // Focal detail redrawn crisply over the paint pass (the painted copy shows through a little).
  function renderTop(g, S) {
    const tL = S.clocks.lights, beat = (tL * S.bpm) / 60;
    const pulse = 0.9 + 0.1 * Math.pow(0.5 + 0.5 * Math.cos(beat * TAU), 3);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    const layer = topLayer.getContext('2d');
    layer.clearRect(0, 0, W, H);
    // warm pinpricks in the crowd: too small for the paint filter, so they live up here
    const tA = S.clocks.audience;
    layer.globalCompositeOperation = 'lighter';
    for (const p of twinkles) {
      const a = 0.45 + 0.3 * Math.sin(tA * p.sp + p.ph) + 0.25 * Math.sin(tA * p.sp * 2.7 + p.ph * 3);
      if (a <= 0.05) continue;
      layer.globalAlpha = Math.min(1, a * TUNE.twinkle * (p.a0 ?? 1));
      if (VIEW.on) { const z = p.s * p.vs; layer.drawImage(glowWarm, p.vx - z / 2, p.vy - z / 2, z, z); }
      else layer.drawImage(glowWarm, p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
    layer.globalAlpha = 1;
    layer.globalCompositeOperation = 'source-over';
    (LX.on ? drawOrb3D : drawOrb)(layer, tL, S.intensity * pulse);
    if (LX.on && frontLights.length) {
      // light leaving the ball's face toward us crosses in front of it on the crisp layer too
      layer.save();
      layer.beginPath(); layer.ellipse(ORBV.x, ORBV.y, ORBV.rx + 2, ORBV.ry + 2, 0, 0, TAU); layer.clip();
      layer.globalCompositeOperation = 'lighter';
      layer.globalAlpha = 0.85;
      layer.drawImage(hzF, 0, 0, W, H);
      layer.restore();
    }
    // the figure render() just drew this frame, reused (same pose, same light)
    const pf = CS.drawPerformer.last;
    if (pf) layer.drawImage(pf.cv, pf.x, pf.y, pf.w, pf.h);
    else CS.drawPerformer(layer, PERF.x, PERF.y, PERF.s, S.clocks.performer, S.bpm, 'lit', LX.on ? LX.spot * spotAim : 1, LX.on ? LX.spotCol : undefined, ...perfHaze());
    g.globalAlpha = TUNE.topAlpha;
    g.drawImage(topLayer, 0, 0);
    // the crowd in front of the stage, again but crisp, over its painted copy: keeps the
    // rim light, hair edges and raised arms the paint filter would smear away
    const cl = crowdLayer.getContext('2d');
    cl.clearRect(0, 0, W, H);
    for (const p of VIEW.on ? VIEW.front : people) if ((p.sortY ?? p.y) >= STAGE.y + 4) personOn(cl, p, tA, crowdOpts, LX.on ? 'base' : 'c');
    if (LX.on && amb < 1) { cl.globalCompositeOperation = 'source-atop'; cl.fillStyle = `rgba(0,0,0,${1 - amb})`; cl.fillRect(0, 0, W, H); cl.globalCompositeOperation = 'source-over'; }
    if (LX.on) {
      cl.globalCompositeOperation = 'lighter';
      cl.globalAlpha = Math.min(1, LX.spot * spotAim);
      cl.drawImage(rimFrontCv, 0, 0);
      cl.globalAlpha = 1;
      cl.globalCompositeOperation = 'source-over';
      // the moving light lands on the crisp crowd too
      const mg = maskCv.getContext('2d');
      mg.globalCompositeOperation = 'copy';
      mg.drawImage(lightCv, 0, 0, W, H);
      mg.globalCompositeOperation = 'destination-in';
      mg.drawImage(crowdLayer, 0, 0);
      cl.globalCompositeOperation = 'lighter';
      addTimes(cl, maskCv, TUNE.crowdLight * LX.crowd, W, H);
      cl.globalCompositeOperation = 'source-over';
      // the haze in front of them, on the crisp crowd too
      mg.globalCompositeOperation = 'copy';
      mg.drawImage(hzP, 0, 0, W, H);
      mg.globalCompositeOperation = 'destination-in';
      mg.drawImage(crowdLayer, 0, 0);
      mg.globalCompositeOperation = 'source-over';
      cl.globalCompositeOperation = 'lighter';
      cl.globalAlpha = 0.85;
      cl.drawImage(maskCv, 0, 0);
      cl.globalAlpha = 1;
      cl.globalCompositeOperation = 'source-over';
    }
    g.globalAlpha = TUNE.crowdTop;
    g.drawImage(crowdLayer, 0, 0);
    g.globalAlpha = 1;
    if (lasers.length) { drawLasersOccluded(tA); g.globalCompositeOperation = 'lighter'; g.drawImage(laserLayer, 0, 0); g.globalCompositeOperation = 'source-over'; }
    lensFrame(S);
    if (LX.on && LX.labelA > 0) {
      // caption naming the control being exercised
      g.save();
      g.globalAlpha = LX.labelA;
      const [title, sub] = LX.label.split('  \u00b7  ');
      g.shadowColor = 'rgba(0,0,0,0.85)';
      g.shadowBlur = 10;
      g.font = '700 22px system-ui, -apple-system, Segoe UI, sans-serif';
      g.letterSpacing = '3px';
      g.fillStyle = 'rgba(225,250,246,0.95)';
      g.fillText(title, 52, H - 62);
      if (sub) {
        g.font = '400 17px system-ui, -apple-system, Segoe UI, sans-serif';
        g.letterSpacing = '0.5px';
        g.fillStyle = 'rgba(175,225,220,0.9)';
        g.fillText(sub, 52, H - 36);
      }
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(120,225,215,0.85)';
      g.fillRect(52, H - 92, 54, 3);
      g.restore();
    }
  }
  // Crisp lasers with occlusion, painter's-style: every laser is cut into pieces by depth and drawn
  // far to near, and each near-crowd person (then the performer and the stage) erases what has been
  // drawn behind them at their own depth. A laser passes in front of the people behind it and
  // vanishes behind anyone nearer the camera; where it lands it lights the head it hits.
  const NEAR_Y = 600; // above this on screen nobody in the near crowd can cover a laser
  function laserPiece(g, s2, t0, t1, wMul, alpha, off = 0) {
    const wl0 = (wMul * VIEW.Fz) / camDepth(s2.P0) * 0.05; // the line's width where it leaves the ball
    const P0 = add3(s2.P0, sub3(s2.P1, s2.P0), t0), P1 = add3(s2.P0, sub3(s2.P1, s2.P0), t1);
    const a = proj(P0), b = proj(P1);
    const w0 = (wMul * VIEW.Fz) / camDepth(P0) * 0.05, w1 = Math.min(60, (wMul * VIEW.Fz) / Math.max(1, camDepth(P1)) * 0.05);
    const L2 = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / L2, ny = (b[0] - a[0]) / L2;
    // offset sideways (dispersion fringes), growing toward the near end like the line's width
    if (off) { const o0 = (off * w0) / Math.max(0.3, wl0), o1 = (off * w1) / Math.max(0.3, wl0); a[0] += nx * o0; a[1] += ny * o0; b[0] += nx * o1; b[1] += ny * o1; }
    g.globalAlpha = CS.clamp(alpha, 0, 1);
    g.beginPath();
    g.moveTo(a[0] + nx * w0, a[1] + ny * w0); g.lineTo(b[0] + nx * w1, b[1] + ny * w1);
    g.lineTo(b[0] - nx * w1, b[1] - ny * w1); g.lineTo(a[0] - nx * w0, a[1] - ny * w0);
    g.fill();
  }
  function drawLasersOccluded(tA) {
    const lg = laserLayer.getContext('2d');
    lg.globalAlpha = 1;
    lg.globalCompositeOperation = 'source-over';
    lg.clearRect(0, 0, W, H);
    const pieces = [];
    for (const s2 of lasers) {
      const fwd = 1 + 1.5 * s2.toward * s2.toward;
      s2.cGlow = `rgb(${s2.col.map(v => v | 0)})`;
      s2.cCore = `rgb(${mixc(s2.col, [255, 255, 255], 0.55).map(v => v | 0)})`;
      s2.aGlow = s2.a * 0.4 * fwd;
      s2.aCore = s2.a * 0.95 * fwd;
      // in the eye's frame: the stretch above NEAR_Y can't be covered by the crowd; below it, pieces
      // every ~1.5 units deep. Depths are distances along the eye's view axis.
      const P0 = toCam(s2.P0), d = sub3(toCam(s2.P1), P0), yc = NEAR_Y - CAM.cy, F = VIEW.Fz;
      let tc = (yc * P0[2] - F * P0[1]) / (F * d[1] - yc * d[2]);
      if (!(tc > 0 && tc < 1)) tc = s2.s1[1] < NEAR_Y ? 1 : s2.s0[1] < NEAR_Y ? 1 : 0;
      const zAt = u => P0[2] + d[2] * u;
      if (tc > 0) {
        // above the crowd nobody can cover it, but the ball can: give it real depth, split where it
        // passes the ball's centre plane, so only what is behind the ball gets hidden
        const oz = VIEW.on ? VIEW.Oc[2] : O3[2], tz = Math.abs(d[2]) > 1e-6 ? (oz - P0[2]) / d[2] : -1;
        if (tz > 0 && tz < tc) { pieces.push({ s2, t0: 0, t1: tz, z: zAt(tz / 2) }); pieces.push({ s2, t0: tz, t1: tc, z: zAt((tz + tc) / 2) }); }
        else pieces.push({ s2, t0: 0, t1: tc, z: zAt(tc / 2) });
      }
      if (tc < 1) {
        const dz = Math.abs(d[2]) * (1 - tc), n = CS.clamp(Math.ceil(dz / 1.5), 1, 24);
        for (let k = 0; k < n; k++) {
          const t0 = tc + ((1 - tc) * k) / n, t1 = tc + ((1 - tc) * (k + 1)) / n;
          pieces.push({ s2, t0, t1, z: zAt((t0 + t1) / 2) });
        }
      }
      if (s2.surf === 'floor' || s2.surf === 'stand') pieces.push({ s2, hit: true, z: zAt(1) - 0.8 });
    }
    pieces.sort((a, b) => b.z - a.z);
    let pi = 0;
    lg.globalCompositeOperation = 'lighter';
    const drawTo = z => {
      for (; pi < pieces.length && pieces[pi].z > z; pi++) {
        const q = pieces[pi], s2 = q.s2;
        if (q.hit) { laserHit(lg, s2, s2.a * 0.9, 0.45); continue; }
        lg.fillStyle = s2.cGlow; laserPiece(lg, s2, q.t0, q.t1, 1.3, s2.aGlow);
        lg.fillStyle = s2.cCore; laserPiece(lg, s2, q.t0, q.t1, 0.4, s2.aCore);
        if (LX.disperse > 0) {
          lg.fillStyle = '#ff3c28'; laserPiece(lg, s2, q.t0, q.t1, 0.22, s2.aCore * 0.35 * LX.disperse, 1.4);
          lg.fillStyle = '#3c6eff'; laserPiece(lg, s2, q.t0, q.t1, 0.22, s2.aCore * 0.35 * LX.disperse, -1.4);
        }
      }
      lg.globalAlpha = 1;
    };
    const erase = fn => { lg.globalCompositeOperation = 'destination-out'; fn(); lg.globalCompositeOperation = 'lighter'; lg.globalAlpha = 1; };
    // the satellite is a solid ball: it hides whatever goes on behind it
    drawTo(VIEW.on ? VIEW.Oc[2] : O3[2]);
    erase(() => { lg.fillStyle = '#000'; lg.beginPath(); lg.ellipse(ORBV.x, ORBV.y, ORBV.rx, ORBV.ry, 0, 0, TAU); lg.fill(); });
    // performer and stage at the stage's depth
    drawTo((VIEW.on ? camDepth([PERF3[0], HF, Z0]) : Z0) - 1);
    const pf = CS.drawPerformer.last;
    erase(() => {
      if (pf) lg.drawImage(pf.cv, pf.x, pf.y, pf.w, pf.h);
      lg.save();
      stageXf(lg);
      lg.fillStyle = '#000';
      lg.beginPath(); lg.ellipse(STAGE.x, STAGE.y, STAGE.rx, STAGE.ry, 0, 0, TAU); lg.rect(STAGE.x - STAGE.rx, STAGE.y, STAGE.rx * 2, STAGE.d); lg.ellipse(STAGE.x, STAGE.y + STAGE.d, STAGE.rx, STAGE.ry, 0, 0, TAU); lg.fill();
      lg.restore();
    });
    for (const p of VIEW.on ? VIEW.front : people) {
      const py = p.sortY ?? p.y;
      if (py < STAGE.y + 4) continue;
      drawTo(VIEW.on ? p.vz : (CAM.F * HF) / Math.max(1, py - CAM.cy));
      if (pi >= pieces.length) break;
      erase(() => personOn(lg, p, tA, crowdOpts, 'base'));
    }
    drawTo(-1e9);
    lg.globalCompositeOperation = 'source-over';
  }


  // the beams' haze for a set of lights into a half-size buffer (black = no light)
  let frontLights = [];
  function hazeInto(cv, sub, lasFilter) {
    const hz = cv.getContext('2d');
    hz.setTransform(1, 0, 0, 1, 0, 0);
    hz.globalCompositeOperation = 'source-over';
    hz.fillStyle = '#000';
    hz.fillRect(0, 0, cv.width, cv.height);
    hz.setTransform(0.5, 0, 0, 0.5, 0, 0);
    drawLights(hz, sub, false, lasFilter);
    hz.setTransform(1, 0, 0, 1, 0, 0);
  }
  // add a haze buffer to the frame; through smoke, part of it is multiplied through the churning
  // smoke field so the cones billow and break up
  function hazeOnto(g, cv) {
    g.globalCompositeOperation = 'lighter';
    const k = LX.smoke;
    if (k > 0) {
      const sm = smokeCv.getContext('2d');
      g.globalAlpha = 1 - 0.55 * k;
      g.drawImage(cv, 0, 0, W, H);
      sm.globalCompositeOperation = 'copy';
      sm.drawImage(cv, 0, 0);
      sm.globalCompositeOperation = 'multiply';
      fillSmoke(sm, smokeCv.width, smokeCv.height, 1.3, -LX.smokeT * 14, LX.smokeT * 5);
      fillSmoke(sm, smokeCv.width, smokeCv.height, 2.6, LX.smokeT * 9, -LX.smokeT * 3);
      sm.globalCompositeOperation = 'source-over';
      addTimes(g, smokeCv, 2.6 * k, W, H);
    } else g.drawImage(cv, 0, 0, W, H);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  // ---------- seats ----------
  // A different seat re-projects the scene. The lights and the ball are true 3D already. The painted
  // bowl is re-projected through the room's geometry (floor, stands, roof) as the painting's eye saw
  // it; people on the floor are put back on the head plane and redrawn at their new size and depth
  // order; the stage, the performer and the phone lights move with the room.
  const SEATS = {
    painting: { E: [0, 0, 0], yaw: 0, pitch: 0, zoom: 1 },
    // a lower-bowl seat: up a few rows and a little to the right, looking down onto the floor, zoomed in a touch
    lower: { E: [7, -12, -5], yaw: -7, pitch: 10, zoom: 1.3 },
  };
  let viewBase = null, viewRcv = null;
  function setView(v) {
    Object.assign(VIEW, v);
    VIEW.on = !!(VIEW.E[0] || VIEW.E[1] || VIEW.E[2] || VIEW.yaw || VIEW.pitch || VIEW.zoom !== 1);
    VIEW.cyw = Math.cos(VIEW.yaw * D2R); VIEW.syw = Math.sin(VIEW.yaw * D2R);
    VIEW.cp = Math.cos(VIEW.pitch * D2R); VIEW.sp = Math.sin(VIEW.pitch * D2R);
    VIEW.Fz = CAM.F * VIEW.zoom;
    VIEW.Oc = toCam(O3);
    if (!VIEW.on) {
      Object.assign(ORBV, { x: ORB.x, y: ORB.y, rx: ORB.rx, ry: ORB.ry, s: 1 });
      Object.assign(STAGEV, { x: STAGE.x, y: STAGE.y, s: 1, sq: 1 });
      return;
    }
    const oc = proj0(O3), so = (VIEW.Fz / VIEW.Oc[2]) / (CAM.F / Z0);
    Object.assign(ORBV, { x: oc[0], y: oc[1], rx: ORB.rx * so, ry: ORB.ry * so, s: so });
    // the stage deck: where its centre lands, its size, and how much rounder it reads from above
    const Ws = [((STAGE.x - CAM.cx) * Z0) / CAM.F, HF, Z0], sc = proj0(Ws), zs = camDepth(Ws), vE = sub3(Ws, VIEW.E);
    const elev = Math.atan2(vE[1], Math.hypot(vE[0], vE[2])), elev0 = Math.atan2(HF, Z0);
    Object.assign(STAGEV, { x: sc[0], y: sc[1], s: (VIEW.Fz / zs) / (CAM.F / Z0), sq: Math.max(0.3, Math.sin(elev) / Math.sin(elev0)) });
    // a seat is only drawn with the live 3D rig, never the painting's flat beams
    if (!LX.on) { LX.on = true; LX.mode = 'live'; }
    viewBuild();
  }
  function viewBuild() {
    if (!VIEW.on || !arenaBase) return;
    for (const p of people) {
      // back onto the head plane: depth from where they stand; children on shoulders sit higher
      const by = p.sortY ?? p.y, z = (CAM.F * HF) / Math.max(1, by - CAM.cy);
      const Wp = [((p.x - CAM.cx) * z) / CAM.F, HF - ((by - p.y) * z) / CAM.F, z];
      const q = proj0(Wp), zc = camDepth(Wp);
      p.vx = q[0]; p.vy = q[1]; p.vz = zc; p.vs = (VIEW.Fz / zc) / (CAM.F / z);
    }
    VIEW.back = people.filter(p => (p.sortY ?? p.y) < STAGE.y + 4).sort((a, b) => b.vz - a.vz);
    VIEW.front = people.filter(p => (p.sortY ?? p.y) >= STAGE.y + 4).sort((a, b) => b.vz - a.vz);
    for (const tw of twinkles) {
      const P = hit3([0, 0, 0], [(tw.x - CAM.cx) / CAM.F, (tw.y - CAM.cy) / CAM.F, 1]).P, q = proj0(P), zc = camDepth(P);
      tw.vx = q[0]; tw.vy = q[1]; tw.vs = (VIEW.Fz / zc) / (CAM.F / P[2]);
    }
    viewBase = reproject(arenaBase, 1);
    viewRcv = reproject(rcvStatic, 0.5);
  }
  // the painted bowl as seen from the seat: each pixel's ray meets the room, and that point is read
  // back from the painting (sc: the canvas's scale relative to the frame)
  function reproject(src, sc) {
    const w = src.width, h = src.height, sd = src.getContext('2d').getImageData(0, 0, w, h).data;
    const out = CS.canvas(w, h), og = out.getContext('2d'), id = og.createImageData(w, h), od = id.data;
    for (let v = 0; v < h; v++) for (let u = 0; u < w; u++) {
      let x = (u / sc - CAM.cx) / VIEW.Fz, y = (v / sc - CAM.cy) / VIEW.Fz, z = 1;
      [y, z] = [y * VIEW.cp + z * VIEW.sp, -y * VIEW.sp + z * VIEW.cp]; // undo the pitch, then the yaw
      [x, z] = [x * VIEW.cyw + z * VIEW.syw, -x * VIEW.syw + z * VIEW.cyw];
      const P = hit3(VIEW.E, [x, y, z]).P, o = (v * w + u) * 4;
      let su = -1, sv = -1;
      if (P[2] > 0.5) { su = Math.round((CAM.cx + (CAM.F * P[0]) / P[2]) * sc); sv = Math.round((CAM.cy + (CAM.F * P[1]) / P[2]) * sc); }
      if (su >= 0 && su < w && sv >= 0 && sv < h) { const i = (sv * w + su) * 4; od[o] = sd[i]; od[o + 1] = sd[i + 1]; od[o + 2] = sd[i + 2]; }
      else { od[o] = 2; od[o + 1] = 6; od[o + 2] = 14; } // floor nearer than the painting showed
      od[o + 3] = 255;
    }
    og.putImageData(id, 0, 0);
    return out;
  }
  // a person drawn from the current seat
  function personOn(ctx, p, t, o, layer) {
    if (!VIEW.on) { CS.drawBaked(ctx, p, t, o, layer); return; }
    ctx.save();
    ctx.transform(p.vs, 0, 0, p.vs, p.vx - p.vs * p.x, p.vy - p.vs * p.y);
    CS.drawBaked(ctx, p, t, o, layer);
    ctx.restore();
  }

  // draw an image additively at a strength that may exceed 1
  function addTimes(g, img, k, w, h) {
    for (; k > 0.001; k -= 1) { g.globalAlpha = Math.min(1, k); g.drawImage(img, 0, 0, w, h); }
    g.globalAlpha = 1;
  }

  // what reaches the lens this frame, handed to the paint pass's optics (common.js, lens shader)
  let aeExpo = 1, aeT = null, aeWall = null;
  function lensFrame(S) {
    if (!LX.on || !CAMERA.on || CAMERA.glare <= 0) { S.lens = null; aeExpo = 1; aeT = null; return; }
    const src = glare.map(q => { const P = proj(q.C); return { x: P[0], y: P[1], k: q.k * CAMERA.glare, col: q.col, size: q.size }; });
    // the front lamp looks at the audience: a small steady star whenever it faces us
    const e = rot3([0, 0, -1]), eC = add3(O3, e, RS * 0.99), ef = Math.max(0, -dot3(e, norm3(fromEye(eC))));
    if (LX.eye > 0 && ef > 0.5) { const P = proj(eC); src.push({ x: P[0], y: P[1], k: 0.25 * LX.eye * S.intensity * ef ** 6 * CAMERA.glare, col: LX.eyeCol, size: 0.008 }); }
    src.sort((a, b) => b.k - a.k);
    const top = src.slice(0, 6), total = top.reduce((a, q) => a + q.k, 0);
    // auto-exposure stops down fast when a light hits the lens and opens up again slowly
    // adapt on the show clock, or on the wall clock while the show is paused
    const t = S.clocks.lights, now = performance.now() / 1000;
    let dt = aeT === null ? 1 : Math.abs(t - aeT);
    if (dt === 0 && aeWall !== null) dt = now - aeWall;
    dt = CS.clamp(dt, 0, 0.5);
    aeT = t;
    aeWall = now;
    const target = CAMERA.autoExpo ? 1 / (1 + 0.8 * Math.max(0, total - 0.2)) : 1;
    aeExpo += (target - aeExpo) * (1 - Math.exp(-dt / (target < aeExpo ? 0.12 : 0.8)));
    // veiling glare: light scattered inside the lens lifts the whole frame in the source's colour
    const veil = [0, 0, 0];
    for (const q of top) for (let j = 0; j < 3; j++) veil[j] += (q.col[j] / 255) * q.k * 0.06;
    // a dense spray fills the haze between us and the rig: the whole frame lifts for that flash
    let lp = 0;
    const lc = [0, 0, 0];
    for (const l of lasers) { const w = l.a * (0.15 + 0.85 * l.toward); lp += w; for (let j = 0; j < 3; j++) lc[j] += l.col[j] * w; }
    if (lp > 0) { const hk = Math.min(0.22, lp * 0.0014) * CAMERA.glare; for (let j = 0; j < 3; j++) veil[j] += (lc[j] / lp / 255) * hk; }
    const fl = CAMERA.flare;
    S.lens = { src: top, expo: aeExpo, veil, bloom: CAMERA.bloom * (0.4 + 0.6 * Math.min(2, total)), ca: Math.min(2, total * 0.8 + LX.disperse * 0.9), dirt: CAMERA.dirt, ghost: fl, star: fl, streak: fl * 0.6 };
  }

  const topLayer = CS.canvas(W, H), crowdLayer = CS.canvas(W, H), maskCv = CS.canvas(W, H), laserLayer = CS.canvas(W, H);
  const hazeCv = CS.canvas(W / 2, H / 2), smokeCv = CS.canvas(W / 2, H / 2);
  const hzB = CS.canvas(W / 2, H / 2), hzF = CS.canvas(W / 2, H / 2), hzP = CS.canvas(W / 2, H / 2); // haze behind / in front of the ball / over the people
  const pplCv = CS.canvas(W, H), lightCv = CS.canvas(W / 2, H / 2), rcvCv = CS.canvas(W / 2, H / 2);
  const rimCv = CS.canvas(W, H), rimFrontCv = CS.canvas(W, H), crowdFrame = CS.canvas(W, H);
  let rcvStatic = null;
  const crowdOpts = { rimColor: '120,210,218', bob: 0.05, sway: 0.08 };

  function extraUI(ui, S, el) {
    const btn = el('button', { className: 'btn' }, LX.on ? '■ Stop showcase' : '▶ Lighting showcase');
    btn.onclick = () => {
      LX.on = !LX.on;
      S.clocks.lights = 0;
      S.on.lights = true;
      btn.textContent = LX.on ? '■ Stop showcase' : '▶ Lighting showcase';
    };
    ui.append(btn);
  }

  const seatQ = new URLSearchParams(location.search).get('seat');
  if (seatQ && SEATS[seatQ]) requestAnimationFrame(() => setView(SEATS[seatQ]));
  CS.run({ W, H, bpm: 84, file: 'arena-spotlight', toggles: ['performer', 'lights', 'audience'], paint: { radius: 4, wobble: 1.8 }, init, render, renderTop, extraUI, ui: !window.LIGHT_DESK });
})();
