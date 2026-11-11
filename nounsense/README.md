# Nounsense

A write-a-word-and-it-appears puzzle game, built "the old way": every word the
game knows is authored by hand in a dictionary, with a category tree for
inherited defaults and per-object exceptions on top. No LLM anywhere.

Open `index.html` in a browser (no build step, no server needed).

It is an original game in the genre that Scribblenauts made famous. The level,
characters and art are its own.

## The level: one parcel, three problems

A courier has to carry a parcel from the post office to a mailbox. Par is three words.

| Obstacle | What it tests | Some ways through |
| --- | --- | --- |
| A ravine with a broken bridge | traversal | bridge, log, wings, trampoline, cannon, motorcycle, balloon, portal, rainbow, a friendly dragon |
| A goat that eats paper | creature behaviour | feed it (tin can, newspaper), scare it (dog, torch), charm it (shepherd), cage it, lull it (flute), turn it into a frog (wand) |
| A wall of brambles up to the sky | materials and elements | cut (axe, lumberjack), burn (torch, dragon), mow (lawnmower), blow up (bomb), or get the goat to eat it |

Design choices that keep it from being solved the same way every time:

- **The brambles reach the sky**, so flying solves the ravine and the goat but not the third problem.
- **Three stars**: deliver; deliver in three words or fewer; do that without reusing a word from an earlier win. Every perfect run needs a new route.
- **Solutions interfere.** Fire that clears the brambles also burns a wooden bridge. A wolf deals with the goat, then with you.
- **Multi-purpose words exist** and are meant to be found: a torch scares the goat and burns the brambles.
- **Failure is soft.** Lose the parcel and you fetch another from the post office; what you built stays.

## Tech strategy

One page, plain scripts, no build:

| File | Job |
| --- | --- |
| `src/dictionary.js` | The hand-authored "spreadsheet": categories, 189 nouns, about 330 synonyms, about 110 describing words, materials. Art for each object lives here too. |
| `src/lexicon.js` | Phrase → object spec. Finds the longest trailing noun, treats the words before it as adjectives, walks the category tree, applies overrides. Unknown words are refused with a nearest-match suggestion. |
| `src/sim.js` | The level, physics (Matter.js) and the rules. No drawing, no DOM. |
| `src/art.js` | Drawing: shapes merge into clean silhouettes with one bold ink outline, a cel-shaded edge and a highlight; three frames per sprite so the line shimmers. Shared rigs for four-legged animals, birds and people. |
| `src/main.js` | Rendering, input, HUD, saved progress. |

### What is a system and what is hand-authored

The rules in `sim.js` are few and general: things burn by material and spread
fire on contact, water puts fire out, creatures flee what they fear, eat what is
in their diet, hunt what they hunt, heavy things fall. Everything specific is
data in the dictionary.

The interesting part of doing it this way is how quickly category rules stop
being enough. Examples already in the dictionary:

- Humans flee monsters, but a cop stands their ground and will always stop for a donut.
- Predators hunt the courier, but a dog only chases cats, follows you around, and still scares the goat.
- A ghost is a monster that never hurts anyone.
- An elephant is afraid of nothing except a mouse.
- A shark out of water just flops.
- Trolls go for goats first.

That matches what the original developers said about their own object library:
the hierarchy gave a starting point, and most of the work was exceptions, one
object at a time.

## Controls

A/D or arrows walk, Space or W jumps and climbs, Enter writes a word, the mouse
drags things (right-click erases), E picks up, rides or launches, F uses what
you hold, Q drops it.

## Tests

```bash
node --test nounsense/test/lexicon.test.js
```

```bash
node nounsense/test/playtest.js
```

The first checks the dictionary and parser. The second needs Playwright; it
plays 22 scripted solutions and interactions in a headless browser, then spawns
every word with random adjectives and inputs to look for crashes.
`test/sheet.html` draws every object on one page.

## Not done yet

- Sound.
- More levels; the dictionary already knows many more things than this level needs.
- The "new way" (an LLM filling in the same object spec) for a side-by-side comparison.

Picking this up later? See [HANDOFF.md](./HANDOFF.md) for how to add words and levels, and what to watch out for.

Matter.js is vendored in `vendor/` under its MIT licence.
