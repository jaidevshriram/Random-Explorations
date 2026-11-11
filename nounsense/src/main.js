/* Main: drawing, input and the page around the canvas. */
(function (NN) {
  'use strict';
  const { P, rough, rng, sprite } = NN.art;
  const L = NN.level, VW = 1100, VH = 620, Z = 1.6, WW = VW / Z, WH = VH / Z, CAMY = 290;
  const $ = (id) => document.getElementById(id);
  const cv = $('game'), ctx = cv.getContext('2d');
  const FONT = '"Patrick Hand", "Comic Sans MS", "Segoe Print", "Bradley Hand", cursive';
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- saved progress (per browser; the game works without it) --------------
  const store = { found: [], usedInWins: [], best: 0 };
  try { Object.assign(store, JSON.parse(localStorage.getItem('nounsense.v1') || '{}')); } catch (e) { /* private window */ }
  const save = () => { try { localStorage.setItem('nounsense.v1', JSON.stringify(store)); } catch (e) { /* ignore */ } };

  let sim, started = false, boil = 0, hover = null, toastT = 0;
  const cam = { x: 0, y: CAMY };
  const mouse = { sx: VW / 2, sy: VH / 3, x: 0, y: 0, inside: false };
  const keys = {}, pressed = {};

  function newGame() {
    sim = NN.createSim({ toast: showToast, changed: updateHud, won: onWin });
    cam.x = 0; cam.y = CAMY; hover = null;
    $('win').hidden = true;
    updateHud();
  }

  // ---- drawing -----------------------------------------------------------------
  const R = (seed) => rng(((seed | 0) * 131 + boil * 977 + 5) >>> 0);
  const visible = (x, pad) => x > cam.x - (pad || 60) && x < cam.x + WW + (pad || 60);

  const scenery = [
    { noun: '_post', w: 150, h: 150, x: L.DEPOT_X, art: [['r', -86, -30, 172, 130, 'cream'], ['p', [-100, -28, -70, -100, 70, -100, 100, -28], 'navy'], ['r', -34, 20, 46, 80, 'brown'], ['r', 28, 10, 44, 34, 'sky'], ['l', [28, 27, 72, 27]], ['l', [50, 10, 50, 44]],
      ['r', -62, -74, 124, 30, 'white'], ['d', -4, 62, 1.8], ['r', -98, 66, 26, 34, 'tan'], ['l', [-98, 82, -72, 82]], ['r', -92, 40, 22, 26, 'tan'], ['l', [-81, 40, -81, 66]]] },
    { noun: '_sign', w: 70, h: 80, x: 470, art: [['r', -8, -20, 16, 120, 'brown'], ['p', [-100, -100, 60, -100, 100, -62, 60, -24, -100, -24], 'tan']] },
    { noun: '_stubL', w: 80, h: 70, x: L.RAV0 - 30, art: [['r', 30, -100, 16, 120, 'dbrown'], ['r', -30, -70, 14, 90, 'dbrown'], ['p', [-60, 20, 46, 20, 46, 40, -60, 40], 'brown'], ['p', [46, 20, 100, 60, 96, 82, 46, 40], 'brown'], ['l', [38, -80, -22, -52], 1.6], ['l', [-10, 20, -10, 40]], ['l', [20, 20, 20, 40]]] },
    { noun: '_stubR', w: 80, h: 70, x: L.RAV1 + 30, flip: true, art: [['r', 30, -100, 16, 120, 'dbrown'], ['r', -30, -70, 14, 90, 'dbrown'], ['p', [-60, 20, 46, 20, 46, 40, -60, 40], 'brown'], ['p', [46, 20, 96, 44, 92, 66, 46, 40], 'brown'], ['l', [38, -80, -22, -52], 1.6], ['l', [-10, 20, -10, 40]]] },
    { noun: '_cottage', w: 200, h: 180, x: 2480, art: [['r', -82, -22, 164, 122, 'cream'], ['p', [-100, -20, 0, -100, 100, -20], 'red'], ['r', 44, -86, 20, 44, 'grey'], ['r', -18, 36, 40, 64, 'teal'], ['r', -66, 4, 30, 30, 'sky'], ['r', 36, 4, 30, 30, 'sky'], ['d', 14, 70, 1.8],
      ['l', [-66, 19, -36, 19]], ['l', [36, 19, 66, 19]], ['e', -84, 84, 18, 16, 'green'], ['e', 86, 86, 16, 14, 'green']] },
  ];
  const courierSpec = { noun: '_courier', w: 34, h: 60, art: { a: 'person', top: 'teal', legs: 'navy', hat: 'cap', hatColor: 'red', satchel: 1 } };
  const parcelSpec = { noun: '_parcel', w: 16, h: 13, art: [['r', -100, -100, 200, 200, 'tan'], ['l', [0, -100, 0, 100]], ['l', [-100, 0, 100, 0]]] };

  function shadow(x, y, rx, a) {
    ctx.fillStyle = `rgba(42,37,32,${a})`; ctx.beginPath(); ctx.ellipse(x, y + 1, rx, Math.max(2.5, rx * 0.16), 0, 0, 7); ctx.fill();
  }
  function blit(spec, x, y, o) {
    o = o || {};
    const s = sprite(spec, o.pose || 0), f = s.frames[(boil + (o.id || 0)) % 3];
    ctx.save();
    ctx.translate(x, y);
    if (o.angle) ctx.rotate(o.angle);
    if (o.sy) { ctx.translate(0, spec.h / 2); ctx.scale(2 - o.sy, o.sy); ctx.translate(0, -spec.h / 2); }   // squash and stretch from the feet
    ctx.scale(o.flip ? -1 : 1, o.flipY ? -1 : 1);
    if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
    ctx.drawImage(f, -s.w / 2, -s.h / 2, s.w, s.h);
    ctx.restore();
  }
  // eyes are drawn live so creatures can look around, blink and react
  function drawEyes(spec, x, y, facing, st) {
    const eyes = sprite(spec, 0).eyes;
    if (!eyes.length) return;
    const r0 = Math.max(1.8, Math.min(3.6, Math.min(spec.w, spec.h) * 0.075));
    for (const [nx, ny, k] of eyes) {
      const ex = x + facing * nx / 100 * spec.w / 2, ey = y + (st.flipY ? -1 : 1) * ny / 100 * spec.h / 2, r = r0 * (k ? 0.95 : 1) * (st.wide ? 1.35 : 1);
      ctx.strokeStyle = P.ink; ctx.lineCap = 'round';
      if (st.closed || st.happy) {
        ctx.lineWidth = 1.7; ctx.beginPath();
        if (st.happy) ctx.arc(ex, ey + r * 0.5, r, Math.PI * 1.12, Math.PI * 1.88); else { ctx.moveTo(ex - r, ey); ctx.lineTo(ex + r, ey); }
        ctx.stroke(); continue;
      }
      // plain ink dots: they shift a little toward what the creature is looking at
      ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(ex + st.lx * r * 0.3, ey + st.ly * r * 0.25, r * 0.62, 0, 7); ctx.fill();
      if (st.angry) { ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ex - facing * r * 1.4, ey - r * 1.9); ctx.lineTo(ex + facing * r * 1.2, ey - r * 0.9); ctx.stroke(); }
    }
  }
  const blinking = (id) => ((sim.time + id * 0.61) % 3.4) < 0.13;
  function label(text, x, y, size, color) {
    ctx.font = `${size || 18}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = P.paper; ctx.lineJoin = 'round'; ctx.strokeText(text, x, y);
    ctx.fillStyle = color || P.ink; ctx.fillText(text, x, y);
  }

  function drawBackdrop() {
    ctx.fillStyle = P.paper; ctx.fillRect(0, 0, VW, VH);
    const g = ctx.createLinearGradient(0, 0, 0, 360);
    g.addColorStop(0, 'rgba(169,211,234,0.6)'); g.addColorStop(1, 'rgba(169,211,234,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, 360);
    // sun, clouds, far hills: slow parallax, pencil only
    ctx.save(); ctx.translate(-cam.x * 0.08, -(cam.y - CAMY) * 0.1);
    rough.ellipse(ctx, 930, 96, 34, 34, { r: R(1), fill: 'rgba(240,198,74,0.75)', ink: 'rgba(42,37,32,0.45)', lw: 1.4 });
    for (const [x, y, s] of [[180, 110, 1], [520, 70, 0.8], [760, 150, 1.1], [1120, 90, 0.9]]) {
      rough.ellipse(ctx, x, y, 46 * s, 15 * s, { r: R(x), fill: 'rgba(253,249,238,0.9)', ink: 'rgba(42,37,32,0.28)', lw: 1.2 });
      rough.ellipse(ctx, x + 26 * s, y - 10 * s, 30 * s, 14 * s, { r: R(x + 1), fill: 'rgba(253,249,238,0.9)', ink: 'rgba(42,37,32,0.28)', lw: 1.2 });
    }
    ctx.restore();
    ctx.save(); ctx.translate(-cam.x * 0.3 * Z, 0);
    const hy = (L.GROUND - cam.y) * Z + 14;
    for (const [x, w, h] of [[120, 380, 120], [700, 480, 170], [1300, 420, 110], [1800, 500, 150]]) rough.ellipse(ctx, x, hy, w, h, { r: R(x + 3), fill: '#d9e0b6', ink: 'rgba(42,37,32,0.22)', lw: 1.2 });
    ctx.restore();
  }

  function block(x0, x1) {
    const G = L.GROUND;
    rough.poly(ctx, [x0, G, x1, G, x1, 900, x0, 900], { r: R(x0 + 11), fill: '#e0cc9c', step: 40, amp: 1.3 });
    rough.poly(ctx, [x0, G + 150, x1, G + 150, x1, 900, x0, 900], { r: R(x0 + 14), fill: '#d3bd8a', step: 36, amp: 2.4, lw: 1.1, ink: 'rgba(42,37,32,0.4)' });
    rough.poly(ctx, [x0, G - 3, x1, G - 3, x1, G + 12, x0, G + 12], { r: R(x0 + 12), fill: P.green, step: 30, amp: 1.5, lw: 1.6 });
    const r = rng(x0 * 7 + 3);
    for (let x = x0 + 20; x < x1 - 12; x += 22 + r() * 46) {
      const h = 5 + r() * 8;
      if (visible(x)) rough.line(ctx, [x - 4, G - 2, x - 2, G - 2 - h, x, G - 2, x + 3, G - 3 - h * 0.8, x + 6, G - 2], { r: R(x), lw: 1.3, step: 99, amp: 0.6 });
    }
    const r2 = rng(x0 * 13 + 1), n = Math.round((x1 - x0) / 16);
    for (let i = 0; i < n; i++) {
      const x = x0 + 10 + r2() * (x1 - x0 - 30), y = G + 30 + r2() * 300, k = 6 + r2() * 12;
      if (visible(x)) rough.line(ctx, [x, y, x + k, y + k * 0.4], { r: R(i + x0), lw: 1.1, ink: 'rgba(42,37,32,0.3)', step: 99, amp: 0.5 });
    }
  }
  function drawTerrain() {
    // the far wall of the ravine, in shadow
    ctx.fillStyle = '#bfa878'; ctx.fillRect(L.RAV0 - 2, L.GROUND + 4, L.RAV1 - L.RAV0 + 4, L.RAVBOT - L.GROUND);
    const rr = rng(31);
    for (let i = 0; i < 26; i++) { const x = L.RAV0 + 14 + rr() * (L.RAV1 - L.RAV0 - 50), y = L.GROUND + 16 + rr() * 180, k = 14 + rr() * 26; rough.line(ctx, [x, y, x + k, y + (rr() - 0.5) * 6], { r: R(i + 200), lw: 1.2, ink: 'rgba(42,37,32,0.35)', step: 99, amp: 0.6 }); }
    rough.poly(ctx, [L.RAV0 - 6, L.RAVBOT, L.RAV1 + 6, L.RAVBOT, L.RAV1 + 6, 900, L.RAV0 - 6, 900], { r: R(5), fill: '#a8946a', step: 40 });
    block(-90, L.RAV0); block(L.RAV1, L.W + 90);
    for (const s of scenery) if (visible(s.x, 160)) blit(s, s.x, L.GROUND - s.h / 2 + 2, { flip: s.flip });
    if (visible(L.DEPOT_X, 160)) label('POST', L.DEPOT_X, L.GROUND - 121, 20, P.navy);
    if (visible(470, 100)) label('mailbox', 466, L.GROUND - 66, 15);
  }
  function drawWater() {
    const t = reduceMotion ? 0 : sim.time;
    ctx.fillStyle = 'rgba(90,151,208,0.55)';
    ctx.fillRect(L.RAV0, L.WATER, L.RAV1 - L.RAV0, L.RAVBOT - L.WATER + 2);
    for (let k = 0; k < 3; k++) {
      const pts = [];
      for (let x = L.RAV0 + 2; x <= L.RAV1 - 2; x += 14) pts.push(x, L.WATER + k * 15 + Math.sin(x * 0.06 + t * 2 + k * 1.7) * 2.6);
      rough.line(ctx, pts, { r: R(k + 70), lw: k ? 1.2 : 1.9, ink: k ? 'rgba(253,249,238,0.8)' : P.ink, step: 99, amp: 0.4 });
    }
  }

  function flames(e, small) {
    const n = Math.max(1, Math.min(8, Math.round(e.w * Math.min(e.h, VH) / 2600)));
    const r = R(e.id * 17 + Math.floor(sim.time * 12));
    const top = Math.max(e.y - e.h / 2, cam.y - 20), bot = Math.min(e.y + e.h / 2, cam.y + WH + 20);
    for (let i = 0; i < n; i++) {
      const x = e.x + (r() - 0.5) * e.w * 0.9, y = top + (bot - top) * (n === 1 ? 0.5 : r()), s = (small ? 7 : 11) + r() * 8;
      rough.poly(ctx, [x - s * 0.7, y + s * 0.6, x - s * 0.8, y - s * 0.2, x - s * 0.3, y - s * 0.5, x, y - s * 1.6, x + s * 0.4, y - s * 0.5, x + s * 0.8, y - s * 0.1, x + s * 0.7, y + s * 0.6], { r, fill: P.orange, lw: 1.5, step: 99, amp: 1.2 });
      rough.poly(ctx, [x - s * 0.3, y + s * 0.5, x - s * 0.3, y, x, y - s * 0.8, x + s * 0.3, y, x + s * 0.3, y + s * 0.5], { r, fill: P.yellow, lw: 0, step: 99 });
    }
  }

  const layerOf = (e) => (e.placing ? 9 : e === sim.natives.brambles ? 1 : e.spec.traps ? 5 : e.spec.alive || e.spec.wasAlive ? 4 : e.spec.rideable ? 3 : e.spec.solid ? 2 : (e.spec.anchored || e.spec.floating) ? 0 : 6);
  function drawEnt(e) {
    if (e.heldBy || !visible(e.x, e.w / 2 + 80)) return;
    const s = e.spec, live = s.alive && sim.active(e);
    const pose = (live || e.mountedBy) && e.moving && !s.flies ? (Math.floor(e.walkT * 9) % 2 ? 1 : 2) : 0;
    let y = e.y, angle = s.upright ? 0 : e.body.angle;
    if (s.flies && (live || e.mountedBy) && !reduceMotion) y += Math.sin(sim.time * 5 + e.id) * 2.5;
    if (s.alive && e.asleepUntil > sim.time && !s.frozen) angle = 0;
    if (!e.placing && e !== sim.natives.brambles) { if (s.floating || (s.flies && s.alive)) shadow(e.x, sim.groundAt(e.x), Math.min(40, e.w * 0.3), 0.07); else if (s.upright || Math.abs(angle) < 0.2) shadow(e.x, e.y + e.h / 2, Math.min(90, e.w * 0.46), 0.15); }
    const g = e.goal, vy = e.body.velocity.y;
    let sy = 0;
    if (s.alive && !reduceMotion) {
      sy = 1 + Math.max(-0.1, Math.min(0.12, -vy * 0.02));
      if (live && !e.moving) sy += Math.sin(sim.time * 2.6 + e.id) * 0.018;                 // breathing
      if (live && e.moving && !s.flies) { y -= Math.abs(Math.sin(e.walkT * 14)) * 2.2; angle += e.facing * 0.045; }
      if (e.eatP > 0) sy += Math.sin(sim.time * 22) * 0.04;                                   // chewing
    }
    blit(s, e.x, y, { pose, id: e.id, angle, sy, flip: e.facing < 0, flipY: !!s.wasAlive, alpha: e.placing ? 0.62 : s.stealth ? 0.3 : e.flash > 0 ? 0.5 : 1 });
    if (s.alive || s.wasAlive) {
      const t = (live && g && g.t) || sim.player, dx = t.x - e.x, dy = t.y - e.y, d = Math.hypot(dx, dy) || 1;
      drawEyes(s, e.x, y, e.facing, { flipY: !!s.wasAlive, lx: dx / d, ly: dy / d, closed: !live || blinking(e.id), happy: live && e.eatP > 0,
        wide: live && ((g && g.type === 'flee') || e.burning > 0 || e.flash > 0), angry: live && g && g.type === 'attack' });
      if (live && g && g.type === 'flee') label('!', e.x + e.facing * e.w * 0.3, e.y - e.h / 2 - 12 - Math.abs(Math.sin(sim.time * 9)) * 3, 20, P.red);
      else if (live && g && g.type === 'follow' && Math.floor(sim.time * 0.5 + e.id) % 3 === 0) label('\u2665', e.x, e.y - e.h / 2 - 12, 13, P.red);
    }
    if (e.burning > 0) flames(e); else if (s.aflame && !e.doused) flames(e, true);
    if (e.fuse > 0) label(Math.ceil(e.fuse) + '', e.x, e.y - e.h / 2 - 14, 20, P.red);
    if (s.alive && !s.frozen && e.asleepUntil > sim.time) label('z z', e.x + 10, e.y - e.h / 2 - 8 + Math.sin(sim.time * 2) * 3, 17);
    if (e.stunUntil > sim.time) { rough.ellipse(ctx, e.x, e.y, e.w / 2 + 6, e.h / 2 + 6, { r: R(e.id + 9), lw: 1.4 }); rough.line(ctx, [e.x - e.w / 2, e.y - 6, e.x + e.w / 2, e.y + 6], { r: R(e.id + 10), lw: 1.2 }); rough.line(ctx, [e.x - e.w / 2, e.y + 6, e.x + e.w / 2, e.y - 6], { r: R(e.id + 11), lw: 1.2 }); }
    if (e.eatP > 0 && e.goal && e.goal.t) { const t = e.goal.t; rough.line(ctx, [t.x - 14, t.y - t.h / 2 - 10, t.x - 14 + 28 * Math.min(1, e.eatP / (t.isParcel ? 1.1 : t.native ? 4.5 : Math.max(0.6, Math.min(3, t.w * t.h / 900)))), t.y - t.h / 2 - 10], { r: R(3), lw: 3.5, color: P.red, step: 99, amp: 0.2 }); }
  }

  const gearSpot = { wings: [0, -6, 1], jetpack: [-11, -2, 1], cape: [-9, 4, 1], balloon: [13, -44], umbrella: [9, -40], parachute: [0, -54], armor: [0, 0], pogo: [0, 14], skates: [0, 22], boots: [0, 22] };
  function drawHeld(p, back) {
    const e = p.held;
    if (!e) return;
    const spot = gearSpot[e.spec.noun], isBack = !!(spot && spot[2]);
    if (isBack !== back) return;
    const swing = e.useT > 0 ? Math.sin((0.25 - e.useT) / 0.25 * Math.PI) * 1.2 : 0;
    if (spot) blit(e.spec, p.x + p.facing * spot[0], p.y + spot[1], { id: e.id, flip: p.facing < 0 });
    else blit(e.spec, p.x + p.facing * (15 + swing * 6), p.y + 2 - swing * 4, { id: e.id, flip: p.facing < 0, angle: p.facing * (0.25 + swing) });
    if (e.spec.hot || e.spec.aflame) flames({ id: e.id, x: p.x + p.facing * 15, y: p.y - 16, w: 12, h: 12 }, true);
  }
  function drawPlayer() {
    const p = sim.player;
    if (p.invuln > 0 && !sim.won && Math.floor(sim.time * 14) % 2) return;
    drawHeld(p, true);
    const pose = p.moving ? (Math.floor(p.walkT * 10) % 2 ? 1 : 2) : 0;
    shadow(p.x, p.y + p.h / 2, 15, p.grounded || p.mount ? 0.16 : 0.07);
    const vy = p.mount ? 0 : p.body.velocity.y, hurt = p.invuln > 0 && !sim.won;
    const sy = reduceMotion ? 0 : 1 + Math.max(-0.12, Math.min(0.14, -vy * 0.022)) + (p.moving ? 0 : Math.sin(sim.time * 2.6) * 0.015);
    const bob = p.moving && !reduceMotion ? Math.abs(Math.sin(p.walkT * 15)) * 2.4 : 0;
    blit(courierSpec, p.x, p.y - 5 - bob, { pose, sy, flip: p.facing < 0, id: 1, angle: p.moving ? p.facing * 0.05 : 0 });
    drawEyes(courierSpec, p.x, p.y - 5 - bob, p.facing, { lx: p.facing * 0.8, ly: Math.max(-0.6, Math.min(0.8, vy * 0.12)), closed: !hurt && blinking(1), happy: sim.won, wide: hurt || vy > 6 });
    if (p.hasParcel) blit(parcelSpec, p.x + p.facing * 7, p.y + 3, { id: 2 });
    drawHeld(p, false);
  }

  function drawFx() {
    for (const f of sim.fx) {
      const k = f.age / f.life, a = Math.max(0, 1 - k);
      ctx.globalAlpha = a;
      switch (f.type) {
        case 'puff': rough.ellipse(ctx, f.x, f.y, (f.size || 6) * (0.6 + k), (f.size || 6) * (0.6 + k), { r: R(f.x), fill: P[f.color] || P.white, lw: 1.3 }); break;
        case 'smoke': rough.ellipse(ctx, f.x, f.y, (f.size || 6) * (0.6 + k * 1.4), (f.size || 6) * (0.6 + k * 1.4), { r: R(f.x), fill: 'rgba(93,88,82,0.5)', lw: 0 }); break;
        case 'flame': rough.ellipse(ctx, f.x, f.y, (f.size || 8) * (1 - k * 0.6), (f.size || 8) * (1 - k * 0.6), { r: R(f.x), fill: k < 0.4 ? P.yellow : P.orange, lw: 1.3 }); break;
        case 'spark': ctx.fillStyle = P.yellow; ctx.beginPath(); ctx.arc(f.x, f.y, 2.5, 0, 7); ctx.fill(); break;
        case 'drop': case 'rain': ctx.strokeStyle = P.blue; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x - f.vx * 1.5, f.y - (f.vy || 3) * 1.4); ctx.stroke(); break;
        case 'star': { const pts = []; for (let i = 0; i < 10; i++) { const an = i / 10 * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? 4 : 9; pts.push(f.x + Math.cos(an) * rr, f.y + Math.sin(an) * rr); } rough.poly(ctx, pts, { r: R(f.life * 1000), fill: P.yellow, lw: 1.3, step: 99, amp: 0.4 }); break; }
        case 'note': label('♪', f.x, f.y, 22, P.purple); break;
        case 'text': label(f.text, f.x, f.y, 19); break;
        case 'splash': for (let i = -2; i <= 2; i++) rough.line(ctx, [f.x + i * 7, f.y, f.x + i * 13, f.y - 26 * k - 8 + Math.abs(i) * 5], { r: R(i + 40), lw: 2, color: P.blue, step: 99 }); break;
        case 'boom': for (let i = 0; i < 10; i++) { const an = i / 10 * Math.PI * 2, r0 = 12 + k * 30, r1 = 26 + k * 60; rough.line(ctx, [f.x + Math.cos(an) * r0, f.y + Math.sin(an) * r0, f.x + Math.cos(an) * r1, f.y + Math.sin(an) * r1], { r: R(i), lw: 3, color: i % 2 ? P.orange : P.yellow, step: 99 }); } break;
        case 'hit': for (let i = 0; i < 5; i++) { const an = i / 5 * Math.PI * 2 + 0.4; rough.line(ctx, [f.x + Math.cos(an) * 5, f.y + Math.sin(an) * 5, f.x + Math.cos(an) * 14, f.y + Math.sin(an) * 14], { r: R(i), lw: 1.8, step: 99 }); } break;
        case 'swing': { const pts = []; for (let i = 0; i <= 6; i++) { const an = (-1.1 + i / 6 * 2.2); pts.push(f.x + Math.cos(an) * 22 * f.dir, f.y + Math.sin(an) * 26); } rough.line(ctx, pts, { r: R(8), lw: 2.2, step: 99 }); break; }
        case 'ring': rough.ellipse(ctx, f.x, f.y, 20 + k * 180, 20 + k * 120, { r: R(9), lw: 1.6 }); break;
        case 'zap': { const pts = [f.x, f.y]; const r = R(f.x2); for (let i = 1; i < 6; i++) pts.push(f.x + (f.x2 - f.x) * i / 6 + (r() - 0.5) * 22, f.y + (f.y2 - f.y) * i / 6 + (r() - 0.5) * 22); pts.push(f.x2, f.y2); rough.line(ctx, pts, { r, lw: 3, color: P.yellow, step: 99 }); break; }
        case 'flash': ctx.globalAlpha = a * 0.7; ctx.fillStyle = P.white; ctx.fillRect(cam.x, cam.y, WW, WH); break;
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawHints() {
    const p = sim.player, d = sim.dragging();
    if (hover && !d && !hover.removed) {
      rough.poly(ctx, [hover.x - hover.w / 2 - 6, hover.y - hover.h / 2 - 6, hover.x + hover.w / 2 + 6, hover.y - hover.h / 2 - 6, hover.x + hover.w / 2 + 6, hover.y + hover.h / 2 + 6, hover.x - hover.w / 2 - 6, hover.y + hover.h / 2 + 6], { r: R(77), lw: 1.3, ink: 'rgba(42,37,32,0.6)' });
      label(hover.name, hover.x, hover.y - hover.h / 2 - 20, 18);
    }
    if (d) label(d.fresh ? d.name + ': click to place' : d.name, d.x, d.y - d.h / 2 - 18, 18);
    if (!started || sim.won) return;
    const t = sim.interactTarget();
    if (t && !d) label(t.spec.launcher ? 'E: launch' : t.spec.rideable && !t.spec.carry ? 'E: ride' : 'E: pick up', t.x, t.y - t.h / 2 - (hover === t ? 40 : 16), 16, P.navy);
    else if (p.mount) label('E: hop off' + (p.mount.spec.breath ? '  ·  F: breathe fire' : ''), p.x, p.y - 44, 16, P.navy);
    else if (p.held && p.held.spec.use && sim.time - (p.heldSince || 0) < 4) label('F: use  ·  Q: drop', p.x, p.y - 46, 16, P.navy);
    if (!p.hasParcel && visible(L.DEPOT_X, 200)) label('fresh parcels here', L.DEPOT_X, L.GROUND - 172, 17, P.red);
  }

  let grain = null;
  function drawGrain() {
    if (!grain) {
      const g = document.createElement('canvas'); g.width = g.height = 180;
      const c = g.getContext('2d'), r = rng(99);
      for (let i = 0; i < 2600; i++) { c.fillStyle = r() > 0.5 ? 'rgba(42,37,32,0.028)' : 'rgba(255,255,255,0.05)'; c.fillRect(r() * 180, r() * 180, 1 + r() * 1.6, 1 + r() * 1.6); }
      grain = ctx.createPattern(g, 'repeat');
    }
    ctx.fillStyle = grain; ctx.fillRect(0, 0, VW, VH);
  }

  function draw() {
    const k = cv.width / VW;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    drawBackdrop();
    ctx.save();
    ctx.scale(Z, Z); ctx.translate(-cam.x, -cam.y);
    drawTerrain();
    const list = sim.ents.slice().sort((a, b) => layerOf(a) - layerOf(b) || a.id - b.id);
    for (const e of list) if (layerOf(e) < 4) drawEnt(e);
    if (sim.player.mount) { drawEnt(sim.player.mount); drawPlayer(); }
    for (const e of list) if (layerOf(e) >= 4 && e !== sim.player.mount) drawEnt(e);
    if (!sim.player.mount) drawPlayer();
    drawWater();
    drawFx();
    drawHints();
    ctx.restore();
    drawGrain();
  }

  // ---- loop -----------------------------------------------------------------
  let last = 0, acc = 0;
  function frame(ts) {
    const dt = Math.min(0.1, (ts - last) / 1000 || 0); last = ts; acc += dt;
    if (!reduceMotion) boil = Math.floor(ts / 150) % 3;
    let steps = 0;
    while (acc >= 1 / 60 && steps < 4) {
      const p = sim.player, before = p.held;
      sim.step(started ? { left: keys.left, right: keys.right, up: keys.up, down: keys.down, jump: keys.jump, jumpPressed: pressed.jump, upPressed: pressed.up, interactPressed: pressed.interact, usePressed: pressed.use, dropPressed: pressed.drop } : {});
      if (p.held !== before) p.heldSince = sim.time;
      for (const kk in pressed) pressed[kk] = false;
      acc -= 1 / 60; steps++;
    }
    if (steps === 4) acc = 0;
    // camera
    const p = sim.player, d = sim.dragging();
    if (d) { if (mouse.inside && mouse.sx < 70) cam.x -= 8; if (mouse.inside && mouse.sx > VW - 70) cam.x += 8; }
    else cam.x += (p.x - WW * 0.42 + p.facing * 40 - cam.x) * 0.08;
    cam.x = Math.max(0, Math.min(L.W - WW, cam.x));
    const ty = Math.min(CAMY, Math.max(L.SKY - 120, p.y - 200));
    cam.y += (ty - cam.y) * 0.1;
    mouse.x = mouse.sx / Z + cam.x; mouse.y = mouse.sy / Z + cam.y;
    if (d) sim.dragTo(mouse.x, mouse.y);
    hover = d || !mouse.inside ? null : sim.pick(mouse.x, mouse.y);
    cv.style.cursor = d ? 'grabbing' : hover ? 'grab' : 'default';
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
    draw();
    requestAnimationFrame(frame);
  }

  // ---- page: HUD, toasts, summoning -------------------------------------------------
  function showToast(text) { const t = $('toast'); t.textContent = text; t.classList.add('show'); toastT = 4.2; }
  function updateHud() {
    if (!sim) return;
    const p = sim.player;
    $('hearts').textContent = '♥'.repeat(Math.max(0, p.hp)) + '♡'.repeat(Math.max(0, 3 - p.hp));
    $('parcel').textContent = p.hasParcel ? 'Parcel: safe' : 'Parcel: lost';
    $('parcel').classList.toggle('bad', !p.hasParcel);
    $('words').textContent = `Words: ${sim.words.length} (par ${L.PAR})`;
    $('page').textContent = `On the page: ${sim.spawnedCount()}/${L.MAX_OBJECTS}`;
    $('found').textContent = `${store.found.length} of ${NN.lexicon.nounCount}`;
    $('foundlist').textContent = store.found.length ? store.found.map(NN.lexicon.displayName).sort().join(', ') : 'Nothing yet. Every new thing you summon is written down here.';
  }
  function setMsg(text, suggestion) {
    const m = $('msg');
    m.textContent = text || '';
    if (suggestion) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'linkish'; b.textContent = `Did you mean "${suggestion}"?`;
      b.addEventListener('click', () => { $('word').value = suggestion; summon(suggestion); });
      m.appendChild(document.createTextNode(' ')); m.appendChild(b);
    }
  }
  function summon(text) {
    if (!started) start();
    if (sim.won) return;
    if (sim.dragging() && sim.dragging().fresh) sim.release();
    const p = sim.player, place = mouse.inside || coarse;
    const x = place ? mouse.x : p.x + p.facing * 70, y = place ? mouse.y : p.y - 110;
    const r = sim.spawn(text, x, y, place);
    if (!r.ok) { setMsg(r.error, r.suggestion); return; }
    if (!place) { const e = r.ent; sim.grab(e, true); sim.dragTo(p.x + p.facing * (e.w / 2 + 44), p.y - 110); sim.release(); }
    if (!store.found.includes(r.noun)) { store.found.push(r.noun); save(); }
    setMsg(place ? `"${r.name}" is ready. Click where you want it.` : `Summoned: ${r.name}.`);
    $('word').value = ''; $('word').blur();
    updateHud();
  }
  $('write').addEventListener('submit', (ev) => { ev.preventDefault(); const v = $('word').value.trim(); if (v) summon(v); });

  function onWin(res) {
    const nouns = [...new Set(res.words.map((w) => w.noun))];
    const stale = nouns.filter((n) => store.usedInWins.includes(n));
    const stars = 1 + (res.words.length <= L.PAR ? 1 : 0) + (res.words.length <= L.PAR && !stale.length ? 1 : 0);
    $('stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    $('wintitle').textContent = res.words.length === 0 ? 'Delivered with no words at all!' : res.words.length === 1 ? 'Delivered. One-word wonder!' : 'Delivered!';
    const lines = [];
    lines.push(res.words.length ? `You wrote ${res.words.length} word${res.words.length === 1 ? '' : 's'} in ${Math.round(res.time)} seconds: ${res.words.map((w) => w.name).join(', ')}.` : `Done in ${Math.round(res.time)} seconds.`);
    if (res.words.length > L.PAR) lines.push(`Second star: deliver in ${L.PAR} words or fewer.`);
    else if (stale.length) lines.push(`Third star: deliver in ${L.PAR} words or fewer without reusing a word from an earlier win (${stale.map(NN.lexicon.displayName).join(', ')}).`);
    else lines.push('All three stars. Those words are now used up for the third star, so find another way.');
    if (res.parcelsLost) lines.push(`Parcels lost along the way: ${res.parcelsLost}.`);
    $('winbody').textContent = lines.join(' ');
    for (const n of nouns) if (!store.usedInWins.includes(n)) store.usedInWins.push(n);
    store.best = Math.max(store.best || 0, stars); save();
    $('win').hidden = false;
    $('again').focus();
    updateHud();
  }
  function start() { started = true; $('intro').hidden = true; }
  $('start').addEventListener('click', () => { start(); cv.focus(); });
  $('again').addEventListener('click', () => { newGame(); cv.focus(); });
  $('restart').addEventListener('click', () => { newGame(); setMsg('Level reset.'); });
  $('clear').addEventListener('click', () => { sim.clearAll(); setMsg('Page cleared.'); });
  const hints = ['The gap wants something long, something bouncy, or something that flies.', 'Goats eat nearly anything, and they run from anything with teeth.', 'Brambles are plants. Plants can be cut, burned, eaten or mown.',
    'Describing words work: try giant, friendly, flaming, sleepy or tiny in front of a noun.', 'Some words solve two problems at once. A few solve all three.'];
  let hintI = 0;
  $('hint').addEventListener('click', () => { setMsg('Hint: ' + hints[hintI++ % hints.length]); });

  // ---- input -----------------------------------------------------------------
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const keymap = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', Space: 'jump', KeyE: 'interact', KeyF: 'use', KeyQ: 'drop' };
  window.addEventListener('keydown', (ev) => {
    const typing = document.activeElement === $('word');
    if (ev.code === 'Escape') { $('word').blur(); const d = sim.dragging(); if (d && d.fresh) sim.erase(d); return; }
    if (typing || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.code === 'Enter' || ev.code === 'KeyT' || ev.code === 'Slash') { if (document.activeElement && document.activeElement.tagName === 'BUTTON' && ev.code === 'Enter') return; ev.preventDefault(); $('word').focus(); return; }
    if ((ev.code === 'KeyX' || ev.code === 'Delete' || ev.code === 'Backspace') && (hover || sim.dragging())) { ev.preventDefault(); sim.erase(sim.dragging() || hover); return; }
    const k = keymap[ev.code];
    if (!k) return;
    if (document.activeElement && document.activeElement.tagName === 'BUTTON' && ev.code === 'Space') return;
    ev.preventDefault();
    if (!started) start();
    if (!keys[k]) pressed[k] = true;
    keys[k] = true;
  });
  window.addEventListener('keyup', (ev) => { const k = keymap[ev.code]; if (k) keys[k] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  function setMouse(ev) {
    const r = cv.getBoundingClientRect();
    mouse.sx = (ev.clientX - r.left) * VW / r.width; mouse.sy = (ev.clientY - r.top) * VH / r.height;
    mouse.x = mouse.sx / Z + cam.x; mouse.y = mouse.sy / Z + cam.y; mouse.inside = true;
  }
  cv.addEventListener('pointermove', (ev) => { setMouse(ev); if (sim.dragging()) sim.dragTo(mouse.x, mouse.y); });
  cv.addEventListener('pointerleave', () => { if (!sim.dragging()) mouse.inside = false; });
  cv.addEventListener('pointerdown', (ev) => {
    setMouse(ev);
    $('word').blur();
    if (!started) start();
    const d = sim.dragging();
    if (ev.button === 2) { sim.erase(d || sim.pick(mouse.x, mouse.y)); return; }
    if (d && d.fresh) { sim.dragTo(mouse.x, mouse.y); sim.release(); setMsg(''); return; }
    const e = sim.pick(mouse.x, mouse.y);
    if (e && sim.grab(e)) { try { cv.setPointerCapture(ev.pointerId); } catch (err) { /* older browsers */ } }
  });
  window.addEventListener('pointerup', () => { const d = sim.dragging(); if (d && !d.fresh) sim.release(); });
  cv.addEventListener('contextmenu', (ev) => ev.preventDefault());
  for (const b of document.querySelectorAll('[data-key]')) {
    const k = b.dataset.key;
    const down = (ev) => { ev.preventDefault(); if (!started) start(); if (!keys[k]) pressed[k] = true; keys[k] = true; };
    const up = () => { keys[k] = false; };
    b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up);
  }

  // ---- boot -----------------------------------------------------------------
  function resize() { const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = VW * dpr; cv.height = VH * dpr; }
  resize();
  newGame();
  requestAnimationFrame(frame);

  // for tests and the curious
  NN.game = { get sim() { return sim; }, summon, start, keys, pressed, cam, mouse, newGame, store };
})(window.NN);
