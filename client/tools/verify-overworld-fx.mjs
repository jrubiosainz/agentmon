/**
 * Proves the two overworld polish features and captures them:
 *   1. footstep particles (grass rustle + dust puffs)
 *   2. the region map scene
 *
 * Frames are grabbed with `toDataURL` from inside the page for the same reason
 * as shot-fx: Playwright's screenshot samples whenever the compositor feels
 * like it, which is essentially never the frame you care about.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL = process.env.URL || 'http://localhost:4173';
const OUT = 'tools/shots/overworld';
mkdirSync(OUT, { recursive: true });

const fail = (m) => { console.error(`FAIL: ${m}`); process.exitCode = 1; };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });

const probe = () => page.evaluate(() => window.agentmon.scenes.top?.constructor?.name);
const tap = async (k, times = 1, ms = 300) => {
  for (let i = 0; i < times; i++) { await page.keyboard.press(k); await page.waitForTimeout(ms); }
};
const shot = async (name) => {
  const png = await page.evaluate(() => document.querySelector('canvas').toDataURL('image/png'));
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(png.split(',')[1], 'base64'));
};

await page.goto(URL, { waitUntil: 'commit', timeout: 180000 });
await page.waitForFunction(() => !!window.agentmon, null, { timeout: 180000 });
await page.waitForFunction(
  () => window.agentmon.scenes.top && window.agentmon.scenes.top.constructor.name !== 'BootScene',
  null, { timeout: 180000 },
);
await page.waitForFunction(() => window.agentmon.assets.busy === false, null, { timeout: 180000 });

let scene = null;
for (let i = 0; i < 90; i++) {
  scene = await probe();
  if (scene === 'OverworldScene') break;
  if (scene === 'TitleScene') { await tap('Shift', 1, 700); await tap('z', 1, 500); continue; }
  if (scene === 'IntroScene') { await tap(i % 3 === 2 ? 'Shift' : 'z', 1, 500); continue; }
  await tap('z', 1, i < 30 ? 420 : 800);
}
if (scene !== 'OverworldScene') { console.error(`stuck on ${scene}`); process.exit(1); }
await page.waitForTimeout(1200);

// --------------------------------------------------------------------- //
// 1. Footstep particles
// --------------------------------------------------------------------- //
// Park the player on a grass tile with clear ground to the south, and disable
// encounters so a wild battle cannot interrupt the walk.
const placed = await page.evaluate(() => {
  const s = window.agentmon.scenes.top;
  s.loadMap('route1', 10, 30, 'down');
  for (let y = 4; y < 40; y++) {
    for (let x = 2; x < 24; x++) {
      if (!s.map.isEncounter(x, y)) continue;
      if (s.map.isEncounter(x, y + 1) && s.map.isEncounter(x, y + 2)) {
        s.loadMap('route1', x, y, 'down');
        return { x, y };
      }
    }
  }
  return null;
});
if (!placed) fail('found no 3-tall grass column on route1');
await page.waitForTimeout(700);

await page.evaluate(() => {
  const g = window.agentmon;
  g.save.repelSteps = 99999;
  window.__peak = 0;
  window.__frames = [];
  const cv = document.querySelector('canvas');
  const sample = () => {
    const s = g.scenes.top;
    if (s && s.fx && typeof s.fx.count === 'number') {
      if (s.fx.count > window.__peak) {
        window.__peak = s.fx.count;
        window.__frames = [{ n: s.fx.count, png: cv.toDataURL('image/png') }];
      }
    }
    window.__raf = requestAnimationFrame(sample);
  };
  window.__raf = requestAnimationFrame(sample);
});

await page.keyboard.down('ArrowDown');
await page.waitForTimeout(2000);
await page.keyboard.up('ArrowDown');
await page.waitForTimeout(300);

const grass = await page.evaluate(() => {
  cancelAnimationFrame(window.__raf);
  return { peak: window.__peak, frames: window.__frames };
});
if (grass.peak < 4) fail(`grass rustle spawned at most ${grass.peak} particles`);
if (grass.frames.length) {
  writeFileSync(`${OUT}/grass-rustle.png`, Buffer.from(grass.frames[0].png.split(',')[1], 'base64'));
}
console.log(`  grass rustle    peak ${grass.peak} particles`);

// Bare outdoor ground must puff dust, and an interior must stay clean.
const dusty = await page.evaluate(() => {
  const g = window.agentmon;
  g.scenes.top.loadMap('nullbyte_town', 10, 10, 'down');
  const m = g.scenes.top.map;
  const run = (fn) => {
    for (let y = 2; y < m.height - 2; y++) {
      for (let x = 4; x < m.width - 2; x++) {
        if (fn(x, y) && fn(x - 1, y) && fn(x - 2, y)) return { x, y };
      }
    }
    return null;
  };
  const open = (x, y) => !m.isSolid(x, y) && !m.isEncounter(x, y) && !m.warpAt(x, y);
  return {
    path: run((x, y) => open(x, y) && m.isDusty(x, y)),
    lawn: run((x, y) => open(x, y) && !m.isDusty(x, y)),
  };
});
if (!dusty.path) fail('found no 3-wide path run in nullbyte_town');
if (!dusty.lawn) fail('found no 3-wide lawn run in nullbyte_town');

const peakWhileWalking = async (map, x, y, dir, shot) => {
  await page.evaluate(({ m, px, py }) => {
    const g = window.agentmon;
    g.scenes.top.loadMap(m, px, py, 'down');
    g.save.repelSteps = 99999;
    g.scenes.top.fx.clear();
    window.__peak = 0;
    window.__shot = null;
    const cv = document.querySelector('canvas');
    const tickPeak = () => {
      const s = g.scenes.top;
      if (s && s.fx && s.fx.count > window.__peak) {
        window.__peak = s.fx.count;
        window.__shot = cv.toDataURL('image/png');
      }
      window.__raf2 = requestAnimationFrame(tickPeak);
    };
    window.__raf2 = requestAnimationFrame(tickPeak);
  }, { m: map, px: x, py: y });
  await page.waitForTimeout(400);
  await page.keyboard.down(dir);
  await page.waitForTimeout(1400);
  await page.keyboard.up(dir);
  await page.waitForTimeout(250);
  const r = await page.evaluate(() => {
    cancelAnimationFrame(window.__raf2);
    return { peak: window.__peak, png: window.__shot };
  });
  if (shot && r.png) writeFileSync(`${OUT}/${shot}.png`, Buffer.from(r.png.split(',')[1], 'base64'));
  return r.peak;
};

const outdoor = await peakWhileWalking('nullbyte_town', dusty.path.x, dusty.path.y, 'ArrowLeft', 'dust-puff');
const indoor = await peakWhileWalking('lab_ada', 6, 8, 'ArrowLeft');
const lawn = await peakWhileWalking('nullbyte_town', dusty.lawn.x, dusty.lawn.y, 'ArrowLeft');
if (outdoor < 3) fail(`path step produced ${outdoor} dust particles`);
if (indoor !== 0) fail(`indoor step produced ${indoor} particles (must be 0)`);
if (lawn !== 0) fail(`lawn step produced ${lawn} dust particles (must be 0)`);
console.log(`  dust puffs      path ${outdoor}, lawn ${lawn}, indoor ${indoor}`);

// --------------------------------------------------------------------- //
// 2. Region map
// --------------------------------------------------------------------- //
await page.evaluate(() => {
  const g = window.agentmon;
  g.scenes.top.loadMap('voltspire_city', 16, 16, 'down');
  if (!g.save.badges.includes('volt')) g.save.badges.push('volt');
  // Chart the early half so the "not charted yet" state is also visible.
  for (const id of ['nullbyte', 'route1', 'voltspire', 'route2']) g.save.flags[`visit:${id}`] = 1;
});
await page.waitForTimeout(600);

await tap('Shift', 1, 700);
if ((await probe()) !== 'StartMenuScene') fail('pause menu did not open');

const hasMap = await page.evaluate(
  () => window.agentmon.scenes.top.menu.items.some((i) => i.value === 'map'),
);
if (!hasMap) fail('MAP entry missing from the pause menu');

const idx = await page.evaluate(() => {
  const s = window.agentmon.scenes.top;
  s.menu.index = s.menu.items.findIndex((i) => i.value === 'map');
  return s.menu.index;
});
if (idx < 0) fail('MAP entry has no index');
await tap('z', 1, 800);

if ((await probe()) !== 'RegionMapScene') fail(`region map did not open (top=${await probe()})`);
await page.waitForTimeout(400);
await shot('regionmap-here');

// The player pin must sit on Voltspire, and the cursor must start there.
const state = await page.evaluate(() => {
  const s = window.agentmon.scenes.top;
  return { here: s.here?.id ?? null, index: s.index };
});
if (state.here !== 'voltspire') fail(`player pin is on ${state.here}, expected voltspire`);
console.log(`  region map      here=${state.here} cursor=${state.index}`);

// Walking the cursor east must reach the uncharted end of the chain.
await tap('ArrowRight', 5, 220);
await shot('regionmap-uncharted');
const far = await page.evaluate(() => {
  const s = window.agentmon.scenes.top;
  return { index: s.index, id: s.constructor.name };
});
if (far.index <= state.index) fail('cursor did not move east');
console.log(`  cursor walk     ${state.index} -> ${far.index}`);

// Every frame must differ from the previous scene, i.e. the map actually paints.
const painted = await page.evaluate(() => {
  const cv = document.querySelector('canvas');
  const ctx = cv.getContext('2d');
  const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
  const seen = new Set();
  for (let i = 0; i < d.length; i += 4 * 97) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
  return seen.size;
});
if (painted < 6) fail(`region map rendered only ${painted} distinct colours`);
console.log(`  colours         ${painted}`);

await tap('x', 1, 500);
if ((await probe()) !== 'StartMenuScene') fail('B did not close the region map');

await browser.close();
console.log(process.exitCode ? '\nOVERWORLD FX FAILED' : '\nOVERWORLD FX OK');
