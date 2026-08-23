/**
 * Gym gauntlet + script-crash guard.
 *
 * Two bugs live here:
 *
 * 1. `busy` gates every overworld input. A script that rejects used to escape
 *    `talkTo()` before `busy = false`, so a single bad item key bricked the
 *    game - no walking, no talking, no cancelling. Three gift NPCs shipped that
 *    way. The guard is a `try/catch/finally`, and it is verified by making a
 *    script throw on purpose.
 *
 * 2. A gym is a gauntlet. Every challenger on the floor has to be beaten before
 *    the leader will accept, so slipping past a sight line only postpones it.
 *
 * Run against `npm run preview`, or set URL= to hit production.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.URL || 'http://localhost:4173';
const OUT = 'tools/shots/gyms';
mkdirSync(OUT, { recursive: true });

const GYMS = [
  { map: 'gym_volt', leader: 'gym1_leader' },
  { map: 'gym_data', leader: 'gym2_leader' },
  { map: 'gym_thermal', leader: 'gym3_leader' },
];

const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 960, height: 640 } });
const errs = [];
const IGNORE = /\b(401|500)\b|\/api\//; // no backend under `vite preview`
p.on('pageerror', (e) => errs.push(`PAGEERROR: ${(e.stack || e.message).split('\n')[0]}`));
p.on('console', (m) => {
  if (m.type() !== 'error') return;
  // The crash guard is SUPPOSED to log; anything else is a real error.
  if (/agentmon: script ".*" failed/.test(m.text())) return;
  if (!IGNORE.test(m.text())) errs.push(`CONSOLE: ${m.text()}`);
});

const fails = [];
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) fails.push(label);
};

await p.goto(URL, { waitUntil: 'commit', timeout: 180000 });
await p.waitForFunction(() => !!window.agentmon, null, { timeout: 180000 });
await p.waitForTimeout(2500);

const sceneName = () => p.evaluate(() => window.agentmon.scenes.top?.constructor?.name);
const tap = async (k, times = 1, ms = 300) => {
  for (let i = 0; i < times; i++) { await p.keyboard.press(k); await p.waitForTimeout(ms); }
};
let scene = null;
for (let i = 0; i < 90; i++) {
  scene = await sceneName();
  if (scene === 'OverworldScene') break;
  if (scene === 'TitleScene') { await tap('Shift', 1, 700); await tap('z', 1, 500); continue; }
  if (scene === 'IntroScene') { await tap(i % 3 === 2 ? 'Shift' : 'z', 1, 500); continue; }
  await tap('z', 1, i < 30 ? 420 : 800);
}
check(scene === 'OverworldScene', 'reached the overworld', `scene=${scene}`);

/** Advance dialogue until the scene is idle again, or give up. */
async function drain(limit = 40) {
  for (let i = 0; i < limit; i++) {
    const busy = await p.evaluate(() => window.agentmon.scenes.top.busy);
    if (!busy) return true;
    await tap('z', 1, 140);
  }
  return false;
}

// ------------------------------------------------------------- gift scripts
console.log('\n== gift scripts ==');
const gifts = await p.evaluate(async () => {
  const g = window.agentmon;
  const sc = g.scenes.top;
  const ids = ['gift_toolkit', 'gift_rarechip', 'gift_fullreset',
    'gift_gym1_aid', 'gift_gym2_aid', 'gift_gym3_aid'];
  const out = [];
  for (const id of ids) {
    // Skip the dialogue: we only care that the item resolves and nothing throws.
    const say = sc.say.bind(sc);
    sc.say = async () => {};
    let threw = null;
    const before = g.save.bag.map((s) => `${s.key}:${s.count}`).join(',');
    try { await sc.runScript(id); } catch (e) { threw = String(e && e.message || e); }
    const after = g.save.bag.map((s) => `${s.key}:${s.count}`).join(',');
    sc.say = say;
    out.push({ id, threw, gained: before !== after });
  }
  return out;
});
for (const r of gifts) {
  check(!r.threw && r.gained, `${r.id} hands over a real item`,
    r.threw ? `threw ${r.threw}` : (r.gained ? '' : 'bag unchanged'));
}

// ------------------------------------------------------- the crash guard
console.log('\n== crash guard ==');
// `recoverFromScript` shows a "..." box, which waits for A - exactly what a
// player would see - so the call cannot be awaited from inside `evaluate`.
// Kick it off, drive the box from the outside, then read `busy` back.
await p.evaluate(() => {
  const sc = window.agentmon.scenes.top;
  const orig = sc.runScript.bind(sc);
  sc.runScript = async () => { throw new Error('deliberate script failure'); };
  const npc = { x: sc.player.x, y: sc.player.y + 1, facing: 'up', def: { id: 'probe', script: 'boom' } };
  window.__talk = { done: false };
  void sc.talkTo(npc).then(() => { window.__talk.done = true; sc.runScript = orig; });
});
const handedBack = await drain(60);
const guard = await p.evaluate(() => ({
  done: window.__talk.done,
  busy: window.agentmon.scenes.top.busy,
  scene: window.agentmon.scenes.top.constructor.name,
}));
check(handedBack && guard.done && guard.busy === false,
  'a throwing script still hands control back', JSON.stringify(guard));

