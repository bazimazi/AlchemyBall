import type { AspectDef, HeatLevelDef, RegionDef, ResearchNode } from './types';

/**
 * Permanent research. Nodes expand options (new cores, slots, lab tools, modes, room types)
 * rather than inflating stats. Costs lean on Research Fragments (earned by discovery) so
 * experimenting is the fastest route to progress; Mastery Marks (boss wins) buy the late game.
 */
export const RESEARCH: ResearchNode[] = [
  // Elements branch — each unlocks a core and its element as a carryable core.
  { id: 'res_frost', name: 'Cryology', branch: 'elements', cost: { fragments: 10 }, requires: [], grants: 'Frost Core (Ice)', description: 'Study the cold. Unlocks the Frost Core. Frost Crystals already appear in the wild.' },
  { id: 'res_storm', name: 'Galvanics', branch: 'elements', cost: { fragments: 12 }, requires: [], grants: 'Storm Core (Lightning)', description: 'Harness charge. Unlocks the Storm Core. Coils already appear in the wild.' },
  { id: 'res_iron', name: 'Metallurgy', branch: 'elements', cost: { fragments: 14 }, requires: ['res_storm'], grants: 'Iron Core (Metal)', description: 'Heavy alchemy. Unlocks the Iron Core.' },
  { id: 'res_toxin', name: 'Toxicology', branch: 'elements', cost: { fragments: 14 }, requires: ['res_frost'], grants: 'Venom Core (Poison)', description: 'Corrosive arts. Unlocks the Venom Core.' },
  { id: 'res_earth', name: 'Geomancy', branch: 'elements', cost: { fragments: 16, essence: 40 }, requires: ['res_iron'], grants: 'Stone Core (Earth)', description: 'Shape the ground. Unlocks the Stone Core. Boulders already appear in the wild.' },
  { id: 'res_gale', name: 'Aeromancy', branch: 'elements', cost: { fragments: 16, essence: 40 }, requires: ['res_toxin'], grants: 'Gale Core (Wind)', description: 'Ride the air. Unlocks the Gale Core. Gale Fans already appear in the wild.' },
  { id: 'res_arcane', name: 'Arcanology', branch: 'elements', cost: { fragments: 30, marks: 1 }, requires: ['res_earth', 'res_gale'], grants: 'Prism Core (Arcane)', description: 'The root of alchemy. Unlocks the Prism Core. Runes already appear in the wild.' },
  // Ball branch — slots and physical options.
  { id: 'res_shells', name: 'Shellcraft', branch: 'ball', cost: { essence: 60 }, requires: [], grants: 'Shell slot: Gum & Lead shells', description: 'Unlocks the Shell slot with two shells that change mass and bounce.' },
  { id: 'res_shells2', name: 'Thornwork', branch: 'ball', cost: { essence: 90, fragments: 8 }, requires: ['res_shells'], grants: 'Thorn Shell', description: 'A defensive shell for close-quarters builds.' },
  { id: 'res_pip', name: 'Second Wind', branch: 'ball', cost: { essence: 80 }, requires: [], grants: '+1 starting launch pip', description: 'A deeper reservoir of launch charge. Changes how aggressively you can reposition.' },
  { id: 'res_reroll', name: 'Transmuted Choice', branch: 'ball', cost: { essence: 50 }, requires: [], grants: '1 upgrade reroll per run', description: 'Once per run, reroll an upgrade offer.' },
  { id: 'res_reroll2', name: 'Fickle Fortune', branch: 'ball', cost: { essence: 160 }, requires: ['res_reroll'], grants: '+1 reroll per run', description: 'A second free reroll each run.' },
  { id: 'res_banish', name: 'Rite of Banishment', branch: 'ball', cost: { essence: 120, fragments: 10 }, requires: ['res_reroll'], grants: '2 banishes per run', description: 'Remove an upgrade from this run’s offers entirely, and replace it.' },
  { id: 'res_catalyst_slot', name: 'Catalyst Socket', branch: 'ball', cost: { fragments: 18, essence: 60 }, requires: ['res_shells'], grants: 'Start runs with a chosen common upgrade', description: 'Socket a known upgrade into the ball before the run starts.' },
  { id: 'res_evolutions', name: 'Magnum Opus', branch: 'ball', cost: { marks: 2, fragments: 20 }, requires: [], grants: 'Evolutions appear in Reliquaries & elite rewards', description: 'Hold two related upgrades at full strength and they can fuse into a legendary Evolution.' },
  // Lab branch — discovery tools.
  { id: 'res_lab', name: 'Field Laboratory', branch: 'lab', cost: { fragments: 6 }, requires: [], grants: 'Laboratory sandbox', description: 'A safe arena with every element source you have unlocked. Experiment freely.' },
  { id: 'res_hints', name: 'Annotated Codex', branch: 'lab', cost: { fragments: 8 }, requires: ['res_lab'], grants: 'Hints for all undiscovered reactions whose inputs you know', description: 'The Codex shows hints for every reaction between elements you have seen.' },
  { id: 'res_scanner', name: 'Reagent Lens', branch: 'lab', cost: { fragments: 12, essence: 30 }, requires: ['res_hints'], grants: 'Aim preview names the reaction you will cause', description: 'While aiming, the first foe on your path shows the reaction your ball would trigger — or “?” if it is undiscovered.' },
  // World branch
  { id: 'res_daily', name: 'Daily Experiment', branch: 'world', cost: { essence: 40 }, requires: [], grants: 'Daily seeded challenge', description: 'A fixed daily run with a set core and a daily mutator, identical for everyone.' },
  { id: 'res_heat', name: 'Unstable Crucible', branch: 'world', cost: { marks: 1 }, requires: [], grants: 'Heat ladder (10 challenge levels)', description: 'Raise the Heat for harder runs, more Essence and more Mastery Marks.' },
  { id: 'res_merchant', name: 'Wandering Merchant', branch: 'world', cost: { essence: 100 }, requires: [], grants: 'Merchant rooms on the map', description: 'A travelling alchemist sells upgrades and remedies for Catalysts.' },
  { id: 'res_events', name: 'Strange Phenomena', branch: 'world', cost: { fragments: 20 }, requires: ['res_lab'], grants: 'Anomaly rooms on the map', description: 'Unexplained alchemical events: risky bargains, odd gifts and rare finds.' },
  { id: 'res_endless', name: 'The Abyssal Descent', branch: 'world', cost: { marks: 1, essence: 150 }, requires: ['res_heat'], grants: 'Endless mode', description: 'Descend through every region without end. Each loop is harder. How deep can you go?' },
];

