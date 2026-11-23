import { Content, MAX_HEAT } from '../content';
import type { ResearchNode } from '../content/types';
import type { SavedRun } from './run';
import { SaveSlot, type KeyValueStore } from './save';
import { trialFor, type TrialId } from './trials';

export const SAVE_VERSION = 3;
export const SAVE_KEY = 'alchemyball.profile';

export interface Settings {
  sfxVolume: number;
  musicVolume: number;
  haptics: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
  /** Drag distance (px) for a full-power launch. Lower = more sensitive. */
  dragDistance: number;
  bulletTime: boolean;
  leftHanded: boolean;
  showDamageNumbers: boolean;
  analyticsOptIn: boolean;
  /** 0..1 screen shake intensity. */
  shake: number;
  /** 0..1 flash intensity. */
  flash: number;
  /** Assist mode (Hades God Mode style): damage resistance that grows with each defeat. */
  assist: boolean;
  /** Show element shape badges on every holder (colour-blind support). */
  elementBadges: boolean;
}

export interface DiscoveryRecord {
  at: number;
  count: number;
  /** Distinct contexts the reaction has been used in (mastery is earned by variety, not repetition). */
  feats: string[];
}

export interface CoreRecord {
  xp: number;
  level: number;
  runs: number;
  wins: number;
  /** Highest Heat won with this core (-1 = none). */
  bestHeat: number;
}

export interface Contract {
  id: string;
  kind: 'reaction' | 'kills' | 'winCore' | 'combo' | 'challenges' | 'discover' | 'floor' | 'elites' | 'noHit';
  target?: string;
  goal: number;
  progress: number;
  reward: { essence?: number; fragments?: number };
  text: string;
}

export interface Profile {
  createdAt: number;
  essence: number;
  fragments: number;
  marks: number;
  xp: number;
  level: number;
  research: string[];
  discovered: Record<string, DiscoveryRecord>;
  /** pairKey → 'inert' (tested, nothing) | 'stirred' (reaction exists, conditions unmet). */
  pairs: Record<string, 'inert' | 'stirred'>;
  seenElements: string[];
  bestiary: Record<string, { seen: number; kills: number }>;
  stats: {
    runs: number; wins: number; bestFloor: number; reactions: number; playSeconds: number; deaths: Record<string, number>;
    kills: number; maxCombo: number; maxChain: number; maxBounceHit: number; elites: number; challenges: number; noHitRooms: number;
    rooms: number; bossKills: Record<string, number>; evolutions: string[]; regionRuns: Record<string, number>; flawlessBoss: boolean;
    contracts: number; dailies: number; losses: number;
  };
  trophies: string[];
  /** Reaction ids whose hints were revealed by Research Caches. */
  revealed: string[];
  tutorialDone: boolean;
  loadout: { core: string; shell: string; socket?: string; region: string; aspects: Record<string, string>; trial?: TrialId };
  /** Highest Heat cleared, keyed by trial, region and core. */
  trialRecords: Record<string, number>;
  daily: Record<string, { score: number; won: boolean }>;
  heat: number;
  maxHeatWon: number;
  settings: Settings;
  /** v3 */
  feats: string[];
  cores: Record<string, CoreRecord>;
  contracts: Contract[];
  contractSwapDay?: string;
  cosmetics: { owned: string[]; trail: string; skin: string };
  title?: string;
  activeRun?: SavedRun;
  endlessBest: number;
  /** Assist mode resistance stacks (one per defeat while assist is on). */
  assistStacks: number;
  /** Upgrade ids the player has ever taken (collection). */
  seenUpgrades: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  sfxVolume: 0.8,
  musicVolume: 0.5,
  haptics: true,
  reducedMotion: false,
  highContrast: false,
  dragDistance: 200,
  bulletTime: true,
  leftHanded: false,
  showDamageNumbers: true,
  analyticsOptIn: false,
  shake: 1,
  flash: 1,
  assist: false,
  elementBadges: false,
};

