/* Sim: physics and rules for one level. No drawing and no DOM in here.
 *
 * The rules are deliberately few and general (things burn, float, get eaten;
 * creatures flee what they fear and chase what they hunt). Everything specific
 * comes from the dictionary and from the level description in levels.js.
 */
(function (NN) {
  'use strict';
  const { Engine, Bodies, Body, Composite, Query } = Matter;
  const CAT = { TERRAIN: 1, SOLID: 2, ITEM: 4, CREATURE: 8, PLAYER: 16 };
  const DT = 1 / 60, JUMP = 7.9;
  const FLOATS = ['wood', 'ice', 'rubber', 'plant', 'paper', 'cloth', 'food'];

  function createSim(hooks, L) {
    hooks = hooks || {};
    L = L || NN.levels[0];
    const engine = Engine.create();
    engine.gravity.y = L.gravity || 1;
    const world = engine.world, G = engine.gravity.scale * engine.gravity.y;
    const terrain = [];
    const addTerrain = (x0, y0, x1, y1) => { const b = Bodies.rectangle((x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0, { isStatic: true, friction: 0.8, collisionFilter: { category: CAT.TERRAIN, mask: 0xffff } }); terrain.push(b); Composite.add(world, b); };
    for (const t of L.terrain) addTerrain(t.x0, t.y0, t.x1, t.y1);
    addTerrain(-300, -3000, 0, 3000); addTerrain(L.W, -3000, L.W + 300, 3000);
    // first surface at or below y under x
    const groundBelow = (x, y) => { let best = L.deathY; for (const t of L.terrain) if (x >= t.x0 && x <= t.x1 && t.y0 >= y - 3 && t.y0 < best) best = t.y0; return best; };
    const waterAt = (x) => (L.water || []).find((w) => x > w.x0 && x < w.x1) || null;

    const ents = [], fx = [];
    const HERO = L.hero || 'Nib', DEPOT = L.depotName || 'the ship', CARGO = L.cargo || 'star seed';
    const sim = { time: 0, ents, fx, words: [], won: false, parcelsLost: 0, level: L, groundBelow, waterAt, natives: {} };
    let uid = 0, drag = null, solidList = terrain;

    const toast = (t) => hooks.toast && hooks.toast(t);
    const sfx = (n) => hooks.sfx && hooks.sfx(n);
    const changed = () => hooks.changed && hooks.changed();
    const addFx = (type, x, y, o) => { if (fx.length < 260) fx.push(Object.assign({ type, x, y, vx: 0, vy: 0, life: 0.7, age: 0 }, o)); };
    const say = (e, text) => addFx('text', e.x, e.y - e.h / 2 - 8, { text, vy: -0.4, life: 1.1 });
    const bang = (e, text) => addFx('bang', e.x, e.y - e.h / 2 - 10, { text, life: 0.8 });
    const puff = (e, n, color) => { for (let i = 0; i < (n || 6); i++) addFx('puff', e.x + (Math.random() - 0.5) * e.w, e.y + (Math.random() - 0.5) * Math.min(e.h, 160), { vx: (Math.random() - 0.5) * 1.5, vy: -Math.random() * 1.2, life: 0.5 + Math.random() * 0.3, color, size: 5 + Math.random() * 7 }); };

    // ---- entities -----------------------------------------------------------
    function addEntity(spec, x, y, opt) {
      opt = opt || {};
      if (spec.grow) spec = Object.assign({}, spec);
      const e = { id: ++uid, spec, name: spec.name, w: spec.w, h: spec.h, x, y, hp: spec.hp, native: !!opt.native, facing: opt.facing || 1, home: opt.home === undefined ? x : opt.home, range: opt.range || 140,
        fullUntil: 0, asleepUntil: spec.sleeps ? Infinity : 0, stunUntil: 0, scaredUntil: 0, burning: 0, heat: 0, wetUntil: spec.soaked ? Infinity : 0, loudUntil: 0,
        atkCd: 0, thinkCd: Math.random() * 0.25, goal: null, walkT: 0, eatP: 0, tpCd: 0, born: sim.time };
      const filter = spec.solid ? { category: CAT.SOLID, mask: 0xffff }
        : (spec.alive || spec.wasAlive || spec.rideable) ? { category: CAT.CREATURE, mask: CAT.TERRAIN | CAT.SOLID }
          : { category: CAT.ITEM, mask: CAT.TERRAIN | CAT.SOLID | CAT.ITEM };
      const o = { density: 0.001 * (spec.mass || 1), friction: spec.material === 'ice' ? 0.02 : spec.solid ? 0.95 : 0.7, frictionAir: 0.012, restitution: spec.bounce || 0, collisionFilter: filter };
      e.body = spec.shape === 'circle' ? Bodies.circle(x, y, spec.w / 2, o) : Bodies.rectangle(x, y, spec.w, spec.h, o);
      if (spec.upright) Body.setInertia(e.body, Infinity);
      e.body.ent = e;
      Composite.add(world, e.body);
      ents.push(e);
      return e;
    }
    function settle(e) {
      const s = e.spec, b = e.body;
      if (s.floating) Body.setStatic(b, true);
      else if (s.anchored) { Body.setPosition(b, { x: b.position.x, y: groundBelow(b.position.x, b.position.y) - e.h / 2 }); Body.setStatic(b, true); }
      e.x = b.position.x; e.y = b.position.y; e.home = e.x;
      if (s.strike) strike(e);
    }
    function remove(e, quiet) {
      if (e.removed) return;
      e.removed = true;
      if (e.goneMsg && !quiet) toast(e.goneMsg);
      if (e.mountedBy) dismount();
      if (e.heldBy) player.held = null; else Composite.remove(world, e.body);
      if (drag === e) drag = null;
      for (const c of ents) if (c.cagedBy === e) c.cagedBy = null;
    }
    function resize(e, w, h) {
      if (w === e.w && h === e.h) return;
      const bottom = e.body.position.y + e.h / 2;
      Body.scale(e.body, w / e.w, h / e.h);
      e.w = w; e.h = h;
      Body.setPosition(e.body, { x: e.body.position.x, y: bottom - h / 2 });
      if (e.spec.upright) Body.setInertia(e.body, Infinity);
      e.y = e.body.position.y;
    }

    // ---- the courier -----------------------------------------------------------
    const player = sim.player = { isPlayer: true, name: HERO, w: 24, h: 50, x: L.start.x, y: L.start.y - 26, hp: 3, facing: 1, held: null, mount: null, hasParcel: true, mods: {}, scale: 1,
      spec: { alive: true, tags: ['human', 'courier'] }, invuln: 0, flapCd: 0, walkT: 0, grounded: false, climbing: false, launched: false, loudUntil: 0, tpCd: 0, moving: false };
    player.body = Bodies.rectangle(player.x, player.y, player.w, player.h, { friction: 0, frictionAir: 0.01, collisionFilter: { category: CAT.PLAYER, mask: CAT.TERRAIN | CAT.SOLID } });
    Body.setInertia(player.body, Infinity);
    player.body.ent = player;
    Composite.add(world, player.body);
    const parcel = { isParcel: true, name: CARGO, w: 16, h: 14, x: 0, y: 0, spec: { tags: ['shiny', 'valuable', 'parcel'], edible: true } };

    // ---- level natives -----------------------------------------------------------
    for (const n of L.natives || []) {
      const base = n.word ? NN.lexicon.resolve(n.word).spec : { tags: [], hp: 3, w: 40, h: 40, material: 'stone' };
      const spec = Object.assign(base, n.spec || {});
      if (spec.flammable === undefined) spec.flammable = false;
      if (n.name) spec.name = n.name;
      const y = (n.y === undefined ? groundBelow(n.x, -2000) : n.y) - spec.h / 2;
      const e = addEntity(spec, n.x, y, { native: true, facing: n.facing, home: n.home, range: n.range });
      e.key = n.key; e.goneMsg = n.goneMsg; e.resists = n.resists; e.fixed = !!n.fixed;
      if (n.asleep) e.asleepUntil = Infinity;
      if (n.fixed || spec.anchored || spec.floating) Body.setStatic(e.body, true);
      if (n.key) sim.natives[n.key] = e;
    }

    {
      const spec = Object.assign({ tags: [], hp: Infinity, material: 'metal', flammable: false, anchored: true, upright: true, name: 'beacon' }, NN.levelArt.beacon);
      const e = addEntity(spec, L.goal.x, L.goal.y - spec.h / 2, { native: true });
      e.resists = 'all'; e.fixed = true; Body.setStatic(e.body, true); sim.natives.goal = e;
    }

    // ---- helpers -----------------------------------------------------------
    const gap = (a, b) => Math.max(Math.abs(a.x - b.x) - (a.w + b.w) / 2, Math.abs(a.y - b.y) - (a.h + b.h) / 2);
    const isHot = (t) => !t.isPlayer && !t.isParcel && ((t.spec.hot && !t.doused) || t.burning > 0);
    const isWet = (t) => t.wetUntil > sim.time;
    const flammable = (t) => !t.isPlayer && !t.isParcel && t.spec.flammable && !t.spec.fireproof && !isWet(t);
    function tagsOf(t) {
      const tg = t.spec.tags, extra = [];
      if (isHot(t)) extra.push('fire');
      if (t.spec.loud || t.loudUntil > sim.time) extra.push('loud');
      if (t.spec.light) extra.push('light');
      if (!t.isPlayer && !t.isParcel && isWet(t)) extra.push('wet');
      return extra.length ? tg.concat(extra) : tg;
    }
    function things() {
      const out = ents.filter((e) => !e.placing && !e.removed && !e.spec.stealth);
      if (!player.mods.stealth) { out.push(player); if (player.hasParcel) out.push(parcel); }
      return out;
    }
    let seen = [];
    function nearest(c, tags, R, pred) {
      if (!tags || !tags.length) return null;
      let best = null, bd = R;
      for (const t of seen) {
        if (t === c || (pred && !pred(t))) continue;
        const tg = tagsOf(t);
        if (!tags.some((x) => tg.includes(x))) continue;
        const d = Math.hypot(Math.max(0, Math.abs(t.x - c.x) - (t.w + c.w) / 2), Math.max(0, Math.abs(t.y - c.y) - (t.h + c.h) / 2) * 0.7);
        if (d < bd) { bd = d; best = t; }
      }
      return best;
    }
    const onGround = (body, w, h) => Query.ray(solidList, { x: body.position.x, y: body.position.y + h / 2 - 3 }, { x: body.position.x, y: body.position.y + h / 2 + 4 }, Math.max(4, w - 6)).find((c) => c.bodyA !== body && c.bodyB !== body);
    const groundAhead = (c, dir) => { const x = c.x + dir * (c.w / 2 + 8), y = c.y + c.h / 2; return Query.ray(solidList, { x, y: y - 4 }, { x, y: y + 36 }, 3).some((k) => k.bodyA !== c.body); };
    // walk up small steps (the end of a plank, a low crate) instead of shoving them
    function stepUp(body, w, h, dir) {
      const feet = body.position.y + h / 2, x0 = body.position.x + dir * (w / 2 + 1);
      const hit = Query.ray(solidList, { x: x0, y: feet - 5 }, { x: x0 + dir * 5, y: feet - 5 }, 4).find((c) => c.bodyA !== body);
      if (!hit) return false;
      const rise = feet - hit.bodyA.bounds.min.y;
      if (rise <= 0 || rise > 28) return false;
      const x1 = body.position.x + dir * 4, y1 = body.position.y - rise - 1.5;
      const blocked = Query.region(solidList, { min: { x: x1 - w / 2 + 2, y: y1 - h / 2 }, max: { x: x1 + w / 2 - 2, y: y1 + h / 2 - 2 } }).some((o) => o !== body && o !== hit.bodyA);
      if (blocked) return false;
      Body.setPosition(body, { x: x1, y: y1 });
      return true;
    }
    function grants() {
      const h = (player.held && player.held.spec.grants) || {}, m = player.mods;
      return { fly: h.fly || m.fly, speed: (h.speed || 1) * (m.speed || 1), jump: (h.jump || 1) * (m.jump || 1), gravity: Math.min(h.gravity || 1, m.gravity || 1),
        slowfall: h.slowfall, armor: h.armor, fireproof: h.fireproof || m.fireproof };
    }

    // ---- describing words applied to something already on the page ---------------
    const COURIER = { flying: { fly: 'flap' }, fast: { speed: 1.6 }, slow: { speed: 0.6 }, fireproof: { fireproof: true }, invisible: { stealth: true }, light: { gravity: 0.5 }, heavy: { jump: 0.8 },
      rubber: { jump: 1.4 }, tiny: { scale: 0.55 }, small: { scale: 0.75 }, big: { scale: 1.3, jump: 1.15 }, giant: { scale: 1.7, jump: 1.3 }, brave: {}, floating: { gravity: 0.5 } };
    function modify(e, adjs) {
      if (e.isPlayer) {
        for (const a of adjs) if (!COURIER[a]) return { ok: false, error: `${HERO} would rather not be "${a}".` };
        for (const a of adjs) {
          const m = COURIER[a];
          if (m.scale) { const k = m.scale / player.scale, bottom = player.body.position.y + player.h / 2; Body.scale(player.body, k, k); player.w *= k; player.h *= k; player.scale = m.scale; Body.setPosition(player.body, { x: player.body.position.x, y: bottom - player.h / 2 }); Body.setInertia(player.body, Infinity); }
          Object.assign(player.mods, m);
        }
        puff(player, 8, 'yellow');
        return { ok: true, name: adjs.join(' ') + ' ' + HERO };
      }
      for (const a of adjs) if (e.resists && (e.resists === 'all' || e.resists.includes(a))) return { ok: false, error: `The ${e.name} shrugs off "${a}".` };
      const s = Object.assign({}, e.spec, { tags: e.spec.tags.slice() });
      for (const k of ['diet', 'fears', 'hunts']) if (s[k]) s[k] = s[k].slice();
      const wasAlive = s.alive;
      for (const a of adjs) NN.dict.adjectives[a](s);
      if (s.fireproof || s.material === 'ice' || s.material === 'metal' || s.material === 'stone') s.flammable = false;
      else if (adjs.some((a) => ['wooden', 'paper'].includes(a))) s.flammable = true;
      s.adjs = (s.adjs || []).concat(adjs);
      s.name = adjs.join(' ') + ' ' + e.name;
      e.spec = s; e.name = s.name;
      resize(e, s.w, s.h);
      e.hp = e.hp === Infinity ? Infinity : Math.max(1, Math.min(e.hp, s.hp) || s.hp);
      if (s.sleeps) e.asleepUntil = Infinity;
      if (s.soaked) e.wetUntil = Infinity;
      if (s.friendly) e.angry = false;
      if (wasAlive && !s.alive) { e.goal = null; if (e.mountedBy) dismount(); }
      if (s.floating && !s.alive && !e.heldBy) Body.setStatic(e.body, true);
      e.goal = null; e.thinkCd = 0;
      puff(e, 8, 'yellow');
      return { ok: true, name: s.name };
    }

    // ---- damage, fire, water -----------------------------------------------------------
    function damage(t, n, src, kind) {
      if (!n) return;
      if (t.isPlayer) return hurt(n, src ? src.x : t.x, kind);
      if (t.isParcel || t.removed || t.hp === Infinity) return;
      t.hp -= n; t.flash = 0.18;
      if (t.asleepUntil !== 0) t.asleepUntil = 0;
      if (t.spec.alive && src && src.isPlayer && !t.spec.friendly) { if (t.spec.dmg > 0) t.angry = true; else t.scaredUntil = sim.time + 5; }
      if (t.hp <= 0) kill(t, src);
    }
    function kill(e, src) {
      puff(e, 8 + Math.min(20, e.w * e.h / 400));
      bang(e, e.spec.alive ? 'POOF!' : 'CRASH!'); sfx('poof');
      if (src && src.spec && src.spec.alive && src.spec.diet && src.spec.diet.includes('meat')) src.fullUntil = sim.time + 8;
      remove(e);
    }
    function hurt(n, fromX, kind) {
      const p = player, g = grants();
      if (p.invuln > 0 || sim.won) return;
      if (kind === 'fire' ? g.fireproof : g.armor) { p.invuln = 0.5; bang(p, 'CLANG!'); sfx('clang'); return; }
      p.hp -= n; p.invuln = 1.3; bang(p, 'OUCH!'); sfx('hurt');
      if (!p.mount) { Body.setVelocity(p.body, { x: (p.x >= fromX ? 1 : -1) * 4.5, y: -5 }); p.launched = true; p.climbing = false; }
      if (p.hp <= 0) respawn(`${HERO} needs a lie down. Back to ${DEPOT}.`);
      changed();
    }
    function respawn(msg) {
      const p = player;
      if (p.mount) dismount();
      if (p.held) dropHeld();
      Body.setPosition(p.body, { x: L.start.x, y: L.start.y - p.h / 2 - 1 }); Body.setVelocity(p.body, { x: 0, y: 0 });
      p.hp = 3; p.hasParcel = true; p.invuln = 2; p.launched = false; p.climbing = false; p.facing = 1;
      toast(msg); changed();
    }
    function loseParcel(by, verb) {
      player.hasParcel = false; sim.parcelsLost++;
      toast(`The ${by} ${verb} the ${CARGO}! Fetch a fresh one from ${DEPOT}.`); sfx('lose');
      changed();
    }
    function ignite(t) {
      if (t.isPlayer) { hurt(1, t.x - t.facing, 'fire'); return true; }
      if (!flammable(t) || t.burning > 0) return false;
      const m = NN.dict.materials[t.spec.material] || {};
      t.burning = t.spec.alive ? 3 : (m.burn || 4); t.burnTick = 0.6; t.asleepUntil = 0;
      sfx('fire');
      return true;
    }
    function extinguish(t) {
      if (t.isPlayer || t.isParcel) return;
      if (t.burning > 0) { t.burning = 0; puff(t, 5, 'white'); sfx('hiss'); }
      if (t.spec.hot && !t.doused) { if (t.spec.tags.includes('fire')) { puff(t, 8, 'white'); remove(t); } else { t.doused = true; puff(t, 4, 'white'); } }
      t.heat = 0;
    }
    function soak(t, secs) { extinguish(t); if (!t.isPlayer && !t.isParcel && !t.removed) t.wetUntil = Math.max(t.wetUntil, sim.time + secs); }
    function melt(t) {
      if (t.spec.frozen) { t.spec = Object.assign({}, t.spec, { frozen: false, melts: false, material: 'flesh' }); say(t, 'thawed!'); return; }
      const w = NN.lexicon.resolve('water').spec;
      addEntity(w, t.x, Math.min(t.y, groundBelow(t.x, t.y) - 10)); say(t, 'drip');
      remove(t);
    }
    function strike(e) {
      addFx('flash', e.x, e.y, { life: 0.25 }); bang(e, 'KRAK!'); sfx('boom');
      for (const t of ents) {
        if (t === e || t.placing || t.removed || Math.abs(t.x - e.x) > (t.w / 2 + 34) || t.y + t.h / 2 < e.y - e.h / 2) continue;
        if (!ignite(t)) damage(t, 3, null, 'zap');
      }
      if (Math.abs(player.x - e.x) < 40 && player.y > e.y - 60) hurt(1, e.x, 'zap');
    }
    function explode(e) {
      addFx('boom', e.x, e.y, { life: 0.45 }); bang(e, 'BOOM!'); sfx('boom');
      for (const t of ents) {
        if (t === e || t.removed || t.placing) continue;
        const d = Math.max(0, gap(e, t));
        if (d > 130) continue;
        if (!t.body.isStatic && !t.heldBy) Body.setVelocity(t.body, { x: Math.sign(t.x - e.x || 1) * 6, y: -7 });
        ignite(t); damage(t, 8, null, 'blast');
      }
      if (Math.hypot(player.x - e.x, player.y - e.y) < 130) hurt(2, e.x, 'blast');
      remove(e);
    }
    function breatheFire(c, range) {
      const dir = c.facing;
      sfx('fire');
      for (let i = 0; i < 10; i++) addFx('flame', c.x + dir * (c.w / 2 + 6), c.y - c.h * 0.25, { vx: dir * (3 + Math.random() * 3), vy: (Math.random() - 0.5) * 1.6, life: 0.4 + Math.random() * 0.2, size: 8 + Math.random() * 8 });
      for (const t of ents) {
        if (t === c || t.removed || t.placing) continue;
        if ((t.x - c.x) * dir > -10 && gap(c, t) < range) ignite(t);
      }
    }

    // ---- creature brains -----------------------------------------------------------
    function think(c) {
      const s = c.spec, now = sim.time;
      if (c.waveUntil > now) { c.goal = { type: 'wander', x: c.x, until: c.waveUntil, rest: true }; return; }   // stop and say hello
      const fears = c.scaredUntil > now ? s.fears.concat('human') : s.fears;
      const hunts = c.angry ? s.hunts.concat('human') : s.hunts;
      const hungry = now >= c.fullUntil;
      let t, goal = null;
      if (c.burning > 0) goal = { type: 'flee', t: { x: c.x - c.facing * 60, y: c.y, w: 0, h: 0 } };
      else if ((t = nearest(c, fears, 215))) goal = { type: 'flee', t };
      else if ((t = charmer(c))) goal = { type: 'follow', t };
      else if (hungry && !(c.wary = !!nearest(c, fears, 600)) && (t = nearest(c, s.diet, s.hungry ? 800 : 330, (x) => (x.isParcel ? !s.sparesSeed : x.spec.edible)))) goal = { type: 'eat', t };   // too nervous to eat or steal while something it fears is in sight
      else if (hungry && (t = nearest(c, hunts, s.sight || 420))) goal = { type: 'attack', t };
      else if (s.douses && (t = nearest(c, ['fire'], 520))) goal = { type: 'douse', t };
      else if (s.follows && Math.abs(player.x - c.x) > 90 && !player.mods.stealth) goal = { type: 'follow', t: player };
      else if (c.goal && c.goal.type === 'wander' && c.goal.until > now) goal = c.goal;
      else goal = { type: 'wander', x: c.home + (Math.random() - 0.5) * 2 * c.range, until: now + 1.5 + Math.random() * 3, rest: Math.random() < 0.4 };
      if ((!c.goal || c.goal.type !== goal.type) && s.sound && (goal.type === 'flee' || goal.type === 'attack')) addFx('speech', c.x, c.y - c.h / 2 - 6, { text: s.sound.toUpperCase() + '!', life: 1.1 });
      c.goal = goal;
    }
    function charmer(c) {
      const tg = c.spec.tags;
      let best = null, bd = 620;
      for (const e of ents) {
        if (e === c || e.placing || e.removed || !e.spec.charms || !e.spec.charms.some((x) => tg.includes(x))) continue;
        const d = Math.abs(e.x - c.x);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    }
    const active = (c) => c.spec.alive && !c.spec.frozen && c.asleepUntil <= sim.time && c.stunUntil <= sim.time && !c.cagedBy && !c.mountedBy && !c.placing;

    function moveCreature(c) {
      const s = c.spec, b = c.body;
      if (c.cagedBy) { Body.setPosition(b, { x: c.cagedBy.x, y: c.cagedBy.y + c.cagedBy.h / 2 - c.h / 2 - 6 }); Body.setVelocity(b, { x: 0, y: 0 }); return; }
      const zone = waterAt(c.x), inWater = zone && c.y + c.h / 2 > zone.y - 4;
      if (s.swims && inWater && s.alive && !c.placing) b.force.y -= b.mass * G;                // swimmers never sink
      if (!active(c)) {
        if (s.alive && !c.mountedBy && !c.placing) Body.setVelocity(b, { x: b.velocity.x * 0.8, y: s.swims && inWater ? (zone.y + c.h * 0.2 - c.y) * 0.1 : b.velocity.y });
        return;
      }
      const g = c.goal;
      const sp = s.speed * (g && g.type === 'flee' ? 1.25 : 1);
      let vx = 0, vy = b.velocity.y;
      let dir = 0;
      if (g && !s.flies) {
        if (g.type === 'flee') dir = Math.sign(c.x - g.t.x) || 1;
        else if (g.type === 'wander') dir = !g.rest && Math.abs(g.x - c.x) > 8 ? Math.sign(g.x - c.x) : 0;
        else { const d = g.t.x - c.x, reach = g.type === 'follow' ? 64 : (c.w + g.t.w) / 2 - 3 + (g.type === 'attack' && s.range ? s.range - 14 : 0) + (g.type === 'douse' ? 40 : 0); dir = Math.abs(d) > reach ? Math.sign(d) : 0; }
      }
      if (s.swims) {
        if (!inWater) { if (onGround(b, c.w, c.h) && Math.random() < 0.04) { vy = -3.5; say(c, 'flop'); } Body.setVelocity(b, { x: b.velocity.x * 0.9, y: vy }); return; }
        if (dir && (c.x + dir * (c.w / 2 + 12) < zone.x0 || c.x + dir * (c.w / 2 + 12) > zone.x1)) dir = 0;
        vx = dir * sp * (g && g.type === 'wander' ? 0.45 : 1);
        let ty = zone.y + c.h * 0.2;                                                     // cruise at the surface, dive for a target
        if (g && g.t && (g.type === 'eat' || g.type === 'attack')) ty = Math.max(ty, Math.min(g.t.y, ty + 150));
        Body.setVelocity(b, { x: b.velocity.x + (vx - b.velocity.x) * 0.2, y: (ty - c.y) * 0.12 });
      } else if (s.flops) {
        if (onGround(b, c.w, c.h) && Math.random() < 0.04) { vy = -3.5; say(c, 'flop'); }
        Body.setVelocity(b, { x: b.velocity.x * 0.9, y: vy }); return;
      } else if (s.flies) {
        b.force.y -= b.mass * G;
        let tx = c.x, ty = c.y, reach = 6;
        if (s.rideable && Math.abs(player.x - c.x) < 260 && !player.mount) { tx = c.x; ty = groundBelow(c.x, c.y) - c.h / 2 - 2; }   // a mount lands so you can climb on
        else if (!g || g.type === 'wander') { tx = c.home + Math.sin(sim.time * 0.5 + c.id) * c.range * 0.8; ty = groundBelow(c.x, c.y) - 120 - c.h / 2 + Math.sin(sim.time * 1.4 + c.id) * 16; }
        else if (g.type === 'flee') { tx = c.x + (Math.sign(c.x - g.t.x) || 1) * 200; ty = c.y - 80; }
        else { tx = g.t.x; ty = g.t.y - (g.type === 'follow' ? (s.rideable ? 0 : 70) : 0); reach = (c.w + g.t.w) / 2 - 4 + (g.type === 'attack' && s.range ? s.range - 14 : 0); }
        const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy);
        if (d > Math.max(6, reach)) { vx = dx / d * sp; vy = dy / d * sp; } else { vx = 0; vy = 0; }
        if (c.y < L.sky && vy < 0) vy = 0;
        Body.setVelocity(b, { x: b.velocity.x + (vx - b.velocity.x) * 0.15, y: b.velocity.y + (vy - b.velocity.y) * 0.15 });
      } else {
        const grounded = !!onGround(b, c.w, c.h);
        if (dir && grounded && !groundAhead(c, dir)) dir = 0;
        if (dir && grounded) stepUp(b, c.w, c.h, dir);
        vx = dir * sp * (g && g.type === 'wander' ? 0.45 : 1);
        if (s.hops && dir && grounded) vy = -4.6;
        if (s.hops && !dir && grounded) vx = 0;
        if (!grounded && !s.hops) vx = b.velocity.x + (dir * sp - b.velocity.x) * 0.1;
        Body.setVelocity(b, { x: vx, y: vy });
      }
      c.moving = Math.abs(vx) > 0.2;
      if (c.moving) { c.facing = vx > 0 ? 1 : -1; c.walkT += DT; }
      else if (g && g.t && g.type !== 'flee' && Math.abs(g.t.x - c.x) > 4) c.facing = g.t.x > c.x ? 1 : -1;
    }

    function act(c) {
      const g = c.goal, s = c.spec;
      if (!g || !g.t || !active(c)) { c.eatP = 0; return; }
      const t = g.t;
      if (t.removed || (t.isParcel && !player.hasParcel)) { c.goal = null; c.eatP = 0; return; }
      const d = gap(c, t);
      if (g.type === 'eat') {
        if (d < 7) {
          c.eatP += DT;
          if (Math.floor(c.eatP / 0.35) !== Math.floor((c.eatP - DT) / 0.35)) { say(c, 'munch'); sfx('munch'); }
          const need = t.isParcel ? 1.1 : t.native ? 4.5 : Math.max(0.6, Math.min(3, t.w * t.h / 900));
          if (c.eatP >= need) {
            c.eatP = 0; c.fullUntil = sim.time + (s.hungry ? 1 : 8); c.goal = null;
            const prize = !t.isParcel && tagsOf(t).includes('valuable');
            if (t.isParcel) loseParcel(c.name, s.eatVerb || 'ate'); else { puff(t, 5); remove(t); }
            if (prize && s.bribable) { toast(`The ${c.name} pockets it and waves you through.`); modify(c, ['friendly']); }
          }
        } else c.eatP = 0;
      } else if (g.type === 'attack') {
        c.atkCd -= DT;
        if (d < (s.range || 7) && c.atkCd <= 0) {
          c.atkCd = 0.8;
          if (s.breath) breatheFire(c, s.range + 10);
          else if (s.range) addFx('zap', c.x, c.y - c.h / 4, { x2: t.x, y2: t.y, life: 0.2 });
          else { addFx('hit', (c.x + t.x) / 2, (c.y + t.y) / 2, { life: 0.2 }); bang({ x: (c.x + t.x) / 2, y: Math.min(c.y, t.y), h: 30 }, ['BIFF!', 'POW!', 'CHOMP!', 'WHAM!'][c.id % 4]); }
          damage(t, s.dmg, c);
        }
      } else if (g.type === 'douse') {
        if (d < 70) { for (let i = 0; i < 3; i++) addFx('drop', c.x + c.facing * 16, c.y - 8, { vx: c.facing * (2 + Math.random() * 2.5), vy: -1.5 - Math.random(), life: 0.5 }); extinguish(t); }
      }
    }

    // ---- world rules, run every step -----------------------------------------------------------
    function rules() {
      const now = sim.time, p = player;
      const portals = ents.filter((e) => e.spec.portal && !e.placing && !e.removed);
      for (const e of ents) {
        if (e.removed || e.placing) continue;
        const s = e.spec;
        if (e.flash > 0) e.flash -= DT;
        if (e.tpCd > 0) e.tpCd -= DT;
        // burning
        if (e.burning > 0) {
          e.burning -= DT;
          if (Math.random() < 0.3) addFx('smoke', e.x + (Math.random() - 0.5) * e.w, e.y - Math.min(e.h, 200) / 2 * Math.random(), { vy: -1, life: 0.8, size: 6 });
          if (s.alive) { e.burnTick -= DT; if (e.burnTick <= 0) { e.burnTick = 1; damage(e, 1, null, 'fire'); } if (e.burning <= 0) e.burning = 0; }
          else if (e.burning <= 0) { puff(e, 10, 'dgrey'); remove(e); continue; }
        }
        if (e.removed) continue;
        if (isHot(e) && !e.heldBy) {
          for (const t of ents) {
            if (t === e || t.removed || t.placing || t.heldBy) continue;
            const d = gap(e, t);
            if (d < 10 && flammable(t) && !(t.burning > 0)) { t.heat += DT; if (t.heat > 0.7) { t.heat = 0; ignite(t); } }
            if (d < 70 && t.spec.melts) melt(t);
          }
          if (gap(e, p) < 3 && e !== p.mount && !(s.carry && !(e.burning > 0))) hurt(1, e.x, 'fire');
        }
        if (s.warm) for (const t of ents) {
          if (t === e || t.removed || t.placing) continue;
          const d = gap(e, t);
          if (t.spec.melts && d < 240) { t.heat += DT; if (t.heat > 2) melt(t); }
          if (t.spec.alive && t.spec.tags.includes('undead') && d < 340) { t.sunT = (t.sunT || 0) + DT; if (t.sunT > 0.5) { t.sunT = 0; say(t, 'hsss!'); damage(t, 1, null, 'sun'); } }
        }
        // water
        if (s.wet) for (const t of ents) if (t !== e && !t.removed && !t.placing && gap(e, t) < 4) soak(t, 6);
        if (s.rains) {
          const gy = groundBelow(e.x, e.y);
          if (Math.random() < 0.6) addFx('rain', e.x + (Math.random() - 0.5) * e.w * 0.8, e.y + e.h / 2, { vy: 7, life: Math.min(3, (gy - e.y) / 7 / 60) });
          for (const t of ents) if (t !== e && !t.removed && !t.placing && Math.abs(t.x - e.x) < (e.w + t.w) / 2 && t.y + t.h / 2 > e.y) soak(t, 4);
        }
        if (s.grow && e.h < s.grow.to && (!s.grow.thirsty || isWet(e))) {
          resize(e, e.w, Math.min(s.grow.to, e.h + 3)); s.h = e.h;
          if (Math.random() < 0.2) addFx('puff', e.x + (Math.random() - 0.5) * 30, e.y - e.h / 2, { life: 0.4, size: 5, color: 'lime' });
          if (!e.grewSaid) { e.grewSaid = true; bang(e, 'SPROING!'); sfx('grow'); }
          if (e.h >= s.grow.to && e.goneMsg === undefined && e.grownMsg) toast(e.grownMsg);
        }
        if (s.thorny && gap(e, p) < 3) hurt(1, e.x, 'thorn');
        // loud noise cracks crystal; water shorts out machines
        if (s.shatters && (p.loudUntil > now && gap(e, p) < 380 || ents.some((t) => t !== e && !t.removed && !t.placing && (t.spec.loud || t.loudUntil > now) && gap(e, t) < 380))) {
          e.crackT = (e.crackT || 0) + DT;
          if (e.crackT > 0.45) { e.crackT = 0; bang({ x: e.x, y: p.y - 60, h: 0 }, 'CRACK!'); sfx('crack'); damage(e, 2, null, 'noise'); if (e.removed) continue; }
        }
        if (s.alive && isWet(e) && s.fears && s.fears.includes('wet') && e.stunUntil < now + 1) { if (e.stunUntil <= now) { bang(e, 'BZZT!'); sfx('zap'); } e.stunUntil = now + 5; }
        if (s.snooze) for (const t of ents) if (t !== e && t.spec.alive && !t.removed && !t.placing && gap(e, t) < 6) { if (t.asleepUntil <= now) say(t, 'zzz'); t.asleepUntil = Math.max(t.asleepUntil, now + 6); }
        // fuse, lifetime
        if (e.fuse > 0) { e.fuse -= DT; if (Math.random() < 0.5) addFx('spark', e.x + 8, e.y - e.h / 2, { vx: (Math.random() - 0.5) * 2, vy: -1 - Math.random(), life: 0.3 }); if (e.fuse <= 0) { explode(e); continue; } }
        if (s.life && now - e.born > s.life) { puff(e, 6, s.hole ? 'purple' : 'dgrey'); remove(e); continue; }
        // black hole
        if (s.hole) {
          for (const t of ents) {
            if (t === e || t.removed || t.placing || t.heldBy) continue;
            const dx = e.x - t.x, dy = e.y - t.y, d = Math.hypot(dx, dy);
            if (t.body.isStatic) { if (t.hp !== Infinity && gap(e, t) < 110) { e.suck = (e.suck || 0) + DT; if (e.suck > 0.5) { e.suck = 0; damage(t, 2, null, 'void'); } } continue; }
            if (d < 300) { t.body.force.x += dx / d * t.body.mass * 0.0016; t.body.force.y += dy / d * t.body.mass * 0.0022; }
            if (d < 34) { puff(t, 5, 'purple'); remove(t); }
          }
          const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
          if (!p.mount && d < 300) { p.body.force.x += dx / d * p.body.mass * 0.0012; p.body.force.y += dy / d * p.body.mass * 0.0018; }
          if (d < 34) respawn(`The black hole spat you out at ${DEPOT}.`);
        }
        // portals
        if (s.portal && portals.length > 1) {
          const dest = portals[(portals.indexOf(e) + 1) % portals.length];
          const hop = (t, body) => { if (t.tpCd > 0 || gap(e, t) > -6) return; t.tpCd = 1.2; Body.setPosition(body, { x: dest.x, y: dest.y }); puff(e, 5, 'teal'); puff(dest, 5, 'teal'); sfx('zap'); };
          if (p.tpCd > 0) p.tpCd -= DT; else if (p.mount) { if (gap(e, p.mount) < -6) { p.tpCd = 1.2; Body.setPosition(p.mount.body, { x: dest.x, y: dest.y }); puff(dest, 5, 'teal'); } }
          else if (gap(e, p) < -6) { p.tpCd = 1.2; Body.setPosition(p.body, { x: dest.x, y: dest.y }); puff(e, 5, 'teal'); puff(dest, 5, 'teal'); sfx('zap'); }
          for (const t of ents) if (t !== e && t.spec.alive && !t.removed && !t.placing && !t.mountedBy && !t.cagedBy) hop(t, t.body);
        }
        // cage
        if (s.traps) for (const t of ents) if (t.spec.alive && !t.cagedBy && !t.removed && !t.placing && !t.mountedBy && t.w < e.w * 1.15 && Math.abs(t.x - e.x) < e.w / 2 && Math.abs(t.y - e.y) < e.h / 2 + 10) { t.cagedBy = e; say(t, 'caught!'); }
        // creature extras
        if (s.alive && active(e)) {
          if (s.lulls) { e.lullT = (e.lullT || 0) + DT; if (e.lullT > 3) { e.lullT = 0; lull(e, 250, 5); } }
          if (s.heals && p.hp < 3 && gap(e, p) < 40) { e.healT = (e.healT || 0) + DT; if (e.healT > 1.5) { e.healT = 0; p.hp++; addFx('text', p.x, p.y - 40, { text: '+1', vy: -0.6, life: 1 }); changed(); } }
          if (s.greets && !p.mods.stealth && gap(e, p) < 80 && now > (e.greetAt || 2) && !(e.goal && e.goal.type === 'flee')) {
            e.greetAt = now + 12 + Math.random() * 10; e.waveUntil = now + 1.8; e.facing = p.x > e.x ? 1 : -1; e.goal = null;
            addFx('speech', e.x, e.y - e.h / 2 - 16, { text: s.greets[Math.floor(Math.random() * s.greets.length)], life: 2.4 });
          }
          if (s.aflame && Math.random() < 0.2) addFx('flame', e.x + (Math.random() - 0.5) * e.w, e.y, { vy: -1.5, life: 0.4, size: 8 });
        }
        // water: things float, sink or get swept away
        const zone = waterAt(e.x);
        if (zone && e.y + e.h / 2 > zone.y && !e.body.isStatic && !e.heldBy) {
          if (e.burning > 0 || (s.hot && !e.doused)) extinguish(e);
          if (e.removed) continue;
          const b = e.body, depth = e.y + e.h / 2 - zone.y;
          if (!e.wasInWater && depth > 4) { e.wasInWater = true; addFx('splash', e.x, zone.y, { life: 0.5 }); sfx('splash'); }
          if (s.alive && s.swims) { /* handled when moving */ }
          else if (s.floats || (!s.alive && FLOATS.includes(s.material))) {
            const ty = zone.y - e.h * 0.2;
            b.force.y -= b.mass * G;
            Body.setVelocity(b, { x: b.velocity.x * (e.mountedBy ? 1 : 0.97), y: b.velocity.y * 0.8 + Math.max(-3, Math.min(3, (ty - e.y) * 0.08)) });
            Body.setAngularVelocity(b, b.angularVelocity * 0.8); Body.setAngle(b, b.angle * 0.92);
          } else if (s.alive && !s.flies && depth > 22) { say(e, 'glub!'); remove(e); continue; }
        } else if (zone && e.wasInWater && e.y + e.h / 2 < zone.y - 6) e.wasInWater = false;
      }
    }
    function lull(src, R, secs) {
      sfx('lull');
      for (let i = 0; i < 4; i++) addFx('note', src.x + (Math.random() - 0.5) * 30, src.y - src.h / 2, { vx: (Math.random() - 0.5) * 1.5, vy: -1 - Math.random(), life: 1.2 });
      for (const t of ents) if (t !== src && t.spec.alive && !t.spec.lulls && !t.removed && !t.placing && Math.hypot(t.x - src.x, t.y - src.y) < R) { if (t.asleepUntil <= sim.time) say(t, 'zzz'); t.asleepUntil = Math.max(t.asleepUntil, sim.time + secs); }
    }

    // ---- courier actions -----------------------------------------------------------
    function dropHeld() {
      const p = player, e = p.held;
      if (!e) return;
      e.heldBy = null; p.held = null;
      Body.setPosition(e.body, { x: p.x + p.facing * 16, y: p.y - 4 }); Body.setVelocity(e.body, { x: p.facing * 1.6, y: -1.5 }); Body.setAngle(e.body, 0);
      Composite.add(world, e.body);
      e.x = e.body.position.x; e.y = e.body.position.y;
      if (e.spec.floating || e.spec.anchored) settle(e);
    }
    function dismount() {
      const p = player, m = p.mount;
      if (!m) return;
      p.mount = null; m.mountedBy = null; m.home = m.x;
      Composite.add(world, p.body);
      Body.setPosition(p.body, { x: m.x, y: m.y - m.h / 2 - p.h / 2 - 2 }); Body.setVelocity(p.body, { x: 0, y: -3 });
      // Stepping off beside something climbable grabs hold of it. Without this, leaving a boat at a cargo net
      // dropped the hero into the sea unless "up" was pressed within a fraction of a second.
      p.x = p.body.position.x; p.y = p.body.position.y;
      if (ents.some((e) => e.spec.climbable && !e.placing && !e.removed && gap(p, e) < -4)) { p.climbing = true; p.launched = false; Body.setVelocity(p.body, { x: 0, y: 0 }); }
    }
    function findInteract() {
      const p = player;
      let best = null, bd = 24;
      for (const e of ents) {
        if (e.placing || e.removed || e.heldBy || e.cagedBy) continue;
        const s = e.spec;
        const rideable = s.rideable && (!s.alive || (active(e) && !(s.hunts || []).includes('human') && !e.angry));
        if (!(rideable || s.launcher || s.carry)) continue;
        const d = gap(p, e) - (rideable || s.launcher ? 22 : 0);   // generous reach for mounts, so a boat at the quayside can be boarded
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    }
    function interact() {
      const p = player;
      if (p.mount) return dismount();
      const best = findInteract();
      if (!best) { if (p.held) dropHeld(); return; }
      const s = best.spec;
      if (s.launcher) {
        Body.setPosition(p.body, { x: best.x, y: best.y - best.h / 2 - p.h / 2 }); Body.setVelocity(p.body, { x: p.facing * s.launcher.vx, y: s.launcher.vy });
        p.launched = true; p.climbing = false; addFx('boom', best.x, best.y - best.h / 2, { life: 0.3 }); bang(best, 'KABOOM!'); sfx('boom');
      } else if (s.rideable && !s.carry) {
        p.mount = best; best.mountedBy = p; best.goal = null; p.climbing = false;
        Composite.remove(world, p.body); sfx('pick');
      } else {
        if (best.burning > 0) { say(best, 'too hot!'); return; }
        if (p.held) dropHeld();
        Composite.remove(world, best.body); best.heldBy = p; p.held = best; best.heat = 0; sfx('pick');
      }
    }
    const inFront = (t, range) => !t.removed && !t.placing && t !== player.held && (t.x - player.x) * player.facing > -12 && gap(player, t) < range;
    const consume = (e) => { player.held = null; e.heldBy = null; e.removed = true; };
    function useHeld() {
      const p = player;
      if (p.mount) { if (p.mount.spec.breath) breatheFire(p.mount, 120); return; }
      const e = p.held;
      if (!e) return;
      const s = e.spec;
      e.useT = 0.25;
      const aim = (R) => ents.filter((x) => x.spec.alive && inFront(x, R)).sort((a, b) => gap(p, a) - gap(p, b))[0];
      switch (s.use) {
        case 'swing': {
          addFx('swing', p.x + p.facing * 22, p.y - 6, { life: 0.18, dir: p.facing }); sfx('swing');
          if (s.loudUse) p.loudUntil = sim.time + 2.5;
          for (const t of ents) {
            if (!inFront(t, 34)) continue;
            const soft = ['wood', 'plant', 'cloth', 'paper', 'food'].includes(t.spec.material);
            if (t.spec.alive || s.weapon.smash || (s.weapon.cuts && soft)) { damage(t, s.weapon.dmg, p); bang(t, t.spec.alive ? 'WHACK!' : 'CHOP!'); }
          }
          break;
        }
        case 'ignite': case 'flame': {
          const range = s.use === 'flame' ? 130 : 44;
          if (s.use === 'flame') for (let i = 0; i < 12; i++) addFx('flame', p.x + p.facing * 20, p.y - 6, { vx: p.facing * (3 + Math.random() * 4), vy: (Math.random() - 0.5) * 1.4, life: 0.45, size: 8 + Math.random() * 8 });
          else addFx('flame', p.x + p.facing * 22, p.y - 10, { vy: -1, life: 0.4, size: 10 });
          for (const t of ents) if (inFront(t, range)) { if (t.spec.melts) melt(t); else ignite(t); }
          if (s.noun === 'match') consume(e);
          break;
        }
        case 'douse':
          sfx('splash');
          for (let i = 0; i < 12; i++) addFx('drop', p.x + p.facing * 16, p.y - 8, { vx: p.facing * (2 + Math.random() * 4), vy: -2 - Math.random() * 1.5, life: 0.6 });
          for (const t of ents) if (inFront(t, 120)) soak(t, 8);
          break;
        case 'net': {
          const t = aim(70);
          if (t) { t.stunUntil = sim.time + 12; say(t, 'netted!'); consume(e); } else say(p, 'swish');
          break;
        }
        case 'loud': p.loudUntil = sim.time + 3; addFx('ring', p.x, p.y - 10, { life: 0.6 }); bang(p, 'TOOT!'); sfx('toot'); break;
        case 'lull': lull(p, 280, 10); break;
        case 'zap': {
          const t = aim(200);
          if (t) {
            addFx('zap', p.x + p.facing * 16, p.y - 8, { x2: t.x, y2: t.y, life: 0.25 }); sfx('zap');
            const f = NN.lexicon.resolve('frog').spec;
            if (t.mountedBy) dismount();
            const n = addEntity(f, t.x, t.y - 4); puff(t, 8, 'purple'); say(n, 'ribbit?');
            remove(t, true);
          } else say(p, 'fizz');
          break;
        }
        case 'ray': {
          const t = aim(220);
          if (t) { addFx('zap', p.x + p.facing * 16, p.y - 8, { x2: t.x, y2: t.y, life: 0.25 }); sfx('zap'); const r = modify(t, [s.ray]); if (!r.ok) say(t, 'no effect'); else bang(t, 'ZAP!'); } else say(p, 'fizz');
          break;
        }
        case 'unlock': {
          const t = ents.find((x) => x.spec.locked && inFront(x, 40));
          if (t) { bang(t, 'CLICK!'); sfx('pick'); puff(t, 10); remove(t); consume(e); } else say(p, 'nothing to unlock');
          break;
        }
        case 'plant': {
          const v = NN.lexicon.resolve('beanstalk').spec;
          const gy = groundBelow(p.x + p.facing * 30, p.y);
          const n = addEntity(v, p.x + p.facing * 30, gy - v.h / 2); Body.setStatic(n.body, true); consume(e);
          break;
        }
        case 'bomb': dropHeld(); e.fuse = 2.4; say(e, 'fsss'); break;
        default: say(p, '?');
      }
    }

    function updatePlayer(inp) {
      const p = player, g = grants();
      p.invuln = Math.max(0, p.invuln - DT); p.flapCd = Math.max(0, p.flapCd - DT);
      if (p.held && p.held.useT > 0) p.held.useT -= DT;
      if (inp.interactPressed) interact();
      if (inp.usePressed) useHeld();
      if (inp.dropPressed && p.held && !p.mount) dropHeld();
      const want = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      if (p.mount) {
        const m = p.mount, s = m.spec, b = m.body;
        if (want) { m.facing = want; p.facing = want; }
        const zone = waterAt(m.x), inWater = zone && m.y + m.h / 2 > zone.y - 2;
        if (s.flies) {
          b.force.y -= b.mass * G;
          let vy = ((inp.down ? 1 : 0) - (inp.up || inp.jump ? 1 : 0)) * s.speed * 0.85;
          if (m.y < L.sky && vy < 0) vy = 0;
          Body.setVelocity(b, { x: b.velocity.x + (want * s.speed - b.velocity.x) * 0.2, y: b.velocity.y + (vy - b.velocity.y) * 0.2 });
        } else if (s.swims || s.floats) {
          if (inWater) {
            const edge = want && (m.x + want * (m.w / 2 + 6) < zone.x0 || m.x + want * (m.w / 2 + 6) > zone.x1);
            const vx = b.velocity.x + ((edge ? 0 : want * s.speed) - b.velocity.x) * 0.12;
            if (s.swims) { b.force.y -= b.mass * G; Body.setVelocity(b, { x: vx, y: (zone.y + m.h * 0.2 - m.y) * 0.12 }); }
            else Body.setVelocity(b, { x: vx, y: b.velocity.y });
            if (want && Math.random() < 0.2) addFx('drop', m.x - want * m.w / 2, zone.y, { vx: -want * 1.5, vy: -1.5, life: 0.4 });
          } else Body.setVelocity(b, { x: want * 0.5, y: b.velocity.y });
        } else {
          const grounded = !!onGround(b, m.w, m.h);
          let vy = b.velocity.y;
          if ((inp.jumpPressed || inp.upPressed) && grounded && s.jump > 0) { vy = -JUMP * s.jump; sfx('jump'); }
          if (s.hops && want && grounded) vy = Math.min(vy, -4.6);
          if (want && grounded) stepUp(b, m.w, m.h, want);
          Body.setVelocity(b, { x: grounded || want ? want * s.speed : b.velocity.x, y: vy });
          if ((s.mows || s.smashes) && want) {
            m.workT = (m.workT || 0) + DT;
            if (m.workT > 0.22) {
              m.workT = 0;
              for (const t of ents) {
                if (t === m || t.removed || t.placing || t.spec.alive || (t.x - m.x) * want < 0 || gap(m, t) > 8) continue;
                if (s.smashes ? t.hp !== Infinity : t.spec.tags.includes('plant')) { damage(t, 1, m); addFx('hit', (m.x + t.x) / 2 + want * 20, m.y, { life: 0.2 }); }
              }
            }
          }
        }
        m.moving = !!want; if (want) m.walkT += DT;
        p.moving = false;
        return;
      }
      const b = p.body;
      let vx = b.velocity.x, vy = b.velocity.y;
      const gb = onGround(b, p.w, p.h);
      if (gb && !p.grounded && vy > 3) sfx('land');
      p.grounded = !!gb;
      if (p.grounded && vy > -0.5) p.launched = false;
      if (want) p.facing = want;
      const speed = 3.2 * g.speed;
      if (p.launched) vx += want * 0.1; else vx = p.grounded ? want * speed : vx + (want * speed - vx) * 0.22;
      if (want && p.grounded && !p.climbing) stepUp(b, p.w, p.h, want);
      const ladder = ents.find((e) => e.spec.climbable && !e.placing && !e.removed && gap(p, e) < -4);
      if (ladder && (inp.up || inp.down) && !p.launched) p.climbing = true;
      if (!ladder) p.climbing = false;
      const jumpPressed = inp.jumpPressed || (inp.upPressed && !ladder);
      if (p.climbing) {
        vy = inp.up ? -2.9 : inp.down ? 2.9 : 0; vx *= 0.6;
        if (inp.up && p.y + p.h / 2 <= ladder.y - ladder.h / 2 + 6) vy = 0;      // perch at the top instead of popping off
        p.ladderT = sim.time;
        b.force.y -= b.mass * G;
        if (inp.jumpPressed) { p.climbing = false; vy = -JUMP * 0.85; sfx('jump'); }
      } else {
        if (jumpPressed) {
          if (p.grounded || sim.time - (p.ladderT || -9) < 0.25) { vy = -JUMP * g.jump * (p.grounded ? 1 : 0.85); sfx('jump'); }
          else if (g.fly === 'flap' && p.flapCd <= 0) { vy = -6.2; p.flapCd = 0.2; addFx('puff', p.x, p.y + 10, { life: 0.3, size: 6, color: 'white' }); sfx('flap'); }
        }
        if (g.fly === 'thrust' && (inp.jump || inp.up)) { vy += (-4.6 - vy) * 0.2; if (Math.random() < 0.6) addFx('flame', p.x - p.facing * 8, p.y + 18, { vy: 2.5, life: 0.25, size: 6 }); }
        if (g.slowfall && vy > 1.5) vy = 1.5;
        if (g.gravity < 1) b.force.y -= b.mass * G * (1 - g.gravity);
        const bouncer = [gb && gb.bodyA.ent, gb && gb.bodyB.ent].find((x) => x && x !== p && x.spec.bouncy);
        if (bouncer && vy >= -1) { vy = -bouncer.spec.bouncy; bang(bouncer, 'BOING!'); sfx('boing'); if (want) { vx = want * 5; p.launched = true; } }
      }
      if (p.y < L.sky && vy < 0) vy = 0;
      Body.setVelocity(b, { x: vx, y: vy });
      p.moving = p.grounded && Math.abs(vx) > 0.3;
      if (p.moving) p.walkT += DT;
    }

    // ---- step -----------------------------------------------------------
    sim.step = function (inp) {
      if (sim.won) inp = {};
      sim.time += DT;
      solidList = terrain.concat(ents.filter((e) => e.spec.solid && !e.placing && !e.removed && !e.heldBy).map((e) => e.body));
      seen = things();
      updatePlayer(inp || {});
      for (const c of ents) {
        if (c.removed || !c.spec.alive) continue;
        if (active(c)) { c.thinkCd -= DT; if (c.thinkCd <= 0) { c.thinkCd = 0.22; think(c); } }
        moveCreature(c);
      }
      Engine.update(engine, 1000 / 60);
      // sync positions
      const p = player;
      // A small animal under the end of a bridge used to prop it up, and the bridge then slid into the river.
      // Anything alive that a wide summoned structure comes to rest on is lifted on top of it instead.
      for (const e of ents) {
        if (e.removed || e.placing || e.native || e.heldBy || !e.spec.solid || e.spec.alive || e.spec.anchored || e.w < 150 || e.h > 60) continue;
        for (const c of ents) {
          if (c === e || c.removed || !c.spec.alive || c.heldBy || c.mountedBy || c.spec.flies || c.spec.swims || c.h > 70) continue;
          if (Math.abs(c.x - e.x) < e.w / 2 - 4 && c.y > e.y && c.y - c.h / 2 < e.y + e.h / 2 + 5) { Body.setPosition(c.body, { x: c.x, y: e.y - e.h / 2 - c.h / 2 - 2 }); Body.setVelocity(c.body, { x: 0, y: 0 }); }
        }
      }
      for (const e of ents) { if (e.heldBy || e.removed) continue; e.x = e.body.position.x; e.y = e.body.position.y; }
      if (p.mount) { p.x = p.mount.x; p.y = p.mount.y - p.mount.h / 2 - p.h / 2 + 14; } else { p.x = p.body.position.x; p.y = p.body.position.y; }
      if (p.held) { p.held.x = p.x + p.facing * 14; p.held.y = p.y; }
      parcel.x = p.x; parcel.y = p.y;
      for (const c of ents) if (!c.removed && c.spec.alive) act(c);
      rules();
      // courier vs water and the edge of the world
      const zone = waterAt(p.x);
      if (zone && !p.mount && p.y + p.h / 2 > zone.y + 16) {
        addFx('splash', p.x, zone.y, { life: 0.5 }); sfx('splash');
        if (p.held) consume(p.held);
        respawn(zone.msg || `Splash! Back to ${DEPOT}.`);
      } else if (zone && p.mount && !p.mount.spec.flies && !p.mount.spec.swims && !p.mount.spec.floats && p.mount.y > zone.y + 12) {
        const m = p.mount; dismount(); addFx('splash', m.x, zone.y, { life: 0.5 }); remove(m);
      }
      if (p.y > L.deathY) respawn(`That was a long way down. Back to ${DEPOT}.`);
      if (!p.hasParcel && Math.abs(p.x - L.depot.x) < 80 && Math.abs(p.y - (L.depot.y - 25)) < 120) { p.hasParcel = true; toast(`A fresh ${CARGO}. Off you go.`); sfx('pick'); changed(); }
      if (!sim.won && p.hasParcel && Math.abs(p.x - L.goal.x) < 38 && Math.abs(p.y - (L.goal.y - 25)) < 110) {
        sim.won = true; sfx('win');
        for (let i = 0; i < 24; i++) addFx('star', L.goal.x, L.goal.y - 70, { vx: (Math.random() - 0.5) * 7, vy: -2 - Math.random() * 6, life: 1.2 + Math.random() * 0.6 });
        hooks.won && hooks.won({ words: sim.words.slice(), time: sim.time, parcelsLost: sim.parcelsLost });
      }
      // effects, cleanup
      for (const f of fx) { f.age += DT; f.x += f.vx; f.y += f.vy; if (f.type === 'star' || f.type === 'drop') f.vy += 0.25; }
      for (let i = fx.length - 1; i >= 0; i--) if (fx[i].age >= fx[i].life) fx.splice(i, 1);
      for (let i = ents.length - 1; i >= 0; i--) if (ents[i].removed) ents.splice(i, 1);
    };

    // ---- summoning, describing and dragging -----------------------------------------------------------
    const spawned = () => ents.filter((e) => !e.native && !e.removed).length;
    const MAX = L.maxObjects || 10;
    sim.spawnedCount = spawned; sim.maxObjects = MAX;
    sim.spawn = function (phrase, x, y, place) {
      const r = NN.lexicon.resolve(phrase);
      if (!r.ok) return r;
      if (spawned() >= MAX) return { ok: false, full: true, error: 'The page is full. Erase something first (right-click it).' };
      const s = r.spec;
      const e = addEntity(s, x, y, { facing: player.facing });
      sim.words.push({ name: r.name, noun: r.noun });
      if (place) { sim.grab(e, true); sim.dragTo(x, y); }
      else { sim.grab(e, true); sim.dragTo(x, y); sim.release(); }
      puff(e, 6); sfx('poof');
      changed();
      return { ok: true, ent: e, name: r.name, noun: r.noun };
    };
    // "sleepy" typed while the goat is selected
    sim.describe = function (target, phrase) {
      const r = NN.lexicon.adjectives(phrase);
      if (!r.ok) return r;
      if (!target || target.removed) return { ok: false, error: 'Select something on the page first.' };
      const m = modify(target, r.adjs);
      if (!m.ok) return m;
      for (const a of r.adjs) sim.words.push({ name: a + ' → ' + (target.isPlayer ? HERO : target.spec.noun || target.name), noun: 'adj:' + a });
      sfx('zap'); changed();
      return { ok: true, name: m.name, modified: true };
    };
    sim.pick = function (x, y, any) {
      let best = null;
      for (const e of ents) {
        if ((e.native && !any) || e.removed || e.heldBy || e.mountedBy) continue;
        if (any && e.native && !e.spec.alive && e.resists === 'all') continue;
        if (Math.abs(x - e.x) < e.w / 2 + 6 && Math.abs(y - e.y) < e.h / 2 + 6) if (!best || e.w * e.h < best.w * best.h) best = e;
      }
      if (any && !best && Math.abs(x - player.x) < 20 && Math.abs(y - player.y) < 32) best = player;
      return best;
    };
    sim.grab = function (e, fresh) {
      if (!e || e.native || e.heldBy || e.mountedBy || e.removed) return false;
      drag = e; e.placing = true; e.fresh = !!fresh; e.goal = null; e.cagedBy = null;
      Body.setStatic(e.body, true); e.body.isSensor = true; Body.setAngle(e.body, 0);
      return true;
    };
    sim.dragTo = function (x, y) {
      if (!drag) return;
      const e = drag, hw = e.w / 2, hh = e.h / 2;
      x = Math.max(hw + 4, Math.min(L.W - hw - 4, x));
      y = Math.max(L.sky - 80, y);
      for (let k = 0; k < 3; k++) for (const t of L.terrain) if (x + hw - 2 > t.x0 && x - hw + 2 < t.x1 && y + hh > t.y0 && y - hh < t.y1) y = t.y0 - hh - 1;
      Body.setPosition(e.body, { x, y }); e.x = x; e.y = y;
    };
    sim.release = function () {
      const e = drag;
      if (!e) return;
      drag = null; e.placing = false; e.fresh = false;
      e.body.isSensor = false;
      if (!e.spec.floating && !e.spec.anchored) { Body.setStatic(e.body, false); Body.setVelocity(e.body, { x: 0, y: 0 }); if (e.spec.upright) Body.setInertia(e.body, Infinity); }
      // never drop something through the courier
      if (e.spec.solid && gap(e, player) < 0 && !player.mount) Body.setPosition(e.body, { x: e.x, y: player.y - player.h / 2 - e.h / 2 - 2 });
      settle(e);
      e.born = sim.time; e.wasInWater = false;
    };
    sim.dragging = () => drag;
    sim.erase = function (e) { if (!e || e.native || e.removed) return; puff(e, 6); remove(e); sfx('poof'); changed(); };
    sim.clearAll = function () { for (const e of ents.slice()) if (!e.native) sim.erase(e); };
    sim.interactTarget = () => (player.mount ? null : findInteract());
    sim.tagsOf = tagsOf; sim.gap = gap; sim.active = active; sim.isHot = isHot; sim.isWet = isWet;
    return sim;
  }

  NN.createSim = createSim;
})(window.NN);
