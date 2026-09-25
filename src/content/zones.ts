import type { ObjectDef, ZoneDef } from './types';

/** Floor/air zones. Zones are reactive holders: elements applied to them can react (e.g. water pool + fire). */
export const ZONES: ZoneDef[] = [
  { id: 'water_pool', name: 'Water Pool', element: 'water', applyAmount: 0.6, tickInterval: 0.25, dps: 0, ballDragMul: 1.25, enemySpeedMul: 0.8, affectsFlying: false, color: '#2f86d6', look: 'pool' },
  { id: 'steam_cloud', name: 'Steam Cloud', element: 'steam', applyAmount: 0.4, tickInterval: 0.6, dps: 4, ballDragMul: 0.9, enemySpeedMul: 0.9, obscures: true, affectsFlying: true, color: '#dde6ee', look: 'cloud' },
  { id: 'ice_patch', name: 'Ice Sheet', element: 'ice', applyAmount: 0.35, tickInterval: 0.4, dps: 0, ballDragMul: 0.25, enemySpeedMul: 0.55, affectsFlying: false, color: '#bdf3ff', look: 'patch' },
  { id: 'magma_pool', name: 'Magma Pool', element: 'magma', applyAmount: 0.5, tickInterval: 0.35, dps: 14, ballDragMul: 1.1, enemySpeedMul: 0.9, affectsFlying: false, color: '#ff4a1c', look: 'pool' },
  { id: 'mud_patch', name: 'Mud', element: 'mud', applyAmount: 0.5, tickInterval: 0.35, dps: 0, ballDragMul: 2.6, enemySpeedMul: 0.4, affectsFlying: false, color: '#6b4a2c', look: 'patch' },
  { id: 'poison_cloud', name: 'Poison Cloud', element: 'poison', applyAmount: 0.25, tickInterval: 0.7, dps: 6, ballDragMul: 1, enemySpeedMul: 1, affectsFlying: true, color: '#7ad62b', look: 'cloud' },
  { id: 'toxic_pool', name: 'Toxic Pool', element: 'poison', applyAmount: 0.4, tickInterval: 0.6, dps: 5, ballDragMul: 1.3, enemySpeedMul: 0.75, affectsFlying: false, color: '#5d9e22', look: 'pool' },
  { id: 'fire_patch', name: 'Flames', element: 'fire', applyAmount: 0.4, tickInterval: 0.6, dps: 8, ballDragMul: 1, enemySpeedMul: 1, affectsFlying: false, color: '#ff7a2b', look: 'patch' },
  { id: 'storm_cloud', name: 'Storm Cloud', element: 'lightning', applyAmount: 0.3, tickInterval: 0.5, dps: 0, ballDragMul: 0.9, enemySpeedMul: 0.9, obscures: true, affectsFlying: true, strikes: { interval: 0.55, damage: 16 }, color: '#e9e27a', look: 'cloud' },
  { id: 'wind_current', name: 'Gust', element: 'wind', applyAmount: 0.4, tickInterval: 0.3, dps: 0, ballDragMul: 0.6, enemySpeedMul: 1, affectsFlying: true, push: 520, color: '#c9ffe0', look: 'current' },
];

/** Placed arena objects: elemental sources, hazards, and destructibles. All are reactive holders. */
export const OBJECTS: ObjectDef[] = [
  { id: 'brazier', name: 'Brazier', radius: 26, element: 'fire', amount: 1, regen: 0.6, tags: ['source', 'metal'], restitution: 0.8, color: '#ff7a2b', look: 'brazier' },
  { id: 'font', name: 'Spring Font', radius: 24, element: 'water', amount: 1, regen: 0.6, tags: ['source'], restitution: 0.8, color: '#3aa7ff', look: 'font' },
  { id: 'coil', name: 'Tesla Coil', radius: 24, element: 'lightning', amount: 1, regen: 0.5, tags: ['source', 'conductive'], restitution: 0.85, color: '#ffe84a', look: 'coil' },
  { id: 'frost_crystal', name: 'Frost Crystal', radius: 24, element: 'ice', amount: 1, regen: 0.5, tags: ['source', 'brittle'], hp: 90, restitution: 0.9, color: '#a8f0ff', look: 'crystal',
    onDestroy: [{ type: 'chain', element: 'ice', amount: 0.8, radius: 150, maxTargets: 6 }, { type: 'spawnZone', zone: 'ice_patch', radius: 110, duration: 10 }] },
  { id: 'iron_post', name: 'Iron Post', radius: 20, element: 'metal', amount: 1, regen: 0.4, tags: ['source', 'conductive'], restitution: 0.95, color: '#b8c2cc', look: 'post' },
  { id: 'boulder', name: 'Boulder', radius: 34, element: 'earth', amount: 1, regen: 0.4, tags: ['source'], restitution: 0.6, color: '#b07a45', look: 'boulder' },
  { id: 'fan', name: 'Gale Fan', radius: 22, element: 'wind', amount: 1, regen: 0.6, tags: ['source'], restitution: 0.85, color: '#b7ffcf', look: 'fan' },
  { id: 'toxic_barrel', name: 'Toxic Barrel', radius: 20, element: 'poison', amount: 1, regen: 0, tags: ['flammable', 'volatile'], hp: 40, restitution: 0.5, color: '#8fe03a', look: 'barrel',
    onDestroy: [{ type: 'spawnZone', zone: 'poison_cloud', radius: 120, duration: 7 }] },
  { id: 'rune', name: 'Arcane Rune', radius: 22, element: 'arcane', amount: 1, regen: 0.35, tags: ['source'], restitution: 0.9, color: '#c77dff', look: 'rune' },
  { id: 'crate', name: 'Dry Crate', radius: 22, amount: 0, regen: 0, tags: ['flammable'], hp: 30, restitution: 0.4, color: '#a07040', look: 'crate' },
  { id: 'bumper', name: 'Bumper', radius: 22, amount: 0, regen: 0, tags: ['elastic'], restitution: 1.35, color: '#ff4fa3', look: 'bumper' },
  // Reaction-made terrain.
  { id: 'obsidian', name: 'Obsidian', radius: 30, amount: 0, regen: 0, tags: ['brittle'], hp: 80, restitution: 1.05, color: '#3a2f4a', look: 'boulder' },
  { id: 'ice_pillar', name: 'Ice Pillar', radius: 24, element: 'ice', amount: 0.6, regen: 0, tags: ['brittle'], hp: 40, restitution: 1.1, color: '#bdf3ff', look: 'crystal' },
];