const MARSH_PALETTE = { bg: '#0d0f14', floor: '#171c22', wall: '#3a4452', accent: '#ff8a3d', light: '#ff9a4a', motes: ['#a4d8ca', '#ffba79'] };

export const REGIONS: RegionDef[] = [
  {
    id: 'cinder_marsh',
    name: 'The Cinder Marsh',
    description: 'A steaming wetland around an old alchemical furnace. Pools, braziers and spore-rot everywhere.',
    flavor: 'Fire · Water · Poison',
    floors: 7,
    tier: 0,
    enemyPool: [
      { id: 'slime', weight: 5, minFloor: 0 },
      { id: 'imp', weight: 4, minFloor: 0 },
      { id: 'bloat', weight: 3, minFloor: 1 },
      { id: 'beetle', weight: 3, minFloor: 1 },
      { id: 'wisp', weight: 3, minFloor: 2 },
      { id: 'sentinel', weight: 2, minFloor: 3 },
    ],
    elitePool: ['golem', 'salamander'],
    boss: 'warden',
    palette: MARSH_PALETTE,
    templates: [
      {
        id: 'twin_pools',
        objects: [{ id: 'brazier', x: 0.5, y: 0.5 }, { id: 'bumper', x: 0.2, y: 0.25 }, { id: 'bumper', x: 0.8, y: 0.75 }],
        zones: [{ id: 'water_pool', x: 0.25, y: 0.62, r: 90 }, { id: 'water_pool', x: 0.75, y: 0.38, r: 90 }],
      },
      {
        id: 'furnace_row',
        objects: [{ id: 'brazier', x: 0.2, y: 0.4 }, { id: 'brazier', x: 0.8, y: 0.4 }, { id: 'toxic_barrel', x: 0.5, y: 0.3 }, { id: 'crate', x: 0.35, y: 0.62 }, { id: 'crate', x: 0.65, y: 0.62 }],
        zones: [{ id: 'water_pool', x: 0.5, y: 0.75, r: 100 }],
      },
      {
        id: 'coil_yard',
        objects: [{ id: 'coil', x: 0.5, y: 0.35 }, { id: 'font', x: 0.2, y: 0.7 }, { id: 'iron_post', x: 0.8, y: 0.7 }, { id: 'bumper', x: 0.5, y: 0.62 }],
        zones: [{ id: 'water_pool', x: 0.5, y: 0.52, r: 110 }],
        walls: [{ x1: 0.1, y1: 0.5, x2: 0.28, y2: 0.5, material: 'metal' }, { x1: 0.72, y1: 0.5, x2: 0.9, y2: 0.5, material: 'metal' }],
      },
      {
        id: 'frost_garden',
        objects: [{ id: 'frost_crystal', x: 0.3, y: 0.35 }, { id: 'frost_crystal', x: 0.7, y: 0.65 }, { id: 'brazier', x: 0.75, y: 0.28 }],
        zones: [{ id: 'water_pool', x: 0.3, y: 0.66, r: 95 }, { id: 'water_pool', x: 0.72, y: 0.45, r: 70 }],
      },
      {
        id: 'spore_bog',
        objects: [{ id: 'toxic_barrel', x: 0.25, y: 0.3 }, { id: 'toxic_barrel', x: 0.75, y: 0.3 }, { id: 'brazier', x: 0.5, y: 0.2 }, { id: 'fan', x: 0.5, y: 0.7 }],
        zones: [{ id: 'water_pool', x: 0.5, y: 0.48, r: 90 }],
        walls: [{ x1: 0.3, y1: 0.58, x2: 0.42, y2: 0.62, material: 'bumper' }, { x1: 0.58, y1: 0.62, x2: 0.7, y2: 0.58, material: 'bumper' }],
      },
      {
        id: 'quarry',
        objects: [{ id: 'boulder', x: 0.3, y: 0.3 }, { id: 'boulder', x: 0.7, y: 0.6 }, { id: 'brazier', x: 0.7, y: 0.3 }, { id: 'font', x: 0.3, y: 0.62 }],
        zones: [],
      },
      {
        id: 'open_marsh',
        objects: [{ id: 'bumper', x: 0.3, y: 0.3 }, { id: 'bumper', x: 0.7, y: 0.3 }, { id: 'bumper', x: 0.5, y: 0.55 }, { id: 'rune', x: 0.5, y: 0.25 }],
        zones: [{ id: 'water_pool', x: 0.2, y: 0.7, r: 80 }, { id: 'water_pool', x: 0.8, y: 0.7, r: 80 }, { id: 'toxic_pool', x: 0.5, y: 0.82, r: 60 }],
      },
    ],
  },
  {
    id: 'frostvein',
    name: 'Frostvein Caverns',
    description: 'Glittering ice caves beneath the marsh. Frozen lakes make the ball skate; crystals sing when struck.',
    flavor: 'Ice · Water · Earth',
    floors: 7,
    tier: 1,
    requiresBoss: 'warden',
    enemyPool: [
      { id: 'slime', weight: 4, minFloor: 0 },
      { id: 'hound', weight: 4, minFloor: 0 },
      { id: 'wisp', weight: 3, minFloor: 1 },
      { id: 'mireling', weight: 3, minFloor: 1 },
      { id: 'beetle', weight: 2, minFloor: 2 },
      { id: 'bloat', weight: 2, minFloor: 3 },
      { id: 'sentinel', weight: 1, minFloor: 4 },
    ],
    elitePool: ['rimeguard', 'golem'],
    boss: 'matriarch',
    palette: { bg: '#060c15', floor: '#152230', wall: '#4a6478', accent: '#7fd8ff', light: '#9fe8ff', motes: ['#e6f7ff', '#bfe9ff'] },
    templates: [
      {
        id: 'glacier_hall',
        objects: [{ id: 'frost_crystal', x: 0.25, y: 0.3 }, { id: 'frost_crystal', x: 0.75, y: 0.3 }, { id: 'brazier', x: 0.5, y: 0.55 }],
        zones: [{ id: 'ice_patch', x: 0.5, y: 0.76, r: 110 }, { id: 'water_pool', x: 0.2, y: 0.6, r: 70 }],
      },
      {
        id: 'thaw_pools',
        objects: [{ id: 'font', x: 0.5, y: 0.33 }, { id: 'brazier', x: 0.2, y: 0.72 }, { id: 'bumper', x: 0.8, y: 0.55 }],
        zones: [{ id: 'water_pool', x: 0.3, y: 0.46, r: 90 }, { id: 'water_pool', x: 0.7, y: 0.72, r: 90 }],
      },
      {
        id: 'crystal_maze',
        objects: [{ id: 'frost_crystal', x: 0.5, y: 0.3 }, { id: 'boulder', x: 0.28, y: 0.56 }, { id: 'boulder', x: 0.72, y: 0.56 }, { id: 'iron_post', x: 0.5, y: 0.74 }],
        zones: [{ id: 'ice_patch', x: 0.5, y: 0.56, r: 70 }],
        walls: [{ x1: 0.12, y1: 0.42, x2: 0.34, y2: 0.42, material: 'metal' }, { x1: 0.66, y1: 0.42, x2: 0.88, y2: 0.42, material: 'metal' }],
      },
      {
        id: 'silt_cavern',
        objects: [{ id: 'boulder', x: 0.25, y: 0.35 }, { id: 'font', x: 0.75, y: 0.35 }, { id: 'brazier', x: 0.5, y: 0.62 }],
        zones: [{ id: 'mud_patch', x: 0.28, y: 0.72, r: 80 }, { id: 'water_pool', x: 0.72, y: 0.62, r: 80 }],
      },
      {
        id: 'wind_tunnel',
        objects: [{ id: 'fan', x: 0.5, y: 0.72 }, { id: 'frost_crystal', x: 0.2, y: 0.4 }, { id: 'frost_crystal', x: 0.8, y: 0.4 }, { id: 'bumper', x: 0.5, y: 0.46 }],
        zones: [{ id: 'water_pool', x: 0.5, y: 0.24, r: 80 }],
        walls: [{ x1: 0.32, y1: 0.6, x2: 0.4, y2: 0.66, material: 'bumper' }, { x1: 0.6, y1: 0.66, x2: 0.68, y2: 0.6, material: 'bumper' }],
      },
      {
        id: 'frozen_lake',
        objects: [{ id: 'coil', x: 0.5, y: 0.28 }, { id: 'font', x: 0.18, y: 0.66 }, { id: 'brazier', x: 0.82, y: 0.66 }],
        zones: [{ id: 'ice_patch', x: 0.5, y: 0.52, r: 150 }],
      },
    ],
  },
  {
    id: 'storm_spire',
    name: 'The Storm Spire',
    description: 'A lightning-wracked tower of copper and runes. Everything here is charged — including you.',
    flavor: 'Lightning · Metal · Arcane',
    floors: 7,
    tier: 2,
    requiresBoss: 'matriarch',
    enemyPool: [
      { id: 'kite', weight: 4, minFloor: 0 },
      { id: 'slime', weight: 3, minFloor: 0 },
      { id: 'imp', weight: 3, minFloor: 0 },
      { id: 'mote', weight: 3, minFloor: 1 },
      { id: 'beetle', weight: 3, minFloor: 1 },
      { id: 'sentinel', weight: 3, minFloor: 2 },
      { id: 'mireling', weight: 2, minFloor: 2 },
      { id: 'wisp', weight: 2, minFloor: 3 },
    ],
    elitePool: ['conductor', 'golem', 'salamander'],
    boss: 'tempest',
    palette: { bg: '#0b0a13', floor: '#1b1a27', wall: '#565070', accent: '#ffe84a', light: '#c9a6ff', motes: ['#fff27a', '#d59bff'] },
    templates: [
      {
        id: 'coil_array',
        objects: [{ id: 'coil', x: 0.25, y: 0.3 }, { id: 'coil', x: 0.75, y: 0.3 }, { id: 'boulder', x: 0.5, y: 0.62 }, { id: 'font', x: 0.5, y: 0.36 }],
        zones: [{ id: 'water_pool', x: 0.5, y: 0.48, r: 85 }],
      },
      {
        id: 'rune_circle',
        objects: [{ id: 'rune', x: 0.5, y: 0.3 }, { id: 'iron_post', x: 0.2, y: 0.6 }, { id: 'iron_post', x: 0.8, y: 0.6 }, { id: 'bumper', x: 0.5, y: 0.6 }],
        zones: [{ id: 'water_pool', x: 0.5, y: 0.45, r: 90 }],
      },
      {
        id: 'conductor_bridge',
        objects: [{ id: 'coil', x: 0.5, y: 0.25 }, { id: 'iron_post', x: 0.3, y: 0.52 }, { id: 'iron_post', x: 0.7, y: 0.52 }, { id: 'font', x: 0.5, y: 0.72 }],
        zones: [{ id: 'water_pool', x: 0.5, y: 0.56, r: 80 }],
        walls: [{ x1: 0.08, y1: 0.4, x2: 0.28, y2: 0.45, material: 'metal' }, { x1: 0.72, y1: 0.45, x2: 0.92, y2: 0.4, material: 'metal' }],
      },
      {
        id: 'arcane_forge',
        objects: [{ id: 'rune', x: 0.3, y: 0.3 }, { id: 'brazier', x: 0.7, y: 0.3 }, { id: 'boulder', x: 0.5, y: 0.58 }, { id: 'toxic_barrel', x: 0.2, y: 0.66 }, { id: 'toxic_barrel', x: 0.8, y: 0.66 }],
        zones: [{ id: 'water_pool', x: 0.5, y: 0.8, r: 70 }],
      },
      {
        id: 'gale_gallery',
        objects: [{ id: 'fan', x: 0.18, y: 0.5 }, { id: 'fan', x: 0.82, y: 0.5 }, { id: 'coil', x: 0.5, y: 0.3 }, { id: 'bumper', x: 0.35, y: 0.7 }, { id: 'bumper', x: 0.65, y: 0.7 }],
        zones: [{ id: 'water_pool', x: 0.5, y: 0.5, r: 70 }],
      },
      {
        id: 'storm_eye',
        objects: [{ id: 'rune', x: 0.5, y: 0.5 }, { id: 'coil', x: 0.2, y: 0.3 }, { id: 'coil', x: 0.8, y: 0.3 }, { id: 'boulder', x: 0.2, y: 0.74 }, { id: 'boulder', x: 0.8, y: 0.74 }],
        zones: [{ id: 'water_pool', x: 0.5, y: 0.26, r: 70 }],
      },
    ],
  },
  {
    id: 'umbral_archive',
    name: 'The Umbral Archive',
    description: 'The Tempest Engine sealed a vault of volatile reagents. Bank between its shelves and follow the eclipse.',
    flavor: 'Poison · Wind · Arcane',
    floors: 7,
    tier: 3,
    requiresBoss: 'tempest',
    enemyPool: [
      { id: 'scribe', weight: 5, minFloor: 0 },
      { id: 'bloat', weight: 4, minFloor: 0 },
      { id: 'imp', weight: 3, minFloor: 0 },
      { id: 'mote', weight: 3, minFloor: 1 },
      { id: 'hound', weight: 3, minFloor: 1 },
      { id: 'sentinel', weight: 2, minFloor: 2 },
      { id: 'beetle', weight: 2, minFloor: 2 },
    ],
    elitePool: ['inkwarden', 'golem', 'conductor'],
    boss: 'orrery',
    palette: { bg: '#0f0b19', floor: '#1c162d', wall: '#61527d', accent: '#c298ff', light: '#92dbc1', motes: ['#b78cf4', '#8df0c2'] },
    templates: [
      {
        id: 'archive_stacks',
        objects: [{ id: 'rune', x: 0.5, y: 0.3 }, { id: 'toxic_barrel', x: 0.24, y: 0.44 }, { id: 'brazier', x: 0.76, y: 0.55 }],
        zones: [{ id: 'water_pool', x: 0.35, y: 0.66, r: 76 }],
        walls: [{ x1: 0.18, y1: 0.25, x2: 0.18, y2: 0.42, material: 'metal' }, { x1: 0.82, y1: 0.63, x2: 0.82, y2: 0.78, material: 'metal' }],
      },
      {
        id: 'sealed_rotunda',
        objects: [{ id: 'font', x: 0.5, y: 0.4 }, { id: 'fan', x: 0.18, y: 0.67 }, { id: 'toxic_barrel', x: 0.82, y: 0.38 }, { id: 'bumper', x: 0.5, y: 0.65 }],
        zones: [{ id: 'ice_patch', x: 0.5, y: 0.62, r: 104 }, { id: 'toxic_pool', x: 0.5, y: 0.3, r: 70 }],
      },
      {
        id: 'eclipse_causeway',
        objects: [{ id: 'brazier', x: 0.2, y: 0.66 }, { id: 'rune', x: 0.8, y: 0.66 }, { id: 'fan', x: 0.5, y: 0.37 }],
        zones: [{ id: 'wind_current', x: 0.5, y: 0.5, r: 88 }],
        walls: [{ x1: 0.11, y1: 0.46, x2: 0.31, y2: 0.5, material: 'bumper' }, { x1: 0.69, y1: 0.5, x2: 0.89, y2: 0.46, material: 'bumper' }],
      },
      {
        id: 'ink_vault',
        objects: [{ id: 'toxic_barrel', x: 0.28, y: 0.35 }, { id: 'toxic_barrel', x: 0.72, y: 0.35 }, { id: 'brazier', x: 0.5, y: 0.6 }, { id: 'frost_crystal', x: 0.25, y: 0.7 }, { id: 'fan', x: 0.75, y: 0.7 }],
        zones: [{ id: 'water_pool', x: 0.5, y: 0.38, r: 76 }],
      },
    ],
  },
];

