import type { Enemy, ArenaObject } from '../sim/entities';

const TAU = Math.PI * 2;
const OUTLINE = '#152333';
type Ctx = CanvasRenderingContext2D;

/** Canonical element hues, used for boss phase cores and other element-tinted details. */
export const ELEMENT_COLORS: Readonly<Record<string, string>> = {
  fire: '#ff6a2b', water: '#3aa7ff', ice: '#a8f0ff', lightning: '#ffe84a', metal: '#b8c2cc',
  earth: '#b07a45', wind: '#b7ffcf', poison: '#8fe03a', arcane: '#c77dff',
};

export function circle(c: Ctx, x: number, y: number, r: number): void {
  c.beginPath();
  c.arc(x, y, Math.max(0.01, r), 0, TAU);
}

export function polygon(c: Ctx, x: number, y: number, r: number, sides: number, turn = 0): void {
  c.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = turn + i / sides * TAU;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (i) c.lineTo(px, py); else c.moveTo(px, py);
  }
  c.closePath();
}

// ── Glow sprites ────────────────────────────────────────────────────────────
// A radial gradient per glow() call was a measurable per-frame cost; instead each colour is
// rendered once into a small offscreen canvas and stretched with drawImage.

const GLOW_SIZE = 128;
const GLOW_CACHE_MAX = 256;
const glowCache = new Map<string, HTMLCanvasElement | null>();

/** Gradient stops for a glow: the colour at the centre, the same hue at zero alpha at the rim. */
function glowStops(color: string): [string, string] {
  const s = color.trim();
  if (/^#[0-9a-f]{3,4}$/i.test(s)) {
    const rgb = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
    return [s.length === 5 ? rgb + s[4] + s[4] : rgb, rgb + '00'];
  }
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(s)) return [s, s.slice(0, 7) + '00'];
  return [s, 'rgba(0,0,0,0)'];
}

/** Cached 128×128 radial glow (colour → transparent) for `color`; null when no DOM canvas exists. */
export function glowSprite(color: string): CanvasImageSource | null {
  const hit = glowCache.get(color);
  if (hit !== undefined) return hit;
  let sprite: HTMLCanvasElement | null = null;
  if (typeof document !== 'undefined') {
    try {
      const cv = document.createElement('canvas');
      cv.width = cv.height = GLOW_SIZE;
      const g = cv.getContext('2d');
      if (g) {
        const h = GLOW_SIZE / 2, [inner, outer] = glowStops(color);
        const grad = g.createRadialGradient(h, h, 0, h, h, h);
        grad.addColorStop(0, inner); grad.addColorStop(1, outer);
        g.fillStyle = grad; g.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
        sprite = cv;
      }
    } catch { sprite = null; }
  }
  if (glowCache.size >= GLOW_CACHE_MAX) glowCache.clear();
  glowCache.set(color, sprite);
  return sprite;
}

export function glow(c: Ctx, x: number, y: number, r: number, color: string, alpha = 0.2): void {
  if (!(r > 0) || !(alpha > 0)) return;
  const sprite = glowSprite(color);
  if (sprite) {
    const prev = c.globalAlpha;
    c.globalAlpha = prev * alpha;
    c.drawImage(sprite, x - r, y - r, r * 2, r * 2);
    c.globalAlpha = prev;
    return;
  }
  c.save();
  c.globalAlpha *= alpha;
  const [inner, outer] = glowStops(color);
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, inner); g.addColorStop(1, outer);
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
  c.restore();
}

export function shadow(c: Ctx, x: number, y: number, r: number): void {
  c.save();
  c.fillStyle = '#00000055';
  c.beginPath(); c.ellipse(x + 3, y + r * 0.6, r * 1.15, r * 0.55, 0, 0, TAU); c.fill();
  c.restore();
}

/** Engraved geometry shared by the arena and the reagent pedestals. */
export function sigil(c: Ctx, x: number, y: number, r: number, color: string, turn = 0): void {
  c.save(); c.translate(x, y); c.rotate(turn);
  c.strokeStyle = color; c.lineWidth = 1;
  circle(c, 0, 0, r); c.stroke(); circle(c, 0, 0, r * 0.87); c.stroke();
  polygon(c, 0, 0, r * 0.78, 3, -Math.PI / 2); c.stroke();
  polygon(c, 0, 0, r * 0.78, 3, Math.PI / 2); c.stroke();
  for (let i = 0; i < 12; i++) {
    c.rotate(TAU / 12); c.beginPath(); c.moveTo(r * 0.91, 0); c.lineTo(r * 0.98, 0); c.stroke();
  }
  c.restore();
}

// ── Drawing helpers ─────────────────────────────────────────────────────────

/** Lit-from-top-left body material; (lx, ly) moves the highlight for rotated frames. */
function material(c: Ctx, r: number, color: string, lx = -0.4, ly = -0.5): CanvasGradient {
  const g = c.createRadialGradient(lx * r, ly * r, 0, 0, 0, r * 1.2);
  g.addColorStop(0, '#fff2d6');
  g.addColorStop(0.16, color);
  g.addColorStop(0.5, color);
  g.addColorStop(0.88, '#23313c');
  g.addColorStop(1, '#101c28');
  return g;
}

/** Deterministic 0..1 noise. */
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Jagged polyline path (not stroked). */
function zigzag(c: Ctx, x1: number, y1: number, x2: number, y2: number, segs: number, amp: number, seed: number): void {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  c.beginPath(); c.moveTo(x1, y1);
  for (let i = 1; i < segs; i++) {
    const k = i / segs, o = (hash(seed + i * 7.31) - 0.5) * 2 * amp;
    c.lineTo(x1 + dx * k + nx * o, y1 + dy * k + ny * o);
  }
  c.lineTo(x2, y2);
}

/** Electric arc: a coloured halo stroke under a pale filament. */
function spark(c: Ctx, x1: number, y1: number, x2: number, y2: number, segs: number, amp: number, seed: number, color: string, width = 1.5): void {
  zigzag(c, x1, y1, x2, y2, segs, amp, seed);
  const a = c.globalAlpha;
  c.strokeStyle = color; c.lineWidth = width * 3; c.globalAlpha = a * 0.4; c.stroke();
  c.strokeStyle = '#fffbe6'; c.lineWidth = width; c.globalAlpha = a; c.stroke();
}

/** Outlined stroke segment (legs, arms, rods). */
function limb(c: Ctx, x1: number, y1: number, x2: number, y2: number, w: number, fill: string): void {
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
  c.strokeStyle = OUTLINE; c.lineWidth = w + 3; c.stroke();
  c.strokeStyle = fill; c.lineWidth = w; c.stroke();
}

/** Four-point twinkle. */
function star(c: Ctx, x: number, y: number, s: number): void {
  c.beginPath(); c.moveTo(x, y - s);
  c.quadraticCurveTo(x, y, x + s, y); c.quadraticCurveTo(x, y, x, y + s);
  c.quadraticCurveTo(x, y, x - s, y); c.quadraticCurveTo(x, y, x, y - s);
  c.fill();
}

interface Gaze { x: number; y: number; blink: boolean }

/** Two eyes at (x ± sx, y ± sy); pupils shift `shift` px toward the gaze. */
function eyes(c: Ctx, g: Gaze, x: number, y: number, sx: number, sy: number, rx: number, ry: number, pupil: number, shift: number, pupilColor = '#edfaff'): void {
  for (let side = -1; side <= 1; side += 2) {
    const ex = x + side * sx, ey = y + side * sy;
    c.fillStyle = '#0b1420';
    c.beginPath(); c.ellipse(ex, ey, rx, g.blink ? ry * 0.15 : ry, 0, 0, TAU); c.fill();
    if (!g.blink) { c.fillStyle = pupilColor; circle(c, ex + g.x * shift, ey - ry * 0.08 + g.y * shift, pupil); c.fill(); }
  }
}

/** Boss core colour follows the current phase aura. */
function coreColor(e: Enemy): string {
  if (e.hitFlash > 0) return '#ffffff';
  for (const [el, amount] of e.auras) if (amount > 0 && ELEMENT_COLORS[el]) return ELEMENT_COLORS[el];
  for (const el of e.auras.keys()) if (ELEMENT_COLORS[el]) return ELEMENT_COLORS[el];
  return e.def.color;
}

interface Pose {
  r: number;
  t: number;
  phase: number;
  color: string;
  gaze: Gaze;
  /** Reduced motion or frozen/petrified: no idle animation. */
  still: boolean;
}

const SCRATCH = new Float32Array(64);

