/**
 * End-to-end battle check: a real wild battle must start, be playable and
 * return the player to the overworld with the screen visible.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.URL || 'http://localhost:4173';
const OUT = 'tools/shots/battle';
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 960, height: 640 } });
const errs = [];
const IGNORE = /\b(401|500)\b|\/api\//; // no backend under `vite preview`
p.on('pageerror', (e) => errs.push('PAGEERROR: ' + (e.stack || e.message).split('\n')[0]));
p.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text())) errs.push('CONSOLE: ' + m.text()); });

const probe = () => p.evaluate(() => {
  const g = window.agentmon;
  return {
    scene: g.scenes.top?.constructor?.name,
    depth: g.scenes.depth,
    covered: !!g.transitions?.isCovered,
    stuck: g.transitions?.stuckFrames ?? -1,
    party: g.save.party.length,
    tick: g.tick,
  };
});
const tap = async (k, times = 1, ms = 300) => {
  for (let i = 0; i < times; i++) { await p.keyboard.press(k); await p.waitForTimeout(ms); }
};
const colors = () => p.evaluate(() => {
  const c = document.querySelector('canvas');
  const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
  const seen = new Set();
  for (let i = 0; i < d.length; i += 4 * 97) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
  return seen.size;
});

await p.goto(URL, { waitUntil: 'networkidle' });
await p.waitForTimeout(2200);
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

// Give the player a real starter, exactly as the lab would.
await p.evaluate(() => {
  const g = window.agentmon;
  if (!g.save.party.length) g.save.party.push(g.agent.createAgent('stackbit', { level: 12 }));
});
console.log('before:', JSON.stringify(await probe()));

await p.evaluate(() => {
  const g = window.agentmon;
  g.scenes.top.startWildBattle(g.agent.createAgent('boltkin', { level: 5 }));
});
await p.waitForTimeout(3000);
const inBattle = await probe();
console.log('in battle:', JSON.stringify(inBattle), 'colors=', await colors());
await p.locator('canvas').screenshot({ path: `${OUT}/in-battle.png` });

// Fight it out.
for (let i = 0; i < 40; i++) {
  await p.keyboard.press('z');
  await p.waitForTimeout(260);
  if ((await probe()).scene === 'OverworldScene') break;
}
await p.waitForTimeout(2500);
const after = await probe();
const c = await colors();
console.log('after:', JSON.stringify(after), 'colors=', c);
await p.locator('canvas').screenshot({ path: `${OUT}/after-battle.png` });

await b.close();
const ok = inBattle.scene === 'BattleScene'
  && after.scene === 'OverworldScene' && !after.covered && c > 1 && !errs.length;
console.log('\nerrors:', errs.length ? errs.slice(0, 6).join('\n') : '(none)');
console.log(ok ? '\nBATTLE ROUND-TRIP OK' : '\nBATTLE ROUND-TRIP FAILED');
process.exit(ok ? 0 : 1);
