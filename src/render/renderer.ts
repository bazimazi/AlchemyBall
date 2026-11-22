import { Content, type CosmeticDef } from '../content';
import type { RegionDef, StatusId } from '../content/types';
import { vlen, type Vec2 } from '../core/vec';
import { PHYS, effectivePhysics } from '../sim/ballPhysics';
import type { ArenaObject, Enemy, Telegraph, Zone } from '../sim/entities';
import type { World } from '../sim/world';
import type { Decal, Fx, Ring } from './fx';
import { affixAura, circle, creature, glow, polygon, reagent, sigil } from './art';
import { paintArena } from './arena';

export interface AimState {
  active: boolean;
  dir: Vec2;
  power: number;
  /** Screen-space touch anchor and current finger position (slingshot band). */
  anchor?: Vec2;
  cur?: Vec2;
}

/** Per-player presentation options (cosmetics, accessibility, codex knowledge for the lens). */
export interface RenderStyle {
  trail?: CosmeticDef;
  skin?: CosmeticDef;
  /** Show element badges for every aura (colour-blind support), not only applied ones. */
  badges: boolean;
  /** Reagent Lens research: predict the reaction on the aimed target. */
  lens: boolean;
  /** Reactions the player has discovered (lens shows "?" for unknown ones). */
  known: Set<string>;
}

const STATUS_GLYPH: Record<StatusId, [string, string]> = {
  frozen: ['❄', '#bdf3ff'],
  stunned: ['✦', '#ffe84a'],
  slowed: ['⏬', '#9fd6ff'],
  magnetized: ['⊕', '#c9d2dc'],
  exposed: ['⚠', '#ff9a4a'],
  blinded: ['◌', '#ffffff'],
  petrified: ['■', '#b07a45'],
};

const TAU = Math.PI * 2;

/** Predicted path of a launch: points, and what it hits first. */
export interface ShotPrediction {
  pts: Vec2[];
  /** Number of points in the first (full-alpha) segment. */
  firstSeg: number;
  hitEnemy?: Enemy;
  hitObject?: ArenaObject;
  contact?: Vec2;
}

/** Ray-march the launch: walls reflect, objects reflect (as circles), the first enemy stops it. */
export function predictShot(w: World, dir: Vec2, power: number, bounces = 3): ShotPrediction {
  const b = w.ball;
  const r = b.radius;
  let p = { ...b.pos };
  let d = { ...dir };
  let remaining = 260 + 560 * power;
  const pts: Vec2[] = [{ ...p }];
  let firstSeg = 0;
  let hitEnemy: Enemy | undefined;
  let hitObject: ArenaObject | undefined;
  let contact: Vec2 | undefined;
  const circleHit = (cx: number, cy: number, rad: number): number => {
    // Ray p + t·d vs circle (c, rad); returns t or Infinity.
    const fx = p.x - cx, fy = p.y - cy;
    const bq = fx * d.x + fy * d.y;
    const c = fx * fx + fy * fy - rad * rad;
    const disc = bq * bq - c;
    if (disc < 0 || c < 0) return Infinity;
    const t = -bq - Math.sqrt(disc);
    return t > 0.5 ? t : Infinity;
  };
  for (let bounce = 0; bounce <= bounces && remaining > 0; bounce++) {
    let best = remaining;
    let n: Vec2 | null = null;
    let kind: 'wall' | 'object' | 'enemy' | null = null;
    let target: Enemy | ArenaObject | undefined;
    for (const wl of w.walls) {
      // Offset the wall toward the ray origin by the ball radius so the contact point is the ball centre.
      const ex = wl.b.x - wl.a.x, ey = wl.b.y - wl.a.y;
      const len = Math.hypot(ex, ey) || 1;
      let nx = -ey / len, ny = ex / len;
      if ((p.x - wl.a.x) * nx + (p.y - wl.a.y) * ny < 0) (nx = -nx), (ny = -ny);
      const ax = wl.a.x + nx * r, ay = wl.a.y + ny * r;
      const den = d.x * ey - d.y * ex;
      if (Math.abs(den) < 1e-6) continue;
      const t = ((ax - p.x) * ey - (ay - p.y) * ex) / den;
      const u = ((ax - p.x) * d.y - (ay - p.y) * d.x) / den;
      if (t > 0.5 && u >= -0.02 && u <= 1.02 && t < best) {
        best = t;
        n = { x: nx, y: ny };
        kind = 'wall';
      }
    }
    for (const o of w.objects) {
      if (o.dead) continue;
      const t = circleHit(o.pos.x, o.pos.y, o.radius + r);
      if (t < best) {
        best = t;
        kind = 'object';
        target = o;
      }
    }
    for (const e of w.enemies) {
      if (e.dead || e.spawnFx > 0) continue;
      const t = circleHit(e.pos.x, e.pos.y, e.radius + r);
      if (t < best) {
        best = t;
        kind = 'enemy';
        target = e;
      }
    }
    p = { x: p.x + d.x * best, y: p.y + d.y * best };
    pts.push({ ...p });
    if (bounce === 0) firstSeg = pts.length;
    remaining -= best;
    if (kind === 'enemy') {
      hitEnemy = target as Enemy;
      contact = { ...p };
      break;
    }
    if (kind === 'object') {
      const o = target as ArenaObject;
      const len = Math.hypot(p.x - o.pos.x, p.y - o.pos.y) || 1;
      n = { x: (p.x - o.pos.x) / len, y: (p.y - o.pos.y) / len };
      if (!hitObject) {
        hitObject = o;
        contact = contact ?? { ...p };
      }
    }
    if (!n) break;
    const dn = d.x * n.x + d.y * n.y;
    d = { x: d.x - 2 * dn * n.x, y: d.y - 2 * dn * n.y };
    remaining *= 0.82;
  }
  return { pts, firstSeg, hitEnemy, hitObject, contact };
}

/**
 * Canvas 2D renderer. World units map to screen via a fit-to-viewport transform; the arena
 * keeps its aspect ratio and HUD elements live in the DOM on top.
 */
