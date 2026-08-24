/**
 * Trainer VS card harness.
 *
 * Two halves:
 *
 *  A. Deterministic frame sweep. The card is stepped by hand (`advance()`)
 *     rather than by rAF, so every screenshot lands on a known frame and the
 *     assertions do not race the compositor.
 *
 *  B. Live integration. Walks into a real gym trainer and proves the card plays
 *     AND tears down. A stuck curtain is this project's known failure mode; a
 *     stuck full-screen overlay would be the same bug wearing a new hat.
 *
 * Usage:  npm run preview   (another shell)
 *         node tools/verify-vs.mjs          [URL=https://... to target prod]
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const URL = process.env.URL ?? 'http://localhost:4173';
const OUT = 'tools/shots/vs';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exitCode = 1;
}

function ok(msg, detail = '') {
  console.log(`  ok   ${msg}${detail ? `  ${detail}` : ''}`);
}

// One goto, never retried: the app is CSP-locked and a reload mid-boot leaves
// the audio graph half-built.
await page.goto(URL, { waitUntil: 'commit', timeout: 180000 });
await page.waitForFunction(() => !!window.agentmon?.scenes, null, { timeout: 120000 });

const tap = async (key, times = 1, wait = 260) => {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key);
    await page.waitForTimeout(wait);
  }
};

const top = () => page.evaluate(() => window.agentmon.scenes.top.constructor.name);

// Boot through title -> intro -> lab -> overworld. START is Shift, not Enter.
let scene = '';
for (let i = 0; i < 90; i++) {
  scene = await top();
  if (scene === 'OverworldScene') break;
  if (scene === 'TitleScene') { await tap('Shift', 1, 700); await tap('z', 1, 500); continue; }
  if (scene === 'StarterScene') { await tap('z', 1, 600); continue; }
  if (scene === 'IntroScene') { await tap(i % 3 === 2 ? 'Shift' : 'z', 1, 500); continue; }
  await tap('z', 1, i < 30 ? 420 : 800);
}
if (scene !== 'OverworldScene') { console.error(`stuck on ${scene}`); process.exit(1); }
await page.waitForTimeout(900);

/** Grabs the internal 240x160 buffer, not the DOM. */
const shot = async (name) => {
  const url = await page.evaluate(() => document.querySelector('canvas').toDataURL('image/png'));
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
};

/** Downsampled RGB grid at console resolution, plus the mean channels. */
const sample = () => page.evaluate(() => {
  const cv = document.querySelector('canvas');
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const { data, width, height } = ctx.getImageData(0, 0, cv.width, cv.height);
  const step = Math.max(1, Math.round(width / 120));
  const px = [];
  let r = 0; let gg = 0; let b = 0; let warm = 0;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      px.push(data[i], data[i + 1], data[i + 2]);
      r += data[i]; gg += data[i + 1]; b += data[i + 2];
      // A gold pixel: bright, and decisively redder than it is blue.
      if (data[i] > 150 && data[i] - data[i + 2] > 60) warm++;
    }
  }
  const n = px.length / 3;
  return { px, r: r / n, g: gg / n, b: b / n, n, warm };
});

const diff = (a, b) => {
  let n = 0;
  for (let i = 0; i < a.px.length; i += 3) {
    if (Math.abs(a.px[i] - b.px[i]) > 10 || Math.abs(a.px[i + 1] - b.px[i + 1]) > 10
      || Math.abs(a.px[i + 2] - b.px[i + 2]) > 10) n++;
  }
  return n / a.n;
};

const luma = (s) => 0.299 * s.r + 0.587 * s.g + 0.114 * s.b;

// ---------------------------------------------------------------------- //
// A. Deterministic frame sweep
// ---------------------------------------------------------------------- //
console.log('\n--- frame sweep ---');

const before = await sample();

// Park the card on the scene without running the sequence, then step it.
const put = (frame) => page.evaluate((f) => {
  const s = window.agentmon.scenes.top;
  if (!s.vs) s.vs = new window.agentmon.vsintro.VsIntro('BRIX', 'trainer_gym1');
  s.vs.frame = f;
}, frame);

const MARKS = [
  { f: 6, name: 'vs-01-slam' },
  { f: 20, name: 'vs-02-portrait' },
  { f: 40, name: 'vs-03-badge' },
  { f: 60, name: 'vs-04-plate' },
  { f: 88, name: 'vs-05-hold' },
];

const frames = [];
for (const m of MARKS) {
  await put(m.f);
  await page.waitForTimeout(180);
  frames.push({ ...m, s: await sample() });
  await shot(m.name);
}

