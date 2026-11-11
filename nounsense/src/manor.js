/* Manor: an interior scene built from the same architectural parts as the town.
 *
 * A hall with a tall arched window, a staircase that is real terrain, a library
 * gallery above and an arcade of display cases below. Railings are drawn on a
 * separate layer in front of the characters to give the room some depth.
 */
(function (NN) {
  'use strict';
  const { O, C, box, shade, line, poly, disc, glow: lampGlow, icon, rng } = NN.town.parts;
  // Candlelight is recorded as a real light and also painted onto whatever is behind it as a warm pool.
  // The light map only brightens; on teal paper that turns grey-green, so the amber has to be in the paint.
  let POOLS = [], COOL = [];                              // where warm light, and moonlight, reach the floor
  const glow = (c, x, y, r, a, col) => {
    lampGlow(c, x, y, r, a, col || '255,176,96');
    if (col) return;
    POOLS.push([x, r]);
    const rr = r * 1.9, g = c.createRadialGradient(x, y, 0, x, y, rr); g.addColorStop(0, `rgba(255,170,78,${Math.min(0.5, (a || 0.5) * 0.85)})`); g.addColorStop(0.45, `rgba(255,150,70,${Math.min(0.5, (a || 0.5) * 0.3)})`); g.addColorStop(1, 'rgba(255,150,70,0)');
    c.save(); c.globalCompositeOperation = 'screen'; c.fillStyle = g; c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    for (const [k, al] of [[1.25, 0.09], [0.78, 0.1], [0.42, 0.12]]) { c.beginPath(); c.ellipse(x, y + r * 0.1, r * k, r * k * 0.86, 0, 0, 7); c.fillStyle = `rgba(255,186,96,${al})`; c.fill(); }   // light as flat lit shapes with an edge, the way it is inked in a comic
    c.restore();
  };   // candlelight here is amber, so it reads as warm against the teal walls
  const M = { wall: '#3f5e62', wall2: '#324b50', pat: '#52787c', wood: '#6b4433', wood2: '#553426', woodL: '#8a5a3f', gold: '#d0a84e', gold2: '#a27c2c', red: '#a53d46', red2: '#84303b', night: '#2b3768', moon: '#e9edf7', stone: '#a8998c', stone2: '#8f8073', paper: '#efe2c4', iron: '#9aa0b0' };
  const CEIL = 40, GAL = 300;                           // ceiling line and gallery floor, in world y

  function flame(c, x, y, s, quiet) { if (!quiet) glow(c, x, y - 4 * s, 34 * s, 0.44); poly(c, [x - 3.2 * s, y, x, y - 11 * s, x + 3.2 * s, y], '#ffb347', 1.4); poly(c, [x - 1.4 * s, y, x, y - 6 * s, x + 1.4 * s, y], '#fff1b0', 0); }
  function candle(c, x, y, h, quiet) { box(c, x - 2.6, y - h, 5.2, h, M.paper, 1.4); flame(c, x, y - h, 1, quiet); }
  function candelabra(c, x, g) {
    box(c, x - 14, g - 8, 28, 8, M.gold2, 2); line(c, [x, g - 8, x, g - 104], 4.6); line(c, [x, g - 8, x, g - 104], 2.4, M.gold);
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(x, g - 78); c.quadraticCurveTo(x + s * 22, g - 70, x + s * 22, g - 98); c.lineWidth = 4.4; c.strokeStyle = O; c.stroke(); c.lineWidth = 2.2; c.strokeStyle = M.gold; c.stroke(); box(c, x + s * 22 - 6, g - 102, 12, 5, M.gold2, 1.6); candle(c, x + s * 22, g - 102, 16); }
    box(c, x - 6, g - 110, 12, 5, M.gold2, 1.6); candle(c, x, g - 110, 18); disc(c, x, g - 54, 5, M.gold, 1.6);
  }
  function sconce(c, x, y) { box(c, x - 9, y, 18, 6, M.gold2, 1.8); poly(c, [x - 5, y + 6, x, y + 16, x + 5, y + 6], M.gold, 1.6); candle(c, x, y, 14); }
  function frame(c, x, y, w, h) { box(c, x - 9, y - 9, w + 18, h + 18, M.gold, 2.6); box(c, x - 4, y - 4, w + 8, h + 8, M.gold2, 1.6); for (const [fx, fy] of [[x - 9, y - 9], [x + w + 9, y - 9], [x - 9, y + h + 9], [x + w + 9, y + h + 9]]) disc(c, fx, fy, 4.5, M.gold, 1.8); }
  function portrait(c, x, y, w, h, kind) {
    frame(c, x, y, w, h); box(c, x, y, w, h, kind === 'castle' ? '#4a3f7a' : '#3f5a5e', 2);
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    if (kind === 'castle') {
      disc(c, x + w * 0.74, y + h * 0.3, h * 0.16, M.moon, 0); c.fillStyle = '#2d2752'; c.beginPath(); c.ellipse(x + w * 0.5, y + h * 1.1, w * 0.8, h * 0.42, 0, 0, 7); c.fill();
      c.fillStyle = '#1f1b3d'; c.fillRect(x + w * 0.3, y + h * 0.42, w * 0.3, h * 0.4); for (const tx of [0.28, 0.42, 0.56]) { c.fillRect(x + w * tx, y + h * (tx === 0.42 ? 0.24 : 0.34), w * 0.08, h * 0.5); c.beginPath(); c.moveTo(x + w * (tx - 0.02), y + h * (tx === 0.42 ? 0.24 : 0.34)); c.lineTo(x + w * (tx + 0.04), y + h * (tx === 0.42 ? 0.1 : 0.22)); c.lineTo(x + w * (tx + 0.1), y + h * (tx === 0.42 ? 0.24 : 0.34)); c.fill(); }
      c.fillStyle = '#ffdc94'; c.fillRect(x + w * 0.44, y + h * 0.36, 3, 5); c.fillRect(x + w * 0.36, y + h * 0.56, 3, 5);
    } else {
      const cx = x + w / 2, cy = y + h * 0.42, hr = w * 0.2, lady = kind === 'lady';
      const bg = c.createRadialGradient(cx, cy, 4, cx, cy, h * 0.7); bg.addColorStop(0, lady ? '#6f8c7a' : '#5a7480'); bg.addColorStop(1, lady ? '#2f4a44' : '#27383f'); c.fillStyle = bg; c.fillRect(x, y, w, h);   // a painted ground, lighter behind the sitter
      c.beginPath(); c.moveTo(cx - w * 0.46, y + h + 4); c.quadraticCurveTo(cx - w * 0.42, cy + h * 0.24, cx - w * 0.14, cy + h * 0.2); c.lineTo(cx + w * 0.14, cy + h * 0.2); c.quadraticCurveTo(cx + w * 0.42, cy + h * 0.24, cx + w * 0.46, y + h + 4); c.closePath(); c.fillStyle = lady ? M.red : '#2f3349'; c.fill(); c.lineWidth = 1.8; c.strokeStyle = O; c.stroke();   // shoulders
      if (lady) { poly(c, [cx - w * 0.12, cy + h * 0.2, cx, cy + h * 0.34, cx + w * 0.12, cy + h * 0.2], '#f2c9a0', 1.4); c.beginPath(); c.arc(cx, cy + h * 0.22, w * 0.13, 0.15, Math.PI - 0.15); c.lineWidth = 2; c.strokeStyle = M.gold; c.stroke(); disc(c, cx, cy + h * 0.22 + w * 0.13, 2.4, '#9fe8f2', 1); }
      else { poly(c, [cx - w * 0.1, cy + h * 0.2, cx, cy + h * 0.36, cx + w * 0.1, cy + h * 0.2], '#efe6d2', 1.4); poly(c, [cx - 5, cy + h * 0.24, cx + 5, cy + h * 0.24, cx + 3, cy + h * 0.31, cx - 3, cy + h * 0.31], M.red, 1.2); for (const sd of [-1, 1]) line(c, [cx + sd * w * 0.14, cy + h * 0.2, cx + sd * w * 0.05, cy + h * 0.42], 1.4); }
      c.fillStyle = '#e2b58c'; c.fillRect(cx - hr * 0.3, cy + hr * 0.6, hr * 0.6, hr * 0.7);                                                              // neck
      if (lady) { disc(c, cx, cy - hr * 1.15, hr * 0.62, '#6f4b33', 1.8); c.beginPath(); c.ellipse(cx, cy - hr * 0.1, hr * 1.16, hr * 1.2, 0, 0, 7); c.fillStyle = '#6f4b33'; c.fill(); c.lineWidth = 1.8; c.strokeStyle = O; c.stroke(); }
      c.beginPath(); c.ellipse(cx, cy, hr, hr * 1.08, 0, 0, 7); c.fillStyle = '#f2c9a0'; c.fill(); c.lineWidth = 1.8; c.strokeStyle = O; c.stroke();        // a round head, like everyone else in this world
      c.fillStyle = 'rgba(160,90,70,0.25)'; c.beginPath(); c.ellipse(cx + hr * 0.45, cy + hr * 0.1, hr * 0.5, hr * 0.95, 0, -1.2, 1.2); c.fill();             // the shaded cheek
      disc(c, cx - hr * 0.42, cy - hr * 0.05, 1.9, O, 0); disc(c, cx + hr * 0.42, cy - hr * 0.05, 1.9, O, 0); disc(c, cx - hr * 0.62, cy + hr * 0.3, 2.6, 'rgba(230,120,110,0.5)', 0); disc(c, cx + hr * 0.62, cy + hr * 0.3, 2.6, 'rgba(230,120,110,0.5)', 0);
      if (lady) { c.beginPath(); c.arc(cx, cy - hr * 0.2, hr * 1.02, Math.PI * 1.08, Math.PI * 1.92); c.lineWidth = hr * 0.5; c.strokeStyle = '#6f4b33'; c.stroke(); line(c, [cx - 4, cy + hr * 0.45, cx, cy + hr * 0.56, cx + 4, cy + hr * 0.45], 1.3); }
      else { c.beginPath(); c.ellipse(cx, cy - hr * 0.86, hr * 1.5, hr * 0.2, 0, 0, 7); c.fillStyle = '#23232b'; c.fill(); c.lineWidth = 1.6; c.strokeStyle = O; c.stroke(); box(c, cx - hr * 0.86, cy - hr * 2.3, hr * 1.72, hr * 1.46, '#23232b', 1.8); box(c, cx - hr * 0.86, cy - hr * 1.2, hr * 1.72, hr * 0.26, M.red2, 1); line(c, [cx - hr * 0.56, cy + hr * 0.42, cx - hr * 0.12, cy + hr * 0.32, cx, cy + hr * 0.42, cx + hr * 0.12, cy + hr * 0.32, cx + hr * 0.56, cy + hr * 0.42], 2.4); }
    }
    c.restore();
  }
  function cobweb(c, x, y, sx, sy, s) { for (let i = 0; i <= 4; i++) { const a = i / 4 * Math.PI / 2; line(c, [x, y, x + Math.cos(a) * s * sx, y + Math.sin(a) * s * sy], 1, 'rgba(240,235,250,0.45)'); } for (const k of [0.35, 0.62, 0.9]) { c.beginPath(); for (let i = 0; i <= 4; i++) { const a = i / 4 * Math.PI / 2, px = x + Math.cos(a) * s * k * sx, py = y + Math.sin(a) * s * k * sy; if (i) c.lineTo(px, py); else c.moveTo(px, py); } c.lineWidth = 1; c.strokeStyle = 'rgba(240,235,250,0.45)'; c.stroke(); } }
  function bookcase(c, x, y, w, h, seed) {
    box(c, x, y, w, h, M.wood, 2.6); box(c, x + 8, y + 8, w - 16, h - 16, '#3a2530', 2); box(c, x - 6, y - 10, w + 12, 12, M.woodL, 2.2);
    const rows = Math.floor((h - 16) / 44); let s = seed;
    const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let j = 0; j < rows; j++) {
      const sy = y + 8 + (j + 1) * (h - 16) / rows;
      for (let bx = x + 12; bx < x + w - 16;) {
        const bw = 6 + r() * 6, bh = 22 + r() * 14, k = r();
        if (k < 0.08) { bx += 14; continue; }
        if (k > 0.93) { disc(c, bx + 9, sy - 9, 8, k > 0.965 ? M.gold : '#8fb8c8', 1.6); bx += 22; continue; }
        box(c, bx, sy - bh, bw, bh, [M.red, '#3f6a8a', '#4f7f4b', C.plum, M.gold2, '#7a4a3a', M.paper][Math.floor(r() * 7)], 1.4); line(c, [bx + 1.5, sy - bh + 5, bx + bw - 1.5, sy - bh + 5], 1, 'rgba(255,240,200,0.6)');
        bx += bw + 0.6;
      }
      box(c, x + 8, sy - 1, w - 16, 5, M.woodL, 1.8);
    }
  }
  function column(c, x, y0, y1, w) { box(c, x - w / 2, y0 + 12, w, y1 - y0 - 24, M.stone, 2.4); shade(c, x + w / 2 - 6, y0 + 12, 6, y1 - y0 - 24, 0.2); box(c, x - w / 2 - 6, y0, w + 12, 13, M.stone, 2.2); box(c, x - w / 2 - 6, y1 - 13, w + 12, 13, M.stone, 2.2); line(c, [x - 4, y0 + 18, x - 4, y1 - 18], 1.1, 'rgba(43,48,68,0.3)'); line(c, [x + 4, y0 + 18, x + 4, y1 - 18], 1.1, 'rgba(43,48,68,0.3)'); }
  function chandelier(c, x, drop) {
    line(c, [x, CEIL + 10, x, CEIL + drop], 3.4); line(c, [x, CEIL + 10, x, CEIL + drop], 1.4, M.gold);
    c.beginPath(); c.ellipse(x, CEIL + drop + 10, 46, 9, 0, 0, 7); c.lineWidth = 5; c.strokeStyle = O; c.stroke(); c.lineWidth = 2.6; c.strokeStyle = M.gold; c.stroke();
    for (const dx of [-46, -24, 0, 24, 46]) candle(c, x + dx, CEIL + drop + 6 - (dx ? 0 : 4), 13, true); glow(c, x, CEIL + drop - 10, 50, 0.4);   // one soft light for the whole ring: five stacked ones burned out to white
    disc(c, x, CEIL + drop + 24, 5, M.gold, 1.8);
  }

  function build(L, scale) { POOLS = []; COOL = []; const r = NN.town.parts.capture(() => paint(L, scale)); r.out.lights = r.lights; return r.out; }
  function paint(L, scale) {
    const g = L.start.y, top = -10, H = g - top + 6, W = L.W;
    const mk = () => { const cv = document.createElement('canvas'); cv.width = Math.ceil(W * scale); cv.height = Math.ceil(H * scale); const c = cv.getContext('2d'); c.scale(scale, scale); c.translate(0, -top); return { cv, c }; };
    const a = mk(), c = a.c;
    // walls: patterned paper above, panelled wood below, a moulding at the ceiling
    c.fillStyle = M.wall; c.fillRect(0, top, W, H);
    for (let x = 30; x < W; x += 60) { c.fillStyle = 'rgba(255,255,255,0.04)'; c.fillRect(x - 9, CEIL, 18, g - 120 - CEIL); }                        // striped paper
    for (let y = CEIL + 34, row = 0; y < g - 120; y += 34, row++) for (let x = (row % 2) * 30; x < W; x += 60) poly(c, [x, y - 7, x + 6, y, x, y + 7, x - 6, y], M.pat, 0);
    { const wg = c.createLinearGradient(0, CEIL, 0, g - 120); wg.addColorStop(0, 'rgba(8,14,28,0.5)'); wg.addColorStop(0.5, 'rgba(8,14,28,0.1)'); wg.addColorStop(1, 'rgba(8,14,28,0.24)'); c.fillStyle = wg; c.fillRect(0, CEIL, W, g - 120 - CEIL); }   // gloom gathering under the ceiling
    box(c, -10, top, W + 20, CEIL - top, '#4a3040', 2.6); for (let x = 20; x < W; x += 96) { box(c, x + 16, top + 8, 64, CEIL - top - 18, '#3c2634', 1.6); box(c, x, top, 14, CEIL - top - 4, M.wood, 2); disc(c, x + 7, CEIL - 14, 2.6, M.gold, 1); }   // a coffered ceiling with beams
    box(c, -10, CEIL - 4, W + 20, 16, M.wood, 2.4);
    { const br = rng(4711);                                 // the ceiling is lived in: cobwebs in the coffers and bats asleep on the beams
      for (let x = 20; x < W; x += 96) { if (br() < 0.45) cobweb(c, x + 16, top + 8, 1, 1, 22 + br() * 14); if (br() < 0.3) cobweb(c, x + 80, top + 8, -1, 1, 20 + br() * 12);
        if (br() < 0.34) { const bx = x + 34 + br() * 30, by = CEIL - 12; line(c, [bx, by - 6, bx, by], 1.6); poly(c, [bx - 7, by, bx + 7, by, bx + 5, by + 16, bx, by + 22, bx - 5, by + 16], '#2a2238', 1.6); poly(c, [bx - 4, by + 20, bx - 6, by + 27, bx - 1, by + 23], '#2a2238', 1.2); poly(c, [bx + 4, by + 20, bx + 6, by + 27, bx + 1, by + 23], '#2a2238', 1.2); } } }
    for (let ax = 200; ax < W; ax += 400) glow(c, ax + 24, g + 80, 60, 0.45); line(c, [0, CEIL + 16, W, CEIL + 16], 2, M.gold2);
    box(c, -10, g - 112, W + 20, 112, M.wood, 2.6); box(c, -10, g - 120, W + 20, 10, M.woodL, 2.2); line(c, [0, g - 121, W, g - 121], 1.6, M.gold);
    for (let x = 14; x < W; x += 78) { c.lineWidth = 1.8; c.strokeStyle = M.wood2; c.strokeRect(x, g - 98, 62, 74); c.strokeStyle = 'rgba(255,220,170,0.14)'; c.strokeRect(x + 3, g - 95, 56, 68); }
    box(c, -10, g - 16, W + 20, 16, M.wood2, 2.2);

    // tall arched window with the moon, curtains pulled back
    const moonWindow = (x, w, y0, y1, drapes) => { const cx = x + w / 2;
      c.beginPath(); c.moveTo(x, y1); c.lineTo(x, y0 + w / 2); c.arc(cx, y0 + w / 2, w / 2, Math.PI, 0); c.lineTo(x + w, y1); c.closePath(); c.fillStyle = M.night; c.fill();
      c.save(); c.clip(); glow(c, cx + 30, y0 + 120, 190, 0.42, '170,195,255'); disc(c, cx + 30, y0 + 86, 38, M.moon, 0); disc(c, cx + 18, y0 + 78, 7, '#cfd6e8', 0); disc(c, cx + 44, y0 + 98, 5, '#cfd6e8', 0);
      c.fillStyle = '#1d2548'; c.beginPath(); c.ellipse(cx, y1 + 30, w * 0.8, 70, 0, 0, 7); c.fill();
      for (const [bx, lean] of [[x + 44, -1], [x + w - 40, 1]]) { line(c, [bx, y1, bx + lean * 6, y1 - 110], 6, '#161c3a'); for (const [ty, tl] of [[-60, 40], [-84, 30], [-104, 22]]) { line(c, [bx + lean * 3, y1 + ty, bx + lean * 3 - tl, y1 + ty - 26], 3, '#161c3a'); line(c, [bx + lean * 3, y1 + ty + 10, bx + lean * 3 + tl * 0.8, y1 + ty - 18], 3, '#161c3a'); } }
      for (const [bx, by] of [[cx - 50, y0 + 60], [cx - 30, y0 + 70], [cx + 76, y0 + 150]]) poly(c, [bx - 8, by, bx - 3, by - 3, bx, by, bx + 3, by - 3, bx + 8, by, bx, by + 2], '#161c3a', 0);
      c.restore();
      for (const mx of [x + w / 3, x + w * 2 / 3]) line(c, [mx, y0 + 16, mx, y1], 5, M.wood2); for (const my of [y0 + w / 2, y0 + w / 2 + 96, y0 + w / 2 + 180]) line(c, [x, my, x + w, my], 5, M.wood2);
      c.beginPath(); c.moveTo(x, y1); c.lineTo(x, y0 + w / 2); c.arc(cx, y0 + w / 2, w / 2, Math.PI, 0); c.lineTo(x + w, y1); c.lineWidth = 13; c.strokeStyle = O; c.stroke(); c.lineWidth = 8; c.strokeStyle = M.woodL; c.stroke();
      box(c, x - 18, y1 - 2, w + 36, 12, M.woodL, 2.4);
      if (drapes) for (const s of [-1, 1]) { const ex = s < 0 ? x - 34 : x + w + 34; poly(c, [ex, y0 - 40, ex - s * 96, y0 - 40, ex - s * 70, y0 + 120, ex - s * 20, y0 + 210, ex - s * 34, y1 + 6, ex + s * 4, y1 + 6], M.red, 2.6); for (const k of [0.25, 0.5, 0.75]) line(c, [ex - s * 96 * k, y0 - 36, ex - s * (20 + 30 * k), y0 + 200, ex - s * 30 * k, y1], 1.5, M.red2); box(c, ex - s * 34 - 10, y0 + 204, 20, 9, M.gold, 1.8); }
      if (drapes) { line(c, [x - 60, y0 - 44, x + w + 60, y0 - 44], 7); line(c, [x - 60, y0 - 44, x + w + 60, y0 - 44], 3.4, M.gold); disc(c, x - 62, y0 - 44, 7, M.gold, 2); disc(c, x + w + 62, y0 - 44, 7, M.gold, 2); }
      if (drapes) for (let i = 0; i < 8; i++) { c.beginPath(); c.arc(x - 34 + (w + 68) * (i + 0.5) / 8, y0 - 38, (w + 68) / 16, 0, Math.PI); c.fillStyle = M.red2; c.fill(); c.lineWidth = 2; c.strokeStyle = O; c.stroke(); }
      if (!drapes) {                                         // moonlight falls through it across the wall, and lands on the floor
        c.save(); c.globalCompositeOperation = 'screen'; poly(c, [x + 8, y0 + w / 2, x + w - 8, y0 + w / 2, x + w + 190, g, x + 110, g], 'rgba(150,185,255,0.13)', 0); poly(c, [x + 30, y0 + w / 2, x + w - 30, y0 + w / 2, x + w + 150, g, x + 150, g], 'rgba(170,200,255,0.1)', 0); c.restore();
        COOL.push([x + 110, x + w + 190]);
      }
    };
    moonWindow(70, 220, 140, g - 126, true);
    moonWindow(862, 126, 112, g - 150, false);
    // a suit of armour on a plinth
    { const x = 420; box(c, x - 34, g - 26, 68, 26, M.stone, 2.4); box(c, x - 28, g - 34, 56, 9, M.stone2, 2);
      line(c, [x + 34, g - 30, x + 34, g - 190], 4.4); line(c, [x + 34, g - 30, x + 34, g - 190], 2, M.woodL); poly(c, [x + 34, g - 178, x + 60, g - 190, x + 62, g - 160, x + 34, g - 150], M.iron, 2); poly(c, [x + 30, g - 190, x + 34, g - 212, x + 38, g - 190], M.iron, 1.8);
      box(c, x - 16, g - 84, 13, 50, M.iron, 2); box(c, x + 3, g - 84, 13, 50, M.iron, 2); box(c, x - 19, g - 40, 17, 8, '#7b8094', 1.8); box(c, x + 2, g - 40, 17, 8, '#7b8094', 1.8);
      poly(c, [x - 22, g - 136, x + 22, g - 136, x + 17, g - 82, x - 17, g - 82], M.iron, 2.4); line(c, [x, g - 134, x, g - 86], 1.4); disc(c, x - 25, g - 130, 9, '#7b8094', 2); disc(c, x + 25, g - 130, 9, '#7b8094', 2);
      line(c, [x - 27, g - 124, x - 30, g - 96], 6.4); line(c, [x - 27, g - 124, x - 30, g - 96], 4, M.iron); line(c, [x + 27, g - 124, x + 34, g - 104], 6.4); line(c, [x + 27, g - 124, x + 34, g - 104], 4, M.iron);
      c.beginPath(); c.roundRect(x - 15, g - 170, 30, 34, 8); c.fillStyle = M.iron; c.fill(); c.lineWidth = 2.4; c.strokeStyle = O; c.stroke(); box(c, x - 11, g - 158, 22, 5, '#2b3044', 1); line(c, [x, g - 152, x, g - 140], 1.3); poly(c, [x - 3, g - 170, x, g - 190, x + 9, g - 182, x + 3, g - 170], M.red, 1.8); }
    candelabra(c, 520, g); candelabra(c, 880, g);
    portrait(c, 590, 150, 96, 124, 'gent'); sconce(c, 560, 250); sconce(c, 718, 250);
    // a draped table with a glowing crystal ball
    { const x = 640; poly(c, [x - 52, g - 62, x + 52, g - 62, x + 60, g, x - 60, g], C.plum, 2.4); line(c, [x - 56, g - 30, x + 56, g - 30], 1.5, M.gold); for (let i = -2; i <= 2; i++) line(c, [x + i * 20, g - 60, x + i * 23, g - 2], 1.2, 'rgba(43,48,68,0.3)'); box(c, x - 56, g - 68, 112, 8, '#8a6a9a', 2);
      glow(c, x, g - 96, 70, 0.5, '205,160,255'); poly(c, [x - 16, g - 68, x - 9, g - 80, x + 9, g - 80, x + 16, g - 68], M.gold, 2); disc(c, x, g - 98, 22, '#b48be0', 2.4); disc(c, x - 7, g - 106, 6, 'rgba(255,255,255,0.7)', 0); c.beginPath(); c.arc(x, g - 98, 14, 0.3, 2.2); c.lineWidth = 1.6; c.strokeStyle = 'rgba(255,255,255,0.6)'; c.stroke(); }
    // grandfather clock
    { const x = 790, w = 54; box(c, x - w / 2 - 5, g - 30, w + 10, 30, M.wood2, 2.4); box(c, x - w / 2, g - 150, w, 122, M.woodL, 2.4); box(c, x - w / 2 + 9, g - 140, w - 18, 96, '#2c1e2a', 2); line(c, [x, g - 140, x, g - 72], 1.6, M.gold); disc(c, x, g - 66, 9, M.gold, 1.8);
      box(c, x - w / 2 - 5, g - 214, w + 10, 66, M.wood, 2.4); disc(c, x, g - 181, 24, M.paper, 2.2); for (let i = 0; i < 12; i++) { const an = i / 12 * Math.PI * 2; line(c, [x + Math.cos(an) * 19, g - 181 + Math.sin(an) * 19, x + Math.cos(an) * 22, g - 181 + Math.sin(an) * 22], 1.2); } line(c, [x, g - 181, x, g - 198], 2.2); line(c, [x, g - 181, x + 11, g - 175], 2.2); disc(c, x, g - 181, 2.2, O, 0);
      poly(c, [x - w / 2 - 9, g - 214, x - 16, g - 238, x, g - 228, x + 16, g - 238, x + w / 2 + 9, g - 214], M.wood2, 2.4); disc(c, x, g - 238, 5, M.gold, 1.8); }
    portrait(c, 1010, 96, 130, 84, 'castle'); portrait(c, 742, 132, 62, 76, 'lady');
    // the gallery above: a library
    box(c, 1250, CEIL + 16, 850, GAL - CEIL - 16, M.wall2, 0);
    bookcase(c, 1290, 86, 340, GAL - 86, 11); bookcase(c, 1690, 86, 300, GAL - 86, 29);
    line(c, [1560, GAL, 1610, 96], 5); line(c, [1560, GAL, 1610, 96], 2.4, M.woodL); line(c, [1590, GAL, 1640, 96], 5); line(c, [1590, GAL, 1640, 96], 2.4, M.woodL); for (let i = 1; i < 8; i++) line(c, [1560 + i * 6.2, GAL - i * 25.5, 1590 + i * 6.2, GAL - i * 25.5], 2.6, M.woodL);
    { const x = 2046, y = GAL - 78; box(c, x - 16, GAL - 10, 32, 10, M.gold2, 2); line(c, [x, GAL - 10, x, y + 30], 4); line(c, [x, GAL - 10, x, y + 30], 2, M.gold); glow(c, x, y, 60, 0.25);
      for (const [rx, ry, rot] of [[34, 34, 0], [34, 12, 0.5], [34, 12, -0.6], [12, 34, 0.2]]) { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, 7); c.lineWidth = 4.6; c.strokeStyle = O; c.stroke(); c.lineWidth = 2.2; c.strokeStyle = M.gold; c.stroke(); } disc(c, x, y, 7, '#8fb8c8', 1.8); }
    // the arcade below the gallery: columns, arches and what is kept behind them
    box(c, 1250, GAL + 22, 850, g - GAL - 22 - 112, M.wall2, 0);
    { const bg = c.createLinearGradient(0, GAL + 22, 0, GAL + 100); bg.addColorStop(0, 'rgba(6,10,24,0.6)'); bg.addColorStop(1, 'rgba(6,10,24,0)'); c.fillStyle = bg; c.fillRect(1250, GAL + 22, 850, 78); }   // the gallery's shadow on the wall beneath it
    const bays = [1250, 1465, 1680, 1895, 2100];
    const gal = L.gallery || [[1250, 2100]], gaps = []; for (let i = 0; i + 1 < gal.length; i++) gaps.push([gal[i][1], gal[i + 1][0]]);
    const inGap = (x) => gaps.some(([a, b]) => x > a && x < b);
    c.save(); c.beginPath(); c.rect(0, 0, W, 2000); for (const [a, b] of gaps) c.rect(a, 0, b - a, 2000); c.clip('evenodd');   // where the gallery has fallen in, the arches went with it
    for (let i = 0; i < 4; i++) { const x0 = bays[i] + 16, x1 = bays[i + 1] - 16, cx = (x0 + x1) / 2, r = (x1 - x0) / 2; c.beginPath(); c.moveTo(x0, GAL + 22); c.lineTo(x1, GAL + 22); c.lineTo(x1, GAL + 22 + r * 0.55); c.arc(cx, GAL + 22 + r * 0.55 + 0, r, 0, Math.PI, true); c.closePath(); c.fillStyle = M.wood; c.fill(); c.beginPath(); c.arc(cx, GAL + 22 + r * 0.55, r, Math.PI, 0); c.lineWidth = 6; c.strokeStyle = O; c.stroke(); c.lineWidth = 3; c.strokeStyle = M.gold2; c.stroke(); }
    c.restore();
    { const x = 1357; box(c, x - 46, g - 70, 92, 70, M.wood2, 2.4); box(c, x - 52, g - 78, 104, 10, M.woodL, 2.2); glow(c, x, g - 116, 80, 0.45, '150,225,255'); c.fillStyle = 'rgba(160,215,235,0.28)'; c.fillRect(x - 40, g - 150, 80, 72);
      poly(c, [x - 8, g - 82, x - 16, g - 110, x - 4, g - 140, x + 8, g - 112], '#a9e0f2', 2); poly(c, [x + 6, g - 82, x + 4, g - 104, x + 18, g - 124, x + 24, g - 98, x + 18, g - 82], '#7fc6e6', 2); poly(c, [x - 26, g - 82, x - 28, g - 98, x - 18, g - 108, x - 12, g - 92], '#c9f0fb', 1.8);
      c.lineWidth = 2.4; c.strokeStyle = O; c.strokeRect(x - 40, g - 150, 80, 72); line(c, [x - 32, g - 142, x - 20, g - 142], 2, 'rgba(255,255,255,0.7)'); }
    { const x = 1572; box(c, x - 60, g - 64, 120, 64, M.wood2, 2.4); box(c, x - 66, g - 72, 132, 10, M.woodL, 2.2); box(c, x - 54, g - 150, 108, 78, '#6a5646', 2.4); icon(c, 'spiral', x, g - 111, 30); box(c, x - 26, g - 50, 52, 14, M.gold, 1.8); line(c, [x - 18, g - 43, x + 18, g - 43], 1.2); }
    { const x = 1787, w = 96; c.beginPath(); c.moveTo(x - w / 2, g - 16); c.lineTo(x - w / 2, g - 128); c.arc(x, g - 128, w / 2, Math.PI, 0); c.lineTo(x + w / 2, g - 16); c.closePath(); c.fillStyle = '#2f2233'; c.fill(); c.lineWidth = 9; c.strokeStyle = O; c.stroke(); c.lineWidth = 5; c.strokeStyle = M.woodL; c.stroke(); line(c, [x, g - 176, x, g - 16], 2.4); disc(c, x - 9, g - 86, 3.6, M.gold, 1.4); disc(c, x + 9, g - 86, 3.6, M.gold, 1.4); for (const s of [-1, 1]) { c.lineWidth = 1.6; c.strokeStyle = 'rgba(255,220,170,0.25)'; c.strokeRect(x + (s < 0 ? -38 : 8), g - 120, 30, 44); c.strokeRect(x + (s < 0 ? -38 : 8), g - 68, 30, 44); } cobweb(c, x - w / 2 + 4, g - 150, 1, 1, 44); }
    { const x = 1997; box(c, x - 26, g - 76, 52, 76, M.stone, 2.4); box(c, x - 32, g - 84, 64, 10, M.stone2, 2); box(c, x - 32, g - 10, 64, 10, M.stone2, 2); poly(c, [x - 24, g - 84, x - 16, g - 108, x + 16, g - 108, x + 24, g - 84], M.paper, 2.2); c.beginPath(); c.roundRect(x - 15, g - 142, 30, 36, 9); c.fillStyle = M.paper; c.fill(); c.lineWidth = 2.2; c.strokeStyle = O; c.stroke(); c.beginPath(); c.arc(x, g - 132, 17, Math.PI, 0); c.fillStyle = '#d9cdb0'; c.fill(); c.stroke(); line(c, [x - 6, g - 124, x - 2, g - 124], 1.6); line(c, [x + 2, g - 124, x + 6, g - 124], 1.6); }
    for (const bx of bays) {
      if (!inGap(bx)) { column(c, bx, GAL + 22, g - 2, 26); continue; }
      column(c, bx, g - 96, g - 2, 26);                                   // a broken stump, and what came down around it
      poly(c, [bx - 13, g - 92, bx - 13, g - 112, bx - 5, g - 104, bx + 2, g - 120, bx + 8, g - 106, bx + 13, g - 114, bx + 13, g - 92], M.stone, 2.2);
      const rr = rng(bx);
      for (let k = 0; k < 9; k++) { const rx = bx - 96 + rr() * 190, rw = 10 + rr() * 22, rh = 7 + rr() * 12; poly(c, [rx, g - 2, rx + rw * 0.15, g - 2 - rh, rx + rw * 0.7, g - 2 - rh * (0.7 + rr() * 0.5), rx + rw, g - 2], k % 3 ? M.stone : M.stone2, 2); }
      for (const [px, a, len] of [[bx - 70, -0.5, 74], [bx + 34, 0.32, 88], [bx - 20, -0.16, 60]]) { c.save(); c.translate(px, g - 8); c.rotate(a); box(c, 0, -6, len, 9, M.woodL, 2.2); line(c, [6, -1.5, len - 8, -1.5], 1.2, M.wood2); c.restore(); }
    }
    // the far hall: a tall mirror with something in it
    { const x = 2180, w = 86, y0 = 170, y1 = g - 130; frame(c, x - w / 2, y0, w, y1 - y0); const gr = c.createLinearGradient(x - w / 2, y0, x + w / 2, y1); gr.addColorStop(0, '#9fc3d6'); gr.addColorStop(1, '#5f86a6'); c.fillStyle = gr; c.fillRect(x - w / 2, y0, w, y1 - y0);
      c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.moveTo(x - w / 2, y0 + 70); c.lineTo(x - w / 2 + 44, y0); c.lineTo(x - w / 2 + 64, y0); c.lineTo(x - w / 2, y0 + 110); c.fill();
      c.fillStyle = 'rgba(240,248,255,0.5)'; c.beginPath(); c.arc(x + 6, y0 + 90, 18, Math.PI, 0); c.lineTo(x + 24, y0 + 130); c.lineTo(x + 15, y0 + 122); c.lineTo(x + 6, y0 + 130); c.lineTo(x - 3, y0 + 122); c.lineTo(x - 12, y0 + 130); c.closePath(); c.fill(); disc(c, x, y0 + 88, 2.4, 'rgba(43,48,68,0.6)', 0); disc(c, x + 12, y0 + 88, 2.4, 'rgba(43,48,68,0.6)', 0);
      c.lineWidth = 2; c.strokeStyle = O; c.strokeRect(x - w / 2, y0, w, y1 - y0); poly(c, [x - 26, y0 - 9, x, y0 - 34, x + 26, y0 - 9], M.gold, 2.2); }
    sconce(c, 2112 + 14, 250); sconce(c, 2340, 250); candelabra(c, 2364, g);
    chandelier(c, 480, 56); chandelier(c, 1130, 40); chandelier(c, 1660, 26);
    sconce(c, 1660, 170); sconce(c, 2010, 150);
    for (let i = 0; i < 4; i++) { const lx = (bays[i] + bays[i + 1]) / 2; if (inGap(lx)) continue; line(c, [lx, GAL + 22, lx, GAL + 52], 2); box(c, lx - 7, GAL + 52, 14, 18, '#ffdc94', 2); box(c, lx - 9, GAL + 48, 18, 5, M.gold2, 1.6); glow(c, lx, GAL + 62, 74, 0.42); }
    cobweb(c, 2, CEIL + 16, 1, 1, 80); cobweb(c, W - 2, CEIL + 16, -1, 1, 90); cobweb(c, 1264, GAL + 24, 1, 1, 50); cobweb(c, 2098, CEIL + 16, -1, 1, 60);

    // in front of the characters: stair rail and gallery balustrade
    const b = mk(), d = b.c;
    const baluster = (x, y0, y1) => { line(d, [x, y0, x, y1], 5.4); line(d, [x, y0, x, y1], 3, M.woodL); disc(d, x, (y0 + y1) / 2, 4.2, M.woodL, 1.6); };
    const newel = (x, y0, y1) => { box(d, x - 8, y0, 16, y1 - y0, M.wood, 2.4); box(d, x - 11, y0 - 6, 22, 8, M.woodL, 2); disc(d, x, y0 - 12, 8, M.gold, 2.2); };
    for (let i = 0; i < 11; i++) baluster(935 + i * 30, 520 - (i + 1) * 20 - 44, 520 - (i + 1) * 20);
    line(d, [912, 520 - 62, 1250, GAL - 46], 9); line(d, [912, 520 - 62, 1250, GAL - 46], 5.4, M.woodL);
    newel(908, g - 74, g); newel(1250, GAL - 60, GAL);
    for (const [ga, gb] of L.gallery || [[1250, 2100]]) {          // one balustrade per surviving stretch of gallery
      for (let x = ga + 24; x < gb - 10; x += 22) baluster(x, GAL - 40, GAL);
      box(d, ga, GAL - 46, gb - ga, 8, M.woodL, 2.4); newel(gb - 4, GAL - 60, GAL); if (ga > 1250) newel(ga + 4, GAL - 60, GAL);
    }
    return { front: { cv: a.cv, top, h: H }, over: { cv: b.cv, top, h: H } };
  }

  function ground(c, t, x0, x1, y1) {
    const y = t.y0;
    if (t.kind === 'stair') {                       // one slab of the staircase
      const hh = t.y1 - y;
      c.fillStyle = M.wood; c.fillRect(t.x0, y, t.x1 - t.x0, hh);
      for (let x = Math.ceil((t.x0 + 36) / 58) * 58; x < t.x1 - 4; x += 58) { c.fillStyle = 'rgba(30,14,20,0.4)'; c.fillRect(x, y, 2.4, hh); c.fillStyle = 'rgba(255,220,180,0.12)'; c.fillRect(x + 2.4, y, 1.6, hh); }   // grooves on one grid, so stacked slabs read as tall panels
      const sg = c.createLinearGradient(t.x0, 0, t.x1, 0); sg.addColorStop(0, 'rgba(20,8,16,0)'); sg.addColorStop(1, 'rgba(20,8,16,0.5)'); c.fillStyle = sg; c.fillRect(t.x0, y, t.x1 - t.x0, hh);                         // the side falls into shadow toward the wall
      box(c, t.x0, y + 5, 30, hh - 5, M.wood2, 1.8);                                                   // riser, in shade
      box(c, t.x0 - 3, y - 2, 36, 7, M.woodL, 2); box(c, t.x0 + 1, y - 2, 28, 7, M.red, 1.4); line(c, [t.x0 + 2, y + 1.5, t.x0 + 28, y + 1.5], 1, M.gold);   // tread, lit, with the runner
      line(c, [t.x0 + 33, y, t.x0 + 33, t.y1], 1.6);
      // Recessed panels and a cupboard door under the stairs. Every slab draws the whole design clipped to itself, so it lines up.
      c.save(); c.beginPath(); c.rect(t.x0 + 34, y, t.x1 - t.x0 - 34, hh); c.clip();
      for (let px = 1006; px < 1240; px += 58) { const top = 520 - 20 * Math.floor((px - 920) / 30 + 1) + 16; if (510 - top < 26) continue; const door = px === 1180;
        c.fillStyle = 'rgba(20,8,16,0.3)'; c.fillRect(px, top, 46, 506 - top); c.lineWidth = 1.8; c.strokeStyle = O; c.strokeRect(px, top, 46, 506 - top); c.lineWidth = 1.2; c.strokeStyle = 'rgba(255,214,170,0.26)'; c.beginPath(); c.moveTo(px + 3, 503); c.lineTo(px + 43, 503); c.lineTo(px + 43, top + 3); c.stroke();
        if (door) { disc(c, px + 9, (top + 506) / 2, 3.4, M.gold, 1.4); c.strokeStyle = O; c.lineWidth = 1.4; c.strokeRect(px + 5, top + 5, 36, 496 - top); } }
      c.restore();
      return;
    }
    if (t.kind === 'balcony') {
      box(c, t.x0, y, t.x1 - t.x0, t.y1 - y, M.woodL, 2.6); line(c, [t.x0, y + 7, t.x1, y + 7], 1.6, M.gold); for (let x = t.x0 + 8; x < t.x1; x += 34) poly(c, [x, t.y1, x + 14, t.y1, x, t.y1 + 12], M.wood, 1.8);
      box(c, Math.max(t.x0, x0), y - 2, Math.min(t.x1, x1) - Math.max(t.x0, x0), 5, M.red, 1.6);
      for (const [ex, dd] of [[t.x0, -1], [t.x1, 1]]) if (ex > 1260 && ex < 2090) { poly(c, [ex, y, ex + dd * 16, y + 4, ex + dd * 7, y + 10, ex + dd * 20, y + 16, ex + dd * 5, y + 22, ex, y + 22], M.woodL, 2.2); line(c, [ex + dd * 10, y + 22, ex + dd * 14, y + 40], 3, M.wood2); }   // splintered ends where the floor gave way
      return;
    }
    // the hall floor: boards, a carpet runner to the stairs, foundations below
    c.fillStyle = '#5c4c5e'; c.fillRect(x0, y + 22, x1 - x0, y1 - y - 22);
    c.strokeStyle = '#3f3344'; c.lineWidth = 2; for (let yy = y + 50, row = 0; yy < y1; yy += 30, row++) { c.beginPath(); c.moveTo(x0, yy); c.lineTo(x1, yy); c.stroke(); for (let x = Math.floor(x0 / 90) * 90 + (row % 2 ? 45 : 0); x < x1; x += 90) { c.beginPath(); c.moveTo(x, yy); c.lineTo(x, yy + 30); c.stroke(); } }
    box(c, x0 - 4, y, x1 - x0 + 8, 22, M.woodL, 2.6); for (let x = Math.floor(x0 / 74) * 74; x < x1; x += 74) line(c, [x, y + 1, x, y + 21], 1.4, M.wood2); line(c, [x0, y + 11, x1, y + 11], 1.2, 'rgba(43,48,68,0.25)');
    if (t.kind === 'floor') { c.save(); c.beginPath(); c.rect(x0, y + 1, x1 - x0, 20); c.clip(); for (const [a, b] of COOL) poly(c, [a, y + 1, b, y + 1, b + 26, y + 21, a + 26, y + 21], 'rgba(170,200,255,0.3)', 0); for (const [lx, lr] of POOLS) if (lx > x0 - 120 && lx < x1 + 120) { c.beginPath(); c.ellipse(lx, y + 10, 40 + lr * 0.5, 13, 0, 0, 7); c.fillStyle = 'rgba(255,196,110,0.3)'; c.fill(); c.beginPath(); c.ellipse(lx, y + 10, 18 + lr * 0.25, 7, 0, 0, 7); c.fillStyle = 'rgba(255,214,140,0.3)'; c.fill(); } c.restore(); }   // candlelight pooled on the boards
    for (let ax = Math.floor((x0 - 200) / 400) * 400 + 200; ax < x1 + 200; ax += 400) {       // cellar arches under the hall: a barrel and a candle in each
      c.beginPath(); c.moveTo(ax - 62, y1 + 4); c.lineTo(ax - 62, y + 78); c.arc(ax, y + 78, 62, Math.PI, 0); c.lineTo(ax + 62, y1 + 4); c.closePath(); c.fillStyle = '#2a1e2c'; c.fill(); c.lineWidth = 5; c.strokeStyle = '#7a6878'; c.stroke(); c.lineWidth = 2.2; c.strokeStyle = O; c.stroke();
      c.beginPath(); c.ellipse(ax - 18, y + 92, 22, 17, 0, 0, 7); c.fillStyle = M.wood; c.fill(); c.lineWidth = 2; c.stroke(); line(c, [ax - 30, y + 78, ax - 30, y + 106], 2.2, M.wood2); line(c, [ax - 6, y + 78, ax - 6, y + 106], 2.2, M.wood2);
      box(c, ax + 22, y + 84, 5, 12, M.paper, 1.2); disc(c, ax + 24.5, y + 80, 3, '#ffd978', 0);
    }
    const rx0 = Math.max(x0, 1290), rx1 = Math.min(x1, 2090);
    if (rx1 > rx0) { box(c, rx0, y - 3, rx1 - rx0, 9, '#6a4a8a', 2); line(c, [rx0, y - 0.5, rx1, y - 0.5], 1.4, M.gold); line(c, [rx0, y + 3.5, rx1, y + 3.5], 1.4, M.gold); for (let x = Math.ceil(rx0 / 40) * 40; x < rx1; x += 40) poly(c, [x - 5, y + 1.5, x, y - 1.5, x + 5, y + 1.5, x, y + 4.5], M.gold, 0); }   // a second runner through the arcade
    const cx0 = Math.max(x0, 360), cx1 = Math.min(x1, 922);
    if (cx1 > cx0) { box(c, cx0, y - 3, cx1 - cx0, 9, M.red, 2); line(c, [cx0, y - 0.5, cx1, y - 0.5], 1.4, M.gold); line(c, [cx0, y + 3.5, cx1, y + 3.5], 1.4, M.gold); }
  }

  NN.manor = { build, ground };
})(window.NN);
