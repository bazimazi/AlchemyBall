import { Content } from '../content';
import { addXp, canAfford, nextLevel, researchState, type Profile } from './profile';
import type { Run } from './run';
import { XP } from './tracker';

export interface RunSummary {
  won: boolean;
  cause?: string;
  causeAdvice?: string;
  floorReached: number;
  essence: number;
  fragments: number;
  marks: number;
  discoveries: string[];
  masteryUps: string[];
  topReactions: { id: string; count: number }[];
  nextGoal: string;
  bonusEssence: number;
}

/** Advice keyed by what killed the player, so failure teaches something concrete. */
const ADVICE: Record<string, string> = {
  Projectile: 'Ranged foes chip you down. Steam clouds blind shooters — they cannot fire from inside one.',
  'Crucible Slam': 'Slams are telegraphed by a red ring. Launch out of the ring before it fills.',
  Flask: 'Flask landing zones are marked. Keep moving and use a pip to dodge.',
  Storm: 'Storm clouds strike from above. Stay out of hostile clouds or ground yourself with Earth.',
  'Poison Cloud': 'Spore Bloats burst into toxic clouds. Kill them from range with chain reactions, or burn them away from you.',
};

function adviceFor(cause: string | undefined): string | undefined {
  if (!cause) return undefined;
  if (ADVICE[cause]) return ADVICE[cause];
  return `You were caught by ${cause} while moving slowly. You only take contact damage below launch speed — keep a pip in reserve.`;
}

/**
 * Commit end-of-run rewards. Essence was banked room-by-room; this adds completion bonuses,
 * marks and XP, and updates records. Idempotent per run via the returned summary being stored by the caller.
 */
export function finishRun(p: Profile, run: Run, won: boolean, cause?: string): RunSummary {
  const floorReached = run.floor + (won ? 0 : 1);
  const bonusEssence = Math.round(run.stats.roomsCleared * 3 + (won ? 25 : 0));
  p.essence += bonusEssence;
  let marks = 0;
  if (won) {
    marks = 1 + run.cfg.heat;
    p.marks += marks;
    p.stats.wins++;
    if (run.cfg.heat > p.maxHeatWon) p.maxHeatWon = run.cfg.heat;
    const trophy = `boss:${run.region.boss}:${run.cfg.core}`;
    if (!p.trophies.includes(trophy)) p.trophies.push(trophy);
  }
  p.stats.runs++;
  p.stats.bestFloor = Math.max(p.stats.bestFloor, floorReached);
  p.stats.playSeconds += run.stats.timeSec;
  if (cause) p.stats.deaths[cause] = (p.stats.deaths[cause] ?? 0) + 1;
  if (run.cfg.tutorial) p.tutorialDone = true;
  const xp = run.stats.roomsCleared * XP.room + (won ? XP.boss : 0);
  // XP from kills/discoveries was granted live by the tracker.
  addXp(p, xp);
  const topReactions = Object.entries(run.stats.reactionCounts)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
  return {
    won, cause, causeAdvice: won ? undefined : adviceFor(cause), floorReached,
    essence: run.stats.essence + bonusEssence, fragments: run.stats.fragments, marks,
    discoveries: run.stats.discoveries, masteryUps: run.stats.masteryUps, topReactions,
    nextGoal: nextGoal(p), bonusEssence,
  };
}

/** The single most useful next milestone to show the player. */
export function nextGoal(p: Profile): string {
  const affordable = Content.lists.RESEARCH.find((n) => researchState(p, n) === 'available' && canAfford(p, n.cost));
  if (affordable) return `You can research ${affordable.name} now: ${affordable.grants}.`;
  const avail = Content.lists.RESEARCH.filter((n) => researchState(p, n) === 'available').sort((a, b) => (a.cost.fragments ?? 0) + (a.cost.essence ?? 0) / 4 - ((b.cost.fragments ?? 0) + (b.cost.essence ?? 0) / 4))[0];
  const known = Object.keys(p.discovered).length;
  const total = Content.lists.REACTIONS.length;
  if (avail) {
    const needF = Math.max(0, (avail.cost.fragments ?? 0) - p.fragments);
    const needE = Math.max(0, (avail.cost.essence ?? 0) - p.essence);
    const needM = Math.max(0, (avail.cost.marks ?? 0) - p.marks);
    const parts = [needF && `${needF} Fragments`, needE && `${needE} Essence`, needM && `${needM} Mastery Mark`].filter(Boolean);
    return `${parts.join(' + ')} to research ${avail.name} (${avail.grants}). Discoveries give Fragments — ${known}/${total} reactions found.`;
  }
  const nl = nextLevel(p);
  if (nl) return `${nl.xp - p.xp} XP to Mastery level ${nl.level}: ${nl.reward}.`;
  return `${known}/${total} reactions discovered. Raise the Heat for new challenges.`;
}
