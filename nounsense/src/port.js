/* Port: a harbour at sunset and a sky-pirate galleon moored in a quicksilver sea.
 *
 * Same recipe as the other scene painters: part functions, a "front" canvas
 * behind the characters, an "over" canvas in front of them, lights recorded
 * rather than painted. animate() draws what moves (pennants, buoys, gulls,
 * glitter on the water) and liveLights() reports the lights that blink.
 */
(function (NN) {
  'use strict';
  const { O, C, box, line, poly, disc, glow, rng, capture, win, door, lamp, icon } = NN.town.parts;
  const K = {
    plank: '#8a5a48', plank2: '#744838', plankL: '#a8745a', deck: '#c79a66', deck2: '#a97e50', hull: '#9a4044', hull2: '#7f3238', teal: '#3f8f93', teal2: '#2f7378', gold: '#e0b050', gold2: '#b8862e',
    sail: '#f6e6c8', sail2: '#e0c8a4', rope: '#5a4636', iron: '#55506a', iron2: '#3f3b52', rock: '#7a6a92', rock2: '#62547a', rockL: '#9a8ab0', cyan: '#8ff4e6', red: '#d0554f', cream: '#f6ead0', wall: '#7f6a9a', wall2: '#6a5684', roof: '#4f4470',
  };
  const G = 520, CY = '140,240,225', WARM = '255,214,150';

  // ---- parts ---------------------------------------------------------------------
  // a soft patch of light painted straight onto a distant layer (those layers get no real lights)
  function halo(c, x, y, r, rgb, a) { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
  function blob(c, pts, fill, lw) {
    const n = pts.length / 2; c.beginPath(); c.moveTo((pts[0] + pts[2 * n - 2]) / 2, (pts[1] + pts[2 * n - 1]) / 2);
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; c.quadraticCurveTo(pts[2 * i], pts[2 * i + 1], (pts[2 * i] + pts[2 * j]) / 2, (pts[2 * i + 1] + pts[2 * j + 1]) / 2); }
    c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (lw !== 0) { c.lineWidth = lw || 2.4; c.strokeStyle = O; c.lineJoin = 'round'; c.stroke(); }
  }
  // a wall of horizontal boards with a lit edge and a shaded foot
  function boards(c, x, y, w, h, a, b, step) {
    c.fillStyle = a; c.fillRect(x, y, w, h);
    for (let yy = y, i = 0; yy < y + h; yy += step || 16, i++) { if (i % 2) { c.fillStyle = b; c.fillRect(x, yy, w, Math.min(step || 16, y + h - yy)); } line(c, [x, yy, x + w, yy], 1.1, 'rgba(43,48,68,0.4)'); const j = ((i * 53) % 5) / 5; line(c, [x + w * (0.2 + j * 0.6), yy, x + w * (0.2 + j * 0.6), Math.min(yy + (step || 16), y + h)], 1.1, 'rgba(43,48,68,0.4)'); }
    const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(255,230,190,0.16)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(30,18,58,0.28)'); c.fillStyle = g; c.fillRect(x, y, w, h);
    c.lineWidth = 3.2; c.strokeStyle = O; c.lineJoin = 'round'; c.strokeRect(x, y, w, h);
  }
  function crate(c, x, y, w, h, col) { box(c, x, y - h, w, h, col || C.sand, 2.2); box(c, x + 4, y - h + 4, w - 8, h - 8, col ? col : C.sand2, 1.4); line(c, [x + 4, y - h + 4, x + w - 4, y - 4], 1.4); line(c, [x + w - 4, y - h + 4, x + 4, y - 4], 1.4); }
  function barrel(c, x, y, s, col) { const w = 26 * s, h = 34 * s; c.beginPath(); c.moveTo(x - w / 2 + 3, y); c.quadraticCurveTo(x - w / 2 - 4, y - h / 2, x - w / 2 + 3, y - h); c.lineTo(x + w / 2 - 3, y - h); c.quadraticCurveTo(x + w / 2 + 4, y - h / 2, x + w / 2 - 3, y); c.closePath(); c.fillStyle = col || K.plank; c.fill(); c.lineWidth = 2.2; c.strokeStyle = O; c.stroke(); for (const k of [0.24, 0.76]) line(c, [x - w / 2 - 0.5, y - h * k, x + w / 2 + 0.5, y - h * k], 3, K.iron); line(c, [x - 4 * s, y - h + 3, x - 5 * s, y - 3], 1, 'rgba(43,48,68,0.4)'); line(c, [x + 5 * s, y - h + 3, x + 6 * s, y - 3], 1, 'rgba(43,48,68,0.4)'); }
  function shipLantern(c, x, y, s, color) { s = s || 1; poly(c, [x - 7 * s, y, x + 7 * s, y, x + 4 * s, y - 6 * s, x - 4 * s, y - 6 * s], K.gold2, 1.8); box(c, x - 6 * s, y, 12 * s, 16 * s, color ? '#dffcf4' : C.lit, 1.8); line(c, [x, y, x, y + 16 * s], 1.1); poly(c, [x - 7 * s, y + 16 * s, x + 7 * s, y + 16 * s, x + 4 * s, y + 21 * s, x - 4 * s, y + 21 * s], K.gold2, 1.8); glow(c, x, y + 8 * s, 70 * s, 0.5, color); }
  function bulbs(c, x0, y0, x1, y1, sag, n) {
    c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + sag * 2, x1, y1); c.lineWidth = 1.8; c.strokeStyle = O; c.stroke();
    const cols = [[C.lit, WARM], ['#ff9f8a', '255,150,130'], [K.cyan, CY], [C.lit, WARM]];
    for (let i = 1; i < n; i++) { const t = i / n, x = x0 + (x1 - x0) * t, y = (1 - t) * (1 - t) * y0 + 2 * t * (1 - t) * ((y0 + y1) / 2 + sag * 2) + t * t * y1; line(c, [x, y, x, y + 5], 1.2); c.beginPath(); c.ellipse(x, y + 10, 4.6, 6, 0, 0, 7); c.fillStyle = cols[i % 4][0]; c.fill(); c.lineWidth = 1.5; c.strokeStyle = O; c.stroke(); glow(c, x, y + 10, 15, 0.34, cols[i % 4][1]); }
  }
  // a mast with yards, sails, a crow's nest and ratlines down to the rail
  function mast(c, x, deck, h, o) {
    const top = deck - h;
    for (const s of [-1, 1]) { const fx = x + s * (o.spread || 120); line(c, [x, top + 70, fx, deck - 4], 2); line(c, [x - s * 10, top + 70, fx - s * 26, deck - 4], 2); for (let i = 1; i < 9; i++) { const t = i / 9; line(c, [x + (fx - x) * t, top + 70 + (deck - 4 - top - 70) * t, x - s * 10 + (fx - s * 26 - x + s * 10) * t, top + 70 + (deck - 4 - top - 70) * t], 1.3); } }
    box(c, x - 8, top, 16, h, K.plank, 2.6); c.fillStyle = 'rgba(30,18,58,0.25)'; c.fillRect(x + 1, top, 7, h); for (let y = top + 50; y < deck - 20; y += 86) box(c, x - 10, y, 20, 7, K.iron, 1.8);
    for (const [dy, hw, sh, furled] of o.sails) {
      const y = top + dy;
      box(c, x - hw - 8, y - 5, hw * 2 + 16, 9, K.plank2, 2.2);
      if (furled) {                                                                 // rolled up along the yard and tied off
        c.beginPath(); c.moveTo(x - hw + 2, y + 4); for (let bx = x - hw + 2; bx < x + hw - 2; bx += 24) c.quadraticCurveTo(bx + 12, y + 26, Math.min(bx + 24, x + hw - 2), y + 5); c.lineTo(x + hw - 2, y + 4); c.closePath(); c.fillStyle = K.sail; c.fill(); c.lineWidth = 2.4; c.strokeStyle = O; c.lineJoin = 'round'; c.stroke();
        for (let bx = x - hw + 14; bx < x + hw - 6; bx += 24) line(c, [bx, y + 3, bx, y + 15], 2.2, K.rope);
        continue;
      }
      const p = () => { c.beginPath(); c.moveTo(x - hw, y + 4); c.lineTo(x + hw, y + 4); c.quadraticCurveTo(x + hw + 12, y + sh * 0.5, x + hw - 4, y + sh); c.quadraticCurveTo(x, y + sh - 18, x - hw + 4, y + sh); c.quadraticCurveTo(x - hw - 12, y + sh * 0.5, x - hw, y + 4); c.closePath(); };
      p(); const g = c.createLinearGradient(0, y, 0, y + sh); g.addColorStop(0, '#fff3dc'); g.addColorStop(0.55, '#fbe0c0'); g.addColorStop(1, '#f7b9a8'); c.fillStyle = g; c.fill();   // cream, warming to sunset pink at the foot
      c.save(); c.clip(); c.fillStyle = 'rgba(150,80,110,0.12)'; c.fillRect(x + hw * 0.3, y, hw, sh + 4);
      { const bg = c.createLinearGradient(0, y + sh * 0.4, 0, y + sh); bg.addColorStop(0, 'rgba(120,56,110,0)'); bg.addColorStop(1, 'rgba(150,70,110,0.16)'); c.fillStyle = bg; c.fillRect(x - hw - 12, y, hw * 2 + 24, sh + 4); c.fillStyle = 'rgba(255,250,235,0.4)'; c.fillRect(x - hw - 12, y, 18, sh + 4); }   // the belly of the sail falls into shade; the windward edge catches the sun
      for (let i = -3; i <= 3; i++) { const fx = x + i * hw * 0.27; const fg = c.createLinearGradient(fx - 14, 0, fx + 14, 0); fg.addColorStop(0, 'rgba(110,60,110,0)'); fg.addColorStop(0.5, 'rgba(150,80,110,0.16)'); fg.addColorStop(1, 'rgba(255,255,255,0.1)'); c.fillStyle = fg; c.fillRect(fx - 14, y, 28, sh + 4); line(c, [fx, y + 6, fx + i * 1.5, y + sh], 1.1, 'rgba(120,90,80,0.4)'); }   // seams, with the cloth bellying between them
      const cs = c.createLinearGradient(0, y, 0, y + 26); cs.addColorStop(0, 'rgba(70,30,90,0.34)'); cs.addColorStop(1, 'rgba(70,30,90,0)'); c.fillStyle = cs; c.fillRect(x - hw - 12, y, hw * 2 + 24, 26);                        // shadow under the yard
      for (const k of [0.3, 0.52]) { line(c, [x - hw, y + sh * k, x + hw, y + sh * k], 1.2, 'rgba(120,90,80,0.45)'); for (let tx = x - hw + 10; tx < x + hw - 4; tx += 17) line(c, [tx, y + sh * k, tx - 1, y + sh * k + 9], 1.6, K.rope); }   // reef points
      if (o.patch) for (const [px, py, pw, ph, col] of [[-hw * 0.56, sh * 0.62, 26, 20, '#d9a878'], [hw * 0.3, sh * 0.7, 20, 24, '#c9b48a']]) { c.fillStyle = col; c.fillRect(x + px, y + py, pw, ph); c.setLineDash([4, 3]); c.lineWidth = 1.3; c.strokeStyle = K.rope; c.strokeRect(x + px + 2, y + py + 2, pw - 4, ph - 4); c.setLineDash([]); } if (o.mark) icon(c, o.mark, x, y + sh * 0.48, Math.min(26, sh * 0.3)); c.restore();
      p(); c.lineWidth = 2.8; c.strokeStyle = O; c.stroke();
      glow(c, x, y + sh * 0.5, hw * 0.75, 0.3, '255,214,180');                   // the low sun on the canvas, so it stays cream under the cool ambient light
      line(c, [x - hw + 4, y + sh, x - hw - 6, y + sh + 26], 1.4); line(c, [x + hw - 4, y + sh, x + hw + 6, y + sh + 26], 1.4);
    }
    if (o.nest) { const y = top + o.nest; poly(c, [x - 26, y, x + 26, y, x + 20, y + 22, x - 20, y + 22], K.plank2, 2.4); box(c, x - 28, y - 4, 56, 6, K.plankL, 2); shipLantern(c, x + 30, y + 2, 0.8); }
    disc(c, x, top - 3, 6, K.gold, 2);
  }

  // ---- the scene -----------------------------------------------------------------
  function paint(L, scale) {
    const W = L.W, DECK = L.goal.y, top = L.sky - 130, h = G + 24 - top, HX = L.terrain.find((t) => t.kind === 'hull').x0;
    const mk = () => { const cv = document.createElement('canvas'); cv.width = Math.ceil(W * scale); cv.height = Math.ceil(h * scale); const c = cv.getContext('2d'); c.scale(scale, scale); c.translate(0, -top); return [cv, c]; };
    const [cv, c] = mk(), [ocv, d] = mk(), r = rng(4242), sea = L.water[0];

    // --- the quay ---
    // harbour office: boards, lit windows, a signal mast on the roof
    { const x = 14, w = 196, y = G - 250;
      boards(c, x, y, w, 250, K.wall, K.wall2, 18);
      poly(c, [x - 14, y, x + w / 2, y - 62, x + w + 14, y], K.roof, 3); for (let i = 1; i < 5; i++) line(c, [x - 14 + i * 9, y - i * 12 + 2, x + w + 14 - i * 9, y - i * 12 + 2], 1.2, 'rgba(255,255,255,0.14)');
      win(c, x + 22, y + 26, 40, 50, { lit: 1 }); win(c, x + 78, y + 26, 40, 50, { lit: 1, inside: 'shelf' }); win(c, x + 134, y + 26, 40, 50, {}); glow(c, x + 60, y + 50, 90, 0.4);
      box(c, x + 16, y + 100, w - 32, 30, K.cream, 2.4); c.font = '700 15px "Bangers", "Comic Neue", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = O; c.fillText('PORT NEBULA', x + w / 2, y + 116);
      door(c, x + 120, G - 92, 46, 92, K.teal, true); win(c, x + 24, G - 96, 64, 56, { lit: 1 }); glow(c, x + 56, G - 68, 80, 0.4);
      line(c, [x + w / 2, y - 62, x + w / 2, y - 150], 3); line(c, [x + w / 2 - 30, y - 124, x + w / 2 + 30, y - 124], 2.4); disc(c, x + w / 2, y - 152, 5, K.red, 1.8); glow(c, x + w / 2, y - 152, 22, 0.26, '255,120,100');
      for (const [fx, col] of [[-30, K.gold], [-12, K.cyan], [10, K.red], [28, K.cream]]) poly(c, [x + w / 2 + fx - 6, y - 122, x + w / 2 + fx + 6, y - 122, x + w / 2 + fx, y - 106], col, 1.6);
    }
    // the crane, with a crate on the hook
    { const x = 300, jy = G - 340;
      for (let y = G; y > jy + 20; y -= 40) { line(c, [x - 16, y, x + 16, y - 40], 2.2, K.iron); line(c, [x + 16, y, x - 16, y - 40], 2.2, K.iron); }
      line(c, [x - 16, G, x - 16, jy], 5); line(c, [x - 16, G, x - 16, jy], 2.6, K.iron); line(c, [x + 16, G, x + 16, jy], 5); line(c, [x + 16, G, x + 16, jy], 2.6, K.iron);
      box(c, x - 34, jy - 44, 68, 46, '#c8a04e', 2.6); win(c, x - 22, jy - 34, 30, 24, { lit: 1 }); glow(c, x - 8, jy - 22, 50, 0.4);
      poly(c, [x + 34, jy - 30, x + 250, jy - 58, x + 250, jy - 48, x + 34, jy - 8], '#c8a04e', 2.6); for (let i = 0; i < 6; i++) line(c, [x + 50 + i * 34, jy - 30 - i * 4.4 + 18 - i * 2.6, x + 68 + i * 34, jy - 32 - i * 4.6], 1.4);
      line(c, [x - 34, jy - 30, x - 90, jy - 6], 4); box(c, x - 104, jy - 14, 26, 26, K.iron, 2.2);
      line(c, [x + 236, jy - 50, x + 236, G - 236], 1.8); poly(c, [x + 230, G - 236, x + 242, G - 236, x + 236, G - 224], K.iron, 1.6); line(c, [x + 236, G - 226, x + 212, G - 204], 1.4); line(c, [x + 236, G - 226, x + 260, G - 204], 1.4); crate(c, x + 210, G - 160, 52, 44, '#b98a5a');
      disc(c, x + 250, jy - 53, 4, K.red, 1.6); glow(c, x + 250, jy - 53, 20, 0.26, '255,120,100');
    }
    // cargo left on the quay
    crate(c, 396, G, 46, 40); crate(c, 440, G, 40, 34, '#b98a5a'); crate(c, 408, G - 40, 38, 32, '#c9a070'); barrel(c, 500, G, 1.1); barrel(c, 528, G, 1, K.teal2); barrel(c, 226, G, 1);
    for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(566, G - 6 - i * 7, 17, 6, 0, 0, 7); c.fillStyle = '#c9a674'; c.fill(); c.lineWidth = 2; c.strokeStyle = O; c.stroke(); }
    bulbs(c, 210, G - 190, 284, G - 300, 14, 6); bulbs(c, 316, G - 300, 590, G - 110, 30, 10);

    // --- out in the bay: a rock with a light on it ---
    { const x = (sea.x0 + sea.x1) / 2 + 40;
      poly(c, [x - 70, G + 24, x - 58, G - 40, x - 30, G - 70, x - 34, G - 130, x - 6, G - 168, x + 22, G - 150, x + 30, G - 90, x + 56, G - 60, x + 74, G + 24], K.rock2, 3);
      poly(c, [x - 58, G - 40, x - 30, G - 70, x - 34, G - 130, x - 6, G - 168, x - 2, G - 60, x - 20, G + 24, x - 70, G + 24], K.rockL, 1.6); poly(c, [x - 2, G - 60, x + 22, G - 150, x + 30, G - 90, x + 20, G + 24, x - 20, G + 24], K.rock, 1.6);
      box(c, x - 12, G - 214, 20, 48, K.cream, 2.4); box(c, x - 12, G - 198, 20, 9, K.red, 1.4); box(c, x - 15, G - 226, 26, 13, C.lit, 2); poly(c, [x - 17, G - 226, x - 2, G - 242, x + 13, G - 226], K.red, 2);
    }

    // --- the galleon ---
    // bowsprit and figurehead reach out over the water
    line(c, [HX + 30, DECK - 6, HX - 150, DECK - 96], 9); line(c, [HX + 30, DECK - 6, HX - 150, DECK - 96], 5, K.plankL);
    poly(c, [HX + 6, DECK + 4, HX - 44, DECK + 10, HX - 78, DECK - 18, HX - 60, DECK - 46, HX - 24, DECK - 40, HX + 6, DECK - 24], K.gold, 2.6); disc(c, HX - 50, DECK - 22, 5, K.cyan, 1.6); glow(c, HX - 50, DECK - 22, 36, 0.4, CY);
    poly(c, [HX - 78, DECK - 18, HX - 104, DECK - 30, HX - 84, DECK - 34, HX - 100, DECK - 52, HX - 60, DECK - 46], K.gold2, 2.2);
    // the far-side rail: behind everyone, so nobody on deck is hidden by it
    for (let x = HX + 14; x < W; x += 26) box(c, x - 3, DECK - 30, 6, 30, K.plank2, 1.6);
    box(c, HX, DECK - 36, W - HX + 10, 8, K.plank, 2.2); line(c, [HX, DECK - 34, W, DECK - 34], 1.6, K.gold);
    // quarterdeck cabin at the stern
    { const x = 2420, w = W - x + 40, y = DECK - 150;
      boards(c, x, y, w, 150, K.hull, K.hull2, 16);
      box(c, x - 8, y - 12, w + 16, 14, K.gold, 2.6); for (let bx = x + 6; bx < W; bx += 18) box(c, bx, y - 36, 5, 24, K.plankL, 1.4); box(c, x - 4, y - 42, w + 8, 7, K.plankL, 2);
      for (const wx of [x + 22, x + 124]) { box(c, wx - 4, y + 28, 58, 62, K.gold2, 2.2); c.fillStyle = C.lit; c.fillRect(wx, y + 32, 50, 54); c.fillStyle = C.lit2; c.fillRect(wx, y + 62, 50, 24); for (let i = 1; i < 3; i++) { line(c, [wx + i * 16.6, y + 32, wx + i * 16.6, y + 86], 1.6); line(c, [wx, y + 32 + i * 18, wx + 50, y + 32 + i * 18], 1.6); } c.lineWidth = 2; c.strokeStyle = O; c.strokeRect(wx, y + 32, 50, 54); glow(c, wx + 25, y + 58, 96, 0.46); }
      door(c, x + 80, DECK - 84, 38, 84, K.teal, true);
      shipLantern(c, x + 4, y + 10, 1.3);
      // the ship's wheel
      const wx = x - 60, wy = DECK - 50; box(c, wx - 5, wy, 10, 50, K.plank2, 2); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; line(c, [wx, wy, wx + Math.cos(a) * 30, wy + Math.sin(a) * 30], 3.4); line(c, [wx, wy, wx + Math.cos(a) * 30, wy + Math.sin(a) * 30], 1.6, K.plankL); } disc(c, wx, wy, 22, null, 5); c.beginPath(); c.arc(wx, wy, 22, 0, 7); c.lineWidth = 2.6; c.strokeStyle = K.plankL; c.stroke(); disc(c, wx, wy, 6, K.gold, 2);
    }
    // an engine amidships: this ship flies when it wants to
    { const x = 1930, y = DECK;
      box(c, x - 46, y - 58, 92, 58, K.iron, 2.6); box(c, x - 52, y - 66, 104, 10, K.gold2, 2.2); for (let i = 0; i < 4; i++) { box(c, x - 36 + i * 20, y - 46, 12, 30, '#1f2a44', 1.6); c.fillStyle = K.cyan; c.fillRect(x - 34 + i * 20, y - 44 + (i % 2) * 8, 8, 14); } glow(c, x, y - 30, 90, 0.5, CY);
      box(c, x - 14, y - 150, 28, 86, K.iron2, 2.6); box(c, x - 19, y - 158, 38, 10, K.gold2, 2.2); line(c, [x - 14, y - 110, x + 14, y - 110], 2); line(c, [x + 46, y - 30, x + 76, y - 30, x + 76, y - 4], 5); line(c, [x + 46, y - 30, x + 76, y - 30, x + 76, y - 4], 2.4, K.gold);
      disc(c, x - 30, y - 80, 9, K.gold, 2); line(c, [x - 30, y - 80, x - 26, y - 86], 1.6);
    }
    const furl = L.sails === 'furled' ? 1 : 0;                  // lower sails set unless a level asks otherwise: side by side, set sails read as a ship
    mast(c, 1760, DECK, 520, { spread: 130, nest: 96, patch: 1, sails: [[150, 110, 120, 1], [290, 136, 104, furl]] });
    mast(c, 2150, DECK, 560, { spread: 140, nest: 110, mark: 'star', sails: [[60, 84, 84, 1], [170, 124, 128, 1], [318, 150, 108, furl]] });
    // deck clutter: a cannon at the bow, hatch, barrels
    { const x = 1590, y = DECK; poly(c, [x - 30, y - 8, x + 26, y - 8, x + 34, y, x - 38, y], K.plank2, 2.2); disc(c, x - 20, y - 6, 9, K.plank, 2.2); disc(c, x + 16, y - 6, 9, K.plank, 2.2); c.save(); c.translate(x, y - 22); c.rotate(-0.12); box(c, -52, -10, 84, 20, K.iron, 2.6); box(c, -58, -13, 10, 26, K.iron2, 2.2); box(c, 18, -12, 8, 24, K.iron2, 2); disc(c, 36, 0, 7, K.iron2, 2.2); c.restore(); for (const [bx, by] of [[x + 52, y - 6], [x + 64, y - 6], [x + 58, y - 16]]) disc(c, bx, by, 6, K.iron2, 1.8); }
    box(c, 2010, DECK - 10, 70, 10, K.plank2, 2.2); for (let i = 1; i < 7; i++) line(c, [2010 + i * 10, DECK - 10, 2010 + i * 10, DECK], 1.3);
    barrel(c, 1674, DECK, 1.1); barrel(c, 2344, DECK, 1, K.teal2); crate(c, 1840, DECK, 40, 34); crate(c, 2296, DECK, 34, 30, '#b98a5a');
    bulbs(c, 1788, DECK - 416, 2122, DECK - 442, 60, 13); bulbs(c, 2178, DECK - 442, 2420, DECK - 186, 44, 10);   // strung between the crow's nests and down to the cabin rail
    shipLantern(c, 1520, DECK - 62, 1.1); line(c, [1520, DECK - 62, 1520, DECK - 4], 3);

    // ---- in front of the characters ----
    for (const lx of [372, 596]) lamp(d, lx, G);
    for (const bx of [604, 30]) { box(d, bx - 8, G - 22, 16, 22, K.iron, 2.2); box(d, bx - 11, G - 27, 22, 7, K.iron2, 2); }
    // lights along the hull, recorded here so they are static
    for (let x = HX + 120; x < W; x += 150) glow(c, x, DECK + 45, 36, 0.42, CY);
    return { cv, ocv, top, h };
  }

  function build(L, scale) {
    const res = capture(() => paint(L, scale)), o = res.out, sea = L.water[0], DECK = L.goal.y, RX = (sea.x0 + sea.x1) / 2 + 40;
    const buoys = [[sea.x0 + 150, 0], [sea.x0 + 560, 2], [sea.x1 - 190, 4]], gr = rng(99), gulls = [];
    for (let i = 0; i < 5; i++) gulls.push({ y: -40 + gr() * 220, sp: 14 + gr() * 16, a: gr() * 6.3, off: gr() * L.W });
    const pennants = [[1760, DECK - 520, '#d0554f'], [2150, DECK - 560, '#e0b050']];
    function animate(ctx, t, layer, cam, WW) {
      const vis = (x, pad) => x > cam.x - (pad || 60) && x < cam.x + WW + (pad || 60);
      if (layer === 'back') {
        for (const [x, y, col] of pennants) if (vis(x, 80)) {                    // pennants streaming from the mastheads
          ctx.beginPath(); ctx.moveTo(x, y - 14);
          for (let i = 1; i <= 6; i++) ctx.lineTo(x + i * 9, y - 14 + Math.sin(t * 5 - i * 0.9) * (1 + i * 0.7));
          for (let i = 6; i >= 1; i--) ctx.lineTo(x + i * 9, y - 14 + 12 - i * 1.6 + Math.sin(t * 5 - i * 0.9) * (1 + i * 0.7));
          ctx.lineTo(x, y); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = O; ctx.lineJoin = 'round'; ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x, y + 2); ctx.lineTo(x, y - 20); ctx.lineWidth = 2.4; ctx.stroke();
        }
        for (const g of gulls) { const x = ((g.off + t * g.sp) % (L.W + 200)) - 100, y = g.y + Math.sin(t * 0.7 + g.a) * 14, f = Math.sin(t * 6 + g.a) * 5; if (!vis(x)) continue; ctx.beginPath(); ctx.moveTo(x - 10, y - 3 + f); ctx.quadraticCurveTo(x - 4, y - 8, x, y); ctx.quadraticCurveTo(x + 4, y - 8, x + 10, y - 3 + f); ctx.lineWidth = 2.2; ctx.strokeStyle = '#4b3f66'; ctx.lineCap = 'round'; ctx.stroke(); }
        if (vis(RX, 200)) { const a = Math.sin(t * 1.2) * 0.5; ctx.save(); ctx.translate(RX - 2, G - 219); ctx.rotate(a); ctx.globalAlpha = 0.16; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-240, -30); ctx.lineTo(-240, 30); ctx.closePath(); ctx.fillStyle = '#fff3c0'; ctx.fill(); ctx.restore(); }   // the light on the rock sweeps
        return;
      }
      if (layer !== 'top') for (const [x, ph] of buoys) if (vis(x)) {
        const y = sea.y + Math.sin(t * 2 + ph) * 3, tilt = Math.sin(t * 1.6 + ph) * 0.12;
        ctx.save(); ctx.translate(x, y); ctx.rotate(tilt);
        ctx.beginPath(); ctx.moveTo(-13, 4); ctx.lineTo(-9, -14); ctx.lineTo(9, -14); ctx.lineTo(13, 4); ctx.closePath(); ctx.fillStyle = '#d0554f'; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = O; ctx.stroke();
        ctx.fillStyle = '#f6ead0'; ctx.fillRect(-10.5, -8, 21, 5); ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(0, -28); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, -31, 4.6, 0, 7); ctx.fillStyle = Math.sin(t * 2.4 + ph) > 0 ? '#fff3a0' : '#8a7a5a'; ctx.fill(); ctx.stroke(); ctx.restore();
      }
      if (layer === 'top') { const sx = cam.x + WW * 0.74; if (sx > sea.x0 + 50 && sx < sea.x1 - 50) for (let i = 0; i < 9; i++) { const w = 120 - i * 9 + Math.sin(t * 2.2 + i * 1.3) * 12; ctx.globalAlpha = 0.9 - i * 0.07; ctx.fillStyle = '#fff0cc'; ctx.fillRect(Math.max(sea.x0, sx - w / 2), sea.y + 5 + i * 8, Math.min(w, sea.x1 - sx + w / 2), 3); } ctx.globalAlpha = 1; }   // the sun's path across the bay
      // sunset glitter on the water: short bright dashes that come and go
      if (layer === 'top') for (let i = 0; i < 46; i++) { const x = sea.x0 + 14 + ((i * 197) % (sea.x1 - sea.x0 - 28)), y = sea.y + 8 + ((i * 53) % 46), k = Math.sin(t * (1.4 + (i % 5) * 0.3) + i * 1.7); if (k < 0.2 || !vis(x)) continue; ctx.globalAlpha = (k - 0.2) * 0.9; ctx.fillStyle = i % 3 ? '#fff0d0' : '#ffd0e8'; ctx.fillRect(x, y, 10 + (i % 4) * 5, 2.2); }
      ctx.globalAlpha = 1;
    }
    function liveLights(t) {
      const out = [{ x: RX - 2, y: G - 219, r: 110 + Math.sin(t * 1.2) * 20, a: 0.6, color: '255,236,170' }];
      for (const [x, ph] of buoys) out.push({ x, y: sea.y - 30, r: 46, a: Math.sin(t * 2.4 + ph) > 0 ? 0.55 : 0.05, color: '255,240,150' });
      return out;
    }
    return { front: { cv: o.cv, top: o.top, h: o.h }, over: { cv: o.ocv, top: o.top, h: o.h }, lights: res.lights, animate, liveLights };
  }

  // ---- sky and distance ----------------------------------------------------------
  function sky(c, VW, VH) {
    const g = c.createLinearGradient(0, 0, 0, VH * 0.86); g.addColorStop(0, '#4a3aa0'); g.addColorStop(0.4, '#a060b8'); g.addColorStop(0.72, '#ff9a86'); g.addColorStop(1, '#ffe2b0'); c.fillStyle = g; c.fillRect(0, 0, VW, VH);
    const r = rng(21); c.fillStyle = '#fff6e0'; for (let i = 0; i < 70; i++) { const y = r() * VH * 0.4; c.globalAlpha = 1 - y / (VH * 0.42); c.beginPath(); c.arc(r() * VW, y, 0.6 + r() * 1.3, 0, 7); c.fill(); } c.globalAlpha = 1;
    // a ringed giant hanging over the bay
    const px = VW * 0.24, py = 150, pr = 104;
    c.save(); c.translate(px, py); c.rotate(-0.34);
    c.beginPath(); c.ellipse(0, 0, pr * 1.9, pr * 0.42, 0, Math.PI, 0); c.lineWidth = 15; c.strokeStyle = 'rgba(255,225,200,0.45)'; c.stroke(); c.lineWidth = 4; c.strokeStyle = 'rgba(255,240,220,0.7)'; c.stroke();
    c.beginPath(); c.arc(0, 0, pr, 0, 7); const pg = c.createLinearGradient(-pr, -pr, pr, pr); pg.addColorStop(0, '#ffd6c0'); pg.addColorStop(0.6, '#d890c0'); pg.addColorStop(1, '#8a60b0'); c.fillStyle = pg; c.fill();
    c.save(); c.clip(); for (const [by, bh, col] of [[-60, 16, 'rgba(255,255,255,0.22)'], [-22, 24, 'rgba(160,80,150,0.28)'], [22, 14, 'rgba(255,255,255,0.18)'], [52, 22, 'rgba(120,70,150,0.3)']]) { c.fillStyle = col; c.beginPath(); c.ellipse(0, by, pr * 1.1, bh, 0, 0, 7); c.fill(); } c.restore();
    c.lineWidth = 3; c.strokeStyle = 'rgba(90,60,130,0.6)'; c.beginPath(); c.arc(0, 0, pr, 0, 7); c.stroke();
    c.beginPath(); c.ellipse(0, 0, pr * 1.9, pr * 0.42, 0, 0, Math.PI); c.lineWidth = 15; c.strokeStyle = 'rgba(255,225,200,0.6)'; c.stroke(); c.lineWidth = 4; c.strokeStyle = 'rgba(255,245,230,0.9)'; c.stroke();
    c.restore();
    // the sun going down, and bars of cloud lit from below
    const sx = VW * 0.74, sy = VH * 0.74;
    for (const [rad, a] of [[170, 0.1], [120, 0.14], [84, 0.2]]) { c.fillStyle = `rgba(255,236,190,${a})`; c.beginPath(); c.arc(sx, sy, rad, 0, 7); c.fill(); }
    c.fillStyle = '#fff6d6'; c.beginPath(); c.arc(sx, sy, 52, 0, 7); c.fill();
    for (const [cx, cy, w, hh] of [[160, 330, 240, 16], [520, 250, 320, 20], [900, 300, 260, 16], [720, 400, 380, 18], [300, 420, 300, 14], [1000, 210, 200, 12]]) { c.fillStyle = 'rgba(110,60,140,0.55)'; c.beginPath(); c.ellipse(cx, cy, w / 2, hh / 2, 0, 0, 7); c.fill(); c.fillStyle = 'rgba(255,190,150,0.7)'; c.beginPath(); c.ellipse(cx, cy + hh * 0.28, w * 0.46, hh * 0.22, 0, 0, 7); c.fill(); }
  }
  // far: islands that float, and the open sea under them
  function far(c, w, horizon) {
    const r = rng(77);
    const sg = c.createLinearGradient(0, horizon, 0, horizon + 130); sg.addColorStop(0, '#ffc9a8'); sg.addColorStop(0.3, '#d890b8'); sg.addColorStop(1, '#8a68b8'); c.fillStyle = sg; c.fillRect(0, horizon, w, 200);
    c.fillStyle = 'rgba(255,245,225,0.55)'; for (let i = 0; i < 90; i++) { const y = horizon + 3 + r() * 100; c.fillRect(r() * w, y, 8 + (y - horizon) * 0.3 + r() * 14, 1.6); }
    for (let x = 60; x < w; x += 250 + r() * 260) {
      const iw = 90 + r() * 110, y = horizon - 150 - r() * 200, col = r() < 0.5 ? '#a98ac8' : '#b79ad0';
      c.fillStyle = col; c.beginPath(); c.moveTo(x - iw / 2, y); c.lineTo(x + iw / 2, y); c.lineTo(x + iw * 0.3, y + 26); c.lineTo(x + iw * 0.12, y + 70 + r() * 30); c.lineTo(x - iw * 0.1, y + 40); c.lineTo(x - iw * 0.3, y + 54); c.closePath(); c.fill();
      c.fillStyle = '#c8b0e0'; c.fillRect(x - iw / 2 - 4, y - 5, iw + 8, 7);
      c.fillStyle = col; c.fillRect(x - 8, y - 44, 16, 40); c.beginPath(); c.moveTo(x - 12, y - 44); c.lineTo(x, y - 62); c.lineTo(x + 12, y - 44); c.fill(); c.fillStyle = '#fff0b0'; c.fillRect(x - 3, y - 34, 6, 8);
      if (r() < 0.6) { c.fillStyle = col; c.fillRect(x + iw * 0.2, y - 26, 20, 22); c.fillStyle = '#fff0b0'; c.fillRect(x + iw * 0.2 + 6, y - 18, 5, 6); }
    }
  }
  // mid: the far shore of the harbour, with moored airships
  function mid(c, w, horizon) {
    const r = rng(404), LO = '#4a3a70';
    const sg = c.createLinearGradient(0, horizon, 0, horizon + 120); sg.addColorStop(0, '#c88ab8'); sg.addColorStop(1, '#7a5cae'); c.fillStyle = sg; c.fillRect(0, horizon + 2, w, 200);
    for (let x = -30; x < w; x += 70 + r() * 60) {                              // a paler row of taller houses further back
      const bw = 50 + r() * 50, bh = 110 + r() * 110; c.fillStyle = ['#a888c0', '#b494c4', '#9c84c2'][Math.floor(r() * 3)]; c.fillRect(x, horizon - bh, bw, bh);
      c.beginPath(); if (r() < 0.5) { c.moveTo(x - 4, horizon - bh); c.lineTo(x + bw / 2, horizon - bh - 30); c.lineTo(x + bw + 4, horizon - bh); } else { c.arc(x + bw / 2, horizon - bh, bw * 0.34, Math.PI, 0); } c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,230,170,0.7)'; for (let wy = horizon - bh + 12; wy < horizon - 70; wy += 22) for (let wx = x + 8; wx < x + bw - 12; wx += 16) if (r() < 0.4) c.fillRect(wx, wy, 6, 9);
    }
    for (let x = -20; x < w; x += 60 + r() * 50) {
      const bw = 46 + r() * 40, bh = 36 + r() * 80, col = ['#7a5c9a', '#8a6498', '#6c5a9c', '#94708e'][Math.floor(r() * 4)];
      c.fillStyle = col; c.fillRect(x, horizon - bh, bw, bh + 2); c.lineWidth = 1.8; c.strokeStyle = LO; c.strokeRect(x, horizon - bh, bw, bh + 2);
      const rk = Math.floor(r() * 3); c.beginPath(); if (rk === 0) { c.moveTo(x - 5, horizon - bh); c.lineTo(x + bw / 2, horizon - bh - 22 - r() * 20); c.lineTo(x + bw + 5, horizon - bh); } else if (rk === 1) { c.moveTo(x - 5, horizon - bh); c.lineTo(x + 4, horizon - bh - 16); c.lineTo(x + bw - 4, horizon - bh - 16); c.lineTo(x + bw + 5, horizon - bh); } else { c.moveTo(x - 3, horizon - bh); c.lineTo(x - 3, horizon - bh - 7); c.lineTo(x + bw + 3, horizon - bh - 7); c.lineTo(x + bw + 3, horizon - bh); } c.closePath(); c.fillStyle = ['#5a4884', '#6a4a7a', '#4f5488'][rk]; c.fill(); c.stroke();
      if (r() < 0.6) { const kx = x + bw * (0.2 + r() * 0.5); c.fillStyle = '#6a4a7a'; c.fillRect(kx, horizon - bh - 30, 9, 24); c.strokeRect(kx, horizon - bh - 30, 9, 24); }   // a chimney
      for (let wy = horizon - bh + 12; wy < horizon - 18; wy += 24) for (let wx = x + 9; wx < x + bw - 16; wx += 20) { const lit = r() < 0.45; c.fillStyle = lit ? '#ffe09a' : '#5a4a88'; c.fillRect(wx, wy, 10, 13); c.lineWidth = 1; c.strokeRect(wx, wy, 10, 13); if (lit) { halo(c, wx + 5, wy + 6, 22, '255,224,154', 0.29); c.fillStyle = 'rgba(255,224,154,0.3)'; c.fillRect(wx, horizon + 8 + (wy % 20), 10, 2); } }
      if (r() < 0.28) { c.lineWidth = 2.4; c.beginPath(); c.moveTo(x + bw * 0.5, horizon - bh - 20); c.lineTo(x + bw * 0.5, horizon - bh - 120); c.moveTo(x + bw * 0.5 - 26, horizon - bh - 96); c.lineTo(x + bw * 0.5 + 26, horizon - bh - 96); c.stroke(); }
    }
    for (const fx of [0.16, 0.5, 0.82]) {                                        // airships at their moorings
      const x = w * fx, y = horizon - 250 - ((fx * 97) % 60), s = 0.8 + ((fx * 31) % 5) / 10;
      c.beginPath(); c.ellipse(x, y, 92 * s, 34 * s, 0, 0, 7); c.fillStyle = ['#e08a7a', '#e0b060', '#7ab0c0'][Math.round(fx * 10) % 3]; c.fill(); c.lineWidth = 2.2; c.strokeStyle = LO; c.stroke();
      for (const k of [-0.5, 0, 0.5]) { c.beginPath(); c.ellipse(x + k * 92 * s, y, 12 * s, 33 * s, 0, 0, 7); c.lineWidth = 1.2; c.stroke(); }
      c.beginPath(); c.moveTo(x + 84 * s, y - 8 * s); c.lineTo(x + 112 * s, y - 24 * s); c.lineTo(x + 112 * s, y + 24 * s); c.lineTo(x + 84 * s, y + 8 * s); c.closePath(); c.fill(); c.lineWidth = 2; c.stroke();
      c.fillStyle = '#5a4884'; c.fillRect(x - 30 * s, y + 38 * s, 60 * s, 16 * s); c.strokeRect(x - 30 * s, y + 38 * s, 60 * s, 16 * s); c.lineWidth = 1.2; for (const k of [-24, 0, 24]) { c.beginPath(); c.moveTo(x + k * s, y + 32 * s); c.lineTo(x + k * s * 0.9, y + 38 * s); c.stroke(); }
      c.fillStyle = '#ffe09a'; for (const k of [-18, -4, 10]) c.fillRect(x + k * s, y + 42 * s, 7 * s, 7 * s);
    }
    for (let x = 90; x < w; x += 210 + r() * 190) {                              // boats tied up along the far shore
      const bw = 50 + r() * 34, by = horizon + 4;
      c.beginPath(); c.moveTo(x - bw / 2, by - 12); c.lineTo(x + bw / 2, by - 12); c.lineTo(x + bw / 2 - 9, by + 2); c.lineTo(x - bw / 2 + 7, by + 2); c.closePath(); c.fillStyle = ['#8a4a62', '#5a6a9c', '#9a7a52'][Math.floor(r() * 3)]; c.fill(); c.lineWidth = 1.8; c.strokeStyle = LO; c.stroke();
      c.beginPath(); c.moveTo(x, by - 12); c.lineTo(x, by - 70 - r() * 30); c.stroke(); c.beginPath(); c.moveTo(x + 2, by - 62); c.lineTo(x + bw * 0.4, by - 20); c.lineTo(x + 2, by - 20); c.closePath(); c.fillStyle = '#f2dcc0'; c.fill(); c.stroke();
      c.fillStyle = '#ffe09a'; c.beginPath(); c.arc(x - bw * 0.3, by - 18, 3, 0, 7); c.fill(); halo(c, x - bw * 0.3, by - 18, 18, '255,224,154', 0.36);
    }
  }

  // ---- ground: a timber quay on piles, and the side of the ship ----------------------
  function ground(c, t, x0, x1, y1) {
    const y = t.y0;
    if (t.kind === 'pit') { c.fillStyle = '#4a3a70'; c.fillRect(x0, y, x1 - x0, y1 - y); return; }
    c.save(); c.beginPath(); c.rect(x0, y - 4, x1 - x0, y1 - y + 8); c.clip();
    if (t.kind === 'hull') {
      c.fillStyle = K.hull; c.fillRect(x0, y, x1 - x0, y1 - y);
      for (let yy = y + 14, i = 0; yy < y1; yy += 22, i++) { if (i % 2) { c.fillStyle = K.hull2; c.fillRect(x0, yy, x1 - x0, 22); } line(c, [x0, yy, x1, yy], 1.6, 'rgba(43,48,68,0.55)'); for (let x = Math.floor(x0 / 130) * 130 + (i % 2 ? 65 : 0); x < x1; x += 130) line(c, [x, yy, x, yy + 22], 1.3, 'rgba(43,48,68,0.5)'); }
      c.fillStyle = K.teal; c.fillRect(x0, y + 62, x1 - x0, 20); line(c, [x0, y + 62, x1, y + 62], 2); line(c, [x0, y + 82, x1, y + 82], 2); for (let x = Math.floor(x0 / 30) * 30; x < x1; x += 30) disc(c, x + 15, y + 72, 2.6, K.gold, 1);
      for (let x = t.x0 + 120; x < x1 + 30; x += 150) if (x > x0 - 30) { disc(c, x, y + 45, 12, K.gold2, 2.4); disc(c, x, y + 45, 8, '#bff6ee', 2); line(c, [x - 5, y + 42, x - 1, y + 39], 1.6, 'rgba(255,255,255,0.9)'); }
      for (let x = t.x0 + 195; x < x1 + 40; x += 300) if (x > x0 - 40) { box(c, x - 15, y + 90, 30, 24, '#3a2030', 2.2); box(c, x - 18, y + 85, 36, 7, K.gold2, 1.8); disc(c, x, y + 103, 6, '#1f1420', 1.4); }                 // gun ports
      for (let x = Math.floor(x0 / 170) * 170; x < x1; x += 170) { const k = ((x * 2654435761) >>> 0) % 5; if (k < 2) { c.fillStyle = 'rgba(255,220,190,0.12)'; c.fillRect(x + 20, y + 36 + k * 44, 64, 22); c.setLineDash([4, 3]); c.lineWidth = 1.2; c.strokeStyle = 'rgba(43,48,68,0.6)'; c.strokeRect(x + 22, y + 38 + k * 44, 60, 18); c.setLineDash([]); } }   // patched planks
      if (t.x0 + 60 > x0 - 200 && t.x0 + 60 < x1 + 200) {
        const nx = t.x0 + 140; box(c, nx, y + 33, 112, 24, K.gold2, 2.2); box(c, nx + 3, y + 36, 106, 18, '#3a2030', 1.2); c.font = '700 13px "Bangers", "Comic Neue", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = K.gold; c.fillText('STAR  GULL', nx + 56, y + 45.5);   // her name
        const ax = t.x0 + 44; line(c, [ax, y + 30, ax, y + 90], 3.4); line(c, [ax, y + 30, ax, y + 90], 1.6, K.iron); disc(c, ax, y + 30, 5, K.iron, 1.6); c.beginPath(); c.arc(ax, y + 90, 14, 0.15, Math.PI - 0.15); c.lineWidth = 6; c.strokeStyle = O; c.stroke(); c.lineWidth = 3; c.strokeStyle = K.iron; c.stroke(); line(c, [ax - 9, y + 52, ax + 9, y + 52], 4); line(c, [ax - 9, y + 52, ax + 9, y + 52], 2, K.iron);   // the anchor
      }
      c.fillStyle = 'rgba(30,18,58,0.3)'; c.fillRect(x0, y + 160, x1 - x0, y1 - y);                 // below the waterline
      c.fillStyle = K.deck; c.fillRect(x0, y, x1 - x0, 16); c.fillStyle = K.deck2; c.fillRect(x0, y + 16, x1 - x0, 11); for (let x = Math.floor(x0 / 44) * 44; x < x1; x += 44) { line(c, [x, y + 1, x, y + 16], 1.2, 'rgba(43,48,68,0.45)'); disc(c, x + 22, y + 21.5, 2, K.gold2, 0.8); }
      c.fillStyle = 'rgba(255,244,214,0.4)'; c.fillRect(x0, y + 1, x1 - x0, 4); line(c, [x0, y, x1, y], 2.8); line(c, [x0, y + 16, x1, y + 16], 1.6); line(c, [x0, y + 27, x1, y + 27], 2.2);   // a lit top face and a darker front edge
      c.restore();
      if (t.x0 > x0 - 30) { box(c, t.x0 - 7, y - 2, 14, y1 - y, K.plank2, 2.6); for (let yy = y + 30; yy < y1; yy += 60) box(c, t.x0 - 9, yy, 18, 7, K.gold2, 1.8); }   // the stem post
      return;
    }
    // the quay: dark under the boards, piles and braces, a fender at the end
    c.fillStyle = '#35284a'; c.fillRect(x0, y, x1 - x0, y1 - y);
    for (let x = Math.floor(x0 / 96) * 96; x < x1 + 96; x += 96) {
      line(c, [x + 10, y + 30, x + 86, y + 100], 6); line(c, [x + 10, y + 30, x + 86, y + 100], 3.4, K.plank2); line(c, [x + 86, y + 30, x + 10, y + 100], 6); line(c, [x + 86, y + 30, x + 10, y + 100], 3.4, K.plank2);
      box(c, x - 8, y + 14, 16, y1 - y, K.plank, 2.4); c.fillStyle = 'rgba(30,18,58,0.25)'; c.fillRect(x + 1, y + 14, 7, y1 - y); box(c, x - 10, y + 40, 20, 6, K.iron, 1.6);
    }
    box(c, x0 - 4, y + 12, x1 - x0 + 8, 13, K.plank2, 2.4);
    c.fillStyle = K.deck; c.fillRect(x0, y, x1 - x0, 13); c.fillStyle = K.deck2; c.fillRect(x0, y + 9, x1 - x0, 4); for (let x = Math.floor(x0 / 38) * 38; x < x1; x += 38) line(c, [x, y + 1, x, y + 12], 1.2, 'rgba(43,48,68,0.45)');
    line(c, [x0, y, x1, y], 2.8);
    c.restore();
    if (t.x1 < x1 + 30) { box(c, t.x1 - 10, y - 2, 12, y1 - y, K.plankL, 2.6);  }
  }

  const skyLights = (VW, VH) => [{ x: VW * 0.74, y: VH * 0.74, r: 420, color: '255,214,170', a: 0.6 }, { x: VW * 0.24, y: 150, r: 220, color: '255,220,230', a: 0.35 }];   // the sun and the ringed giant
  NN.port = { build, sky, far, mid, ground, skyLights };
})(window.NN = window.NN || {});
