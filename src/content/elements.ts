import type { ElementDef } from './types';

/**
 * Elements. Base elements have a mechanical identity on the ball (physics mods) and on enemies
 * (passive effects). Compounds only arise from reactions. `kinetic` is the hidden pseudo-element
 * delivered by every fast collision; it lets impact reactions use the same engine as chemistry.
 */
export const ELEMENTS: ElementDef[] = [
  {
    id: 'fire', name: 'Fire', color: '#ff6a2b', glyph: '▲', tier: 'base',
    description: 'Heat and ignition. Burns enemies over time and ignites flammable objects. A hot ball hits slightly harder.',
    decayPerSec: 0.12, maxAmount: 2,
    ballPhysics: { impactDamageMul: 1.15 },
    onEnemy: { dps: 7 },
  },
  {
    id: 'water', name: 'Water', color: '#3aa7ff', glyph: '▼', tier: 'base',
    description: 'Wetness. Makes targets conductive and freezable. A wet ball glides further with less drag.',
    decayPerSec: 0.1, maxAmount: 2,
    ballPhysics: { dragMul: 0.8 },
  },
  {
    id: 'ice', name: 'Ice', color: '#a8f0ff', glyph: '❄︎', tier: 'base',
    description: 'Cold. Slows enemies and freezes wet ones solid. An icy ball is slippery and bounces harder.',
    decayPerSec: 0.14, maxAmount: 2,
    ballPhysics: { dragMul: 0.55, restitutionAdd: 0.06 },
    onEnemy: { slowMul: 0.6 },
    unlock: 'res_frost',
  },
  {
    id: 'lightning', name: 'Lightning', color: '#ffe84a', glyph: 'ϟ', tier: 'base',
    description: 'Charge. Leaps between conductive and wet targets. A charged ball launches faster.',
    decayPerSec: 0.25, maxAmount: 2,
    ballPhysics: { launchMul: 1.15, maxSpeedMul: 1.1 },
    onEnemy: { dps: 3 },
    unlock: 'res_storm',
  },
  {
    id: 'metal', name: 'Metal', color: '#b8c2cc', glyph: '⚙︎', tier: 'base',
    description: 'Mass and conductivity. A metal ball is heavy, loses less speed on impact and crushes armor-less targets.',
    decayPerSec: 0.05, maxAmount: 2,
    ballPhysics: { massMul: 1.8, impactDamageMul: 1.35, restitutionAdd: -0.08, launchMul: 0.9 },
    unlock: 'res_iron',
  },
  {
    id: 'earth', name: 'Earth', color: '#b07a45', glyph: '■', tier: 'base',
    description: 'Stability. Grounds lightning, forms terrain. An earthen ball is sturdy: heavier and harder to knock off course.',
    decayPerSec: 0.08, maxAmount: 2,
    ballPhysics: { massMul: 1.4, dragMul: 1.1, impactDamageMul: 1.15 },
    unlock: 'res_earth',
  },
  {
    id: 'wind', name: 'Wind', color: '#b7ffcf', glyph: '≋', tier: 'base',
    description: 'Momentum. Spreads fire, poison and cold. A windborne ball is light, fast and keeps its speed.',
    decayPerSec: 0.2, maxAmount: 2,
    ballPhysics: { massMul: 0.75, dragMul: 0.7, maxSpeedMul: 1.15 },
    unlock: 'res_gale',
  },
  {
    id: 'poison', name: 'Poison', color: '#8fe03a', glyph: '☣︎', tier: 'base',
    description: 'Corrosion. Deals lingering damage and weakens armor. Volatile near fire.',
    decayPerSec: 0.06, maxAmount: 2,
    onEnemy: { dps: 5 },
    unlock: 'res_toxin',
  },
  {
    id: 'arcane', name: 'Arcane', color: '#c77dff', glyph: '✦', tier: 'base',
    description: 'Raw alchemical energy. Amplifies whatever element it touches, triggering an overload.',
    decayPerSec: 0.18, maxAmount: 1.5,
    unlock: 'res_arcane',
  },
  // Compounds
  {
    id: 'steam', name: 'Steam', color: '#e6eef5', glyph: '☁︎', tier: 'compound',
    description: 'Hot vapour. Obscures vision and stores pressure. Reacts violently with cold and charge.',
    decayPerSec: 0.3, maxAmount: 2,
    ballPhysics: { massMul: 0.8, maxSpeedMul: 1.1 },
  },
  {
    id: 'mud', name: 'Mud', color: '#7a5a3a', glyph: '◒', tier: 'compound',
    description: 'Wet earth. Sticky and grounding.',
    decayPerSec: 0.1, maxAmount: 2,
    ballPhysics: { dragMul: 1.6 },
    onEnemy: { slowMul: 0.5 },
  },
  {
    id: 'magma', name: 'Magma', color: '#ff3b1f', glyph: '⬣', tier: 'compound',
    description: 'Molten stone. Burns intensely and solidifies when quenched.',
    decayPerSec: 0.12, maxAmount: 2,
    onEnemy: { dps: 12 },
  },
  {
    id: 'kinetic', name: 'Impact', color: '#ffffff', glyph: '✶', tier: 'hidden',
    description: 'Collision force. Delivered by fast impacts; never lingers.',
    decayPerSec: 99, maxAmount: 3,
  },
];

export const BASE_ELEMENTS = ELEMENTS.filter((e) => e.tier === 'base').map((e) => e.id);
