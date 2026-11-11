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
    green: '#86b35c', dgreen: '#4f7f4b', lime: '#b5d56a', teal: '#4fa59a', blue: '#5a97d0', sky: '#a9d3ea', navy: '#3c5578',
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
    if (!t || size < 9) return;
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

  const HATS = {
    police: () => [['p', [-64, -78, -56, -104, 56, -104, 64, -78], 'navy', 3], ['r', -70, -82, 140, 10, 'dgrey', 2], ['d', 0, -92, 2, 'yellow']],
    cap: (c) => [['p', [36, -90, 100, -80, 98, -70, 36, -72], (c || 'red') + '-', 2], ['p', [-64, -72, -58, -98, -10, -108, 40, -102, 64, -76], c || 'red', 4]],
    helmet: () => [['p', [-72, -70, -60, -100, -10, -112, 46, -104, 68, -80, 88, -74, 88, -66, -72, -64], 'red', 3], ['d', 6, -86, 2.2, 'yellow']],
    beanie: () => [['p', [-64, -72, -56, -100, 0, -112, 56, -100, 64, -72], 'red', 4], ['r', -66, -80, 132, 13, 'red-', 3], ['e', 0, -114, 10, 7, 'white']],
    straw: () => [['r', -42, -110, 84, 30, 'yellow', 4], ['e', 0, -80, 98, 8, 'yellow'], ['l', [-42, -88, 42, -88], 2.4, 'red']],
    knight: () => [['p', [-8, -100, 0, -128, 10, -100], 'red', 1], ['r', -68, -102, 136, 78, 'grey', 7], ['l', [-40, -62, 44, -62], 3], ['l', [2, -62, 2, -34], 2]],
    wizard: () => [['p', [-64, -80, 64, -80, 14, -150], 'purple', 2], ['e', 0, -80, 86, 8, 'purple'], ['d', 2, -104, 2.2, 'yellow'], ['d', 16, -124, 1.6, 'yellow']],
    chef: () => [['g', 'white', [['r', -46, -104, 92, 28, 3], ['e', -30, -112, 30, 14], ['e', 0, -120, 34, 16], ['e', 30, -112, 30, 14]]], ['l', [-44, -84, 44, -84], 1.6]],
    tricorn: () => [['p', [-90, -78, -40, -104, 0, -92, 40, -104, 90, -78, 0, -68], 'dgrey', 3], ['d', 0, -84, 2, 'white']],
    clown: () => [['e', -68, -68, 24, 16, 'orange'], ['e', 68, -68, 24, 16, 'orange']],
    antenna: () => [['l', [0, -96, 0, -120]], ['d', 0, -122, 2.6, 'red']],
    wolfears: () => [['p', [-54, -80, -46, -114, -20, -90], 'dgrey', 2], ['p', [54, -80, 46, -114, 20, -90], 'dgrey', 2]],
    mirror: () => [['l', [-60, -78, 60, -78], 2.4], ['e', 0, -88, 16, 8, 'grey']],
    feather: () => [['p', [-66, -76, -56, -100, 56, -100, 66, -76], 'teal', 4], ['l', [24, -98, 52, -128], 3.4, 'red']],
  };
  const PROPS = {
    axe: [['l', [70, 40, 70, -46], 3.2, 'brown'], ['p', [74, -48, 104, -56, 104, -20, 74, -26], 'grey', 1.5]],
    sword: [['l', [68, 18, 96, -62], 3.2, 'grey'], ['l', [58, 0, 84, 10], 3]],
    hose: [['l', [68, 16, 102, 4], 4.2, 'dgrey']],
    shears: [['l', [66, 16, 102, -14], 2.6], ['l', [66, 0, 104, 8], 2.6]],
    staff: [['l', [74, 94, 74, -78], 3.2, 'brown'], ['e', 74, -88, 10, 7, 'sky']],
    crook: [['l', [74, 96, 74, -76, 58, -90, 48, -72], 3.2, 'brown']],
    lute: [['l', [72, 2, 104, -32], 2.8, 'brown'], ['e', 64, 10, 22, 13, 'tan']],
  };

  function person(o, pose) {
    const skin = o.skin || 'skin', top = o.top, legs = o.legs, shoe = o.shoe || 'dgrey', ops = [];
    const sw = pose === 1 ? 14 : pose === 2 ? -14 : 0;
    const arm = (s) => (o.arms === 'reach' ? ['p', [24, -28 + (s > 0 ? 0 : 16), 98, -26 + (s > 0 ? 0 : 16), 98, -14 + (s > 0 ? 0 : 16), 24, -12 + (s > 0 ? 0 : 16)], 3]
      : ['p', [s * 30, -30, s * 46, -30, s * (66 + sw * 0.25), 12, s * (50 + sw * 0.25), 18], 3]);
    if (o.cape) ops.push(['p', [-42, -30, -82, 72, 0, 60, 82, 72, 42, -30], o.cape, 3]);
    if (o.robe) {
      ops.push(['r', -36 + sw * 0.5, 86, 32, 14, shoe, 3], ['r', 6 - sw * 0.5, 86, 32, 14, shoe, 3]);
      ops.push(['g', top, [['p', [-40, -34, 40, -34, 56, 92, -56, 92], 4], arm(-1), arm(1)]]);
      ops.push(['l', [0, -30, 0, 90], 1.5]);
    } else {
      ops.push(['g', legs, [['p', [-38, 22, -3, 22, -3 + sw, 92, -38 + sw, 92], 2], ['p', [3, 22, 38, 22, 38 - sw, 92, 3 - sw, 92], 2]]]);
      ops.push(['r', -42 + sw, 86, 44, 14, shoe, 3.5], ['r', 2 - sw, 86, 44, 14, shoe, 3.5]);
      ops.push(['g', top, [['r', -42, -34, 84, 62, 5], arm(-1), arm(1)]]);
      if (!o.stripes && !o.bones) ops.push(['l', [-40, 20, 40, 20], 2.2, legs + '-']);
    }
    if (o.stripes) ops.push(['l', [-40, -16, 40, -16], 2.4], ['l', [-40, 2, 40, 2], 2.4], ['l', [-40, 18, 40, 18], 2.4]);
    if (o.bones) ops.push(['l', [0, -32, 0, 24]], ['l', [-30, -18, 30, -18]], ['l', [-30, -2, 30, -2]], ['l', [-30, 14, 30, 14]]);
    if (o.satchel) ops.push(['l', [-36, -32, 34, 8], 2.4, 'dbrown'], ['r', 16, 2, 46, 32, 'tan', 4], ['l', [16, 14, 62, 14], 1.5]);
    if (o.arms !== 'reach') ops.push(['e', -(58 + sw * 0.25), 18, 11, 6, skin], ['e', 58 + sw * 0.25, 18, 11, 6, skin]);
    else ops.push(['e', 100, -20, 9, 6, skin], ['e', 100, -4, 9, 6, skin]);
    if (o.club) ops.push(['p', [58, 22, 72, -66, 102, -60, 80, 26], 'brown', 4]);
    if (o.prop && PROPS[o.prop]) ops.push(...PROPS[o.prop]);
    ops.push(['e', 0, -62, 62, 34, skin]);
    const bald = ['skull', 'robot', 'alien', 'ninja'].includes(o.face) || o.hat === 'knight' || o.hat === 'clown' || o.furry;
    if (!bald) ops.push(['p', [-62, -62, -58, -88, -24, -98, 24, -98, 58, -88, 62, -62, 46, -78, 8, -84, -34, -76], o.hair || 'dbrown', 3]);
    const live = [[-24, -60, 1], [26, -60, 1]];
    switch (o.face) {
      case 'grr': ops.eyes = live; ops.push(['l', [-42, -78, -12, -70], 2.6], ['l', [44, -78, 14, -70], 2.6], ['l', [-16, -42, 18, -42], 2]); break;
      case 'fangs': ops.push(['d', -24, -60, 2, 'red'], ['d', 26, -60, 2, 'red'], ['l', [-18, -46, 20, -46], 1.6], ['p', [-12, -46, -7, -34, -2, -46], 'white', 0.6], ['p', [6, -46, 11, -34, 16, -46], 'white', 0.6]); break;
      case 'dead': ops.push(['l', [-32, -66, -16, -54]], ['l', [-32, -54, -16, -66]], ['d', 26, -60, 2], ['l', [-14, -42, 0, -46, 16, -40], 1.6]); break;
      case 'skull': ops.push(['e', -24, -62, 15, 9, 'ink'], ['e', 26, -62, 15, 9, 'ink'], ['d', 1, -50, 1.3], ['l', [-20, -40, 22, -40], 1.6], ['l', [-8, -44, -8, -36], 1.2], ['l', [2, -44, 2, -36], 1.2], ['l', [12, -44, 12, -36], 1.2]); break;
      case 'robot': ops.push(['r', -46, -72, 92, 22, 'sky', 3], ['d', -22, -61, 1.8], ['d', 24, -61, 1.8], ['l', [-20, -42, 22, -42], 1.6]); break;
      case 'alien': ops.push(['e', -26, -60, 18, 10, 'ink', 24], ['e', 28, -60, 18, 10, 'ink', -24], ['l', [-6, -42, 8, -42], 1.4]); break;
      case 'ninja': ops.push(['r', -52, -72, 104, 20, 'skin', 3], ['d', -22, -62, 1.8], ['d', 24, -62, 1.8]); break;
      case 'clown': ops.eyes = live; ops.push(['e', 2, -50, 14, 8, 'red'], ['l', [-22, -40, 2, -33, 26, -40], 1.8]); break;
      case 'cry': ops.push(['l', [-34, -62, -16, -58], 1.8], ['l', [18, -58, 36, -62], 1.8], ['e', 2, -44, 15, 9, 'ink'], ['d', -40, -50, 1.6, 'blue']); break;
      case 'mask': ops.push(['r', -56, -70, 112, 18, 'ink', 3], ['d', -24, -61, 1.6, 'white'], ['d', 26, -61, 1.6, 'white'], ['l', [-10, -42, 14, -42], 1.6]); break;
      default: ops.eyes = live; ops.push(['l', [-14, -45, 2, -39, 18, -45], 1.7], ['d', -42, -48, 1.8, 'pink'], ['d', 44, -48, 1.8, 'pink']);
    }
    if (o.beard) ops.push(['p', [-48, -50, -30, -22, 0, -12, 30, -22, 48, -50, 22, -40, -22, -40], o.beard, 3]);
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
    for (let f = 0; f < FRAMES; f++) {
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
    while (cache.size > 70) { const [old, v] = cache.entries().next().value; for (const c of v.frames) { c.width = 0; c.height = 0; } cache.delete(old); }
    return s;
  }

  NN.art = { P, rng, rough, drawOps, sprite, opsFor, FRAMES };
})(window.NN);
