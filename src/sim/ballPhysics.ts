import { Content } from '../content';
import type { PhysicsMods, ShellDef } from '../content/types';
import type { Ball } from './entities';

/** Tunable base physics. Everything is in world units (arena is 720 wide) and seconds. */
export const PHYS = {
  arenaW: 720,
  arenaH: 1120,
  ballRadius: 16,
  baseMass: 1,
  baseDrag: 0.85,
  /** Extra drag at low speeds so the ball comes to rest cleanly instead of creeping. */
  restDrag: 3,
  restSpeed: 60,
  baseRestitution: 0.86,
  baseMaxSpeed: 1500,
  launchSpeed: 1250,
  /** Speed below which enemies can hurt the ball on contact. */
  vulnerableSpeed: 300,
  /** Relative speed below which a touch is not an impact. */
  impactMinSpeed: 140,
  baseImpactDamage: 14,
  impactRefSpeed: 700,
  pipRegen: 1.6,
  maxFocus: 2.5,
  brakeCooldown: 1,
  brakeFactor: 0.3,
  /** Gravity is off in the top-down arena; kept configurable for future side-view modes. */
  gravity: 0,
  step: 1 / 120,
};

export const NEUTRAL_MODS: PhysicsMods = { massMul: 1, restitutionAdd: 0, dragMul: 1, maxSpeedMul: 1, launchMul: 1, impactDamageMul: 1 };

/**
 * Combine element auras, buffs, shell and run modifiers into the ball's effective physics.
 * Each carried element contributes its mods scaled by min(amount, 1), so a faint trace of metal
 * barely matters while a full charge clearly changes the ball's feel.
 */
export function effectivePhysics(ball: Ball, shell: ShellDef | undefined, mods: Record<string, number>): PhysicsMods {
  const out: PhysicsMods = { ...NEUTRAL_MODS };
  const mix = (m: Partial<PhysicsMods>, s: number) => {
    if (m.massMul !== undefined) out.massMul *= 1 + (m.massMul - 1) * s;
    if (m.dragMul !== undefined) out.dragMul *= 1 + (m.dragMul - 1) * s;
    if (m.maxSpeedMul !== undefined) out.maxSpeedMul *= 1 + (m.maxSpeedMul - 1) * s;
    if (m.launchMul !== undefined) out.launchMul *= 1 + (m.launchMul - 1) * s;
    if (m.impactDamageMul !== undefined) out.impactDamageMul *= 1 + (m.impactDamageMul - 1) * s;
    if (m.restitutionAdd !== undefined) out.restitutionAdd += m.restitutionAdd * s;
  };
  for (const [el, amt] of ball.auras) {
    const def = Content.elements.get(el);
    if (def?.ballPhysics) mix(def.ballPhysics, Math.min(1, amt));
  }
  if (shell) mix(shell.mods, 1);
  if (ball.buffs.has('ironstone')) mix({ massMul: 2.5, impactDamageMul: 2, launchMul: 0.85 }, 1);
  if (ball.buffs.has('ballLightning')) mix({ maxSpeedMul: 1.25, launchMul: 1.2, dragMul: 0.6 }, 1);
  const heavy = (ball.auras.get('metal') ?? 0) > 0.2 || (ball.auras.get('earth') ?? 0) > 0.2;
  out.impactDamageMul *= 1 + (mods.impactDmg ?? 0) + (heavy ? mods.heavyImpact ?? 0 : 0);
  out.launchMul *= 1 + (mods.launchPower ?? 0);
  out.maxSpeedMul *= 1 + (mods.maxSpeed ?? 0);
  out.dragMul *= Math.max(0.2, 1 + (mods.drag ?? 0));
  out.restitutionAdd += mods.restitution ?? 0;
  return out;
}
