/** Screenshots each new species in a real battle, for review. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.URL || 'http://localhost:4173';
const OUT = 'tools/shots/newmons';
mkdirSync(OUT, { recursive: true });

const ROSTER = [
  ['stackchan', null], ['optimus', null], ['spot', null], ['spotarm', null],
  ['figure03', null], ['unitree', null], ['neo', null],
  ['reachymini', 'snow'], ['reachymini', 'sky'], ['reachymini', 'lime'],
  ['reachymini', 'sun'], ['reachymini', 'ember'], ['reachymini', 'hallow'],
  ['reachymini', 'zebra'], ['reachymini', 'hf'],
];

const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 960, height: 640 } });
await p.addInitScript(() => localStorage.setItem('agentmon.lang', 'es'));
await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
await p.waitForFunction(() => !!window.agentmon, null, { timeout: 60000 });
await p.waitForTimeout(2500);

const sceneName = () => p.evaluate(() => window.agentmon.scenes.top?.constructor?.name);
const tap = async (k, ms = 420) => { await p.keyboard.press(k); await p.waitForTimeout(ms); };
let scene = null;
for (let i = 0; i < 90; i++) {
  scene = await sceneName();
  if (scene === 'OverworldScene') break;
  if (scene === 'TitleScene') { await tap('Shift', 700); await tap('z', 500); continue; }
  if (scene === 'IntroScene') { await tap(i % 3 === 2 ? 'Shift' : 'z', 500); continue; }
  await tap('z', i < 30 ? 420 : 800);
}
if (scene !== 'OverworldScene') { console.log(`stuck on ${scene}`); process.exit(1); }

await p.evaluate(() => {
  const g = window.agentmon;
  g.save.party.length = 0;
  g.save.party.push(g.agent.createAgent('reachymini', {
    level: 45, form: 'hf', moves: ['cover', 'many_hands'],
  }));
});

for (const [key, form] of ROSTER) {
  await p.evaluate(([k, f]) => {
    const g = window.agentmon;
    const s = g.scenes.top;
    if (s.constructor.name === 'BattleScene') g.scenes.pop();
    window.__pending = [k, f];
  }, [key, form]);
  await p.waitForTimeout(900);
  await p.evaluate(() => {
    const g = window.agentmon;
    const [k, f] = window.__pending;
    g.scenes.top.startWildBattle(g.agent.createAgent(k, { level: 35, form: f, moves: ['tackle'] }));
  });
  await p.waitForFunction(() => {
    const s = window.agentmon.scenes.top;
    return !!s && s.constructor.name === 'BattleScene' && !!s.battle;
  }, null, { timeout: 20000 });
  await p.waitForTimeout(2400);
  const name = form ? `${key}_${form}` : key;
  await p.locator('canvas').screenshot({ path: `${OUT}/battle-${name}.png` });
  console.log(`shot ${name}`);
  await p.evaluate(() => { window.agentmon.scenes.pop(); });
  await p.waitForTimeout(1200);
}

await browser.close();
console.log('GALLERY OK');
