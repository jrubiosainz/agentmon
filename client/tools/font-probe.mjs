import { chromium } from 'playwright';

const URL = process.env.URL ?? 'http://localhost:4173';
const CHARS = 'áàâäéèêëíìîïóòôöúùûüñçõãåÁÀÂÄÉÈÊËÍÌÎÏÓÒÔÖÚÙÛÜÑÇ¡¿ºª';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.agentmon?.font, null, { timeout: 30000 });

const res = await page.evaluate((chars) => {
  const f = window.agentmon.font;
  const ok = [];
  const bad = [];
  for (const ch of chars) (f.has(ch) ? ok : bad).push(ch);
  return { ok: ok.join(''), bad: bad.join('') };
}, CHARS);

console.log('renderable   :', res.ok);
console.log('NOT available:', res.bad || '(none)');
await browser.close();
