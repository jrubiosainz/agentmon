/**
 * Localisation proof.
 *
 * Static half — over the catalogues themselves:
 *   - every character renders in the bitmap font (catches missing accents),
 *   - Japanese contains zero kanji (illegible at 8px, so unsupported),
 *   - `{placeholder}` contracts survive translation,
 *   - short ALL-CAPS labels stay narrow enough for their fixed-width windows.
 *
 * Live half — per language, in a real browser:
 *   - boot, walk title -> intro -> overworld -> menu -> battle,
 *   - `i18n.missingKeys` stays empty (nothing falls back to English),
 *   - no console/page errors, and the canvas is actually drawing.
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const URL = process.env.URL || 'http://localhost:4173';
const OUT = 'tools/shots/i18n';
mkdirSync(OUT, { recursive: true });

const LANGS = ['en', 'es', 'fr', 'it', 'ja'];
const KEYS = JSON.parse(readFileSync('tools/i18n-keys.json', 'utf8'));
const KANJI = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const fails = [];
const note = (m) => { fails.push(m); console.log(`  FAIL ${m}`); };
const warn = (m) => { console.log(`  warn ${m}`); };
const ph = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();

// --------------------------------------------------------------------- //
// Static catalogue checks
// --------------------------------------------------------------------- //
console.log('== catalogues ==');
const cats = {};
/** Per-language overflow list, written to disk for the translation pass. */
const report = {};
for (const lang of LANGS.filter((l) => l !== 'en')) {
  cats[lang] = JSON.parse(readFileSync(`src/game/data/lang/${lang}.json`, 'utf8'));
  const cat = cats[lang];
  const missing = KEYS.filter((k) => typeof cat[k] !== 'string' || !cat[k].length);
  const stale = Object.keys(cat).filter((k) => !KEYS.includes(k));
  if (missing.length) note(`${lang}: ${missing.length} missing keys, e.g. ${JSON.stringify(missing[0])}`);
  if (stale.length) note(`${lang}: ${stale.length} stale keys, e.g. ${JSON.stringify(stale[0])}`);

  const badPh = KEYS.filter((k) => cat[k] && ph(k) !== ph(cat[k]));
  if (badPh.length) note(`${lang}: ${badPh.length} placeholder mismatches, e.g. ${JSON.stringify(badPh[0])} -> ${JSON.stringify(cat[badPh[0]])}`);

  if (lang === 'ja') {
    const kanji = Object.entries(cat).filter(([, v]) => KANJI.test(v));
    if (kanji.length) note(`ja: ${kanji.length} values contain kanji, e.g. ${JSON.stringify(kanji[0][1])}`);
  }
  console.log(`  ${lang}: ${Object.keys(cat).length} entries`);
}

// --------------------------------------------------------------------- //
// Live checks
// --------------------------------------------------------------------- //
const b = await chromium.launch();

