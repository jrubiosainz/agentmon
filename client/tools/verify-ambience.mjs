/**
 * Proves the ambience layer:
 *   1. route weather (rain / storm / fog / ash) exists, animates and is visible
 *   2. the outdoor-only guard - interiors get no weather and no time wash
 *   3. the day/night cycle tints, and that midday is the untouched palette
 *   4. that a battle started outdoors inherits both
 *
 * "Visible" is measured, not assumed: every effect is compared against the SAME
 * map rendered with the effect switched off. A weather layer that silently
 * renders nothing would otherwise pass every structural check.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL = process.env.URL || 'http://localhost:4173';
const OUT = 'tools/shots/ambience';
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

/**
 * Moving pixels between two frames, counted in GAME pixels (240x160) rather
 * than screen pixels. The canvas is nearest-neighbour upscaled, so sampling at
 * the device scale recovers the logical frame exactly - and lets a threshold be
 * stated as "at least N game pixels moved", which is a number you can reason
 * about instead of a percentage that swings with the window size.
 */
const motion = (ms) => page.evaluate(async (wait) => {
  const cv = document.querySelector('canvas');
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const scale = Math.max(1, Math.round(cv.width / 240));
  const grab = () => {
    const { data, width, height } = ctx.getImageData(0, 0, cv.width, cv.height);
    const out = [];
    for (let y = 0; y < height; y += scale) {
      for (let x = 0; x < width; x += scale) {
        const i = (y * width + x) * 4;
        out.push(data[i], data[i + 1], data[i + 2]);
      }
    }
    return out;
  };
  const a = grab();
  await new Promise((r) => setTimeout(r, wait));
  const b = grab();
  let n = 0;
  for (let i = 0; i < a.length; i += 3) {
    if (Math.abs(a[i] - b[i]) > 10 || Math.abs(a[i + 1] - b[i + 1]) > 10
      || Math.abs(a[i + 2] - b[i + 2]) > 10) n++;
  }
  return n;
}, ms);

/** Downsampled RGB grid plus mean channels - enough to diff frames cheaply. */
const sample = () => page.evaluate(() => {
  const cv = document.querySelector('canvas');
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const { data, width, height } = ctx.getImageData(0, 0, cv.width, cv.height);
  const grid = [];
  let r = 0, g = 0, b = 0, n = 0;
  const step = Math.max(1, Math.round(width / 60));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      grid.push(data[i], data[i + 1], data[i + 2]);
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
  }
  return { grid, r: r / n, g: g / n, b: b / n };
});

/** Fraction of sample points that moved by more than a quantisation step. */
const diff = (a, b) => {
  let n = 0;
  const len = Math.min(a.grid.length, b.grid.length);
  for (let i = 0; i < len; i += 3) {
    if (Math.abs(a.grid[i] - b.grid[i]) > 10
      || Math.abs(a.grid[i + 1] - b.grid[i + 1]) > 10
      || Math.abs(a.grid[i + 2] - b.grid[i + 2]) > 10) n++;
  }
  return n / (len / 3);
};

const luma = (s) => 0.299 * s.r + 0.587 * s.g + 0.114 * s.b;
/** Positive = warmer than neutral. Dusk and morning must both push this up. */
const warmth = (s) => s.r - s.b;

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
await page.waitForTimeout(1000);

// Pin midday so the weather section is not also measuring a night wash.
await page.evaluate(() => {
  window.agentmon.daynight.setDayPhase('day');
  window.agentmon.save.repelSteps = 999999;
});

// --------------------------------------------------------------------- //
// 1. Route weather
// --------------------------------------------------------------------- //
// `minMoved` is in GAME pixels (of 240x160 = 38400). The four effects have
// wildly different screen coverage - a drifting fog sheet touches everything,
// 40 ash embers touch a few hundred pixels - so one shared percentage would
// either pass a dead layer or fail a live one.
const CASES = [
  { map: 'route2', x: 20, y: 11, kind: 'rain', settle: 260, minMoved: 100 },
  { map: 'route3', x: 11, y: 20, kind: 'storm', settle: 260, minMoved: 150 },
  { map: 'cachewood', x: 13, y: 20, kind: 'fog', settle: 700, minMoved: 600 },
  { map: 'terraflux_city', x: 15, y: 20, kind: 'ash', settle: 600, minMoved: 50 },
];

const frames = {};
for (const c of CASES) {
  await page.evaluate(({ m, x, y }) => {
    window.agentmon.scenes.top.loadMap(m, x, y, 'down');
  }, { m: c.map, x: c.x, y: c.y });
  await page.waitForTimeout(500);

  const kind = await page.evaluate(() => window.agentmon.scenes.top.weather?.kind ?? null);
  if (kind !== c.kind) fail(`${c.map} weather is ${kind}, expected ${c.kind}`);

  const moved = await motion(c.settle);
  if (moved < c.minMoved) {
    fail(`${c.kind} did not animate (${moved} game px moved, want >= ${c.minMoved})`);
  }
  const b = await sample();
  await shot(`weather-${c.kind}`);
  frames[c.kind] = b;

  // Same map, same camera, weather switched off: the delta is the layer itself.
  await page.evaluate(() => {
    const s = window.agentmon.scenes.top;
    s.weather = new (s.weather.constructor)(null);
  });
  await page.waitForTimeout(220);
  const off = await sample();
  const visible = diff(b, off);
  if (visible < 0.05) fail(`${c.kind} is invisible (${(visible * 100).toFixed(1)}% of pixels differ with it off)`);
  console.log(`  ${c.kind.padEnd(6)}         moved ${String(moved).padStart(5)} px  visible ${(visible * 100).toFixed(0)}%`);
}

