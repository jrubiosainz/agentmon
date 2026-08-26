// Merge a patch of new strings into every language catalogue, preserving the
// key order the scanner writes (it re-sorts on the next --write anyway).
import { readFileSync, writeFileSync } from 'node:fs';

const patch = JSON.parse(readFileSync(process.argv[2], 'utf8'));
for (const [lang, entries] of Object.entries(patch)) {
  const file = `src/game/data/lang/${lang}.json`;
  const cat = JSON.parse(readFileSync(file, 'utf8'));
  let added = 0;
  for (const [k, v] of Object.entries(entries)) {
    if (cat[k] === undefined) added++;
    cat[k] = v;
  }
  const sorted = Object.fromEntries(Object.keys(cat).sort().map((k) => [k, cat[k]]));
  writeFileSync(file, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
  console.log(`${lang}: +${added} (total ${Object.keys(sorted).length})`);
}