/**
 * The Heat ladder is cumulative (Slay the Spire Ascension / Hades Pact style): Heat N applies
 * every modifier from 1..N. Rewards scale with Heat; records are kept per core.
 */
export const HEAT_LEVELS: HeatLevelDef[] = [
  { level: 1, name: 'Unstable', description: 'Encounters field more enemies.' },
  { level: 2, name: 'Brittle Glass', description: 'Your ball starts with 10 less max HP.' },
  { level: 3, name: 'Hardened Foes', description: 'Enemies have 15% more HP.' },
  { level: 4, name: 'Empowered Elites', description: 'Elites gain an extra affix.' },
  { level: 5, name: 'Restless', description: 'Enemies move 15% faster.' },
  { level: 6, name: 'Scarce Springs', description: 'Still Springs and room clears heal less.' },
  { level: 7, name: 'Volatile Wilds', description: 'Ordinary foes may carry affixes.' },
  { level: 8, name: 'Wrathful Guardians', description: 'Bosses have 25% more HP and attack faster.' },
  { level: 9, name: 'Thin Reserves', description: 'Launch pips recharge 15% slower.' },
  { level: 10, name: 'Crucible Unbound', description: 'Enemies deal 25% more damage.' },
];
export const MAX_HEAT = HEAT_LEVELS.length;

