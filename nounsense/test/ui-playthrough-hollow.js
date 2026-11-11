// Finish Glowroot Hollow the way a player would: bridge the river, carry a torch (gremlins hate fire),
// water the skyvine with a rain cloud, climb it, and burn the thornvines. Three words.
require('./ui-kit')(3, async (k) => {
  let s = await k.holdUntil(['d'], (s) => s.x >= 690, 90000); k.log('at the river', s);
  await k.place('bridge', 920, 470); s = await k.st(); k.log('bridge down', s);
  await k.place('torch', s.x + 40, 480); await k.press('e'); s = await k.st(); k.log('torch in hand', s);
  s = await k.holdUntil(['d'], (s) => s.x >= 1740, 240000); k.log('past the gremlin', s);
  await k.place('rain cloud', 1862, 200); s = await k.st(); k.log('cloud up', s);
  s = await k.waitUntil((s) => s.nat.vine.h >= 250, 400000); k.log('vine grown', s);
  const cloud = s.ents.find((e) => /cloud/.test(e.name)); if (cloud) await k.rightClick(cloud.x, cloud.y);   // send the rain away before walking a torch under it
  s = await k.st(); k.log('cloud erased', s);
  s = await k.holdUntil(['d'], (s) => s.x >= 1850, 60000); k.log('at the vine', s);
  s = await k.holdUntil(['w'], (s) => s.y < 286, 240000); k.log('climbed', s);
  await k.page.keyboard.down('d'); await k.page.keyboard.press('Space'); s = await k.holdUntil(['d'], (s) => s.x >= 1960 && s.y < 300, 60000); await k.page.keyboard.up('d'); k.log('on the bluff', s);
  s = await k.holdUntil(['d'], (s) => s.x >= 2070, 90000); k.log('at the thorns', s);
  await k.press('f'); s = await k.st(); k.log('lit', s);
  s = await k.holdUntil(['a'], (s) => s.x <= 1960, 60000);
  s = await k.waitUntil((s) => s.nat.thorns.gone, 400000); k.log('thorns gone', s);
  s = await k.holdUntil(['d'], (s) => s.x >= 2560, 240000); k.log('end', s);
});