export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  scale = 1;
  ox = 0;
  oy = 0;
  dpr = 1;
  highContrast = false;
  style: RenderStyle = { badges: false, lens: false, known: new Set() };
  /** 0..1, how close the ball is to breaking (drives the red vignette pulse). */
  danger = 0;
  private trail: { x: number; y: number; c: string; life: number; i: number }[] = [];
  private trailSeq = 0;
  private floorCache: HTMLCanvasElement | null = null;
  private floorKey = '';
  private decalLayer: HTMLCanvasElement | null = null;
  private decalFade = 0;
  private vignette: HTMLCanvasElement | null = null;
  private vignetteKey = '';
  private dangerVignette: HTMLCanvasElement | null = null;
  private world: World | null = null;
  private reducedMotion = false;
  private frameDt = 0;
  private quality = 1;
  private t = 0;
  private w = 0;
  private h = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
  }

  resize(quality: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, quality >= 1 ? 2 : 1.25);
    this.dpr = dpr;
    this.quality = quality;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    // Reserve room for the HUD at the top and bottom.
    const css = getComputedStyle(document.documentElement);
    const top = 92 + (parseFloat(css.getPropertyValue('--safe-top')) || 0);
    const bottom = 60 + (parseFloat(css.getPropertyValue('--safe-bottom')) || 0);
    const s = Math.max(0.05, Math.min((w - 24) / PHYS.arenaW, (h - top - bottom) / PHYS.arenaH));
    this.scale = s;
    this.ox = (w - PHYS.arenaW * s) / 2;
    this.oy = top + (h - top - bottom - PHYS.arenaH * s) / 2;
    this.vignette = null;
  }

  clear(): void {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.fillStyle = '#080f17';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  toWorld(sx: number, sy: number): Vec2 {
    return { x: (sx - this.ox) / this.scale, y: (sy - this.oy) / this.scale };
  }

  draw(w: World, fx: Fx, region: RegionDef | undefined, aim: AimState, dt: number): void {
    this.reducedMotion = fx.reducedMotion;
    this.frameDt = dt;
    if (!this.reducedMotion) this.t += dt;
    if (this.world !== w) {
      this.trail = [];
      this.world = w;
      this.decalLayer = null;
    }
    const ctx = this.ctx;
    const pal = region?.palette ?? { bg: '#0d0f14', floor: '#171c22', wall: '#3a4452', accent: '#ff8a3d', light: '#ff9a4a', motes: ['#a4d8ca', '#ffba79'] };
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Reset any state a previous frame may have leaked, so identical inputs draw identical frames.
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    ctx.lineWidth = 1;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.shadowBlur = 0;
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, this.w, this.h);
    this.drawBackdrop(pal);

    // Camera: trauma² shake with smooth noise and a little rotation, a directional kick, and zoom punches.
    const live = dt > 0 && !this.reducedMotion;
    const trauma = live ? Math.min(1, fx.shake / 18) : 0;
    const amt = trauma * trauma;
    const tt = this.t * 22;
    const sx = amt * 13 * (Math.sin(tt * 1.31) * 0.6 + Math.sin(tt * 2.17 + 1.3) * 0.4);
    const sy = amt * 13 * (Math.sin(tt * 1.53 + 2.1) * 0.6 + Math.sin(tt * 2.71 + 0.4) * 0.4);
    const rot = amt * 0.035 * Math.sin(tt * 1.11 + 0.7);
    const s = this.scale;
    const z = live ? 1 + fx.zoom : 1;
    ctx.translate(this.ox + sx + (live ? fx.kick.x * s : 0), this.oy + sy + (live ? fx.kick.y * s : 0));
    ctx.scale(s, s);
    const zx = fx.zoomAt.x, zy = fx.zoomAt.y;
    ctx.translate(zx, zy);
    ctx.scale(z, z);
    ctx.rotate(rot);
    ctx.translate(-zx, -zy);

    this.drawFloor(pal, region?.id ?? 'cinder_marsh');
    this.drawDecals(fx, dt);
    this.drawAtmosphere(pal, region?.id ?? 'cinder_marsh');
    for (const zn of w.zones) this.drawZone(zn);
    this.drawWalls(w, pal);
    for (const t of w.telegraphs) this.drawTelegraph(t);
    for (const p of w.projectiles) {
      if (!p.lob) continue;
      const k = p.lob.t / p.lob.dur;
      ctx.strokeStyle = '#ff5a3a';
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6 + 0.4 * k;
      ctx.beginPath();
      ctx.arc(p.lob.target.x, p.lob.target.y, p.lob.zoneRadius * (0.4 + 0.6 * k), 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.12 + 0.2 * k;
      ctx.fillStyle = '#ff5a3a';
      circle(ctx, p.lob.target.x, p.lob.target.y, p.lob.zoneRadius * k);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    for (const o of w.objects) this.drawObject(o);
    for (const e of w.enemies) this.drawEnemy(e, w.ball.pos);
    this.drawProjectiles(w);
    if (aim.active) {
      ctx.fillStyle = '#050c1830';
      ctx.fillRect(0, 0, PHYS.arenaW, PHYS.arenaH);
    }
    this.drawBall(w, aim, fx);
    this.drawFx(fx);
    if (aim.active) this.drawAimOverlay(w, aim);

    // Screen-space passes.
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawVignette(pal.bg);
    if (this.danger > 0.01) {
      const pulse = this.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(this.t * (4 + this.danger * 4));
      ctx.globalAlpha = this.danger * (0.18 + 0.22 * pulse);
      ctx.drawImage(this.vignetteCanvas('#ff1f2f'), 0, 0, this.w, this.h);
      ctx.globalAlpha = 1;
    }
    if (fx.flash > 0) {
      ctx.globalAlpha = Math.min(0.35, fx.flash);
      ctx.fillStyle = fx.flashColor;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.globalAlpha = 1;
    }
  }

  // ─── Background ─────────────────────────────────────────────────────────────
  /** Soft region-coloured light behind the arena so the page never looks flat. */
  private drawBackdrop(pal: RegionDef['palette']): void {
    const c = this.ctx;
    const width = PHYS.arenaW * this.scale;
    const height = PHYS.arenaH * this.scale;
    const cx = this.ox + PHYS.arenaW * this.scale / 2;
    const cy = this.oy + PHYS.arenaH * this.scale / 2;
    glow(c, cx, cy, Math.max(this.w, this.h) * 0.7, pal.light, 0.09);
    glow(c, cx, this.oy + height * 0.05, Math.max(width, 220), pal.accent, 0.13);
    c.save();
    c.translate(cx, cy);
    c.scale(this.scale, this.scale);
    sigil(c, 0, 0, PHYS.arenaH * 0.59, pal.light + '1c');
    sigil(c, 0, 0, PHYS.arenaH * 0.72, pal.accent + '14', Math.PI / 6);
    c.restore();
  }

  private vignetteCanvas(color: string): HTMLCanvasElement {
    const key = `${color}|${this.w}x${this.h}`;
    if (color === '#ff1f2f' && this.dangerVignette) return this.dangerVignette;
    if (color !== '#ff1f2f' && this.vignette && this.vignetteKey === key) return this.vignette;
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 256;
    const g = cv.getContext('2d')!;
    const grad = g.createRadialGradient(128, 128, 60, 128, 128, 182);
    grad.addColorStop(0, color + '00');
    grad.addColorStop(1, color + (color === '#ff1f2f' ? 'ff' : 'c8'));
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    if (color !== '#ff1f2f') {
      this.vignette = cv;
      this.vignetteKey = key;
    } else this.dangerVignette = cv;
    return cv;
  }

  private drawVignette(bg: string): void {
    this.ctx.drawImage(this.vignetteCanvas(bg), 0, 0, this.w, this.h);
  }

  /** Static engraved stone is cached per region; animated illumination is a separate pass. */
  private drawFloor(pal: RegionDef['palette'], regionId: string): void {
    const W = PHYS.arenaW, H = PHYS.arenaH;
    const key = `${pal.floor}|${pal.accent}|${pal.light}|${this.highContrast}|${regionId}`;
    if (!this.floorCache || key !== this.floorKey) {
      this.floorKey = key;
      const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
      paintArena(canvas.getContext('2d')!, pal, regionId, this.highContrast);
      this.floorCache = canvas;
    }
    const ctx = this.ctx;
    ctx.fillStyle = '#00000066';
    ctx.fillRect(6, 14, PHYS.arenaW, PHYS.arenaH);
    ctx.drawImage(this.floorCache, 0, 0);
  }

  /** Lasting marks: reactions scorch, frost and splash the floor; they fade over ~15 s. */
  private drawDecals(fx: Fx, dt: number): void {
    const W = PHYS.arenaW, H = PHYS.arenaH;
    if (!this.decalLayer) {
      this.decalLayer = document.createElement('canvas');
      this.decalLayer.width = W / 2;
      this.decalLayer.height = H / 2;
    }
    const c = this.decalLayer.getContext('2d')!;
    if (fx.decals.length) {
      c.save();
      c.scale(0.5, 0.5);
      for (const d of fx.decals.splice(0)) this.paintDecal(c, d);
      c.restore();
    }
    this.decalFade += dt;
    if (this.decalFade > 0.5) {
      this.decalFade = 0;
      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = 'rgba(0,0,0,0.035)';
      c.fillRect(0, 0, W / 2, H / 2);
      c.globalCompositeOperation = 'source-over';
    }
    this.ctx.drawImage(this.decalLayer, 0, 0, W, H);
  }

  private paintDecal(c: CanvasRenderingContext2D, d: Decal): void {
    const seed = d.x * 13.1 + d.y * 7.7;
    c.save();
    c.translate(d.x, d.y);
    switch (d.kind) {
      case 'scorch': {
        const g = c.createRadialGradient(0, 0, 0, 0, 0, d.r);
        g.addColorStop(0, '#0a0503aa'); g.addColorStop(0.6, '#1a0a0455'); g.addColorStop(1, '#00000000');
        c.fillStyle = g; circle(c, 0, 0, d.r); c.fill();
        c.fillStyle = '#ff8a3d55';
        for (let i = 0; i < 6; i++) { const a = seed + i * 1.9; circle(c, Math.cos(a) * d.r * 0.5, Math.sin(a) * d.r * 0.5, 2); c.fill(); }
        break;
      }
      case 'frost': {
        const g = c.createRadialGradient(0, 0, 0, 0, 0, d.r);
        g.addColorStop(0, '#d9fbff44'); g.addColorStop(1, '#bdf3ff00');
        c.fillStyle = g; circle(c, 0, 0, d.r); c.fill();
        c.strokeStyle = '#e6fbff66'; c.lineWidth = 1.5;
        for (let i = 0; i < 7; i++) {
          const a = seed + i * (TAU / 7);
          c.beginPath(); c.moveTo(0, 0);
          c.lineTo(Math.cos(a) * d.r * 0.5, Math.sin(a) * d.r * 0.5);
          c.lineTo(Math.cos(a + 0.3) * d.r * 0.85, Math.sin(a + 0.3) * d.r * 0.85); c.stroke();
        }
        break;
      }
      case 'splash':
        c.fillStyle = d.color + '26';
        c.beginPath();
        for (let i = 0; i <= 12; i++) {
          const a = (i / 12) * TAU, rr = d.r * (0.6 + 0.3 * Math.sin(seed + i * 2.3));
          i ? c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        c.fill();
        break;
      case 'crack':
        c.strokeStyle = '#00000088'; c.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
          const a = seed + i * 1.05;
          c.beginPath(); c.moveTo(0, 0);
          c.lineTo(Math.cos(a) * d.r * 0.5, Math.sin(a) * d.r * 0.5);
          c.lineTo(Math.cos(a + 0.4) * d.r, Math.sin(a + 0.4) * d.r); c.stroke();
        }
        break;
      case 'glow':
        c.strokeStyle = d.color + '30'; c.lineWidth = 3;
        circle(c, 0, 0, d.r); c.stroke();
        c.fillStyle = d.color + '14'; c.fill();
        break;
    }
    c.restore();
  }

  private drawAtmosphere(pal: RegionDef['palette'], regionId: string): void {
    const c = this.ctx;
    glow(c, 80, 100, 230, pal.light, 0.08);
    glow(c, PHYS.arenaW - 70, PHYS.arenaH - 120, 260, pal.accent, 0.07);
    if (this.reducedMotion) return;
    const falling = regionId === 'frostvein';
    const charged = regionId === 'storm_spire';
    c.save();
    for (let i = 0; i < 36 * this.quality; i++) {
      const x = 35 + ((i * 173.3 + Math.sin(this.t * 0.3 + i) * (falling ? 35 : 16)) % 650 + 650) % 650;
      const drift = this.t * (6 + i % 4) * (falling ? -2.2 : 1);
      const y = ((i * 97.1 - drift) % 1080 + 1080) % 1080 + 20;
      const flicker = Math.max(0, Math.sin(this.t * (charged ? 2.3 : 1.1) + i * 4));
      const color = pal.motes[i % pal.motes.length];
      const size = i % 3 === 0 ? 2.1 : 1;
      c.globalAlpha = 0.12 + flicker * 0.38;
      c.fillStyle = color;
      if (i % 7 === 0) glow(c, x, y, size * 7, color, 0.4);
      c.beginPath();
      c.ellipse(x, y, size, size * (charged ? 1.8 : 1.1), 0.5, 0, TAU);
      c.fill();
    }
    c.restore();
  }

  private drawWalls(w: World, pal: RegionDef['palette']): void {
    const c = this.ctx;
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    for (const wl of w.walls) {
      const color = wl.material === 'bumper' ? '#ff62b3' : wl.material === 'metal' ? '#9bced7' : this.highContrast ? '#ffffff' : pal.wall;
      c.beginPath(); c.moveTo(wl.a.x, wl.a.y); c.lineTo(wl.b.x, wl.b.y);
      c.strokeStyle = '#02080c'; c.lineWidth = 22; c.stroke();
      c.strokeStyle = wl.material === 'stone' ? pal.accent + '76' : color; c.lineWidth = 16; c.stroke();
      c.strokeStyle = color; c.lineWidth = 11; c.stroke();
      c.strokeStyle = wl.material === 'stone' ? pal.light + '76' : '#ffffffaa'; c.lineWidth = 2; c.stroke();
      const len = Math.hypot(wl.b.x - wl.a.x, wl.b.y - wl.a.y);
      for (let d = 12; d <= len - 8; d += 64) {
        const x = wl.a.x + (wl.b.x - wl.a.x) * d / len, y = wl.a.y + (wl.b.y - wl.a.y) * d / len;
        c.fillStyle = '#101a23'; circle(c, x, y, 4.6); c.fill();
        c.fillStyle = wl.material === 'stone' ? pal.light + 'c8' : color; circle(c, x - 0.5, y - 0.5, 1.8); c.fill();
      }
    }
    c.restore();
  }

  private drawTelegraph(t: Telegraph): void {
    const ctx = this.ctx;
    const k = Math.min(1, t.t / t.dur);
    const urgent = k > 0.75;
    ctx.save();
    if (t.kind === 'line' && t.dir) {
      const len = t.length ?? 400;
      const wdt = t.radius * 1.6;
      ctx.translate(t.pos.x, t.pos.y);
      ctx.rotate(Math.atan2(t.dir.y, t.dir.x));
      ctx.globalAlpha = 0.18 + 0.2 * k;
      ctx.fillStyle = t.color;
      ctx.fillRect(0, -wdt / 2, len * k, wdt);
      ctx.globalAlpha = urgent ? 1 : 0.75;
      ctx.strokeStyle = t.color; ctx.lineWidth = 3; ctx.setLineDash([14, 10]);
      ctx.strokeRect(0, -wdt / 2, len, wdt);
      ctx.setLineDash([]);
      // Chevrons point the way.
      ctx.lineWidth = 4;
      for (let x = 60; x < len; x += 90) {
        ctx.beginPath(); ctx.moveTo(x - 14, -16); ctx.lineTo(x, 0); ctx.lineTo(x - 14, 16); ctx.stroke();
      }
    } else if (t.kind === 'nova') {
      ctx.globalAlpha = 0.35 + 0.5 * k;
      ctx.strokeStyle = t.color; ctx.lineWidth = 3;
      circle(ctx, t.pos.x, t.pos.y, t.radius * (1.6 - 0.6 * k)); ctx.stroke();
      ctx.globalAlpha = 0.15 + 0.3 * k;
      glow(ctx, t.pos.x, t.pos.y, t.radius * 1.4, t.color, 0.6 * k);
      ctx.lineWidth = 2;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + this.t;
        ctx.beginPath();
        ctx.moveTo(t.pos.x + Math.cos(a) * t.radius, t.pos.y + Math.sin(a) * t.radius);
        ctx.lineTo(t.pos.x + Math.cos(a) * t.radius * (1.15 + 0.3 * k), t.pos.y + Math.sin(a) * t.radius * (1.15 + 0.3 * k));
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = t.color;
      ctx.lineWidth = 3;
      ctx.globalAlpha = urgent ? 1 : 0.85;
      circle(ctx, t.pos.x, t.pos.y, t.radius); ctx.stroke();
      ctx.globalAlpha = 0.22 + 0.25 * k;
      ctx.fillStyle = t.color;
      circle(ctx, t.pos.x, t.pos.y, t.radius * k); ctx.fill();
      // Countdown arc.
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(t.pos.x, t.pos.y, t.radius + 7, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
    }
    ctx.restore();
  }

  private drawZone(z: Zone): void {
    const ctx = this.ctx;
    const fade = z.ttl === Infinity ? 1 : Math.min(1, z.ttl / 0.8, (z.maxTtl - z.ttl) / 0.25 + 0.2);
    const own = z.def.element ? Math.min(1, (z.auras.get(z.def.element) ?? 0) + 0.3) : 1;
    ctx.globalAlpha = fade * own;
    const hostile = z.faction === 'hostile';
    switch (z.def.look) {
      case 'pool': {
        const molten = z.def.element === 'magma';
        const sheen = molten ? '#ffbf70' : z.def.element === 'poison' ? '#dcf681' : '#b9fff5';
        const g = ctx.createRadialGradient(z.pos.x, z.pos.y, z.radius * 0.2, z.pos.x, z.pos.y, z.radius);
        g.addColorStop(0, z.def.color + (molten ? 'e0' : '99'));
        g.addColorStop(0.74, z.def.color + '5c');
        g.addColorStop(1, z.def.color + '29');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(z.pos.x, z.pos.y, z.radius, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = z.def.color + '88'; ctx.lineWidth = 2; ctx.stroke();
        ctx.save(); ctx.clip();
        // Magma has glowing seams. Cool liquids carry broad caustic ripples.
        for (let i = 0; i < 5; i++) {
          const phase = this.t * 0.7 + i * 2 + z.uid;
          const y = z.pos.y + (i - 2) * z.radius * 0.31;
          ctx.globalAlpha = fade * own * (molten ? 0.45 : 0.27);
          ctx.strokeStyle = sheen;
          ctx.lineWidth = molten ? 2 : 1.4;
          ctx.beginPath();
          if (molten) {
            for (let j = 0; j <= 6; j++) {
              const x = z.pos.x + (j - 3) * z.radius * 0.32;
              const offset = Math.sin(i * 4 + j * 6) * z.radius * 0.12 + Math.sin(phase) * 3;
              if (j === 0) ctx.moveTo(x, y + offset); else ctx.lineTo(x, y + offset);
            }
          } else {
            ctx.ellipse(z.pos.x + Math.sin(phase) * z.radius * 0.18, y, z.radius * 0.8, 5 + Math.sin(phase) * 3, -0.15, 0, TAU);
          }
          ctx.stroke();
          const bx = z.pos.x + Math.sin(i * 13 + z.uid) * z.radius * 0.7;
          const by = z.pos.y + z.radius * 0.7 - ((this.t * 9 + i * 31) % (z.radius * 1.4));
          circle(ctx, bx, by, 2 + i % 3); ctx.stroke();
        }
        ctx.restore();
        ctx.strokeStyle = z.def.color;
        ctx.lineWidth = 2;
        const rr = (this.t * 20 + z.uid * 13) % z.radius;
        ctx.globalAlpha = fade * 0.4 * (1 - rr / z.radius);
        ctx.beginPath();
        ctx.arc(z.pos.x, z.pos.y, rr, 0, TAU);
        ctx.stroke();
        break;
      }
      case 'cloud': {
        const turn = this.t * 0.25 + z.uid;
        glow(ctx, z.pos.x, z.pos.y, z.radius, z.def.color, 0.18);
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * TAU + turn;
          const r = z.radius * (0.48 + 0.07 * Math.sin(a * 2 + i));
          glow(ctx, z.pos.x + Math.cos(a) * r * 0.78, z.pos.y + Math.sin(a) * r * 0.63, r * 1.25, z.def.color, 0.27);
        }
        break;
      }
      case 'patch': {
        ctx.fillStyle = z.def.color;
        ctx.globalAlpha = fade * 0.45;
        ctx.beginPath();
        for (let i = 0; i <= 14; i++) {
          const a = (i / 14) * TAU;
          const r = z.radius * (0.85 + 0.15 * Math.sin(i * 2.3 + z.uid));
          const x = z.pos.x + Math.cos(a) * r;
          const y = z.pos.y + Math.sin(a) * r;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = z.def.color; ctx.lineWidth = 1.5; ctx.stroke();
        if (z.def.element === 'ice') {
          ctx.strokeStyle = '#e6fbff'; ctx.globalAlpha = fade * 0.55;
          for (let i = 0; i < 6; i++) {
            const a = i * Math.PI / 3 + z.uid;
            const x = z.pos.x + Math.cos(a) * z.radius * 0.38;
            const y = z.pos.y + Math.sin(a) * z.radius * 0.38;
            ctx.beginPath();
            ctx.moveTo(z.pos.x, z.pos.y);
            ctx.lineTo(x, y);
            ctx.lineTo(z.pos.x + Math.cos(a + 0.1) * z.radius * 0.79, z.pos.y + Math.sin(a + 0.1) * z.radius * 0.79);
            ctx.moveTo(x, y);
            ctx.lineTo(z.pos.x + Math.cos(a - 0.36) * z.radius * 0.67, z.pos.y + Math.sin(a - 0.36) * z.radius * 0.67);
            ctx.stroke();
          }
        } else if (z.def.element === 'fire' && !this.reducedMotion) {
          ctx.fillStyle = '#ffd27a';
          for (let i = 0; i < 5; i++) {
            const a = i * 1.3 + z.uid, rr = z.radius * 0.6 * ((i * 0.37) % 1);
            const fl = (this.t * 2 + i * 0.3) % 1;
            ctx.globalAlpha = fade * (1 - fl) * 0.8;
            circle(ctx, z.pos.x + Math.cos(a) * rr, z.pos.y + Math.sin(a) * rr - fl * 22, 2.5 * (1 - fl) + 0.5); ctx.fill();
          }
        }
        break;
      }
      case 'current':
        ctx.strokeStyle = z.def.color;
        ctx.globalAlpha = fade * 0.4;
        ctx.lineWidth = 2;
        for (let i = 0; i < 5; i++) {
          const y = z.pos.y + z.radius - ((this.t * 120 + i * 40) % (z.radius * 2));
          ctx.beginPath();
          ctx.moveTo(z.pos.x - 20 + i * 10, y);
          ctx.lineTo(z.pos.x - 20 + i * 10, y - 18);
          ctx.stroke();
        }
    }
    if (hostile) {
      ctx.globalAlpha = fade * 0.8;
      ctx.strokeStyle = '#ff3b3b';
      ctx.setLineDash([6, 6]);
      ctx.lineDashOffset = -this.t * 20;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(z.pos.x, z.pos.y, z.radius, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }
    ctx.globalAlpha = 1;
  }

  private drawObject(o: ArenaObject): void {
    reagent(this.ctx, o, this.reducedMotion ? 0 : this.t);
    this.drawAuraPips(o.auras, o.pos.x, o.pos.y, o.radius, o.def.element);
    if (o.def.hp !== undefined && o.hp < o.maxHp) this.drawBar(o.pos.x, o.pos.y + o.radius + 8, o.radius * 1.6, o.hp / o.maxHp, '#ddd');
  }

  private drawAuraPips(auras: Map<string, number>, x: number, y: number, r: number, skip?: string): void {
    const ctx = this.ctx;
    let i = 0;
    for (const [el, amt] of auras) {
      if (el === skip || amt < 0.05) continue;
      const def = Content.elements.get(el);
      if (!def || def.tier === 'hidden') continue;
      const a = -Math.PI / 2 + i * 0.7 - 0.35 * (auras.size - 1);
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.5 + 0.5 * Math.min(1, amt);
      ctx.beginPath();
      ctx.arc(x, y, r + 6, a - 0.28 * Math.min(1, amt + 0.3), a + 0.28 * Math.min(1, amt + 0.3));
      ctx.stroke();
      i++;
    }
    ctx.globalAlpha = 1;
  }

  /** Element badges with distinct shapes (never colour alone), with a drain ring for amount. */
  private drawBadges(auras: Map<string, number>, x: number, y: number, skip?: string): void {
    const list = [...auras].filter(([el, amt]) => amt >= 0.08 && el !== skip && Content.elements.get(el)?.tier !== 'hidden');
    if (!list.length) return;
    const ctx = this.ctx;
    const size = 8;
    let bx = x - ((list.length - 1) * (size * 2 + 3)) / 2;
    for (const [el, amt] of list) {
      const def = Content.elements.get(el)!;
      ctx.fillStyle = '#0b1420e6';
      circle(ctx, bx, y, size + 1.5); ctx.fill();
      ctx.strokeStyle = def.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(bx, y, size + 1.5, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, amt)); ctx.stroke();
      elementShape(ctx, el, bx, y, size * 0.62, def.color);
      bx += size * 2 + 3;
    }
  }

  private drawBar(cx: number, y: number, w: number, frac: number, color: string, ward = 0, gold = false): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(cx - w / 2 - 1, y - 1, w + 2, 7);
    ctx.fillStyle = color;
    ctx.fillRect(cx - w / 2, y, w * Math.max(0, frac), 5);
    if (ward > 0) {
      ctx.fillStyle = '#bdf3ffcc';
      ctx.fillRect(cx - w / 2, y - 3, w * Math.min(1, ward), 3);
    }
    if (gold) {
      ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 1;
      ctx.strokeRect(cx - w / 2 - 1.5, y - 1.5, w + 3, 8);
    }
  }

  private drawEnemy(e: Enemy, target: Vec2): void {
    const ctx = this.ctx, { x, y } = e.pos, r = e.radius;
    ctx.save();
    if (e.spawnFx > 0) {
      sigil(ctx, x, y, r * (1.2 + e.spawnFx), e.def.color + 'aa', this.t);
      ctx.globalAlpha = Math.max(0.25, 1 - e.spawnFx);
    }
    const elite = e.tags.includes('elite');
    if (elite && !e.isBoss) glow(ctx, x, y, r * 2.4, '#ffd23a', 0.14);
    creature(ctx, e, this.t, target, this.reducedMotion);
    if (e.affixes.length) affixAura(ctx, e, this.reducedMotion ? 0 : this.t);
    ctx.restore();
    this.drawAuraPips(e.auras, x, y, r);
    // Badges: applied elements always; innate ones too when the accessibility option is on.
    this.drawBadges(e.auras, x, y - r - (e.isBoss ? 30 : 24), this.style.badges ? undefined : e.def.innate?.element ?? (e.isBoss ? [...e.auras.keys()][0] : undefined));
    let si = 0;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const s of e.statuses.keys()) {
      const [g, c] = STATUS_GLYPH[s];
      ctx.fillStyle = c; ctx.font = '14px system-ui, sans-serif';
      ctx.fillText(g, x + r + 8, y - r * 0.6 + si * 15); si++;
    }
    if (e.affixes.length && !e.isBoss) {
      ctx.font = '700 12px system-ui, sans-serif';
      e.affixes.forEach((a, i) => {
        const def = Content.affixes.get(a);
        if (!def) return;
        ctx.fillStyle = def.color;
        ctx.fillText(def.glyph, x - (e.affixes.length - 1) * 7 + i * 14, y + r + 20);
      });
    }
    if (!e.isBoss && (e.hp < e.maxHp || e.ward > 0 || elite)) this.drawBar(x, y + r + 8, r * 1.8, e.hp / e.maxHp, elite ? '#ffb347' : '#ff7973', e.maxWard ? e.ward / e.maxWard : 0, elite);
  }

  private drawProjectiles(w: World): void {
    const ctx = this.ctx;
    for (const p of w.projectiles) {
      const color = p.element ? Content.elements.get(p.element)?.color ?? '#fff' : '#fff';
      const lift = p.lob ? Math.sin(Math.PI * (p.lob.t / p.lob.dur)) * 60 : 0;
      const px = p.pos.x, py = p.pos.y - lift;
      if (!p.lob) {
        // Short motion streak behind the bolt.
        const sp = vlen(p.vel) || 1;
        ctx.strokeStyle = color; ctx.globalAlpha = 0.45; ctx.lineWidth = p.radius * 1.2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - p.vel.x / sp * p.radius * 3, py - p.vel.y / sp * p.radius * 3); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      glow(ctx, px, py, p.radius * 3.2, color, 0.55);
      ctx.fillStyle = color;
      circle(ctx, px, py, p.radius); ctx.fill();
      ctx.fillStyle = '#ffffffcc';
      circle(ctx, px, py, p.radius * 0.45); ctx.fill();
      if (p.faction === 'hostile') {
        ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 1.5;
        circle(ctx, px, py, p.radius + 2.5); ctx.stroke();
      }
    }
  }

  // ─── Ball ───────────────────────────────────────────────────────────────────
  private drawBall(w: World, aim: AimState, fx: Fx): void {
    const ctx = this.ctx;
    const b = w.ball;
    const auras = w.ballAuras().filter((a) => Content.elements.get(a.element)?.tier !== 'hidden');
    const main = Content.elements.get(auras[0]?.element ?? b.coreElement)!;
    const second = auras[1] ? Content.elements.get(auras[1].element)! : undefined;
    const speed = vlen(b.vel);
    const trail = this.style.trail;
    const tcolors = trail?.colors.length ? trail.colors : [main.color];
    // A time-based ribbon stays the same length on 60 Hz and high-refresh displays.
    const life = this.reducedMotion ? 0.08 : 0.26;
    for (const p of this.trail) p.life -= this.frameDt;
    this.trail = this.trail.filter((p) => p.life > 0);
    if (speed > 80 && this.frameDt > 0) {
      const i = this.trailSeq++;
      this.trail.push({ x: b.pos.x, y: b.pos.y, c: tcolors[i % tcolors.length], life, i });
      if (!this.reducedMotion && trail?.style && trail.style !== 'ribbon' && Math.random() < 0.6) {
        const col = tcolors[Math.floor(Math.random() * tcolors.length)];
        if (trail.style === 'flame') fx.emit(b.pos.x, b.pos.y, 1, col, 40, { life: 0.5, size: 3, ay: -60, drag: 2 });
        else if (trail.style === 'sparks') fx.emit(b.pos.x, b.pos.y, 1, col, 30, { life: 0.6, size: 2, kind: 3, drag: 3 });
        else if (trail.style === 'void') fx.emit(b.pos.x, b.pos.y, 1, '#c77dff', 20, { life: 0.6, size: 10, kind: 4, drag: 2 });
      }
    }
    if (this.trail.length > 72) this.trail.shift();
    const rainbow = trail?.style === 'rainbow';
    const voidStyle = trail?.style === 'void';
    ctx.save(); ctx.lineCap = 'round';
    ctx.globalCompositeOperation = voidStyle ? 'source-over' : 'lighter';
    for (let i = 1; i < this.trail.length; i++) {
      const p = this.trail[i], prev = this.trail[i - 1], k = p.life / life;
      if (Math.hypot(p.x - prev.x, p.y - prev.y) > 160) continue;
      const col = rainbow ? `hsl(${(p.i * 18 + this.t * 200) % 360},90%,62%)` : voidStyle ? '#120a1c' : p.c;
      ctx.strokeStyle = col; ctx.globalAlpha = k * (voidStyle ? 0.7 : 0.11); ctx.lineWidth = b.radius * 2.1 * k;
      ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.globalAlpha = k * 0.48; ctx.lineWidth = b.radius * 0.78 * k; ctx.stroke();
      ctx.strokeStyle = voidStyle ? '#c77dff' : '#fff1d5'; ctx.globalAlpha = k * 0.6; ctx.lineWidth = 3.4 * k; ctx.stroke();
    }
    ctx.restore();
    // Combo halo grows with the shot combo.
    if (b.combo >= 3) {
      const hc = b.combo >= 20 ? '#ff6ad5' : b.combo >= 10 ? '#ffd23a' : '#a0e4e7';
      glow(ctx, b.pos.x, b.pos.y, b.radius * (3 + Math.min(b.combo, 25) * 0.12), hc, 0.22);
    }
    glow(ctx, b.pos.x, b.pos.y, b.radius * (aim.active ? 5 : 3.5), main.color, aim.active ? 0.45 : 0.3);
    if (aim.active) this.drawAim(w, aim);

    // Body with squash & stretch (area-preserving along velocity) and an impact squash.
    const lightning = b.buffs.has('ballLightning');
    const iron = b.buffs.has('ironstone');
    ctx.save();
    ctx.translate(b.pos.x, b.pos.y);
    if (!this.reducedMotion) {
      if (aim.active) {
        // Wind-up: squash along the pull axis.
        const s = aim.power * 0.16;
        ctx.rotate(Math.atan2(aim.dir.y, aim.dir.x));
        ctx.scale(1 - s, 1 + s * 0.8);
        ctx.rotate(-Math.atan2(aim.dir.y, aim.dir.x));
      } else if (speed > 120) {
        const s = Math.min(0.3, speed / 5200);
        const a = Math.atan2(b.vel.y, b.vel.x);
        ctx.rotate(a);
        ctx.scale(1 + s, 1 / (1 + s));
        ctx.rotate(-a);
      }
    }
    const skin = this.style.skin;
    const sk = skin?.colors ?? [];
    const r = b.radius;
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.42, r * 0.06, 0, 0, r);
    if (skin && skin.id !== 'skin_glass' && sk.length >= 2) {
      const aurora = skin.id === 'skin_aurora';
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.3, aurora ? `hsl(${(this.t * 60) % 360},80%,70%)` : sk[0]);
      g.addColorStop(0.75, aurora ? `hsl(${(this.t * 60 + 120) % 360},70%,45%)` : sk[1]);
      g.addColorStop(1, '#0b1018');
    } else {
      g.addColorStop(0, '#fffbdf');
      g.addColorStop(0.22, main.color);
      g.addColorStop(0.57, iron ? '#687782' : '#151f30');
      g.addColorStop(0.85, second?.color ?? main.color);
      g.addColorStop(1, '#101b2b');
    }
    ctx.fillStyle = g;
    circle(ctx, 0, 0, b.radius);
    ctx.fill();
    // Core swirl: the carried elements visibly churn inside the glass.
    if (!skin || skin.id === 'skin_glass') {
      ctx.save();
      circle(ctx, 0, 0, r - 1); ctx.clip();
      ctx.rotate(this.reducedMotion ? -0.65 : -0.65 + this.t * 1.9);
      ctx.globalAlpha = 0.78;
      ctx.strokeStyle = second?.color ?? main.color;
      ctx.lineWidth = r * 0.24;
      ctx.beginPath();
      ctx.moveTo(-r, r * 0.28);
      ctx.bezierCurveTo(-r * 0.45, -r * 0.75, r * 0.34, r * 0.8, r * 0.9, -r * 0.52);
      ctx.stroke();
      ctx.strokeStyle = '#fff8dd';
      ctx.globalAlpha = 0.72;
      ctx.lineWidth = 1.25;
      ctx.stroke();
      ctx.restore();
    }
    if (skin?.id === 'skin_brass') {
      ctx.strokeStyle = '#ffe2a8'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(0, 0, b.radius * 0.95, b.radius * 0.35, this.t * 0.8, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, 0, b.radius * 0.35, b.radius * 0.95, this.t * 0.8, 0, TAU); ctx.stroke();
    } else if (skin?.id === 'skin_obsidian') {
      ctx.strokeStyle = '#ff6a2b'; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.t * 3);
      ctx.beginPath(); ctx.moveTo(-b.radius * 0.7, -b.radius * 0.2); ctx.lineTo(-b.radius * 0.1, b.radius * 0.1); ctx.lineTo(b.radius * 0.6, -b.radius * 0.3); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (skin?.id === 'skin_crystal') {
      ctx.strokeStyle = '#ffffffaa'; ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + 0.3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * b.radius, Math.sin(a) * b.radius); ctx.stroke(); }
    } else if (skin?.id === 'skin_void') {
      glow(ctx, 0, 0, b.radius * 0.8, '#c77dff', 0.6);
    } else if (skin?.id === 'skin_gilded') {
      glow(ctx, 0, 0, b.radius * 2.2, '#ffd23a', 0.25);
    }
    // Always-visible outline keeps the ball trackable in chaos.
    ctx.strokeStyle = b.invuln > 0 && Math.floor(this.t * 20) % 2 ? '#ff4a4a' : skin?.id === 'skin_gilded' ? '#ffe9a8' : '#fff9e9';
    ctx.lineWidth = 2.2;
    circle(ctx, 0, 0, b.radius);
    ctx.stroke();
    ctx.strokeStyle = '#ffffffdf';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.77, Math.PI * 1.03, Math.PI * 1.54); ctx.stroke();
    ctx.fillStyle = '#ffffffdb';
    circle(ctx, r * 0.44, -r * 0.54, r * 0.09); ctx.fill();
    ctx.restore();
    if (b.shield > 0) {
      ctx.strokeStyle = '#bdf3ff';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6 + 0.4 * Math.min(1, b.shield / 20);
      circle(ctx, b.pos.x, b.pos.y, b.radius + 6); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (lightning) {
      ctx.strokeStyle = '#fff27a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + this.t * 9;
        const rr = b.radius + 5 + (Math.sin(i * 7 + this.t * 20) + 1) * 3;
        i ? ctx.lineTo(b.pos.x + Math.cos(a) * rr, b.pos.y + Math.sin(a) * rr) : ctx.moveTo(b.pos.x + Math.cos(a) * rr, b.pos.y + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.stroke();
    }
    // Orbiting chips for each carried element, drawn as element shapes.
    auras.forEach((a, i) => {
      const def = Content.elements.get(a.element)!;
      const ang = this.t * 2.5 + (i / Math.max(1, auras.length)) * TAU;
      const rr = b.radius + 12;
      ctx.globalAlpha = 0.45 + 0.55 * Math.min(1, a.amount);
      elementShape(ctx, a.element, b.pos.x + Math.cos(ang) * rr, b.pos.y + Math.sin(ang) * rr, 3 + 2 * Math.min(1, a.amount), def.color);
    });
    ctx.globalAlpha = 1;
    if (b.statuses.has('frozen')) {
      ctx.strokeStyle = '#bdf3ff';
      ctx.lineWidth = 3;
      ctx.strokeRect(b.pos.x - b.radius - 3, b.pos.y - b.radius - 3, b.radius * 2 + 6, b.radius * 2 + 6);
    }
  }

  /** Dotted multi-bounce trajectory, ghost ball at first contact, struck-foe push arrow, power ring. */
  private drawAim(w: World, aim: AimState): void {
    const ctx = this.ctx;
    const b = w.ball;
    const pred = predictShot(w, aim.dir, aim.power);
    const ok = w.canLaunch();
    const tier = aim.power >= 0.95 ? 3 : aim.power >= 0.7 ? 2 : aim.power >= 0.4 ? 1 : 0;
    const tierColor = !ok ? '#ff5a5a' : ['#ffffff', '#ffe9b0', '#ffc16b', '#ff8a3d'][tier];
    // Dots: evenly spaced, marching, shrinking and fading with distance; later bounces fainter.
    ctx.fillStyle = tierColor;
    let dist = 0;
    const spacing = 22;
    const offset = this.reducedMotion ? 0 : (this.t * 60) % spacing;
    let total = 0;
    for (let i = 1; i < pred.pts.length; i++) total += Math.hypot(pred.pts[i].x - pred.pts[i - 1].x, pred.pts[i].y - pred.pts[i - 1].y);
    for (let i = 1; i < pred.pts.length; i++) {
      const a = pred.pts[i - 1], c = pred.pts[i];
      const segLen = Math.hypot(c.x - a.x, c.y - a.y);
      const faint = i >= pred.firstSeg;
      for (let d = (spacing - ((dist - offset) % spacing + spacing) % spacing); d < segLen; d += spacing) {
        const k = (dist + d) / Math.max(1, total);
        ctx.globalAlpha = (faint ? 0.4 : 0.9) * (1 - k * 0.6);
        circle(ctx, a.x + (c.x - a.x) * d / segLen, a.y + (c.y - a.y) * d / segLen, 3.4 * (1 - k * 0.55));
        ctx.fill();
      }
      dist += segLen;
    }
    ctx.globalAlpha = 1;
    // Ghost ball where it first connects, plus where the struck foe will be pushed.
    if (pred.contact) {
      ctx.strokeStyle = tierColor; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
      circle(ctx, pred.contact.x, pred.contact.y, b.radius); ctx.stroke();
      ctx.setLineDash([]);
      const tgt = pred.hitEnemy ?? pred.hitObject;
      if (tgt) {
        const dx = tgt.pos.x - pred.contact.x, dy = tgt.pos.y - pred.contact.y, len = Math.hypot(dx, dy) || 1;
        const sx = tgt.pos.x + (dx / len) * (tgt.radius + 6), sy = tgt.pos.y + (dy / len) * (tgt.radius + 6);
        const ex = sx + (dx / len) * 34, ey = sy + (dy / len) * 34;
        ctx.strokeStyle = pred.hitEnemy ? '#ffb38a' : '#a0e4e7'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        const ang = Math.atan2(dy, dx);
        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - Math.cos(ang - 0.5) * 9, ey - Math.sin(ang - 0.5) * 9);
        ctx.moveTo(ex, ey); ctx.lineTo(ex - Math.cos(ang + 0.5) * 9, ey - Math.sin(ang + 0.5) * 9); ctx.stroke();
      }
      if (pred.hitEnemy) {
        const e = pred.hitEnemy;
        ctx.strokeStyle = tierColor; ctx.lineWidth = 2; ctx.globalAlpha = 0.8;
        const rr = e.radius + 10 + (this.reducedMotion ? 0 : Math.sin(this.t * 8) * 2);
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2 + this.t;
          ctx.beginPath(); ctx.arc(e.pos.x, e.pos.y, rr, a, a + 0.8); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        if (this.style.lens) this.drawLens(w, e, aim);
      }
    } else {
      const end = pred.pts[pred.pts.length - 1];
      ctx.strokeStyle = tierColor; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.6;
      circle(ctx, end.x, end.y, 8); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // Three-tier power ring.
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#00000088';
    circle(ctx, b.pos.x, b.pos.y, b.radius + 16); ctx.stroke();
    ctx.strokeStyle = tierColor;
    ctx.beginPath();
    ctx.arc(b.pos.x, b.pos.y, b.radius + 16, -Math.PI / 2, -Math.PI / 2 + TAU * aim.power);
    ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = '#0b1420';
    for (const t of [0.4, 0.7, 0.95]) {
      const a = -Math.PI / 2 + TAU * t;
      ctx.beginPath();
      ctx.moveTo(b.pos.x + Math.cos(a) * (b.radius + 12), b.pos.y + Math.sin(a) * (b.radius + 12));
      ctx.lineTo(b.pos.x + Math.cos(a) * (b.radius + 20), b.pos.y + Math.sin(a) * (b.radius + 20));
      ctx.stroke();
    }
  }

  /** Reagent Lens: name the reaction the aimed shot would cause (or "?" if undiscovered). */
  private drawLens(w: World, e: Enemy, aim: AimState): void {
    const b = w.ball;
    const ph = effectivePhysics(b, w.shell, w.mods);
    const speed = PHYS.launchSpeed * ph.launchMul * aim.power;
    let found: string | undefined;
    const kin = w.engine.evaluate(e, 'kinetic', speed / PHYS.impactRefSpeed, { depth: 0, impactSpeed: speed, faction: 'player' });
    if (kin.reaction) found = kin.reaction.id;
    if (!found) {
      for (const a of w.ballAuras()) {
        const ev = w.engine.evaluate(e, a.element, Math.min(a.amount, 0.55), { depth: 0, impactSpeed: speed, faction: 'player' });
        if (ev.reaction) { found = ev.reaction.id; break; }
      }
    }
    const ctx = this.ctx;
    const known = found && this.style.known.has(found);
    const label = found ? (known ? Content.reactions.get(found)!.name : '? New reaction') : 'No reaction';
    const color = found ? (known ? Content.reactions.get(found)!.color ?? '#ffd23a' : '#c9a6ff') : '#8899aa';
    ctx.font = '700 15px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const ty = e.pos.y - e.radius - 46;
    const wdt = ctx.measureText(label).width + 18;
    ctx.fillStyle = '#0b1420e8';
    ctx.fillRect(e.pos.x - wdt / 2, ty - 12, wdt, 24);
    ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    ctx.strokeRect(e.pos.x - wdt / 2, ty - 12, wdt, 24);
    ctx.fillStyle = color;
    ctx.fillText(label, e.pos.x, ty + 1);
  }

  /** Floating slingshot anchor and rubber band under the finger (screen → world). */
  private drawAimOverlay(_w: World, aim: AimState): void {
    if (!aim.anchor || !aim.cur) return;
    const ctx = this.ctx;
    const a = this.toWorld(aim.anchor.x, aim.anchor.y);
    const c = this.toWorld(aim.cur.x, aim.cur.y);
    const tension = aim.power;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 2;
    circle(ctx, a.x, a.y, 22); ctx.stroke();
    ctx.fillStyle = '#ffffff33'; circle(ctx, a.x, a.y, 6); ctx.fill();
    ctx.strokeStyle = tension > 0.7 ? '#ff9a4a' : tension > 0.4 ? '#ffd27a' : '#e8eef7';
    ctx.lineWidth = 2 + tension * 5;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle; circle(ctx, c.x, c.y, 10 + tension * 6); ctx.globalAlpha = 0.35; ctx.fill();
    ctx.restore();
  }

  // ─── FX ─────────────────────────────────────────────────────────────────────
  private drawReactionCrest(r: Ring, k: number): void {
    if (!r.crest || r.r < 12 || this.reducedMotion) return;
    const c = this.ctx;
    const { kind, color } = r.crest;
    const sides = kind === 'frost' ? 6 : kind === 'crack' ? 5 : 8;
    const turn = (1 - k) * 0.55 - Math.PI / 2;
    c.strokeStyle = color;
    c.globalAlpha = k * 0.65;
    c.lineWidth = 1.6;
    if (kind === 'frost' || kind === 'crack') {
      polygon(c, r.x, r.y, r.r * 0.93, sides, turn);
      c.stroke();
    }
    for (let i = 0; i < sides; i++) {
      const a = turn + TAU * i / sides;
      if (kind === 'splash') {
        circle(c, r.x + Math.cos(a) * r.r * 1.08, r.y + Math.sin(a) * r.r * 1.08, 1.5 + 3 * k);
      } else {
        c.beginPath();
        c.arc(r.x, r.y, r.r * 1.1, a - 0.15 * k, a + 0.19 * k);
      }
      c.stroke();
    }
  }

  private drawFx(fx: Fx): void {
    const ctx = this.ctx;
    // Smoke first (normal blending), then additive light.
    for (const p of fx.particles) {
      if (!p.active || p.kind !== 4) continue;
      const k = p.life / p.max;
      glow(ctx, p.x, p.y, p.size * (2.2 - k * 0.8), p.color, k * 0.32);
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const r of fx.rings) {
      const k = Math.max(0, r.life / r.max);
      ctx.globalAlpha = 1;
      if (!this.reducedMotion && this.quality >= 0.75) glow(ctx, r.x, r.y, Math.max(1, r.r), r.color, k * 0.16);
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = k * 0.18;
      ctx.lineWidth = r.width * 4 * k;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = k;
      ctx.lineWidth = Math.max(0.5, r.width * k); ctx.stroke();
      this.drawReactionCrest(r, k);
    }
    for (const p of fx.particles) {
      if (!p.active || p.kind === 4) continue;
      const k = p.life / p.max;
      ctx.globalAlpha = k;
      if (p.kind === 1) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * 0.7;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
        ctx.strokeStyle = '#fff5db';
        ctx.globalAlpha = k * k * 0.65;
        ctx.lineWidth *= 0.45;
        ctx.stroke();
      } else if (p.kind === 2) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx) + p.life * 3);
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.moveTo(p.size, 0); ctx.lineTo(0, p.size * 0.4); ctx.lineTo(-p.size, 0); ctx.lineTo(0, -p.size * 0.4); ctx.closePath(); ctx.fill(); ctx.restore();
      } else if (p.kind === 3) {
        glow(ctx, p.x, p.y, p.size * 4, p.color, k * 0.9);
        ctx.fillStyle = '#ffffff';
        circle(ctx, p.x, p.y, p.size * 0.5); ctx.fill();
      } else {
        ctx.fillStyle = p.color;
        circle(ctx, p.x, p.y, p.size * (0.3 + 0.7 * k));
        ctx.fill();
      }
    }
    for (const a of fx.arcs) {
      ctx.strokeStyle = a.color;
      ctx.globalAlpha = a.life / 0.25;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(a.from.x, a.from.y);
      const segs = 7;
      for (let i = 1; i < segs; i++) {
        const k = i / segs;
        const j = Math.sin(a.seed + i * 12.9898 + this.t * 60) * 14;
        const dx = a.to.x - a.from.x;
        const dy = a.to.y - a.from.y;
        const len = Math.hypot(dx, dy) || 1;
        ctx.lineTo(a.from.x + dx * k + (-dy / len) * j, a.from.y + dy * k + (dx / len) * j);
      }
      ctx.lineTo(a.to.x, a.to.y);
      ctx.globalAlpha *= 0.22; ctx.lineWidth = 10; ctx.stroke();
      ctx.globalAlpha = a.life / 0.25; ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = '#f3ffff'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of fx.texts) {
      const age = t.max - t.life;
      // Pop: 0 → 1.35 → 1 over ~140 ms (ease-out-back feel), fade in the last 40%.
      const pop = this.reducedMotion ? 1 : age < 0.07 ? (age / 0.07) * 1.35 : age < 0.14 ? 1.35 - ((age - 0.07) / 0.07) * 0.35 : 1;
      ctx.globalAlpha = Math.min(1, t.life / (t.max * 0.4));
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.scale(pop, pop);
      if (t.style === 'reaction') {
        ctx.font = `italic 700 ${t.size}px Georgia, 'Times New Roman', serif`;
        const wdt = ctx.measureText(t.text).width;
        ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(4,8,14,0.85)'; ctx.lineJoin = 'round';
        ctx.strokeText(t.text, 0, 0);
        const g = ctx.createLinearGradient(-wdt / 2, 0, wdt / 2, 0);
        g.addColorStop(0, t.color); g.addColorStop(1, t.color2 ?? t.color);
        ctx.fillStyle = g;
        ctx.fillText(t.text, 0, 0);
        if (t.sub) {
          ctx.font = '800 10px system-ui, sans-serif';
          ctx.lineWidth = 3; ctx.strokeText(t.sub, 0, t.size * 0.75);
          ctx.fillStyle = '#ffe9b0'; ctx.fillText(t.sub, 0, t.size * 0.75);
        }
      } else if (t.style === 'crit') {
        ctx.font = `900 ${t.size}px system-ui, sans-serif`;
        ctx.fillStyle = '#ff6a2b55';
        for (let i = 0; i < 8; i++) {
          ctx.rotate(Math.PI / 4);
          ctx.beginPath(); ctx.moveTo(0, -t.size * 0.2); ctx.lineTo(t.size * 0.9, 0); ctx.lineTo(0, t.size * 0.2); ctx.fill();
        }
        ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(40,10,0,0.9)';
        ctx.strokeText(t.text + '!', 0, 0);
        ctx.fillStyle = t.color; ctx.fillText(t.text + '!', 0, 0);
      } else {
        ctx.font = `800 ${t.size}px system-ui, sans-serif`;
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeText(t.text, 0, 0);
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, 0, 0);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}