/** Silhouette, anatomy and idle motion are visual only; colliders stay circular. */
export function creature(c: Ctx, e: Enemy, time: number, target: { x: number; y: number }, reduced: boolean): void {
  const r = e.radius, id = e.def.id;
  const frozen = e.statuses.has('frozen') || e.statuses.has('petrified');
  const t = reduced || frozen ? 0 : time;
  const phase = t * 5 + e.uid * 2.7;
  const color = e.hitFlash > 0 ? '#ffffff' : e.statuses.has('frozen') ? '#bdf3ff' : e.statuses.has('petrified') ? '#947c65' : e.def.color;
  const dx = target.x - e.pos.x, dy = target.y - e.pos.y, len = Math.hypot(dx, dy) || 1;
  // Eyes track the ball, with an occasional short blink.
  const gaze: Gaze = { x: dx / len, y: dy / len, blink: !reduced && !frozen && (time + e.uid * 0.73) % 4.6 < 0.12 };
  const p: Pose = { r, t, phase, color, gaze, still: reduced || frozen };
  shadow(c, e.pos.x, e.pos.y, r);
  c.save(); c.translate(e.pos.x, e.pos.y);
  if (e.spawnFx > 0 && !reduced) {
    const emerge = 1 - Math.min(0.8, e.spawnFx) ** 2;
    c.scale(emerge, emerge);
  }
  const squash = frozen || reduced ? 0 : Math.sin(phase) * (id === 'slime' ? 0.09 : 0.025);
  const hit = reduced ? 0 : Math.min(0.16, e.hitFlash * 1.5);
  c.scale(1 + squash + hit, 1 - squash - hit);
  c.translate(0, e.tags.includes('flying') ? -5 + Math.sin(phase * 0.7) * 4 : 0);
  c.lineJoin = 'round'; c.lineCap = 'round';
  c.strokeStyle = OUTLINE; c.lineWidth = 3;
  c.fillStyle = material(c, r, color);

  let stdEyes = true;
  if (id === 'slime' || id === 'bloat') drawBlob(c, e, p);
  else if (id === 'imp' || id === 'salamander') drawImp(c, e, p);
  else if (id === 'wisp') drawWisp(c, p);
  else if (id === 'dummy') { drawDummy(c, p); stdEyes = false; }
  else if (id === 'hound') { drawHound(c, e, p); stdEyes = false; }
  else if (id === 'mireling') { drawMireling(c, e, p); stdEyes = false; }
  else if (id === 'kite') { drawKite(c, e, p); stdEyes = false; }
  else if (id === 'mote') { drawMote(c, e, p); stdEyes = false; }
  else if (id === 'rimeguard') { drawRimeguard(c, p); stdEyes = false; }
  else if (id === 'conductor') { drawConductor(c, e, p); stdEyes = false; }
  else if (id === 'golem') { drawGolem(c, p); stdEyes = false; }
  else if (id === 'matriarch') { drawMatriarch(c, e, p); stdEyes = false; }
  else if (id === 'tempest') { drawTempest(c, e, p); stdEyes = false; }
  else { drawMechanical(c, e, p); stdEyes = id !== 'sentinel' && !e.isBoss; }

  if (stdEyes && !e.isBoss) eyes(c, gaze, 0, -r * 0.1, r * 0.32, 0, r * 0.19, r * 0.24, r * 0.075, 2);
  if (e.tags.includes('armored') && e.armor > 0 && !e.statuses.has('exposed')) {
    c.strokeStyle = '#dce8ec88'; c.lineWidth = 2;
    c.beginPath(); c.arc(0, 0, r * 0.9, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
  }
  if (e.statuses.has('frozen')) { c.fillStyle = '#bdf3ff33'; c.strokeStyle = '#d9fbff'; c.lineWidth = 3; polygon(c, 0, 0, r * 1.2, 6, 0); c.fill(); c.stroke(); }
  c.restore();
}

// ── Common foes ─────────────────────────────────────────────────────────────

function drawBlob(c: Ctx, e: Enemy, p: Pose): void {
  const { r, phase } = p, bloat = e.def.id === 'bloat';
  c.beginPath(); c.moveTo(-r, r * 0.55);
  c.bezierCurveTo(-r * 1.1, -r * 0.4, -r * 0.6, -r * 1.1, 0, -r);
  c.bezierCurveTo(r * 0.8, -r * 1.1, r * 1.2, 0, r, r * 0.65);
  c.quadraticCurveTo(r * 0.5, r * 1.05, 0, r * 0.85);
  c.quadraticCurveTo(-r * 0.7, r * 1.1, -r, r * 0.55);
  c.fill(); c.stroke();
  // Glossy rim highlight sells the wet surface.
  c.strokeStyle = '#ffffff55'; c.lineWidth = 2;
  c.beginPath(); c.arc(-r * 0.15, -r * 0.1, r * 0.72, Math.PI * 1.08, Math.PI * 1.42); c.stroke();
  c.strokeStyle = p.color + 'c0'; c.lineWidth = 1.6;
  c.beginPath(); c.ellipse(0, r * 0.28, r * 0.82, r * 0.49, 0, 0.15, Math.PI - 0.15); c.stroke();
  c.fillStyle = '#ffffff28';
  for (let i = 0; i < 5; i++) { circle(c, Math.sin(i * 6 + e.uid) * r * 0.65, Math.cos(i * 4) * r * 0.65, r * (bloat ? 0.19 : 0.09)); c.fill(); }
  if (bloat) {
    c.fillStyle = '#bddf77'; c.strokeStyle = OUTLINE; c.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * r * 0.6, h = -r - 7 + Math.sin(phase + i) * 2;
      c.fillRect(x - 2, -r - 7, 4, 10);
      circle(c, x, h, 5); c.fill(); c.stroke();
    }
  }
}

function drawImp(c: Ctx, e: Enemy, p: Pose): void {
  const { r, phase } = p;
  if (e.def.id === 'salamander') {
    // Tail curling behind the body.
    const sway = Math.sin(phase * 0.6) * r * 0.2;
    c.beginPath(); c.moveTo(r * 0.5, r * 0.6);
    c.quadraticCurveTo(r * 1.5, r * 0.9 + sway, r * 1.45, r * 0.1 + sway);
    c.quadraticCurveTo(r * 1.2, r * 0.6, r * 0.3, r * 0.85); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = material(c, r, p.color);
  }
  c.beginPath(); c.moveTo(-r * 0.9, r * 0.6); c.quadraticCurveTo(-r * 1.3, -r * 0.1, -r * 0.65, -r * 1.25);
  c.lineTo(-r * 0.18, -r * 0.65); c.lineTo(r * 0.55, -r * 1.45 - Math.sin(phase) * 3);
  c.quadraticCurveTo(r * 0.48, -r * 0.5, r * 0.88, -r * 0.2); c.quadraticCurveTo(r * 1.25, r * 1.1, 0, r * 0.9); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#fff1b0'; polygon(c, 0, r * 0.4, r * 0.28, 3, -Math.PI / 2); c.fill();
  if (e.def.id === 'salamander') {
    // Magma seams along the back.
    c.strokeStyle = '#ffcf6a'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(-r * 0.6, r * 0.1); c.lineTo(-r * 0.35, r * 0.3); c.lineTo(-r * 0.5, r * 0.55);
    c.moveTo(r * 0.55, r * 0.05); c.lineTo(r * 0.38, r * 0.32); c.lineTo(r * 0.6, r * 0.5); c.stroke();
  }
}

function drawWisp(c: Ctx, p: Pose): void {
  const { r, t, color } = p;
  glow(c, 0, 0, r * 2.6, color, 0.4);
  c.beginPath(); c.moveTo(0, -r); c.bezierCurveTo(r * 1.4, -r, r * 1.2, r, 0, r * 1.5);
  c.quadraticCurveTo(r * 0.2, r * 0.5, -r * 0.7, r * 0.6); c.quadraticCurveTo(-r * 1.5, -r * 0.7, 0, -r); c.fill();
  sigil(c, 0, 0, r * 1.35, '#bff4ff55', t * 0.4);
}

function drawDummy(c: Ctx, p: Pose): void {
  const { r, color } = p;
  c.fillStyle = '#69503d'; c.fillRect(-4, -r, 8, r * 2.4); c.fillRect(-r * 1.2, -4, r * 2.4, 8);
  c.fillStyle = material(c, r, color); circle(c, 0, 0, r); c.fill(); c.stroke();
  c.strokeStyle = '#704a32'; c.lineWidth = 3;
  circle(c, 0, 0, r * 0.67); c.stroke(); circle(c, 0, 0, r * 0.3); c.stroke();
  c.beginPath(); c.moveTo(-r, 0); c.lineTo(r, 0); c.moveTo(0, -r); c.lineTo(0, r); c.stroke();
}

