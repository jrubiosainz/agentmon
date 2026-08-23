/**
 * The HP bars must narrate the turn, not the model.
 *
 * `Battle.takeTurn()` resolves a whole turn up front, so by the time the first
 * frame is drawn the model already holds the end-of-turn HP for *both* sides.
 * A bar that chases the model therefore drains the player's own health while
 * their attack is still playing - the "my attack hurts me too" bug.
 *
 * The invariant: damage is animated one event at a time, so no single frame may
 * ever drain both bars at once.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.URL || 'http://localhost:4173';
const OUT = 'tools/shots/battle';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
const errs = [];
const IGNORE = /\b(401|500)\b|\/api\//; // no backend under `vite preview`
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + (e.stack || e.message).split('\n')[0]));
page.on('console', (m) => {
  if (m.type() === 'error' && !IGNORE.test(m.text())) errs.push('CONSOLE: ' + m.text());
});

const probe = () => page.evaluate(() => ({
  scene: window.agentmon.scenes.top?.constructor?.name,
  tick: window.agentmon.tick,
}));
const tap = async (k, times = 1, ms = 300) => {
  for (let i = 0; i < times; i++) { await page.keyboard.press(k); await page.waitForTimeout(ms); }
};

// ------------------------------------------------------------ reach the world
// `commit` + explicit readiness gates: a cold B1 App Service takes far longer
// than `vite preview`, and a fixed key sequence silently lands somewhere else.
await page.goto(URL, { waitUntil: 'commit', timeout: 180000 });
await page.waitForFunction(() => !!window.agentmon, null, { timeout: 180000 });
await page.waitForFunction(
  () => window.agentmon.scenes.top && window.agentmon.scenes.top.constructor.name !== 'BootScene',
  null,
  { timeout: 180000 },
);
await page.waitForFunction(() => window.agentmon.assets.busy === false, null, { timeout: 180000 });

let scene = null;
for (let i = 0; i < 90; i++) {
  scene = (await probe()).scene;
  if (scene === 'OverworldScene') break;
  if (scene === 'TitleScene') { await tap('Shift', 1, 700); await tap('z', 1, 500); continue; }
  if (scene === 'IntroScene') { await tap(i % 3 === 2 ? 'Shift' : 'z', 1, 500); continue; }
  await tap('z', 1, i < 30 ? 420 : 800);
}
if (scene !== 'OverworldScene') {
  console.error(`never reached the overworld (stuck on ${scene})`);
  process.exit(1);
}
await page.waitForTimeout(1200);

// A slow, sturdy starter against a foe that survives a hit and strikes back, so
// the turn definitely contains damage in both directions.
await page.evaluate(() => {
  const g = window.agentmon;
  g.save.party.length = 0;
  g.save.party.push(g.agent.createAgent('stackbit', { level: 30, moves: ['tackle'] }));
  g.scenes.top.startWildBattle(g.agent.createAgent('chassik', { level: 30, moves: ['tackle'] }));
});
await page.waitForTimeout(3200);
const inBattle = await probe();
console.log('in battle:', JSON.stringify(inBattle));

// ------------------------------------------------------------- sample frames
await page.evaluate(() => {
  const g = window.agentmon;
  window.__bars = [];
  const sample = () => {
    const s = g.scenes.top;
    if (s && typeof s.pHpShown === 'number') {
      window.__bars.push({
        t: g.tick,
        p: s.pHpShown,
        f: s.fHpShown,
        msg: s.message,
        scene: s.constructor.name,
      });
    }
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
});

// Play out a few turns: FIGHT -> first move, then mash through the narration.
for (let i = 0; i < 26; i++) {
  await page.keyboard.press('z');
  await page.waitForTimeout(260);
  if ((await probe()).scene !== 'BattleScene') break;
}

const bars = await page.evaluate(() => window.__bars);
await page.locator('canvas').screenshot({ path: `${OUT}/bars.png` });
await browser.close();

// -------------------------------------------------------------- the invariant
const EPS = 0.05;
const both = [];
let pMoved = 0;
let fMoved = 0;
for (let i = 1; i < bars.length; i++) {
  const a = bars[i - 1];
  const c = bars[i];
  if (c.scene !== 'BattleScene' || a.scene !== 'BattleScene') continue;
  const dp = a.p - c.p;
  const df = a.f - c.f;
  if (dp > EPS) pMoved++;
  if (df > EPS) fMoved++;
  if (dp > EPS && df > EPS) both.push({ t: c.t, dp: +dp.toFixed(2), df: +df.toFixed(2), msg: c.msg });
}

console.log(`\nframes sampled: ${bars.length}`);
console.log(`frames draining the player: ${pMoved}`);
console.log(`frames draining the foe:    ${fMoved}`);

const fails = [];
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) fails.push(name);
};

check('the battle actually started', inBattle.scene === 'BattleScene');
check('the foe took visible damage', fMoved > 0, `frames=${fMoved}`);
check('the player took visible damage', pMoved > 0, `frames=${pMoved}`);
check(
  'the two bars never drain in the same frame',
  both.length === 0,
  both.length ? `${both.length} frames, first ${JSON.stringify(both[0])}` : '',
);
check('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));

console.log(fails.length ? `\nBATTLE BARS FAILED: ${fails.join(', ')}` : '\nBATTLE BARS OK');
process.exit(fails.length ? 1 : 0);