/** Aspects: each core has its default form plus two alternatives unlocked by core mastery. */
export const ASPECTS: AspectDef[] = [
  { id: 'ember_pure', core: 'ember', name: 'Aspect of Flame', description: 'The classic Ember Core.', level: 0, mods: {} },
  { id: 'ember_cinder', core: 'ember', name: 'Aspect of Cinders', description: 'Foes you kill burst with your fire, spreading it to their neighbours.', level: 3, mods: { killNova: 1 } },
  { id: 'ember_forge', core: 'ember', name: 'Aspect of the Forge', description: '+30% impact damage and burns hit 50% harder, but −10 max HP.', level: 6, mods: { impactDmg: 0.3, burnDps: 0.5, maxHp: -10 } },
  { id: 'tide_pure', core: 'tide', name: 'Aspect of the Tide', description: 'The classic Tide Core.', level: 0, mods: {} },
  { id: 'tide_undertow', core: 'tide', name: 'Aspect of the Undertow', description: 'Launching splashes water on nearby foes; +30% element transfer.', level: 3, mods: { launchNova: 1, auraTransfer: 0.3 } },
  { id: 'tide_wellspring', core: 'tide', name: 'Aspect of the Wellspring', description: 'Each reaction heals 1 HP; +15 max HP.', level: 6, mods: { lifesteal: 1, maxHp: 15 } },
  { id: 'storm_pure', core: 'storm', name: 'Aspect of Storms', description: 'The classic Storm Core.', level: 0, mods: {} },
  { id: 'storm_tempest', core: 'storm', name: 'Aspect of the Tempest', description: 'While charged, every hit arcs to a nearby foe.', level: 3, mods: { arcOnHit: 1 } },
  { id: 'storm_overload', core: 'storm', name: 'Aspect of Overload', description: 'Lightning reactions +40% damage; pips recharge 20% faster.', level: 6, mods: { lightningDmg: 0.4, pipRegen: 0.2 } },
  { id: 'frost_pure', core: 'frost', name: 'Aspect of Frost', description: 'The classic Frost Core.', level: 0, mods: {} },
  { id: 'frost_glacier', core: 'frost', name: 'Aspect of the Glacier', description: 'Freeze lasts 40% longer and ice reactions grant a small shield.', level: 3, mods: { freezeDuration: 0.4, iceArmor: 6 } },
  { id: 'frost_splinter', core: 'frost', name: 'Aspect of Splinters', description: 'Shatter deals +80% damage; 10% impact crit chance.', level: 6, mods: { shatterDmg: 0.8, critChance: 0.1 } },
  { id: 'iron_pure', core: 'iron', name: 'Aspect of Iron', description: 'The classic Iron Core.', level: 0, mods: {} },
  { id: 'iron_bulwark', core: 'iron', name: 'Aspect of the Bulwark', description: 'Foes that touch you take 15 damage; −20% contact damage while heavy.', level: 3, mods: { thorns: 15, heavyGuard: 0.2 } },
  { id: 'iron_wrecking', core: 'iron', name: 'Aspect of the Wrecking Ball', description: 'Each wall bounce adds +10% impact damage; +20% impact damage.', level: 6, mods: { ricochet: 0.1, impactDmg: 0.2 } },
  { id: 'venom_pure', core: 'venom', name: 'Aspect of Venom', description: 'The classic Venom Core.', level: 0, mods: {} },
  { id: 'venom_bloom', core: 'venom', name: 'Aspect of the Bloom', description: 'Poisoned foes burst into toxic clouds when they die.', level: 3, mods: { toxicBloom: 1 } },
  { id: 'venom_caustic', core: 'venom', name: 'Aspect of Caustics', description: 'Poison deals +80% damage; your zones last 30% longer.', level: 6, mods: { poisonDps: 0.8, zoneDuration: 0.3 } },
  { id: 'gale_pure', core: 'gale', name: 'Aspect of the Gale', description: 'The classic Gale Core.', level: 0, mods: {} },
  { id: 'gale_slipstream', core: 'gale', name: 'Aspect of the Slipstream', description: 'At high speed you leave a wake of whatever element you carry.', level: 3, mods: { trail: 1 } },
  { id: 'gale_tempo', core: 'gale', name: 'Aspect of Tempo', description: 'Pips recharge 30% faster; +3% damage per combo step.', level: 6, mods: { pipRegen: 0.3, comboDmg: 0.03 } },
  { id: 'stone_pure', core: 'stone', name: 'Aspect of Stone', description: 'The classic Stone Core.', level: 0, mods: {} },
  { id: 'stone_bedrock', core: 'stone', name: 'Aspect of Bedrock', description: 'Each wave begins with a 12 HP shield; −20% contact damage while heavy.', level: 3, mods: { waveShield: 12, heavyGuard: 0.2 } },
  { id: 'stone_tremor', core: 'stone', name: 'Aspect of Tremors', description: 'Braking releases a powerful quake.', level: 6, mods: { brakeNova: 1.5 } },
  { id: 'prism_pure', core: 'prism', name: 'Aspect of the Prism', description: 'The classic Prism Core.', level: 0, mods: {} },
  { id: 'prism_refraction', core: 'prism', name: 'Aspect of Refraction', description: 'All reactions deal +30% damage.', level: 3, mods: { reactionDmg: 0.3 } },
  { id: 'prism_flux', core: 'prism', name: 'Aspect of Flux', description: '+60% element transfer and your core regenerates twice as fast.', level: 6, mods: { auraTransfer: 0.6, coreRegen: 1 } },
];

