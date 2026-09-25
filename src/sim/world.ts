import { Content, element as elementDef } from '../content';
import type { EffectDef, Faction, ReactionDef, ShellDef, StatusId } from '../content/types';
import { Emitter } from '../core/events';
import { Rng } from '../core/rng';
import { clamp, closestOnSegment, vdist, vdist2, vlen, vnorm, vsub, type Vec2 } from '../core/vec';
import { effectivePhysics, PHYS } from './ballPhysics';
import { BossController } from './boss';
import type { AnyHolder, ArenaObject, Ball, Enemy, Holder, Projectile, Telegraph, Wall, Zone } from './entities';
import type { SimEvent } from './events';
import { ReactionEngine } from './reactionEngine';

export interface EncounterSpec {
  id: string;
  kind: 'combat' | 'elite' | 'boss' | 'lab' | 'tutorial';
  walls: Wall[];
  objects: { id: string; x: number; y: number }[];
  zones: { id: string; x: number; y: number; r: number }[];
  waves: { enemies: { id: string; x: number; y: number }[] }[];
  boss?: string;
  objective: string;
}

export interface WorldOptions {
  encounter: EncounterSpec;
  coreElement: string;
  maxHp: number;
  hp: number;
  shell?: ShellDef;
  mods: Record<string, number>;
  unlocks: Set<string>;
  /** Reaction id → potency multiplier from mastery. */
  potency: Map<string, number>;
  maxPips: number;
  seed: number;
  /** Lab/sandbox: ball cannot die, enemies respawn on demand. */
  sandbox?: boolean;
}

const MAX_ZONES = 24;
const MAX_PROJECTILES = 80;

/**
 * The headless simulation. Deterministic for a given seed and input sequence; runs at a fixed
 * step (PHYS.step) independent of frame rate. Presentation listens to `events`.
 */
export class World {
  readonly events = new Emitter<SimEvent>();
  readonly engine: ReactionEngine;
  readonly rng: Rng;
  readonly ball: Ball;
  readonly enemies: Enemy[] = [];
  readonly zones: Zone[] = [];
  readonly objects: ArenaObject[] = [];
  readonly projectiles: Projectile[] = [];
  readonly telegraphs: Telegraph[] = [];
  readonly walls: Wall[] = [];
  readonly mods: Record<string, number>;
  readonly unlocks: Set<string>;
  readonly shell?: ShellDef;
  readonly spec: EncounterSpec;
  readonly sandbox: boolean;
  boss?: BossController;
  time = 0;
  wave = -1;
  waveTimer = 0;
  cleared = false;
  over = false;
  reactionCount = 0;
  private uidSeq = 1;
  private lastDotEvent = -1;
  private potency: Map<string, number>;
  private contactCd = new Map<number, number>();
  private seenElements = new Set<string>();
  /** Queue of launches from input; consumed on the next step so input is deterministic per step. */
  private pendingLaunch: { dir: Vec2; power: number } | null = null;
  private pendingBrake = false;

  constructor(opts: WorldOptions) {
    this.spec = opts.encounter;
    this.rng = new Rng(opts.seed);
    this.mods = opts.mods;
    this.unlocks = opts.unlocks;
    this.shell = opts.shell;
    this.potency = opts.potency;
    this.sandbox = !!opts.sandbox;
    this.engine = new ReactionEngine(this);
    const W = PHYS.arenaW;
    const H = PHYS.arenaH;
    this.ball = {
      uid: this.nextUid(), kind: 'ball', pos: { x: W / 2, y: H * 0.86 }, vel: { x: 0, y: 0 }, radius: PHYS.ballRadius,
      auras: new Map([[opts.coreElement, 1]]), cooldowns: new Map(), statuses: new Map(), tags: [], faction: 'player', dead: false,
      hp: opts.hp, maxHp: opts.maxHp, shield: 0, coreElement: opts.coreElement,
      pips: opts.maxPips, maxPips: opts.maxPips, pipTimer: 0,
      focus: PHYS.maxFocus * (1 + (opts.mods.focus ?? 0)), maxFocus: PHYS.maxFocus * (1 + (opts.mods.focus ?? 0)),
      buffs: new Map(), invuln: 0, brakeCd: 0, sinceLaunch: 99,
    };
    // Border walls (slightly chamfered corners so the ball never wedges).
    const c = 40;
    const pts: Vec2[] = [
      { x: c, y: 0 }, { x: W - c, y: 0 }, { x: W, y: c }, { x: W, y: H - c }, { x: W - c, y: H }, { x: c, y: H }, { x: 0, y: H - c }, { x: 0, y: c },
    ];
    for (let i = 0; i < pts.length; i++) this.walls.push({ a: pts[i], b: pts[(i + 1) % pts.length], material: 'stone' });
    this.walls.push(...opts.encounter.walls);
    for (const o of opts.encounter.objects) this.spawnObject(o.id, { x: o.x, y: o.y });
    for (const z of opts.encounter.zones) this.spawnZone(z.id, { x: z.x, y: z.y }, z.r, Infinity, 'neutral', 0);
    if (opts.encounter.boss) this.boss = new BossController(this, opts.encounter.boss);
  }

  nextUid(): number {
    return this.uidSeq++;
  }

  emit(e: SimEvent): void {
    this.events.emit(e);
  }

  // ─── Input ────────────────────────────────────────────────────────────────
  canLaunch(): boolean {
    return this.ball.pips >= 1 && !this.ball.statuses.has('frozen') && !this.over;
  }

  launch(dir: Vec2, power: number): boolean {
    if (!this.canLaunch()) return false;
    this.pendingLaunch = { dir: vnorm(dir), power: clamp(power, 0.15, 1) };
    return true;
  }

  brake(): boolean {
    if (this.ball.brakeCd > 0 || this.over) return false;
    this.pendingBrake = true;
    return true;
  }

