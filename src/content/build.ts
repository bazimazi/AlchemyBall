import type { CoreDef, ShellDef, UpgradeDef } from './types';

/** Ball cores define the build's fundamental element. */
export const CORES: CoreDef[] = [
  { id: 'ember', name: 'Ember Core', element: 'fire', archetype: 'Pyromancer', maxHp: 100,
    description: 'Burns what it touches. Strong against flammable and armored foes (heat Exposes metal).' },
  { id: 'tide', name: 'Tide Core', element: 'water', archetype: 'Alchemist', maxHp: 125,
    description: 'Soaks targets, setting up freezes, surges and steam. Weak alone, superb as a primer.' },
  { id: 'storm', name: 'Storm Core', element: 'lightning', archetype: 'Stormcaller', maxHp: 90, unlock: 'res_storm',
    description: 'Charges targets and chains through wet or conductive groups. Grounded by earth and mud.' },
  { id: 'frost', name: 'Frost Core', element: 'ice', archetype: 'Cryomancer', maxHp: 100, unlock: 'res_frost',
    description: 'Slows and freezes. A slippery ball that sets up devastating shatters.' },
  { id: 'iron', name: 'Iron Core', element: 'metal', archetype: 'Juggernaut', maxHp: 130, unlock: 'res_iron',
    description: 'Heavy and brutal. Huge impact damage, sluggish launches.' },
  { id: 'venom', name: 'Venom Core', element: 'poison', archetype: 'Toxicist', maxHp: 95, unlock: 'res_toxin',
    description: 'Lingering damage and corrosion. Poisoned crowds become a powder keg.' },
  { id: 'gale', name: 'Gale Core', element: 'wind', archetype: 'Kineticist', maxHp: 90, unlock: 'res_gale',
    description: 'Light, fast, relentless. Spreads whatever element you pick up.' },
  { id: 'stone', name: 'Stone Core', element: 'earth', archetype: 'Warden', maxHp: 125, unlock: 'res_earth',
    description: 'Stable and grounding. Immune to charge build-up; forms mud and magma.' },
  { id: 'prism', name: 'Prism Core', element: 'arcane', archetype: 'Transmuter', maxHp: 85, unlock: 'res_arcane',
    description: 'Amplifies every element you touch. Volatile and high-skill.' },
];

/** Shells (unlocked via research) trade physical characteristics. */
export const SHELLS: ShellDef[] = [
  { id: 'glass', name: 'Glass Shell', description: 'Standard alchemical glass. Balanced.', mods: {} },
  { id: 'rubber', name: 'Gum Shell', description: 'Bouncier walls, lighter body. +10% restitution, -15% mass.', mods: { restitutionAdd: 0.1, massMul: 0.85 }, unlock: 'res_shells' },
  { id: 'lead', name: 'Lead Shell', description: 'Heavy and sturdy. +30% mass and impact damage, +25 HP, launches 12% slower.', mods: { massMul: 1.3, impactDamageMul: 1.3, launchMul: 0.88, maxHpAdd: 25 }, unlock: 'res_shells' },
  { id: 'thorn', name: 'Thorn Shell', description: 'Spiked. Halves contact damage taken, but more drag.', mods: { contactReduce: 0.5, dragMul: 1.2 }, unlock: 'res_shells2' },
];

/**
 * Run upgrades. `mods` keys (all additive unless suffixed Mul):
 *  impactDmg, maxHp, pips, pipRegen, launchPower, maxSpeed, drag, restitution,
 *  reactionDmg, zoneDuration, chainTargets, chainRadius, auraTransfer, coreRegen,
 *  burnDps, shatterDmg, steamSelfBoost, freezeDuration, poisonDps, lightningDmg,
 *  shockwaveOnFast, iceArmor, lifesteal, catalystOnReaction, bumperKick, focus
 */
