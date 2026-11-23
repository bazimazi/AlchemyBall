import { describe, expect, it } from 'vitest';
import { Content } from '../src/content';
import { botRun } from '../src/game/autoplay';
import { ChallengeTracker } from '../src/game/challenges';
import { claimContract, contractEvent, ensureContracts } from '../src/game/contracts';
import { checkFeats, FEATS } from '../src/game/feats';
import { addCoreXp, createSaveSlot, freshProfile, hasUnlock, unlockedRegions } from '../src/game/profile';
import { finishRun } from '../src/game/rewards';
import { Run, type RunConfig } from '../src/game/run';
import { checksum, MemoryStore } from '../src/game/save';
import { trialMedals, trialRecordKey, trialsUnlocked } from '../src/game/trials';
import { PHYS } from '../src/sim/ballPhysics';
import { collect, emptySpec, makeWorld } from './helpers';

const cfg: RunConfig = { seed: 99, mode: 'standard', regionId: 'cinder_marsh', core: 'ember', shell: 'glass', heat: 0, tutorial: false, maxPips: 3, rerolls: 0 };

describe('Expedition Trials', () => {
  it('records medal tiers per matchup, persists them, and pays a cosmetic once', () => {
    const p = freshProfile();
    expect(trialsUnlocked(p)).toBe(false);
    p.stats.bossKills.warden = 1;
    expect(trialsUnlocked(p)).toBe(true);
    const config = { ...cfg, trial: 'glass' as const };
    expect(finishRun(p, new Run(config), true).trial?.medals).toEqual(['Bronze']);
    expect(finishRun(p, new Run({ ...config, heat: 7 }), true).trial?.medals).toEqual(['Silver', 'Gold']);
    expect(finishRun(p, new Run({ ...config, heat: 7 }), true).trial).toBeUndefined();
    expect(finishRun(p, new Run({ ...config, core: 'frost', heat: 7 }), false).trial).toBeUndefined();
    finishRun(p, new Run({ ...config, core: 'tide', heat: 7 }), true);
    expect(finishRun(p, new Run({ ...config, regionId: 'frostvein', heat: 7 }), true).trial?.cosmetic).toBe('skin_porcelain');
    expect(p.maxHeatWon).toBe(-1);
    const slot = createSaveSlot(new MemoryStore());
    slot.save(p);
    const loaded = slot.load();
    expect(trialMedals(loaded, 'glass')).toBe(9);
    expect(loaded.trialRecords[trialRecordKey('glass', cfg.regionId, cfg.core)]).toBe(7);
    expect(loaded.cosmetics.owned.filter((cosmetic) => cosmetic === 'skin_porcelain')).toHaveLength(1);
  });

  it('restores the selected trial and applies only its rules in standard runs', () => {
    const pursuit = new Run({ ...cfg, trial: 'pursuit' });
    expect(Run.restore(pursuit.serialize()).difficulty().enemySpeed).toBe(1.3);
    expect(pursuit.mods().resonanceGain).toBe(0.5);
    const daily = new Run({ ...cfg, mode: 'daily', trial: 'pursuit' });
    expect(daily.mods().resonanceGain).toBeUndefined();
    expect(daily.difficulty().enemySpeed).toBe(1);
    expect(new Run({ ...cfg, trial: 'glass' }).maxHp).toBe(Math.round(new Run(cfg).maxHp * 0.75));
  });

  it('keeps an outstanding boss reward attached to the completed floor', () => {
    const run = new Run({ ...cfg, mode: 'endless' });
    run.floor = 6;
    run.enter('boss');
    run.completeRoom();
    run.rollUpgradeReward('rare', false);
    const restored = Run.restore(run.serialize());
    expect(restored.floor).toBe(7);
    expect(restored.pendingUpgrade).toEqual(run.pendingUpgrade);
    expect(restored.pendingUpgrade?.offers).toHaveLength(3);
    expect(restored.pendingUpgrade?.advance).toBe(false);
  });
});

