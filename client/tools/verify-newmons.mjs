/**
 * Homage roster check: every new species and every REACHYMINI form must resolve
 * a real loaded sprite sheet at runtime (front, back and - for the shell forms -
 * the COVER pose), and a live battle must actually raise the shell.
 *
 * Run against `npm run preview`, or set URL= to hit production.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.URL || 'http://localhost:4173';
const OUT = 'tools/shots/newmons';
mkdirSync(OUT, { recursive: true });

const SPECIES = ['stackchan', 'reachymini', 'optimus', 'spot', 'spotarm', 'figure03', 'unitree', 'neo'];
const FORMS = ['snow', 'sky', 'lime', 'sun', 'ember', 'hallow', 'zebra', 'hf'];

const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 960, height: 640 } });
const errs = [];
const IGNORE = /\b(401|500)\b|\/api\//; // no backend under `vite preview`
p.on('pageerror', (e) => errs.push(`PAGEERROR: ${(e.stack || e.message).split('\n')[0]}`));
p.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text())) errs.push(`CONSOLE: ${m.text()}`); });

const fails = [];
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) fails.push(label);
};

// A B1 App Service can take a minute to warm after a deploy. `commit` resolves
// as soon as the response lands, and the real readiness gate is the game object
// - retrying goto() instead just interrupts the navigation already in flight.
await p.goto(URL, { waitUntil: 'commit', timeout: 180000 });
await p.waitForFunction(() => !!window.agentmon, null, { timeout: 180000 });
// `window.agentmon` exists the moment the loop starts, but BootScene is still
// downloading. Probing a sheet before its asset lands is meaningless, so wait
// for the loader to go idle rather than guessing with a sleep.
await p.waitForFunction(() => window.agentmon.assets.busy === false, null, { timeout: 180000 });
await p.waitForTimeout(1500);

// ---------------------------------------------------------------- textures
console.log('== loaded sprite sheets ==');
const shots = await p.evaluate(({ species, forms }) => {
  const g = window.agentmon;
  const probe = (key, form) => {
    const a = g.agent.createAgent(key, { level: 20, form });
    const sheet = g.agent.agentSpriteKey(a);
    const front = g.creatureSheet(sheet, false);
    const back = g.creatureSheet(sheet, true);
    const shut = g.creatureSheet(`${sheet}:cover`);
    return {
      key,
      form: a.form ?? null,
      sheet,
      front: !!front && front.frameCount('idle') > 0,
      back: !!back,
      cover: !!shut,
      types: g.agent.types(a).join('/'),
    };
  };
  return {
    base: species.map((k) => probe(k, null)),
    variants: forms.map((f) => probe('reachymini', f)),
  };
}, { species: SPECIES, forms: FORMS });

for (const r of shots.base) {
  check(r.front && r.back, `${r.key} front+back loaded`, `sheet=${r.sheet} types=${r.types}`);
}
for (const r of shots.variants) {
  check(!!r.form && r.front && r.back && r.cover,
    `reachymini ${r.form} front+back+cover loaded`, `sheet=${r.sheet} types=${r.types}`);
}
check(shots.base.find((r) => r.key === 'reachymini')?.cover === true, 'reachymini base has a COVER pose');
check(shots.base.filter((r) => r.key !== 'reachymini').every((r) => !r.cover),
  'no other species claims a COVER pose');

// ------------------------------------------------------------ live battle
console.log('\n== live battle ==');
const sceneName = () => p.evaluate(() => window.agentmon.scenes.top?.constructor?.name);
const tap = async (k, times = 1, ms = 300) => {
  for (let i = 0; i < times; i++) { await p.keyboard.press(k); await p.waitForTimeout(ms); }
};
// Adaptive rather than a fixed key sequence: a cold App Service spends far
// longer on the intro than `vite preview` does, so timing-based navigation
// silently ends up somewhere else entirely.
let scene = null;
for (let i = 0; i < 90; i++) {
  scene = await sceneName();
  if (scene === 'OverworldScene') break;
  if (scene === 'TitleScene') { await tap('Shift', 1, 700); await tap('z', 1, 500); continue; }
  if (scene === 'IntroScene') { await tap(i % 3 === 2 ? 'Shift' : 'z', 1, 500); continue; }
  await tap('z', 1, i < 30 ? 420 : 800);
}
check(scene === 'OverworldScene', 'reached the overworld', `scene=${scene}`);

await p.evaluate(() => {
  const g = window.agentmon;
  g.save.party.length = 0;
  g.save.party.push(g.agent.createAgent('reachymini', {
    level: 40, form: 'hf', moves: ['cover', 'many_hands'],
  }));
  g.scenes.top.startWildBattle(g.agent.createAgent('optimus', { level: 30, moves: ['tackle'] }));
});
await p.waitForFunction(() => {
  const s = window.agentmon.scenes.top;
  return !!s && s.constructor.name === 'BattleScene' && !!s.battle;
}, null, { timeout: 15000 });
await p.waitForTimeout(2600);
const live = await p.evaluate(() => {
  const g = window.agentmon;
  const b = g.scenes.top.battle;
  return {
    scene: g.scenes.top.constructor.name,
    foe: g.agent.agentSpriteKey(b.foeC.agent),
    mine: g.agent.agentSpriteKey(b.playerC.agent),
  };
});
check(live.scene === 'BattleScene' && live.foe === 'optimus' && live.mine === 'reachymini_hf',
  'a battle against OPTIMUS starts', `foe=${live.foe} player=${live.mine}`);
await p.locator('canvas').screenshot({ path: `${OUT}/optimus-vs-reachy-hf.png` });

// The pose has to follow the NARRATION, not the model: `checkFaints()` swaps
// the engine's combatant several events before the scene has drawn the KO, so
// anything read live is already the wrong unit. Drive the real menu and sample
// what the scene actually asks for, frame by frame.
await p.evaluate(() => {
  const g = window.agentmon;
  const sc = g.scenes.top;
  const orig = sc.sheetFor.bind(sc);
  window.__poses = [];
  sc.sheetFor = (side) => {
    const sheet = orig(side);
    if (side === 'player') {
      window.__poses.push(sheet === g.creatureSheet('reachymini_hf:cover'));
    }
    return sheet;
  };
});
// Wait for the command menu, then commit COVER through the scene's own path -
// exactly what the move menu does on confirm, minus the key timing.
await p.waitForFunction(() => window.agentmon.scenes.top?.mode === 'command',
  null, { timeout: 20000 });
await p.evaluate(() => {
  window.agentmon.scenes.top.runSequence({ kind: 'move', index: 0 });
});
await p.waitForTimeout(3600);
const drawn = await p.evaluate(() => ({
  frames: window.__poses.length,
  shut: window.__poses.filter(Boolean).length,
}));
check(drawn.shut > 0, 'the shut pose is what gets drawn',
  `${drawn.shut}/${drawn.frames} frames`);
await p.locator('canvas').screenshot({ path: `${OUT}/cover-pose.png` });

// ...and the model alone must never move it. This is the same rule that stops
// a KO from landing on the replacement instead of the unit that fainted.
const poked = await p.evaluate(() => {
  const g = window.agentmon;
  const sc = g.scenes.top;
  sc.view('player').covered = false;
  sc.battle.playerC.covered = true;
  const shut = sc.sheetFor('player') === g.creatureSheet('reachymini_hf:cover');
  sc.battle.playerC.covered = false;
  return { shut };
});
check(!poked.shut, 'the model alone cannot change the drawn pose');

await p.waitForTimeout(600);
const cover = await p.evaluate(async () => {
  const g = window.agentmon;
  const b = g.scenes.top.battle;
  // COVER is Protect-style: the odds halve on every consecutive use. The point
  // here is that a CLOSED shell eats the hit, not the ladder, so clear it.
  b.playerC.coverStreak = 0;
  const before = b.playerC.agent.hp;
  b.openTurn();
  const evs = b.closeTurn({ kind: 'move', index: 0 });
  return {
    events: evs.map((e) => e.t).join(','),
    raised: evs.some((e) => e.t === 'cover' && e.up),
    swung: evs.some((e) => e.t === 'useMove' && e.side === 'foe'),
    before,
    hp: b.playerC.agent.hp,
    max: g.agent.maxHp(b.playerC.agent),
  };
});
check(cover.raised, 'COVER raises the shell', cover.events.slice(0, 90));
check(cover.swung, 'the foe actually swung at the shell', cover.events.slice(0, 90));
check(cover.hp === cover.before, 'nothing got through the shell',
  `hp=${cover.hp}/${cover.max} (was ${cover.before})`);

await browser.close();
console.log(`\nerrors: ${errs.length ? errs.slice(0, 6).join('\n') : '(none)'}`);
const ok = !fails.length && !errs.length;
console.log(ok ? '\nNEWMONS OK' : `\nNEWMONS FAILED (${fails.length} check(s))`);
process.exit(ok ? 0 : 1);
