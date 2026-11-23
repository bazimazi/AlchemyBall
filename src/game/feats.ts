import { Content } from '../content';
import { grantCosmetic, masteryTier, type Profile } from './profile';

/**
 * Feats (achievements). Each teaches or celebrates a behaviour ("do X with Y") rather than
 * demanding grind, and most unlock something: an upgrade enters the run pool, or a cosmetic.
 * Unlocking is checked from the profile alone, so it is robust to crashes and replays.
 */
export interface FeatDef {
  id: string;
  name: string;
  description: string;
  category: 'Discovery' | 'Mastery' | 'Combat' | 'Journey' | 'Challenge';
  check: (p: Profile) => boolean;
  /** Progress toward the feat for the UI: [current, goal]. */
  progress?: (p: Profile) => [number, number];
  reward?: { essence?: number; fragments?: number; marks?: number; cosmetic?: string };
}

const known = (p: Profile) => Object.keys(p.discovered).length;
const mastered = (p: Profile, tier: number) => Object.values(p.discovered).filter((r) => masteryTier(r) >= tier).length;
const bossKills = (p: Profile, id: string) => p.stats.bossKills[id] ?? 0;
const coresWon = (p: Profile) => Object.values(p.cores).filter((c) => c.wins > 0).length;
const totalBossKills = (p: Profile) => Object.values(p.stats.bossKills).reduce((a, b) => a + b, 0);
const count = (n: number, goal: number): [number, number] => [Math.min(n, goal), goal];

