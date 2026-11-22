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
 * Run upgrades. `mods` keys (all additive unless noted) are read by the simulation and run:
 *  impactDmg, maxHp, pips, pipRegen, launchPower, maxSpeed, drag, restitution, reactionDmg,
 *  zoneDuration, chainTargets, chainRadius, auraTransfer, coreRegen, burnDps, shatterDmg,
 *  steamSelfBoost, freezeDuration, poisonDps, lightningDmg, shockwaveOnFast, iceArmor, lifesteal,
 *  catalystOnReaction, bumperKick, focus, heavyImpact, ricochet, comboDmg, killNova, launchNova,
 *  brakeNova, pipOnKill, execute, critChance, critMul, trail, thorns, waveShield, dmg_<element>,
 *  toxicBloom, arcOnHit, heavyGuard, windSpeed, essenceMul, maxHpMul, phoenix, shatterSpread,
 *  thunderLaunch, perpetual, quake, plague.
 *
 * `unlock` names a research node or a feat (`feat_*`): the pool grows as you play.
 * Legendary upgrades are Evolutions: offered only when every `requires` upgrade is held at max.
 */
export const UPGRADES: UpgradeDef[] = [
  // Generic / kinetic
  { id: 'dense_core', name: 'Dense Core', icon: '●', description: '+25% impact damage.', rarity: 'common', elements: [], tags: ['kinetic', 'juggernaut'], maxStacks: 3, mods: { impactDmg: 0.25 } },
  { id: 'spare_charge', name: 'Spare Charge', icon: '◎', description: '+1 launch pip.', rarity: 'uncommon', elements: [], tags: ['kinetic'], maxStacks: 2, mods: { pips: 1 } },
  { id: 'quick_recharge', name: 'Quick Recharge', icon: '↻', description: 'Launch pips recharge 25% faster.', rarity: 'common', elements: [], tags: ['kinetic'], maxStacks: 3, mods: { pipRegen: 0.25 } },
  { id: 'slick_glaze', name: 'Slick Glaze', icon: '≈', description: '-20% drag: the ball keeps its speed longer.', rarity: 'common', elements: [], tags: ['kinetic'], maxStacks: 2, mods: { drag: -0.2 } },
  { id: 'shock_rebound', name: 'Shock Rebound', icon: '✺', description: 'Impacts above 900 speed release a small shockwave (12 damage, knockback).', rarity: 'uncommon', elements: [], tags: ['kinetic'], maxStacks: 2, mods: { shockwaveOnFast: 1 } },
  { id: 'reinforced', name: 'Reinforced Glass', icon: '⬢', description: '+25 max HP and heal 25.', rarity: 'common', elements: [], tags: ['juggernaut'], maxStacks: 3, mods: { maxHp: 25 } },
  { id: 'still_mind', name: 'Still Mind', icon: '◔', description: '+50% aiming focus (slow-motion time).', rarity: 'common', elements: [], tags: ['kinetic'], maxStacks: 2, mods: { focus: 0.5 } },
  { id: 'tailwind', name: 'Tailwind', icon: '➶', description: '+15% launch power and max speed.', rarity: 'common', elements: [], tags: ['kinetic'], maxStacks: 2, mods: { launchPower: 0.15, maxSpeed: 0.15 } },
  { id: 'lucky_strike', name: 'Lucky Strike', icon: '✧', description: '15% chance for impacts to crit for double damage.', rarity: 'common', elements: [], tags: ['kinetic'], maxStacks: 2, mods: { critChance: 0.15 } },
  { id: 'thornplate', name: 'Thornplate', icon: '✶', description: 'Foes that touch you take 20 damage.', rarity: 'common', elements: [], tags: ['juggernaut'], maxStacks: 2, mods: { thorns: 20 } },
  { id: 'alchemists_purse', name: 'Alchemist’s Purse', icon: '◆', description: '+30% Essence for the rest of this run.', rarity: 'common', elements: [], tags: ['alchemist'], maxStacks: 2, mods: { essenceMul: 0.3 } },
  { id: 'ricochet_glaze', name: 'Ricochet Glaze', icon: '⟲', description: 'Each wall bounce adds +12% impact damage until your next launch (max 5).', rarity: 'common', elements: [], tags: ['kinetic'], maxStacks: 2, mods: { ricochet: 0.12 }, unlock: 'feat_bank_shot' },
  { id: 'combo_engine', name: 'Combo Engine', icon: '⨯', description: '+4% impact and reaction damage per combo step (max 10).', rarity: 'uncommon', elements: [], tags: ['kinetic', 'alchemist'], maxStacks: 2, mods: { comboDmg: 0.04 }, unlock: 'feat_combo_10' },
  { id: 'brake_shock', name: 'Brake Shock', icon: '⊙', description: 'Braking releases a shockwave (15 damage, knockback, your core element).', rarity: 'common', elements: [], tags: ['kinetic', 'juggernaut'], maxStacks: 2, mods: { brakeNova: 1 }, unlock: 'feat_runs_3' },
  { id: 'reclaimed_charge', name: 'Reclaimed Charge', icon: '⇡', description: 'Kills refund half a launch pip.', rarity: 'uncommon', elements: [], tags: ['kinetic'], maxStacks: 2, mods: { pipOnKill: 1 }, unlock: 'feat_rooms_25' },
  { id: 'coup_de_grace', name: 'Coup de Grâce', icon: '†', description: 'Impacts execute non-boss foes below 15% HP.', rarity: 'uncommon', elements: [], tags: ['kinetic'], maxStacks: 1, mods: { execute: 0.15 }, unlock: 'feat_elite' },
  { id: 'warding_glass', name: 'Warding Glass', icon: '⛉', description: 'Start every wave with a 15 HP shield.', rarity: 'common', elements: [], tags: ['juggernaut'], maxStacks: 2, mods: { waveShield: 15 }, unlock: 'feat_untouched' },
  { id: 'glass_cannon', name: 'Glass Cannon', icon: '⚠', description: '+60% impact and reaction damage, but −30% max HP.', rarity: 'rare', elements: [], tags: ['kinetic', 'alchemist'], maxStacks: 1, mods: { impactDmg: 0.6, reactionDmg: 0.6, maxHpMul: -0.3 }, unlock: 'feat_heat_3' },
  // Alchemist
  { id: 'volatile_mix', name: 'Volatile Mixture', icon: '⚗', description: 'All reactions deal +25% damage.', rarity: 'uncommon', elements: [], tags: ['alchemist'], maxStacks: 3, mods: { reactionDmg: 0.25 } },
  { id: 'saturation', name: 'Saturation', icon: '◍', description: 'The ball transfers 40% more element per hit.', rarity: 'common', elements: [], tags: ['alchemist'], maxStacks: 2, mods: { auraTransfer: 0.4 } },
  { id: 'lingering', name: 'Lingering Residue', icon: '◌', description: 'Zones you create last 40% longer.', rarity: 'common', elements: [], tags: ['alchemist', 'toxic'], maxStacks: 2, mods: { zoneDuration: 0.4 } },
  { id: 'catalytic_skin', name: 'Catalytic Skin', icon: '◐', description: 'Your core element regenerates twice as fast.', rarity: 'common', elements: [], tags: ['alchemist'], maxStacks: 1, mods: { coreRegen: 1 } },
  { id: 'transmutation', name: 'Transmutation Loop', icon: '∞', description: 'Each reaction heals you for 2 HP.', rarity: 'rare', elements: [], tags: ['alchemist'], maxStacks: 2, mods: { lifesteal: 2 } },
  { id: 'catalyst_harvest', name: 'Catalyst Harvest', icon: '⬡', description: 'Every 8 reactions grant 1 Catalyst.', rarity: 'uncommon', elements: [], tags: ['alchemist'], maxStacks: 1, mods: { catalystOnReaction: 1 } },
  { id: 'volatile_remains', name: 'Volatile Remains', icon: '✹', description: 'Foes you kill burst with your core element, hurting and coating their neighbours.', rarity: 'uncommon', elements: [], tags: ['alchemist'], maxStacks: 1, mods: { killNova: 1 }, unlock: 'feat_kills_100' },
  { id: 'launch_flare', name: 'Launch Flare', icon: '⇧', description: 'Launching splashes your core element on foes within reach.', rarity: 'common', elements: [], tags: ['alchemist'], maxStacks: 2, mods: { launchNova: 1 }, unlock: 'feat_discover_5' },
  { id: 'elemental_wake', name: 'Elemental Wake', icon: '≋', description: 'At high speed you leave a short-lived trail of your core element.', rarity: 'rare', elements: [], tags: ['alchemist', 'kinetic'], maxStacks: 1, mods: { trail: 1 }, unlock: 'feat_first_win' },
  // Element-specific
  { id: 'wildfire', name: 'Wildfire', icon: '▲', description: 'Burning enemies take +60% fire damage over time; Inferno spreads to +1 target.', rarity: 'common', elements: ['fire'], tags: ['pyro'], maxStacks: 2, mods: { burnDps: 0.6, chainTargets: 1 } },
  { id: 'pressure_valve', name: 'Pressure Valve', icon: '☁', description: 'Steam Bursts on the ball launch you 40% harder.', rarity: 'common', elements: ['fire', 'water'], tags: ['pyro', 'alchemist'], maxStacks: 2, mods: { steamSelfBoost: 0.4 } },
  { id: 'ember_heart', name: 'Ember Heart', icon: '♨', description: 'Reactions involving Fire deal +35% damage.', rarity: 'common', elements: ['fire'], tags: ['pyro'], maxStacks: 2, mods: { dmg_fire: 0.35 }, unlock: 'feat_reactions_100' },
  { id: 'deep_freeze', name: 'Deep Freeze', icon: '❄', description: 'Freeze lasts 60% longer; Shatter deals +50% damage.', rarity: 'common', elements: ['ice', 'water'], tags: ['cryo'], maxStacks: 2, mods: { freezeDuration: 0.6, shatterDmg: 0.5 } },
  { id: 'rime_armor', name: 'Rime Armor', icon: '⛨', description: 'Ice reactions grant a shield that absorbs 12 damage.', rarity: 'uncommon', elements: ['ice'], tags: ['cryo'], maxStacks: 2, mods: { iceArmor: 12 } },
  { id: 'permafrost', name: 'Permafrost', icon: '✱', description: 'Reactions involving Ice deal +35% damage; freezes last 20% longer.', rarity: 'common', elements: ['ice'], tags: ['cryo'], maxStacks: 2, mods: { dmg_ice: 0.35, freezeDuration: 0.2 }, unlock: 'feat_shatter' },
  { id: 'arc_relay', name: 'Arc Relay', icon: 'ϟ', description: 'Lightning chains reach +2 targets and 30% further.', rarity: 'common', elements: ['lightning'], tags: ['storm'], maxStacks: 2, mods: { chainTargets: 2, chainRadius: 0.3 } },
  { id: 'capacitor', name: 'Capacitor', icon: '⌁', description: 'Lightning reactions deal +40% damage.', rarity: 'common', elements: ['lightning'], tags: ['storm'], maxStacks: 2, mods: { lightningDmg: 0.4 } },
  { id: 'conductive_film', name: 'Conductive Film', icon: '⫘', description: 'Conductive Surge chains +1 and lightning deals +30% damage.', rarity: 'uncommon', elements: ['water', 'lightning'], tags: ['storm', 'alchemist'], maxStacks: 1, mods: { chainTargets: 1, lightningDmg: 0.3 } },
  { id: 'galvanic_shell', name: 'Galvanic Shell', icon: '⚡', description: 'While carrying Lightning, every hit arcs to a nearby foe (8 damage).', rarity: 'uncommon', elements: ['lightning'], tags: ['storm'], maxStacks: 2, mods: { arcOnHit: 1 }, unlock: 'feat_chain_4' },
  { id: 'caustic', name: 'Caustic Brew', icon: '☣', description: 'Poison deals +60% damage over time.', rarity: 'common', elements: ['poison'], tags: ['toxic'], maxStacks: 2, mods: { poisonDps: 0.6 } },
  { id: 'toxic_bloom', name: 'Toxic Bloom', icon: '✿', description: 'Poisoned foes burst into a toxic cloud when they die.', rarity: 'uncommon', elements: ['poison'], tags: ['toxic'], maxStacks: 1, mods: { toxicBloom: 1 }, unlock: 'feat_discover_15' },
  { id: 'heavy_metal', name: 'Heavy Metal', icon: '⚙', description: '+40% impact damage while carrying Metal or Earth.', rarity: 'common', elements: ['metal', 'earth'], tags: ['juggernaut'], maxStacks: 2, mods: { heavyImpact: 0.4 } },
  { id: 'bedrock', name: 'Bedrock', icon: '■', description: '−30% contact damage taken while carrying Metal or Earth.', rarity: 'common', elements: ['metal', 'earth'], tags: ['juggernaut'], maxStacks: 2, mods: { heavyGuard: 0.3 }, unlock: 'feat_frostvein' },
  { id: 'gale_runner', name: 'Gale Runner', icon: '»', description: '+20% max speed and −15% drag while carrying Wind.', rarity: 'common', elements: ['wind'], tags: ['kinetic'], maxStacks: 2, mods: { windSpeed: 0.2 }, unlock: 'feat_level_5' },
  { id: 'arcane_resonance', name: 'Arcane Resonance', icon: '✦', description: 'Reactions involving Arcane deal +50% damage and chain +1.', rarity: 'uncommon', elements: ['arcane'], tags: ['alchemist'], maxStacks: 2, mods: { dmg_arcane: 0.5, chainTargets: 1 }, unlock: 'feat_overload' },
  // Evolutions (legendary)
  { id: 'phoenix_engine', name: 'Phoenix Engine', icon: '♆', description: 'Every kill erupts in an Inferno that leaps to 4 foes, and heals you 2.', rarity: 'legendary', elements: ['fire'], tags: ['pyro'], maxStacks: 1, mods: { phoenix: 1 }, requires: ['wildfire', 'volatile_remains'], unlock: 'res_evolutions' },
  { id: 'absolute_zero', name: 'Absolute Zero', icon: '❆', description: 'Shatter deals +150% damage and flash-freezes up to 3 nearby foes.', rarity: 'legendary', elements: ['ice'], tags: ['cryo'], maxStacks: 1, mods: { shatterDmg: 1.5, shatterSpread: 1 }, requires: ['deep_freeze', 'permafrost'], unlock: 'res_evolutions' },
  { id: 'thunderhead', name: 'Thunderhead', icon: '☈', description: 'Every launch calls lightning down on the 2 nearest foes (20 damage, charges them).', rarity: 'legendary', elements: ['lightning'], tags: ['storm'], maxStacks: 1, mods: { thunderLaunch: 2 }, requires: ['arc_relay', 'capacitor'], unlock: 'res_evolutions' },
  { id: 'perpetual_motion', name: 'Perpetual Motion', icon: '⟳', description: 'Wall bounces refund a quarter pip; Ricochet stacks to 10.', rarity: 'legendary', elements: [], tags: ['kinetic'], maxStacks: 1, mods: { perpetual: 1, ricochet: 0.1 }, requires: ['ricochet_glaze', 'slick_glaze'], unlock: 'res_evolutions' },
  { id: 'magnum_opus', name: 'Magnum Opus', icon: '☉', description: 'Reactions deal +60% damage and your ball transfers 60% more element.', rarity: 'legendary', elements: [], tags: ['alchemist'], maxStacks: 1, mods: { reactionDmg: 0.6, auraTransfer: 0.6 }, requires: ['volatile_mix', 'saturation'], unlock: 'res_evolutions' },
  { id: 'crown_of_iron', name: 'Crown of Iron', icon: '♜', description: 'Every solid impact quakes the ground around it; +50% impact damage.', rarity: 'legendary', elements: [], tags: ['juggernaut'], maxStacks: 1, mods: { quake: 1, impactDmg: 0.5 }, requires: ['dense_core', 'heavy_metal'], unlock: 'res_evolutions' },
  { id: 'plague_lord', name: 'Plague Lord', icon: '☠', description: 'Poison leaps between nearby foes every second; +50% poison damage.', rarity: 'legendary', elements: ['poison'], tags: ['toxic'], maxStacks: 1, mods: { plague: 1, poisonDps: 0.5 }, requires: ['caustic', 'toxic_bloom'], unlock: 'res_evolutions' },
  { id: 'executioner', name: 'Executioner’s Edge', icon: '⚔', description: '+20% crit chance, crits deal triple damage, and executes trigger below 25% HP.', rarity: 'legendary', elements: [], tags: ['kinetic'], maxStacks: 1, mods: { critChance: 0.2, critMul: 1, execute: 0.1 }, requires: ['lucky_strike', 'coup_de_grace'], unlock: 'res_evolutions' },
];
