/**
 * Splits `tools/i18n-keys.json` into numbered chunk files so a translator can
 * work through them one at a time, and merges the finished chunks back into
 * `src/game/data/lang/<lang>.json`.
 *
 *   node tools/i18n-chunks.mjs split <n>
 *   node tools/i18n-chunks.mjs merge <lang>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const [, , cmd, arg] = process.argv;
const keys = JSON.parse(readFileSync('tools/i18n-keys.json', 'utf8'));

if (cmd === 'split') {
  const n = Number(arg ?? 6);
  const size = Math.ceil(keys.length / n);
  mkdirSync('tools/i18n', { recursive: true });
  for (let i = 0; i < n; i++) {
    const slice = keys.slice(i * size, (i + 1) * size);
    const name = `tools/i18n/chunk-${String(i + 1).padStart(2, '0')}.json`;
    writeFileSync(name, `${JSON.stringify(slice, null, 2)}\n`, 'utf8');
    console.log(`${name}: ${slice.length} keys`);
  }
  process.exit(0);
}

if (cmd === 'merge') {
  const lang = arg;
  const out = {};
  let files = 0;
  for (let i = 1; i <= 99; i++) {
    const p = `tools/i18n/${lang}-${String(i).padStart(2, '0')}.json`;
    if (!existsSync(p)) continue;
    Object.assign(out, JSON.parse(readFileSync(p, 'utf8')));
    files++;
  }
  // Emit in master-key order so diffs stay readable and stale keys drop out.
  const ordered = {};
  const missing = [];
  for (const k of keys) {
    if (typeof out[k] === 'string' && out[k].length) ordered[k] = out[k];
    else missing.push(k);
  }
  writeFileSync(`src/game/data/lang/${lang}.json`, `${JSON.stringify(ordered, null, 2)}\n`, 'utf8');
  console.log(`${lang}: merged ${files} chunk file(s) -> ${Object.keys(ordered).length}/${keys.length}`);
  if (missing.length) {
    console.log(`  missing ${missing.length}, first: ${JSON.stringify(missing.slice(0, 3))}`);
    process.exit(1);
  }
  process.exit(0);
}

console.error('usage: i18n-chunks.mjs split <n> | merge <lang>');
process.exit(2);
