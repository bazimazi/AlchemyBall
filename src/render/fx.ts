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
  /** 0 mote, 1 spark (streak), 2 crystal shard, 3 rising essence mote, 4 smoke puff */
  kind: 0 | 1 | 2 | 3 | 4;
  /** Vertical acceleration (negative rises). */
  ay: number;
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
  /** Numeric damage value (merged numbers add up). */
  value?: number;
  /** 'dmg' damage number, 'crit', 'reaction' name popup, 'label' (small info). */
  style: 'dmg' | 'crit' | 'reaction' | 'label';
  /** Secondary colour (reaction gradient). */
  color2?: string;
  sub?: string;
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

/** A lasting mark on the arena floor (scorch, frost, puddle, crack). Rendered into a decal layer. */
export interface Decal {
  x: number;
  y: number;
  r: number;
  color: string;
  kind: 'scorch' | 'frost' | 'splash' | 'crack' | 'glow';
}

/** Hit-stop seconds by event weight (research: ~30ms light hits, 60–80ms reactions/crits, 120–150ms kills/phases). */
const STOP = { hit: 0.03, crit: 0.07, reaction: 0.06, kill: 0.08, elite: 0.12, boss: 0.25, phase: 0.15 };
/** Max hit-stop per second, so chain reactions never feel like a freeze. */
const STOP_BUDGET = 0.15;

function reactionDecal(id: string, inputs: string[]): Decal['kind'] {
  if (inputs.includes('ice') || id.includes('freeze')) return 'frost';
  if (inputs.includes('fire') || inputs.includes('magma') || id.includes('combustion')) return 'scorch';
  if (inputs.includes('water') || inputs.includes('poison')) return 'splash';
  if (inputs.includes('kinetic') || inputs.includes('earth') || inputs.includes('metal')) return 'crack';
  return 'glow';
}

/**
 * Converts simulation events into short-lived visual effects. Quality scales the particle
 * budget; reduced motion disables shake, flashes and zoom.
 */
export class Fx {
  particles: Particle[] = [];
  texts: FloatText[] = [];
  arcs: Arc[] = [];
  rings: Ring[] = [];
  /** Decals queued for the renderer's floor layer. */
  decals: Decal[] = [];
  /** Screen shake "trauma" on a 0..18 scale; rendered offset grows with its square. */
  shake = 0;
  /** Directional kick (world units) that springs back to zero. */
  kick = { x: 0, y: 0 };
  /** Zoom punch amount (0 = none) and its focus point. */
  zoom = 0;
  zoomAt = { x: 360, y: 560 };
  flash = 0;
  flashColor = '#ffffff';
  /** Real-time seconds of hit-stop requested. */
  hitstop = 0;
  private stopBudget = STOP_BUDGET;
  quality = 1;
  reducedMotion = false;
  damageNumbers = true;
  /** User intensity settings (0..1). */
  shakeScale = 1;
  flashScale = 1;
  private cursor = 0;