for (const lang of LANGS) {
  console.log(`== ${lang} ==`);
  const p = await b.newPage({ viewport: { width: 960, height: 640 } });
  const errs = [];
  const IGNORE = /\b(401|500)\b|\/api\//; // no backend under `vite preview`
  // Against the deployed B1 site, five back-to-back playthroughs occasionally
  // trip a transport-level timeout. That says nothing about the build, so it is
  // a warning here - it is only ignored for a remote host, never for localhost.
  const REMOTE = !/localhost|127\.0\.0\.1/.test(URL);
  const FLAKY = /net::ERR_(TIMED_OUT|CONNECTION_RESET|NETWORK_CHANGED|ABORTED|EMPTY_RESPONSE)/;
  p.on('pageerror', (e) => errs.push(`PAGEERROR: ${(e.stack || e.message).split('\n')[0]}`));
  p.on('console', (m) => {
    if (m.type() !== 'error' || IGNORE.test(m.text())) return;
    if (REMOTE && FLAKY.test(m.text())) { warn(`${lang}: transient network error ignored`); return; }
    errs.push(`CONSOLE: ${m.text()}`);
  });

  await p.addInitScript((l) => {
    try { localStorage.setItem('agentmon.lang', l); } catch { /* private mode */ }
  }, lang);
  // 'networkidle' never settles against the deployed site: the API keeps a
  // connection open. Wait for the boot scene to finish loading assets instead,
  // which is the condition the walkthrough below actually depends on. A cold
  // App Service can drop the first navigation, so give it a second chance.
  for (let attempt = 1; ; attempt++) {
    try {
      await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      break;
    } catch (e) {
      if (attempt === 3) throw e;
      warn(`${lang}: navigation retry ${attempt}`);
      await p.waitForTimeout(5000);
    }
  }
  await p.waitForFunction(
    () => window.agentmon?.scenes?.top?.constructor?.name === 'TitleScene',
    null,
    { timeout: 90000 },
  );
  await p.waitForTimeout(1200);

  const active = await p.evaluate(() => window.agentmon.i18n.getLang());
  if (active !== lang) note(`${lang}: game booted in "${active}"`);

  // Font coverage is checked inside the page: the font is the only thing that
  // knows whether a glyph exists, and it needs a live canvas.
  if (lang !== 'en') {
    const uncovered = await p.evaluate((values) => {
      const f = window.agentmon.font;
      const bad = new Set();
      const seen = new Set();
      for (const v of values) {
        for (const ch of v) {
          if (seen.has(ch) || ch === ' ' || ch === '\n') continue;
          seen.add(ch);
          if (!f.has(ch)) bad.add(ch);
        }
      }
      return [...bad];
    }, Object.values(cats[lang]));
    if (uncovered.length) note(`${lang}: ${uncovered.length} unrenderable char(s): ${JSON.stringify(uncovered.slice(0, 20))}`);
  }

  // Short ALL-CAPS strings are menu labels; they live in fixed-width windows.
  if (lang !== 'en') {
    const wide = await p.evaluate(({ cat, keys }) => {
      const f = window.agentmon.font;
      const out = [];
      for (const k of keys) {
        const v = cat[k];
        if (!v) continue;
        if (k !== k.toUpperCase() || k.length > 14 || /[{.!?]/.test(k)) continue;
        const budget = Math.max(f.measure(k) + 18, 46);
        const w = f.measure(v);
        if (w > budget) out.push([k, v, w, budget]);
      }
      return out;
    }, { cat: cats[lang], keys: KEYS });
    if (wide.length) {
      note(`${lang}: ${wide.length} label(s) too wide for their window`);
      for (const [k, v, w, budget] of wide.slice(0, 8)) console.log(`      ${JSON.stringify(k)} -> ${JSON.stringify(v)} ${w}px > ${budget}px`);
      // The full list goes to disk so it can be handed back to a translator.
      report[lang] = wide.map(([k, v, w, budget]) => ({ key: k, value: v, width: w, budget }));
    }
  }

  await p.locator('canvas').screenshot({ path: `${OUT}/title-${lang}.png` });

  // Walk: title -> new game -> intro -> overworld.
  const probe = () => p.evaluate(() => ({
    scene: window.agentmon.scenes.top?.constructor?.name,
    missing: [...window.agentmon.i18n.missingKeys],
    tick: window.agentmon.tick,
  }));
  const tap = async (k, times = 1, ms = 300) => {
    for (let i = 0; i < times; i++) { await p.keyboard.press(k); await p.waitForTimeout(ms); }
  };

  await tap('Shift', 1, 600);
  await tap('z', 2, 600);
  for (let i = 0; i < 12 && (await probe()).scene !== 'IntroScene'; i++) await tap('z', 1, 400);
  await tap('z', 16, 500);
  await tap('z', 2, 300);
  await tap('Shift', 1, 700);
  await tap('z', 1, 300);
  await tap('Shift', 1, 900);
  for (let i = 0; i < 14 && (await probe()).scene !== 'OverworldScene'; i++) await tap('z', 1, 800);
  await p.waitForTimeout(1000);

  const ow = await probe();
  if (ow.scene !== 'OverworldScene') note(`${lang}: never reached the overworld (stuck in ${ow.scene})`);
  await p.locator('canvas').screenshot({ path: `${OUT}/overworld-${lang}.png` });

  // Party menu, so the stat/move/dex text paths run.
  await p.evaluate(() => {
    const g = window.agentmon;
    if (!g.save.party.length) g.save.party.push(g.agent.createAgent('stackbit', { level: 12 }));
  });
  await tap('Enter', 1, 600);
  await tap('z', 1, 700);
  await p.locator('canvas').screenshot({ path: `${OUT}/menu-${lang}.png` });
  await tap('x', 3, 400);

  // A real battle, so the engine's message paths run.
  await p.evaluate(() => {
    const g = window.agentmon;
    if (g.scenes.top?.startWildBattle) g.scenes.top.startWildBattle(g.agent.createAgent('boltkin', { level: 5 }));
  });
  await p.waitForTimeout(2500);
  await p.locator('canvas').screenshot({ path: `${OUT}/battle-${lang}.png` });
  for (let i = 0; i < 30; i++) {
    await p.keyboard.press('z');
    await p.waitForTimeout(220);
    if ((await probe()).scene === 'OverworldScene') break;
  }
  await p.waitForTimeout(1200);

  const end = await probe();
  if (end.missing.length) {
    note(`${lang}: ${end.missing.length} untranslated key(s) hit at runtime`);
    for (const k of end.missing.slice(0, 8)) console.log(`      ${JSON.stringify(k)}`);
  }
  if (errs.length) note(`${lang}: ${errs.length} console/page error(s): ${errs[0]}`);
  console.log(`  scene=${end.scene} ticks=${end.tick} missing=${end.missing.length} errors=${errs.length}`);
  await p.close();
}

await b.close();
writeFileSync('tools/i18n/overflow.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(fails.length ? `\nI18N FAILED (${fails.length})` : '\nI18N OK');
process.exit(fails.length ? 1 : 0);
