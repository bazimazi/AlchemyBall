import { Content } from '../content';
import type { BossDef } from '../content/types';
import { vdist, vnorm, vsub } from '../core/vec';
import { PHYS } from './ballPhysics';
import type { Enemy } from './entities';
import type { World } from './world';

/**
 * Data-driven boss behaviour. Each phase (from `BOSSES`) changes the boss's innate element (so
 * the counters the player learned elsewhere apply), its armor and its attack mix:
 *  - slam: a red ring under the ball that detonates after a delay;
 *  - flask: a lobbed flask whose landing circle is shown, leaving a hostile zone;
 *  - nova: a charging ring around the boss, then a radial burst of projectiles;
 *  - charge: a line telegraph, then a dash along it.
 * Every hostile attack is telegraphed. No single hit may take more than 8% of the boss's HP.
 */
export class BossController {
  readonly data: BossDef;
  enemy: Enemy;
  phase = 0;
  defeated = false;
  private slamT = 3;
  private summonT = 5;
  private flaskT = 4;
  private novaT = 4;
  private chargeT = 5;
  /** Seconds of dash remaining. */
  private charging = 0;
  private chargeDir = { x: 0, y: 1 };
  private busy = 0;

  constructor(private world: World, id: string) {
    const data = Content.bosses[id];
    if (!data) throw new Error(`Unknown boss '${id}'`);
    this.data = data;
    const hp = Math.round(data.hp * world.diff.bossHp);
    this.enemy = world.spawnEnemy(id in Content.bosses && Content.enemies.has(id) ? id : 'warden', { x: PHYS.arenaW / 2, y: PHYS.arenaH * 0.26 }, {
      isBoss: true, hp, radius: data.radius, mass: data.mass, armor: data.phases[0].armor,
    });
    this.enemy.auras.set(data.phases[0].element, 1);
    this.novaT = (data.phases[0].nova?.interval ?? 99) * 0.7;
    this.chargeT = data.phases[0].chargeInterval ?? 99;
  }

  get phaseData() {
    return this.data.phases[this.phase];
  }

  innateFor(e: Enemy): { element: string; amount: number; regen: number } | undefined {
    return e === this.enemy ? { element: this.phaseData.element, amount: 1, regen: 0.25 } : undefined;
  }

  /** No single hit may take more than 8% of max HP: the fight is about sustained understanding, not one lucky combo. */
  filterDamage(d: number, _source: string): number {
    return Math.min(d, this.enemy.maxHp * 0.08);
  }

  private interval(base: number): number {
    return base / this.world.diff.bossTempo;
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
      this.charging = 0;
      this.novaT = Math.min(this.novaT, (p.nova?.interval ?? 99) * 0.6);
      this.chargeT = p.chargeInterval ?? 99;
      w.impulseFrom(e.pos, 700, 260, undefined, true);
      w.emit({ type: 'bossPhase', phase: this.phase + 1, element: p.element, name: this.data.name });
    }
    if (e.spawnFx > 0) return;
    const p = this.phaseData;
    const b = w.ball;
    const stunned = e.statuses.has('frozen') || e.statuses.has('stunned');
    if (this.charging > 0 && !stunned) {
      this.charging -= dt;
      e.vel.x = this.chargeDir.x * 880;
      e.vel.y = this.chargeDir.y * 880;
      return;
    }
    // Drift: hover above the ball's column in the upper arena.
    const target = { x: b.pos.x, y: PHYS.arenaH * 0.28 };
    const dir = vnorm(vsub(target, e.pos));
    const sp = stunned || this.busy > 0 ? 0 : 55 * w.enemySpeedMul(e) + 1;
    e.vel.x += (dir.x * sp - e.vel.x) * Math.min(1, 2 * dt);
    e.vel.y += (dir.y * sp - e.vel.y) * Math.min(1, 2 * dt);
    this.busy = Math.max(0, this.busy - dt);
    if (stunned) return;
    const dmg = w.diff.enemyDmg;