  constructor(maxParticles = 600) {
    for (let i = 0; i < maxParticles; i++)
      this.particles.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, color: '#fff', drag: 2, kind: 0, ay: 0, active: false });
  }

  /** Presentation belongs to an encounter; never carry a frozen burst into the next room. */
  reset(): void {
    for (const p of this.particles) p.active = false;
    this.texts = []; this.arcs = []; this.rings = []; this.decals = [];
    this.shake = 0; this.flash = 0; this.hitstop = 0; this.zoom = 0;
    this.kick = { x: 0, y: 0 };
    this.stopBudget = STOP_BUDGET;
  }

  emit(x: number, y: number, n: number, color: string, speed: number, opts: Partial<Pick<Particle, 'size' | 'drag' | 'kind' | 'ay'>> & { life?: number; dir?: Vec2; spread?: number } = {}): void {
    const count = Math.max(1, Math.round(n * this.quality * (this.reducedMotion ? 0.4 : 1)));
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.cursor];
      this.cursor = (this.cursor + 1) % this.particles.length;
      let a = Math.random() * Math.PI * 2;
      if (opts.dir) a = Math.atan2(opts.dir.y, opts.dir.x) + (Math.random() - 0.5) * (opts.spread ?? 1.2);
      const s = speed * (0.35 + Math.random() * 0.65) * (this.reducedMotion ? 0.4 : 1);
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.max = p.life = (opts.life ?? 0.5) * (0.6 + Math.random() * 0.6);
      p.size = (opts.size ?? 3) * (0.6 + Math.random() * 0.8);
      p.color = color;
      p.drag = opts.drag ?? 3;
      p.kind = opts.kind ?? 0;
      p.ay = opts.ay ?? 0;
      p.active = true;
    }
  }

  ring(x: number, y: number, maxR: number, color: string, life = 0.45, width = 4): void {
    this.rings.push({ x, y, r: 4, maxR, color, life, max: life, width });
    if (this.rings.length > 60) this.rings.shift();
  }

  text(x: number, y: number, text: string, color: string, size = 18, life = 0.9, style: FloatText['style'] = 'label', extra: Partial<FloatText> = {}): FloatText {
    const t: FloatText = { x, y, text, color, life, max: life, size, vy: -50, style, ...extra };
    this.texts.push(t);
    if (this.texts.length > 36) this.texts.splice(this.texts.findIndex((x) => x.style !== 'reaction'), 1);
    return t;
  }

  /** Damage numbers landing on the same spot within ~0.3 s merge into one growing number. */
  damage(x: number, y: number, amount: number, color: string, crit: boolean): void {
    const near = this.texts.find((t) => (t.style === 'dmg' || t.style === 'crit') && t.max - t.life < 0.3 && t.color === color && Math.abs(t.x - x) < 34 && Math.abs(t.y - (y - 24)) < 40);
    if (near && near.value !== undefined) {
      near.value += amount;
      near.text = Math.round(near.value).toString();
      near.life = near.max;
      near.size = Math.min(near.size + 1.5, 34);
      if (crit) near.style = 'crit';
      return;
    }
    this.text(x + (Math.random() - 0.5) * 18, y - 24, Math.round(amount).toString(), crit ? '#ffcf3a' : color, crit ? 26 : 17, crit ? 0.95 : 0.75, crit ? 'crit' : 'dmg', { value: amount });
  }

  addShake(n: number): void {
    if (!this.reducedMotion) this.shake = Math.min(18, this.shake + n * this.shakeScale);
  }

  /** Push the camera along a direction (impact recoil). */
  addKick(dx: number, dy: number, strength: number): void {
    if (this.reducedMotion) return;
    const len = Math.hypot(dx, dy) || 1;
    this.kick.x += (dx / len) * strength * this.shakeScale;
    this.kick.y += (dy / len) * strength * this.shakeScale;
  }

  punchZoom(amount: number, at: Vec2): void {
    if (this.reducedMotion) return;
    this.zoom = Math.max(this.zoom, amount * this.shakeScale);
    this.zoomAt = { ...at };
  }

  addFlash(color: string, n: number): void {
    if (this.reducedMotion) return;
    this.flash = Math.max(this.flash, n * this.flashScale);
    this.flashColor = color;
  }

  private stop(s: number): void {
    const add = Math.min(s, this.stopBudget);
    if (add <= 0) return;
    if (add > this.hitstop) {
      this.stopBudget -= add - this.hitstop;
      this.hitstop = add;
    }
  }

  decal(d: Decal): void {
    if (this.decals.length < 64) this.decals.push(d);
  }

  onEvent(e: SimEvent): void {
    switch (e.type) {
      case 'impact': {
        const n = Math.min(14, 2 + e.speed / 120);
        const color = e.material === 'bumper' ? '#ff4fa3' : e.material === 'slam' ? '#ffd9a0' : '#e8eef7';
        this.emit(e.pos.x, e.pos.y, n, color, e.speed * 0.35, { kind: 1, dir: e.normal, spread: 1.6, life: 0.3, size: 2 });
        if (e.speed > 450) this.ring(e.pos.x, e.pos.y, 20 + e.speed * 0.025, color, 0.25, 2);
        if (e.speed > 700) {
          this.addShake(e.speed / 340);
          this.addKick(-e.normal.x, -e.normal.y, e.speed / 260);
        }
        if (e.material === 'slam' && e.speed > 1000) this.decal({ x: e.pos.x, y: e.pos.y, r: 46, color: '#000000', kind: 'crack' });
        break;
      }
      case 'hit': {
        this.emit(e.pos.x, e.pos.y, 6 + e.speed / 100, e.armored ? '#9aa6b2' : '#ffffff', e.speed * 0.4, { kind: 1, life: 0.35 });
        if (e.crit) {
          this.stop(STOP.crit);
          this.ring(e.pos.x, e.pos.y, 46, '#ffcf3a', 0.3, 3);
          this.addShake(4);
        } else if (e.speed > 600) this.stop(STOP.hit);
        if (e.speed > 800) {
          this.addShake(2.5 + e.speed / 300);
          if (e.normal) this.addKick(e.normal.x, e.normal.y, 3 + e.speed / 300);
        }
        if (e.armored) this.text(e.pos.x, e.pos.y - 20, 'ARMORED', '#9aa6b2', 12, 0.6);
        if ((e.bounces ?? 0) >= 3) this.text(e.pos.x, e.pos.y - 46, `BANK SHOT ×${e.bounces}`, '#a0e4e7', 13, 0.8);
        break;
      }
      case 'damage':
        if (this.damageNumbers && e.amount >= 1)
          this.damage(e.pos.x, e.pos.y, e.amount, e.element ? Content.elements.get(e.element)?.color ?? '#fff' : '#ffffff', e.crit);
        break;
      case 'reaction': {
        const r = Content.reactions.get(e.reactionId);
        const big = Math.max(60, e.radius);
        this.ring(e.pos.x, e.pos.y, big, e.color, 0.5, 5);
        this.ring(e.pos.x, e.pos.y, big * 0.6, '#ffffff', 0.3, 2);
        const crystal = r?.inputs.includes('ice') || r?.inputs.includes('earth');
        const charged = r?.inputs.includes('lightning');
        const smoky = r?.output?.element === 'steam' || r?.inputs.includes('poison');
        this.emit(e.pos.x, e.pos.y, 18 + e.targets * 3, e.color, 380, { life: 0.7, size: crystal ? 6 : 3, drag: 2.5, kind: crystal ? 2 : charged ? 1 : 0 });
        this.emit(e.pos.x, e.pos.y, 10, '#fff4d6', 520, { life: 0.35, kind: 1, size: 2, drag: 3 });
        if (smoky) this.emit(e.pos.x, e.pos.y, 6, e.color, 90, { life: 1.1, kind: 4, size: 18, drag: 1.5, ay: -30 });
        const c2 = Content.elements.get(r?.inputs[1] === '*' ? r.inputs[0] : r?.inputs[1] ?? '')?.color ?? e.color;
        const c1 = Content.elements.get(r?.inputs[0] === '*' ? r?.inputs[1] ?? '' : r?.inputs[0] ?? '')?.color ?? e.color;
        this.text(e.pos.x, e.pos.y - 38 - e.depth * 16, r?.name ?? e.reactionId, c1, 18 + (r?.rarity === 'rare' ? 4 : 0) + Math.min(e.targets, 4), 1.15, 'reaction',
          { color2: c2, sub: e.depth >= 1 ? `CHAIN ×${e.depth + 1}` : e.targets >= 3 ? `${e.targets} TARGETS` : undefined });
        this.addShake(2 + e.targets * 0.8);
        if (e.depth === 0) this.stop(STOP.reaction);
        if (e.depth >= 2) {
          this.addFlash(e.color, 0.12);
          this.punchZoom(0.03, e.pos);
        }
        if (r) this.decal({ x: e.pos.x, y: e.pos.y, r: Math.min(90, big * 0.55), color: e.color, kind: reactionDecal(r.id, r.inputs) });
        break;
      }
      case 'arc':
        this.arcs.push({ from: e.from, to: e.to, color: Content.elements.get(e.element)?.color ?? '#fff', life: 0.25, seed: Math.random() * 1000 });
        if (this.arcs.length > 40) this.arcs.shift();
        break;
      case 'kill': {
        const color = Content.enemies.get(e.enemyId)?.color ?? '#ffffff';
        this.emit(e.pos.x, e.pos.y, e.isBoss ? 120 : e.elite ? 40 : 22, '#ffffff', e.isBoss ? 700 : 300, { life: e.isBoss ? 1.4 : 0.6, size: 4 });
        this.emit(e.pos.x, e.pos.y, e.isBoss ? 50 : 14, color, 260, { life: 0.8, size: 5, kind: 2, drag: 2.2 });
        // Essence rises out of the fallen foe.
        this.emit(e.pos.x, e.pos.y, Math.min(12, 3 + e.essence), '#9fe3ff', 70, { life: 1.2, size: 3, kind: 3, drag: 1.2, ay: -160 });
        this.ring(e.pos.x, e.pos.y, e.isBoss ? 400 : e.elite ? 120 : 70, '#ffffff', e.isBoss ? 1 : 0.35, 3);
        this.decal({ x: e.pos.x, y: e.pos.y, r: e.isBoss ? 120 : 30, color, kind: 'glow' });
        this.stop(e.isBoss ? STOP.boss : e.elite ? STOP.elite : STOP.kill);
        if (e.isBoss) {
          this.addShake(18);
          this.addFlash('#ffffff', 0.6);
          this.punchZoom(0.12, e.pos);
        } else if (e.elite) {
          this.addShake(8);
          this.punchZoom(0.06, e.pos);
        } else this.addShake(2);
        if ((e.combo ?? 0) >= 5) this.text(e.pos.x, e.pos.y - 60, `+${Math.round(Math.min(20, e.combo ?? 0) * 2)}% ◆`, '#9fe3ff', 12, 0.8);
        break;
      }
      case 'objectDestroyed':
        this.emit(e.pos.x, e.pos.y, 20, Content.objects.get(e.objectId)?.color ?? '#fff', 320, { life: 0.6, kind: 1 });
        this.emit(e.pos.x, e.pos.y, 8, Content.objects.get(e.objectId)?.color ?? '#fff', 200, { life: 0.8, kind: 2, size: 5 });
        this.addShake(4);
        break;
      case 'ballDamaged':
        this.addFlash('#ff2a2a', 0.25);
        this.addShake(6);
        break;
      case 'launch':
        this.ring(e.pos.x, e.pos.y, 48, '#c6f2ef', 0.35, 2);
        this.emit(e.pos.x, e.pos.y, 10, '#ffffff', 200, { dir: { x: -e.dir.x, y: -e.dir.y }, spread: 0.9, life: 0.35, kind: 1 });
        this.addKick(-e.dir.x, -e.dir.y, 2 + e.power * 3);
        break;
      case 'brake':
        this.ring(e.pos.x, e.pos.y, 40, '#a0e4e7', 0.3, 2);
        break;
      case 'zoneSpawned': {
        const z = Content.zones.get(e.zone);
        if (z) this.ring(e.pos.x, e.pos.y, e.radius, z.color, 0.4, 3);
        break;
      }
      case 'status':
        if (e.status === 'frozen') this.emit(e.pos.x, e.pos.y, 10, '#bdf3ff', 160, { life: 0.5, kind: 2, size: 5 });
        break;
      case 'bossPhase':
        this.addShake(12);
        this.addFlash(Content.elements.get(e.element)?.color ?? '#fff', 0.4);
        this.stop(STOP.phase);
        break;
      case 'combo':
        if (e.count % 5 === 0) this.ring(e.pos.x, e.pos.y, 50 + e.count * 2, e.count >= 20 ? '#ff6ad5' : e.count >= 10 ? '#ffd23a' : '#a0e4e7', 0.4, 3);
        break;
      case 'comboEnd':
        if (e.count >= 10) this.addShake(3);
        break;
      case 'wardBroken':
        this.emit(e.pos.x, e.pos.y, 18, '#bdf3ff', 340, { kind: 2, life: 0.6, size: 6 });
        this.ring(e.pos.x, e.pos.y, 70, '#bdf3ff', 0.35, 3);
        this.text(e.pos.x, e.pos.y - 30, 'WARD BROKEN', '#bdf3ff', 13, 0.8);
        this.addShake(4);
        break;
      case 'execute':
        this.text(e.pos.x, e.pos.y - 30, 'EXECUTE', '#ff5a5a', 16, 0.8);
        this.emit(e.pos.x, e.pos.y, 14, '#ff5a5a', 420, { kind: 1, life: 0.3 });
        this.stop(STOP.crit);
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
      p.vy = p.vy * f + p.ay * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (const t of this.texts) {
      t.life -= dt;
      t.y += t.vy * dt;
      t.vy *= Math.exp(-2.4 * dt);
    }
    this.texts = this.texts.filter((t) => t.life > 0);
    for (const a of this.arcs) a.life -= dt;
    this.arcs = this.arcs.filter((a) => a.life > 0);
    for (const r of this.rings) {
      r.life -= dt;
      r.r = r.maxR * (1 - Math.pow(r.life / r.max, 2));
    }
    this.rings = this.rings.filter((r) => r.life > 0);
    this.shake = Math.max(0, this.shake - dt * 26);
    // Kick springs back critically damped; zoom eases out.
    const k = Math.exp(-14 * dt);
    this.kick.x *= k;
    this.kick.y *= k;
    this.zoom *= Math.exp(-5 * dt);
    if (this.zoom < 0.002) this.zoom = 0;
    this.flash = Math.max(0, this.flash - dt * 2);
    this.stopBudget = Math.min(STOP_BUDGET, this.stopBudget + dt * STOP_BUDGET);
  }
}
