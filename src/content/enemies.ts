import type { AffixDef, BossDef, EnemyDef } from './types';

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
  // ── Frostvein Caverns ─────────────────────────────────────────────────────
  {
    id: 'hound', name: 'Rime Hound', description: 'A lean, frost-furred hunter that never stops running.',
    lesson: 'Fast chasers carry cold. Splash one with water and it freezes solid — then shatter it.',
    hp: 50, radius: 18, mass: 1, speed: 135, ai: 'chaser', innate: { element: 'ice', amount: 0.8 },
    armor: 0, tags: ['organic', 'brittle'], resist: { ice: 0 }, contactDamage: 9, essence: 3, threat: 2, color: '#9fe8ff',
  },
  {
    id: 'mireling', name: 'Mire Crawler', description: 'A shuffling heap of cave silt and stone.',
    lesson: 'Earth grounds lightning. Heat turns it to magma; water turns it to mud.',
    hp: 110, radius: 24, mass: 4, speed: 55, ai: 'chaser', innate: { element: 'earth', amount: 0.9 },
    armor: 0.35, tags: ['armored', 'grounded'], resist: { lightning: 0.2 }, contactDamage: 14, essence: 4, threat: 3, color: '#b0844f',
  },
  // ── Storm Spire ───────────────────────────────────────────────────────────
  {
    id: 'kite', name: 'Storm Kite', description: 'A crackling paper-thin flyer riding the updrafts.',
    lesson: 'Flying and charged. Lightning leaps to it through wet allies — and earth grounds its bolts.',
    hp: 40, radius: 16, mass: 0.5, speed: 120, ai: 'flyer', innate: { element: 'lightning', amount: 0.7 },
    armor: 0, tags: ['flying', 'conductive'], resist: { lightning: 0 }, contactDamage: 7,
    projectile: { element: 'lightning', speed: 380, damage: 8, interval: 2.6, radius: 7 },
    essence: 3, threat: 2, color: '#fff27a',
  },
  {
    id: 'mote', name: 'Prism Mote', description: 'A floating shard of raw alchemical light.',
    lesson: 'Arcane amplifies whatever touches it. Strike it while carrying an element to overload it.',
    hp: 45, radius: 15, mass: 0.6, speed: 85, ai: 'shooter', innate: { element: 'arcane', amount: 0.8 },
    armor: 0, tags: ['arcane'], resist: { arcane: 0 }, contactDamage: 6,
    projectile: { element: 'arcane', speed: 300, damage: 8, interval: 2.4, radius: 8 },
    essence: 3, threat: 2, color: '#d59bff',
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
  {
    id: 'rimeguard', name: 'Rime Knight', description: 'Elite. A knight sealed in centuries of ice.',
    lesson: 'Armor shrugs off impacts — but a frozen knight is brittle. Soak it, freeze it, then hit hard.',
    hp: 320, radius: 34, mass: 6, speed: 60, ai: 'chaser', innate: { element: 'ice', amount: 1 },
    armor: 0.6, tags: ['elite', 'armored', 'brittle'], resist: { ice: 0 }, contactDamage: 20, essence: 12, threat: 7, color: '#7fd8ff',
  },
  {
    id: 'conductor', name: 'Storm Conductor', description: 'Elite. A robed engine that orchestrates lightning.',
    lesson: 'Charged and adaptive. Ground it with earth, and keep changing the elements you throw at it.',
    hp: 280, radius: 30, mass: 3, speed: 75, ai: 'shooter', innate: { element: 'lightning', amount: 1.2 }, adaptive: true,
    armor: 0.3, tags: ['elite', 'conductive'], resist: { lightning: 0 }, contactDamage: 12,
    projectile: { element: 'lightning', speed: 420, damage: 12, interval: 1.8, radius: 8 },
    essence: 12, threat: 7, color: '#ffd84a',
  },
  // Boss bodies; behaviour and phase tuning come from BOSSES + sim/boss.ts.
  {
    id: 'warden', name: 'The Crucible Warden', description: 'Boss. An animated furnace-cauldron that guards the Cinder Marsh.',
    lesson: 'Read its aura each phase and counter it with what you have learned.',
    hp: 1500, radius: 62, mass: 30, speed: 55, ai: 'dummy', armor: 0.8, tags: ['boss', 'armored', 'conductive'],
    contactDamage: 14, essence: 60, threat: 0, color: '#ff8a3d',
  },
  {
    id: 'matriarch', name: 'The Rime Matriarch', description: 'Boss. The frozen queen of the Frostvein Caverns.',
    lesson: 'Melt her ice, freeze her water, and beware her wind.',
    hp: 1900, radius: 58, mass: 28, speed: 50, ai: 'dummy', armor: 0.55, tags: ['boss', 'brittle'],
    contactDamage: 15, essence: 75, threat: 0, color: '#9fe8ff',
  },
  {
    id: 'tempest', name: 'The Tempest Engine', description: 'Boss. The storm-forged heart of the Spire.',
    lesson: 'Ground its charge, corrode its plating, and outlast its arcane overload.',
    hp: 2300, radius: 60, mass: 32, speed: 55, ai: 'dummy', armor: 0.6, tags: ['boss', 'armored', 'conductive'],
    contactDamage: 16, essence: 90, threat: 0, color: '#ffe84a',
  },
];