export const FEATS: FeatDef[] = [
  // Discovery
  { id: 'feat_discover_1', name: 'First Spark', category: 'Discovery', description: 'Discover your first reaction.', check: (p) => known(p) >= 1, reward: { essence: 10 } },
  { id: 'feat_discover_5', name: 'Apprentice Chemist', category: 'Discovery', description: 'Discover 5 reactions.', check: (p) => known(p) >= 5, progress: (p) => count(known(p), 5) },
  { id: 'feat_discover_15', name: 'Journeyman Chemist', category: 'Discovery', description: 'Discover 15 reactions.', check: (p) => known(p) >= 15, progress: (p) => count(known(p), 15) },
  { id: 'feat_discover_25', name: 'Master Chemist', category: 'Discovery', description: 'Discover 25 reactions.', check: (p) => known(p) >= 25, progress: (p) => count(known(p), 25), reward: { fragments: 20 } },
  { id: 'feat_discover_all', name: 'The Complete Codex', category: 'Discovery', description: 'Discover every reaction.', check: (p) => known(p) >= Content.lists.REACTIONS.length, progress: (p) => count(known(p), Content.lists.REACTIONS.length), reward: { essence: 300, marks: 1 } },
  { id: 'feat_shatter', name: 'Brittle Truth', category: 'Discovery', description: 'Discover Shatter: hit a frozen foe hard.', check: (p) => !!p.discovered.shatter },
  { id: 'feat_overload', name: 'Arcane Insight', category: 'Discovery', description: 'Discover Arcane Overload.', check: (p) => !!p.discovered.overload },
  { id: 'feat_bestiary', name: 'Naturalist', category: 'Discovery', description: 'Encounter 12 different creatures.', check: (p) => Object.keys(p.bestiary).length >= 12, progress: (p) => count(Object.keys(p.bestiary).length, 12), reward: { fragments: 10 } },
  // Mastery
  { id: 'feat_mastery_1', name: 'Practised Hand', category: 'Mastery', description: 'Raise any reaction to ★ mastery.', check: (p) => mastered(p, 1) >= 1, reward: { essence: 20 } },
  { id: 'feat_mastery_gold', name: 'Virtuoso', category: 'Mastery', description: 'Raise any reaction to ★★★ mastery.', check: (p) => mastered(p, 3) >= 1, reward: { fragments: 10 } },
  { id: 'feat_mastery_10', name: 'Polymath', category: 'Mastery', description: 'Raise 10 reactions to ★★★ mastery.', check: (p) => mastered(p, 3) >= 10, progress: (p) => count(mastered(p, 3), 10), reward: { fragments: 40 } },
  { id: 'feat_core_5', name: 'Bonded', category: 'Mastery', description: 'Reach core level 5 with any core.', check: (p) => Object.values(p.cores).some((c) => c.level >= 5), reward: { fragments: 15 } },
  { id: 'feat_level_5', name: 'Journeyman', category: 'Mastery', description: 'Reach player level 5.', check: (p) => p.level >= 5, progress: (p) => count(p.level, 5) },
  { id: 'feat_level_15', name: 'Grand Alchemist', category: 'Mastery', description: 'Reach player level 15.', check: (p) => p.level >= 15, progress: (p) => count(p.level, 15), reward: { marks: 1 } },
  // Combat
  { id: 'feat_combo_10', name: 'Flow State', category: 'Combat', description: 'Reach a ×10 combo in one flowing sequence.', check: (p) => p.stats.maxCombo >= 10, progress: (p) => count(p.stats.maxCombo, 10) },
  { id: 'feat_combo_25', name: 'Unstoppable', category: 'Combat', description: 'Reach a ×25 combo.', check: (p) => p.stats.maxCombo >= 25, progress: (p) => count(p.stats.maxCombo, 25), reward: { essence: 100 } },
  { id: 'feat_bank_shot', name: 'Bank Shot', category: 'Combat', description: 'Hit a foe after 3+ wall bounces in one launch.', check: (p) => p.stats.maxBounceHit >= 3 },
  { id: 'feat_chain_4', name: 'Domino Effect', category: 'Combat', description: 'Trigger a reaction 4 links deep.', check: (p) => p.stats.maxChain >= 3 },
  { id: 'feat_kills_100', name: 'Exterminator', category: 'Combat', description: 'Defeat 100 foes.', check: (p) => p.stats.kills >= 100, progress: (p) => count(p.stats.kills, 100) },
  { id: 'feat_kills_1000', name: 'Scourge', category: 'Combat', description: 'Defeat 1,000 foes.', check: (p) => p.stats.kills >= 1000, progress: (p) => count(p.stats.kills, 1000), reward: { essence: 200 } },
  { id: 'feat_reactions_100', name: 'Catalyst', category: 'Combat', description: 'Trigger 100 reactions.', check: (p) => p.stats.reactions >= 100, progress: (p) => count(p.stats.reactions, 100) },
  { id: 'feat_reactions_2000', name: 'Reactor', category: 'Combat', description: 'Trigger 2,000 reactions.', check: (p) => p.stats.reactions >= 2000, progress: (p) => count(p.stats.reactions, 2000), reward: { fragments: 30 } },
  { id: 'feat_elite', name: 'Elite Hunter', category: 'Combat', description: 'Defeat an elite.', check: (p) => p.stats.elites >= 1 },
  { id: 'feat_elites_25', name: 'Apex Predator', category: 'Combat', description: 'Defeat 25 elites.', check: (p) => p.stats.elites >= 25, progress: (p) => count(p.stats.elites, 25), reward: { essence: 150 } },
  { id: 'feat_untouched', name: 'Untouchable', category: 'Combat', description: 'Clear a combat room without taking damage.', check: (p) => p.stats.noHitRooms >= 1 },
  { id: 'feat_shatter_50', name: 'Shatterpoint', category: 'Combat', description: 'Shatter foes 50 times.', check: (p) => (p.discovered.shatter?.count ?? 0) >= 50, progress: (p) => count(p.discovered.shatter?.count ?? 0, 50), reward: { cosmetic: 'skin_crystal' } },
  { id: 'feat_flawless_boss', name: 'Flawless', category: 'Combat', description: 'Defeat a boss without taking damage in the fight.', check: (p) => p.stats.flawlessBoss, reward: { essence: 120 } },
  // Journey
  { id: 'feat_runs_3', name: 'Persistent', category: 'Journey', description: 'Complete 3 runs (win or lose).', check: (p) => p.stats.runs >= 3, progress: (p) => count(p.stats.runs, 3) },
  { id: 'feat_rooms_25', name: 'Cartographer', category: 'Journey', description: 'Clear 25 rooms.', check: (p) => p.stats.rooms >= 25, progress: (p) => count(p.stats.rooms, 25) },
  { id: 'feat_first_win', name: 'Crucible Breaker', category: 'Journey', description: 'Defeat the Crucible Warden.', check: (p) => bossKills(p, 'warden') >= 1, reward: { essence: 50 } },
  { id: 'feat_frostvein', name: 'Into the Frostvein', category: 'Journey', description: 'Start a run in the Frostvein Caverns.', check: (p) => (p.stats.regionRuns.frostvein ?? 0) >= 1 },
  { id: 'feat_matriarch', name: 'Cold Case', category: 'Journey', description: 'Defeat the Rime Matriarch.', check: (p) => bossKills(p, 'matriarch') >= 1, reward: { essence: 80, cosmetic: 'trail_frost' } },
  { id: 'feat_tempest', name: 'Eye of the Storm', category: 'Journey', description: 'Defeat the Tempest Engine.', check: (p) => bossKills(p, 'tempest') >= 1, reward: { essence: 120, cosmetic: 'trail_storm' } },
  { id: 'feat_orrery', name: 'Total Eclipse', category: 'Journey', description: 'Defeat the Eclipse Orrery.', check: (p) => bossKills(p, 'orrery') >= 1, reward: { fragments: 20, cosmetic: 'trail_eclipse' } },
  { id: 'feat_bosses_10', name: 'Guardian’s Bane', category: 'Journey', description: 'Defeat 10 bosses.', check: (p) => totalBossKills(p) >= 10, progress: (p) => count(totalBossKills(p), 10), reward: { marks: 1 } },
  { id: 'feat_all_cores', name: 'Pantheon', category: 'Journey', description: 'Win a run with 5 different cores.', check: (p) => coresWon(p) >= 5, progress: (p) => count(coresWon(p), 5), reward: { fragments: 50 } },
  { id: 'feat_endless_14', name: 'Abyss Walker', category: 'Journey', description: 'Reach floor 14 of the Abyssal Descent.', check: (p) => p.endlessBest >= 14, progress: (p) => count(p.endlessBest, 14), reward: { cosmetic: 'trail_void' } },
  { id: 'feat_endless_28', name: 'Bottomless', category: 'Journey', description: 'Reach floor 28 of the Abyssal Descent.', check: (p) => p.endlessBest >= 28, progress: (p) => count(p.endlessBest, 28), reward: { marks: 2 } },
  // Challenge
  { id: 'feat_heat_3', name: 'Rising Heat', category: 'Challenge', description: 'Win a run at Heat 3 or higher.', check: (p) => p.maxHeatWon >= 3 },
  { id: 'feat_heat_6', name: 'White Hot', category: 'Challenge', description: 'Win a run at Heat 6 or higher.', check: (p) => p.maxHeatWon >= 6, reward: { marks: 1 } },
  { id: 'feat_heat_10', name: 'Crucible Unbound', category: 'Challenge', description: 'Win a run at Heat 10.', check: (p) => p.maxHeatWon >= 10, reward: { essence: 500, marks: 2 } },
  { id: 'feat_challenges_10', name: 'Overachiever', category: 'Challenge', description: 'Complete 10 room challenges.', check: (p) => p.stats.challenges >= 10, progress: (p) => count(p.stats.challenges, 10), reward: { fragments: 15 } },
  { id: 'feat_evolution', name: 'Magnum Opus', category: 'Challenge', description: 'Take an Evolution.', check: (p) => p.stats.evolutions.length >= 1, reward: { essence: 100 } },
  { id: 'feat_evolutions_all', name: 'Grand Synthesis', category: 'Challenge', description: 'Take every Evolution across your runs.', check: (p) => p.stats.evolutions.length >= Content.lists.UPGRADES.filter((u) => u.requires).length, progress: (p) => count(p.stats.evolutions.length, Content.lists.UPGRADES.filter((u) => u.requires).length), reward: { fragments: 60, marks: 1 } },
  { id: 'feat_daily', name: 'Daily Ritual', category: 'Challenge', description: 'Complete a Daily Experiment.', check: (p) => p.stats.dailies >= 1, reward: { essence: 30 } },
  { id: 'feat_daily_7', name: 'Devotee', category: 'Challenge', description: 'Play 7 different Daily Experiments.', check: (p) => Object.keys(p.daily).length >= 7, progress: (p) => count(Object.keys(p.daily).length, 7), reward: { essence: 150 } },
  { id: 'feat_contracts_10', name: 'Contractor', category: 'Challenge', description: 'Complete 10 contracts.', check: (p) => p.stats.contracts >= 10, progress: (p) => count(p.stats.contracts, 10), reward: { essence: 100 } },
];

