import { Content } from '../content';
import type { SimEvent } from '../sim/events';
import { addXp, masteryTier, recordReaction, type Profile } from './profile';
import type { Run } from './run';

export type Notice =
  | { kind: 'discovery'; reactionId: string; reward: number }
  | { kind: 'mastery'; reactionId: string; tier: number }
  | { kind: 'element'; element: string }
  | { kind: 'stirred'; pair: string }
  | { kind: 'levelUp'; level: number; reward: string };

/** XP sources — tuned so discovery and variety level you faster than grinding kills. */
export const XP = { kill: 1, room: 8, discovery: 20, masteryTier: 12, boss: 80, elite: 15 };

/**
 * Bridges simulation events into permanent progression. Everything recorded here is committed
 * to the profile immediately (discoveries are never lost to a failed run or a crash).
 */
export class ProgressionTracker {
  private dirty = false;

  constructor(private profile: Profile, private run: Run | null, private notify: (n: Notice) => void, private sandbox = false) {}

  handle(e: SimEvent): void {
    const p = this.profile;
    switch (e.type) {
      case 'reaction': {
        const feats: string[] = [e.holderKind];
        if (e.depth >= 1) feats.push('chain');
        if (e.depth >= 3) feats.push('deep');
        if (e.targets >= 3) feats.push('multi');
        if (e.kills > 0) feats.push('kill');
        if (e.onBoss) feats.push('boss');
        const res = recordReaction(p, e.reactionId, this.sandbox ? feats.filter((f) => f !== 'boss') : feats);
        p.stats.reactions++;
        if (this.run) {
          this.run.stats.reactions++;
          this.run.stats.reactionCounts[e.reactionId] = (this.run.stats.reactionCounts[e.reactionId] ?? 0) + 1;
          this.run.stats.maxChainDepth = Math.max(this.run.stats.maxChainDepth, e.depth);
          const mods = this.run.mods();
          if (mods.catalystOnReaction && this.run.stats.reactions % 8 === 0) this.run.catalysts++;
        }
        if (res.isNew) {
          const reward = Content.reactions.get(e.reactionId)?.discoveryReward ?? 0;
          p.fragments += reward;
          if (this.run) {
            this.run.stats.discoveries.push(e.reactionId);
            this.run.stats.fragments += reward;
          }
          this.xp(XP.discovery);
          this.notify({ kind: 'discovery', reactionId: e.reactionId, reward });
        }
        if (res.tierUp) {
          p.fragments += 3;
          this.run?.stats.masteryUps.push(e.reactionId);
          this.xp(XP.masteryTier);
          this.notify({ kind: 'mastery', reactionId: e.reactionId, tier: res.tierUp });
        }
        this.dirty = true;
        break;
      }
      case 'stirred':
        if (p.pairs[e.pair] !== 'stirred' && !this.pairKnown(e.pair)) {
          const first = p.pairs[e.pair] === undefined;
          p.pairs[e.pair] = 'stirred';
          if (first) this.notify({ kind: 'stirred', pair: e.pair });
          this.dirty = true;
        }
        break;
      case 'inert':
        if (!p.pairs[e.pair]) {
          p.pairs[e.pair] = 'inert';
          this.dirty = true;
        }
        break;
      case 'elementSeen':
        if (!p.seenElements.includes(e.element)) {
          p.seenElements.push(e.element);
          this.notify({ kind: 'element', element: e.element });
          this.dirty = true;
        }
        break;
      case 'kill': {
        const b = (p.bestiary[e.enemyId] ??= { seen: 0, kills: 0 });
        b.kills++;
        if (this.run && !this.sandbox) {
          const essence = Math.round(e.essence * (1 + this.run.cfg.heat * 0.15));
          this.run.stats.essence += essence;
          this.run.stats.kills++;
          this.xp(XP.kill);
          if (e.isBoss) this.run.stats.bossDefeated = true;
        }
        this.dirty = true;
        break;
      }
    }
  }

  noteEnemiesSeen(ids: string[]): void {
    for (const id of ids) (this.profile.bestiary[id] ??= { seen: 0, kills: 0 }).seen++;
    this.dirty = true;
  }

  xp(n: number): void {
    for (const up of addXp(this.profile, n)) this.notify({ kind: 'levelUp', level: up.level, reward: up.reward });
  }

  /** Whether anything changed since the last call (caller persists). */
  consumeDirty(): boolean {
    const d = this.dirty;
    this.dirty = false;
    return d;
  }

  private pairKnown(pair: string): boolean {
    const [a, b] = pair.split('+');
    return Content.lists.REACTIONS.some((r) => r.inputs.includes(a) && r.inputs.includes(b) && this.profile.discovered[r.id]);
  }
}

export { masteryTier };
