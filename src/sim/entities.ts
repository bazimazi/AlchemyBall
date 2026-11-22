import type { Vec2 } from '../core/vec';
import type { BallBuffId, EnemyDef, Faction, HolderKind, ObjectDef, StatusId, ZoneDef } from '../content/types';

/** Anything that can carry elemental auras and host reactions. */
export interface Holder {
  uid: number;
  kind: HolderKind;
  pos: Vec2;
  radius: number;
  /** element id → amount */
  auras: Map<string, number>;
  /** reaction id → seconds remaining */
  cooldowns: Map<string, number>;
  /** status → seconds remaining */
  statuses: Map<StatusId, number>;
  tags: readonly string[];
  faction: Faction;
  dead: boolean;
}

export interface Ball extends Holder {
  kind: 'ball';
  vel: Vec2;
  hp: number;
  maxHp: number;
  shield: number;
  coreElement: string;
  pips: number;
  maxPips: number;
  pipTimer: number;
  focus: number;
  maxFocus: number;
  buffs: Map<BallBuffId, number>;
  invuln: number;
  brakeCd: number;
  /** Seconds since last launch; used for trail/feedback. */
  sinceLaunch: number;
  /** Wall bounces since the last launch (Ricochet). */
  bounces: number;
  /** Current shot combo and how long the ball has been resting. */
  combo: number;
  restTimer: number;
  /** Wake timer (Elemental Wake trail). */
  trailTimer: number;
}

export interface Enemy extends Holder {
  kind: 'enemy';
  def: EnemyDef;
  vel: Vec2;
  hp: number;
  maxHp: number;
  mass: number;
  armor: number;
  shootTimer: number;
  aiTimer: number;
  aiDir: number;
  /** Adaptive resistance: element → multiplier (starts 1). */
  adapt: Map<string, number>;
  adaptHits: Map<string, number>;
  hitFlash: number;
  isBoss: boolean;
  /** Last damage source for kill attribution. */
  lastHitBy?: string;
  spawnFx: number;
  /** Elite/Heat affixes. */
  affixes: string[];
  /** Shielded affix: damage absorbed before HP. */
  ward: number;
  maxWard: number;
  /** World time of the last damage taken (Regenerating). */
  lastHurt: number;
  /** Multiplier on this enemy's damage to the ball. */
  dmgMul: number;
  /** Multiplier on movement speed (Swift, Heat). */
  speedMul: number;
}

export interface Zone extends Holder {
  kind: 'zone';
  def: ZoneDef;
  ttl: number;
  maxTtl: number;
  /** holder uid → tick timer */
  ticks: Map<number, number>;
  strikeTimer: number;
  dir: Vec2;
}

export interface ArenaObject extends Holder {
  kind: 'object';
  def: ObjectDef;
  hp: number;
  maxHp: number;
  ttl: number;
  hitFlash: number;
}

export interface Projectile {
  uid: number;
  pos: Vec2;
  vel: Vec2;
  radius: number;
  element?: string;
  damage: number;
  faction: Faction;
  ttl: number;
  /** Lobbed flask: lands at target and spawns a zone. */
  lob?: { target: Vec2; zone: string; zoneRadius: number; t: number; dur: number; from: Vec2 };
  dead: boolean;
}

export interface Wall {
  a: Vec2;
  b: Vec2;
  material: 'stone' | 'bumper' | 'metal';
}

/** Telegraphed hostile attack (boss slam etc). */
export interface Telegraph {
  uid: number;
  pos: Vec2;
  radius: number;
  t: number;
  dur: number;
  damage: number;
  color: string;
  /** Death cause shown if this attack kills the ball. */
  cause: string;
  kind: 'circle' | 'line' | 'nova';
  /** Line telegraphs (boss charge): direction and length. */
  dir?: { x: number; y: number };
  length?: number;
  /** Custom resolution (boss novas/charges, volatile explosions). Replaces the default slam. */
  fire?: () => void;
}

export type AnyHolder = Ball | Enemy | Zone | ArenaObject;