/** Beetle, sentinel, the Crucible Warden and any unknown id. */
function drawMechanical(c: Ctx, e: Enemy, p: Pose): void {
  const { r, t, phase, color } = p;
  // Mechanical legs articulate independently of the carapace.
  for (let side = -1; side <= 1; side += 2) for (let i = 0; i < 3; i++) {
    const yy = (i - 1) * r * 0.65, stride = Math.sin(phase + i * 2) * 3;
    c.strokeStyle = '#445263'; c.lineWidth = e.isBoss ? 8 : 4;
    c.beginPath(); c.moveTo(side * r * 0.7, yy); c.lineTo(side * r * 1.25, yy - 4 + stride); c.lineTo(side * r * 1.4, yy + 6 + stride); c.stroke();
  }
  if (e.def.id === 'beetle') {
    const open = Math.sin(phase * 0.8) * r * 0.06;
    for (let side = -1; side <= 1; side += 2) {
      c.beginPath(); c.moveTo(side * r * 0.3, -r * 0.7);
      c.quadraticCurveTo(side * r * 0.62, -r * 1.25, side * (r * 0.1 + open), -r * 1.32);
      c.strokeStyle = OUTLINE; c.lineWidth = 6; c.stroke();
      c.strokeStyle = '#6a7783'; c.lineWidth = 3; c.stroke();
    }
  }
  c.fillStyle = material(c, r, color);
  c.strokeStyle = '#243441'; c.lineWidth = 3;
  polygon(c, 0, 0, r, e.isBoss ? 8 : 6, Math.PI / 6); c.fill(); c.stroke();
  c.strokeStyle = color; c.lineWidth = 1.5; polygon(c, 0, 0, r * 0.76, 6, Math.PI / 6); c.stroke();
  if (e.isBoss || e.def.id === 'sentinel') {
    const core = e.isBoss ? coreColor(e) : color;
    c.fillStyle = '#10161f'; circle(c, 0, 0, r * 0.56); c.fill();
    glow(c, 0, 0, r, core, 0.6);
    c.fillStyle = core; circle(c, 0, 0, r * (0.3 + Math.sin(phase) * 0.02)); c.fill();
    c.fillStyle = '#ffefc3'; circle(c, -r * 0.08, -r * 0.08, r * 0.14); c.fill();
    sigil(c, 0, 0, r * 1.15, core + '88', t * 0.25);
  } else {
    c.beginPath(); c.moveTo(0, -r * 0.8); c.lineTo(0, r * 0.8); c.stroke();
    if (e.def.id === 'beetle') {
      // Elytra rivets.
      c.fillStyle = '#dce8ec66';
      for (let i = 0; i < 3; i++) for (let side = -1; side <= 1; side += 2) { circle(c, side * r * 0.42, (i - 0.6) * r * 0.38, r * 0.05); c.fill(); }
    }
  }
}

// ── Frostvein / Storm Spire foes ────────────────────────────────────────────

/** Rime Hound: running wolf in profile, mirrored/pitched along its velocity, legs trotting with speed. */
function drawHound(c: Ctx, e: Enemy, p: Pose): void {
  const { r, phase, color, gaze } = p;
  const speed = Math.hypot(e.vel.x, e.vel.y);
  const hx = speed > 6 ? e.vel.x : gaze.x, hy = speed > 6 ? e.vel.y : gaze.y;
  // Side profile, mirrored to face the run and pitched toward its vertical component.
  const dir = hx < 0 ? -1 : 1, tilt = Math.max(-0.45, Math.min(0.45, Math.atan2(hy, Math.abs(hx) || 1e-3)));
  const look: Gaze = { x: gaze.x * dir, y: gaze.y, blink: gaze.blink };
  const run = phase * 2.4, gait = 0.35 + 0.65 * Math.min(1, speed / 90);
  c.save(); c.scale(dir, 1); c.rotate(tilt);
  const fur = material(c, r, color, -0.4 * dir, -0.5);
  // Legs: far pair first (darker), near pair over the body; diagonal pairs move together.
  const leg = (bx: number, off: number, shade: string): void => {
    const s = run + off, fx = bx + Math.sin(s) * r * 0.38 * gait, fy = r * 0.85 - Math.max(0, Math.cos(s)) * r * 0.16 * gait;
    const kx = (bx + fx) / 2 + (bx > 0 ? -1 : 1) * r * 0.08, ky = r * 0.5;
    c.beginPath(); c.moveTo(bx, r * 0.15); c.lineTo(kx, ky); c.lineTo(fx, fy);
    c.strokeStyle = OUTLINE; c.lineWidth = r * 0.2 + 3; c.stroke();
    c.strokeStyle = shade; c.lineWidth = r * 0.2; c.stroke();
    c.fillStyle = '#e6fbff'; c.strokeStyle = OUTLINE; c.lineWidth = 1.5;
    c.beginPath(); c.ellipse(fx + r * 0.05, fy, r * 0.12, r * 0.07, 0, 0, TAU); c.fill(); c.stroke();
  };
  leg(r * 0.48, Math.PI, '#4d88a0'); leg(-r * 0.5, 0, '#4d88a0');
  // Bushy tail sweeping back and up.
  const wag = Math.sin(run * 0.5) * r * 0.16;
  c.fillStyle = fur; c.strokeStyle = OUTLINE; c.lineWidth = 2.5;
  c.beginPath(); c.moveTo(-r * 0.72, -r * 0.28);
  c.quadraticCurveTo(-r * 1.25, -r * 0.5 + wag, -r * 1.6, -r * 0.72 + wag);
  c.quadraticCurveTo(-r * 1.4, -r * 0.2 + wag, -r * 0.75, r * 0.05); c.closePath(); c.fill(); c.stroke();
  // Body.
  c.lineWidth = 3;
  c.beginPath(); c.ellipse(-r * 0.05, -r * 0.05, r * 0.86, r * 0.42, 0, 0, TAU); c.fill(); c.stroke();
  // Frost spikes raking back along the spine.
  c.fillStyle = '#effcff'; c.strokeStyle = '#3f86a8'; c.lineWidth = 1.3;
  for (let i = 0; i < 4; i++) {
    const x = -r * 0.55 + i * r * 0.27, q = (x + r * 0.05) / (r * 0.86);
    const y = -r * 0.05 - r * 0.42 * Math.sqrt(Math.max(0, 1 - q * q)) + r * 0.06;
    const h = r * (0.32 + 0.07 * Math.sin(i * 1.7 + e.uid));
    c.beginPath(); c.moveTo(x - r * 0.1, y + 1); c.lineTo(x - r * 0.18, y - h); c.lineTo(x + r * 0.1, y + 1); c.closePath(); c.fill(); c.stroke();
  }
  leg(r * 0.42, 0, '#6fb0c8'); leg(-r * 0.56, Math.PI, '#6fb0c8');
  // Far ear, head, near ear.
  c.fillStyle = fur; c.strokeStyle = OUTLINE; c.lineWidth = 2.5;
  c.beginPath(); c.moveTo(r * 0.6, -r * 0.58); c.lineTo(r * 0.62, -r * 1.02); c.lineTo(r * 0.82, -r * 0.62); c.closePath(); c.fill(); c.stroke();
  c.lineWidth = 3;
  c.beginPath(); c.moveTo(r * 0.45, -r * 0.48);
  c.quadraticCurveTo(r * 0.7, -r * 0.78, r * 1.0, -r * 0.62);
  c.lineTo(r * 1.5, -r * 0.4); c.quadraticCurveTo(r * 1.58, -r * 0.27, r * 1.42, -r * 0.2);
  c.lineTo(r * 1.05, -r * 0.12); c.quadraticCurveTo(r * 0.75, r * 0.05, r * 0.5, -r * 0.05); c.closePath(); c.fill(); c.stroke();
  c.lineWidth = 2.5;
  c.beginPath(); c.moveTo(r * 0.72, -r * 0.6); c.lineTo(r * 0.8, -r * 1.08); c.lineTo(r * 0.98, -r * 0.64); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#0b1420'; circle(c, r * 1.5, -r * 0.33, r * 0.07); c.fill();
  // Single visible eye (profile), pupil following the ball.
  c.beginPath(); c.ellipse(r * 1.02, -r * 0.42, r * 0.11, look.blink ? r * 0.015 : r * 0.1, 0, 0, TAU); c.fill();
  if (!look.blink) { c.fillStyle = '#dffbff'; circle(c, r * 1.02 + look.x * 1.3, -r * 0.43 + look.y * 1.3, r * 0.045); c.fill(); }
  c.restore();
}