// And the overworld has to keep responding: walk a step and see the tile change.
const moved = await p.evaluate(() => {
  const sc = window.agentmon.scenes.top;
  return { x: sc.player.x, y: sc.player.y };
});
await tap('ArrowLeft', 2, 260);
await tap('ArrowRight', 2, 260);
const after = await p.evaluate(() => {
  const sc = window.agentmon.scenes.top;
  return { scene: sc.constructor.name, busy: sc.busy, x: sc.player.x, y: sc.player.y };
});
check(after.scene === 'OverworldScene' && !after.busy,
  'the overworld is still playable afterwards',
  `from=${moved.x},${moved.y} to=${after.x},${after.y}`);

// ------------------------------------------------------------ the gauntlet
console.log('\n== gym gauntlet ==');
for (const gym of GYMS) {
  const info = await p.evaluate(async ({ map, leader }) => {
    const g = window.agentmon;
    const sc = g.scenes.top;
    const def = g.maps.getMap(map);
    const challengers = (def.npcs || []).filter((n) => n.trainer && n.trainer !== leader);
    const required = g.trainers.TRAINERS[leader].requires || [];

    // Clear every relevant flag, then ask the leader while the floor is unbeaten.
    for (const k of [...required, leader]) delete g.save.flags[`beat:${k}`];
    const lines = [];
    const say = sc.say.bind(sc);
    sc.say = async (...l) => { lines.push(...l); };
    let fought = 0;
    const battle = sc.runTrainerBattle.bind(sc);
    sc.runTrainerBattle = async () => { fought++; return 'win'; };

    await sc.runScript(leader);
    const refusedLines = lines.length;
    const refusedFights = fought;

    // Now clear the floor and ask again.
    for (const k of required) g.save.flags[`beat:${k}`] = 1;
    lines.length = 0;
    await sc.runScript(leader);
    const acceptedFights = fought;

    sc.say = say;
    sc.runTrainerBattle = battle;
    for (const k of required) delete g.save.flags[`beat:${k}`];
    return {
      map,
      leader,
      challengers: challengers.map((n) => n.trainer),
      required,
      sighted: challengers.filter((n) => (n.sight || 0) > 0).length,
      refusedLines,
      refusedFights,
      acceptedFights,
    };
  }, gym);

  check(info.required.length >= 3, `${info.map}: the leader gates on the whole floor`,
    `requires=${info.required.join(',')}`);
  check(info.required.every((k) => info.challengers.includes(k)),
    `${info.map}: every required challenger stands on the floor`,
    `npcs=${info.challengers.join(',')}`);
  check(info.sighted >= info.required.length,
    `${info.map}: every challenger watches a lane`, `sighted=${info.sighted}`);
  check(info.refusedFights === 0 && info.refusedLines >= 2,
    `${info.map}: the leader refuses an uncleared floor`,
    `fights=${info.refusedFights} lines=${info.refusedLines}`);
  check(info.acceptedFights === 1,
    `${info.map}: the leader accepts a cleared floor`, `fights=${info.acceptedFights}`);
}

// Support NPCs: a medic that heals and an aide that hands out one item.
console.log('\n== gym support ==');
const support = await p.evaluate(async () => {
  const g = window.agentmon;
  const sc = g.scenes.top;
  const say = sc.say.bind(sc);
  sc.say = async () => {};
  // No starter yet at this point in the run, so bring our own patient.
  if (g.save.party.length === 0) {
    const sp = g.trainers.TRAINERS.gym1_a.team[0].species;
    g.save.party.push(g.agent.createAgent(sp, { level: 20 }));
  }
  const mon = g.save.party[0];
  const full = g.agent.maxHp(mon);
  mon.hp = 1;
  await sc.runScript('gym_medic');
  const healed = mon.hp === full;
  mon.hp = 1;
  await sc.runScript('gym_medic');
  const repeatable = mon.hp === full;
  sc.say = say;
  return { full, healed, repeatable, busy: sc.busy };
});
check(support.healed, 'the gym medic repairs the party', `hp target=${support.full}`);
check(support.repeatable, 'the gym medic can be used more than once');
check(support.busy === false, 'the gym medic hands control back', `busy=${support.busy}`);

await p.locator('canvas').screenshot({ path: `${OUT}/overworld.png` });
await browser.close();
console.log(`\nerrors: ${errs.length ? errs.slice(0, 6).join('\n') : '(none)'}`);
const ok = !fails.length && !errs.length;
console.log(ok ? '\nGYMS OK' : `\nGYMS FAILED (${fails.length} check(s))`);
process.exit(ok ? 0 : 1);
