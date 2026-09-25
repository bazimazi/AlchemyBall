/**
 * Content definition types. Everything the designer tunes lives in plain data objects that
 * satisfy these interfaces, is registered in `content/index.ts`, and is checked by
 * `content/validate.ts` (run `npm run validate`).
 */

export type ElementId = string;
export type ReactionId = string;
export type ZoneId = string;
export type StatusId = 'frozen' | 'stunned' | 'slowed' | 'magnetized' | 'exposed' | 'blinded' | 'petrified';
export type HolderKind = 'ball' | 'enemy' | 'zone' | 'object';
export type Faction = 'player' | 'hostile' | 'neutral';

/** Per-unit-of-aura multipliers applied to the ball while it carries an element. */
export interface PhysicsMods {
  massMul: number;
  restitutionAdd: number;
  dragMul: number;
  maxSpeedMul: number;
  launchMul: number;
  impactDamageMul: number;
}

export interface ElementDef {
  id: ElementId;
  name: string;
  /** Primary display color (hex). */
  color: string;
  /** Single glyph used in HUD chips and the Codex matrix. */
  glyph: string;
  /** `base` elements appear in the Codex matrix, `compound` ones are produced by reactions, `hidden` are engine-only (kinetic). */
  tier: 'base' | 'compound' | 'hidden';
  description: string;
  /** Aura units lost per second when not replenished. */
  decayPerSec: number;
  maxAmount: number;
  /** Effect on ball physics at aura amount 1.0 (linearly scaled, capped at 1.0). */
  ballPhysics?: Partial<PhysicsMods>;
  /** Passive effect on enemies carrying this aura. */
  onEnemy?: { dps?: number; slowMul?: number };
  /** Research node that must be unlocked before the ball may carry it as a core. Environmental sources ignore this. */
  unlock?: string;
}

export interface ReactionConditions {
  /** Minimum impact speed of the collision that delivered the element. */
  minImpactSpeed?: number;
  /** Holder must have this status. */
  holderStatus?: StatusId;
  /** Holder must have at least one of these tags. */
  holderTags?: string[];
  /** amount(inputs[0]) / amount(inputs[1]) must be >= this. Lets one pair behave differently by quantity. */
  minRatio?: number;
  /** amount(inputs[0]) / amount(inputs[1]) must be < this. */
  maxRatio?: number;
}

export type EffectDef =
  /** Damage around the holder (radius 0 = holder only). `tagMul` multiplies vs targets with tags. */
  | { type: 'damage'; amount: number; radius?: number; tagMul?: Record<string, number>; statusMul?: Partial<Record<StatusId, number>> }
  | { type: 'status'; status: StatusId; duration: number; radius?: number }
  | { type: 'clearStatus'; status: StatusId }
  | { type: 'spawnZone'; zone: ZoneId; radius: number; duration: number }
  /** Push enemies/objects away from holder; if holder is the ball, boosts the ball's own speed by `selfBoost`. */
  | { type: 'impulse'; strength: number; radius: number; selfBoost?: number }
  /** Apply an element to nearby holders (optionally filtered). Propagates reactions at depth+1. */
  | { type: 'chain'; element: ElementId; amount: number; radius: number; maxTargets: number; requireAura?: ElementId; requireTag?: string; damage?: number }
  /** Terrain manipulation: solidify into a temporary obstacle. */
  | { type: 'spawnObstacle'; obstacle: 'obsidian' | 'ice_pillar'; radius: number; duration: number }
  /** Remove the zone that hosted the reaction (zone holders only). */
  | { type: 'consumeZone' }
  /** Grant the ball a timed physics buff. */
  | { type: 'ballBuff'; buff: BallBuffId; duration: number }
  /** Multiply the amount of the other (present) element left on the holder. Used by Arcane amplification. */
  | { type: 'amplify'; mul: number };

export type BallBuffId = 'ballLightning' | 'ironstone' | 'steamJet' | 'overcharged';

export interface ReactionDef {
  id: ReactionId;
  name: string;
  /** Player-facing rule, shown after discovery. */
  description: string;
  /** Shown for undiscovered reactions once one input is known. Must not give the answer away fully. */
  hint: string;
  /** Suggested follow-up shown on the discovery card. */
  followUp: string;
  category: 'primary' | 'secondary' | 'environmental' | 'impact' | 'chain' | 'transformation' | 'rare';
  /** Unordered pair of inputs. `*` matches any base element other than the partner. */
  inputs: [ElementId, ElementId];
  holders?: HolderKind[];
  conditions?: ReactionConditions;
  /** Higher priority reactions are tried first for the same input pair (context variants). */
  priority?: number;
  /** Fraction of applied/present aura consumed (0..1). */
  consume: { applied: number; present: number };
  /** Leave a compound aura on the holder. */
  output?: { element: ElementId; amount: number };
  effects: EffectDef[];
  /** Per-holder cooldown in seconds. */
  cooldown: number;
  rarity: 'common' | 'uncommon' | 'rare';
  /** Research fragments awarded on first discovery. */
  discoveryReward: number;
  /** Colour used for the reaction burst; defaults to output/first input element colour. */
  color?: string;
  /** Research node required for this reaction to exist in play (content gating). */
  unlock?: string;
}

