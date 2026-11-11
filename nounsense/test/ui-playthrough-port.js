// Finish Port Nebula the way a player would: feed the star shark a fish, sail a boat to the galleon,
// climb the cargo net, and buy off the captain with treasure. Three words.
require('./ui-kit')(4, async (k) => {
  let s = await k.holdUntil(['d'], (s) => s.x >= 586, 90000); k.log('at the quay end', s);
  await k.place('boat', 680, 520); s = await k.st(); k.log('boat down', s);
  await k.place('fish', 900, 545); s = await k.waitUntil((s) => s.nat.shark.full, 120000); k.log('shark fed', s);
  await k.press('e'); s = await k.st(); k.log('aboard', s);
  s = await k.holdUntil(['d'], (s) => s.x >= 1385, 300000); k.log('at the hull', s);
  await k.press('e'); s = await k.holdUntil(['w', 'd'], (s) => s.y < 372 && s.x > 1505, 240000); k.log('on deck', s);
  await k.place('treasure', s.x + 170, 350); s = await k.waitUntil((s) => s.nat.captain.friendly, 240000); k.log('captain bought', s);
  s = await k.holdUntil(['d'], (s) => s.x >= 2330, 300000); k.log('end', s);
});