describe('Umbral Archive', () => {
  it('unlocks after Tempest and the Orrery fires along the lanes it telegraphs', () => {
    const p = freshProfile();
    expect(unlockedRegions(p).some((r) => r.id === 'umbral_archive')).toBe(false);
    p.stats.bossKills.tempest = 1;
    expect(unlockedRegions(p).some((r) => r.id === 'umbral_archive')).toBe(true);
    const w = makeWorld({ sandbox: true, encounter: emptySpec({ boss: 'orrery' }) });
    for (let elapsed = 0; elapsed < 8 && !w.telegraphs.some((t) => t.cause === 'Eclipse Volley'); elapsed += PHYS.step) w.step();
    const rays = w.telegraphs.filter((t) => t.cause === 'Eclipse Volley');
    expect(rays).toHaveLength(5);
    while (w.telegraphs.includes(rays[0])) w.step();
    for (const ray of rays) {
      expect(w.projectiles.some((p) => p.element === 'poison' && Math.abs(p.vel.x - ray.dir!.x * 410) < 0.01 &&
        Math.abs(p.vel.y - ray.dir!.y * 410) < 0.01)).toBe(true);
    }
  });
});

describe('combo', () => {
  it('grows with hits while the ball moves and ends (with Essence) once it rests', () => {
    const w = makeWorld({ encounter: emptySpec({ waves: [{ enemies: [{ id: 'dummy', x: 360, y: 700 }, { id: 'dummy', x: 360, y: 500 }] }] }) });
    const combos = collect<{ count: number }>(w, 'combo');
    const ends = collect<{ count: number }>(w, 'comboEnd');
    for (let i = 0; i < 200; i++) w.step();
    w.launch({ x: 0, y: -1 }, 1);
    for (let i = 0; i < 60; i++) w.step();
    expect(combos.length).toBeGreaterThan(0);
    expect(w.ball.combo).toBeGreaterThan(0);
    for (let i = 0; i < 900; i++) w.step();
    expect(w.ball.combo).toBe(0);
    if (combos.at(-1)!.count >= 3) expect(ends.length).toBe(1);
  });
});

describe('affixes', () => {
  it('Shielded wards absorb damage before HP and break with an event', () => {
    const w = makeWorld({ encounter: emptySpec() });
    const e = w.spawnEnemy('slime', { x: 300, y: 300 }, { affixes: ['shielded'] });
    e.spawnFx = 0;
    const broken = collect(w, 'wardBroken');
    expect(e.ward).toBeGreaterThan(0);
    w.damageHolder(e, e.ward - 1, 'reaction');
    expect(e.hp).toBe(e.maxHp);
    w.damageHolder(e, 10, 'reaction');
    expect(broken.length).toBe(1);
    expect(e.hp).toBeLessThan(e.maxHp);
  });

  it('Insulated foes ignore the ball’s core element', () => {
    const w = makeWorld({ encounter: emptySpec(), coreElement: 'fire' });
    const e = w.spawnEnemy('dummy', { x: 300, y: 300 }, { affixes: ['insulated'] });
    e.spawnFx = 0;
    w.engine.apply(e, 'fire', 1, { depth: 0, faction: 'player' });
    expect(e.auras.get('fire') ?? 0).toBe(0);
    w.engine.apply(e, 'water', 1, { depth: 0, faction: 'player' });
    expect(e.auras.get('water') ?? 0).toBeGreaterThan(0);
  });

  it('elites gain affixes at higher Heat', () => {
    const r = new Run({ ...cfg, heat: 4 });
    r.floor = 3;
    const spec = r.generateEncounter('elite');
    expect(spec.waves[0].enemies[0].affixes?.length ?? 0).toBeGreaterThan(0);
  });
});

