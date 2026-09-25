/** Minimal 2D vector helpers. Mutable objects are used in hot paths to avoid garbage. */
export interface Vec2 {
  x: number;
  y: number;
}

export const v = (x = 0, y = 0): Vec2 => ({ x, y });
export const vcopy = (a: Vec2): Vec2 => ({ x: a.x, y: a.y });
export const vadd = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const vsub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const vscale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const vdot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const vlen = (a: Vec2): number => Math.hypot(a.x, a.y);
export const vlen2 = (a: Vec2): number => a.x * a.x + a.y * a.y;
export const vdist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const vdist2 = (a: Vec2, b: Vec2): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};
export const vnorm = (a: Vec2): Vec2 => {
  const l = Math.hypot(a.x, a.y);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
};
export const vperp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });

export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Closest point on segment ab to p. */
export function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  let t = len2 > 0 ? ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2 : 0;
  t = clamp(t, 0, 1);
  return { x: a.x + abx * t, y: a.y + aby * t };
}
