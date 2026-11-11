/* Hollow: a moonlit forest of giant trees and mushroom houses.
 *
 * Built the same way as the town and the manor: every object is a small part
 * function, the scene is baked once into a "front" canvas (behind the
 * characters) and an "over" canvas (in front of them), and lights are recorded
 * rather than painted so the renderer can add them as real light.
 *
 * This scene also has things that move: a waterfall, fireflies, drifting
 * spores and a blinking light on a crashed probe. Those are drawn each frame
 * by animate(), and liveLights() reports the lights that go with them.
 */
(function (NN) {
  'use strict';
  const { O, box, line, poly, disc, glow, rng, capture, icon } = NN.town.parts;
  const H = {
    bark: '#7a5f74', bark2: '#5d4660', barkL: '#987a8c', wood: '#8a5a3f', wood2: '#6b4433', woodL: '#b07c52',
    leaf: '#3f9a86', leaf2: '#2c7a70', leaf3: '#226063', leafL: '#7fd0a8', moss: '#86c06f', moss2: '#5f9a5c',
    red: '#d0554f', red2: '#a8403f', blue: '#5b86cf', blue2: '#4468ad', plum: '#a070c8', plum2: '#7f52a6', cream: '#f6ead0', stalk: '#efe2c6', stalk2: '#cdb99a',
    rock: '#7c86a6', rock2: '#646d8e', rockL: '#9aa5c2', soil: '#54425f', soil2: '#443450', lit: '#ffdc94', lit2: '#f7c468',
    cyan: '#8ff4e6', pink: '#f6a2de', lime: '#d6f58a', water: '#8fdcec', metal: '#aab3c4', metal2: '#8891a6',
  };
  const G = 520, CY = '140,240,225', PK = '246,150,220', WARM = '255,214,150';
  let EM = null;                                                 // chimneys found while painting

  // ---- small parts ---------------------------------------------------------------
  // Falling water as one shape: narrow at the lip, spreading and ragged toward the pool. The baked crag and the
  // live streaks both use it, so they line up.
  const fallHalf = (y, yTop, yBot) => 15 + 17 * Math.max(0, Math.min(1, (y - yTop) / (yBot - yTop)));
  const fallWob = (y, s) => Math.sin(y * 0.07 + s) * 2.4 + Math.sin(y * 0.19 + s * 2) * 1.3;
  function fallShape(c, RX, y0, y1, yTop, yBot) {
    c.beginPath(); c.moveTo(RX - fallHalf(y0, yTop, yBot) + fallWob(y0, 0), y0);
    for (let y = y0 + 8; y < y1; y += 8) c.lineTo(RX - fallHalf(y, yTop, yBot) + fallWob(y, 0), y);
    c.lineTo(RX - fallHalf(y1, yTop, yBot) + fallWob(y1, 0), y1); c.lineTo(RX + fallHalf(y1, yTop, yBot) + fallWob(y1, 3), y1);
    for (let y = y1 - 8; y > y0; y -= 8) c.lineTo(RX + fallHalf(y, yTop, yBot) + fallWob(y, 3), y);
    c.lineTo(RX + fallHalf(y0, yTop, yBot) + fallWob(y0, 3), y0); c.closePath();
  }
  function fallEdges(c, RX, y0, y1, yTop, yBot) {
    for (const [sd, ph] of [[-1, 0], [1, 3]]) { c.beginPath(); for (let y = y0; y <= y1; y += 8) { const x = RX + sd * fallHalf(y, yTop, yBot) + fallWob(y, ph); if (y === y0) c.moveTo(x, y); else c.lineTo(x, y); } c.lineWidth = 2.2; c.strokeStyle = O; c.lineJoin = 'round'; c.stroke(); }
  }
  // a soft patch of light painted straight onto a distant layer (those layers get no real lights)
  function halo(c, x, y, r, rgb, a) { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
  // a closed smooth curve through a ring of points
  function blob(c, pts, fill, lw, col) {
    const n = pts.length / 2; c.beginPath();
    c.moveTo((pts[0] + pts[2 * n - 2]) / 2, (pts[1] + pts[2 * n - 1]) / 2);
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; c.quadraticCurveTo(pts[2 * i], pts[2 * i + 1], (pts[2 * i] + pts[2 * j]) / 2, (pts[2 * i + 1] + pts[2 * j + 1]) / 2); }
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (lw !== 0) { c.lineWidth = lw || 2.4; c.strokeStyle = col || O; c.lineJoin = 'round'; c.stroke(); }
  }
  // many overlapping circles with one outline around the lot: foliage, bushes, clouds of leaves
  function clump(c, discs, fill, lw) {
    if (lw !== 0) { c.lineWidth = (lw || 2.6) * 2; c.strokeStyle = O; for (const [x, y, r] of discs) { c.beginPath(); c.arc(x, y, r, 0, 7); c.stroke(); } }
    c.fillStyle = fill; for (const [x, y, r] of discs) { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }
  }
  function leafMarks(c, discs, r, col) {
    c.lineWidth = 1.5; c.strokeStyle = col; c.lineCap = 'round';
    for (const [x, y, rad] of discs) for (let k = 0; k < 3; k++) { const a = r() * 6.3, d = r() * rad * 0.6, lx = x + Math.cos(a) * d, ly = y + Math.sin(a) * d; c.beginPath(); c.moveTo(lx - 4, ly - 1); c.quadraticCurveTo(lx, ly - 5, lx + 4, ly - 1); c.stroke(); }
  }
  // a mass of leaves in three tones, hanging down from (cx, top)
  function canopy(c, cx, top, w, h, r) {
    for (const [col, mark, k, dy] of [[H.leaf3, null, 1, 0], [H.leaf2, 'rgba(20,50,60,0.4)', 0.84, -6], [H.leaf, H.leafL, 0.62, -16]]) {
      const ds = [], n = Math.round(w * k / 30);
      for (let i = 0; i <= n; i++) { const t = i / n - 0.5, x = cx + t * w * k + (r() - 0.5) * 16, drop = (1 - t * t * 3.2) * h * k; ds.push([x, top + drop * (0.55 + r() * 0.45) + dy, 22 + r() * 16]); if (r() < 0.6) ds.push([x + (r() - 0.5) * 30, top + drop * 0.3 * r() + dy, 26 + r() * 14]); }
      ds.push([cx, top - 10, w * k * 0.3]);
      clump(c, ds, col); if (mark) leafMarks(c, ds, r, mark);
    }
  }
  // the trunk of a very large tree: flared foot, bark, knots, moss, a darker side
  function trunk(c, x, w, top, g, r, o) {
    o = o || {};
    const hw = w / 2, fl = w * 0.36;
    const path = () => { c.beginPath(); c.moveTo(x - hw, top); c.lineTo(x - hw, g - 130); c.bezierCurveTo(x - hw, g - 46, x - hw - fl * 0.45, g - 16, x - hw - fl, g + 4); c.lineTo(x + hw + fl, g + 4); c.bezierCurveTo(x + hw + fl * 0.45, g - 16, x + hw, g - 46, x + hw, g - 130); c.lineTo(x + hw, top); c.closePath(); };
    path(); const gr = c.createLinearGradient(x - hw, 0, x + hw, 0); gr.addColorStop(0, H.barkL); gr.addColorStop(0.3, H.bark); gr.addColorStop(1, H.bark2); c.fillStyle = gr; c.fill();
    c.save(); c.clip();
    for (let i = 0; i < w / 12; i++) {
      const bx = x - hw + 7 + i * 12 + r() * 5; let y = top + r() * 70;
      while (y < g) { const len = 44 + r() * 120; c.beginPath(); c.moveTo(bx, y); c.quadraticCurveTo(bx + (r() - 0.5) * 10, y + len / 2, bx + (r() - 0.5) * 5, y + len); c.lineWidth = 1.5; c.strokeStyle = 'rgba(34,24,52,0.36)'; c.stroke(); y += len + 16 + r() * 44; }
    }
    for (let i = 0; i < (g - top) / 150; i++) { const kx = x + (r() - 0.5) * w * 0.6, ky = top + 60 + r() * (g - top - 220); if (o.avoid && o.avoid(kx, ky)) continue; c.beginPath(); c.ellipse(kx, ky, 9, 13, 0, 0, 7); c.fillStyle = H.bark2; c.fill(); c.lineWidth = 1.8; c.strokeStyle = O; c.stroke(); c.beginPath(); c.ellipse(kx, ky, 4, 7, 0, 0, 7); c.lineWidth = 1.2; c.stroke(); }
    c.fillStyle = 'rgba(26,20,58,0.26)'; c.fillRect(x + hw * 0.4, top, hw + fl, g - top + 6);
    { const cg = c.createLinearGradient(0, top + 60, 0, top + 330); cg.addColorStop(0, 'rgba(20,14,52,0.55)'); cg.addColorStop(1, 'rgba(20,14,52,0)'); c.fillStyle = cg; c.fillRect(x - hw - fl, top, w + fl * 2, 330); }   // the canopy's shadow on the trunk
    c.fillStyle = 'rgba(255,240,220,0.1)'; c.fillRect(x - hw - fl, top, fl + 10, g - top + 6);
    blob(c, [x - hw - fl - 6, g + 8, x - hw - fl * 0.7, g - 20, x - hw - 4, g - 54, x - hw + 26, g - 36, x - hw + 44, g - 10, x - hw + 30, g + 8], H.moss2, 0);       // moss up the lit side of the foot
    blob(c, [x - hw - fl - 6, g + 8, x - hw - fl * 0.6, g - 12, x - hw + 2, g - 36, x - hw + 22, g - 20, x - hw + 30, g + 8], H.moss, 0);
    c.restore();
    path(); c.lineWidth = 3.4; c.strokeStyle = O; c.lineJoin = 'round'; c.stroke();
    for (const [dx, s] of [[-hw - fl * 0.5, -1], [hw + fl * 0.5, 1], [0, 1]]) { c.beginPath(); c.moveTo(x + dx - 16, g + 3); c.quadraticCurveTo(x + dx + s * 4, g - 16, x + dx + 18, g + 3); c.lineWidth = 2; c.stroke(); }
  }
  // bracket fungus stepping up a trunk; the pale ones glow
  function shelves(c, x, y, side, n, col, light) {
    for (let i = 0; i < n; i++) { const sx = x + side * (i % 2) * 5, sy = y - i * 24, w = 26 - i * 2; c.beginPath(); c.moveTo(sx, sy); c.quadraticCurveTo(sx + side * w * 0.6, sy - 13, sx + side * w, sy); c.quadraticCurveTo(sx + side * w * 0.5, sy + 6, sx, sy + 4); c.closePath(); c.fillStyle = col; c.fill(); c.lineWidth = 2; c.strokeStyle = O; c.stroke(); line(c, [sx + side * 4, sy - 3, sx + side * w * 0.6, sy - 6], 1.2, 'rgba(255,255,255,0.6)'); if (light) glow(c, sx + side * w * 0.5, sy, 26, 0.3, light); }
  }
  function porthole(c, x, y, r, o) {
    o = o || {};
    disc(c, x, y, r + 5, o.frame || H.woodL, 2.4); disc(c, x, y, r, H.lit, 2); c.save(); c.beginPath(); c.arc(x, y, r, 0, 7); c.clip(); c.fillStyle = H.lit2; c.fillRect(x - r, y + r * 0.1, r * 2, r); if (o.inside) { c.fillStyle = 'rgba(110,70,60,0.55)'; c.fillRect(x - r * 0.5, y + r * 0.2, r, r * 0.8); c.beginPath(); c.arc(x, y + r * 0.1, r * 0.34, 0, 7); c.fill(); } c.restore();
    line(c, [x - r, y, x + r, y], 2); line(c, [x, y - r, x, y + r], 2); glow(c, x, y, r * 3.6, 0.42);
    if (o.box) { box(c, x - r - 3, y + r + 4, r * 2 + 6, 8, H.wood, 2); for (let i = 0; i < 4; i++) disc(c, x - r + 3 + i * (r * 2 - 6) / 3, y + r + 2, 4.2, [H.pink, H.lime, H.cyan, H.cream][i], 1.4); }
  }
  // an arched plank door with a little lit window and a step
  function roundDoor(c, x, g, w, h, col) {
    const r = w / 2; c.beginPath(); c.moveTo(x - r - 6, g); c.lineTo(x - r - 6, g - h + r); c.arc(x, g - h + r, r + 6, Math.PI, 0); c.lineTo(x + r + 6, g); c.closePath(); c.fillStyle = H.woodL; c.fill(); c.lineWidth = 2.6; c.strokeStyle = O; c.stroke();
    c.beginPath(); c.moveTo(x - r, g); c.lineTo(x - r, g - h + r); c.arc(x, g - h + r, r, Math.PI, 0); c.lineTo(x + r, g); c.closePath(); c.fillStyle = col || H.wood; c.fill(); c.lineWidth = 2.2; c.stroke();
    for (let i = 1; i < 4; i++) line(c, [x - r + i * w / 4, g - h + r * 0.5, x - r + i * w / 4, g], 1.2, 'rgba(43,48,68,0.45)');
    disc(c, x, g - h + r + 4, r * 0.42, H.lit, 2); line(c, [x - r * 0.42, g - h + r + 4, x + r * 0.42, g - h + r + 4], 1.4); glow(c, x, g - h + r + 4, 34, 0.36);
    disc(c, x + r * 0.55, g - h * 0.4, 3.2, '#e0a94a', 1.4);
    blob(c, [x - r - 16, g + 2, x - r - 10, g - 9, x + r + 10, g - 9, x + r + 16, g + 2], H.rock, 2.2);
  }
  function lantern(c, x, y0, len, color) {
    line(c, [x, y0, x, y0 + len], 1.6); const y = y0 + len;
    poly(c, [x - 7, y, x + 7, y, x + 5, y + 4, x - 5, y + 4], H.wood2, 1.6); box(c, x - 6, y + 4, 12, 15, color ? '#dffcf4' : H.lit, 1.8); line(c, [x, y + 4, x, y + 19], 1.1); poly(c, [x - 7, y + 19, x + 7, y + 19, x + 4, y + 23, x - 4, y + 23], H.wood2, 1.6);
    glow(c, x, y + 12, 64, 0.5, color);
  }
  // a row of lanterns on a sagging rope
  function ropeLights(c, x0, y0, x1, y1, sag, n) {
    c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + sag * 2, x1, y1); c.lineWidth = 1.8; c.strokeStyle = O; c.stroke();
    const cols = [[H.lit, WARM], [H.pink, PK], [H.cyan, CY], [H.lit, WARM], [H.lime, '214,245,138']];
    for (let i = 1; i < n; i++) { const t = i / n, x = x0 + (x1 - x0) * t, y = (1 - t) * (1 - t) * y0 + 2 * t * (1 - t) * ((y0 + y1) / 2 + sag * 2) + t * t * y1; line(c, [x, y, x, y + 6], 1.2); c.beginPath(); c.ellipse(x, y + 12, 5, 6.5, 0, 0, 7); c.fillStyle = cols[i % 5][0]; c.fill(); c.lineWidth = 1.5; c.strokeStyle = O; c.stroke(); glow(c, x, y + 12, 15, 0.34, cols[i % 5][1]); }
  }
  // a mushroom somebody lives in
  function shroomHouse(c, x, g, o) {
    const sw = o.sw, sh = o.sh, cw = o.cw, ch = o.ch, cy = g - sh;
    // stalk: wider at the foot, a skirt under the cap
    c.beginPath(); c.moveTo(x - sw / 2 - 14, g + 3); c.bezierCurveTo(x - sw / 2 - 6, g - sh * 0.35, x - sw / 2 + 4, g - sh * 0.7, x - sw / 2 + 2, cy - 4); c.lineTo(x + sw / 2 - 2, cy - 4); c.bezierCurveTo(x + sw / 2 - 4, g - sh * 0.7, x + sw / 2 + 6, g - sh * 0.35, x + sw / 2 + 14, g + 3); c.closePath();
    const gr = c.createLinearGradient(x - sw / 2, 0, x + sw / 2 + 10, 0); gr.addColorStop(0, '#fff6e0'); gr.addColorStop(0.5, H.stalk); gr.addColorStop(1, H.stalk2); c.fillStyle = gr; c.fill(); c.lineWidth = 3.2; c.strokeStyle = O; c.lineJoin = 'round'; c.stroke();
    for (let i = 0; i < 5; i++) line(c, [x - sw / 2 + 14 + i * (sw - 28) / 4, cy + 24 + (i % 2) * 14, x - sw / 2 + 12 + i * (sw - 28) / 4, cy + 44 + (i % 2) * 22], 1.3, 'rgba(120,96,70,0.45)');
    { const sg = c.createLinearGradient(0, cy - 4, 0, cy + sh * 0.45); sg.addColorStop(0, 'rgba(46,30,80,0.5)'); sg.addColorStop(1, 'rgba(46,30,80,0)'); c.fillStyle = sg; c.fillRect(x - sw / 2 + 4, cy - 2, sw - 8, sh * 0.45); }   // the cap's shadow on the stalk
    // gills, then the cap over them
    const lip = cy + 16;
    c.beginPath(); c.moveTo(x - cw / 2 + 10, lip - 6); c.quadraticCurveTo(x, lip + 34, x + cw / 2 - 10, lip - 6); c.lineTo(x + sw / 2 - 2, cy - 16); c.lineTo(x - sw / 2 + 2, cy - 16); c.closePath(); c.fillStyle = o.gill || '#e7c9a8'; c.fill(); c.lineWidth = 2.4; c.stroke();
    for (let i = -7; i <= 7; i++) line(c, [x + i * sw * 0.06, cy - 12, x + i * cw * 0.062, lip + 10 - Math.abs(i) * 2.2], 1.1, 'rgba(110,70,60,0.5)');
    const capPath = () => { c.beginPath(); c.moveTo(x - cw / 2, lip); c.bezierCurveTo(x - cw / 2 - 6, lip - ch * 0.9, x - cw * 0.22, cy - ch, x, cy - ch); c.bezierCurveTo(x + cw * 0.22, cy - ch, x + cw / 2 + 6, lip - ch * 0.9, x + cw / 2, lip); c.quadraticCurveTo(x + cw / 2 - 8, lip + 10, x + cw / 2 - 22, lip + 2); c.quadraticCurveTo(x, lip - 20, x - cw / 2 + 22, lip + 2); c.quadraticCurveTo(x - cw / 2 + 8, lip + 10, x - cw / 2, lip); c.closePath(); };
    capPath(); c.fillStyle = o.cap; c.fill();
    c.save(); c.clip();
    c.fillStyle = o.cap2; c.beginPath(); c.ellipse(x + cw * 0.2, lip + 4, cw * 0.46, ch * 0.62, 0, 0, 7); c.fill();                    // the shaded side
    c.fillStyle = 'rgba(255,255,255,0.2)'; c.beginPath(); c.ellipse(x - cw * 0.16, cy - ch * 0.72, cw * 0.2, ch * 0.16, -0.3, 0, 7); c.fill();
    const sr = rng(Math.round(x) * 3 + 1);
    for (let i = 0; i < o.spots; i++) { const a = -Math.PI + (i + 0.5) / o.spots * Math.PI + (sr() - 0.5) * 0.3, d = 0.45 + sr() * 0.42, px = x + Math.cos(a) * cw * 0.46 * d, py = lip - 8 + Math.sin(a) * ch * 0.86 * d, pr = 9 + sr() * 12; c.beginPath(); c.ellipse(px, py, pr, pr * 0.72, a + Math.PI / 2, 0, 7); c.fillStyle = o.spot || H.cream; c.fill(); c.lineWidth = 1.8; c.strokeStyle = O; c.stroke(); if (o.spotGlow) glow(c, px, py, pr * 2.2, 0.3, o.spotGlow); }
    c.restore(); capPath(); c.lineWidth = 3.4; c.strokeStyle = O; c.stroke();
    if (o.chimney) { const kx = x + cw * o.chimney, ky = cy - ch * 0.62; poly(c, [kx - 9, ky + 22, kx - 9, ky - 20, kx + 9, ky - 20, kx + 9, ky + 14], H.rock, 2.4); box(c, kx - 12, ky - 26, 24, 8, H.rock2, 2.2); if (EM) EM.push([kx, ky - 30]); }
    if (o.door !== false) roundDoor(c, x + (o.doorX || 0), g, o.dw || 42, o.dh || 72, o.doorCol);
    for (const [dx, dy, r, opt] of o.wins || []) porthole(c, x + dx, g - dy, r, Object.assign({ frame: H.cream }, opt));
  }
  // little glowing mushrooms in a huddle
  function glowshrooms(c, x, y, s, col, light, r, n) {
    for (let i = 0; i < (n || 3); i++) { const px = x + (i - ((n || 3) - 1) / 2) * 11 * s + (r() - 0.5) * 4, h = (10 + r() * 14) * s, w = (6 + r() * 5) * s; line(c, [px, y, px + (r() - 0.5) * 3, y - h], 3.4 * s); line(c, [px, y, px, y - h], 1.8 * s, H.cream); c.beginPath(); c.moveTo(px - w, y - h + 1); c.quadraticCurveTo(px, y - h - w * 1.7, px + w, y - h + 1); c.closePath(); c.fillStyle = col; c.fill(); c.lineWidth = 1.7; c.strokeStyle = O; c.stroke(); disc(c, px - w * 0.3, y - h - w * 0.4, 1.3 * s, '#fff', 0); glow(c, px, y - h, 22 * s, 0.34, light); }
  }
  function fern(c, x, y, s, col, r) {
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.44 + (r() - 0.5) * 0.2, len = (24 + r() * 14) * s, ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len * 0.9 + Math.abs(i - 2) * 5 * s, mx = (x + ex) / 2, my = Math.min(y, ey) - len * 0.34; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(mx - 6 * s, my, ex, ey); c.quadraticCurveTo(mx + 6 * s, my + 5 * s, x, y); c.fillStyle = col; c.fill(); c.lineWidth = 1.7; c.strokeStyle = O; c.lineJoin = 'round'; c.stroke(); c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(mx, my + 3 * s, ex, ey); c.lineWidth = 1; c.strokeStyle = 'rgba(255,255,255,0.35)'; c.stroke(); }
  }
  function tuft(c, x, y, s, col, r) { const pts = [x - 9 * s, y + 1]; for (let i = 0; i < 4; i++) { pts.push(x - 8 * s + i * 5 * s + (r() - 0.5) * 3, y - (8 + r() * 12) * s, x - 5 * s + i * 5 * s, y + 1); } poly(c, pts, col, 1.6); }
  function bloom(c, x, y, s, col, light, r) { const h = (14 + r() * 12) * s, bx = x + (r() - 0.5) * 6; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x - 2, y - h * 0.6, bx, y - h); c.lineWidth = 3; c.strokeStyle = O; c.stroke(); c.lineWidth = 1.4; c.strokeStyle = H.moss; c.stroke(); disc(c, bx, y - h, 4.4 * s, col, 1.5); disc(c, bx, y - h, 1.5 * s, '#fff', 0); glow(c, bx, y - h, 13, 0.3, light); }
  function rock(c, x, y, w, h, r, mossy) {
    blob(c, [x - w / 2, y + 3, x - w * 0.46, y - h * 0.6, x - w * 0.1, y - h, x + w * 0.3, y - h * 0.86, x + w / 2, y - h * 0.3, x + w * 0.48, y + 3], H.rock, 2.6);
    c.save(); blob(c, [x - w / 2, y + 3, x - w * 0.46, y - h * 0.6, x - w * 0.1, y - h, x + w * 0.3, y - h * 0.86, x + w / 2, y - h * 0.3, x + w * 0.48, y + 3], null, 0); c.clip(); c.fillStyle = H.rock2; c.fillRect(x + w * 0.08, y - h, w, h + 4); c.fillStyle = 'rgba(255,255,255,0.16)'; c.fillRect(x - w / 2, y - h, w * 0.3, h); if (mossy) { c.fillStyle = H.moss2; c.beginPath(); c.ellipse(x - w * 0.1, y - h, w * 0.42, h * 0.26, 0, 0, 7); c.fill(); } c.restore();
    blob(c, [x - w / 2, y + 3, x - w * 0.46, y - h * 0.6, x - w * 0.1, y - h, x + w * 0.3, y - h * 0.86, x + w / 2, y - h * 0.3, x + w * 0.48, y + 3], null, 2.6);
    line(c, [x + w * 0.08, y - h * 0.9, x + w * 0.02, y - h * 0.4, x + w * 0.12, y], 1.2, 'rgba(43,48,68,0.45)');
  }
  function crystals(c, x, y, s, light) {
    for (const [dx, w, h, lean, col] of [[-16, 12, 30, -6, '#7fd6e6'], [14, 13, 38, 7, '#9fe8f2'], [0, 16, 56, 1, '#c9f6fb'], [-28, 9, 18, -8, '#9fe8f2'], [26, 9, 22, 8, '#7fd6e6']]) { const px = x + dx * s, t = y - h * s; poly(c, [px - w * s / 2, y, px - w * s / 2 + lean * s * 0.4, t + 9 * s, px + lean * s, t, px + w * s / 2 + lean * s * 0.6, t + 11 * s, px + w * s / 2, y], col, 2); line(c, [px + lean * s, t, px + lean * s * 0.3, y], 1, 'rgba(255,255,255,0.7)'); }
    glow(c, x, y - 26 * s, 62 * s, 0.5, light || '150,225,255');
  }
  // a standing stone with a rune that still works
  function menhir(c, x, y, w, h, rune) {
    blob(c, [x - w / 2, y + 3, x - w * 0.52, y - h * 0.5, x - w * 0.34, y - h, x + w * 0.3, y - h * 0.97, x + w * 0.52, y - h * 0.46, x + w / 2, y + 3], H.rock, 2.8);
    c.save(); blob(c, [x - w / 2, y + 3, x - w * 0.52, y - h * 0.5, x - w * 0.34, y - h, x + w * 0.3, y - h * 0.97, x + w * 0.52, y - h * 0.46, x + w / 2, y + 3], null, 0); c.clip(); c.fillStyle = H.rock2; c.fillRect(x + w * 0.12, y - h, w, h + 4); c.fillStyle = H.moss2; c.beginPath(); c.ellipse(x - w * 0.1, y - h, w * 0.4, 9, 0, 0, 7); c.fill(); c.restore();
    blob(c, [x - w / 2, y + 3, x - w * 0.52, y - h * 0.5, x - w * 0.34, y - h, x + w * 0.3, y - h * 0.97, x + w * 0.52, y - h * 0.46, x + w / 2, y + 3], null, 2.8);
    const ry = y - h * 0.58, k = w * 0.2; c.lineCap = 'round';
    const strokes = [[[0, -k * 1.4, 0, k * 1.4], [-k, -k * 0.5, 0, -k * 1.4, k, -k * 0.5]], [[-k, -k, k, -k, -k, k, k, k]], [[0, -k * 1.4, k, 0, 0, k * 1.4, -k, 0, 0, -k * 1.4]], [[-k, -k * 1.2, -k, k * 1.2], [-k, 0, k, -k * 1.2], [-k, 0, k, k * 1.2]]][rune % 4];
    for (const s of strokes) { const pts = s.map((v, i) => (i % 2 ? ry + v : x - w * 0.05 + v)); line(c, pts, 4.4); line(c, pts, 2.2, H.cyan); }
    glow(c, x, ry, 40, 0.4, CY);
  }
  function signpost(c, x, g, labels) {
    box(c, x - 3.5, g - 84, 7, 84, H.wood2, 2);
    labels.forEach(([txt, dir], i) => { const y = g - 80 + i * 26, w = txt.length * 7.4 + 22, x0 = dir > 0 ? x - 10 : x + 10 - w; poly(c, dir > 0 ? [x0, y, x0 + w - 10, y, x0 + w, y + 10, x0 + w - 10, y + 20, x0, y + 20] : [x0 + w, y, x0 + 10, y, x0, y + 10, x0 + 10, y + 20, x0 + w, y + 20], H.woodL, 2.2); c.font = '700 11px "Comic Neue", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = O; c.fillText(txt, x0 + w / 2 + (dir > 0 ? -3 : 3), y + 10.5); });
  }
  // the old survey probe that came down here long before the Tin Comet did
  function probe(c, x, g) {
    c.save(); c.translate(x, g - 30); c.rotate(-0.22);
    line(c, [18, -34, 40, -86], 3.6); line(c, [18, -34, 40, -86], 1.6, H.metal); disc(c, 40, -88, 5, H.red, 1.8);
    poly(c, [-64, -6, -96, -40, -90, -52, -52, -22], H.blue2, 2.2); for (let i = 1; i < 4; i++) line(c, [-64 - i * 8, -6 - i * 9, -52 - i * 9.5, -22 - i * 7.5], 1.1);
    c.beginPath(); c.ellipse(0, 0, 54, 42, 0, 0, 7); c.fillStyle = H.metal; c.fill(); c.lineWidth = 3; c.strokeStyle = O; c.stroke();
    c.save(); c.clip(); c.fillStyle = H.metal2; c.fillRect(8, -44, 60, 90); c.fillStyle = 'rgba(255,255,255,0.3)'; c.beginPath(); c.ellipse(-24, -20, 16, 9, -0.6, 0, 7); c.fill(); c.restore();
    c.beginPath(); c.ellipse(0, 4, 54, 9, 0, 0, Math.PI); c.lineWidth = 1.6; c.stroke(); for (const a of [-0.9, -0.3, 0.3, 0.9]) disc(c, Math.sin(a) * 46, 10 + Math.cos(a) * 3, 1.8, O, 0);
    disc(c, -10, -12, 15, '#3d4a6e', 2.6); disc(c, -10, -12, 9, '#6fd0e0', 1.6); disc(c, -13, -15, 2.6, '#fff', 0);
    c.restore();
    glow(c, x - 12, g - 44, 40, 0.3, CY);
    blob(c, [x - 76, g + 4, x - 60, g - 16, x - 20, g - 8, x + 30, g - 18, x + 70, g - 6, x + 78, g + 4], H.soil, 2.4);        // the furrow it ploughed
    const vr = rng(55); for (const [vx, vy] of [[-30, -52], [10, -64], [34, -40]]) { let px = x + vx, py = g + vy; c.beginPath(); c.moveTo(px, py); for (let i = 0; i < 4; i++) { px += (vr() - 0.5) * 16; py += 12; c.lineTo(px, py); } c.lineWidth = 3.6; c.strokeStyle = O; c.stroke(); c.lineWidth = 1.8; c.strokeStyle = H.moss; c.stroke(); disc(c, px, py, 3.4, H.moss, 1.3); }
  }
  function fence(c, x0, x1, g) { for (let x = x0; x <= x1; x += 22) { poly(c, [x - 4, g, x - 4, g - 24, x, g - 30, x + 4, g - 24, x + 4, g], H.woodL, 1.8); } line(c, [x0 - 6, g - 16, x1 + 6, g - 16], 3.4); line(c, [x0 - 6, g - 16, x1 + 6, g - 16], 1.6, H.wood); }

  // ---- the scene -----------------------------------------------------------------
  function paint(L, scale) {
    const W = L.W, TOPY = L.plateau.y, CX = L.plateau.x, top = L.sky - 130, h = G + 24 - top;
    const mk = () => { const cv = document.createElement('canvas'); cv.width = Math.ceil(W * scale); cv.height = Math.ceil(h * scale); const c = cv.getContext('2d'); c.scale(scale, scale); c.translate(0, -top); return [cv, c]; };
    const [cv, c] = mk(), [ocv, d] = mk(), r = rng(31337);
    const river = L.water[0], RX = (river.x0 + river.x1) / 2;

    // thin trees standing further back, already half lost in the dark
    for (const [x, w, g] of [[330, 46, G], [610, 60, G], [1340, 52, G], [1690, 44, G], [2470, 50, TOPY], [2600, 58, TOPY]]) {
      const tg = c.createLinearGradient(x - w / 2, 0, x + w / 2, 0); tg.addColorStop(0, '#6c68a4'); tg.addColorStop(0.3, '#55528c'); tg.addColorStop(1, '#3f3d70'); c.fillStyle = tg;
      c.beginPath(); c.moveTo(x - w / 2, top - 4); c.lineTo(x - w / 2, g - 50); c.quadraticCurveTo(x - w / 2, g - 10, x - w * 0.9, g + 4); c.lineTo(x + w * 0.9, g + 4); c.quadraticCurveTo(x + w / 2, g - 10, x + w / 2, g - 50); c.lineTo(x + w / 2, top - 4); c.closePath(); c.fill(); c.lineWidth = 2.4; c.strokeStyle = '#33345c'; c.stroke();
      c.fillStyle = 'rgba(190,205,255,0.28)'; c.fillRect(x - w / 2 + 2, top, 4, g - top - 54);                       // moonlight down one edge
      for (let y = top + 20; y < g - 30; y += 34 + r() * 30) { const bx = x - w * 0.3 + r() * w * 0.6; c.beginPath(); c.moveTo(bx, y); c.quadraticCurveTo(bx + (r() - 0.5) * 7, y + 18, bx + (r() - 0.5) * 4, y + 30 + r() * 20); c.lineWidth = 1.4; c.strokeStyle = 'rgba(40,38,90,0.6)'; c.stroke(); }
      for (let k = 0; k < 2; k++) { const ky = top + 120 + r() * (g - top - 300), sd = r() < 0.5 ? -1 : 1; poly(c, [x + sd * w / 2, ky, x + sd * (w / 2 + 26), ky - 16, x + sd * (w / 2 + 30), ky - 10, x + sd * w / 2, ky + 12], '#4a4880', 2); clump(c, [[x + sd * (w / 2 + 30), ky - 16, 9], [x + sd * (w / 2 + 40), ky - 22, 8], [x + sd * (w / 2 + 34), ky - 28, 8], [x + sd * (w / 2 + 22), ky - 24, 7]], '#3c6f7a', 2); }   // a stub of a branch with a tuft of leaves
      shelves(c, x - w / 2, g - 110 - r() * 120, -1, 2 + Math.floor(r() * 2), r() < 0.5 ? H.cyan : H.pink, r() < 0.5 ? CY : PK);
      blob(c, [x - w * 0.9, g + 6, x - w * 0.6, g - 16, x - w * 0.1, g - 26, x + w * 0.1, g - 8, x + w * 0.2, g + 6], H.moss2, 0);
    }
    // the waterfall crag behind the river: angular slabs, ledges with moss, a cave the water pours from
    {
      const x0 = river.x0 + 6, x1 = river.x1 - 6;
      const sil = [x0 - 34, G + 24, x0 - 26, G - 60, x0 - 4, G - 84, x0 - 10, G - 170, x0 + 18, G - 196, x0 + 22, G - 268, x0 + 58, G - 300, x0 + 70, G - 346, RX - 30, G - 372, RX + 44, G - 364, x1 - 64, G - 330, x1 - 52, G - 282, x1 - 18, G - 262, x1 - 8, G - 190, x1 + 16, G - 164, x1 + 10, G - 84, x1 + 36, G - 56, x1 + 40, G + 24];
      poly(c, sil, H.rock2, 0);
      c.save(); poly(c, sil, null, 0); c.clip();
      const planes = [[[x0 - 34, G + 24, x0 - 26, G - 60, x0 - 4, G - 84, x0 + 44, G - 66, x0 + 60, G + 24], H.rock], [[x0 - 10, G - 170, x0 + 18, G - 196, x0 + 66, G - 178, x0 + 54, G - 92, x0 - 4, G - 84], H.rock], [[x0 + 22, G - 268, x0 + 58, G - 300, x0 + 98, G - 280, x0 + 66, G - 178, x0 + 18, G - 196], H.rockL],
        [[x0 + 70, G - 346, RX - 30, G - 372, RX - 36, G - 296, x0 + 98, G - 280, x0 + 58, G - 300], H.rock], [[x0 + 44, G - 66, x0 + 54, G - 92, RX - 36, G - 110, RX - 36, G + 24, x0 + 60, G + 24], '#6f7898'], [[x0 + 66, G - 178, x0 + 98, G - 280, RX - 36, G - 296, RX - 36, G - 110, x0 + 54, G - 92], '#737c9c'],
        [[RX + 36, G - 300, RX + 44, G - 364, x1 - 64, G - 330, x1 - 52, G - 282, x1 - 86, G - 250], '#6c7494'], [[RX + 36, G - 300, x1 - 86, G - 250, x1 - 70, G - 150, RX + 36, G - 130], '#5a6284'], [[x1 - 86, G - 250, x1 - 52, G - 282, x1 - 18, G - 262, x1 - 8, G - 190, x1 - 70, G - 150], '#636b8c'],
        [[RX + 36, G - 130, x1 - 70, G - 150, x1 - 8, G - 190, x1 + 16, G - 164, x1 + 10, G - 84, x1 - 50, G - 60, RX + 36, G - 50], '#565e80'], [[RX + 36, G - 50, x1 - 50, G - 60, x1 + 10, G - 84, x1 + 36, G - 56, x1 + 40, G + 24, RX + 36, G + 24], '#5f6788']];
      for (const [pts, col] of planes) poly(c, pts, col, 1.6);
      for (let i = 0; i < 16; i++) { const lx = x0 + r() * (x1 - x0), ly = G - 330 + r() * 320; if (Math.abs(lx - RX) < 44) continue; line(c, [lx, ly, lx + 8 + r() * 14, ly + 5 + r() * 9, lx + 4 + r() * 10, ly + 16 + r() * 10], 1.2, 'rgba(43,48,68,0.5)'); }
      // the channel, the cave at its head, and the water (the moving streaks are drawn live)
      poly(c, [RX - 36, G - 310, RX - 30, G - 352, RX, G - 366, RX + 32, G - 350, RX + 36, G - 310, RX + 36, G + 24, RX - 36, G + 24], '#333856', 2.2);
      const wg = c.createLinearGradient(0, G - 330, 0, G); wg.addColorStop(0, '#c9f6f8'); wg.addColorStop(1, '#7fd0e6'); fallShape(c, RX, G - 328, G + 26, G - 328, river.y); c.fillStyle = wg; c.fill();
      for (const dx of [-7, 2, 9]) { c.beginPath(); for (let y = G - 304; y < G + 26; y += 10) { const x = RX + dx * (1 + (y - G + 328) / 420) + Math.sin(y * 0.05 + dx) * 2; if (y === G - 304) c.moveTo(x, y); else c.lineTo(x, y); } c.lineWidth = 1.6; c.strokeStyle = 'rgba(40,120,180,0.4)'; c.stroke(); }   // the fall breaks into strands
      c.restore();
      poly(c, sil, null, 3.4);
      fallEdges(c, RX, G - 328, G + 24, G - 328, river.y); for (const [dx, rr] of [[-11, 7], [1, 8.5], [12, 6.5]]) disc(c, RX + dx, G - 328, rr, '#f2fdff', 1.8);   // foam where it leaves the cave
      // moss and plants on every ledge
      for (const [mx, my, mw] of [[x0 - 2, G - 86, 34], [x0 + 20, G - 198, 36], [x0 + 60, G - 302, 40], [RX + 6, G - 370, 86], [x1 - 34, G - 264, 40], [x1 + 4, G - 166, 30], [x1 + 24, G - 58, 30]]) { blob(c, [mx - mw, my + 5, mx - mw * 0.6, my - 9, mx, my - 12, mx + mw * 0.6, my - 8, mx + mw, my + 5, mx, my + 9], H.moss2, 2.2); blob(c, [mx - mw * 0.7, my, mx - mw * 0.3, my - 9, mx + mw * 0.2, my - 9, mx + mw * 0.4, my], H.moss, 0); }
      glow(c, RX, G - 200, 150, 0.3, CY); glow(c, RX, G - 20, 120, 0.42, CY);
      glowshrooms(c, x0 + 30, G - 204, 1.2, H.cyan, CY, r, 3); glowshrooms(c, x1 - 40, G - 270, 1.1, H.pink, PK, r, 3); glowshrooms(c, x1 + 20, G - 64, 1, H.cyan, CY, r, 2);
      fern(c, x0 + 78, G - 308, 1.1, H.leaf, r); fern(c, RX + 60, G - 376, 1.1, H.leaf2, r); fern(c, x0 + 4, G - 92, 0.9, H.leaf2, r);
    }
    // giant trees. Windows, doors and fungus go on after the bark.
    trunk(c, 20, 230, top, G, r);
    shelves(c, 135, G - 150, 1, 4, '#f0b060'); porthole(c, 60, G - 250, 17, { inside: 1 }); porthole(c, 86, G - 372, 13);
    trunk(c, 1190, 210, top, G, r, { avoid: (x, y) => y > G - 330 });
    roundDoor(c, 1176, G, 48, 80, H.red2); porthole(c, 1140, G - 196, 18, { inside: 1, box: 1 }); porthole(c, 1226, G - 262, 15); porthole(c, 1162, G - 350, 13);
    shelves(c, 1295, G - 120, 1, 5, H.cyan, CY); shelves(c, 1085, G - 214, -1, 3, '#f0b060');
    lantern(c, 1214, G - 124, 14);
    blob(c, [1128, G - 96, 1136, G - 112, 1176, G - 122, 1216, G - 112, 1224, G - 96, 1176, G - 100], H.moss2, 2.4); blob(c, [1140, G - 104, 1176, G - 118, 1206, G - 108, 1176, G - 108], H.moss, 0);   // a little porch roof of moss
    trunk(c, 2265, 190, top, TOPY, r);
    porthole(c, 2253, TOPY - 210, 16, { inside: 1 }); shelves(c, 2170, TOPY - 90, -1, 4, H.pink, PK);
    trunk(c, 2790, 240, top, TOPY, r, { avoid: (x, y) => y > TOPY - 300 });
    roundDoor(c, 2772, TOPY, 46, 76, H.blue2); porthole(c, 2740, TOPY - 176, 16, { box: 1 }); porthole(c, 2820, TOPY - 236, 14, { inside: 1 }); lantern(c, 2812, TOPY - 116, 12);

    // houses
    shroomHouse(c, 520, G, { sw: 132, sh: 128, cw: 330, ch: 150, cap: H.red, cap2: H.red2, spots: 9, chimney: 0.22, doorX: -18, doorCol: '#4f8f86', wins: [[36, 78, 15, { box: 1, inside: 1 }]] });
    lantern(c, 462, G - 100, 10);
    shroomHouse(c, 1560, G, { sw: 96, sh: 212, cw: 250, ch: 118, cap: H.blue, cap2: H.blue2, spots: 7, spot: '#c9f6fb', spotGlow: '150,225,255', doorCol: H.plum2, dw: 38, dh: 66, wins: [[0, 118, 14, { inside: 1 }], [-20, 172, 10], [22, 168, 10]] });
    { const x = 1634, y = G - 132; line(c, [x - 30, y - 14, x + 4, y - 14], 3.4); line(c, [x - 4, y - 14, x - 4, y - 4], 1.6); box(c, x - 20, y - 4, 34, 30, H.cream, 2.2); icon(c, 'flask', x - 3, y + 11, 11); }
    shroomHouse(c, 2040, TOPY, { sw: 84, sh: 190, cw: 230, ch: 108, cap: H.plum, cap2: H.plum2, spots: 7, spot: H.pink, spotGlow: PK, doorCol: H.wood, dw: 36, dh: 62, wins: [[0, 110, 13, { inside: 1 }], [0, 160, 10]] });
    { const x = 2100, y = TOPY - 268; c.save(); c.translate(x, y); c.rotate(-0.6); box(c, -6, -9, 58, 18, '#c8a04e', 2.2); box(c, 48, -12, 12, 24, '#a27c2c', 2); box(c, -14, -6, 10, 12, '#a27c2c', 2); c.restore(); line(c, [x - 2, y + 6, x - 14, y + 38], 3); line(c, [x - 2, y + 6, x + 12, y + 38], 3); }   // somebody up here watches the sky

    // the probe, crystals, stones, signposts
    probe(c, 1400, G);
    crystals(c, 1740, G, 1); menhir(c, 1800, G, 44, 96, 0);
    crystals(c, 250, G, 0.7);
    signpost(c, 688, G, [['BEACON', 1], ['HOME', -1]]);
    fence(c, 370, 430, G); fence(c, 612, 656, G);
    rock(c, 742, G, 60, 34, r, 1); rock(c, 1098, G, 50, 30, r, 1);
    // the stone ring round the beacon
    const gx = L.goal.x;
    menhir(c, gx - 150, TOPY, 46, 120, 1); menhir(c, gx - 78, TOPY, 38, 84, 2); menhir(c, gx + 82, TOPY, 40, 92, 3); menhir(c, gx + 156, TOPY, 48, 126, 0);
    blob(c, [gx - 190, TOPY + 4, gx - 150, TOPY - 8, gx, TOPY - 12, gx + 150, TOPY - 8, gx + 190, TOPY + 4], H.rock2, 2.4);
    glow(c, gx, TOPY - 60, 190, 0.3, CY);

    // lanterns strung between the houses and the trees
    ropeLights(c, 120, G - 300, 420, G - 262, 26, 9); ropeLights(c, 690, G - 250, 606, G - 274, 6, 3);
    ropeLights(c, 1290, G - 310, 1466, G - 300, 24, 6); ropeLights(c, 1654, G - 300, 1890, TOPY - 150, 30, 7);
    ropeLights(c, 2360, TOPY - 330, 2674, TOPY - 330, 38, 10);

    // leaves overhead
    canopy(c, 40, top + 30, 620, 250, r); canopy(c, 1190, top + 30, 700, 270, r); canopy(c, 620, top + 10, 380, 150, r); canopy(c, 1720, top + 10, 420, 150, r);
    canopy(c, 2265, top + 10, 560, 150, r); canopy(c, 2800, top + 14, 520, 170, r);
    for (const [x, len] of [[150, 110], [300, 70], [1010, 90], [1330, 120], [1470, 60], [2480, 60], [2620, 80]]) { let px = x, py = top + 110; c.beginPath(); c.moveTo(px, py); for (let i = 0; i < len / 12; i++) { px = x + (r() - 0.5) * 10; py += 12; c.lineTo(px, py); } c.lineWidth = 3.6; c.strokeStyle = O; c.stroke(); c.lineWidth = 1.8; c.strokeStyle = H.moss2; c.stroke(); disc(c, px, py + 4, 4.4, r() < 0.5 ? H.pink : H.cyan, 1.5); glow(c, px, py + 4, 16, 0.3, CY); }
    for (const [x, len] of [[236, 120], [1050, 150], [1360, 110], [2440, 30], [2700, 40]]) lantern(c, x, top + 130, len);

    // undergrowth behind the characters
    const patches = [[-40, river.x0 - 30, G], [river.x1 + 30, CX - 16, G], [CX + 30, W + 40, TOPY]];
    for (const [a, b, g] of patches) for (let x = a + 20; x < b; x += 46 + r() * 60) { const k = r(); if (k < 0.3) fern(c, x, g + 2, 1 + r() * 0.5, r() < 0.5 ? H.leaf2 : H.leaf3, r); else if (k < 0.5) glowshrooms(c, x, g + 2, 0.9 + r() * 0.5, r() < 0.5 ? H.cyan : H.pink, r() < 0.5 ? CY : PK, r, 2 + Math.floor(r() * 3)); else if (k < 0.8) tuft(c, x, g + 2, 1.2, H.leaf2, r); else bloom(c, x, g + 2, 1.2, [H.pink, H.lime, H.cyan][Math.floor(r() * 3)], [PK, '214,245,138', CY][Math.floor(r() * 3)], r); }

    // ---- in front of the characters ----
    for (const [a, b, g] of patches) for (let x = a + 8; x < b; x += 58 + r() * 90) { const k = r(); if (Math.abs(x - L.start.x) < 60 || Math.abs(x - gx) < 70 || Math.abs(x - L.depot.x) < 90) continue; if (k < 0.34) tuft(d, x, g + 6, 1.5, H.leaf, r); else if (k < 0.6) fern(d, x, g + 8, 0.9, H.leaf, r); else if (k < 0.8) bloom(d, x, g + 6, 1, [H.pink, H.lime, H.cyan][Math.floor(r() * 3)], [PK, '214,245,138', CY][Math.floor(r() * 3)], r); else glowshrooms(d, x, g + 6, 0.8, r() < 0.5 ? H.cyan : H.pink, r() < 0.5 ? CY : PK, r, 2); }
    shelves(d, CX, G - 60, -1, 3, H.cyan, CY); shelves(d, CX, TOPY + 70, -1, 2, H.pink, PK);
    // what is left of the bridge
    for (const [bx, s] of [[river.x0 - 16, 1], [river.x1 + 16, -1]]) { box(d, bx - 5, G - 52, 10, 56, H.wood2, 2.2); box(d, bx - 7, G - 58, 14, 8, H.woodL, 2); line(d, [bx, G - 46, bx + s * 26, G - 20, bx + s * 34, G + 2], 2.2); poly(d, [bx + s * 6, G - 4, bx + s * 44, G - 4, bx + s * 52, G + 6, bx + s * 40, G + 2, bx + s * 6, G + 2], H.woodL, 2); }
    return { cv, ocv, top, h };
  }

  function build(L, scale) {
    EM = [];
    const res = capture(() => paint(L, scale)), o = res.out, emitters = EM; EM = null;
    const river = L.water[0], RX = (river.x0 + river.x1) / 2, TOPY = L.plateau.y;
    // fireflies: each has a home and wanders round it
    const fr = rng(808), flies = [];
    for (let i = 0; i < 34; i++) { const x = 60 + fr() * (L.W - 120), g = x > L.plateau.x ? TOPY : G; if (x > river.x0 - 20 && x < river.x1 + 20 && fr() < 0.5) continue; flies.push({ x, y: g - 40 - fr() * 190, a: fr() * 6.3, f: 0.5 + fr() * 0.8, rx: 16 + fr() * 30, ry: 8 + fr() * 18 }); }
    const at = (f, t) => [f.x + Math.sin(t * f.f + f.a) * f.rx + Math.sin(t * f.f * 0.37 + f.a * 2) * 12, f.y + Math.cos(t * f.f * 1.3 + f.a) * f.ry, 0.5 + 0.5 * Math.sin(t * 2.2 + f.a * 3)];
    const spores = []; for (let i = 0; i < 46; i++) spores.push({ x: fr() * L.W, y: fr() * 520, s: 4 + fr() * 8, a: fr() * 6.3 });
    function animate(ctx, t, layer, cam, WW, WH) {
      const vis = (x) => x > cam.x - 60 && x < cam.x + WW + 60;
      if (layer === 'back') {
        if (!vis(RX)) return;
        // the crag carries on down to the water, so it does not float above the river
        ctx.fillStyle = H.rock2; ctx.fillRect(river.x0 - 4, G + 2, river.x1 - river.x0 + 8, river.y - G + 8); ctx.fillStyle = H.rock; for (let i = 0; i < 5; i++) { const bx = river.x0 + 10 + i * 56; if (Math.abs(bx + 20 - RX) < 50) continue; ctx.beginPath(); ctx.moveTo(bx, river.y + 6); ctx.lineTo(bx + 6, G + 8 + (i % 2) * 8); ctx.lineTo(bx + 36, G + 6); ctx.lineTo(bx + 44, river.y + 6); ctx.closePath(); ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = O; ctx.stroke(); }
        // falling water: bright streaks sliding down the channel, and the lower reach below the bank
        fallShape(ctx, RX, G + 14, river.y + 4, G - 328, river.y); ctx.fillStyle = '#7fd0e6'; ctx.fill();
        ctx.save(); fallShape(ctx, RX, G - 324, river.y + 4, G - 328, river.y); ctx.clip();
        for (let i = 0; i < 20; i++) { const sx = RX - 28 + ((i * 37) % 56), len = 36 + (i * 53) % 80, sp = 230 + (i * 29) % 120, span = river.y - G + 440, y = G - 390 + ((t * sp + i * 97) % span); ctx.fillStyle = i % 3 ? 'rgba(255,255,255,0.75)' : 'rgba(210,250,255,0.5)'; ctx.fillRect(sx, y, [2, 3.4, 6][i % 3], len); }
        for (const [ex, dx] of [[RX - 33, 1], [RX + 33, -1]]) { const eg = ctx.createLinearGradient(ex, 0, ex + dx * 18, 0); eg.addColorStop(0, 'rgba(30,90,150,0.55)'); eg.addColorStop(1, 'rgba(30,90,150,0)'); ctx.fillStyle = eg; ctx.fillRect(Math.min(ex, ex + dx * 18), G - 324, 18, river.y - G + 326); }   // the fall is round: darker at the edges
        ctx.restore();
        fallEdges(ctx, RX, G + 14, river.y + 2, G - 328, river.y);
        return;
      }
      if (vis(RX)) {                                              // foam where the water lands
        for (let i = 0; i < 7; i++) { const k = (t * 0.9 + i / 7) % 1, fx = RX + (i - 3) * 13 + Math.sin(i * 5) * 4, fy = river.y - 2 - Math.sin(k * Math.PI) * 14, fr2 = 7 + (i % 3) * 3 + k * 5; ctx.globalAlpha = 1 - k * 0.7; ctx.beginPath(); ctx.arc(fx, fy, fr2, 0, 7); ctx.fillStyle = '#f2fdff'; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = O; ctx.stroke(); }
        for (let i = 0; i < 5; i++) { const k = (t * 0.25 + i / 5) % 1; halo(ctx, RX + (i - 2) * 26 + Math.sin(i * 3 + t) * 8, river.y - 10 - k * 70, 34 + k * 40, '234,252,255', 0.3 * (1 - k)); }   // mist lifting off the pool
        ctx.globalAlpha = 1;
      }
      for (const s of spores) { const y = ((s.y - t * s.s) % 560 + 560) % 560 + (L.sky - 60), x = s.x + Math.sin(t * 0.5 + s.a) * 14; if (!vis(x)) continue; ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t + s.a); ctx.fillStyle = s.a > 3 ? '#d8fff6' : '#ffe9f8'; ctx.beginPath(); ctx.arc(x, y, 1.5, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
      for (const f of flies) { const [x, y, b] = at(f, t); if (!vis(x)) continue; ctx.globalAlpha = 0.25 + b * 0.5; ctx.fillStyle = '#fff6a8'; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill(); ctx.globalAlpha = 1; ctx.fillStyle = '#fffbe0'; ctx.beginPath(); ctx.arc(x, y, 2, 0, 7); ctx.fill(); }
      if (vis(1400) && Math.sin(t * 3) > 0.2) { ctx.fillStyle = '#ff8f7a'; ctx.beginPath(); ctx.arc(1400 + 20, G - 126, 3.4, 0, 7); ctx.fill(); }
    }
    function liveLights(t) {
      const out = [];
      for (const f of flies) { const [x, y, b] = at(f, t); out.push({ x, y, r: 34, a: 0.22 + b * 0.4, color: '245,240,150' }); }
      out.push({ x: 1420, y: G - 126, r: 60, a: Math.sin(t * 3) > 0.2 ? 0.6 : 0.05, color: '255,120,100' });
      out.push({ x: RX, y: river.y - 6, r: 110 + Math.sin(t * 5) * 6, a: 0.4, color: CY });
      return out;
    }
    return { front: { cv: o.cv, top: o.top, h: o.h }, over: { cv: o.ocv, top: o.top, h: o.h }, lights: res.lights, emitters, animate, liveLights };
  }

  // ---- sky and the two distant planes --------------------------------------------
  function sky(c, VW, VH) {
    const g = c.createLinearGradient(0, 0, 0, VH * 0.92); g.addColorStop(0, '#4a55c0'); g.addColorStop(0.45, '#6f7fe0'); g.addColorStop(0.8, '#8fd8dc'); g.addColorStop(1, '#d8fbe6'); c.fillStyle = g; c.fillRect(0, 0, VW, VH);
    const r = rng(12);
    // aurora: curtains of light hanging from wavy lines
    for (const [y0, amp, hh, col, ph] of [[70, 34, 190, '150,255,200', 0], [130, 26, 150, '200,160,255', 2], [40, 20, 120, '130,230,255', 4]]) for (let x = 0; x < VW; x += 2) { const y = y0 + Math.sin(x * 0.006 + ph) * amp + Math.sin(x * 0.021 + ph) * amp * 0.3, k = 0.5 + 0.5 * Math.sin(x * 0.05 + ph * 3); const ag = c.createLinearGradient(0, y, 0, y + hh); ag.addColorStop(0, `rgba(${col},${0.3 + k * 0.2})`); ag.addColorStop(1, `rgba(${col},0)`); c.fillStyle = ag; c.fillRect(x, y, 2, hh); }
    c.fillStyle = '#fffbe6'; for (let i = 0; i < 110; i++) { const x = r() * VW, y = r() * VH * 0.6, s = 0.6 + r() * 1.5; c.beginPath(); if (r() < 0.2) { c.moveTo(x, y - s * 3); c.lineTo(x + s * 0.7, y - s * 0.7); c.lineTo(x + s * 3, y); c.lineTo(x + s * 0.7, y + s * 0.7); c.lineTo(x, y + s * 3); c.lineTo(x - s * 0.7, y + s * 0.7); c.lineTo(x - s * 3, y); c.lineTo(x - s * 0.7, y - s * 0.7); } else c.arc(x, y, s, 0, 7); c.fill(); }
    const mx = VW * 0.63, my = 150;
    for (const [rad, a] of [[150, 0.07], [112, 0.1], [84, 0.14]]) { c.fillStyle = `rgba(255,250,220,${a})`; c.beginPath(); c.arc(mx, my, rad, 0, 7); c.fill(); }
    c.fillStyle = '#fffbe8'; c.beginPath(); c.arc(mx, my, 62, 0, 7); c.fill(); c.lineWidth = 3; c.strokeStyle = '#c9c4e8'; c.stroke();
    c.fillStyle = '#ebe6cf'; for (const [dx, dy, cr] of [[-22, -18, 13], [18, 8, 17], [-10, 26, 8], [28, -28, 7], [-36, 12, 6]]) { c.beginPath(); c.arc(mx + dx, my + dy, cr, 0, 7); c.fill(); }
  }
  // far: colossal trunks and mushrooms, pale and flat, with a few lit windows
  function far(c, w, horizon) {
    const r = rng(77);
    for (const [col, k, win] of [['#8f9fe0', 1, 0], ['#7c8ed6', 0.8, 1]]) for (let x = -40 + k * 30; x < w; x += 230 + r() * 230) {
      const tw = (44 + r() * 70) * k;
      if (r() < 0.3) { const sh = 120 + r() * 160, cw2 = tw * 3.4; c.fillStyle = col; c.fillRect(x - tw * 0.25, horizon - sh, tw * 0.5, sh); c.beginPath(); c.ellipse(x, horizon - sh, cw2 / 2, cw2 * 0.3, 0, Math.PI, 0); c.fill(); c.fillStyle = 'rgba(255,255,255,0.22)'; for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(x - cw2 * 0.3 + i * cw2 * 0.2, horizon - sh - cw2 * 0.12 - (i % 2) * 8, 6, 0, 7); c.fill(); } continue; }
      c.fillStyle = col; c.beginPath(); c.moveTo(x - tw / 2, 0); c.lineTo(x - tw / 2, horizon - 60); c.quadraticCurveTo(x - tw / 2, horizon - 10, x - tw * 0.9, horizon); c.lineTo(x + tw * 0.9, horizon); c.quadraticCurveTo(x + tw / 2, horizon - 10, x + tw / 2, horizon - 60); c.lineTo(x + tw / 2, 0); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.16)'; c.fillRect(x - tw / 2, 0, tw * 0.16, horizon - 64); c.fillStyle = 'rgba(40,50,130,0.16)'; c.fillRect(x + tw * 0.2, 0, tw * 0.3, horizon - 64); c.fillStyle = col;
      for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(x + (r() - 0.5) * tw * 2.6, r() * 50, 34 + r() * 34, 0, 7); c.fill(); }
      if (win) for (let i = 0; i < 3; i++) { const wy = horizon - 90 - r() * 200; c.fillStyle = '#fff0b0'; c.beginPath(); c.arc(x + (r() - 0.5) * tw * 0.5, wy, 3.4, 0, 7); c.fill(); halo(c, x, wy, 18, '255,240,170', 0.45); c.fillStyle = col; }
    }
    const m = c.createLinearGradient(0, horizon - 230, 0, horizon); m.addColorStop(0, 'rgba(200,245,240,0)'); m.addColorStop(1, 'rgba(200,245,240,0.6)'); c.fillStyle = m; c.fillRect(0, horizon - 230, w, 240);
  }
  // mid: nearer trunks with branches, mushroom towers, walkways hung with lanterns
  function mid(c, w, horizon) {
    const r = rng(404), LO = '#3a4682', xs = [];
    for (let x = 20; x < w; x += 300 + r() * 240) xs.push(x);
    for (let i = 0; i + 1 < xs.length; i++) if (r() < 0.75) {                // rope walkways first, so the trunks and towers stand in front of them
      const x0 = xs[i] + 26, x1 = xs[i + 1] - 26, y = horizon - 150 - r() * 120, mx = (x0 + x1) / 2;
      c.beginPath(); c.moveTo(x0, y); c.quadraticCurveTo(mx, y + 34, x1, y); c.lineWidth = 3; c.strokeStyle = LO; c.stroke(); c.beginPath(); c.moveTo(x0, y - 16); c.quadraticCurveTo(mx, y + 18, x1, y - 16); c.lineWidth = 1.4; c.stroke();
      for (let k = 1; k < 8; k++) { const t = k / 8, px = x0 + (x1 - x0) * t, py = y + 34 * 2 * t * (1 - t); c.beginPath(); c.moveTo(px, py); c.lineTo(px, py - 16); c.stroke(); if (k % 2) { c.fillStyle = k % 4 === 1 ? '#ffe9a0' : '#a8fff0'; c.beginPath(); c.arc(px, py + 7, 3.6, 0, 7); c.fill(); halo(c, px, py + 7, 20, '255,240,180', 0.36); } }
    }
    for (const x of xs) {
      const tw = 60 + r() * 50, col = ['#5c6cc0', '#6a62b8', '#5578b8'][Math.floor(r() * 3)];
      if (r() < 0.34) {                                                       // a mushroom tower
        const sh = 190 + r() * 120, cw2 = tw * 3.2; c.fillStyle = '#b9c4ec'; c.beginPath(); c.moveTo(x - tw * 0.36, horizon); c.lineTo(x - tw * 0.26, horizon - sh); c.lineTo(x + tw * 0.26, horizon - sh); c.lineTo(x + tw * 0.36, horizon); c.fill(); c.lineWidth = 2; c.strokeStyle = LO; c.stroke();
        c.beginPath(); c.moveTo(x - cw2 / 2, horizon - sh + 8); c.bezierCurveTo(x - cw2 / 2, horizon - sh - cw2 * 0.44, x + cw2 / 2, horizon - sh - cw2 * 0.44, x + cw2 / 2, horizon - sh + 8); c.quadraticCurveTo(x, horizon - sh - 12, x - cw2 / 2, horizon - sh + 8); c.fillStyle = ['#c06fa8', '#6fa8c8', '#b88a5f'][Math.floor(r() * 3)]; c.fill(); c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.5)'; for (let i = 0; i < 5; i++) { c.beginPath(); c.ellipse(x - cw2 * 0.32 + i * cw2 * 0.16, horizon - sh - cw2 * 0.14 - (i % 2) * 9, 9, 6, 0, 0, 7); c.fill(); }
        for (let i = 0; i < 3; i++) { const wy = horizon - 50 - i * 52; c.fillStyle = '#ffe9a0'; c.beginPath(); c.arc(x, wy, 6.5, 0, 7); c.fill(); c.lineWidth = 1.6; c.stroke(); halo(c, x, wy, 33, '255,236,160', 0.40); }
        continue;
      }
      c.fillStyle = col; c.beginPath(); c.moveTo(x - tw / 2, -10); c.lineTo(x - tw / 2, horizon - 80); c.quadraticCurveTo(x - tw / 2, horizon - 14, x - tw, horizon); c.lineTo(x + tw, horizon); c.quadraticCurveTo(x + tw / 2, horizon - 14, x + tw / 2, horizon - 80); c.lineTo(x + tw / 2, -10); c.closePath(); c.fill();
      c.fillStyle = 'rgba(24,26,80,0.2)'; c.fillRect(x + tw * 0.12, 0, tw * 0.38, horizon - 60); c.fillStyle = 'rgba(200,220,255,0.22)'; c.fillRect(x - tw / 2 + 2, 0, tw * 0.13, horizon - 76); c.lineWidth = 2; c.strokeStyle = LO; c.stroke();
      for (let i = 0; i < 7; i++) { const bx = x - tw * 0.3 + r() * tw * 0.6, by = 30 + r() * (horizon - 160); c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo(bx + 3, by + 26, bx - 1, by + 52); c.lineWidth = 1.2; c.strokeStyle = 'rgba(40,50,110,0.5)'; c.stroke(); }
      c.lineWidth = 2; c.strokeStyle = LO;
      for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(x + (r() - 0.5) * tw * 3.4, r() * 56, 40 + r() * 34, 0, 7); c.fillStyle = i % 2 ? '#4f8fa8' : '#447a9c'; c.fill(); }
      for (let i = 0; i < 2; i++) if (r() < 0.7) { const wy = horizon - 110 - r() * 190; c.fillStyle = '#ffe9a0'; c.beginPath(); c.arc(x - tw * 0.1, wy, 6, 0, 7); c.fill(); c.lineWidth = 1.6; c.strokeStyle = LO; c.stroke(); halo(c, x - tw * 0.1, wy, 33, '255,236,160', 0.40); }
    }
    const m = c.createLinearGradient(0, horizon - 120, 0, horizon); m.addColorStop(0, 'rgba(170,235,235,0)'); m.addColorStop(1, 'rgba(170,235,235,0.5)'); c.fillStyle = m; c.fillRect(0, horizon - 120, w, 130);
  }

  // ---- the ground: turf over dark soil full of roots, stones and the odd crystal ----
  function ground(c, t, x0, x1, y1) {
    const y = t.y0;
    c.save(); c.beginPath(); c.rect(x0, y - 34, x1 - x0, y1 - y + 40); c.clip();
    if (t.kind === 'pit') {
      c.fillStyle = '#3d3657'; c.fillRect(x0, y, x1 - x0, y1 - y);
      for (let cx = Math.floor(x0 / 44) * 44; cx < x1 + 44; cx += 44) { const r = rng(cx * 13 + 3); c.beginPath(); c.ellipse(cx + r() * 30, y + 6 + r() * 8, 12 + r() * 12, 7 + r() * 5, 0, 0, 7); c.fillStyle = r() < 0.5 ? H.rock2 : '#565a7c'; c.fill(); c.lineWidth = 2; c.strokeStyle = O; c.stroke(); }
      c.restore(); return;
    }
    c.fillStyle = H.soil; c.fillRect(x0, y + 12, x1 - x0, y1 - y - 12);
    const sg = c.createLinearGradient(0, y, 0, y + 260); sg.addColorStop(0, 'rgba(20,12,44,0)'); sg.addColorStop(1, 'rgba(20,12,44,0.5)'); c.fillStyle = sg; c.fillRect(x0, y, x1 - x0, y1 - y);
    for (let cx = Math.floor((x0 - 110) / 110) * 110; cx < x1 + 110; cx += 110) {
      const r = rng(cx * 31 + y * 7 + 5);
      c.beginPath(); let rx = cx + r() * 80, ry = y + 14; c.moveTo(rx, ry); for (let i = 0; i < 4; i++) { rx += (r() - 0.5) * 34; ry += 16 + r() * 16; c.lineTo(rx, ry); } c.lineWidth = 5.5; c.strokeStyle = O; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(); c.lineWidth = 2.8; c.strokeStyle = H.bark; c.stroke();     // a root
      for (let i = 0; i < 2; i++) { const sx = cx + r() * 100, sy = y + 44 + r() * 150, sw = 12 + r() * 20; blob(c, [sx - sw, sy + sw * 0.5, sx - sw * 0.7, sy - sw * 0.5, sx + sw * 0.5, sy - sw * 0.6, sx + sw, sy + sw * 0.2, sx + sw * 0.3, sy + sw * 0.7], i ? H.rock2 : '#6a6488', 2); }
      if (r() < 0.45) { const kx = cx + r() * 90, ky = y + 60 + r() * 90; for (const [dx, hh] of [[-7, 12], [0, 20], [7, 10]]) poly(c, [kx + dx - 4, ky, kx + dx, ky - hh, kx + dx + 4, ky], '#9fe8f2', 1.6); halo(c, kx, ky - 8, 45, '150,235,255', 0.29); }
      line(c, [cx + r() * 60, y + 30 + r() * 40, cx + 30 + r() * 70, y + 34 + r() * 40], 1.2, 'rgba(20,12,44,0.5)');
    }
    // turf: a thick mat with a scalloped underside, a bright lip and blades standing on it
    c.fillStyle = H.leaf2; c.fillRect(x0, y, x1 - x0, 14);
    c.beginPath(); for (let x = Math.floor(x0 / 26) * 26; x < x1 + 26; x += 26) { c.moveTo(x, y + 13); c.arc(x + 13, y + 13, 13, Math.PI, 0, true); } c.fillStyle = H.leaf2; c.fill(); c.lineWidth = 2.2; c.strokeStyle = O; c.stroke();
    c.fillStyle = H.leaf2; c.fillRect(x0, y + 1, x1 - x0, 13);
    c.fillStyle = H.leaf; c.fillRect(x0, y, x1 - x0, 7); c.fillStyle = H.leafL; c.fillRect(x0, y, x1 - x0, 2.6);
    for (let x = Math.floor(x0 / 17) * 17; x < x1 + 17; x += 17) { const k = ((x * 2654435761) >>> 0) % 7; if (k < 3) poly(c, [x - 3, y + 1, x - 1 + k, y - 7 - k * 2, x + 3, y + 1], H.leaf, 1.4); }
    line(c, [x0, y, x1, y], 2.8);
    c.restore();
    for (const ex of [t.x0, t.x1]) if (t.face && ex > x0 - 60 && ex < x1 + 60) {          // an exposed bluff: a facing of rock slabs
      const s = ex === t.x0 ? 1 : -1, fr = rng(ex * 3 + 1); let yy = y + 12;
      while (yy < t.face) { const hh = Math.min(t.face - yy, 34 + fr() * 40), ww = 26 + fr() * 26; poly(c, [ex, yy, ex + s * ww, yy + 3, ex + s * (ww - 6), yy + hh - 3, ex, yy + hh], fr() < 0.5 ? H.rock : H.rock2, 2); line(c, [ex + s * 6, yy + hh * 0.3, ex + s * ww * 0.6, yy + hh * 0.45], 1.1, 'rgba(43,48,68,0.45)'); yy += hh; }
      for (const [dx, len] of [[10, 46], [26, 28], [44, 62]]) { let px = ex + s * dx, py = y + 10; c.beginPath(); c.moveTo(px, py); for (let i = 0; i < len / 10; i++) { px += (fr() - 0.5) * 6; py += 10; c.lineTo(px, py); } c.lineWidth = 3.6; c.strokeStyle = O; c.stroke(); c.lineWidth = 1.8; c.strokeStyle = H.moss; c.stroke(); disc(c, px, py + 3, 3.6, H.moss, 1.3); }
    }
    for (const ex of [t.x0, t.x1]) if (ex > x0 - 2 && ex < x1 + 2) { line(c, [ex, y, ex, t.face || y1], 3.4); const s = ex === t.x0 ? -1 : 1; blob(c, [ex - s * 16, y - 2, ex - s * 4, y - 9, ex + s * 9, y - 2, ex + s * 10, y + 16, ex + s * 3, y + 26, ex - s * 3, y + 12], H.leaf, 2.2); }   // turf curling over an edge
  }

  const skyLights = (VW) => [{ x: VW * 0.63, y: 150, r: 260, color: '255,250,225', a: 0.7 }];       // the moon
  NN.hollow = { build, sky, far, mid, ground, skyLights };
})(window.NN = window.NN || {});