describe('heat ladder', () => {
  it('difficulty never decreases as Heat rises', () => {
    let prev = new Run({ ...cfg, heat: 0 }).difficulty();
    for (let h = 1; h <= 10; h++) {
      const d = new Run({ ...cfg, heat: h }).difficulty();
      for (const k of Object.keys(d) as (keyof typeof d)[]) if (k !== 'pipRegen' && k !== 'playerResist') expect(d[k]).toBeGreaterThanOrEqual(prev[k]);
      expect(d.pipRegen).toBeLessThanOrEqual(prev.pipRegen);
      prev = d;
    }
  });
});

describe('evolutions', () => {
  it('are offered only when both ingredients are held at max and research is done', () => {
    const r = new Run({ ...cfg, unlocked: ['res_evolutions', 'feat_kills_100'] });
    expect(r.eligibleEvolutions()).toEqual([]);
    r.addUpgrade('wildfire');
    r.addUpgrade('wildfire');
    r.addUpgrade('volatile_remains');
    expect(r.eligibleEvolutions().map((u) => u.id)).toContain('phoenix_engine');
    const offer = r.offerUpgrades(3, 'rare');
    expect(offer.some((o) => o.def.id === 'phoenix_engine')).toBe(true);
    const locked = new Run({ ...cfg, unlocked: ['feat_kills_100'] });
    locked.addUpgrade('wildfire'); locked.addUpgrade('wildfire'); locked.addUpgrade('volatile_remains');
    expect(locked.eligibleEvolutions()).toEqual([]);
  });

  it('every evolution references real, offerable ingredients', () => {
    for (const u of Content.lists.UPGRADES.filter((x) => x.requires)) {
      expect(u.rarity).toBe('legendary');
      for (const id of u.requires!) expect(Content.upgrades.get(id)?.requires).toBeUndefined();
    }
  });

  it('banished upgrades never reappear', () => {
    const r = new Run({ ...cfg, banishes: 1 });
    const first = r.offerUpgrades(3, 'normal')[0].def.id;
    r.banish(first);
    for (let i = 0; i < 30; i++) expect(r.offerUpgrades(3, 'normal').some((o) => o.def.id === first)).toBe(false);
  });
});

describe('run persistence', () => {
  it('a restored run continues identically', () => {
    const a = new Run({ ...cfg, seed: 1234 });
    a.addUpgrade('dense_core');
    a.generateEncounter('combat');
    a.completeRoom();
    const saved = JSON.parse(JSON.stringify(a.serialize()));
    const b = Run.restore(saved);
    expect(b.floor).toBe(a.floor);
    expect(b.map).toEqual(a.map);
    expect(b.offerUpgrades(3, 'normal').map((o) => o.def.id)).toEqual(a.offerUpgrades(3, 'normal').map((o) => o.def.id));
    expect(JSON.stringify(b.generateEncounter('combat'))).toEqual(JSON.stringify(a.generateEncounter('combat')));
  });

  it('endless runs extend the map and cycle regions', () => {
    const r = new Run({ ...cfg, mode: 'endless', regionCycle: ['cinder_marsh', 'frostvein'] });
    for (let i = 0; i < 8; i++) r.completeRoom();
    expect(r.finished).toBe(false);
    expect(r.map.length).toBeGreaterThanOrEqual(14);
    expect(r.region.id).toBe('frostvein');
    expect(r.difficulty().enemyHp).toBeGreaterThan(new Run(cfg).difficulty().enemyHp);
  });
});

