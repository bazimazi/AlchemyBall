import type { EnemyDef } from './types';

/** Every enemy teaches or tests one idea about the elemental system (see `lesson`). */
export const ENEMIES: EnemyDef[] = [
  {
    id: 'dummy', name: 'Training Dummy', description: 'A straw target stuffed with alchemical reagent.',
    lesson: 'Launch the ball into targets. Faster impacts hurt more.',
    hp: 40, radius: 24, mass: 3, speed: 0, ai: 'dummy', armor: 0, tags: ['flammable'], contactDamage: 0,
    essence: 1, threat: 1, color: '#d9b77a',
  },
  {
    id: 'slime', name: 'Bog Slime', description: 'A wobbling blob of marsh water. It is always wet.',
    lesson: 'Wet enemies conduct lightning and freeze instantly.',
    hp: 55, radius: 20, mass: 1.2, speed: 75, ai: 'chaser', innate: { element: 'water', amount: 0.8 },
    armor: 0, tags: ['organic', 'wet'], contactDamage: 10, essence: 2, threat: 1, color: '#4fb3ff',
  },
  {
    id: 'imp', name: 'Ember Imp', description: 'A skittering fire sprite that lobs sparks from a distance.',
    lesson: 'Fire enemies ignite you — and ignite each other. Keep moving; you are only vulnerable when slow.',
    hp: 48, radius: 17, mass: 0.8, speed: 90, ai: 'shooter', innate: { element: 'fire', amount: 1 },
    armor: 0, tags: ['organic'], resist: { fire: 0 }, contactDamage: 6,
    projectile: { element: 'fire', speed: 340, damage: 9, interval: 2.1, radius: 7 },
    essence: 3, threat: 2, color: '#ff7a2b',
  },
  {
    id: 'beetle', name: 'Iron Beetle', description: 'A plated beetle. Plain impacts glance off its shell.',
    lesson: 'Armor shrugs off impacts. Heat or poison Exposes it.',
    hp: 120, radius: 25, mass: 4, speed: 60, ai: 'chaser', innate: { element: 'metal', amount: 0.8 },
    armor: 0.75, tags: ['armored', 'conductive'], contactDamage: 15, essence: 4, threat: 3, color: '#9aa6b2',
  },
  {
    id: 'wisp', name: 'Frost Wisp', description: 'A drifting mote of cold that flies over pools and hazards.',
    lesson: 'Flyers ignore floor zones. Hit them directly or catch them in clouds.',
    hp: 42, radius: 16, mass: 0.5, speed: 110, ai: 'flyer', innate: { element: 'ice', amount: 0.8 },
    armor: 0, tags: ['flying', 'brittle'], resist: { ice: 0 }, contactDamage: 7,
    projectile: { element: 'ice', speed: 300, damage: 7, interval: 2.8, radius: 8 },
    essence: 3, threat: 2, color: '#bff4ff',
  },
  {
    id: 'bloat', name: 'Spore Bloat', description: 'A swollen fungus. Bursts into poison when killed.',
    lesson: 'Some enemies turn into hazards. Poison near fire explodes.',
    hp: 65, radius: 24, mass: 2, speed: 45, ai: 'bloat', innate: { element: 'poison', amount: 1 },
    armor: 0, tags: ['organic', 'flammable'], resist: { poison: 0 }, contactDamage: 12,
    onDeath: [{ type: 'spawnZone', zone: 'poison_cloud', radius: 110, duration: 6 }],
    essence: 3, threat: 2, color: '#8fe03a',
  },
  {
    id: 'sentinel', name: 'Coil Sentinel', description: 'A rooted turret that fires charged bolts.',
    lesson: 'Conductive enemies chain lightning. Earth grounds their bolts.',
    hp: 100, radius: 24, mass: 99, speed: 0, ai: 'turret', innate: { element: 'lightning', amount: 0.6 },
    armor: 0.3, tags: ['conductive', 'armored'], resist: { lightning: 0 }, contactDamage: 0,
    projectile: { element: 'lightning', speed: 430, damage: 11, interval: 2, radius: 7 },
    essence: 4, threat: 3, color: '#ffe84a',
  },
  // Elites
  {
    id: 'golem', name: 'Crystal Golem', description: 'Elite. A lumbering construct of living crystal. It adapts to repeated elements.',
    lesson: 'Brittle giants shatter. Adaptive enemies punish one-note builds — vary your elements.',
    hp: 300, radius: 38, mass: 8, speed: 50, ai: 'chaser', armor: 0.3, adaptive: true,
    tags: ['brittle', 'elite'], contactDamage: 20, essence: 12, threat: 7, color: '#c5a3ff',
  },
  {
    id: 'salamander', name: 'Magma Salamander', description: 'Elite. Leaves burning trails and spits magma.',
    lesson: 'Hazard-makers reshape the arena. Water turns their magma into cover.',
    hp: 260, radius: 30, mass: 3, speed: 85, ai: 'shooter', innate: { element: 'fire', amount: 1.2 },
    armor: 0.2, tags: ['elite', 'organic'], resist: { fire: 0, magma: 0 }, contactDamage: 12,
    projectile: { element: 'magma', speed: 260, damage: 10, interval: 2.6, radius: 11 },
    essence: 12, threat: 7, color: '#ff4a1c',
  },
  // Boss body; behaviour and phase tuning come from BOSSES + sim/boss.ts.
  {
    id: 'warden', name: 'The Crucible Warden', description: 'Boss. An animated furnace-cauldron that guards the Cinder Marsh.',
    lesson: 'Read its aura each phase and counter it with what you have learned.',
    hp: 1500, radius: 62, mass: 30, speed: 55, ai: 'dummy', armor: 0.8, tags: ['boss', 'armored', 'conductive'],
    contactDamage: 14, essence: 60, threat: 0, color: '#ff8a3d',
  },
];

/** Boss tuning lives here as data; behaviour is in `sim/boss.ts`. */
export const BOSSES = {
  warden: {
    id: 'warden',
    name: 'The Crucible Warden',
    title: 'Keeper of the Marsh Furnace',
    hp: 1500,
    radius: 62,
    mass: 30,
    phases: [
      { hpAbove: 0.66, armor: 0.8, element: 'metal', slamInterval: 5, summon: 'imp', summonInterval: 9, flaskInterval: 99 },
      { hpAbove: 0.33, armor: 0.5, element: 'fire', slamInterval: 4, summon: 'bloat', summonInterval: 10, flaskInterval: 3.2 },
      { hpAbove: 0, armor: 0.25, element: 'lightning', slamInterval: 3, summon: 'slime', summonInterval: 7, flaskInterval: 2.4 },
    ],
    essence: 60,
    marks: 1,
    lesson: 'Its crucible shell resists raw impacts — heat or corrode it. Each phase changes its aura: read it and counter it.',
  },
} as const;
