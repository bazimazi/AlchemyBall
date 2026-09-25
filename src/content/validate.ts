import { Content, pairKey } from './index';
import type { EffectDef, ReactionDef } from './types';

export interface ValidationIssue {
  level: 'error' | 'warning';
  where: string;
  message: string;
}

/**
 * Static checks over all content: referential integrity, reachability of compounds and
 * reactions, context-variant conflicts, and potential infinite loops in the reaction graph.
 * Runtime loops are additionally prevented by the engine's depth limit and cooldowns; this
 * reports cycles so designers know which ones rely on those limits.
 */
export function validateContent(): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (where: string, message: string) => issues.push({ level: 'error', where, message });
  const warn = (where: string, message: string) => issues.push({ level: 'warning', where, message });
  const { lists } = Content;

  const dupes = (name: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) err(name, `duplicate id '${id}'`);
      seen.add(id);
    }
  };
  dupes('elements', lists.ELEMENTS.map((x) => x.id));
  dupes('reactions', lists.REACTIONS.map((x) => x.id));
  dupes('zones', lists.ZONES.map((x) => x.id));
  dupes('objects', lists.OBJECTS.map((x) => x.id));
  dupes('enemies', lists.ENEMIES.map((x) => x.id));
  dupes('upgrades', lists.UPGRADES.map((x) => x.id));
  dupes('research', lists.RESEARCH.map((x) => x.id));
  dupes('cores', lists.CORES.map((x) => x.id));

  const hasEl = (id: string) => Content.elements.has(id);
  const hasRes = (id: string) => Content.research.has(id);

  const checkEffects = (where: string, effects: EffectDef[] | undefined) => {
    for (const e of effects ?? []) {
      if (e.type === 'spawnZone' && !Content.zones.has(e.zone)) err(where, `unknown zone '${e.zone}'`);
      if (e.type === 'chain') {
        if (!hasEl(e.element)) err(where, `chain applies unknown element '${e.element}'`);
        if (e.requireAura && !hasEl(e.requireAura)) err(where, `chain requires unknown aura '${e.requireAura}'`);
        if (e.maxTargets <= 0) err(where, 'chain maxTargets must be > 0');
      }
      if (e.type === 'spawnObstacle' && !Content.objects.has(e.obstacle)) err(where, `unknown obstacle '${e.obstacle}'`);
    }
  };

  for (const el of lists.ELEMENTS) {
    if (!/^#[0-9a-f]{6}$/i.test(el.color)) err(`element:${el.id}`, 'color must be #rrggbb');
    if (el.unlock && !hasRes(el.unlock)) err(`element:${el.id}`, `unknown unlock '${el.unlock}'`);
    if (el.decayPerSec <= 0) err(`element:${el.id}`, 'decayPerSec must be > 0');
  }

  for (const r of lists.REACTIONS) {
    const where = `reaction:${r.id}`;
    for (const i of r.inputs) if (i !== '*' && !hasEl(i)) err(where, `unknown input '${i}'`);
    if (r.inputs[0] === '*' && r.inputs[1] === '*') err(where, 'both inputs cannot be wildcards');
    if (r.output && !hasEl(r.output.element)) err(where, `unknown output '${r.output.element}'`);
    if (r.consume.applied < 0 || r.consume.applied > 1 || r.consume.present < 0 || r.consume.present > 1) err(where, 'consume fractions must be within 0..1');
    if (r.cooldown <= 0) err(where, 'cooldown must be > 0 (loop safety)');
    if (!r.description || !r.hint || !r.followUp) err(where, 'missing player-facing text');
    if (r.unlock && !hasRes(r.unlock)) err(where, `unknown unlock '${r.unlock}'`);
    if (r.effects.length === 0 && !r.output && !r.description.toLowerCase().match(/harmless|useless|fizzle|ignore/))
      warn(where, 'has no effects or output — make sure it is intentionally inert and says so');
    checkEffects(where, r.effects);
  }

  // Context-variant conflicts: same pair, same priority, overlapping holders, no distinguishing conditions.
  const byPair = new Map<string, ReactionDef[]>();
  for (const r of lists.REACTIONS) {
    const k = r.inputs.includes('*') ? r.inputs.join('+') : pairKey(r.inputs[0], r.inputs[1]);
    byPair.set(k, [...(byPair.get(k) ?? []), r]);
  }
  for (const [k, rs] of byPair) {
    for (let i = 0; i < rs.length; i++)
      for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i];
        const b = rs[j];
        const ha = new Set(a.holders ?? ['ball', 'enemy', 'zone', 'object']);
        const overlap = (b.holders ?? ['ball', 'enemy', 'zone', 'object']).some((h) => ha.has(h));
        if (overlap && (a.priority ?? 0) === (b.priority ?? 0) && !a.conditions && !b.conditions)
          err(`pair:${k}`, `'${a.id}' and '${b.id}' are ambiguous (same priority, overlapping holders, no conditions)`);
      }
  }

  // Reachability: every compound must be produced by something; every reaction's inputs must be obtainable.
  const obtainable = new Set<string>(['kinetic']);
  for (const o of lists.OBJECTS) if (o.element) obtainable.add(o.element);
  for (const z of lists.ZONES) if (z.element) obtainable.add(z.element);
  for (const e of lists.ENEMIES) if (e.innate) obtainable.add(e.innate.element);
  for (const c of lists.CORES) obtainable.add(c.element);
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of lists.REACTIONS) {
      const ok = r.inputs.every((i) => i === '*' || obtainable.has(i));
      if (!ok) continue;
      const outs = [r.output?.element, ...r.effects.flatMap((e) => (e.type === 'chain' ? [e.element] : e.type === 'spawnZone' ? [Content.zones.get(e.zone)?.element] : []))];
      for (const o of outs) if (o && !obtainable.has(o)) (obtainable.add(o), (changed = true));
    }
  }
  for (const el of lists.ELEMENTS) if (!obtainable.has(el.id)) warn(`element:${el.id}`, 'cannot be obtained by any source, core, enemy or reaction');
  for (const r of lists.REACTIONS) if (!r.inputs.every((i) => i === '*' || obtainable.has(i))) err(`reaction:${r.id}`, 'unreachable: an input can never be obtained');

  // Compounds that nothing consumes are dead ends.
  for (const el of lists.ELEMENTS.filter((x) => x.tier === 'compound')) {
    if (!lists.REACTIONS.some((r) => r.inputs.includes(el.id))) warn(`element:${el.id}`, 'compound is a dead end: no reaction consumes it');
  }

  for (const z of lists.ZONES) if (z.element && !hasEl(z.element)) err(`zone:${z.id}`, `unknown element '${z.element}'`);
  for (const o of lists.OBJECTS) {
    if (o.element && !hasEl(o.element)) err(`object:${o.id}`, `unknown element '${o.element}'`);
    checkEffects(`object:${o.id}`, o.onDestroy);
  }
  for (const e of lists.ENEMIES) {
    const where = `enemy:${e.id}`;
    if (e.innate && !hasEl(e.innate.element)) err(where, `unknown innate '${e.innate.element}'`);
    if (e.projectile?.element && !hasEl(e.projectile.element)) err(where, 'unknown projectile element');
    for (const k of Object.keys(e.resist ?? {})) if (!hasEl(k)) err(where, `resist on unknown element '${k}'`);
    if (e.armor < 0 || e.armor >= 1) err(where, 'armor must be within [0,1)');
    checkEffects(where, e.onDeath);
  }
  for (const c of lists.CORES) {
    if (!hasEl(c.element)) err(`core:${c.id}`, `unknown element '${c.element}'`);
    if (c.unlock && !hasRes(c.unlock)) err(`core:${c.id}`, `unknown unlock '${c.unlock}'`);
  }
  for (const s of lists.SHELLS) if (s.unlock && !hasRes(s.unlock)) err(`shell:${s.id}`, `unknown unlock '${s.unlock}'`);
  for (const u of lists.UPGRADES) {
    for (const el of u.elements) if (!hasEl(el)) err(`upgrade:${u.id}`, `unknown element '${el}'`);
    if (Object.keys(u.mods).length === 0) err(`upgrade:${u.id}`, 'upgrade has no effect');
  }
  // Research DAG: references exist and no cycles.
  for (const n of lists.RESEARCH) for (const req of n.requires) if (!hasRes(req)) err(`research:${n.id}`, `requires unknown '${req}'`);
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string): boolean => {
    if (done.has(id)) return true;
    if (visiting.has(id)) return false;
    visiting.add(id);
    for (const req of Content.research.get(id)?.requires ?? []) if (!visit(req)) return false;
    visiting.delete(id);
    done.add(id);
    return true;
  };
  for (const n of lists.RESEARCH) if (!visit(n.id)) err(`research:${n.id}`, 'prerequisite cycle');

  for (const reg of lists.REGIONS) {
    for (const p of reg.enemyPool) if (!Content.enemies.has(p.id)) err(`region:${reg.id}`, `unknown enemy '${p.id}'`);
    for (const id of reg.elitePool) if (!Content.enemies.has(id)) err(`region:${reg.id}`, `unknown elite '${id}'`);
    for (const t of reg.templates) {
      for (const o of t.objects) if (!Content.objects.has(o.id)) err(`template:${t.id}`, `unknown object '${o.id}'`);
      for (const z of t.zones) if (!Content.zones.has(z.id)) err(`template:${t.id}`, `unknown zone '${z.id}'`);
    }
  }

  // Loop analysis: element A reacting produces B (output/chain/zone) that can react with something to produce A again.
  for (const cycle of findReactionCycles()) warn('graph', `cycle ${cycle.join(' → ')} (bounded at runtime by cooldowns and chain depth)`);

  return issues;
}