/** Per-core mastery levels (XP needed for each level 2..10) and what each grants. */
export const CORE_LEVELS: { level: number; xp: number; reward: string }[] = [
  { level: 1, xp: 0, reward: '' },
  { level: 2, xp: 40, reward: 'Core trail colour' },
  { level: 3, xp: 110, reward: 'Second aspect' },
  { level: 4, xp: 210, reward: '+25 Essence' },
  { level: 5, xp: 340, reward: '+1 free reroll with this core' },
  { level: 6, xp: 500, reward: 'Third aspect' },
  { level: 7, xp: 700, reward: '+10 Fragments' },
  { level: 8, xp: 950, reward: 'Core title' },
  { level: 9, xp: 1250, reward: '+50 Essence' },
  { level: 10, xp: 1600, reward: 'Gilded core skin' },
];

/** Player mastery levels: each level grants something to do or show, not raw stats. */
export const MASTERY_LEVELS: { level: number; xp: number; reward: string; grant?: { essence?: number; fragments?: number; cosmetic?: string } }[] = [
  { level: 1, xp: 0, reward: 'Apprentice' },
  { level: 2, xp: 60, reward: '+15 Research Fragments', grant: { fragments: 15 } },
  { level: 3, xp: 160, reward: '+60 Essence', grant: { essence: 60 } },
  { level: 4, xp: 320, reward: '+20 Research Fragments', grant: { fragments: 20 } },
  { level: 5, xp: 540, reward: 'Journeyman title · Ember trail', grant: { essence: 100, cosmetic: 'trail_ember' } },
  { level: 6, xp: 820, reward: '+25 Research Fragments', grant: { fragments: 25 } },
  { level: 7, xp: 1180, reward: '+150 Essence', grant: { essence: 150 } },
  { level: 8, xp: 1620, reward: 'Adept title · Brass skin', grant: { fragments: 30, cosmetic: 'skin_brass' } },
  { level: 9, xp: 2150, reward: '+200 Essence', grant: { essence: 200 } },
  { level: 10, xp: 2800, reward: 'Master Alchemist title · Comet trail', grant: { fragments: 40, cosmetic: 'trail_comet' } },
  { level: 11, xp: 3550, reward: '+250 Essence', grant: { essence: 250 } },
  { level: 12, xp: 4400, reward: '+40 Research Fragments', grant: { fragments: 40 } },
  { level: 13, xp: 5350, reward: 'Stardust trail', grant: { essence: 150, cosmetic: 'trail_stardust' } },
  { level: 14, xp: 6400, reward: '+300 Essence', grant: { essence: 300 } },
  { level: 15, xp: 7600, reward: 'Grand Alchemist title · Obsidian skin', grant: { fragments: 50, cosmetic: 'skin_obsidian' } },
  { level: 16, xp: 8900, reward: '+350 Essence', grant: { essence: 350 } },
  { level: 17, xp: 10300, reward: '+50 Research Fragments', grant: { fragments: 50 } },
  { level: 18, xp: 11800, reward: 'Aurora skin', grant: { essence: 200, cosmetic: 'skin_aurora' } },
  { level: 19, xp: 13400, reward: '+400 Essence', grant: { essence: 400 } },
  { level: 20, xp: 15200, reward: 'Archmage title · Prismatic trail', grant: { fragments: 60, cosmetic: 'trail_prismatic' } },
  { level: 21, xp: 17200, reward: '+450 Essence', grant: { essence: 450 } },
  { level: 22, xp: 19400, reward: '+60 Research Fragments', grant: { fragments: 60 } },
  { level: 23, xp: 21800, reward: 'Void skin', grant: { essence: 250, cosmetic: 'skin_void' } },
  { level: 24, xp: 24400, reward: '+500 Essence', grant: { essence: 500 } },
  { level: 25, xp: 27200, reward: 'Philosopher title · Phoenix trail', grant: { fragments: 80, cosmetic: 'trail_phoenix' } },
];
