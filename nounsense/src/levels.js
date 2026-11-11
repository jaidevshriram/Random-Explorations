/* Levels: data only. Each one is a strip of terrain, some water, a few natives
 * (the things that are already there) and a beacon to reach with a star seed.
 *
 * Story: Nib, an apprentice star-wizard, has crashed the Tin Comet. Four dead
 * beacons will call for a tow if each is relit with a star seed.
 *
 * Terrain is a list of boxes { x0, y0 (top), x1, y1, kind }. `kind` only picks
 * how the box is drawn. Natives are dictionary words with overrides, or a bare
 * spec with its own art.
 */
(function (NN) {
  'use strict';
  const rng = (seed) => { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };

  function frostglass() {
    const r = rng(77), ops = [['r', -80, -100, 160, 200, 'sky', 4]];
    for (let i = 0; i < 44; i++) {
      const x = (r() - 0.5) * 150, y = -98 + i * 4.5 + r() * 2, k = 0.7 + r() * 0.9, d = r() > 0.5 ? 1 : -1;
      ops.push(['p', [x - 34 * k * d, y + 3 * k, x - 6 * d, y - 5 * k, x + 40 * k * d, y - 1, x + 4 * d, y + 5 * k], ['sky+', 'white', 'blue+', 'sky'][i % 4], 1]);
    }
    for (let i = 0; i < 14; i++) ops.push(['l', [(r() - 0.5) * 120, -96 + r() * 190, (r() - 0.5) * 120, -96 + r() * 190], 1.2, 'white']);
    return ops;
  }
  function forcegate() {
    const ops = [];
    for (let y = -97; y <= 97; y += 5) ops.push(['l', [-70, y, 70, y], 3.2, y % 2 ? 'pink' : 'purple+']);
    ops.push(['r', -100, -100, 30, 200, 'dgrey', 2], ['r', 70, -100, 30, 200, 'dgrey', 2], ['r', -44, 84, 88, 7, 'yellow', 2], ['d', 0, 87.5, 3, 'red']);
    for (let y = -90; y <= 90; y += 12) ops.push(['d', -85, y, 2, 'teal'], ['d', 85, y, 2, 'teal']);
    return ops;
  }
  function cargonet() {
    const ops = [['r', -100, -100, 200, 7, 'dbrown', 2]];
    for (let x = -84; x <= 84; x += 28) ops.push(['l', [x, -94, x + (x % 3 ? 3 : -3), 0, x, 98], 2.2, 'tan']);
    for (let y = -80; y <= 90; y += 17) ops.push(['l', [-88, y, -30, y + 3, 30, y - 2, 88, y], 2.2, 'tan']);
    return ops;
  }

  NN.levelArt = {
    beacon: { noun: 'beacon', w: 46, h: 104, art: [['p', [-74, 100, -46, -28, 46, -28, 74, 100], 'grey', 3], ['l', [-62, 44, 62, 44], 1.5], ['l', [-54, 6, 54, 6], 1.5], ['r', -22, 58, 44, 42, 'dbrown', 3], ['d', 10, 80, 1.6, 'yellow'],
      ['r', -62, -44, 124, 18, 'dgrey', 3], ['r', -42, -84, 84, 42, 'sky', 3], ['l', [0, -84, 0, -44], 1.5], ['p', [-58, -82, 0, -108, 58, -82], 'red', 2], ['d', 0, -110, 2.6, 'yellow']] },
  };

  const SIZE = ['tiny', 'small', 'big', 'giant', 'long', 'tall', 'invisible', 'dead', 'baby'];

  NN.levels = [
    {
      id: 'town', name: 'Lamplight Row', theme: 'town', par: 3, zoom: 1,
      caption: 'Evening on Lamplight Row. The beacon outside the observatory has gone dark.',
      story: 'A burst main has flooded the roadworks, a magpie with a taste for shiny things is working the street, and somebody has boarded the far end off. The neighbours are friendly, at least.',
      hints: ['The flooded hole: float something across, bridge it, or go over the top.', 'Magpies snatch anything shiny, so give it something else to snatch. They also hate cats and scarecrows.', 'The hoarding is only wood. Wood burns, breaks and can be chopped. It is not very tall either.',
        'Click a creature and write a describing word to change it: sleepy, tiny, friendly…', 'The neighbours react to what you summon. Try something alarming.'],
      W: 2640, sky: -300, deathY: 1000, start: { x: 300, y: 520 }, depot: { x: 130, y: 520 }, goal: { x: 2500, y: 520 }, holes: [[980, 1240]],
      terrain: [{ x0: -300, y0: 520, x1: 980, y1: 1100, kind: 'street' }, { x0: 978, y0: 640, x1: 1242, y1: 1100, kind: 'pit', trench: 520 }, { x0: 1240, y0: 520, x1: 2940, y1: 1100, kind: 'street' }],
      water: [{ x0: 980, x1: 1240, y: 566, msg: 'Splash! The burst main washed you back to the ship.' }],
      natives: [
        { key: 'magpie', word: 'magpie', x: 1600, y: 380, range: 220, facing: -1 },
        { key: 'wall', x: 2080, y: 520, fixed: true, resists: SIZE, goneMsg: 'The hoarding is down. The way is clear!',
          spec: { noun: 'hoarding', name: 'roadworks hoarding', w: 64, h: 300, solid: true, anchored: true, upright: true, material: 'wood', flammable: true, tags: ['fence', 'tree'], hp: 8, mass: 5,
            art: [['r', -100, -100, 200, 200, 'tan', 2], ['l', [-50, -100, -50, 100], 1.6], ['l', [0, -100, 0, 100], 1.6], ['l', [50, -100, 50, 100], 1.6], ['r', -100, -100, 200, 6, 'brown', 1], ['r', -100, 94, 200, 6, 'brown', 1],
              ['r', -100, -12, 200, 16, 'white', 1.5], ['p', [-90, -12, -50, -12, -70, 4, -110, 4], 'red', 0.5], ['p', [-10, -12, 30, -12, 10, 4, -30, 4], 'red', 0.5], ['p', [70, -12, 110, -12, 90, 4, 50, 4], 'red', 0.5],
              ['e', 0, -58, 62, 13, 'red'], ['r', -42, -60, 84, 4, 'white', 1]] } },
        { key: 'kid', word: 'gnome', x: 520, range: 180, spec: { noun: 'kid', name: 'kid', w: 24, h: 40, greets: ['Nice goggles!', 'Did you crash?', 'Wow, a star!'], art: { a: 'person', top: 'yellow', legs: 'teal', hat: 'cap', hatColor: 'blue', hair: 'brown' } } },
        { key: 'gardener', word: 'gardener', x: 760, range: 150, spec: { greets: ['Evening!', 'Mind the hole.', 'Lovely night for it.'] } },
        { key: 'cook', word: 'chef', x: 1420, range: 140, spec: { noun: 'towncook', greets: ['Hungry?', 'That bird took my spoon.', 'Evening!'], art: { a: 'person', top: 'white', legs: 'dgrey', hat: 'chef' } } },
        { key: 'stroller', word: 'bard', x: 1760, range: 200, spec: { noun: 'stroller', name: 'passer-by', lulls: false, greets: ['Hm? Oh, hello.', 'Good tune, this.'], art: { a: 'person', top: 'red', legs: 'navy', hat: 'headphones', hair: 'ink' } } },
        { key: 'shopper', word: 'doctor', x: 2260, range: 120, spec: { noun: 'shopper', name: 'shopper', heals: false, greets: ['Road is closed, love.', 'Evening!'], art: { a: 'person', top: 'sage', legs: 'brown', hat: 'bun', hair: 'dbrown' } } },
        { key: 'professor', word: 'doctor', x: 2400, range: 100, spec: { noun: 'professor', name: 'professor', heals: false, greets: ['The beacon! At last.', 'Mind the telescope.'], art: { a: 'person', top: 'white', legs: 'dgrey', robe: 1, hat: 'goggles', hair: 'grey', beard: 'grey' } } },
        { key: 'cat', word: 'cat', x: 620, range: 260, spec: { noun: 'towncat', tags: ['creature', 'animal'], hunts: ['mouse'], fears: ['dog', 'wet', 'fire'] } },
        { key: 'dog', word: 'dog', x: 1900, range: 150, spec: { follows: false, tags: ['creature', 'animal', 'dog'] } },
      ],
    },
    {
      id: 'manor', name: 'Gloamwick Manor', theme: 'manor', par: 3, zoom: 1,
      caption: 'Nobody has lived in Gloamwick Manor for years. Nobody alive, anyway.',
      story: 'One of the suits of armour is not as empty as it looks. The gallery floor has fallen in, the vault door underneath is locked, and something that hates the light keeps the beacon company.',
      hints: ['The armour is old iron. Iron and water do not get along. A lullaby works on it too.', 'The gallery has a hole in it. Span it, fly it, or drop through and deal with the vault door instead.', 'The vault door has a lock. It can also be smashed or blown up.',
        'The poltergeist flees anything that gives off light. Sunlight finishes it.', 'Click a creature and write a describing word: sleepy, friendly, tiny…'],
      W: 2400, sky: 40, deathY: 1000, start: { x: 300, y: 520 }, depot: { x: 150, y: 520 }, depotKind: 'chest', goal: { x: 2300, y: 520 }, gallery: [[1250, 1560], [1800, 2100]],
      terrain: [{ x0: -300, y0: 520, x1: 2700, y1: 1100, kind: 'floor' }, { x0: 920, y0: 500, x1: 1250, y1: 520, kind: 'stair' }, { x0: 950, y0: 480, x1: 1250, y1: 500, kind: 'stair' }, { x0: 980, y0: 460, x1: 1250, y1: 480, kind: 'stair' }, { x0: 1010, y0: 440, x1: 1250, y1: 460, kind: 'stair' }, { x0: 1040, y0: 420, x1: 1250, y1: 440, kind: 'stair' }, { x0: 1070, y0: 400, x1: 1250, y1: 420, kind: 'stair' }, { x0: 1100, y0: 380, x1: 1250, y1: 400, kind: 'stair' }, { x0: 1130, y0: 360, x1: 1250, y1: 380, kind: 'stair' }, { x0: 1160, y0: 340, x1: 1250, y1: 360, kind: 'stair' }, { x0: 1190, y0: 320, x1: 1250, y1: 340, kind: 'stair' }, { x0: 1220, y0: 300, x1: 1250, y1: 320, kind: 'stair' }, { x0: 1250, y0: 300, x1: 1560, y1: 322, kind: 'balcony' }, { x0: 1800, y0: 300, x1: 2100, y1: 322, kind: 'balcony' }],
      natives: [
        { key: 'armour', word: 'knight', x: 850, range: 50, facing: -1, name: 'haunted armour',
          spec: { noun: 'armour', hunts: ['human'], fears: ['wet'], dmg: 1, hp: 8, speed: 1.5, sound: 'clank', tags: ['creature', 'monster', 'scary', 'undead'], art: { a: 'person', skin: 'grey', top: 'grey', legs: 'grey', shoe: 'dgrey', hat: 'knight', prop: 'sword' } } },
        { key: 'door', x: 2115, y: 520, fixed: true, resists: SIZE, goneMsg: 'The vault door swings open.',
          spec: { noun: 'vaultdoor', name: 'vault door', w: 30, h: 198, solid: true, anchored: true, upright: true, material: 'metal', locked: true, tags: ['gate'], hp: 14, mass: 5,
            art: [['r', -100, -100, 200, 200, 'dgrey', 2], ['r', -100, -72, 200, 6, 'grey', 1], ['r', -100, 62, 200, 6, 'grey', 1], ['e', 0, -8, 62, 9.4, 'yellow'], ['e', 0, -8, 24, 3.6, 'dgrey'], ['d', 0, 22, 2.6], ['d', -60, -86, 1.6, 'grey'], ['d', 60, -86, 1.6, 'grey'], ['d', -60, 86, 1.6, 'grey'], ['d', 60, 86, 1.6, 'grey']] } },
        { key: 'polter', word: 'shade', x: 2260, range: 90, facing: -1, name: 'poltergeist' },
        { key: 'ghost', word: 'ghost', x: 1650, y: 500, range: 260, spec: { greets: ['Boo. Sorry, habit.', 'Mind the gap upstairs.', 'It has been ever so quiet.'] } },
        { key: 'cat', word: 'cat', x: 600, range: 200, spec: { noun: 'towncat', tags: ['creature', 'animal'], hunts: ['mouse'], fears: ['dog', 'wet', 'fire'] } },
      ],
    },
    {
      id: 'hollow', name: 'Glowroot Hollow', theme: 'hollow', par: 3, zoom: 1,
      caption: 'Deep in the Glowroot, the old trees keep their lamps lit all night.',
      story: 'The river took the bridge years ago, a gremlin with a taste for shiny things has moved into a crashed probe, and the beacon stands in a ring of stones at the top of the bluff. A skyvine used to reach it, but nobody has watered the thing in ages.',
      hints: ['The river wants something long, something that floats, or something that flies.', 'Gremlins gobble anything shiny, sweet or junky, and they hate cats, noise and bright light.', 'The skyvine grows when it gets wet. A cloud, a bucket, a hose…',
        'There are other ways up a bluff: things that bounce, things with rungs, things with wings.', 'Click a creature and write a describing word to change it: sleepy, tiny, friendly…'],
      W: 2900, sky: -100, deathY: 1000, start: { x: 320, y: 520 }, depot: { x: 170, y: 520 }, goal: { x: 2500, y: 300 }, plateau: { x: 1900, y: 300 },
      terrain: [{ x0: -300, y0: 520, x1: 780, y1: 1100, kind: 'turf' }, { x0: 778, y0: 640, x1: 1062, y1: 1100, kind: 'pit', trench: 520 }, { x0: 1060, y0: 520, x1: 1902, y1: 1100, kind: 'turf' }, { x0: 1900, y0: 300, x1: 3200, y1: 1100, kind: 'turf', face: 520 }],
      water: [{ x0: 780, x1: 1060, y: 566, msg: 'Splash! The glow-river washed you back to the ship.' }],
      natives: [
        { key: 'gremlin', word: 'gremlin', x: 1420, range: 150, facing: -1 },
        { key: 'vine', x: 1862, y: 520, fixed: true, resists: SIZE,
          spec: { noun: 'skyvine', name: 'skyvine', w: 46, h: 70, climbable: true, anchored: true, upright: true, material: 'plant', flammable: true, tags: ['plant', 'vine'], hp: 8, grow: { to: 262, thirsty: true }, custom: 'vine', art: [] } },
        { key: 'keeper', word: 'gardener', x: 610, range: 130, spec: { noun: 'keeper', name: 'mushroom keeper', dmg: 0, hunts: [], greets: ['Evening, traveller!', 'Bridge washed out again.', 'Mind the gremlin. It bites spoons.'], art: { a: 'person', top: 'sage', legs: 'brown', hat: 'straw', hair: 'grey', beard: 'grey' } } },
        { key: 'brewer', word: 'doctor', x: 1640, range: 110, spec: { noun: 'brewer', name: 'potion brewer', heals: false, greets: ['Potions! Mostly harmless.', 'The vine? Bone dry.', 'Lovely night.'], art: { a: 'person', top: 'purple', legs: 'navy', hat: 'wizard', hatColor: 'purple', hair: 'orange', robe: 1 } } },
        { key: 'stargazer', word: 'doctor', x: 2170, y: 300, range: 100, spec: { noun: 'stargazer', name: 'stargazer', heals: false, greets: ['You made it up!', 'The beacon is just there.', 'Shh. Counting stars.'], art: { a: 'person', top: 'navy', legs: 'dgrey', hat: 'goggles', hair: 'white', beard: 'white', robe: 1 } } },
        { key: 'frog', word: 'frog', x: 720, range: 60 },
        { key: 'rabbit', word: 'rabbit', x: 1260, range: 140 },
        { key: 'fairy', word: 'fairy', x: 2380, y: 240, range: 160, spec: { follows: false } },
      ],
      signs: [],
    },
    {
      id: 'gorge', hidden: true, name: 'Glowroot Gorge', theme: 'forest', par: 3,
      caption: 'The Tin Comet came down hard in the glowing woods…',
      story: 'The bridge over the glow-river fell in long ago, a gremlin with a taste for shiny things lives on the far bank, and a wall of frostglass blocks the old road to the beacon.',
      hints: ['The gorge wants something long, something bouncy, or something that flies.', 'Gremlins gobble anything shiny, sweet or junky, and they hate cats, noise and bright light.', 'Frostglass melts near heat and cracks under loud noise or a good smash.',
        'Click a creature, then write a describing word to change it: sleepy, tiny, friendly…', 'Some words solve two problems at once.'],
      W: 2640, sky: -300, deathY: 1000, start: { x: 300, y: 520 }, depot: { x: 130, y: 520 }, goal: { x: 2330, y: 520 },
      terrain: [{ x0: -300, y0: 520, x1: 700, y1: 1100, kind: 'moss' }, { x0: 698, y0: 694, x1: 1042, y1: 1100, kind: 'pit', trench: 520 }, { x0: 1040, y0: 520, x1: 2940, y1: 1100, kind: 'moss' }],
      water: [{ x0: 700, x1: 1040, y: 652, glow: true, msg: 'Splash! The glow-river washed you back to the ship.' }],
      natives: [
        { key: 'gremlin', word: 'gremlin', x: 1430, range: 150, facing: -1 },
        { key: 'wall', x: 1960, y: 520, fixed: true, resists: SIZE, goneMsg: 'The frostglass is gone. The way is clear!',
          spec: { noun: 'frostglass', name: 'frostglass wall', w: 120, h: 960, solid: true, anchored: true, upright: true, material: 'ice', melts: true, shatters: true, tags: ['crystal'], hp: 8, mass: 5, art: frostglass() } },
      ],
      signs: [{ x: 520, text: 'BEACON  ➜' }],
    },
    {
      id: 'skyvine', hidden: true, name: 'The Thirsty Skyvine', theme: 'sky', par: 3,
      caption: 'High above the dust plains, the second beacon waits on a drifting island.',
      story: 'The skyvine used to reach the island, but it has not had a drink in years. Up top, a scrap golem stomps about, squashing visitors.',
      hints: ['The vine grows when it gets wet. Rain, a bucket, a hose…', 'There are other ways up: anything that flies will do.', 'The golem is a machine. Machines and water do not get along.', 'Golems munch junk and batteries, and a full golem is a calm golem.', 'Click the golem and write a describing word: tiny, sleepy, friendly…'],
      W: 1900, sky: -780, deathY: 1000, start: { x: 300, y: 520 }, depot: { x: 130, y: 520 }, goal: { x: 1720, y: -360 },
      terrain: [{ x0: -300, y0: 520, x1: 2200, y1: 1100, kind: 'dust' }, { x0: 820, y0: -360, x1: 2200, y1: -296, kind: 'island' }],
      natives: [
        { key: 'vine', x: 700, y: 520, fixed: true, resists: SIZE,
          spec: { noun: 'skyvine', name: 'skyvine', w: 46, h: 150, climbable: true, anchored: true, upright: true, material: 'plant', flammable: true, tags: ['plant', 'vine'], hp: 8, grow: { to: 900, thirsty: true }, custom: 'vine', art: [] } },
        { key: 'golem', word: 'golem', x: 1340, y: -360, range: 190, facing: -1 },
      ],
      signs: [{ x: 560, text: 'THIRSTY!' }],
    },
    {
      id: 'keep', hidden: true, name: 'The Lightless Keep', theme: 'keep', par: 3,
      caption: 'On the dark side of a dead moon stands a keep where nothing glows.',
      story: 'A snapjaw eel patrols the coolant canal, a humming force gate seals the keep, and something that hates the light drifts around the beacon hall.',
      hints: ['Things made of wood float. So do boats and rafts.', 'The eel bites anything at the waterline. It can be fed, tamed or put to sleep.', 'The force gate has a lock. It can also be smashed, blown up or skipped with a pair of portals.', 'The shade flees from anything that gives off light.', 'Sunlight is very bad for the undead.'],
      W: 2400, sky: -300, deathY: 1000, start: { x: 300, y: 520 }, depot: { x: 130, y: 520 }, goal: { x: 2210, y: 520 },
      terrain: [{ x0: -300, y0: 520, x1: 760, y1: 1100, kind: 'moon' }, { x0: 758, y0: 640, x1: 1062, y1: 1100, kind: 'pit', trench: 520 }, { x0: 1060, y0: 520, x1: 2700, y1: 1100, kind: 'keep' }],
      water: [{ x0: 760, x1: 1060, y: 560, msg: 'Splash! The coolant spat you back out at the ship.' }],
      natives: [
        { key: 'eel', word: 'eel', x: 910, y: 600, range: 110 },
        { key: 'gate', x: 1330, y: 520, fixed: true, resists: SIZE, goneMsg: 'The force gate flickers out.',
          spec: { noun: 'forcegate', name: 'force gate', w: 70, h: 960, solid: true, anchored: true, upright: true, material: 'metal', locked: true, tags: ['gate'], hp: 14, mass: 5, art: forcegate() } },
        { key: 'shade', word: 'shade', x: 1900, range: 200, facing: -1 },
      ],
      signs: [{ x: 600, text: 'KEEP OUT' }],
    },
    {
      id: 'port', hidden: true, name: 'Port Nebula', theme: 'port', par: 3,
      caption: 'The last beacon sits on the deck of a sky-pirate galleon, moored in a quicksilver sea.',
      story: 'A star shark circles the harbour, the galleon rides high above the waterline, and Captain Cogbeard does not like stowaways. He does like treasure.',
      hints: ['Sail it, float a couple of bridges end to end, or fly it.', 'The star shark will take a snack over a wizard any day.', 'There is a cargo net on the side of the hull.', 'The captain can be bribed with anything valuable, and pirates are a superstitious lot.', 'Click the captain or the shark and write a describing word.'],
      W: 2600, sky: -400, deathY: 1000, start: { x: 300, y: 520 }, depot: { x: 130, y: 520 }, goal: { x: 2260, y: 380 },
      terrain: [{ x0: -300, y0: 520, x1: 620, y1: 1100, kind: 'dock' }, { x0: 618, y0: 664, x1: 1502, y1: 1100, kind: 'pit' }, { x0: 1500, y0: 380, x1: 2900, y1: 1100, kind: 'hull' }],
      water: [{ x0: 620, x1: 1500, y: 548, silver: true, msg: 'Splash! The quicksilver tide rolled you back to the dock.' }],
      natives: [
        { key: 'shark', word: 'shark', x: 800, y: 590, range: 150, name: 'star shark' },
        { key: 'net', x: 1452, y: 548, fixed: true, resists: 'all',
          spec: { noun: 'cargonet', name: 'cargo net', w: 90, h: 188, climbable: true, anchored: true, upright: true, material: 'cloth', tags: [], hp: Infinity, art: cargonet() } },
        { key: 'captain', word: 'pirate', x: 1900, y: 380, range: 190, facing: -1, name: 'Captain Cogbeard',
          spec: { noun: 'cogbeard', hunts: ['human'], fears: ['ghost', 'eldritch'], hp: 8, dmg: 1, bribable: true, speed: 2.2, sound: 'arr', art: { a: 'person', skin: 'grey', top: 'red', legs: 'dgrey', hat: 'tricorn', face: 'robot', beard: 'dgrey', prop: 'sword' } } },
      ],
      signs: [{ x: 500, text: 'NO SWIMMING' }],
    },
  ];
})(typeof window !== 'undefined' ? window.NN : globalThis.NN);
