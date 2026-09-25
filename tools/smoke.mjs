// Browser smoke test: drives the built game in a real browser (mobile viewport), captures
// screenshots and fails on console errors.  Usage: node tools/smoke.mjs [url] [outDir]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? 'smoke-out';
mkdirSync(out, { recursive: true });
const exe = process.env.BROWSER ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url);
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/1-menu.png` });
await page.getByText('Begin — First Experiment').click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/2-map.png` });
await page.locator('.room-card').first().click();
await page.waitForTimeout(1200);

async function launch(dx, dy, hold = 250) {
  const sx = 195, sy = 600;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + dx / 2, sy + dy / 2, { steps: 4 });
  await page.mouse.move(sx + dx, sy + dy, { steps: 4 });
  await page.waitForTimeout(hold);
  await page.mouse.up();
}
await page.mouse.move(195, 600); await page.mouse.down(); await page.mouse.move(195, 760, { steps: 6 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/3-aim.png` });
await page.mouse.up();
for (let i = 0; i < 14; i++) {
  // Aim at nearest enemy using the exposed app for the smoke test.
  const v = await page.evaluate(() => {
    const w = window.alchemy.session?.world; if (!w) return null;
    const b = w.ball.pos; const e = w.enemies[0]; if (!e) return { dx: 0, dy: 150 };
    const dx = e.pos.x - b.x, dy = e.pos.y - b.y, l = Math.hypot(dx, dy) || 1;
    return { dx: -dx / l * 180, dy: -dy / l * 180 };
  });
  if (!v) break;
  await launch(v.dx, v.dy, 60);
  await page.waitForTimeout(700);
  if (i === 3) await page.screenshot({ path: `${out}/4-play.png` });
}
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/5-after.png` });
const state = await page.evaluate(() => ({ screen: document.querySelector('#ui')?.textContent?.slice(0, 200), session: !!window.alchemy.session, disc: Object.keys(window.alchemy.profile.discovered) }));
console.log(JSON.stringify(state));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
