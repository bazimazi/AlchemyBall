import { describe, expect, it } from 'vitest';
import { Content } from '../src/content';
import { validateContent } from '../src/content/validate';
import { botRun } from '../src/game/autoplay';
import { buyResearch, freshProfile, masteryTier, pairKnowledge, recordReaction } from '../src/game/profile';
import { finishRun } from '../src/game/rewards';
import { Run } from '../src/game/run';
import { ProgressionTracker } from '../src/game/tracker';
import { PHYS } from '../src/sim/ballPhysics';

const cfg = { seed: 42, mode: 'standard' as const, regionId: 'cinder_marsh', core: 'ember', shell: 'glass', heat: 0, tutorial: false, maxPips: 3, rerolls: 0 };

describe('content', () => {
  it('validates with no errors', () => {
    const errors = validateContent().filter((i) => i.level === 'error');
    expect(errors).toEqual([]);
  });
});

describe('run structure', () => {
  it('builds a map ending in a boss, with a fighting option on every normal floor', () => {
    for (let seed = 1; seed < 40; seed++) {
      const r = new Run({ ...cfg, seed });
      expect(r.map.at(-1)).toEqual(['boss']);
      for (const choices of r.map.slice(0, -2)) expect(choices.some((c) => c === 'combat' || c === 'elite')).toBe(true);
    }
  });

  it('tutorial runs start with the handcrafted rooms', () => {
    const r = new Run({ ...cfg, tutorial: true });
    expect(r.map[0]).toEqual(['tutorial_launch']);
    expect(r.map[1]).toEqual(['tutorial_react']);
  });

  it('generates fair encounters: enemies inside the arena, away from the ball, not inside objects', () => {
    for (let seed = 1; seed < 30; seed++) {
      const r = new Run({ ...cfg, seed });
      r.floor = seed % 5;
      const spec = r.generateEncounter(seed % 3 === 0 ? 'elite' : 'combat');
      expect(spec.waves.length).toBeGreaterThan(0);
      for (const wv of spec.waves)
        for (const e of wv.enemies) {
          expect(e.x).toBeGreaterThan(0);
          expect(e.x).toBeLessThan(PHYS.arenaW);
          expect(e.y).toBeLessThan(PHYS.arenaH * 0.6);
          for (const o of spec.objects) expect(Math.hypot(o.x - e.x, o.y - e.y)).toBeGreaterThan(Content.objects.get(o.id)!.radius);
        }
    }
  });

  it('scales difficulty with floor', () => {
    const threat = (floor: number) => {
      const r = new Run({ ...cfg, seed: 7 });
      r.floor = floor;
      return r.generateEncounter('combat').waves.flatMap((w) => w.enemies).reduce((s, e) => s + Content.enemies.get(e.id)!.threat, 0);
    };
    expect(threat(4)).toBeGreaterThan(threat(0));
  });

  it('offers distinct, non-maxed upgrades including an element-agnostic option', () => {
    const r = new Run(cfg);
    for (let i = 0; i < 30; i++) {
      const offers = r.offerUpgrades(3, 'normal', () => true);
      if (!offers.length) break;
      expect(new Set(offers.map((o) => o.def.id)).size).toBe(offers.length);
      r.addUpgrade(offers[0].def.id);
      for (const [id, n] of r.upgrades) expect(n).toBeLessThanOrEqual(Content.upgrades.get(id)!.maxStacks);
    }
    const fresh = new Run(cfg);
    for (let i = 0; i < 20; i++) expect(fresh.offerUpgrades(3, 'normal', () => true).some((o) => o.def.elements.length === 0)).toBe(true);
  });

  it('upgrade mods stack additively', () => {
    const r = new Run(cfg);
    r.addUpgrade('dense_core');
    r.addUpgrade('dense_core');
    expect(r.mods().impactDmg).toBeCloseTo(0.5);
  });
});

describe('progression', () => {
  it('mastery is earned by variety, not repetition', () => {
    const p = freshProfile();
    for (let i = 0; i < 100; i++) recordReaction(p, 'steam_burst', ['enemy']);
    expect(masteryTier(p.discovered.steam_burst)).toBe(0);
    recordReaction(p, 'steam_burst', ['zone', 'chain']);
    expect(masteryTier(p.discovered.steam_burst)).toBe(1);
  });

  it('discoveries grant fragments immediately and persist regardless of run outcome', () => {
    const p = freshProfile();
    const run = new Run(cfg);
    const t = new ProgressionTracker(p, run, () => {});
    t.handle({ type: 'reaction', reactionId: 'freeze', pos: { x: 0, y: 0 }, holderKind: 'enemy', holderUid: 1, depth: 0, targets: 1, kills: 0, onBoss: false, color: '#fff', radius: 10 });
    expect(p.discovered.freeze).toBeDefined();
    expect(p.fragments).toBe(Content.reactions.get('freeze')!.discoveryReward);
    const s = finishRun(p, run, false, 'Projectile');
    expect(p.discovered.freeze).toBeDefined();
    expect(s.causeAdvice).toBeTruthy();
    expect(p.stats.runs).toBe(1);
  });

  it('research respects prerequisites and costs', () => {
    const p = freshProfile();
    expect(buyResearch(p, 'res_iron')).toBe(false); // requires Galvanics first
    p.fragments = 100;
    expect(buyResearch(p, 'res_storm')).toBe(true);
    expect(buyResearch(p, 'res_iron')).toBe(true);
    expect(p.fragments).toBe(100 - 12 - 14);
    expect(buyResearch(p, 'res_iron')).toBe(false);
  });

  it('codex distinguishes known, stirred, inert and untested pairs', () => {
    const p = freshProfile();
    expect(pairKnowledge(p, 'fire+water', ['steam_burst']).state).toBe('unknown');
    p.pairs['fire+ice'] = 'stirred';
    expect(pairKnowledge(p, 'fire+ice', ['melt']).state).toBe('stirred');
    p.pairs['water+wind'] = 'inert';
    expect(pairKnowledge(p, 'water+wind', []).state).toBe('inert');
    p.discovered.steam_burst = { at: 0, count: 1, feats: [] };
    expect(pairKnowledge(p, 'fire+water', ['steam_burst', 'quench']).state).toBe('known');
  });
});

describe('soak', () => {
  it('full bot runs across every core stay stable and bounded', () => {
    for (const c of Content.lists.CORES) {
      const r = botRun({ seed: 5, core: c.id, maxRoomSeconds: 90 });
      expect(r.maxReactionsInStep).toBeLessThanOrEqual(40);
      expect(r.maxDepth).toBeLessThanOrEqual(5);
      expect(r.floor).toBeGreaterThan(0);
    }
  }, 60000);
});
