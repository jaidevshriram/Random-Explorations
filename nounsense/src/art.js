/* Art: every object is drawn from a short list of shapes with a wobbly ink
 * line over a slightly misregistered flat wash, like gouache and fineliner in a
 * sketchbook. Each sprite is rendered three times with different wobble and
 * cycled, so the linework "boils" a little while the game runs.
 *
 * Op format, in a -100..100 box scaled to the object's size:
 *   ['e', cx, cy, rx, ry, fill, rotDeg]   ellipse
 *   ['r', x, y, w, h, fill]               rectangle
 *   ['p', [x,y,...], fill]                closed polygon
 *   ['l', [x,y,...], widthPx, colour]     open line (ink if no colour)
 *   ['d', x, y, radiusPx, colour]         dot
 *   ['a', cx, cy, rx, ry, sweepDeg]       arc
 */
(function (NN) {
  'use strict';

  const P = {
    paper: '#f3ead3', ink: '#2a2520', white: '#fdf9ee', cream: '#f1e2b8', red: '#d8574a', orange: '#e9923c', yellow: '#f0c64a',
    green: '#86b35c', dgreen: '#4f7f4b', lime: '#b5d56a', teal: '#4fa59a', blue: '#5a97d0', sky: '#a9d3ea', navy: '#3c5578',
    purple: '#9571b3', pink: '#f0a3b4', brown: '#a9744c', dbrown: '#6f4b33', tan: '#dcb986', grey: '#aeaaa0', dgrey: '#5d5852', skin: '#f2c9a0',
  };

  function rng(seed) { let s = (seed >>> 0) || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

  // ---- rough drawing in pixel space ----------------------------------------
  function densify(pts, closed, step) {
    const out = [];
    const n = pts.length / 2;
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const x0 = pts[i * 2], y0 = pts[i * 2 + 1], x1 = pts[((i + 1) % n) * 2], y1 = pts[((i + 1) % n) * 2 + 1];
      const k = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
      for (let j = 0; j < k; j++) out.push(x0 + (x1 - x0) * j / k, y0 + (y1 - y0) * j / k);
    }
    if (!closed) out.push(pts[(n - 1) * 2], pts[(n - 1) * 2 + 1]);
    return out;
  }
  function ellipsePts(cx, cy, rx, ry, rot) {
    const n = Math.max(10, Math.min(40, Math.round((rx + ry) / 3) + 8));
    const out = [], c = Math.cos(rot || 0), s = Math.sin(rot || 0);
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
      out.push(cx + x * c - y * s, cy + x * s + y * c);
    }
    return out;
  }
  function trace(ctx, pts, closed, r, amp) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i] + (r() - 0.5) * 2 * amp, y = pts[i + 1] + (r() - 0.5) * 2 * amp;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    if (closed) ctx.closePath();
  }
  // one shape: wash first (offset, as if the paint missed the line), then ink twice
  function shape(ctx, pts, closed, o) {
    const r = o.r, amp = o.amp === undefined ? 0.45 : o.amp;
    if (o.fill) {
      ctx.fillStyle = o.fill; trace(ctx, pts, true, r, amp * 0.5); ctx.fill();
      if (o.shade) {
        // cel shading: a darker band along the lower-right inside edge
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]); }
        const size = Math.min(x1 - x0, y1 - y0);
        if (size > 11) {
          const d = Math.max(1.2, Math.min(5, size * 0.1));
          ctx.save(); ctx.clip(); ctx.translate(-d * 0.75, -d);
          ctx.strokeStyle = 'rgba(42,37,32,0.17)'; ctx.lineWidth = d * 2; ctx.lineJoin = 'round'; trace(ctx, pts, true, r, 0); ctx.stroke();
          ctx.restore();
        }
      }
    }
    if (o.lw === 0) return;
    const lw = o.lw || 2.3;
    ctx.strokeStyle = o.ink || P.ink; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (o.color) { ctx.lineWidth = lw + 2.8; trace(ctx, pts, closed, r, amp); ctx.stroke(); ctx.strokeStyle = o.color; ctx.lineWidth = lw; trace(ctx, pts, closed, r, amp * 0.5); ctx.stroke(); return; }
    ctx.lineWidth = lw; trace(ctx, pts, closed, r, amp); ctx.stroke();
  }
  const rough = {
    poly(ctx, pts, o) { shape(ctx, densify(pts, true, o.step || 14), true, o); },
    line(ctx, pts, o) { shape(ctx, densify(pts, false, o.step || 14), false, o); },
    ellipse(ctx, cx, cy, rx, ry, o) { shape(ctx, ellipsePts(cx, cy, rx, ry, o.rot), true, o); },
  };

  // ---- ops -> canvas --------------------------------------------------------
  function drawOps(ctx, ops, w, h, seed, tintFrom, tintTo) {
    const r = rng(seed), sx = w / 200, sy = h / 200;
    const col = (k) => { if (!k) return null; if (k === tintFrom && tintTo) k = tintTo; return P[k] || k; };
    const map = (a) => a.map((v, i) => v * (i % 2 ? sy : sx));
    for (const op of ops) {
      switch (op[0]) {
        case 'e': rough.ellipse(ctx, op[1] * sx, op[2] * sy, Math.max(1, op[3] * sx), Math.max(1, op[4] * sy), { r, shade: true, fill: col(op[5]), rot: (op[6] || 0) * Math.PI / 180 }); break;
        case 'r': { const x = op[1] * sx, y = op[2] * sy, ww = op[3] * sx, hh = op[4] * sy; rough.poly(ctx, [x, y, x + ww, y, x + ww, y + hh, x, y + hh], { r, shade: true, fill: col(op[5]) }); break; }
        case 'p': rough.poly(ctx, map(op[1]), { r, shade: true, fill: col(op[2]) }); break;
        case 'l': rough.line(ctx, map(op[1]), { r, lw: op[2] || 2.1, color: col(op[3]), step: 9 }); break;
        case 'd': ctx.fillStyle = col(op[4]) || P.ink; ctx.beginPath(); ctx.arc(op[1] * sx, op[2] * sy, op[3] || 2, 0, 7); ctx.fill(); break;
        case 'a': { const pts = []; const n = 10; for (let i = 0; i <= n; i++) { const a = (20 + op[5] * i / n) * Math.PI / 180; pts.push((op[1] + Math.cos(a) * op[3]) * sx, (op[2] + Math.sin(a) * op[4]) * sy); } rough.line(ctx, pts, { r, step: 99 }); break; }
      }
    }
  }

  // ---- rigs: one drawing recipe shared by a whole family --------------------
  function quad(o, pose) {
    const c = o.c, hc = o.head || c, ops = [];
    const neck = !!o.neck, by = neck ? 12 : -5, bry = neck ? 36 : 42;
    const top = o.legs === 'short' ? 55 : 28 + (neck ? 12 : 0);
    const t = o.legs === 'thick' ? 12 : 8;
    const sw = pose === 1 ? 7 : pose === 2 ? -7 : 0;
    const hx = neck ? 66 : 60, hy = neck ? -72 : -44, hrx = neck ? 30 : 35, hry = neck ? 24 : 40;
    if (o.wings) ops.push(['p', [-28, by - 20, -62, -104, 2, -74, 26, -100, 18, by - 22], o.wings]);
    // tail
    if (o.tail === 'short') ops.push(['p', [-66, by - 14, -86, by - 34, -72, by - 2], c]);
    else if (o.tail === 'long') ops.push(['l', [-70, by - 8, -90, by + 12, -96, by + 42], 3, c]);
    else if (o.tail === 'bushy') ops.push(['e', -84, by - 2, 22, 15, o.mane || c, -32]);
    else if (o.tail === 'curl') ops.push(['e', -76, by - 14, 9, 11, '']);
    else if (o.tail === 'puff') ops.push(['e', -74, by - 6, 11, 14, 'white']);
    else if (o.tail === 'tuft') { ops.push(['l', [-70, by - 8, -92, by - 2, -96, by - 30], 2.5, c]); ops.push(['e', -96, by - 36, 8, 10, o.ruff || 'brown']); }
    // far legs, body, near legs
    ops.push(['r', -52 + sw - t, top, t * 2, 100 - top, c], ['r', 28 - sw - t, top, t * 2, 100 - top, c]);
    ops.push(['e', -12, by, 62, bry, c]);
    if (o.hump) ops.push(['e', -14, by - bry + 4, 26, 20, c]);
    if (o.wool) for (const [x, y] of [[-56, by - 6], [-36, by - 30], [-8, by - 36], [20, by - 28], [40, by - 6], [-34, by + 24], [-6, by + 30], [22, by + 22]]) ops.push(['e', x, y, 20, 18, c]);
    if (o.spots) ops.push(['e', -30, by - 8, 15, 12, o.spots], ['e', 8, by + 10, 12, 10, o.spots], ['e', -2, by - 22, 9, 7, o.spots]);
    if (o.patch) ops.push(['e', -28, by - 10, 18, 15, o.patch]);
    if (o.stripes) ops.push(['l', [-38, by - 32, -34, by + 4], 2.6], ['l', [-18, by - 38, -14, by + 2], 2.6], ['l', [2, by - 38, 6, by + 2], 2.6], ['l', [22, by - 32, 25, by]], ['l', [-58, by - 20, -55, by + 4], 2.6]);
    ops.push(['r', -34 - sw - t, top, t * 2, 100 - top, c], ['r', 10 + sw - t, top, t * 2, 100 - top, c]);
    // neck, head
    if (neck) { ops.push(['p', [16, by - 20, 42, -72, 64, -60, 48, by + 2], c]); if (o.mane) ops.push(['l', [20, by - 24, 42, -76, 58, -92], 5, o.mane]); }
    if (o.ruff) ops.push(['e', hx - 8, hy, 40, 46, o.ruff]);
    if (o.ears === 'big') ops.push(['e', hx - 30, hy + 4, 26, 40, c]);
    if (o.ears === 'flop') ops.push(['e', hx - 22, hy + 2, 10, 20, hc, 22]);
    if (o.ears === 'long') ops.push(['e', hx - 12, hy - 50, 8, 30, hc, -10], ['e', hx + 4, hy - 52, 8, 30, hc, 8]);
    if (o.horns === 'goat') ops.push(['l', [hx - 2, hy - 30, hx - 16, hy - 58, hx - 34, hy - 56], 3.2, 'tan'], ['l', [hx + 8, hy - 30, hx, hy - 62, hx - 18, hy - 68], 3.2, 'tan']);
    if (o.horns === 'bull') ops.push(['l', [hx - 12, hy - 26, hx - 18, hy - 52, hx - 2, hy - 62], 3.2, 'cream'], ['l', [hx + 8, hy - 28, hx + 14, hy - 52, hx + 26, hy - 56], 3.2, 'cream']);
    if (o.horns === 'antler') ops.push(['l', [hx - 4, hy - 20, hx - 14, hy - 60, hx - 30, hy - 72], 2.6], ['l', [hx - 12, hy - 48, hx + 2, hy - 68], 2.6], ['l', [hx + 6, hy - 20, hx + 14, hy - 58, hx + 32, hy - 68], 2.6], ['l', [hx + 12, hy - 44, hx - 2, hy - 56], 2.6]);
    ops.push(['e', hx, hy, hrx, hry, hc]);
    if (o.ears === 'point') ops.push(['p', [hx - 20, hy - hry + 8, hx - 14, hy - hry - 26, hx - 2, hy - hry + 4], hc]);
    if (o.ears === 'round') ops.push(['e', hx - 16, hy - hry + 2, 12, 14, hc]);
    if (o.horn) ops.push(['p', [hx + 6, hy - hry + 2, hx + 26, hy - hry - 46, hx + 18, hy - hry + 6], 'yellow']);
    if (o.snout === 'long') ops.push(['e', hx + 28, hy + 10, 20, 14, hc], ['d', hx + 44, hy + 6, 1.8]);
    else if (o.snout === 'pig') ops.push(['e', hx + 26, hy + 6, 12, 16, 'red'], ['d', hx + 24, hy + 6, 1], ['d', hx + 30, hy + 6, 1]);
    else if (o.snout === 'short') ops.push(['e', hx + 22, hy + 12, 15, 14, hc], ['d', hx + 34, hy + 8, 1.8]);
    else if (o.snout !== 'none') ops.push(['d', hx + 26, hy + 10, 1.6]);
    if (o.trunk) ops.push(['l', [hx + 22, hy + 6, hx + 40, hy + 46, hx + 34, hy + 100], 7, c], ['p', [hx + 10, hy + 22, hx + 34, hy + 44, hx + 14, hy + 32], 'white']);
    if (o.beard) ops.push(['p', [hx + 6, hy + hry - 6, hx + 12, hy + hry + 26, hx + 20, hy + hry - 8], hc]);
    if (o.fangs) ops.push(['p', [hx + 20, hy + 20, hx + 24, hy + 36, hx + 29, hy + 20], 'white']);
    ops.eyes = [[hx + 9, hy - 8]];
    return ops;
  }

  function bird(o) {
    const c = o.c, ops = [];
    if (o.owl) {
      ops.push(['l', [-14, 78, -14, 100]], ['l', [14, 78, 14, 100]], ['e', 0, 8, 70, 80, c], ['e', -44, 16, 20, 46, o.wing, 8], ['e', 44, 16, 20, 46, o.wing, -8],
        ['e', -26, -34, 22, 20, 'white'], ['e', 26, -34, 22, 20, 'white'], ['p', [-10, -18, 10, -18, 0, 4], o.beak],
        ['p', [-58, -58, -48, -98, -26, -68], c], ['p', [58, -58, 48, -98, 26, -68], c]);
      ops.eyes = [[-26, -34], [26, -34]];
      return ops;
    }
    ops.push(['l', [-14, 58, -14, 100]], ['l', [8, 58, 8, 100]]);
    ops.push(['p', [-58, 2, -100, -24, -96, 26], c]);
    ops.push(['e', -8, 12, 62, 50, c]);
    ops.push(['e', -20, 8, o.big ? 46 : 36, o.big ? 34 : 25, o.wing || c, -16]);
    ops.push(['e', 46, -36, 30, 34, o.head || c]);
    if (o.crest) ops.push(['p', [34, -64, 42, -102, 58, -66], o.crest]);
    if (o.flat) ops.push(['p', [70, -44, 104, -40, 104, -24, 70, -22], o.beak || 'orange']);
    else ops.push(['p', [70, -46, 102, -32, 70, -20], o.beak || 'orange']);
    ops.eyes = [[52, -42]];
    return ops;
  }

  const HATS = {
    police: (c) => [['r', -48, -100, 96, 16, 'navy'], ['l', [-58, -84, 58, -84], 3], ['d', 0, -92, 1.8, 'yellow']],
    cap: (c) => [['p', [-48, -84, -48, -98, 30, -100, 48, -84, 86, -82], c || 'red']],
    helmet: () => [['p', [-62, -82, -42, -102, 42, -102, 58, -82], 'red'], ['d', 0, -92, 2, 'yellow']],
    beanie: () => [['e', 0, -90, 46, 12, 'red']],
    straw: () => [['r', -36, -104, 72, 18, 'yellow'], ['e', 0, -86, 84, 6, 'yellow']],
    knight: () => [['r', -50, -98, 100, 52, 'grey'], ['l', [-30, -72, 30, -72], 3], ['p', [-8, -98, 0, -122, 8, -98], 'red']],
    wizard: () => [['p', [-56, -84, 56, -84, 8, -132], 'purple'], ['d', 0, -100, 1.8, 'yellow']],
    chef: () => [['r', -38, -100, 76, 16, 'white'], ['e', 0, -108, 54, 14, 'white']],
    tricorn: () => [['p', [-74, -84, 0, -108, 74, -84, 40, -78, -40, -78], 'dgrey']],
    clown: () => [['e', -52, -76, 20, 11, 'orange'], ['e', 52, -76, 20, 11, 'orange']],
    antenna: () => [['l', [0, -92, 0, -114]], ['d', 0, -116, 2.2, 'red']],
    wolfears: () => [['p', [-42, -84, -36, -110, -16, -90], 'dgrey'], ['p', [42, -84, 36, -110, 16, -90], 'dgrey']],
    mirror: () => [['l', [-46, -84, 46, -84]], ['e', 0, -90, 14, 6, 'grey']],
    feather: () => [['e', 0, -90, 50, 8, 'teal'], ['l', [20, -94, 46, -122], 3, 'red']],
  };
  const PROPS = {
    axe: [['l', [76, 34, 76, -44], 3, 'brown'], ['p', [80, -44, 104, -50, 104, -22, 80, -26], 'grey']],
    sword: [['l', [74, 18, 96, -58], 3, 'grey'], ['l', [66, 2, 88, 10], 3]],
    hose: [['l', [74, 12, 100, 2], 4, 'dgrey']],
    shears: [['l', [72, 14, 100, -14], 2.5], ['l', [72, -2, 102, 6], 2.5]],
    staff: [['l', [78, 90, 78, -76], 3, 'brown'], ['d', 78, -82, 3, 'sky']],
    crook: [['l', [78, 94, 78, -74, 64, -86, 56, -70], 3, 'brown']],
    lute: [['e', 70, 6, 20, 12, 'tan'], ['l', [78, 0, 104, -30], 2.5]],
  };

  function person(o, pose) {
    const skin = o.skin || 'skin', top = o.top, legs = o.legs, ops = [];
    const sw = pose === 1 ? 12 : pose === 2 ? -12 : 0;
    if (o.cape) ops.push(['p', [-46, -46, -86, 64, -10, 50, 0, -40], o.cape], ['p', [46, -46, 86, 64, 10, 50, 0, -40], o.cape]);
    if (o.robe) {
      ops.push(['r', -30 + sw, 84, 26, 16, 'dgrey'], ['r', 6 - sw, 84, 26, 16, 'dgrey'], ['p', [-44, -46, 44, -46, 56, 90, -56, 90], top]);
    } else {
      ops.push(['r', -42 + sw, 26, 36, 74, legs], ['r', 6 - sw, 26, 36, 74, legs], ['r', -44, -46, 88, 76, top]);
    }
    if (o.stripes) ops.push(['l', [-44, -24, 44, -24], 2.4], ['l', [-44, -2, 44, -2], 2.4], ['l', [-44, 18, 44, 18], 2.4]);
    if (o.bones) ops.push(['l', [0, -44, 0, 26]], ['l', [-30, -28, 30, -28]], ['l', [-30, -10, 30, -10]], ['l', [-30, 8, 30, 8]]);
    if (o.satchel) ops.push(['l', [-40, -44, 34, 12], 2.2], ['r', 22, 2, 40, 30, 'tan']);
    if (o.arms === 'reach') ops.push(['l', [30, -36, 98, -32], 3.6, skin], ['l', [30, -20, 98, -16], 3.6, skin]);
    else ops.push(['l', [-48, -38, -72 - sw / 2, 12], 3.6, top], ['l', [48, -38, 72 + sw / 2, 12], 3.6, top]);
    if (o.club) ops.push(['p', [66, 20, 78, -64, 104, -58, 84, 24], 'brown']);
    if (o.prop && PROPS[o.prop]) ops.push(...PROPS[o.prop]);
    ops.push(['e', 0, -68, 54, 26, skin]);
    if (o.hair) ops.push(['p', [-46, -72, -40, -92, 0, -96, 40, -92, 46, -72, 20, -84, -20, -84], o.hair]);
    switch (o.face) {
      case 'grr': ops.eyes = [[-21, -70, 0.72], [23, -70, 0.72]]; ops.push(['l', [-34, -84, -8, -78], 2.4], ['l', [36, -84, 10, -78], 2.4], ['l', [-14, -54, 16, -54]]); break;
      case 'fangs': ops.push(['d', -14, -72, 1.6, 'red'], ['d', 16, -72, 1.6, 'red'], ['p', [-10, -62, -6, -52, -2, -62], 'white'], ['p', [6, -62, 10, -52, 14, -62], 'white']); break;
      case 'dead': ops.push(['l', [-22, -76, -8, -68]], ['l', [-22, -68, -8, -76]], ['d', 16, -72, 1.6], ['l', [-10, -58, 14, -60]]); break;
      case 'skull': ops.push(['e', -16, -72, 11, 6, 'ink'], ['e', 18, -72, 11, 6, 'ink'], ['l', [-12, -58, 14, -58]]); break;
      case 'robot': ops.push(['r', -32, -80, 64, 14, 'sky'], ['d', -14, -73, 1.4], ['d', 16, -73, 1.4]); break;
      case 'alien': ops.push(['e', -18, -72, 14, 8, 'ink', 20], ['e', 20, -72, 14, 8, 'ink', -20]); break;
      case 'ninja': ops.push(['r', -38, -79, 76, 12, 'skin'], ['d', -14, -73, 1.4], ['d', 16, -73, 1.4]); break;
      case 'clown': ops.eyes = [[-21, -70, 0.72], [23, -70, 0.72]]; ops.push(['e', 2, -62, 12, 6, 'red'], ['l', [-18, -56, 2, -50, 22, -56]]); break;
      case 'cry': ops.push(['l', [-22, -74, -8, -72]], ['l', [10, -72, 24, -74]], ['e', 2, -62, 12, 6, 'ink']); break;
      case 'mask': ops.push(['r', -42, -78, 84, 11, 'ink'], ['d', -14, -73, 1.3, 'white'], ['d', 16, -73, 1.3, 'white']); break;
      default: ops.eyes = [[-21, -70, 0.72], [23, -70, 0.72]]; ops.push(['l', [-14, -58, 2, -53, 18, -58]]);
    }
    if (o.beard) ops.push(['p', [-34, -62, 0, -26, 34, -62], o.beard]);
    if (o.hat && HATS[o.hat]) ops.push(...HATS[o.hat](o.hatColor));
    return ops;
  }

  function opsFor(art, pose) {
    if (Array.isArray(art)) return art;   // hand-drawn objects keep their painted eyes
    if (art.a === 'quad') return quad(art, pose);
    if (art.a === 'bird') return bird(art);
    if (art.a === 'person') return person(art, pose);
    return [];
  }
  function mainColor(art) {
    if (!Array.isArray(art)) return art.a === 'person' ? art.top : art.c;
    const n = {};
    for (const op of art) { const k = op[0] === 'p' ? op[2] : (op[0] === 'e' || op[0] === 'r') ? op[5] : null; if (k && k !== 'white' && k !== 'ink' && k !== 'paper') n[k] = (n[k] || 0) + 1; }
    return Object.keys(n).sort((a, b) => n[b] - n[a])[0];
  }

  // ---- sprite cache ----------------------------------------------------------
  const PAD = 14, SS = (typeof window !== 'undefined' && window.devicePixelRatio > 1) ? 3 : 2, FRAMES = 3;
  const cache = new Map();
  function sprite(spec, pose) {
    pose = pose || 0;
    if (Array.isArray(spec.art)) pose = 0;
    const key = [spec.noun, spec.w, spec.h, spec.tint || '', pose, spec.frozen ? 'f' : ''].join('|');
    let s = cache.get(key);
    if (s) return s;
    const ops = opsFor(spec.art, pose), from = spec.tint ? mainColor(spec.art) : null;
    const frames = [];
    let seed = 7; for (const ch of spec.noun) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    for (let f = 0; f < FRAMES; f++) {
      const cv = document.createElement('canvas');
      cv.width = Math.ceil((spec.w + PAD * 2) * SS); cv.height = Math.ceil((spec.h + PAD * 2) * SS);
      const ctx = cv.getContext('2d');
      ctx.scale(SS, SS); ctx.translate(spec.w / 2 + PAD, spec.h / 2 + PAD);
      drawOps(ctx, ops, spec.w, spec.h, seed + f * 977, from, spec.tint);
      if (spec.frozen) { ctx.globalCompositeOperation = 'source-atop'; ctx.globalAlpha = 0.55; ctx.fillStyle = P.sky; ctx.fillRect(-spec.w, -spec.h, spec.w * 2, spec.h * 2); }
      frames.push(cv);
    }
    s = { frames, w: spec.w + PAD * 2, h: spec.h + PAD * 2, eyes: ops.eyes || [] };
    cache.set(key, s);
    return s;
  }

  NN.art = { P, rng, rough, drawOps, sprite, opsFor, FRAMES };
})(window.NN);
