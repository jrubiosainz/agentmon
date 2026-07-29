/**
 * Renders every character the game can put on screen through the real font and
 * reports any that produce no pixels.
 *
 * A glyph missing from the table in `engine/font.ts` fails silently — it just
 * draws nothing — so a missing symbol can ship unnoticed. The character set is
 * not hand-maintained: it is the printable ASCII range plus every non-ASCII
 * character and every \uXXXX escape found in the canvas-drawing source, so a
 * symbol newly introduced in UI copy is picked up automatically.
 *
 *   node tools/glyphcheck.mjs           # against the dev server
 *   URL=https://... node tools/glyphcheck.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const URL = process.env.URL ?? 'http://localhost:5177/';

/** Everything the font is expected to cover unconditionally. */
const BASE =
  ' !#$%\'()*,-./0123456789:=>?ABCDEFGHIJKLMNOPQRSTUVWXYZ_' +
  'abcdefghijklmnopqrstuvwxyz';

// The DOM auth overlay is styled HTML, not canvas text, so its characters are
// not the font's responsibility.
const SKIP = ['src/game/ui'];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (SKIP.some((s) => p.replaceAll('\\', '/').includes(s))) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

const extra = new Set();
for (const file of walk('src')) {
  const src = readFileSync(file, 'utf8');
  for (const ch of src) if (ch.codePointAt(0) > 126) extra.add(ch);
  for (const m of src.matchAll(/\\u([0-9a-fA-F]{4})/g)) {
    extra.add(String.fromCodePoint(parseInt(m[1], 16)));
  }
}

const SET = BASE + [...extra].sort().join('');

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
console.log(`all ${SET.length - 1} glyphs render (${extra.size} discovered in source)`);
