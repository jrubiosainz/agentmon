/**
 * Proves the soundtrack actually reaches the speakers.
 *
 * Counts real WebAudio nodes created by the synth, so a track that is
 * registered but silent (bad pattern, missing wave) still fails here.
 */
import { chromium } from 'playwright';

const URL = process.env.URL || 'http://localhost:4173';

const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 960, height: 640 } });

// Tally every voice the engine schedules, per AudioContext.
await p.addInitScript(() => {
  window.__audio = { osc: 0, periodic: 0, buffers: 0, ctxState: 'none' };
  const OC = window.AudioContext;
  window.AudioContext = class extends OC {
    createOscillator() { window.__audio.osc++; return super.createOscillator(); }
    createPeriodicWave(...a) { window.__audio.periodic++; return super.createPeriodicWave(...a); }
    createBufferSource() { window.__audio.buffers++; return super.createBufferSource(); }
  };
});

await p.goto(URL, { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
// Audio only unlocks from a user gesture, exactly as a real player would.
await p.keyboard.press('z');
await p.waitForTimeout(2500);

const read = () => p.evaluate(() => ({ ...window.__audio }));
const title = await read();
console.log('title screen:', JSON.stringify(title));

// Walk each track through the engine and confirm it schedules voices.
const names = [
  'title', 'intro', 'town', 'city', 'route', 'forest', 'lab', 'center', 'mart',
  'gym', 'citadel', 'battleWild', 'battleTrainer', 'gymleader', 'rival',
  'elite', 'champion', 'victory', 'evolution',
];
const silent = [];
for (const n of names) {
  const before = (await read()).osc + (await read()).buffers;
  await p.evaluate((name) => window.agentmon.audio.playMusic(name, true), n);
  await p.waitForTimeout(320);
  const after = (await read()).osc + (await read()).buffers;
  const voices = after - before;
  if (voices <= 0) silent.push(n);
  console.log(`  ${voices > 0 ? 'ok  ' : 'SILENT'} ${n.padEnd(14)} voices=${voices}`);
}

const final = await read();
await b.close();

const ok = title.osc > 0 && title.periodic >= 3 && silent.length === 0;
console.log('\ntotals:', JSON.stringify(final));
if (silent.length) console.log('silent tracks:', silent.join(', '));
console.log(ok ? '\nAUDIO OK' : '\nAUDIO FAILED');
process.exit(ok ? 0 : 1);
