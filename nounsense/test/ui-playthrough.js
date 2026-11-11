// Finish Gloamwick Manor the way a player would: mouse clicks, typed words, held keys. No test hooks are used to act,
// only to read where things are so the mouse can be pointed at them.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + require('path').resolve(__dirname, '..', 'index.html'));
  await p.waitForTimeout(1200);
  await p.click('#worlds button:nth-child(2)'); await p.waitForTimeout(1500); await p.click('#start');
  const st = () => p.evaluate(() => { const s = NN.game.sim, q = s.player, N = s.natives; return { x: q.x | 0, y: q.y | 0, hp: q.hp, held: q.held && q.held.name, seed: q.hasParcel, won: s.won, words: s.words.length, armour: N.armour && { x: N.armour.x | 0, zz: N.armour.asleepUntil > s.time }, door: s.ents.some((e) => e.spec.noun === 'vaultdoor'), polter: N.polter && !N.polter.removed && { x: N.polter.x | 0, friendly: !!N.polter.spec.friendly, zz: N.polter.asleepUntil > s.time }, msg: document.getElementById('msg').textContent }; });
  const pt = (x, y) => p.evaluate(([x, y]) => { const r = document.getElementById('game').getBoundingClientRect(), c = NN.game.cam; return [r.left + (x - c.x) * r.width / 1100, r.top + (y - c.y) * r.height / 620]; }, [x, y]);
  const clickWorld = async (x, y) => { const [cx, cy] = await pt(x, y); await p.mouse.move(cx, cy); await p.waitForTimeout(700); await p.mouse.click(cx, cy); await p.waitForTimeout(700); };
  const type = async (w) => { await p.keyboard.press('Enter'); await p.keyboard.type(w); await p.keyboard.press('Enter'); await p.waitForTimeout(900); };
  const walkTo = async (x, max) => { await p.keyboard.down('d'); const t0 = Date.now(); let s = await st(); while (s.x < x && Date.now() - t0 < max && !s.won) { await p.waitForTimeout(500); s = await st(); } await p.keyboard.up('d'); return s; };
  let s = await st(); console.log('start', JSON.stringify(s));
  // 1. the armour: click it, describe it
  await clickWorld(s.armour.x, 500); await type('sleepy'); s = await st(); console.log('after "sleepy"', JSON.stringify(s));
  // 2. walk to the vault door
  s = await walkTo(2030, 170000); console.log('at the door', JSON.stringify(s));
  // 3. put a lantern down by the door first (the poltergeist keeps clear of light), then write "key", pick it up, unlock
  const place = async (w, dx) => { const [cx, cy] = await pt(s.x + dx, 470); await p.mouse.move(cx, cy); await p.waitForTimeout(500); await type(w); await p.mouse.click(cx, cy); await p.waitForTimeout(2500); };
  await place('lantern', -40); await place('key', 30);
  await p.keyboard.press('e'); await p.waitForTimeout(1500); s = await st(); console.log('picked up', JSON.stringify(s));
  await p.keyboard.down('d'); await p.waitForTimeout(3000); await p.keyboard.up('d'); await p.keyboard.press('f'); await p.waitForTimeout(2500); s = await st(); console.log('used key', JSON.stringify(s));
  // 4. go back for the lantern and carry it to the beacon
  await p.keyboard.down('a'); let t0 = Date.now(); while (s.x > 2000 && Date.now() - t0 < 30000) { await p.waitForTimeout(400); s = await st(); } await p.keyboard.up('a');
  await p.keyboard.press('e'); await p.waitForTimeout(1500); s = await st(); console.log('lantern in hand', JSON.stringify(s));
  s = await walkTo(2400, 150000); await p.waitForTimeout(2500); s = await st(); console.log('end', JSON.stringify(s));
  console.log('win card shown:', await p.evaluate(() => !document.getElementById('win').hidden), '| stars:', await p.evaluate(() => document.getElementById('stars').textContent), '| errors', errs.length);
  if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT });
  await b.close();
})();