/** Mire Crawler: a lumpy heap of silt with embedded stones and dripping mud. */
function drawMireling(c: Ctx, e: Enemy, p: Pose): void {
  const { r, phase, color, gaze } = p;
  const heave = Math.sin(phase * 0.4);
  const n = 9, pts = SCRATCH;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + i / n * TAU, rr = r * (1 + 0.13 * Math.sin(i * 2.7 + e.uid * 1.3));
    let y = Math.sin(a) * rr;
    if (y < 0) y *= 1 + heave * 0.07;
    pts[i * 2] = Math.cos(a) * rr * 1.08; pts[i * 2 + 1] = Math.min(y, r * 0.72);
  }
  // Mud drips hang below the rim.
  c.fillStyle = '#5e4026';
  for (let i = 0; i < 3; i++) {
    const x = (i * 0.6 - 0.58) * r, y0 = r * 0.62;
    const k = (phase * 0.12 + i * 0.37 + e.uid * 0.11) % 1, l = r * (0.12 + 0.22 * k);
    c.beginPath(); c.moveTo(x - r * 0.08, y0);
    c.quadraticCurveTo(x - r * 0.07, y0 + l * 0.7, x, y0 + l);
    c.quadraticCurveTo(x + r * 0.07, y0 + l * 0.7, x + r * 0.08, y0); c.fill();
    if (k > 0.7 && !p.still) { circle(c, x, y0 + l + (k - 0.7) * r * 1.3, r * 0.05); c.fill(); }
  }
  // Smooth closed curve through the midpoints of the lumpy outline.
  c.fillStyle = material(c, r, color); c.strokeStyle = OUTLINE; c.lineWidth = 3;
  c.beginPath(); c.moveTo((pts[0] + pts[2]) / 2, (pts[1] + pts[3]) / 2);
  for (let i = 1; i <= n; i++) {
    const j = i % n, k = (i + 1) % n;
    c.quadraticCurveTo(pts[j * 2], pts[j * 2 + 1], (pts[j * 2] + pts[k * 2]) / 2, (pts[j * 2 + 1] + pts[k * 2 + 1]) / 2);
  }
  c.closePath(); c.fill(); c.stroke();
  // Silt strata.
  c.strokeStyle = '#4a322088'; c.lineWidth = 2;
  c.beginPath();
  c.moveTo(-r * 0.75, r * 0.18); c.quadraticCurveTo(0, r * 0.34, r * 0.8, r * 0.12);
  c.moveTo(-r * 0.85, r * 0.46); c.quadraticCurveTo(0, r * 0.6, r * 0.88, r * 0.42);
  c.stroke();
  // Embedded stones.
  c.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) {
    const sx = [-0.56, 0.52, -0.46, 0.56, 0.04][i] * r, sy = [-0.5, -0.52, 0.36, 0.3, -0.78][i] * r;
    const sr = r * [0.16, 0.13, 0.15, 0.12, 0.1][i];
    c.fillStyle = i % 2 ? '#7a7f83' : '#8d8478'; c.strokeStyle = OUTLINE;
    polygon(c, sx, sy, sr, 5, e.uid + i * 1.3); c.fill(); c.stroke();
    c.fillStyle = '#d2d5d455'; circle(c, sx - sr * 0.3, sy - sr * 0.35, sr * 0.3); c.fill();
  }
  // Deep-set eyes under a brow of silt.
  c.fillStyle = '#3b2716'; c.beginPath(); c.ellipse(0, -r * 0.13, r * 0.52, r * 0.2, 0, 0, TAU); c.fill();
  eyes(c, gaze, 0, -r * 0.1, r * 0.25, 0, r * 0.13, r * 0.14, r * 0.06, 1.5, '#ffd9a0');
}

/** Storm Kite: a paper diamond with a bow-tail, crackling at the corners. */
function drawKite(c: Ctx, e: Enemy, p: Pose): void {
  const { r, t, phase, color, gaze } = p;
  const flap = Math.sin(phase * 1.6) * r * 0.1, top = -r * 1.2, bottom = r * 1.1;
  glow(c, 0, 0, r * 2.4, color, 0.22);
  // Tail string and bows.
  const segs = 4;
  c.strokeStyle = '#c9b25a'; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(0, bottom);
  for (let k = 1; k <= segs; k++) c.lineTo(Math.sin(phase * 1.3 - k * 0.9) * r * 0.16 * k, bottom + k * r * 0.45);
  c.stroke();
  c.strokeStyle = OUTLINE; c.lineWidth = 1;
  for (let k = 1; k <= segs; k++) {
    const x = Math.sin(phase * 1.3 - k * 0.9) * r * 0.16 * k, y = bottom + k * r * 0.45, w = r * (0.3 - k * 0.03);
    c.fillStyle = k % 2 ? color : '#ffb43a';
    c.beginPath();
    c.moveTo(x, y); c.lineTo(x - w, y - w * 0.6); c.lineTo(x - w, y + w * 0.6); c.closePath();
    c.moveTo(x, y); c.lineTo(x + w, y - w * 0.6); c.lineTo(x + w, y + w * 0.6); c.closePath();
    c.fill(); c.stroke();
  }
  // Sail.
  const lx = -r * 0.9, ly = -r * 0.2 - flap, rx = r * 0.9, ry = -r * 0.2 + flap;
  c.fillStyle = material(c, r, color); c.lineWidth = 3;
  c.beginPath(); c.moveTo(0, top); c.lineTo(rx, ry); c.lineTo(0, bottom); c.lineTo(lx, ly); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#1a223333';
  c.beginPath(); c.moveTo(0, top); c.lineTo(rx, ry); c.lineTo(0, bottom); c.closePath(); c.fill();
  c.strokeStyle = '#7a6326'; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(0, top + 3); c.lineTo(0, bottom - 3); c.moveTo(lx + 3, ly); c.lineTo(rx - 3, ry); c.stroke();
  eyes(c, gaze, 0, -r * 0.42, r * 0.24, 0, r * 0.12, r * 0.15, r * 0.06, 1.3);
  // Crackling arcs leap off random corners.
  if (!p.still) {
    const tick = Math.floor(t * 14);
    for (let i = 0; i < 2; i++) {
      const s = tick * 3.1 + i * 17 + e.uid;
      if (hash(s) < 0.45) continue;
      const corner = Math.floor(hash(s + 1) * 4);
      const cx = corner === 1 ? rx : corner === 3 ? lx : 0, cy = corner === 0 ? top : corner === 2 ? bottom : corner === 1 ? ry : ly;
      const a = Math.atan2(cy, cx) + (hash(s + 2) - 0.5) * 1.2;
      spark(c, cx, cy, cx + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.6, 3, r * 0.14, s, color, 1.1);
    }
  }
}

/** Prism Mote: a spinning octahedron with a gaze-following core and orbiting sparkles. */
function drawMote(c: Ctx, e: Enemy, p: Pose): void {
  const { r, t, phase, color, gaze } = p;
  c.save();
  c.translate(0, -4 + Math.sin(phase * 0.6) * 3);
  glow(c, 0, 0, r * 2.7, color, 0.35);
  const spin = t * 1.3 + e.uid, orbit = t * 1.8 + e.uid * 0.7;
  const sparkles = (front: boolean): void => {
    c.fillStyle = '#fbeaff';
    for (let i = 0; i < 3; i++) {
      const o = orbit + i * TAU / 3, depth = Math.sin(o);
      if ((depth >= 0) !== front) continue;
      const a = c.globalAlpha; c.globalAlpha = a * (front ? 0.95 : 0.45);
      star(c, Math.cos(o) * r * 1.65, depth * r * 0.5 - r * 0.1, r * (front ? 0.22 : 0.15));
      c.globalAlpha = a;
    }
  };
  sparkles(false);
  // Equator vertices on a tilted ellipse; faces painted back to front.
  const top = -r * 1.3, bot = r * 1.3, R = r * 0.9, tilt = 0.26, pts = SCRATCH;
  for (let k = 0; k < 4; k++) { const a = spin + k * Math.PI / 2; pts[k * 2] = Math.cos(a) * R; pts[k * 2 + 1] = Math.sin(a) * R * tilt; }
  const face = (k: number, apex: number): void => {
    const j = (k + 1) % 4;
    c.beginPath(); c.moveTo(0, apex); c.lineTo(pts[k * 2], pts[k * 2 + 1]); c.lineTo(pts[j * 2], pts[j * 2 + 1]); c.closePath();
  };
  // Outline pass: a thick stroke under every face leaves a clean silhouette border.
  c.strokeStyle = OUTLINE; c.lineWidth = 4;
  for (let k = 0; k < 4; k++) { face(k, top); c.stroke(); face(k, bot); c.stroke(); }
  const body = material(c, r, color);
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 0; k < 4; k++) {
      const m = spin + (k + 0.5) * Math.PI / 2, front = Math.sin(m) >= 0;
      if (front !== (pass === 1)) continue;
      const light = Math.max(0, Math.cos(m - 2.36));
      for (let half = 0; half < 2; half++) {
        face(k, half ? bot : top);
        c.fillStyle = body; c.fill();
        const a = c.globalAlpha;
        c.globalAlpha = a * (half ? 0.38 - 0.22 * light : 0.06 + 0.32 * light);
        c.fillStyle = half ? '#1a0d2e' : '#ffffff'; c.fill();
        c.globalAlpha = a;
        if (front) { c.strokeStyle = '#f6e8ff88'; c.lineWidth = 1; c.stroke(); }
      }
    }
  }
  // Counter-rotating inner facet and a core that leans toward the ball.
  const gx = gaze.x * r * 0.14, gy = gaze.y * r * 0.14;
  glow(c, gx, gy, r * 0.9, '#ffffff', 0.35);
  c.strokeStyle = '#ffffffaa'; c.lineWidth = 1;
  polygon(c, gx * 0.5, gy * 0.5, r * 0.5, 4, -spin * 1.7); c.stroke();
  c.fillStyle = '#fff6ff'; polygon(c, gx, gy, r * 0.24, 4, -spin * 1.7 + Math.PI / 4); c.fill();
  sparkles(true);
  c.restore();
}