export interface ZoneDef {
  id: ZoneId;
  name: string;
  element?: ElementId;
  /** Aura applied to holders inside per tick. */
  applyAmount: number;
  tickInterval: number;
  /** Damage per second to opposite faction inside. */
  dps: number;
  /** Multiplier on ball drag while inside (<1 slippery, >1 sticky). */
  ballDragMul: number;
  /** Multiplier on enemy speed inside. */
  enemySpeedMul: number;
  /** Enemies inside cannot aim/shoot (vision obscured). */
  obscures?: boolean;
  /** Affects flying enemies. */
  affectsFlying: boolean;
  /** Periodic lightning strikes on a random hostile inside. */
  strikes?: { interval: number; damage: number };
  /** Constant push (wind current). */
  push?: number;
  color: string;
  /** Visual style hint for renderer. */
  look: 'pool' | 'cloud' | 'patch' | 'current';
}

export type EnemyAi = 'chaser' | 'shooter' | 'wanderer' | 'flyer' | 'bloat' | 'turret' | 'dummy';

export interface EnemyDef {
  id: string;
  name: string;
  description: string;
  /** Teaching note shown in the bestiary: what this enemy tests. */
  lesson: string;
  hp: number;
  radius: number;
  mass: number;
  speed: number;
  ai: EnemyAi;
  /** Element the enemy always carries (regenerates). */
  innate?: { element: ElementId; amount: number };
  /** Impact-damage reduction 0..1, bypassed while `exposed`. */
  armor: number;
  tags: string[];
  /** Multiplier on aura amounts applied to this enemy per element. 0 = immune. */
  resist?: Record<ElementId, number>;
  contactDamage: number;
  projectile?: { element?: ElementId; speed: number; damage: number; interval: number; radius: number };
  onDeath?: EffectDef[];
  essence: number;
  /** Encounter budget cost. */
  threat: number;
  color: string;
  /** Adapts: gains resistance to elements that hit it repeatedly. */
  adaptive?: boolean;
}

export interface ObjectDef {
  id: string;
  name: string;
  radius: number;
  /** Element applied to the ball on touch; also its standing aura. */
  element?: ElementId;
  amount: number;
  /** Aura regeneration per second (sources refill). */
  regen: number;
  tags: string[];
  /** Hit points; undefined = indestructible. */
  hp?: number;
  restitution: number;
  onDestroy?: EffectDef[];
  color: string;
  look: 'brazier' | 'coil' | 'post' | 'crystal' | 'boulder' | 'fan' | 'barrel' | 'rune' | 'crate' | 'bumper' | 'font';
}

export interface CoreDef {
  id: string;
  name: string;
  element: ElementId;
  archetype: string;
  description: string;
  /** Base stat tweaks. */
  maxHp: number;
  unlock?: string;
}

export interface ShellDef {
  id: string;
  name: string;
  description: string;
  mods: Partial<PhysicsMods> & { maxHpAdd?: number; contactReduce?: number };
  unlock?: string;
}

export type UpgradeRarity = 'common' | 'uncommon' | 'rare';

export interface UpgradeDef {
  id: string;
  name: string;
  description: string;
  rarity: UpgradeRarity;
  /** Elements this upgrade is about; used to avoid offering irrelevant upgrades and to show synergy. */
  elements: ElementId[];
  /** Tags for build identity (pyro, cryo, storm, kinetic, toxic, alchemist, juggernaut). */
  tags: string[];
  maxStacks: number;
  /** Stable key-value modifiers read by the simulation. Keys are documented in sim/modifiers.ts. */
  mods: Record<string, number>;
  unlock?: string;
}

export interface ResearchNode {
  id: string;
  name: string;
  description: string;
  branch: 'elements' | 'ball' | 'lab' | 'world';
  cost: { fragments?: number; essence?: number; marks?: number };
  requires: string[];
  /** What the node grants, for UI. */
  grants: string;
}

export interface RoomTemplate {
  id: string;
  /** Interior obstacles/sources placed in normalized arena coordinates (0..1). */
  objects: { id: string; x: number; y: number }[];
  zones: { id: ZoneId; x: number; y: number; r: number }[];
  walls?: { x1: number; y1: number; x2: number; y2: number; material?: 'stone' | 'bumper' | 'metal' }[];
}

export interface RegionDef {
  id: string;
  name: string;
  description: string;
  enemyPool: { id: string; weight: number; minFloor: number }[];
  elitePool: string[];
  templates: RoomTemplate[];
  boss: string;
  floors: number;
  palette: { bg: string; floor: string; wall: string; accent: string };
}
