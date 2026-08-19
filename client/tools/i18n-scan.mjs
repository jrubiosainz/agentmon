/**
 * Builds `tools/i18n-keys.json`: the master list of every translatable string.
 *
 * Two sources, merged:
 *  1. `t('...')` / `tUpper('...')` call sites, scanned out of the source.
 *  2. `window.agentmon.dataStrings()`, read from the running game, so map /
 *     item / trainer / dex data never has to be parsed out of TypeScript.
 *
 * With `--check` it exits 1 if any catalogue is missing keys, carries stale
 * ones, or breaks a `{placeholder}` contract.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const URL = process.env.URL ?? 'http://localhost:4173';
const CHECK = process.argv.includes('--check');
const CALL = /\bt(?:Upper)?\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
const LANGS = ['es', 'fr', 'it', 'ja'];

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

function unescape(s) {
  return s.replace(/\\(['"])/g, '$1').replace(/\\\\/g, '\\')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

const fromSource = new Set();
for (const file of walk('src')) {
  if (/[\\/]lang[\\/]/.test(file)) continue;
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(CALL)) fromSource.add(unescape(m[1] ?? m[2]));
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.agentmon?.dataStrings === 'function', { timeout: 20000 });
const fromData = await page.evaluate(() => window.agentmon.dataStrings());
await browser.close();

const keys = [...new Set([...fromSource, ...fromData])].sort((a, b) => a.localeCompare(b));
const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

writeFileSync('tools/i18n-keys.json', `${JSON.stringify(keys, null, 2)}\n`, 'utf8');
console.log(`keys: ${keys.length} (source ${fromSource.size}, data ${new Set(fromData).size})`);

let bad = 0;
const known = new Set(keys);
for (const lang of LANGS) {
  const cat = JSON.parse(readFileSync(`src/game/data/lang/${lang}.json`, 'utf8'));
  const missing = keys.filter((k) => cat[k] === undefined);
  const stale = Object.keys(cat).filter((k) => !known.has(k));
  const mismatch = Object.entries(cat).filter(
    ([k, v]) => known.has(k) && placeholders(k).join() !== placeholders(v).join(),
  );
  if (missing.length || stale.length || mismatch.length) bad++;
  console.log(
    `${lang}: ${keys.length - missing.length}/${keys.length} translated` +
    `${missing.length ? `, missing ${missing.length}` : ''}` +
    `${stale.length ? `, stale ${stale.length}` : ''}` +
    `${mismatch.length ? `, placeholder mismatch ${mismatch.length}` : ''}`,
  );
  for (const [k, v] of mismatch.slice(0, 5)) console.log(`   ! ${JSON.stringify(k)} -> ${JSON.stringify(v)}`);
  for (const k of stale.slice(0, 5)) console.log(`   ? stale ${JSON.stringify(k)}`);
}

if (CHECK && bad) {
  console.error(`\nI18N SCAN FAILED (${bad} catalogue(s) incomplete)`);
  process.exit(1);
}
console.log(CHECK ? '\nI18N SCAN OK' : '\nwrote tools/i18n-keys.json');
