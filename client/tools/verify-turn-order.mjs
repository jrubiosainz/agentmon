/**
 * You must never be asked to choose in the dark.
 *
 * The engine used to resolve a whole turn from a single `takeTurn(action)`, so
 * the player committed to a move and only then discovered that the faster foe
 * had already attacked - information that would often have changed the choice.
 *
 * The turn is now split: `openTurn()` settles the order and, when the foe wins
 * it, plays the foe's move out; only then does the command menu open, and
 * `closeTurn(action)` runs the player's choice followed by the foe's if it is
 * still pending.
 *
 * The invariants, checked against the real scene:
 *   1. nothing the foe does ever lands between the choice and its execution;
 *   2. when the foe opens the turn, the menu still comes back afterwards;
 *   3. each side acts at most once per turn.
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
  mode: window.agentmon.scenes.top?.mode,
  tick: window.agentmon.tick,
}));
const tap = async (k, times = 1, ms = 300) => {
  for (let i = 0; i < times; i++) { await page.keyboard.press(k); await page.waitForTimeout(ms); }
};

// ------------------------------------------------------------ reach the world
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction('!!window.agentmon', null, { timeout: 20000 });
await page.waitForTimeout(2200);
await tap('Shift', 1, 600);
await tap('z', 2, 600);
for (let i = 0; i < 12 && (await probe()).scene !== 'IntroScene'; i++) await tap('z', 1, 400);
await tap('z', 16, 700);
await tap('z', 2, 300);
await tap('Shift', 1, 800);
await tap('z', 1, 300);
await tap('Shift', 1, 1000);
for (let i = 0; i < 14 && (await probe()).scene !== 'OverworldScene'; i++) await tap('z', 1, 900);
await page.waitForTimeout(1200);

// Evenly matched and equally sturdy, so across a handful of turns the order
// lands both ways and neither side is knocked out before it can act.
await page.evaluate(() => {
  const g = window.agentmon;
  g.save.party.length = 0;
  g.save.party.push(g.agent.createAgent('stackbit', { level: 30, moves: ['tackle'] }));
  g.scenes.top.startWildBattle(g.agent.createAgent('chassik', { level: 30, moves: ['tackle'] }));
});
await page.waitForFunction(() => {
  const s = window.agentmon.scenes.top;
  return !!s && s.constructor.name === 'BattleScene' && !!s.battle;
}, null, { timeout: 15000 });

// --------------------------------------------------- instrument the real turns
// Wrapping the live Battle records exactly what the scene asked for and when,
// which is the only way to see the two halves of a turn from outside. IVs are
// rolled from an unseeded rng, so the SPEED stages are pinned by hand instead:
// the foe clearly opens the turn, and half way through the order is flipped.
await page.evaluate(() => {
  const g = window.agentmon;
  const b = g.scenes.top.battle;
  b.foeC.stages.spe = 6;
  window.__hp0 = { p: b.playerC.agent.hp, f: b.foeC.agent.hp };
  window.__turns = [];
  const sides = (events) => events.filter((e) => e.t === 'useMove').map((e) => e.side);
  if (typeof b.openTurn !== 'function') {
    // Old single-phase engine: the whole turn came out of one call, which is
    // exactly the bug. Record it so this harness fails on such a build.
    const take = b.takeTurn.bind(b);
    b.takeTurn = (...a) => {
      const r = take(...a);
      window.__turns.push({ phase: 'close', turn: b.turn, acted: sides(r), legacy: true });
      return r;
    };
  }
  const open = b.openTurn?.bind(b);
  const close = b.closeTurn?.bind(b);
  if (open) {
    b.openTurn = (...a) => {
      const r = open(...a);
      window.__turns.push({
        phase: 'open', turn: b.turn, foeWentFirst: r.foeWentFirst,
        playerActs: r.playerActs, acted: sides(r.events),
      });
      return r;
    };
    b.closeTurn = (...a) => {
      const r = close(...a);
      window.__turns.push({ phase: 'close', turn: b.turn, acted: sides(r) });
      return r;
    };
  }
  // The menu is what proves the player was actually given the choice back.
  window.__menus = [];
  let last = null;
  const watch = () => {
    const s = g.scenes.top;
    const mode = s && s.constructor.name === 'BattleScene' ? s.mode : null;
    if (mode !== last) {
      if (mode === 'command') window.__menus.push({ turn: b.turn, tick: g.tick });
      last = mode;
    }
    requestAnimationFrame(watch);
  };
  requestAnimationFrame(watch);
});
await page.waitForTimeout(3000);
const inBattle = await probe();
console.log('in battle:', JSON.stringify(inBattle));

// Play out several turns: FIGHT -> first move, then mash through the narration.
// HP is topped up between taps so neither side ever faints and the battle lasts
// long enough to see the order settle both ways.
for (let i = 0; i < 72; i++) {
  await page.evaluate((flip) => {
    const b = window.agentmon.scenes.top?.battle;
    if (!b) return;
    b.playerC.agent.hp = window.__hp0.p;
    b.foeC.agent.hp = window.__hp0.f;
    if (flip) { b.foeC.stages.spe = -6; b.playerC.stages.spe = 6; }
  }, i === 30);
  await page.keyboard.press('z');
  await page.waitForTimeout(240);
  if ((await probe()).scene !== 'BattleScene') break;
}

const turns = await page.evaluate(() => window.__turns);
const menus = await page.evaluate(() => window.__menus);
await page.locator('canvas').screenshot({ path: `${OUT}/turn-order.png` });
await browser.close();

// -------------------------------------------------------------- the invariants
const opens = turns.filter((t) => t.phase === 'open');
const closes = turns.filter((t) => t.phase === 'close');
const foeOpened = opens.filter((t) => t.foeWentFirst && t.acted.includes('foe'));
const playerOpened = opens.filter((t) => !t.foeWentFirst);

// 1. Once the player has chosen, the foe may only act after them.
const cutIn = closes.filter((t) => {
  const p = t.acted.indexOf('player');
  const f = t.acted.indexOf('foe');
  return f >= 0 && (p < 0 || f < p);
});
// 2. The player is never made to act during the opening half.
const earlyPlayer = opens.filter((t) => t.acted.includes('player'));
// 3. Nobody acts twice in one turn.
const doubled = turns.filter((t) =>
  t.acted.filter((s) => s === 'player').length > 1 || t.acted.filter((s) => s === 'foe').length > 1);
// 4. After a foe-opened turn the menu comes back, so the player still chooses.
const menuAfterFoeOpening = foeOpened.filter((t) =>
  t.playerActs && menus.some((m) => m.turn === t.turn)).length;

console.log(`\nturns opened:  ${opens.length}`);
console.log(`opened by foe: ${foeOpened.length}`);
console.log(`opened by you: ${playerOpened.length}`);
console.log(`turns closed:  ${closes.length}`);
console.log(`menus opened:  ${menus.length}`);

const fails = [];
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) fails.push(name);
};

check('the battle actually started', inBattle.scene === 'BattleScene');
check('several turns were played', opens.length >= 3 && closes.length >= 2, `open=${opens.length} close=${closes.length}`);
check('the foe opened at least one turn', foeOpened.length > 0, `${foeOpened.length} turns`);
check('the player opened at least one turn', playerOpened.length > 0, `${playerOpened.length} turns`);
check(
  'the foe never acts between the choice and its execution',
  cutIn.length === 0,
  cutIn.length ? JSON.stringify(cutIn[0]) : '',
);
check('the player never acts in the opening half', earlyPlayer.length === 0,
  earlyPlayer.length ? JSON.stringify(earlyPlayer[0]) : '');
check('nobody acts twice in one turn', doubled.length === 0,
  doubled.length ? JSON.stringify(doubled[0]) : '');
check('the menu returns after a foe-opened turn', menuAfterFoeOpening > 0, `${menuAfterFoeOpening} turns`);
check('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));

console.log(fails.length ? `\nTURN ORDER FAILED: ${fails.join(', ')}` : '\nTURN ORDER OK');
process.exit(fails.length ? 1 : 0);
