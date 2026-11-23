import { Content } from '../content';
import type { RegionDef, RoomTemplate, UpgradeDef } from '../content/types';
import { Rng } from '../core/rng';
import { PHYS } from '../sim/ballPhysics';
import type { Wall } from '../sim/entities';
import type { Difficulty, EncounterSpec } from '../sim/world';
import { rollChallenge, type ChallengeDef } from './challenges';
import { trialFor, type TrialId } from './trials';

export type RoomType = 'combat' | 'elite' | 'rest' | 'research' | 'treasure' | 'merchant' | 'event' | 'boss' | 'tutorial_launch' | 'tutorial_react';
export type RunMode = 'standard' | 'daily' | 'endless';
export type UpgradeQuality = 'normal' | 'elite' | 'rare';

interface PendingUpgrade {
  quality: UpgradeQuality;
  advance: boolean;
  offers: { id: string; synergy?: string }[];
}

export const ROOM_INFO: Record<RoomType, { name: string; icon: string; blurb: string }> = {
  combat: { name: 'Skirmish', icon: '⚔', blurb: 'Clear the arena. Earn an upgrade.' },
  elite: { name: 'Elite', icon: '☠', blurb: 'A dangerous foe. Better upgrades and Catalysts.' },
  rest: { name: 'Still Spring', icon: '♨', blurb: 'Recover HP or temper your ball.' },
  research: { name: 'Research Cache', icon: '⚗', blurb: 'Uncover a reaction hint and Research Fragments.' },
  treasure: { name: 'Reliquary', icon: '✧', blurb: 'Choose from rare upgrades — or an Evolution.' },
  merchant: { name: 'Merchant', icon: '⚖', blurb: 'Trade Catalysts for upgrades and remedies.' },
  event: { name: 'Anomaly', icon: '?', blurb: 'Something strange stirs here…' },
  boss: { name: 'Boss', icon: '♛', blurb: 'The guardian of this region.' },
  tutorial_launch: { name: 'Proving Ground', icon: '◎', blurb: 'Learn to launch.' },
  tutorial_react: { name: 'First Reaction', icon: '▲', blurb: 'Learn to combine elements.' },
};

/** Daily mutators: one rule change per day, identical for everyone (Balatro deck / Spelunky daily). */
export const MUTATORS: { id: string; name: string; description: string; mods?: Record<string, number>; affixAll?: string }[] = [
  { id: 'glass_cannon', name: 'Glass Cannon', description: 'Impacts deal +50% damage, but your ball has 30% less max HP.', mods: { impactDmg: 0.5, maxHpMul: -0.3 } },
  { id: 'overcharged', name: 'Overcharged', description: 'Lightning chains reach +2 targets and hit 40% harder.', mods: { chainTargets: 2, lightningDmg: 0.4 } },
  { id: 'quicksilver', name: 'Quicksilver', description: 'Pips recharge 50% faster and the ball keeps its speed.', mods: { pipRegen: 0.5, drag: -0.2 } },
  { id: 'volatile_world', name: 'Volatile World', description: 'Every foe explodes after death. Keep moving.', affixAll: 'volatile' },
  { id: 'alchemists_feast', name: 'Alchemist’s Feast', description: 'Reactions deal +50% damage; plain impacts deal 25% less.', mods: { reactionDmg: 0.5, impactDmg: -0.25 } },
  { id: 'combo_fever', name: 'Combo Fever', description: 'Every combo step adds 5% damage.', mods: { comboDmg: 0.05 } },
  { id: 'warded_foes', name: 'Warded Foes', description: 'Every foe is Shielded.', affixAll: 'shielded' },
  { id: 'saturated', name: 'Saturated', description: 'Your ball paints 80% more element on every hit.', mods: { auraTransfer: 0.8 } },
];

export interface RunStats {
  kills: number;
  reactions: number;
  discoveries: string[];
  essence: number;
  fragments: number;
  maxChainDepth: number;
  roomsCleared: number;
  timeSec: number;
  reactionCounts: Record<string, number>;
  masteryUps: string[];
  bossDefeated: boolean;
  maxCombo: number;
  challenges: number;
  elitesKilled: number;
  bossesDefeated: string[];
  damageTaken: number;
  noHitRooms: number;
  evolutions: string[];
}