// The card must HIDE the map, not sit politely on top of part of it: the
// diagonal must overshoot the screen or a triangle of live overworld survives
// in a corner, which is exactly the artefact this gate exists to catch.
const covered = diff(before, frames.at(-1).s);
if (covered < 0.95) fail(`the VS card leaves the map showing (${(covered * 100).toFixed(0)}% covered)`);
else ok('the card covers the overworld', `${(covered * 100).toFixed(0)}% of pixels`);

// It must be darker than the sunlit map, or it is not a VS card, it is a mess.
if (luma(frames.at(-1).s) >= luma(before)) fail('the VS card is not darker than the map');
else ok('the card dims the scene', `luma ${luma(before).toFixed(0)} -> ${luma(frames.at(-1).s).toFixed(0)}`);

// Every beat must look different from the one before it: that is the animation.
for (let i = 1; i < frames.length; i++) {
  const d = diff(frames[i - 1].s, frames[i].s);
  if (d < 0.02) fail(`frames ${frames[i - 1].f} and ${frames[i].f} are the same (${(d * 100).toFixed(1)}%)`);
  else ok(`beat ${frames[i - 1].f} -> ${frames[i].f} animates`, `${(d * 100).toFixed(0)}%`);
}

// The badge and the name plate are gold on navy. Counting warm pixels is the
// honest probe; the MEAN red falls as the dark panels swallow the sunlit map,
// so a mean-channel test would report the opposite of the truth.
const slam = frames[0].s;
const settled = frames.at(-1).s;
if (settled.warm <= slam.warm + 20) fail(`the VS badge/plate never lit up (warm ${slam.warm} -> ${settled.warm})`);
else ok('the badge and plate light up', `warm px ${slam.warm} -> ${settled.warm}`);

await page.evaluate(() => { window.agentmon.scenes.top.vs = null; });
await page.waitForTimeout(200);

// ---------------------------------------------------------------------- //
// B. Live integration - it must play, and it must tear down
// ---------------------------------------------------------------------- //
console.log('\n--- live trainer battle ---');

// Hand ourselves a party that can actually fight, then stand in the gym.
await page.evaluate(() => {
  const g = window.agentmon;
  const s = g.scenes.top;
  g.save.party.length = 0;
  g.save.party.push(g.agent.createAgent('boltkin', { level: 40 }));
  s.loadMap('gym_volt', 8, 14, 'up');
  s.updateCamera(true);
});
await page.waitForTimeout(700);

// Watch for the overlay while the scripted battle runs.
await page.evaluate(() => {
  window.__vsSeen = 0;
  window.__vsPeak = 0;
  const s = window.agentmon.scenes.top;
  window.__vsPoll = setInterval(() => {
    if (s.vs) {
      window.__vsSeen++;
      window.__vsPeak = Math.max(window.__vsPeak, s.vs.frame);
    }
  }, 16);
});

// Walk up until a trainer spots us and the battle actually opens.
let reached = '';
for (let i = 0; i < 90; i++) {
  reached = await top();
  if (reached === 'BattleScene') break;
  await page.keyboard.press(i % 5 === 4 ? 'z' : 'ArrowUp');
  await page.waitForTimeout(150);
}

const seen = await page.evaluate(() => {
  clearInterval(window.__vsPoll);
  return { seen: window.__vsSeen, peak: window.__vsPeak };
});

if (reached !== 'BattleScene') fail(`never reached a battle (stuck on ${reached})`);
else ok('a real trainer battle started');

if (seen.seen < 3) fail(`the VS card never appeared during the battle start (${seen.seen} samples)`);
else ok('the card played on the way in', `${seen.seen} samples, peak frame ${seen.peak}`);

if (seen.peak < 40) fail(`the card was cut off at frame ${seen.peak}, expected it to run past the badge`);
else ok('the card ran past the VS badge', `frame ${seen.peak}`);

const cleared = await page.evaluate(() => {
  const st = window.agentmon.scenes;
  const ow = st.stack.find((s) => s.constructor.name === 'OverworldScene');
  return { vs: ow ? ow.vs : 'no-overworld', covered: st.top.game?.transitions?.covered ?? null };
});
if (cleared.vs !== null) fail(`the VS card is still on screen after the battle opened (${cleared.vs})`);
else ok('the card tore down');

await shot('vs-06-battle');

if (errors.length) fail(`page errors: ${errors.join(' | ')}`);
else ok('no page errors');

await browser.close();
if (process.exitCode) console.error('\nVS FAILED');
else console.log('\nVS OK');
