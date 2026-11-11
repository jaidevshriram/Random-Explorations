/* Nounsense dictionary: the hand-authored "spreadsheet".
 *
 * Every word the game knows is written out here by hand, the way the 2009-era
 * word games did it: a category tree gives inherited defaults, each noun
 * overrides what it needs, and the exceptions pile up per object.
 *
 * Art is a list of drawing ops in a box that runs -100..100 on both axes
 * (scaled to the object's w/h). See art.js for the op format.
 */
(function (NN) {
  'use strict';

  // ---- category tree (inherited defaults) ---------------------------------
  const categories = {
    thing: { w: 40, h: 40, mass: 1, material: 'wood', hp: 3, carry: true, tags: [] },

    // living things
    creature: { is: 'thing', alive: true, carry: false, upright: true, material: 'flesh', speed: 1.6, hp: 3, dmg: 0,
      diet: [], fears: ['fire'], hunts: [], tags: ['creature'] },
    animal: { is: 'creature', tags: ['animal'] },
    herbivore: { is: 'animal', diet: ['plant', 'grain'], fears: ['fire', 'scary', 'loud', 'stinger'], tags: ['prey'] },
    predator: { is: 'animal', diet: ['meat'], hunts: ['prey', 'human'], fears: ['fire', 'monster'], dmg: 1, speed: 3.2, hp: 4,
      tags: ['predator', 'scary'] },
    bird: { is: 'animal', w: 30, h: 26, flies: true, hp: 2, speed: 2.6, diet: ['grain', 'bug'],
      fears: ['fire', 'predator', 'cat', 'loud', 'scarecrow'], tags: ['bird', 'prey'] },
    bug: { is: 'creature', w: 20, h: 16, flies: true, hp: 1, speed: 2.4, diet: ['sweet', 'flower'], fears: ['fire', 'bird', 'wet'], tags: ['bug'] },
    monster: { is: 'creature', hp: 6, dmg: 1, speed: 2, hunts: ['human', 'prey'], fears: [], tags: ['monster', 'scary'] },
    human: { is: 'creature', w: 28, h: 54, speed: 1.5, diet: ['meal', 'sweet'], fears: ['monster', 'predator', 'fire'], tags: ['human'] },

    // lifeless things
    food: { is: 'thing', w: 24, h: 22, material: 'food', hp: 1, edible: true },
    tool: { is: 'thing', w: 20, h: 30, material: 'metal' },
    weapon: { is: 'tool', use: 'swing', weapon: { dmg: 2 }, tags: ['weapon'] },
    structure: { is: 'thing', solid: true, carry: false, upright: true, mass: 3, hp: 4 },
    vehicle: { is: 'thing', carry: false, upright: true, rideable: true, material: 'metal', mass: 4, hp: 12, speed: 4, jump: 0 },
    gear: { is: 'thing', w: 28, h: 30, material: 'cloth', grants: {} },
    nature: { is: 'thing', carry: false, upright: true, material: 'stone' },
  };

  // ---- nouns ---------------------------------------------------------------
  const N = {};

  // herbivores (art: quadruped rig)
  N.goat = { is: 'herbivore', w: 56, h: 46, speed: 2.5, diet: ['paper', 'plant', 'grain', 'junk', 'cloth', 'sweet', 'meal'],
    tags: ['goat', 'livestock'], sound: 'baa', art: { a: 'quad', c: 'white', horns: 'goat', beard: 1, ears: 'flop', tail: 'short' } };
  N.sheep = { is: 'herbivore', w: 54, h: 42, speed: 1.8, tags: ['livestock'], sound: 'baa', art: { a: 'quad', c: 'cream', wool: 1, head: 'dgrey', ears: 'flop', tail: 'none' } };
  N.cow = { is: 'herbivore', w: 76, h: 54, speed: 1.6, hp: 5, tags: ['livestock'], sound: 'moo', art: { a: 'quad', c: 'white', spots: 'dgrey', horns: 'bull', tail: 'long', ears: 'flop' } };
  N.pig = { is: 'herbivore', w: 54, h: 38, speed: 1.9, diet: ['plant', 'grain', 'junk', 'meal', 'sweet'], tags: ['livestock'], sound: 'oink', art: { a: 'quad', c: 'pink', snout: 'pig', tail: 'curl', ears: 'point', legs: 'short' } };
  N.horse = { is: 'herbivore', w: 84, h: 70, speed: 4.4, hp: 5, rideable: true, jump: 1.25, art: { a: 'quad', c: 'brown', mane: 'dbrown', tail: 'bushy', ears: 'point', neck: 1 } };
  N.donkey = { is: 'herbivore', w: 70, h: 58, speed: 2.6, rideable: true, jump: 1, tags: ['livestock'], art: { a: 'quad', c: 'grey', mane: 'dgrey', tail: 'long', ears: 'long', neck: 1 } };
  N.deer = { is: 'herbivore', w: 66, h: 62, speed: 3.6, art: { a: 'quad', c: 'tan', horns: 'antler', tail: 'short', ears: 'point', neck: 1 } };
  N.rabbit = { is: 'herbivore', w: 30, h: 28, speed: 3, hp: 1, tags: ['small'], art: { a: 'quad', c: 'white', ears: 'long', tail: 'puff', legs: 'short' } };
  N.mouse = { is: 'herbivore', w: 24, h: 16, speed: 2.8, hp: 1, diet: ['cheese', 'grain'], fears: ['cat', 'predator', 'fire', 'bird'],
    tags: ['mouse', 'small'], art: { a: 'quad', c: 'grey', ears: 'round', tail: 'long', legs: 'short' } };
  N.elephant = { is: 'herbivore', w: 130, h: 104, speed: 1.7, hp: 12, mass: 8, rideable: true, jump: 0, fears: ['mouse', 'fire'],
    art: { a: 'quad', c: 'grey', trunk: 1, ears: 'big', tail: 'short', legs: 'thick' } };
  N.camel = { is: 'herbivore', w: 90, h: 80, speed: 2.4, hp: 5, rideable: true, jump: 0.8, art: { a: 'quad', c: 'tan', hump: 1, neck: 1, tail: 'short', ears: 'round' } };
  N.llama = { is: 'herbivore', w: 56, h: 68, speed: 2.2, tags: ['livestock'], art: { a: 'quad', c: 'cream', wool: 1, neck: 1, ears: 'point', tail: 'puff' } };
  N.unicorn = { is: 'herbivore', w: 84, h: 70, speed: 4.2, hp: 6, rideable: true, jump: 1.6, fears: [], tags: ['magic'], art: { a: 'quad', c: 'white', mane: 'pink', tail: 'bushy', ears: 'point', neck: 1, horn: 1 } };
  N.pegasus = { is: 'herbivore', w: 90, h: 72, speed: 3.6, hp: 6, rideable: true, flies: true, fears: [], tags: ['magic'], art: { a: 'quad', c: 'white', mane: 'sky', tail: 'bushy', ears: 'point', neck: 1, wings: 'white' } };
  N.kangaroo = { is: 'herbivore', w: 58, h: 74, speed: 3.7, hp: 4, rideable: true, jump: 1.9, hops: true,
    art: [['p', [-30, 45, -100, 95, -35, 70], 'tan'], ['e', -8, 12, 42, 52, 'tan', -18], ['p', [-5, 55, 45, 62, 60, 100, 5, 100], 'tan'],
      ['e', 42, -62, 26, 17, 'tan'], ['p', [26, -76, 30, -100, 44, -78], 'tan'], ['l', [22, -8, 52, 8], 3], ['d', 50, -66, 2], ['a', 12, 22, 20, 20, 160]] };
  N.turtle = { is: 'herbivore', w: 46, h: 28, speed: 0.5, hp: 8, fears: [],
    art: [['r', -62, 40, 20, 55, 'green'], ['r', 22, 40, 20, 55, 'green'], ['e', 80, 18, 22, 30, 'green'], ['e', -6, -8, 76, 78, 'dgreen'], ['l', [-50, -10, -15, -60, 30, -55, 55, -5]], ['d', 86, 8, 1.8]] };

  // predators
  N.wolf = { is: 'predator', w: 66, h: 46, speed: 3.5, tags: ['canine'], sound: 'grr', art: { a: 'quad', c: 'dgrey', ears: 'point', tail: 'bushy', snout: 'long', fangs: 1 } };
  N.lion = { is: 'predator', w: 78, h: 54, speed: 3.6, hp: 6, dmg: 2, sound: 'roar', art: { a: 'quad', c: 'yellow', ruff: 'brown', tail: 'tuft', ears: 'round', fangs: 1 } };
  N.tiger = { is: 'predator', w: 78, h: 50, speed: 3.8, hp: 6, dmg: 2, sound: 'roar', art: { a: 'quad', c: 'orange', stripes: 1, tail: 'long', ears: 'round', fangs: 1 } };
  N.bear = { is: 'predator', w: 82, h: 64, speed: 2.7, hp: 8, dmg: 2, diet: ['sweet', 'fish', 'meat'], sound: 'grr', art: { a: 'quad', c: 'brown', ears: 'round', tail: 'none', legs: 'thick', snout: 'short' } };
  N.fox = { is: 'predator', w: 52, h: 36, speed: 3.4, hp: 2, hunts: ['small', 'bird'], art: { a: 'quad', c: 'orange', ears: 'point', tail: 'bushy', snout: 'long' } };
  N.cat = { is: 'predator', w: 40, h: 34, speed: 3, hp: 2, hunts: ['mouse', 'bird'], diet: ['fish', 'meat'], fears: ['dog', 'wet', 'fire', 'monster'],
    tags: ['cat'], sound: 'meow', art: { a: 'quad', c: 'dgrey', ears: 'point', tail: 'long', snout: 'none' } };
  // exception: a dog is a predator to a goat, a friend to the courier
  N.dog = { is: 'predator', w: 50, h: 40, speed: 3.3, hp: 3, dmg: 1, hunts: ['cat'], diet: ['bone', 'meat', 'ball'], fears: ['fire', 'monster'], follows: true,
    tags: ['dog', 'canine'], sound: 'woof', art: { a: 'quad', c: 'tan', ears: 'flop', tail: 'curl', snout: 'short', patch: 'brown' } };
  N.crocodile = { is: 'predator', w: 110, h: 36, speed: 2.2, hp: 7, dmg: 2,
    art: [['r', -50, 35, 13, 62, 'dgreen'], ['r', 12, 35, 13, 62, 'dgreen'], ['p', [-100, 20, -60, -40, 30, -50, 100, -22, 100, 18, 40, 42, -60, 50], 'dgreen'],
      ['l', [-55, -42, -45, -68, -35, -45, -25, -70, -15, -47, -5, -72, 5, -50]], ['l', [45, 18, 53, 36, 61, 18, 69, 36, 77, 18, 85, 36, 93, 18]], ['d', 40, -32, 2.2]] };
  N.snake = { is: 'predator', w: 56, h: 18, speed: 2.2, hp: 2, hunts: ['mouse', 'small', 'human'], tags: ['snake'],
    art: [['l', [-100, 60, -62, -30, -24, 60, 14, -30, 52, 50], 7, 'green'], ['e', 76, 22, 24, 62, 'green'], ['d', 82, 5, 1.6], ['l', [98, 30, 110, 20], 1.5]] };
  // exception: a shark out of water just flops
  N.shark = { is: 'predator', w: 110, h: 52, speed: 0, hp: 6, hunts: [], flops: true,
    art: [['p', [-70, 0, -100, -72, -84, 0, -100, 72], 'grey'], ['p', [-80, 0, -55, -48, 20, -58, 100, -8, 30, 52, -55, 40], 'grey'], ['p', [-12, -55, 8, -100, 30, -52], 'grey'],
      ['l', [58, 16, 96, 6]], ['l', [10, -10, 14, 22]], ['l', [22, -10, 26, 22]], ['d', 68, -18, 2.4]] };
  N.spider = { is: 'predator', w: 34, h: 24, speed: 2.4, hp: 1, hunts: ['bug'], diet: [], tags: ['spider'],
    art: [['l', [-25, -10, -65, -75, -100, 60]], ['l', [-25, 10, -60, -30, -80, 90]], ['l', [25, -10, 65, -75, 100, 60]], ['l', [25, 10, 60, -30, 80, 90]],
      ['l', [-10, -20, -40, -95, -70, -20]], ['l', [10, -20, 40, -95, 70, -20]], ['e', 0, 5, 46, 62, 'dgrey'], ['d', -12, -8, 1.5, 'white'], ['d', 12, -8, 1.5, 'white']] };

  // birds
  N.bird = { is: 'bird', art: { a: 'bird', c: 'sky', wing: 'blue' } };
  N.eagle = { is: 'bird', w: 54, h: 40, speed: 3.6, hp: 4, dmg: 1, diet: ['meat', 'fish'], hunts: ['small', 'snake', 'mouse'], fears: ['fire'], tags: ['predator', 'scary'],
    art: { a: 'bird', c: 'brown', wing: 'dbrown', head: 'white', beak: 'yellow', big: 1 } };
  N.chicken = { is: 'bird', w: 32, h: 32, flies: false, speed: 1.8, tags: ['livestock'], art: { a: 'bird', c: 'white', wing: 'cream', crest: 'red', beak: 'orange' } };
  N.duck = { is: 'bird', w: 34, h: 30, speed: 2, diet: ['grain', 'meal'], sound: 'quack', art: { a: 'bird', c: 'white', wing: 'cream', beak: 'orange', flat: 1 } };
  N.owl = { is: 'bird', w: 32, h: 36, hunts: ['mouse'], dmg: 1, art: { a: 'bird', c: 'brown', wing: 'dbrown', beak: 'yellow', owl: 1 } };
  N.parrot = { is: 'bird', art: { a: 'bird', c: 'red', wing: 'green', beak: 'yellow', crest: 'yellow' } };
  N.crow = { is: 'bird', diet: ['grain', 'junk', 'meat'], art: { a: 'bird', c: 'dgrey', wing: 'ink', beak: 'dgrey' } };
  N.pigeon = { is: 'bird', diet: ['grain', 'meal'], art: { a: 'bird', c: 'grey', wing: 'dgrey', beak: 'tan' } };
  N.penguin = { is: 'bird', w: 32, h: 46, flies: false, speed: 1.2, diet: ['fish'], fears: ['predator', 'fire'],
    art: [['e', -26, 94, 30, 8, 'orange'], ['e', 30, 94, 30, 8, 'orange'], ['e', 0, 5, 84, 92, 'navy'], ['e', 8, 22, 52, 68, 'white'], ['p', [42, -56, 84, -46, 42, -36], 'orange'], ['d', 24, -60, 2, 'white']] };
  N.bat = { is: 'bird', w: 44, h: 26, diet: ['bug'], fears: ['light', 'fire'], tags: ['bat'],
    art: [['p', [0, -30, -30, -72, -100, -50, -70, 0, -82, 62, -40, 22, 0, 62, 40, 22, 82, 62, 70, 0, 100, -50, 30, -72], 'purple'], ['p', [-16, -40, -12, -78, -2, -44], 'purple'], ['p', [16, -40, 12, -78, 2, -44], 'purple'],
      ['d', -8, -14, 1.5, 'white'], ['d', 8, -14, 1.5, 'white']] };

  // bugs
  N.bee = { is: 'bug', w: 24, h: 20, tags: ['stinger'], sound: 'bzz',
    art: [['e', -12, -72, 42, 40, 'white'], ['e', 0, 5, 82, 72, 'yellow'], ['l', [-22, -62, -22, 72], 3], ['l', [20, -62, 20, 72], 3], ['d', 56, -6, 1.7], ['l', [-82, 8, -100, 8], 1.5]] };
  N.butterfly = { is: 'bug', w: 30, h: 26, speed: 1.6,
    art: [['e', -46, -35, 50, 56, 'pink'], ['e', 46, -35, 50, 56, 'pink'], ['e', -36, 46, 36, 40, 'purple'], ['e', 36, 46, 36, 40, 'purple'], ['l', [0, -62, 0, 72], 3], ['l', [0, -62, -16, -100]], ['l', [0, -62, 16, -100]]] };
  N.fly = { is: 'bug', w: 16, h: 12, speed: 3, diet: ['junk', 'meat', 'sweet'],
    art: [['e', -20, -60, 50, 40, 'white'], ['e', 30, -60, 50, 40, 'white'], ['e', 0, 20, 70, 62, 'dgrey']] };

  // monsters
  N.dragon = { is: 'monster', w: 124, h: 88, flies: true, speed: 3, hp: 12, dmg: 1, range: 70, breath: 'fire', fireproof: true, mass: 5,
    hunts: ['human', 'prey', 'livestock'], sound: 'roar',
    art: [['p', [-58, 25, -100, -12, -92, 6, -100, 24, -55, 52], 'green'], ['r', -42, 55, 15, 45, 'green'], ['r', 12, 55, 15, 45, 'green'], ['e', -10, 25, 56, 46, 'green'], ['e', -5, 42, 36, 24, 'yellow'],
      ['p', [22, 12, 52, -56, 76, -44, 50, 34], 'green'], ['p', [-26, 2, -70, -100, -6, -62, 32, -96, 16, -4], 'red'], ['e', 72, -62, 27, 22, 'green'], ['p', [86, -72, 104, -58, 86, -46], 'green'],
      ['l', [60, -80, 50, -100]], ['l', [72, -84, 66, -100]], ['d', 72, -68, 2.4]] };
  N.zombie = { is: 'monster', w: 28, h: 54, speed: 0.9, hp: 4, tags: ['undead'], hunts: ['human'], sound: 'urrgh', art: { a: 'person', skin: 'lime', top: 'dgrey', legs: 'brown', arms: 'reach', face: 'dead' } };
  N.vampire = { is: 'monster', w: 28, h: 54, speed: 2.2, hp: 5, tags: ['undead'], hunts: ['human'], fears: ['garlic', 'light'], art: { a: 'person', skin: 'white', top: 'ink', legs: 'ink', cape: 'red', hair: 'ink', face: 'fangs' } };
  // exception: a ghost is a monster that never hurts anyone, it only spooks
  N.ghost = { is: 'monster', w: 40, h: 52, flies: true, speed: 1.8, hp: 99, dmg: 0, hunts: [], fears: ['light'], tags: ['ghost'], sound: 'boo',
    art: [['p', [-100, 100, -100, -30, -60, -90, 0, -100, 60, -90, 100, -30, 100, 100, 60, 70, 20, 100, -20, 70, -60, 100], 'white'], ['e', -35, -30, 14, 20, 'ink'], ['e', 35, -30, 14, 20, 'ink'], ['e', 0, 22, 16, 18, 'ink']] };
  // exception: trolls eat goats first (the bridge story demands it)
  N.troll = { is: 'monster', w: 52, h: 84, speed: 1.6, hp: 10, dmg: 2, hunts: ['goat', 'human'], sound: 'grr', art: { a: 'person', skin: 'green', top: 'brown', legs: 'dbrown', face: 'grr', club: 1, big: 1 } };
  N.werewolf = { is: 'monster', w: 34, h: 60, speed: 3.4, hp: 6, dmg: 2, tags: ['canine'], art: { a: 'person', skin: 'dgrey', top: 'dgrey', legs: 'navy', hat: 'wolfears', face: 'fangs' } };
  N.skeleton = { is: 'monster', w: 28, h: 54, speed: 1.8, hp: 3, tags: ['undead'], diet: [], art: { a: 'person', skin: 'white', top: 'white', legs: 'white', face: 'skull', bones: 1 } };
  N.yeti = { is: 'monster', w: 56, h: 88, speed: 2, hp: 10, dmg: 2, fears: ['fire'], art: { a: 'person', skin: 'sky', top: 'white', legs: 'white', face: 'grr', big: 1, furry: 1 } };
  N.slime = { is: 'monster', w: 46, h: 34, speed: 1.1, hp: 3, hops: true, diet: ['junk', 'food'],
    art: [['p', [-100, 100, -92, 5, -52, -70, 0, -100, 52, -70, 92, 5, 100, 100], 'lime'], ['d', -28, -10, 2.6], ['d', 28, -10, 2.6], ['l', [-25, 35, 0, 50, 25, 35]], ['e', -50, -42, 12, 14, 'white']] };
  N.alien = { is: 'monster', w: 28, h: 52, speed: 1.8, hp: 4, dmg: 0, hunts: [], fears: ['fire'], tags: ['alien'], art: { a: 'person', skin: 'lime', top: 'grey', legs: 'grey', face: 'alien', hat: 'antenna' } };
  N.cthulhu = { is: 'monster', w: 130, h: 150, speed: 1, hp: 60, dmg: 3, mass: 9, fireproof: true, tags: ['eldritch'], hunts: ['human', 'prey', 'predator'],
    art: [['p', [-48, -30, -100, -92, -72, -30], 'dgreen'], ['p', [48, -30, 100, -92, 72, -30], 'dgreen'], ['p', [-58, 10, 58, 10, 82, 100, -82, 100], 'teal'], ['e', 0, -42, 70, 52, 'teal'],
      ['l', [-42, -6, -58, 34, -38, 62], 6, 'teal'], ['l', [-20, 0, -26, 42, -8, 74], 6, 'teal'], ['l', [0, 2, 4, 44, -2, 80], 6, 'teal'], ['l', [20, 0, 28, 42, 12, 72], 6, 'teal'], ['l', [42, -6, 58, 34, 40, 64], 6, 'teal'],
      ['e', -28, -48, 13, 9, 'yellow'], ['e', 28, -48, 13, 9, 'yellow'], ['d', -28, -48, 1.8], ['d', 28, -48, 1.8]] };
  N.robot = { is: 'creature', w: 32, h: 56, material: 'metal', speed: 1.6, hp: 8, fears: ['wet'], follows: true, tags: ['robot'], sound: 'beep', art: { a: 'person', skin: 'grey', top: 'grey', legs: 'dgrey', face: 'robot', hat: 'antenna', boxy: 1 } };
  N.frog = { is: 'animal', w: 30, h: 22, speed: 1.6, hp: 1, hops: true, diet: ['bug'], tags: ['prey', 'small'], sound: 'ribbit',
    art: [['e', 0, 22, 96, 76, 'green'], ['e', -46, -55, 26, 36, 'green'], ['e', 46, -55, 26, 36, 'green'], ['d', -46, -60, 2], ['d', 46, -60, 2], ['l', [-50, 26, 0, 46, 50, 26]]] };

  // people
  // exception (straight from the old games): humans flee monsters, but a cop
  // stands their ground, and will always stop for a donut.
  N.cop = { is: 'human', hp: 5, dmg: 2, fears: [], hunts: ['thief', 'monster'], diet: ['donut', 'sweet'], art: { a: 'person', top: 'navy', legs: 'navy', hat: 'police' } };
  N.firefighter = { is: 'human', fears: ['monster', 'predator'], douses: true, fireproof: true, art: { a: 'person', top: 'yellow', legs: 'dgrey', hat: 'helmet', prop: 'hose' } };
  N.lumberjack = { is: 'human', hp: 5, dmg: 2, hunts: ['tree', 'bramble'], art: { a: 'person', top: 'red', legs: 'navy', hat: 'beanie', beard: 'brown', prop: 'axe' } };
  N.gardener = { is: 'human', dmg: 1, hunts: ['bramble', 'bush'], art: { a: 'person', top: 'green', legs: 'brown', hat: 'straw', prop: 'shears' } };
  N.knight = { is: 'human', hp: 8, dmg: 3, fears: [], hunts: ['monster'], material: 'metal', art: { a: 'person', top: 'grey', legs: 'grey', hat: 'knight', prop: 'sword' } };
  N.wizard = { is: 'human', hp: 4, dmg: 3, range: 150, fears: ['predator'], hunts: ['monster'], tags: ['magic'], art: { a: 'person', top: 'purple', legs: 'purple', hat: 'wizard', beard: 'white', robe: 1, prop: 'staff' } };
  N.chef = { is: 'human', art: { a: 'person', top: 'white', legs: 'dgrey', hat: 'chef' } };
  N.clown = { is: 'human', sound: 'honk', art: { a: 'person', top: 'yellow', legs: 'red', hat: 'clown', face: 'clown' } };
  N.shepherd = { is: 'human', charms: ['livestock'], art: { a: 'person', top: 'tan', legs: 'brown', hat: 'straw', prop: 'crook' } };
  N.pirate = { is: 'human', hp: 4, dmg: 1, diet: ['valuable'], eatVerb: 'pocketed', fears: ['monster'], art: { a: 'person', top: 'red', legs: 'dgrey', hat: 'tricorn', beard: 'ink', prop: 'sword' } };
  N.ninja = { is: 'human', speed: 3.4, hp: 4, dmg: 2, fears: [], hunts: ['monster', 'predator'], art: { a: 'person', skin: 'dgrey', top: 'dgrey', legs: 'dgrey', face: 'ninja' } };
  N.baby = { is: 'human', w: 22, h: 30, speed: 0.6, hp: 2, loud: true, fears: [], diet: ['sweet'], sound: 'waah', art: { a: 'person', top: 'sky', legs: 'sky', face: 'cry' } };
  N.doctor = { is: 'human', heals: true, art: { a: 'person', top: 'white', legs: 'teal', robe: 1, hat: 'mirror' } };
  N.bard = { is: 'human', lulls: true, art: { a: 'person', top: 'teal', legs: 'purple', hat: 'feather', prop: 'lute' } };
  N.thief = { is: 'human', speed: 3, diet: ['valuable'], eatVerb: 'stole', fears: ['monster', 'predator', 'cop'], tags: ['thief'], art: { a: 'person', top: 'ink', legs: 'dgrey', hat: 'beanie', face: 'mask', stripes: 1 } };

  // food (and other things a goat will eat)
  N.apple = { is: 'food', w: 22, h: 22, tags: ['plant'], art: [['e', 0, 12, 85, 82, 'red'], ['l', [0, -65, 8, -100]], ['e', 40, -80, 30, 14, 'green', -20]] };
  N.carrot = { is: 'food', w: 36, h: 14, tags: ['plant'], art: [['p', [40, -30, 100, -95, 100, -20], 'green'], ['p', [40, 30, 100, 95, 100, 20], 'green'], ['p', [-100, 0, 45, -85, 45, 85], 'orange'], ['l', [-20, -40, -10, -10]], ['l', [10, 10, 20, 45]]] };
  N.hay = { is: 'food', w: 46, h: 34, tags: ['grain', 'plant'], material: 'plant', art: [['r', -100, -100, 200, 200, 'yellow'], ['l', [-100, -34, 100, -34]], ['l', [-100, 36, 100, 36]], ['l', [-62, -100, -62, 100]], ['l', [58, -100, 58, 100]]] };
  N.grass = { is: 'food', w: 42, h: 22, tags: ['plant'], material: 'plant', art: [['p', [-100, 100, -80, -60, -55, 60, -30, -100, -5, 60, 25, -80, 50, 60, 80, -50, 100, 100], 'green']] };
  N.cabbage = { is: 'food', w: 28, h: 26, tags: ['plant'], art: [['e', 0, 0, 100, 100, 'green'], ['l', [-55, 25, 0, -42, 55, 25]], ['l', [0, -42, 0, 88]]] };
  N.corn = { is: 'food', w: 16, h: 36, tags: ['grain', 'plant'], art: [['e', 0, -8, 68, 92, 'yellow'], ['p', [-100, 100, -92, 0, -30, 100], 'green'], ['p', [100, 100, 92, 0, 30, 100], 'green'], ['l', [-40, -40, 40, -40]], ['l', [-48, 0, 48, 0]]] };
  N.cheese = { is: 'food', w: 30, h: 24, tags: ['cheese'], art: [['p', [-100, 90, 100, 90, 100, -70], 'yellow'], ['d', 40, 50, 2.6, 'orange'], ['d', 70, 10, 2, 'orange'], ['d', -15, 68, 2, 'orange']] };
  N.bread = { is: 'food', w: 36, h: 22, tags: ['grain', 'meal'], art: [['e', 0, 0, 100, 100, 'tan'], ['l', [-52, -42, -32, 30]], ['l', [-2, -52, 14, 30]], ['l', [44, -42, 60, 28]]] };
  N.cake = { is: 'food', w: 32, h: 30, tags: ['sweet'], art: [['r', -90, -10, 180, 110, 'pink'], ['r', -100, -42, 200, 46, 'white'], ['e', 0, -68, 22, 24, 'red']] };
  N.donut = { is: 'food', w: 26, h: 24, tags: ['sweet', 'donut'], art: [['e', 0, 0, 100, 100, 'pink'], ['e', 0, 0, 34, 34, 'paper'], ['l', [-60, -30, -48, -46]], ['l', [50, -40, 62, -22]], ['l', [-40, 60, -24, 52]], ['l', [38, 54, 54, 44]]] };
  N.honey = { is: 'food', w: 22, h: 28, tags: ['sweet'], art: [['r', -80, -60, 160, 160, 'orange'], ['r', -62, -100, 124, 42, 'brown'], ['e', 0, 22, 42, 36, 'yellow']] };
  N.steak = { is: 'food', w: 32, h: 24, tags: ['meat'], art: [['e', 0, 0, 100, 95, 'red'], ['e', 26, -8, 32, 28, 'pink'], ['e', -40, 12, 16, 22, 'white']] };
  N.bone = { is: 'food', w: 32, h: 14, tags: ['bone', 'meat'], art: [['r', -70, -30, 140, 60, 'white'], ['e', -78, -48, 26, 55, 'white'], ['e', -78, 48, 26, 55, 'white'], ['e', 78, -48, 26, 55, 'white'], ['e', 78, 48, 26, 55, 'white']] };
  N.fish = { is: 'food', w: 34, h: 20, tags: ['fish', 'meat'], art: [['p', [52, 0, 100, -90, 100, 90], 'blue'], ['e', -15, 0, 76, 90, 'blue'], ['d', -58, -22, 2], ['l', [-28, -50, -18, 0, -28, 50]]] };
  N.pizza = { is: 'food', w: 32, h: 30, tags: ['meal'], art: [['p', [-100, -78, 100, -78, 0, 100], 'yellow'], ['r', -100, -100, 200, 30, 'tan'], ['e', -26, -30, 18, 18, 'red'], ['e', 28, -22, 18, 18, 'red'], ['e', 0, 28, 16, 16, 'red']] };
  N.sandwich = { is: 'food', w: 34, h: 24, tags: ['meal'], art: [['p', [-100, 82, 100, 82, 0, -92], 'tan'], ['l', [-64, 30, 64, 30], 3, 'green'], ['l', [-74, 52, 74, 52], 2.5, 'red']] };
  N.can = { is: 'food', w: 20, h: 26, material: 'metal', tags: ['junk'], art: [['r', -85, -100, 170, 200, 'grey'], ['r', -85, -34, 170, 68, 'red'], ['l', [-85, -62, 85, -62]], ['l', [-85, 62, 85, 62]]] };
  N.garlic = { is: 'food', w: 22, h: 24, tags: ['garlic', 'plant'], art: [['e', 0, 22, 100, 78, 'white'], ['p', [-25, -40, 0, -100, 25, -40], 'white'], ['l', [0, -40, 0, 95]], ['l', [-45, -20, -56, 78]], ['l', [45, -20, 56, 78]]] };
  N.pie = { is: 'food', w: 34, h: 20, tags: ['sweet', 'meal'], art: [['p', [-100, 100, -82, -15, 82, -15, 100, 100], 'tan'], ['e', 0, -22, 84, 46, 'orange'], ['l', [-30, -30, -20, -55]], ['l', [10, -30, 20, -55]]] };
  N.banana = { is: 'food', w: 32, h: 16, tags: ['plant', 'sweet'], art: [['p', [-100, -60, -52, 40, 30, 70, 100, -5, 96, -70, 30, 5, -50, -18], 'yellow']] };
  N.cookie = { is: 'food', w: 22, h: 22, tags: ['sweet'], art: [['e', 0, 0, 100, 100, 'tan'], ['d', -30, -25, 2.2, 'dbrown'], ['d', 30, -10, 2.2, 'dbrown'], ['d', -10, 40, 2.2, 'dbrown'], ['d', 35, 45, 1.8, 'dbrown']] };
  N.egg = { is: 'food', w: 18, h: 22, tags: ['meal'], art: [['e', 0, 0, 100, 100, 'white'], ['l', [-40, -40, -20, -65]]] };
  N.mushroom = { is: 'food', w: 26, h: 26, tags: ['plant'], art: [['r', -30, -5, 60, 105, 'white'], ['e', 0, -30, 100, 70, 'red'], ['e', -42, -46, 18, 16, 'white'], ['e', 32, -58, 16, 14, 'white'], ['e', 10, -18, 14, 12, 'white']] };
  N.newspaper = { is: 'food', w: 32, h: 24, material: 'paper', tags: ['paper'], art: [['r', -100, -100, 200, 200, 'white'], ['l', [-75, -60, 75, -60], 3.5], ['l', [-75, -15, 75, -15]], ['l', [-75, 20, 75, 20]], ['l', [-75, 55, 30, 55]]] };
  N.book = { is: 'food', w: 28, h: 32, material: 'paper', tags: ['paper'], art: [['r', -100, -100, 200, 200, 'red'], ['r', -100, -100, 36, 200, 'dbrown'], ['l', [-20, -50, 70, -50]], ['l', [-20, -15, 70, -15]]] };
  N.letter = { is: 'food', w: 30, h: 20, material: 'paper', tags: ['paper'], art: [['r', -100, -100, 200, 200, 'white'], ['l', [-100, -100, 0, 12, 100, -100]], ['e', 62, 52, 16, 22, 'red']] };
  N.sock = { is: 'food', w: 20, h: 28, material: 'cloth', tags: ['cloth'], art: [['p', [-60, -100, 40, -100, 40, 30, 100, 60, 100, 100, -60, 100], 'white'], ['r', -60, -100, 100, 32, 'red']] };
  N.hat = { is: 'food', w: 32, h: 24, material: 'cloth', tags: ['cloth'], art: [['e', 0, 72, 100, 28, 'dgrey'], ['r', -55, -100, 110, 172, 'dgrey'], ['r', -55, 22, 110, 30, 'red']] };

  // weapons and tools (held in one hand, F to use)
  N.sword = { is: 'weapon', w: 14, h: 48, weapon: { dmg: 3, cuts: true }, art: [['p', [0, -100, 38, -80, 38, 40, -38, 40, -38, -80], 'grey'], ['r', -100, 40, 200, 16, 'yellow'], ['r', -26, 56, 52, 44, 'brown'], ['l', [0, -78, 0, 34]]] };
  N.axe = { is: 'weapon', w: 28, h: 46, weapon: { dmg: 3, cuts: true }, art: [['r', -14, -100, 28, 200, 'brown'], ['p', [14, -92, 100, -100, 100, -18, 14, -34], 'grey']] };
  N.chainsaw = { is: 'weapon', w: 50, h: 24, weapon: { dmg: 6, cuts: true }, loudUse: true, art: [['p', [-10, -30, 80, -30, 100, 6, 80, 46, -10, 46], 'grey'], ['r', -100, -62, 92, 150, 'orange'], ['l', [0, -30, 8, -46, 16, -30, 24, -46, 32, -30, 40, -46, 48, -30, 56, -46, 64, -30]], ['l', [-90, -62, -70, -98, -30, -98, -20, -62], 3]] };
  N.scissors = { is: 'weapon', w: 24, h: 36, weapon: { dmg: 1, cuts: true }, art: [['l', [-40, -100, 25, 22], 3.5, 'grey'], ['l', [40, -100, -25, 22], 3.5, 'grey'], ['e', -45, 62, 42, 36, 'red'], ['e', 45, 62, 42, 36, 'red'], ['e', -45, 62, 18, 15, 'paper'], ['e', 45, 62, 18, 15, 'paper']] };
  N.machete = { is: 'weapon', w: 14, h: 46, weapon: { dmg: 3, cuts: true }, art: [['p', [-40, -100, 55, -68, 55, 40, -40, 40], 'grey'], ['r', -36, 40, 72, 60, 'dbrown']] };
  N.knife = { is: 'weapon', w: 12, h: 32, weapon: { dmg: 2, cuts: true }, art: [['p', [-50, -100, 50, -58, 50, 20, -50, 20], 'grey'], ['r', -46, 20, 92, 80, 'dbrown']] };
  N.hammer = { is: 'weapon', w: 28, h: 44, weapon: { dmg: 3, smash: true }, art: [['r', -13, -70, 26, 170, 'brown'], ['r', -100, -100, 200, 46, 'dgrey']] };
  N.spear = { is: 'weapon', w: 12, h: 72, weapon: { dmg: 3 }, art: [['r', -16, -68, 32, 168, 'brown'], ['p', [0, -100, 62, -64, -62, -64], 'grey']] };
  N.club = { is: 'weapon', w: 18, h: 46, material: 'wood', weapon: { dmg: 2, smash: true }, art: [['p', [-60, -100, 60, -100, 100, -40, 30, 100, -30, 100, -100, -40], 'brown'], ['d', -20, -60, 1.6], ['d', 30, -30, 1.6]] };
  N.flamethrower = { is: 'tool', w: 50, h: 22, use: 'flame', art: [['r', -100, -40, 122, 80, 'dgrey'], ['r', 22, -20, 70, 40, 'grey'], ['r', -78, 40, 30, 60, 'dgrey'], ['p', [92, -42, 100, 0, 92, 42], 'orange']] };
  N.torch = { is: 'tool', w: 14, h: 42, material: 'wood', use: 'ignite', hot: true, light: true, flammable: false, art: [['r', -36, -30, 72, 130, 'brown'], ['p', [-72, -30, -42, -75, 0, -100, 52, -70, 72, -30], 'orange'], ['p', [-30, -30, 0, -70, 30, -30], 'yellow']] };
  N.match = { is: 'tool', w: 8, h: 24, material: 'wood', use: 'ignite', flammable: false, art: [['r', -50, -60, 100, 160, 'tan'], ['e', 0, -76, 100, 28, 'red']] };
  N.candle = { is: 'tool', w: 14, h: 32, use: 'ignite', hot: true, light: true, art: [['r', -70, -30, 140, 130, 'white'], ['p', [-42, -35, 0, -100, 42, -35], 'orange']] };
  N.bucket = { is: 'tool', w: 28, h: 28, use: 'douse', art: [['p', [-100, -70, 100, -70, 72, 100, -72, 100], 'grey'], ['e', 0, -70, 98, 22, 'blue']] };
  N.hose = { is: 'tool', w: 32, h: 26, use: 'douse', material: 'rubber', art: [['e', -20, 22, 80, 76, 'green'], ['e', -20, 22, 44, 42, 'paper'], ['l', [42, -12, 58, -58], 5, 'green'], ['p', [50, -62, 100, -84, 100, -40], 'grey']] };
  N.extinguisher = { is: 'tool', w: 20, h: 38, use: 'douse', art: [['r', -70, -55, 140, 155, 'red'], ['r', -32, -85, 64, 30, 'dgrey'], ['l', [30, -80, 100, -60], 3], ['l', [-30, -100, 40, -100], 3], ['r', -42, -10, 84, 42, 'white']] };
  N.net = { is: 'tool', w: 32, h: 48, material: 'cloth', use: 'net', art: [['l', [0, 100, 0, -10], 3], ['e', 0, -55, 95, 45, ''], ['l', [-70, -60, 0, -15, 70, -60]], ['l', [-40, -92, 0, -15, 40, -92]]] };
  N.whistle = { is: 'tool', w: 24, h: 18, use: 'loud', art: [['r', 0, -70, 100, 62, 'grey'], ['e', -30, 10, 66, 86, 'grey'], ['d', -30, 10, 2.6]] };
  N.drum = { is: 'tool', w: 32, h: 28, use: 'loud', material: 'wood', art: [['r', -100, -60, 200, 152, 'red'], ['e', 0, -60, 100, 30, 'cream'], ['l', [-100, -30, -60, 82, -20, -30, 20, 82, 60, -30, 100, 82]]] };
  N.trumpet = { is: 'tool', w: 40, h: 20, use: 'loud', art: [['p', [-100, -15, 40, -15, 100, -100, 100, 100, 40, 25, -100, 25], 'yellow'], ['r', -42, -72, 14, 56, 'yellow'], ['r', -16, -72, 14, 56, 'yellow'], ['r', 10, -72, 14, 56, 'yellow']] };
  N.flute = { is: 'tool', w: 42, h: 9, use: 'lull', art: [['r', -100, -70, 200, 140, 'grey'], ['d', -40, 0, 1.4], ['d', 0, 0, 1.4], ['d', 40, 0, 1.4]] };
  N.wand = { is: 'tool', w: 18, h: 38, material: 'wood', use: 'zap', tags: ['magic'], art: [['r', -14, -48, 28, 148, 'dbrown'], ['p', [0, -100, 30, -80, 100, -78, 45, -62, 62, -40, 0, -54, -62, -40, -45, -62, -100, -78, -30, -80], 'yellow']] };
  N.shield = { is: 'tool', w: 30, h: 36, grants: { armor: true }, art: [['p', [-100, -100, 100, -100, 100, 10, 0, 100, -100, 10], 'blue'], ['l', [0, -100, 0, 100]], ['l', [-100, -35, 100, -35]]] };
  N.flashlight = { is: 'tool', w: 32, h: 16, light: true, art: [['p', [30, -50, 100, -100, 100, 100, 30, 50], 'yellow'], ['r', -100, -50, 132, 100, 'dgrey']] };
  N.bomb = { is: 'tool', w: 28, h: 30, use: 'bomb', art: [['r', -20, -76, 40, 26, 'dgrey'], ['e', 0, 22, 95, 78, 'dgrey'], ['l', [0, -76, 20, -100, 50, -90]], ['e', 56, -90, 14, 12, 'orange'], ['e', -34, -6, 16, 14, 'grey']] };

  // structures
  N.bridge = { is: 'structure', w: 440, h: 20, upright: false, mass: 2, art: [['r', -100, -55, 200, 110, 'brown'], ['l', [-80, -55, -80, 55]], ['l', [-60, -55, -60, 55]], ['l', [-40, -55, -40, 55]], ['l', [-20, -55, -20, 55]], ['l', [0, -55, 0, 55]],
    ['l', [20, -55, 20, 55]], ['l', [40, -55, 40, 55]], ['l', [60, -55, 60, 55]], ['l', [80, -55, 80, 55]], ['r', -100, -100, 200, 40, 'dbrown']] };
  N.plank = { is: 'structure', w: 220, h: 13, upright: false, mass: 1, art: [['r', -100, -100, 200, 200, 'tan'], ['l', [-80, 0, -20, 20]], ['l', [10, -30, 70, -10]]] };
  N.log = { is: 'structure', w: 380, h: 38, upright: false, tags: ['tree'], art: [['r', -100, -100, 200, 200, 'brown'], ['e', -97, 0, 3.5, 92, 'tan'], ['e', 97, 0, 3.5, 92, 'tan'], ['l', [-70, -30, -30, -24]], ['l', [0, 20, 50, 26]], ['l', [-50, 46, -20, 50]], ['l', [40, -50, 75, -46]]] };
  N.ladder = { is: 'structure', w: 32, h: 200, solid: false, climbable: true, mass: 1, art: [['l', [-70, -100, -70, 100], 3.5, 'tan'], ['l', [70, -100, 70, 100], 3.5, 'tan'], ['l', [-70, -85, 70, -85], 2.5], ['l', [-70, -68, 70, -68], 2.5], ['l', [-70, -51, 70, -51], 2.5],
    ['l', [-70, -34, 70, -34], 2.5], ['l', [-70, -17, 70, -17], 2.5], ['l', [-70, 0, 70, 0], 2.5], ['l', [-70, 17, 70, 17], 2.5], ['l', [-70, 34, 70, 34], 2.5], ['l', [-70, 51, 70, 51], 2.5], ['l', [-70, 68, 70, 68], 2.5], ['l', [-70, 85, 70, 85], 2.5]] };
  N.crate = { is: 'structure', w: 58, h: 58, upright: false, art: [['r', -100, -100, 200, 200, 'tan'], ['r', -78, -78, 156, 156, ''], ['l', [-78, -78, 78, 78]], ['l', [78, -78, -78, 78]]] };
  N.barrel = { is: 'structure', w: 46, h: 58, upright: false, art: [['p', [-70, -100, 70, -100, 100, 0, 70, 100, -70, 100, -100, 0], 'brown'], ['l', [-90, -45, 90, -45], 2.5], ['l', [-90, 45, 90, 45], 2.5]] };
  N.rock = { is: 'structure', w: 92, h: 66, upright: false, material: 'stone', mass: 6, hp: 20, art: [['p', [-100, 100, -90, 10, -55, -70, 0, -100, 55, -80, 95, -10, 100, 100], 'grey'], ['l', [-30, -30, 0, -10, 20, -40]], ['l', [40, 30, 60, 10]]] };
  N.wall = { is: 'structure', w: 46, h: 170, material: 'stone', mass: 6, hp: 20, art: [['r', -100, -100, 200, 200, 'grey'], ['l', [-100, -67, 100, -67]], ['l', [-100, -33, 100, -33]], ['l', [-100, 0, 100, 0]], ['l', [-100, 33, 100, 33]], ['l', [-100, 67, 100, 67]],
    ['l', [0, -100, 0, -67]], ['l', [-50, -67, -50, -33]], ['l', [40, -67, 40, -33]], ['l', [0, -33, 0, 0]], ['l', [-50, 0, -50, 33]], ['l', [40, 0, 40, 33]], ['l', [0, 33, 0, 67]], ['l', [-50, 67, -50, 100]], ['l', [40, 67, 40, 100]]] };
  N.fence = { is: 'structure', w: 150, h: 66, art: [['l', [-100, -20, 100, -20], 3.5, 'tan'], ['l', [-100, 50, 100, 50], 3.5, 'tan'],
    ['p', [-97, 100, -97, -70, -85, -100, -73, -70, -73, 100], 'tan'], ['p', [-63, 100, -63, -70, -51, -100, -39, -70, -39, 100], 'tan'], ['p', [-29, 100, -29, -70, -17, -100, -5, -70, -5, 100], 'tan'],
    ['p', [5, 100, 5, -70, 17, -100, 29, -70, 29, 100], 'tan'], ['p', [39, 100, 39, -70, 51, -100, 63, -70, 63, 100], 'tan'], ['p', [73, 100, 73, -70, 85, -100, 97, -70, 97, 100], 'tan']] };
  N.cage = { is: 'structure', w: 84, h: 84, solid: false, material: 'metal', traps: true, hp: 20, art: [['r', -100, -100, 200, 20, 'dgrey'], ['r', -100, 80, 200, 20, 'dgrey'], ['l', [-90, -80, -90, 80], 3], ['l', [-54, -80, -54, 80], 3], ['l', [-18, -80, -18, 80], 3],
    ['l', [18, -80, 18, 80], 3], ['l', [54, -80, 54, 80], 3], ['l', [90, -80, 90, 80], 3]] };
  N.trampoline = { is: 'structure', w: 124, h: 30, material: 'rubber', bouncy: 14, art: [['l', [-80, -30, -92, 100], 3.5], ['l', [80, -30, 92, 100], 3.5], ['l', [-28, -10, -28, 100], 2.5], ['l', [28, -10, 28, 100], 2.5], ['e', 0, -50, 100, 46, 'blue'], ['e', 0, -52, 78, 28, 'navy']] };
  N.spring = { is: 'structure', w: 36, h: 40, material: 'metal', bouncy: 12, art: [['l', [-80, 86, 80, 58, -80, 30, 80, 2, -80, -26, 80, -54, -80, -78], 3.5, 'grey'], ['r', -100, -100, 200, 26, 'red'], ['r', -100, 84, 200, 16, 'dgrey']] };
  N.table = { is: 'structure', w: 84, h: 50, art: [['r', -86, -70, 16, 170, 'brown'], ['r', 70, -70, 16, 170, 'brown'], ['r', -100, -100, 200, 34, 'brown']] };
  N.chair = { is: 'structure', w: 38, h: 56, art: [['r', -82, -100, 26, 200, 'brown'], ['r', 56, 12, 26, 88, 'brown'], ['r', -82, -4, 164, 24, 'brown']] };
  N.pillar = { is: 'structure', w: 48, h: 220, material: 'stone', mass: 6, hp: 20, art: [['r', -75, -92, 150, 184, 'cream'], ['r', -100, -100, 200, 10, 'grey'], ['r', -100, 90, 200, 10, 'grey'], ['l', [-35, -88, -35, 88]], ['l', [0, -88, 0, 88]], ['l', [35, -88, 35, 88]]] };
  N.tree = { is: 'structure', w: 96, h: 220, solid: false, anchored: true, climbable: true, material: 'wood', tags: ['plant', 'tree'], hp: 6, art: [['r', -20, -12, 40, 112, 'brown'], ['l', [-6, 30, -4, 70]], ['e', -44, -36, 56, 32, 'green'], ['e', 46, -34, 54, 30, 'green'], ['e', 0, -62, 68, 36, 'green'], ['l', [-30, -60, -8, -72]], ['l', [28, -42, 50, -50]]] };
  N.bush = { is: 'structure', w: 72, h: 46, solid: false, anchored: true, material: 'plant', tags: ['plant', 'bush'], edible: true, hp: 3, art: [['e', -42, 22, 58, 76, 'green'], ['e', 42, 22, 58, 76, 'green'], ['e', 0, -18, 64, 80, 'green'], ['d', -30, 10, 2.4, 'red'], ['d', 22, -22, 2.4, 'red'], ['d', 50, 34, 2.4, 'red']] };
  N.flower = { is: 'structure', w: 22, h: 38, solid: false, anchored: true, material: 'plant', tags: ['plant', 'flower'], edible: true, hp: 1, art: [['l', [0, 100, 0, -20], 2.5, 'green'], ['e', 48, 46, 46, 13, 'green', -30], ['e', 0, -56, 96, 44, 'pink'], ['e', 0, -56, 36, 19, 'yellow']] };
  N.statue = { is: 'structure', w: 46, h: 94, material: 'stone', mass: 6, hp: 20, art: [['r', -100, 62, 200, 38, 'grey'], ['p', [-50, -46, 50, -46, 70, 62, -70, 62], 'grey'], ['e', 0, -72, 36, 22, 'grey'], ['l', [50, -40, 92, -70], 3]] };
  N.anvil = { is: 'structure', w: 54, h: 38, upright: false, material: 'metal', mass: 10, hp: 30, art: [['p', [-100, -100, 100, -100, 60, -40, 30, -40, 30, 40, 80, 100, -80, 100, -30, 40, -30, -40, -60, -40], 'dgrey']] };
  N.piano = { is: 'structure', w: 96, h: 72, mass: 7, hp: 6, art: [['r', -90, 46, 14, 54, 'dgrey'], ['r', 76, 46, 14, 54, 'dgrey'], ['p', [-100, -56, -100, -100, 60, -100, 100, -56], 'dgrey'], ['r', -100, -56, 200, 104, 'dgrey'], ['r', -100, -8, 200, 32, 'white'],
    ['l', [-75, -8, -75, 24]], ['l', [-50, -8, -50, 24]], ['l', [-25, -8, -25, 24]], ['l', [0, -8, 0, 24]], ['l', [25, -8, 25, 24]], ['l', [50, -8, 50, 24]], ['l', [75, -8, 75, 24]]] };
  N.house = { is: 'structure', w: 200, h: 190, solid: false, anchored: true, hp: 10, art: [['r', -85, -22, 170, 122, 'cream'], ['p', [-100, -20, 0, -100, 100, -20], 'red'], ['r', -20, 36, 40, 64, 'brown'], ['r', -66, 4, 30, 30, 'sky'], ['r', 36, 4, 30, 30, 'sky'], ['d', 12, 70, 1.8]] };
  N.tent = { is: 'structure', w: 112, h: 82, solid: false, anchored: true, material: 'cloth', art: [['p', [-100, 100, 0, -100, 100, 100], 'orange'], ['p', [-26, 100, 0, 18, 26, 100], 'dbrown']] };
  N.cannon = { is: 'structure', w: 84, h: 58, solid: false, material: 'metal', hp: 20, launcher: { vx: 10.5, vy: -10.5 }, art: [['p', [-62, 10, 68, -100, 100, -62, -22, 62], 'dgrey'], ['e', -30, 50, 46, 52, 'brown'], ['d', -30, 50, 3], ['l', [-30, 4, -30, 96]], ['l', [-74, 50, 14, 50]]] };
  N.catapult = { is: 'structure', w: 98, h: 72, solid: false, launcher: { vx: 9.5, vy: -12 }, art: [['l', [-60, 60, 60, -80], 5, 'brown'], ['p', [-22, 62, 0, -12, 22, 62], 'brown'], ['r', -100, 58, 200, 24, 'brown'], ['e', 66, -84, 18, 17, 'brown'], ['e', -70, 88, 14, 13, 'dgrey'], ['e', 70, 88, 14, 13, 'dgrey']] };
  N.scarecrow = { is: 'structure', w: 42, h: 86, solid: false, anchored: true, material: 'plant', tags: ['scarecrow'], art: [['l', [0, -20, 0, 100], 3.5, 'brown'], ['l', [-100, -36, 100, -36], 3.5, 'brown'], ['p', [-56, -46, 56, -46, 42, 30, -42, 30], 'red'], ['e', 0, -72, 40, 24, 'tan'], ['p', [-58, -86, 58, -86, 30, -100, -30, -100], 'brown'], ['d', -12, -74, 1.6], ['d', 12, -74, 1.6]] };
  N.sign = { is: 'structure', w: 42, h: 62, solid: false, anchored: true, art: [['r', -10, -10, 20, 110, 'brown'], ['r', -100, -100, 200, 96, 'tan'], ['l', [-60, -70, 60, -70]], ['l', [-60, -40, 30, -40]]] };
  N.treasure = { is: 'thing', w: 36, h: 30, material: 'wood', tags: ['valuable'], edible: true, art: [['r', -100, -20, 200, 120, 'brown'], ['p', [-100, -20, -80, -100, 80, -100, 100, -20], 'brown'], ['e', 0, -18, 16, 22, 'yellow'], ['l', [-100, 30, 100, 30]]] };
  N.teddy = { is: 'thing', w: 30, h: 34, material: 'cloth', tags: ['cloth'], edible: true, art: [['e', -50, -88, 22, 20, 'brown'], ['e', 50, -88, 22, 20, 'brown'], ['e', 0, 32, 76, 66, 'brown'], ['e', 0, -45, 60, 50, 'brown'], ['e', 0, -30, 24, 17, 'tan'], ['d', -20, -55, 1.8], ['d', 20, -55, 1.8]] };
  N.ball = { is: 'thing', w: 26, h: 26, shape: 'circle', material: 'rubber', bounce: 0.8, tags: ['ball'], edible: true, art: [['e', 0, 0, 100, 100, 'red'], ['l', [-95, -20, 0, 26, 95, -20]], ['l', [-60, -78, 0, -40, 60, -78]]] };
  N.duckie = { is: 'thing', w: 28, h: 26, material: 'rubber', art: [['e', -10, 32, 90, 64, 'yellow'], ['e', 36, -40, 46, 46, 'yellow'], ['p', [76, -46, 100, -36, 76, -20], 'orange'], ['d', 44, -50, 2]] };

  // vehicles (E to ride)
  N.car = { is: 'vehicle', w: 112, h: 54, speed: 6, art: [['p', [-100, 60, -100, 0, -60, -10, -35, -90, 40, -90, 65, -10, 100, 6, 100, 60], 'red'], ['p', [-30, -70, 35, -70, 50, -15, -50, -15], 'sky'], ['l', [5, -70, 5, -15]], ['e', -58, 62, 22, 40, 'dgrey'], ['e', 58, 62, 22, 40, 'dgrey'], ['d', -58, 62, 2, 'grey'], ['d', 58, 62, 2, 'grey']] };
  N.bicycle = { is: 'vehicle', w: 74, h: 50, speed: 4.6, jump: 1, hp: 4, art: [['e', -62, 46, 36, 52, ''], ['e', 62, 46, 36, 52, ''], ['l', [-62, 46, -15, -30, 35, -30, 62, 46], 2.5], ['l', [-15, -30, 10, 46, 35, -30], 2.5], ['l', [-15, -30, -25, -70], 2.5], ['l', [-42, -70, -8, -70], 4], ['l', [35, -30, 45, -82], 2.5], ['l', [30, -88, 62, -76], 3]] };
  N.skateboard = { is: 'vehicle', w: 58, h: 16, speed: 4.8, jump: 1.15, material: 'wood', hp: 3, art: [['e', -60, 52, 15, 46, 'dgrey'], ['e', 60, 52, 15, 46, 'dgrey'], ['p', [-100, -92, -84, -20, 84, -20, 100, -92, 92, 16, -92, 16], 'purple']] };
  N.motorcycle = { is: 'vehicle', w: 90, h: 52, speed: 6.6, jump: 1.2, art: [['e', -65, 50, 32, 50, 'dgrey'], ['e', 65, 50, 32, 50, 'dgrey'], ['l', [62, 46, 40, -72], 3.5], ['l', [24, -82, 56, -70], 3.5], ['p', [-62, 10, -20, -50, 30, -50, 60, 0, 20, 42, -30, 42], 'red'], ['r', -48, -66, 52, 22, 'dgrey'], ['d', -65, 50, 2, 'grey'], ['d', 65, 50, 2, 'grey']] };
  N.tractor = { is: 'vehicle', w: 104, h: 78, speed: 2.6, art: [['r', 50, -72, 10, 54, 'dgrey'], ['r', -30, -20, 122, 72, 'green'], ['r', -82, -92, 72, 142, 'green'], ['r', -70, -78, 48, 52, 'sky'], ['e', -50, 50, 42, 52, 'dgrey'], ['e', -50, 50, 18, 22, 'yellow'], ['e', 62, 66, 24, 34, 'dgrey']] };
  N.helicopter = { is: 'vehicle', w: 124, h: 72, speed: 3.6, flies: true, art: [['l', [-100, -80, 90, -80], 3.5], ['l', [-10, -80, -10, -40], 3.5], ['p', [40, 0, 100, -22, 100, 10, 45, 42], 'yellow'], ['e', -10, 20, 60, 60, 'yellow'], ['e', -36, 10, 28, 36, 'sky'], ['l', [100, -46, 100, 36], 2.5], ['l', [-62, 95, 42, 95], 3.5], ['l', [-40, 76, -40, 95]], ['l', [20, 76, 20, 95]]] };
  N.plane = { is: 'vehicle', w: 124, h: 58, speed: 5, flies: true, art: [['p', [-95, 0, -70, -92, -54, -92, -64, 0], 'red'], ['e', 0, 10, 95, 36, 'white'], ['p', [-25, 6, 25, 6, -6, 96, -36, 96], 'red'], ['l', [98, -46, 98, 66], 3.5], ['e', 50, 0, 10, 15, 'sky'], ['e', 22, 0, 10, 15, 'sky'], ['e', -6, 0, 10, 15, 'sky']] };
  N.airballoon = { is: 'vehicle', w: 100, h: 150, speed: 1.9, flies: true, material: 'cloth', hp: 5, art: [['l', [-45, 15, -22, 62]], ['l', [45, 15, 22, 62]], ['e', 0, -36, 95, 62, 'red'], ['e', 0, -36, 45, 62, 'yellow'], ['r', -25, 62, 50, 36, 'tan'], ['l', [-25, 80, 25, 80]]] };
  N.rocket = { is: 'vehicle', w: 46, h: 100, speed: 6.5, flies: true, art: [['p', [-35, 55, 0, 100, 35, 55], 'orange'], ['p', [-60, 20, -100, 90, -60, 62], 'red'], ['p', [60, 20, 100, 90, 60, 62], 'red'], ['p', [0, -100, 60, -50, 60, 56, -60, 56, -60, -50], 'white'], ['p', [0, -100, 46, -62, -46, -62], 'red'], ['e', 0, -22, 30, 14, 'sky']] };
  N.ufo = { is: 'vehicle', w: 104, h: 52, speed: 4.2, flies: true, tags: ['alien'], art: [['e', 0, -36, 45, 60, 'sky'], ['e', 0, 20, 100, 42, 'grey'], ['e', -60, 26, 8, 12, 'yellow'], ['e', 0, 38, 8, 12, 'yellow'], ['e', 60, 26, 8, 12, 'yellow']] };
  N.broom = { is: 'vehicle', w: 74, h: 18, speed: 4, flies: true, material: 'wood', hp: 3, tags: ['magic'], art: [['r', -100, -16, 132, 32, 'brown'], ['p', [30, -26, 100, -100, 100, 100, 30, 26], 'yellow'], ['l', [46, -40, 46, 40], 2.5]] };
  N.carpet = { is: 'vehicle', w: 104, h: 16, speed: 3.6, flies: true, material: 'cloth', hp: 3, tags: ['magic'], art: [['p', [-100, -40, -60, -85, 0, -40, 60, -85, 100, -40, 100, 60, -100, 60], 'purple'], ['l', [-100, 10, 100, 10]], ['l', [-100, 60, -100, 100]], ['l', [100, 60, 100, 100]], ['d', -40, -20, 2, 'yellow'], ['d', 40, -20, 2, 'yellow']] };
  N.boat = { is: 'vehicle', w: 112, h: 52, speed: 0, material: 'wood', rideable: false, art: [['l', [0, 10, 0, -100], 3.5], ['p', [6, -95, 70, 0, 6, 0], 'white'], ['p', [-100, 10, 100, 10, 70, 100, -70, 100], 'brown']] };
  N.lawnmower = { is: 'vehicle', w: 62, h: 46, speed: 1.9, mows: true, loud: true, art: [['l', [-60, 20, -100, -100], 3.5], ['l', [-100, -100, -68, -100], 3.5], ['r', -90, 20, 152, 56, 'red'], ['r', 0, -10, 46, 30, 'dgrey'], ['e', -56, 80, 22, 26, 'dgrey'], ['e', 42, 80, 22, 26, 'dgrey']] };
  N.bulldozer = { is: 'vehicle', w: 114, h: 78, speed: 1.6, smashes: true, mass: 9, hp: 30, art: [['r', -90, 46, 172, 52, 'dgrey'], ['r', -70, -20, 122, 66, 'yellow'], ['r', -52, -96, 66, 80, 'yellow'], ['r', -42, -84, 46, 46, 'sky'], ['l', [50, 30, 82, 40], 5], ['p', [72, -30, 100, -42, 100, 100, 82, 100], 'grey']] };

  // gear (hold it to get its ability)
  N.wings = { is: 'gear', w: 52, h: 42, grants: { fly: 'flap' }, art: [['p', [-5, 0, -100, -90, -80, -10, -95, 50, -50, 30, -40, 90, -5, 40], 'white'], ['p', [5, 0, 100, -90, 80, -10, 95, 50, 50, 30, 40, 90, 5, 40], 'white']] };
  N.jetpack = { is: 'gear', w: 28, h: 38, material: 'metal', grants: { fly: 'thrust' }, art: [['p', [-80, 70, -50, 100, -20, 70], 'orange'], ['p', [20, 70, 50, 100, 80, 70], 'orange'], ['r', -90, -90, 80, 160, 'grey'], ['r', 10, -90, 80, 160, 'grey'], ['r', -30, -100, 60, 30, 'dgrey']] };
  N.balloon = { is: 'gear', w: 28, h: 42, material: 'rubber', grants: { gravity: 0.3 }, art: [['l', [0, 50, 8, 76, -4, 100]], ['e', 0, -30, 95, 68, 'red'], ['p', [-12, 38, 12, 38, 0, 52], 'red'], ['e', -35, -55, 16, 14, 'white']] };
  N.umbrella = { is: 'gear', w: 46, h: 48, grants: { slowfall: true }, art: [['l', [0, -20, 0, 80], 2.5], ['l', [0, 80, -10, 100, -26, 90], 2.5], ['p', [-100, -20, -70, -75, 0, -100, 70, -75, 100, -20, 50, -36, 0, -20, -50, -36], 'purple']] };
  N.pogo = { is: 'gear', w: 22, h: 58, material: 'metal', grants: { jump: 1.55 }, art: [['l', [0, -70, 0, 60], 4], ['l', [-100, -70, 100, -70], 3.5], ['r', -70, 28, 140, 15, 'red'], ['l', [-30, 60, 30, 70, -30, 80, 30, 90, 0, 100], 2.5]] };
  N.cape = { is: 'gear', w: 32, h: 42, grants: { slowfall: true, jump: 1.15 }, art: [['p', [-60, -100, 60, -100, 100, 100, 30, 80, 0, 100, -30, 80, -100, 100], 'red']] };
  N.skates = { is: 'gear', w: 30, h: 22, grants: { speed: 1.7 }, art: [['p', [-80, -100, 0, -100, 0, -10, 100, 10, 100, 50, -80, 50], 'white'], ['e', -50, 76, 22, 28, 'red'], ['e', 60, 76, 22, 28, 'red']] };
  N.boots = { is: 'gear', w: 28, h: 28, grants: { jump: 1.4 }, art: [['p', [-70, -100, 10, -100, 10, 10, 100, 30, 100, 68, -70, 68], 'brown'], ['l', [-50, 70, 50, 80, -50, 90, 50, 100], 2.5]] };
  N.armor = { is: 'gear', w: 32, h: 38, material: 'metal', grants: { armor: true, speed: 0.75 }, art: [['p', [-100, -80, -40, -100, 40, -100, 100, -80, 80, 100, -80, 100], 'grey'], ['l', [0, -100, 0, 100]], ['l', [-88, 0, 88, 0]]] };
  N.parachute = { is: 'gear', w: 62, h: 52, grants: { slowfall: true }, art: [['l', [-100, -10, 0, 90]], ['l', [100, -10, 0, 90]], ['l', [-35, -10, 0, 90]], ['l', [35, -10, 0, 90]], ['p', [-100, -10, -60, -80, 0, -100, 60, -80, 100, -10], 'orange'], ['r', -12, 80, 24, 20, 'brown']] };

  // nature and stranger things
  N.fire = { is: 'nature', w: 42, h: 52, material: 'magic', hot: true, light: true, life: 18, tags: ['fire'],
    art: [['p', [-80, 100, -100, 30, -60, -20, -70, -70, -20, -40, 0, -100, 30, -45, 70, -65, 60, -10, 100, 40, 80, 100], 'orange'], ['p', [-40, 100, -50, 40, -10, 0, 5, -45, 30, 10, 50, 50, 40, 100], 'yellow']] };
  N.lava = { is: 'nature', w: 124, h: 22, material: 'magic', hot: true, light: true, tags: ['fire'], art: [['p', [-100, 100, -100, -20, -70, -62, -40, -10, -10, -72, 20, -10, 55, -82, 80, -20, 100, -42, 100, 100], 'orange'], ['e', -50, 40, 8, 26, 'yellow'], ['e', 30, 50, 6, 20, 'yellow']] };
  N.water = { is: 'nature', w: 96, h: 16, material: 'water', wet: true, tags: ['wet'], art: [['e', 0, 20, 100, 80, 'blue'], ['l', [-50, -5, -12, -5]], ['l', [20, 30, 50, 30]]] };
  N.raincloud = { is: 'nature', w: 116, h: 52, material: 'magic', floating: true, rains: true, tags: ['wet'], art: [['e', -45, 8, 52, 62, 'grey'], ['e', 38, 10, 60, 66, 'grey'], ['e', -5, -32, 52, 62, 'grey']] };
  N.cloud = { is: 'nature', w: 124, h: 46, material: 'magic', floating: true, solid: true, art: [['e', -45, 12, 52, 62, 'white'], ['e', 38, 12, 60, 66, 'white'], ['e', -5, -30, 52, 62, 'white']] };
  N.snowman = { is: 'nature', w: 46, h: 78, material: 'ice', melts: true, art: [['e', 0, 56, 76, 44, 'white'], ['e', 0, -10, 56, 32, 'white'], ['e', 0, -64, 40, 24, 'white'], ['r', -26, -100, 52, 20, 'dgrey'], ['d', -12, -70, 1.6], ['d', 12, -70, 1.6], ['p', [5, -64, 52, -58, 5, -56], 'orange'], ['d', 0, -18, 1.6], ['d', 0, 0, 1.6]] };
  N.ice = { is: 'nature', w: 58, h: 58, material: 'ice', upright: false, solid: true, melts: true, art: [['r', -100, -100, 200, 200, 'sky'], ['l', [-70, -40, -30, -80]], ['l', [-62, 0, 0, -72]]] };
  N.sun = { is: 'nature', w: 84, h: 84, material: 'magic', floating: true, light: true, warm: true, art: [['l', [0, -100, 0, -74], 3], ['l', [0, 100, 0, 74], 3], ['l', [-100, 0, -74, 0], 3], ['l', [100, 0, 74, 0], 3], ['l', [-70, -70, -52, -52], 3], ['l', [70, -70, 52, -52], 3], ['l', [-70, 70, -52, 52], 3], ['l', [70, 70, 52, 52], 3], ['e', 0, 0, 60, 60, 'yellow']] };
  N.lightning = { is: 'nature', w: 40, h: 96, material: 'magic', floating: true, strike: true, life: 0.6, art: [['p', [10, -100, -60, 5, -8, 5, -40, 100, 60, -20, 8, -20, 50, -100], 'yellow']] };
  N.rainbow = { is: 'nature', w: 460, h: 34, material: 'magic', floating: true, solid: true, art: [['r', -100, -100, 200, 50, 'red'], ['r', -100, -50, 200, 50, 'yellow'], ['r', -100, 0, 200, 50, 'green'], ['r', -100, 50, 200, 50, 'blue']] };
  N.blackhole = { is: 'nature', w: 72, h: 72, material: 'magic', floating: true, hole: true, life: 9, art: [['e', 0, 0, 100, 100, 'purple'], ['e', 0, 0, 64, 64, 'ink'], ['l', [-90, -30, -40, -80, 30, -86]], ['l', [90, 30, 40, 80, -30, 86]]] };
  N.portal = { is: 'nature', w: 46, h: 86, material: 'magic', floating: true, portal: true, art: [['e', 0, 0, 100, 100, 'teal'], ['e', 0, 0, 66, 76, 'navy'], ['e', 0, 0, 30, 46, 'purple']] };

  // ---- synonyms: many spellings, one object --------------------------------
  const synonyms = {
    goat: ['billy goat', 'nanny goat'], sheep: ['lamb', 'ram', 'ewe'], cow: ['bull', 'ox', 'cattle'], pig: ['hog', 'boar', 'piglet', 'swine'],
    horse: ['pony', 'stallion', 'mare', 'steed'], donkey: ['mule', 'burro'], deer: ['stag', 'doe', 'moose', 'elk', 'reindeer'], rabbit: ['bunny', 'hare'],
    mouse: ['rat', 'hamster', 'mice'], llama: ['alpaca'], turtle: ['tortoise'], wolf: ['coyote'], lion: ['lioness'], bear: ['grizzly', 'grizzly bear'],
    cat: ['kitten', 'kitty'], dog: ['puppy', 'hound', 'pup', 'sheepdog'], crocodile: ['alligator', 'croc', 'gator'], snake: ['serpent', 'viper', 'cobra', 'python'],
    bird: ['sparrow', 'robin', 'finch'], eagle: ['hawk', 'falcon'], chicken: ['hen', 'rooster'], crow: ['raven'], pigeon: ['dove'], bee: ['wasp', 'hornet', 'bees'],
    butterfly: ['moth'], dragon: ['wyvern', 'drake'], vampire: ['dracula'], ghost: ['spirit', 'phantom', 'spook'], troll: ['ogre', 'giant'], yeti: ['bigfoot', 'sasquatch'],
    slime: ['blob', 'ooze'], alien: ['martian'], cthulhu: ['kraken', 'elder god'], robot: ['android', 'droid'], frog: ['toad'], cop: ['police', 'policeman', 'police officer', 'officer', 'sheriff'],
    firefighter: ['fireman', 'firewoman'], lumberjack: ['woodcutter', 'logger'], gardener: ['landscaper'], wizard: ['mage', 'sorcerer', 'witch'], chef: ['cook', 'baker'],
    shepherd: ['farmer', 'goatherd', 'rancher'], bard: ['musician', 'minstrel', 'singer'], thief: ['robber', 'burglar', 'bandit'], baby: ['infant', 'toddler'], doctor: ['nurse', 'medic'],
    hay: ['hay bale', 'straw', 'oats'], grass: ['weeds', 'clover'], cabbage: ['lettuce', 'salad', 'kale'], bread: ['loaf', 'toast', 'bagel'], cake: ['cupcake', 'muffin'], donut: ['doughnut'],
    steak: ['meat', 'beef', 'ham', 'bacon', 'sausage', 'drumstick'], fish: ['salmon', 'trout', 'tuna'], sandwich: ['burger', 'hamburger', 'hot dog', 'taco'], can: ['tin can', 'tin', 'trash', 'garbage', 'junk'],
    pie: ['tart'], cookie: ['biscuit', 'cracker'], newspaper: ['paper', 'magazine', 'homework'], letter: ['envelope', 'mail', 'postcard'], sock: ['shirt', 'sweater', 'scarf', 'glove', 'underwear'], hat: ['top hat', 'cap'],
    axe: ['hatchet'], scissors: ['shears', 'clippers', 'pruners'], knife: ['dagger', 'blade'], hammer: ['sledgehammer', 'mallet'], spear: ['lance', 'trident', 'pitchfork'], club: ['bat', 'stick'],
    torch: ['lantern'], match: ['lighter', 'matches'], bucket: ['pail', 'watering can', 'water bucket'], extinguisher: ['fire extinguisher'], whistle: ['horn', 'bell', 'airhorn'], trumpet: ['tuba', 'trombone', 'bugle'],
    flute: ['lullaby', 'harp', 'music box', 'lute'], wand: ['magic wand'], flashlight: ['lamp', 'spotlight'], bomb: ['dynamite', 'tnt', 'grenade'],
    plank: ['board', 'beam'], log: ['tree trunk', 'trunk'], crate: ['box', 'chest'], rock: ['boulder', 'stone'], fence: ['gate', 'barrier'], spring: ['bounce pad'], pillar: ['column', 'pole'],
    bush: ['shrub', 'hedge'], flower: ['rose', 'daisy', 'tulip', 'sunflower'], house: ['cottage', 'hut', 'cabin', 'shed'], treasure: ['gold', 'coin', 'coins', 'money', 'treasure chest', 'diamond'],
    teddy: ['teddy bear', 'doll', 'plushie'], duckie: ['rubber duck', 'rubber ducky'], car: ['truck', 'van', 'taxi', 'jeep'], bicycle: ['bike', 'tricycle', 'unicycle'], motorcycle: ['motorbike', 'scooter', 'moped'],
    helicopter: ['chopper', 'copter'], plane: ['airplane', 'aeroplane', 'jet', 'biplane'], airballoon: ['hot air balloon', 'blimp', 'zeppelin', 'airship'], rocket: ['rocket ship', 'spaceship', 'spacecraft'], ufo: ['flying saucer', 'saucer'],
    broom: ['broomstick'], carpet: ['magic carpet', 'flying carpet', 'rug'], boat: ['ship', 'canoe', 'raft', 'kayak'], lawnmower: ['mower', 'lawn mower'], bulldozer: ['digger', 'excavator', 'steamroller'],
    wings: ['wing', 'angel wings'], jetpack: ['jet pack', 'rocket pack'], balloon: ['balloons'], pogo: ['pogo stick'], skates: ['roller skates', 'rollerblades', 'rollerskates'], boots: ['spring boots', 'spring shoes', 'shoes'],
    armor: ['armour', 'chainmail'], parachute: ['glider'], fire: ['campfire', 'bonfire', 'flame', 'flames'], lava: ['magma'], water: ['puddle', 'pond'], raincloud: ['rain cloud', 'rain', 'storm', 'storm cloud', 'thundercloud'],
    ice: ['ice cube', 'ice block', 'iceberg'], lightning: ['thunderbolt', 'lightning bolt', 'thunder'], blackhole: ['black hole', 'void', 'vortex'], portal: ['teleporter', 'wormhole', 'door'],
    trampoline: ['bouncy castle'], scarecrow: ['strawman'], ball: ['football', 'basketball', 'tennis ball', 'beach ball'], apple: ['pear', 'peach', 'fruit'], carrot: ['turnip', 'radish', 'vegetable'],
    corn: ['wheat', 'grain', 'rice', 'seeds', 'seed'], mushroom: ['toadstool'], ladder: ['stepladder'], tree: ['oak', 'pine', 'palm tree', 'oak tree', 'pine tree'], cannon: ['human cannon'],
    catapult: ['trebuchet', 'slingshot'], skeleton: ['skull'], zombie: ['mummy', 'ghoul'], spider: ['tarantula'], shark: ['whale', 'dolphin'], tiger: ['panther', 'leopard', 'cheetah', 'jaguar'],
  };

  // ---- adjectives: modifiers stacked on top of a noun ----------------------
  const scale = (k) => (s) => { s.w = Math.round(s.w * k); s.h = Math.round(s.h * k); s.mass *= k * k; s.hp = Math.max(1, Math.round(s.hp * k)); if (s.dmg) s.dmg = Math.max(1, Math.round(s.dmg * (k > 1 ? 1.5 : 0.5))); };
  const mat = (m) => (s) => { s.material = m; delete s.flammable; if (m === 'paper') { s.tags.push('paper'); } };
  const tint = (c) => (s) => { s.tint = c; };
  const adjectives = {
    big: scale(1.5), giant: scale(2.2), small: scale(0.7), tiny: scale(0.45),
    long: (s) => { s.w = Math.round(s.w * 1.7); s.mass *= 1.7; }, tall: (s) => { s.h = Math.round(s.h * 1.6); s.mass *= 1.6; },
    flaming: (s) => { s.aflame = true; s.hot = true; s.light = true; s.fireproof = true; if (s.fears) s.fears = s.fears.filter((t) => t !== 'fire'); },
    frozen: (s) => { s.material = 'ice'; s.melts = true; s.frozen = true; s.flammable = false; },
    wet: (s) => { s.soaked = true; s.fireproof = true; s.tags.push('wet'); },
    fireproof: (s) => { s.fireproof = true; },
    flying: (s) => { if (s.alive || s.rideable) s.flies = true; else s.floating = true; },
    floating: (s) => { if (s.alive) s.flies = true; else s.floating = true; },
    friendly: (s) => { s.hunts = []; s.fears = (s.fears || []).filter((t) => t === 'fire'); s.friendly = true; s.follows = true; s.dmgWas = s.dmg; s.dmg = 0;
      s.tags = s.tags.filter((t) => t !== 'scary' && t !== 'predator' && t !== 'monster'); if (s.alive && s.w >= 50) { s.rideable = true; if (s.jump === undefined) s.jump = 1; } },
    angry: (s) => { if (s.alive) { s.hunts = ['human', 'prey', 'animal']; s.fears = []; s.dmg = Math.max(1, s.dmg || 0); s.tags.push('scary'); s.follows = false; s.rideable = false; } },
    sleepy: (s) => { s.sleeps = true; },
    hungry: (s) => { s.hungry = true; },
    fast: (s) => { if (s.speed) s.speed *= 1.7; }, slow: (s) => { if (s.speed) s.speed *= 0.5; },
    heavy: (s) => { s.mass *= 4; }, light: (s) => { s.mass *= 0.3; },
    wooden: mat('wood'), metal: mat('metal'), stone: mat('stone'), paper: mat('paper'), rubber: (s) => { s.material = 'rubber'; s.bouncy = Math.max(s.bouncy || 0, 13); },
    golden: (s) => { s.material = 'metal'; s.tint = 'yellow'; s.tags.push('valuable'); },
    scary: (s) => { s.tags.push('scary', 'monster'); },
    loud: (s) => { s.loud = true; },
    invisible: (s) => { s.stealth = true; },
    dead: (s) => { if (s.alive) { s.alive = false; s.wasAlive = true; s.speed = 0; s.hunts = []; s.diet = []; s.fears = []; s.tags = ['meat']; s.edible = true; s.rideable = false; s.follows = false; s.carry = s.w < 60; } },
    brave: (s) => { s.fears = []; },
    cowardly: (s) => { if (s.alive) { s.fears = ['fire', 'scary', 'loud', 'human', 'animal', 'monster', 'stinger']; s.hunts = []; } },
    baby: scale(0.6),
    red: tint('red'), blue: tint('blue'), green: tint('green'), yellow: tint('yellow'), purple: tint('purple'), pink: tint('pink'), orange: tint('orange'), black: tint('dgrey'), white: tint('white'), brown: tint('brown'),
  };
  const adjSynonyms = {
    big: ['large'], giant: ['huge', 'enormous', 'gigantic', 'massive', 'colossal', 'humongous'], small: ['little', 'short'], tiny: ['mini', 'miniature', 'teeny'], long: ['wide', 'extended'],
    flaming: ['burning', 'fiery', 'flamey'], frozen: ['icy', 'frosty'], wet: ['soggy', 'soaked', 'damp'], flying: ['winged', 'airborne'], floating: ['hovering', 'levitating'],
    friendly: ['tame', 'nice', 'kind', 'gentle', 'cute', 'happy', 'loyal', 'good'], angry: ['evil', 'mean', 'hostile', 'rabid', 'mad', 'furious', 'bad', 'wild'], sleepy: ['sleeping', 'tired', 'asleep', 'drowsy'],
    hungry: ['starving', 'greedy'], fast: ['quick', 'speedy', 'swift'], slow: ['lazy', 'sluggish'], metal: ['iron', 'steel'], golden: ['gold'], scary: ['spooky', 'creepy', 'terrifying'],
    loud: ['noisy'], invisible: ['hidden', 'stealthy'], brave: ['fearless', 'bold'], cowardly: ['scared', 'timid', 'shy'], rubber: ['bouncy'], heavy: ['fat'],
  };

  // How materials behave. This is a "system"; everything above is authoring.
  const materials = {
    wood: { flammable: true, burn: 6 }, paper: { flammable: true, burn: 2 }, plant: { flammable: true, burn: 3.2 }, cloth: { flammable: true, burn: 3 },
    flesh: { flammable: true, burn: 3 }, food: { flammable: false }, metal: { flammable: false }, stone: { flammable: false }, rubber: { flammable: true, burn: 4 },
    water: { flammable: false }, ice: { flammable: false }, magic: { flammable: false },
  };

  NN.dict = { categories, nouns: N, synonyms, adjectives, adjSynonyms, materials };
})(typeof window !== 'undefined' ? (window.NN = window.NN || {}) : (globalThis.NN = globalThis.NN || {}));