export const featById = new Map(FEATS.map((f) => [f.id, f]));

/** What a feat unlocks, for display ("Unlocks: Ricochet Glaze"). */
export function featUnlocks(id: string): string[] {
  const f = featById.get(id);
  const out = Content.lists.UPGRADES.filter((u) => u.unlock === id).map((u) => `Upgrade: ${u.name}`);
  if (f?.reward?.cosmetic) out.push(`${Content.cosmetics.get(f.reward.cosmetic)?.kind === 'trail' ? 'Trail' : 'Skin'}: ${Content.cosmetics.get(f.reward.cosmetic)?.name}`);
  return out;
}

export function featRewardText(f: FeatDef): string {
  const r = f.reward ?? {};
  return [r.essence && `◆${r.essence}`, r.fragments && `✦${r.fragments}`, r.marks && `♛${r.marks}`].filter(Boolean).join(' ');
}

/** Unlock every satisfied feat; grants rewards. Returns the newly unlocked feats. */
export function checkFeats(p: Profile): FeatDef[] {
  const out: FeatDef[] = [];
  for (const f of FEATS) {
    if (p.feats.includes(f.id) || !f.check(p)) continue;
    p.feats.push(f.id);
    const r = f.reward;
    if (r?.essence) p.essence += r.essence;
    if (r?.fragments) p.fragments += r.fragments;
    if (r?.marks) p.marks += r.marks;
    grantCosmetic(p, r?.cosmetic);
    out.push(f);
  }
  return out;
}