const FRESH_STATS = (): Profile['stats'] => ({
  runs: 0, wins: 0, bestFloor: 0, reactions: 0, playSeconds: 0, deaths: {},
  kills: 0, maxCombo: 0, maxChain: 0, maxBounceHit: 0, elites: 0, challenges: 0, noHitRooms: 0, rooms: 0, bossKills: {}, evolutions: [], regionRuns: {},
  flawlessBoss: false, contracts: 0, dailies: 0, losses: 0,
});

export function freshProfile(): Profile {
  return {
    createdAt: Date.now(),
    essence: 0,
    fragments: 0,
    marks: 0,
    xp: 0,
    level: 1,
    research: [],
    discovered: {},
    pairs: {},
    seenElements: [],
    bestiary: {},
    stats: FRESH_STATS(),
    trophies: [],
    revealed: [],
    tutorialDone: false,
    loadout: { core: 'ember', shell: 'glass', region: 'cinder_marsh', aspects: {} },
    trialRecords: {},
    daily: {},
    heat: 0,
    maxHeatWon: -1,
    settings: { ...DEFAULT_SETTINGS },
    feats: [],
    cores: {},
    contracts: [],
    cosmetics: { owned: ['trail_default', 'skin_glass'], trail: 'trail_default', skin: 'skin_glass' },
    endlessBest: 0,
    assistStacks: 0,
    seenUpgrades: [],
  };
}

function normalize(d: Partial<Profile>): Profile {
  const f = freshProfile();
  const p = { ...f, ...d } as Profile;
  p.settings = { ...DEFAULT_SETTINGS, ...(d.settings ?? {}) };
  p.stats = { ...f.stats, ...(d.stats ?? {}) };
  p.loadout = { ...f.loadout, ...(d.loadout ?? {}) };
  p.loadout.aspects ??= {};
  if (!trialFor(p.loadout.trial)) delete p.loadout.trial;
  p.trialRecords = Object.fromEntries(Object.entries(d.trialRecords ?? {}).filter(([key, heat]) => {
    const [trial, region, core, extra] = key.split(':');
    return !extra && trialFor(trial) && Content.regions.has(region) && Content.cores.has(core) &&
      Number.isInteger(heat) && heat >= 0 && heat <= MAX_HEAT;
  }));
  p.cosmetics = { ...f.cosmetics, ...(d.cosmetics ?? {}) };
  for (const id of f.cosmetics.owned) if (!p.cosmetics.owned.includes(id)) p.cosmetics.owned.push(id);
  p.cores ??= {};
  p.feats ??= [];
  p.contracts ??= [];
  // Drop references to content that no longer exists (content removed in an update).
  p.research = p.research.filter((id) => Content.research.has(id));
  for (const id of Object.keys(p.discovered)) if (!Content.reactions.has(id)) delete p.discovered[id];
  if (!Content.cores.has(p.loadout.core)) p.loadout.core = 'ember';
  if (!Content.shells.has(p.loadout.shell)) p.loadout.shell = 'glass';
  if (!Content.regions.has(p.loadout.region)) p.loadout.region = 'cinder_marsh';
  p.cosmetics.owned = p.cosmetics.owned.filter((id) => Content.cosmetics.has(id));
  if (!p.cosmetics.owned.includes(p.cosmetics.trail)) p.cosmetics.trail = 'trail_default';
  if (!p.cosmetics.owned.includes(p.cosmetics.skin)) p.cosmetics.skin = 'skin_glass';
  if (p.activeRun && (p.activeRun.v !== 1 || !Content.regions.has(p.activeRun.cfg?.regionId))) p.activeRun = undefined;
  return p;
}

