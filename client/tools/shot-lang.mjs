import { chromium } from 'playwright';

const URL = process.env.URL ?? 'http://localhost:4173';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 720, height: 480 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.agentmon?.scenes?.top?.constructor?.name === 'TitleScene', null, { timeout: 20000 });

const key = async (k, n = 1) => {
  for (let i = 0; i < n; i++) { await page.keyboard.press(k); await page.waitForTimeout(220); }
};

// Splash -> menu.
await key('Enter');
await page.waitForTimeout(700);
await page.screenshot({ path: 'tools/shots/i18n/lang-menu.png' });

// Walk down to the language row (native name, last item) and open it.
await key('ArrowDown', 2);
await page.waitForTimeout(300);
await key('Enter');
await page.waitForTimeout(600);
await page.screenshot({ path: 'tools/shots/i18n/lang-picker.png' });

// Pick Japanese and confirm the whole menu repaints translated.
await key('ArrowDown', 4);
await key('Enter');
await page.waitForTimeout(1200);
await page.screenshot({ path: 'tools/shots/i18n/lang-picked.png' });

console.log('lang shots written');
await browser.close();