  // ─── Step ─────────────────────────────────────────────────────────────────
  step(dt = PHYS.step): void {
    if (this.over) return;
    this.time += dt;
    this.engine.beginStep();
    this.updateTimers(dt);
    this.updateWaves(dt);
    this.updateBall(dt);
    this.boss?.update(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateTelegraphs(dt);
    this.updateZones(dt);
    this.cleanup();
    this.checkEnd();
  }

  private updateTimers(dt: number): void {
    const b = this.ball;
    const decay = (h: Holder, keep?: { element: string; amount: number; regen: number }) => {
      for (const [el, amt] of h.auras) {
        let next = amt - elementDef(el).decayPerSec * dt;
        if (keep && el === keep.element) next = amt < keep.amount ? Math.min(keep.amount, amt + keep.regen * dt) : amt - elementDef(el).decayPerSec * dt * 0.5;
        if (next <= 0.02) h.auras.delete(el);
        else h.auras.set(el, next);
      }
      if (keep && !h.auras.has(keep.element) && keep.regen > 0) h.auras.set(keep.element, keep.regen * dt);
      for (const [k, t] of h.cooldowns) (t - dt <= 0 ? h.cooldowns.delete(k) : h.cooldowns.set(k, t - dt));
      for (const [k, t] of h.statuses) (t - dt <= 0 ? h.statuses.delete(k) : h.statuses.set(k, t - dt));
    };
    decay(b, { element: b.coreElement, amount: 1, regen: 0.35 * (1 + (this.mods.coreRegen ?? 0)) });
    for (const [k, t] of b.buffs) (t - dt <= 0 ? b.buffs.delete(k) : b.buffs.set(k, t - dt));
    b.invuln = Math.max(0, b.invuln - dt);
    b.brakeCd = Math.max(0, b.brakeCd - dt);
    b.sinceLaunch += dt;
    if (b.pips < b.maxPips) {
      b.pipTimer += dt * (1 + (this.mods.pipRegen ?? 0));
      if (b.pipTimer >= PHYS.pipRegen) {
        b.pipTimer = 0;
        b.pips++;
      }
    } else b.pipTimer = 0;

    for (const e of this.enemies) {
      decay(e, e.def.innate && !e.isBoss ? { element: e.def.innate.element, amount: e.def.innate.amount, regen: 0.3 } : this.boss?.innateFor(e));
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      e.spawnFx = Math.max(0, e.spawnFx - dt);
      // Passive aura effects on enemies.
      if (e.spawnFx > 0) continue;
      let dps = 0;
      for (const [el, amt] of e.auras) {
        const d = elementDef(el).onEnemy?.dps ?? 0;
        if (!d) continue;
        let mul = 1;
        if (el === 'fire') mul += this.mods.burnDps ?? 0;
        if (el === 'poison') mul += this.mods.poisonDps ?? 0;
        dps += d * Math.min(1, amt) * mul;
      }
      if (dps > 0) this.damageHolder(e, dps * dt, 'dot', undefined, undefined, true);
    }
    for (const o of this.objects) {
      decay(o, o.def.element ? { element: o.def.element, amount: o.def.amount, regen: o.def.regen } : undefined);
      o.hitFlash = Math.max(0, o.hitFlash - dt);
      if (o.def.hp !== undefined && o.def.tags.includes('flammable')) {
        const fire = o.auras.get('fire') ?? 0;
        if (fire > 0.05) this.damageHolder(o, 10 * dt, 'dot', undefined, undefined, true);
      }
      if (o.ttl !== Infinity) {
        o.ttl -= dt;
        if (o.ttl <= 0) o.dead = true;
      }
    }
    for (const z of this.zones) {
      decay(z, z.def.element ? { element: z.def.element, amount: 1, regen: 0.5 } : undefined);
      z.ttl -= dt;
    }
    for (const [k, t] of this.contactCd) (t - dt <= 0 ? this.contactCd.delete(k) : this.contactCd.set(k, t - dt));
  }

  private updateWaves(dt: number): void {
    const waves = this.spec.waves;
    this.waveTimer += dt;
    const alive = this.enemies.filter((e) => !e.dead && !e.isBoss).length;
    const next = this.wave + 1;
    if (next >= waves.length) return;
    const ready = this.wave < 0 ? this.waveTimer > 0.6 : alive === 0 || (alive <= 1 && this.waveTimer > 14);
    if (!ready) return;
    this.wave = next;
    this.waveTimer = 0;
    for (const s of waves[next].enemies) this.spawnEnemy(s.id, { x: s.x, y: s.y });
    this.emit({ type: 'waveStart', wave: next + 1, total: waves.length });
  }

  // ─── Ball ─────────────────────────────────────────────────────────────────
  physics() {
    return effectivePhysics(this.ball, this.shell, this.mods);
  }

  private updateBall(dt: number): void {
    const b = this.ball;
    const ph = this.physics();
    if (this.pendingLaunch) {
      const { dir, power } = this.pendingLaunch;
      this.pendingLaunch = null;
      if (this.canLaunch()) {
        b.pips--;
        const sp = PHYS.launchSpeed * ph.launchMul * power;
        b.vel = { x: dir.x * sp, y: dir.y * sp };
        b.sinceLaunch = 0;
        this.emit({ type: 'launch', pos: { ...b.pos }, dir, power });
      }
    }
    if (this.pendingBrake) {
      this.pendingBrake = false;
      b.vel = { x: b.vel.x * PHYS.brakeFactor, y: b.vel.y * PHYS.brakeFactor };
      b.brakeCd = PHYS.brakeCooldown;
      this.emit({ type: 'brake', pos: { ...b.pos } });
    }

    // Zone floor effects on drag, currents.
    let zoneDrag = 1;
    for (const z of this.zones) {
      if (vdist2(z.pos, b.pos) > z.radius * z.radius) continue;
      zoneDrag *= z.def.ballDragMul;
      if (z.def.push) {
        b.vel.x += z.dir.x * z.def.push * dt;
        b.vel.y += z.dir.y * z.def.push * dt;
      }
    }
    // Magnetism: a metal-carrying ball is pulled toward magnetized enemies.
    if ((b.auras.get('metal') ?? 0) > 0.2) {
      let best: Enemy | undefined;
      let bd = 420 * 420;
      for (const e of this.enemies) {
        if (e.dead || !e.statuses.has('magnetized')) continue;
        const d = vdist2(e.pos, b.pos);
        if (d < bd) (bd = d), (best = e);
      }
      if (best) {
        const n = vnorm(vsub(best.pos, b.pos));
        b.vel.x += n.x * 1100 * dt;
        b.vel.y += n.y * 1100 * dt;
      }
    }
    b.vel.y += PHYS.gravity * dt;

    let speed = vlen(b.vel);
    const drag = PHYS.baseDrag * ph.dragMul * zoneDrag + (speed < PHYS.restSpeed * 3 ? PHYS.restDrag * (1 - speed / (PHYS.restSpeed * 3)) : 0);
    const f = Math.exp(-drag * dt);
    b.vel.x *= f;
    b.vel.y *= f;
    speed = vlen(b.vel);
    const maxSp = PHYS.baseMaxSpeed * ph.maxSpeedMul;
    if (speed > maxSp) {
      b.vel.x *= maxSp / speed;
      b.vel.y *= maxSp / speed;
      speed = maxSp;
    }
    if (speed < 4) b.vel.x = b.vel.y = 0;

    // Continuous-enough collision: substep so the ball never moves more than 40% of its radius.
    const steps = Math.min(16, Math.max(1, Math.ceil((speed * dt) / (b.radius * 0.4))));
    const sdt = dt / steps;
    const mass = PHYS.baseMass * ph.massMul;
    const rest = clamp(PHYS.baseRestitution + ph.restitutionAdd, 0.3, 1.2);
    for (let s = 0; s < steps; s++) {
      b.pos.x += b.vel.x * sdt;
      b.pos.y += b.vel.y * sdt;
      this.collideBallWalls(rest);
      this.collideBallObjects(rest, mass, ph.impactDamageMul);
      this.collideBallEnemies(rest, mass, ph.impactDamageMul);
    }
  }

  private collideBallWalls(rest: number): void {
    const b = this.ball;
    for (const w of this.walls) {
      const cp = closestOnSegment(b.pos, w.a, w.b);
      const d2 = vdist2(cp, b.pos);
      if (d2 >= b.radius * b.radius) continue;
      const d = Math.sqrt(d2);
      const n = d > 1e-6 ? { x: (b.pos.x - cp.x) / d, y: (b.pos.y - cp.y) / d } : vnorm({ x: -(w.b.y - w.a.y), y: w.b.x - w.a.x });
      b.pos.x = cp.x + n.x * b.radius;
      b.pos.y = cp.y + n.y * b.radius;
      const vn = b.vel.x * n.x + b.vel.y * n.y;
      if (vn >= 0) continue;
      let r = rest;
      if (w.material === 'bumper') r = 1.25;
      b.vel.x -= (1 + r) * vn * n.x;
      b.vel.y -= (1 + r) * vn * n.y;
      if (w.material === 'bumper') {
        const sp = vlen(b.vel);
        if (sp < 550) (b.vel.x *= 550 / Math.max(1, sp)), (b.vel.y *= 550 / Math.max(1, sp));
      }
      if (-vn > 60) this.emit({ type: 'impact', pos: { ...cp }, speed: -vn, material: w.material, normal: n });
      if (-vn > 900) this.fastImpact(cp, -vn);
    }
    // Hard clamp in case of tunnelling through the border.
    b.pos.x = clamp(b.pos.x, b.radius, PHYS.arenaW - b.radius);
    b.pos.y = clamp(b.pos.y, b.radius, PHYS.arenaH - b.radius);
  }

  private collideBallObjects(rest: number, mass: number, impactMul: number): void {
    const b = this.ball;
    for (const o of this.objects) {
      if (o.dead) continue;
      const min = b.radius + o.radius;
      const d2 = vdist2(o.pos, b.pos);
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 1e-3;
      const n = { x: (b.pos.x - o.pos.x) / d, y: (b.pos.y - o.pos.y) / d };
      b.pos.x = o.pos.x + n.x * min;
      b.pos.y = o.pos.y + n.y * min;
      const vn = b.vel.x * n.x + b.vel.y * n.y;
      if (vn >= 0) continue;
      const r = o.def.tags.includes('elastic') ? o.def.restitution : Math.min(rest, o.def.restitution + 0.1);
      b.vel.x -= (1 + r) * vn * n.x;
      b.vel.y -= (1 + r) * vn * n.y;
      if (o.def.tags.includes('elastic')) {
        const sp = vlen(b.vel);
        const kick = 600 * (1 + (this.mods.bumperKick ?? 0));
        if (sp < kick) (b.vel.x *= kick / Math.max(1, sp)), (b.vel.y *= kick / Math.max(1, sp));
      }
      const speed = -vn;
      o.hitFlash = 0.15;
      this.emit({ type: 'impact', pos: { x: o.pos.x + n.x * o.radius, y: o.pos.y + n.y * o.radius }, speed, material: o.def.look, normal: n });
      if (this.contactCd.has(o.uid)) continue;
      this.contactCd.set(o.uid, 0.15);
      if (speed > PHYS.impactMinSpeed) {
        this.engine.apply(o, 'kinetic', speed / PHYS.impactRefSpeed, { depth: 0, impactSpeed: speed, faction: 'player' });
        if (o.def.hp !== undefined) this.damageHolder(o, PHYS.baseImpactDamage * (speed / PHYS.impactRefSpeed) * impactMul * Math.sqrt(mass), 'impact');
        if (speed > 900) this.fastImpact(o.pos, speed);
      }
      this.exchangeAuras(b, o, speed);
    }
  }

  private collideBallEnemies(rest: number, mass: number, impactMul: number): void {
    const b = this.ball;
    for (const e of this.enemies) {
      if (e.dead || e.spawnFx > 0) continue;
      const min = b.radius + e.radius;
      const d2 = vdist2(e.pos, b.pos);
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 1e-3;
      const n = { x: (e.pos.x - b.pos.x) / d, y: (e.pos.y - b.pos.y) / d };
      const em = e.statuses.has('frozen') || e.statuses.has('petrified') ? e.mass * 3 : e.mass;
      // Positional correction weighted by mass.
      const overlap = min - d;
      const tot = mass + em;
      b.pos.x -= n.x * overlap * (em / tot);
      b.pos.y -= n.y * overlap * (em / tot);
      if (immovable(e)) {
        b.pos.x -= n.x * overlap * (mass / tot);
        b.pos.y -= n.y * overlap * (mass / tot);
      } else {
        e.pos.x += n.x * overlap * (mass / tot);
        e.pos.y += n.y * overlap * (mass / tot);
      }
      const rel = (b.vel.x - e.vel.x) * n.x + (b.vel.y - e.vel.y) * n.y;
      if (rel <= 0) continue;
      const r = rest * 0.95;
      const j = ((1 + r) * rel) / (1 / mass + 1 / (immovable(e) ? 1e9 : em));
      b.vel.x -= (j / mass) * n.x;
      b.vel.y -= (j / mass) * n.y;
      if (!immovable(e)) {
        e.vel.x += (j / em) * n.x;
        e.vel.y += (j / em) * n.y;
      }
      if (this.contactCd.has(e.uid)) continue;
      this.contactCd.set(e.uid, 0.12);
      const ballSpeed = vlen(b.vel);
      if (rel > PHYS.impactMinSpeed) {
        // Kinetic first: impact reactions (shatter) see the target's state before elements change it.
        this.engine.apply(e, 'kinetic', rel / PHYS.impactRefSpeed, { depth: 0, impactSpeed: rel, faction: 'player' });
        let dmg = PHYS.baseImpactDamage * (rel / PHYS.impactRefSpeed) * impactMul * Math.sqrt(mass);
        const armored = e.armor > 0 && !e.statuses.has('exposed');
        this.damageHolder(e, dmg, 'impact');
        this.emit({ type: 'hit', pos: { x: b.pos.x + n.x * b.radius, y: b.pos.y + n.y * b.radius }, targetUid: e.uid, damage: dmg, speed: rel, armored });
        if (rel > 900) this.fastImpact(e.pos, rel);
        if (b.buffs.has('ballLightning')) {
          for (const t of this.chainTargetsAround(e, 200).slice(0, 3)) {
            this.emit({ type: 'arc', from: { ...e.pos }, to: { ...t.pos }, element: 'lightning' });
            this.damageHolder(t, 12, 'reaction', 'ball_lightning');
          }
        }
        dmg = 0;
      } else if (ballSpeed < PHYS.vulnerableSpeed && e.def.contactDamage > 0 && !e.statuses.has('frozen') && !e.statuses.has('stunned')) {
        this.hurtBall(e.def.contactDamage * (e.isBoss ? 1.5 : 1), e.def.name);
      }
      this.exchangeAuras(b, e, rel);
    }
  }

  /** Two-way elemental exchange on contact: the ball paints its auras onto the target, the target's innate element rubs off on the ball. */
  private exchangeAuras(b: Ball, other: Enemy | ArenaObject, speed: number): void {
    const transfer = 0.55 * (1 + (this.mods.auraTransfer ?? 0));
    const entries = [...b.auras.entries()].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1));
    for (const [el, amt] of entries) {
      if (other.dead) break;
      const give = Math.min(amt, transfer);
      if (give < 0.05) continue;
      if (el !== b.coreElement) b.auras.set(el, amt - give * 0.5);
      this.engine.apply(other, el, give, { depth: 0, impactSpeed: speed, faction: 'player', sourceUid: b.uid });
    }
    const src = other.kind === 'object' ? other.def.element : other.def.innate?.element;
    if (src && !other.dead) {
      const amt = other.auras.get(src) ?? 0;
      if (amt > 0.1) {
        const give = other.kind === 'object' ? Math.min(amt, 0.9) : Math.min(amt, 0.35);
        if (other.kind === 'object' && other.def.regen > 0) other.auras.set(src, amt - give * 0.6);
        this.engine.apply(b, src, give, { depth: 0, faction: 'player', sourceUid: other.uid });
      }
    }
  }

  private fastImpact(pos: Vec2, speed: number): void {
    if (!this.mods.shockwaveOnFast) return;
    const dmg = 12 * this.mods.shockwaveOnFast * (speed / 900);
    for (const t of this.damageTargetsAround({ pos, radius: 0, kind: 'ball' } as unknown as AnyHolder, 110)) this.damageHolder(t, dmg, 'reaction', 'shock_rebound');
    this.impulseFrom(pos, 380, 110);
  }

  // ─── Enemies ──────────────────────────────────────────────────────────────
  spawnEnemy(id: string, pos: Vec2, opts?: { isBoss?: boolean; hp?: number; radius?: number; mass?: number; armor?: number }): Enemy {
    const def = Content.enemies.get(id);
    if (!def) throw new Error(`Unknown enemy '${id}'`);
    const e: Enemy = {
      uid: this.nextUid(), kind: 'enemy', pos: { ...pos }, vel: { x: 0, y: 0 }, radius: opts?.radius ?? def.radius,
      auras: new Map(def.innate ? [[def.innate.element, def.innate.amount]] : []), cooldowns: new Map(), statuses: new Map(),
      tags: def.tags, faction: 'hostile', dead: false, def, hp: opts?.hp ?? def.hp, maxHp: opts?.hp ?? def.hp, mass: opts?.mass ?? def.mass,
      armor: opts?.armor ?? def.armor, shootTimer: def.projectile ? def.projectile.interval * (0.5 + this.rng.next()) : 0,
      aiTimer: this.rng.range(0, 2), aiDir: this.rng.chance(0.5) ? 1 : -1, adapt: new Map(), adaptHits: new Map(), hitFlash: 0,
      isBoss: !!opts?.isBoss, spawnFx: opts?.isBoss ? 1.2 : 0.8,
    };
    this.enemies.push(e);
    return e;
  }

  adaptTo(e: Enemy, element: string): void {
    const hits = (e.adaptHits.get(element) ?? 0) + 1;
    e.adaptHits.set(element, hits);
    if (hits % 4 === 0) e.adapt.set(element, Math.max(0.25, (e.adapt.get(element) ?? 1) * 0.7));
  }

  enemySpeedMul(e: Enemy): number {
    if (e.statuses.has('frozen') || e.statuses.has('stunned')) return 0;
    let m = 1;
    if (e.statuses.has('slowed')) m *= 0.5;
    if (e.statuses.has('petrified')) m *= 0.3;
    for (const [el, amt] of e.auras) {
      const s = elementDef(el).onEnemy?.slowMul;
      if (s) m *= 1 - (1 - s) * Math.min(1, amt);
    }
    if (!e.tags.includes('flying'))
      for (const z of this.zones) if (vdist2(z.pos, e.pos) < z.radius * z.radius) m *= z.def.enemySpeedMul;
    return m;
  }

  canShoot(e: Enemy): boolean {
    if (e.statuses.has('frozen') || e.statuses.has('stunned') || e.statuses.has('blinded')) return false;
    for (const z of this.zones) if (z.def.obscures && vdist2(z.pos, e.pos) < z.radius * z.radius) return false;
    return true;
  }

  private updateEnemies(dt: number): void {
    for (const e of this.enemies) {
      if (e.dead || e.spawnFx > 0) continue;
      if (!e.isBoss) this.enemyAi(e, dt);
      // Integrate with knockback-friendly steering.
      e.pos.x += e.vel.x * dt;
      e.pos.y += e.vel.y * dt;
      // Walls.
      for (const w of this.walls) {
        const cp = closestOnSegment(e.pos, w.a, w.b);
        const d2 = vdist2(cp, e.pos);
        if (d2 >= e.radius * e.radius) continue;
        const d = Math.sqrt(d2) || 1e-3;
        const n = { x: (e.pos.x - cp.x) / d, y: (e.pos.y - cp.y) / d };
        e.pos.x = cp.x + n.x * e.radius;
        e.pos.y = cp.y + n.y * e.radius;
        const vn = e.vel.x * n.x + e.vel.y * n.y;
        if (vn < 0) {
          e.vel.x -= 1.6 * vn * n.x;
          e.vel.y -= 1.6 * vn * n.y;
          if (-vn > 380 && !this.contactCd.has(-e.uid)) {
            // Slam: enemies knocked into walls take damage — physics as a weapon.
            this.contactCd.set(-e.uid, 0.3);
            this.damageHolder(e, (-vn - 380) * 0.05, 'impact');
            this.emit({ type: 'impact', pos: { ...cp }, speed: -vn, material: 'slam', normal: n });
          }
        }
      }
      e.pos.x = clamp(e.pos.x, e.radius, PHYS.arenaW - e.radius);
      e.pos.y = clamp(e.pos.y, e.radius, PHYS.arenaH - e.radius);
      // Objects (static).
      for (const o of this.objects) {
        if (o.dead) continue;
        const min = e.radius + o.radius;
        const d2 = vdist2(o.pos, e.pos);
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 1e-3;
        const n = { x: (e.pos.x - o.pos.x) / d, y: (e.pos.y - o.pos.y) / d };
        e.pos.x = o.pos.x + n.x * min;
        e.pos.y = o.pos.y + n.y * min;
        const vn = e.vel.x * n.x + e.vel.y * n.y;
        if (vn < 0) (e.vel.x -= 1.4 * vn * n.x), (e.vel.y -= 1.4 * vn * n.y);
        // Enemies pick up source elements they bump into (an imp brushing a font gets wet).
        if (o.def.element && !this.contactCd.has(o.uid * 7919 + e.uid)) {
          this.contactCd.set(o.uid * 7919 + e.uid, 0.8);
          const amt = o.auras.get(o.def.element) ?? 0;
          if (amt > 0.2) this.engine.apply(e, o.def.element, 0.3, { depth: 0, faction: 'neutral' });
        }
      }
    }
    // Enemy-enemy separation, with slam transfer at speed.
    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      if (a.dead) continue;
      for (let j = i + 1; j < this.enemies.length; j++) {
        const c = this.enemies[j];
        if (c.dead) continue;
        if (a.tags.includes('flying') !== c.tags.includes('flying')) continue;
        const min = a.radius + c.radius;
        const d2 = vdist2(a.pos, c.pos);
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 1e-3;
        const n = { x: (c.pos.x - a.pos.x) / d, y: (c.pos.y - a.pos.y) / d };
        const ov = min - d;
        const tot = a.mass + c.mass;
        a.pos.x -= n.x * ov * (c.mass / tot);
        a.pos.y -= n.y * ov * (c.mass / tot);
        c.pos.x += n.x * ov * (a.mass / tot);
        c.pos.y += n.y * ov * (a.mass / tot);
        const rel = (a.vel.x - c.vel.x) * n.x + (a.vel.y - c.vel.y) * n.y;
        if (rel > 0) {
          const jimp = (1.5 * rel) / (1 / a.mass + 1 / c.mass);
          a.vel.x -= (jimp / a.mass) * n.x;
          a.vel.y -= (jimp / a.mass) * n.y;
          c.vel.x += (jimp / c.mass) * n.x;
          c.vel.y += (jimp / c.mass) * n.y;
          if (rel > 420) {
            const dmg = (rel - 420) * 0.04;
            this.damageHolder(a, dmg, 'impact');
            this.damageHolder(c, dmg, 'impact');
            this.emit({ type: 'impact', pos: { x: a.pos.x + n.x * a.radius, y: a.pos.y + n.y * a.radius }, speed: rel, material: 'slam', normal: n });
          }
        }
      }
    }
  }

  private enemyAi(e: Enemy, dt: number): void {
    const b = this.ball;
    const sm = this.enemySpeedMul(e);
    const toBall = vsub(b.pos, e.pos);
    const dist = vlen(toBall) || 1;
    const dir = { x: toBall.x / dist, y: toBall.y / dist };
    let desired = { x: 0, y: 0 };
    const sp = e.def.speed * sm;
    e.aiTimer += dt;
    switch (e.def.ai) {
      case 'chaser':
      case 'bloat':
        desired = { x: dir.x * sp, y: dir.y * sp };
        break;
      case 'shooter': {
        const want = 280;
        const radial = dist > want + 40 ? 1 : dist < want - 40 ? -1 : 0;
        if (e.aiTimer > 2.5) (e.aiTimer = 0), (e.aiDir *= -1);
        desired = { x: (dir.x * radial - dir.y * e.aiDir * 0.8) * sp, y: (dir.y * radial + dir.x * e.aiDir * 0.8) * sp };
        break;
      }
      case 'flyer': {
        const wob = Math.sin(this.time * 2.2 + e.uid) * 0.9;
        desired = { x: (dir.x - dir.y * wob) * sp, y: (dir.y + dir.x * wob) * sp };
        if (dist < 160) desired = { x: -desired.x * 0.5, y: -desired.y * 0.5 };
        break;
      }
      case 'wanderer':
        desired = { x: Math.cos(e.aiTimer * 0.7 + e.uid) * sp, y: Math.sin(e.aiTimer * 0.7 + e.uid) * sp };
        break;
      case 'turret':
      case 'dummy':
        break;
    }
    const cur = vlen(e.vel);
    const knocked = cur > e.def.speed * 1.6 + 30;
    const steer = sm === 0 ? 0 : knocked ? 0.8 : 5;
    const damp = sm === 0 || knocked ? 2.2 : 0;
    e.vel.x += (desired.x - e.vel.x) * Math.min(1, steer * dt);
    e.vel.y += (desired.y - e.vel.y) * Math.min(1, steer * dt);
    const f = Math.exp(-damp * dt);
    e.vel.x *= f;
    e.vel.y *= f;
    if (e.def.speed === 0) (e.vel.x = 0), (e.vel.y = 0);

    const p = e.def.projectile;
    if (p) {
      e.shootTimer -= dt;
      if (e.shootTimer <= 0 && this.canShoot(e) && dist < 700) {
        e.shootTimer = p.interval * this.rng.range(0.85, 1.15);
        // Lead the target slightly, but never perfectly.
        const lead = Math.min(0.35, dist / p.speed) * 0.5;
        const aim = vnorm(vsub({ x: b.pos.x + b.vel.x * lead, y: b.pos.y + b.vel.y * lead }, e.pos));
        this.spawnProjectile(e.pos, { x: aim.x * p.speed, y: aim.y * p.speed }, p.radius, p.damage, p.element, 'hostile');
        this.emit({ type: 'shoot', pos: { ...e.pos }, element: p.element });
      }
    }
  }

  // ─── Projectiles & telegraphs ─────────────────────────────────────────────
  spawnProjectile(pos: Vec2, vel: Vec2, radius: number, damage: number, element: string | undefined, faction: Faction, lob?: Projectile['lob']): void {
    if (this.projectiles.length >= MAX_PROJECTILES) return;
    this.projectiles.push({ uid: this.nextUid(), pos: { ...pos }, vel, radius, element, damage, faction, ttl: 4, lob, dead: false });
  }

  private updateProjectiles(dt: number): void {
    const b = this.ball;
    for (const p of this.projectiles) {
      if (p.dead) continue;
      p.ttl -= dt;
      if (p.lob) {
        p.lob.t += dt;
        const k = Math.min(1, p.lob.t / p.lob.dur);
        p.pos = { x: p.lob.from.x + (p.lob.target.x - p.lob.from.x) * k, y: p.lob.from.y + (p.lob.target.y - p.lob.from.y) * k };
        if (k >= 1) {
          p.dead = true;
          this.spawnZone(p.lob.zone, p.lob.target, p.lob.zoneRadius, 7, 'hostile', 0);
          if (vdist(b.pos, p.lob.target) < p.lob.zoneRadius * 0.6) this.hurtBall(p.damage, 'Flask');
        }
        continue;
      }
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      if (p.ttl <= 0 || p.pos.x < 0 || p.pos.y < 0 || p.pos.x > PHYS.arenaW || p.pos.y > PHYS.arenaH) {
        p.dead = true;
        continue;
      }
      // Objects block projectiles; sources absorb/react with their element.
      for (const o of this.objects) {
        if (!o.dead && vdist2(o.pos, p.pos) < (o.radius + p.radius) ** 2) {
          p.dead = true;
          if (p.element) this.engine.apply(o, p.element, 0.5, { depth: 0, faction: 'neutral' });
          break;
        }
      }
      if (p.dead) continue;
      if (p.faction === 'hostile' && vdist2(b.pos, p.pos) < (b.radius + p.radius) ** 2) {
        p.dead = true;
        this.hurtBall(p.damage, 'Projectile');
        if (p.element) this.engine.apply(b, p.element, 0.6, { depth: 0, faction: 'player' });
      }
    }
  }

  addTelegraph(pos: Vec2, radius: number, dur: number, damage: number, color: string): void {
    this.telegraphs.push({ uid: this.nextUid(), pos: { ...pos }, radius, t: 0, dur, damage, color });
    this.emit({ type: 'telegraph', pos: { ...pos }, radius });
  }

  private updateTelegraphs(dt: number): void {
    for (const t of this.telegraphs) {
      t.t += dt;
      if (t.t >= t.dur) {
        if (vdist(this.ball.pos, t.pos) < t.radius + this.ball.radius) this.hurtBall(t.damage, 'Crucible Slam');
        this.impulseFrom(t.pos, 500, t.radius, undefined, true);
        this.emit({ type: 'impact', pos: { ...t.pos }, speed: 1200, material: 'slam', normal: { x: 0, y: -1 } });
      }
    }
    for (let i = this.telegraphs.length - 1; i >= 0; i--) if (this.telegraphs[i].t >= this.telegraphs[i].dur) this.telegraphs.splice(i, 1);
  }

  // ─── Zones & objects ──────────────────────────────────────────────────────
  spawnZone(id: string, pos: Vec2, radius: number, duration: number, faction: Faction, depth: number): Zone | undefined {
    const def = Content.zones.get(id);
    if (!def) return undefined;
    const dur = faction === 'player' && duration !== Infinity ? duration * (1 + (this.mods.zoneDuration ?? 0)) : duration;
    const z: Zone = {
      uid: this.nextUid(), kind: 'zone', pos: { ...pos }, radius, auras: new Map(def.element ? [[def.element, 1]] : []),
      cooldowns: new Map(), statuses: new Map(), tags: ['zone', `zone:${id}`], faction, dead: false, def, ttl: dur, maxTtl: dur,
      ticks: new Map(), strikeTimer: def.strikes?.interval ?? 0, dir: { x: 0, y: -1 },
    };
    // New zones react with overlapping zones (magma next to water → obsidian).
    const overlapping = this.zones.filter((o) => !o.dead && o.ttl > 0 && vdist(o.pos, pos) < o.radius + radius * 0.6);
    this.zones.push(z);
    if (this.zones.length > MAX_ZONES) {
      const idx = this.zones.findIndex((x) => x.ttl !== Infinity);
      if (idx >= 0) this.zones[idx].ttl = 0;
    }
    this.emit({ type: 'zoneSpawned', pos: { ...pos }, zone: id, radius });
    if (def.element && depth <= 3)
      for (const o of overlapping) if (o.def.id !== id) this.engine.apply(o, def.element, 0.8, { depth: depth + 1, faction });
    return z;
  }

  spawnObject(id: string, pos: Vec2, ttl = Infinity): ArenaObject | undefined {
    const def = Content.objects.get(id);
    if (!def) return undefined;
    const o: ArenaObject = {
      uid: this.nextUid(), kind: 'object', pos: { ...pos }, radius: def.radius, auras: new Map(def.element ? [[def.element, def.amount]] : []),
      cooldowns: new Map(), statuses: new Map(), tags: def.tags, faction: 'neutral', dead: false, def, hp: def.hp ?? Infinity, maxHp: def.hp ?? Infinity, ttl, hitFlash: 0,
    };
    // Never trap the ball inside new terrain.
    const b = this.ball;
    if (b && vdist(b.pos, pos) < b.radius + def.radius) {
      const n = vdist(b.pos, pos) > 1 ? vnorm(vsub(b.pos, pos)) : { x: 0, y: 1 };
      b.pos = { x: pos.x + n.x * (b.radius + def.radius + 1), y: pos.y + n.y * (b.radius + def.radius + 1) };
    }
    this.objects.push(o);
    return o;
  }

  private updateZones(dt: number): void {
    const holders: AnyHolder[] = [this.ball, ...this.enemies.filter((e) => !e.dead && e.spawnFx <= 0)];
    for (const z of this.zones) {
      if (z.ttl <= 0 || z.dead) continue;
      const own = z.def.element ? z.auras.get(z.def.element) ?? 0 : 0;
      for (const h of holders) {
        if (h.dead || z.dead) continue;
        if (h.kind === 'enemy' && h.tags.includes('flying') && !z.def.affectsFlying) continue;
        if (vdist2(h.pos, z.pos) > (z.radius + h.radius * 0.3) ** 2) {
          z.ticks.delete(h.uid);
          continue;
        }
        // Continuous damage to the opposing faction.
        if (z.def.dps > 0) {
          if (h.kind === 'ball' && z.faction === 'hostile') this.hurtBall(z.def.dps * dt, z.def.name, true);
          if (h.kind === 'enemy' && z.faction !== 'hostile' && z.faction !== 'neutral') this.damageHolder(h, z.def.dps * dt, 'dot', undefined, z.def.element, true);
        }
        if (z.def.push && h.kind === 'enemy') {
          const e = h as Enemy;
          e.vel.x += z.dir.x * z.def.push * 0.5 * dt;
          e.vel.y += z.dir.y * z.def.push * 0.5 * dt;
        }
        const t = (z.ticks.get(h.uid) ?? 0) - dt;
        if (t > 0) {
          z.ticks.set(h.uid, t);
          continue;
        }
        z.ticks.set(h.uid, z.def.tickInterval);
        // Holder paints its strongest aura into the zone (a fiery ball in a pool boils it).
        const strongest = [...h.auras.entries()].filter(([el]) => el !== z.def.element).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
        if (strongest && strongest[1] > 0.3 && (h.kind === 'ball' || z.faction === 'neutral')) {
          if (h.kind === 'ball' && strongest[0] !== (h as Ball).coreElement) h.auras.set(strongest[0], strongest[1] - 0.15);
          this.engine.apply(z, strongest[0], 0.5, { depth: 0, faction: 'player', sourceUid: h.uid });
        }
        if (!z.dead && z.ttl > 0 && z.def.element && own > 0.05)
          this.engine.apply(h, z.def.element, z.def.applyAmount * Math.min(1, own), { depth: 0, faction: 'player' });
      }
      if (z.def.strikes) {
        z.strikeTimer -= dt;
        if (z.strikeTimer <= 0) {
          z.strikeTimer = z.def.strikes.interval;
          const inside = this.enemies.filter((e) => !e.dead && e.spawnFx <= 0 && vdist(e.pos, z.pos) < z.radius + e.radius);
          if (inside.length && z.faction !== 'hostile') {
            const t = inside[Math.floor(this.rng.next() * inside.length)];
            this.emit({ type: 'arc', from: { x: t.pos.x + this.rng.range(-30, 30), y: t.pos.y - 160 }, to: { ...t.pos }, element: 'lightning' });
            this.damageHolder(t, z.def.strikes.damage * (1 + (this.mods.lightningDmg ?? 0)), 'reaction', 'storm_cloud', 'lightning');
            this.engine.apply(t, 'lightning', 0.4, { depth: 1, faction: 'player' });
          } else if (z.faction === 'hostile' && vdist(this.ball.pos, z.pos) < z.radius) {
            this.emit({ type: 'arc', from: { x: this.ball.pos.x, y: this.ball.pos.y - 160 }, to: { ...this.ball.pos }, element: 'lightning' });
            this.hurtBall(z.def.strikes.damage * 0.6, 'Storm');
          }
        }
      }
    }
  }

  // ─── Damage & effects API (used by the reaction engine) ──────────────────
  /** Holders with HP around a holder. `radius` undefined = the holder itself only (if damageable). */
  damageTargetsAround(holder: AnyHolder, radius: number | undefined): (Enemy | ArenaObject)[] {
    if (radius === undefined) {
      if (holder.kind === 'enemy') return [holder as Enemy];
      if (holder.kind === 'object' && (holder as ArenaObject).def.hp !== undefined) return [holder as ArenaObject];
      return [];
    }
    const out: (Enemy | ArenaObject)[] = [];
    for (const e of this.enemies) if (!e.dead && e.spawnFx <= 0 && vdist(e.pos, holder.pos) <= radius + e.radius) out.push(e);
    for (const o of this.objects) if (!o.dead && o.def.hp !== undefined && vdist(o.pos, holder.pos) <= radius + o.radius) out.push(o);
    return out;
  }

  /** Candidate chain targets sorted by distance (deterministic tie-break by uid). */
  chainTargetsAround(holder: { pos: Vec2; uid: number }, radius: number, requireAura?: string, requireTag?: string): AnyHolder[] {
    const out: { h: AnyHolder; d: number }[] = [];
    const consider = (h: AnyHolder) => {
      if (h.dead || h.uid === holder.uid) return;
      if (h.kind === 'enemy' && (h as Enemy).spawnFx > 0) return;
      const d = vdist(h.pos, holder.pos);
      if (d > radius + h.radius) return;
      const auraOk = requireAura ? (h.auras.get(requireAura) ?? 0) > 0.05 : true;
      const tagOk = requireTag ? h.tags.includes(requireTag) || h.statuses.has('magnetized') : true;
      // Conductive holders accept charge chains even when dry.
      const conductive = requireAura === 'water' && (h.tags.includes('conductive') || h.statuses.has('magnetized'));
      if ((auraOk || conductive) && tagOk) out.push({ h, d });
    };
    for (const e of this.enemies) consider(e);
    for (const o of this.objects) consider(o);
    for (const z of this.zones) if (z.ttl > 0) consider(z);
    out.sort((a, b) => a.d - b.d || a.h.uid - b.h.uid);
    return out.map((x) => x.h);
  }

  /** Returns true if the target died from this damage. */
  damageHolder(t: AnyHolder, amount: number, source: 'impact' | 'reaction' | 'dot', reactionId?: string, element?: string, silent = false): boolean {
    if (t.dead || amount <= 0) return false;
    if (t.kind === 'enemy') {
      const e = t as Enemy;
      if (e.spawnFx > 0) return false;
      let d = amount;
      const exposed = e.statuses.has('exposed');
      if (source === 'impact' && !exposed) d *= 1 - e.armor;
      if (exposed) d *= 1.5;
      if (source === 'reaction') d *= 1 + (this.mods.reactionDmg ?? 0);
      if (e.isBoss && this.boss) d = this.boss.filterDamage(d, source);
      e.hp -= d;
      if (!silent || d > 3) e.hitFlash = 0.1;
      if (reactionId) e.lastHitBy = reactionId;
      if (!silent) this.emit({ type: 'damage', pos: { ...e.pos }, amount: d, element, crit: d >= 30 });
      if (e.hp <= 0) {
        this.killEnemy(e);
        return true;
      }
      return false;
    }
    if (t.kind === 'object') {
      const o = t as ArenaObject;
      if (o.def.hp === undefined) return false;
      o.hp -= amount;
      o.hitFlash = 0.1;
      if (o.hp <= 0) {
        o.dead = true;
        this.emit({ type: 'objectDestroyed', pos: { ...o.pos }, objectId: o.def.id });
        this.runStandaloneEffects(o.def.onDestroy, o, 'player');
        return true;
      }
    }
    return false;
  }

  private killEnemy(e: Enemy): void {
    e.dead = true;
    this.emit({ type: 'kill', pos: { ...e.pos }, enemyId: e.def.id, essence: e.def.essence, isBoss: e.isBoss, byReaction: e.lastHitBy });
    this.runStandaloneEffects(e.def.onDeath, e, 'hostile');
    if (e.isBoss) this.boss?.onDeath();
  }

  /** Effects not tied to a reaction (on-death, on-destroy). Supports the zone/chain/damage subset. */
  runStandaloneEffects(effects: EffectDef[] | undefined, at: AnyHolder, faction: Faction): void {
    for (const eff of effects ?? []) {
      if (eff.type === 'spawnZone') this.spawnZone(eff.zone, at.pos, eff.radius, eff.duration, faction, 1);
      if (eff.type === 'chain')
        for (const t of this.chainTargetsAround(at, eff.radius, eff.requireAura, eff.requireTag).slice(0, eff.maxTargets)) {
          this.emit({ type: 'arc', from: { ...at.pos }, to: { ...t.pos }, element: eff.element });
          this.engine.apply(t, eff.element, eff.amount, { depth: 1, faction });
        }
      if (eff.type === 'damage') for (const t of this.damageTargetsAround(at, eff.radius)) this.damageHolder(t, eff.amount, 'reaction');
    }
  }

  setStatus(t: AnyHolder, status: StatusId, duration: number): void {
    const cur = t.statuses.get(status) ?? 0;
    if (duration > cur) t.statuses.set(status, duration);
    if (status === 'frozen' && t.kind === 'enemy') {
      const e = t as Enemy;
      e.vel.x *= 0.2;
      e.vel.y *= 0.2;
    }
    this.emit({ type: 'status', pos: { ...t.pos }, status });
  }

  impulseFrom(pos: Vec2, strength: number, radius: number, exclude?: AnyHolder, includeBall = false): void {
    for (const e of this.enemies) {
      if (e.dead || e === exclude || immovable(e)) continue;
      const d = vdist(e.pos, pos);
      if (d > radius + e.radius) continue;
      const n = d > 1 ? vnorm(vsub(e.pos, pos)) : { x: 0, y: -1 };
      const k = (strength * (1 - (0.5 * d) / (radius + e.radius))) / Math.sqrt(e.mass);
      e.vel.x += n.x * k;
      e.vel.y += n.y * k;
    }
    if (includeBall) {
      const b = this.ball;
      const d = vdist(b.pos, pos);
      if (d < radius + b.radius) {
        const n = d > 1 ? vnorm(vsub(b.pos, pos)) : { x: 0, y: 1 };
        b.vel.x += n.x * strength;
        b.vel.y += n.y * strength;
      }
    }
  }

  hurtBall(amount: number, source: string, continuous = false): void {
    const b = this.ball;
    if (b.dead || this.over) return;
    if (!continuous) {
      if (b.invuln > 0) return;
      b.invuln = 0.6;
      amount *= 1 - (this.shell?.mods.contactReduce ?? 0) * (source === 'Projectile' ? 0 : 1);
    }
    if (b.shield > 0) {
      const s = Math.min(b.shield, amount);
      b.shield -= s;
      amount -= s;
    }
    if (amount <= 0) return;
    b.hp -= amount;
    if (!continuous || this.time - this.lastDotEvent > 0.3) {
      if (continuous) this.lastDotEvent = this.time;
      this.emit({ type: 'ballDamaged', amount, source, hp: b.hp });
    }
    if (b.hp <= 0) {
      if (this.sandbox) {
        b.hp = b.maxHp;
        return;
      }
      b.hp = 0;
      b.dead = true;
      this.over = true;
      this.emit({ type: 'ballDied', cause: source });
    }
  }

  healBall(amount: number): void {
    this.ball.hp = Math.min(this.ball.maxHp, this.ball.hp + amount);
  }

  reactionPotency(r: ReactionDef): number {
    return this.potency.get(r.id) ?? 1;
  }

  onReaction(r: ReactionDef): void {
    this.reactionCount++;
    void r;
  }

  noteElementSeen(el: string): void {
    if (this.seenElements.has(el)) return;
    this.seenElements.add(el);
    this.emit({ type: 'elementSeen', element: el });
  }

  private cleanup(): void {
    for (let i = this.zones.length - 1; i >= 0; i--) if (this.zones[i].ttl <= 0 || this.zones[i].dead) this.zones.splice(i, 1);
    for (let i = this.projectiles.length - 1; i >= 0; i--) if (this.projectiles[i].dead) this.projectiles.splice(i, 1);
    for (let i = this.objects.length - 1; i >= 0; i--) if (this.objects[i].dead) this.objects.splice(i, 1);
    for (let i = this.enemies.length - 1; i >= 0; i--) if (this.enemies[i].dead) this.enemies.splice(i, 1);
  }

  private checkEnd(): void {
    // Encounters with neither waves nor a boss have no objective (lab, tests) and never auto-clear.
    if (this.cleared || this.sandbox || (this.spec.waves.length === 0 && !this.boss)) return;
    const allSpawned = this.wave >= this.spec.waves.length - 1;
    const bossAlive = this.boss ? !this.boss.defeated : false;
    if (allSpawned && this.enemies.length === 0 && !bossAlive) {
      this.cleared = true;
      this.over = true;
      this.projectiles.length = 0;
      this.telegraphs.length = 0;
      this.emit({ type: 'cleared' });
    }
  }

  /** Aura snapshot for UI. */
  ballAuras(): { element: string; amount: number }[] {
    return [...this.ball.auras.entries()].map(([element, amount]) => ({ element, amount })).sort((a, b) => b.amount - a.amount);
  }
}

/** Rooted enemies (turrets) are never displaced by collisions or impulses. */
export function immovable(e: Enemy): boolean {
  return e.def.speed === 0 && e.mass >= 50;
}
