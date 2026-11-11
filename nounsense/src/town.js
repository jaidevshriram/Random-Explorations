/* Town: a dense street scene drawn from architectural parts.
 *
 * Buildings are rectangles, arches, columns and repeated windows, so they can
 * carry a lot of detail when drawn in code: frames, sills, mullions, awnings,
 * signs with pictograms, lit interiors with shelves, rooftop clutter. The
 * scene has four planes: a pale skyline, a mid layer with a viaduct, the
 * detailed street front, and a cross-section under the pavement.
 */
(function (NN) {
  'use strict';
  const O = '#2b3044';                                   // outline: dark slate, not black
  const C = { brick: '#b5594b', brick2: '#9c4a40', slate: '#5f7396', slate2: '#4f6182', sand: '#d9b98a', sand2: '#c4a273', cream: '#efe2c4', sage: '#8fa77a', sage2: '#76906a',
    teal: '#5e9aa0', plum: '#7a5c86', stone: '#b9b4a8', stone2: '#a29d92', dark: '#3a4059', glass: '#7f97bd', lit: '#ffdc94', lit2: '#f7c468', red: '#c9574a', blue: '#5b7fb0', gold: '#e0a94a', white: '#f6f1e6' };
  const rng = (seed) => { let s = (seed >>> 0) || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };

  // ---- parts -------------------------------------------------------------------
  // Depth: while a scene is being baked, every filled part casts a soft shadow on whatever is already behind it,
  // and anything large is a little lighter at its top than its bottom. It is off for per-frame drawing (too slow there).
  let DEPTH = false;
  function castOn(c) { if (!DEPTH) return; c.shadowColor = 'rgba(22,18,52,0.3)'; c.shadowBlur = 9; c.shadowOffsetX = 4; c.shadowOffsetY = 7; }
  function castOff(c) { if (!DEPTH) return; c.shadowColor = 'rgba(0,0,0,0)'; c.shadowBlur = 0; c.shadowOffsetX = 0; c.shadowOffsetY = 0; }
  function tone(c, y, h) { const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(255,250,235,0.11)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(20,16,60,0.13)'); return g; }
  function box(c, x, y, w, h, fill, lw) { c.fillStyle = fill; castOn(c); c.fillRect(x, y, w, h); castOff(c); if (DEPTH && w * h > 700 && h > 12) { c.fillStyle = tone(c, y, h); c.fillRect(x, y, w, h); } c.lineWidth = lw || 2.4; c.strokeStyle = O; c.lineJoin = 'round'; c.strokeRect(x, y, w, h); }
  function shade(c, x, y, w, h, a) { c.fillStyle = `rgba(28,32,58,${a || 0.16})`; c.fillRect(x, y, w, h); }
  function line(c, pts, lw, col) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.lineWidth = lw || 1.6; c.strokeStyle = col || O; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(); }
  function poly(c, pts, fill, lw) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); if (fill) { c.fillStyle = fill; castOn(c); c.fill(); castOff(c); } if (lw !== 0) { c.lineWidth = lw || 2.4; c.strokeStyle = O; c.lineJoin = 'round'; c.stroke(); } }
  function disc(c, x, y, r, fill, lw) { c.beginPath(); c.arc(x, y, r, 0, 7); if (fill) { c.fillStyle = fill; castOn(c); c.fill(); castOff(c); if (DEPTH && r > 9) { c.fillStyle = tone(c, y - r, r * 2); c.fill(); } } if (lw !== 0) { c.lineWidth = lw || 2.4; c.strokeStyle = O; c.stroke(); } }
  // Lights are not painted here. They are recorded, and the renderer adds them as real light.
  let SINK = null, EMS = null;
  function glow(c, x, y, r, a, color) { if (SINK) SINK.push({ x, y, r: r * 1.7, a: Math.min(1, (a || 0.5) * 2), color: color || '255,214,150' }); }
  function capture(fn) { SINK = []; EMS = []; DEPTH = true; let out; try { out = fn(); } finally { DEPTH = false; } const lights = SINK, emitters = EMS; SINK = null; EMS = null; return { out, lights, emitters }; }
  // a big wall surface: top-lit gradient, faint siding, a bright left edge and a heavy contour
  function wall(c, x, y, w, h, fill) {
    c.fillStyle = fill; c.fillRect(x, y, w, h);
    const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(255,244,214,0.2)'); g.addColorStop(0.45, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(18,22,58,0.26)'); c.fillStyle = g; c.fillRect(x, y, w, h);
    for (let yy = y, i = 0; yy < y + h; yy += 13, i++) {                // boards: every other course a shade darker, joints staggered
      if (i % 2) { c.fillStyle = 'rgba(20,24,50,0.055)'; c.fillRect(x, yy, w, Math.min(13, y + h - yy)); }
      c.strokeStyle = 'rgba(20,24,50,0.2)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, yy); c.lineTo(x + w, yy); c.stroke();
      for (let jx = x + 26 + ((i * 47) % 70); jx < x + w - 6; jx += 96) { c.beginPath(); c.moveTo(jx, yy); c.lineTo(jx, Math.min(yy + 13, y + h)); c.stroke(); }
    }
    c.fillStyle = 'rgba(255,250,232,0.13)'; c.fillRect(x, y, 6, h);
    c.lineWidth = 3.4; c.strokeStyle = O; c.lineJoin = 'round'; c.strokeRect(x, y, w, h);
  }
  // brickwork: full courses with staggered joints, and a scatter of darker bricks
  function bricks(c, x, y, w, h, col, r, n) {
    c.save(); c.beginPath(); c.rect(x + 2, y + 2, w - 4, h - 4); c.clip();
    c.strokeStyle = col; c.globalAlpha = 0.5; c.lineWidth = 1.2;
    for (let yy = y + 10, row = 0; yy < y + h; yy += 10, row++) { c.beginPath(); c.moveTo(x, yy); c.lineTo(x + w, yy); c.stroke(); for (let xx = x + (row % 2 ? 12 : 0); xx < x + w; xx += 24) { c.beginPath(); c.moveTo(xx, yy - 10); c.lineTo(xx, yy); c.stroke(); } }
    c.globalAlpha = 0.55; c.fillStyle = col;
    for (let i = 0; i < n; i++) { const row = Math.floor(r() * h / 10), bx = x + Math.floor(r() * w / 24) * 24 + (row % 2 ? 12 : 0); c.fillRect(bx + 1, y + row * 10 + 1, 22, 8); }
    c.restore();
  }
  function cast(c, x, y, w, h, a) { const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, `rgba(18,22,58,${a || 0.34})`); g.addColorStop(1, 'rgba(18,22,58,0)'); c.fillStyle = g; c.fillRect(x, y, w, h); }

  // a window: frame, glass, mullions, sill; lit ones get a warm interior and something inside
  function win(c, x, y, w, h, o) {
    o = o || {};
    const lit = o.lit;
    box(c, x - 3, y - 3, w + 6, h + 6, o.frame || C.cream, 2);
    c.fillStyle = lit ? C.lit : C.glass; c.fillRect(x, y, w, h);
    if (lit) { c.fillStyle = C.lit2; c.fillRect(x, y + h * 0.55, w, h * 0.45); }
    else { c.fillStyle = 'rgba(255,255,255,0.22)'; c.beginPath(); c.moveTo(x, y + h * 0.5); c.lineTo(x + w * 0.5, y); c.lineTo(x + w * 0.75, y); c.lineTo(x, y + h * 0.9); c.fill(); }
    if (lit && o.inside === 'shelf') for (let r = 0; r < Math.floor(h / 16); r++) { const sy = y + h - 4 - r * 16; line(c, [x + 2, sy, x + w - 2, sy], 1.6, '#8a5a3a'); for (let bx = x + 4; bx < x + w - 6; bx += 5 + ((bx * 7 + r * 3) % 4)) { c.fillStyle = [C.red, C.blue, C.sage2, C.plum, C.gold][(Math.floor(bx) + r) % 5]; c.fillRect(bx, sy - 9 - ((bx * 3) % 3), 3.6, 9 + ((bx * 3) % 3)); } }
    if (lit && !o.inside && w > 16) {            // something in the room: a lamp, a plant or a picture
      const k = Math.abs(Math.floor(x * 7 + y * 3)) % 4, mx = x + w * 0.5, by = y + h;
      c.fillStyle = 'rgba(96,62,52,0.55)';
      if (k === 0) { c.fillRect(mx - 1.2, by - h * 0.4, 2.4, h * 0.4); c.beginPath(); c.moveTo(mx - w * 0.22, by - h * 0.4); c.lineTo(mx - w * 0.12, by - h * 0.62); c.lineTo(mx + w * 0.12, by - h * 0.62); c.lineTo(mx + w * 0.22, by - h * 0.4); c.fill(); }
      else if (k === 1) { c.fillRect(mx - w * 0.14, by - h * 0.2, w * 0.28, h * 0.2); for (const [dx, dy] of [[-0.14, 0.36], [0.12, 0.4], [0, 0.5]]) { c.beginPath(); c.arc(mx + dx * w, by - dy * h, w * 0.14, 0, 7); c.fill(); } }
      else if (k === 2) { c.fillRect(x + w * 0.2, y + h * 0.2, w * 0.36, h * 0.26); }
    }
    if (lit && o.inside === 'person') { c.fillStyle = 'rgba(60,50,70,0.55)'; c.beginPath(); c.arc(x + w * 0.5, y + h * 0.5, w * 0.16, 0, 7); c.fill(); c.fillRect(x + w * 0.5 - w * 0.2, y + h * 0.62, w * 0.4, h * 0.4); }
    if (o.curtain) { c.fillStyle = o.curtain; c.beginPath(); c.moveTo(x, y); c.lineTo(x + w * 0.34, y); c.quadraticCurveTo(x + w * 0.3, y + h * 0.5, x, y + h * 0.7); c.fill(); c.beginPath(); c.moveTo(x + w, y); c.lineTo(x + w * 0.66, y); c.quadraticCurveTo(x + w * 0.7, y + h * 0.5, x + w, y + h * 0.7); c.fill(); }
    cast(c, x, y, w, Math.min(9, h * 0.2), 0.3);
    if (lit) glow(c, x + w / 2, y + h / 2, Math.max(w, h) * 0.8, 0.42);
    c.lineWidth = 2; c.strokeStyle = O; c.strokeRect(x, y, w, h);
    if (o.cross !== false) { line(c, [x + w / 2, y, x + w / 2, y + h], 1.6); if (h > w * 0.9) line(c, [x, y + h * 0.42, x + w, y + h * 0.42], 1.6); }
    box(c, x - 6, y + h + 3, w + 12, 5, o.sill || C.stone, 1.8); cast(c, x - 4, y + h + 8, w + 8, 7, 0.22);
    box(c, x - 5, y - 9, w + 10, 6, o.frame || C.cream, 1.8);
    if (o.box) { box(c, x - 2, y + h - 3, w + 4, 8, '#8a5a3a', 1.8); for (let i = 0; i < 4; i++) disc(c, x + 4 + i * (w - 8) / 3, y + h - 6, 4, i % 2 ? C.sage : C.red, 1.4); }
  }
  function windows(c, x, y, w, h, cols, rows, r, o) {
    const gw = w / cols, gh = h / rows, ww = Math.min(gw * 0.56, 30), wh = Math.min(gh * 0.62, 38);
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) { const k = r(); win(c, x + gw * i + (gw - ww) / 2, y + gh * j + (gh - wh) / 2, ww, wh, Object.assign({ lit: k < 0.42, inside: k < 0.12 ? 'person' : null, curtain: k > 0.8 ? C.red : null, box: k > 0.9 }, o)); }
  }
  // striped awning with a scalloped edge
  function awning(c, x, y, w, h, a, b) {
    const n = Math.max(4, Math.round(w / 20)), sw = w / n;
    for (let i = 0; i < n; i++) { c.fillStyle = i % 2 ? a : b; c.beginPath(); c.moveTo(x + 8 + (w - 16) * i / n, y); c.lineTo(x + 8 + (w - 16) * (i + 1) / n, y); c.lineTo(x + sw * (i + 1), y + h); c.lineTo(x + sw * i, y + h); c.fill(); }
    poly(c, [x + 8, y, x + w - 8, y, x + w, y + h, x, y + h], null, 2.4);
    for (let i = 0; i < n; i++) { c.beginPath(); c.arc(x + sw * (i + 0.5), y + h, sw / 2, 0, Math.PI); c.fillStyle = i % 2 ? a : b; c.fill(); c.lineWidth = 2; c.strokeStyle = O; c.stroke(); }
    cast(c, x + 2, y + h + sw / 2 - 2, w - 4, 26, 0.38);
  }
  function door(c, x, y, w, h, col, glass) {
    box(c, x - 4, y - 4, w + 8, h + 4, C.cream, 2); box(c, x, y, w, h, col, 2);
    if (glass) { c.fillStyle = C.lit; c.fillRect(x + 5, y + 6, w - 10, h * 0.5); c.lineWidth = 1.6; c.strokeStyle = O; c.strokeRect(x + 5, y + 6, w - 10, h * 0.5); }
    else { c.lineWidth = 1.5; c.strokeRect(x + 5, y + 6, w - 10, h * 0.38); c.strokeRect(x + 5, y + h * 0.52, w - 10, h * 0.4); }
    disc(c, x + w - 8, y + h * 0.58, 2.2, C.gold, 1.2);
  }
  // pictograms for signs and posters
  const ICON = {
    cup(c, s) { box(c, -s * 0.5, -s * 0.2, s * 0.8, s * 0.6, C.white, 1.8); c.beginPath(); c.arc(s * 0.36, s * 0.1, s * 0.2, -1.4, 1.4); c.lineWidth = 2; c.strokeStyle = O; c.stroke(); line(c, [-s * 0.3, -s * 0.4, -s * 0.2, -s * 0.6, -s * 0.3, -s * 0.8], 1.6, C.red); line(c, [0, -s * 0.4, 0.1 * s, -s * 0.6, 0, -s * 0.8], 1.6, C.red); },
    book(c, s) { poly(c, [-s * 0.7, -s * 0.4, 0, -s * 0.25, 0, s * 0.5, -s * 0.7, s * 0.35], C.white, 1.8); poly(c, [s * 0.7, -s * 0.4, 0, -s * 0.25, 0, s * 0.5, s * 0.7, s * 0.35], C.white, 1.8); for (let i = 0; i < 3; i++) { line(c, [-s * 0.55, -s * 0.2 + i * s * 0.2, -s * 0.12, -s * 0.08 + i * s * 0.2], 1.2, C.red); line(c, [s * 0.55, -s * 0.2 + i * s * 0.2, s * 0.12, -s * 0.08 + i * s * 0.2], 1.2, C.red); } },
    gear(c, s) { c.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, rr = s * (i % 2 ? 0.62 : 0.82); c.lineTo(Math.cos(a - 0.1) * rr, Math.sin(a - 0.1) * rr); c.lineTo(Math.cos(a + 0.1) * rr, Math.sin(a + 0.1) * rr); } c.closePath(); c.fillStyle = C.stone; c.fill(); c.lineWidth = 2; c.strokeStyle = O; c.stroke(); disc(c, 0, 0, s * 0.28, C.dark, 1.8); },
    flask(c, s) { poly(c, [-s * 0.18, -s * 0.8, s * 0.18, -s * 0.8, s * 0.18, -s * 0.2, s * 0.62, s * 0.6, -s * 0.62, s * 0.6, -s * 0.18, -s * 0.2], C.white, 1.8); poly(c, [-s * 0.36, s * 0.1, s * 0.36, s * 0.1, s * 0.6, s * 0.58, -s * 0.6, s * 0.58], '#9be06a', 1.2); disc(c, -s * 0.1, s * 0.34, s * 0.07, C.white, 0); disc(c, s * 0.16, s * 0.24, s * 0.05, C.white, 0); line(c, [-s * 0.28, -s * 0.8, s * 0.28, -s * 0.8], 2.4); },
    star(c, s) { c.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, rr = s * (i % 2 ? 0.38 : 0.85); c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); c.fillStyle = C.gold; c.fill(); c.lineWidth = 1.8; c.strokeStyle = O; c.lineJoin = 'round'; c.stroke(); },
    planet(c, s) { disc(c, 0, 0, s * 0.5, C.gold, 1.8); line(c, [-s * 0.4, -s * 0.1, s * 0.4, -s * 0.2], 1.3, '#c98a3a'); c.beginPath(); c.ellipse(0, 0, s * 0.9, s * 0.24, -0.35, 0.25, Math.PI - 0.25); c.lineWidth = 2.6; c.strokeStyle = O; c.stroke(); c.strokeStyle = C.cream; c.lineWidth = 1.2; c.stroke(); },
    rocket(c, s) { poly(c, [0, -s * 0.9, s * 0.3, -s * 0.3, s * 0.3, s * 0.4, -s * 0.3, s * 0.4, -s * 0.3, -s * 0.3], C.white, 1.8); poly(c, [-s * 0.3, s * 0.1, -s * 0.6, s * 0.6, -s * 0.3, s * 0.4], C.red, 1.6); poly(c, [s * 0.3, s * 0.1, s * 0.6, s * 0.6, s * 0.3, s * 0.4], C.red, 1.6); disc(c, 0, -s * 0.2, s * 0.14, C.glass, 1.4); poly(c, [-s * 0.18, s * 0.4, 0, s * 0.85, s * 0.18, s * 0.4], C.gold, 1.4); },
    wand(c, s) { line(c, [-s * 0.6, s * 0.6, s * 0.3, -s * 0.3], 3.2); line(c, [-s * 0.6, s * 0.6, s * 0.3, -s * 0.3], 1.6, C.cream); c.save(); c.translate(s * 0.42, -s * 0.42); ICON.star(c, s * 0.42); c.restore(); },
    spiral(c, s) { c.beginPath(); for (let a = 0; a < Math.PI * 5; a += 0.2) { const rr = s * (0.12 + a / (Math.PI * 5) * 0.8); c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.lineWidth = Math.max(2.4, s * 0.16); c.strokeStyle = O; c.lineCap = 'round'; c.stroke(); c.lineWidth = Math.max(1.2, s * 0.09); c.strokeStyle = C.cream; c.stroke(); },
    moon(c, s) { disc(c, 0, 0, s * 0.7, C.cream, 1.8); disc(c, s * 0.3, -s * 0.15, s * 0.6, '#3d4a73', 0); },
  };
  function icon(c, name, x, y, s) { c.save(); c.translate(x, y); ICON[name](c, s); c.restore(); }
  function sign(c, x, y, w, h, name, fill) { box(c, x, y, w, h, fill || C.cream, 2.4); c.lineWidth = 1.2; c.strokeStyle = 'rgba(43,48,68,0.35)'; c.strokeRect(x + 3, y + 3, w - 6, h - 6); icon(c, name, x + w / 2, y + h / 2, Math.min(w, h) * 0.34); }
  function hangSign(c, x, y, name) { line(c, [x, y, x + 34, y], 2.6); line(c, [x + 8, y, x + 8, y + 8], 1.4); line(c, [x + 30, y, x + 30, y + 8], 1.4); sign(c, x + 3, y + 8, 32, 32, name); }
  function poster(c, x, y, w, h, name, bg) { box(c, x - 5, y - 5, w + 10, h + 10, C.stone, 2.4); box(c, x, y, w, h, bg, 2); c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.fillStyle = 'rgba(255,255,255,0.18)'; c.beginPath(); c.ellipse(x + w * 0.5, y + h * 1.05, w * 0.7, h * 0.3, 0, 0, 7); c.fill(); icon(c, name, x + w / 2, y + h * 0.45, Math.min(w, h) * 0.34); c.restore(); line(c, [x + 10, y + h + 5, x + 10, y + h + 16], 2.2); line(c, [x + w - 10, y + h + 5, x + w - 10, y + h + 16], 2.2); }
  // a tree: forked trunk, a canopy that merges into one shape, dark underside, lit top
  function tree(c, x, y, s, a, b) {
    poly(c, [x - 6 * s, y, x - 4 * s, y - 30 * s, x - 13 * s, y - 46 * s, x - 8 * s, y - 51 * s, x, y - 39 * s, x + 8 * s, y - 53 * s, x + 13 * s, y - 48 * s, x + 5 * s, y - 30 * s, x + 7 * s, y], '#7b5a45', 2.2);
    c.fillStyle = 'rgba(20,24,60,0.24)'; c.fillRect(x + 1 * s, y - 30 * s, 5 * s, 30 * s);
    const blobs = [[-21, -54, 22, b], [21, -56, 22, b], [0, -46, 20, b], [-13, -72, 23, a], [15, -74, 23, a], [0, -88, 22, a]];
    for (const [dx, dy, r] of blobs) disc(c, x + dx * s, y + dy * s, r * s, null, 5);
    for (const [dx, dy, r, col] of blobs) disc(c, x + dx * s, y + dy * s, r * s, col, 0);
    for (const [dx, dy] of [[-17, -84], [3, -98], [20, -82]]) { c.beginPath(); c.arc(x + dx * s, y + dy * s, 10 * s, Math.PI * 1.1, Math.PI * 1.7); c.lineWidth = 2.6; c.strokeStyle = 'rgba(232,248,196,0.6)'; c.lineCap = 'round'; c.stroke(); }
    for (const [dx, dy] of [[-24, -56], [-5, -64], [14, -60], [26, -68], [-10, -46], [8, -48], [-2, -78]]) line(c, [x + dx * s, y + dy * s, x + (dx + 5) * s, y + (dy - 3) * s], 1.5, 'rgba(43,48,68,0.45)');
  }
  function lamp(c, x, y) { glow(c, x, y - 96, 70, 0.45); glow(c, x, y - 6, 80, 0.28); box(c, x - 7, y - 10, 14, 10, C.dark, 2); box(c, x - 3, y - 84, 6, 74, C.dark, 2); box(c, x - 9, y - 90, 18, 6, C.dark, 2); poly(c, [x - 10, y - 90, x - 13, y - 108, x + 13, y - 108, x + 10, y - 90], C.lit, 2); poly(c, [x - 15, y - 108, x, y - 118, x + 15, y - 108], C.dark, 2); }
  function vine(c, x, y, h, r) { let px = x, py = y; c.beginPath(); c.moveTo(px, py); while (py < y + h) { px = x + (r() - 0.5) * 12; py += 12; c.lineTo(px, py); } c.lineWidth = 2.2; c.strokeStyle = C.sage2; c.stroke(); for (let yy = y + 6; yy < y + h; yy += 11) { c.beginPath(); c.ellipse(x + (r() - 0.5) * 16, yy, 5, 3.2, r() * 3, 0, 7); c.fillStyle = r() > 0.5 ? C.sage : C.sage2; c.fill(); c.lineWidth = 1.2; c.strokeStyle = O; c.stroke(); } }
  function cornice(c, x, y, w, col) { cast(c, x, y + 6, w, 22); box(c, x - 6, y - 8, w + 12, 9, col || C.stone, 2.6); if (DUSK) line(c, [x - 4, y - 6.5, x + w + 4, y - 6.5], 1.8, 'rgba(214,226,255,0.85)'); box(c, x - 3, y + 1, w + 6, 5, col || C.stone2, 1.8); for (let i = 0; i < w / 18; i++) box(c, x + 4 + i * 18, y + 6, 7, 5, col || C.stone2, 1.2); }
  // rooftop clutter
  function tank(c, x, y) { line(c, [x - 12, y, x - 12, y - 14], 2.2); line(c, [x + 12, y, x + 12, y - 14], 2.2); box(c, x - 17, y - 44, 34, 30, '#8a6a52', 2.2); line(c, [x - 17, y - 34, x + 17, y - 34], 1.4); line(c, [x - 17, y - 24, x + 17, y - 24], 1.4); poly(c, [x - 20, y - 44, x, y - 58, x + 20, y - 44], C.dark, 2.2); }
  function dish(c, x, y) { box(c, x - 4, y - 16, 8, 16, C.dark, 2); c.save(); c.translate(x, y - 22); c.rotate(-0.5); c.beginPath(); c.ellipse(0, 0, 22, 9, 0, 0, 7); c.fillStyle = C.stone; c.fill(); c.lineWidth = 2.2; c.strokeStyle = O; c.stroke(); line(c, [0, 0, 0, -18], 1.8); disc(c, 0, -18, 2.6, C.red, 1.2); c.restore(); }
  function flag(c, x, y, col) { line(c, [x, y, x, y - 46], 2.4); poly(c, [x, y - 46, x + 26, y - 42, x + 18, y - 36, x + 26, y - 30, x, y - 28], col, 2); }
  function vent(c, x, y) { box(c, x - 14, y - 16, 28, 16, C.stone2, 2); line(c, [x - 9, y - 11, x + 9, y - 11], 1.4); line(c, [x - 9, y - 6, x + 9, y - 6], 1.4); }
  function chimney(c, x, y, r) { box(c, x - 8, y - 30, 16, 30, C.brick2, 2); box(c, x - 11, y - 36, 22, 7, C.stone, 2); if (EMS) EMS.push([x, y - 40]); void r; }   // smoke is animated by the game

  // ---- buildings: each one draws itself on the ground line g -------------------------
  const BUILD = {
    teashop(c, x, g, w, r) {
      const h = 330;
      wall(c, x, g - h, w, h, C.brick); bricks(c, x, g - h, w, h - 110, C.brick2, r, 70); shade(c, x + w - 16, g - h, 16, h);
      cornice(c, x, g - h, w); windows(c, x + 10, g - h + 18, w - 20, 190, 3, 3, r);
      poster(c, x + w * 0.5 - 38, g - h - 78, 76, 54, 'rocket', '#6a7fa8'); tank(c, x + 40, g - h - 8); vent(c, x + w - 40, g - h - 8);
      box(c, x + 8, g - 108, w - 16, 108, C.cream); awning(c, x + 4, g - 124, w - 8, 26, C.red, C.white);
      win(c, x + 20, g - 84, w * 0.5, 62, { lit: true, inside: 'shelf', cross: false, sill: C.brick2 }); door(c, x + w - 64, g - 84, 40, 84, C.teal, true); hangSign(c, x + w - 20, g - 150, 'cup');
      vine(c, x + 8, g - h + 6, 150, r);
    },
    lab(c, x, g, w, r) {
      const h = 210, dx = x + w * 0.5, dy = g - h;
      // glass dome with a bubbling vat inside
      c.beginPath(); c.arc(dx, dy, w * 0.36, Math.PI, 0); c.closePath(); c.fillStyle = 'rgba(160,220,225,0.55)'; c.fill();
      glow(c, dx, dy - 46, 90, 0.5, '170,255,150'); box(c, dx - 26, dy - 92, 52, 92, '#8fe06a', 2.2); c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(dx - 20, dy - 86, 8, 78); for (const [bx, by, br] of [[-8, -20, 5], [10, -44, 7], [-4, -66, 4], [14, -74, 3]]) disc(c, dx + bx, dy + by, br, 'rgba(240,255,220,0.8)', 1.2);
      box(c, dx - 32, dy - 100, 64, 10, C.dark, 2); box(c, dx - 32, dy - 6, 64, 8, C.dark, 2);
      line(c, [dx - 60, dy, dx - 60, dy - 50, dx - 32, dy - 50], 5); line(c, [dx - 60, dy, dx - 60, dy - 50, dx - 32, dy - 50], 2.4, C.stone); line(c, [dx + 60, dy, dx + 60, dy - 70, dx + 32, dy - 70], 5); line(c, [dx + 60, dy, dx + 60, dy - 70, dx + 32, dy - 70], 2.4, C.stone);
      c.beginPath(); c.arc(dx, dy, w * 0.36, Math.PI, 0); c.lineWidth = 2.6; c.strokeStyle = O; c.stroke(); for (const a of [0.6, 1.1, 1.57, 2.04, 2.54]) line(c, [dx, dy, dx - Math.cos(a) * w * 0.36, dy - Math.sin(a) * w * 0.36], 1.2, 'rgba(43,48,68,0.45)');
      line(c, [dx - w * 0.25, dy - w * 0.26, dx - w * 0.18, dy - w * 0.31], 2.2, C.white);
      wall(c, x, g - h, w, h, C.slate); shade(c, x + w - 16, g - h, 16, h); cornice(c, x, g - h, w, C.stone);
      box(c, x + 14, g - h + 18, w - 28, 44, C.dark, 2); icon(c, 'flask', x + 44, g - h + 40, 15); for (let i = 0; i < 5; i++) disc(c, x + 80 + i * 22, g - h + 40, 5, i % 2 ? '#9be06a' : C.lit, 1.4);
      win(c, x + 20, g - 128, 70, 76, { lit: true, inside: 'shelf', frame: C.stone }); win(c, x + w - 90, g - 128, 70, 76, { lit: true, inside: 'person', frame: C.stone });
      door(c, x + w / 2 - 24, g - 96, 48, 96, '#d9a85a', true); glow(c, x + w / 2, g - 60, 70, 0.3);
      line(c, [x + 6, g - h + 70, x + 6, g - 8], 6); line(c, [x + 6, g - h + 70, x + 6, g - 8], 3, C.stone); for (let y = g - h + 90; y < g - 10; y += 42) box(c, x + 1, y, 10, 5, C.dark, 1.4);
      // the shopfront: a name, awnings, window boxes, a lamp over the door, notices, pots, things on the roof
      c.font = '700 19px "Bangers", "Comic Neue", sans-serif'; c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillStyle = C.cream; c.fillText('ALCHEMY & CO.', x + w - 26, g - h + 41);
      for (const wx of [x + 20, x + w - 90]) { awning(c, wx - 8, g - 150, 86, 16, C.teal, C.white); box(c, wx - 4, g - 50, 78, 9, '#8a5a3a', 2); for (let i = 0; i < 5; i++) disc(c, wx + 6 + i * 15, g - 54, 6, i % 2 ? C.sage : C.sage2, 1.5); for (let i = 0; i < 3; i++) disc(c, wx + 14 + i * 22, g - 60, 3, [C.red, C.gold, '#f0a0c0'][i], 1.1); }
      box(c, x + w / 2 - 8, g - 116, 16, 12, C.dark, 1.8); box(c, x + w / 2 - 6, g - 106, 12, 9, C.lit, 1.4); glow(c, x + w / 2, g - 100, 46, 0.45);
      for (const [px, ic, bg] of [[x + w / 2 - 62, 'gear', '#c9b48a'], [x + w / 2 + 36, 'star', '#a8c4d8']]) { box(c, px, g - 92, 26, 34, bg, 1.8); icon(c, ic, px + 13, g - 78, 8); line(c, [px + 5, g - 66, px + 21, g - 66], 1.2); line(c, [px + 5, g - 62, px + 16, g - 62], 1.2); }
      for (const px of [x + w / 2 - 44, x + w / 2 + 44]) { poly(c, [px - 9, g - 16, px + 9, g - 16, px + 6, g, px - 6, g], C.brick2, 2); disc(c, px, g - 26, 10, C.sage, 1.8); disc(c, px - 6, g - 20, 6, C.sage2, 1.5); disc(c, px + 6, g - 21, 6, C.sage2, 1.5); }
      box(c, x + w / 2 - 34, g - 5, 68, 5, C.stone, 1.8);
      tank(c, x + 34, g - h - 8); vent(c, x + w - 36, g - h - 8); for (const px of [x + 70, x + w - 74]) { poly(c, [px - 8, g - h - 20, px + 8, g - h - 20, px + 6, g - h - 8, px - 6, g - h - 8], C.brick2, 1.8); disc(c, px, g - h - 28, 8, C.sage, 1.6); }
      line(c, [x + w - 8, g - h + 8, x + w - 8, g - 6], 5); line(c, [x + w - 8, g - h + 8, x + w - 8, g - 6], 2.4, C.stone2);
    },
    museum(c, x, g, w, r) {
      const h = 250, p = 64;
      wall(c, x + 10, g - h, w - 20, h, C.sand); shade(c, x + w - 30, g - h, 20, h);
      // lit hall with a great spiral fossil
      box(c, x + p, g - h + 40, w - p * 2, h - 60, C.lit, 2.4); c.fillStyle = C.lit2; c.fillRect(x + p, g - 70, w - p * 2, 50); { const ig = c.createLinearGradient(0, g - h + 40, 0, g - 76); ig.addColorStop(0, 'rgba(176,98,40,0.46)'); ig.addColorStop(1, 'rgba(176,98,40,0)'); c.fillStyle = ig; c.fillRect(x + p + 1, g - h + 41, w - p * 2 - 2, h - 118); }   // the hall is darker up under its ceiling glow(c, x + w / 2, g - h / 2, 110, 0.24);
      icon(c, 'spiral', x + w / 2, g - h * 0.52, 56); box(c, x + w / 2 - 50, g - 62, 100, 12, '#8a5a3a', 2); line(c, [x + w / 2 - 20, g - 62, x + w / 2 - 20, g - 20], 3); line(c, [x + w / 2 + 20, g - 62, x + w / 2 + 20, g - 20], 3);
      for (const bx of [x + p + 14, x + w - p - 46]) { box(c, bx, g - h + 52, 32, 96, C.red, 2); poly(c, [bx, g - h + 148, bx + 16, g - h + 136, bx + 32, g - h + 148], C.red, 2); icon(c, bx < x + w / 2 ? 'star' : 'moon', bx + 16, g - h + 92, 10); }
      // columns, steps and pediment
      for (const cx of [x + 18, x + p - 8, x + w - p - 20, x + w - 46]) { box(c, cx, g - h + 30, 28, h - 46, C.cream, 2.2); box(c, cx - 5, g - h + 22, 38, 10, C.cream, 2); box(c, cx - 5, g - 26, 38, 10, C.cream, 2); for (let i = 1; i < 3; i++) line(c, [cx + i * 9.3, g - h + 36, cx + i * 9.3, g - 30], 1.1, 'rgba(43,48,68,0.3)'); }
      box(c, x - 4, g - 16, w + 8, 16, C.stone, 2.4); box(c, x + 6, g - 26, w - 12, 10, C.stone, 2.2);
      box(c, x, g - h, w, 24, C.cream, 2.4); poly(c, [x - 12, g - h, x + w / 2, g - h - 86, x + w + 12, g - h], C.sand, 2.6); if (DUSK) line(c, [x - 6, g - h - 4, x + w / 2, g - h - 83], 2.4, 'rgba(214,226,255,0.8)'); poly(c, [x + 26, g - h - 8, x + w / 2, g - h - 66, x + w - 26, g - h - 8], C.cream, 2); icon(c, 'planet', x + w / 2, g - h - 30, 20);
      c.font = '700 15px "Bangers", "Comic Neue", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#7a6a58'; c.fillText('M U S E U M   O F   C U R I O S I T I E S', x + w / 2, g - h + 13);
      for (const [ex, kind] of [[x + p + 74, 0], [x + w - p - 74, 1]]) {                        // things on plinths either side of the fossil
        box(c, ex - 16, g - 62, 32, 42, C.stone, 2); box(c, ex - 20, g - 68, 40, 8, C.stone2, 1.8);
        if (kind) { disc(c, ex, g - 86, 15, '#7fb0c8', 2); c.beginPath(); c.ellipse(ex, g - 86, 15, 5, -0.4, 0, 7); c.lineWidth = 1.4; c.strokeStyle = O; c.stroke(); line(c, [ex, g - 104, ex, g - 68], 1.6); }
        else { poly(c, [ex - 9, g - 68, ex - 12, g - 86, ex - 5, g - 98, ex + 5, g - 98, ex + 12, g - 86, ex + 9, g - 68], '#c9744e', 2); line(c, [ex - 10, g - 84, ex + 10, g - 84], 1.4, C.cream); box(c, ex - 5, g - 104, 10, 6, '#c9744e', 1.6); }
      }
      for (let tx = x + p + 8; tx < x + w - p; tx += 26) line(c, [tx, g - 26, tx - 6, g - 20], 1.1, 'rgba(120,80,40,0.35)');
      for (let yy = g - h + 62, row = 0; yy < g - 124; yy += 22, row++) { line(c, [x + p + 2, yy, x + w - p - 2, yy], 1, 'rgba(150,100,50,0.22)'); for (let xx = x + p + (row % 2 ? 30 : 8); xx < x + w - p - 6; xx += 46) line(c, [xx, yy, xx, yy + 22], 1, 'rgba(150,100,50,0.18)'); }   // stone courses on the hall wall
      c.fillStyle = 'rgba(150,90,40,0.2)'; c.fillRect(x + p + 1, g - 110, w - p * 2 - 2, 40); for (let xx = x + p + 14; xx < x + w - p - 40; xx += 52) { c.lineWidth = 1.2; c.strokeStyle = 'rgba(120,70,30,0.5)'; c.strokeRect(xx, g - 104, 40, 28); }   // a panelled dado
      line(c, [x + p, g - 118, x + w - p, g - 118], 1.6, 'rgba(150,100,50,0.5)'); line(c, [x + p, g - 112, x + w - p, g - 112], 1, 'rgba(150,100,50,0.4)');          // a dado rail round the hall
      for (const fx of [x + p + 58, x + w - p - 92]) { box(c, fx, g - h + 62, 34, 42, '#8a5a3a', 2); box(c, fx + 4, g - h + 66, 26, 34, fx < x + w / 2 ? '#7fa8c8' : '#c8a070', 1.2); poly(c, [fx + 4, g - h + 100, fx + 13, g - h + 84, fx + 20, g - h + 92, fx + 30, g - h + 78, fx + 30, g - h + 100], fx < x + w / 2 ? '#5a8a6a' : '#8a5a48', 0); }   // two small paintings
      for (const lx of [x + w / 2 - 78, x + w / 2 + 78]) { line(c, [lx, g - h + 40, lx, g - h + 62], 1.6); poly(c, [lx - 11, g - h + 72, lx - 5, g - h + 62, lx + 5, g - h + 62, lx + 11, g - h + 72], C.gold, 1.6); glow(c, lx, g - h + 78, 60, 0.32); }   // pendant lamps
      for (const sx of [x + w / 2 - 66, x + w / 2 + 66]) { box(c, sx - 2, g - 46, 4, 26, C.gold, 1.2); disc(c, sx, g - 48, 4, C.gold, 1.2); } c.beginPath(); c.moveTo(x + w / 2 - 66, g - 44); c.quadraticCurveTo(x + w / 2, g - 26, x + w / 2 + 66, g - 44); c.lineWidth = 3.4; c.strokeStyle = O; c.stroke(); c.lineWidth = 1.8; c.strokeStyle = C.red; c.stroke();   // a rope across the front of the fossil
      for (let dx = x + 20; dx < x + w - 20; dx += 14) box(c, dx, g - h - 8, 8, 7, C.cream, 1);                                                          // dentils under the pediment
      for (const sd of [-1, 1]) { icon(c, 'star', x + w / 2 + sd * 70, g - h - 24, 9); c.beginPath(); c.moveTo(x + w / 2 + sd * 30, g - h - 22); c.quadraticCurveTo(x + w / 2 + sd * 46, g - h - 40, x + w / 2 + sd * 56, g - h - 20); c.lineWidth = 1.6; c.strokeStyle = 'rgba(120,96,70,0.7)'; c.stroke(); for (let i = 0; i < 4; i++) { const t = (i + 0.5) / 4, lx = x + w / 2 + sd * (30 + 26 * t), ly = g - h - 22 - Math.sin(t * Math.PI) * 13; c.beginPath(); c.ellipse(lx, ly, 5, 2.4, sd * (0.9 - t * 1.6), 0, 7); c.fillStyle = 'rgba(160,130,90,0.8)'; c.fill(); } }   // laurels and stars in the gable
      for (const cx of [x + 32, x + w - 32]) { box(c, cx - 6, g - 150, 12, 16, C.lit, 1.8); box(c, cx - 8, g - 154, 16, 5, C.dark, 1.6); glow(c, cx, g - 142, 44, 0.4); }
      flag(c, x + w / 2, g - h - 86, C.red);
    },
    tower(c, x, g, w, r) {
      const h = 430;
      wall(c, x, g - h, w, h, '#4f629c'); shade(c, x + w - 18, g - h, 18, h); cornice(c, x, g - h, w, C.stone2);
      bricks(c, x, g - h, w, h, '#3c4e86', r, 26);
      { const lg = c.createLinearGradient(x, 0, x + 70, 0); lg.addColorStop(0, 'rgba(214,226,255,0.28)'); lg.addColorStop(1, 'rgba(214,226,255,0)'); c.fillStyle = lg; c.fillRect(x + 2, g - h + 2, 70, h - 4);      // the moon on the near corner
        const rg = c.createLinearGradient(x + w - 90, 0, x + w, 0); rg.addColorStop(0, 'rgba(24,20,70,0)'); rg.addColorStop(1, 'rgba(24,20,70,0.3)'); c.fillStyle = rg; c.fillRect(x + w - 90, g - h + 2, 88, h - 4);        // the far side turning away
        const vg = c.createLinearGradient(0, g - h, 0, g - 128); vg.addColorStop(0, 'rgba(24,20,70,0)'); vg.addColorStop(1, 'rgba(24,20,70,0.24)'); c.fillStyle = vg; c.fillRect(x + 2, g - h + 2, w - 4, h - 130); }       // and the wall sinking into the street's shadow
      box(c, x - 3, g - h + 122, w + 6, 9, C.stone2, 2); c.fillStyle = 'rgba(20,16,60,0.24)'; c.fillRect(x + 2, g - h + 131, w - 4, 8);                                                                             // a string course under the hoarding
      poster(c, x + 22, g - h + 22, w - 44, 96, 'planet', '#2f7f8c'); for (let k = 0; k < 14; k++) disc(c, x + 34 + ((k * 61) % (w - 68)), g - h + 32 + ((k * 37) % 50), k % 4 ? 1.2 : 2, '#fff6d8', 0); c.beginPath(); c.moveTo(x + 36, g - h + 78); c.quadraticCurveTo(x + 70, g - h + 44, x + 96, g - h + 40); c.lineWidth = 3; c.strokeStyle = '#ffd978'; c.stroke(); disc(c, x + 98, g - h + 40, 4.5, '#fff1b0', 1.2); box(c, x + 22, g - h + 96, w - 44, 22, '#f2e2c0', 1.6); c.font = '700 14px "Bangers", "Comic Neue", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = O; c.fillText('SEE  THE  RINGS', x + w / 2, g - h + 108); for (const lx of [x + 60, x + w - 60]) { line(c, [lx, g - h + 12, lx, g - h + 4, lx, g - h + 20], 2.2); box(c, lx - 6, g - h + 16, 12, 6, C.dark, 1.4); glow(c, lx, g - h + 60, 60, 0.42, '255,236,200'); }   // a hoarding lit from above windows(c, x + 8, g - h + 140, w - 16, 150, 3, 2, r, { frame: C.stone, lit: true }); glow(c, x + w / 2, g - h + 215, 120, 0.3);
      for (const fy of [g - h + 214, g - h + 290]) { box(c, x + 30, fy, w - 60, 5, C.dark, 1.6); for (let fx = x + 34; fx < x + w - 34; fx += 12) line(c, [fx, fy - 18, fx, fy], 1.4); line(c, [x + 30, fy - 18, x + w - 30, fy - 18], 2); } line(c, [x + w - 46, g - h + 214, x + w - 70, g - h + 290], 2); line(c, [x + w - 38, g - h + 214, x + w - 62, g - h + 290], 2);   // a fire escape
      line(c, [x + 12, g - h + 10, x + 12, g - 8], 5); line(c, [x + 12, g - h + 10, x + 12, g - 8], 2.4, C.stone2);
      dish(c, x + w * 0.3, g - h - 8); box(c, x + w * 0.62, g - h - 34, 40, 26, C.stone2, 2.2); line(c, [x + w * 0.62 + 20, g - h - 34, x + w * 0.62 + 20, g - h - 70], 2); disc(c, x + w * 0.62 + 20, g - h - 72, 3, C.red, 1.2);
      box(c, x + 8, g - 112, w - 16, 112, C.sand); awning(c, x + 4, g - 128, w - 8, 26, C.blue, C.white);
      win(c, x + 18, g - 88, w - 96, 66, { lit: true, inside: 'shelf', cross: false, sill: C.sand2 }); door(c, x + w - 62, g - 86, 40, 86, C.brick, true); sign(c, x + w / 2 - 22, g - 176, 44, 36, 'book');
    },
    potions(c, x, g, w, r) {
      const h = 280;
      wall(c, x, g - h, w, h, C.cream); bricks(c, x, g - h, w, 120, C.sand, r, 30); shade(c, x + w - 16, g - h, 16, h); cornice(c, x, g - h, w, C.teal);
      box(c, x + 16, g - h + 20, 96, 60, C.white, 2.2); icon(c, 'flask', x + 64, g - h + 52, 20);
      win(c, x + 130, g - h + 22, w - 152, 56, { lit: true, inside: 'person', frame: C.teal }); box(c, x + 10, g - h + 96, w - 20, 10, C.teal, 2);
      win(c, x + 18, g - 160, w - 36, 60, { lit: true, inside: 'shelf', frame: C.teal, cross: false }); box(c, x + 8, g - 86, w - 16, 86, C.teal);
      win(c, x + 20, g - 72, w - 100, 52, { lit: true, inside: 'shelf', cross: false, frame: C.cream }); door(c, x + w - 62, g - 80, 40, 80, C.plum, true);
      vent(c, x + 40, g - h - 8); chimney(c, x + w - 44, g - h - 8, r); for (let i = 0; i < 3; i++) { box(c, x + 30 + i * 36, g - 12, 22, 12, C.brick2, 1.8); disc(c, x + 41 + i * 36, g - 18, 10, i % 2 ? C.sage : C.sage2, 1.8); }
    },
    observatory(c, x, g, w, r) {
      const h = 230, dx = x + w * 0.5, dy = g - h;
      c.beginPath(); c.arc(dx, dy, w * 0.3, Math.PI, 0); c.closePath(); c.fillStyle = C.blue; c.fill(); c.lineWidth = 2.6; c.strokeStyle = O; c.stroke(); for (const a of [0.7, 1.2, 1.94, 2.44]) line(c, [dx - Math.cos(a) * w * 0.3, dy - Math.sin(a) * w * 0.3, dx - Math.cos(a) * w * 0.05, dy], 1.2, 'rgba(43,48,68,0.45)');
      c.save(); c.translate(dx + 10, dy - w * 0.2); c.rotate(-0.6); box(c, -8, -14, 90, 28, C.gold, 2.4); box(c, 78, -19, 14, 38, C.sand, 2.2); box(c, -18, -10, 12, 20, C.dark, 2); c.restore();
      box(c, dx - w * 0.34, dy - 10, w * 0.68, 12, C.stone, 2.2);
      wall(c, x, g - h, w, h, C.stone); shade(c, x + w - 16, g - h, 16, h); bricks(c, x, g - h, w, h, C.stone2, r, 50); cornice(c, x, g - h, w, C.stone);
      for (let i = 0; i < 3; i++) { const ax = x + 30 + i * (w - 60) / 3 + 10, aw = (w - 60) / 3 - 20; c.beginPath(); c.moveTo(ax, g - 70); c.lineTo(ax, g - 150); c.arc(ax + aw / 2, g - 150, aw / 2, Math.PI, 0); c.lineTo(ax + aw, g - 70); c.closePath(); c.fillStyle = i === 1 ? C.lit : '#3d4a73'; c.fill(); c.lineWidth = 2.2; c.strokeStyle = O; c.stroke(); if (i !== 1) icon(c, 'star', ax + aw / 2, g - 130, 9); else icon(c, 'moon', ax + aw / 2, g - 126, 14); }
      door(c, dx - 26, g - 62, 52, 62, C.plum); box(c, x + 14, g - h + 16, w - 28, 26, C.dark, 2); for (let i = 0; i < 7; i++) icon(c, 'star', x + 34 + i * (w - 68) / 6, g - h + 29, 6);
    },
    workshop(c, x, g, w, r) {
      const h = 250;
      wall(c, x, g - h, w, h, '#c98a5a'); shade(c, x + w - 18, g - h, 18, h); bricks(c, x, g - h, w, 110, '#b3764a', r, 40); cornice(c, x, g - h, w, C.dark);
      c.save(); c.translate(x + w / 2, g - h - 34); ICON.gear(c, 40); c.restore(); box(c, x + w / 2 - 60, g - h - 6, 120, 8, C.dark, 2);
      windows(c, x + 10, g - h + 16, w - 20, 80, 4, 1, r, { frame: C.dark }); awning(c, x + 4, g - 148, w - 8, 26, C.red, C.gold);
      // roller door, half open, with a robot's legs showing
      box(c, x + 18, g - 116, w * 0.52, 116, C.lit, 2.4); c.fillStyle = C.lit2; c.fillRect(x + 18, g - 40, w * 0.52, 40); for (let y = g - 116; y < g - 58; y += 9) box(c, x + 18, y, w * 0.52, 9, C.stone2, 1.4);
      box(c, x + 50, g - 52, 36, 34, C.stone, 2); box(c, x + 54, g - 18, 10, 18, C.dark, 1.8); box(c, x + 72, g - 18, 10, 18, C.dark, 1.8); disc(c, x + 62, g - 38, 3, C.red, 1.2); disc(c, x + 76, g - 38, 3, C.red, 1.2);
      win(c, x + w * 0.62, g - 100, w * 0.22, 54, { lit: true, inside: 'shelf', frame: C.dark }); door(c, x + w - 54, g - 84, 38, 84, C.dark, true); hangSign(c, x - 6, g - 190, 'gear');
      tank(c, x + w - 46, g - h - 8);
    },
  };
  let OPTS = {}, SPILLS = [];
  const ROW = [['teashop', 250], [null, 70], ['lab', 320], [null, 60], ['museum', 420], [null, 80], ['tower', 250], [null, 60], ['potions', 300], [null, 50], ['observatory', 330], [null, 70], ['workshop', 340], [null, 60], ['teashop', 250]];

  // the street front, baked once into a canvas in world coordinates
  function front(W, ground, scale, holes, opts) { OPTS = opts || {}; const r = capture(() => paintFront(W, ground, scale, holes || []));
    SPILLS = OPTS.spills ? r.lights.filter((l) => l.y > ground - 150 && l.y < ground - 30 && l.r > 60 && /^255,2/.test(l.color)).map((l) => l.x) : []; r.out.lights = r.lights; r.out.emitters = r.emitters; return r.out; }
  function paintFront(W, ground, scale, holes) {
    const inHole = (x, pad) => holes.some(([a, b]) => x > a - (pad || 0) && x < b + (pad || 0));
    const top = ground - 560, cv = document.createElement('canvas');
    cv.width = Math.ceil(W * scale); cv.height = Math.ceil(560 * scale);
    let c = cv.getContext('2d'); c.scale(scale, scale); c.translate(0, -top);
    const ocv = document.createElement('canvas'); ocv.width = cv.width; ocv.height = cv.height;
    const oc = ocv.getContext('2d'), fc = c, lamps = []; oc.scale(scale, scale); oc.translate(0, -top);
    const r = rng(2024);
    let x = -30;
    const gaps = [];
    // A second row of buildings behind the street row: the same detailed fronts, standing on higher ground and
    // paled by distance. Their roofs, signs and upper windows fill the sky above the shopfronts.
    // Buildings behind the street row. Two reviewers ranking variants disagreed: one wanted the hero roofs (the lab's
    // dome, the museum's gable, the observatory) against open sky, the other wanted a lived-in city behind the street.
    // 'between' does both: back buildings stand only in the spaces between those heroes. 'full' is one unbroken row;
    // 'none' leaves the sky.
    const mode = OPTS.backRow || 'between';
    if (mode !== 'none') {
      const lift = 120, bcv = document.createElement('canvas'); bcv.width = cv.width; bcv.height = cv.height;
      const bc = bcv.getContext('2d'); bc.scale(scale, scale); bc.translate(0, -top - lift);
      const n0 = SINK ? SINK.length : 0, e0 = EMS ? EMS.length : 0, rb = rng(909);
      const keep = []; { let hx = -30; for (const [kind, w] of ROW) { if (mode === 'between' && (kind === 'lab' || kind === 'museum' || kind === 'observatory')) keep.push([hx - 26, hx + w + 26]); hx += w; } }
      const kinds = [['workshop', 340], ['potions', 300], ['teashop', 250]];
      let bx = -170, k = 0;
      while (bx < W + 60) {
        const [kind, w] = kinds[k % 3], hit = keep.find(([a, b]) => bx < b && bx + w > a);
        if (hit) { bx = hit[1] + 4; continue; }
        BUILD[kind](bc, bx, ground, w, rb);
        // each stands on a plain stone storey, so no shopfront shows at upper-storey height over the street row
        box(bc, bx + 3, ground - 126, w - 12, 130, C.stone2, 2.4); box(bc, bx - 2, ground - 132, w - 2, 8, C.stone, 2.2); for (let wx = bx + 22; wx < bx + w - 48; wx += 52) win(bc, wx, ground - 104, 26, 40, { lit: ((wx * 3) | 0) % 4 === 0, frame: C.stone });
        box(bc, bx + 6, ground - 4, w - 18, lift + 10, C.slate2, 2.4);
        bx += w + 14; k++;
      }
      bc.setTransform(1, 0, 0, 1, 0, 0); bc.globalCompositeOperation = 'source-atop'; bc.fillStyle = 'rgba(104,116,178,0.52)'; bc.fillRect(0, 0, bcv.width, bcv.height);   // a clear step cooler and paler than the street row
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(bcv, 0, 0); c.restore();
      if (SINK) for (let i = n0; i < SINK.length; i++) { SINK[i].y -= lift; SINK[i].a *= 0.45; }
      if (EMS) for (let i = e0; i < EMS.length; i++) EMS[i][1] -= lift;
    }
    for (const [kind, w] of ROW) { if (kind) BUILD[kind](c, x, ground, w, r); else gaps.push([x, w]); x += w; if (x > W + 40) break; }
    for (const [gx, gw] of gaps) {                        // an alley wall closes each gap, so the row is continuous and nothing floats behind it
      if (inHole(gx + gw / 2, 30)) continue;
      const ah = 232; box(c, gx - 6, ground - ah, gw + 12, ah, C.brick2, 2.6); bricks(c, gx - 6, ground - ah, gw + 12, ah, '#7a3a34', r, 10); shade(c, gx - 6, ground - ah, gw + 12, ah, 0.22); cast(c, gx - 6, ground - ah, gw + 12, 40, 0.4);
      box(c, gx - 10, ground - ah - 6, gw + 20, 8, C.stone2, 2.2); win(c, gx + gw / 2 - 11, ground - ah + 30, 22, 28, { lit: ((gx | 0) % 2) === 0 });
      line(c, [gx + 2, ground - ah + 4, gx + 2, ground - 6], 4); line(c, [gx + 2, ground - ah + 4, gx + 2, ground - 6], 2, C.stone2);
    }
    for (const [gx, gw] of gaps) { const k = r(), ts = 1 + r() * 0.3; if (inHole(gx + gw / 2, 30)) continue; tree(c, gx + gw / 2, ground, ts, C.sage, C.sage2); if (k < 0.6) lamps.push(gx + gw * 0.2); else { box(c, gx + gw * 0.62, ground - 26, 30, 6, '#8a5a3a', 2); box(c, gx + gw * 0.62 + 2, ground - 20, 4, 20, C.dark, 1.6); box(c, gx + gw * 0.62 + 24, ground - 20, 4, 20, C.dark, 1.6); box(c, gx + gw * 0.62, ground - 42, 30, 6, '#8a5a3a', 2); } }
    // string lights across the gaps, and things left out on the pavement
    for (const [gx, gw] of gaps) {
      const x0 = gx - 14, x1 = gx + gw + 14, y0 = ground - 176, cols = ['#ffd978', '#ff8f7a', '#8fe0d0', '#ffd978', '#c9a0ff'];
      c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo((x0 + x1) / 2, y0 + 46, x1, y0); c.lineWidth = 1.6; c.strokeStyle = O; c.stroke();
      for (let i = 1; i < 7; i++) { const t = i / 7, bx = x0 + (x1 - x0) * t, by = y0 + 46 * 2 * t * (1 - t) + 5; disc(c, bx, by, 3.6, cols[i % 5], 1.3); glow(c, bx, by, 13, 0.3); }
    }
    c = oc;                                              // from here on: in front of the characters
    for (const lx of lamps) lamp(c, lx, ground);
    const prop = { hydrant(x) { box(c, x - 7, ground - 22, 14, 22, C.red, 2); box(c, x - 10, ground - 26, 20, 6, C.red, 2); disc(c, x, ground - 30, 6, C.red, 2); box(c, x - 13, ground - 16, 6, 7, C.red, 1.6); box(c, x + 7, ground - 16, 6, 7, C.red, 1.6); },
      postbox(x) { box(c, x - 13, ground - 44, 26, 44, C.blue, 2.4); c.beginPath(); c.arc(x, ground - 44, 13, Math.PI, 0); c.fillStyle = C.blue; c.fill(); c.lineWidth = 2.4; c.strokeStyle = O; c.stroke(); box(c, x - 8, ground - 40, 16, 4, C.dark, 1.2); box(c, x - 15, ground - 6, 30, 6, C.dark, 1.8); },
      bin(x) { poly(c, [x - 11, ground - 28, x + 11, ground - 28, x + 9, ground, x - 9, ground], C.sage2, 2); box(c, x - 13, ground - 32, 26, 5, C.dark, 1.8); line(c, [x - 4, ground - 24, x - 3, ground - 4], 1.2); line(c, [x + 4, ground - 24, x + 3, ground - 4], 1.2); },
      plant(x) { poly(c, [x - 10, ground - 16, x + 10, ground - 16, x + 7, ground, x - 7, ground], C.brick2, 2); for (const [dx, dy, rr] of [[-7, -24, 9], [7, -26, 9], [0, -34, 11]]) disc(c, x + dx, ground + dy, rr, dx ? C.sage2 : C.sage, 1.8); },
      crates(x) { box(c, x - 20, ground - 22, 24, 22, C.sand, 2); line(c, [x - 20, ground - 22, x + 4, ground], 1.3); box(c, x + 2, ground - 16, 18, 16, C.sand2, 2); box(c, x - 12, ground - 40, 20, 18, C.sand, 2); },
      board(x) { poly(c, [x - 12, ground, x - 2, ground - 34, x + 12, ground - 34, x + 22, ground], C.dark, 2); poly(c, [x - 8, ground - 4, x, ground - 30, x + 10, ground - 30, x + 16, ground - 4], C.cream, 1.6); line(c, [x, ground - 22, x + 10, ground - 22], 1.4, C.red); line(c, [x - 2, ground - 14, x + 12, ground - 14], 1.4, C.red); } };
    const order = ['board', 'plant', 'hydrant', 'crates', 'postbox', 'plant', 'bin', 'plant', 'crates', 'board', 'hydrant', 'plant', 'bin'];
    let px = 34, k = 0; while (px < W) { if (!inHole(px, 60)) prop[order[k % order.length]](px); px += 150 + r() * 120; k++; }
    // roadworks: a striped barrier with a warning lamp either side of each hole
    for (const [a, b] of holes) for (const [bx, d] of [[a - 34, 1], [b + 34, -1]]) {
      box(c, bx - 26, ground - 34, 5, 34, C.dark, 1.8); box(c, bx + 21, ground - 34, 5, 34, C.dark, 1.8); box(c, bx - 30, ground - 40, 60, 14, C.white, 2.2);
      for (let i = 0; i < 4; i++) poly(c, [bx - 28 + i * 15, ground - 39, bx - 20 + i * 15, ground - 39, bx - 26 + i * 15, ground - 27, bx - 34 + i * 15 + 6, ground - 27], C.red, 0);
      c.lineWidth = 2.2; c.strokeStyle = O; c.strokeRect(bx - 30, ground - 40, 60, 14); disc(c, bx + d * 24, ground - 46, 6, '#ffb347', 2); glow(c, bx + d * 24, ground - 46, 26, 0.5, '255,170,80');
      poly(c, [bx - d * 52, ground, bx - d * 44, ground - 26, bx - d * 36, ground], '#ff8f3a', 2); line(c, [bx - d * 49, ground - 9, bx - d * 39, ground - 9], 2.4, C.white);
    }
    c = fc;
    for (let lx = 150; lx < W + 40; lx += 300) glow(c, lx, ground + 52, 60, 0.5);
    return { cv, top, h: 560, over: { cv: ocv, top, h: 560 } };
  }

  // pale skyline, no outlines
  function far(c, w, horizon) {
    const r = rng(77), lr = rng(321);
    for (let x = 90; x < w; x += 250 + lr() * 180) {                         // landmarks: a domed hall, a stepped tower, a clock tower, chimneys
      const k = Math.floor(lr() * 4), col = DUSK ? '#a06aa2' : '#b6c2de'; c.fillStyle = col;
      if (k === 0) { c.fillRect(x - 60, horizon - 210, 120, 210); c.beginPath(); c.arc(x, horizon - 210, 52, Math.PI, 0); c.fill(); c.fillRect(x - 7, horizon - 286, 14, 26); c.beginPath(); c.moveTo(x - 9, horizon - 286); c.lineTo(x, horizon - 312); c.lineTo(x + 9, horizon - 286); c.fill(); for (let i = -2; i <= 2; i++) { c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(x + i * 20 - 4, horizon - 190, 8, 150); c.fillStyle = col; } }
      else if (k === 1) { for (const [bw, bh] of [[110, 230], [78, 300], [46, 360], [18, 410]]) c.fillRect(x - bw / 2, horizon - bh, bw, bh); c.beginPath(); c.moveTo(x - 9, horizon - 410); c.lineTo(x, horizon - 470); c.lineTo(x + 9, horizon - 410); c.fill(); }
      else if (k === 2) { c.fillRect(x - 26, horizon - 340, 52, 340); c.beginPath(); c.moveTo(x - 32, horizon - 340); c.lineTo(x, horizon - 400); c.lineTo(x + 32, horizon - 340); c.fill(); c.fillStyle = '#eef0f6'; c.beginPath(); c.arc(x, horizon - 300, 16, 0, 7); c.fill(); c.fillStyle = col; }
      else { for (const dx of [-30, 14]) { c.fillRect(x + dx, horizon - 300, 20, 300); c.fillRect(x + dx - 4, horizon - 306, 28, 8); } c.fillRect(x - 70, horizon - 150, 150, 150); c.fillStyle = 'rgba(255,255,255,0.4)'; for (const [dx, dy, rr] of [[-18, -330, 14], [-4, -356, 18], [30, -334, 13], [46, -362, 17]]) { c.beginPath(); c.arc(x + dx, horizon + dy, rr, 0, 7); c.fill(); } }
    }
    for (const [col, k, base] of (DUSK ? [['#b878a4', 1, 0], ['#8f66a6', 0.8, 30]] : [['#c3cee4', 1, 0], ['#aebcd9', 0.8, 30]])) for (let x = -20; x < w; x += 46 + r() * 40) { const bw = 40 + r() * 60, bh = (120 + r() * 240) * k; c.fillStyle = col; c.fillRect(x, horizon - bh + base, bw, bh); if (DUSK) { c.fillStyle = 'rgba(255,226,214,0.55)'; c.fillRect(x, horizon - bh + base, bw, 2.5); c.fillStyle = 'rgba(40,24,90,0.22)'; c.fillRect(x + bw - 9, horizon - bh + base, 9, bh); } c.fillStyle = DUSK ? 'rgba(255,224,150,0.6)' : 'rgba(255,255,255,0.3)'; for (let wy = horizon - bh + base + 10; wy < horizon - 20; wy += 15) for (let wx = x + 7; wx < x + bw - 8; wx += 11) if (((wx * 7 + wy * 3) | 0) % 4) c.fillRect(wx, wy, 5, 7); c.fillStyle = col; if (r() < 0.35) c.fillRect(x + bw * 0.2, horizon - bh + base - 16, bw * 0.6, 16); if (r() < 0.3) c.fillRect(x + bw / 2 - 1.5, horizon - bh + base - 40, 3, 40); }
    if (DUSK) { c.save(); c.globalCompositeOperation = 'source-atop'; const g = c.createLinearGradient(0, horizon - 260, 0, horizon); g.addColorStop(0, 'rgba(255,150,110,0)'); g.addColorStop(1, 'rgba(255,150,110,0.5)'); c.fillStyle = g; c.fillRect(-40, horizon - 260, w + 80, 260); c.restore(); }   // the bases melt into the glow on the horizon
  }
  // mid plane: quieter buildings with window grids, a viaduct with a monorail, an airship
  function mid(c, w, horizon) {
    const r = rng(404), LO = '#4b5677';
    for (let x = -30; x < w; x += 90 + r() * 70) {
      const bw = 80 + r() * 70, bh = 190 + r() * 190, col = ['#8f9dbf', '#c49a86', '#d6c4a2', '#7f95a8', '#b9a48e', '#9a8fb0'][Math.floor(r() * 6)];
      c.fillStyle = col; c.fillRect(x, horizon - bh, bw, bh); { const g = c.createLinearGradient(0, horizon - bh, 0, horizon); g.addColorStop(0, 'rgba(255,255,255,0.12)'); g.addColorStop(0.35, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(34,28,92,0.42)'); c.fillStyle = g; c.fillRect(x, horizon - bh, bw, bh); } c.fillStyle = 'rgba(28,32,58,0.26)'; c.fillRect(x + bw - 14, horizon - bh, 14, bh); c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(x, horizon - bh, 5, bh);
      c.lineWidth = 1.8; c.strokeStyle = LO; c.strokeRect(x, horizon - bh, bw, bh);
      const ws = Math.floor(r() * 3), ww = [11, 8, 18][ws], wh = [14, 22, 12][ws], gx = [20, 17, 28][ws], gy = [24, 34, 22][ws];        // three kinds of window, so no two blocks match
      for (let wy = horizon - bh + 16; wy < horizon - 30; wy += gy) for (let wx = x + 10; wx < x + bw - ww - 8; wx += gx) { const lit = r() < 0.36; c.fillStyle = lit ? (r() < 0.3 ? '#ffb86a' : '#f6d58a') : '#8e9cc4'; c.fillRect(wx, wy, ww, wh); if (lit) { c.fillStyle = 'rgba(255,214,130,0.16)'; c.fillRect(wx - 3, wy - 3, ww + 6, wh + 6); } c.lineWidth = 1; c.strokeRect(wx, wy, ww, wh); if (ws === 2) { c.beginPath(); c.moveTo(wx + ww / 2, wy); c.lineTo(wx + ww / 2, wy + wh); c.stroke(); } }
      c.fillStyle = 'rgba(232,238,255,0.5)'; c.fillRect(x, horizon - bh, bw, 4); c.fillStyle = 'rgba(28,32,58,0.2)'; c.fillRect(x, horizon - bh + 4, bw, 5); c.lineWidth = 1.8;
      const ty = horizon - bh, mx = x + bw / 2, kind = Math.floor(r() * 7); c.fillStyle = col; c.lineWidth = 1.8; c.strokeStyle = LO;                    // something different on every roof
      if (kind === 0) { c.beginPath(); c.moveTo(x - 4, ty); c.lineTo(mx, ty - 34); c.lineTo(x + bw + 4, ty); c.closePath(); c.fillStyle = '#8a6a78'; c.fill(); c.stroke(); }
      else if (kind === 1) { c.beginPath(); c.moveTo(mx - 12, ty); c.lineTo(mx - 12, ty - 16); c.moveTo(mx + 12, ty); c.lineTo(mx + 12, ty - 16); c.stroke(); c.fillStyle = '#a8826a'; c.fillRect(mx - 17, ty - 44, 34, 28); c.strokeRect(mx - 17, ty - 44, 34, 28); c.beginPath(); c.moveTo(mx - 20, ty - 44); c.lineTo(mx, ty - 60); c.lineTo(mx + 20, ty - 44); c.closePath(); c.fill(); c.stroke(); }
      else if (kind === 2) { c.beginPath(); c.moveTo(mx, ty); c.lineTo(mx, ty - 70); c.moveTo(mx - 12, ty - 44); c.lineTo(mx + 12, ty - 44); c.moveTo(mx - 8, ty - 56); c.lineTo(mx + 8, ty - 56); c.stroke(); c.fillStyle = '#e0605a'; c.beginPath(); c.arc(mx, ty - 72, 3.4, 0, 7); c.fill(); }
      else if (kind === 3) { c.beginPath(); c.arc(mx, ty, bw * 0.3, Math.PI, 0); c.closePath(); c.fillStyle = '#7fa8b0'; c.fill(); c.stroke(); c.beginPath(); c.moveTo(mx, ty - bw * 0.3); c.lineTo(mx, ty - bw * 0.3 - 18); c.stroke(); }
      else if (kind === 4) { c.fillRect(x + bw * 0.25, ty - 40, bw * 0.5, 40); c.strokeRect(x + bw * 0.25, ty - 40, bw * 0.5, 40); c.fillStyle = '#f6d58a'; c.fillRect(mx - 5, ty - 30, 10, 14); c.strokeRect(mx - 5, ty - 30, 10, 14); c.beginPath(); c.moveTo(mx, ty - 40); c.lineTo(mx, ty - 62); c.stroke(); c.fillStyle = '#c9574a'; c.beginPath(); c.moveTo(mx, ty - 62); c.lineTo(mx + 16, ty - 57); c.lineTo(mx, ty - 52); c.fill(); }
      else if (kind === 5) { for (const dx of [-0.26, 0.2]) { c.fillStyle = '#8a6a78'; c.fillRect(mx + dx * bw, ty - 22, 12, 22); c.strokeRect(mx + dx * bw, ty - 22, 12, 22); } c.fillStyle = '#b9c6e0'; c.beginPath(); c.moveTo(mx - 14, ty); c.lineTo(mx - 4, ty - 12); c.lineTo(mx + 14, ty - 12); c.lineTo(mx + 4, ty); c.closePath(); c.fill(); c.stroke(); }
      else { c.fillStyle = '#efe6d2'; c.beginPath(); c.arc(mx, ty - 26, 17, 0, 7); c.fill(); c.stroke(); c.fillStyle = col; c.fillRect(mx - 22, ty - 12, 44, 12); c.strokeRect(mx - 22, ty - 12, 44, 12); c.beginPath(); c.moveTo(mx, ty - 26); c.lineTo(mx, ty - 37); c.moveTo(mx, ty - 26); c.lineTo(mx + 8, ty - 22); c.stroke(); }   // a clock
    }
    const vy = horizon - 362, S = 200, PW = 30, R = (S - PW) / 2, SP = vy + 30 + R, VC = '#8b96c6', VL = '#343c62';   // high enough that the arches clear the shop roofs: the lit town shows through them
    c.fillStyle = VC; c.strokeStyle = VL; c.lineWidth = 2.6;
    for (let x = -60; x < w; x += S) {                      // piers, and the spandrels over each arch
      c.fillRect(x, vy + 24, PW, horizon - vy - 24); c.strokeRect(x, vy + 24, PW, horizon - vy - 24);
      c.beginPath(); c.moveTo(x + PW, vy + 24); c.lineTo(x + S, vy + 24); c.lineTo(x + S, SP); c.arc(x + PW + R, SP, R, 0, Math.PI, true); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = 'rgba(20,24,60,0.24)'; c.fillRect(x + PW - 10, vy + 24, 10, horizon - vy - 24); c.fillStyle = 'rgba(226,234,255,0.22)'; c.fillRect(x + 1, vy + 24, 5, horizon - vy - 24);
      c.lineWidth = 1; c.strokeStyle = 'rgba(60,70,110,0.5)'; for (let yy = SP + 20; yy < horizon; yy += 26) { c.beginPath(); c.moveTo(x, yy); c.lineTo(x + PW, yy); c.stroke(); }
      c.fillStyle = VC; c.strokeStyle = VL; c.lineWidth = 2.6;
    }
    c.fillRect(-60, vy, w + 120, 26); c.strokeRect(-60, vy, w + 120, 26);
    c.fillStyle = '#b4bee4'; c.fillRect(-60, vy - 7, w + 120, 8); c.strokeRect(-60, vy - 7, w + 120, 8); c.fillStyle = 'rgba(240,244,255,0.8)'; c.fillRect(-60, vy - 6, w + 120, 2.5);   // the parapet catches the moon
    c.fillStyle = 'rgba(20,24,60,0.22)'; c.fillRect(-60, vy + 26, w + 120, 7);                                                             // and throws a shadow on the arches
    c.lineWidth = 1.3; c.strokeStyle = 'rgba(44,52,96,0.8)'; c.beginPath(); for (const yy of [vy + 9, vy + 18]) { c.moveTo(-60, yy); c.lineTo(w + 60, yy); } for (let x = -60, k = 0; x < w; x += 17, k++) { const yy = vy + (k % 2 ? 9 : 0); c.moveTo(x, yy + (k % 2 ? 0 : 1)); c.lineTo(x, yy + 9); c.moveTo(x + 8, vy + 18); c.lineTo(x + 8, vy + 26); } c.stroke();   // the deck in dressed blocks
    for (let x = -60; x < w; x += S) {                      // blocks in the spandrels, and lamplight in each arch from the street beyond
      const cx = x + PW + R; c.save(); c.beginPath(); c.moveTo(x + PW, vy + 33); c.lineTo(x + S, vy + 33); c.lineTo(x + S, SP); c.arc(cx, SP, R, 0, Math.PI, true); c.closePath(); c.clip();
      c.lineWidth = 1.1; c.strokeStyle = 'rgba(44,52,96,0.6)'; c.beginPath(); for (let yy = vy + 46, row = 0; yy < SP; yy += 16, row++) { c.moveTo(x, yy); c.lineTo(x + S + PW, yy); for (let bx = x + (row % 2 ? 14 : 0); bx < x + S + PW; bx += 28) { c.moveTo(bx, yy); c.lineTo(bx, yy + 16); } } c.stroke(); c.restore();
      c.save(); c.beginPath(); c.arc(cx, SP, R - 10, Math.PI, 0); c.lineTo(cx + R - 10, horizon); c.lineTo(cx - R + 10, horizon); c.closePath(); c.clip(); const ug = c.createRadialGradient(cx, SP + 70, 6, cx, SP + 70, R * 1.25); ug.addColorStop(0, 'rgba(255,196,120,0.42)'); ug.addColorStop(1, 'rgba(255,196,120,0)'); c.fillStyle = ug; c.fillRect(cx - R, SP - R, R * 2, horizon - SP + R); c.restore();
    }
    for (let x = -60 + PW + R; x < w; x += S) {
      c.beginPath(); c.arc(x, SP, R - 5, Math.PI, 0); c.lineWidth = 10; c.strokeStyle = '#59639a'; c.stroke();                           // the underside of the arch, in shadow
      c.lineWidth = 2; c.strokeStyle = VL; c.beginPath(); c.arc(x, SP, R, Math.PI, 0); c.stroke(); c.lineWidth = 1.2; c.beginPath(); c.arc(x, SP, R - 10, Math.PI, 0); c.stroke();
      c.lineWidth = 2; c.fillStyle = '#b4bee4'; c.fillRect(x - 7, vy + 27, 14, 14); c.strokeRect(x - 7, vy + 27, 14, 14);                  // keystones
      const lx = x - R - PW / 2; c.fillStyle = VL; c.fillRect(lx - 4, vy - 12, 8, 5); c.fillRect(lx - 1.6, vy - 38, 3.2, 27); c.fillRect(lx - 1.6, vy - 40, 12, 2.6); c.fillStyle = 'rgba(255,226,150,0.5)'; c.beginPath(); c.arc(lx + 10, vy - 32, 8, 0, 7); c.fill(); c.fillStyle = '#ffe9a0'; c.fillRect(lx + 6.5, vy - 37.5, 7, 9); c.lineWidth = 1.4; c.strokeRect(lx + 6.5, vy - 37.5, 7, 9); c.lineWidth = 2; }   // lamp posts along the line
    c.lineWidth = 2; c.strokeStyle = LO;
    for (let x = 30; x < w; x += 130 + r() * 110) { const s = 1.4 + r() * 1.1, dark = r() < 0.5; c.fillStyle = '#6a5a52'; c.fillRect(x - 4 * s, horizon - 40 * s, 8 * s, 40 * s); for (const [dx, dy, rr] of [[-20, -30, 26], [20, -34, 26], [0, -56, 30], [-8, -44, 20]]) { c.beginPath(); c.arc(x + dx * s, horizon + dy * s, rr * s, 0, 7); c.fillStyle = dark ? '#5f8468' : '#7d9a7a'; c.fill(); c.lineWidth = 1.8; c.strokeStyle = LO; c.stroke(); } c.fillStyle = 'rgba(255,255,255,0.14)'; c.beginPath(); c.arc(x - 8 * s, horizon - 62 * s, 14 * s, 0, 7); c.fill(); }
    // a sky-barge
    const ax = w * 0.62, ay = horizon - 430;
    c.beginPath(); c.ellipse(ax, ay, 70, 26, 0, 0, 7); c.fillStyle = '#e0a94a'; c.fill(); c.lineWidth = 2; c.strokeStyle = LO; c.stroke();
    for (const dx of [-30, 0, 30]) { c.beginPath(); c.moveTo(ax + dx, ay - 25); c.quadraticCurveTo(ax + dx + 8, ay, ax + dx, ay + 25); c.stroke(); }
    c.fillStyle = '#c9574a'; c.beginPath(); c.moveTo(ax - 62, ay - 8); c.lineTo(ax - 92, ay - 24); c.lineTo(ax - 86, ay + 2); c.lineTo(ax - 92, ay + 24); c.lineTo(ax - 62, ay + 8); c.fill(); c.stroke();
    c.fillStyle = '#efe6d2'; c.fillRect(ax - 24, ay + 28, 48, 14); c.strokeRect(ax - 24, ay + 28, 48, 14); c.beginPath(); c.moveTo(ax - 16, ay + 24); c.lineTo(ax - 16, ay + 28); c.moveTo(ax + 16, ay + 24); c.lineTo(ax + 16, ay + 28); c.stroke();
  }
  // the far wall of the canal, where the street has fallen in: dressed stone, a coping, a culvert and mooring rings
  function trench(c, t, wy) {
    const x0 = t.x0, x1 = t.x1, y0 = t.trench + 4, y1 = t.y0, mx = (x0 + x1) / 2, sy = (wy || y1) + 4;
    const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, '#5d6894'); g.addColorStop(1, '#2c3258'); c.fillStyle = g; c.fillRect(x0, y0, x1 - x0, y1 - y0);
    c.strokeStyle = 'rgba(22,24,54,0.5)'; c.lineWidth = 1.2; c.beginPath();
    for (let y = y0 + 22, row = 0; y < y1; y += 20, row++) { c.moveTo(x0, y); c.lineTo(x1, y); for (let x = x0 + (row % 2 ? 24 : 0); x < x1; x += 48) { c.moveTo(x, y); c.lineTo(x, Math.min(y + 20, y1)); } } c.stroke();
    c.fillStyle = 'rgba(96,150,120,0.5)'; for (let i = 0; i < 9; i++) { const sx = x0 + 14 + ((i * 67) % (x1 - x0 - 28)); c.fillRect(sx, y0 + 14, 5 + (i % 3) * 3, 6 + ((i * 13) % 14)); }   // moss under the coping
    c.fillStyle = '#8a94c0'; c.fillRect(x0, y0, x1 - x0, 10); c.fillStyle = 'rgba(236,240,255,0.55)'; c.fillRect(x0, y0, x1 - x0, 2.5); c.fillStyle = 'rgba(16,16,48,0.3)'; c.fillRect(x0, y0 + 10, x1 - x0, 5);
    c.strokeStyle = O; c.lineWidth = 2; c.beginPath(); c.moveTo(x0, y0 + 10); c.lineTo(x1, y0 + 10); c.stroke();
    c.beginPath(); c.ellipse(mx, sy, 52, 28, 0, Math.PI, 0); c.lineTo(mx + 52, y1); c.lineTo(mx - 52, y1); c.closePath(); c.fillStyle = '#7c86b2'; c.fill(); c.stroke();          // the culvert's stone ring
    for (let k = 1; k < 8; k++) { const a = Math.PI + k * Math.PI / 8; c.beginPath(); c.moveTo(mx + Math.cos(a) * 44, sy + Math.sin(a) * 20); c.lineTo(mx + Math.cos(a) * 52, sy + Math.sin(a) * 28); c.lineWidth = 1.2; c.stroke(); }
    c.lineWidth = 2; c.beginPath(); c.ellipse(mx, sy, 44, 20, 0, Math.PI, 0); c.lineTo(mx + 44, y1); c.lineTo(mx - 44, y1); c.closePath(); c.fillStyle = '#12152c'; c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,214,150,0.55)'; c.fillRect(mx - 14, sy - 5, 24, 2); c.fillRect(mx - 4, sy - 11, 14, 1.6);                                                              // a lamp somewhere down the tunnel
    for (const rx of [x0 + 40, x1 - 40]) { c.fillStyle = '#9aa3c0'; c.fillRect(rx - 3.5, y0 + 22, 7, 8); c.strokeRect(rx - 3.5, y0 + 22, 7, 8); c.beginPath(); c.arc(rx, y0 + 37, 7, 0, 7); c.lineWidth = 4.4; c.strokeStyle = O; c.stroke(); c.lineWidth = 2; c.strokeStyle = '#9aa3c0'; c.stroke(); c.strokeStyle = O; }
  }
  // the monorail, drawn once; the game slides it along the viaduct
  function train() {
    const cv = document.createElement('canvas'); cv.width = 396 * 2; cv.height = 36 * 2; const c = cv.getContext('2d'); c.scale(2, 2); c.strokeStyle = '#4b5677'; c.lineWidth = 2;
    for (let i = 0; i < 3; i++) { const tx = 1 + i * 132; c.fillStyle = '#efe6d2'; c.beginPath(); c.roundRect(tx, 1, 126, 32, i === 2 ? [6, 18, 4, 6] : 6); c.fill(); c.stroke(); c.fillStyle = '#c9574a'; c.fillRect(tx + 2, 23, 122, 5); for (let k = 0; k < 5; k++) { c.fillStyle = '#ffe0a0'; c.fillRect(tx + 10 + k * 22, 7, 15, 12); c.lineWidth = 1; c.strokeRect(tx + 10 + k * 22, 7, 15, 12); c.lineWidth = 2; } }
    return cv;
  }
  let DUSK = false;                                       // set by sky(); the far skyline reads it to pick silhouette colours
  function duskSky(c, VW, VH) {
    const g = c.createLinearGradient(0, 0, 0, VH * 0.6); g.addColorStop(0, '#232f78'); g.addColorStop(0.3, '#5a479c'); g.addColorStop(0.55, '#b85a98'); g.addColorStop(0.78, '#ff9468'); g.addColorStop(1, '#ffd58c'); c.fillStyle = g; c.fillRect(0, 0, VW, VH);
    const sr = rng(9); c.fillStyle = '#fff6e0'; for (let i = 0; i < 80; i++) { const y = sr() * VH * 0.42; c.globalAlpha = 1 - y / (VH * 0.44); c.beginPath(); c.arc(sr() * VW, y, 0.6 + sr() * 1.3, 0, 7); c.fill(); } c.globalAlpha = 1;
    const mx = VW * 0.4, my = 112;                         // a huge harvest moon, high enough to clear most roofs wherever the camera is
    { const hg = c.createRadialGradient(mx, my, 60, mx, my, 250); hg.addColorStop(0, 'rgba(255,232,180,0.42)'); hg.addColorStop(0.4, 'rgba(255,214,170,0.16)'); hg.addColorStop(1, 'rgba(255,214,170,0)'); c.fillStyle = hg; c.fillRect(mx - 250, my - 250, 500, 500); }   // a soft graded glow
    c.fillStyle = '#fff1cc'; c.beginPath(); c.arc(mx, my, 72, 0, 7); c.fill(); c.lineWidth = 3; c.strokeStyle = '#f0c48a'; c.stroke();
    c.fillStyle = '#f3dcae'; for (const [dx, dy, cr] of [[-27, -20, 14], [20, 9, 19], [-11, 30, 9], [32, -32, 8], [-41, 14, 7], [5, -41, 6]]) { c.beginPath(); c.arc(mx + dx, my + dy, cr, 0, 7); c.fill(); }
    for (const [cx, cy, w, hh] of [[150, 226, 260, 14], [640, 118, 300, 14], [940, 196, 280, 14], [760, 262, 380, 14], [250, 82, 240, 11], [1010, 96, 200, 10], [60, 150, 190, 11]]) { c.fillStyle = 'rgba(70,50,130,0.55)'; c.beginPath(); c.ellipse(cx, cy, w / 2, hh / 2, 0, 0, 7); c.fill(); c.fillStyle = 'rgba(255,170,130,0.75)'; c.beginPath(); c.ellipse(cx, cy + hh * 0.28, w * 0.46, hh * 0.22, 0, 0, 7); c.fill(); }   // bars of cloud lit from below
    c.strokeStyle = '#2f2a5c'; c.lineWidth = 2; c.lineCap = 'round'; for (const [bx, by, s] of [[340, 150, 1], [372, 138, 0.8], [400, 160, 0.9], [820, 110, 0.8], [848, 122, 0.7]]) { c.beginPath(); c.moveTo(bx - 8 * s, by - 4 * s); c.quadraticCurveTo(bx - 3 * s, by - 7 * s, bx, by); c.quadraticCurveTo(bx + 3 * s, by - 7 * s, bx + 8 * s, by - 4 * s); c.stroke(); }
  }
  function sky(c, VW, VH, dusk) {
    DUSK = !!dusk; if (dusk) return duskSky(c, VW, VH);
    const g = c.createLinearGradient(0, 0, 0, VH * 0.8); g.addColorStop(0, '#7f9ad0'); g.addColorStop(0.55, '#e6c8c4'); g.addColorStop(1, '#ffe4b8'); c.fillStyle = g; c.fillRect(0, 0, VW, VH);
    const sr = rng(9); c.fillStyle = 'rgba(255,250,230,0.8)'; for (let i = 0; i < 46; i++) { c.beginPath(); c.arc(sr() * VW, sr() * VH * 0.34, 0.6 + sr() * 1.1, 0, 7); c.fill(); }
    c.fillStyle = '#fff4d8'; c.beginPath(); c.arc(VW * 0.78, 92, 30, 0, 7); c.fill(); c.fillStyle = '#a2aacc'; c.beginPath(); c.arc(VW * 0.78 + 13, 84, 26, 0, 7); c.fill();   // the sky colour at this height, to bite the crescent out
    const puff = (x, y, s) => { c.fillStyle = '#f6f1e6'; c.strokeStyle = '#a9b7d2'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 60 * s, y); c.arc(x - 36 * s, y - 6 * s, 22 * s, Math.PI * 0.9, Math.PI * 1.6); c.arc(x - 4 * s, y - 22 * s, 30 * s, Math.PI * 1.1, Math.PI * 1.9); c.arc(x + 34 * s, y - 8 * s, 24 * s, Math.PI * 1.3, Math.PI * 0.1); c.lineTo(x + 60 * s, y); c.closePath(); c.fill(); c.save(); c.clip(); c.fillStyle = 'rgba(242,160,150,0.42)'; c.fillRect(x - 62 * s, y - 9 * s, 124 * s, 10 * s); c.restore(); c.stroke(); };
    puff(190, 120, 1); puff(520, 70, 0.7); puff(930, 180, 0.9);
    c.strokeStyle = '#4b5677'; c.lineWidth = 2; c.lineCap = 'round'; for (const [bx, by, s] of [[340, 150, 1], [372, 138, 0.8], [400, 160, 0.9], [760, 96, 0.8], [788, 108, 0.7]]) { c.beginPath(); c.moveTo(bx - 8 * s, by - 4 * s); c.quadraticCurveTo(bx - 3 * s, by - 7 * s, bx, by); c.quadraticCurveTo(bx + 3 * s, by - 7 * s, bx + 8 * s, by - 4 * s); c.stroke(); }
  }

  // pavement and the cross-section underneath
  function street(c, t, x0, x1, y1, time) {
    const y = t.y0;
    c.fillStyle = '#4c5169'; c.fillRect(x0, y + 26, x1 - x0, y1 - y - 26);
    c.strokeStyle = '#3a3f55'; c.lineWidth = 2;
    for (let yy = y + 60, row = 0; yy < y1; yy += 34, row++) { c.beginPath(); c.moveTo(x0, yy); c.lineTo(x1, yy); c.stroke(); for (let x = Math.floor(x0 / 80) * 80 + (row % 2 ? 40 : 0); x < x1; x += 80) { c.beginPath(); c.moveTo(x, yy); c.lineTo(x, yy + 34); c.stroke(); } }
    // arches with bars, pipes and round lamps
    for (let x = Math.floor(x0 / 560) * 560 + 300; x < x1 + 120; x += 560) { c.beginPath(); c.moveTo(x - 80, y1 + 10); c.lineTo(x - 80, y + 150); c.arc(x, y + 150, 80, Math.PI, 0); c.lineTo(x + 80, y1 + 10); c.closePath(); c.fillStyle = '#2f3349'; c.fill(); c.lineWidth = 5; c.strokeStyle = '#6a708a'; c.stroke(); c.lineWidth = 2.4; c.strokeStyle = O; c.stroke(); for (let b = -60; b <= 60; b += 24) line(c, [x + b, y + 150 - Math.sqrt(6400 - b * b) + 6, x + b, y1], 3, '#555b75'); }
    const py = y + 96;
    c.fillStyle = '#737b98'; c.fillRect(x0, py - 9, x1 - x0, 18); c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(x0, py - 7, x1 - x0, 4); line(c, [x0, py - 9, x1, py - 9], 2.2); line(c, [x0, py + 9, x1, py + 9], 2.2);
    for (let x = Math.floor(x0 / 190) * 190 + 60; x < x1; x += 190) box(c, x - 5, py - 13, 10, 26, '#5d6480', 2);
    for (let x = Math.floor(x0 / 300) * 300 + 150; x < x1 + 40; x += 300) { disc(c, x, y + 52, 9, C.lit, 2.2); box(c, x - 13, y + 38, 26, 5, '#5d6480', 1.8); }
    // kerb and paving
    box(c, x0 - 4, y + 14, x1 - x0 + 8, 14, '#a8a49b', 2.4); for (const ex of [t.x0, t.x1]) if (ex > x0 - 2 && ex < x1 + 2) line(c, [ex, y, ex, y1], 3.4);
    c.fillStyle = '#cfcabf'; c.fillRect(x0, y, x1 - x0, 15); for (let x = Math.floor(x0 / 58) * 58; x < x1; x += 58) line(c, [x, y + 1, x - 5, y + 14], 1.3, 'rgba(43,48,68,0.4)');
    for (const sx of SPILLS) if (sx > x0 - 50 && sx < x1 + 50 && sx > t.x0 + 30 && sx < t.x1 - 30) { c.beginPath(); c.moveTo(sx - 30, y + 1); c.lineTo(sx + 30, y + 1); c.lineTo(sx + 46, y + 15); c.lineTo(sx - 46, y + 15); c.closePath(); c.fillStyle = 'rgba(255,200,116,0.72)'; c.fill(); c.beginPath(); c.moveTo(sx - 46, y + 15); c.lineTo(sx + 46, y + 15); c.lineTo(sx + 52, y + 28); c.lineTo(sx - 52, y + 28); c.closePath(); c.fillStyle = 'rgba(255,200,116,0.4)'; c.fill(); }   // light spilling from windows and doors
    line(c, [x0, y, x1, y], 3); line(c, [x0, y + 15, x1, y + 15], 2);
  }

  NN.town = { front, far, mid, sky, street, train, trench, parts: { ICON, awning, poster, tree, lamp, cornice, wall, bricks, cast, hangSign, vine, tank, dish, flag, vent, capture, O, C, rng, box, shade, line, poly, disc, glow, icon, win, door, sign } };
})(window.NN);
