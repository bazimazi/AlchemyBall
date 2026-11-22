import type { Rng } from '../core/rng';
import type { SimEvent } from '../sim/events';

/**
 * Optional bonus objectives for combat rooms ("Alchemist's Challenges"). They reward playing
 * with intent — chaining reactions, keeping combos alive, bank shots — without ever being
 * required. Pure logic: fed SimEvents, it reports progress.
 */
export type ChallengeKind = 'reactions' | 'combo' | 'nohit' | 'chain' | 'reactionKills' | 'bank' | 'fast';

export interface ChallengeDef {
  kind: ChallengeKind;
  goal: number;
  text: string;
  reward: { catalysts: number; essence: number };
}

export function rollChallenge(rng: Rng, floor: number, elite: boolean, waves: number): ChallengeDef {
  const kinds: ChallengeKind[] = ['reactions', 'combo', 'nohit', 'chain', 'reactionKills', 'bank', 'fast'];
  const kind = rng.pick(kinds);
  const reward = { catalysts: elite ? 3 : 2, essence: 8 + floor * 2 };
  switch (kind) {
    case 'reactions': { const g = 6 + floor * 2; return { kind, goal: g, text: `Trigger ${g} reactions`, reward }; }
    case 'combo': { const g = 6 + Math.floor(floor / 2) * 2; return { kind, goal: g, text: `Reach a ×${g} combo`, reward }; }
    case 'nohit': return { kind, goal: 1, text: 'Clear without taking damage', reward: { catalysts: reward.catalysts + 1, essence: reward.essence + 5 } };
    case 'chain': return { kind, goal: 1, text: 'Trigger a reaction 3 links deep', reward };
    case 'reactionKills': { const g = 3 + Math.floor(floor / 2); return { kind, goal: g, text: `Finish ${g} foes with reactions`, reward }; }
    case 'bank': return { kind, goal: 2, text: 'Hit foes after 2+ wall bounces, twice', reward };
    case 'fast': { const g = Math.round(30 + waves * 10 + floor * 3); return { kind, goal: g, text: `Clear in under ${g} seconds`, reward }; }
  }
}

export class ChallengeTracker {
  progress = 0;
  failed = false;
  done = false;

  constructor(readonly def: ChallengeDef) {}

  handle(e: SimEvent, simTime: number): boolean {
    if (this.done || this.failed) return false;
    const d = this.def;
    switch (d.kind) {
      case 'reactions': if (e.type === 'reaction') this.progress++; break;
      case 'combo': if (e.type === 'combo') this.progress = Math.max(this.progress, e.count); break;
      case 'nohit': if (e.type === 'ballDamaged') this.failed = true; if (e.type === 'cleared') this.progress = 1; break;
      case 'chain': if (e.type === 'reaction' && e.depth >= 2) this.progress = 1; break;
      case 'reactionKills': if (e.type === 'kill' && e.byReaction && !e.isBoss) this.progress++; break;
      case 'bank': if (e.type === 'hit' && (e.bounces ?? 0) >= 2) this.progress++; break;
      case 'fast':
        if (simTime > d.goal) this.failed = true;
        else if (e.type === 'cleared') this.progress = d.goal;
        break;
    }
    if (!this.failed && this.progress >= d.goal) {
      this.done = true;
      return true;
    }
    return false;
  }

  /** Called every frame for time-based challenges. */
  tick(simTime: number): void {
    if (this.def.kind === 'fast' && !this.done && simTime > this.def.goal) this.failed = true;
  }

  label(): string {
    const d = this.def;
    if (this.done) return `✓ ${d.text}`;
    if (this.failed) return `✗ ${d.text}`;
    if (d.kind === 'nohit' || d.kind === 'chain' || d.kind === 'fast') return d.text;
    return `${d.text} (${Math.min(this.progress, d.goal)}/${d.goal})`;
  }
}
