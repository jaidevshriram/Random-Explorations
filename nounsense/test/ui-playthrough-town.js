// Finish Lamplight Row the way a player would: mouse, typed words, held keys. Test hooks are only used to read positions.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + require('path').resolve(__dirname, '..', 'index.html'));
  await p.waitForTimeout(1500);
  await p.click('#worlds button:nth-child(1)'); await p.waitForTimeout(1500); await p.click('#start');
  const st = () => p.evaluate(() => { const s = NN.game.sim, q = s.player, N = s.natives; return { x: q.x | 0, y: q.y | 0, hp: q.hp, held: q.held && q.held.name, seed: q.hasParcel, won: s.won, words: s.words.length, wall: s.ents.some((e) => e.spec.noun === 'hoarding'), magpie: N.magpie && { x: N.magpie.x | 0, flee: !!(N.magpie.goal && N.magpie.goal.type === 'flee') }, ents: s.ents.filter((e) => !e.native).map((e) => e.name + '@' + (e.x | 0)), msg: document.getElementById('msg').textContent }; });
  const pt = (x, y) => p.evaluate(([x, y]) => { const r = document.getElementById('game').getBoundingClientRect(), c = NN.game.cam; return [r.left + (x - c.x) * r.width / 1100, r.top + (y - c.y) * r.height / 620]; }, [x, y]);
  // The camera eases toward the hero. Wait until it has stopped before aiming the mouse at a world position.
  const settle = async () => { let a = -1e9; for (let i = 0; i < 60; i++) { const b = await p.evaluate(() => NN.game.cam.x); if (Math.abs(b - a) < 0.5) return; a = b; await p.waitForTimeout(500); } };
  const type = async (w) => { await p.keyboard.press('Enter'); await p.keyboard.type(w); await p.keyboard.press('Enter'); await p.waitForTimeout(900); };
  const place = async (w, x, y) => { await settle(); let [cx, cy] = await pt(x, y); await p.mouse.move(cx, cy); await p.waitForTimeout(600); await type(w); await settle(); [cx, cy] = await pt(x, y); await p.mouse.move(cx, cy); await p.waitForTimeout(600); await p.mouse.click(cx, cy); await p.waitForTimeout(3000); };
  const walkTo = async (x, max) => { await p.keyboard.down('d'); const t0 = Date.now(); let s = await st(); while (s.x < x && Date.now() - t0 < max && !s.won) { await p.waitForTimeout(500); s = await st(); } await p.keyboard.up('d'); return s; };
  let s = await st(); console.log('start', JSON.stringify(s));
  s = await walkTo(820, 90000); console.log('at the hole', JSON.stringify(s));
  await place('bridge', 1110, 470); s = await st(); console.log('bridge down', JSON.stringify(s));
  await place('scarecrow', 1470, 470); s = await st(); console.log('scarecrow up', JSON.stringify(s));   // before crossing: the magpie works the far bank
  s = await walkTo(1380, 90000); console.log('across', JSON.stringify(s));
  s = await walkTo(1960, 120000); console.log('at the hoarding', JSON.stringify(s));
  await place('axe', s.x + 30, 480); await p.keyboard.press('e'); await p.waitForTimeout(1500); s = await st(); console.log('axe in hand', JSON.stringify(s));
  await p.keyboard.down('d'); await p.waitForTimeout(4000); await p.keyboard.up('d');
  for (let i = 0; i < 8 && (await st()).wall; i++) { await p.keyboard.press('f'); await p.waitForTimeout(3000); }
  s = await st(); console.log('after chopping', JSON.stringify(s));
  s = await walkTo(2440, 150000); await p.waitForTimeout(2500); s = await st(); console.log('end', JSON.stringify(s));
  console.log('win card shown:', await p.evaluate(() => !document.getElementById('win').hidden), '| stars:', await p.evaluate(() => document.getElementById('stars').textContent), '| errors', errs.length);
  if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT });
  await b.close();
})();
