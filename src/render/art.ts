import type { Enemy, ArenaObject } from '../sim/entities';

const TAU = Math.PI * 2;
type Ctx = CanvasRenderingContext2D;

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

export function glow(c: Ctx, x: number, y: number, r: number, color: string, alpha = 0.2): void {
  c.save();
  c.globalAlpha *= alpha;
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(1, color + '00');
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

function material(c: Ctx, r: number, color: string): CanvasGradient {
  const g = c.createRadialGradient(-r * 0.4, -r * 0.5, 0, 0, 0, r * 1.2);
  g.addColorStop(0, '#f2f5e7'); g.addColorStop(0.2, color); g.addColorStop(1, '#101c28');
  return g;
}

/** Silhouette, anatomy and idle motion are visual only; colliders stay circular. */
export function creature(c: Ctx, e: Enemy, time: number, target: { x: number; y: number }, reduced: boolean): void {
  const r = e.radius, id = e.def.id;
  const frozen = e.statuses.has('frozen') || e.statuses.has('petrified');
  const t = reduced || frozen ? 0 : time;
  const phase = t * 5 + e.uid * 2.7;
  const color = e.hitFlash > 0 ? '#ffffff' : e.statuses.has('frozen') ? '#bdf3ff' : e.statuses.has('petrified') ? '#947c65' : e.def.color;
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
  c.strokeStyle = '#152333'; c.lineWidth = 3;
  c.fillStyle = material(c, r, color);

  if (id === 'slime' || id === 'bloat') {
    c.beginPath(); c.moveTo(-r, r * 0.55);
    c.bezierCurveTo(-r * 1.1, -r * 0.4, -r * 0.6, -r * 1.1, 0, -r);
    c.bezierCurveTo(r * 0.8, -r * 1.1, r * 1.2, 0, r, r * 0.65);
    c.quadraticCurveTo(r * 0.5, r * 1.05, 0, r * 0.85);
    c.quadraticCurveTo(-r * 0.7, r * 1.1, -r, r * 0.55);
    c.fill(); c.stroke();
    c.fillStyle = '#ffffff28';
    for (let i = 0; i < 5; i++) { circle(c, Math.sin(i * 6 + e.uid) * r * 0.65, Math.cos(i * 4) * r * 0.65, r * (id === 'bloat' ? 0.19 : 0.09)); c.fill(); }
    if (id === 'bloat') {
      c.fillStyle = '#bddf77';
      for (let i = 0; i < 3; i++) { const x = (i - 1) * r * 0.6; c.fillRect(x - 2, -r - 7, 4, 10); circle(c, x, -r - 7 + Math.sin(phase + i) * 2, 5); c.fill(); }
    }
  } else if (id === 'imp' || id === 'salamander') {
    c.beginPath(); c.moveTo(-r * 0.9, r * 0.6); c.quadraticCurveTo(-r * 1.3, -r * 0.1, -r * 0.65, -r * 1.25);
    c.lineTo(-r * 0.18, -r * 0.65); c.lineTo(r * 0.55, -r * 1.45 - Math.sin(phase) * 3);
    c.quadraticCurveTo(r * 0.48, -r * 0.5, r * 0.88, -r * 0.2); c.quadraticCurveTo(r * 1.25, r * 1.1, 0, r * 0.9); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#fff1b0'; polygon(c, 0, r * 0.4, r * 0.28, 3, -Math.PI / 2); c.fill();
  } else if (id === 'wisp') {
    glow(c, 0, 0, r * 2.6, color, 0.4);
    c.beginPath(); c.moveTo(0, -r); c.bezierCurveTo(r * 1.4, -r, r * 1.2, r, 0, r * 1.5);
    c.quadraticCurveTo(r * 0.2, r * 0.5, -r * 0.7, r * 0.6); c.quadraticCurveTo(-r * 1.5, -r * 0.7, 0, -r); c.fill();
    sigil(c, 0, 0, r * 1.35, '#bff4ff55', t * 0.4);
  } else if (id === 'dummy') {
    c.fillStyle = '#69503d'; c.fillRect(-4, -r, 8, r * 2.4); c.fillRect(-r * 1.2, -4, r * 2.4, 8);
    c.fillStyle = material(c, r, color); circle(c, 0, 0, r); c.fill(); c.stroke();
    c.strokeStyle = '#704a32'; c.lineWidth = 3;
    circle(c, 0, 0, r * 0.67); c.stroke(); circle(c, 0, 0, r * 0.3); c.stroke();
    c.beginPath(); c.moveTo(-r, 0); c.lineTo(r, 0); c.moveTo(0, -r); c.lineTo(0, r); c.stroke();
  } else {
    // Mechanical legs articulate independently of the carapace.
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
      const yy = (i - 1) * r * 0.65, stride = Math.sin(phase + i * 2) * 3;
      c.strokeStyle = '#445263'; c.lineWidth = e.isBoss ? 8 : 4;
      c.beginPath(); c.moveTo(side * r * 0.7, yy); c.lineTo(side * r * 1.25, yy - 4 + stride); c.lineTo(side * r * 1.4, yy + 6 + stride); c.stroke();
    }
    c.strokeStyle = '#243441'; c.lineWidth = 3;
    polygon(c, 0, 0, r, e.isBoss ? 8 : 6, Math.PI / 6); c.fill(); c.stroke();
    c.strokeStyle = color; c.lineWidth = 1.5; polygon(c, 0, 0, r * 0.76, 6, Math.PI / 6); c.stroke();
    if (e.isBoss || id === 'sentinel') {
      c.fillStyle = '#10161f'; circle(c, 0, 0, r * 0.56); c.fill();
      glow(c, 0, 0, r, color, 0.6);
      c.fillStyle = color; circle(c, 0, 0, r * (0.3 + Math.sin(phase) * 0.02)); c.fill();
      c.fillStyle = '#ffefc3'; circle(c, -r * 0.08, -r * 0.08, r * 0.14); c.fill();
      sigil(c, 0, 0, r * 1.15, color + '88', t * 0.25);
    } else { c.beginPath(); c.moveTo(0, -r * 0.8); c.lineTo(0, r * 0.8); c.stroke(); }
  }
  if (id !== 'dummy' && id !== 'sentinel' && !e.isBoss) {
    const dx = target.x - e.pos.x, dy = target.y - e.pos.y, len = Math.hypot(dx, dy) || 1;
    // Eyes track the ball, with an occasional short blink.
    const blink = !reduced && !frozen && (time + e.uid * 0.73) % 4.6 < 0.12;
    for (const side of [-1, 1]) {
      c.fillStyle = '#0b1420';
      c.beginPath(); c.ellipse(side * r * 0.32, -r * 0.1, r * 0.19, r * (blink ? 0.035 : 0.24), 0, 0, TAU); c.fill();
      if (!blink) { c.fillStyle = '#edfaff'; circle(c, side * r * 0.32 + dx / len * 2, -r * 0.12 + dy / len * 2, r * 0.075); c.fill(); }
    }
  }
  if (e.tags.includes('armored') && e.armor > 0 && !e.statuses.has('exposed')) {
    c.strokeStyle = '#dce8ec88'; c.lineWidth = 2;
    c.beginPath(); c.arc(0, 0, r * 0.9, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
  }
  if (e.statuses.has('frozen')) { c.fillStyle = '#bdf3ff33'; c.strokeStyle = '#d9fbff'; polygon(c, 0, 0, r * 1.2, 6, 0); c.fill(); c.stroke(); }
  c.restore();
}

export function reagent(c: Ctx, o: ArenaObject, time: number): void {
  const r = o.radius, look = o.def.look, col = o.hitFlash > 0 ? '#ffffff' : o.def.color;
  const charge = o.def.element ? Math.min(1, o.auras.get(o.def.element) ?? 0) : 0;
  shadow(c, o.pos.x, o.pos.y, r);
  c.save(); c.translate(o.pos.x, o.pos.y); c.lineJoin = 'round'; c.lineCap = 'round';
  if (charge > 0.1) { glow(c, 0, 0, r * 3, col, charge * 0.23); sigil(c, 0, 0, r * 1.4, col + '50', 0); }
  c.fillStyle = '#24323b'; c.strokeStyle = '#5a6b70'; c.lineWidth = 2;
  polygon(c, 0, 3, r, 8, Math.PI / 8); c.fill(); c.stroke();
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
