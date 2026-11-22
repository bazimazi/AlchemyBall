import { ELEMENTS } from './elements';
import { REACTIONS } from './reactions';
import { OBJECTS, ZONES } from './zones';
import { AFFIXES, BOSSES, ENEMIES } from './enemies';
import { CORES, SHELLS, UPGRADES } from './build';
import { ASPECTS, CORE_LEVELS, HEAT_LEVELS, MASTERY_LEVELS, REGIONS, RESEARCH } from './progression';
import { COSMETICS, type CosmeticDef } from './cosmetics';
import type { ElementDef, EnemyDef, ObjectDef, ReactionDef, ZoneDef, CoreDef, ShellDef, UpgradeDef, ResearchNode, RegionDef, AffixDef, AspectDef } from './types';

export * from './types';
export type { CosmeticDef } from './cosmetics';
export { MAX_HEAT } from './progression';

function indexById<T extends { id: string }>(list: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const it of list) m.set(it.id, it);
  return m;
}

/** Central registry. Systems look content up here by stable id; they never import content arrays directly. */
export const Content = {
  elements: indexById<ElementDef>(ELEMENTS),
  reactions: indexById<ReactionDef>(REACTIONS),
  zones: indexById<ZoneDef>(ZONES),
  objects: indexById<ObjectDef>(OBJECTS),
  enemies: indexById<EnemyDef>(ENEMIES),
  cores: indexById<CoreDef>(CORES),
  shells: indexById<ShellDef>(SHELLS),
  upgrades: indexById<UpgradeDef>(UPGRADES),
  research: indexById<ResearchNode>(RESEARCH),
  regions: indexById<RegionDef>(REGIONS),
  affixes: indexById<AffixDef>(AFFIXES),
  aspects: indexById<AspectDef>(ASPECTS),
  cosmetics: indexById<CosmeticDef>(COSMETICS),
  bosses: BOSSES,
  masteryLevels: MASTERY_LEVELS,
  coreLevels: CORE_LEVELS,
  heatLevels: HEAT_LEVELS,
  lists: { ELEMENTS, REACTIONS, ZONES, OBJECTS, ENEMIES, CORES, SHELLS, UPGRADES, RESEARCH, REGIONS, AFFIXES, ASPECTS, COSMETICS },
};

export function element(id: string): ElementDef {
  const e = Content.elements.get(id);
  if (!e) throw new Error(`Unknown element '${id}'`);
  return e;
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}+${b}` : `${b}+${a}`;
}

/**
 * Reactions indexed by unordered input pair, sorted by descending priority. Wildcard reactions
 * (`*`) are indexed under `a+*`.
 */
export const reactionsByPair: Map<string, ReactionDef[]> = (() => {
  const m = new Map<string, ReactionDef[]>();
  for (const r of REACTIONS) {
    const [a, b] = r.inputs;
    const key = a === '*' ? `${b}+*` : b === '*' ? `${a}+*` : pairKey(a, b);
    const list = m.get(key) ?? [];
    list.push(r);
    m.set(key, list);
  }
  for (const list of m.values()) list.sort((x, y) => (y.priority ?? 0) - (x.priority ?? 0));
  return m;
})();

/** Aspects available to a core, default first. */
export function aspectsFor(core: string): AspectDef[] {
  return ASPECTS.filter((a) => a.core === core).sort((a, b) => a.level - b.level);
}
