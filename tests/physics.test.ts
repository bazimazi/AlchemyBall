import { describe, expect, it } from 'vitest';
import { PHYS } from '../src/sim/ballPhysics';
import { collect, emptySpec, makeWorld } from './helpers';

describe('ball physics', () => {
  it('never tunnels through walls at extreme speed', () => {
    const w = makeWorld({ coreElement: 'wind' });
    for (let i = 0; i < 50; i++) {
      const a = (i / 50) * Math.PI * 2;
      w.ball.vel = { x: Math.cos(a) * 5000, y: Math.sin(a) * 5000 };
      for (let s = 0; s < 240; s++) {
        w.step();
        const b = w.ball.pos;
        expect(b.x).toBeGreaterThanOrEqual(w.ball.radius - 1e-6);
        expect(b.x).toBeLessThanOrEqual(PHYS.arenaW - w.ball.radius + 1e-6);
        expect(b.y).toBeGreaterThanOrEqual(w.ball.radius - 1e-6);
        expect(b.y).toBeLessThanOrEqual(PHYS.arenaH - w.ball.radius + 1e-6);
      }
    }
  });

  it('launch spends a pip and pips regenerate', () => {
    const w = makeWorld();
    expect(w.launch({ x: 0, y: -1 }, 1)).toBe(true);
    w.step();
    expect(w.ball.pips).toBe(2);
    for (let i = 0; i < Math.ceil(PHYS.pipRegen / PHYS.step) + 2; i++) w.step();
    expect(w.ball.pips).toBe(3);
  });

  it('the ball comes to rest', () => {
    const w = makeWorld({ coreElement: 'fire' });
    w.launch({ x: 0.3, y: -1 }, 1);
    for (let i = 0; i < 120 * 12; i++) w.step();
    expect(Math.hypot(w.ball.vel.x, w.ball.vel.y)).toBe(0);
  });

  it('elements change physics: metal is heavier and hits harder, ice is slicker', () => {
    const metal = makeWorld({ coreElement: 'metal' }).physics();
    const ice = makeWorld({ coreElement: 'ice' }).physics();
    const fire = makeWorld({ coreElement: 'fire' }).physics();
    expect(metal.massMul).toBeGreaterThan(1.5);
    expect(metal.impactDamageMul).toBeGreaterThan(fire.impactDamageMul);
    expect(ice.dragMul).toBeLessThan(0.7);
  });

  it('is deterministic for the same seed and inputs', () => {
    const run = () => {
      const w = makeWorld({ encounter: emptySpec({ waves: [{ enemies: [{ id: 'slime', x: 300, y: 300 }, { id: 'imp', x: 500, y: 200 }] }] }), seed: 99 });
      const log: string[] = [];
      w.events.onAny((e) => log.push(e.type));
      for (let i = 0; i < 1200; i++) {
        if (i % 150 === 0) w.launch({ x: Math.sin(i), y: -1 }, 0.9);
        w.step();
      }
      return JSON.stringify({ b: w.ball.pos, hp: w.ball.hp, e: w.enemies.map((e) => [e.pos, e.hp]), log });
    };
    expect(run()).toBe(run());
  });

  it('impacts register hits on enemies', () => {
    const w = makeWorld({ encounter: emptySpec({ waves: [{ enemies: [{ id: 'dummy', x: 360, y: 700 }] }] }) });
    const hits = collect(w, 'hit');
    // Wave spawns at 0.6s, then a 0.8s spawn telegraph during which enemies are intangible.
    for (let i = 0; i < 200; i++) w.step();
    w.launch({ x: 0, y: -1 }, 1);
    for (let i = 0; i < 120; i++) w.step();
    expect(hits.length).toBeGreaterThan(0);
  });

  it('a resting ball takes contact damage from enemies', () => {
    const w = makeWorld({ encounter: emptySpec({ waves: [{ enemies: [{ id: 'slime', x: 360, y: 900 }] }] }) });
    for (let i = 0; i < 240; i++) w.step();
    expect(w.ball.hp).toBeLessThan(100);
  });

  it('frozen status prevents launching', () => {
    const w = makeWorld();
    w.setStatus(w.ball, 'frozen', 1);
    expect(w.launch({ x: 0, y: -1 }, 1)).toBe(false);
  });
});
