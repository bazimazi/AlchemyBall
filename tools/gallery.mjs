// Screenshot gallery of every major screen and the creature roster, for art/UX review.
// npm run build && node tools/gallery.mjs   → smoke-out/gallery/*.png
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const out = 'smoke-out/gallery';
mkdirSync(out, { recursive: true });
const port = 5188;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { windowsHide: true, stdio: 'pipe' });
const errors = [];
let browser;
try {
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  browser = await chromium.launch({ executablePath: process.env.BROWSER ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const snap = async (name, wait = 700) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${out}/${name}.png` }); };
  // A veteran profile so every screen has content.
  await page.evaluate(() => {
    const a = window.alchemy, p = a.profile;
    p.tutorialDone = true; p.essence = 640; p.fragments = 85; p.marks = 3; p.level = 9; p.xp = 2000;
    p.research = ['res_frost', 'res_storm', 'res_iron', 'res_lab', 'res_hints', 'res_scanner', 'res_heat', 'res_shells', 'res_evolutions', 'res_merchant', 'res_events', 'res_daily', 'res_endless', 'res_banish', 'res_reroll'];
    p.seenElements = ['fire', 'water', 'ice', 'lightning', 'metal', 'earth', 'poison', 'wind', 'arcane'];
    for (const id of ['steam_burst', 'quench', 'freeze', 'shatter', 'conductive_surge', 'melt', 'searing_metal', 'toxic_combustion']) p.discovered[id] = { at: 1, count: 12, feats: ['enemy', 'ball', 'zone', 'chain'] };
    p.stats.bossKills = { warden: 2 }; p.stats.kills = 140; p.stats.runs = 9; p.stats.wins = 2; p.maxHeatWon = 2; p.heat = 3;
    p.cores = { ember: { xp: 380, level: 5, runs: 6, wins: 2, bestHeat: 2 }, frost: { xp: 60, level: 2, runs: 2, wins: 0, bestHeat: -1 } };
    p.cosmetics.owned.push('trail_ember', 'skin_brass', 'trail_comet');
    p.contracts[0].progress = p.contracts[0].goal;
    a.showMenu();
  });
  await snap('01-hub');
  await page.evaluate(() => window.alchemy.showPrep());
  await snap('02-prep');
  await page.evaluate(() => window.alchemy.showFeats());
  await snap('03-feats');
  await page.evaluate(() => window.alchemy.showWardrobe());
  await snap('04-wardrobe');
  await page.evaluate(() => window.alchemy.showResearch());
  await snap('05-research');
  // A run with a build, then the upgrade pick with an evolution ready.
  await page.evaluate(() => {
    const a = window.alchemy;
    a.startRun({});
    const r = a.run;
    r.addUpgrade('wildfire'); r.addUpgrade('wildfire'); r.addUpgrade('volatile_mix'); r.addUpgrade('lucky_strike');
    r.cfg.unlocked.push('feat_kills_100');
    r.isUnlocked = () => true;
    r.addUpgrade('volatile_remains');
    r.floor = 3;
    a.showMap();
  });
  await snap('06-map-build');
  await page.evaluate(() => window.alchemy.showUpgradePick('rare'));
  await snap('07-reliquary', 1200);
  await page.evaluate(() => window.alchemy.showMerchant());
  await snap('08-merchant', 1200);
  await page.evaluate(() => window.alchemy.showAnomaly());
  await snap('09-anomaly');
  // Creature roster in the lab.
  await page.evaluate(() => {
    const a = window.alchemy;
    a.run = null;
    a.startLab('fire');
    const w = a.session.world;
    w.enemies.length = 0;
    const ids = ['hound', 'mireling', 'kite', 'mote', 'rimeguard', 'conductor', 'golem', 'salamander', 'slime', 'imp', 'beetle', 'wisp'];
    ids.forEach((id, i) => { const e = w.spawnEnemy(id, { x: 110 + (i % 4) * 165, y: 170 + Math.floor(i / 4) * 150 }); e.spawnFx = 0; });
    const aff = ['shielded', 'swift', 'volatile', 'regenerating', 'insulated', 'enraged'];
    aff.forEach((af, i) => { const e = w.spawnEnemy('slime', { x: 90 + i * 108, y: 700 }, { affixes: [af] }); e.spawnFx = 0; e.vel = { x: 60, y: 0 }; });
    w.enemies[1].auras.set('fire', 0.8); w.enemies[1].auras.set('water', 0.5);
    document.querySelector('.lab-panel')?.remove();
  });
  await snap('10-roster', 1200);
  await page.evaluate(() => { window.alchemy.session.paused = false; });
  // Bosses.
  for (const boss of ['warden', 'matriarch', 'tempest']) {
    await page.evaluate((boss) => {
      const a = window.alchemy;
      const w = a.session.world;
      w.enemies.length = 0;
      const e = w.spawnEnemy(boss, { x: 360, y: 420 }, { isBoss: true, hp: 2000, radius: 60 }); e.spawnFx = 0;
      e.auras.set(boss === 'warden' ? 'fire' : boss === 'matriarch' ? 'ice' : 'lightning', 1);
      w.addTelegraph({ x: 360, y: 420 }, 130, 2, 0, '#9fe8ff', { kind: 'nova' });
      w.addTelegraph({ x: 200, y: 760 }, 115, 2, 0, '#ff5a3a');
      w.addTelegraph({ x: 360, y: 420 }, 60, 2, 0, '#ff5a3a', { kind: 'line', dir: { x: 0.4, y: 0.9 }, length: 480 });
    }, boss);
    await snap(`11-boss-${boss}`, 900);
  }
  // Live combat with reactions, combo and damage numbers.
  await page.evaluate(() => {
    const a = window.alchemy;
    a.session.destroy(); a.session = null;
    a.startRun({});
    a.enterRoom('combat');
  });
  await page.waitForTimeout(2200);
  for (let i = 0; i < 6; i++) {
    const v = await page.evaluate(() => {
      const w = window.alchemy.session?.world; if (!w) return null;
      const b = w.ball.pos; const e = w.enemies.find((x) => x.spawnFx <= 0); if (!e) return { dx: 0, dy: 150 };
      const dx = e.pos.x - b.x, dy = e.pos.y - b.y, l = Math.hypot(dx, dy) || 1;
      return { dx: -dx / l * 190, dy: -dy / l * 190 };
    });
    if (!v) break;
    await page.mouse.move(195, 600); await page.mouse.down(); await page.mouse.move(195 + v.dx, 600 + v.dy, { steps: 5 });
    if (i === 0) await snap('12-aim-lens', 250);
    await page.mouse.up();
    await page.waitForTimeout(i === 2 ? 280 : 650);
    if (i === 2) await snap('13-combat', 0);
  }
  await snap('14-combat-later', 300);
  // Results.
  await page.evaluate(() => { const a = window.alchemy; a.session.abandon(); });
  await snap('15-results', 1800);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => window.alchemy.showMenu());
  await snap('16-desktop-hub');
  console.log(JSON.stringify({ errors }));
} finally {
  await browser?.close();
  server.kill();
}
process.exit(errors.length ? 1 : 0);
