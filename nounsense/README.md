# Nounsense

A write-a-word-and-it-appears puzzle game, built "the old way": every word the
game knows is authored by hand in a dictionary, with a category tree for
inherited defaults and per-object exceptions on top. No LLM anywhere.

Open `index.html` in a browser (no build step, no server needed).

It is an original game in the genre that Scribblenauts made famous. The worlds,
characters and art are its own.

## The game

Nib, an apprentice star-wizard, has crashed the Tin Comet. Each world has a dead
beacon; carry a star seed to it and it lights. Write any word the dictionary
knows and the thing appears. Click something already on the page and write a
describing word to change it (`sleepy`, `tiny`, `flying`).

| World | Setting | Problems | Some ways through |
| --- | --- | --- | --- |
| Lamplight Row | A street at dusk: shops, a lab, a museum, an observatory, a monorail | A flooded excavation, a magpie that steals shiny things, a wooden hoarding | raft, bridge, wings; decoy ring, cat, scarecrow; axe, torch, ladder |
| Gloamwick Manor | A haunted hall with a library gallery | Haunted armour, a collapsed gallery over a locked vault door, a poltergeist that hates light | rain, flute; bridge, key, bomb; lantern, sun |
| Glowroot Hollow | A moonlit forest of giant trees and mushroom houses | A river with no bridge, a gremlin with a taste for star seeds, a bluff with a dried-up skyvine, a curtain of thornvines | bridge, raft; donut, cat, trumpet; rain cloud, ladder, trampoline; torch, axe, lumberjack |
| Port Nebula | A harbour at sunset under a ringed planet, and a sky-pirate galleon | A quicksilver bay with a star shark in it, a hull to climb, a captain who dislikes stowaways | boat, a fish for the shark, a friendly shark to ride; the cargo net; treasure, a ghost |

Design choices that keep a world from being solved the same way every time:

- **Three stars**: light the beacon; do it in par words or fewer; do that without reusing a word from an earlier win in the same world.
- **Solutions interfere.** Fire that clears wood also burns your wooden bridge. A wolf deals with the thief, then with you.
- **Multi-purpose words exist** and are meant to be found.
- **Failure is soft.** Lose the star seed and you fetch another; what you built stays.

Three early worlds (a gorge, a sky island, a keep) are no longer in the game; their
puzzles were folded into the four above. They survive as `test/fixtures.js`, which the
playtest loads so the rules they exercise stay covered.

## Tech

One page, plain scripts, no build:

| File | Job |
| --- | --- |
| `src/dictionary.js` | The hand-authored "spreadsheet": categories, 247 nouns, 676 accepted words with synonyms, 112 describing words, materials. Art for each object lives here too. |
| `src/lexicon.js` | Phrase → object spec. Finds the longest trailing noun, treats the words before it as adjectives, walks the category tree, applies overrides. Unknown words are refused with a nearest-match suggestion. |
| `src/sim.js` | Physics (Matter.js) and the rules. No drawing, no DOM. |
| `src/art.js` | Object and character drawing: shapes merge into clean silhouettes with one ink outline, a cel-shaded edge and a highlight; three frames per sprite so the line shimmers. Rigs for four-legged animals, birds and chibi people. |
| `src/town.js`, `src/manor.js`, `src/hollow.js`, `src/port.js` | Scene painters. Each builds a world from small part functions (windows, doors, trunks, mushroom houses, lanterns) and records where its lights are. |
| `src/levels.js` | Worlds as data: terrain boxes, water, natives, goal. |
| `src/main.js` | Rendering, input, HUD, sound and music, saved progress. |

Rendering: the scene is drawn unlit to a 2D canvas, then PixiJS composites it
with a light map (ambient colour plus every light in view), bloom, a colour
grade, a vignette and paper grain. Without WebGL it falls back to plain canvas
compositing. Windows, lanterns, glowing mushrooms, fireflies and anything in the
dictionary marked `light` or `hot` are real lights.

Sound effects and the per-world music are synthesised with WebAudio; there are
no audio files.

### What is a system and what is hand-authored

The rules in `sim.js` are few and general: things burn by material and spread
fire on contact, water puts fire out, creatures flee what they fear, eat what is
in their diet, hunt what they hunt, heavy things fall. Everything specific is
data in the dictionary.

The interesting part of doing it this way is how quickly category rules stop
being enough. Examples already in the dictionary:

- Humans flee monsters, but a cop stands their ground and will always stop for a donut.
- A dog only chases cats, follows you around, and still scares thieves.
- A ghost is a monster that never hurts anyone.
- An elephant is afraid of nothing except a mouse.
- A shark out of water just flops.

## Controls

A/D or arrows walk, Space or W jumps and climbs, Enter writes a word, the mouse
drags things (click selects, right-click erases), E picks up, rides or launches,
F uses what you hold, Q drops it.

## Tests

```bash
node --test nounsense/test/lexicon.test.js
```

```bash
node nounsense/test/playtest.js
```

The first checks the dictionary and parser. The second needs Playwright; it
plays 65 scripted solutions and interactions in a headless browser, then
spawns every word with random adjectives and inputs to look for crashes. It
takes several minutes. `test/sheet.html` draws every object on one page.

```bash
node nounsense/test/ui-playthrough.js
```

```bash
node nounsense/test/ui-playthrough-town.js
```

Those two finish Gloamwick Manor and Lamplight Row the way a player would, with mouse
clicks, typed words and held keys only (three words and three stars each), to check the
interface end to end.

## Not done yet

- Nothing has been tuned by long hand play; difficulty and phone layout are untested by people.
- The "new way" (an LLM filling in the same object spec) for a side-by-side comparison.

Picking this up later? See [HANDOFF.md](./HANDOFF.md).

Matter.js and PixiJS are vendored in `vendor/` under their MIT licences.
