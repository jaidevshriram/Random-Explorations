/* Test fixtures: three early worlds that are no longer part of the game.
 *
 * Their puzzles were folded into the four shipped worlds, but the scenarios
 * written against them still exercise rules nothing else does (frostglass that
 * melts and shatters, a golem that shorts out when wet, an eel, a force gate).
 * test/playtest.js loads this file after the page and appends these to
 * NN.levels. They use the older, plainer renderer path in main.js.
 */
(function (NN) {
  'use strict';
  const rng = (seed) => { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };
  const SIZE = NN.levelArt.SIZE;
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
  NN.levels.push(
    {
      id: 'gorge', name: 'Glowroot Gorge', theme: 'forest', par: 3,
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
      id: 'skyvine', name: 'The Thirsty Skyvine', theme: 'sky', par: 3,
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
      id: 'keep', name: 'The Lightless Keep', theme: 'keep', par: 3,
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
  );
  for (const l of NN.levels.slice(-3)) l.hidden = true;
})(window.NN);
