/* Art: every object is drawn from a short list of shapes. Shapes of one colour
 * can be grouped so they merge into a single clean silhouette with one bold ink
 * outline; fills get a cel-shaded lower edge and a soft highlight. Each sprite
 * is rendered three times with a slightly different line and cycled, so the
 * linework "boils" a little while the game runs.
 *
 * Op format, in a -100..100 box scaled to the object's size:
 *   ['e', cx, cy, rx, ry, fill, rotDeg]   ellipse
 *   ['r', x, y, w, h, fill, radiusPx]     rounded rectangle
 *   ['p', [x,y,...], fill, radiusPx]      closed polygon with rounded corners
 *   ['g', fill, [shapes]]                 group: shapes merged into one outline;
 *                                         each is ['e',cx,cy,rx,ry,rot], ['r',x,y,w,h,rad] or ['p',pts,rad]
 *   ['l', [x,y,...], widthPx, colour]     open line (ink if no colour)
 *   ['d', x, y, radiusPx, colour]         dot
 *   ['a', cx, cy, rx, ry, sweepDeg]       arc
 * A colour name may end in '-' (darker) or '+' (lighter).
 */
(function (NN) {
  'use strict';

  const P = {
    paper: '#f3ead3', ink: '#2a2520', white: '#fdf9ee', cream: '#f1e2b8', red: '#d8574a', orange: '#e9923c', yellow: '#f0c64a',
    sage: '#8fa77a', green: '#86b35c', dgreen: '#4f7f4b', lime: '#b5d56a', teal: '#4fa59a', blue: '#5a97d0', sky: '#a9d3ea', navy: '#3c5578',
    purple: '#9571b3', pink: '#f0a3b4', brown: '#a9744c', dbrown: '#6f4b33', tan: '#dcb986', grey: '#aeaaa0', dgrey: '#5d5852', skin: '#f2c9a0',
  };

  function rng(seed) { let s = (seed >>> 0) || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
  function tone(hex, k) {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
    const t = k < 0 ? 0 : 255, a = Math.abs(k);
    const ch = (i) => Math.round(parseInt(hex.substr(i, 2), 16) * (1 - a) + t * a).toString(16).padStart(2, '0');
    return '#' + ch(1) + ch(3) + ch(5);
  }
  const baseName = (k) => (k && (k.endsWith('-') || k.endsWith('+')) ? k.slice(0, -1) : k);

  // ---- loose drawing in pixel space (terrain, flames, effects) ---------------
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
  function shape(ctx, pts, closed, o) {
    const r = o.r, amp = o.amp === undefined ? 0.45 : o.amp;
    if (o.fill) { ctx.fillStyle = o.fill; trace(ctx, pts, true, r, amp * 0.5); ctx.fill(); }
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

  // ---- sprite drawing: smooth paths, merged outlines, cel shading ------------
  function roundedPoly(path, pts, rad) {
    const n = pts.length / 2;
    for (let i = 0; i < n; i++) {
      const px = pts[i * 2], py = pts[i * 2 + 1];
      const ax = pts[((i + n - 1) % n) * 2], ay = pts[((i + n - 1) % n) * 2 + 1], bx = pts[((i + 1) % n) * 2], by = pts[((i + 1) % n) * 2 + 1];
      const d1 = Math.hypot(ax - px, ay - py) || 1, d2 = Math.hypot(bx - px, by - py) || 1, c = Math.min(rad, d1 * 0.45, d2 * 0.45);
      const x1 = px + (ax - px) / d1 * c, y1 = py + (ay - py) / d1 * c, x2 = px + (bx - px) / d2 * c, y2 = py + (by - py) / d2 * c;
      if (i === 0) path.moveTo(x1, y1); else path.lineTo(x1, y1);
      path.quadraticCurveTo(px, py, x2, y2);
    }
    path.closePath();
  }
  // sh is ['e',cx,cy,rx,ry,rot] | ['r',x,y,w,h,rad] | ['p',pts,rad]
  function mkPath(sh, env) {
    const { sx, sy, r, amp } = env, j = () => (r() - 0.5) * 2 * amp, p = new Path2D();
    let size;
    if (sh[0] === 'e') {
      const rx = Math.max(0.8, Math.abs(sh[3] * sx) + j() * 0.5), ry = Math.max(0.8, Math.abs(sh[4] * sy) + j() * 0.5);
      p.ellipse(sh[1] * sx + j(), sh[2] * sy + j(), rx, ry, (sh[5] || 0) * Math.PI / 180, 0, Math.PI * 2);
      size = Math.min(rx, ry) * 2;
    } else {
      let pts, rad;
      if (sh[0] === 'r') {
        const x = sh[1] * sx, y = sh[2] * sy, w = sh[3] * sx, h = sh[4] * sy;
        pts = [x, y, x + w, y, x + w, y + h, x, y + h];
        rad = sh[5] !== undefined ? sh[5] : Math.min(5, Math.min(Math.abs(w), Math.abs(h)) * 0.22);
      } else { pts = sh[1].map((v, i) => v * (i % 2 ? sy : sx)); rad = sh[2] !== undefined ? sh[2] : 2.2; }
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (let i = 0; i < pts.length; i += 2) { pts[i] += j(); pts[i + 1] += j(); x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]); }
      roundedPoly(p, pts, rad);
      size = Math.min(x1 - x0, y1 - y0);
    }
    return { path: p, size };
  }
  function paint(ctx, shapes, fill, env) {
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = P.ink;
    if (!fill) { ctx.lineWidth = env.lw; for (const s of shapes) ctx.stroke(s.path); return; }
    ctx.lineWidth = env.lw * 2;                       // the inner half is covered by the fill
    for (const s of shapes) ctx.stroke(s.path);
    ctx.fillStyle = fill;
    for (const s of shapes) ctx.fill(s.path);
    const size = Math.max(...shapes.map((s) => s.size));
    const t = env.tmp;
    if (!t || size < 9 || fill.startsWith('rgba')) return;   // glass and other see-through fills stay flat
    // shade and highlight follow the merged silhouette: mask minus a shifted copy of itself
    const d = Math.max(1.2, Math.min(4.5, size * 0.1)), m = ctx.getTransform();
    const band = (colour, dx, dy, alpha) => {
      t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = 'source-over'; t.clearRect(0, 0, t.canvas.width, t.canvas.height);
      t.setTransform(m); t.fillStyle = colour;
      for (const s of shapes) t.fill(s.path);
      t.globalCompositeOperation = 'destination-out'; t.translate(dx, dy);
      for (const s of shapes) t.fill(s.path);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = alpha; ctx.drawImage(t.canvas, 0, 0); ctx.restore();
    };
    band('#2a2520', -d * 0.7, -d, 0.2);
    band('#ffffff', d * 0.45, d * 0.6, 0.3);
  }

  function drawOps(ctx, ops, w, h, seed, tintFrom, tintTo, tmp) {
    const r = rng(seed), sx = w / 200, sy = h / 200;
    const env = { sx, sy, r, amp: 0.4, tmp, lw: Math.max(1.5, Math.min(2.3, 1.45 + Math.min(w, h) * 0.012)) };
    const col = (k) => {
      if (!k) return null;
      const mod = k.endsWith('-') ? -0.16 : k.endsWith('+') ? 0.22 : 0;
      let b = baseName(k);
      if (b === tintFrom && tintTo) b = tintTo;
      const c = P[b] || b;
      return mod ? tone(c, mod) : c;
    };
    const map = (a) => a.map((v, i) => v * (i % 2 ? sy : sx));
    for (const op of ops) {
      switch (op[0]) {
        case 'e': paint(ctx, [mkPath(['e', op[1], op[2], op[3], op[4], op[6]], env)], col(op[5]), env); break;
        case 'r': paint(ctx, [mkPath(['r', op[1], op[2], op[3], op[4], op[6]], env)], col(op[5]), env); break;
        case 'p': paint(ctx, [mkPath(['p', op[1], op[3]], env)], col(op[2]), env); break;
        case 'g': paint(ctx, op[2].map((s) => mkPath(s, env)), col(op[1]), env); break;
        case 'l': rough.line(ctx, map(op[1]), { r, amp: 0.35, lw: op[2] || env.lw, color: col(op[3]), step: 9 }); break;
        case 'd': ctx.fillStyle = col(op[4]) || P.ink; ctx.beginPath(); ctx.arc(op[1] * sx, op[2] * sy, op[3] || 2, 0, 7); ctx.fill(); break;
        case 'a': { const pts = []; const n = 10; for (let i = 0; i <= n; i++) { const a = (20 + op[5] * i / n) * Math.PI / 180; pts.push((op[1] + Math.cos(a) * op[3]) * sx, (op[2] + Math.sin(a) * op[4]) * sy); } rough.line(ctx, pts, { r, amp: 0.3, lw: env.lw, step: 99 }); break; }
      }
    }
  }

  // ---- rigs: one drawing recipe shared by a whole family --------------------
  function quad(o, pose) {
    const c = o.c, hc = o.head || c, far = c + '-', ops = [];
    const neck = !!o.neck, by = neck ? 14 : -2, bry = neck ? 34 : 40;
    const hip = by + bry * 0.4, t = o.legs === 'thick' ? 13 : o.legs === 'short' ? 9 : 8;
    const sw = pose === 1 ? 13 : pose === 2 ? -13 : 0;
    const hx = neck ? 68 : 58, hy = neck ? -70 : -40, hrx = neck ? 30 : 37, hry = neck ? 25 : 42;
    const leg = (x, s) => ['p', [x - t, hip, x + t, hip, x + t + s, 100, x - t + s, 100], 2.5];
    const hoof = (x, s, k) => (o.hoof ? [['r', x - t + s - 1, 84, t * 2 + 2, 16, o.hoof + (k || ''), 2.5]] : []);
    if (o.wings) ops.push(['p', [-30, by - 22, -44, -70, -70, -104, -20, -86, 4, -104, 16, -70, 22, by - 24], o.wings + '-']);
    // far legs sit behind, a shade darker
    ops.push(['g', far, [leg(-42, -sw), leg(34, sw)]], ...hoof(-42, -sw, '-'), ...hoof(34, sw, '-'));
    if (o.tail === 'long') ops.push(['l', [-66, by - 10, -90, by + 10, -96, by + 44], 3.4, c]);
    else if (o.tail === 'tuft') { ops.push(['l', [-66, by - 10, -92, by - 4, -98, by - 32], 3, c]); ops.push(['e', -98, by - 40, 9, 12, o.ruff || 'brown']); }
    else if (o.tail === 'bushy' && o.mane) ops.push(['p', [-62, by - 16, -96, by - 26, -102, by + 30, -84, by + 44, -70, by + 4], o.mane, 4]);
    // the body is one merged silhouette: torso, near legs, neck, head, ears, snout
    const body = [['e', -10, by, 60, bry], leg(-54, sw), leg(22, -sw)];
    if (o.tail === 'short') body.push(['p', [-62, by - 14, -90, by - 40, -72, by + 2], 2]);
    if (o.tail === 'bushy' && !o.mane) body.push(['e', -84, by - 6, 26, 17, -34]);
    if (o.hump) body.push(['e', -14, by - bry + 2, 28, 24]);
    if (o.wool) for (const [x, y] of [[-58, by - 4], [-40, by - 30], [-12, by - 38], [18, by - 32], [40, by - 10], [-38, by + 24], [-8, by + 30], [22, by + 24]]) body.push(['e', x, y, 22, 20]);
    if (neck) body.push(['p', [12, by - 16, 44, -78, 74, -56, 52, by + 10], 4]);
    const head = hc === c ? body : [];
    if (o.ears === 'big') head.push(['e', hx - 34, hy + 6, 30, 46]);
    if (o.ears === 'flop') head.push(['e', hx - 26, hy + 6, 11, 24, 22]);
    if (o.ears === 'long') head.push(['e', hx - 16, hy - hry - 22, 9, 34, -10], ['e', hx + 6, hy - hry - 24, 9, 34, 8]);
    if (o.ears === 'point') head.push(['p', [hx - 26, hy - hry + 14, hx - 16, hy - hry - 30, hx + 2, hy - hry + 6], 2]);
    if (o.ears === 'round') head.push(['e', hx - 20, hy - hry + 6, 14, 17]);
    head.push(['e', hx, hy, hrx, hry]);
    if (o.snout === 'long') head.push(['e', hx + 30, hy + 12, 22, 16]);
    if (o.snout === 'short') head.push(['e', hx + 24, hy + 14, 17, 16]);
    if (o.beard) head.push(['p', [hx + 4, hy + hry - 8, hx + 12, hy + hry + 28, hx + 22, hy + hry - 10], 2]);
    if (o.ruff) { const m = []; for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; m.push(['e', hx - 6 + Math.cos(a) * 30, hy + Math.sin(a) * 36, 20, 22]); } ops.push(['g', o.ruff, m]); }
    ops.push(['g', c, body], ...hoof(-54, sw), ...hoof(22, -sw));
    if (o.spots) ops.push(['e', -32, by - 8, 16, 13, o.spots], ['e', 8, by + 12, 13, 11, o.spots], ['e', -4, by - 24, 10, 8, o.spots]);
    if (o.patch) ops.push(['e', -30, by - 12, 20, 16, o.patch]);
    if (o.stripes) ops.push(['l', [-40, by - 32, -36, by + 2], 2.8], ['l', [-20, by - 38, -16, by], 2.8], ['l', [0, by - 38, 4, by], 2.8], ['l', [20, by - 32, 23, by - 2], 2.8], ['l', [-60, by - 20, -57, by + 2], 2.8]);
    if (neck && o.mane) ops.push(['p', [14, by - 24, 40, -84, 60, -98, 54, -74, 30, by - 14], o.mane, 3]);
    if (hc !== c) ops.push(['g', hc, head]);
    if (o.horns === 'goat') ops.push(['l', [hx - 4, hy - hry + 6, hx - 20, hy - hry - 24, hx - 40, hy - hry - 22], 3.4, 'tan'], ['l', [hx + 8, hy - hry + 4, hx - 2, hy - hry - 30, hx - 22, hy - hry - 36], 3.4, 'tan']);
    if (o.horns === 'bull') ops.push(['l', [hx - 14, hy - hry + 10, hx - 22, hy - hry - 16, hx - 4, hy - hry - 28], 3.4, 'cream'], ['l', [hx + 8, hy - hry + 6, hx + 16, hy - hry - 18, hx + 30, hy - hry - 22], 3.4, 'cream']);
    if (o.horns === 'antler') ops.push(['l', [hx - 6, hy - hry + 8, hx - 16, hy - hry - 34, hx - 34, hy - hry - 46], 2.8, 'tan'], ['l', [hx - 14, hy - hry - 22, hx + 2, hy - hry - 42], 2.8, 'tan'], ['l', [hx + 6, hy - hry + 6, hx + 16, hy - hry - 32, hx + 36, hy - hry - 42], 2.8, 'tan'], ['l', [hx + 14, hy - hry - 18, hx - 2, hy - hry - 30], 2.8, 'tan']);
    if (o.horn) ops.push(['p', [hx + 4, hy - hry + 6, hx + 28, hy - hry - 50, hx + 20, hy - hry + 10], 'yellow', 1]);
    if (o.snout === 'long' || o.snout === 'short') ops.push(['d', hx + (o.snout === 'long' ? 46 : 36), hy + 8, 2.2], ['l', [hx + 14, hy + 22, hx + 26, hy + 26, hx + 36, hy + 22], 1.5]);
    else if (o.snout === 'pig') ops.push(['e', hx + 30, hy + 8, 13, 18, 'red'], ['d', hx + 27, hy + 8, 1.1], ['d', hx + 33, hy + 8, 1.1]);
    else if (o.snout !== 'none') ops.push(['d', hx + 30, hy + 10, 2], ['l', [hx + 14, hy + 22, hx + 26, hy + 24], 1.5]);
    else ops.push(['d', hx + 30, hy + 6, 1.6, 'pink']);
    if (o.trunk) ops.push(['l', [hx + 24, hy + 8, hx + 44, hy + 50, hx + 36, hy + 104], 7.5, c], ['p', [hx + 8, hy + 24, hx + 36, hy + 48, hx + 12, hy + 36], 'white', 1.5]);
    if (o.fangs) ops.push(['p', [hx + 22, hy + 22, hx + 26, hy + 40, hx + 31, hy + 22], 'white', 0.8]);
    if (o.ears === 'point' || o.ears === 'round') ops.push(['d', hx - 12, hy - hry + 4, 1.6, 'pink']);
    ops.eyes = [[hx + 10, hy - 8]];
    return ops;
  }

  function bird(o) {
    const c = o.c, hc = o.head || c, ops = [];
    if (o.owl) {
      ops.push(['l', [-14, 78, -14, 100], 2.4, 'orange'], ['l', [14, 78, 14, 100], 2.4, 'orange']);
      ops.push(['g', c, [['e', 0, 8, 70, 80], ['p', [-58, -52, -48, -100, -22, -66], 2], ['p', [58, -52, 48, -100, 22, -66], 2]]]);
      ops.push(['e', 0, 34, 40, 42, c + '+'], ['e', -46, 18, 20, 46, o.wing, 8], ['e', 46, 18, 20, 46, o.wing, -8], ['e', -26, -34, 24, 22, 'white'], ['e', 26, -34, 24, 22, 'white'], ['p', [-10, -18, 10, -18, 0, 6], o.beak, 1]);
      ops.eyes = [[-26, -34], [26, -34]];
      return ops;
    }
    ops.push(['l', [-14, 56, -14, 96, -2, 100], 2.2, 'orange'], ['l', [8, 56, 8, 96, 20, 100], 2.2, 'orange']);
    const body = [['p', [-56, 0, -102, -26, -98, 26], 2], ['e', -8, 12, 62, 50]];
    if (hc === c) body.push(['e', 46, -34, 32, 36]);
    ops.push(['g', c, body]);
    if (hc !== c) ops.push(['e', 46, -34, 32, 36, hc]);
    ops.push(['p', [-58, 2, -30, -18, 18, 0, 6, 28, -36, 30], o.wing || c + '-', 4]);
    if (o.big) ops.push(['l', [-40, 12, -10, 18], 1.5], ['l', [-34, 22, -6, 26], 1.5]);
    if (o.crest) ops.push(['g', o.crest, [['e', 36, -74, 9, 14], ['e', 48, -80, 9, 15], ['e', 60, -72, 8, 12]]]);
    if (o.flat) ops.push(['p', [70, -44, 106, -42, 106, -24, 70, -22], o.beak || 'orange', 3]);
    else ops.push(['p', [72, -46, 104, -32, 72, -20], o.beak || 'orange', 1.2]);
    ops.eyes = [[52, -42]];
    return ops;
  }

  // People are chibi: the head is about half the height, the body is small.
  const HATS = {
    police: () => [['p', [-80, -70, -70, -106, 70, -106, 80, -70], 'navy', 3], ['r', -86, -76, 172, 12, 'dgrey', 2], ['d', 0, -90, 2.2, 'yellow']],
    cap: (c) => [['p', [48, -86, 114, -72, 112, -60, 48, -64], (c || 'red') + '-', 2], ['p', [-80, -60, -74, -96, -20, -112, 44, -106, 80, -68], c || 'red', 5]],
    helmet: () => [['p', [-88, -58, -76, -98, -14, -116, 52, -108, 82, -76, 106, -68, 106, -56, -88, -54], 'red', 4], ['d', 6, -86, 2.4, 'yellow']],
    beanie: () => [['p', [-80, -60, -72, -100, 0, -116, 72, -100, 80, -60], 'red', 5], ['r', -84, -70, 168, 14, 'red-', 3], ['e', 0, -118, 12, 8, 'white']],
    straw: () => [['r', -50, -118, 100, 36, 'yellow', 4], ['e', 0, -78, 114, 9, 'yellow'], ['l', [-50, -88, 50, -88], 2.6, 'red']],
    knight: () => [['p', [-8, -104, 0, -134, 10, -104], 'red', 1], ['r', -84, -104, 168, 112, 'grey', 9], ['l', [-54, -44, 58, -44], 3], ['l', [2, -44, 2, -6], 2]],
    wizard: () => [['p', [-78, -70, 78, -70, 18, -158], 'purple', 2], ['e', 0, -70, 106, 9, 'purple'], ['d', 2, -96, 2.4, 'yellow'], ['d', 20, -122, 1.8, 'yellow']],
    chef: () => [['g', 'white', [['r', -56, -110, 112, 34, 3], ['e', -36, -120, 34, 16], ['e', 0, -128, 38, 18], ['e', 36, -120, 34, 16]]], ['l', [-54, -80, 54, -80], 1.6]],
    tricorn: () => [['p', [-108, -68, -48, -104, 0, -90, 48, -104, 108, -68, 0, -56], 'dgrey', 3], ['d', 0, -76, 2.2, 'white']],
    clown: () => [['e', -86, -50, 26, 22, 'orange'], ['e', 86, -50, 26, 22, 'orange']],
    antenna: () => [['l', [0, -98, 0, -126]], ['d', 0, -128, 2.8, 'red']],
    wolfears: () => [['p', [-68, -78, -58, -122, -24, -92], 'dgrey', 2], ['p', [68, -78, 58, -122, 24, -92], 'dgrey', 2]],
    mirror: () => [['l', [-78, -68, 78, -68], 2.6], ['e', 0, -82, 18, 10, 'grey']],
    feather: () => [['p', [-82, -62, -70, -102, 70, -102, 82, -62], 'teal', 4], ['l', [30, -100, 62, -136], 3.6, 'red']],
    bubble: () => [['e', 0, -46, 102, 66, 'rgba(200,235,250,0.2)'], ['l', [-66, -80, -44, -96], 1.8, 'white'], ['l', [0, -112, 0, -132]], ['d', 0, -135, 3, 'yellow']],
    horns: () => [['l', [-60, -82, -102, -104, -86, -134], 3.8, 'cream'], ['l', [60, -82, 102, -104, 86, -134], 3.8, 'cream']],
    goggles: () => [['r', -84, -70, 168, 12, 'dbrown', 2], ['e', -30, -66, 22, 14, 'sky'], ['e', 32, -66, 22, 14, 'sky']],
    headphones: () => [['l', [-78, -44, -70, -96, 0, -112, 70, -96, 78, -44], 3.4, 'dgrey'], ['e', -82, -38, 12, 18, 'red'], ['e', 82, -38, 12, 18, 'red']],
    bun: () => [['e', 0, -108, 26, 16, 'dbrown']],
  };
  const PROPS = {
    axe: [['l', [58, 70, 58, -14], 3.2, 'brown'], ['p', [62, -16, 96, -24, 96, 10, 62, 4], 'grey', 1.5]],
    sword: [['l', [56, 46, 88, -30], 3.2, 'grey'], ['l', [46, 30, 74, 40], 3]],
    hose: [['l', [56, 44, 94, 32], 4.2, 'dgrey']],
    shears: [['l', [54, 44, 92, 16], 2.6], ['l', [54, 30, 94, 38], 2.6]],
    staff: [['l', [64, 96, 64, -40], 3.2, 'brown'], ['e', 64, -50, 11, 8, 'sky']],
    crook: [['l', [64, 96, 64, -40, 48, -54, 38, -38], 3.2, 'brown']],
    lute: [['l', [62, 30, 96, -4], 2.8, 'brown'], ['e', 54, 40, 22, 14, 'tan']],
  };

  function person(o, pose) {
    const skin = o.skin || 'skin', top = o.top, legs = o.legs, shoe = o.shoe || 'dgrey', ops = [];
    const sw = pose === 1 ? 12 : pose === 2 ? -12 : 0;
    const arm = (s) => (o.arms === 'reach' ? ['p', [20, 10 + (s > 0 ? 0 : 14), 92, 12 + (s > 0 ? 0 : 14), 92, 24 + (s > 0 ? 0 : 14), 20, 26 + (s > 0 ? 0 : 14)], 3]
      : pose === 5 && s > 0 ? ['p', [24, 10, 40, 6, 70, -34, 58, -42], 3]                      // pose 5: a wave
        : ['p', [s * 24, 8, s * 40, 8, s * (56 + sw * 0.25), 40, s * (42 + sw * 0.25), 46], 3]);
    if (o.cape) ops.push(['p', [-36, 4, -74, 86, 0, 74, 74, 86, 36, 4], o.cape, 3]);
    if (o.robe) {
      ops.push(['r', -34 + sw * 0.5, 86, 30, 14, shoe, 3], ['r', 4 - sw * 0.5, 86, 30, 14, shoe, 3]);
      ops.push(['g', top, [['p', [-34, 4, 34, 4, 48, 92, -48, 92], 4], arm(-1), arm(1)]]);
      ops.push(['l', [0, 10, 0, 90], 1.5]);
    } else {
      ops.push(['g', legs, [['p', [-32, 50, -3, 50, -3 + sw, 92, -32 + sw, 92], 2], ['p', [3, 50, 32, 50, 32 - sw, 92, 3 - sw, 92], 2]]]);
      ops.push(['r', -38 + sw, 86, 40, 14, shoe, 3.5], ['r', -2 - sw, 86, 40, 14, shoe, 3.5]);
      ops.push(['g', top, [['r', -36, 2, 72, 54, 5], arm(-1), arm(1)]]);
      if (!o.stripes && !o.bones) ops.push(['l', [-34, 50, 34, 50], 2.2, legs + '-']);
    }
    if (o.stripes) ops.push(['l', [-34, 16, 34, 16], 2.4], ['l', [-34, 30, 34, 30], 2.4], ['l', [-34, 44, 34, 44], 2.4]);
    if (o.bones) ops.push(['l', [0, 6, 0, 52]], ['l', [-26, 18, 26, 18]], ['l', [-26, 32, 26, 32]], ['l', [-26, 44, 26, 44]]);
    if (o.satchel) ops.push(['l', [-32, 6, 30, 44], 2.4, 'dbrown'], ['r', 14, 36, 42, 30, 'tan', 4]);
    if (o.arms !== 'reach') ops.push(['e', -(50 + sw * 0.25), 46, 11, 7, skin], pose === 5 ? ['e', 66, -42, 11, 8, skin] : ['e', 50 + sw * 0.25, 46, 11, 7, skin]);
    else ops.push(['e', 94, 18, 9, 6, skin], ['e', 94, 32, 9, 6, skin]);
    if (o.club) ops.push(['p', [50, 50, 64, -30, 96, -24, 74, 54], 'brown', 4]);
    if (o.prop && PROPS[o.prop]) ops.push(...PROPS[o.prop]);
    ops.push(['r', -78, -98, 156, 104, skin, 11]);
    const bald = ['skull', 'robot', 'alien', 'ninja'].includes(o.face) || o.hat === 'knight' || o.hat === 'clown' || o.furry;
    if (!bald) ops.push(['p', [-80, -44, -78, -84, -44, -102, 44, -102, 78, -84, 80, -44, 62, -62, 14, -72, -46, -60], o.hair || 'dbrown', 4]);
    const live = [[-30, -38, 1.7], [32, -38, 1.7]];
    switch (o.face) {
      case 'grr': ops.eyes = live; ops.push(['l', [-54, -60, -16, -50], 2.8], ['l', [56, -60, 18, -50], 2.8], ['l', [-16, -16, 18, -16], 2]); break;
      case 'fangs': ops.push(['d', -30, -38, 2.4, 'red'], ['d', 32, -38, 2.4, 'red'], ['l', [-22, -20, 24, -20], 1.6], ['p', [-14, -20, -8, -6, -2, -20], 'white', 0.6], ['p', [6, -20, 12, -6, 18, -20], 'white', 0.6]); break;
      case 'dead': ops.push(['l', [-40, -46, -20, -30]], ['l', [-40, -30, -20, -46]], ['d', 32, -38, 2.4], ['l', [-16, -16, 0, -20, 18, -14], 1.6]); break;
      case 'skull': ops.push(['e', -30, -40, 20, 13, 'ink'], ['e', 32, -40, 20, 13, 'ink'], ['d', 1, -24, 1.5], ['l', [-24, -12, 26, -12], 1.6], ['l', [-10, -16, -10, -8], 1.2], ['l', [2, -16, 2, -8], 1.2], ['l', [14, -16, 14, -8], 1.2]); break;
      case 'robot': ops.push(['r', -58, -56, 116, 30, 'sky', 3], ['d', -28, -41, 2.2], ['d', 30, -41, 2.2], ['l', [-22, -14, 24, -14], 1.6], ['l', [-10, -18, -10, -10], 1.2], ['l', [2, -18, 2, -10], 1.2], ['l', [14, -18, 14, -10], 1.2]); break;
      case 'alien': ops.push(['e', -32, -40, 24, 14, 'ink', 24], ['e', 34, -40, 24, 14, 'ink', -24], ['l', [-6, -16, 8, -16], 1.4]); break;
      case 'ninja': ops.push(['r', -66, -56, 132, 28, 'skin', 3], ['d', -28, -42, 2.2], ['d', 30, -42, 2.2]); break;
      case 'clown': ops.eyes = live; ops.push(['e', 2, -26, 17, 10, 'red'], ['l', [-26, -12, 2, -4, 30, -12], 1.8]); break;
      case 'cry': ops.push(['l', [-42, -40, -20, -34], 1.8], ['l', [22, -34, 44, -40], 1.8], ['e', 2, -18, 17, 11, 'ink'], ['d', -50, -24, 1.8, 'blue']); break;
      case 'mask': ops.push(['r', -72, -54, 144, 26, 'ink', 3], ['d', -30, -41, 2, 'white'], ['d', 32, -41, 2, 'white'], ['l', [-10, -16, 14, -16], 1.6]); break;
      default: ops.eyes = live; ops.push(['l', [-12, -19, 2, -14, 16, -19], 1.7], ['d', -54, -22, 2.4, 'pink'], ['d', 56, -22, 2.4, 'pink']);
    }
    if (o.beard) ops.push(['p', [-62, -24, -44, 6, 0, 18, 44, 6, 62, -24, 28, -12, -28, -12], o.beard, 3]);
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
    for (const op of art) {
      const k = baseName(op[0] === 'p' ? op[2] : (op[0] === 'e' || op[0] === 'r') ? op[5] : op[0] === 'g' ? op[1] : null);
      if (k && k !== 'white' && k !== 'ink' && k !== 'paper') n[k] = (n[k] || 0) + (op[0] === 'g' ? 3 : 1);
    }
    return Object.keys(n).sort((a, b) => n[b] - n[a])[0];
  }

  // ---- sprite cache ----------------------------------------------------------
  const SS = (typeof window !== 'undefined' && window.devicePixelRatio > 1) ? 3 : 2, FRAMES = 3;
  const cache = new Map();
  let scratch = null;
  function sprite(spec, pose) {
    pose = pose || 0;
    if (Array.isArray(spec.art)) pose = 0;
    const key = [spec.noun, spec.w, spec.h, spec.tint || '', pose, spec.frozen ? 'f' : ''].join('|');
    let s = cache.get(key);
    if (s) { cache.delete(key); cache.set(key, s); return s; }   // keep recently used sprites at the back
    const ops = opsFor(spec.art, pose), from = spec.tint ? mainColor(spec.art) : null;
    const padX = 14 + spec.w * 0.12, padY = 14 + spec.h * 0.3;      // room for hats, horns and tails outside the body box
    const cw = Math.ceil((spec.w + padX * 2) * SS), ch = Math.ceil((spec.h + padY * 2) * SS);
    if (!scratch) scratch = document.createElement('canvas');
    if (scratch.width < cw || scratch.height < ch) { scratch.width = Math.max(scratch.width, cw); scratch.height = Math.max(scratch.height, ch); }
    const tmp = scratch.getContext('2d');
    const frames = [];
    let seed = 7; for (const chr of spec.noun) seed = (seed * 31 + chr.charCodeAt(0)) >>> 0;
    for (let f = 0; f < (spec.still ? 1 : FRAMES); f++) {   // scenery does not need the shimmering line
      const cv = document.createElement('canvas');
      cv.width = cw; cv.height = ch;
      const ctx = cv.getContext('2d');
      ctx.scale(SS, SS); ctx.translate(spec.w / 2 + padX, spec.h / 2 + padY);
      drawOps(ctx, ops, spec.w, spec.h, seed + f * 977, from, spec.tint, tmp);
      if (spec.frozen) { ctx.globalCompositeOperation = 'source-atop'; ctx.globalAlpha = 0.55; ctx.fillStyle = P.sky; ctx.fillRect(-spec.w * 2, -spec.h * 2, spec.w * 4, spec.h * 4); }
      frames.push(cv);
    }
    s = { frames, w: spec.w + padX * 2, h: spec.h + padY * 2, eyes: ops.eyes || [] };
    cache.set(key, s);
    // sprites are big bitmaps: drop the least recently used ones so a long session cannot run out of memory
    while (cache.size > 90) { const [old, v] = cache.entries().next().value; for (const c of v.frames) { c.width = 0; c.height = 0; } cache.delete(old); }
    return s;
  }

  NN.art = { P, rng, rough, drawOps, sprite, opsFor, FRAMES };
})(window.NN);