    this.slamT -= dt;
    if (this.slamT <= 0) {
      this.slamT = this.interval(p.slamInterval);
      w.addTelegraph(b.pos, 115, 1.15, 16 * dmg, '#ff5a3a', { cause: `${this.data.name.replace(/^The /, '')}'s Slam` });
      if (this.phase === this.data.phases.length - 1) w.addTelegraph({ x: PHYS.arenaW - b.pos.x, y: b.pos.y }, 115, 1.4, 16 * dmg, '#ffe84a', { cause: `${this.data.name.replace(/^The /, '')}'s Slam` });
      w.emit({ type: 'bossAttack', kind: 'slam', pos: { ...b.pos } });
    }
    this.summonT -= dt;
    if (this.summonT <= 0) {
      this.summonT = this.interval(p.summonInterval);
      const adds = w.enemies.filter((x) => !x.isBoss && !x.dead).length;
      if (adds < 4) {
        const side = w.rng.chance(0.5) ? -1 : 1;
        w.spawnEnemy(p.summon, { x: Math.max(60, Math.min(PHYS.arenaW - 60, e.pos.x + side * 110)), y: e.pos.y + 60 });
      }
    }
    this.flaskT -= dt;
    if (this.flaskT <= 0) {
      this.flaskT = this.interval(p.flaskInterval);
      if (p.flaskZone) {
        const land = { x: b.pos.x + b.vel.x * 0.4, y: b.pos.y + b.vel.y * 0.4 };
        land.x = Math.max(60, Math.min(PHYS.arenaW - 60, land.x));
        land.y = Math.max(60, Math.min(PHYS.arenaH - 60, land.y));
        const dur = 0.6 + vdist(e.pos, land) / 700;
        const el = Content.zones.get(p.flaskZone)?.element ?? p.element;
        w.spawnProjectile(e.pos, { x: 0, y: 0 }, 10, 8 * dmg, el, 'hostile', { target: land, zone: p.flaskZone, zoneRadius: 85, t: 0, dur, from: { ...e.pos } });
        w.emit({ type: 'telegraph', pos: land, radius: 85 });
        w.emit({ type: 'bossAttack', kind: 'flask', pos: land });
      }
    }
    if (p.nova) {
      this.novaT -= dt;
      if (this.novaT <= 0) {
        const nova = p.nova;
        this.novaT = this.interval(nova.interval);
        this.busy = nova.spokes ? 1.12 : 0.9;
        this.castNova(nova, nova.element ?? p.element);
        w.emit({ type: 'bossAttack', kind: 'nova', pos: { ...e.pos } });
      }
    }
    if (p.chargeInterval) {
      this.chargeT -= dt;
      if (this.chargeT <= 0) {
        this.chargeT = this.interval(p.chargeInterval);
        const d = vnorm(vsub(b.pos, e.pos));
        this.busy = 1;
        const length = 520;
        w.addTelegraph(e.pos, e.radius, 0.8, 0, '#ff5a3a', {
          kind: 'line', dir: d, length, cause: 'Charge',
          fire: () => {
            if (this.enemy.dead) return;
            this.chargeDir = d;
            this.charging = length / 880;
          },
        });
        w.emit({ type: 'bossAttack', kind: 'charge', pos: { ...e.pos } });
      }
    }
  }

  private castNova(nova: NonNullable<BossDef['phases'][number]['nova']>, element: string): void {
    const w = this.world;
    const enemy = this.enemy;
    const color = Content.elements.get(element)?.color ?? '#fff';
    const fire = (origin: { x: number; y: number }, dir: { x: number; y: number }) => {
      w.spawnProjectile({ x: origin.x + dir.x * enemy.radius, y: origin.y + dir.y * enemy.radius },
        { x: dir.x * nova.speed, y: dir.y * nova.speed }, 8, nova.damage * w.diff.enemyDmg, element, 'hostile');
    };
    const directions = () => {
      const offset = w.rng.next() * Math.PI * 2;
      return Array.from({ length: nova.count }, (_, i) => {
        const angle = offset + i / nova.count * Math.PI * 2;
        return { x: Math.cos(angle), y: Math.sin(angle) };
      });
    };
    if (!nova.spokes) {
      w.addTelegraph(enemy.pos, enemy.radius + 70, 0.85, 0, color, {
        kind: 'nova', cause: 'Nova',
        fire: () => { if (!enemy.dead) for (const dir of directions()) fire(enemy.pos, dir); },
      });
      return;
    }
    const origin = { ...enemy.pos };
    const phase = this.phase;
    for (const dir of directions()) {
      const toWallX = ((dir.x > 0 ? PHYS.arenaW : 0) - origin.x) / dir.x;
      const toWallY = ((dir.y > 0 ? PHYS.arenaH : 0) - origin.y) / dir.y;
      w.addTelegraph(origin, 22, 1.05, 0, color, {
        kind: 'line', dir, length: Math.min(toWallX, toWallY), cause: 'Eclipse Volley',
        fire: () => { if (!enemy.dead && this.phase === phase) fire(origin, dir); },
      });
    }
  }

  onDeath(): void {
    this.defeated = true;
    this.world.purging = true;
    for (const x of this.world.enemies) if (!x.isBoss && !x.dead) this.world.damageHolder(x, 9999, 'reaction');
    this.world.purging = false;
  }
}
