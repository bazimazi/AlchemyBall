import { Content } from '../content';
import type { RegionDef, StatusId } from '../content/types';
import { vlen, type Vec2 } from '../core/vec';
import { PHYS } from '../sim/ballPhysics';
import type { ArenaObject, Enemy, Zone } from '../sim/entities';
import type { World } from '../sim/world';
import type { Fx } from './fx';

export interface AimState {
  active: boolean;
  dir: Vec2;
  power: number;
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
  private trail: { x: number; y: number; c: string }[] = [];
  private t = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
  }

  resize(quality: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, quality >= 1 ? 2 : 1.25);
    this.dpr = dpr;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    // Reserve room for the HUD at the top and bottom.
    const top = 76;
    const bottom = 56;
    const s = Math.min(w / PHYS.arenaW, (h - top - bottom) / PHYS.arenaH);
    this.scale = s;
    this.ox = (w - PHYS.arenaW * s) / 2;
    this.oy = top + (h - top - bottom - PHYS.arenaH * s) / 2;
  }

  clear(): void {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.fillStyle = '#0d0f14';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  toWorld(sx: number, sy: number): Vec2 {
    return { x: (sx - this.ox) / this.scale, y: (sy - this.oy) / this.scale };
  }

  draw(w: World, fx: Fx, region: RegionDef | undefined, aim: AimState, dt: number): void {
    this.t += dt;
    const ctx = this.ctx;
    const pal = region?.palette ?? { bg: '#0d0f14', floor: '#171c22', wall: '#3a4452', accent: '#ff8a3d' };
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const sx = fx.shake ? (Math.random() - 0.5) * fx.shake : 0;
    const sy = fx.shake ? (Math.random() - 0.5) * fx.shake : 0;
    ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, this.dpr * (this.ox + sx), this.dpr * (this.oy + sy));

    this.drawFloor(pal.floor);
    for (const z of w.zones) this.drawZone(z);
    this.drawWalls(w, pal.wall);
    for (const t of w.telegraphs) {
      const k = t.t / t.dur;
      ctx.strokeStyle = t.color;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(t.pos.x, t.pos.y, t.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.25 + 0.25 * k;
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.arc(t.pos.x, t.pos.y, t.radius * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    for (const p of w.projectiles) {
      if (!p.lob) continue;
      const k = p.lob.t / p.lob.dur;
      ctx.strokeStyle = '#ff5a3a';
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.lob.target.x, p.lob.target.y, p.lob.zoneRadius * (0.4 + 0.6 * k), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const o of w.objects) this.drawObject(o);
    for (const e of w.enemies) this.drawEnemy(e);
    for (const p of w.projectiles) {
      const color = p.element ? Content.elements.get(p.element)?.color ?? '#fff' : '#fff';
      const lift = p.lob ? Math.sin(Math.PI * (p.lob.t / p.lob.dur)) * 60 : 0;
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y - lift, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    this.drawBall(w, aim);
    this.drawFx(fx);
    if (fx.flash > 0) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.globalAlpha = Math.min(0.35, fx.flash);
      ctx.fillStyle = fx.flashColor;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.globalAlpha = 1;
    }
  }

  private drawFloor(floor: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = floor;
    ctx.beginPath();
    const c = 40;
    const W = PHYS.arenaW;
    const H = PHYS.arenaH;
    ctx.moveTo(c, 0);
    ctx.lineTo(W - c, 0);
    ctx.lineTo(W, c);
    ctx.lineTo(W, H - c);
    ctx.lineTo(W - c, H);
    ctx.lineTo(c, H);
    ctx.lineTo(0, H - c);
    ctx.lineTo(0, c);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 60; x < W; x += 60) (ctx.moveTo(x, 0), ctx.lineTo(x, H));
    for (let y = 60; y < H; y += 60) (ctx.moveTo(0, y), ctx.lineTo(W, y));
    ctx.stroke();
  }

  private drawWalls(w: World, wallColor: string): void {
    const ctx = this.ctx;
    ctx.lineCap = 'round';
    for (const wl of w.walls) {
      ctx.strokeStyle = wl.material === 'bumper' ? '#ff4fa3' : wl.material === 'metal' ? '#b8c2cc' : this.highContrast ? '#ffffff' : wallColor;
      ctx.lineWidth = wl.material === 'stone' ? 8 : 10;
      ctx.beginPath();
      ctx.moveTo(wl.a.x, wl.a.y);
      ctx.lineTo(wl.b.x, wl.b.y);
      ctx.stroke();
    }
  }

  private drawZone(z: Zone): void {
    const ctx = this.ctx;
    const fade = z.ttl === Infinity ? 1 : Math.min(1, z.ttl / 0.8, (z.maxTtl - z.ttl) / 0.25 + 0.2);
    const own = z.def.element ? Math.min(1, (z.auras.get(z.def.element) ?? 0) + 0.3) : 1;
    ctx.globalAlpha = fade * own;
    const hostile = z.faction === 'hostile';
    switch (z.def.look) {
      case 'pool': {
        const g = ctx.createRadialGradient(z.pos.x, z.pos.y, z.radius * 0.2, z.pos.x, z.pos.y, z.radius);
        g.addColorStop(0, z.def.color + 'cc');
        g.addColorStop(1, z.def.color + '55');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(z.pos.x, z.pos.y, z.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = z.def.color;
        ctx.lineWidth = 2;
        const rr = (this.t * 20 + z.uid * 13) % z.radius;
        ctx.globalAlpha = fade * 0.4 * (1 - rr / z.radius);
        ctx.beginPath();
        ctx.arc(z.pos.x, z.pos.y, rr, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'cloud': {
        ctx.fillStyle = z.def.color;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + this.t * 0.3 + z.uid;
          const r = z.radius * 0.55;
          ctx.globalAlpha = fade * 0.18;
          ctx.beginPath();
          ctx.arc(z.pos.x + Math.cos(a) * r * 0.5, z.pos.y + Math.sin(a) * r * 0.5, r, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'patch': {
        ctx.fillStyle = z.def.color;
        ctx.globalAlpha = fade * 0.45;
        ctx.beginPath();
        for (let i = 0; i <= 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          const r = z.radius * (0.85 + 0.15 * Math.sin(i * 2.3 + z.uid));
          const x = z.pos.x + Math.cos(a) * r;
          const y = z.pos.y + Math.sin(a) * r;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.fill();
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
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(z.pos.x, z.pos.y, z.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;
  }

  private drawObject(o: ArenaObject): void {
    const ctx = this.ctx;
    const { x, y } = o.pos;
    const r = o.radius;
    const amt = o.def.element ? o.auras.get(o.def.element) ?? 0 : 0;
    const col = o.def.color;
    ctx.save();
    if (o.def.element && amt > 0.2) {
      ctx.shadowColor = col;
      ctx.shadowBlur = 14 * Math.min(1, amt);
    }
    ctx.fillStyle = o.hitFlash > 0 ? '#ffffff' : '#20262e';
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    switch (o.def.look) {
      case 'bumper':
        ctx.fillStyle = o.hitFlash > 0 ? '#ffffff' : '#3a1030';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 5;
        ctx.stroke();
        break;
      case 'crate':
      case 'barrel':
        ctx.fillStyle = o.hitFlash > 0 ? '#ffffff' : o.def.look === 'crate' ? '#5a3f22' : '#2f4a14';
        ctx.fillRect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
        ctx.strokeRect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
        break;
      case 'crystal':
        ctx.beginPath();
        ctx.moveTo(x, y - r * 1.15);
        ctx.lineTo(x + r * 0.8, y);
        ctx.lineTo(x, y + r * 1.15);
        ctx.lineTo(x - r * 0.8, y);
        ctx.closePath();
        ctx.fillStyle = o.hitFlash > 0 ? '#ffffff' : col + '55';
        ctx.fill();
        ctx.stroke();
        break;
      default:
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }
    ctx.shadowBlur = 0;
    const el = o.def.element ? Content.elements.get(o.def.element) : undefined;
    // Glyph shows what the object gives; dim when depleted.
    ctx.globalAlpha = el ? 0.35 + 0.65 * Math.min(1, amt) : 1;
    ctx.fillStyle = col;
    ctx.font = `${Math.round(r * 1.1)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const glyph = el?.glyph ?? (o.def.look === 'bumper' ? '' : o.def.look === 'crate' ? '▦' : '');
    if (glyph) ctx.fillText(glyph, x, y + 1);
    ctx.globalAlpha = 1;
    // Transient auras painted on objects (e.g. fire on a crate).
    this.drawAuraPips(o.auras, x, y, r, o.def.element);
    if (o.def.hp !== undefined && o.hp < o.maxHp) this.drawBar(x, y + r + 8, r * 1.6, o.hp / o.maxHp, '#ddd');
    ctx.restore();
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

  private drawBar(cx: number, y: number, w: number, frac: number, color: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(cx - w / 2, y, w, 5);
    ctx.fillStyle = color;
    ctx.fillRect(cx - w / 2, y, w * Math.max(0, frac), 5);
  }

  private drawEnemy(e: Enemy): void {
    const ctx = this.ctx;
    const { x, y } = e.pos;
    const r = e.radius;
    if (e.spawnFx > 0) {
      ctx.strokeStyle = e.def.color;
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(x, y, r * (1 + e.spawnFx), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.3;
    }
    const frozen = e.statuses.has('frozen');
    const petrified = e.statuses.has('petrified');
    const flying = e.tags.includes('flying');
    if (flying) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(x, y + r + 10, r * 0.8, r * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const bob = flying ? Math.sin(this.t * 4 + e.uid) * 3 : 0;
    ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : frozen ? '#bdf3ff' : petrified ? '#8a6a4a' : e.def.color;
    ctx.beginPath();
    if (e.def.ai === 'bloat') {
      const pulse = 1 + Math.sin(this.t * 3 + e.uid) * 0.05;
      ctx.arc(x, y + bob, r * pulse, 0, Math.PI * 2);
    } else if (e.tags.includes('armored')) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        i ? ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.closePath();
    } else ctx.arc(x, y + bob, r, 0, Math.PI * 2);
    ctx.fill();
    if (e.isBoss || e.tags.includes('elite')) {
      ctx.strokeStyle = e.isBoss ? '#ffd23a' : '#ff6ad5';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    if (e.tags.includes('armored') && !e.statuses.has('exposed') && e.armor > 0) {
      ctx.strokeStyle = '#dfe7ef';
      ctx.lineWidth = 2 + e.armor * 3;
      ctx.stroke();
    }
    // Eyes look at nothing in particular — cheap personality.
    if (e.def.ai !== 'dummy') {
      ctx.fillStyle = '#0d0f14';
      const ey = y + bob - r * 0.15;
      ctx.beginPath();
      ctx.arc(x - r * 0.3, ey, r * 0.13, 0, Math.PI * 2);
      ctx.arc(x + r * 0.3, ey, r * 0.13, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = '#6b5530';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
      ctx.moveTo(x + r * 0.25, y);
      ctx.arc(x, y, r * 0.25, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (frozen) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - r * 0.9, y - r * 0.9, r * 1.8, r * 1.8);
    }
    ctx.globalAlpha = 1;
    this.drawAuraPips(e.auras, x, y + bob, r);
    // Status glyphs.
    let si = 0;
    for (const s of e.statuses.keys()) {
      const [g, c] = STATUS_GLYPH[s];
      ctx.fillStyle = c;
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(g, x - 12 + si * 14, y - r - 14);
      si++;
    }
    if (!e.isBoss && e.hp < e.maxHp) this.drawBar(x, y + r + 6, r * 1.8, e.hp / e.maxHp, '#ff5a5a');
  }

  private drawBall(w: World, aim: AimState): void {
    const ctx = this.ctx;
    const b = w.ball;
    const auras = w.ballAuras().filter((a) => Content.elements.get(a.element)?.tier !== 'hidden');
    const main = Content.elements.get(auras[0]?.element ?? b.coreElement)!;
    const speed = vlen(b.vel);
    // Trail colored by the ball's dominant element.
    if (speed > 80) this.trail.push({ x: b.pos.x, y: b.pos.y, c: main.color });
    if (this.trail.length > 18 || (speed <= 80 && this.trail.length)) this.trail.shift();
    for (let i = 0; i < this.trail.length; i++) {
      const p = this.trail[i];
      ctx.globalAlpha = (i / this.trail.length) * 0.45;
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, b.radius * (0.4 + (0.6 * i) / this.trail.length), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (aim.active) this.drawAim(w, aim);
    // Body.
    const lightning = b.buffs.has('ballLightning');
    const iron = b.buffs.has('ironstone');
    ctx.shadowColor = main.color;
    ctx.shadowBlur = 18;
    const g = ctx.createRadialGradient(b.pos.x - 5, b.pos.y - 5, 2, b.pos.x, b.pos.y, b.radius);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, main.color);
    g.addColorStop(1, iron ? '#4a4e55' : auras[1] ? Content.elements.get(auras[1].element)!.color : main.color);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Always-visible outline keeps the ball trackable in chaos.
    ctx.strokeStyle = b.invuln > 0 && Math.floor(this.t * 20) % 2 ? '#ff4a4a' : '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    if (b.shield > 0) {
      ctx.strokeStyle = '#bdf3ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.pos.x, b.pos.y, b.radius + 6, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (lightning) {
      ctx.strokeStyle = '#fff27a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + this.t * 9;
        const rr = b.radius + 5 + Math.random() * 6;
        i ? ctx.lineTo(b.pos.x + Math.cos(a) * rr, b.pos.y + Math.sin(a) * rr) : ctx.moveTo(b.pos.x + Math.cos(a) * rr, b.pos.y + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.stroke();
    }
    // Orbiting chips for each carried element.
    auras.forEach((a, i) => {
      const def = Content.elements.get(a.element)!;
      const ang = this.t * 2.5 + (i / Math.max(1, auras.length)) * Math.PI * 2;
      const rr = b.radius + 11;
      ctx.fillStyle = def.color;
      ctx.globalAlpha = 0.4 + 0.6 * Math.min(1, a.amount);
      ctx.beginPath();
      ctx.arc(b.pos.x + Math.cos(ang) * rr, b.pos.y + Math.sin(ang) * rr, 3 + 2 * Math.min(1, a.amount), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    if (b.statuses.has('frozen')) {
      ctx.strokeStyle = '#bdf3ff';
      ctx.lineWidth = 3;
      ctx.strokeRect(b.pos.x - b.radius - 3, b.pos.y - b.radius - 3, b.radius * 2 + 6, b.radius * 2 + 6);
    }
  }

  /** Dotted trajectory with one predicted wall bounce. */
  private drawAim(w: World, aim: AimState): void {
    const ctx = this.ctx;
    const b = w.ball;
    let p = { ...b.pos };
    let d = { ...aim.dir };
    let remaining = 180 + 420 * aim.power;
    const pts: Vec2[] = [{ ...p }];
    for (let bounce = 0; bounce < 2 && remaining > 0; bounce++) {
      let best = remaining;
      let hitN: Vec2 | null = null;
      for (const wl of w.walls) {
        // Ray vs segment offset by ball radius (approximate by testing segment directly).
        const ex = wl.b.x - wl.a.x;
        const ey = wl.b.y - wl.a.y;
        const den = d.x * ey - d.y * ex;
        if (Math.abs(den) < 1e-6) continue;
        const t = ((wl.a.x - p.x) * ey - (wl.a.y - p.y) * ex) / den;
        const u = ((wl.a.x - p.x) * d.y - (wl.a.y - p.y) * d.x) / den;
        if (t > 1 && u >= 0 && u <= 1 && t < best) {
          best = t;
          const len = Math.hypot(ex, ey);
          hitN = { x: -ey / len, y: ex / len };
        }
      }
      const step = hitN ? Math.max(0, best - b.radius) : best;
      p = { x: p.x + d.x * step, y: p.y + d.y * step };
      pts.push({ ...p });
      remaining -= step;
      if (!hitN) break;
      const dn = d.x * hitN.x + d.y * hitN.y;
      d = { x: d.x - 2 * dn * hitN.x, y: d.y - 2 * dn * hitN.y };
    }
    ctx.strokeStyle = w.canLaunch() ? '#ffffff' : '#ff5a5a';
    ctx.globalAlpha = 0.75;
    ctx.setLineDash([3, 9]);
    ctx.lineWidth = 3;
    ctx.beginPath();
    pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.stroke();
    ctx.setLineDash([]);
    // Power ring.
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(b.pos.x, b.pos.y, b.radius + 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * aim.power);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawFx(fx: Fx): void {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';
    for (const r of fx.rings) {
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = Math.max(0, r.life / r.max);
      ctx.lineWidth = r.width;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const p of fx.particles) {
      if (!p.active) continue;
      ctx.globalAlpha = p.life / p.max;
      if (p.kind === 1) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * 0.7;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
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
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of fx.texts) {
      ctx.globalAlpha = Math.min(1, t.life / (t.max * 0.4));
      ctx.font = `700 ${t.size}px system-ui, sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }
}