/** v1 stored discoveries as a plain id list and had no pair knowledge. v2 → v3 only adds fields (filled by normalize). */
export const MIGRATIONS = {
  1: (d: Record<string, unknown>) => {
    const list = (d.discoveries as string[] | undefined) ?? [];
    const discovered: Record<string, DiscoveryRecord> = {};
    for (const id of list) discovered[id] = { at: 0, count: 1, feats: [] };
    const { discoveries: _drop, ...rest } = d;
    return { ...rest, discovered, pairs: {} };
  },
  2: (d: Record<string, unknown>) => {
    // Heat used to cap at 5 with −5 HP per level; the ladder is now 10 rungs. Keep the player's level.
    const loadout = (d.loadout as Record<string, unknown> | undefined) ?? {};
    return { ...d, loadout: { ...loadout, region: 'cinder_marsh', aspects: {} } };
  },
};

export function createSaveSlot(store: KeyValueStore): SaveSlot<Profile> {
  return new SaveSlot<Profile>(store, { key: SAVE_KEY, version: SAVE_VERSION, migrations: MIGRATIONS, fresh: freshProfile, normalize });
}

// ─── Queries ───────────────────────────────────────────────────────────────

export const MASTERY_TIERS = [
  { tier: 1, feats: 3, potency: 1.1 },
  { tier: 2, feats: 5, potency: 1.2 },
  { tier: 3, feats: 7, potency: 1.35 },
];

export const FEAT_LABELS: Record<string, string> = {
  enemy: 'Trigger it on an enemy',
  ball: 'Trigger it inside your ball',
  zone: 'Trigger it in a pool or cloud',
  object: 'Trigger it on an arena object',
  chain: 'Trigger it as part of a chain',
  deep: 'Trigger it 3+ links deep in a chain',
  multi: 'Hit 3+ targets with one reaction',
  kill: 'Finish an enemy with it',
  boss: 'Use it against a boss',
};

export function masteryTier(rec: DiscoveryRecord | undefined): number {
  if (!rec) return 0;
  let t = 0;
  for (const m of MASTERY_TIERS) if (rec.feats.length >= m.feats) t = m.tier;
  return t;
}

export function potencyMap(p: Profile): Map<string, number> {
  const m = new Map<string, number>();
  for (const [id, rec] of Object.entries(p.discovered)) {
    const t = masteryTier(rec);
    if (t > 0) m.set(id, MASTERY_TIERS[t - 1].potency);
  }
  return m;
}

/** A research node or a feat. */
export function hasUnlock(p: Profile, id: string | undefined): boolean {
  return !id || p.research.includes(id) || p.feats.includes(id);
}

export function hasResearch(p: Profile, id: string | undefined): boolean {
  return !id || p.research.includes(id);
}

export function unlockedIds(p: Profile): string[] {
  return [...p.research, ...p.feats];
}

export function unlockedCores(p: Profile) {
  return Content.lists.CORES.filter((c) => hasResearch(p, c.unlock));
}

export function unlockedShells(p: Profile) {
  return Content.lists.SHELLS.filter((s) => hasResearch(p, s.unlock));
}

/** Regions the player may start a run in. */
export function unlockedRegions(p: Profile) {
  return Content.lists.REGIONS.filter((r) => !r.requiresBoss || (p.stats.bossKills[r.requiresBoss] ?? 0) > 0);
}

export function researchState(p: Profile, n: ResearchNode): 'owned' | 'available' | 'locked' {
  if (p.research.includes(n.id)) return 'owned';
  return n.requires.every((r) => p.research.includes(r)) ? 'available' : 'locked';
}

export function canAfford(p: Profile, cost: ResearchNode['cost']): boolean {
  return (cost.fragments ?? 0) <= p.fragments && (cost.essence ?? 0) <= p.essence && (cost.marks ?? 0) <= p.marks;
}

export function buyResearch(p: Profile, id: string): boolean {
  const n = Content.research.get(id);
  if (!n || researchState(p, n) !== 'available' || !canAfford(p, n.cost)) return false;
  p.fragments -= n.cost.fragments ?? 0;
  p.essence -= n.cost.essence ?? 0;
  p.marks -= n.cost.marks ?? 0;
  p.research.push(id);
  return true;
}

