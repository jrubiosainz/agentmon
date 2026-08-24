/**
 * Every move must LOOK like itself.
 *
 * Before the FX layer existed all 76 moves rendered identically: attack pose,
 * shake, hit pose, and only the SFX changed. This harness proves the opposite
 * now holds, by driving real battles in the live build and measuring the pixels.
 *
 * Three invariants:
 *   1. Every move actually spawns an effect (a kind, particles, an impact).
 *   2. The effect changes the battlefield pixels versus the calm baseline.
 *   3. Moves of different kinds do NOT produce the same frame - which is the
 *      original "everything looks the same" bug, stated as a measurement.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.URL || 'http://localhost:4173';
const OUT = 'tools/shots/fx';
mkdirSync(OUT, { recursive: true });

// One move per visual family, so a collision between any two is a real bug.
const CASES = [
  { move: 'photon_beam', kind: 'beam' },
  { move: 'thunder_core', kind: 'bolt' },
  { move: 'meltdown', kind: 'burst' },
  { move: 'absolute_zero', kind: 'shards' },
  { move: 'tackle', kind: 'strike' },
  { move: 'plasma_cutter', kind: 'slash' },
  { move: 'stack_trace', kind: 'orb' },
  { move: 'neural_storm', kind: 'spiral' },
  { move: 'rivet_barrage', kind: 'barrage' },
  { move: 'payload', kind: 'motes' },
];

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

// ---------------------------------------------------------------- run a case
/**
 * Starts a fresh battle whose only move is `move`, samples the battlefield every
 * frame, and returns the effect telemetry plus the busiest frame's signature.
 */
async function runCase(move) {
  // Wait for the overworld: the previous case's battle must be fully unwound or
  // `startWildBattle` will not exist on the scene we are talking to.
  for (let i = 0; i < 60; i++) {
    if ((await probe()).scene === 'OverworldScene') break;
    await page.keyboard.press('z');
    await page.waitForTimeout(250);
  }
  if ((await probe()).scene !== 'OverworldScene') return { error: 'not back in the overworld' };

  // A tanky pair on both sides: the fight must survive long enough to sample,
  // and neither side may faint mid-measurement.
  await page.evaluate((mv) => {
    const g = window.agentmon;
    g.save.party.length = 0;
    g.save.party.push(g.agent.createAgent('stackbit', { level: 60, moves: [mv] }));
    g.scenes.top.startWildBattle(g.agent.createAgent('chassik', { level: 60, moves: ['tackle'] }));
  }, move);
  await page.waitForTimeout(3000);
  if ((await probe()).scene !== 'BattleScene') return { error: 'never entered battle' };

  await page.evaluate(() => {
    const g = window.agentmon;
    const cv = document.querySelector('canvas');
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    window.__fx = { frames: [], maxParticles: 0, impacts: 0, maxShake: 0 };

    // Signature of the battlefield only: the HUD and textbox change on their own
    // (typewriter, HP bars) and would mask the effect we are trying to measure.
    const sig = () => {
      const w = cv.width;
      const h = cv.height;
      const d = ctx.getImageData(0, 0, w, Math.floor(h * 0.62)).data;
      let a = 0;
      let b = 0;
      let lum = 0;
      for (let i = 0; i < d.length; i += 4 * 37) {
        const v = d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7;
        a = (a * 31 + v) | 0;
        b = (b + v * (i + 1)) | 0;
        lum += d[i] + d[i + 1] + d[i + 2];
      }
      return { a, b, lum };
    };

    const sample = () => {
      const s = g.scenes.top;
      if (s && s.fx) {
        const fx = s.fx;
        const kind = fx.spec ? fx.spec.kind : null;
        const parts = fx.field ? fx.field.count : 0;
        // `fxAttacker` is the only way to tell the player's effect from the
        // foe's: both sides fire during a turn and only ours is under test.
        window.__fx.frames.push({
          t: g.tick,
          kind,
          parts,
          by: s.fxAttacker || null,
          impact: !!fx.impact,
          shake: fx.shake || 0,
          mode: s.mode,
          ...sig(),
        });
      }
      window.__raf = requestAnimationFrame(sample);
    };
    window.__raf = requestAnimationFrame(sample);
  });

  // Wait for the command menu. With the two-phase turn the foe may act first,
  // and pressing A blindly would page its narration instead of choosing FIGHT.
  try {
    await page.waitForFunction(
      () => window.agentmon.scenes.top?.mode === 'command',
      null,
      { timeout: 25000 },
    );
  } catch {
    return { error: 'command menu never opened' };
  }
  // FIGHT -> the only move, then let the effect play out untouched.
  await tap('z', 1, 450);
  await page.waitForFunction(() => window.agentmon.scenes.top?.mode === 'moves', null, { timeout: 10000 })
    .catch(() => {});
  await tap('z', 1, 450);
  await page.waitForTimeout(3000);

  const data = await page.evaluate(() => {
    cancelAnimationFrame(window.__raf);
    return { frames: window.__fx.frames };
  });

  // Leave the battle so the next case starts clean.
  for (let i = 0; i < 40; i++) {
    if ((await probe()).scene !== 'BattleScene') break;
    await page.evaluate(() => {
      const s = window.agentmon.scenes.top;
      if (s && s.battle) s.battle.foeC.agent.hp = 1;
    });
    await page.keyboard.press('z');
    await page.waitForTimeout(240);
  }
  await page.waitForTimeout(700);
  return data;
}