// Each weather must look like itself and not like its neighbours.
const kinds = Object.keys(frames);
for (let i = 0; i < kinds.length; i++) {
  for (let j = i + 1; j < kinds.length; j++) {
    const d = diff(frames[kinds[i]], frames[kinds[j]]);
    if (d < 0.15) fail(`${kinds[i]} and ${kinds[j]} render near-identically (${(d * 100).toFixed(0)}%)`);
  }
}

// --------------------------------------------------------------------- //
// 2. Indoor guard
// --------------------------------------------------------------------- //
const guard = await page.evaluate(() => {
  const g = window.agentmon;
  const gym = g.maps.GYM_VOLT;
  const before = gym.weather;
  gym.weather = 'storm';
  g.scenes.top.loadMap('gym_volt', 5, 12, 'down');
  const indoorKind = g.scenes.top.weather?.kind ?? null;
  const indoorAmb = g.scenes.top.ambience();
  gym.weather = before;
  g.scenes.top.loadMap('route3', 11, 20, 'down');
  const outdoorAmb = g.scenes.top.ambience();
  return { indoorKind, indoorAmb, outdoorAmb };
});
if (guard.indoorKind !== null) fail(`indoor map built weather "${guard.indoorKind}" (must be null)`);
if (guard.indoorAmb.weather !== null || guard.indoorAmb.phase) {
  fail(`indoor ambience leaked ${JSON.stringify(guard.indoorAmb)}`);
}
if (guard.outdoorAmb.weather !== 'storm' || !guard.outdoorAmb.phase) {
  fail(`outdoor ambience is ${JSON.stringify(guard.outdoorAmb)}`);
}
console.log(`  indoor guard    weather=${guard.indoorKind} phase=${guard.indoorAmb.phase ?? 'none'}`);

// --------------------------------------------------------------------- //
// 3. Day / night cycle
// --------------------------------------------------------------------- //
if (await page.evaluate(() => window.agentmon.daynight.dayTint('day') !== null)) {
  fail('midday applies a tint; noon must be the untouched palette');
}

await page.evaluate(() => {
  window.agentmon.scenes.top.loadMap('nullbyte_town', 12, 12, 'down');
});
await page.waitForTimeout(500);

const phases = {};
for (const p of ['morning', 'day', 'dusk', 'night']) {
  await page.evaluate((ph) => window.agentmon.daynight.setDayPhase(ph), p);
  await page.waitForTimeout(260);
  phases[p] = await sample();
  await shot(`day-${p}`);
}

for (const p of ['morning', 'dusk', 'night']) {
  const d = diff(phases.day, phases[p]);
  if (d < 0.5) fail(`${p} barely differs from midday (${(d * 100).toFixed(0)}% of pixels)`);
}
if (luma(phases.night) >= luma(phases.day) - 12) {
  fail(`night (${luma(phases.night).toFixed(0)}) is not clearly darker than day (${luma(phases.day).toFixed(0)})`);
}
for (const p of ['morning', 'dusk']) {
  if (warmth(phases[p]) <= warmth(phases.day) + 6) {
    fail(`${p} is not warmer than midday (${warmth(phases[p]).toFixed(0)} vs ${warmth(phases.day).toFixed(0)})`);
  }
}
console.log(
  `  day/night       luma day ${luma(phases.day).toFixed(0)} night ${luma(phases.night).toFixed(0)}`
  + `  warmth dusk +${(warmth(phases.dusk) - warmth(phases.day)).toFixed(0)}`,
);

// Interiors must ignore the clock entirely.
await page.evaluate(() => {
  window.agentmon.daynight.setDayPhase('day');
  window.agentmon.scenes.top.loadMap('lab_ada', 6, 8, 'down');
});
await page.waitForTimeout(450);
const labDay = await sample();
await page.evaluate(() => window.agentmon.daynight.setDayPhase('night'));
await page.waitForTimeout(450);
const labNight = await sample();
const leak = diff(labDay, labNight);
if (leak > 0.02) fail(`night washed an interior (${(leak * 100).toFixed(0)}% of pixels changed)`);
console.log(`  interior clock  ${(leak * 100).toFixed(0)}% drift (must be ~0)`);

// --------------------------------------------------------------------- //
// 4. Battles inherit the ambience
// --------------------------------------------------------------------- //
await page.evaluate(() => {
  const g = window.agentmon;
  g.daynight.setDayPhase('night');
  g.scenes.top.loadMap('route3', 11, 20, 'down');
  g.save.party.length = 0;
  g.save.party.push(g.agent.createAgent('stackbit', { level: 40, moves: ['tackle'] }));
  g.scenes.top.startWildBattle(g.agent.createAgent('chassik', { level: 40, moves: ['tackle'] }));
});
await page.waitForTimeout(3600);
if ((await probe()) !== 'BattleScene') fail('never entered the battle');
else {
  const inherited = await page.evaluate(() => {
    const s = window.agentmon.scenes.top;
    return { kind: s.weather?.kind ?? null, phase: s.payload?.phase ?? null };
  });
  if (inherited.kind !== 'storm') fail(`battle weather is ${inherited.kind}, expected storm`);
  if (inherited.phase !== 'night') fail(`battle phase is ${inherited.phase}, expected night`);
  await page.waitForTimeout(500);
  await shot('battle-storm-night');
  console.log(`  battle inherits weather=${inherited.kind} phase=${inherited.phase}`);
}

await page.evaluate(() => window.agentmon.daynight.setDayPhase(null));
await browser.close();
if (!process.exitCode) console.log('AMBIENCE OK');
