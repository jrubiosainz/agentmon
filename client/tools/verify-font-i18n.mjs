/**
 * Font proof: renders the title screen in every language and reports whether
 * the glyph pipeline actually produced ink for accents and kana.
 *
 * The interesting question is not "did it draw" but "did it draw *anything*" -
 * a missing system font makes `wideGlyph` return null and Japanese silently
 * disappears, which no typecheck can catch.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.URL ?? 'http://localhost:5178';
const LANGS = ['en', 'es', 'ja'];
const OUT = 'tools/shots';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

let failed = false;
const fail = (msg) => { failed = true; console.error('FAIL:', msg); };

for (const lang of LANGS) {
  await page.addInitScript((l) => localStorage.setItem('agentmon.lang', l), lang);
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.agentmon?.scenes?.top, null, { timeout: 20000 });
  await page.waitForTimeout(600);

  const active = await page.evaluate(() => localStorage.getItem('agentmon.lang'));
  if (active !== lang) fail(`${lang}: language did not stick (got ${active})`);

  // Leave the splash so the menu (and therefore the language row) is visible.
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/lang-${lang}.png` });

  // Count non-background pixels in the strip where PRESS START / the menu sits.
  const ink = await page.evaluate(() => {
    const cv = document.querySelector('canvas');
    const g = cv.getContext('2d');
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 200 && d[i + 2] > 200) n++;
    return n;
  });
  if (ink < 200) fail(`${lang}: almost no bright text pixels (${ink}) - glyphs missing?`);
  console.log(`${lang}: bright text pixels = ${ink}`);
}

// Direct glyph probe: does the CJK baker return ink for kana, and do the
// composed accents actually change the glyph (ink counts can collide, so
// compare the top two rows, which only a diacritic ever occupies)?
const probe = await page.evaluate(() => {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 16;
  const g = cv.getContext('2d');
  const f = window.agentmon.font;
  const sample = (text) => {
    g.clearRect(0, 0, 64, 16);
    f.draw(g, text, 0, 0, 'white', false);
    const d = g.getImageData(0, 0, 64, 16).data;
    let ink = 0;
    let sig = '';
    let lastRow = -1;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 10; x++) {
        const on = d[(y * 64 + x) * 4 + 3] > 40;
        sig += on ? '#' : '.';
        if (on) { ink++; lastRow = y; }
      }
    }
    return { ink, sig, lastRow };
  };
  return {
    kana: sample('\u3042\u30ab'),
    a: sample('a'),
    aAcute: sample('\u00e1'),
    E: sample('E'),
    EAcute: sample('\u00c9'),
    n: sample('n'),
    nTilde: sample('\u00f1'),
    cCedilla: sample('\u00e7'),
    invQ: sample('\u00bf'),
    kanaStep: f.measure('\u3042\u3042') - f.measure('\u3042'),
    latinStep: f.measure('aa') - f.measure('a'),
    ligature: f.measure('\u0153') === f.measure('oe'),
  };
});
console.log('glyph probe:', JSON.stringify({
  ...probe, kana: probe.kana.ink, a: probe.a.ink, aAcute: probe.aAcute.ink,
  E: probe.E.ink, EAcute: probe.EAcute.ink, n: probe.n.ink, nTilde: probe.nTilde.ink,
  cCedilla: probe.cCedilla.ink, invQ: probe.invQ.ink, sig: undefined,
}, (k, v) => (k === 'sig' || k === 'lastRow' ? undefined : v)));
if (probe.kana.ink < 8) fail(`kana produced only ${probe.kana.ink} ink pixels - system CJK font missing`);
if (probe.kanaStep !== 8) fail(`kana advance is ${probe.kanaStep}, expected 8`);
if (probe.latinStep !== 6) fail(`latin advance is ${probe.latinStep}, expected 6`);
if (!probe.ligature) fail('oe ligature was not folded to "oe"');
for (const [name, base, acc] of [
  ['a-acute', probe.a, probe.aAcute],
  ['E-acute', probe.E, probe.EAcute],
  ['n-tilde', probe.n, probe.nTilde],
]) {
  if (acc.ink === 0) fail(`${name}: nothing rendered`);
  if (acc.sig === base.sig) fail(`${name}: identical to its unaccented base`);
  // A composed glyph must still fit the 7-row cell or it collides with the line below.
  if (acc.lastRow > 6) fail(`${name}: overflows the glyph cell (last ink row ${acc.lastRow})`);
}
if (probe.cCedilla.ink < 6) fail('c-cedilla did not render');
if (probe.invQ.ink < 4) fail('inverted question mark did not render');

const real = errors.filter((e) => !/401|500|Failed to load resource/.test(e));
if (real.length) fail(`console errors: ${real.slice(0, 3).join(' | ')}`);

await browser.close();
console.log(failed ? 'FONT PROOF FAILED' : 'FONT PROOF OK');
process.exit(failed ? 1 : 0);
