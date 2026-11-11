// Headless playtest: node nounsense/test/playtest.js (needs Playwright)
// Plays scripted solutions in each world, then spawns every word with random
// adjectives and inputs to look for crashes.
const { chromium } = require('playwright');
const url = 'file://' + require('path').resolve(__dirname, '..', 'index.html');
let failed = 0;

const TESTS = [
  // Lamplight Row (listed first in the game; -2 here because the older worlds start at index 2)
  [-2, 'raft crosses the flooded roadworks', (s, p, run, at) => { s.spawn('raft', 1040, 540); run(60); at(972); run(3, {}, { interactPressed: true }); if (!p.mount) return 'no mount'; run(220, { right: true }); return p.x > 1150 && p.hp === 3 ? true : [p.x | 0, p.hp]; }],
  [-2, 'falling in the hole sends you back', (s, p, run, at) => { at(960); run(80, { right: true }); return p.x < 500 ? true : p.x | 0; }],
  [-2, 'magpie snatches the star seed if ignored', (s, p, run, at, N) => { at(N.magpie.x - 60); run(420); return !p.hasParcel ? true : 'seed survived'; }],
  [-2, 'a shiny decoy keeps the magpie busy', (s, p, run, at, N) => { s.spawn('ring', N.magpie.x, 480); run(200); return N.magpie.fullUntil > s.time ? true : 'not distracted'; }],
  [-2, 'cat scares the magpie', (s, p, run, at, N) => { const x0 = N.magpie.x; s.spawn('cat', x0 - 40, 480); let fled = false; for (let i = 0; i < 12; i++) { run(10); fled = fled || !!(N.magpie.goal && N.magpie.goal.type === 'flee'); } return fled ? true : [x0 | 0, N.magpie.x | 0]; }],
  [-2, 'axe chops the hoarding down', (s, p, run, at, N, has) => { N.magpie.asleepUntil = Infinity; s.spawn('axe', 1960, 480); run(40); at(1960); run(3, {}, { interactPressed: true }); run(40, { right: true }); for (let i = 0; i < 4; i++) run(25, {}, { usePressed: true }); return !has('hoarding') ? true : N.wall.hp; }],
  [-2, 'torch burns the hoarding', (s, p, run, at, N, has) => { N.magpie.asleepUntil = Infinity; s.spawn('torch', 1960, 480); run(40); at(1960); run(3, {}, { interactPressed: true }); run(40, { right: true }); run(5, {}, { usePressed: true }); run(420, { left: true }); return !has('hoarding') ? true : 'still standing'; }],
  [-2, 'neighbours wave and say hello', (s, p, run, at, N) => { at(N.kid.x - 40); run(200); return N.kid.waveUntil > 0 && s.fx.some((f) => f.type === 'speech') ? true : [N.kid.waveUntil, s.fx.length]; }],
  [-2, 'lighting the beacon wins', (s, p, run, at) => { at(2420); run(60, { right: true }); return s.won ? true : 'no win'; }],
  // Gloamwick Manor (index 1)
  [-1, 'stairs lead up to the gallery', (s, p, run, at, N) => { N.armour.asleepUntil = Infinity; at(880); run(200, { right: true }); return p.y < 320 && p.x > 1250 ? true : [p.x | 0, p.y | 0]; }],
  [-1, 'haunted armour attacks', (s, p, run, at, N) => { at(N.armour.x - 90); run(240); return p.hp < 3 || p.x < 400 ? true : p.hp; }],
  [-1, 'rain rusts the armour to a stop', (s, p, run, at, N) => { s.spawn('rain cloud', N.armour.x, 200); run(60); return N.armour.stunUntil > s.time ? true : 'still moving'; }],
  [-1, 'bridge spans the hole in the gallery', (s, p, run, at, N) => { s.spawn('bridge', 1680, 240); run(80); at(1500, 300); run(130, { right: true }); return p.x > 1820 && p.y < 310 ? true : [p.x | 0, p.y | 0]; }],
  [-1, 'key opens the vault door', (s, p, run, at, N, has) => { s.spawn('key', 2040, 480); run(40); at(2040); run(3, {}, { interactPressed: true }); run(20, { right: true }); run(3, {}, { usePressed: true }); run(5); return !has('vaultdoor') ? true : 'still locked'; }],
  [-1, 'lantern drives off the poltergeist; beacon lit', (s, p, run, at, N) => { s.spawn('lantern', 2170, 480); run(40); at(2170); run(3, {}, { interactPressed: true }); run(80, { right: true }); return s.won && p.hp === 3 ? true : [p.x | 0, p.hp, s.won]; }],
  [-1, 'bombs take the vault door down', (s, p, run, at, N, has) => { for (let k = 0; k < 3 && has('vaultdoor'); k++) { s.spawn('bomb', 2030, 480); run(40); at(2030); run(3, {}, { interactPressed: true }); run(30, { right: true }); run(3, {}, { usePressed: true }); run(60, { left: true }); run(140); } return !has('vaultdoor') ? true : N.door.hp; }],
  [-1, 'flute lulls the haunted armour', (s, p, run, at, N) => { s.spawn('flute', 500, 480); run(40); at(500); run(3, {}, { interactPressed: true }); at(N.armour.x - 150); run(3, {}, { usePressed: true }); run(30); return N.armour.asleepUntil > s.time ? true : 'awake'; }],
  [-1, 'sunlight finishes the poltergeist', (s, p, run, at, N, has) => { s.spawn('sun', N.polter.x - 40, 300); at(1400); run(420); return !has('shade') ? true : 'still there'; }],
  [-1, 'poltergeist guards the beacon', (s, p, run, at, N) => { at(2180); run(200, { right: true }); return p.hp < 3 || p.x < 600 ? true : [p.hp, s.won]; }],
  // Glowroot Hollow (index 2)
  ['h', 'bridge spans the river', (s, p, run, at) => { s.spawn('bridge', 920, 470); run(90); at(660); run(260, { right: true }); return p.x > 1070 && p.y < 520 ? true : [p.x | 0, p.y | 0]; }],
  ['h', 'raft crosses the river', (s, p, run, at) => { s.spawn('raft', 850, 540); run(60); at(772); run(3, {}, { interactPressed: true }); if (!p.mount) return 'no mount'; run(240, { right: true }); return p.x > 980 && p.hp === 3 ? true : [p.x | 0, p.hp]; }],
  ['h', 'plain jump does not clear the river', (s, p, run, at) => { at(740); run(12, { right: true }); run(120, { right: true }, { jumpPressed: true }); return p.x < 1060 ? true : p.x | 0; }],
  ['h', 'gremlin gobbles the star seed if ignored', (s, p, run, at, N) => { at(N.gremlin.x - 100); run(300); return !p.hasParcel ? true : 'seed survived'; }],
  ['h', 'donut distracts the gremlin', (s, p, run, at, N) => { s.spawn('donut', N.gremlin.x + 60, 480); run(100); at(N.gremlin.x - 80); run(200, { right: true }); return p.hasParcel ? true : 'gobbled'; }],
  ['h', 'trumpet frightens the gremlin', (s, p, run, at, N) => { s.spawn('trumpet', 1200, 480); run(40); at(1200); run(3, {}, { interactPressed: true }); at(N.gremlin.x - 130); run(3, {}, { usePressed: true }); let fled = false; for (let i = 0; i < 12; i++) { run(10); fled = fled || !!(N.gremlin.goal && N.gremlin.goal.type === 'flee'); } return fled ? true : 'not scared'; }],
  ['h', 'cat scares the gremlin away', (s, p, run, at, N) => { const x0 = N.gremlin.x; s.spawn('cat', x0 - 120, 480); run(120); return Math.abs(N.gremlin.x - x0) > 60 && N.gremlin.goal ? true : [x0 | 0, N.gremlin.x | 0]; }],
  ['h', 'the bluff is too high to jump', (s, p, run, at, N) => { N.gremlin.asleepUntil = Infinity; at(1800); run(20, { right: true }); run(120, { right: true }, { jumpPressed: true }); return p.y > 400 && p.x < 1900 ? true : [p.x | 0, p.y | 0]; }],
  ['h', 'rain grows the skyvine; climb it onto the bluff', (s, p, run, at, N) => { N.gremlin.asleepUntil = Infinity; s.spawn('rain cloud', 1862, 200); run(300); if (N.vine.h < 250) return ['vine', N.vine.h]; at(1862); run(160, { up: true }); run(8, { right: true }, { jumpPressed: true }); run(60, { right: true }); return p.y < 300 && p.x > 1900 ? true : [p.x | 0, p.y | 0]; }],
  ['h', 'ladder gets up the bluff', (s, p, run, at, N) => { N.gremlin.asleepUntil = Infinity; s.spawn('ladder', 1872, 400); run(60); at(1872); run(150, { up: true }); run(8, { right: true }, { jumpPressed: true }); run(60, { right: true }); return p.y < 300 && p.x > 1900 ? true : [p.x | 0, p.y | 0]; }],
  ['h', 'trampoline bounces up the bluff', (s, p, run, at, N) => { N.gremlin.asleepUntil = Infinity; s.spawn('trampoline', 1800, 480); run(60); at(1760, 420); let ok = false; for (let i = 0; i < 400 && !ok; i++) { run(1, { right: p.y < 330 || p.x < 1800, jump: true }); ok = p.y < 300 && p.x > 1900; } return ok ? true : [p.x | 0, p.y | 0]; }],
  ['h', 'thornvines stop even a flying wizard', (s, p, run, at, N) => { s.describe(p, 'flying'); at(1960, 300); run(260, { right: true, jump: true, up: true }); return p.x < 2130 && N.thorns && !N.thorns.removed ? true : [p.x | 0, p.y | 0]; }],
  ['h', 'torch burns the thornvines', (s, p, run, at, N, has) => { s.spawn('torch', 1980, 260); run(40); at(1980, 300); run(3, {}, { interactPressed: true }); run(40, { right: true }); run(5, {}, { usePressed: true }); run(420, { left: true }); return !has('thornvines') ? true : 'still there'; }],
  ['h', 'axe cuts the thornvines', (s, p, run, at, N, has) => { s.spawn('axe', 1980, 260); run(40); at(1980, 300); run(3, {}, { interactPressed: true }); run(40, { right: true }); for (let i = 0; i < 4; i++) run(25, {}, { usePressed: true }); return !has('thornvines') ? true : N.thorns.hp; }],
  ['h', 'a gardener trims the thornvines', (s, p, run, at, N, has) => { s.spawn('lumberjack', 2000, 260); run(600); return !has('thornvines') ? true : N.thorns.hp; }],
  ['h', 'villagers wave and say hello', (s, p, run, at, N) => { at(N.keeper.x - 40); run(200); return N.keeper.waveUntil > 0 && s.fx.some((f) => f.type === 'speech') ? true : [N.keeper.waveUntil, s.fx.length]; }],
  ['h', 'lighting the beacon wins', (s, p, run, at) => { at(2420, 300); run(60, { right: true }); return s.won ? true : 'no win'; }],
  // world 0: Glowroot Gorge
  [0, 'bridge spans the gorge', (s, p, run, at) => { s.spawn('bridge', 870, 470); run(90); at(640); run(160, { right: true }); return p.x > 1040 && p.y < 520 ? true : [p.x | 0, p.y | 0]; }],
  [0, 'plain jump does not clear the gorge', (s, p, run, at) => { at(640); run(18, { right: true }); run(120, { right: true }, { jumpPressed: true }); return p.x < 1040 ? true : p.x | 0; }],
  [0, 'gremlin gobbles the star seed if ignored', (s, p, run, at, N) => { at(N.gremlin.x - 100); run(300); return !p.hasParcel ? true : 'seed survived'; }],
  [0, 'cat scares the gremlin away', (s, p, run, at, N) => { const x0 = N.gremlin.x; s.spawn('cat', x0 - 120, 480); run(120); return Math.abs(N.gremlin.x - x0) > 60 && N.gremlin.goal ? true : [x0 | 0, N.gremlin.x | 0]; }],
  [0, 'donut distracts the gremlin', (s, p, run, at, N) => { s.spawn('donut', N.gremlin.x + 60, 480); run(100); at(N.gremlin.x - 80); run(200, { right: true }); return p.hasParcel ? true : 'gobbled'; }],
  [0, 'torch melts the frostglass', (s, p, run, at, N, has) => { s.spawn('torch', 1800, 480); run(40); at(1800); run(3, {}, { interactPressed: true }); run(40, { right: true }); run(5, {}, { usePressed: true }); return !has('frostglass') ? true : 'still there'; }],
  [0, 'trumpet cracks the frostglass', (s, p, run, at, N, has) => { s.spawn('trumpet', 1800, 480); run(40); at(1800); run(3, {}, { interactPressed: true }); run(5, {}, { usePressed: true }); run(170); return !has('frostglass') ? true : N.wall.hp; }],
  [0, 'hammer smashes the frostglass', (s, p, run, at, N, has) => { s.spawn('hammer', 1800, 480); run(40); at(1800); run(3, {}, { interactPressed: true }); run(40, { right: true }); for (let i = 0; i < 4; i++) run(25, {}, { usePressed: true }); return !has('frostglass') ? true : N.wall.hp; }],
  [0, 'describing words: sleepy gremlin, flying Nib, wall resists tiny', (s, p, run, at, N) => { const a = s.describe(N.gremlin, 'sleepy'), b = s.describe(p, 'flying'), c = s.describe(N.wall, 'tiny'); run(30); return a.ok && b.ok && !c.ok && N.gremlin.asleepUntil === Infinity && p.mods.fly === 'flap' && s.words.length === 2 ? true : [a, b, c]; }],
  [0, 'shrink ray makes a creature tiny', (s, p, run, at, N) => { const w0 = N.gremlin.w; s.spawn('shrink ray', N.gremlin.x - 120, 480); run(40); at(N.gremlin.x - 120); N.gremlin.asleepUntil = Infinity; run(3, {}, { interactPressed: true }); run(3, { right: true }); run(3, {}, { usePressed: true }); return N.gremlin.w < w0 ? true : [p.held && p.held.name, N.gremlin.w]; }],
  [0, 'lighting the beacon wins', (s, p, run, at) => { at(2250); run(60, { right: true }); return s.won ? true : 'no win'; }],
  // world 1: The Thirsty Skyvine
  [1, 'rain grows the vine, climb it, reach the island', (s, p, run, at, N) => { s.spawn('rain cloud', 700, 250); run(400); if (N.vine.h < 890) return ['vine', N.vine.h]; at(700); run(700, { up: true }); run(8, { right: true }, { jumpPressed: true }); run(110, { right: true }); return p.y < -360 && p.x > 820 ? true : [p.x | 0, p.y | 0]; }],
  [1, 'golem squashes a careless wizard', (s, p, run, at, N) => { at(N.golem.x - 120, -360); run(200); return p.hp < 3 || p.x < 600 ? true : p.hp; }],
  [1, 'water shorts out the golem', (s, p, run, at, N) => { s.spawn('rain cloud', N.golem.x, -620); run(60); return N.golem.stunUntil > s.time ? true : 'not stunned'; }],
  [1, 'tin can keeps the golem busy; beacon reached', (s, p, run, at, N) => { s.spawn('tin can', N.golem.x - 40, -400); run(160); at(N.golem.x + 120, -360); run(200, { right: true }); return s.won ? true : [p.x | 0, p.hp, s.won]; }],
  [1, 'magic bean grows a climbable stalk', (s, p, run, at, N, has) => { s.spawn('bean', 420, 480); run(40); at(420); run(3, {}, { interactPressed: true }); run(3, {}, { usePressed: true }); run(260); const v = s.ents.find((e) => e.spec.noun === 'beanstalk'); return v && v.h > 600 ? true : v && v.h; }],
  // world 2: The Lightless Keep
  [2, 'bridge crosses the canal out of the eel\'s reach', (s, p, run, at) => { s.spawn('bridge', 910, 470); run(90); at(720); run(150, { right: true }); return p.x > 1060 && p.hp === 3 ? true : [p.x | 0, p.hp]; }],
  [2, 'raft floats and can be sailed; the eel bites', (s, p, run, at) => { s.spawn('raft', 822, 540); run(60); const r = s.ents.find((e) => e.spec.noun === 'raft'); if (!r || Math.abs(r.y - 560) > 30) return ['raft', r && r.y]; at(750); run(3, {}, { interactPressed: true }); if (!p.mount) return 'no mount'; run(200, { right: true }); return p.hp < 3 || p.x < 500 ? true : [p.x | 0, p.hp]; }],   // bitten, or knocked off and washed back
  [2, 'falling in the canal sends you back', (s, p, run, at) => { at(740); run(80, { right: true }); return p.x < 400 ? true : p.x | 0; }],
  [2, 'key opens the force gate', (s, p, run, at, N, has) => { s.spawn('key', 1200, 480); run(40); at(1200); run(3, {}, { interactPressed: true }); run(40, { right: true }); run(3, {}, { usePressed: true }); run(5); return !has('forcegate') ? true : 'still locked'; }],
  [2, 'bomb takes the gate down', (s, p, run, at, N, has) => { for (let k = 0; k < 2; k++) { s.spawn('bomb', 1220, 480); run(40); at(1220); run(3, {}, { interactPressed: true }); run(30, { right: true }); run(3, {}, { usePressed: true }); run(60, { left: true }); run(140); } return !has('forcegate') ? true : N.gate.hp; }],
  [2, 'lantern keeps the shade away', (s, p, run, at, N) => { s.spawn('lantern', 1500, 480); run(40); at(1500); run(3, {}, { interactPressed: true }); at(N.shade.x - 150); run(360); return p.hp === 3 && Math.abs(N.shade.x - p.x) > 100 ? true : [(N.shade.x - p.x) | 0, p.hp]; }],
  [2, 'sunlight destroys the shade', (s, p, run, at, N, has) => { s.spawn('sun', N.shade.x, 200); at(1400); run(360); return !has('shade') ? true : N.shade.hp; }],
  // world 3: Port Nebula
  [3, 'boat sails to the hull; cargo net climbs to the deck', (s, p, run, at, N) => { N.shark.asleepUntil = Infinity; s.spawn('boat', 684, 520); run(60); at(610); run(3, {}, { interactPressed: true }); if (!p.mount) return 'no mount'; run(420, { right: true }); if (p.x < 1380) return ['boat stopped', p.x | 0]; run(3, {}, { interactPressed: true }); run(200, { up: true, right: true }); run(60, { right: true }); return p.y < 380 && p.x > 1500 ? true : [p.x | 0, p.y | 0]; }],
  [3, 'star shark bites sailors', (s, p, run, at) => { s.spawn('boat', 684, 520); run(60); at(610); run(3, {}, { interactPressed: true }); run(300, { right: true }); return p.hp < 3 || p.x < 500 ? true : p.hp; }],
  [3, 'fish feeds the shark', (s, p, run, at, N) => { s.spawn('fish', N.shark.x + 60, 540); run(200); return N.shark.fullUntil > s.time ? true : 'not fed'; }],
  [3, 'friendly shark can be ridden', (s, p, run, at, N) => { const r = s.describe(N.shark, 'friendly'); Matter.Body.setPosition(N.shark.body, { x: 700, y: N.shark.y }); run(20); at(612); run(3, {}, { interactPressed: true }); if (!p.mount) return ['no mount', r]; run(200, { right: true }); return p.x > 1000 && p.hp === 3 ? true : [p.x | 0, p.hp]; }],
  [3, 'treasure bribes the captain; beacon reached', (s, p, run, at, N) => { s.spawn('treasure', N.captain.x - 40, 340); run(200); if (!N.captain.spec.friendly) return 'not bribed'; at(2150, 380); run(120, { right: true }); return s.won ? true : [p.x | 0, s.won]; }],
  [3, 'ghost spooks the captain', (s, p, run, at, N) => { const x0 = N.captain.x; s.spawn('ghost', x0 - 100, 300); let fled = false; for (let i = 0; i < 15; i++) { run(10); fled = fled || !!(N.captain.goal && N.captain.goal.type === 'flee'); } return fled ? true : [x0 | 0, N.captain.x | 0]; }],
];

