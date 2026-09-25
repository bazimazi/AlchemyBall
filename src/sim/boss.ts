import { Content } from '../content';
import { vdist, vnorm, vsub } from '../core/vec';
import { PHYS } from './ballPhysics';
import type { Enemy } from './entities';
import type { World } from './world';

type BossData = (typeof Content.bosses)[keyof typeof Content.bosses];

/**
 * The Crucible Warden. Three phases, each changing the boss's innate element (so the counters
 * the player learned elsewhere apply), its armor, and its attack mix:
 *  1 Metal shell  — near-immune to raw impacts; heat (Searing Metal) or poison (Corrode) Exposes it.
 *  2 Fire core    — lobs fire flasks; water makes Steam Bursts on it, bloats nearby are bombs.
 *  3 Charged core — summons slimes (wet → conductive surges), storm flasks; earth grounds it.
 * Every hostile attack is telegraphed.
 */
export class BossController {
  readonly data: BossData;
  enemy: Enemy;
  phase = 0;
  defeated = false;
  private slamT = 3;
  private summonT = 5;
  private flaskT = 4;

  constructor(private world: World, id: string) {
    const data = (Content.bosses as Record<string, BossData>)[id];
    if (!data) throw new Error(`Unknown boss '${id}'`);
    this.data = data;
    this.enemy = world.spawnEnemy('warden', { x: PHYS.arenaW / 2, y: PHYS.arenaH * 0.26 }, {
      isBoss: true, hp: data.hp, radius: data.radius, mass: data.mass, armor: data.phases[0].armor,
    });
    this.enemy.auras.set(data.phases[0].element, 1);
  }

  get phaseData() {
    return this.data.phases[this.phase];
  }

  innateFor(e: Enemy): { element: string; amount: number; regen: number } | undefined {
    return e === this.enemy ? { element: this.phaseData.element, amount: 1, regen: 0.25 } : undefined;
  }

  /** No single hit may take more than 8% of max HP: the fight is about sustained understanding, not one lucky combo. */
  filterDamage(d: number, _source: string): number {
    return Math.min(d, this.data.hp * 0.08);
  }

  update(dt: number): void {
    const w = this.world;
    const e = this.enemy;
    if (this.defeated || e.dead) return;
    // Phase transitions.
    const frac = e.hp / e.maxHp;
    while (this.phase < this.data.phases.length - 1 && frac <= this.data.phases[this.phase].hpAbove) {
      this.phase++;
      const p = this.phaseData;
      e.armor = p.armor;
      e.auras.clear();
      e.auras.set(p.element, 1);
      e.statuses.clear();
      e.spawnFx = 0.8;
      w.impulseFrom(e.pos, 700, 260, undefined, true);
      w.emit({ type: 'bossPhase', phase: this.phase + 1, element: p.element, name: this.data.name });
    }
    if (e.spawnFx > 0) return;
    const p = this.phaseData;
    const b = w.ball;
    const stunned = e.statuses.has('frozen') || e.statuses.has('stunned');
    // Drift: hover above the ball's column in the upper arena.
    const target = { x: b.pos.x, y: PHYS.arenaH * 0.28 };
    const dir = vnorm(vsub(target, e.pos));
    const sp = stunned ? 0 : 55 * w.enemySpeedMul(e) + 1;
    e.vel.x += (dir.x * sp - e.vel.x) * Math.min(1, 2 * dt);
    e.vel.y += (dir.y * sp - e.vel.y) * Math.min(1, 2 * dt);
    if (stunned) return;

    this.slamT -= dt;
    if (this.slamT <= 0) {
      this.slamT = p.slamInterval;
      w.addTelegraph(b.pos, 115, 1.15, 16, '#ff5a3a');
      if (this.phase === 2) w.addTelegraph({ x: PHYS.arenaW - b.pos.x, y: b.pos.y }, 115, 1.4, 16, '#ffe84a');
    }
    this.summonT -= dt;
    if (this.summonT <= 0) {
      this.summonT = p.summonInterval;
      const adds = w.enemies.filter((x) => !x.isBoss && !x.dead).length;
      if (adds < 4) {
        const side = w.rng.chance(0.5) ? -1 : 1;
        w.spawnEnemy(p.summon, { x: e.pos.x + side * 110, y: e.pos.y + 60 });
      }
    }
    this.flaskT -= dt;
    if (this.flaskT <= 0) {
      this.flaskT = p.flaskInterval;
      const zone = this.phase === 1 ? 'fire_patch' : 'storm_cloud';
      const land = { x: b.pos.x + b.vel.x * 0.4, y: b.pos.y + b.vel.y * 0.4 };
      land.x = Math.max(60, Math.min(PHYS.arenaW - 60, land.x));
      land.y = Math.max(60, Math.min(PHYS.arenaH - 60, land.y));
      const dur = 0.6 + vdist(e.pos, land) / 700;
      w.spawnProjectile(e.pos, { x: 0, y: 0 }, 10, 8, this.phase === 1 ? 'fire' : 'lightning', 'hostile', { target: land, zone, zoneRadius: 85, t: 0, dur, from: { ...e.pos } });
      w.emit({ type: 'telegraph', pos: land, radius: 85 });
    }
  }

  onDeath(): void {
    this.defeated = true;
    for (const x of this.world.enemies) if (!x.isBoss && !x.dead) this.world.damageHolder(x, 9999, 'reaction');
  }
}
