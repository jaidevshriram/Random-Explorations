// Shared helpers for whole-level playthroughs driven only by real input (mouse, typed words, held keys).
// Game internals are read to know where things are; nothing is acted on except through the page.
const { chromium } = require('playwright');

module.exports = async function play(worldNumber, script) {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + require('path').resolve(__dirname, '..', 'index.html'));
  await p.waitForTimeout(1500);
  await p.click(`#worlds button:nth-child(${worldNumber})`); await p.waitForTimeout(1500); await p.click('#start');
  const k = {
    page: p,
    st: () => p.evaluate(() => {
      const s = NN.game.sim, q = s.player, nat = {};
      for (const key of Object.keys(s.natives)) { const e = s.natives[key]; if (e && e.spec) nat[key] = { x: e.x | 0, y: e.y | 0, h: e.h | 0, gone: !!e.removed, friendly: !!e.spec.friendly, full: e.fullUntil > s.time, flee: !!(e.goal && e.goal.type === 'flee'), burning: e.burning > 0 }; }
      return { x: q.x | 0, y: q.y | 0, hp: q.hp, held: q.held && q.held.name, mount: q.mount && q.mount.name, seed: q.hasParcel, won: s.won, words: s.words.length, nat, ents: s.ents.filter((e) => !e.native && !e.removed).map((e) => ({ name: e.name, x: e.x | 0, y: e.y | 0, burning: e.burning > 0 })), msg: document.getElementById('msg').textContent };
    }),
    pt: (x, y) => p.evaluate(([x, y]) => { const r = document.getElementById('game').getBoundingClientRect(), c = NN.game.cam; return [r.left + (x - c.x) * r.width / 1100, r.top + (y - c.y) * r.height / 620]; }, [x, y]),
    // The camera eases toward the hero. Wait until it has stopped before aiming the mouse at a world position.
    settle: async () => { let a = [-1e9, -1e9]; for (let i = 0; i < 60; i++) { const c = await p.evaluate(() => [NN.game.cam.x, NN.game.cam.y]); if (Math.abs(c[0] - a[0]) < 0.5 && Math.abs(c[1] - a[1]) < 0.5) return; a = c; await p.waitForTimeout(500); } },
    type: async (w) => { await p.keyboard.press('Enter'); await p.keyboard.type(w); await p.keyboard.press('Enter'); await p.waitForTimeout(900); },
    // Aim well inside the view: holding an item within 70 px of a screen edge scrolls the camera, by design.
    place: async (w, x, y) => { await k.settle(); let [cx, cy] = await k.pt(x, y); await p.mouse.move(cx, cy); await p.waitForTimeout(600); await k.type(w); await k.settle(); [cx, cy] = await k.pt(x, y); await p.mouse.move(cx, cy); await p.waitForTimeout(600); await p.mouse.click(cx, cy); await p.waitForTimeout(3000); },
    rightClick: async (x, y) => { await k.settle(); const [cx, cy] = await k.pt(x, y); await p.mouse.move(cx, cy); await p.waitForTimeout(600); await p.mouse.click(cx, cy, { button: 'right' }); await p.waitForTimeout(1200); },
    press: async (key) => { await p.keyboard.press(key); await p.waitForTimeout(1500); },
    // hold keys until a condition on the game state holds, or time runs out
    holdUntil: async (keys, done, max) => { for (const key of keys) await p.keyboard.down(key); const t0 = Date.now(); let s = await k.st(); while (!done(s) && !s.won && Date.now() - t0 < max) { await p.waitForTimeout(400); s = await k.st(); } for (const key of keys) await p.keyboard.up(key); return s; },
    waitUntil: async (done, max) => { const t0 = Date.now(); let s = await k.st(); while (!done(s) && Date.now() - t0 < max) { await p.waitForTimeout(500); s = await k.st(); } return s; },
    log: (label, s) => { const { nat, ...rest } = s; console.log(label, JSON.stringify(rest).slice(0, 700), '| natives', Object.entries(nat).filter(([, v]) => !v.gone).map(([n, v]) => `${n}@${v.x},${v.y}${v.friendly ? ' friendly' : ''}${v.full ? ' full' : ''}${v.flee ? ' fleeing' : ''}${v.burning ? ' burning' : ''}`).join(' ')); },
    // stop the run as soon as a step has not done what it should, and say which
    need: (ok, what) => { if (!ok) throw new Error('step failed: ' + what); },
  };
  try { await script(k); } catch (e) { console.log('script error:', e.message); }
  await p.waitForTimeout(2500);
  const s = await k.st();
  console.log('win card shown:', await p.evaluate(() => !document.getElementById('win').hidden), '| stars:', await p.evaluate(() => document.getElementById('stars').textContent), '| words:', s.words, '| hp:', s.hp, '| errors', errs.length);
  if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT });
  await b.close();
};
