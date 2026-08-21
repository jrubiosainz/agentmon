// Headless playthrough smoke test: drives the real game with keyboard input
// and writes screenshots of the internal 240x160 buffer to tools/shots/.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const URL = process.env.URL ?? 'http://localhost:5177/';
const OUT = join(process.cwd(), 'tools', 'shots');
mkdirSync(OUT, { recursive: true });

const KEY = {
  a: 'z', b: 'x', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft',
  right: 'ArrowRight', start: 'Shift', select: 'Tab',
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

async function scene() {
  return page.evaluate(() => {
    const g = window.agentmon;
    const top = g?.scenes?.top;
    return top ? top.constructor.name : '?';
  });
}

/** Grab the 240x160 internal buffer, upscaled 3x with nearest neighbour. */
async function shot(name) {
  const data = await page.evaluate(() => {
    const src = window.agentmon?.screen?.g?.canvas;
    if (!src) return null;
    const c = document.createElement('canvas');
    c.width = src.width * 3;
    c.height = src.height * 3;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  });
  if (!data) { console.log(`  !! ${name}: no buffer`); return; }
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data.split(',')[1], 'base64'));
  console.log(`  shot ${name.padEnd(28)} scene=${await scene()}`);
}

async function tap(key, times = 1, wait = 260) {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(KEY[key] ?? key);
    await page.waitForTimeout(wait);
  }
}
async function hold(key, ms) {
  await page.keyboard.down(KEY[key] ?? key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(KEY[key] ?? key);
  await page.waitForTimeout(150);
}

/** Where is the player right now? */
async function pos() {
  return page.evaluate(() => {
    const g = window.agentmon;
    const t = g?.scenes?.top;
    return { map: t?.def?.id, x: t?.player?.x, y: t?.player?.y, f: t?.player?.facing };
  });
}

// Reusable preludes so scenario scripts stay short.
const PRELUDES = {
  newgame: [
    { wait: 2200 }, { key: 'start', wait: 600 }, { key: 'a', wait: 600 },
    { key: 'a', until: 'IntroScene', tick: 400 },
    { key: 'a', times: 16, tick: 700 },
    { key: 'a', wait: 300 }, { key: 'a', wait: 300 }, { key: 'start', wait: 800 },
    { key: 'a', wait: 300 }, { key: 'start', wait: 1000 },
    { key: 'a', until: 'OverworldScene', tick: 900, max: 12 }, { wait: 1200 },
  ],
  town: [],
  lab: [],
};
PRELUDES.town = [
  ...PRELUDES.newgame,
  { walk: ['down', 3] }, { walk: ['right', 1] }, { walk: ['down', 2], wait: 1000 },
  { walk: ['down', 5] }, { walk: ['left', 3] }, { walk: ['down', 3], wait: 1200 },
];

PRELUDES.grass = [];
PRELUDES.lab = [
  ...PRELUDES.town,
  { walk: ['down', 6] }, { walk: ['right', 4] }, { walk: ['down', 4] },
  { walk: ['right', 3] }, { walk: ['up', 1], wait: 1500 },
];

PRELUDES.grass = [
  ...PRELUDES.lab,
  { walk: ['left', 3] }, { walk: ['up', 5] }, { walk: ['right', 3] }, { walk: ['up', 1] },
  { key: 'a', times: 30, tick: 380 }, { wait: 700 },
  { eval: '() => { const s = window.agentmon.scenes.top; s.loadMap("route1", 10, 40, "up"); s.updateCamera(true); return "ok"; }' },
  { wait: 500 },
];

const steps = [
  ...(PRELUDES[process.env.PRELUDE] ?? []),
  ...JSON.parse(process.env.STEPS ?? '[]'),
];
await shot('00-boot');

/** Press a key until the top scene changes (or we give up). */
async function until(key, target, max = 40, tick = 320) {
  for (let n = 0; n < max; n++) {
    const s = await scene();
    if (target ? s === target : false) return true;
    await tap(key, 1, tick);
  }
  return (await scene()) === target;
}

let i = 0;
for (const s of steps) {
  const tag = String(++i).padStart(2, '0');
  if (s.reload) {
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!window.agentmon, null, { timeout: 20000 });
    await page.waitForTimeout(1500);
    console.log('  reloaded ->', await scene());
  }
  if (s.untilEval) {
    // Tap a key until an arbitrary expression becomes truthy.
    for (let i = 0; i < (s.max ?? 30); i++) {
      const v = await page.evaluate(`(${s.untilEval})()`);
      if (v) break;
      await tap(s.key ?? 'a', 1, s.tick ?? 400);
    }
    console.log(`  untilEval -> ${JSON.stringify(await page.evaluate(`(${s.untilEval})()`))}`);
  }
  if (s.wander) {
    // Pace back and forth until the target scene appears (wild encounters are random).
    const dirs = ['up', 'down'];
    for (let i = 0; i < (s.max ?? 40); i++) {
      await hold(dirs[i % 2], 150);
      await page.waitForTimeout(95);
      if ((await scene()) === s.wander) break;
    }
    console.log(`  wander -> ${await scene()}`);
  }
  if (s.walk) {
    const [dir, n] = s.walk;
    // Discrete taps: one hold per tile guarantees an exact step count even
    // through the turn-in-place window and map transitions.
    for (let i = 0; i < n; i++) { await hold(dir, 150); await page.waitForTimeout(95); }
    if (s.trace) console.log('  at', JSON.stringify(await pos()));
  }
  if (s.pos) console.log('  pos', JSON.stringify(await pos()));
  if (s.until) {
    const ok = await until(s.key ?? 'a', s.until, s.max ?? 40, s.tick ?? 320);
    console.log(`  until ${s.until}: ${ok ? 'reached' : 'TIMEOUT at ' + (await scene())}`);
  } else if (s.key && !s.untilEval) await tap(s.key, s.times ?? 1, s.tick ?? 260);
  if (s.hold) await hold(s.hold, s.ms ?? 800);
  if (s.type) { await page.keyboard.type(s.type, { delay: 40 }); await page.waitForTimeout(200); }
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.eval) console.log('  eval:', JSON.stringify(await page.evaluate(`(${s.eval})()`)));
  if (s.shot) await shot(`${tag}-${s.shot}`);
}

if (errors.length) {
  console.log('\nCONSOLE ERRORS:');
  for (const e of [...new Set(errors)].slice(0, 25)) console.log('  ' + e);
} else {
  console.log('\nno console errors');
}

await browser.close();
