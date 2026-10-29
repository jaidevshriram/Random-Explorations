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
  // Built in local units: feet at (0,0), roughly 100 units tall, facing the camera.
  // Guitar frame is rotated so the neck points up and to the viewer's right.
  function performerPose(t, bpm) {
    const beat = (t * bpm) / 60;
    return {
      sway: Math.sin(t * 0.9) * 0.028,
      nod: Math.abs(Math.sin(beat * Math.PI)) * 0.9,
      strum: Math.sin(beat * TAU * 2) * (0.75 + 0.25 * Math.sin(beat * 0.5)),
      fret: 33 + [0, 4, -2, 2][Math.floor(beat / 4) % 4] + Math.sin(t * 3) * 0.3,
      hair: Math.sin(t * 1.3) * 1.1,
    };
  }

  // Guitar frame: body centred mid-torso, neck rising to the viewer's right.
  const GUITAR = { x: 1, y: -55, a: -0.42 };
  const onNeck = u => [
    GUITAR.x + Math.cos(GUITAR.a) * u,
    GUITAR.y + Math.sin(GUITAR.a) * u,
  ];

  function drawPerformer(g, x, y, s, t, bpm, style) {
    const P = performerPose(t, bpm);
    const sketch = style === 'sketch';
    const rim = sketch ? 'rgba(165,255,245,0.9)' : 'rgba(150,235,225,0.5)';
    const rimW = sketch ? 0.7 : 0.45;

    g.save();
    g.translate(x, y);
    g.scale(s, s);
    g.lineJoin = 'round';
    g.lineCap = 'round';

    let cloth, sleeve;
    if (sketch) cloth = sleeve = '#040d16';
    else {
      cloth = g.createLinearGradient(0, -98, 0, 0);
      cloth.addColorStop(0, '#3a6c6b');
      cloth.addColorStop(0.14, '#142b2e');
      cloth.addColorStop(0.45, '#0a171a');
      cloth.addColorStop(1, '#061012');
      sleeve = g.createLinearGradient(0, -86, 0, -50);
      sleeve.addColorStop(0, '#4f8886');
      sleeve.addColorStop(1, '#132a2d');
    }
    const hy = -P.nod;
    const hairFill = g.createLinearGradient(0, -98 + hy, 0, -72);
    hairFill.addColorStop(0, sketch ? '#f0fffc' : '#e3f6f3');
    hairFill.addColorStop(0.45, sketch ? '#a6ece3' : '#9cc4c1');
    hairFill.addColorStop(1, sketch ? '#3f8e88' : '#3c6260');

    const shape = (path, fill, outline = true) => {
      g.fillStyle = fill;
      g.fill(path);
      if (outline) {
        g.strokeStyle = rim;
        g.lineWidth = rimW;
        g.stroke(path);
      }
    };

    // mic stand stays put while the body sways
    g.strokeStyle = sketch ? 'rgba(150,240,230,0.75)' : '#0b171a';
    g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(31, -10); g.lineTo(31, -68); g.lineTo(14, -86);
    g.moveTo(31, -10); g.lineTo(23, 0); g.moveTo(31, -10); g.lineTo(39, 0); g.moveTo(31, -10); g.lineTo(31.5, 0.8);
    g.stroke();
    if (!sketch) {
      g.strokeStyle = 'rgba(160,240,230,0.45)';
      g.lineWidth = 0.45;
      g.beginPath(); g.moveTo(31.4, -68); g.lineTo(31.4, -11); g.moveTo(31.3, -68); g.lineTo(14.3, -86); g.stroke();
    }

    g.rotate(P.sway);

    // legs: long, slightly flared trousers
    const legs = new Path2D();
    legs.moveTo(-7.6, -54); legs.lineTo(-0.4, -54); legs.lineTo(-1.6, -2); legs.lineTo(-9.4, -2); legs.closePath();
    legs.moveTo(0.4, -54); legs.lineTo(7.6, -54); legs.lineTo(9.4, -2); legs.lineTo(1.6, -2); legs.closePath();
    shape(legs, cloth);
    const boots = new Path2D();
    boots.ellipse(-5.6, -1, 4.4, 1.7, 0, 0, TAU);
    boots.ellipse(5.6, -1, 4.4, 1.7, 0, 0, TAU);
    shape(boots, '#04080a', sketch);

    const backHair = new Path2D();
    backHair.moveTo(-4.6, -97 + hy);
    backHair.bezierCurveTo(-7.6, -95 + hy, -7.4, -86 + hy, -7.4 + P.hair * 0.3, -76);
    backHair.bezierCurveTo(-7.2 + P.hair * 0.6, -72.5, -5, -72.5, -3.8, -74);
    backHair.lineTo(3.8, -74);
    backHair.bezierCurveTo(5, -72.5, 7.2 + P.hair * 0.6, -72.5, 7.4 + P.hair * 0.3, -76);
    backHair.bezierCurveTo(7.4, -86 + hy, 7.6, -95 + hy, 4.6, -97 + hy);
    backHair.quadraticCurveTo(0, -100.5 + hy, -4.6, -97 + hy);
    backHair.closePath();
    shape(backHair, hairFill, sketch);

    const torso = new Path2D();
    torso.moveTo(-7, -52);
    torso.bezierCurveTo(-7.4, -62, -10.4, -74, -10.6, -80);
    torso.quadraticCurveTo(-10, -84.5, -4, -85.5);
    torso.lineTo(4, -85.5);
    torso.quadraticCurveTo(10, -84.5, 10.6, -80);
    torso.bezierCurveTo(10.4, -74, 7.4, -62, 7, -52);
    torso.closePath();
    shape(torso, cloth);

    const head = new Path2D();
    head.ellipse(0.4, -91 + hy, 3.7, 4.8, 0, 0, TAU);
    shape(head, sketch ? '#8fc4bf' : '#a2bfbc', false);

    // fringe + strands framing the face
    const frontHair = new Path2D();
    frontHair.moveTo(-4.4, -91 + hy);
    frontHair.bezierCurveTo(-5.2, -100.5 + hy, 5.4, -100.5 + hy, 4.6, -91 + hy);
    frontHair.bezierCurveTo(3, -94.5 + hy, -1.5, -95 + hy, -4.4, -91 + hy);
    for (const sd of [-1, 1]) {
      frontHair.moveTo(sd * 4.3, -93 + hy);
      frontHair.bezierCurveTo(sd * 5, -87 + hy, sd * (5.6 + P.hair * 0.3), -81, sd * (6.4 + P.hair * 0.4), -74.5);
      frontHair.lineTo(sd * 4.2, -75.5);
      frontHair.bezierCurveTo(sd * 3.6, -81, sd * 3.2, -87 + hy, sd * 3.1, -91 + hy);
      frontHair.closePath();
    }
    shape(frontHair, hairFill, false);

    // guitar
    g.save();
    g.translate(GUITAR.x, GUITAR.y);
    g.rotate(GUITAR.a);
    const gt = new Path2D();
    gt.ellipse(-6, 0, 10.5, 10.8, 0, 0, TAU);
    gt.ellipse(6, 0, 7.6, 8.2, 0, 0, TAU);
    shape(gt, sketch ? '#030a12' : '#0a1619');
    const neck = new Path2D();
    neck.rect(12, -1.3, 26, 2.6);
    neck.rect(38, -2.1, 6, 4.2);
    shape(neck, sketch ? '#061420' : '#0c191c');
    g.fillStyle = '#020506';
    g.beginPath(); g.arc(3, 0, 2.6, 0, TAU); g.fill();
    if (!sketch) {
      g.strokeStyle = 'rgba(170,250,240,0.4)';
      g.lineWidth = 0.55;
      g.beginPath(); g.ellipse(-6, 0, 10.5, 10.8, 0, Math.PI * 1.0, Math.PI * 1.7); g.stroke();
      g.beginPath(); g.ellipse(6, 0, 7.6, 8.2, 0, Math.PI * 1.2, Math.PI * 1.8); g.stroke();
    }
    g.restore();

    // arms: stroked limbs with a rim pass underneath
    const [fx, fy] = onNeck(27 + (P.fret - 33) * 0.6);
    const arms = [
      [[-9.4, -83], [-14, -63], [-2 + P.strum * 1.2, -53 + P.strum * 3.2]],
      [[9.4, -83], [17, -64], [fx, fy]],
    ];
    for (const pass of [0, 1]) {
      g.strokeStyle = pass === 0 ? (sketch ? rim : 'rgba(120,210,200,0.3)') : sleeve;
      g.lineWidth = pass === 0 ? 3.2 + rimW * 2 : 3.1;
      for (const [a, b, c] of arms) {
        g.beginPath(); g.moveTo(...a); g.quadraticCurveTo(...b, ...c); g.stroke();
      }
    }
    g.fillStyle = sketch ? '#bfe9e3' : '#7f9f9c';
    for (const [, , c] of arms) { g.beginPath(); g.arc(c[0], c[1], 1.4, 0, TAU); g.fill(); }

    // mic head over everything
    g.rotate(-P.sway);
    g.fillStyle = sketch ? '#d6fff9' : '#2b4247';
    g.beginPath(); g.ellipse(12.5, -86.6, 2.2, 1.3, -0.75, 0, TAU); g.fill();
    g.restore();
  }

  // ---------- crowd ----------
  function makePerson(R, x, y, r, opt = {}) {
    const L = 3 + R() * 9;
    return {
      x, y, r,
      ph: R() * TAU,
      f: 0.7 + R() * 0.9,
      hair: R(),
      hw: 0.85 + R() * 0.25,          // head width
      sw: 1.55 + R() * 0.55,          // shoulder half-width (in head radii)
      tilt: (R() - 0.5) * 0.3,
      warm: R() < (opt.warm || 0),
      body: `rgb(${L * 0.45 | 0},${L * 1.15 | 0},${L * 1.3 | 0})`,
      head: `rgb(${L * 0.5 | 0},${L * 1.1 | 0},${L * 1.25 | 0})`,
      phone: r > 5 && R() < (opt.phones || 0),
      arm: r > 6 && r < 22 && R() < (opt.arms || 0), // a raised, swaying arm (mid-crowd only)
      side: R() < 0.5 ? -1 : 1,
      jit: [R(), R(), R(), R()],
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
      warp: `${head} uniform sampler2D src, nz; uniform float amp;
        void main(){
          vec2 n = texture(nz, uv * vec2(${(w / 256).toFixed(3)}, ${(h / 256).toFixed(3)}) * 0.5).xy - 0.5;
          vec2 n2 = texture(nz, uv * vec2(${(w / 256).toFixed(3)}, ${(h / 256).toFixed(3)}) * 2.1 + 0.37).zw - 0.5;
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
      kuwa: `${head} uniform sampler2D src, tfm, nz, top; uniform int R; uniform float hard, sharp, grain;
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
          // canvas weave + fine grain, strongest in the mid-tones
          float cw = texture(nz, uv * vec2(${(w / 9).toFixed(1)}, ${(h / 9).toFixed(1)}) / 256. * 9.).x - 0.5;
          float lum = dot(col, vec3(0.3, 0.59, 0.11));
          col += cw * grain * (0.35 + lum);
          // crisp focal layer (orb, performer) laid over the paint
          vec4 tp = texture(top, uv);
          col = mix(col, tp.rgb, tp.a);
          o = vec4(col, 1.);
        }`,
      copy: `${head} uniform sampler2D src, top; void main(){ vec4 tp = texture(top, uv); o = vec4(mix(texture(src, uv).rgb, tp.rgb, tp.a), 1.); }`,
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
    const tSrc = tex(gl.RGBA8), tTop = tex(gl.RGBA8), tWarp = tex(gl.RGBA8), tT1 = tex(half), tT2 = tex(half);
    const fWarp = fbo(tWarp), fT1 = fbo(tT1), fT2 = fbo(tT2);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    const P = { radius: 6, wobble: 2.2, hard: 8, sharp: 8, grain: 0.035, ...opt };
    const pass = (name, target, texs, uni = {}) => {
      const p = progs[name];
      gl.useProgram(p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target);
      gl.viewport(0, 0, w, h);
      Object.entries(texs).forEach(([u, t], i) => {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.uniform1i(gl.getUniformLocation(p, u), i);
      });
      gl.uniform2f(gl.getUniformLocation(p, 'px'), 1 / w, 1 / h);
      for (const [u, v] of Object.entries(uni)) {
        const loc = gl.getUniformLocation(p, u);
        if (Array.isArray(v)) gl.uniform2f(loc, v[0], v[1]);
        else if (u === 'R') gl.uniform1i(loc, v);
        else gl.uniform1f(loc, v);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    return {
      P,
      draw(srcCanvas, topCanvas, on = true) {
        gl.bindTexture(gl.TEXTURE_2D, tSrc);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, srcCanvas);
        gl.bindTexture(gl.TEXTURE_2D, tTop);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, topCanvas);
        if (!on) { pass('copy', null, { src: tSrc, top: tTop }); return; }
        pass('warp', fWarp, { src: tSrc, nz: tNoise }, { amp: P.wobble });
        pass('tensor', fT1, { src: tWarp });
        pass('blur', fT2, { src: tT1 }, { dir: [1, 0] });
        pass('blur', fT1, { src: tT2 }, { dir: [0, 1] });
        pass('kuwa', null, { src: tWarp, tfm: tT1, nz: tNoise, top: tTop }, { R: P.radius, hard: P.hard, sharp: P.sharp, grain: P.grain });
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
    const painter = scene.paint ? makePainter(cv, scene.W, scene.H, scene.paint) : null;
    const src = painter ? canvas(scene.W, scene.H) : cv;
    const ctx = src.getContext('2d');
    // optional crisp layer for focal detail the paint filter would smear away
    const top = painter ? canvas(scene.W, scene.H) : null;
    const topCtx = top && top.getContext('2d');
    const params = new URLSearchParams(location.search);
    const state = { bpm: +(params.get('bpm') || scene.bpm || 80), intensity: 1, playing: true, clocks: {}, on: {} };
    for (const k of scene.toggles) { state.on[k] = true; state.clocks[k] = +(params.get('t') || 0); }
    const still = params.has('still');

    const ui = document.getElementById('ui');
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
    let last = performance.now(), drawn = false;
    const frame = now => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (state.playing && !still) for (const k of scene.toggles) if (state.on[k]) state.clocks[k] += dt;
      if (!still || !drawn) draw();
      drawn = true;
      requestAnimationFrame(frame);
    };
    const draw = (paint = state.paint) => {
      scene.render(ctx, state);
      if (!painter) { if (scene.renderTop) scene.renderTop(ctx, state); return; }
      topCtx.clearRect(0, 0, scene.W, scene.H);
      if (scene.renderTop) scene.renderTop(topCtx, state);
      painter.draw(src, top, paint);
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

  return { TAU, rng, clamp, smooth, lerp, canvas, noise2, fbm, glow, paintOverlay, drawPerformer, makePerson, drawPerson, phoneSprite, run };
})();
