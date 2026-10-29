// Render the arena lighting showcase frame by frame (deterministic clocks), JPEG per frame.
const { chromium } = require('playwright');
const fs = require('fs');
const [, , from = '0', to = '900', fps = '30', outDir = 'frames', times = '', prog = 'main'] = process.argv;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1536, height: 1300 } });
  p.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await p.goto('file://' + require('path').resolve(__dirname, '..', 'arena.html') + '?still&show=' + prog + '&pscale=' + (process.env.PSCALE || '0.5') + (process.env.SEAT ? '&seat=' + process.env.SEAT : '') + '&t=0', { timeout: 120000 });
  await p.waitForFunction(() => window.__scene, null, { timeout: 100000 });
  // a song cue sheet for the music programme
  if (process.env.SONG) await p.evaluate(c => { window.SONG = c; }, JSON.parse(fs.readFileSync(process.env.SONG, 'utf8')));
  // another seat: set it explicitly (re-projection takes a moment, once)
  if (process.env.SEAT) await p.evaluate(s => { if (window.__arena.SEATS) window.__arena.setView(window.__arena.SEATS[s]); }, process.env.SEAT);
  const t0 = Date.now();
  let last = Date.now();
  const list = times ? times.split(',').map(Number) : null;
  for (let f = +from; f < +to; f++) {
    if (list && !list.includes(f)) continue;
    const du = await p.evaluate(t => {
      const S = window.__scene;
      // lights run the showcase timeline; performer and crowd keep their own motion
      S.state.clocks.lights = t;
      S.state.clocks.performer = t + 2;
      S.state.clocks.audience = t + 5;
      // line boil: every frame the brushwork is repainted a little differently, like hand-made animation
      const f = Math.round(t * 15);
      S.painter.P.boil = [(f * 0.6180339) % 1, (f * 0.4142135) % 1];
      // and the lights are redrawn a touch differently each frame too
      S.state.handmade = true;
      S.state.boilF = f;
      S.render(true);
      return document.getElementById('c').toDataURL('image/jpeg', 0.94);
    }, f / +fps);
    fs.writeFileSync(`${outDir}/f${String(f).padStart(4, '0')}.jpg`, Buffer.from(du.split(',')[1], 'base64'));
    if (f % 30 === 0 || list) { console.log(`frame ${f} (${((Date.now() - t0) / 1000) | 0}s, ${Date.now() - last}ms)`); }
    last = Date.now();
  }
  await b.close();
  console.log('done');
})();
