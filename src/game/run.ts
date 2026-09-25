import { Content } from '../content';
import type { RegionDef, RoomTemplate, UpgradeDef } from '../content/types';
import { Rng } from '../core/rng';
import { PHYS } from '../sim/ballPhysics';
import type { Wall } from '../sim/entities';
import type { EncounterSpec } from '../sim/world';

export type RoomType = 'combat' | 'elite' | 'rest' | 'research' | 'treasure' | 'boss' | 'tutorial_launch' | 'tutorial_react';
export type RunMode = 'standard' | 'daily';

export const ROOM_INFO: Record<RoomType, { name: string; icon: string; blurb: string }> = {
  combat: { name: 'Skirmish', icon: '⚔', blurb: 'Clear the arena. Earn an upgrade.' },
  elite: { name: 'Elite', icon: '☠', blurb: 'A dangerous foe. Better upgrades and Catalysts.' },
  rest: { name: 'Still Spring', icon: '♨', blurb: 'Recover HP or temper your ball.' },
  research: { name: 'Research Cache', icon: '⚗', blurb: 'Uncover a reaction hint and Research Fragments.' },
  treasure: { name: 'Reliquary', icon: '✧', blurb: 'Choose from rare upgrades.' },
  boss: { name: 'Boss', icon: '♛', blurb: 'The guardian of this region.' },
  tutorial_launch: { name: 'Proving Ground', icon: '◎', blurb: 'Learn to launch.' },
  tutorial_react: { name: 'First Reaction', icon: '▲', blurb: 'Learn to combine elements.' },
};

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
}

/** A single roguelite run: map, temporary build, and encounter generation. Pure logic; no DOM. */
export class Run {
  readonly rng: Rng;
  readonly region: RegionDef;
  readonly cfg: RunConfig;
  floor = 0;
  /** choices[floor] = rooms the player can pick on that floor. */
  readonly map: RoomType[][];
  path: RoomType[] = [];
  hp: number;
  maxHp: number;
  upgrades = new Map<string, number>();
  catalysts = 0;
  rerolls: number;
  stats: RunStats = { kills: 0, reactions: 0, discoveries: [], essence: 0, fragments: 0, maxChainDepth: 0, roomsCleared: 0, timeSec: 0, reactionCounts: {}, masteryUps: [], bossDefeated: false };
  private lastTemplate?: string;
  /** Deterministic sub-streams so map, encounters and offers don't perturb each other. */
  private encRng: Rng;
  private offerRng: Rng;

  constructor(cfg: RunConfig) {
    this.cfg = cfg;
    this.rng = new Rng(cfg.seed);
    this.encRng = this.rng.fork(1);
    this.offerRng = this.rng.fork(2);
    const region = Content.regions.get(cfg.regionId);
    if (!region) throw new Error(`Unknown region ${cfg.regionId}`);
    this.region = region;
    const core = Content.cores.get(cfg.core)!;
    const shell = Content.shells.get(cfg.shell);
    this.maxHp = core.maxHp + (shell?.mods.maxHpAdd ?? 0) - cfg.heat * 5;
    this.hp = this.maxHp;
    this.rerolls = cfg.rerolls;
    this.map = this.buildMap();
    if (cfg.socket && Content.upgrades.has(cfg.socket)) this.addUpgrade(cfg.socket);
  }

  private buildMap(): RoomType[][] {
    const n = this.region.floors;
    const r = this.rng.fork(3);
    const map: RoomType[][] = [];
    for (let f = 0; f < n; f++) {
      if (this.cfg.tutorial && f === 0) map.push(['tutorial_launch']);
      else if (this.cfg.tutorial && f === 1) map.push(['tutorial_react']);
      else if (f === 0) map.push(['combat']);
      else if (f === n - 1) map.push(['boss']);
      else if (f === n - 2) map.push(['rest', 'treasure']);
      else {
        const pool: RoomType[] = ['combat', 'combat', 'research', ...(f >= 2 ? (['elite', 'elite'] as RoomType[]) : []), ...(f >= 3 ? (['treasure'] as RoomType[]) : [])];
        const a = r.pick(pool);
        let b = r.pick(pool);
        for (let i = 0; i < 6 && b === a; i++) b = r.pick(pool);
        // Always keep a fighting option so upgrades are reachable.
        map.push(a === 'combat' || b === 'combat' || a === 'elite' || b === 'elite' ? [a, b] : [a, 'combat']);
      }
    }
    return map;
  }

  get choices(): RoomType[] {
    return this.map[this.floor] ?? [];
  }

  get finished(): boolean {
    return this.floor >= this.map.length;
  }

  enter(room: RoomType): void {
    this.path.push(room);
  }

  completeRoom(): void {
    this.stats.roomsCleared++;
    this.floor++;
  }