/** Boss tuning lives here as data; behaviour is in `sim/boss.ts`. */
export const BOSSES: Record<string, BossDef> = {
  warden: {
    id: 'warden',
    name: 'The Crucible Warden',
    title: 'Keeper of the Marsh Furnace',
    hp: 1500,
    radius: 62,
    mass: 30,
    phases: [
      { hpAbove: 0.66, armor: 0.8, element: 'metal', slamInterval: 5, summon: 'imp', summonInterval: 9, flaskInterval: 99 },
      { hpAbove: 0.33, armor: 0.5, element: 'fire', slamInterval: 4, summon: 'bloat', summonInterval: 10, flaskInterval: 3.2, flaskZone: 'fire_patch' },
      { hpAbove: 0, armor: 0.25, element: 'lightning', slamInterval: 3, summon: 'slime', summonInterval: 7, flaskInterval: 2.4, flaskZone: 'storm_cloud' },
    ],
    essence: 60,
    marks: 1,
    lesson: 'Its crucible shell resists raw impacts — heat or corrode it. Each phase changes its aura: read it and counter it.',
    arena: {
      objects: [{ id: 'brazier', x: 0.12, y: 0.55 }, { id: 'font', x: 0.88, y: 0.55 }, { id: 'boulder', x: 0.5, y: 0.66 }, { id: 'toxic_barrel', x: 0.2, y: 0.36 }, { id: 'coil', x: 0.8, y: 0.36 }],
      zones: [{ id: 'water_pool', x: 0.28, y: 0.74, r: 80 }, { id: 'water_pool', x: 0.72, y: 0.74, r: 80 }],
    },
  },
  matriarch: {
    id: 'matriarch',
    name: 'The Rime Matriarch',
    title: 'Mother of the Frozen Deep',
    hp: 1900,
    radius: 58,
    mass: 28,
    phases: [
      { hpAbove: 0.66, armor: 0.55, element: 'ice', slamInterval: 5.5, summon: 'hound', summonInterval: 9, flaskInterval: 99, nova: { interval: 6, count: 10, speed: 300, damage: 9, element: 'ice' } },
      { hpAbove: 0.33, armor: 0.35, element: 'water', slamInterval: 4.5, summon: 'slime', summonInterval: 9, flaskInterval: 99, nova: { interval: 5, count: 12, speed: 320, damage: 9, element: 'water' }, chargeInterval: 7 },
      { hpAbove: 0, armor: 0.2, element: 'wind', slamInterval: 3.6, summon: 'wisp', summonInterval: 8, flaskInterval: 4, flaskZone: 'wind_current', nova: { interval: 4.5, count: 14, speed: 340, damage: 8, element: 'ice' }, chargeInterval: 6 },
    ],
    essence: 75,
    marks: 1,
    lesson: 'Ice shell: melt it with fire. Water phase: freeze or electrify her. Wind phase: she spreads whatever you bring.',
    arena: {
      objects: [{ id: 'brazier', x: 0.15, y: 0.5 }, { id: 'brazier', x: 0.85, y: 0.5 }, { id: 'coil', x: 0.5, y: 0.62 }, { id: 'boulder', x: 0.25, y: 0.76 }, { id: 'frost_crystal', x: 0.75, y: 0.76 }],
      zones: [{ id: 'water_pool', x: 0.5, y: 0.86, r: 80 }],
    },
  },
  tempest: {
    id: 'tempest',
    name: 'The Tempest Engine',
    title: 'Heart of the Storm Spire',
    hp: 2300,
    radius: 60,
    mass: 32,
    phases: [
      { hpAbove: 0.66, armor: 0.6, element: 'lightning', slamInterval: 5, summon: 'kite', summonInterval: 9, flaskInterval: 3.5, flaskZone: 'storm_cloud', nova: { interval: 7, count: 8, speed: 380, damage: 10, element: 'lightning' } },
      { hpAbove: 0.33, armor: 0.75, element: 'metal', slamInterval: 4, summon: 'beetle', summonInterval: 11, flaskInterval: 99, nova: { interval: 5, count: 12, speed: 360, damage: 10, element: 'metal' }, chargeInterval: 6 },
      { hpAbove: 0, armor: 0.3, element: 'arcane', slamInterval: 3.2, summon: 'mote', summonInterval: 8, flaskInterval: 3, flaskZone: 'storm_cloud', nova: { interval: 4, count: 16, speed: 400, damage: 9, element: 'arcane' }, chargeInterval: 5 },
    ],
    essence: 90,
    marks: 2,
    lesson: 'Ground its charge with earth, heat or corrode its metal plating, and bring your strongest element for the arcane finale.',
    arena: {
      objects: [{ id: 'boulder', x: 0.2, y: 0.6 }, { id: 'boulder', x: 0.8, y: 0.6 }, { id: 'brazier', x: 0.5, y: 0.72 }, { id: 'toxic_barrel', x: 0.25, y: 0.36 }, { id: 'font', x: 0.75, y: 0.36 }],
      zones: [{ id: 'water_pool', x: 0.5, y: 0.86, r: 80 }],
    },
  },
};

/** Affixes make elites (and, at high Heat, ordinary foes) demand a different approach. */
export const AFFIXES: AffixDef[] = [
  { id: 'shielded', name: 'Shielded', description: 'A ward absorbs damage until broken.', color: '#bdf3ff', glyph: '⬡' },
  { id: 'swift', name: 'Swift', description: 'Moves 40% faster.', color: '#b7ffcf', glyph: '»' },
  { id: 'volatile', name: 'Volatile', description: 'Explodes after death — get clear of the ring.', color: '#ff7a2b', glyph: '✹' },
  { id: 'regenerating', name: 'Regenerating', description: 'Heals when left alone for a moment.', color: '#7be07b', glyph: '✚' },
  { id: 'insulated', name: 'Insulated', description: 'Immune to your core element. Borrow another.', color: '#c9a6ff', glyph: '⊘' },
  { id: 'enraged', name: 'Enraged', description: 'Hits 35% harder.', color: '#ff5a5a', glyph: '‼' },
];
