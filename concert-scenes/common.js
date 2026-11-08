// Shared engine for the concert scenes: noise, sprites, performer rig,
// crowd silhouettes, painterly overlay, UI + video recording.
const CS = (() => {
  const TAU = Math.PI * 2;

  const rng = seed => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const smooth = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  const canvas = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };

  // Value noise on a lattice that wraps every `period` cells, so textures built
  // from it can tile seamlessly.
  function noise2(seed, period = 256) {
    const r = rng(seed);
    const N = 256;
    const p = new Float32Array(N * N);
    for (let i = 0; i < p.length; i++) p[i] = r();
    return (x, y, per = period) => {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const w = i => ((i % per) + per) % per;
      const g = (i, j) => p[(w(j) & 255) * N + (w(i) & 255)];
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const a = g(xi, yi), b = g(xi + 1, yi), c = g(xi, yi + 1), d = g(xi + 1, yi + 1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  }
  function fbm(n, x, y, oct = 5, per = 256) {
    let s = 0, a = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) {
      s += a * n(x * f, y * f, per * f);
      norm += a;
      a *= 0.5;
      f *= 2;
    }
    return s / norm;
  }

  // Soft round light sprite, drawn additively for glows and bokeh.
  function glow(r, g, b, size = 64, core = 0.25) {
    const c = canvas(size, size), x = c.getContext('2d');
    const gr = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gr.addColorStop(0, `rgba(${r},${g},${b},1)`);
    gr.addColorStop(core, `rgba(${r},${g},${b},0.35)`);
    gr.addColorStop(0.6, `rgba(${r},${g},${b},0.08)`);
    gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
    x.fillStyle = gr;
    x.fillRect(0, 0, size, size);
    return c;
  }

  // Brush-stroke texture + grain + vignette, baked once and laid over every frame.
  function paintOverlay(w, h, seed, { strokes = 26000, strength = 1, vignette = 0.75 } = {}) {
    const c = canvas(w, h), g = c.getContext('2d');
    const R = rng(seed);
    const n = noise2(seed + 1);
    g.lineCap = 'round';
    for (let i = 0; i < strokes; i++) {
      const x = R() * w, y = R() * h;
      // stroke direction follows a slow flow field so marks read as brushwork
      const a = fbm(n, x / 260, y / 260, 3) * TAU * 1.6;
      const len = 4 + R() * 18;
      const light = R() < 0.5;
      g.strokeStyle = light
        ? `rgba(170,235,230,${(0.012 + R() * 0.03) * strength})`
        : `rgba(0,0,0,${(0.03 + R() * 0.06) * strength})`;
      g.lineWidth = 0.8 + R() * 2.4;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a + 0.4) * len * 0.5, y + Math.sin(a + 0.4) * len * 0.5,
        x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.stroke();
    }
    const id = g.getImageData(0, 0, w, h), d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (R() - 0.5) * 26 * strength;
      if (d[i + 3] === 0) {
        d[i] = d[i + 1] = d[i + 2] = v > 0 ? 255 : 0;
        d[i + 3] = Math.abs(v);
      }
    }
    g.putImageData(id, 0, 0);
    const vg = g.createRadialGradient(w / 2, h * 0.48, Math.min(w, h) * 0.25, w / 2, h * 0.5, Math.hypot(w, h) * 0.6);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, `rgba(0,0,0,${vignette})`);
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);
    return c;
  }

  // ---------- performer ----------
  // Built in local units: feet at (0,0), ~100 units tall, facing the camera, head turned a
  // little toward the mic. Drawn supersampled into an offscreen canvas, then lit from its
  // own silhouette (spotlight from above, haze rims at the sides) and placed in the scene.
  function performerPose(t, bpm) {
    const beat = (t * bpm) / 60;
    return {
      sway: Math.sin(t * 0.9) * 0.022,
      nod: Math.abs(Math.sin(beat * Math.PI)) * 0.9,
      strum: Math.sin(beat * TAU * 2) * (0.75 + 0.25 * Math.sin(beat * 0.5)),
      fret: [27, 31, 25, 29][Math.floor(beat / 4) % 4] + Math.sin(t * 3) * 0.2,
      hair: Math.sin(t * 1.3) * 0.9,
      breathe: Math.sin(t * 1.5) * 0.35,
    };
  }

  // guitar frame: u runs along the strings toward the headstock, v across them
  const GUITAR = { x: 2.5, y: -58.5, a: -0.33 };
  const gpt = (u, v = 0) => [
    GUITAR.x + Math.cos(GUITAR.a) * u - Math.sin(GUITAR.a) * v,
    GUITAR.y + Math.sin(GUITAR.a) * u + Math.cos(GUITAR.a) * v,
  ];
  // dreadnought half-width along u: two overlapping bouts make the waist
  const bout = u => Math.max(
    Math.abs(u + 11) < 12 ? 11.8 * Math.sqrt(1 - ((u + 11) / 12) ** 2) : 0,
    Math.abs(u - 4.3) < 8.8 ? 9.2 * Math.sqrt(1 - ((u - 4.3) / 8.8) ** 2) : 0,
  );

  // tapered limb a→b→c as a filled outline
  function limb(g, a, b, c, w0, w1, w2) {
    const pts = [a, b, c], ws = [w0, w1, w2], L = [], Rt = [];
    for (let i = 0; i < 3; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(2, i + 1)];
      let nx = -(p1[1] - p0[1]), ny = p1[0] - p0[0];
      const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
      L.push([pts[i][0] + nx * ws[i] / 2, pts[i][1] + ny * ws[i] / 2]);
      Rt.push([pts[i][0] - nx * ws[i] / 2, pts[i][1] - ny * ws[i] / 2]);
    }
    const path = new Path2D();
    path.moveTo(...L[0]); path.quadraticCurveTo(...L[1], ...L[2]);
    path.arc(c[0], c[1], w2 / 2, Math.atan2(L[2][1] - c[1], L[2][0] - c[0]), Math.atan2(Rt[2][1] - c[1], Rt[2][0] - c[0]));
    path.quadraticCurveTo(...Rt[1], ...Rt[0]);
    path.closePath();
    return path;
  }

  let perfCv = null, perfMask = null;
  // light/tint: the follow spot's level and colour; haze/hazeK: colour and strength of the room's
  // light rimming her sides
  function drawPerformer(g, x, y, s, t, bpm, style, light = 1, tint = [120, 225, 215], haze = [110, 210, 205], hazeK = 1) {
    const SS = 3, S = s * SS;
    const UW = 76, UH = 112, UOX = 30, UOY = 106;
    const cw = Math.ceil(UW * S), ch = Math.ceil(UH * S);
    if (!perfCv || perfCv.width !== cw || perfCv.height !== ch) { perfCv = canvas(cw, ch); perfMask = canvas(cw, ch); }
    const pg = perfCv.getContext('2d');
    pg.setTransform(1, 0, 0, 1, 0, 0);
    pg.globalCompositeOperation = 'source-over';
    pg.clearRect(0, 0, cw, ch);
    pg.setTransform(S, 0, 0, S, UOX * S, UOY * S);
    paintPerformer(pg, performerPose(t, bpm), style === 'sketch');
    pg.setTransform(1, 0, 0, 1, 0, 0);
    lightPerformer(pg, cw, ch, S, style === 'sketch', light, tint, haze, hazeK);
    g.drawImage(perfCv, x - UOX * s, y - UOY * s, UW * s, UH * s);
    // the last drawn figure and where it went, for scenes that need its silhouette (occlusion)
    drawPerformer.last = { cv: perfCv, x: x - UOX * s, y: y - UOY * s, w: UW * s, h: UH * s };
  }

  // edge light from the figure's own alpha: silhouette minus itself shifted away from the light
  function lightPerformer(pg, cw, ch, S, sketch, light = 1, tint = [120, 225, 215], haze = [110, 210, 205], hazeK = 1) {
    const tc = tint.map(v => v | 0).join(','), hot = tint.map(v => (v + (255 - v) * 0.65) | 0).join(',');
    const mg = perfMask.getContext('2d');
    const pass = (dx, dy, w, color) => {
      mg.globalCompositeOperation = 'copy';
      mg.drawImage(perfCv, 0, 0);
      mg.globalCompositeOperation = 'destination-out';
      mg.drawImage(perfCv, -dx * w * S, -dy * w * S);
      mg.globalCompositeOperation = 'source-in';
      mg.fillStyle = color;
      mg.fillRect(0, 0, cw, ch);
      pg.globalCompositeOperation = 'source-atop';
      pg.drawImage(perfMask, 0, 0);
    };
    if (sketch) {
      for (const [dx, dy] of [[0, -1], [1, 0], [-1, 0], [0, 1], [0.7, -0.7], [-0.7, -0.7]]) pass(dx, dy, 0.55, 'rgba(165,255,245,0.85)');
    } else {
      // with the follow spot down she falls to a silhouette, rimmed only by the room's haze
      pg.globalCompositeOperation = 'source-atop';
      // and with the room dark too (hazeK low) she goes almost to black
      const dark = 0.72 * (1 - Math.min(1, light)) + 0.26 * (1 - hazeK) * (1 - Math.min(1, light));
      pg.fillStyle = `rgba(2,7,11,${dark})`;
      pg.fillRect(0, 0, cw, ch);
      if (light > 0.01) {
        pass(0.15, -1, 2.6, `rgba(${tc},${0.28 * light})`);  // broad spill from the spot above
        pass(0.1, -1, 0.8, `rgba(${hot},${0.85 * light})`);  // hot top edges
      }
      const hz = haze.map(v => v | 0).join(','), ha = (0.2 * hazeK + 0.15 * Math.min(1, light));
      pass(-1, -0.15, 0.6, `rgba(${hz},${ha})`); // haze rims at the sides
      pass(1, -0.15, 0.6, `rgba(${hz},${ha})`);
      // falling off toward the feet
      const gr = pg.createLinearGradient(0, 0, 0, ch);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(0.55, 'rgba(0,0,0,0.05)');
      gr.addColorStop(1, 'rgba(0,0,0,0.4)');
      pg.globalCompositeOperation = 'source-atop';
      pg.fillStyle = gr;
      pg.fillRect(0, 0, cw, ch);
    }
    pg.globalCompositeOperation = 'source-over';
  }

  function paintPerformer(g, P, sketch) {
    const C = sketch ? {
      top: '#040d16', topHi: '#0a1a26', jeans: '#040c14', jeansHi: '#0a1824', skin: '#8fc4bf', skinHi: '#c8f2ec',
      hair: '#d8fff8', hairMid: '#8fd8cf', hairLo: '#3d7f7a', body: '#030a12', bodyHi: '#0a1824', bind: '#a8fff4',
      metal: '#9ff0e6', boot: '#02060a', strap: '#061420',
    } : {
      top: '#122a30', topHi: '#3a7176', jeans: '#0b1a22', jeansHi: '#22424c', skin: '#7c9b99', skinHi: '#c4e3df',
      hair: '#d6f2ee', hairMid: '#93bdb9', hairLo: '#4b706e', body: '#0a1113', bodyHi: '#1a2a2e', bind: '#a6e2da',
      metal: '#3e5a5e', boot: '#04080a', strap: '#071114',
    };
    const hy = -P.nod, br = P.breathe;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    const fill = (path, c) => { g.fillStyle = c; g.fill(path); };
    const shadeIn = (path, y0, y1, c0, c1) => {
      // vertical gradient inside a shape (light from above)
      const gr = g.createLinearGradient(0, y0, 0, y1);
      gr.addColorStop(0, c0);
      gr.addColorStop(1, c1);
      g.fillStyle = gr;
      g.fill(path);
    };

    g.save();
    g.rotate(P.sway);

    // long hair behind the shoulders
    const back = new Path2D();
    back.moveTo(-4.4, -96 + hy);
    back.bezierCurveTo(-6.4, -94 + hy, -6.6, -86 + hy, -7 + P.hair * 0.3, -76);
    back.bezierCurveTo(-7.4 + P.hair * 0.5, -71.5, -6, -70.5, -4.6, -72);
    back.lineTo(4.8, -73);
    back.bezierCurveTo(6.4, -71.5, 7.6 + P.hair * 0.5, -72.5, 7.2 + P.hair * 0.3, -76);
    back.bezierCurveTo(6.8, -86 + hy, 6.4, -94 + hy, 4.2, -96.5 + hy);
    back.closePath();
    shadeIn(back, -97, -70, C.hairMid, C.hairLo);
    // the side tucked behind the ear, behind the face
    const tucked = new Path2D();
    tucked.moveTo(1.8, -96 + hy);
    tucked.bezierCurveTo(5.4, -94 + hy, 5.6, -88 + hy, 5.2, -83);
    tucked.bezierCurveTo(6.2, -79, 7.2 + P.hair * 0.3, -77, 7.6 + P.hair * 0.4, -74.5);
    tucked.lineTo(5.4, -75.5);
    tucked.bezierCurveTo(3, -80, 1, -86 + hy, 0.6, -92 + hy);
    tucked.closePath();
    shadeIn(tucked, -96 + hy, -74, C.hair, C.hairMid);

    // legs: contrapposto, weight on the viewer's left leg, flared hems
    const legs = new Path2D();
    legs.moveTo(-9.4, -54);
    legs.bezierCurveTo(-10.4, -44, -8.8, -33, -8.4, -27);
    legs.bezierCurveTo(-8.4, -18, -10.8, -6, -11.6, -1.6);
    legs.lineTo(-1.8, -1.6);
    legs.bezierCurveTo(-1.4, -8, -1, -18, -1, -27);
    legs.bezierCurveTo(-0.9, -36, -0.4, -45, -0.2, -49);
    legs.lineTo(0.2, -49);
    legs.bezierCurveTo(0.6, -45, 1.2, -36, 1.2, -28);
    legs.bezierCurveTo(1.4, -18, 2, -8, 2.4, -1.8);
    legs.lineTo(12, -1.8);
    legs.bezierCurveTo(11.2, -6, 9.4, -18, 9.2, -28);
    legs.bezierCurveTo(9.8, -36, 10.2, -44, 9.4, -54);
    legs.closePath();
    shadeIn(legs, -53, 0, C.jeansHi, C.jeans);
    if (!sketch) {
      // denim creases at the knees and the inseam
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 0.35;
      g.beginPath();
      g.moveTo(-6.5, -29); g.quadraticCurveTo(-4.8, -27.5, -3, -28.5);
      g.moveTo(3.2, -30); g.quadraticCurveTo(5.2, -28, 7.2, -29.5);
      g.moveTo(-4.6, -24); g.lineTo(-5.4, -4); g.moveTo(5.8, -24); g.lineTo(6.6, -4);
      g.stroke();
    }
    const boots = new Path2D();
    boots.ellipse(-6.4, -1, 4.4, 1.6, 0, 0, TAU);
    boots.ellipse(6.9, -1.1, 4.4, 1.6, 0.05, 0, TAU);
    boots.ellipse(-8.6, -0.7, 2.4, 1.1, 0, 0, TAU);
    boots.ellipse(9.4, -0.8, 2.4, 1.1, 0, 0, TAU);
    fill(boots, C.boot);

    // fitted long-sleeve top
    const torso = new Path2D();
    torso.moveTo(-9.4, -53);
    torso.bezierCurveTo(-7.8, -57, -7, -61, -7.2, -63.5);
    torso.bezierCurveTo(-7.8, -68, -8.6 - br * 0.3, -72, -8.8, -77.5);
    torso.quadraticCurveTo(-9.6, -81.5, -9.9, -82.6);
    torso.quadraticCurveTo(-6.5, -85.2, -2.4, -85.8);
    torso.quadraticCurveTo(0, -84.8, 2.4, -85.8);
    torso.quadraticCurveTo(6.5, -85.2, 9.9, -82.6);
    torso.quadraticCurveTo(9.6, -81.5, 8.6, -77.5);
    torso.bezierCurveTo(8.6 + br * 0.3, -72, 7.8, -68, 7.2, -63.5);
    torso.bezierCurveTo(7, -61, 7.9, -57, 9.4, -53);
    torso.quadraticCurveTo(0, -51.6, -9.4, -53);
    torso.closePath();
    shadeIn(torso, -86, -52, C.topHi, C.top);

    // neck and head (turned a touch toward the mic)
    const neck = new Path2D();
    neck.roundRect(-1.9, -88.5 + hy * 0.5, 3.8, 4, 1);
    fill(neck, C.skin);
    const head = new Path2D();
    head.ellipse(0.6, -91.6 + hy, 4.5, 5.5, 0.05, 0, TAU);
    fill(head, C.skin);
    // profile catching the light: brow, nose, lips, chin toward the mic
    const face = new Path2D();
    face.moveTo(2.6, -96 + hy);
    face.quadraticCurveTo(4.6, -94.8 + hy, 4.7, -93 + hy);
    face.lineTo(5.6, -91.2 + hy);
    face.lineTo(4.8, -90.6 + hy);
    face.quadraticCurveTo(5.2, -89.6 + hy, 4.7, -89 + hy);
    face.quadraticCurveTo(4.9, -87.6 + hy, 3.7, -87.1 + hy);
    face.quadraticCurveTo(2, -86.6 + hy, 1, -87.4 + hy);
    face.lineTo(1.4, -95 + hy);
    face.closePath();
    shadeIn(face, -96 + hy, -87 + hy, C.skinHi, C.skin);
    // eye sockets and mouth, just enough to read as a face under the hair
    g.fillStyle = 'rgba(0,0,0,0.16)';
    g.beginPath();
    g.ellipse(-0.6, -92.3 + hy, 0.8, 0.45, 0, 0, TAU);
    g.ellipse(2.6, -92.4 + hy, 0.8, 0.42, 0, 0, TAU);
    g.ellipse(2.4, -88.9 + hy, 0.9, 0.25, 0, 0, TAU);
    g.fill();

    // hair over the crown, a curtain over the viewer's-left shoulder, the rest tucked back
    const cap = new Path2D();
    cap.moveTo(-4.7, -88.5 + hy);
    cap.bezierCurveTo(-5.6, -96 + hy, -2.4, -98.4 + hy, 1, -97.8 + hy);
    cap.bezierCurveTo(3.8, -97.4 + hy, 4.8, -95.4 + hy, 3.6, -93.6 + hy);
    cap.quadraticCurveTo(1.6, -95.4 + hy, -0.8, -94.6 + hy);
    cap.quadraticCurveTo(-2.6, -93 + hy, -3, -89 + hy);
    cap.closePath();
    const curtain = new Path2D();
    curtain.moveTo(-3, -91 + hy);
    curtain.bezierCurveTo(-4.4, -84 + hy, -6.8 + P.hair * 0.3, -79, -7.4 + P.hair * 0.5, -71.5);
    curtain.bezierCurveTo(-7.6 + P.hair * 0.5, -70, -5.4, -69.8, -4.4, -71.2);
    curtain.bezierCurveTo(-3.6, -78, -2.6, -84 + hy, -1.6, -90 + hy);
    curtain.closePath();
    for (const h of [curtain, cap]) shadeIn(h, -98 + hy, -71, C.hair, C.hairMid);
    // the spot from above hits the crown hardest
    g.save();
    g.clip(cap);
    const crown = g.createRadialGradient(0.2, -98 + hy, 0, 0.2, -98 + hy, 4.2);
    crown.addColorStop(0, sketch ? 'rgba(255,255,255,0.8)' : 'rgba(250,255,255,0.75)');
    crown.addColorStop(1, 'rgba(250,255,255,0)');
    g.fillStyle = crown;
    g.fillRect(-6, -100 + hy, 12, 8);
    g.restore();
    // strands over the back mass and the tucked side, bright tips where the light catches
    g.lineWidth = 0.22;
    for (const [x0, x1, y1, n] of [[-3.5, -7, -73, 5], [3.4, 7, -75, 4]]) {
      for (let k = 0; k < n; k++) {
        const f = k / n;
        g.strokeStyle = k % 2 ? C.hairLo : C.hair;
        g.globalAlpha = 0.45;
        g.beginPath();
        g.moveTo(x0 + f * 0.8, -95 + hy);
        g.bezierCurveTo(x0 * 1.6, -88 + hy, x1 + P.hair * 0.3 - f, -80, x1 + P.hair * 0.5 + f * 1.4 * Math.sign(x0), y1 + f);
        g.stroke();
      }
    }
    g.globalAlpha = 1;
    // strands following the fall
    g.save();
    g.clip(curtain);
    g.lineWidth = 0.28;
    for (let k = 0; k < 7; k++) {
      g.strokeStyle = k % 2 ? C.hairLo : C.hair;
      g.globalAlpha = 0.5;
      g.beginPath();
      g.moveTo(-3 + k * 0.2, -91 + hy);
      g.bezierCurveTo(-4.2 - k * 0.3, -84 + hy, -5.6 - k * 0.25 + P.hair * 0.3, -78, -6.6 + k * 0.35 + P.hair * 0.5, -71);
      g.stroke();
    }
    g.restore();
    g.globalAlpha = 1;

    // strap across the chest to the viewer's-right shoulder
    g.strokeStyle = C.strap;
    g.lineWidth = 1.5;
    const sp = gpt(12.5, -4);
    g.beginPath(); g.moveTo(...sp); g.quadraticCurveTo(9.8, -74, 7.6, -83.6); g.stroke();

    // guitar
    const body = new Path2D();
    for (let u = -23; u <= 12.6; u += 0.4) { const [px, py] = gpt(u, -bout(u)); u === -23 ? body.moveTo(px, py) : body.lineTo(px, py); }
    for (let u = 12.6; u >= -23; u -= 0.4) body.lineTo(...gpt(u, bout(u)));
    body.closePath();
    const bt = gpt(-5, -10), bb = gpt(-5, 10);
    const bg = g.createLinearGradient(bt[0], bt[1], bb[0], bb[1]);
    bg.addColorStop(0, C.bodyHi);
    bg.addColorStop(1, C.body);
    g.fillStyle = bg;
    g.fill(body);
    // binding: brighter along the upper (lit) edge
    g.strokeStyle = C.bind;
    g.lineWidth = 0.45;
    g.globalAlpha = sketch ? 0.9 : 0.75;
    g.beginPath();
    for (let u = -22.6; u <= 12.4; u += 0.4) { const [px, py] = gpt(u, -bout(u) + 0.25); u === -22.6 ? g.moveTo(px, py) : g.lineTo(px, py); }
    g.stroke();
    g.globalAlpha = sketch ? 0.6 : 0.3;
    g.beginPath();
    for (let u = -22.6; u <= 12.4; u += 0.4) { const [px, py] = gpt(u, bout(u) - 0.25); u === -22.6 ? g.moveTo(px, py) : g.lineTo(px, py); }
    g.stroke();
    g.globalAlpha = 1;
    // pickguard, soundhole + rosette, bridge
    const pgp = gpt(-0.5, 4.4);
    g.fillStyle = '#020506';
    g.beginPath(); g.ellipse(pgp[0], pgp[1], 3.4, 2.2, GUITAR.a + 0.5, 0, TAU); g.fill();
    const sh = gpt(2.6, 0);
    g.beginPath(); g.arc(sh[0], sh[1], 2.7, 0, TAU); g.fill();
    g.strokeStyle = C.bind;
    g.globalAlpha = 0.35;
    g.lineWidth = 0.3;
    g.beginPath(); g.arc(sh[0], sh[1], 3.3, 0, TAU); g.stroke();
    g.globalAlpha = 1;
    const bp = gpt(-13, 0);
    g.save();
    g.translate(bp[0], bp[1]);
    g.rotate(GUITAR.a);
    g.fillStyle = '#020506';
    g.fillRect(-0.7, -3.4, 1.4, 6.8);
    g.restore();
    // neck, frets, headstock
    const neck2 = new Path2D();
    neck2.moveTo(...gpt(11.5, -1.5)); neck2.lineTo(...gpt(38, -1.15)); neck2.lineTo(...gpt(38, 1.15)); neck2.lineTo(...gpt(11.5, 1.5)); neck2.closePath();
    fill(neck2, C.bodyHi);
    const head2 = new Path2D();
    head2.moveTo(...gpt(38, -1.5)); head2.lineTo(...gpt(45, -2.2)); head2.lineTo(...gpt(45.4, 1.9)); head2.lineTo(...gpt(38, 1.5)); head2.closePath();
    fill(head2, C.body);
    g.strokeStyle = C.metal;
    g.lineWidth = 0.18;
    g.globalAlpha = 0.6;
    g.beginPath();
    for (let k = 0, u = 13.5; k < 14; k++, u += 2.2 - k * 0.08) { g.moveTo(...gpt(u, -1.3)); g.lineTo(...gpt(u, 1.3)); }
    g.stroke();
    // strings
    g.globalAlpha = sketch ? 0.5 : 0.3;
    g.strokeStyle = C.bind;
    g.lineWidth = 0.1;
    g.beginPath();
    for (let k = -2.5; k <= 2.5; k++) { g.moveTo(...gpt(-13, k * 0.45)); g.lineTo(...gpt(38, k * 0.35)); }
    g.stroke();
    g.globalAlpha = 1;
    g.fillStyle = C.metal;
    for (let k = 0; k < 3; k++) for (const sd of [-1, 1]) { const tp = gpt(39.5 + k * 2, sd * 2.4); g.beginPath(); g.arc(tp[0], tp[1], 0.45, 0, TAU); g.fill(); }

    // strumming arm: upper arm by the side, forearm across the lower bout
    const hand1 = gpt(-4.5, -1 + P.strum * 3.4);
    const arm1 = limb(g, [-9.2, -81.6], [-14.6, -67.5], hand1, 4.3, 3.6, 2.6);
    shadeIn(arm1, -82, -55, C.topHi, C.top);
    g.save(); g.clip(arm1);
    g.strokeStyle = C.topHi; g.globalAlpha = 0.8; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(-14.6, -68.6); g.lineTo(hand1[0] - 0.4, hand1[1] - 1.1); g.stroke();
    g.restore(); g.globalAlpha = 1;
    g.fillStyle = C.skin;
    g.beginPath(); g.ellipse(hand1[0], hand1[1], 1.5, 1.15, GUITAR.a + 0.6, 0, TAU); g.fill();
    g.fillStyle = C.skinHi;
    g.beginPath(); g.ellipse(hand1[0] - 0.3, hand1[1] - 0.45, 0.8, 0.45, GUITAR.a + 0.6, 0, TAU); g.fill();
    // curled fingers and the pick between thumb and index
    g.strokeStyle = C.skin;
    g.lineWidth = 0.5;
    g.beginPath();
    for (let k = 0; k < 3; k++) { const f0 = gpt(-4.2 + k * 0.6, 0.6 + P.strum * 3.4), f1 = gpt(-3.6 + k * 0.6, 1.5 + P.strum * 3.4); g.moveTo(...f0); g.lineTo(...f1); }
    g.stroke();
    const pk = gpt(-3.2, -0.2 + P.strum * 3.4);
    g.fillStyle = sketch ? '#ffffff' : '#d8efe9';
    g.beginPath(); g.moveTo(pk[0], pk[1] - 0.5); g.lineTo(pk[0] + 0.6, pk[1] + 0.4); g.lineTo(pk[0] - 0.4, pk[1] + 0.5); g.closePath(); g.fill();

    // fretting arm: elbow out, hand under the neck, fingers over the fretboard
    const uf = P.fret;
    const hand2 = gpt(uf, 2.3);
    const arm2 = limb(g, [9.2, -81.6], [15.6, -67], hand2, 4.3, 3.6, 2.5);
    shadeIn(arm2, -82, -60, C.topHi, C.top);
    g.save(); g.clip(arm2);
    g.strokeStyle = C.topHi; g.globalAlpha = 0.8; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(15.4, -68.2); g.lineTo(hand2[0] - 0.2, hand2[1] - 1); g.stroke();
    g.restore(); g.globalAlpha = 1;
    g.fillStyle = C.skin;
    g.beginPath(); g.ellipse(hand2[0], hand2[1], 1.5, 1.2, GUITAR.a, 0, TAU); g.fill();
    // fingers curl from under the neck over the fretboard onto the strings
    g.lineCap = 'round';
    for (let k = 0; k < 4; k++) {
      const du = -1.8 + k * 1.15;
      const base = gpt(uf + du * 0.6, 2.4), knuckle = gpt(uf + du * 0.9, 1.9), tip = gpt(uf + du, -0.7 + Math.abs(k - 1.5) * 0.25);
      g.strokeStyle = C.skin;
      g.lineWidth = 0.75;
      g.beginPath(); g.moveTo(...base); g.quadraticCurveTo(knuckle[0] - 0.6, knuckle[1] - 1.6, ...tip); g.stroke();
      g.fillStyle = C.skinHi;
      g.beginPath(); g.arc(tip[0], tip[1], 0.3, 0, TAU); g.fill();
    }
    const thumb = gpt(uf - 0.6, -1.7);
    g.fillStyle = C.skin;
    g.beginPath(); g.ellipse(thumb[0], thumb[1], 0.45, 0.75, GUITAR.a, 0, TAU); g.fill();

    g.restore(); // the stand doesn't sway

    // mic stand: tripod, pole, boom to the mouth, mic
    g.strokeStyle = sketch ? 'rgba(150,240,230,0.8)' : '#0b171a';
    g.lineWidth = 0.9;
    g.beginPath();
    g.moveTo(26, -9); g.lineTo(26, -69.5);
    g.moveTo(26, -9); g.lineTo(19, 0.4); g.moveTo(26, -9); g.lineTo(33, 0.4); g.moveTo(26, -9); g.lineTo(26.6, 1.1);
    g.stroke();
    g.lineWidth = 0.7;
    g.beginPath(); g.moveTo(26.4, -71); g.lineTo(11.8, -88.6 + hy * 0.3); g.stroke();
    g.fillStyle = sketch ? '#9ff0e6' : '#14262a';
    g.beginPath(); g.arc(26.2, -70.2, 0.9, 0, TAU); g.fill();
    g.save();
    g.translate(10.4, -89.2 + hy * 0.3);
    g.rotate(-0.35);
    g.fillStyle = sketch ? '#d6fff9' : '#1d3236';
    g.beginPath(); g.roundRect(-0.6, -1.1, 4.2, 2.2, 1.1); g.fill();
    g.fillStyle = sketch ? '#ffffff' : '#3b5a5f';
    g.beginPath(); g.arc(0, 0, 1.25, 0, TAU); g.fill();
    g.restore();
  }

  // ---------- crowd ----------
  function makePerson(R, x, y, r, opt = {}) {
    const L = 3 + R() * 9;
    return {
      x, y, r,
      ph: R() * TAU,
      f: 0.45 + R() * 1.2,
      hair: R(),
      hw: 0.9 + R() * 0.2,            // head width
      sw: 1.9 + R() * 0.55,           // shoulder half-width (in head radii)
      tilt: (R() - 0.5) * 0.3,
      warm: R() < (opt.warm || 0),
      body: `rgb(${L * 0.45 | 0},${L * 1.15 | 0},${L * 1.3 | 0})`,
      head: `rgb(${L * 0.5 | 0},${L * 1.1 | 0},${L * 1.25 | 0})`,
      phone: r > 5 && R() < (opt.phones || 0),
      arm: r > 8 && r < 30 && R() < (opt.arms || 0), // a raised, swaying arm (mid-crowd only)
      arms2: R() < 0.35,               // both arms up
      armStyle: Math.floor(R() * 3),  // 0 waves side to side, 1 pumps to the beat, 2 held up
      turn: R() < 0.22 ? (R() < 0.5 ? -1 : 1) * (0.5 + R() * 0.5) : 0, // head turned to one side
      side: R() < 0.5 ? -1 : 1,
      jit: [R(), R(), R(), R()],
      seed: (R() * 1e9) | 0,
    };
  }

  // Person seen from behind: sloping shoulders, head with one of a few hair shapes, and
  // light from a point (the stage) falling on the side of the head and tops of the shoulders.
  function drawPerson(g, p, t, o) {
    const r = p.r;
    const bob = Math.sin(t * p.f + p.ph) * r * o.bob;
    const sx = Math.sin(t * p.f * 0.47 + p.ph * 1.7) * r * o.sway;
    const x = p.x + sx, y = p.y + bob;
    const d = Math.hypot(o.lx - x, (o.ly - y) * 1.6);
    const lit = Math.min(0.85, o.rim * Math.exp(-d / o.falloff) + o.rimMin);
    const tilt = p.tilt + Math.sin(t * p.f * 0.31 + p.ph) * 0.04;
    const la = Math.atan2(o.ly - y, o.lx - x) - tilt;
    const col = p.warm ? '200,120,90' : o.rimColor;
    const small = r < 7;

    g.save();
    g.translate(x, y);
    g.rotate(tilt);

    // shoulders and back
    const sw = r * p.sw;
    const torso = new Path2D();
    torso.moveTo(-sw, r * 3.4);
    torso.bezierCurveTo(-sw * 1.02, r * 1.7, -sw * 0.82, r * 1.05, -r * 0.42, r * 0.92);
    torso.lineTo(r * 0.42, r * 0.92);
    torso.bezierCurveTo(sw * 0.82, r * 1.05, sw * 1.02, r * 1.7, sw, r * 3.4);
    torso.closePath();
    g.fillStyle = p.warm ? '#120a08' : p.body;
    g.fill(torso);

    // a raised arm, swaying with the music
    if (p.arm && !o.noArms) {
      const sway = Math.sin(t * p.f * 1.3 + p.ph) * 0.35;
      const sh = [p.side * sw * 0.7, r * 1.25];
      const hand = [p.side * (sw * 0.7 + r * 0.6) + Math.sin(sway) * r * 1.8, -r * 1.9 + Math.abs(Math.cos(sway)) * r * 0.2];
      // upper arm out to an elbow, forearm up to the hand, tapering
      const el = [p.side * (sw + r * 0.35), r * 0.15];
      g.strokeStyle = p.body;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.lineWidth = r * 0.62;
      g.beginPath(); g.moveTo(...sh); g.lineTo(...el); g.stroke();
      g.lineWidth = r * 0.48;
      g.beginPath(); g.moveTo(...el); g.lineTo(...hand); g.stroke();
      g.fillStyle = p.body;
      g.beginPath(); g.ellipse(hand[0], hand[1] - r * 0.1, r * 0.3, r * 0.38, sway, 0, TAU); g.fill();
      if (lit > 0.03) {
        g.strokeStyle = `rgba(${col},${lit * 0.6})`;
        g.lineWidth = Math.max(0.6, r * 0.08);
        g.beginPath(); g.moveTo(el[0] - p.side * r * 0.2, el[1] - r * 0.2); g.lineTo(hand[0] - p.side * r * 0.15, hand[1] - r * 0.3); g.stroke();
      }
    }

    // head + hair
    const head = new Path2D();
    const hw = r * 0.8 * p.hw;
    head.ellipse(0, 0, hw, r, 0, 0, TAU);
    if (p.hair > 0.68) head.ellipse(0, r * 0.6, hw * 1.12, r * 1.15, 0, 0, TAU);            // long hair
    else if (p.hair < 0.1) head.ellipse(-r * 0.1, -r * 0.85, r * 0.42, r * 0.36, 0, 0, TAU);   // bun
    else if (p.hair < 0.22) for (let k = 0; k < 5; k++) head.ellipse(Math.cos(k * 1.26) * hw * 0.75, Math.sin(k * 1.26) * r * 0.75 - r * 0.1, r * 0.42, r * 0.42, 0, 0, TAU); // curls
    else if (p.hair < 0.3) head.ellipse(0, -r * 0.35, hw * 1.15, r * 0.6, 0, Math.PI, TAU);   // cap
    g.fillStyle = p.warm ? '#1a0e0a' : p.head;
    g.fill(head);

    if (lit > 0.02) {
      if (small) {
        g.fillStyle = `rgba(${col},${lit * 0.7})`;
        g.beginPath(); g.ellipse(Math.cos(la) * hw * 0.35, Math.sin(la) * r * 0.45, hw * 0.55, r * 0.5, 0, 0, TAU); g.fill();
      } else {
        // light wrapping the side of the head that faces the stage
        g.save();
        g.clip(head);
        // a crescent: bright right at the edge facing the light, gone by mid-head
        const lx = Math.cos(la) * hw * 1.25, ly = Math.sin(la) * r * 1.25;
        const lg = g.createRadialGradient(lx, ly, r * 0.25, lx, ly, r * 0.85);
        lg.addColorStop(0, `rgba(${col},${lit})`);
        lg.addColorStop(0.5, `rgba(${col},${lit * 0.3})`);
        lg.addColorStop(1, `rgba(${col},0)`);
        g.fillStyle = lg;
        g.fillRect(-r * 2, -r * 2, r * 4, r * 4);
        g.restore();
        // a few lit strands
        g.strokeStyle = `rgba(${col},${lit * 0.7})`;
        g.lineWidth = Math.max(0.6, r * 0.05);
        g.beginPath();
        g.ellipse(0, 0, hw * 0.98, r * 0.98, 0, la - 0.7 - p.jit[0] * 0.4, la + 0.5 + p.jit[1] * 0.4);
        g.stroke();
      }
      // tops of the shoulders catch light from above
      g.save();
      g.clip(torso);
      const sg = g.createLinearGradient(0, r * 0.9, 0, r * 2.1);
      sg.addColorStop(0, `rgba(${col},${lit * 0.4})`);
      sg.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = sg;
      g.fillRect(-sw * 1.1, r * 0.85, sw * 2.2, r * 1.3);
      g.restore();
    }
    g.restore();
  }

  // ---------- crowd: baked person sprites ----------
  // A near spectator seen from behind, painted once into its own canvas with the stage's
  // rim light baked in for where they stand. Per frame it is only moved, tilted and bobbed.
  //
  // o.tone(L, warm) → css colour in the scene's palette; o.lx/o.ly: where the light comes from;
  // o.rim/o.rimMin/o.falloff: rim strength; o.rimColor: 'r,g,b'.
  const HAIR = ['bun', 'curly', 'cap', 'ponytail', 'short', 'short', 'short', 'short', 'short', 'short', 'long', 'long', 'shaved', 'wavy'];

  // closed wobbly outline around an ellipse: radius modulated by a few random sine octaves
  function blob(path, cx, cy, rx, ry, amp, R, a0 = 0, a1 = TAU, close = true) {
    const ph = [R() * TAU, R() * TAU, R() * TAU, R() * TAU];
    const N = Math.max(18, Math.ceil(rx * 1.5));
    for (let i = 0; i <= N; i++) {
      const a = a0 + (a1 - a0) * (i / N);
      const k = 1 + amp * (0.5 * Math.sin(3 * a + ph[0]) + 0.3 * Math.sin(5 * a + ph[1]) + 0.2 * Math.sin(9 * a + ph[2]) + 0.12 * Math.sin(15 * a + ph[3]));
      const x = cx + Math.cos(a) * rx * k, y = cy + Math.sin(a) * ry * k;
      i ? path.lineTo(x, y) : path.moveTo(x, y);
    }
    if (close) path.closePath();
    return path;
  }

  function bakePerson(p, o) {
    const r = p.r, R = rng(p.seed || 1);
    const rr = (a, b) => a + (b - a) * R();
    const big = r > 11;
    const sw = r * p.sw;
    const hairType = HAIR[Math.floor(p.hair * HAIR.length)];
    const longHair = hairType === 'long' || hairType === 'wavy' || hairType === 'curly';
    const hoodie = R() < 0.16;
    // posture: some stand taller (longer neck showing), heads tilt, some are turned to the side
    const neckUp = hoodie ? 0 : R() < 0.4 ? rr(0.05, 0.3) * r : 0;
    const headTilt = rr(-0.12, 0.12) + (p.turn || 0) * 0.08;
    const W = Math.ceil(sw * 2.4 + r * 1.6), H = Math.ceil(r * 5.8);
    const ox = W / 2, oy = r * 1.85;
    const c = canvas(W, H), g = c.getContext('2d');
    g.translate(ox, oy);
    g.lineCap = 'round';
    g.lineJoin = 'round';

    // palette for this person
    const L = p.L;
    const hairL = L * (hairType === 'shaved' ? 0.75 : [0.3, 0.42, 0.55, 0.75, 1.4][Math.floor(R() * 5)]) * (o.headL || 1);
    const hairWarm = p.warm ? 1.3 : R() < 0.25 ? rr(0.4, 1) : 0;
    const clothL = L * (o.shirtL || 1) * [0.45, 0.7, 0.9, 1.2, 1.7][Math.floor(R() * 5)] * rr(0.85, 1.15);
    const hairC = o.tone(hairL, hairWarm), hairHi = o.tone(hairL * 1.6, hairWarm), hairLo = o.tone(hairL * 0.55, hairWarm);
    const skinC = o.tone(L * 0.85, 0.7), skinLo = o.tone(L * 0.55, 0.6);
    const clothC = o.tone(clothL), clothLo = o.tone(clothL * 0.6), clothHi = o.tone(clothL * 1.35);
    // direction the stage light arrives from (biased upward: it's above the crowd)
    const dxl = o.lx - p.x, dyl = o.ly - p.y, dl = Math.hypot(dxl, dyl) || 1;
    let lx = (dxl / dl) * 0.75, ly = (dyl / dl) * 0.75 - 0.55;
    const ln = Math.hypot(lx, ly); lx /= ln; ly /= ln;
    const lit = Math.min(0.95, o.rim * Math.exp(-Math.hypot(dxl, dyl * 1.6) / o.falloff) + o.rimMin);

    // torso: neck base → trapezius slope → round deltoids → down past the frame
    const lean = rr(-0.08, 0.08) * r, asym = rr(-0.1, 0.1);
    const torso = new Path2D();
    torso.moveTo(-sw * 1.03, r * 4.2);
    torso.bezierCurveTo(-sw * 1.06, r * 2.6, -sw * 1.02, r * 1.75 * (1 + asym), -sw * 0.8, r * 1.38 * (1 + asym));
    torso.bezierCurveTo(-sw * 0.55, r * 1.12, -r * 0.6, r * 1.02, -r * 0.36 + lean, r * 0.92);
    torso.lineTo(r * 0.36 + lean, r * 0.92);
    torso.bezierCurveTo(r * 0.6, r * 1.02, sw * 0.55, r * 1.12, sw * 0.8, r * 1.38 * (1 - asym));
    torso.bezierCurveTo(sw * 1.02, r * 1.75 * (1 - asym), sw * 1.06, r * 2.6, sw * 1.03, r * 4.2);
    torso.closePath();
    g.fillStyle = clothC;
    g.fill(torso);
    if (big) {
      // folds and the shoulder-blade valley
      g.save();
      g.clip(torso);
      g.strokeStyle = clothLo;
      g.lineWidth = Math.max(1, r * 0.08);
      g.globalAlpha = 0.6;
      g.beginPath();
      g.moveTo(rr(-0.2, 0.2) * r, r * 1.4); g.quadraticCurveTo(rr(-0.3, 0.3) * r, r * 2.6, rr(-0.2, 0.2) * r, r * 4);
      for (let k = 0; k < 3; k++) {
        const fx = rr(-0.8, 0.8) * sw, fy = rr(1.8, 3.4) * r;
        g.moveTo(fx, fy); g.quadraticCurveTo(fx + rr(-0.3, 0.3) * r, fy + r * 0.4, fx + rr(-0.5, 0.5) * r, fy + r * 0.9);
      }
      g.stroke();
      g.restore();
      g.globalAlpha = 1;
    }
    if (hoodie) {
      // the hood bunched at the back of the neck
      g.fillStyle = clothLo;
      g.beginPath(); g.ellipse(lean, r * 1.08, r * 0.95, r * 0.42, 0, 0, TAU); g.fill();
      g.strokeStyle = clothHi;
      g.lineWidth = Math.max(0.7, r * 0.05);
      g.globalAlpha = 0.5;
      g.beginPath(); g.ellipse(lean, r * 1.0, r * 0.8, r * 0.3, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      g.globalAlpha = 1;
    } else if (!longHair) {
      g.fillStyle = skinLo;
      g.beginPath(); g.roundRect(-r * 0.34 + lean * 0.5, r * 0.45 - neckUp, r * 0.68, r * 0.62 + neckUp, r * 0.2); g.fill();
      g.strokeStyle = clothLo; // t-shirt collar
      g.lineWidth = Math.max(0.8, r * 0.07);
      g.beginPath(); g.ellipse(lean, r * 0.98, r * 0.42, r * 0.12, 0, 0, Math.PI); g.stroke();
    }

    // head (its own frame: lifted by the neck, tilted about the neck base)
    g.save();
    g.translate(0, r * 0.85);
    g.rotate(headTilt);
    g.translate(0, -r * 0.85 - neckUp);
    const hw = r * 0.86 * p.hw;
    const head = new Path2D();
    head.ellipse(0, 0, hw, r * 0.92, 0, 0, TAU);
    const showEars = hairType !== 'long' && hairType !== 'wavy' && hairType !== 'curly';
    if (showEars) {
      g.fillStyle = skinC;
      for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(sd * hw * 0.98, r * 0.12, r * 0.14, r * 0.25, sd * 0.2, 0, TAU); g.fill(); }
    }
    g.fillStyle = hairType === 'shaved' ? skinC : hairC;
    g.fill(head);

    // hair mass for this style
    const hair = new Path2D();
    const amp = big ? 0.07 : 0.055;
    if (hairType === 'long') {
      blob(hair, 0, r * 0.75, hw * 1.12, r * 1.85, amp, R);
      blob(hair, 0, -r * 0.05, hw * 1.05, r * 1.04, amp * 0.6, R);
    } else if (hairType === 'wavy') {
      blob(hair, 0, r * 0.65, hw * 1.32, r * 1.75, amp * 2.2, R);
      blob(hair, 0, -r * 0.05, hw * 1.15, r * 1.08, amp * 1.6, R);
    } else if (hairType === 'curly') {
      blob(hair, 0, -r * 0.05, hw * 1.35, r * 1.22, amp * 3, R);
    } else if (hairType === 'bun') {
      blob(hair, 0, -r * 0.08, hw * 1.04, r * 0.98, amp * 0.6, R);
      blob(hair, rr(-0.2, 0.2) * r, -r * 0.95, r * 0.42, r * 0.38, amp * 2, R);
    } else if (hairType === 'ponytail') {
      blob(hair, 0, -r * 0.08, hw * 1.04, r * 0.98, amp * 0.6, R);
      blob(hair, rr(-0.1, 0.1) * r, r * 1.2, r * 0.3, r * 0.95, amp * 2, R);
    } else if (hairType === 'cap') {
      hair.moveTo(-hw * 1.1, -r * 0.05);
      hair.bezierCurveTo(-hw * 1.15, -r * 1.25, hw * 1.15, -r * 1.25, hw * 1.1, -r * 0.05);
      hair.lineTo(hw * 0.9, r * 0.15);
      hair.lineTo(-hw * 0.9, r * 0.15);
      hair.closePath();
    } else if (hairType === 'short') {
      // covers the crown and back of the head down to a hairline above the neck
      blob(hair, 0, -r * 0.12, hw * 1.04, r * 0.96, amp, R, Math.PI * 0.92, Math.PI * 2.08, false);
      hair.quadraticCurveTo(hw * 0.5, r * 0.75, 0, r * 0.8);
      hair.quadraticCurveTo(-hw * 0.5, r * 0.75, -hw * 1.0, r * 0.18);
      hair.closePath();
    }
    if (hairType !== 'shaved') {
      g.fillStyle = hairType === 'cap' ? clothLo : hairC;
      g.fill(hair);
      if (big && hairType !== 'cap') {
        // strands flowing from the crown
        g.save();
        g.clip(hair);
        const n = Math.round(r * (r > 25 ? 2.2 : 1.3));
        for (let k = 0; k < n; k++) {
          const a = rr(-1.3, 1.3);
          const x0 = Math.sin(a) * hw * 0.25, y0 = -r * 0.7;
          const len = longHair ? r * rr(1.6, 2.6) : r * rr(0.9, 1.4);
          // strands on the side facing the light pick it up
          const towards = Math.sin(a) * lx > 0;
          g.strokeStyle = towards && R() < 0.7 ? hairHi : hairLo;
          g.globalAlpha = rr(0.35, 0.8);
          g.lineWidth = Math.max(0.8, r * rr(0.03, r > 25 ? 0.07 : 0.09));
          g.beginPath();
          g.moveTo(x0, y0);
          g.bezierCurveTo(x0 + Math.sin(a) * hw * 1.2, y0 + len * 0.3, x0 + Math.sin(a) * hw * 1.3 + rr(-0.2, 0.2) * r, y0 + len * 0.7, x0 + Math.sin(a) * hw * rr(0.9, 1.4), y0 + len);
          g.stroke();
        }
        g.restore();
        g.globalAlpha = 1;
      }
    }
    if (p.turn && Math.abs(p.turn) > 0.45) {
      // head turned (talking to a friend, glancing back): the face's edge shows past the hair
      const sd = Math.sign(p.turn), k2 = Math.abs(p.turn);
      const prof = new Path2D();
      prof.moveTo(sd * hw * 0.55, -r * 0.55);
      prof.quadraticCurveTo(sd * hw * 0.95, -r * 0.5, sd * hw * 1.0, -r * 0.18);
      prof.lineTo(sd * (hw + r * 0.2 * k2), r * 0.04);
      prof.lineTo(sd * hw * 1.0, r * 0.16);
      prof.quadraticCurveTo(sd * (hw + r * 0.06), r * 0.3, sd * hw * 0.98, r * 0.36);
      prof.quadraticCurveTo(sd * hw * 1.0, r * 0.62, sd * hw * 0.72, r * 0.7);
      prof.quadraticCurveTo(sd * hw * 0.35, r * 0.82, sd * hw * 0.2, r * 0.6);
      prof.lineTo(sd * hw * 0.4, -r * 0.4);
      prof.closePath();
      g.fillStyle = skinC;
      g.fill(prof);
      g.fillStyle = skinLo; // eye socket + the shadow under the cheekbone
      g.beginPath(); g.ellipse(sd * hw * 0.82, -r * 0.12, r * 0.09, r * 0.06, 0, 0, TAU); g.fill();
      if (showEars || hairType === 'short') {
        g.fillStyle = skinC;
        g.beginPath(); g.ellipse(sd * hw * 0.35, r * 0.1, r * 0.13, r * 0.22, 0, 0, TAU); g.fill();
      }
    }

    // unlit copy: the light added below can then be pulled out as its own layer
    const base = canvas(W, H);
    base.getContext('2d').drawImage(c, 0, 0);

    // light from the stage: a sheen across the crown, the tops of the shoulders, then a crisp rim
    if (hairType !== 'shaved') {
      g.save();
      g.clip(hairType === 'cap' ? hair : head);
      const sx0 = lx * hw * 0.7, sy0 = -r * 0.45 + ly * r * 0.4;
      const sh = g.createRadialGradient(sx0, sy0, 0, sx0, sy0, r * 0.8);
      sh.addColorStop(0, `rgba(${o.rimColor},${0.08 * (o.sheen ?? 1)})`);
      sh.addColorStop(1, `rgba(${o.rimColor},0)`);
      g.fillStyle = sh;
      g.fillRect(-r * 2, -r * 2, r * 4, r * 2.5);
      g.restore();
    }
    g.restore(); // head frame
    g.save();
    g.clip(torso);
    const tg = g.createLinearGradient(0, r * 0.9, 0, r * 2.2);
    tg.addColorStop(0, `rgba(${o.rimColor},${lit * 0.35})`);
    tg.addColorStop(1, `rgba(${o.rimColor},0)`);
    g.fillStyle = tg;
    g.fillRect(-sw * 1.2, r * 0.8, sw * 2.4, r * 1.5);
    g.restore();

    // rim = silhouette minus itself shifted away from the light, tinted, laid back on top
    const rimPass = (w, a, broken) => {
      const m = canvas(W, H), mg = m.getContext('2d');
      mg.drawImage(c, 0, 0);
      mg.globalCompositeOperation = 'destination-out';
      mg.drawImage(c, -lx * w, -ly * w);
      if (broken && r > 9) {
        // soft, large-scale unevenness so the rim isn't a uniform outline
        for (let k = 0; k < 4; k++) {
          const a0 = rr(-Math.PI, 0), px = ox + Math.cos(a0) * r, py = oy + Math.sin(a0) * r;
          const eg = mg.createRadialGradient(px, py, 0, px, py, r * rr(0.3, 0.6));
          eg.addColorStop(0, 'rgba(0,0,0,0.7)');
          eg.addColorStop(1, 'rgba(0,0,0,0)');
          mg.fillStyle = eg;
          mg.fillRect(0, 0, W, H);
        }
      }
      mg.globalCompositeOperation = 'source-in';
      mg.fillStyle = `rgba(${o.rimColor},${a})`;
      mg.fillRect(0, 0, W, H);
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-atop';
      g.drawImage(m, 0, 0);
      g.restore();
    };
    const k = rr(0.55, 1.15); // not everyone stands in a clean line of sight to the stage
    rimPass(Math.max(2, r * 0.18), lit * 0.16 * k); // soft wrap
    rimPass(Math.max(1.6, r * 0.06), Math.min(1, lit * 1.0 * k), true); // crisp edge
    // light-only layer: what the stage light added, as white with its strength in alpha, so it
    // can be re-tinted and re-levelled per frame (spot colour, spot fader)
    const lite = canvas(W, H), lg = lite.getContext('2d');
    const A = c.getContext('2d').getImageData(0, 0, W, H).data, B = base.getContext('2d').getImageData(0, 0, W, H).data;
    const out = lg.createImageData(W, H), O = out.data;
    const [cr, cg, cb] = o.rimColor.split(',').map(Number), norm = 1 / (cr + cg + cb);
    for (let i = 0; i < A.length; i += 4) {
      // compare opacity-weighted colour, so faint strands outside the silhouette stay faint
      const aa = A[i + 3] / 255, ab = B[i + 3] / 255;
      const d = Math.max(0, A[i] * aa - B[i] * ab) + Math.max(0, A[i + 1] * aa - B[i + 1] * ab) + Math.max(0, A[i + 2] * aa - B[i + 2] * ab);
      if (d < 2) continue;
      O[i] = O[i + 1] = O[i + 2] = 255;
      O[i + 3] = Math.min(255, d * norm * 255);
    }
    lg.putImageData(out, 0, 0);
    return { c, base, lite, ox, oy, sw };
  }

  // per-frame: bob, sway and tilt the baked sprite; raised arms are drawn live
  // layer: 'c' fully lit (as baked), 'base' unlit, 'lite' the light alone (no arms)
  function drawBaked(g, p, t, o, layer = 'c') {
    const r = p.r, S = p.sprite, k = o.energy ?? 1;
    // uneven sway: each person on their own rate (p.f) with two out-of-step rhythms, so the
    // crowd never moves in lockstep; o.energy scales how much
    const t1 = t * p.f, ph = p.ph;
    const bob = (Math.sin(t1 + ph) * 0.6 + Math.sin(t1 * 1.93 + ph * 2.3) * 0.4) * r * o.bob * k;
    const sx = (Math.sin(t1 * 0.47 + ph * 1.7) * 0.7 + Math.sin(t1 * 0.81 + ph * 3.1) * 0.3) * r * o.sway * k;
    const tilt = p.tilt + (Math.sin(t1 * 0.31 + ph) * 0.03 + Math.sin(t1 * 0.57 + ph * 1.3) * 0.015) * k;
    g.save();
    g.translate(p.x + sx, p.y + bob);
    g.rotate(tilt);
    if (p.arm && !o.noArms && layer !== 'lite') {
      const sw = S.sw;
      g.lineCap = 'round';
      for (const side of p.arms2 ? [-1, 1] : [p.side]) {
        // arms sway to the beat, the pair slightly out of phase
        const ph = t * p.f * 1.3 + p.ph + (side > 0 ? 0.6 : 0);
        const sway = p.armStyle === 0 ? Math.sin(ph) * 0.35 : p.armStyle === 2 ? Math.sin(ph * 0.3) * 0.06 : 0;
        const pump = p.armStyle === 1 ? Math.max(0, Math.sin(ph * 2.2)) * r * 0.55 : 0;
        const sh = [side * sw * 0.72, r * 1.35];
        const el = [side * (sw * 0.95 + r * 0.25), r * 0.05 + pump * 0.5];
        const hand = [side * (sw * 0.55 + r * 0.5) + Math.sin(sway) * r * 1.6, -r * 2.0 + Math.abs(Math.cos(sway)) * r * 0.2 + pump];
        // dark limb, then a lit stripe along the side facing the stage: reads as a rounded arm
        const ls = (p.lside || 1) * r * 0.12;
        g.strokeStyle = p.armDark || p.armC;
        g.lineWidth = r * 0.78;
        g.beginPath(); g.moveTo(...sh); g.quadraticCurveTo(side * (sw + r * 0.1), r * 0.85, ...el); g.stroke();
        g.lineWidth = r * 0.6;
        g.beginPath(); g.moveTo(...el); g.quadraticCurveTo(el[0] - side * r * 0.15, (el[1] + hand[1]) / 2, hand[0], hand[1] + r * 0.2); g.stroke();
        g.strokeStyle = o.armLit || p.armC; // the lit side takes the live light colour when given
        g.globalAlpha *= 0.7;
        g.lineWidth = r * 0.2;
        g.beginPath(); g.moveTo(sh[0] + ls, sh[1] - r * 0.1); g.lineTo(el[0] + ls, el[1]); g.lineTo(hand[0] + ls * 0.8, hand[1] + r * 0.25); g.stroke();
        g.globalAlpha /= 0.7;
        // hand: palm with a thumb, tipped with the sway
        g.save();
        g.translate(hand[0], hand[1]);
        g.rotate(sway * 0.8 + side * 0.15);
        g.fillStyle = p.armDark || p.armC;
        g.beginPath(); g.ellipse(0, -r * 0.08, r * 0.3, r * 0.38, 0, 0, TAU); g.fill();
        g.beginPath(); g.ellipse(side * -r * 0.2, r * 0.05, r * 0.08, r * 0.16, side * 0.6, 0, TAU); g.fill();
        g.fillStyle = p.skinC || p.armC;
        g.globalAlpha *= 0.75;
        g.beginPath(); g.ellipse((p.lside || 1) * r * 0.1, -r * 0.14, r * 0.1, r * 0.2, 0, 0, TAU); g.fill();
        g.globalAlpha /= 0.75;
        g.restore();
      }
    }
    g.drawImage(S[layer], -S.ox, -S.oy);
    g.restore();
  }

  // Tiny phone with the show on its screen.
  function phoneSprite() {
    const c = canvas(60, 104), g = c.getContext('2d');
    g.fillStyle = '#06090a';
    g.beginPath(); g.roundRect(0, 0, 60, 104, 9); g.fill();
    const sc = g.createLinearGradient(0, 0, 0, 104);
    sc.addColorStop(0, '#ffe3bf');
    sc.addColorStop(1, '#d99a62');
    g.fillStyle = sc;
    g.beginPath(); g.roundRect(4, 4, 52, 96, 6); g.fill();
    const sp = g.createRadialGradient(30, 58, 2, 30, 58, 32);
    sp.addColorStop(0, 'rgba(255,255,250,1)');
    sp.addColorStop(1, 'rgba(255,240,220,0)');
    g.fillStyle = sp;
    g.fillRect(4, 4, 52, 96);
    g.fillStyle = 'rgba(70,40,25,0.75)';
    g.beginPath(); g.ellipse(30, 50, 5, 6, 0, 0, TAU); g.fill();
    g.fillRect(25, 55, 10, 20);
    g.beginPath(); g.ellipse(30, 78, 20, 4, 0, 0, TAU); g.fill();
    return c;
  }

  // ---------- painterly post-process (WebGL2) ----------
  // Every frame: brush-wobble warp → structure tensor → blurred tensor →
  // anisotropic Kuwahara (8 sectors, polynomial weights) → canvas grain.
  // Gives flat oil-paint patches that follow the image's edges, on animated frames.
  function makePainter(cv, w, h, opt = {}) {
    const gl = cv.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false });
    if (!gl) return null;
    const half = gl.getExtension('EXT_color_buffer_float') ? gl.RGBA16F : gl.RGBA8;
    const vs = `#version 300 es
      in vec2 p; out vec2 uv;
      void main(){ uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0., 1.); }`;
    const head = `#version 300 es
      precision highp float; in vec2 uv; out vec4 o; uniform vec2 px;`;
    const FS = {
      // displace lookups by a slow noise field so straight CG edges wobble like brushwork
      warp: `${head} uniform sampler2D src, nz; uniform float amp; uniform vec2 boil;
        void main(){
          vec2 n = texture(nz, uv * vec2(${(w / 256).toFixed(3)}, ${(h / 256).toFixed(3)}) * 0.5 + boil).xy - 0.5;
          vec2 n2 = texture(nz, uv * vec2(${(w / 256).toFixed(3)}, ${(h / 256).toFixed(3)}) * 2.1 + 0.37 + boil * 1.7).zw - 0.5;
          o = texture(src, uv + (n * amp + n2 * amp * 0.45) * px);
        }`,
      tensor: `${head} uniform sampler2D src;
        vec3 c(float x, float y){ return texture(src, uv + vec2(x, y) * px).rgb; }
        void main(){
          vec3 sx = (c(-1.,-1.) + 2.*c(-1.,0.) + c(-1.,1.) - c(1.,-1.) - 2.*c(1.,0.) - c(1.,1.)) * 0.25;
          vec3 sy = (c(-1.,-1.) + 2.*c(0.,-1.) + c(1.,-1.) - c(-1.,1.) - 2.*c(0.,1.) - c(1.,1.)) * 0.25;
          o = vec4(dot(sx, sx), dot(sy, sy), dot(sx, sy), 1.);
        }`,
      blur: `${head} uniform sampler2D src; uniform vec2 dir;
        void main(){
          vec4 s = vec4(0.); float ws = 0.;
          for (int i = -6; i <= 6; i++) { float w = exp(-float(i*i) / 8.); s += texture(src, uv + dir * float(i) * px) * w; ws += w; }
          o = s / ws;
        }`,
      kuwa: `${head} uniform sampler2D src, tfm; uniform int R; uniform float hard, sharp;
        void main(){
          vec3 g = texture(tfm, uv).xyz;
          float d = sqrt(max(0., (g.x - g.y) * (g.x - g.y) + 4. * g.z * g.z));
          float l1 = 0.5 * (g.x + g.y + d), l2 = 0.5 * (g.x + g.y - d);
          vec2 t = vec2(l1 - g.x, -g.z);
          t = length(t) > 1e-7 ? normalize(t) : vec2(0., 1.);
          float phi = -atan(t.y, t.x);
          float A = (l1 + l2 > 1e-7) ? (l1 - l2) / (l1 + l2) : 0.;
          float r = float(R);
          float a = r * clamp((1. + A), 0.1, 2.), b = r * clamp(1. / (1. + A), 0.1, 2.);
          float cp = cos(phi), sp = sin(phi);
          mat2 SR = mat2(0.5 / a, 0., 0., 0.5 / b) * mat2(cp, -sp, sp, cp);
          int mx = int(sqrt(a*a*cp*cp + b*b*sp*sp)), my = int(sqrt(a*a*sp*sp + b*b*cp*cp));
          float zeta = 2. / r, zc = 0.58, eta = (zeta + cos(zc)) / (sin(zc) * sin(zc));
          vec4 m[8]; vec3 s[8];
          for (int k = 0; k < 8; k++) { m[k] = vec4(0.); s[k] = vec3(0.); }
          for (int y = -my; y <= my; y++) for (int x = -mx; x <= mx; x++) {
            vec2 v = SR * vec2(x, y);
            if (dot(v, v) > 0.25) continue;
            vec3 c = clamp(texture(src, uv + vec2(x, y) * px).rgb, 0., 1.);
            float w[8]; float sum = 0., z, vxx, vyy;
            vxx = zeta - eta * v.x * v.x; vyy = zeta - eta * v.y * v.y;
            z = max(0., v.y + vxx); w[0] = z*z; z = max(0., -v.x + vyy); w[2] = z*z;
            z = max(0., -v.y + vxx); w[4] = z*z; z = max(0., v.x + vyy); w[6] = z*z;
            v = 0.70710678 * vec2(v.x - v.y, v.x + v.y);
            vxx = zeta - eta * v.x * v.x; vyy = zeta - eta * v.y * v.y;
            z = max(0., v.y + vxx); w[1] = z*z; z = max(0., -v.x + vyy); w[3] = z*z;
            z = max(0., -v.y + vxx); w[5] = z*z; z = max(0., v.x + vyy); w[7] = z*z;
            for (int k = 0; k < 8; k++) sum += w[k];
            float gk = exp(-3.125 * dot(v, v)) / max(sum, 1e-6);
            for (int k = 0; k < 8; k++) { float wk = w[k] * gk; m[k] += vec4(c * wk, wk); s[k] += c * c * wk; }
          }
          vec4 acc = vec4(0.);
          for (int k = 0; k < 8; k++) {
            if (m[k].w <= 0.) continue;
            vec3 mu = m[k].rgb / m[k].w;
            vec3 va = abs(s[k] / m[k].w - mu * mu);
            float wt = 1. / (1. + pow(hard * 1000. * (va.r + va.g + va.b), 0.5 * sharp));
            acc += vec4(mu * wt, wt);
          }
          vec3 col = acc.w > 0. ? acc.rgb / acc.w : texture(src, uv).rgb;
          o = vec4(col, 1.);
        }`,
      // full-resolution composite: (possibly upsampled) paint + canvas grain + crisp focal layer
      compose: `${head} uniform sampler2D paint, top, nz; uniform float grain;
        void main(){
          vec3 col = texture(paint, uv).rgb;
          float cw = texture(nz, uv * vec2(${(w / 9).toFixed(1)}, ${(h / 9).toFixed(1)}) / 256. * 9.).x - 0.5;
          float lum = dot(col, vec3(0.3, 0.59, 0.11));
          col += cw * grain * (0.35 + lum);
          vec4 tp = texture(top, uv);
          o = vec4(mix(col, tp.rgb, tp.a), 1.);
        }`,
      copy: `${head} uniform sampler2D src, top; void main(){ vec4 tp = texture(top, uv); o = vec4(mix(texture(src, uv).rgb, tp.rgb, tp.a), 1.); }`,
      // the camera that took the picture: bloom, veiling glare, aperture starbursts, ghosts strung
      // through the centre, dirt on the front element, fringing, auto-exposure, and a sensor that
      // clips with a soft shoulder. sA = (x, y, core size, strength), sB = (colour, -).
      lens: `${head} uniform sampler2D img, dirtT; uniform float expo, bloom, ca, dirt, ghost, star, streak, fz, frot; uniform vec2 foff; uniform vec3 veil; uniform vec4 sA[6], sB[6]; uniform int ns;
        const float AS = ${(w / h).toFixed(4)};
        void main(){
          vec2 asp = vec2(AS, 1.);
          // the camera frame: zoomed in, offset and rolled (a hand-held camera); identity by default
          vec2 q = (uv - 0.5) * asp; float cr = cos(frot), sr = sin(frot);
          vec2 fuv = vec2(cr * q.x - sr * q.y, sr * q.x + cr * q.y) / fz / asp + 0.5 + foff;
          vec2 c = fuv - 0.5;
          vec2 off = c * ca * 0.006;
          vec3 col = vec3(textureLod(img, fuv + off, 0.).r, textureLod(img, fuv, 0.).g, textureLod(img, fuv - off, 0.).b);
          vec3 b = textureLod(img, fuv, 3.).rgb * 0.45 + textureLod(img, fuv, 4.5).rgb * 0.35 + textureLod(img, fuv, 6.).rgb * 0.2;
          col += max(b - 0.3, 0.) * bloom;
          vec3 gl = veil, dc = vec3(0.);
          float GF[5] = float[5](-0.35, -0.7, -1.15, 0.4, -1.7), GR[5] = float[5](0.025, 0.06, 0.11, 0.018, 0.17);
          vec3 GT[5] = vec3[5](vec3(1., .75, .4), vec3(.4, .9, 1.), vec3(.7, .5, 1.), vec3(1.), vec3(.4, 1., .6));
          for (int i = 0; i < 6; i++) {
            if (i >= ns) break;
            vec2 sp = sA[i].xy; float sz = sA[i].z, k = sA[i].w; vec3 sc = sB[i].rgb;
            vec2 d = (fuv - sp) * asp; float r = length(d), r2 = r * r;
            gl += sc * k * (0.07 / (1. + r2 * 30.) + 0.9 * exp(-r2 / (sz * sz)));
            float th = atan(d.y, d.x);
            float spk = pow(abs(cos(th * 3.)), 90.) + 0.35 * pow(abs(cos(th * 3. + 0.5236)), 220.);
            gl += sc * k * star * spk * exp(-r / (0.03 + 0.09 * min(k, 2.))) * 0.7;
            gl += mix(sc, vec3(.45, .65, 1.), .5) * k * streak * exp(-abs(d.y) * 260.) * exp(-abs(d.x) * 3.) * 0.45;
            for (int j = 0; j < 5; j++) {
              vec2 gp = 0.5 + (sp - 0.5) * GF[j];
              float gr = length((fuv - gp) * asp), R0 = GR[j] * (0.8 + 0.4 * min(k, 1.5));
              float disc = smoothstep(R0, R0 * 0.82, gr) * (0.55 + 0.45 * smoothstep(R0 * 0.4, R0, gr));
              gl += GT[j] * sc * k * ghost * disc * 0.05;
            }
            dc += sc * k * exp(-r * 2.2);
          }
          gl += texture(dirtT, uv).r * dirt * dc * 0.6;
          col = col * expo + gl;
          float mx = max(col.r, max(col.g, col.b));
          col += max(mx - 0.9, 0.) * 0.55;
          col = min(col, 0.8) + 0.2 * (1. - exp(-max(col - 0.8, 0.) / 0.2));
          o = vec4(col, 1.);
        }`,
    };
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const progs = {};
    try {
      for (const [k, fs] of Object.entries(FS)) {
        const p = gl.createProgram();
        gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
        gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
        gl.bindAttribLocation(p, 0, 'p');
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
        progs[k] = p;
      }
    } catch (e) {
      console.warn('painter disabled:', e.message);
      return null;
    }
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // the paint passes can run at reduced resolution (opt.scale) and get upsampled in compose
    let sc = 1, pw = w, ph = h;
    const tex = (fmt, data, wrap = gl.CLAMP_TO_EDGE, tw = w, th = h) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      const type = fmt === gl.RGBA16F ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
      gl.texImage2D(gl.TEXTURE_2D, 0, fmt, tw, th, 0, gl.RGBA, type, data || null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
      return t;
    };
    const fbo = t => {
      const f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      return f;
    };
    // tileable noise for the wobble field (xy: coarse, zw: fine) and the canvas weave
    const n1 = noise2(77, 8), n2 = noise2(78, 8), n3 = noise2(79, 32), n4 = noise2(80, 32);
    const nd = new Uint8Array(256 * 256 * 4);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const i = (y * 256 + x) * 4, X = x / 32, Y = y / 32;
      nd[i] = fbm(n1, X, Y, 3, 8) * 255;
      nd[i + 1] = fbm(n2, X, Y, 3, 8) * 255;
      nd[i + 2] = fbm(n3, x / 8, y / 8, 2, 32) * 255;
      nd[i + 3] = fbm(n4, x / 8, y / 8, 2, 32) * 255;
    }
    const tNoise = tex(gl.RGBA8, nd, gl.REPEAT, 256, 256);
    const tSrc = tex(gl.RGBA8), tTop = tex(gl.RGBA8);
    // full-resolution composite, mipmapped so the lens pass can bloom from its coarse levels
    const tComp = tex(gl.RGBA8), fComp = fbo(tComp);
    gl.bindTexture(gl.TEXTURE_2D, tComp);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    // grime on the front element: soft smudges, specks and a few hairline scratches
    const dcv = canvas(512, Math.round((512 * h) / w)), dg = dcv.getContext('2d'), DR = rng(91);
    dg.fillStyle = '#000';
    dg.fillRect(0, 0, dcv.width, dcv.height);
    for (let i = 0; i < 46; i++) {
      const x = DR() * dcv.width, y = DR() * dcv.height, r = 8 + DR() ** 2 * 70, a = 0.08 + DR() * 0.3;
      const gr = dg.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.6, `rgba(255,255,255,${a * 0.5})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      dg.fillStyle = gr;
      dg.beginPath(); dg.ellipse(x, y, r, r * (0.6 + DR() * 0.4), DR() * 3, 0, TAU); dg.fill();
    }
    for (let i = 0; i < 140; i++) { dg.fillStyle = `rgba(255,255,255,${0.25 + DR() * 0.6})`; dg.beginPath(); dg.arc(DR() * dcv.width, DR() * dcv.height, 0.5 + DR() * 1.6, 0, TAU); dg.fill(); }
    dg.lineWidth = 0.7;
    for (let i = 0; i < 7; i++) {
      const x = DR() * dcv.width, y = DR() * dcv.height, a0 = DR() * TAU, rr = 40 + DR() * 160;
      dg.strokeStyle = `rgba(255,255,255,${0.15 + DR() * 0.25})`;
      dg.beginPath(); dg.arc(x, y, rr, a0, a0 + 0.2 + DR() * 0.5); dg.stroke();
    }
    const tDirt = tex(gl.RGBA8, null, gl.CLAMP_TO_EDGE, dcv.width, dcv.height);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, dcv);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    let tWarp, tPaint, tT1, tT2, fWarp, fT1, fT2, fPaint;
    // (re)allocate the paint-resolution targets; callable at runtime to change quality
    const alloc = scale => {
      for (const t of [tWarp, tPaint, tT1, tT2]) if (t) gl.deleteTexture(t);
      for (const f of [fWarp, fT1, fT2, fPaint]) if (f) gl.deleteFramebuffer(f);
      sc = scale; pw = Math.round(w * sc); ph = Math.round(h * sc);
      tWarp = tex(gl.RGBA8, null, gl.CLAMP_TO_EDGE, pw, ph); tPaint = tex(gl.RGBA8, null, gl.CLAMP_TO_EDGE, pw, ph);
      tT1 = tex(half, null, gl.CLAMP_TO_EDGE, pw, ph); tT2 = tex(half, null, gl.CLAMP_TO_EDGE, pw, ph);
      fWarp = fbo(tWarp); fT1 = fbo(tT1); fT2 = fbo(tT2); fPaint = fbo(tPaint);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };
    alloc(opt.scale || 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    const P = { radius: 6, wobble: 2.2, hard: 8, sharp: 8, grain: 0.035, boil: [0, 0], ...opt };
    const pass = (name, target, texs, uni = {}, vw = pw, vh = ph) => {
      const p = progs[name];
      gl.useProgram(p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target);
      gl.viewport(0, 0, vw, vh);
      Object.entries(texs).forEach(([u, t], i) => {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.uniform1i(gl.getUniformLocation(p, u), i);
      });
      gl.uniform2f(gl.getUniformLocation(p, 'px'), 1 / vw, 1 / vh);
      for (const [u, v] of Object.entries(uni)) {
        const loc = gl.getUniformLocation(p, u);
        if (v instanceof Float32Array) gl.uniform4fv(loc, v);
        else if (Array.isArray(v)) v.length === 3 ? gl.uniform3f(loc, v[0], v[1], v[2]) : gl.uniform2f(loc, v[0], v[1]);
        else if (u === 'R' || u === 'ns') gl.uniform1i(loc, v);
        else gl.uniform1f(loc, v);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    return {
      P,
      setScale(scale, radius) { alloc(scale); if (radius) P.radius = radius; },
      // lens: null, or what the camera sees this frame (see the lens shader); src as
      // [{x, y (pixels), size (fraction of height), k (strength), col (0..255)}]
      // frame: null, or the camera's framing {zoom, dx, dy, rot} (hand-held shake, a closer crop)
      draw(srcCanvas, topCanvas, on = true, lens = null, frame = null) {
        if (frame && !lens) lens = { src: [] }; // framing goes through the same final pass
        gl.bindTexture(gl.TEXTURE_2D, tSrc);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, srcCanvas);
        gl.bindTexture(gl.TEXTURE_2D, tTop);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, topCanvas);
        const out = lens ? fComp : null;
        if (!on) pass('copy', out, { src: tSrc, top: tTop }, {}, w, h);
        else {
          pass('warp', fWarp, { src: tSrc, nz: tNoise }, { amp: P.wobble * sc, boil: P.boil });
          pass('tensor', fT1, { src: tWarp });
          pass('blur', fT2, { src: tT1 }, { dir: [1, 0] });
          pass('blur', fT1, { src: tT2 }, { dir: [0, 1] });
          pass('kuwa', fPaint, { src: tWarp, tfm: tT1 }, { R: P.radius, hard: P.hard, sharp: P.sharp });
          pass('compose', out, { paint: tPaint, top: tTop, nz: tNoise }, { grain: P.grain }, w, h);
        }
        if (!lens) return;
        gl.bindTexture(gl.TEXTURE_2D, tComp);
        gl.generateMipmap(gl.TEXTURE_2D);
        const sA = new Float32Array(24), sB = new Float32Array(24), S = (lens.src || []).slice(0, 6);
        S.forEach((s, i) => {
          sA.set([s.x / w, 1 - s.y / h, s.size ?? 0.02, s.k], i * 4);
          sB.set([s.col[0] / 255, s.col[1] / 255, s.col[2] / 255, 0], i * 4);
        });
        pass('lens', null, { img: tComp, dirtT: tDirt }, {
          expo: lens.expo ?? 1, bloom: lens.bloom ?? 0, ca: lens.ca ?? 0, dirt: lens.dirt ?? 0, ghost: lens.ghost ?? 0,
          star: lens.star ?? 0, streak: lens.streak ?? 0, veil: lens.veil || [0, 0, 0], sA, sB, ns: S.length,
          fz: frame ? frame.zoom : 1, frot: frame ? frame.rot : 0, foff: frame ? [frame.dx, frame.dy] : [0, 0],
        }, w, h);
      },
    };
  }

  // ---------- runner + UI ----------
  function run(scene) {
    const cv = document.getElementById('c');
    cv.width = scene.W;
    cv.height = scene.H;
    // Scenes always draw with Canvas 2D. With `scene.paint`, they draw offscreen and the
    // visible canvas shows the painterly WebGL pass; otherwise they draw straight to it.
    const pscale = +(new URLSearchParams(location.search).get('pscale') || 0);
    const painter = scene.paint ? makePainter(cv, scene.W, scene.H, pscale ? { ...scene.paint, scale: pscale, radius: Math.max(2, Math.round(scene.paint.radius * pscale)) } : scene.paint) : null;
    const src = painter ? canvas(scene.W, scene.H) : cv;
    const ctx = src.getContext('2d');
    // optional crisp layer for focal detail the paint filter would smear away
    const top = painter ? canvas(scene.W, scene.H) : null;
    const topCtx = top && top.getContext('2d');
    const params = new URLSearchParams(location.search);
    const state = { bpm: +(params.get('bpm') || scene.bpm || 80), intensity: 1, playing: true, clocks: {}, on: {}, speed: {} };
    for (const k of scene.toggles) { state.on[k] = true; state.clocks[k] = +(params.get('t') || 0); }
    const still = params.has('still');

    const ui = scene.ui === false ? document.createElement('div') : document.getElementById('ui');
    const el = (tag, attrs = {}, text) => {
      const e = document.createElement(tag);
      Object.assign(e, attrs);
      if (text) e.textContent = text;
      return e;
    };
    const playBtn = el('button', { className: 'btn' }, 'Pause');
    playBtn.onclick = () => { state.playing = !state.playing; playBtn.textContent = state.playing ? 'Pause' : 'Play'; };
    ui.append(playBtn);
    const group = el('div', { className: 'group' });
    for (const k of scene.toggles) {
      const lab = el('label', { className: 'chk' });
      const cb = el('input', { type: 'checkbox', checked: true });
      cb.onchange = () => (state.on[k] = cb.checked);
      lab.append(cb, document.createTextNode(' ' + k));
      group.append(lab);
    }
    ui.append(group);
    state.paint = !params.has('raw');
    if (painter) {
      const lab = el('label', { className: 'chk' });
      const cb = el('input', { type: 'checkbox', checked: state.paint });
      cb.onchange = () => (state.paint = cb.checked);
      lab.append(cb, document.createTextNode(' painterly'));
      group.append(lab);
    }
    const slider = (name, min, max, step, key) => {
      const lab = el('label', { className: 'rng' });
      const out = el('span', {}, String(state[key]));
      const r = el('input', { type: 'range', min, max, step, value: state[key] });
      r.oninput = () => { state[key] = +r.value; out.textContent = r.value; };
      lab.append(document.createTextNode(name + ' '), r, out);
      ui.append(lab);
    };
    slider('Tempo', 50, 160, 1, 'bpm');
    slider('Lights', 0.2, 1.8, 0.05, 'intensity');
    if (scene.extraUI) scene.extraUI(ui, state, el);

    const secs = el('select', { className: 'btn' });
    for (const s of [5, 10, 20, 30]) secs.append(el('option', { value: s }, `${s}s`));
    secs.value = 10;
    const rec = el('button', { className: 'btn rec' }, '● Record video');
    rec.onclick = () => record(cv, +secs.value, rec, scene.file);
    const snap = el('button', { className: 'btn' }, 'PNG');
    snap.onclick = () => {
      const a = el('a', { download: scene.file + '.png', href: cv.toDataURL('image/png') });
      a.click();
    };
    ui.append(secs, rec, snap);

    scene.init(ctx, state);
    let last = performance.now(), drawn = false, acc = 0, boilF = 0;
    const frame = now => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (state.playing && !still) for (const k of scene.toggles) if (state.on[k]) state.clocks[k] += dt * (state.speed[k] ?? 1);
      acc += dt;
      // hand-made mode: hold each frame for 1/15 s and repaint the brushwork a little differently
      if ((!still || !drawn) && (!state.handmade || acc >= 1 / 15)) {
        acc = 0;
        if (state.handmade) boilF++;
        state.boilF = boilF; // scenes can redraw their own shapes a little differently each hand-made frame
        if (painter) painter.P.boil = state.handmade ? [(boilF * 0.6180339) % 1, (boilF * 0.4142135) % 1] : [0, 0];
        draw();
        drawn = true;
      }
      requestAnimationFrame(frame);
    };
    const draw = (paint = state.paint) => {
      scene.render(ctx, state);
      if (!painter) { if (scene.renderTop) scene.renderTop(ctx, state); return; }
      topCtx.clearRect(0, 0, scene.W, scene.H);
      if (scene.renderTop) scene.renderTop(topCtx, state);
      painter.draw(src, top, paint, state.lens || null, state.frame || null);
    };
    requestAnimationFrame(frame);
    // hooks for the screenshot / optimisation harness
    window.__scene = { state, render: draw, painter, src, top, ctx, topCtx, scene };
  }

  function record(cv, seconds, btn, file) {
    if (!window.MediaRecorder) { alert('This browser cannot record canvas video.'); return; }
    const types = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    const mimeType = types.find(t => MediaRecorder.isTypeSupported(t));
    const stream = cv.captureStream(60);
    const mr = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 16e6 });
    const chunks = [];
    mr.ondataavailable = e => e.data.size && chunks.push(e.data);
    mr.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${file}.${mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'}`;
      a.click();
      btn.disabled = false;
      btn.textContent = '● Record video';
    };
    btn.disabled = true;
    let left = seconds;
    btn.textContent = `Recording… ${left}s`;
    const iv = setInterval(() => {
      left--;
      btn.textContent = `Recording… ${left}s`;
      if (left <= 0) { clearInterval(iv); mr.stop(); }
    }, 1000);
    mr.start(250);
  }

  return { TAU, rng, clamp, smooth, lerp, canvas, noise2, fbm, glow, paintOverlay, drawPerformer, makePerson, drawPerson, bakePerson, drawBaked, phoneSprite, run };
})();