export interface RunConfig {
  seed: number;
  mode: RunMode;
  regionId: string;
  core: string;
  shell: string;
  heat: number;
  tutorial: boolean;
  maxPips: number;
  rerolls: number;
  socket?: string;
  aspect?: string;
  /** Daily mutator id. */
  mutator?: string;
  trial?: TrialId;
  dailyDate?: string;
  banishes?: number;
  /** Research and feat ids unlocked when the run started (gates upgrades and room types). */
  unlocked?: string[];
  /** Endless: the order regions cycle in. */
  regionCycle?: string[];
}

/** Everything needed to resume a run from the map screen. */
export interface SavedRun {
  v: 1;
  cfg: RunConfig;
  floor: number;
  path: RoomType[];
  map: RoomType[][];
  hp: number;
  maxHp: number;
  upgrades: [string, number][];
  catalysts: number;
  rerolls: number;
  banishes: number;
  banished: string[];
  stats: RunStats;
  lastTemplate?: string;
  rng: [number, number, number];
  curse?: string;
  sinceRare: number;
  bankedEssence: number;
  pendingUpgrade?: PendingUpgrade;
}

const FLOORS_PER_REGION = 7;

/** A single roguelite run: map, temporary build, and encounter generation. Pure logic; no DOM. */
export class Run {
  readonly rng: Rng;
  readonly cfg: RunConfig;
  floor = 0;
  /** choices[floor] = rooms the player can pick on that floor. Grows in endless mode. */
  readonly map: RoomType[][];
  path: RoomType[] = [];
  hp: number;
  maxHp: number;
  upgrades = new Map<string, number>();
  catalysts = 0;
  rerolls: number;
  banishes: number;
  banished = new Set<string>();
  /** A one-fight curse from an anomaly (e.g. 'volatile'). */
  curse?: string;
  /** Offers since the last rare-or-better upgrade was shown (pity timer). */
  sinceRare = 0;
  /** Essence already banked to the profile (app bookkeeping, persisted with the run). */
  bankedEssence = 0;
  pendingUpgrade?: PendingUpgrade;
  stats: RunStats = {
    kills: 0, reactions: 0, discoveries: [], essence: 0, fragments: 0, maxChainDepth: 0, roomsCleared: 0, timeSec: 0, reactionCounts: {}, masteryUps: [], bossDefeated: false,
    maxCombo: 0, challenges: 0, elitesKilled: 0, bossesDefeated: [], damageTaken: 0, noHitRooms: 0, evolutions: [],
  };
  private lastTemplate?: string;
  /** Deterministic sub-streams so map, encounters and offers don't perturb each other. */
  private encRng: Rng;
  private offerRng: Rng;
  private mapRng: Rng;
  private unlocked: Set<string>;

  constructor(cfg: RunConfig) {
    this.cfg = cfg;
    this.rng = new Rng(cfg.seed);
    this.encRng = this.rng.fork(1);
    this.offerRng = this.rng.fork(2);
    this.mapRng = this.rng.fork(3);
    this.unlocked = new Set(cfg.unlocked ?? []);
    if (!Content.regions.get(cfg.regionId)) throw new Error(`Unknown region ${cfg.regionId}`);
    const core = Content.cores.get(cfg.core)!;
    const shell = Content.shells.get(cfg.shell);
    this.maxHp = core.maxHp + (shell?.mods.maxHpAdd ?? 0) - (cfg.heat >= 2 ? 10 : 0) + (this.baseMods().maxHp ?? 0);
    const hpMul = this.baseMods().maxHpMul ?? 0;
    if (hpMul) this.maxHp = Math.round(this.maxHp * (1 + hpMul));
    this.hp = this.maxHp;
    this.rerolls = cfg.rerolls;
    this.banishes = cfg.banishes ?? 0;
    this.map = this.buildFloors(0);
    if (cfg.socket && Content.upgrades.has(cfg.socket)) this.addUpgrade(cfg.socket);
  }

  // ─── Persistence ──────────────────────────────────────────────────────────
  serialize(): SavedRun {
    return {
      v: 1, cfg: this.cfg, floor: this.floor, path: [...this.path], map: this.map.map((f) => [...f]), hp: this.hp, maxHp: this.maxHp,
      upgrades: [...this.upgrades], catalysts: this.catalysts, rerolls: this.rerolls, banishes: this.banishes, banished: [...this.banished],
      stats: JSON.parse(JSON.stringify(this.stats)), lastTemplate: this.lastTemplate, rng: [this.rng.state, this.encRng.state, this.offerRng.state],
      curse: this.curse, sinceRare: this.sinceRare, bankedEssence: this.bankedEssence, pendingUpgrade: this.pendingUpgrade,
    };
  }

