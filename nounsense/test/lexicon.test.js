// node --test nounsense/test
const test = require('node:test');
const assert = require('node:assert');
globalThis.NN = {};
require('../src/dictionary.js');
require('../src/lexicon.js');
const L = NN.lexicon;

test('every noun resolves to itself and has art and a size', () => {
  for (const n of L.nouns()) {
    const r = L.resolve(L.displayName(n));
    assert.ok(r.ok, n);
    assert.strictEqual(r.noun, n);
    assert.ok(r.spec.art, n + ' art');
    assert.ok(r.spec.w > 0 && r.spec.h > 0, n + ' size');
  }
});
test('inheritance: a goat is a herbivore is an animal is a creature', () => {
  const s = L.resolve('goat').spec;
  assert.ok(s.alive && s.tags.includes('prey') && s.tags.includes('animal') && s.tags.includes('goat'));
  assert.ok(s.diet.includes('paper'), 'goat override: eats paper');
});
test('hand-authored exceptions beat category rules', () => {
  assert.deepStrictEqual(L.resolve('cop').spec.fears, []);          // humans flee monsters; cops do not
  assert.ok(L.resolve('elephant').spec.fears.includes('mouse'));
  assert.strictEqual(L.resolve('ghost').spec.dmg, 0);               // a monster that never hurts
});
test('synonyms, plurals and multi-word nouns', () => {
  assert.strictEqual(L.resolve('puppy').noun, 'dog');
  assert.strictEqual(L.resolve('goats').noun, 'goat');
  assert.strictEqual(L.resolve('a hot air balloon').noun, 'airballoon');
});
test('adjectives stack on the noun', () => {
  const s = L.resolve('giant friendly dragon').spec;
  assert.ok(s.w > 200 && s.rideable && s.hunts.length === 0);
  assert.strictEqual(L.resolve('metal bridge').spec.flammable, false);
  assert.strictEqual(L.resolve('bridge').spec.flammable, true);
});
test('unknown words are refused, with a suggestion when one is close', () => {
  assert.strictEqual(L.resolve('xylophone').ok, false);
  assert.strictEqual(L.resolve('brigde').suggestion, 'bridge');
  assert.strictEqual(L.resolve('gaint rock').suggestion, 'giant rock');
});