/** Edges element → element: "applying X can cause Y to be applied". */
export function reactionEdges(): { from: string; to: string; via: string }[] {
  const edges: { from: string; to: string; via: string }[] = [];
  for (const r of Content.lists.REACTIONS) {
    const outs = new Set<string>();
    if (r.output) outs.add(r.output.element);
    for (const e of r.effects) {
      if (e.type === 'chain') outs.add(e.element);
      if (e.type === 'spawnZone') {
        const z = Content.zones.get(e.zone);
        if (z?.element) outs.add(z.element);
      }
    }
    for (const i of r.inputs) if (i !== '*') for (const o of outs) edges.push({ from: i, to: o, via: r.id });
  }
  return edges;
}

export function findReactionCycles(): string[][] {
  const edges = reactionEdges();
  const adj = new Map<string, string[]>();
  for (const e of edges) adj.set(e.from, [...new Set([...(adj.get(e.from) ?? []), e.to])]);
  const cycles: string[][] = [];
  const seen = new Set<string>();
  const stack: string[] = [];
  const dfs = (n: string) => {
    stack.push(n);
    for (const m of adj.get(n) ?? []) {
      const idx = stack.indexOf(m);
      if (idx >= 0) {
        const cyc = [...stack.slice(idx), m];
        const key = [...cyc.slice(0, -1)].sort().join(',');
        if (!seen.has(key)) (seen.add(key), cycles.push(cyc));
      } else if (stack.length < 6) dfs(m);
    }
    stack.pop();
  };
  for (const n of adj.keys()) dfs(n);
  return cycles;
}