// ------------------------------------------------------------------ measure
const results = [];
for (const c of CASES) {
  const r = await runCase(c.move);
  if (r.error) {
    results.push({ ...c, ...r, activeFrames: 0, kinds: [] });
    console.log(`  ${c.move.padEnd(14)} ERROR ${r.error}`);
    continue;
  }
  // Only frames belonging to OUR attack count: the foe fires in the same turn.
  const mine = r.frames.filter((f) => f.by === 'player' && f.kind);
  const calm = r.frames.find((f) => !f.kind) ?? null;
  const peak = mine.length
    ? mine.reduce((best, f) => (f.parts > best.parts ? f : best), mine[0])
    : null;
  const row = {
    ...c,
    activeFrames: mine.length,
    kinds: [...new Set(mine.map((f) => f.kind))],
    maxParticles: mine.reduce((m, f) => Math.max(m, f.parts), 0),
    impacts: mine.filter((f) => f.impact).length,
    maxShake: mine.reduce((m, f) => Math.max(m, f.shake), 0),
    peak: peak ? `${peak.a}:${peak.b}` : null,
    peakLum: peak ? peak.lum : 0,
    calmLum: calm ? calm.lum : 0,
  };
  results.push(row);
  console.log(
    `  ${c.move.padEnd(14)} kinds=${(row.kinds.join(',') || '-').padEnd(9)} ` +
    `frames=${String(row.activeFrames).padStart(3)} parts=${String(row.maxParticles).padStart(3)} ` +
    `impacts=${row.impacts} shake=${row.maxShake}`,
  );
}

await page.locator('canvas').screenshot({ path: `${OUT}/last.png` });
await browser.close();

// ---------------------------------------------------------------- invariants
const fails = [];
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) fails.push(name);
};

console.log('\n--- effects ---');
for (const r of results) {
  check(`${r.move} played`, !r.error && r.activeFrames > 0, r.error || `${r.activeFrames} frames`);
  if (r.error) continue;
  check(`${r.move} used kind '${r.kind}'`, r.kinds.includes(r.kind), `saw [${r.kinds.join(',')}]`);
  check(`${r.move} connected`, r.impacts > 0, `${r.impacts} impacts`);
  check(`${r.move} emitted particles`, r.maxParticles > 0, `${r.maxParticles} peak`);
  check(`${r.move} shook the field`, r.maxShake > 0, `${r.maxShake}px`);
  check(`${r.move} changed the screen`, r.peakLum !== r.calmLum, `peak≠calm`);
}

console.log('\n--- distinctness ---');
// The whole point: two different families must not draw the same frame.
const ok = results.filter((r) => !r.error && r.peak);
const seen = new Map();
let clashes = 0;
for (const r of ok) {
  const prev = seen.get(r.peak);
  if (prev) { clashes++; console.log(`     clash: ${prev} and ${r.move} render identically`); }
  seen.set(r.peak, r.move);
}
check('all cases produced a peak frame', ok.length === CASES.length, `${ok.length}/${CASES.length}`);
check('no two moves render the same frame', clashes === 0, `${seen.size} distinct of ${ok.length}`);

console.log('\n--- errors ---');
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));

console.log(fails.length ? `\nFX FAILED: ${fails.join(', ')}` : '\nFX OK');
process.exit(fails.length ? 1 : 0);
