import { Content } from '../content';
import type { Profile } from './profile';
import type { Run } from './run';

/**
 * Anomaly rooms: short text events with a risky bargain (Slay the Spire / Isaac style).
 * Every choice is deterministic for a run seed, explains its cost up front, and is optional.
 */
export interface AnomalyOutcome {
  text: string;
  /** Follow-up: open an upgrade pick of this quality. */
  offer?: 'normal' | 'elite' | 'rare';
}

export interface AnomalyChoice {
  label: string;
  detail: string;
  /** Hidden when the requirement is not met (e.g. "own an upgrade"). */
  available?: (run: Run) => boolean;
  apply: (run: Run, profile: Profile) => AnomalyOutcome;
}

export interface AnomalyDef {
  id: string;
  name: string;
  icon: string;
  text: string;
  choices: AnomalyChoice[];
}

const randomUpgrade = (run: Run, rarities: string[]) => {
  const pool = Content.lists.UPGRADES.filter((u) => rarities.includes(u.rarity) && !u.requires && (run.upgrades.get(u.id) ?? 0) < u.maxStacks && run.isUnlocked(u.unlock));
  return pool.length ? run.rng.pick(pool) : undefined;
};

export const ANOMALIES: AnomalyDef[] = [
  {
    id: 'unstable_flask', name: 'The Unstable Flask', icon: '⚗',
    text: 'A flask hums on a cracked pedestal, its contents shifting colour every heartbeat.',
    choices: [
      { label: 'Drink it', detail: 'Gain a random uncommon or rare upgrade. Lose 12 HP.', apply: (run) => {
        const u = randomUpgrade(run, ['uncommon', 'rare']);
        run.hp = Math.max(1, run.hp - 12);
        if (u) run.addUpgrade(u.id);
        return { text: u ? `It burns going down. You gained ${u.name}.` : 'It tastes of nothing at all.' };
      } },
      { label: 'Bottle it', detail: 'Gain 3 Catalysts.', apply: (run) => { run.catalysts += 3; return { text: 'You stopper the flask carefully. +3 Catalysts.' }; } },
    ],
  },
  {
    id: 'whispering_codex', name: 'The Whispering Codex', icon: '✎',
    text: 'A soot-black notebook mutters formulas to itself. Some of them you have never seen.',
    choices: [
      { label: 'Read it', detail: 'Reveal hints for 2 undiscovered reactions. +4 Fragments.', apply: (run, p) => {
        const hidden = Content.lists.REACTIONS.filter((r) => !p.discovered[r.id] && !p.revealed.includes(r.id));
        const picks = run.rng.shuffle([...hidden]).slice(0, 2);
        for (const r of picks) p.revealed.push(r.id);
        p.fragments += 4;
        run.stats.fragments += 4;
        return { text: picks.length ? `You copy two hints into your Codex: “${picks.map((r) => r.hint).join('” and “')}”` : 'You already know everything it whispers. +4 Fragments.' };
      } },
      { label: 'Burn it for warmth', detail: 'Heal 30% of your max HP.', apply: (run) => { run.heal(Math.round(run.maxHp * 0.3)); return { text: 'The pages curl into green flame. You feel restored.' }; } },
    ],
  },
  {
    id: 'mirror_pool', name: 'The Mirror Pool', icon: '◈',
    text: 'Still water reflects your ball — but the reflection carries more than you do.',
    choices: [
      { label: 'Reach in', detail: 'Strengthen a random upgrade you own by one stack.', available: (run) => [...run.upgrades].some(([id, n]) => n < (Content.upgrades.get(id)?.maxStacks ?? 1)), apply: (run) => {
        const owned = [...run.upgrades].filter(([id, n]) => n < (Content.upgrades.get(id)?.maxStacks ?? 1));
        const [id] = run.rng.pick(owned);
        run.addUpgrade(id);
        return { text: `Your reflection hands you something. ${Content.upgrades.get(id)!.name} grows stronger.` };
      } },
      { label: 'Drink', detail: 'Heal 30 HP.', apply: (run) => { run.heal(30); return { text: 'Cold, clean and strangely sweet.' }; } },
    ],
  },
  {
    id: 'collapsed_lab', name: 'The Collapsed Laboratory', icon: '⛏',
    text: 'Someone’s workshop lies under fallen stone. Glassware glints in the rubble.',
    choices: [
      { label: 'Dig through it', detail: 'Lose 15 HP. Gain 8 Fragments and 2 Catalysts.', apply: (run, p) => {
        run.hp = Math.max(1, run.hp - 15);
        p.fragments += 8;
        run.stats.fragments += 8;
        run.catalysts += 2;
        return { text: 'Cuts and bruises, but the notes are priceless. +8 Fragments, +2 Catalysts.' };
      } },
      { label: 'Leave it be', detail: 'Nothing happens.', apply: () => ({ text: 'Some knowledge is better left buried.' }) },
    ],
  },
  {
    id: 'ghost', name: 'The Alchemist’s Ghost', icon: '☽',
    text: 'A translucent figure peers at your ball. “Ah. A fellow experimenter.”',
    choices: [
      { label: 'Ask for its tools', detail: 'Choose one of three upgrades.', apply: () => ({ text: '“Take what you need. I have no use for it now.”', offer: 'normal' }) },
      { label: 'Ask for its savings', detail: 'Gain 40 Essence.', apply: (run) => { run.stats.essence += 40; return { text: 'It drops a pouch of glittering Essence into your shell. +40 Essence.' }; } },
    ],
  },
  {
    id: 'transmutation_circle', name: 'The Transmutation Circle', icon: '✡',
    text: 'A circle of chalk and silver. Place something in it, and it becomes something else.',
    choices: [
      { label: 'Offer an upgrade', detail: 'Lose a random upgrade. Choose a rare upgrade.', available: (run) => run.upgrades.size > 0, apply: (run) => {
        const [id] = run.rng.pick([...run.upgrades]);
        run.removeUpgrade(id);
        return { text: `${Content.upgrades.get(id)!.name} dissolves into light…`, offer: 'rare' };
      } },
      { label: 'Step away', detail: 'Nothing happens.', apply: () => ({ text: 'The chalk lines fade as you leave.' }) },
    ],
  },
  {
    id: 'volatile_cache', name: 'The Volatile Cache', icon: '✹',
    text: 'A crate of reagents, packed far too tightly. It ticks.',
    choices: [
      { label: 'Take everything', detail: 'Gain 2 random common upgrades. Foes in your next fight are Volatile.', apply: (run) => {
        const got: string[] = [];
        for (let i = 0; i < 2; i++) {
          const u = randomUpgrade(run, ['common']);
          if (u) { run.addUpgrade(u.id); got.push(u.name); }
        }
        run.curse = 'volatile';
        return { text: `You gained ${got.join(' and ') || 'nothing useful'}. Something in the next room smells of smoke…` };
      } },
      { label: 'Leave it', detail: 'Nothing happens.', apply: () => ({ text: 'Wise. The ticking fades behind you.' }) },
    ],
  },
  {
    id: 'glass_fountain', name: 'The Glassblower’s Fountain', icon: '⛲',
    text: 'Molten glass flows upward into the dark, cooling into delicate shapes.',
    choices: [
      { label: 'Temper your shell', detail: '+12 max HP.', apply: (run) => { run.maxHp += 12; run.hp += 12; return { text: 'Your ball thickens with a fresh layer of glass. +12 max HP.' }; } },
      { label: 'Collect the shards', detail: 'Gain 2 Catalysts.', apply: (run) => { run.catalysts += 2; return { text: 'The shards are rich with residue. +2 Catalysts.' }; } },
    ],
  },
];