describe('meta progression', () => {
  it('migrates a v2 save to v3 with new fields filled', () => {
    const store = new MemoryStore();
    const v2 = { ...freshProfile(), essence: 77 } as Record<string, unknown>;
    delete v2.feats; delete v2.cores; delete v2.cosmetics; delete v2.contracts;
    (v2 as { loadout: unknown }).loadout = { core: 'ember', shell: 'glass' };
    const json = JSON.stringify(v2);
    const slot = createSaveSlot(store);
    // Write a v2 envelope by hand.
    store.setItem('alchemyball.profile', JSON.stringify({ v: 2, sum: checksum(json), data: JSON.parse(json) }));
    const p = slot.load();
    expect(slot.lastLoadSource).toBe('main');
    expect(p.essence).toBe(77);
    expect(p.feats).toEqual([]);
    expect(p.cosmetics.trail).toBe('trail_default');
    expect(p.loadout.region).toBe('cinder_marsh');
  });

  it('feats unlock once, grant rewards, and open their upgrades', () => {
    const p = freshProfile();
    p.stats.kills = 120;
    const got = checkFeats(p);
    expect(got.map((f) => f.id)).toContain('feat_kills_100');
    expect(hasUnlock(p, Content.upgrades.get('volatile_remains')!.unlock)).toBe(true);
    expect(checkFeats(p)).toEqual([]);
    expect(new Set(FEATS.map((f) => f.id)).size).toBe(FEATS.length);
  });

  it('every feat-gated upgrade or cosmetic has a feat that grants it', () => {
    const ids = new Set(FEATS.map((f) => f.id));
    for (const u of Content.lists.UPGRADES) if (u.unlock?.startsWith('feat_')) expect(ids.has(u.unlock)).toBe(true);
  });

  it('contracts progress from events, can be claimed and are replaced', () => {
    const p = freshProfile();
    p.discovered.steam_burst = { at: 0, count: 1, feats: [] };
    ensureContracts(p);
    expect(p.contracts.length).toBe(3);
    const c = p.contracts[0];
    c.kind = 'combo'; c.goal = 5; c.progress = 0;
    contractEvent(p, { type: 'combo', count: 6, pos: { x: 0, y: 0 } });
    expect(c.progress).toBe(5);
    const before = p.essence + p.fragments;
    expect(claimContract(p, c.id)).toBeDefined();
    expect(p.essence + p.fragments).toBeGreaterThan(before);
    expect(p.contracts.length).toBe(3);
  });

  it('core mastery levels up and runs award core XP', () => {
    const p = freshProfile();
    expect(addCoreXp(p, 'ember', 120)).toEqual([2, 3]);
    const r = new Run(cfg);
    r.stats.roomsCleared = 4;
    const s = finishRun(p, r, false, 'Projectile');
    expect(s.coreXp).toBeGreaterThan(0);
    expect(s.goals.length).toBeGreaterThan(0);
    for (const g of s.goals) expect(g.cur).toBeGreaterThanOrEqual(0);
  });

  it('room challenges track progress and fail correctly', () => {
    const c = new ChallengeTracker({ kind: 'nohit', goal: 1, text: '', reward: { catalysts: 2, essence: 5 } });
    c.handle({ type: 'ballDamaged', amount: 3, source: 'x', hp: 90 }, 1);
    expect(c.failed).toBe(true);
    const r = new ChallengeTracker({ kind: 'reactions', goal: 2, text: '', reward: { catalysts: 2, essence: 5 } });
    const ev = { type: 'reaction', reactionId: 'quench', pos: { x: 0, y: 0 }, holderKind: 'enemy', holderUid: 1, depth: 0, targets: 1, kills: 0, onBoss: false, color: '#fff', radius: 10 } as const;
    r.handle(ev, 1);
    expect(r.handle(ev, 1)).toBe(true);
  });
});

describe('regions & bosses soak', () => {
  it('every region and boss runs stable and bounded', () => {
    for (const region of Content.lists.REGIONS) {
      for (const core of ['ember', 'storm', 'iron']) {
        const r = botRun({ seed: 11, core, regionId: region.id, maxRoomSeconds: 90 });
        expect(r.maxReactionsInStep).toBeLessThanOrEqual(40);
        expect(r.floor).toBeGreaterThan(0);
      }
    }
  }, 120000);

  it('endless descends past the first boss without breaking', () => {
    const r = botRun({ seed: 3, core: 'iron', mode: 'endless', maxFloors: 10, maxRoomSeconds: 90, skill: 0.9 });
    expect(r.maxReactionsInStep).toBeLessThanOrEqual(40);
  }, 60000);
});
