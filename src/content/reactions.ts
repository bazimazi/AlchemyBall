import type { ReactionDef } from './types';

/**
 * The reaction catalogue. Inputs are unordered. For a pair with several entries, the highest
 * `priority` whose conditions hold wins — that is how context variants work (e.g. a trickle of
 * fire on a lot of water only quenches, while a balanced mix bursts into steam).
 *
 * Consistent rules the catalogue follows:
 *  - Heat (fire/magma) + wet (water) always makes steam; the ratio decides how violently.
 *  - Charge (lightning) travels along wet or conductive holders.
 *  - Cold (ice) + wet always freezes; frozen holders shatter under strong impacts.
 *  - Earth grounds charge; wind spreads whatever it meets.
 *  - Arcane never acts alone: it amplifies its partner.
 */
export const REACTIONS: ReactionDef[] = [
  // ── Heat & water ──────────────────────────────────────────────────────────
  {
    id: 'quench', name: 'Quench', category: 'primary', inputs: ['fire', 'water'], priority: 2,
    conditions: { maxRatio: 0.35 },
    description: 'A little heat meeting a lot of water simply fizzles out, leaving a wisp of steam and extinguishing the flame.',
    hint: 'Heat drowned by too much water…', followUp: 'Bring more heat to make it burst instead.',
    consume: { applied: 1, present: 0.3 }, output: { element: 'steam', amount: 0.3 },
    effects: [], cooldown: 0.4, rarity: 'common', discoveryReward: 2,
  },
  {
    id: 'steam_burst', name: 'Steam Burst', category: 'primary', inputs: ['fire', 'water'], priority: 1,
    description: 'Fire and water flash into a pressure burst: knocks enemies back, leaves a blinding steam cloud. On the ball, the pressure launches it forward.',
    hint: 'Heat meets something wet…', followUp: 'Steam reacts with cold and with charge. Try Ice or Lightning on the cloud.',
    consume: { applied: 1, present: 1 }, output: { element: 'steam', amount: 0.6 },
    effects: [
      { type: 'impulse', strength: 520, radius: 130, selfBoost: 1.35 },
      { type: 'damage', amount: 10, radius: 110 },
      { type: 'spawnZone', zone: 'steam_cloud', radius: 120, duration: 6 },
    ],
    cooldown: 0.8, rarity: 'common', discoveryReward: 5,
  },
  {
    id: 'melt', name: 'Melt', category: 'primary', inputs: ['fire', 'ice'],
    description: 'Heat melts ice into water. Frozen targets take a burst of thermal damage and end up wet.',
    hint: 'Heat against cold…', followUp: 'Melted targets are wet: follow up with Lightning.',
    consume: { applied: 0.8, present: 1 }, output: { element: 'water', amount: 0.8 },
    effects: [{ type: 'damage', amount: 12, statusMul: { frozen: 2.5 } }, { type: 'clearStatus', status: 'frozen' }],
    cooldown: 0.5, rarity: 'common', discoveryReward: 4,
  },
  // ── Cold ──────────────────────────────────────────────────────────────────
  {
    id: 'freeze', name: 'Freeze', category: 'primary', inputs: ['ice', 'water'],
    description: 'Cold locks water solid. Enemies become Frozen (immobile, brittle). Pools become ice sheets that make the ball slide.',
    hint: 'Cold on something wet…', followUp: 'Frozen enemies shatter under a hard, fast impact.',
    consume: { applied: 1, present: 1 },
    effects: [{ type: 'status', status: 'frozen', duration: 3 }],
    cooldown: 1, rarity: 'common', discoveryReward: 5, holders: ['enemy', 'ball', 'object'],
  },
  {
    id: 'freeze_pool', name: 'Flash Freeze', category: 'environmental', inputs: ['ice', 'water'], holders: ['zone'],
    conditions: { holderTags: ['zone:water_pool', 'zone:toxic_pool'] },
    description: 'Cold freezes a water pool into a slick ice sheet. Enemies crossing it are slowed; the ball slides almost without drag.',
    hint: 'Cold near standing water…', followUp: 'Ice sheets are perfect runways for high-speed impacts.',
    consume: { applied: 1, present: 1 },
    effects: [{ type: 'spawnZone', zone: 'ice_patch', radius: 0, duration: 14 }, { type: 'consumeZone' }],
    cooldown: 1, rarity: 'common', discoveryReward: 4,
  },
  {
    id: 'shatter', name: 'Shatter', category: 'impact', inputs: ['kinetic', 'ice'],
    conditions: { holderStatus: 'frozen', minImpactSpeed: 650 },
    description: 'A fast impact on a Frozen target shatters it for massive damage, spraying ice shards that chill nearby enemies.',
    hint: 'Something frozen, hit very hard…', followUp: 'Freeze a group first, then shatter one to chill the rest.',
    consume: { applied: 1, present: 1 },
    effects: [
      { type: 'damage', amount: 45, tagMul: { brittle: 1.6 } },
      { type: 'clearStatus', status: 'frozen' },
      { type: 'chain', element: 'ice', amount: 0.7, radius: 160, maxTargets: 4, damage: 8 },
    ],
    cooldown: 0.3, rarity: 'uncommon', discoveryReward: 8,
  },
  {
    id: 'thermal_shock', name: 'Thermal Shock', category: 'secondary', inputs: ['ice', 'steam'],
    description: 'Cold hitting steam collapses it violently: a shockwave that deals heavy damage, doubled against brittle targets.',
    hint: 'Vapour meets sudden cold…', followUp: 'Crystal and obsidian are brittle. So are frozen enemies.',
    consume: { applied: 1, present: 1 },
    effects: [{ type: 'damage', amount: 30, radius: 140, tagMul: { brittle: 2 }, statusMul: { frozen: 1.5 } }, { type: 'impulse', strength: 380, radius: 140 }],
    cooldown: 0.8, rarity: 'uncommon', discoveryReward: 8, color: '#d8f8ff',
  },
  {
    id: 'blizzard', name: 'Blizzard', category: 'chain', inputs: ['ice', 'wind'],
    description: 'Wind scatters cold: chills every enemy nearby, slowing them. Wet enemies freeze.',
    hint: 'Cold carried on a gust…', followUp: 'Soak a crowd in water first.',
    consume: { applied: 1, present: 0.8 },
    effects: [{ type: 'chain', element: 'ice', amount: 0.6, radius: 190, maxTargets: 6 }, { type: 'status', status: 'slowed', duration: 3, radius: 190 }],
    cooldown: 1.2, rarity: 'uncommon', discoveryReward: 6,
  },
  // ── Charge ────────────────────────────────────────────────────────────────
  {
    id: 'conductive_surge', name: 'Conductive Surge', category: 'chain', inputs: ['lightning', 'water'],
    description: 'Charge floods through wet targets: damages the holder and arcs to every wet or conductive holder nearby, which can surge in turn.',
    hint: 'Charge meets something wet…', followUp: 'A water pool under a crowd turns this into a cascade.',
    consume: { applied: 1, present: 0.6 },
    effects: [
      { type: 'damage', amount: 16 },
      { type: 'status', status: 'stunned', duration: 0.6 },
      { type: 'chain', element: 'lightning', amount: 0.8, radius: 220, maxTargets: 5, requireAura: 'water', damage: 6 },
    ],
    cooldown: 1.2, rarity: 'common', discoveryReward: 5, color: '#ffe84a',
  },
  {
    id: 'pool_surge', name: 'Electrified Pool', category: 'environmental', inputs: ['lightning', 'water'], holders: ['zone'], priority: 1,
    conditions: { holderTags: ['zone:water_pool'] },
    description: 'Charge spreads across a water pool: everything standing in it is shocked and stunned.',
    hint: 'Charge meets standing water…', followUp: 'Lure enemies into the pool before you strike it.',
    consume: { applied: 1, present: 0.2 },
    effects: [{ type: 'damage', amount: 14, radius: 0 }, { type: 'status', status: 'stunned', duration: 1, radius: 0 }],
    cooldown: 1.5, rarity: 'common', discoveryReward: 5, color: '#ffe84a',
  },
  {
    id: 'frost_shock', name: 'Frost Shock', category: 'primary', inputs: ['lightning', 'ice'],
    description: 'Charge through frost releases a pulse that damages and stuns nearby enemies. Frozen targets take extra damage.',
    hint: 'Charge meets cold…', followUp: 'Freeze first, then shock, then shatter.',
    consume: { applied: 1, present: 0.8 },
    effects: [{ type: 'damage', amount: 18, radius: 120, statusMul: { frozen: 1.6 } }, { type: 'status', status: 'stunned', duration: 0.9, radius: 120 }],
    cooldown: 0.8, rarity: 'common', discoveryReward: 5, color: '#d9f7ff',
  },
  {
    id: 'magnetize', name: 'Magnetized Charge', category: 'primary', inputs: ['lightning', 'metal'],
    description: 'Charged metal becomes a magnet: Magnetized enemies pull a metal ball toward them and redirect lightning arcs from far away.',
    hint: 'Charge meets metal…', followUp: 'Carry Metal yourself to be pulled into magnetized targets.',
    consume: { applied: 0.7, present: 0.3 },
    effects: [{ type: 'status', status: 'magnetized', duration: 5 }, { type: 'damage', amount: 10 }, { type: 'chain', element: 'lightning', amount: 0.5, radius: 320, maxTargets: 3, requireTag: 'conductive', damage: 8 }],
    cooldown: 0.8, rarity: 'uncommon', discoveryReward: 6,
  },
  {
    id: 'grounded', name: 'Grounded', category: 'primary', inputs: ['lightning', 'earth'],
    description: 'Earth drains charge harmlessly into the ground. Useful for cleansing — useless for damage.',
    hint: 'Charge meets stone…', followUp: 'Earth is a counter, not a weapon, against charge.',
    consume: { applied: 1, present: 0.2 },
    effects: [], cooldown: 0.3, rarity: 'common', discoveryReward: 2,
  },
  {
    id: 'grounded_mud', name: 'Grounded', category: 'secondary', inputs: ['lightning', 'mud'],
    description: 'Mud swallows charge. Muddy targets ignore lightning.',
    hint: 'Charge meets wet earth…', followUp: 'Mud protects enemies from lightning — dry them first with fire.',
    consume: { applied: 1, present: 0.1 },
    effects: [], cooldown: 0.3, rarity: 'common', discoveryReward: 2,
  },
  {
    id: 'storm_cloud', name: 'Storm Cloud', category: 'secondary', inputs: ['lightning', 'steam'],
    description: 'Charged steam becomes a storm cloud that calls lightning down on enemies inside it for several seconds.',
    hint: 'Charge meets vapour…', followUp: 'Clouds last longer when you trap enemies in them.',
    consume: { applied: 1, present: 1 },
    effects: [{ type: 'spawnZone', zone: 'storm_cloud', radius: 140, duration: 6 }],
    cooldown: 1.5, rarity: 'uncommon', discoveryReward: 8, color: '#f5ee8a',
  },
  {
    id: 'ball_lightning', name: 'Ball Lightning', category: 'transformation', inputs: ['lightning', 'wind'], holders: ['ball'],
    description: 'Charge whipped by wind turns the ball into living lightning for a few seconds: faster, and every impact arcs to nearby enemies.',
    hint: 'Charge carried on a gust, inside the ball…', followUp: 'Dive into crowds while it lasts.',
    consume: { applied: 1, present: 1 },
    effects: [{ type: 'ballBuff', buff: 'ballLightning', duration: 5 }],
    cooldown: 3, rarity: 'rare', discoveryReward: 12, color: '#fff27a',
  },
  // ── Metal & earth ─────────────────────────────────────────────────────────
  {
    id: 'searing_metal', name: 'Searing Metal', category: 'primary', inputs: ['fire', 'metal'],
    description: 'Heat softens metal: the target is Exposed — its armor is ignored and it takes 50% more damage.',
    hint: 'Heat against metal…', followUp: 'Armored beetles hate heat. Strip them, then hit hard.',
    consume: { applied: 0.6, present: 0.5 },
    effects: [{ type: 'status', status: 'exposed', duration: 5 }, { type: 'damage', amount: 8 }],
    cooldown: 0.6, rarity: 'common', discoveryReward: 5,
  },
  {
    id: 'magma', name: 'Magma', category: 'environmental', inputs: ['fire', 'earth'],
    description: 'Intense heat melts stone into a magma pool that burns anything that stands in it.',
    hint: 'Heat against stone…', followUp: 'Quench magma with water to raise an obsidian wall.',
    consume: { applied: 1, present: 1 }, output: { element: 'magma', amount: 0.6 },
    effects: [{ type: 'spawnZone', zone: 'magma_pool', radius: 90, duration: 8 }, { type: 'damage', amount: 10, radius: 60 }],
    cooldown: 1.2, rarity: 'uncommon', discoveryReward: 6,
  },
  {
    id: 'obsidian', name: 'Obsidian Forge', category: 'rare', inputs: ['water', 'magma'],
    description: 'Quenched magma hardens into an obsidian pillar — new, springy terrain you can bank shots off. Releases steam.',
    hint: 'Water on molten stone…', followUp: 'Obsidian is brittle: Thermal Shock shatters it for area damage.',
    consume: { applied: 1, present: 1 }, output: { element: 'steam', amount: 0.5 },
    effects: [{ type: 'spawnObstacle', obstacle: 'obsidian', radius: 30, duration: 20 }, { type: 'spawnZone', zone: 'steam_cloud', radius: 90, duration: 4 }],
    cooldown: 2, rarity: 'rare', discoveryReward: 12, color: '#6b5a8a',
  },
  {
    id: 'mud', name: 'Mud', category: 'environmental', inputs: ['earth', 'water'],
    description: 'Earth and water mix into sticky mud that slows enemies drastically — and the ball, too.',
    hint: 'Stone meets water…', followUp: 'Mud grounds lightning. Keep charge away from it.',
    consume: { applied: 1, present: 1 }, output: { element: 'mud', amount: 0.8 },
    effects: [{ type: 'spawnZone', zone: 'mud_patch', radius: 100, duration: 9 }],
    cooldown: 1.2, rarity: 'common', discoveryReward: 4,
  },
  {
    id: 'petrify', name: 'Petrify', category: 'primary', inputs: ['earth', 'metal'],
    description: 'Earth binds metal: the target is Petrified — heavily slowed and brittle.',
    hint: 'Stone around metal…', followUp: 'Petrified enemies are brittle, so Thermal Shock and Shatter hurt more.',
    consume: { applied: 0.8, present: 0.6 },
    effects: [{ type: 'status', status: 'petrified', duration: 4 }],
    cooldown: 1, rarity: 'uncommon', discoveryReward: 6,
  },
  {
    id: 'ironstone', name: 'Ironstone', category: 'transformation', inputs: ['earth', 'metal'], holders: ['ball'], priority: 1,
    description: 'The ball fuses earth and metal into an ironstone shell: very heavy, huge impact damage, but slow to launch.',
    hint: 'Stone and metal, inside the ball…', followUp: 'Ironstone smashes armor even without heat.',
    consume: { applied: 1, present: 1 },
    effects: [{ type: 'ballBuff', buff: 'ironstone', duration: 6 }],
    cooldown: 3, rarity: 'rare', discoveryReward: 10,
  },
  {
    id: 'ring_out', name: 'Resonant Clang', category: 'impact', inputs: ['kinetic', 'metal'],
    conditions: { minImpactSpeed: 900 },
    description: 'A very fast hit on metal rings out a stunning shockwave.',
    hint: 'Metal, struck at great speed…', followUp: 'Wind or lightning help you reach that speed.',
    consume: { applied: 1, present: 0.1 },
    effects: [{ type: 'status', status: 'stunned', duration: 0.8, radius: 130 }, { type: 'damage', amount: 8, radius: 130 }],
    cooldown: 1, rarity: 'uncommon', discoveryReward: 6, color: '#dfe7ef',
  },
  // ── Wind ──────────────────────────────────────────────────────────────────
  {
    id: 'inferno', name: 'Inferno', category: 'chain', inputs: ['fire', 'wind'],
    description: 'Wind fans fire into an inferno that leaps to every enemy and flammable object nearby.',
    hint: 'Flame carried on a gust…', followUp: 'Explosive barrels love this.',
    consume: { applied: 1, present: 1 },
    effects: [{ type: 'damage', amount: 14, radius: 90 }, { type: 'chain', element: 'fire', amount: 0.9, radius: 200, maxTargets: 6 }, { type: 'spawnZone', zone: 'fire_patch', radius: 80, duration: 4 }],
    cooldown: 2, rarity: 'uncommon', discoveryReward: 7,
  },
  {
    id: 'miasma', name: 'Miasma', category: 'chain', inputs: ['poison', 'wind'],
    description: 'Wind carries poison to every enemy nearby.',
    hint: 'Toxin on a gust…', followUp: 'Poisoned crowds + fire = chain explosions.',
    consume: { applied: 1, present: 1 },
    effects: [{ type: 'chain', element: 'poison', amount: 0.7, radius: 200, maxTargets: 4 }, { type: 'spawnZone', zone: 'poison_cloud', radius: 90, duration: 3 }],
    cooldown: 2.5, rarity: 'uncommon', discoveryReward: 6,
  },
  // ── Poison ────────────────────────────────────────────────────────────────
  {
    id: 'toxic_combustion', name: 'Toxic Combustion', category: 'primary', inputs: ['fire', 'poison'],
    description: 'Poison ignites in a toxic explosion: heavy area damage and lingering flames. Poisoned enemies caught in the blast ignite in turn.',
    hint: 'Heat meets toxin…', followUp: 'Poison a group first, then light one of them.',
    consume: { applied: 1, present: 1 },
    effects: [
      { type: 'damage', amount: 28, radius: 130 },
      { type: 'impulse', strength: 450, radius: 130 },
      { type: 'chain', element: 'fire', amount: 0.8, radius: 150, maxTargets: 4, requireAura: 'poison' },
      { type: 'spawnZone', zone: 'fire_patch', radius: 70, duration: 3 },
    ],
    cooldown: 2.5, rarity: 'uncommon', discoveryReward: 8, color: '#b6ff4a',
  },
  {
    id: 'toxic_spill', name: 'Toxic Spill', category: 'environmental', inputs: ['poison', 'water'], holders: ['zone'], priority: 1,
    conditions: { holderTags: ['zone:water_pool'] },
    description: 'Poison seeps into a water pool and turns the whole pool toxic, poisoning and slowing every enemy that wades through.',
    hint: 'Toxin in standing water…', followUp: 'Freeze a toxic pool and it becomes a slick, harmless ice sheet.',
    consume: { applied: 1, present: 1 },
    effects: [{ type: 'spawnZone', zone: 'toxic_pool', radius: 0, duration: 16 }, { type: 'consumeZone' }],
    cooldown: 2, rarity: 'common', discoveryReward: 4,
  },
  {
    id: 'contaminate', name: 'Contaminate', category: 'primary', inputs: ['poison', 'water'], holders: ['enemy', 'object', 'ball'],
    description: 'Poison spreads through a wet target, leaving a toxic puddle beneath it.',
    hint: 'Toxin on something wet…', followUp: 'Toxic puddles persist — a trap for enemies that walk through.',
    consume: { applied: 1, present: 1 },
    effects: [{ type: 'spawnZone', zone: 'toxic_pool', radius: 90, duration: 10 }],
    cooldown: 4, rarity: 'common', discoveryReward: 4,
  },
  {
    id: 'corrode', name: 'Corrode', category: 'primary', inputs: ['poison', 'metal'],
    description: 'Poison eats through metal: the target is Exposed for a long time and keeps its poison.',
    hint: 'Toxin on metal…', followUp: 'A slow alternative to heat for breaking armor.',
    consume: { applied: 0.5, present: 0.2 },
    effects: [{ type: 'status', status: 'exposed', duration: 8 }],
    cooldown: 2, rarity: 'common', discoveryReward: 5,
  },
  {
    id: 'poison_burst', name: 'Spore Burst', category: 'impact', inputs: ['kinetic', 'poison'],
    conditions: { minImpactSpeed: 500 },
    description: 'A hard bounce off a poisoned target bursts a toxic cloud on impact.',
    hint: 'Something toxic, struck hard…', followUp: 'Bounce between poisoned enemies to blanket the arena.',
    consume: { applied: 1, present: 0.3 },
    effects: [{ type: 'spawnZone', zone: 'poison_cloud', radius: 80, duration: 3 }],
    cooldown: 2, rarity: 'common', discoveryReward: 4,
  },
  // ── Arcane ────────────────────────────────────────────────────────────────
  {
    id: 'overload', name: 'Arcane Overload', category: 'rare', inputs: ['arcane', '*'],
    description: 'Arcane energy amplifies the other element: its amount doubles and it bursts outward in a damaging overload, spreading to nearby holders.',
    hint: 'Raw energy meets any element…', followUp: 'Overload spreads whatever you amplified — pick your element wisely.',
    consume: { applied: 1, present: 0 },
    effects: [{ type: 'amplify', mul: 2 }, { type: 'damage', amount: 20, radius: 120 }],
    cooldown: 2.5, rarity: 'rare', discoveryReward: 10, color: '#d99bff',
  },
];
