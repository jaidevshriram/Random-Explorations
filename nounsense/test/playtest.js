const mechanics = async (a) => {
  const T = (name, fn) => a.page.evaluate(`(() => { NN.game.newGame(); const s = NN.game.sim, p = s.player, B = Matter.Body, g = s.natives.goat, br = s.natives.brambles;
    const run = (n, k, pr) => { for (let i = 0; i < n; i++) s.step(Object.assign({}, k || {}, i === 0 ? (pr || {}) : {})); };
    const at = (x) => { B.setPosition(p.body, { x, y: 495 }); B.setVelocity(p.body, { x: 0, y: 0 }); s.step({}); s.step({}); };
    const has = (n) => s.ents.some((e) => e.spec.noun === n);
    return (${fn.toString()})(s, p, run, at, has, g, br); })()`).then((r) => { if (r !== true) failed++; console.log((r === true ? 'PASS ' : 'FAIL ') + name + (r === true ? '' : ' -> ' + JSON.stringify(r))); });
  await T('friendly dragon: ride over, breathe on brambles', (s, p, run, at, has) => { s.spawn('friendly dragon', 380, 400); run(60); at(380); run(5); run(3, {}, { interactPressed: true }); if (!p.mount) return 'no mount';
    run(60, { up: true }); run(420, { right: true }); const x1 = p.x; run(200, { down: true, right: true }); run(10, {}, { usePressed: true }); run(260); return has('bramble') ? ['still brambles', Math.round(x1), Math.round(p.x), Math.round(p.y)] : true; });
  await T('trampoline clears the gap', (s, p, run, at) => { s.spawn('trampoline', 630, 480); run(60); at(500); run(400, { right: true }); return p.x > 1040 && p.y < 520 ? true : [Math.round(p.x), Math.round(p.y)]; });
  await T('cannon launches across', (s, p, run, at) => { s.spawn('cannon', 600, 480); run(60); at(600); run(3, {}, { interactPressed: true }); run(150); return p.x > 1040 ? true : [Math.round(p.x), Math.round(p.y)]; });
  await T('motorcycle jumps the gap', (s, p, run, at) => { s.spawn('motorcycle', 300, 480); run(60); at(300); run(3, {}, { interactPressed: true }); if (!p.mount) return 'no mount'; run(54, { right: true }); run(120, { right: true }, { jumpPressed: true }); return p.x > 1040 ? true : [Math.round(p.x), Math.round(p.y)]; });
  await T('plain jump does not clear the gap', (s, p, run, at) => { at(640); run(18, { right: true }); run(120, { right: true }, { jumpPressed: true }); return p.x < 700 || p.y > 520 || p.x < 400 ? true : [Math.round(p.x), Math.round(p.y)]; });
  await T('portals carry you past the brambles', (s, p, run, at) => { s.spawn('portal', 400, 470); s.spawn('portal', 2150, 470); run(10); at(330); run(60, { right: true }); return p.x > 2100 ? true : Math.round(p.x); });
  await T('cage holds the goat', (s, p, run, at, has, g) => { s.spawn('cage', g.x, g.y - 10); run(30); at(g.x - 60); run(200); return g.cagedBy && p.hasParcel ? true : [!!g.cagedBy, p.hasParcel]; });
  await T('goat eats parcel if ignored', (s, p, run, at, has, g) => { at(g.x - 100); run(300); return !p.hasParcel ? true : 'parcel survived'; });
  await T('tin can distracts the goat', (s, p, run, at, has, g) => { s.spawn('tin can', g.x + 60, 480); run(120); at(g.x - 80); run(200, { right: true }); return p.hasParcel ? true : 'eaten'; });
  await T('shepherd charms the goat', (s, p, run, at, has, g) => { s.spawn('shepherd', 1150, 480); run(200); return Math.abs(g.x - 1150) < 130 ? true : Math.round(g.x); });
  await T('wolf kills goat, then hunts courier', (s, p, run, at, has, g) => { s.spawn('wolf', g.x - 150, 480); run(300); return !has('goat') ? true : 'goat lives'; });
  await T('lumberjack fells the brambles', (s, p, run, at, has) => { s.spawn('lumberjack', 1750, 480); run(600); return !has('bramble') ? true : 'still there'; });
  await T('goat eats brambles when lured', (s, p, run, at, has, g) => { Matter.Body.setPosition(g.body, { x: 1780, y: 497 }); g.home = 1780; run(700); return !has('bramble') ? true : ['still', Math.round(g.x), g.goal && g.goal.type]; });
  await T('wand turns goat into frog', (s, p, run, at, has, g) => { s.spawn('wand', g.x - 150, 480); run(40); at(g.x - 150); run(3, {}, { interactPressed: true }); run(3, { right: true }); run(3, {}, { usePressed: true }); return has('frog') && !has('goat') ? true : [p.held && p.held.name, has('frog')]; });
  await T('bomb clears brambles', (s, p, run, at, has) => { s.spawn('bomb', 1820, 480); run(40); at(1820); run(3, {}, { interactPressed: true }); run(40, { right: true }); run(3, {}, { usePressed: true }); run(30, { left: true }); run(260, { left: true }); return !has('bramble') ? true : 'still'; });
  await T('black hole eats brambles', (s, p, run, at, has) => { s.spawn('black hole', 1880, 380); at(1300); run(520); return !has('bramble') ? true : 'still'; });
  await T('rain cloud puts out burning brambles', (s, p, run, at, has, g, br) => { s.spawn('fire', 1880, 480); run(80); const lit = br.burning > 0; s.spawn('rain cloud', 1950, 200); run(60); return lit && has('bramble') && !(br.burning > 0) ? true : [lit, has('bramble')]; });
  await T('fire burns a wooden bridge', (s, p, run, at, has) => { s.spawn('bridge', 870, 470); run(80); s.spawn('fire', 660, 480); run(700); return !has('bridge') ? true : 'bridge survived'; });
  await T('lawnmower mows brambles', (s, p, run, at, has) => { s.spawn('lawnmower', 1700, 480); run(60); at(1700); run(3, {}, { interactPressed: true }); if (!p.mount) return 'no mount'; run(500, { right: true }); return !has('bramble') ? true : ['still', Math.round(p.x)]; });
  await T('ladder + tree are climbable', (s, p, run, at) => { s.spawn('ladder', 400, 400); run(60); at(400); run(60, { up: true }); return p.y < 420 ? true : Math.round(p.y); });
  await T('balloon floats the courier', (s, p, run, at) => { s.spawn('balloon', 300, 480); run(40); at(300); run(3, {}, { interactPressed: true }); at(660); run(200, { right: true }, { jumpPressed: true }); return p.x > 1040 ? true : [Math.round(p.x), Math.round(p.y)]; });
  await T('win at mailbox', (s, p, run, at) => { at(2250); run(60, { right: true }); return s.won ? true : 'no win'; });
};