  static restore(d: SavedRun): Run {
    const r = new Run({ ...d.cfg, socket: undefined });
    r.floor = d.floor;
    r.path = [...d.path];
    r.map.length = 0;
    r.map.push(...d.map.map((f) => [...f]));
    r.upgrades = new Map(d.upgrades.filter(([id]) => Content.upgrades.has(id)));
    r.maxHp = d.maxHp;
    r.hp = d.hp;
    r.catalysts = d.catalysts;
    r.rerolls = d.rerolls;
    r.banishes = d.banishes;
    r.banished = new Set(d.banished);
    r.stats = { ...r.stats, ...d.stats };
    r.lastTemplate = d.lastTemplate;
    [r.rng.state, r.encRng.state, r.offerRng.state] = d.rng;
    r.curse = d.curse;
    r.sinceRare = d.sinceRare;
    r.bankedEssence = d.bankedEssence;
    r.pendingUpgrade = d.pendingUpgrade;
    return r;
  }

  // ─── Map & regions ────────────────────────────────────────────────────────
  /** Endless loop index (0 for normal runs). */
  get loop(): number {
    return Math.floor(this.floor / FLOORS_PER_REGION);
  }

  regionAt(floor: number): RegionDef {
    const cycle = this.cfg.regionCycle?.length ? this.cfg.regionCycle : [this.cfg.regionId];
    const id = this.cfg.mode === 'endless' ? cycle[Math.floor(floor / FLOORS_PER_REGION) % cycle.length] : this.cfg.regionId;
    return Content.regions.get(id) ?? Content.regions.get(this.cfg.regionId)!;
  }

  get region(): RegionDef {
    return this.regionAt(Math.min(this.floor, this.map.length - 1));
  }

  get trial() {
    return this.cfg.mode === 'standard' && !this.cfg.tutorial ? trialFor(this.cfg.trial) : undefined;
  }

  isUnlocked(id?: string): boolean {
    return !id || this.unlocked.has(id);
  }

  private buildFloors(start: number): RoomType[][] {
    const n = FLOORS_PER_REGION;
    const r = this.mapRng;
    const map: RoomType[][] = [];
    const merchant = this.isUnlocked('res_merchant');
    const events = this.isUnlocked('res_events');
    for (let i = 0; i < n; i++) {
      const f = i;
      const abs = start + i;
      if (this.cfg.tutorial && abs === 0) map.push(['tutorial_launch']);
      else if (this.cfg.tutorial && abs === 1) map.push(['tutorial_react']);
      else if (f === 0) map.push(['combat']);
      else if (f === n - 1) map.push(['boss']);
      else if (f === n - 2) map.push(merchant && r.chance(0.5) ? ['rest', 'merchant'] : ['rest', 'treasure']);
      else {
        const pool: RoomType[] = ['combat', 'combat', 'research'];
        if (f >= 2) pool.push('elite', 'elite');
        if (f >= 3) pool.push('treasure');
        if (merchant && f >= 2) pool.push('merchant');
        if (events && f >= 1) pool.push('event', 'event');
        const count = f >= 2 && r.chance(0.3) ? 3 : 2;
        const picks: RoomType[] = [];
        for (let k = 0; k < 12 && picks.length < count; k++) {
          const c = r.pick(pool);
          if (!picks.includes(c)) picks.push(c);
        }
        // Always keep a fighting option so upgrades are reachable.
        if (!picks.some((c) => c === 'combat' || c === 'elite')) picks[picks.length - 1] = 'combat';
        map.push(picks);
      }
    }
    return map;
  }

  get choices(): RoomType[] {
    return this.map[this.floor] ?? [];
  }

  get finished(): boolean {
    return this.cfg.mode !== 'endless' && this.floor >= this.map.length;
  }

  enter(room: RoomType): void {
    this.path[this.floor] = room;
  }

  completeRoom(): void {
    this.stats.roomsCleared++;
    this.floor++;
    if (this.cfg.mode === 'endless' && this.floor >= this.map.length) this.map.push(...this.buildFloors(this.map.length));
  }

  /** Floor index within the current region (0..6). */
  get regionFloor(): number {
    return this.floor % FLOORS_PER_REGION;
  }

