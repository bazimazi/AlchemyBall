import { describe, expect, it } from 'vitest';
import { MAX_CHAIN_DEPTH } from '../src/sim/reactionEngine';
import { collect, makeWorld } from './helpers';

describe('reaction engine', () => {
  it('stores an element when nothing reacts', () => {
    const w = makeWorld();
    const e = w.spawnEnemy('dummy', { x: 300, y: 300 });
    e.spawnFx = 0;
    const out = w.engine.apply(e, 'fire', 0.8, { depth: 0 });
    expect(out.kind).toBe('stored');
    expect(e.auras.get('fire')).toBeCloseTo(0.8);
  });

  it('fire onto a wet enemy produces a steam burst and consumes inputs', () => {
    const w = makeWorld();
    const reactions = collect<{ reactionId: string }>(w, 'reaction');
    const e = w.spawnEnemy('slime', { x: 300, y: 300 });
    e.spawnFx = 0;
    const out = w.engine.apply(e, 'fire', 1, { depth: 0 });
    expect(out.kind).toBe('reacted');
    expect(reactions.map((r) => r.reactionId)).toContain('steam_burst');
    expect(e.auras.get('water') ?? 0).toBeLessThan(0.1);
    expect(e.auras.get('steam')).toBeGreaterThan(0);
    expect(w.zones.some((z) => z.def.id === 'steam_cloud')).toBe(true);
  });

  it('context variants: a trickle of fire on lots of water only quenches', () => {
    const w = makeWorld();
    const e = w.spawnEnemy('dummy', { x: 300, y: 300 });
    e.spawnFx = 0;
    e.auras.set('water', 2);
    const out = w.engine.apply(e, 'fire', 0.3, { depth: 0 });
    expect(out.kind === 'reacted' && out.reaction.id).toBe('quench');
  });

  it('shatter requires frozen status and a fast impact', () => {
    const w = makeWorld();
    const stirred = collect(w, 'stirred');
    const e = w.spawnEnemy('dummy', { x: 300, y: 300 });
    e.spawnFx = 0;
    e.auras.set('ice', 1);
    // Slow impact on a merely chilled target: nothing, but "something stirred".
    const slow = w.engine.apply(e, 'kinetic', 1, { depth: 0, impactSpeed: 300 });
    expect(slow.kind).not.toBe('reacted');
    expect(stirred.length).toBeGreaterThan(0);
    w.setStatus(e, 'frozen', 3);
    const hp = e.hp;
    const fast = w.engine.apply(e, 'kinetic', 1.2, { depth: 0, impactSpeed: 900 });
    expect(fast.kind === 'reacted' && fast.reaction.id).toBe('shatter');
    expect(e.dead || e.hp < hp).toBe(true);
  });

  it('never stores the hidden kinetic element', () => {
    const w = makeWorld();
    const e = w.spawnEnemy('dummy', { x: 300, y: 300 });
    w.engine.apply(e, 'kinetic', 2, { depth: 0, impactSpeed: 2000 });
    expect(e.auras.has('kinetic')).toBe(false);
  });

  it('conductive surge chains across wet enemies but is bounded', () => {
    const w = makeWorld();
    const arcs = collect(w, 'arc');
    const slimes = Array.from({ length: 12 }, (_, i) => w.spawnEnemy('slime', { x: 100 + (i % 4) * 90, y: 200 + Math.floor(i / 4) * 90 }));
    for (const s of slimes) (s.spawnFx = 0), (s.hp = 9999), (s.maxHp = 9999);
    w.engine.apply(slimes[0], 'lightning', 1, { depth: 0 });
    expect(arcs.length).toBeGreaterThan(2);
    // The whole cascade resolves synchronously and within budget.
    expect(w.engine.reactionsThisStep).toBeLessThanOrEqual(40);
  });

  it('respects the chain depth limit', () => {
    const w = makeWorld();
    const e = w.spawnEnemy('slime', { x: 300, y: 300 });
    e.spawnFx = 0;
    const out = w.engine.apply(e, 'lightning', 1, { depth: MAX_CHAIN_DEPTH + 1 });
    expect(out.kind).toBe('stored');
  });

  it('cooldowns stop a holder re-triggering the same reaction immediately', () => {
    const w = makeWorld();
    const e = w.spawnEnemy('dummy', { x: 300, y: 300 });
    e.spawnFx = 0;
    e.hp = e.maxHp = 9999;
    e.auras.set('water', 2);
    const first = w.engine.apply(e, 'fire', 1.5, { depth: 0 });
    e.auras.set('water', 2);
    const second = w.engine.apply(e, 'fire', 1.5, { depth: 0 });
    expect(first.kind).toBe('reacted');
    expect(second.kind).toBe('blocked');
  });

  it('wildcard arcane overload amplifies its partner', () => {
    const w = makeWorld();
    const e = w.spawnEnemy('dummy', { x: 300, y: 300 });
    e.spawnFx = 0;
    e.hp = e.maxHp = 9999;
    e.auras.set('poison', 0.6);
    const out = w.engine.apply(e, 'arcane', 1, { depth: 0 });
    expect(out.kind === 'reacted' && out.reaction.id).toBe('overload');
    expect(e.auras.get('poison')).toBeCloseTo(1.2);
  });

  it('reports inert base pairs so the codex can show failed experiments', () => {
    const w = makeWorld();
    const inert = collect<{ pair: string }>(w, 'inert');
    const e = w.spawnEnemy('dummy', { x: 300, y: 300 });
    e.auras.set('wind', 1);
    w.engine.apply(e, 'water', 1, { depth: 0 });
    expect(inert.map((i) => i.pair)).toContain('water+wind');
  });

  it('zones react: ice freezes a water pool into an ice sheet', () => {
    const w = makeWorld();
    const pool = w.spawnZone('water_pool', { x: 300, y: 300 }, 90, Infinity, 'neutral', 0)!;
    const out = w.engine.apply(pool, 'ice', 1, { depth: 0 });
    expect(out.kind === 'reacted' && out.reaction.id).toBe('freeze_pool');
    w.step();
    expect(w.zones.some((z) => z.def.id === 'ice_patch')).toBe(true);
    expect(w.zones.some((z) => z.def.id === 'water_pool')).toBe(false);
  });

  it('water painted on an ice sheet does not respawn ice sheets (zone loop guard)', () => {
    const w = makeWorld({ coreElement: 'water' });
    const reactions = collect<{ reactionId: string }>(w, 'reaction');
    w.spawnZone('ice_patch', { ...w.ball.pos }, 120, Infinity, 'neutral', 0);
    for (let i = 0; i < 120 * 5; i++) w.step();
    expect(reactions.filter((r) => r.reactionId === 'freeze_pool').length).toBe(0);
    expect(w.zones.filter((z) => z.def.id === 'ice_patch').length).toBe(1);
  });

  it('poison turns a water pool toxic exactly once', () => {
    const w = makeWorld();
    const pool = w.spawnZone('water_pool', { x: 300, y: 300 }, 90, Infinity, 'neutral', 0)!;
    const out = w.engine.apply(pool, 'poison', 1, { depth: 0 });
    expect(out.kind === 'reacted' && out.reaction.id).toBe('toxic_spill');
    w.step();
    expect(w.zones.map((z) => z.def.id)).toEqual(['toxic_pool']);
  });

  it('magma spawned next to water forges obsidian terrain', () => {
    const w = makeWorld();
    w.spawnZone('water_pool', { x: 300, y: 300 }, 90, Infinity, 'neutral', 0);
    const before = w.objects.length;
    w.spawnZone('magma_pool', { x: 340, y: 300 }, 90, 8, 'player', 0);
    expect(w.objects.length).toBe(before + 1);
    expect(w.objects.at(-1)!.def.id).toBe('obsidian');
  });

  it('heat exposes armor so impacts land fully', () => {
    const w = makeWorld();
    const b = w.spawnEnemy('beetle', { x: 300, y: 300 });
    b.spawnFx = 0;
    w.engine.apply(b, 'fire', 1, { depth: 0 });
    expect(b.statuses.has('exposed')).toBe(true);
  });
});
