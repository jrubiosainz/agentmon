/**
 * Mobile checks: does audio actually start after a touch, and does the screen
 * use the whole viewport in portrait and landscape?
 *
 * Runs Chromium with the strict autoplay policy real phones use, so the
 * AudioContext starts suspended exactly like it does on Chrome for Android.
 */
import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const URL = process.env.URL ?? 'http://localhost:5177/';
const OUT = join(process.cwd(), 'tools', 'shots');
mkdirSync(OUT, { recursive: true });

const PORTRAIT = { width: 390, height: 844 };
const LANDSCAPE = { width: 844, height: 390 };

const browser = await chromium.launch({
  args: ['--autoplay-policy=document-user-activation-required'],
});
const ctx = await browser.newContext({
  ...devices['Pixel 7'],
  viewport: PORTRAIT,
  hasTouch: true,
  isMobile: true,
});
const page = await ctx.newPage();

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.agentmon, null, { timeout: 20000 });
await page.waitForTimeout(2500);

const fails = [];
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) fails.push(name);
};

/** Everything we need to know about the audio graph, from the page. */
const audioState = () => page.evaluate(() => {
  const a = window.agentmon?.audio;
  const c = a?.ctx ?? null;
  return {
    hasCtx: !!c,
    state: c ? c.state : null,
    currentTime: c ? c.currentTime : null,
    track: a?.currentTrack ?? null,
    scheduled: a?.scheduled ? a.scheduled.length : 0,
    muted: a?.muted ?? null,
  };
});

/** Where the canvas actually sits, in CSS pixels. */
const layout = () => page.evaluate(() => {
  const c = document.getElementById('screen');
  const t = document.getElementById('touch-controls');
  const r = c.getBoundingClientRect();
  const tr = t && !t.hidden ? t.getBoundingClientRect() : null;
  const cs = t ? getComputedStyle(t) : null;
  return {
    vw: window.innerWidth,
    vh: window.innerHeight,
    w: Math.round(r.width),
    h: Math.round(r.height),
    left: Math.round(r.left),
    top: Math.round(r.top),
    fill: +(r.width / window.innerWidth).toFixed(3),
    touchShown: !!tr,
    touchOverlay: cs ? cs.position === 'absolute' || cs.position === 'fixed' : false,
    touchTop: tr ? Math.round(tr.top) : null,
    body: document.body.className,
  };
});

// -------------------------------------------------------------- 1. portrait
console.log('\nPORTRAIT', `${PORTRAIT.width}x${PORTRAIT.height}`);
const before = await audioState();
console.log('  pre-tap audio:', JSON.stringify(before));
check('no audio before any gesture', !before.hasCtx || before.state !== 'running');

const p0 = await layout();
console.log('  layout:', JSON.stringify(p0));
check('touch controls visible on a touch device', p0.touchShown);
check('screen fills >=95% of the viewport width', p0.fill >= 0.95, `fill=${p0.fill} w=${p0.w} vw=${p0.vw}`);

// --------------------------------------------------- 2. audio after a touch
// Tap the A button the way a player would: a real touch on the control pad.
const tapA = async () => {
  const el = await page.$('[data-btn="a"]');
  if (el) await el.tap();
  else await page.touchscreen.tap(PORTRAIT.width / 2, PORTRAIT.height / 2);
  await page.waitForTimeout(900);
};
await tapA();

let after = await audioState();
console.log('  post-tap audio:', JSON.stringify(after));
check('AudioContext exists after a touch', after.hasCtx);
check('AudioContext is running after a touch', after.state === 'running', `state=${after.state}`);
check('clock advances (notes can be scheduled)', (after.currentTime ?? 0) > 0, `t=${after.currentTime}`);

// Give the scheduler a beat, then confirm voices are actually queued. Boot is
// slower against the real backend, so wait for the track rather than guess.
await page.waitForFunction(
  () => !!window.agentmon?.audio?.currentTrack && window.agentmon.audio.scheduled.length > 0,
  null,
  { timeout: 15000 },
).catch(() => {});
after = await audioState();
console.log('  settled audio:', JSON.stringify(after));
check('a track is playing', !!after.track, `track=${after.track}`);
check('voices are scheduled', after.scheduled > 0, `n=${after.scheduled}`);

