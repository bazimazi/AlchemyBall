import type { Vec2 } from '../core/vec';
import type { HolderKind, StatusId } from '../content/types';

/** Everything the simulation tells the outside world. Presentation, audio, progression and analytics subscribe. */
export type SimEvent =
  | { type: 'impact'; pos: Vec2; speed: number; material: string; normal: Vec2 }
  | { type: 'hit'; pos: Vec2; targetUid: number; damage: number; speed: number; armored: boolean }
  | { type: 'reaction'; reactionId: string; pos: Vec2; holderKind: HolderKind; holderUid: number; depth: number; targets: number; kills: number; onBoss: boolean; color: string; radius: number }
  /** Element applied where a reaction is defined but its conditions were not met ("something stirred"). */
  | { type: 'stirred'; pair: string; pos: Vec2 }
  /** Two base elements met with no reaction defined: an informative "failed" experiment. */
  | { type: 'inert'; pair: string }
  | { type: 'elementSeen'; element: string }
  | { type: 'arc'; from: Vec2; to: Vec2; element: string }
  | { type: 'damage'; pos: Vec2; amount: number; element?: string; crit: boolean }
  | { type: 'status'; pos: Vec2; status: StatusId }
  | { type: 'kill'; pos: Vec2; enemyId: string; essence: number; isBoss: boolean; byReaction?: string }
  | { type: 'objectDestroyed'; pos: Vec2; objectId: string }
  | { type: 'ballDamaged'; amount: number; source: string; hp: number }
  | { type: 'ballDied'; cause: string }
  | { type: 'launch'; pos: Vec2; dir: Vec2; power: number }
  | { type: 'brake'; pos: Vec2 }
  | { type: 'shoot'; pos: Vec2; element?: string }
  | { type: 'zoneSpawned'; pos: Vec2; zone: string; radius: number }
  | { type: 'waveStart'; wave: number; total: number }
  | { type: 'cleared' }
  | { type: 'bossPhase'; phase: number; element: string; name: string }
  | { type: 'telegraph'; pos: Vec2; radius: number }
  | { type: 'buff'; buff: string };