/** Rime Knight: helm with ice crown, broad pauldrons, glowing visor slit. */
function drawRimeguard(c: Ctx, p: Pose): void {
  const { r, phase, color, gaze } = p;
  const bob = Math.sin(phase * 0.5) * r * 0.03, steel = material(c, r, color);
  // Tabard / cape behind the armour.
  c.fillStyle = '#23405a'; c.strokeStyle = OUTLINE; c.lineWidth = 3;
  c.beginPath(); c.moveTo(-r * 0.55, -r * 0.3); c.lineTo(r * 0.55, -r * 0.3); c.lineTo(r * 0.82, r * 0.95);
  c.lineTo(r * 0.32, r * 0.8); c.lineTo(0, r * 1.0); c.lineTo(-r * 0.32, r * 0.8); c.lineTo(-r * 0.82, r * 0.95); c.closePath(); c.fill(); c.stroke();
  // Breastplate.
  c.fillStyle = steel;
  c.beginPath(); c.moveTo(-r * 0.48, -r * 0.32); c.lineTo(r * 0.48, -r * 0.32); c.lineTo(r * 0.4, r * 0.45); c.lineTo(0, r * 0.78); c.lineTo(-r * 0.4, r * 0.45); c.closePath(); c.fill(); c.stroke();
  c.strokeStyle = '#e6fbff88'; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(0, -r * 0.25); c.lineTo(0, r * 0.68); c.moveTo(-r * 0.36, r * 0.05); c.lineTo(0, r * 0.25); c.lineTo(r * 0.36, r * 0.05); c.stroke();
  // Pauldrons with icy spurs.
  for (let side = -1; side <= 1; side += 2) {
    const px = side * r * 0.62, py = -r * 0.22 + bob;
    c.fillStyle = '#e9fbff'; c.strokeStyle = '#3e86a8'; c.lineWidth = 1.2;
    for (let j = 0; j < 2; j++) {
      const bx = px + side * r * (j * 0.2 - 0.08);
      c.beginPath(); c.moveTo(bx - r * 0.08, py - r * 0.22); c.lineTo(bx + side * r * (0.14 + j * 0.06), py - r * (0.6 - j * 0.12)); c.lineTo(bx + r * 0.08, py - r * 0.2); c.closePath(); c.fill(); c.stroke();
    }
    c.fillStyle = steel; c.strokeStyle = OUTLINE; c.lineWidth = 3;
    c.beginPath(); c.ellipse(px, py, r * 0.42, r * 0.3, side * -0.25, 0, TAU); c.fill(); c.stroke();
    c.strokeStyle = '#e6fbff77'; c.lineWidth = 1.5;
    c.beginPath(); c.ellipse(px, py + r * 0.08, r * 0.3, r * 0.17, side * -0.25, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
  }
  // Ice crown, mostly hidden behind the helm.
  const hy = -r * 0.55 + bob;
  c.fillStyle = '#e9fbffdd'; c.strokeStyle = '#3e86a8'; c.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * r * 0.14, h = r * [0.26, 0.38, 0.52, 0.38, 0.26][i];
    c.beginPath(); c.moveTo(x - r * 0.07, hy - r * 0.3); c.lineTo(x, hy - r * 0.3 - h); c.lineTo(x + r * 0.07, hy - r * 0.3); c.closePath(); c.fill(); c.stroke();
  }
  // Helm.
  c.fillStyle = steel; c.strokeStyle = OUTLINE; c.lineWidth = 3;
  c.beginPath(); c.moveTo(-r * 0.34, hy + r * 0.32); c.lineTo(-r * 0.36, hy - r * 0.12);
  c.quadraticCurveTo(-r * 0.34, hy - r * 0.44, 0, hy - r * 0.44); c.quadraticCurveTo(r * 0.34, hy - r * 0.44, r * 0.36, hy - r * 0.12);
  c.lineTo(r * 0.34, hy + r * 0.32); c.quadraticCurveTo(0, hy + r * 0.44, -r * 0.34, hy + r * 0.32); c.closePath(); c.fill(); c.stroke();
  // Visor slit with eyes of cold light.
  c.fillStyle = '#0b1420'; c.fillRect(-r * 0.29, hy - r * 0.05, r * 0.58, r * 0.11);
  glow(c, gaze.x * r * 0.05, hy, r * 0.45, color, 0.55);
  c.fillStyle = '#e6fbff';
  for (let side = -1; side <= 1; side += 2) {
    c.beginPath(); c.ellipse(side * r * 0.12 + gaze.x * r * 0.05, hy + gaze.y * r * 0.015, r * 0.065, gaze.blink ? r * 0.008 : r * 0.026, 0, 0, TAU); c.fill();
  }
  c.strokeStyle = '#0b1420'; c.lineWidth = 1.5;
  c.beginPath();
  for (let i = -1; i <= 1; i++) { c.moveTo(i * r * 0.1, hy + r * 0.14); c.lineTo(i * r * 0.1, hy + r * 0.27); }
  c.stroke();
}

/** Storm Conductor: robed figure crowned by a forked coil, conducting with both arms. */
function drawConductor(c: Ctx, e: Enemy, p: Pose): void {
  const { r, t, phase, color, gaze } = p;
  const robe = color === e.def.color ? '#5a5f96' : color, sway = Math.sin(phase * 0.5) * r * 0.04;
  // Coil rod and forked prongs rise from the hood.
  limb(c, 0, -r * 0.75, 0, -r * 1.38, 4, '#8a6f3a');
  for (let i = 0; i < 3; i++) {
    c.beginPath(); c.ellipse(0, -r * 0.95 - i * r * 0.13, r * 0.16, r * 0.05, 0, 0, TAU);
    c.strokeStyle = OUTLINE; c.lineWidth = 4; c.stroke(); c.strokeStyle = color; c.lineWidth = 2; c.stroke();
  }
  const px = r * 0.3, py = -r * 1.62;
  limb(c, 0, -r * 1.36, -px, py, 3, '#b8933f'); limb(c, 0, -r * 1.36, px, py, 3, '#b8933f');
  c.fillStyle = color; c.strokeStyle = OUTLINE; c.lineWidth = 1.5;
  circle(c, -px, py, r * 0.075); c.fill(); c.stroke(); circle(c, px, py, r * 0.075); c.fill(); c.stroke();
  glow(c, 0, py, r * 0.65, color, 0.35);
  spark(c, -px, py, px, py, 5, r * 0.12, Math.floor(t * 18) * 1.7 + e.uid * 7, color, 1.4);
  // Robe with scalloped hem.
  c.fillStyle = material(c, r, robe); c.strokeStyle = OUTLINE; c.lineWidth = 3;
  c.beginPath(); c.moveTo(-r * 0.3, -r * 0.45);
  c.quadraticCurveTo(-r * 0.55, r * 0.2, -r * 0.95 + sway, r * 0.92);
  c.quadraticCurveTo(-r * 0.62, r * 0.78, -r * 0.32, r * 0.95);
  c.quadraticCurveTo(0, r * 0.8, r * 0.32, r * 0.95);
  c.quadraticCurveTo(r * 0.62, r * 0.78, r * 0.95 + sway, r * 0.92);
  c.quadraticCurveTo(r * 0.55, r * 0.2, r * 0.3, -r * 0.45); c.closePath(); c.fill(); c.stroke();
  c.strokeStyle = color; c.lineWidth = 2;
  c.beginPath(); c.moveTo(0, -r * 0.3); c.lineTo(0, r * 0.84);
  c.moveTo(-r * 0.2, r * 0.2); c.lineTo(0, r * 0.05); c.lineTo(r * 0.2, r * 0.2); c.stroke();
  // Sleeves conduct in counter-time.
  for (let side = -1; side <= 1; side += 2) {
    const lift = Math.sin(phase * 0.8 + (side > 0 ? Math.PI : 0)) * r * 0.16;
    const hx = side * r * 0.86, hy = -r * 0.08 - lift;
    limb(c, side * r * 0.3, -r * 0.28, hx, hy, r * 0.22, robe);
    c.fillStyle = '#d9b26a'; c.strokeStyle = OUTLINE; c.lineWidth = 1.5;
    circle(c, hx, hy, r * 0.09); c.fill(); c.stroke();
  }
  // Brass collar and hood.
  c.fillStyle = '#b8933f'; c.strokeStyle = OUTLINE; c.lineWidth = 2;
  c.beginPath(); c.ellipse(0, -r * 0.42, r * 0.38, r * 0.13, 0, 0, TAU); c.fill(); c.stroke();
  c.fillStyle = material(c, r, robe); c.lineWidth = 3;
  circle(c, 0, -r * 0.62, r * 0.3); c.fill(); c.stroke();
  c.fillStyle = '#0b1420'; c.beginPath(); c.ellipse(0, -r * 0.58, r * 0.19, r * 0.17, 0, 0, TAU); c.fill();
  if (!gaze.blink) {
    c.fillStyle = color;
    for (let side = -1; side <= 1; side += 2) { circle(c, side * r * 0.08 + gaze.x * r * 0.04, -r * 0.6 + gaze.y * r * 0.04, r * 0.045); c.fill(); }
  }
}

