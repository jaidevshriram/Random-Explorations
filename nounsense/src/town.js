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
  function box(c, x, y, w, h, fill, lw) { c.fillStyle = fill; c.fillRect(x, y, w, h); c.lineWidth = lw || 2.4; c.strokeStyle = O; c.lineJoin = 'round'; c.strokeRect(x, y, w, h); }
  function shade(c, x, y, w, h, a) { c.fillStyle = `rgba(28,32,58,${a || 0.16})`; c.fillRect(x, y, w, h); }
  function line(c, pts, lw, col) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.lineWidth = lw || 1.6; c.strokeStyle = col || O; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(); }
  function poly(c, pts, fill, lw) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (lw !== 0) { c.lineWidth = lw || 2.4; c.strokeStyle = O; c.lineJoin = 'round'; c.stroke(); } }
  function disc(c, x, y, r, fill, lw) { c.beginPath(); c.arc(x, y, r, 0, 7); if (fill) { c.fillStyle = fill; c.fill(); } if (lw !== 0) { c.lineWidth = lw || 2.4; c.strokeStyle = O; c.stroke(); } }
  function glow(c, x, y, r, a) { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(255,224,150,${a || 0.5})`); g.addColorStop(1, 'rgba(255,224,150,0)'); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
  function bricks(c, x, y, w, h, col, r, n) { c.strokeStyle = col; c.lineWidth = 1.5; c.lineCap = 'round'; for (let i = 0; i < n; i++) { const bx = x + 6 + r() * (w - 24), by = y + 6 + Math.floor(r() * (h - 12) / 9) * 9; c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + 8 + r() * 8, by); c.stroke(); } }

  // a window: frame, glass, mullions, sill; lit ones get a warm interior and something inside
  function win(c, x, y, w, h, o) {
    o = o || {};
    const lit = o.lit;
    box(c, x - 3, y - 3, w + 6, h + 6, o.frame || C.cream, 2);
    c.fillStyle = lit ? C.lit : C.glass; c.fillRect(x, y, w, h);
    if (lit) { c.fillStyle = C.lit2; c.fillRect(x, y + h * 0.55, w, h * 0.45); }
    else { c.fillStyle = 'rgba(255,255,255,0.22)'; c.beginPath(); c.moveTo(x, y + h * 0.5); c.lineTo(x + w * 0.5, y); c.lineTo(x + w * 0.75, y); c.lineTo(x, y + h * 0.9); c.fill(); }
    if (lit && o.inside === 'shelf') for (let r = 0; r < Math.floor(h / 16); r++) { const sy = y + h - 4 - r * 16; line(c, [x + 2, sy, x + w - 2, sy], 1.6, '#8a5a3a'); for (let bx = x + 4; bx < x + w - 6; bx += 5 + ((bx * 7 + r * 3) % 4)) { c.fillStyle = [C.red, C.blue, C.sage2, C.plum, C.gold][(Math.floor(bx) + r) % 5]; c.fillRect(bx, sy - 9 - ((bx * 3) % 3), 3.6, 9 + ((bx * 3) % 3)); } }
    if (lit && o.inside === 'person') { c.fillStyle = 'rgba(60,50,70,0.55)'; c.beginPath(); c.arc(x + w * 0.5, y + h * 0.5, w * 0.16, 0, 7); c.fill(); c.fillRect(x + w * 0.5 - w * 0.2, y + h * 0.62, w * 0.4, h * 0.4); }
    if (o.curtain) { c.fillStyle = o.curtain; c.beginPath(); c.moveTo(x, y); c.lineTo(x + w * 0.34, y); c.quadraticCurveTo(x + w * 0.3, y + h * 0.5, x, y + h * 0.7); c.fill(); c.beginPath(); c.moveTo(x + w, y); c.lineTo(x + w * 0.66, y); c.quadraticCurveTo(x + w * 0.7, y + h * 0.5, x + w, y + h * 0.7); c.fill(); }
    c.lineWidth = 2; c.strokeStyle = O; c.strokeRect(x, y, w, h);
    if (o.cross !== false) { line(c, [x + w / 2, y, x + w / 2, y + h], 1.6); if (h > w * 0.9) line(c, [x, y + h * 0.42, x + w, y + h * 0.42], 1.6); }
    box(c, x - 6, y + h + 3, w + 12, 5, o.sill || C.stone, 1.8);
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
    shade(c, x + 2, y + h + sw / 2, w - 4, 10, 0.2);
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
  function tree(c, x, y, s, a, b) { box(c, x - 4 * s, y - 34 * s, 8 * s, 34 * s, '#7b5a45', 2); for (const [dx, dy, r, col] of [[-16, -44, 20, b], [16, -46, 20, b], [0, -62, 24, a], [-6, -40, 16, a]]) disc(c, x + dx * s, y + dy * s, r * s, col, 2.2); line(c, [x - 10 * s, y - 62 * s, x - 2 * s, y - 70 * s], 1.4); line(c, [x + 10 * s, y - 44 * s, x + 20 * s, y - 50 * s], 1.4); }
  function lamp(c, x, y) { glow(c, x, y - 96, 70, 0.45); box(c, x - 7, y - 10, 14, 10, C.dark, 2); box(c, x - 3, y - 84, 6, 74, C.dark, 2); box(c, x - 9, y - 90, 18, 6, C.dark, 2); poly(c, [x - 10, y - 90, x - 13, y - 108, x + 13, y - 108, x + 10, y - 90], C.lit, 2); poly(c, [x - 15, y - 108, x, y - 118, x + 15, y - 108], C.dark, 2); }
  function vine(c, x, y, h, r) { let px = x, py = y; c.beginPath(); c.moveTo(px, py); while (py < y + h) { px = x + (r() - 0.5) * 12; py += 12; c.lineTo(px, py); } c.lineWidth = 2.2; c.strokeStyle = C.sage2; c.stroke(); for (let yy = y + 6; yy < y + h; yy += 11) { c.beginPath(); c.ellipse(x + (r() - 0.5) * 16, yy, 5, 3.2, r() * 3, 0, 7); c.fillStyle = r() > 0.5 ? C.sage : C.sage2; c.fill(); c.lineWidth = 1.2; c.strokeStyle = O; c.stroke(); } }
  function cornice(c, x, y, w, col) { box(c, x - 6, y - 8, w + 12, 9, col || C.stone, 2.2); box(c, x - 3, y + 1, w + 6, 5, col || C.stone2, 1.8); }
  // rooftop clutter
  function tank(c, x, y) { line(c, [x - 12, y, x - 12, y - 14], 2.2); line(c, [x + 12, y, x + 12, y - 14], 2.2); box(c, x - 17, y - 44, 34, 30, '#8a6a52', 2.2); line(c, [x - 17, y - 34, x + 17, y - 34], 1.4); line(c, [x - 17, y - 24, x + 17, y - 24], 1.4); poly(c, [x - 20, y - 44, x, y - 58, x + 20, y - 44], C.dark, 2.2); }
  function dish(c, x, y) { box(c, x - 4, y - 16, 8, 16, C.dark, 2); c.save(); c.translate(x, y - 22); c.rotate(-0.5); c.beginPath(); c.ellipse(0, 0, 22, 9, 0, 0, 7); c.fillStyle = C.stone; c.fill(); c.lineWidth = 2.2; c.strokeStyle = O; c.stroke(); line(c, [0, 0, 0, -18], 1.8); disc(c, 0, -18, 2.6, C.red, 1.2); c.restore(); }
  function flag(c, x, y, col) { line(c, [x, y, x, y - 46], 2.4); poly(c, [x, y - 46, x + 26, y - 42, x + 18, y - 36, x + 26, y - 30, x, y - 28], col, 2); }
  function vent(c, x, y) { box(c, x - 14, y - 16, 28, 16, C.stone2, 2); line(c, [x - 9, y - 11, x + 9, y - 11], 1.4); line(c, [x - 9, y - 6, x + 9, y - 6], 1.4); }
  function chimney(c, x, y, r) { box(c, x - 8, y - 30, 16, 30, C.brick2, 2); box(c, x - 11, y - 36, 22, 7, C.stone, 2); for (let i = 0; i < 3; i++) disc(c, x + 6 + i * 9, y - 46 - i * 13, 6 + i * 3, 'rgba(246,241,230,0.75)', 1.4); void r; }

  // ---- buildings: each one draws itself on the ground line g -------------------------
  const BUILD = {
    teashop(c, x, g, w, r) {
      const h = 330;
      box(c, x, g - h, w, h, C.brick); bricks(c, x, g - h, w, h - 110, C.brick2, r, 70); shade(c, x + w - 16, g - h, 16, h);
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
      box(c, dx - 26, dy - 92, 52, 92, '#8fe06a', 2.2); c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(dx - 20, dy - 86, 8, 78); for (const [bx, by, br] of [[-8, -20, 5], [10, -44, 7], [-4, -66, 4], [14, -74, 3]]) disc(c, dx + bx, dy + by, br, 'rgba(240,255,220,0.8)', 1.2);
      box(c, dx - 32, dy - 100, 64, 10, C.dark, 2); box(c, dx - 32, dy - 6, 64, 8, C.dark, 2);
      line(c, [dx - 60, dy, dx - 60, dy - 50, dx - 32, dy - 50], 5); line(c, [dx - 60, dy, dx - 60, dy - 50, dx - 32, dy - 50], 2.4, C.stone); line(c, [dx + 60, dy, dx + 60, dy - 70, dx + 32, dy - 70], 5); line(c, [dx + 60, dy, dx + 60, dy - 70, dx + 32, dy - 70], 2.4, C.stone);
      c.beginPath(); c.arc(dx, dy, w * 0.36, Math.PI, 0); c.lineWidth = 2.6; c.strokeStyle = O; c.stroke(); for (const a of [0.6, 1.1, 1.57, 2.04, 2.54]) line(c, [dx, dy, dx - Math.cos(a) * w * 0.36, dy - Math.sin(a) * w * 0.36], 1.2, 'rgba(43,48,68,0.45)');
      line(c, [dx - w * 0.25, dy - w * 0.26, dx - w * 0.18, dy - w * 0.31], 2.2, C.white);
      box(c, x, g - h, w, h, C.slate); shade(c, x + w - 16, g - h, 16, h); cornice(c, x, g - h, w, C.stone);
      box(c, x + 14, g - h + 18, w - 28, 44, C.dark, 2); icon(c, 'flask', x + 44, g - h + 40, 15); for (let i = 0; i < 5; i++) disc(c, x + 80 + i * 22, g - h + 40, 5, i % 2 ? '#9be06a' : C.lit, 1.4);
      win(c, x + 20, g - 128, 70, 76, { lit: true, inside: 'shelf', frame: C.stone }); win(c, x + w - 90, g - 128, 70, 76, { lit: true, inside: 'person', frame: C.stone });
      door(c, x + w / 2 - 24, g - 96, 48, 96, '#8fe06a', true); glow(c, x + w / 2, g - 60, 70, 0.3);
      line(c, [x + 6, g - h + 70, x + 6, g - 8], 6); line(c, [x + 6, g - h + 70, x + 6, g - 8], 3, C.stone); for (let y = g - h + 90; y < g - 10; y += 42) box(c, x + 1, y, 10, 5, C.dark, 1.4);
    },
    museum(c, x, g, w, r) {
      const h = 250, p = 64;
      box(c, x + 10, g - h, w - 20, h, C.sand); shade(c, x + w - 30, g - h, 20, h);
      // lit hall with a great spiral fossil
      box(c, x + p, g - h + 40, w - p * 2, h - 60, C.lit, 2.4); c.fillStyle = C.lit2; c.fillRect(x + p, g - 70, w - p * 2, 50); glow(c, x + w / 2, g - h / 2, 150, 0.35);
      icon(c, 'spiral', x + w / 2, g - h * 0.52, 56); box(c, x + w / 2 - 50, g - 62, 100, 12, '#8a5a3a', 2); line(c, [x + w / 2 - 20, g - 62, x + w / 2 - 20, g - 20], 3); line(c, [x + w / 2 + 20, g - 62, x + w / 2 + 20, g - 20], 3);
      for (const bx of [x + p + 14, x + w - p - 46]) { box(c, bx, g - h + 52, 32, 96, C.red, 2); poly(c, [bx, g - h + 148, bx + 16, g - h + 136, bx + 32, g - h + 148], C.red, 2); icon(c, bx < x + w / 2 ? 'star' : 'moon', bx + 16, g - h + 92, 10); }
      // columns, steps and pediment
      for (const cx of [x + 18, x + p - 8, x + w - p - 20, x + w - 46]) { box(c, cx, g - h + 30, 28, h - 46, C.cream, 2.2); box(c, cx - 5, g - h + 22, 38, 10, C.cream, 2); box(c, cx - 5, g - 26, 38, 10, C.cream, 2); for (let i = 1; i < 3; i++) line(c, [cx + i * 9.3, g - h + 36, cx + i * 9.3, g - 30], 1.1, 'rgba(43,48,68,0.3)'); }
      box(c, x - 4, g - 16, w + 8, 16, C.stone, 2.4); box(c, x + 6, g - 26, w - 12, 10, C.stone, 2.2);
      box(c, x, g - h, w, 24, C.cream, 2.4); poly(c, [x - 12, g - h, x + w / 2, g - h - 86, x + w + 12, g - h], C.sand, 2.6); poly(c, [x + 26, g - h - 8, x + w / 2, g - h - 66, x + w - 26, g - h - 8], C.cream, 2); icon(c, 'planet', x + w / 2, g - h - 30, 20);
      for (let i = 0; i < 9; i++) box(c, x + 16 + i * (w - 40) / 8, g - h + 6, 8, 12, C.sand2, 1.2);
      flag(c, x + w / 2, g - h - 86, C.red);
    },
    tower(c, x, g, w, r) {
      const h = 430;
      box(c, x, g - h, w, h, C.slate); shade(c, x + w - 18, g - h, 18, h); cornice(c, x, g - h, w, C.stone2);
      poster(c, x + 22, g - h + 22, w - 44, 96, 'planet', '#3d4a73'); windows(c, x + 8, g - h + 140, w - 16, 150, 3, 2, r, { frame: C.stone });
      dish(c, x + w * 0.3, g - h - 8); box(c, x + w * 0.62, g - h - 34, 40, 26, C.stone2, 2.2); line(c, [x + w * 0.62 + 20, g - h - 34, x + w * 0.62 + 20, g - h - 70], 2); disc(c, x + w * 0.62 + 20, g - h - 72, 3, C.red, 1.2);
      box(c, x + 8, g - 112, w - 16, 112, C.sand); awning(c, x + 4, g - 128, w - 8, 26, C.blue, C.white);
      win(c, x + 18, g - 88, w - 96, 66, { lit: true, inside: 'shelf', cross: false, sill: C.sand2 }); door(c, x + w - 62, g - 86, 40, 86, C.brick, true); sign(c, x + w / 2 - 22, g - 176, 44, 36, 'book');
    },
    potions(c, x, g, w, r) {
      const h = 280;
      box(c, x, g - h, w, h, C.cream); bricks(c, x, g - h, w, 120, C.sand, r, 30); shade(c, x + w - 16, g - h, 16, h); cornice(c, x, g - h, w, C.teal);
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
      box(c, x, g - h, w, h, C.stone); shade(c, x + w - 16, g - h, 16, h); bricks(c, x, g - h, w, h, C.stone2, r, 50); cornice(c, x, g - h, w, C.stone);
      for (let i = 0; i < 3; i++) { const ax = x + 30 + i * (w - 60) / 3 + 10, aw = (w - 60) / 3 - 20; c.beginPath(); c.moveTo(ax, g - 70); c.lineTo(ax, g - 150); c.arc(ax + aw / 2, g - 150, aw / 2, Math.PI, 0); c.lineTo(ax + aw, g - 70); c.closePath(); c.fillStyle = i === 1 ? C.lit : '#3d4a73'; c.fill(); c.lineWidth = 2.2; c.strokeStyle = O; c.stroke(); if (i !== 1) icon(c, 'star', ax + aw / 2, g - 130, 9); else icon(c, 'moon', ax + aw / 2, g - 126, 14); }
      door(c, dx - 26, g - 62, 52, 62, C.plum); box(c, x + 14, g - h + 16, w - 28, 26, C.dark, 2); for (let i = 0; i < 7; i++) icon(c, 'star', x + 34 + i * (w - 68) / 6, g - h + 29, 6);
    },
    workshop(c, x, g, w, r) {
      const h = 250;
      box(c, x, g - h, w, h, '#c98a5a'); shade(c, x + w - 18, g - h, 18, h); bricks(c, x, g - h, w, 110, '#b3764a', r, 40); cornice(c, x, g - h, w, C.dark);
      c.save(); c.translate(x + w / 2, g - h - 34); ICON.gear(c, 40); c.restore(); box(c, x + w / 2 - 60, g - h - 6, 120, 8, C.dark, 2);
      windows(c, x + 10, g - h + 16, w - 20, 80, 4, 1, r, { frame: C.dark }); awning(c, x + 4, g - 148, w - 8, 26, C.red, C.gold);
      // roller door, half open, with a robot's legs showing
      box(c, x + 18, g - 116, w * 0.52, 116, C.lit, 2.4); c.fillStyle = C.lit2; c.fillRect(x + 18, g - 40, w * 0.52, 40); for (let y = g - 116; y < g - 58; y += 9) box(c, x + 18, y, w * 0.52, 9, C.stone2, 1.4);
      box(c, x + 50, g - 52, 36, 34, C.stone, 2); box(c, x + 54, g - 18, 10, 18, C.dark, 1.8); box(c, x + 72, g - 18, 10, 18, C.dark, 1.8); disc(c, x + 62, g - 38, 3, C.red, 1.2); disc(c, x + 76, g - 38, 3, C.red, 1.2);
      win(c, x + w * 0.62, g - 100, w * 0.22, 54, { lit: true, inside: 'shelf', frame: C.dark }); door(c, x + w - 54, g - 84, 38, 84, C.dark, true); hangSign(c, x - 6, g - 190, 'gear');
      tank(c, x + w - 46, g - h - 8);
    },
  };
  const ROW = [['teashop', 250], [null, 70], ['lab', 320], [null, 60], ['museum', 420], [null, 80], ['tower', 250], [null, 60], ['potions', 300], [null, 50], ['observatory', 330], [null, 70], ['workshop', 340], [null, 60], ['teashop', 250]];

  // the street front, baked once into a canvas in world coordinates
  function front(W, ground, scale) {
    const top = ground - 560, cv = document.createElement('canvas');
    cv.width = Math.ceil(W * scale); cv.height = Math.ceil(560 * scale);
    const c = cv.getContext('2d'); c.scale(scale, scale); c.translate(0, -top);
    const r = rng(2024);
    let x = -30;
    const gaps = [];
    for (const [kind, w] of ROW) { if (kind) BUILD[kind](c, x, ground, w, r); else gaps.push([x, w]); x += w; if (x > W + 40) break; }
    for (const [gx, gw] of gaps) { const k = r(); tree(c, gx + gw / 2, ground, 1 + r() * 0.3, C.sage, C.sage2); if (k < 0.6) lamp(c, gx + gw * 0.2, ground); else { box(c, gx + gw * 0.62, ground - 26, 30, 6, '#8a5a3a', 2); box(c, gx + gw * 0.62 + 2, ground - 20, 4, 20, C.dark, 1.6); box(c, gx + gw * 0.62 + 24, ground - 20, 4, 20, C.dark, 1.6); box(c, gx + gw * 0.62, ground - 42, 30, 6, '#8a5a3a', 2); } }
    return { cv, top, h: 560 };
  }

  // pale skyline, no outlines
  function far(c, w, horizon) {
    const r = rng(77);
    for (const [col, k, base] of [['#c3cee4', 1, 0], ['#aebcd9', 0.8, 30]]) for (let x = -20; x < w; x += 46 + r() * 40) { const bw = 40 + r() * 60, bh = (120 + r() * 240) * k; c.fillStyle = col; c.fillRect(x, horizon - bh + base, bw, bh); if (r() < 0.4) { c.beginPath(); c.moveTo(x + bw * 0.3, horizon - bh + base); c.lineTo(x + bw * 0.5, horizon - bh + base - 50 - r() * 60); c.lineTo(x + bw * 0.7, horizon - bh + base); c.fill(); } if (r() < 0.3) c.fillRect(x + bw / 2 - 1.5, horizon - bh + base - 40, 3, 40); }
  }
  // mid plane: quieter buildings with window grids, a viaduct with a monorail, an airship
  function mid(c, w, horizon) {
    const r = rng(404), LO = '#4b5677';
    for (let x = -30; x < w; x += 90 + r() * 70) {
      const bw = 80 + r() * 70, bh = 190 + r() * 190, col = ['#7c8db4', '#8a7fa6', '#6d86a8', '#9a8f88'][Math.floor(r() * 4)];
      c.fillStyle = col; c.fillRect(x, horizon - bh, bw, bh); c.fillStyle = 'rgba(28,32,58,0.18)'; c.fillRect(x + bw - 12, horizon - bh, 12, bh);
      c.lineWidth = 1.8; c.strokeStyle = LO; c.strokeRect(x, horizon - bh, bw, bh);
      for (let wy = horizon - bh + 14; wy < horizon - 30; wy += 24) for (let wx = x + 10; wx < x + bw - 22; wx += 20) { c.fillStyle = r() < 0.3 ? '#f6d58a' : '#b9c6e0'; c.fillRect(wx, wy, 11, 14); c.lineWidth = 1; c.strokeRect(wx, wy, 11, 14); }
      if (r() < 0.35) { c.fillStyle = col; c.fillRect(x + bw * 0.3, horizon - bh - 22, bw * 0.3, 22); c.strokeRect(x + bw * 0.3, horizon - bh - 22, bw * 0.3, 22); }
    }
    const vy = horizon - 150;
    c.fillStyle = '#9aa6c4'; c.strokeStyle = LO; c.lineWidth = 2;
    for (let x = -60; x < w; x += 150) { c.beginPath(); c.moveTo(x, horizon); c.lineTo(x, vy + 24); c.lineTo(x + 26, vy + 24); c.lineTo(x + 26, horizon - 40); c.arc(x + 88, horizon - 40, 62, Math.PI, 0); c.lineTo(x + 150, vy + 24); c.lineTo(x + 176, vy + 24); c.lineTo(x + 176, horizon); c.closePath(); c.fill(); c.stroke(); }
    c.fillRect(-60, vy, w + 120, 26); c.strokeRect(-60, vy, w + 120, 26);
    for (let i = 0; i < 3; i++) { const tx = w * 0.3 + i * 132; c.fillStyle = '#efe6d2'; c.beginPath(); c.roundRect(tx, vy - 34, 126, 32, i === 2 ? [6, 18, 4, 6] : 6); c.fill(); c.stroke(); c.fillStyle = '#c9574a'; c.fillRect(tx + 2, vy - 12, 122, 5); for (let k = 0; k < 5; k++) { c.fillStyle = '#7f97bd'; c.fillRect(tx + 10 + k * 22, vy - 28, 15, 12); c.lineWidth = 1; c.strokeRect(tx + 10 + k * 22, vy - 28, 15, 12); c.lineWidth = 2; } }
    for (let x = 30; x < w; x += 210 + r() * 160) { const s = 1.2 + r() * 0.8; for (const [dx, dy, rr] of [[-20, -30, 26], [20, -34, 26], [0, -56, 30]]) { c.beginPath(); c.arc(x + dx * s, horizon + dy * s, rr * s, 0, 7); c.fillStyle = '#7d9a7a'; c.fill(); c.lineWidth = 1.8; c.strokeStyle = LO; c.stroke(); } }
    // a sky-barge
    const ax = w * 0.62, ay = horizon - 430;
    c.beginPath(); c.ellipse(ax, ay, 70, 26, 0, 0, 7); c.fillStyle = '#e0a94a'; c.fill(); c.lineWidth = 2; c.strokeStyle = LO; c.stroke();
    for (const dx of [-30, 0, 30]) { c.beginPath(); c.moveTo(ax + dx, ay - 25); c.quadraticCurveTo(ax + dx + 8, ay, ax + dx, ay + 25); c.stroke(); }
    c.fillStyle = '#c9574a'; c.beginPath(); c.moveTo(ax - 62, ay - 8); c.lineTo(ax - 92, ay - 24); c.lineTo(ax - 86, ay + 2); c.lineTo(ax - 92, ay + 24); c.lineTo(ax - 62, ay + 8); c.fill(); c.stroke();
    c.fillStyle = '#efe6d2'; c.fillRect(ax - 24, ay + 28, 48, 14); c.strokeRect(ax - 24, ay + 28, 48, 14); c.beginPath(); c.moveTo(ax - 16, ay + 24); c.lineTo(ax - 16, ay + 28); c.moveTo(ax + 16, ay + 24); c.lineTo(ax + 16, ay + 28); c.stroke();
  }
  function sky(c, VW, VH) {
    const g = c.createLinearGradient(0, 0, 0, VH * 0.75); g.addColorStop(0, '#86a8d4'); g.addColorStop(1, '#dfe8f2'); c.fillStyle = g; c.fillRect(0, 0, VW, VH);
    c.fillStyle = '#fff4d8'; c.beginPath(); c.arc(VW * 0.78, 92, 30, 0, 7); c.fill();
    const puff = (x, y, s) => { c.fillStyle = '#f6f1e6'; c.strokeStyle = '#a9b7d2'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 60 * s, y); c.arc(x - 36 * s, y - 6 * s, 22 * s, Math.PI * 0.9, Math.PI * 1.6); c.arc(x - 4 * s, y - 22 * s, 30 * s, Math.PI * 1.1, Math.PI * 1.9); c.arc(x + 34 * s, y - 8 * s, 24 * s, Math.PI * 1.3, Math.PI * 0.1); c.lineTo(x + 60 * s, y); c.closePath(); c.fill(); c.stroke(); };
    puff(190, 120, 1); puff(520, 70, 0.7); puff(930, 180, 0.9);
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
    for (let x = Math.floor(x0 / 300) * 300 + 150; x < x1 + 40; x += 300) { glow(c, x, y + 52, 46, 0.45 + Math.sin(time * 2 + x) * 0.04); disc(c, x, y + 52, 9, C.lit, 2.2); box(c, x - 13, y + 38, 26, 5, '#5d6480', 1.8); }
    // kerb and paving
    box(c, x0 - 4, y + 14, x1 - x0 + 8, 14, '#a8a49b', 2.4);
    c.fillStyle = '#cfcabf'; c.fillRect(x0, y, x1 - x0, 15); for (let x = Math.floor(x0 / 58) * 58; x < x1; x += 58) line(c, [x, y + 1, x - 5, y + 14], 1.3, 'rgba(43,48,68,0.4)');
    line(c, [x0, y, x1, y], 3); line(c, [x0, y + 15, x1, y + 15], 2);
  }

  NN.town = { front, far, mid, sky, street, parts: { O, C, rng, box, shade, line, poly, disc, glow, icon, win, door, sign } };
})(window.NN);