  // ─── Difficulty ───────────────────────────────────────────────────────────
  difficulty(): Difficulty {
    const h = this.cfg.heat;
    const tier = this.region.tier;
    const loop = this.cfg.mode === 'endless' ? this.loop : 0;
    const trial = this.trial;
    return {
      enemyHp: (1 + 0.1 * tier + 0.22 * loop) * (h >= 3 ? 1.15 : 1),
      enemySpeed: (h >= 5 ? 1.15 : 1) * (1 + 0.03 * Math.min(loop, 5)) * (trial && 'enemySpeed' in trial ? trial.enemySpeed : 1),
      enemyDmg: (1 + 0.1 * tier + 0.12 * loop) * (h >= 10 ? 1.25 : 1),
      bossHp: (1 + 0.2 * loop) * (h >= 8 ? 1.25 : 1),
      bossTempo: (h >= 8 ? 1.2 : 1) + 0.05 * Math.min(loop, 6),
      pipRegen: (h >= 9 ? 0.85 : 1) * (trial && 'pipRegen' in trial ? trial.pipRegen : 1),
      playerResist: 0,
    };
  }

  /** Fraction of max HP restored by resting at a Still Spring. */
  get restHeal(): number {
    return this.cfg.heat >= 6 ? 0.25 : 0.35;
  }

  /** HP restored after clearing a combat room. */
  get roomHeal(): number {
    return this.cfg.heat >= 6 ? 4 : 8;
  }

  // ─── Build ────────────────────────────────────────────────────────────────
  /** Modifiers that are not upgrades: the core aspect and the daily mutator. */
  private baseMods(): Record<string, number> {
    const out: Record<string, number> = {};
    const add = (m?: Record<string, number>) => { for (const [k, v] of Object.entries(m ?? {})) out[k] = (out[k] ?? 0) + v; };
    if (this.cfg.aspect) add(Content.aspects.get(this.cfg.aspect)?.mods);
    if (this.cfg.mutator) add(MUTATORS.find((m) => m.id === this.cfg.mutator)?.mods);
    add(this.trial?.mods);
    return out;
  }

  mods(): Record<string, number> {
    const out = this.baseMods();
    for (const [id, stacks] of this.upgrades) {
      const u = Content.upgrades.get(id);
      if (!u) continue;
      for (const [k, v] of Object.entries(u.mods)) out[k] = (out[k] ?? 0) + v * stacks;
    }
    return out;
  }

  addUpgrade(id: string): void {
    const u = Content.upgrades.get(id);
    if (!u) return;
    const before = this.upgrades.get(id) ?? 0;
    if (before >= u.maxStacks) return;
    this.upgrades.set(id, before + 1);
    if (u.mods.maxHp) {
      this.maxHp += u.mods.maxHp;
      this.hp = Math.min(this.maxHp, this.hp + u.mods.maxHp);
    }
    if (u.mods.maxHpMul) {
      this.maxHp = Math.max(20, Math.round(this.maxHp * (1 + u.mods.maxHpMul)));
      this.hp = Math.min(this.hp, this.maxHp);
    }
    if (u.rarity === 'legendary' && !this.stats.evolutions.includes(id)) this.stats.evolutions.push(id);
  }

  removeUpgrade(id: string): void {
    const u = Content.upgrades.get(id);
    const n = this.upgrades.get(id) ?? 0;
    if (!u || n <= 0) return;
    if (u.mods.maxHp) {
      this.maxHp = Math.max(20, this.maxHp - u.mods.maxHp * n);
      this.hp = Math.min(this.hp, this.maxHp);
    }
    this.upgrades.delete(id);
  }

  heal(n: number): void {
    this.hp = Math.min(this.maxHp, this.hp + n);
  }

  get maxPips(): number {
    return this.cfg.maxPips + (this.mods().pips ?? 0);
  }

  buildTags(): Map<string, number> {
    const tags = new Map<string, number>();
    for (const [id, n] of this.upgrades) for (const t of Content.upgrades.get(id)?.tags ?? []) tags.set(t, (tags.get(t) ?? 0) + n);
    return tags;
  }

