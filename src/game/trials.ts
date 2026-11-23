import type { Profile } from './profile';

export const TRIALS = {
  ricochet: {
    name: 'Ricochet', icon: '⤴', color: '#f1bc77',
    rule: 'Impacts start at 65% damage. Each wall bounce adds 70% to that shot’s reduced impact damage.',
    mods: { impactDmg: -0.35, ricochet: 0.7 }, cosmetic: 'trail_gilt',
  },
  catalyst: {
    name: 'Catalyst', icon: '✦', color: '#bcaaef',
    rule: 'Reactions deal 40% more damage. Launch pips recharge 25% slower.',
    mods: { reactionDmg: 0.4 }, pipRegen: 0.75, cosmetic: 'skin_amethyst',
  },
  pursuit: {
    name: 'Pursuit', icon: '⌁', color: '#9cddd2',
    rule: 'Foes move 30% faster. Resonance charges 50% faster.',
    mods: { resonanceGain: 0.5 }, enemySpeed: 1.3, cosmetic: 'trail_ion',
  },
  glass: {
    name: 'Glass', icon: '◇', color: '#f3a490',
    rule: 'Start with 25% less maximum health. Launches are 18% faster and regain pips 20% faster.',
    mods: { maxHpMul: -0.25, launchPower: 0.18 }, pipRegen: 1.2, cosmetic: 'skin_porcelain',
  },
} satisfies Record<string, {
  name: string; icon: string; color: string; rule: string; mods: Record<string, number>;
  pipRegen?: number; enemySpeed?: number; cosmetic: string;
}>;

export type TrialId = keyof typeof TRIALS;
export const TRIAL_IDS = Object.keys(TRIALS) as TrialId[];
export const MEDALS = [
  { name: 'Bronze', heat: 0, fragments: 2 },
  { name: 'Silver', heat: 3, fragments: 3 },
  { name: 'Gold', heat: 7, fragments: 5 },
];
export const TRIAL_COSMETIC_MEDALS = 9;

export function trialFor(id: string | undefined) {
  return TRIAL_IDS.includes(id as TrialId) ? TRIALS[id as TrialId] : undefined;
}

export function trialsUnlocked(p: Profile): boolean {
  return (p.stats.bossKills.warden ?? 0) > 0;
}

export function trialRecordKey(id: TrialId, region: string, core: string): string {
  return `${id}:${region}:${core}`;
}

export function medalCount(heat: number | undefined): number {
  return heat === undefined ? 0 : MEDALS.filter((m) => heat >= m.heat).length;
}

export function trialMedals(p: Profile, id?: TrialId): number {
  return Object.entries(p.trialRecords).reduce((total, [key, heat]) =>
    total + (!id || key.startsWith(id + ':') ? medalCount(heat) : 0), 0);
}

export function recordTrialWin(p: Profile, id: TrialId, region: string, core: string, heat: number) {
  const trial = trialFor(id);
  if (!trial) return;
  const key = trialRecordKey(id, region, core);
  const previous = p.trialRecords[key];
  if (previous !== undefined && heat <= previous) return;
  p.trialRecords[key] = heat;
  const medals = MEDALS.slice(medalCount(previous), medalCount(heat));
  const fragments = medals.reduce((total, m) => total + m.fragments, 0);
  p.fragments += fragments;
  const cosmetic = trialMedals(p, id) >= TRIAL_COSMETIC_MEDALS && !p.cosmetics.owned.includes(trial.cosmetic)
    ? trial.cosmetic : undefined;
  if (cosmetic) p.cosmetics.owned.push(cosmetic);
  return { id, medals: medals.map((m) => m.name), fragments, cosmetic };
}
