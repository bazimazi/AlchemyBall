import { Content } from '../content';
import type { Vec2 } from '../core/vec';
import type { SimEvent } from '../sim/events';

/** Pooled particle. */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  drag: number;
  kind: 0 | 1 | 2; // 0 dot, 1 spark (streak), 2 ring
  active: boolean;
}

export interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  max: number;
  size: number;
  vy: number;
}

export interface Arc {
  from: Vec2;
  to: Vec2;
  color: string;
  life: number;
  seed: number;
}

export interface Ring {
  x: number;
  y: number;
  r: number;
  maxR: number;
  color: string;
  life: number;
  max: number;
  width: number;
}

/**
 * Converts simulation events into short-lived visual effects. Quality scales the particle
 * budget; reduced motion disables shake and flashes.
 */
export class Fx {
  particles: Particle[] = [];
  texts: FloatText[] = [];
  arcs: Arc[] = [];
  rings: Ring[] = [];
  shake = 0;
  flash = 0;
  flashColor = '#ffffff';
  /** Real-time seconds of hit-stop requested. */
  hitstop = 0;
  quality = 1;
  reducedMotion = false;
  damageNumbers = true;
  private cursor = 0;

  constructor(maxParticles = 700) {
    for (let i = 0; i < maxParticles; i++)
      this.particles.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, color: '#fff', drag: 2, kind: 0, active: false });
  }

  emit(x: number, y: number, n: number, color: string, speed: number, opts: Partial<Pick<Particle, 'size' | 'drag' | 'kind'>> & { life?: number; dir?: Vec2; spread?: number } = {}): void {
    const count = Math.max(1, Math.round(n * this.quality));
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.cursor];
      this.cursor = (this.cursor + 1) % this.particles.length;
      let a = Math.random() * Math.PI * 2;
      if (opts.dir) a = Math.atan2(opts.dir.y, opts.dir.x) + (Math.random() - 0.5) * (opts.spread ?? 1.2);
      const s = speed * (0.35 + Math.random() * 0.65);
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.max = p.life = (opts.life ?? 0.5) * (0.6 + Math.random() * 0.6);
      p.size = (opts.size ?? 3) * (0.6 + Math.random() * 0.8);
      p.color = color;
      p.drag = opts.drag ?? 3;
      p.kind = opts.kind ?? 0;
      p.active = true;
    }
  }

  ring(x: number, y: number, maxR: number, color: string, life = 0.45, width = 4): void {
    this.rings.push({ x, y, r: 4, maxR, color, life, max: life, width });
  }

  text(x: number, y: number, text: string, color: string, size = 18, life = 0.9): void {
    this.texts.push({ x, y, text, color, life, max: life, size, vy: -50 });
    if (this.texts.length > 40) this.texts.shift();
  }

  addShake(n: number): void {
    if (!this.reducedMotion) this.shake = Math.min(18, this.shake + n);
  }

  addFlash(color: string, n: number): void {
    if (this.reducedMotion) return;
    this.flash = Math.max(this.flash, n);
    this.flashColor = color;
  }

  onEvent(e: SimEvent): void {
    switch (e.type) {
      case 'impact': {
        const n = Math.min(14, 2 + e.speed / 120);
        const color = e.material === 'bumper' ? '#ff4fa3' : e.material === 'slam' ? '#ffd9a0' : '#e8eef7';
        this.emit(e.pos.x, e.pos.y, n, color, e.speed * 0.35, { kind: 1, dir: e.normal, spread: 1.6, life: 0.3, size: 2 });
        if (e.speed > 700) this.addShake(e.speed / 300);
        break;
      }
      case 'hit': {
        this.emit(e.pos.x, e.pos.y, 6 + e.speed / 100, e.armored ? '#9aa6b2' : '#ffffff', e.speed * 0.4, { kind: 1, life: 0.35 });
        if (e.speed > 800) {
          this.hitstop = Math.max(this.hitstop, 0.045);
          this.addShake(3 + e.speed / 250);
        }
        if (e.armored) this.text(e.pos.x, e.pos.y - 20, 'ARMORED', '#9aa6b2', 13, 0.6);
        break;
      }
      case 'damage':
        if (this.damageNumbers && e.amount >= 1)
          this.text(e.pos.x + (Math.random() - 0.5) * 20, e.pos.y - 24, Math.round(e.amount).toString(), e.crit ? '#ffd23a' : e.element ? Content.elements.get(e.element)?.color ?? '#fff' : '#ffffff', e.crit ? 24 : 16, 0.7);
        break;
      case 'reaction': {
        const r = Content.reactions.get(e.reactionId);
        const big = Math.max(60, e.radius);
        this.ring(e.pos.x, e.pos.y, big, e.color, 0.5, 5);
        this.ring(e.pos.x, e.pos.y, big * 0.6, '#ffffff', 0.3, 2);
        this.emit(e.pos.x, e.pos.y, 18 + e.targets * 3, e.color, 380, { life: 0.7, size: 4, drag: 2.5 });
        this.text(e.pos.x, e.pos.y - 34 - e.depth * 14, r?.name ?? e.reactionId, e.color, 17 + (r?.rarity === 'rare' ? 5 : 0), 1.1);
        this.addShake(2 + e.targets);
        if (e.depth >= 2) this.addFlash(e.color, 0.12);
        break;
      }
      case 'arc':
        this.arcs.push({ from: e.from, to: e.to, color: Content.elements.get(e.element)?.color ?? '#fff', life: 0.25, seed: Math.random() * 1000 });
        break;
      case 'kill':
        this.emit(e.pos.x, e.pos.y, e.isBoss ? 120 : 22, '#ffffff', e.isBoss ? 700 : 300, { life: e.isBoss ? 1.4 : 0.6, size: 4 });
        this.ring(e.pos.x, e.pos.y, e.isBoss ? 400 : 70, '#ffffff', e.isBoss ? 1 : 0.35, 3);
        if (e.isBoss) {
          this.addShake(18);
          this.addFlash('#ffffff', 0.6);
          this.hitstop = 0.25;
        }
        break;
      case 'objectDestroyed':
        this.emit(e.pos.x, e.pos.y, 20, Content.objects.get(e.objectId)?.color ?? '#fff', 320, { life: 0.6, kind: 1 });
        this.addShake(4);
        break;
      case 'ballDamaged':
        this.addFlash('#ff2a2a', 0.25);
        this.addShake(5);
        break;
      case 'launch':
        this.emit(e.pos.x, e.pos.y, 10, '#ffffff', 200, { dir: { x: -e.dir.x, y: -e.dir.y }, spread: 0.9, life: 0.35, kind: 1 });
        break;
      case 'zoneSpawned': {
        const z = Content.zones.get(e.zone);
        if (z) this.ring(e.pos.x, e.pos.y, e.radius, z.color, 0.4, 3);
        break;
      }
      case 'status':
        if (e.status === 'frozen') this.emit(e.pos.x, e.pos.y, 10, '#bdf3ff', 160, { life: 0.5 });
        break;
      case 'bossPhase':
        this.addShake(12);
        this.addFlash(Content.elements.get(e.element)?.color ?? '#fff', 0.4);
        break;
    }
  }

  update(dt: number): void {
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      const f = Math.exp(-p.drag * dt);
      p.vx *= f;
      p.vy *= f;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (const t of this.texts) {
      t.life -= dt;
      t.y += t.vy * dt;
      t.vy *= Math.exp(-2 * dt);
    }
    this.texts = this.texts.filter((t) => t.life > 0);
    for (const a of this.arcs) a.life -= dt;
    this.arcs = this.arcs.filter((a) => a.life > 0);
    for (const r of this.rings) {
      r.life -= dt;
      r.r = r.maxR * (1 - Math.pow(r.life / r.max, 2));
    }
    this.rings = this.rings.filter((r) => r.life > 0);
    this.shake = Math.max(0, this.shake - dt * 40);
    this.flash = Math.max(0, this.flash - dt * 2);
  }
}