  /** Evolutions whose ingredients are all held at max stacks. */
  eligibleEvolutions(unlocked: (id?: string) => boolean = (id) => this.isUnlocked(id)): UpgradeDef[] {
    return Content.lists.UPGRADES.filter((u) => u.requires && !this.upgrades.has(u.id) && unlocked(u.unlock) && !this.banished.has(u.id) &&
      u.requires.every((r) => (this.upgrades.get(r) ?? 0) >= (Content.upgrades.get(r)?.maxStacks ?? 1)));
  }

  banish(id: string): boolean {
    if (this.banishes <= 0) return false;
    this.banishes--;
    this.banished.add(id);
    return true;
  }

  /**
   * Offer `count` distinct upgrades. Weighted by rarity and by synergy with the current build,
   * never offers maxed or banished upgrades, always includes at least one element-agnostic
   * option so hybrid builds stay possible, guarantees a rare after 3 offers without one (pity),
   * and surfaces an Evolution whenever one is ready (always in Reliquaries and elite rewards).
   */
  offerUpgrades(count: number, quality: UpgradeQuality, unlocked: (id?: string) => boolean = (id) => this.isUnlocked(id)): { def: UpgradeDef; synergy?: string }[] {
    const coreEl = Content.cores.get(this.cfg.core)!.element;
    const tags = this.buildTags();
    const rarityW = quality === 'rare' ? { common: 1, uncommon: 4, rare: 8, legendary: 0 } : quality === 'elite' ? { common: 4, uncommon: 6, rare: 3, legendary: 0 } : { common: 10, uncommon: 4, rare: 1, legendary: 0 };
    const pool = Content.lists.UPGRADES.filter((u) => !u.requires && unlocked(u.unlock) && !this.banished.has(u.id) && (this.upgrades.get(u.id) ?? 0) < u.maxStacks);
    const synergyOf = (u: UpgradeDef): string | undefined => {
      if (u.requires) return 'Evolution — your ingredients are ready';
      if (u.elements.includes(coreEl)) return `Matches your ${Content.elements.get(coreEl)!.name} core`;
      const t = u.tags.find((x) => tags.has(x));
      if (t) return `Builds on your ${t} upgrades`;
      const ev = Content.lists.UPGRADES.find((e) => e.requires?.includes(u.id) && e.requires.some((r) => r !== u.id && this.upgrades.has(r)));
      if (ev) return `Ingredient for ${ev.name}`;
      return undefined;
    };
    const weight = (u: UpgradeDef) => rarityW[u.rarity] * (synergyOf(u) ? 2.5 : 1);
    const picked: UpgradeDef[] = [];
    const rest = [...pool];
    while (picked.length < count && rest.length) {
      const u = this.offerRng.weighted(rest, weight)!;
      picked.push(u);
      rest.splice(rest.indexOf(u), 1);
    }
    if (!picked.some((u) => u.elements.length === 0)) {
      const generic = rest.filter((u) => u.elements.length === 0);
      const g = this.offerRng.weighted(generic, weight);
      if (g && picked.length) picked[picked.length - 1] = g;
    }
    // Pity: after three offers without a rare, guarantee one.
    if (picked.some((u) => u.rarity === 'rare')) this.sinceRare = 0;
    else if (++this.sinceRare >= 3) {
      const rare = rest.filter((u) => u.rarity === 'rare');
      const g = this.offerRng.weighted(rare, weight);
      if (g && picked.length) {
        picked[0] = g;
        this.sinceRare = 0;
      }
    }
    const evo = this.eligibleEvolutions(unlocked);
    if (evo.length && picked.length && (quality !== 'normal' || this.offerRng.chance(0.25))) picked[0] = this.offerRng.pick(evo);
    return picked.map((def) => ({ def, synergy: synergyOf(def) }));
  }

  // ─── Encounters ───────────────────────────────────────────────────────────
  /** Affixes for an elite or ordinary enemy at the current depth/heat. */
  private rollAffixes(elite: boolean): string[] {
    const rng = this.encRng;
    const out: string[] = [];
    const all = ['shielded', 'swift', 'volatile', 'regenerating', 'insulated', 'enraged'];
    const n = elite ? (this.regionFloor >= 4 || this.region.tier >= 1 || this.loop > 0 ? 1 : 0) + (this.cfg.heat >= 4 ? 1 : 0) : 0;
    let extra = 0;
    if (!elite) {
      const chance = (this.cfg.heat >= 7 ? 0.15 : 0) + (this.cfg.mode === 'endless' ? 0.1 * this.loop : 0);
      if (chance > 0 && rng.chance(Math.min(0.5, chance))) extra = 1;
    }
    for (let i = 0; i < n + extra; i++) {
      const a = rng.pick(all.filter((x) => !out.includes(x)));
      out.push(a);
    }
    const mut = this.cfg.mutator ? MUTATORS.find((m) => m.id === this.cfg.mutator)?.affixAll : undefined;
    if (mut && !out.includes(mut)) out.push(mut);
    if (this.curse && !out.includes(this.curse)) out.push(this.curse);
    return out;
  }

