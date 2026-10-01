import { Content } from '../content';
import type { RegionDef, StatusId } from '../content/types';
import { vlen, type Vec2 } from '../core/vec';
import { PHYS } from '../sim/ballPhysics';
import type { ArenaObject, Enemy, Zone } from '../sim/entities';
import type { World } from '../sim/world';
import type { Fx } from './fx';
import { circle, creature, glow, reagent, sigil } from './art';

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
  private trail: { x: number; y: number; c: string; life: number }[] = [];
  private floorCache: HTMLCanvasElement | null = null;
  private floorKey = '';
  private world: World | null = null;
  private reducedMotion = false;
  private frameDt = 0;
  private quality = 1;
  private t = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
  }

  resize(quality: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, quality >= 1 ? 2 : 1.25);
    this.dpr = dpr;
    this.quality = quality;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    // Reserve room for the HUD at the top and bottom.
    const css = getComputedStyle(document.documentElement);
    const top = 88 + (parseFloat(css.getPropertyValue('--safe-top')) || 0);
    const bottom = 64 + (parseFloat(css.getPropertyValue('--safe-bottom')) || 0);
    const s = Math.max(0.05, Math.min((w - 28) / PHYS.arenaW, (h - top - bottom) / PHYS.arenaH));
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
    this.reducedMotion = fx.reducedMotion;
    this.frameDt = dt;
    if (!this.reducedMotion) this.t += dt;
    if (this.world !== w) { this.trail = []; this.world = w; }
    const ctx = this.ctx;
    const pal = region?.palette ?? { bg: '#0d0f14', floor: '#171c22', wall: '#3a4452', accent: '#ff8a3d' };
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const shake = dt > 0 && !this.reducedMotion ? fx.shake : 0;
    const sx = shake ? (Math.random() - 0.5) * shake : 0;
    const sy = shake ? (Math.random() - 0.5) * shake : 0;
    ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, this.dpr * (this.ox + sx), this.dpr * (this.oy + sy));

    this.drawFloor(pal.floor, pal.accent);
    this.drawAtmosphere(pal.accent);
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
    for (const e of w.enemies) this.drawEnemy(e, w.ball.pos);
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
    if (aim.active) {
      ctx.fillStyle = '#050c1838';
      ctx.fillRect(0, 0, PHYS.arenaW, PHYS.arenaH);
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

  /** Static engraved stone is cached; animated illumination is a separate pass. */
  private drawFloor(floor: string, accent: string): void {
    const W = PHYS.arenaW, H = PHYS.arenaH;
    const key = `${floor}|${accent}|${this.highContrast}`;
    if (!this.floorCache || key !== this.floorKey) {
      this.floorKey = key;
      const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
      const c = canvas.getContext('2d')!;
      c.beginPath(); c.moveTo(40, 0); c.lineTo(W - 40, 0); c.lineTo(W, 40); c.lineTo(W, H - 40);
      c.lineTo(W - 40, H); c.lineTo(40, H); c.lineTo(0, H - 40); c.lineTo(0, 40); c.closePath(); c.clip();
      c.fillStyle = floor; c.fillRect(0, 0, W, H);
      // Staggered slabs, with deterministic mineral flecks and worn edges.
      for (let row = 0; row < 15; row++) for (let col = -1; col < 9; col++) {
        const x = col * 96 + row % 2 * 48, y = row * 80;
        const k = Math.sin(row * 127 + col * 311) * 0.5 + 0.5;
        c.fillStyle = `rgba(109,145,150,${0.025 + k * 0.035})`;
        c.fillRect(x + 2, y + 2, 92, 76);
        c.strokeStyle = '#030b1260'; c.strokeRect(x + 1, y + 1, 94, 78);
        c.strokeStyle = '#92c2c00b'; c.beginPath(); c.moveTo(x + 3, y + 3); c.lineTo(x + 92, y + 3); c.stroke();
        if (k > 0.65) { c.strokeStyle = '#030b1240'; c.beginPath(); c.moveTo(x + 16, y + 2); c.lineTo(x + 24, y + 21); c.lineTo(x + 19, y + 33); c.stroke(); }
      }
      const light = c.createRadialGradient(W / 2, H * 0.4, 60, W / 2, H / 2, H * 0.65);
      light.addColorStop(0, '#47848018'); light.addColorStop(0.65, '#04111910'); light.addColorStop(1, '#00050cbb');
      c.fillStyle = light; c.fillRect(0, 0, W, H);
      c.strokeStyle = '#8ca58e26'; c.lineWidth = 1; c.strokeRect(23, 23, W - 46, H - 46); c.strokeRect(29, 29, W - 58, H - 58);
      sigil(c, W / 2, H / 2, 213, '#a1bca51c');
      sigil(c, W / 2, H / 2, 153, '#d3b67a16', Math.PI / 6);
      for (const y of [90, H - 90]) {
        sigil(c, W / 2, y, 38, accent + '33');
        c.strokeStyle = accent + '25'; c.beginPath(); c.moveTo(80, y); c.lineTo(W / 2 - 56, y); c.moveTo(W / 2 + 56, y); c.lineTo(W - 80, y); c.stroke();
      }
      for (let i = 0; i < 900; i++) {
        const x = ((Math.sin(i * 127.1) * 43758.5453) % 1 + 1) % 1 * W;
        const y = ((Math.sin(i * 311.7) * 96453.912) % 1 + 1) % 1 * H;
        c.fillStyle = i % 2 ? '#d7dfb209' : '#00000024'; c.fillRect(x, y, 1.5, 1.5);
      }
      this.floorCache = canvas;
    }
    const ctx = this.ctx;
    ctx.save(); ctx.shadowColor = '#000'; ctx.shadowBlur = 35; ctx.shadowOffsetY = 12;
    ctx.drawImage(this.floorCache, 0, 0); ctx.restore();
  }

  private drawAtmosphere(accent: string): void {
    const c = this.ctx;
    glow(c, 80, 100, 230, '#399fa5', 0.08);
    glow(c, PHYS.arenaW - 70, PHYS.arenaH - 120, 260, accent, 0.07);
    if (this.reducedMotion) return;
    c.save();
    for (let i = 0; i < 22 * this.quality; i++) {
      const x = 35 + ((i * 173.3 + Math.sin(this.t * 0.2 + i) * 20) % 650 + 650) % 650;
      const y = (i * 97.1 - this.t * (6 + i % 4) + 11200) % 1080 + 20;
      c.globalAlpha = 0.12 + Math.max(0, Math.sin(this.t + i * 4)) * 0.26;
      c.fillStyle = i % 3 ? '#a4d8ca' : '#ffba79'; circle(c, x, y, i % 3 === 0 ? 1.8 : 1); c.fill();
    }
    c.restore();
  }

  private drawWalls(w: World, wallColor: string): void {
    const c = this.ctx;
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    for (const wl of w.walls) {
      const color = wl.material === 'bumper' ? '#ff62b3' : wl.material === 'metal' ? '#9bced7' : this.highContrast ? '#ffffff' : wallColor;
      c.beginPath(); c.moveTo(wl.a.x, wl.a.y); c.lineTo(wl.b.x, wl.b.y);
      c.strokeStyle = '#02080c'; c.lineWidth = 19; c.stroke();
      c.strokeStyle = color; c.lineWidth = 12; c.stroke();
      c.strokeStyle = wl.material === 'stone' ? '#94b3ad55' : '#ffffffaa'; c.lineWidth = 2; c.stroke();
      const len = Math.hypot(wl.b.x - wl.a.x, wl.b.y - wl.a.y);
      for (let d = 0; d <= len; d += 68) {
        const x = wl.a.x + (wl.b.x - wl.a.x) * d / len, y = wl.a.y + (wl.b.y - wl.a.y) * d / len;
        c.fillStyle = '#1c3038'; circle(c, x, y, 5); c.fill();
        c.fillStyle = wl.material === 'stone' ? '#c4b17a' : color; circle(c, x, y, 1.8); c.fill();
      }
    }
    c.restore();
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
        ctx.strokeStyle = z.def.color + '88'; ctx.lineWidth = 2; ctx.stroke();
        ctx.save(); ctx.clip();
        // Caustic ribbons and bubbles give liquid a surface without obscuring actors.
        for (let i = 0; i < 5; i++) {
          const phase = this.t * 0.7 + i * 2 + z.uid;
          ctx.globalAlpha = fade * own * 0.22;
          ctx.strokeStyle = '#cff6e9'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.ellipse(z.pos.x + Math.sin(phase) * z.radius * 0.18, z.pos.y + (i - 2) * z.radius * 0.3, z.radius * 0.8, 5 + Math.sin(phase) * 3, -0.15, 0, Math.PI * 2); ctx.stroke();
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
        ctx.arc(z.pos.x, z.pos.y, rr, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'cloud': {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + this.t * 0.3 + z.uid;
          const r = z.radius * 0.55;
          ctx.globalAlpha = fade * own;
          glow(ctx, z.pos.x + Math.cos(a) * r * 0.7, z.pos.y + Math.sin(a) * r * 0.6, r * 1.25, z.def.color, 0.25);
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
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = z.def.color; ctx.lineWidth = 1.5; ctx.stroke();
        if (z.def.element === 'ice') {
          ctx.strokeStyle = '#e6fbff'; ctx.globalAlpha = fade * 0.55;
          for (let i = 0; i < 6; i++) {
            const a = i * Math.PI / 3 + z.uid;
            ctx.beginPath(); ctx.moveTo(z.pos.x, z.pos.y); ctx.lineTo(z.pos.x + Math.cos(a) * z.radius * 0.8, z.pos.y + Math.sin(a) * z.radius * 0.8); ctx.stroke();
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
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(z.pos.x, z.pos.y, z.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
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

  private drawBar(cx: number, y: number, w: number, frac: number, color: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(cx - w / 2, y, w, 5);
    ctx.fillStyle = color;
    ctx.fillRect(cx - w / 2, y, w * Math.max(0, frac), 5);
  }

  private drawEnemy(e: Enemy, target: Vec2): void {
    const ctx = this.ctx, { x, y } = e.pos, r = e.radius;
    ctx.save();
    if (e.spawnFx > 0) {
      sigil(ctx, x, y, r * (1.2 + e.spawnFx), e.def.color + 'aa', this.t);
      ctx.globalAlpha = Math.max(0.25, 1 - e.spawnFx);
    }
    creature(ctx, e, this.t, target, this.reducedMotion);
    ctx.restore();
    this.drawAuraPips(e.auras, x, y, r);
    let si = 0;
    for (const s of e.statuses.keys()) {
      const [g, c] = STATUS_GLYPH[s];
      ctx.fillStyle = c; ctx.font = '14px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(g, x - 12 + si * 14, y - r - 14); si++;
    }
    if (!e.isBoss && e.hp < e.maxHp) this.drawBar(x, y + r + 8, r * 1.8, e.hp / e.maxHp, '#ff7973');
  }

  private drawBall(w: World, aim: AimState): void {
    const ctx = this.ctx;
    const b = w.ball;
    const auras = w.ballAuras().filter((a) => Content.elements.get(a.element)?.tier !== 'hidden');
    const main = Content.elements.get(auras[0]?.element ?? b.coreElement)!;
    const speed = vlen(b.vel);
    // A time-based ribbon stays the same length on 60 Hz and high-refresh displays.
    for (const p of this.trail) p.life -= this.frameDt;
    this.trail = this.trail.filter((p) => p.life > 0);
    if (speed > 80 && this.frameDt > 0) this.trail.push({ x: b.pos.x, y: b.pos.y, c: main.color, life: this.reducedMotion ? 0.08 : 0.24 });
    if (this.trail.length > 72) this.trail.shift();
    ctx.save(); ctx.lineCap = 'round'; ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i < this.trail.length; i++) {
      const p = this.trail[i], prev = this.trail[i - 1], k = p.life / 0.24;
      if (Math.hypot(p.x - prev.x, p.y - prev.y) > 160) continue;
      ctx.strokeStyle = p.c; ctx.globalAlpha = k * 0.26; ctx.lineWidth = b.radius * 1.7 * k;
      ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = k * 0.4; ctx.lineWidth = 3 * k; ctx.stroke();
    }
    ctx.restore();
    glow(ctx, b.pos.x, b.pos.y, b.radius * (aim.active ? 5 : 3.5), main.color, aim.active ? 0.45 : 0.3);
    if (aim.active) this.drawAim(w, aim);
    // Body.
    const lightning = b.buffs.has('ballLightning');
    const iron = b.buffs.has('ironstone');
    ctx.shadowColor = main.color;
    ctx.shadowBlur = 18;
    const g = ctx.createRadialGradient(b.pos.x - 5, b.pos.y - 5, 2, b.pos.x, b.pos.y, b.radius);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, main.color);
    g.addColorStop(0.72, iron ? '#687782' : auras[1] ? Content.elements.get(auras[1].element)!.color : main.color);
    g.addColorStop(1, '#172536');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Always-visible outline keeps the ball trackable in chaos.
    ctx.strokeStyle = b.invuln > 0 && Math.floor(this.t * 20) % 2 ? '#ff4a4a' : '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = '#ffffffaa';
    ctx.beginPath(); ctx.ellipse(b.pos.x - 4, b.pos.y - 6, 6, 3, -0.5, 0, Math.PI * 2); ctx.fill();
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
        const rr = b.radius + 5 + (Math.sin(i * 7 + this.t * 20) + 1) * 3;
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
    ctx.setLineDash([2, 12]);
    ctx.lineDashOffset = -this.t * 32;
    ctx.lineWidth = 3;
    ctx.beginPath();
    pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    const end = pts[pts.length - 1];
    ctx.lineWidth = 1.5; circle(ctx, end.x, end.y, 9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(end.x - 14, end.y); ctx.lineTo(end.x + 14, end.y); ctx.moveTo(end.x, end.y - 14); ctx.lineTo(end.x, end.y + 14); ctx.stroke();
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
      const k = Math.max(0, r.life / r.max);
      if (!this.reducedMotion && this.quality >= 0.75) glow(ctx, r.x, r.y, Math.max(1, r.r), r.color, k * 0.16);
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = k * 0.18;
      ctx.lineWidth = r.width * 4 * k;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = k;
      ctx.lineWidth = Math.max(0.5, r.width * k); ctx.stroke();
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
      } else if (p.kind === 2) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx) + p.life * 3);
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.moveTo(p.size, 0); ctx.lineTo(0, p.size * 0.4); ctx.lineTo(-p.size, 0); ctx.lineTo(0, -p.size * 0.4); ctx.closePath(); ctx.fill(); ctx.restore();
      } else {
        ctx.fillStyle = p.color;
        circle(ctx, p.x, p.y, p.size * (0.3 + 0.7 * p.life / p.max));
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