await page.screenshot({ path: join(OUT, 'mobile-portrait.png') });

// ------------------------------------------------------------ 3. sound toggle
const soundBtn = await page.$('#sound-toggle');
check('a sound toggle exists on screen', !!soundBtn);
if (soundBtn) {
  await soundBtn.tap();
  await page.waitForTimeout(400);
  const off = await audioState();
  check('tapping the toggle mutes', off.muted === true, `muted=${off.muted}`);
  await soundBtn.tap();
  await page.waitForTimeout(400);
  const on = await audioState();
  check('tapping again unmutes', on.muted === false, `muted=${on.muted}`);
  const persisted = await page.evaluate(() => localStorage.getItem('agentmon.muted'));
  check('the choice is persisted', persisted !== null, `stored=${persisted}`);
}

// ------------------------------------------- 4. surviving the app switcher
// The real-world failure: Android suspends the context on every app switch,
// notification or screen lock. If nothing resumes it the game is silent for
// the rest of the session, which is exactly what players reported.
console.log('\nBACKGROUND / FOREGROUND');
await page.evaluate(async () => {
  Object.defineProperty(document, 'hidden', { value: true, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
  await window.agentmon.audio.ctx.suspend();
});
await page.waitForTimeout(400);
const hidden = await audioState();
console.log('  backgrounded:', JSON.stringify(hidden));
check('the context suspends while hidden', hidden.state === 'suspended', `state=${hidden.state}`);
check('backgrounding does not rewrite the mute choice', hidden.muted === false, `muted=${hidden.muted}`);

await page.evaluate(() => {
  Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
});
await page.waitForTimeout(1200);
let back = await audioState();
if (back.state !== 'running') {
  // Some browsers insist on a fresh gesture; a tap must be enough to recover.
  await tapA();
  back = await audioState();
}
console.log('  foregrounded:', JSON.stringify(back));
check('audio recovers after returning to the game', back.state === 'running', `state=${back.state}`);
check('the music restarts, not just the clock', back.scheduled > 0, `n=${back.scheduled}`);

// -------------------------------------------------------------- 5. landscape
console.log('\nLANDSCAPE', `${LANDSCAPE.width}x${LANDSCAPE.height}`);
await page.setViewportSize(LANDSCAPE);
await page.waitForTimeout(800);
const l0 = await layout();
console.log('  layout:', JSON.stringify(l0));
check('screen uses >=90% of the landscape height', l0.h / l0.vh >= 0.9, `h=${l0.h} vh=${l0.vh}`);
check('controls float over the screen', l0.touchOverlay, `body="${l0.body}"`);

// The pad must still work while floating, or the overlay is just decoration.
const before2 = await page.evaluate(() => window.agentmon.tick);
const el = await page.$('[data-btn="a"]');
if (el) await el.tap();
await page.waitForTimeout(400);
const acted = await page.evaluate(() => window.agentmon.tick);
check('the floating pad still reaches the game', acted > before2);

await page.screenshot({ path: join(OUT, 'mobile-landscape.png') });

// Rotating back must not strand the layout.
await page.setViewportSize(PORTRAIT);
await page.waitForTimeout(800);
const p1 = await layout();
check('rotating back restores the portrait fit', p1.fill >= 0.95, `fill=${p1.fill}`);

const real = errors.filter((e) => !/\b(401|500)\b/.test(e) && !/auth\/me/.test(e));
console.log('\nerrors:', real.length ? real.slice(0, 8).join('\n  ') : '(none)');
if (real.length) fails.push('console errors');

console.log(fails.length ? `\nMOBILE FAILURES: ${fails.join(', ')}` : '\nMOBILE OK');
writeFileSync(join(OUT, 'mobile-report.json'), JSON.stringify({ fails }, null, 2));

await browser.close();
process.exit(fails.length ? 1 : 0);
