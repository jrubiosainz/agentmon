/**
 * Renders every character the game can put on screen through the real font and
 * reports any that produce no pixels.
 *
 * A glyph missing from the table in `engine/font.ts` fails silently — it just
 * draws nothing — so a missing symbol can ship unnoticed. Run this after adding
 * any new symbol to UI copy.
 *
 *   node tools/glyphcheck.mjs           # against the dev server
 *   URL=https://... node tools/glyphcheck.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.URL ?? 'http://localhost:5177/';

const SET =
  ' !#$%\'()*,-./0123456789:=>?ABCDEFGHIJKLMNOPQRSTUVWXYZ_' +
  'abcdefghijklmnopqrstuvwxyz' +
  '\u00c9\u00e9\u00d1\u00a5\u00a9\u25b6\u25bc\u2191\u2193\u2642\u2640\u2605\u2764';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction('!!window.agentmon', null, { timeout: 20000 });

const bad = await page.evaluate(async (set) => {
  const { font } = await import('/src/engine/font.ts');
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const g = c.getContext('2d');
  const missing = [];
  for (const ch of set) {
    if (ch === ' ') continue;
    g.clearRect(0, 0, 16, 16);
    font.draw(g, ch, 2, 2, 'white', false);
    const d = g.getImageData(0, 0, 16, 16).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    if (n === 0) missing.push(`U+${ch.codePointAt(0).toString(16).padStart(4, '0')} ${ch}`);
  }
  return missing;
}, SET);

await browser.close();

if (bad.length) {
  console.log(`MISSING GLYPHS (${bad.length}): ${bad.join(', ')}`);
  process.exit(1);
}
console.log(`all ${SET.length - 1} glyphs render`);