(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1200, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => { errs.push(e.message); console.log('PAGE ERROR', e.message, (e.stack || '').split('\n')[1]); });
  await page.goto(url);
  await page.waitForTimeout(400);
  for (const [world, name, fn] of TESTS) {
    const r = await page.evaluate(`(() => { NN.game.newGame(${world === 'h' ? 2 : world < 0 ? world + 2 : world + 3}); NN.game.start(); const s = NN.game.sim, p = s.player, B = Matter.Body, N = s.natives;
      const run = (n, k, pr) => { for (let i = 0; i < n; i++) s.step(Object.assign({}, k || {}, i === 0 ? (pr || {}) : {})); };
      const at = (x, y) => { B.setPosition(p.body, { x, y: (y === undefined ? 520 : y) - 26 }); B.setVelocity(p.body, { x: 0, y: 0 }); s.step({}); s.step({}); };
      const has = (n) => s.ents.some((e) => e.spec.noun === n);
      try { return (${fn.toString()})(s, p, run, at, N, has); } catch (e) { return 'threw: ' + e.message + ' ' + (e.stack || '').split('\\n')[1]; } })()`);
    if (r !== true) failed++;
    console.log((r === true ? 'PASS ' : 'FAIL ') + `[${world}] ` + name + (r === true ? '' : ' -> ' + JSON.stringify(r)));
  }
  // fuzz: every noun, with and without random adjectives, in a random world, poked at randomly
  const res = await page.evaluate(() => {
    const out = { errors: [], n: 0 };
    const adjs = Object.keys(NN.dict.adjectives), nouns = NN.lexicon.nouns();
    let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let round = 0; round < 3; round++) for (const noun of nouns) {
      const phrase = (round === 0 ? '' : adjs[Math.floor(rnd() * adjs.length)] + ' ' + (round === 2 ? adjs[Math.floor(rnd() * adjs.length)] + ' ' : '')) + NN.lexicon.displayName(noun);
      try {
        NN.game.newGame(Math.floor(rnd() * NN.levels.length)); const s = NN.game.sim, L = NN.game.level;
        const spots = [[L.start.x + 60, L.start.y]].concat((L.natives || []).map((n) => [n.x - 70, n.y === undefined ? 520 : Math.min(520, n.y)]), (L.water || []).map((w) => [w.x0 + 80, w.y - 30]));
        const [px, py] = spots[Math.floor(rnd() * spots.length)];
        Matter.Body.setPosition(s.player.body, { x: px, y: py - 26 });
        const r = s.spawn(phrase, px + 40, py - 60, false);
        if (!r.ok) { out.errors.push(phrase + ': ' + r.error); continue; }
        s.spawn(nouns[Math.floor(rnd() * nouns.length)], px - 60, py - 60, false);
        for (let i = 0; i < 240; i++) {
          s.step({ right: rnd() < 0.4, left: rnd() < 0.2, up: rnd() < 0.2, jump: rnd() < 0.2, jumpPressed: rnd() < 0.05, interactPressed: i % 37 === 5, usePressed: i % 23 === 11, dropPressed: i === 200 });
          if (i === 100) { const e = s.ents[s.ents.length - 1]; if (e && s.grab(e)) { s.dragTo(px + 100, py - 200); s.release(); } }
          if (i === 60) { const t = s.ents[Math.floor(rnd() * s.ents.length)]; if (t) s.describe(t, adjs[Math.floor(rnd() * adjs.length)]); s.describe(s.player, 'flying'); }
        }
        for (const e of s.ents.concat([s.player])) if (!isFinite(e.x) || !isFinite(e.y)) out.errors.push(phrase + ': NaN ' + e.name);
        NN.art.sprite(r.ent.spec, 0); NN.art.sprite(r.ent.spec, 1);
        out.n++;
      } catch (err) { out.errors.push(phrase + ': ' + err.message + ' @ ' + (err.stack || '').split('\n')[1]); }
    }
    NN.game.newGame(0);
    return out;
  });
  failed += res.errors.length;
  console.log('fuzz:', res.n, 'ok;', res.errors.length, 'problems'); if (res.errors.length) console.log(res.errors.slice(0, 20).join('\n'));
  console.log('page errors:', errs.length);
  process.exitCode = errs.length || failed ? 1 : 0;
  await b.close();
})();
