// Reproducible art/layout review against a production build; owns and closes its preview server.
// npm run build && node tools/visual-review.mjs
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const out = 'smoke-out/visual';
mkdirSync(out, { recursive: true });
const port = 5186;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { windowsHide: true, stdio: 'pipe' });
const errors = [];
let browser;
try {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  browser = await chromium.launch({ executablePath: process.env.BROWSER ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}`);
  await page.screenshot({ animations: 'disabled', path: `${out}/desktop-menu.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ animations: 'disabled', path: `${out}/mobile-menu.png` });
  const launchBox = await page.locator('button.primary').boundingBox();
  assert(launchBox && launchBox.y >= 0 && launchBox.y + launchBox.height <= 844, 'Launch action must be visible');
  assert.equal(await page.evaluate(() => document.querySelector('.screen').scrollWidth > innerWidth), false, 'Mobile menu overflows horizontally');
  await page.locator('button.primary').click();
  await page.screenshot({ animations: 'disabled', path: `${out}/mobile-map.png` });
  await page.locator('.room-card').first().click();
  await page.waitForTimeout(4500);
  await page.mouse.move(195, 590); await page.mouse.down(); await page.mouse.move(195, 740, { steps: 8 });
  await page.screenshot({ animations: 'disabled', path: `${out}/mobile-aim.png` });
  await page.mouse.up();
  await page.waitForTimeout(250);
  await page.screenshot({ animations: 'disabled', path: `${out}/mobile-launch.png` });
  // Isolated sandbox contains every silhouette and reagent for art inspection.
  await page.evaluate(() => {
    const a = window.alchemy;
    a.session.destroy(); a.session = null;
    a.profile.seenElements = ['fire', 'water', 'ice', 'lightning', 'metal', 'earth', 'poison', 'wind', 'arcane'];
    a.startLab('fire');
    const w = a.session.world;
    w.enemies.length = 0; w.objects.length = 0; w.zones.length = 0;
    ['brazier', 'font', 'coil', 'frost_crystal', 'iron_post', 'boulder', 'fan', 'toxic_barrel', 'rune', 'crate', 'bumper'].forEach((id, i) => w.spawnObject(id, { x: 110 + i % 4 * 165, y: 150 + Math.floor(i / 4) * 140 }));
    ['slime', 'imp', 'beetle', 'wisp', 'bloat', 'sentinel', 'golem', 'salamander', 'dummy'].forEach((id, i) => { const e = w.spawnEnemy(id, { x: 110 + i % 3 * 245, y: 640 + Math.floor(i / 3) * 135 }); e.spawnFx = 0; });
    w.spawnZone('water_pool', { x: 160, y: 530 }, 85, Infinity, 'neutral', 0);
    w.spawnZone('ice_patch', { x: 370, y: 530 }, 70, Infinity, 'neutral', 0);
    w.spawnZone('magma_pool', { x: 570, y: 530 }, 80, Infinity, 'hostile', 0);
    w.ball.pos = { x: 360, y: 1010 }; w.ball.vel = { x: 0, y: 0 };
    a.session.paused = true;
    document.querySelector('.lab-panel').remove();
  });
  await page.waitForTimeout(100);
  await page.screenshot({ animations: 'disabled', path: `${out}/mobile-specimens.png` });
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.waitForTimeout(100);
  await page.screenshot({ animations: 'disabled', path: `${out}/desktop-specimens.png` });
  await page.evaluate(() => {
    const a = window.alchemy, w = a.session.world;
    w.enemies.length = 0;
    const boss = w.spawnEnemy('warden', { x: 360, y: 690 }, { isBoss: true }); boss.spawnFx = 0;
    a.fx.onEvent({ type: 'reaction', reactionId: 'steam_burst', pos: { x: 360, y: 690 }, radius: 140, color: '#8cdef5', targets: 3, depth: 1 });
    a.fx.update(0.12);
  });
  await page.waitForTimeout(100);
  await page.screenshot({ animations: 'disabled', path: `${out}/boss-reaction.png` });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.alchemy.fx.reducedMotion), true, 'OS reduced motion must apply');
  await page.evaluate(() => { const a = window.alchemy; a.fx.shake = 0; a.fx.flash = 0; a.fx.addShake(10); a.fx.addFlash('#fff', 1); });
  assert.deepEqual(await page.evaluate(() => [window.alchemy.fx.shake, window.alchemy.fx.flash]), [0, 0]);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const stablePause = await page.evaluate(() => {
    const a = window.alchemy;
    const aim = { active: false, dir: { x: 0, y: -1 }, power: 0 };
    a.fx.shake = 10;
    a.renderer.draw(a.session.world, a.fx, undefined, aim, 0);
    const before = a.renderer.canvas.toDataURL();
    a.renderer.draw(a.session.world, a.fx, undefined, aim, 0);
    a.fx.shake = 0;
    return before === a.renderer.canvas.toDataURL();
  });
  assert(stablePause, 'A paused frame must not keep shaking');
  const timing = await page.evaluate(() => {
    const a = window.alchemy; const samples = [];
    for (let i = 0; i < 120; i++) { const start = performance.now(); a.renderer.draw(a.session.world, a.fx, undefined, { active: false, dir: { x: 0, y: -1 }, power: 0 }, 1 / 60); samples.push(performance.now() - start); }
    samples.sort((a, b) => a - b);
    return { medianDrawMs: samples[60], p95DrawMs: samples[114] };
  });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => { const a = window.alchemy; a.session.destroy(); a.session = null; a.showMenu(); });
  await page.screenshot({ animations: 'disabled', path: `${out}/small-menu.png` });
  assert.equal(await page.evaluate(() => document.querySelector('.screen').scrollWidth > innerWidth), false, 'Small menu overflows horizontally');
  assert(await page.evaluate(() => {
    const fx = window.alchemy.fx;
    fx.reset();
    return fx.particles.every(p => !p.active) && !fx.rings.length && !fx.arcs.length && !fx.texts.length && !fx.shake && !fx.flash && !fx.hitstop;
  }), 'New encounters must not inherit effects');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ screenshots: out, errors, ...timing }));
  if (process.argv.includes('--playthrough')) {
    for (const [script, args] of [['tools/smoke.mjs', [`http://127.0.0.1:${port}`, 'smoke-out/after']], ['tools/playthrough.mjs', [`http://127.0.0.1:${port}`, 'playthrough-out/graphics', '100']]]) {
      await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [script, ...args], { windowsHide: true, stdio: 'inherit' });
        child.on('error', reject);
        child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${script} exited ${code}`)));
      });
    }
  }
} finally {
  await browser?.close();
  server.kill();
}
