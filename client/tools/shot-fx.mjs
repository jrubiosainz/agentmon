/**
 * Captures the busiest frame of each move effect as a PNG, so the effects can
 * be eyeballed without playing through a battle for every one of them.
 *
 * The canvas is grabbed from inside the page (toDataURL) rather than via
 * Playwright's screenshot, because a screenshot samples whenever the compositor
 * gets round to it - which is almost never the peak frame of a 30-frame effect.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL = process.env.URL || 'http://localhost:4173';
const OUT = 'tools/shots/fx';
mkdirSync(OUT, { recursive: true });

const CASES = [
  { move: 'photon_beam', user: 'stackbit', foe: 'chassik' },
  { move: 'thunder_core', user: 'stackbit', foe: 'chassik' },
  { move: 'meltdown', user: 'stackbit', foe: 'chassik' },
  { move: 'absolute_zero', user: 'stackbit', foe: 'chassik' },
  { move: 'plasma_cutter', user: 'stackbit', foe: 'chassik' },
  { move: 'neural_storm', user: 'stackbit', foe: 'chassik' },
  { move: 'rivet_barrage', user: 'stackbit', foe: 'chassik' },
  { move: 'stack_trace', user: 'stackbit', foe: 'chassik' },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });

const probe = () => page.evaluate(() => window.agentmon.scenes.top?.constructor?.name);
const tap = async (k, times = 1, ms = 300) => {
  for (let i = 0; i < times; i++) { await page.keyboard.press(k); await page.waitForTimeout(ms); }
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

for (const c of CASES) {
  for (let i = 0; i < 60; i++) {
    if ((await probe()) === 'OverworldScene') break;
    await page.keyboard.press('z');
    await page.waitForTimeout(250);
  }

  await page.evaluate(({ mv, user, foe }) => {
    const g = window.agentmon;
    g.save.party.length = 0;
    g.save.party.push(g.agent.createAgent(user, { level: 60, moves: [mv] }));
    g.scenes.top.startWildBattle(g.agent.createAgent(foe, { level: 60, moves: ['tackle'] }));
  }, { mv: c.move, user: c.user, foe: c.foe });
  await page.waitForTimeout(2600);

  // Grab a filmstrip: one frame at each normalised point of the effect, so the
  // wind-up, the contact and the aftermath are all visible.
  await page.evaluate(() => {
    const g = window.agentmon;
    const cv = document.querySelector('canvas');
    const MARKS = [0.15, 0.32, 0.46, 0.58, 0.72, 0.88];
    window.__strip = [];
    let next = 0;
    const sample = () => {
      const s = g.scenes.top;
      if (s && s.fx && s.fx.spec && s.fxAttacker === 'player') {
        const k = s.fx.f / s.fx.dur;
        while (next < MARKS.length && k >= MARKS[next]) {
          window.__strip.push({ k: Math.round(k * 100), png: cv.toDataURL('image/png') });
          next++;
        }
      }
      window.__raf = requestAnimationFrame(sample);
    };
    window.__raf = requestAnimationFrame(sample);
  });

  await page.waitForFunction(() => window.agentmon.scenes.top?.mode === 'command', null, { timeout: 25000 })
    .catch(() => {});
  await tap('z', 1, 450);
  await page.waitForFunction(() => window.agentmon.scenes.top?.mode === 'moves', null, { timeout: 10000 })
    .catch(() => {});
  await tap('z', 1, 450);
  await page.waitForTimeout(2600);

  const strip = await page.evaluate(() => {
    cancelAnimationFrame(window.__raf);
    return window.__strip;
  });
  if (strip.length) {
    for (const [i, fr] of strip.entries()) {
      writeFileSync(`${OUT}/${c.move}-${i}.png`, Buffer.from(fr.png.split(',')[1], 'base64'));
    }
    console.log(`  ${c.move.padEnd(14)} ${strip.length} frames @ ${strip.map((f) => f.k + '%').join(' ')}`);
  } else {
    console.log(`  ${c.move.padEnd(14)} NO FRAME CAPTURED`);
  }

  for (let i = 0; i < 40; i++) {
    if ((await probe()) !== 'BattleScene') break;
    await page.evaluate(() => {
      const s = window.agentmon.scenes.top;
      if (s && s.battle) s.battle.foeC.agent.hp = 1;
    });
    await page.keyboard.press('z');
    await page.waitForTimeout(240);
  }
  await page.waitForTimeout(600);
}

await browser.close();
console.log('\nSHOTS OK');