export const UPGRADES: UpgradeDef[] = [
  // Generic / kinetic
  { id: 'dense_core', name: 'Dense Core', description: '+25% impact damage.', rarity: 'common', elements: [], tags: ['kinetic', 'juggernaut'], maxStacks: 3, mods: { impactDmg: 0.25 } },
  { id: 'spare_charge', name: 'Spare Charge', description: '+1 launch pip.', rarity: 'uncommon', elements: [], tags: ['kinetic'], maxStacks: 2, mods: { pips: 1 } },
  { id: 'quick_recharge', name: 'Quick Recharge', description: 'Launch pips recharge 25% faster.', rarity: 'common', elements: [], tags: ['kinetic'], maxStacks: 3, mods: { pipRegen: 0.25 } },
  { id: 'slick_glaze', name: 'Slick Glaze', description: '-20% drag: the ball keeps its speed longer.', rarity: 'common', elements: [], tags: ['kinetic'], maxStacks: 2, mods: { drag: -0.2 } },
  { id: 'shock_rebound', name: 'Shock Rebound', description: 'Impacts above 900 speed release a small shockwave (12 damage, knockback).', rarity: 'uncommon', elements: [], tags: ['kinetic'], maxStacks: 2, mods: { shockwaveOnFast: 1 } },
  { id: 'reinforced', name: 'Reinforced Glass', description: '+25 max HP and heal 25.', rarity: 'common', elements: [], tags: ['juggernaut'], maxStacks: 3, mods: { maxHp: 25 } },
  { id: 'still_mind', name: 'Still Mind', description: '+50% aiming focus (slow-motion time).', rarity: 'common', elements: [], tags: ['kinetic'], maxStacks: 2, mods: { focus: 0.5 } },
  // Alchemist
  { id: 'volatile_mix', name: 'Volatile Mixture', description: 'All reactions deal +25% damage.', rarity: 'uncommon', elements: [], tags: ['alchemist'], maxStacks: 3, mods: { reactionDmg: 0.25 } },
  { id: 'saturation', name: 'Saturation', description: 'The ball transfers 40% more element per hit.', rarity: 'common', elements: [], tags: ['alchemist'], maxStacks: 2, mods: { auraTransfer: 0.4 } },
  { id: 'lingering', name: 'Lingering Residue', description: 'Zones you create last 40% longer.', rarity: 'common', elements: [], tags: ['alchemist', 'toxic'], maxStacks: 2, mods: { zoneDuration: 0.4 } },
  { id: 'catalytic_skin', name: 'Catalytic Skin', description: 'Your core element regenerates twice as fast.', rarity: 'common', elements: [], tags: ['alchemist'], maxStacks: 1, mods: { coreRegen: 1 } },
  { id: 'transmutation', name: 'Transmutation Loop', description: 'Each reaction heals you for 2 HP.', rarity: 'rare', elements: [], tags: ['alchemist'], maxStacks: 2, mods: { lifesteal: 2 } },
  // Element-specific
  { id: 'wildfire', name: 'Wildfire', description: 'Burning enemies take +60% fire damage over time; Inferno spreads to +2 targets.', rarity: 'common', elements: ['fire'], tags: ['pyro'], maxStacks: 2, mods: { burnDps: 0.6, chainTargets: 1 } },
  { id: 'pressure_valve', name: 'Pressure Valve', description: 'Steam Bursts on the ball launch you 40% harder.', rarity: 'common', elements: ['fire', 'water'], tags: ['pyro', 'alchemist'], maxStacks: 2, mods: { steamSelfBoost: 0.4 } },
  { id: 'deep_freeze', name: 'Deep Freeze', description: 'Freeze lasts 60% longer; Shatter deals +50% damage.', rarity: 'common', elements: ['ice', 'water'], tags: ['cryo'], maxStacks: 2, mods: { freezeDuration: 0.6, shatterDmg: 0.5 } },
  { id: 'rime_armor', name: 'Rime Armor', description: 'Ice reactions grant a shield that absorbs 12 damage.', rarity: 'uncommon', elements: ['ice'], tags: ['cryo'], maxStacks: 2, mods: { iceArmor: 12 } },
  { id: 'arc_relay', name: 'Arc Relay', description: 'Lightning chains reach +2 targets and 30% further.', rarity: 'common', elements: ['lightning'], tags: ['storm'], maxStacks: 2, mods: { chainTargets: 2, chainRadius: 0.3 } },
  { id: 'capacitor', name: 'Capacitor', description: 'Lightning reactions deal +40% damage.', rarity: 'common', elements: ['lightning'], tags: ['storm'], maxStacks: 2, mods: { lightningDmg: 0.4 } },
  { id: 'conductive_film', name: 'Conductive Film', description: 'Water reactions amplify lightning: Conductive Surge chains +1 and deals +30% damage.', rarity: 'uncommon', elements: ['water', 'lightning'], tags: ['storm', 'alchemist'], maxStacks: 1, mods: { chainTargets: 1, lightningDmg: 0.3 } },
  { id: 'caustic', name: 'Caustic Brew', description: 'Poison deals +60% damage over time.', rarity: 'common', elements: ['poison'], tags: ['toxic'], maxStacks: 2, mods: { poisonDps: 0.6 } },
  { id: 'heavy_metal', name: 'Heavy Metal', description: '+40% impact damage while carrying Metal or Earth.', rarity: 'common', elements: ['metal', 'earth'], tags: ['juggernaut'], maxStacks: 2, mods: { heavyImpact: 0.4 } },
  { id: 'tailwind', name: 'Tailwind', description: '+15% launch power and max speed.', rarity: 'common', elements: [], tags: ['kinetic'], maxStacks: 2, mods: { launchPower: 0.15, maxSpeed: 0.15 } },
  { id: 'catalyst_harvest', name: 'Catalyst Harvest', description: 'Every 8 reactions grant 1 Catalyst.', rarity: 'uncommon', elements: [], tags: ['alchemist'], maxStacks: 1, mods: { catalystOnReaction: 1 } },
];
