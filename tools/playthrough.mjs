// Automated playthrough in a real browser: plays rooms with an auto-aiming "thumb", handles
// every screen, screenshots each new screen type, and reports console errors.
//   node tools/playthrough.mjs [url] [outDir] [seconds]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? 'playthrough-out';
const seconds = Number(process.argv[4] ?? 120);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.BROWSER ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(400);
const shots = new Set();
const shot = async (name) => { if (shots.has(name)) return; shots.add(name); await page.screenshot({ path: `${out}/${String(shots.size).padStart(2, '0')}-${name}.png` }); };
const t0 = Date.now();
let lastGameShot = 0;
while ((Date.now() - t0) / 1000 < seconds) {
  const st = await page.evaluate(() => {
    const a = window.alchemy; const txt = document.querySelector('#ui')?.textContent ?? '';
    const w = a.session?.world;
    let aim = null;
    if (w && !a.session.paused) {
      const b = w.ball; const alive = w.enemies.filter((e) => e.spawnFx <= 0);
      const sp = Math.hypot(b.vel.x, b.vel.y);
      if (sp < 250 && w.canLaunch() && alive.length) {
        // Sometimes grab an element source first, like a curious player would.
        let t = alive.reduce((m, e) => (Math.hypot(e.pos.x - b.pos.x, e.pos.y - b.pos.y) < Math.hypot(m.pos.x - b.pos.x, m.pos.y - b.pos.y) ? e : m));
        if (w.objects.length && Math.random() < 0.3) t = w.objects[Math.floor(Math.random() * w.objects.length)];
        const dx = t.pos.x - b.pos.x, dy = t.pos.y - b.pos.y, l = Math.hypot(dx, dy) || 1;
        aim = { dx: (-dx / l) * 200, dy: (-dy / l) * 200 };
      }
    }
    const h2 = document.querySelector('.screen h2, .screen h1:not(.x)')?.textContent ?? ''; const heads = [...document.querySelectorAll('.screen h1, .screen h2')].map((x) => x.textContent).join('|');
    return { txt: heads, inGame: !!w, aim, discovery: !!document.querySelector('.discovery'), boss: !!w?.boss, room: a.session?.room };
  });
  if (st.discovery) { await shot('discovery'); await page.locator('.discovery button').first().click(); continue; }
  if (st.inGame) {
    if (Date.now() - lastGameShot > 8000) { lastGameShot = Date.now(); await shot(`game-${st.room}${st.boss ? '-boss' : ''}-${Math.floor((Date.now() - t0) / 8000)}`); }
    if (st.aim) {
      await page.mouse.move(195, 600); await page.mouse.down();
      await page.mouse.move(195 + st.aim.dx, 600 + st.aim.dy, { steps: 3 });
      await page.mouse.up();
    }
    await page.waitForTimeout(120);
    continue;
  }
  const click = async (sel, name) => { const l = page.locator(sel).first(); if (await l.count()) { await shot(name); await l.click(); return true; } return false; };
  if (st.txt.includes('Choose an upgrade') || st.txt.includes('Reliquary')) { await click('.offer', 'upgrade'); continue; }
  if (st.txt.includes('Still Spring')) { await click('.card.selectable', 'rest'); continue; }
  if (st.txt.includes('Research Cache')) { await shot('research-cache'); await page.locator('button.primary').first().click(); continue; }
  if (st.txt.includes('Choose your path') || st.txt.includes('The marsh awaits')) { await click('.room-card', 'map'); continue; }
  if (st.txt.includes('Victory') || st.txt.includes('The ball shattered')) { await shot('results'); await page.getByText('Codex').last().click(); await page.waitForTimeout(300); await shot('codex'); await page.locator('.cell.known').first().click().catch(() => {}); await page.waitForTimeout(200); await shot('codex-detail'); break; }
  if (st.txt.includes('Prepare your ball')) { await shot('prep'); await page.locator('button.primary').last().click(); continue; }
  if (st.txt.includes('Alchemy Ball')) { await page.locator('button.primary').first().click(); continue; }
  await page.waitForTimeout(200);
}
const summary = await page.evaluate(() => { const p = window.alchemy.profile; return { discovered: Object.keys(p.discovered), essence: p.essence, fragments: p.fragments, runs: p.stats.runs, level: p.level, floor: window.alchemy.run?.floor }; });
console.log(JSON.stringify(summary));
console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
