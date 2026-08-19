/**
 * Pre-merge audit of the per-language chunk files the translation agents wrote.
 *
 * Runs before `i18n-chunks merge` so a bad batch is caught while the agents are
 * still alive and can be asked to fix it, rather than after it has been folded
 * into the shipped catalogue.
 */
import { readFileSync, existsSync } from 'node:fs';

const LANGS = ['es', 'fr', 'it', 'ja'];
const master = JSON.parse(readFileSync('tools/i18n-keys.json', 'utf8'));
const known = new Set(master);
const moves = JSON.parse(readFileSync('tools/i18n/move-names.json', 'utf8'));

const ph = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
// Kanji, plus the CJK punctuation the font does not carry.
const KANJI = /[\u4e00-\u9fff\u3400-\u4dbf]/;
// Characters the English source already uses are known-good (arrows, ¥, É...).
const SAFE = new Set([...master.join('')]);

let bad = 0;
const fail = (lang, msg) => { bad++; console.log(`  ✗ ${lang}: ${msg}`); };

for (const lang of LANGS) {
  console.log(`\n${lang.toUpperCase()}`);
  const cat = {};
  let files = 0;
  for (let i = 1; i <= 99; i++) {
    const p = `tools/i18n/${lang}-${String(i).padStart(2, '0')}.json`;
    if (!existsSync(p)) continue;
    files++;
    Object.assign(cat, JSON.parse(readFileSync(p, 'utf8')));
  }
  const keys = Object.keys(cat);
  const missing = master.filter((k) => cat[k] === undefined);
  const stale = keys.filter((k) => !known.has(k));
  console.log(`  files ${files}, entries ${keys.length}, covers ${master.length - missing.length}/${master.length}`);
  if (missing.length) fail(lang, `missing ${missing.length} keys, e.g. ${missing.slice(0, 4).map((k) => JSON.stringify(k)).join(', ')}`);

  const mismatch = keys.filter((k) => known.has(k) && ph(k) !== ph(cat[k]));
  if (mismatch.length) fail(lang, `placeholder mismatch ×${mismatch.length}: ${mismatch.slice(0, 4).map((k) => `${JSON.stringify(k)} -> ${JSON.stringify(cat[k])}`).join(' | ')}`);

  const untranslatedMoves = moves.filter((m) => cat[m] !== undefined && cat[m] === m);
  if (untranslatedMoves.length) fail(lang, `${untranslatedMoves.length} move names still English: ${untranslatedMoves.slice(0, 8).join(', ')}`);

  const empty = keys.filter((k) => k !== '' && cat[k] === '');
  if (empty.length) fail(lang, `${empty.length} empty values: ${empty.slice(0, 4).join(', ')}`);

  if (lang === 'ja') {
    const kanji = keys.filter((k) => KANJI.test(cat[k]));
    if (kanji.length) fail(lang, `${kanji.length} values contain kanji: ${kanji.slice(0, 4).map((k) => `${k} -> ${cat[k]}`).join(' | ')}`);
  } else {
    // Latin languages must stay inside Latin-1 unless the glyph already appears
    // in the English source, which proves the font carries it.
    const exotic = keys.filter((k) => [...cat[k]].some((c) => c.charCodeAt(0) > 0xff && !SAFE.has(c)));
    if (exotic.length) fail(lang, `${exotic.length} values outside Latin-1: ${exotic.slice(0, 4).map((k) => `${k} -> ${JSON.stringify(cat[k])}`).join(' | ')}`);
  }

  // Move names live in a fixed-width battle box.
  const longMoves = moves.filter((m) => cat[m] && cat[m].length > (lang === 'ja' ? 6 : 12));
  if (longMoves.length) fail(lang, `${longMoves.length} move names too long: ${longMoves.slice(0, 6).map((m) => `${cat[m]} (${cat[m].length})`).join(', ')}`);

  const identical = master.filter((k) => cat[k] === k);
  console.log(`  left in English: ${identical.length}`);
}

console.log(bad ? `\nI18N AUDIT FAILED (${bad} problem(s))` : '\nI18N AUDIT OK');
process.exit(bad ? 1 : 0);