  // ─── Build ────────────────────────────────────────────────────────────────
  mods(): Record<string, number> {
    const out: Record<string, number> = {};
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
    this.upgrades.set(id, Math.min(u.maxStacks, (this.upgrades.get(id) ?? 0) + 1));
    if (u.mods.maxHp) {
      this.maxHp += u.mods.maxHp;
      this.hp = Math.min(this.maxHp, this.hp + u.mods.maxHp);
    }
  }

  get maxPips(): number {
    return this.cfg.maxPips + (this.mods().pips ?? 0);
  }

  buildTags(): Map<string, number> {
    const tags = new Map<string, number>();
    for (const [id, n] of this.upgrades) for (const t of Content.upgrades.get(id)?.tags ?? []) tags.set(t, (tags.get(t) ?? 0) + n);
    return tags;
  }

  /**
   * Offer `count` distinct upgrades. Weighted by rarity and by synergy with the current build,
   * never offers maxed upgrades, and always includes at least one element-agnostic option so
   * hybrid builds stay possible.
   */
  offerUpgrades(count: number, quality: 'normal' | 'elite' | 'rare', unlocked: (id?: string) => boolean): { def: UpgradeDef; synergy?: string }[] {
    const coreEl = Content.cores.get(this.cfg.core)!.element;
    const tags = this.buildTags();
    const rarityW = quality === 'rare' ? { common: 1, uncommon: 4, rare: 8 } : quality === 'elite' ? { common: 4, uncommon: 6, rare: 3 } : { common: 10, uncommon: 4, rare: 1 };
    const pool = Content.lists.UPGRADES.filter((u) => unlocked(u.unlock) && (this.upgrades.get(u.id) ?? 0) < u.maxStacks);
    const synergyOf = (u: UpgradeDef): string | undefined => {
      if (u.elements.includes(coreEl)) return `Matches your ${Content.elements.get(coreEl)!.name} core`;
      const t = u.tags.find((x) => tags.has(x));
      if (t) return `Builds on your ${t} upgrades`;
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
    return picked.map((def) => ({ def, synergy: synergyOf(def) }));
  }

  // ─── Encounters ───────────────────────────────────────────────────────────
  generateEncounter(room: RoomType): EncounterSpec {
    const W = PHYS.arenaW;
    const H = PHYS.arenaH;
    if (room === 'tutorial_launch') return tutorialLaunch();
    if (room === 'tutorial_react') return tutorialReact();
    if (room === 'boss') return bossArena(this.region.boss);
    const rng = this.encRng;
    const candidates = this.region.templates.filter((t) => t.id !== this.lastTemplate);
    const tpl = rng.pick(candidates);
    this.lastTemplate = tpl.id;
    const mirror = rng.chance(0.5);
    const spec = fromTemplate(tpl, mirror, room === 'elite' ? 'elite' : 'combat');
    const floor = this.floor;
    let budget = 4 + floor * 1.8 + this.cfg.heat * 2;
    const waves: { id: string; x: number; y: number }[][] = [];
    const occupied: { x: number; y: number; r: number }[] = spec.objects.map((o) => ({ x: o.x, y: o.y, r: Content.objects.get(o.id)!.radius }));
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
      waves.push([place(rng.pick(this.region.elitePool))]);
      budget *= 0.5;
    }
    const pool = this.region.enemyPool.filter((p) => p.minFloor <= floor);
    const waveCount = budget > 8 ? 3 : 2;
    for (let wv = 0; wv < waveCount; wv++) {
      const wb = budget / waveCount + (wv === 0 ? 0.5 : 0);
      let spent = 0;
      const list: { id: string; x: number; y: number }[] = [];
      let guard = 0;
      while (spent < wb && guard++ < 30) {
        const p = rng.weighted(pool, (x) => (Content.enemies.get(x.id)!.threat <= wb - spent + 0.5 ? x.weight : 0));
        if (!p) break;
        list.push(place(p.id));
        spent += Content.enemies.get(p.id)!.threat;
      }
      if (list.length) waves.push(list);
      // Positions free up between waves.
      occupied.splice(spec.objects.length);
    }
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

function bossArena(boss: string): EncounterSpec {
  const W = PHYS.arenaW;
  const H = PHYS.arenaH;
  return {
    id: 'boss_' + boss, kind: 'boss', boss,
    walls: [],
    objects: [
      { id: 'brazier', x: W * 0.12, y: H * 0.55 },
      { id: 'font', x: W * 0.88, y: H * 0.55 },
      { id: 'boulder', x: W * 0.5, y: H * 0.66 },
      { id: 'toxic_barrel', x: W * 0.2, y: H * 0.36 },
      { id: 'coil', x: W * 0.8, y: H * 0.36 },
    ],
    zones: [{ id: 'water_pool', x: W * 0.28, y: H * 0.74, r: 80 }, { id: 'water_pool', x: W * 0.72, y: H * 0.74, r: 80 }],
    waves: [],
    objective: 'Defeat the Crucible Warden',
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
