import { Content } from '../content';
import { contractMilestone } from './contracts';
import { checkFeats, FEATS, type FeatDef } from './feats';
import { addCoreXp, addXp, canAfford, coreRecord, nextCoreLevel, nextLevel, researchState, type Contract, type Profile } from './profile';
import type { Run } from './run';
import { XP } from './tracker';
import { recordTrialWin } from './trials';

export interface ProgressBar {
  label: string;
  cur: number;
  goal: number;
}

export interface RunSummary {
  won: boolean;
  mode: Run['cfg']['mode'];
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
  core: string;
  coreXp: number;
  coreLevelUps: number[];
  levelUps: number[];
  xpGained: number;
  feats: FeatDef[];
  contracts: Contract[];
  newRecord: boolean;
  heat: number;
  bosses: string[];
  newRegion?: string;
  trial?: ReturnType<typeof recordTrialWin>;
  /** Goal-gradient bars: the nearest milestones, shown on the results screen. */
  goals: ProgressBar[];
}

/** Advice keyed by what killed the player, so failure teaches something concrete. */
const ADVICE: Record<string, string> = {
  Projectile: 'Ranged foes chip you down. Steam clouds blind shooters — they cannot fire from inside one.',
  'Crucible Slam': 'Slams are telegraphed by a red ring. Launch out of the ring before it fills.',
  Flask: 'Flask landing zones are marked. Keep moving and use a pip to dodge.',
  Storm: 'Storm clouds strike from above. Stay out of hostile clouds or ground yourself with Earth.',
  'Poison Cloud': 'Spore Bloats burst into toxic clouds. Kill them from range with chain reactions, or burn them away from you.',
  'Volatile Remains': 'Volatile foes explode a moment after death — the orange ring shows the blast. Keep a pip to escape it.',
  Charge: 'A red lane means a charge is coming. Launch sideways out of the lane.',
};

function adviceFor(cause: string | undefined): string | undefined {
  if (!cause || cause === 'Abandoned') return undefined;
  if (ADVICE[cause]) return ADVICE[cause];
  if (cause.endsWith('Slam')) return 'Slams are telegraphed by a red ring. Launch out of the ring before it fills.';
  return `You were caught by ${cause} while moving slowly. You only take contact damage below launch speed — keep a pip in reserve.`;
}

/**
 * Commit end-of-run rewards. Essence was banked room-by-room; this adds completion bonuses,
 * marks, player and core XP, records, feats and contract progress.
 */