/** Distinct silhouette per element so meaning never relies on colour alone. */
export function elementShape(c: CanvasRenderingContext2D, el: string, x: number, y: number, r: number, color: string): void {
  c.save();
  c.translate(x, y);
  c.fillStyle = color;
  c.strokeStyle = color;
  c.lineWidth = Math.max(1, r * 0.35);
  c.lineCap = 'round';
  c.beginPath();
  switch (el) {
    case 'fire': c.moveTo(0, -r * 1.2); c.quadraticCurveTo(r, 0, 0, r); c.quadraticCurveTo(-r, 0, 0, -r * 1.2); c.fill(); break;
    case 'water': c.moveTo(0, -r * 1.1); c.quadraticCurveTo(r * 1.1, r * 0.3, 0, r); c.quadraticCurveTo(-r * 1.1, r * 0.3, 0, -r * 1.1); c.fill(); break;
    case 'ice': for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; c.moveTo(Math.cos(a) * r, Math.sin(a) * r); c.lineTo(-Math.cos(a) * r, -Math.sin(a) * r); } c.stroke(); break;
    case 'lightning': c.moveTo(r * 0.3, -r * 1.1); c.lineTo(-r * 0.5, r * 0.1); c.lineTo(r * 0.1, r * 0.1); c.lineTo(-r * 0.3, r * 1.1); c.lineTo(r * 0.6, -r * 0.2); c.lineTo(0, -r * 0.2); c.closePath(); c.fill(); break;
    case 'metal': for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; i ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.stroke(); break;
    case 'earth': c.rect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6); c.fill(); break;
    case 'wind': c.arc(0, 0, r * 0.8, 0, Math.PI * 1.5); c.stroke(); break;
    case 'poison': for (let i = 0; i < 3; i++) { const a = i * TAU / 3 - Math.PI / 2; c.moveTo(Math.cos(a) * r * 0.55 + r * 0.4, Math.sin(a) * r * 0.55); c.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.4, 0, TAU); } c.fill(); break;
    case 'arcane': for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, rr = i % 2 ? r * 0.4 : r * 1.1; i ? c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); c.fill(); break;
    default: c.arc(0, 0, r * 0.8, 0, TAU); c.fill();
  }
  c.restore();
}