// spawn every noun (plain and with random adjectives), poke at it, look for exceptions and NaNs
const fuzz = async (a) => {
  const res = await a.page.evaluate(() => {
    const out = { errors: [], n: 0 };
    const adjs = Object.keys(NN.dict.adjectives);
    let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const nouns = NN.lexicon.nouns();
    for (let round = 0; round < 3; round++) {
      for (const noun of nouns) {
        const phrase = (round === 0 ? '' : adjs[Math.floor(rnd() * adjs.length)] + ' ' + (round === 2 ? adjs[Math.floor(rnd() * adjs.length)] + ' ' : '')) + NN.lexicon.displayName(noun);
        try {
          NN.game.newGame(); const s = NN.game.sim;
          const px = [300, 1300, 1840][Math.floor(rnd() * 3)];
          Matter.Body.setPosition(s.player.body, { x: px, y: 495 });
          const r = s.spawn(phrase, px + 40, 440, false);
          if (!r.ok) { out.errors.push(phrase + ': ' + r.error); continue; }
          s.spawn(nouns[Math.floor(rnd() * nouns.length)], px - 60, 440, false);
          for (let i = 0; i < 260; i++) {
            s.step({ right: rnd() < 0.4, left: rnd() < 0.2, up: rnd() < 0.2, jump: rnd() < 0.2, jumpPressed: rnd() < 0.05, interactPressed: i % 37 === 5, usePressed: i % 23 === 11, dropPressed: i === 200 });
            if (i === 100) { const e = s.ents[s.ents.length - 1]; if (e && s.grab(e)) { s.dragTo(px + 100, 300); s.release(); } }
          }
          const p = s.player;
          if (!isFinite(p.x) || !isFinite(p.y)) out.errors.push(phrase + ': player NaN');
          for (const e of s.ents) if (!isFinite(e.x) || !isFinite(e.y)) out.errors.push(phrase + ': NaN ' + e.name);
          // also draw every sprite once
          NN.art.sprite(r.ent.spec, 0); NN.art.sprite(r.ent.spec, 1);
          out.n++;
        } catch (err) { out.errors.push(phrase + ': ' + err.message + ' @ ' + (err.stack || '').split('\n')[1]); }
      }
    }
    NN.game.newGame();
    return out;
  });
  failed += res.errors.length; console.log('fuzz:', res.n, 'ok;', res.errors.length, 'problems'); console.log(res.errors.slice(0, 30).join('\n'));
};