const GOLEM_HULL = [-0.55, -0.85, 0.5, -0.9, 0.98, -0.2, 0.72, 0.62, 0, 0.86, -0.78, 0.6, -1.0, -0.22];

/** Crystal Golem: faceted torso and prism-cluster fists with glowing seams. */
function drawGolem(c: Ctx, p: Pose): void {
  const { r, phase, color, gaze } = p;
  const crystal = material(c, r, color), pulse = 0.5 + 0.5 * Math.sin(phase * 0.6), swing = Math.sin(phase * 0.35) * 0.1;
  c.strokeStyle = OUTLINE; c.lineWidth = 3;
  // Stubby hex feet.
  c.fillStyle = crystal;
  for (let side = -1; side <= 1; side += 2) { polygon(c, side * r * 0.4, r * 0.8, r * 0.26, 6, Math.PI / 6); c.fill(); c.stroke(); }
  // Arms: clusters of prisms hanging down and out.
  for (let side = -1; side <= 1; side += 2) {
    c.save(); c.translate(side * r * 0.95, -r * 0.35); c.rotate(-side * 0.6 + swing * side);
    for (let j = 0; j < 3; j++) {
      const len = r * (0.8 - Math.abs(j - 1) * 0.2), w = r * 0.16;
      c.save(); c.rotate((j - 1) * 0.38);
      c.beginPath(); c.moveTo(-w, 0); c.lineTo(-w * 0.9, len * 0.72); c.lineTo(0, len); c.lineTo(w * 0.9, len * 0.72); c.lineTo(w, 0); c.lineTo(0, -w * 0.6); c.closePath();
      c.fillStyle = crystal; c.strokeStyle = OUTLINE; c.lineWidth = 2.5; c.fill(); c.stroke();
      c.strokeStyle = '#ffffff44'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, len * 0.9); c.stroke();
      c.restore();
    }
    c.restore();
  }
  // Torso.
  const H = GOLEM_HULL, n = H.length / 2, cx = r * 0.06, cy = -r * 0.08;
  c.fillStyle = crystal; c.strokeStyle = OUTLINE; c.lineWidth = 3;
  c.beginPath(); for (let i = 0; i < n; i++) { if (i) c.lineTo(H[i * 2] * r, H[i * 2 + 1] * r); else c.moveTo(H[0] * r, H[1] * r); } c.closePath(); c.fill(); c.stroke();
  // Facets: one lit, one shaded, edges engraved.
  c.fillStyle = '#ffffff2e'; c.beginPath(); c.moveTo(cx, cy); c.lineTo(H[0] * r, H[1] * r); c.lineTo(H[12] * r, H[13] * r); c.closePath(); c.fill();
  c.fillStyle = '#1a10302e'; c.beginPath(); c.moveTo(cx, cy); c.lineTo(H[6] * r, H[7] * r); c.lineTo(H[8] * r, H[9] * r); c.closePath(); c.fill();
  c.strokeStyle = '#f6efff55'; c.lineWidth = 1;
  c.beginPath(); for (let i = 0; i < n; i++) { c.moveTo(cx, cy); c.lineTo(H[i * 2] * r, H[i * 2 + 1] * r); } c.stroke();
  // Glowing seams pulse from the core.
  glow(c, cx, cy, r * 0.9, color, 0.3 + 0.25 * pulse);
  const a = c.globalAlpha;
  c.globalAlpha = a * (0.45 + 0.5 * pulse); c.strokeStyle = '#f7ecff'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(H[2] * r * 0.8, H[3] * r * 0.8); c.lineTo(cx + r * 0.12, cy - r * 0.2); c.lineTo(cx, cy);
  c.lineTo(-r * 0.3, r * 0.3); c.lineTo(H[10] * r * 0.85, H[11] * r * 0.85);
  c.moveTo(cx, cy); c.lineTo(r * 0.45, r * 0.25); c.lineTo(H[6] * r * 0.85, H[7] * r * 0.85); c.stroke();
  c.globalAlpha = a;
  c.fillStyle = '#fff3ff'; polygon(c, cx, cy, r * (0.15 + pulse * 0.02), 4, Math.PI / 4); c.fill();
  // Head crystal with slit eyes.
  const hy = -r * 0.98;
  c.fillStyle = crystal; c.strokeStyle = OUTLINE; c.lineWidth = 2.5;
  polygon(c, 0, hy, r * 0.3, 5, -Math.PI / 2); c.fill(); c.stroke();
  glow(c, 0, hy + r * 0.02, r * 0.4, color, 0.5);
  c.fillStyle = '#fff6ff';
  for (let side = -1; side <= 1; side += 2) {
    c.beginPath(); c.ellipse(side * r * 0.1 + gaze.x * 1.5, hy + r * 0.03 + gaze.y * 1.5, r * 0.065, gaze.blink ? r * 0.008 : r * 0.028, side * 0.2, 0, TAU); c.fill();
  }
}

// ── Bosses ──────────────────────────────────────────────────────────────────

function iceShards(c: Ctx, r: number, spin: number, front: boolean): void {
  const n = 10, a0 = c.globalAlpha;
  for (let i = 0; i < n; i++) {
    const a = spin + i * TAU / n, depth = Math.sin(a);
    if ((depth >= 0) !== front) continue;
    const s = 0.78 + 0.22 * depth, x = Math.cos(a) * r * 1.28, y = depth * r * 0.5 + r * 0.05 + Math.sin(spin * 3 + i) * r * 0.03;
    const len = r * 0.3 * s, w = r * 0.085 * s;
    c.globalAlpha = a0 * (front ? 1 : 0.6);
    c.beginPath(); c.moveTo(x, y - len); c.lineTo(x + w, y); c.lineTo(x, y + len * 0.45); c.lineTo(x - w, y); c.closePath();
    c.fillStyle = '#e4faff'; c.strokeStyle = OUTLINE; c.lineWidth = 2; c.fill(); c.stroke();
    c.strokeStyle = '#ffffffcc'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, y - len * 0.8); c.lineTo(x, y + len * 0.3); c.stroke();
  }
  c.globalAlpha = a0;
}

