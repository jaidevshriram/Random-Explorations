/* Lexicon: turns a typed phrase ("giant friendly dragon") into an object spec
 * by walking the category tree, then applying adjectives. No guessing: a word
 * that is not in the dictionary is refused, with the nearest known word offered.
 */
(function (NN) {
  'use strict';
  const D = NN.dict;

  // word -> canonical noun / adjective
  const nounIndex = new Map();
  const adjIndex = new Map();
  for (const name of Object.keys(D.nouns)) nounIndex.set(name, name);
  for (const [name, list] of Object.entries(D.synonyms)) {
    if (!D.nouns[name]) throw new Error('synonyms for unknown noun: ' + name);
    for (const s of list) if (!nounIndex.has(s)) nounIndex.set(s, name);
  }
  for (const name of Object.keys(D.adjectives)) adjIndex.set(name, name);
  for (const [name, list] of Object.entries(D.adjSynonyms)) {
    if (!D.adjectives[name]) throw new Error('synonyms for unknown adjective: ' + name);
    for (const s of list) if (!adjIndex.has(s)) adjIndex.set(s, name);
  }

  function inherit(name) {
    const chain = [];
    let c = D.nouns[name];
    while (c) { chain.unshift(c); c = c.is ? D.categories[c.is] : null; }
    const spec = { tags: [] };
    for (const layer of chain) {
      for (const [k, v] of Object.entries(layer)) {
        if (k === 'is') continue;
        if (k === 'tags') spec.tags = spec.tags.concat(v);
        else spec[k] = Array.isArray(v) && k !== 'art' ? v.slice() : (v && typeof v === 'object' && k !== 'art' ? Object.assign({}, v) : v);
      }
    }
    spec.noun = name;
    spec.kind = chain.map((l) => l.is).filter(Boolean);
    return spec;
  }

  function lookupNoun(words) {
    const tryWord = (w) => {
      if (nounIndex.has(w)) return nounIndex.get(w);
      if (w.endsWith('ies') && nounIndex.has(w.slice(0, -3) + 'y')) return nounIndex.get(w.slice(0, -3) + 'y');
      if (w.endsWith('es') && nounIndex.has(w.slice(0, -2))) return nounIndex.get(w.slice(0, -2));
      if (w.endsWith('s') && nounIndex.has(w.slice(0, -1))) return nounIndex.get(w.slice(0, -1));
      return null;
    };
    // longest run of trailing words that names something ("hot air balloon")
    for (let start = 0; start < words.length; start++) {
      const n = tryWord(words.slice(start).join(' '));
      if (n) return { noun: n, start };
    }
    return null;
  }

  function editDistance(a, b) {
    const m = a.length, n = b.length;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  function nearest(word, index) {
    let best = null, bd = Infinity;
    for (const k of index.keys()) {
      if (Math.abs(k.length - word.length) > 2) continue;
      const d = editDistance(word, k);
      if (d < bd) { bd = d; best = k; }
    }
    return bd <= (word.length <= 4 ? 1 : 2) ? best : null;
  }

  function resolve(phrase) {
    const words = String(phrase || '').toLowerCase().replace(/[^a-z\s-]/g, ' ').replace(/-/g, ' ').split(/\s+/)
      .filter((w) => w && !['a', 'an', 'the', 'some', 'my', 'one', 'very', 'really', 'and'].includes(w));
    if (!words.length) return { ok: false, error: 'Write a word first.' };
    if (words.length > 6) return { ok: false, error: 'That is a lot of words. Try a noun with one or two adjectives.' };
    const hit = lookupNoun(words);
    if (!hit) {
      const last = words[words.length - 1];
      const guess = nearest(words.join(' '), nounIndex) || nearest(last, nounIndex);
      return { ok: false, unknown: last, suggestion: guess ? words.slice(0, -1).filter((w) => adjIndex.has(w)).concat(guess).join(' ') : null,
        error: `"${last}" is not in the notebook.` };
    }
    const adjs = [];
    for (const w of words.slice(0, hit.start)) {
      const a = adjIndex.get(w);
      if (!a) {
        const guess = nearest(w, adjIndex);
        return { ok: false, unknown: w, suggestion: guess ? words.map((x) => (x === w ? guess : x)).join(' ') : words.slice(hit.start).join(' '),
          error: `"${w}" is not a describing word the notebook knows.` };
      }
      if (!adjs.includes(a)) adjs.push(a);
    }
    const spec = inherit(hit.noun);
    for (const a of adjs) D.adjectives[a](spec);
    if (spec.flammable === undefined) spec.flammable = !!(D.materials[spec.material] || {}).flammable;
    if (spec.fireproof) spec.flammable = false;
    spec.adjs = adjs;
    spec.name = adjs.concat(displayName(hit.noun)).join(' ');
    return { ok: true, spec, noun: hit.noun, adjs, name: spec.name };
  }

  const pretty = { airballoon: 'hot air balloon', raincloud: 'rain cloud', blackhole: 'black hole', duckie: 'rubber duck', teddy: 'teddy bear', pogo: 'pogo stick', carpet: 'magic carpet', can: 'tin can' };
  function displayName(noun) { return pretty[noun] || noun; }

  NN.lexicon = { resolve, displayName, nounCount: Object.keys(D.nouns).length, wordCount: nounIndex.size, adjCount: adjIndex.size,
    nouns: () => Object.keys(D.nouns), isNoun: (w) => nounIndex.has(w) };
})(typeof window !== 'undefined' ? window.NN : globalThis.NN);
