import { World, type EncounterSpec, type WorldOptions } from '../src/sim/world';

export function emptySpec(over: Partial<EncounterSpec> = {}): EncounterSpec {
  return { id: 'test', kind: 'combat', walls: [], objects: [], zones: [], waves: [], objective: 'test', ...over };
}

export function makeWorld(over: Partial<WorldOptions> = {}): World {
  return new World({
    encounter: emptySpec(),
    coreElement: 'fire',
    maxHp: 100,
    hp: 100,
    mods: {},
    unlocks: new Set(),
    potency: new Map(),
    maxPips: 3,
    seed: 1234,
    ...over,
  });
}

export function collect<T = { type: string }>(w: World, type: string): T[] {
  const out: T[] = [];
  w.events.onAny((e) => {
    if (e.type === type) out.push(e as unknown as T);
  });
  return out;
}