/** The Rime Matriarch: hexagonal ice queen with a crown and an orbit of shards. */
function drawMatriarch(c: Ctx, e: Enemy, p: Pose): void {
  const { r, t, phase, color, gaze } = p;
  const core = coreColor(e), spin = t * 0.35 + e.uid;
  glow(c, 0, 0, r * 1.9, core, 0.22);
  iceShards(c, r, spin, false);
  // Crown spikes behind the flat top edge.
  const top = -r * 0.92 * Math.sin(Math.PI / 3) + r * 0.05;
  c.fillStyle = '#eafcff'; c.strokeStyle = OUTLINE; c.lineWidth = 2.5;
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * r * 0.2, h = r * [0.3, 0.46, 0.64, 0.46, 0.3][i], w = r * 0.1;
    c.beginPath(); c.moveTo(x - w, top + 4); c.lineTo(x, top - h); c.lineTo(x + w, top + 4); c.closePath(); c.fill(); c.stroke();
  }
  c.fillStyle = core; polygon(c, 0, top - r * 0.2, r * 0.08, 4, 0); c.fill(); c.strokeStyle = OUTLINE; c.lineWidth = 1.5; c.stroke();
  // Hexagonal crystal body.
  c.fillStyle = material(c, r, color); c.strokeStyle = OUTLINE; c.lineWidth = 4;
  polygon(c, 0, r * 0.05, r * 0.92, 6, 0); c.fill(); c.stroke();
  const vx = (i: number): number => Math.cos(i * TAU / 6) * r * 0.92, vy = (i: number): number => Math.sin(i * TAU / 6) * r * 0.92 + r * 0.05;
  c.fillStyle = '#ffffff26'; c.beginPath(); c.moveTo(0, r * 0.05); c.lineTo(vx(3), vy(3)); c.lineTo(vx(4), vy(4)); c.closePath(); c.fill();
  c.fillStyle = '#0a182433'; c.beginPath(); c.moveTo(0, r * 0.05); c.lineTo(vx(0), vy(0)); c.lineTo(vx(1), vy(1)); c.closePath(); c.fill();
  c.strokeStyle = '#f2fdff55'; c.lineWidth = 1.5;
  c.beginPath(); for (let i = 0; i < 6; i++) { c.moveTo(0, r * 0.05); c.lineTo(vx(i), vy(i)); } c.stroke();
  c.strokeStyle = '#e9fbff88'; c.lineWidth = 2; polygon(c, 0, r * 0.05, r * 0.58, 6, 0); c.stroke();
  // Mask: slanted eye slits glinting in the phase colour.
  for (let side = -1; side <= 1; side += 2) {
    c.fillStyle = '#0b1420';
    c.beginPath(); c.moveTo(side * r * 0.08, -r * 0.36); c.lineTo(side * r * 0.38, -r * 0.48); c.lineTo(side * r * 0.32, -r * 0.29); c.closePath(); c.fill();
    if (!gaze.blink) { c.fillStyle = core; circle(c, side * r * 0.25 + gaze.x * 2, -r * 0.37 + gaze.y * 2, r * 0.045); c.fill(); }
  }
  // Heart core.
  const cy = r * 0.25;
  c.fillStyle = '#10161f'; polygon(c, 0, cy, r * 0.3, 6, 0); c.fill();
  glow(c, 0, cy, r * 0.8, core, 0.7);
  c.fillStyle = core; polygon(c, 0, cy, r * 0.2 * (1 + Math.sin(phase) * 0.05), 4, Math.PI / 2); c.fill();
  c.fillStyle = '#ffffffcc'; circle(c, -r * 0.05, cy - r * 0.07, r * 0.05); c.fill();
  iceShards(c, r, spin, true);
  sigil(c, 0, 0, r * 1.05, core + '55', t * 0.2);
}

function brassRing(c: Ctx, R: number, ry: number, tilt: number, a0: number, a1: number, w: number): void {
  c.beginPath(); c.ellipse(0, 0, R, ry, tilt, a0, a1);
  c.strokeStyle = OUTLINE; c.lineWidth = w + 3; c.stroke();
  c.strokeStyle = '#b58a45'; c.lineWidth = w; c.stroke();
  c.strokeStyle = '#f3d58e'; c.lineWidth = 1.2; c.stroke();
}

/** The Tempest Engine: a brass gyroscope around a phase-coloured storm core. */
function drawTempest(c: Ctx, e: Enemy, p: Pose): void {
  const { r, t, phase } = p;
  const core = coreColor(e), w = r * 0.07, nodes = SCRATCH;
  glow(c, 0, 0, r * 1.8, core, 0.22);
  const ring = (k: number): [number, number, number] => {
    const R = r * (1 - k * 0.19), spin = t * (0.7 + k * 0.35) + k * 1.7 + e.uid;
    return [R, R * Math.max(0.14, Math.abs(Math.cos(spin))), k * Math.PI / 3 + 0.3];
  };
  // Node positions: two per ring, riding the ring's own ellipse.
  for (let k = 0; k < 3; k++) {
    const [R, ry, tilt] = ring(k), ct = Math.cos(tilt), st = Math.sin(tilt);
    for (let n = 0; n < 2; n++) {
      const th = n * Math.PI + t * 1.1 + k * 0.9, lx = R * Math.cos(th), ly = ry * Math.sin(th);
      nodes[(k * 2 + n) * 3] = lx * ct - ly * st; nodes[(k * 2 + n) * 3 + 1] = lx * st + ly * ct; nodes[(k * 2 + n) * 3 + 2] = Math.sin(th);
    }
  }
  const drawNodes = (front: boolean): void => {
    for (let i = 0; i < 6; i++) {
      if ((nodes[i * 3 + 2] >= 0) !== front) continue;
      c.fillStyle = '#c99a4a'; c.strokeStyle = OUTLINE; c.lineWidth = 2;
      circle(c, nodes[i * 3], nodes[i * 3 + 1], r * 0.075); c.fill(); c.stroke();
      c.fillStyle = core; circle(c, nodes[i * 3], nodes[i * 3 + 1], r * 0.032); c.fill();
    }
  };
  for (let k = 0; k < 3; k++) { const [R, ry, tilt] = ring(k); brassRing(c, R, ry, tilt, Math.PI, TAU, w); }
  drawNodes(false);
  // Core housing.
  c.fillStyle = material(c, r * 0.5, '#9a7440'); c.strokeStyle = OUTLINE; c.lineWidth = 4;
  circle(c, 0, 0, r * 0.46); c.fill(); c.stroke();
  c.strokeStyle = '#f3d58e88'; c.lineWidth = 1.5;
  c.beginPath(); for (let i = 0; i < 8; i++) { const a = i * TAU / 8; c.moveTo(Math.cos(a) * r * 0.36, Math.sin(a) * r * 0.36); c.lineTo(Math.cos(a) * r * 0.43, Math.sin(a) * r * 0.43); } c.stroke();
  c.fillStyle = '#10161f'; circle(c, 0, 0, r * 0.34); c.fill();
  glow(c, 0, 0, r * 0.95, core, 0.65);
  c.fillStyle = core; circle(c, 0, 0, r * 0.22 * (1 + Math.sin(phase) * 0.06)); c.fill();
  c.fillStyle = '#fff8dc'; circle(c, -r * 0.06, -r * 0.06, r * 0.08); c.fill();
  for (let k = 0; k < 3; k++) { const [R, ry, tilt] = ring(k); brassRing(c, R, ry, tilt, 0, Math.PI, w); }
  drawNodes(true);
  // Jagged arcs jump between ring nodes.
  const tick = Math.floor(t * 15);
  for (let k = 0; k < 2; k++) {
    if (hash(tick * 1.3 + k * 13 + e.uid) < 0.3) continue;
    const a = k * 2 + (tick + k) % 2, b = (k + 1) * 2 + tick % 2;
    spark(c, nodes[a * 3], nodes[a * 3 + 1], nodes[b * 3], nodes[b * 3 + 1], 5, r * 0.08, tick * 7 + k, core, 2);
  }
  if (hash(tick * 2.9 + e.uid) > 0.6) {
    const n = tick % 2;
    spark(c, 0, 0, nodes[n * 3], nodes[n * 3 + 1], 5, r * 0.07, tick * 5 + 3, core, 1.6);
  }
}

// ── Affixes ─────────────────────────────────────────────────────────────────

const DASH = [6, 5];
const NO_DASH: number[] = [];

