import { Content } from '../content';
import { hashString, Rng } from '../core/rng';
import type { SimEvent } from '../sim/events';
import { unlockedCores, type Contract, type Profile } from './profile';

/**
 * Contracts: three always-visible goals that point at parts of the game the player hasn't
 * explored lately. No timers or expiry; a finished contract is claimed by hand (a small reward
 * moment) and replaced. One free swap per day for a contract you don't fancy.
 */
export const CONTRACT_SLOTS = 3;

export function makeContract(p: Profile, salt: number): Contract {
  const rng = new Rng(hashString(`${p.createdAt}:${p.stats.contracts}:${salt}`));
  const discovered = Object.keys(p.discovered).filter((id) => Content.reactions.has(id));
  const cores = unlockedCores(p);
  const seenEnemies = Object.keys(p.bestiary).filter((id) => Content.enemies.get(id) && !Content.enemies.get(id)!.tags.includes('boss') && id !== 'dummy');
  const kinds: Contract['kind'][] = ['combo', 'challenges', 'floor', 'elites', 'noHit', 'discover'];
  if (discovered.length) kinds.push('reaction', 'reaction');
  if (seenEnemies.length) kinds.push('kills');
  if (cores.length > 1) kinds.push('winCore');
  const taken = new Set(p.contracts.map((c) => c.kind + (c.target ?? '')));
  let kind = rng.pick(kinds);
  for (let i = 0; i < 8 && taken.has(kind); i++) kind = rng.pick(kinds);
  const id = `c${p.stats.contracts}_${salt}_${rng.int(0, 1e6)}`;
  switch (kind) {
    case 'reaction': {
      const r = Content.reactions.get(rng.pick(discovered))!;
      const goal = rng.pick([8, 12, 15]);
      return { id, kind, target: r.id, goal, progress: 0, reward: { essence: 30 + goal * 2 }, text: `Trigger ${r.name} ${goal} times` };
    }
    case 'kills': {
      const e = Content.enemies.get(rng.pick(seenEnemies))!;
      const goal = rng.pick([8, 12, 16]);
      return { id, kind, target: e.id, goal, progress: 0, reward: { essence: 25 + goal * 2 }, text: `Defeat ${goal} ${e.name}s` };
    }
    case 'winCore': {
      const c = rng.pick(cores.filter((x) => x.id !== p.loadout.core).length ? cores.filter((x) => x.id !== p.loadout.core) : cores);
      return { id, kind, target: c.id, goal: 1, progress: 0, reward: { essence: 60, fragments: 8 }, text: `Reach floor 5 with the ${c.name}` };
    }
    case 'combo': {
      const goal = rng.pick([8, 12, 15]);
      return { id, kind, goal, progress: 0, reward: { essence: 20 + goal * 3 }, text: `Reach a ×${goal} combo` };
    }
    case 'challenges': {
      const goal = rng.pick([2, 3, 4]);
      return { id, kind, goal, progress: 0, reward: { fragments: 3 + goal * 2 }, text: `Complete ${goal} room challenges` };
    }
    case 'floor': {
      const goal = rng.pick([4, 5, 6]);
      return { id, kind, goal, progress: 0, reward: { essence: 25 + goal * 6 }, text: `Reach floor ${goal} in a single run` };
    }
    case 'elites': {
      const goal = rng.pick([2, 3]);
      return { id, kind, goal, progress: 0, reward: { essence: 30 + goal * 15 }, text: `Defeat ${goal} elites` };
    }
    case 'noHit': {
      const goal = rng.pick([2, 3]);
      return { id, kind, goal, progress: 0, reward: { fragments: 4 + goal * 2 }, text: `Clear ${goal} rooms without taking damage` };
    }
    case 'discover':
    default:
      return { id, kind: 'discover', goal: 1, progress: 0, reward: { fragments: 8 }, text: 'Discover a new reaction' };
  }
}

/** Fill empty contract slots. */
export function ensureContracts(p: Profile): void {
  let salt = 0;
  while (p.contracts.length < CONTRACT_SLOTS && salt < 20) p.contracts.push(makeContract(p, salt++ + p.contracts.length * 31));
}

export function contractDone(c: Contract): boolean {
  return c.progress >= c.goal;
}

/** Claim a finished contract: grant the reward and replace it. */
export function claimContract(p: Profile, id: string): Contract | undefined {
  const i = p.contracts.findIndex((c) => c.id === id);
  if (i < 0 || !contractDone(p.contracts[i])) return undefined;
  const [c] = p.contracts.splice(i, 1);
  p.essence += c.reward.essence ?? 0;
  p.fragments += c.reward.fragments ?? 0;
  p.stats.contracts++;
  ensureContracts(p);
  return c;
}

/** Swap a contract for a new one (once per day). */
export function swapContract(p: Profile, id: string, today: string): boolean {
  if (p.contractSwapDay === today) return false;
  const i = p.contracts.findIndex((c) => c.id === id);
  if (i < 0) return false;
  p.contracts.splice(i, 1);
  p.contractSwapDay = today;
  p.contracts.splice(i, 0, makeContract(p, 97 + i));
  return true;
}

/** Live progress from simulation events. Returns contracts that just completed. */
export function contractEvent(p: Profile, e: SimEvent): Contract[] {
  const done: Contract[] = [];
  for (const c of p.contracts) {
    if (contractDone(c)) continue;
    const before = c.progress;
    if (c.kind === 'reaction' && e.type === 'reaction' && e.reactionId === c.target) c.progress++;
    if (c.kind === 'kills' && e.type === 'kill' && e.enemyId === c.target) c.progress++;
    if (c.kind === 'elites' && e.type === 'kill' && e.elite) c.progress++;
    if (c.kind === 'combo' && e.type === 'combo') c.progress = Math.max(c.progress, Math.min(c.goal, e.count));
    if (c.progress !== before && contractDone(c)) done.push(c);
  }
  return done;
}

/** Progress from game-level milestones (not sim events). */
export function contractMilestone(p: Profile, kind: 'challenge' | 'discover' | 'noHit' | 'floor', value = 1, core?: string): Contract[] {
  const done: Contract[] = [];
  for (const c of p.contracts) {
    if (contractDone(c)) continue;
    const before = c.progress;
    if (kind === 'challenge' && c.kind === 'challenges') c.progress++;
    if (kind === 'discover' && c.kind === 'discover') c.progress++;
    if (kind === 'noHit' && c.kind === 'noHit') c.progress++;
    if (kind === 'floor' && c.kind === 'floor') c.progress = Math.max(c.progress, Math.min(c.goal, value));
    if (kind === 'floor' && c.kind === 'winCore' && core === c.target && value >= 5) c.progress = 1;
    if (c.progress !== before && contractDone(c)) done.push(c);
  }
  return done;
}