export function grantCosmetic(p: Profile, id: string | undefined): boolean {
  if (!id || !Content.cosmetics.has(id) || p.cosmetics.owned.includes(id)) return false;
  p.cosmetics.owned.push(id);
  return true;
}

/** Add XP; returns level-up rewards granted. */
export function addXp(p: Profile, xp: number): { level: number; reward: string }[] {
  p.xp += Math.round(xp);
  const ups: { level: number; reward: string }[] = [];
  for (const l of Content.masteryLevels) {
    if (l.level > p.level && p.xp >= l.xp) {
      p.level = l.level;
      if (l.grant?.essence) p.essence += l.grant.essence;
      if (l.grant?.fragments) p.fragments += l.grant.fragments;
      grantCosmetic(p, l.grant?.cosmetic);
      ups.push({ level: l.level, reward: l.reward });
    }
  }
  return ups;
}

export function nextLevel(p: Profile) {
  return Content.masteryLevels.find((l) => l.level === p.level + 1);
}

export function coreRecord(p: Profile, core: string): CoreRecord {
  return (p.cores[core] ??= { xp: 0, level: 1, runs: 0, wins: 0, bestHeat: -1 });
}

/** Add core XP; returns the levels reached. Grants core-level rewards. */
export function addCoreXp(p: Profile, core: string, xp: number): number[] {
  const rec = coreRecord(p, core);
  rec.xp += Math.round(xp);
  const ups: number[] = [];
  for (const l of Content.coreLevels) {
    if (l.level > rec.level && rec.xp >= l.xp) {
      rec.level = l.level;
      ups.push(l.level);
      if (l.level === 4) p.essence += 25;
      if (l.level === 7) p.fragments += 10;
      if (l.level === 9) p.essence += 50;
      if (l.level === 10) grantCosmetic(p, 'skin_gilded');
    }
  }
  return ups;
}

export function nextCoreLevel(p: Profile, core: string) {
  const rec = coreRecord(p, core);
  return Content.coreLevels.find((l) => l.level === rec.level + 1);
}

/** Record a reaction occurrence. Returns whether it was a new discovery and any mastery tier gained. */
export function recordReaction(p: Profile, id: string, feats: string[]): { isNew: boolean; tierUp?: number } {
  let rec = p.discovered[id];
  const isNew = !rec;
  if (!rec) rec = p.discovered[id] = { at: Date.now(), count: 0, feats: [] };
  rec.count++;
  const before = masteryTier(rec);
  for (const f of feats) if (!rec.feats.includes(f)) rec.feats.push(f);
  const after = masteryTier(rec);
  return { isNew, tierUp: after > before ? after : undefined };
}

export function hintsUnlocked(p: Profile): boolean {
  return p.research.includes('res_hints');
}

export type CodexCellState = 'known' | 'stirred' | 'inert' | 'hinted' | 'unknown';

/** What the player knows about an element pair. Used by the Codex matrix. */
export function pairKnowledge(p: Profile, key: string, reactionIds: string[]): { state: CodexCellState; reactions: string[] } {
  const known = reactionIds.filter((id) => p.discovered[id]);
  if (known.length) return { state: 'known', reactions: known };
  const pk = p.pairs[key];
  if (pk === 'stirred') return { state: 'stirred', reactions: [] };
  if (pk === 'inert') return { state: 'inert', reactions: [] };
  const [a, b] = key.split('+');
  const seen = p.seenElements.includes(a) && p.seenElements.includes(b);
  if (reactionIds.some((id) => p.revealed.includes(id)) || (reactionIds.length && seen && hintsUnlocked(p))) return { state: 'hinted', reactions: [] };
  return { state: 'unknown', reactions: [] };
}

/** Assist mode damage resistance: 20% + 2% per defeat while enabled, capped at 60%. */
export function assistResistance(p: Profile): number {
  return p.settings.assist ? Math.min(0.6, 0.2 + 0.02 * p.assistStacks) : 0;
}
