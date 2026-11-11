# Picking this up

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

The look is the game's own: wobbly ink over offset flat washes on sketchbook
paper, three wobble frames per sprite. It is not modelled on any existing game
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
