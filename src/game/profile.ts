import { Content } from '../content';
import type { ResearchNode } from '../content/types';
import { SaveSlot, type KeyValueStore } from './save';

export const SAVE_VERSION = 2;
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
}

export interface DiscoveryRecord {
  at: number;
  count: number;
  /** Distinct contexts the reaction has been used in (mastery is earned by variety, not repetition). */
  feats: string[];
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
  stats: { runs: number; wins: number; bestFloor: number; reactions: number; playSeconds: number; deaths: Record<string, number> };
  trophies: string[];
  /** Reaction ids whose hints were revealed by Research Caches. */
  revealed: string[];
  tutorialDone: boolean;
  loadout: { core: string; shell: string; socket?: string };
  daily: Record<string, { score: number; won: boolean }>;
  heat: number;
  maxHeatWon: number;
  settings: Settings;
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
};

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
    stats: { runs: 0, wins: 0, bestFloor: 0, reactions: 0, playSeconds: 0, deaths: {} },
    trophies: [],
    revealed: [],
    tutorialDone: false,
    loadout: { core: 'ember', shell: 'glass' },
    daily: {},
    heat: 0,
    maxHeatWon: -1,
    settings: { ...DEFAULT_SETTINGS },
  };
}

function normalize(d: Partial<Profile>): Profile {
  const f = freshProfile();
  const p = { ...f, ...d } as Profile;
  p.settings = { ...DEFAULT_SETTINGS, ...(d.settings ?? {}) };
  p.stats = { ...f.stats, ...(d.stats ?? {}) };
  p.loadout = { ...f.loadout, ...(d.loadout ?? {}) };
  // Drop references to content that no longer exists (content removed in an update).
  p.research = p.research.filter((id) => Content.research.has(id));
  for (const id of Object.keys(p.discovered)) if (!Content.reactions.has(id)) delete p.discovered[id];
  if (!Content.cores.has(p.loadout.core)) p.loadout.core = 'ember';
  if (!Content.shells.has(p.loadout.shell)) p.loadout.shell = 'glass';
  return p;
}

/** v1 stored discoveries as a plain id list and had no pair knowledge. */
export const MIGRATIONS = {
  1: (d: Record<string, unknown>) => {
    const list = (d.discoveries as string[] | undefined) ?? [];
    const discovered: Record<string, DiscoveryRecord> = {};
    for (const id of list) discovered[id] = { at: 0, count: 1, feats: [] };
    const { discoveries: _drop, ...rest } = d;
    return { ...rest, discovered, pairs: {} };
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

export function hasResearch(p: Profile, id: string | undefined): boolean {
  return !id || p.research.includes(id);
}

export function unlockedCores(p: Profile) {
  return Content.lists.CORES.filter((c) => hasResearch(p, c.unlock));
}

export function unlockedShells(p: Profile) {
  return Content.lists.SHELLS.filter((s) => hasResearch(p, s.unlock));
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

/** Add XP; returns level-up rewards granted. */
export function addXp(p: Profile, xp: number): { level: number; reward: string }[] {
  p.xp += Math.round(xp);
  const ups: { level: number; reward: string }[] = [];
  for (const l of Content.masteryLevels) {
    if (l.level > p.level && p.xp >= l.xp) {
      p.level = l.level;
      if (l.grant?.essence) p.essence += l.grant.essence;
      if (l.grant?.fragments) p.fragments += l.grant.fragments;
      ups.push({ level: l.level, reward: l.reward });
    }
  }
  return ups;
}

export function nextLevel(p: Profile) {
  return Content.masteryLevels.find((l) => l.level === p.level + 1);
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