/** Elite/Heat affix overlays around an enemy, in world coordinates. Call after `creature()`. */
export function affixAura(c: Ctx, e: Enemy, time: number, reduced = false): void {
  const list = e.affixes;
  if (!list || !list.length || e.dead) return;
  const r = e.radius, x = e.pos.x, y = e.pos.y + (e.tags.includes('flying') ? -5 : 0);
  const t = reduced ? 0 : time;
  c.save();
  c.lineCap = 'round'; c.lineJoin = 'round';
  const base = c.globalAlpha * (e.spawnFx > 0 ? 1 - Math.min(1, e.spawnFx) : 1);
  for (const affix of list) {
    if (affix === 'shielded') {
      if (!(e.ward > 0)) continue;
      const k = Math.min(1, e.ward / Math.max(1, e.maxWard)), turn = t * 0.4 + Math.PI / 6;
      polygon(c, x, y, r * 1.34, 6, turn);
      c.globalAlpha = base * (0.06 + 0.14 * k); c.fillStyle = '#bdf3ff'; c.fill();
      c.globalAlpha = base * (0.25 + 0.55 * k); c.strokeStyle = '#dffbff'; c.lineWidth = 2; c.stroke();
      c.globalAlpha = base * (0.12 + 0.25 * k); c.lineWidth = 1;
      polygon(c, x, y, r * 1.18, 6, turn); c.stroke();
    } else if (affix === 'swift') {
      const sp = Math.hypot(e.vel.x, e.vel.y);
      if (sp < 5) continue;
      const bx = -e.vel.x / sp, by = -e.vel.y / sp, px = -by, py = bx;
      c.strokeStyle = '#b7ffcf'; c.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const off = (i - 1) * r * 0.5, cyc = (t * 3 + i * 0.37 + e.uid * 0.1) % 1;
        const s0 = r * (0.9 + cyc * 0.6), l = r * (0.35 + 0.35 * (1 - cyc));
        c.globalAlpha = base * 0.7 * (1 - cyc);
        c.beginPath(); c.moveTo(x + bx * s0 + px * off, y + by * s0 + py * off);
        c.lineTo(x + bx * (s0 + l) + px * off, y + by * (s0 + l) + py * off); c.stroke();
      }
    } else if (affix === 'volatile') {
      const pulse = 0.5 + 0.5 * Math.sin(t * 6 + e.uid);
      c.globalAlpha = base;
      glow(c, x, y, r * 1.7, '#ff7a2b', 0.12 + 0.14 * pulse);
      c.globalAlpha = base * (0.35 + 0.55 * pulse); c.strokeStyle = '#ffb35a'; c.lineWidth = 1.8;
      c.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = e.uid * 1.9 + i * TAU / 4 + 0.4 * hash(i + e.uid);
        c.moveTo(x + Math.cos(a) * r * 0.25, y + Math.sin(a) * r * 0.25);
        c.lineTo(x + Math.cos(a + 0.28) * r * 0.55, y + Math.sin(a + 0.28) * r * 0.55);
        c.lineTo(x + Math.cos(a - 0.08) * r * 0.85, y + Math.sin(a - 0.08) * r * 0.85);
      }
      c.stroke();
      c.fillStyle = '#ffcf6a';
      for (let i = 0; i < 3; i++) {
        const cyc = (t * 0.7 + i / 3 + e.uid * 0.13) % 1;
        const ex = x + Math.sin(i * 2.4 + e.uid) * r * 0.8 + Math.sin(t * 3 + i) * 3, ey = y - r * 0.2 - cyc * r * 1.3;
        c.globalAlpha = base * 0.9 * (1 - cyc);
        c.fillRect(ex - 1.5, ey - 1.5, 3, 3);
      }
    } else if (affix === 'regenerating') {
      c.fillStyle = '#7be07b';
      for (let i = 0; i < 3; i++) {
        const cyc = (t * 0.45 + i / 3 + e.uid * 0.21) % 1, fade = Math.sin(cyc * Math.PI) * 0.85;
        const mx = x + Math.sin(i * 2.1 + e.uid) * r * 0.75, my = y - r * 0.1 - cyc * r * 1.4, s = 2.5 + r * 0.05;
        c.globalAlpha = base;
        glow(c, mx, my, s * 3, '#7be07b', fade * 0.4);
        c.globalAlpha = base * fade;
        c.fillRect(mx - s, my - s * 0.33, s * 2, s * 0.66);
        c.fillRect(mx - s * 0.33, my - s, s * 0.66, s * 2);
      }
    } else if (affix === 'insulated') {
      c.setLineDash(DASH); c.lineDashOffset = -t * 14;
      c.globalAlpha = base * 0.75; c.strokeStyle = '#c9a6ff'; c.lineWidth = 2;
      circle(c, x, y, r * 1.22); c.stroke();
      c.setLineDash(NO_DASH); c.lineDashOffset = 0;
    } else if (affix === 'enraged') {
      const flick = hash(Math.floor(t * 12) + e.uid);
      c.globalAlpha = base;
      glow(c, x, y, r * 1.75, '#ff5a5a', 0.14 + 0.12 * flick);
      c.globalAlpha = base * (0.25 + 0.3 * flick); c.strokeStyle = '#ff5a5a'; c.lineWidth = 2;
      circle(c, x, y, r * 1.08 + flick * 2); c.stroke();
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = t * 0.6 + i * TAU / 6 + e.uid;
        c.moveTo(x + Math.cos(a) * r * 1.14, y + Math.sin(a) * r * 1.14);
        c.lineTo(x + Math.cos(a) * r * (1.3 + flick * 0.08), y + Math.sin(a) * r * (1.3 + flick * 0.08));
      }
      c.stroke();
    }
  }
  c.restore();
}

export function reagent(c: Ctx, o: ArenaObject, time: number): void {
  const r = o.radius, look = o.def.look, col = o.hitFlash > 0 ? '#ffffff' : o.def.color;
  const charge = o.def.element ? Math.min(1, o.auras.get(o.def.element) ?? 0) : 0;
  shadow(c, o.pos.x, o.pos.y, r);
  c.save(); c.translate(o.pos.x, o.pos.y); c.lineJoin = 'round'; c.lineCap = 'round';
  if (charge > 0.1) { glow(c, 0, 0, r * 3, col, charge * 0.23); sigil(c, 0, 0, r * 1.4, col + '50', 0); }
  const rim = c.createLinearGradient(-r, -r, r, r);
  rim.addColorStop(0, '#d9bc89');
  rim.addColorStop(0.39, '#675946');
  rim.addColorStop(0.63, '#384651');
  rim.addColorStop(1, '#778e8a');
  c.fillStyle = '#182833'; c.strokeStyle = rim; c.lineWidth = 3;
  polygon(c, 0, 3, r, 8, Math.PI / 8); c.fill(); c.stroke();
  c.strokeStyle = '#0a131c'; c.lineWidth = 1.3;
  polygon(c, 0, 3, r * 0.86, 8, Math.PI / 8); c.stroke();
  c.lineWidth = 2;
  c.fillStyle = material(c, r, col); c.strokeStyle = col;
  if (look === 'crystal' || look === 'boulder') {
    polygon(c, 0, -3, r, look === 'crystal' ? 4 : 7, -Math.PI / 2); c.fill(); c.stroke();
    c.fillStyle = '#ffffff44'; c.beginPath(); c.moveTo(0, -r - 3); c.lineTo(-r * 0.65, -3); c.lineTo(0, r * 0.7); c.lineTo(r * 0.2, -4); c.closePath(); c.fill();
  } else if (look === 'crate' || look === 'barrel') {
    c.fillStyle = look === 'crate' ? '#614b32' : '#32472d'; c.fillRect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6); c.strokeRect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6);
    c.lineWidth = 4; c.beginPath();
    if (look === 'crate') { c.moveTo(-r * 0.7, -r * 0.7); c.lineTo(r * 0.7, r * 0.7); c.moveTo(r * 0.7, -r * 0.7); c.lineTo(-r * 0.7, r * 0.7); }
    else { for (const y of [-0.55, 0.55]) { c.moveTo(-r * 0.8, r * y); c.lineTo(r * 0.8, r * y); } }
    c.stroke(); if (look === 'barrel') { c.fillStyle = col; polygon(c, 0, 0, r * 0.35, 3, -Math.PI / 2); c.fill(); }
  } else if (look === 'brazier') {
    c.fillStyle = '#825643'; circle(c, 0, 0, r * 0.76); c.fill(); c.stroke();
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * r * 0.32, flicker = Math.sin(time * 9 + i * 2 + o.uid) * r * 0.16;
      c.fillStyle = i === 1 ? '#fff0b0' : col; c.globalAlpha = 0.3 + charge * 0.7;
      c.beginPath(); c.moveTo(x - r * 0.3, r * 0.18); c.quadraticCurveTo(x - r * 0.5, -r * 0.25, x + flicker, -r * (i === 1 ? 1.4 : 0.95));
      c.quadraticCurveTo(x + r * 0.1, -r * 0.4, x + r * 0.3, 0); c.quadraticCurveTo(x, r * 0.4, x - r * 0.3, r * 0.18); c.fill();
    }
  } else if (look === 'coil' || look === 'post') {
    c.fillStyle = '#647881'; c.fillRect(-r * 0.4, -r * 0.8, r * 0.8, r * 1.5);
    for (let i = 0; i < 3; i++) { c.strokeStyle = col; c.beginPath(); c.ellipse(0, (i - 1) * r * 0.4, r * 0.7, r * 0.22, 0, 0, TAU); c.stroke(); }
    c.fillStyle = col; circle(c, 0, -r * 0.8, r * 0.28); c.fill();
    if (look === 'coil' && charge > 0.1) { c.strokeStyle = '#fff4b4'; c.beginPath(); c.moveTo(-r * 0.1, -r * 1.4); c.lineTo(r * 0.25, -r); c.lineTo(-r * 0.2, -r * 0.7); c.stroke(); }
  } else if (look === 'fan' || look === 'rune') {
    c.save(); c.rotate(time * (look === 'fan' ? 3 : 0.3));
    if (look === 'rune') sigil(c, 0, 0, r * 0.8, col);
    else for (let i = 0; i < 4; i++) { c.rotate(TAU / 4); c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(r, -r * 0.8, r * 0.8, r * 0.3); c.closePath(); c.fill(); }
    c.restore();
  } else {
    circle(c, 0, 0, r * 0.77); c.fill(); c.stroke();
    c.strokeStyle = '#ffffffaa'; c.lineWidth = 2; circle(c, 0, 0, r * (0.5 + Math.sin(time * 3 + o.uid) * 0.04)); c.stroke();
    if (look === 'font') { c.fillStyle = '#d8f6ff'; circle(c, -r * 0.18, -r * 0.2, r * 0.2); c.fill(); }
  }
  c.restore();
}
