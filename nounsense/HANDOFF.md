# Picking this up

## Current state (read this first; the rest of the file predates it)

The game was reworked after the notes below were written. What is true now:

- **Story:** Nib, an apprentice star-wizard, carries star seeds to dead beacons. The goat/courier level is gone.
- **Worlds** live in `src/levels.js` as data. Four ship, each with its own scene painter: *Lamplight Row* (street),
  *Gloamwick Manor* (interior), *Glowroot Hollow* (forest) and *Port Nebula* (harbour and galleon). Three early
  worlds (gorge, skyvine, keep) now live in `test/fixtures.js`: the playtest appends them to `NN.levels` so the
  rules they exercise stay covered. They draw through the older themed path in `main.js` (`THEMES.forest/sky/keep`,
  `SCENES`, the generic part of `drawBlock`), which nothing in the shipped game uses any more.
- **Rendering:** `src/main.js` draws the scene unlit to a 2D canvas, and PixiJS (`vendor/pixi.min.js`) composites it
  with a light map, bloom, grading, a vignette and grain. It falls back to plain canvas compositing without WebGL.
  Scenery records its own lights while it is drawn; anything in the dictionary with `light` or `hot` is a moving light.
- **Scene art:** `src/town.js`, `src/manor.js`, `src/hollow.js` and `src/port.js` build scenes from small part
  functions and return `{ front, over, lights }` (behind the characters, in front of them, and recorded lights).
  `hollow.js` and `port.js` are full painters: they also export `sky`, `far`, `mid`, `ground`, `skyLights`, and
  their `build()` returns `animate(ctx, t, layer, …)` for things that move and `liveLights(t)`. To add a world:
  write a painter with that interface named after the theme (`NN.<theme>`), add a `custom` theme in `THEMES` in
  `main.js`, and set `zoom: 1` on the level. `buildWorldArt()` and `drawBlock()` pick it up by name.
  Two optional hooks: `midLights()` returns lights for the middle-distance layer as `[x, height above the horizon,
  radius, colour, strength]` (they slide with that layer; the forest uses it for distant windows), and
  `trench(ctx, terrainBlock, waterY)` paints the far wall of a pit (the town's canal). A theme may set `waterDeep`
  for the colour water falls to with depth. Port Nebula is painted at golden hour so the four worlds do not share
  one key; `sky2: 'violet'` on the level brings back the purple dusk.
- **Engine additions:** water (things float, swimmers swim, boats sail), describing words applied to anything already
  on the page (`sim.describe`), growing plants, locks and keys, bribes, per-world camera zoom.
- **People** are chibi (`person()` in `src/art.js`); pose 5 is a wave. Walks are a four-step cycle.
- **Tests:** `node nounsense/test/playtest.js` runs 71 scripted scenarios and a fuzz pass over every word.
  World labels in the test list: `-2` town, `-1` manor, `'h'` hollow, `3` port, `0..2` the fixtures. A few scenarios depend on
  creature AI that uses `Math.random`, so an occasional single failure on a re-run is a flake, not a regression. It takes several
  minutes because the renderer runs in software there (about 2 frames a second; that says nothing about real GPUs).
- **Whole-level playthroughs:** `test/ui-playthrough.js` (manor), `-town.js`, `-hollow.js` and `-port.js` finish a
  level with real mouse, typing and keys only (the last two use `test/ui-kit.js`). They take 4 to 10 minutes each. Run them after any change to creature rules: the scripted scenarios each test
  one interaction and missed that a scarecrow did not stop the magpie along the whole street. When scripting with
  the mouse, wait for the camera to settle before aiming, and do not aim within 70 px of a screen edge while holding
  an item (that scrolls the camera, by design).
- **Fear and appetite:** a creature flees a feared thing within 215 units and will not eat or steal while one is
  within 600 (`think()` in `sim.js`).
- **Lighting and design choices** were picked by rendering variants of the same screen and having one reviewer rank
  them side by side; separate reviewers' absolute scores varied more than the changes. `NN.game.tune` overrides
  ambient, bloom, contrast and saturation at run time for that. Per-world values live in `THEMES`.
- **Music:** `TUNES` in `main.js` gives each world a key, tempo and four chords; `musicTick()` schedules a pad, a
  bass and a seeded music-box line. No audio files.
- **Performance:** baked scene layers are cut into 512-unit tiles (`tileLayer` in `main.js`) so only visible tiles
  are drawn and no texture exceeds phone limits. `NN.game.perf` holds rolling per-frame timings in ms
  (`scene`, `lights`, `present`). In software rendering all three worlds cost about 15 ms scene + 15 ms present.
- **Camera:** follows the ground under the hero (`sim.groundBelow`), so high ground does not fill the frame with soil.
- **Studies:** `test/study.html` is a measured redraw of a reference illustration (18.5 dB PSNR), with tools in
  `test/study-tools/`. `test/recreation.html` is an earlier freehand attempt. Neither is used by the game.
- **Structures and animals:** a wide summoned structure that lands on something alive lifts it on top (`sim.step`),
  so animals no longer prop up bridges.
- **Not done:** frame rate has not been measured on real hardware, nothing has been tuned by long hand play, and
  the older themed render path could be deleted if the fixtures were given a simpler way to draw.

---


Notes for whoever works on Nounsense next. Read `README.md` first for what the
game is; this file is about how to change it without breaking it.

## Where things stand

- One level, playable, in `index.html`. No build step, no server, no dependencies to install.
- The dictionary has 189 nouns, about 330 synonyms and about 110 describing words.
- Automated checks pass: 6 parser tests, 22 scripted solutions and interactions, and a fuzz pass over every word.
- Hand play has been light. Difficulty, drag-and-place feel and phone layout have not been tuned by a person.
- No sound. One level only.

## Run and test

Open `index.html` in a desktop browser. Then:

```bash
node --test nounsense/test/lexicon.test.js
```

```bash
node nounsense/test/playtest.js
```

The second needs Playwright and a Chromium it can launch. Run both after any
change to `dictionary.js` or `sim.js`. Open `test/sheet.html` to see every
object drawn on one page; add `?q=giant` to see them with an adjective.

## The one idea to keep

Everything goes through one object spec. `lexicon.resolve("giant friendly dragon")`
returns a plain object (size, material, tags, diet, fears, hunts, grants, art…)
and `sim.js` only ever reads that spec. It never checks for a specific noun,
apart from the three level natives.

Keep it that way. It is what makes the planned comparison possible: an LLM that
fills in the same spec can replace `lexicon.js` without touching the simulation.

## How to add a word

1. Add an entry to `N` in `src/dictionary.js` with `is:` set to a category. Override only what differs.
2. Give it `art`: either a rig (`{ a: 'quad' | 'bird' | 'person', ... }`) or a list of drawing ops. Ops use a box from -100 to 100 on both axes, scaled to the object's `w` and `h`. The format is at the top of `src/art.js`.
3. Add synonyms to the `synonyms` table.
4. Look at it in `test/sheet.html`, then run the tests.

Behaviour comes from tags. A creature flees anything carrying a tag in its
`fears`, eats `edible` things carrying a tag in its `diet`, and attacks anything
carrying a tag in its `hunts`. If a new word needs behaviour that no tag
combination gives, add a general rule to `sim.js` and a spec field that turns it
on. Do not special-case the noun.

Useful spec fields: `solid`, `carry`, `anchored`, `floating`, `upright`,
`climbable`, `bouncy`, `rideable`, `flies`, `launcher`, `grants` (abilities while
held), `use` (what F does), `hot`, `wet`, `melts`, `life`, `edible`.

## How to add a level

The level is currently hard-wired at the top of `createSim` in `src/sim.js`:
the `L` constants, the terrain rectangles, and the three natives (goat,
brambles, mailbox). Scenery is in `src/main.js` (`scenery`, `drawTerrain`).

A second level means pulling those into a level description (terrain rects,
natives, start, goal, par) that both files read. That refactor has not been
done. Do it before adding level two, not after.

## Things that will bite you

- **The playtest and the page both step the simulation.** The page's own animation loop keeps running while the test fast-forwards. Tests are written to tolerate that; do not assert exact frame counts.
- **Positions lag one step.** After moving a body with `Body.setPosition`, `entity.x/y` only update at the end of the next `sim.step`. Step once before reading them or calling `interact`.
- **Dragging uses static sensor bodies.** `sim.grab` makes the body static and a sensor; `sim.release` restores it. Matter only restores mass correctly because the body was created dynamic first. Keep that order.
- **Collision groups matter.** The courier and creatures collide with terrain and `solid` things only. Small items pass through both. A new structure that should block the goat must be `solid`.
- **Step-up.** The courier and creatures climb ledges up to 28px (`stepUp`). Without it they shove a bridge off the cliff by walking into its end.
- **Sight uses box-to-box distance.** The brambles are 960px tall; centre-to-centre distance made the goat blind to them.
- **Air drag is real.** Launch speeds (cannon, catapult, bounce) were tuned by test, not by formula. Re-run the playtest after touching movement numbers. The ravine is 340px wide and a plain jump covers about 220px; that margin is the puzzle.
- **Synonym collisions are resolved by order.** A real noun beats a synonym of the same spelling ("bat" is the animal, not the club). `giant` alone is a troll; in front of a noun it is an adjective.

## Design rules worth keeping

- The brambles reach the sky so that flying cannot skip all three problems.
- Losing the parcel is never a game over. You fetch another; what you built stays.
- The third star forbids reusing words from earlier wins. That is the answer to "one word solves everything".
- Solutions should interfere with each other (fire burns your bridge). When adding a word, ask what it breaks as well as what it solves.

## Art

The look is the game's own: a bold ink outline around flat colour, with a
cel-shaded lower edge and a soft highlight, three slightly different frames per
sprite so the line shimmers. Shapes of one colour can be put in a group
(`['g', colour, [shapes]]`) so they merge into one silhouette with a single
outline; the rigs use this for bodies, and it is the main tool for making a new
object look clean. Corners are rounded by default; pass a small radius for
sharp things. A colour name ending in `-` or `+` is a darker or lighter tone.

Rigged creatures and the courier get plain ink-dot eyes drawn live in `main.js`
(`drawEyes`), so they look at things, blink, widen when scared and frown when
attacking; squash, stretch and walk bob are applied at draw time too.
Hand-drawn creatures (dragon, ghost…) still have painted eyes and are the
obvious next ones to convert.

The sprite cache in `art.js` keeps the 70 most recently used sprites. Without
that limit a long session, or the fuzz test, runs the tab out of memory. It is not modelled on any existing game
and should stay that way; this is an original game in a genre, not a remake.
Changes of direction (cleaner lines, jointed limbs, a different medium) are all
fair game and mostly live in `shape()` and the rigs in `src/art.js`.

## Publishing the playable page

The hosted version is the part of `index.html` between `<!--page-->` and
`<!--/page-->`, published with `style.css`, `vendor/matter.min.js` and
`src/*.js` as supporting files at the same relative paths.

## Suggested next steps, in order

1. Play it by hand for an hour and tune: goat speed and sight range, the 10-object cap, hint wording.
2. Sound: a handful of short effects makes the biggest difference for the least work.
3. Pull the level out of `sim.js`, then add a second level that leans on different words (water, light, sleep).
4. Per-creature limbs that move, replacing the two-frame walk.
5. The "new way": an LLM that returns the same spec for words the dictionary does not know, then compare coverage, consistency and authoring time against the hand-built one.
