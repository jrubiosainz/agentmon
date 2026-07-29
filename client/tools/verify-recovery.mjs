/**
 * Verifies the game can no longer be wedged on a black screen.
 *
 * Each case forces a failure that used to leave the transition curtain down
 * forever, then asserts the player is back in control within a few seconds.
 */
import { chromium } from 'playwright';

const URL = process.env.URL || 'http://localhost:4173';

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 960, height: 640 } });
const errs = [];
p.on('pageerror', (e) => errs.push('PAGEERROR: ' + (e.stack || e.message).split('\n')[0]));

const probe = () => p.evaluate(() => {
  const g = window.agentmon;
  return {
    scene: g.scenes.top?.constructor?.name,
    depth: g.scenes.depth,
    covered: !!g.transitions?.isCovered,
    busy: !!g.transitions?.busy,
    stuck: g.transitions?.stuckFrames ?? -1,
    tick: g.tick,
  };
});
const tap = async (k, times = 1, ms = 300) => {
  for (let i = 0; i < times; i++) { await p.keyboard.press(k); await p.waitForTimeout(ms); }
};
/** True when the canvas is not a solid single colour. */
const canvasAlive = () => p.evaluate(() => {
  const c = document.querySelector('canvas');
  const g = c.getContext('2d', { willReadFrequently: true });
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const seen = new Set();
  for (let i = 0; i < d.length; i += 4 * 97) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
  return seen.size;
});

await p.goto(URL, { waitUntil: 'networkidle' });
await p.waitForTimeout(2200);
// Same key sequence smoke.mjs uses to clear the title and naming screens.
await tap('Shift', 1, 600);
await tap('z', 2, 600);
for (let i = 0; i < 12 && (await probe()).scene !== 'IntroScene'; i++) await tap('z', 1, 400);
await tap('z', 16, 700);
await tap('z', 2, 300);
await tap('Shift', 1, 800);
await tap('z', 1, 300);
await tap('Shift', 1, 1000);
for (let i = 0; i < 14 && (await probe()).scene !== 'OverworldScene'; i++) await tap('z', 1, 900);
await p.waitForTimeout(1200);
console.log('start:', JSON.stringify(await probe()));

const results = [];
const check = async (name, fn) => {
  await fn();
  await p.waitForTimeout(3500);
  const s = await probe();
  const colors = await canvasAlive();
  // Wedged means: curtain down, nothing animating, and a flat canvas.
  const wedged = s.covered && !s.busy && s.stuck > 120;
  const t0 = s.tick;
  await p.waitForTimeout(600);
  const ticking = (await probe()).tick > t0;
  const ok = !wedged && ticking && colors > 1;
  results.push({ name, ok, ...s, colors, ticking });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify({ ...s, colors, ticking })}`);
  // Return to a sane state.
  await tap('x', 4, 150);
  await tap('z', 6, 200);
};

// 1. Battle whose enter() rejects (the exact original crash: empty party).
await check('battle with empty party', () => p.evaluate(() => {
  const g = window.agentmon;
  g.save.party = [];
  const s = g.scenes.top;
  s.startWildBattle?.(g.agent.createAgent('stackbit', { level: 5 }));
}));

// 2. Any scene whose enter() throws, pushed while the curtain is down.
await check('scene enter() throws under a curtain', () => p.evaluate(async () => {
  const g = window.agentmon;
  g.transitions.cover();
  const Base = Object.getPrototypeOf(Object.getPrototypeOf(g.scenes.top)).constructor;
  class Broken extends Base {
    enter() { throw new Error('synthetic enter failure'); }
    update() { this.nope.x++; }
    render() { this.nope.x++; }
  }
  try { await g.scenes.push(new Broken()); } catch { /* expected */ }
}));

// 3. A curtain left down by a lost await - the watchdog must lift it.
await check('orphaned curtain is auto-recovered', () => p.evaluate(() => {
  window.agentmon.transitions.cover();
}));

await b.close();
const failed = results.filter((r) => !r.ok);
console.log('\nerrors:', errs.length ? errs.slice(0, 6).join('\n') : '(none)');
console.log(failed.length ? `\n${failed.length} CASE(S) FAILED` : '\nALL CASES RECOVERED');
process.exit(failed.length ? 1 : 0);