  /** Optional bonus objective for a combat room. */
  rollUpgradeReward(quality: UpgradeQuality, advance = true): void {
    this.pendingUpgrade = { quality, advance, offers: this.offerUpgrades(3, quality).map(({ def, synergy }) => ({ id: def.id, synergy })) };
  }

  rollChallenge(room: RoomType, waves: number): ChallengeDef | undefined {
    if (room !== 'combat' && room !== 'elite') return undefined;
    return rollChallenge(this.encRng, this.regionFloor, room === 'elite', waves);
  }

  generateEncounter(room: RoomType): EncounterSpec {
    const W = PHYS.arenaW;
    const H = PHYS.arenaH;
    const region = this.region;
    if (room === 'tutorial_launch') return tutorialLaunch();
    if (room === 'tutorial_react') return tutorialReact();
    if (room === 'boss') return bossArena(region.boss);
    const rng = this.encRng;
    const candidates = region.templates.filter((t) => t.id !== this.lastTemplate);
    const tpl = rng.pick(candidates);
    this.lastTemplate = tpl.id;
    const mirror = rng.chance(0.5);
    const spec = fromTemplate(tpl, mirror, room === 'elite' ? 'elite' : 'combat');
    const floor = this.regionFloor;
    const loop = this.cfg.mode === 'endless' ? this.loop : 0;
    let budget = Math.min(26, 4 + floor * 1.8 + (this.cfg.heat >= 1 ? 2 + Math.min(this.cfg.heat, 5) : 0) + region.tier * 1.5 + loop * 2.5);
    const waves: { id: string; x: number; y: number; affixes?: string[] }[][] = [];
    const occupied: { x: number; y: number; r: number }[] = spec.objects.map((o) => ({ x: o.x, y: o.y, r: Content.objects.get(o.id)!.radius }));
    for (const z of spec.zones) occupied.push({ x: z.x, y: z.y, r: 0 });
    occupied.length = spec.objects.length;
    const place = (id: string) => {
      const r = Content.enemies.get(id)!.radius;
      for (let i = 0; i < 30; i++) {
        const x = rng.range(70, W - 70);
        const y = rng.range(90, H * 0.58);
        if (occupied.every((o) => Math.hypot(o.x - x, o.y - y) > o.r + r + 12)) {
          occupied.push({ x, y, r });
          return { id, x, y };
        }
      }
      return { id, x: W / 2, y: 140 };
    };
    if (room === 'elite') {
      const e = place(rng.pick(region.elitePool));
      waves.push([{ ...e, affixes: this.rollAffixes(true) }]);
      budget *= 0.5;
    }
    const pool = region.enemyPool.filter((p) => p.minFloor <= floor);
    const waveCount = budget > 8 ? 3 : 2;
    for (let wv = 0; wv < waveCount; wv++) {
      const wb = budget / waveCount + (wv === 0 ? 0.5 : 0);
      let spent = 0;
      const list: { id: string; x: number; y: number; affixes?: string[] }[] = [];
      let guard = 0;
      while (spent < wb && guard++ < 30) {
        const p = rng.weighted(pool, (x) => (Content.enemies.get(x.id)!.threat <= wb - spent + 0.5 ? x.weight : 0));
        if (!p) break;
        const affixes = this.rollAffixes(false);
        list.push({ ...place(p.id), ...(affixes.length ? { affixes } : {}) });
        spent += Content.enemies.get(p.id)!.threat;
      }
      if (list.length) waves.push(list);
      // Positions free up between waves.
      occupied.splice(spec.objects.length);
    }
    this.curse = undefined;
    spec.waves = waves.map((enemies) => ({ enemies }));
    spec.objective = room === 'elite' ? 'Defeat the elite and its escort' : `Clear ${waves.length} waves`;
    return spec;
  }
}

