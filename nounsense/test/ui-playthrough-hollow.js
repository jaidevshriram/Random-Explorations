// Finish Glowroot Hollow the way a player would: take a torch in hand (gremlins hate fire, and a torch left
// lying on a wooden bridge burns it), bridge the river, water the skyvine with a rain cloud, climb it, and burn
// the thornvines. Three words.
require('./ui-kit')(3, async (k) => {
  let s = await k.holdUntil(['d'], (s) => s.x >= 640, 90000); k.log('near the river', s);
  await k.place('torch', s.x + 34, 480); await k.press('e'); s = await k.st(); k.log('torch in hand', s); k.need(s.held === 'torch', 'pick up the torch');
  await k.place('bridge', 920, 470); s = await k.st(); k.log('bridge down', s);
  s = await k.holdUntil(['d'], (s) => s.x >= 1740, 240000); k.log('past the gremlin', s); k.need(s.x >= 1740 && s.seed, 'cross and pass the gremlin with the seed');
  await k.place('rain cloud', 1862, 200); s = await k.st(); k.log('cloud up', s);
  s = await k.waitUntil((s) => s.nat.vine.h >= 250, 400000); k.log('vine grown', s); k.need(s.nat.vine.h >= 250, 'grow the vine');
  const cloud = s.ents.find((e) => /cloud/.test(e.name)); if (cloud) await k.rightClick(cloud.x, cloud.y);   // send the rain away before walking a torch under it
  s = await k.st(); k.log('cloud erased', s);
  s = await k.holdUntil(['d'], (s) => s.x >= 1850, 60000); k.log('at the vine', s);
  s = await k.holdUntil(['w'], (s) => s.y < 286, 240000); k.log('climbed', s); k.need(s.y < 300, 'climb the vine');
  await k.page.keyboard.down('d'); await k.page.keyboard.press('Space'); s = await k.holdUntil(['d'], (s) => s.x >= 1960 && s.y < 300, 60000); await k.page.keyboard.up('d'); k.log('on the bluff', s); k.need(s.x >= 1900 && s.y < 300, 'step onto the bluff');
  s = await k.holdUntil(['d'], (s) => s.x >= 2070, 90000); k.log('at the thorns', s);
  await k.press('f'); s = await k.st(); k.log('lit', s);
  s = await k.holdUntil(['a'], (s) => s.x <= 1960, 60000);
  s = await k.waitUntil((s) => !s.nat.thorns || s.nat.thorns.gone, 400000); k.log('thorns gone', s); k.need(!s.nat.thorns || s.nat.thorns.gone, 'burn the thornvines');
  s = await k.holdUntil(['d'], (s) => s.x >= 2560, 240000); k.log('end', s);
});