export function finishRun(p: Profile, run: Run, won: boolean, cause?: string): RunSummary {
  const endless = run.cfg.mode === 'endless';
  const floorReached = endless ? run.floor : run.floor + (won ? 0 : 1);
  const bonusEssence = Math.round(run.stats.roomsCleared * 3 + (won ? 25 : 0) + (endless ? run.floor * 2 : 0));
  p.essence += bonusEssence;
  const levelBefore = p.level;
  const xpBefore = p.xp;
  let marks = 0;
  const ratedExpedition = run.cfg.mode === 'standard' && !run.trial;
  const trial = won && run.trial && run.cfg.trial ? recordTrialWin(p, run.cfg.trial, run.region.id, run.cfg.core, run.cfg.heat) : undefined;
  const bosses = run.stats.bossesDefeated;
  const newRegion = won && p.stats.bossKills[run.region.boss] === 1
    ? Content.lists.REGIONS.find((region) => region.requiresBoss === run.region.boss)?.id : undefined;
  if (won) {
    const boss = Content.bosses[run.region.boss];
    marks = (boss?.marks ?? 1) + Math.floor(run.cfg.heat / 2);
    p.stats.wins++;
    if (ratedExpedition && run.cfg.heat > p.maxHeatWon) p.maxHeatWon = run.cfg.heat;
    const trophy = `boss:${run.region.boss}:${run.cfg.core}`;
    if (!p.trophies.includes(trophy)) p.trophies.push(trophy);
  } else {
    p.stats.losses++;
    if (p.settings.assist) p.assistStacks++;
  }
  if (endless) marks += bosses.length;
  p.marks += marks;
  p.stats.runs++;
  p.stats.rooms += run.stats.roomsCleared;
  p.stats.bestFloor = Math.max(p.stats.bestFloor, Math.min(floorReached, endless ? floorReached : run.map.length));
  p.stats.playSeconds += run.stats.timeSec;
  for (const ev of run.stats.evolutions) if (!p.stats.evolutions.includes(ev)) p.stats.evolutions.push(ev);
  if (cause) p.stats.deaths[cause] = (p.stats.deaths[cause] ?? 0) + 1;
  if (run.cfg.tutorial) p.tutorialDone = true;
  if (run.cfg.mode === 'daily') p.stats.dailies++;
  let newRecord = !!trial;
  if (endless && run.floor > p.endlessBest) {
    p.endlessBest = run.floor;
    newRecord = true;
  }
  // Core mastery.
  const rec = coreRecord(p, run.cfg.core);
  rec.runs++;
  if (won) {
    rec.wins++;
    if (ratedExpedition && run.cfg.heat > rec.bestHeat) {
      rec.bestHeat = run.cfg.heat;
      newRecord = true;
    }
  }
  const coreXp = Math.round(run.stats.roomsCleared * 4 + run.stats.kills * 0.5 + run.stats.discoveries.length * 5 + bosses.length * 30 + (won ? 60 : 0) + run.cfg.heat * 4);
  const coreLevelUps = run.cfg.mode === 'daily' && !p.cores[run.cfg.core] ? [] : addCoreXp(p, run.cfg.core, coreXp);
  const xp = run.stats.roomsCleared * XP.room + (won ? XP.boss : 0) + (endless ? bosses.length * XP.boss : 0);
  // XP from kills/discoveries was granted live by the tracker.
  const levelUps = addXp(p, xp).map((l) => l.level);
  const contracts = contractMilestone(p, 'floor', Math.min(floorReached, run.map.length), run.cfg.core);
  const feats = checkFeats(p);
  const topReactions = Object.entries(run.stats.reactionCounts)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
  return {
    won, mode: run.cfg.mode, cause, causeAdvice: won ? undefined : adviceFor(cause), floorReached,
    essence: run.stats.essence + bonusEssence, fragments: run.stats.fragments + (trial?.fragments ?? 0), marks,
    discoveries: run.stats.discoveries, masteryUps: run.stats.masteryUps, topReactions,
    nextGoal: nextGoal(p), bonusEssence, core: run.cfg.core, coreXp, coreLevelUps, levelUps: levelUps.filter((l) => l > levelBefore),
    xpGained: p.xp - xpBefore, feats, contracts, newRecord, heat: run.cfg.heat, bosses, newRegion, trial, goals: goalBars(p, run.cfg.core),
  };
}

/** The nearest few milestones, each shown as a progress bar (goal-gradient effect). */
export function goalBars(p: Profile, core: string): ProgressBar[] {
  const bars: ProgressBar[] = [];
  const nl = nextLevel(p);
  if (nl) {
    const prev = Content.masteryLevels.find((l) => l.level === p.level)?.xp ?? 0;
    bars.push({ label: `Level ${nl.level}: ${nl.reward}`, cur: Math.max(0, p.xp - prev), goal: nl.xp - prev });
  }
  const ncl = nextCoreLevel(p, core);
  const crec = coreRecord(p, core);
  if (ncl) {
    const prev = Content.coreLevels.find((l) => l.level === crec.level)?.xp ?? 0;
    bars.push({ label: `${Content.cores.get(core)?.name} level ${ncl.level}: ${ncl.reward}`, cur: Math.max(0, crec.xp - prev), goal: ncl.xp - prev });
  }
  const feat = FEATS.filter((f) => !p.feats.includes(f.id) && f.progress)
    .map((f) => ({ f, pr: f.progress!(p) }))
    .filter((x) => x.pr[0] < x.pr[1])
    .sort((a, b) => b.pr[0] / b.pr[1] - a.pr[0] / a.pr[1])[0];
  if (feat) bars.push({ label: `Feat · ${feat.f.name}: ${feat.f.description}`, cur: feat.pr[0], goal: feat.pr[1] });
  const known = Object.keys(p.discovered).length;
  bars.push({ label: 'Alchemy Codex', cur: known, goal: Content.lists.REACTIONS.length });
  return bars.slice(0, 4);
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