// Headless playtest: node nounsense/test/playtest.js (needs Playwright)
let failed = 0;
const { chromium } = require('playwright');
const path = 'file://' + require('path').resolve(__dirname, '..', 'index.html');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('pageerror', e => { errs.push(e.message); console.log('PAGEERR', e.message, e.stack.split('\n')[1]); });
  p.on('console', m => { if (m.type() === 'error') console.log('console.error:', m.text()); });
  await p.goto(path);
  await p.waitForTimeout(400);
  const api = {
    // run n sim steps synchronously with given held keys (fast-forward, independent of rAF)
    run: (n, keys = {}, pressedOnce = {}) => p.evaluate(([n, keys, pr]) => { const s = NN.game.sim; for (let i = 0; i < n; i++) { s.step(Object.assign({}, keys, i === 0 ? pr : {})); } const pl = s.player; return { x: Math.round(pl.x), y: Math.round(pl.y), hp: pl.hp, parcel: pl.hasParcel, won: s.won, held: pl.held && pl.held.name, mount: pl.mount && pl.mount.name }; }, [n, keys, pressedOnce]),
    spawn: (w, x, y) => p.evaluate(([w, x, y]) => { const s = NN.game.sim; const r = s.spawn(w, x, y, false); return r.ok ? r.name : r.error; }, [w, x, y]),
    state: () => p.evaluate(() => { const s = NN.game.sim; return { ents: s.ents.map(e => `${e.name}@${Math.round(e.x)},${Math.round(e.y)}${e.burning > 0 ? ' BURN' : ''}${e.asleepUntil > s.time ? ' ZZ' : ''}${e.goal ? ' ' + e.goal.type : ''}`), p: [Math.round(s.player.x), Math.round(s.player.y), s.player.hp, s.player.hasParcel], won: s.won, t: Math.round(s.time) }; }),
    page: p,
  };
  p.on('console', m => { if (m.text().startsWith('TOAST')) console.log(m.text()); });
  await p.evaluate(() => { NN.game.start(); new MutationObserver(() => console.log('TOAST: ' + document.getElementById('toast').textContent)).observe(document.getElementById('toast'), { childList: true, characterData: true, subtree: true }); });
  await mechanics(api);
  await fuzz(api);
  console.log('page errors:', errs.length);
  process.exitCode = errs.length || failed ? 1 : 0;
  await b.close();
})();