function scaleWalls(walls: RoomTemplate['walls'], mirror: boolean): Wall[] {
  const W = PHYS.arenaW;
  const H = PHYS.arenaH;
  const mx = (x: number) => (mirror ? 1 - x : x) * W;
  return (walls ?? []).map((w) => ({ a: { x: mx(w.x1), y: w.y1 * H }, b: { x: mx(w.x2), y: w.y2 * H }, material: w.material ?? 'stone' }));
}

export function fromTemplate(tpl: RoomTemplate, mirror: boolean, kind: EncounterSpec['kind']): EncounterSpec {
  const W = PHYS.arenaW;
  const H = PHYS.arenaH;
  const mx = (x: number) => (mirror ? 1 - x : x) * W;
  return {
    id: tpl.id,
    kind,
    walls: scaleWalls(tpl.walls, mirror),
    objects: tpl.objects.map((o) => ({ id: o.id, x: mx(o.x), y: o.y * H })),
    zones: tpl.zones.map((z) => ({ id: z.id, x: mx(z.x), y: z.y * H, r: z.r })),
    waves: [],
    objective: '',
  };
}

function tutorialLaunch(): EncounterSpec {
  const W = PHYS.arenaW;
  return {
    id: 'tutorial_launch', kind: 'tutorial', walls: [],
    objects: [{ id: 'bumper', x: W * 0.2, y: 520 }, { id: 'bumper', x: W * 0.8, y: 520 }],
    zones: [],
    waves: [
      { enemies: [{ id: 'dummy', x: W / 2, y: 380 }] },
      { enemies: [{ id: 'dummy', x: W * 0.25, y: 240 }, { id: 'dummy', x: W * 0.75, y: 240 }] },
    ],
    objective: 'Drag back and release to launch. Break the dummies.',
  };
}

function tutorialReact(): EncounterSpec {
  const W = PHYS.arenaW;
  return {
    id: 'tutorial_react', kind: 'tutorial', walls: [],
    objects: [{ id: 'brazier', x: W * 0.5, y: 640 }, { id: 'font', x: W * 0.15, y: 760 }],
    zones: [{ id: 'water_pool', x: W * 0.5, y: 330, r: 120 }],
    waves: [
      { enemies: [{ id: 'slime', x: W * 0.42, y: 320 }, { id: 'slime', x: W * 0.58, y: 340 }] },
      { enemies: [{ id: 'slime', x: W * 0.3, y: 260 }, { id: 'imp', x: W * 0.75, y: 200 }] },
    ],
    objective: 'Slimes are wet. Hit them while you carry fire.',
  };
}

export function bossArena(boss: string): EncounterSpec {
  const W = PHYS.arenaW;
  const H = PHYS.arenaH;
  const data = Content.bosses[boss] ?? Content.bosses.warden;
  return {
    id: 'boss_' + boss, kind: 'boss', boss,
    walls: [],
    objects: data.arena.objects.map((o) => ({ id: o.id, x: W * o.x, y: H * o.y })),
    zones: data.arena.zones.map((z) => ({ id: z.id, x: W * z.x, y: H * z.y, r: z.r })),
    waves: [],
    objective: `Defeat ${data.name}`,
  };
}

export function labEncounter(unlockedSources: string[]): EncounterSpec {
  const W = PHYS.arenaW;
  const H = PHYS.arenaH;
  const n = unlockedSources.length;
  const objects = unlockedSources.map((id, i) => {
    const a = Math.PI + (i / Math.max(1, n - 1)) * Math.PI;
    return { id, x: W / 2 + Math.cos(a) * 280, y: H * 0.55 + Math.sin(a) * 280 * 1.1 };
  });
  return {
    id: 'lab', kind: 'lab', walls: [], objects,
    zones: [{ id: 'water_pool', x: W * 0.5, y: H * 0.78, r: 80 }],
    waves: [{ enemies: [{ id: 'dummy', x: W * 0.35, y: 200 }, { id: 'dummy', x: W * 0.65, y: 200 }, { id: 'slime', x: W * 0.5, y: 140 }] }],
    objective: 'Experiment freely. Nothing here can hurt your progress.',
  };
}

export function dailySeed(date: Date): number {
  const s = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return h;
}

export function dailyKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/** The mutator for a given daily seed. */
export function dailyMutator(seed: number): (typeof MUTATORS)[number] {
  return MUTATORS[(seed >>> 3) % MUTATORS.length];
}
