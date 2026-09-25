import type { RegionDef, ResearchNode } from './types';

/**
 * Permanent research. Nodes expand options (new cores, slots, lab tools, regions) rather than
 * inflating stats. Costs lean on Research Fragments (earned by discovery) so experimenting is
 * the fastest route to progress.
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
  { id: 'res_catalyst_slot', name: 'Catalyst Socket', branch: 'ball', cost: { fragments: 18, essence: 60 }, requires: ['res_shells'], grants: 'Start runs with a chosen common upgrade', description: 'Socket a known upgrade into the ball before the run starts.' },
  // Lab branch — discovery tools.
  { id: 'res_lab', name: 'Field Laboratory', branch: 'lab', cost: { fragments: 6 }, requires: [], grants: 'Laboratory sandbox', description: 'A safe arena with every element source you have unlocked. Experiment freely.' },
  { id: 'res_hints', name: 'Annotated Codex', branch: 'lab', cost: { fragments: 8 }, requires: ['res_lab'], grants: 'Hints for all undiscovered reactions whose inputs you know', description: 'The Codex shows hints for every reaction between elements you have seen.' },
  { id: 'res_scanner', name: 'Reagent Lens', branch: 'lab', cost: { fragments: 12, essence: 30 }, requires: ['res_hints'], grants: 'See enemy auras & weaknesses in runs', description: 'Enemies display their weaknesses when you aim at them.' },
  // World branch
  { id: 'res_daily', name: 'Daily Experiment', branch: 'world', cost: { essence: 40 }, requires: [], grants: 'Daily seeded challenge', description: 'A fixed daily run with a set core and modifiers, identical for everyone.' },
  { id: 'res_heat', name: 'Unstable Crucible', branch: 'world', cost: { marks: 1 }, requires: [], grants: 'Heat levels (challenge modifiers)', description: 'Raise the Heat for harder runs and more Mastery Marks.' },
];

/** Region 1: a vertical-slice region mixing fire, water, charge and toxin. */
export const REGIONS: RegionDef[] = [
  {
    id: 'cinder_marsh',
    name: 'The Cinder Marsh',
    description: 'A steaming wetland around an old alchemical furnace. Pools, braziers and spore-rot everywhere.',
    floors: 7,
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
    palette: { bg: '#0d0f14', floor: '#171c22', wall: '#3a4452', accent: '#ff8a3d' },
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
];

/** Player mastery levels: each level grants something to do, not raw stats. */
export const MASTERY_LEVELS: { level: number; xp: number; reward: string; grant?: { essence?: number; fragments?: number } }[] = [
  { level: 1, xp: 0, reward: 'Apprentice' },
  { level: 2, xp: 60, reward: '+15 Research Fragments', grant: { fragments: 15 } },
  { level: 3, xp: 160, reward: '+60 Essence', grant: { essence: 60 } },
  { level: 4, xp: 320, reward: '+20 Research Fragments', grant: { fragments: 20 } },
  { level: 5, xp: 540, reward: 'Journeyman title · +100 Essence', grant: { essence: 100 } },
  { level: 6, xp: 820, reward: '+25 Research Fragments', grant: { fragments: 25 } },
  { level: 7, xp: 1180, reward: '+150 Essence', grant: { essence: 150 } },
  { level: 8, xp: 1620, reward: 'Adept title · +30 Research Fragments', grant: { fragments: 30 } },
  { level: 9, xp: 2150, reward: '+200 Essence', grant: { essence: 200 } },
  { level: 10, xp: 2800, reward: 'Master Alchemist title', grant: { fragments: 40 } },
];
