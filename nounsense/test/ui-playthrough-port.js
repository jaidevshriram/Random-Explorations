// Finish Port Nebula the way a player would: feed the star shark a fish, sail a boat to the galleon,
// climb the cargo net, and buy off the captain with treasure. Three words.
require('./ui-kit')(4, async (k) => {
  let s = await k.holdUntil(['d'], (s) => s.x >= 586, 90000); k.log('at the quay end', s);
  await k.place('boat', 680, 520); s = await k.st(); k.log('boat down', s);
  await k.place('fish', 900, 545); s = await k.waitUntil((s) => s.nat.shark.full, 120000); k.log('shark fed', s);
  await k.press('e'); s = await k.st(); k.log('aboard', s); k.need(s.mount === 'boat', 'board the boat');
  s = await k.holdUntil(['d'], (s) => s.x >= 1436, 300000); k.log('at the hull', s); k.need(s.x >= 1436, 'sail right up to the cargo net');   // stepping off short of the net means a swim
  await k.press('e'); s = await k.holdUntil(['w', 'd'], (s) => s.y < 372 && s.x > 1505, 240000); k.log('on deck', s); k.need(s.y < 380 && s.x > 1500, 'climb to the deck');
  await k.place('treasure', s.x + 170, 350); s = await k.waitUntil((s) => s.nat.captain.friendly, 240000); k.log('captain bought', s); k.need(s.nat.captain.friendly && s.seed, 'buy off the captain and keep the seed');
  s = await k.holdUntil(['d'], (s) => s.x >= 2330, 300000); k.log('end', s);
});
