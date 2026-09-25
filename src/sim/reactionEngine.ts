import { Content, element as elementDef, pairKey, reactionsByPair } from '../content';
import type { EffectDef, ReactionDef, StatusId } from '../content/types';
import { vdist, vnorm, vsub, vlen } from '../core/vec';
import type { AnyHolder, Enemy, Zone } from './entities';
import type { World } from './world';

/** Hard safety limits. Chains deeper than this degrade to plain aura application (no reaction). */
export const MAX_CHAIN_DEPTH = 4;
/** Maximum reactions resolved per simulation step across the whole world. */
export const MAX_REACTIONS_PER_STEP = 40;
const AURA_EPS = 0.05;

export interface ApplyContext {
  depth: number;
  impactSpeed?: number;
  /** Faction credited for zones spawned by resulting reactions. */
  faction?: 'player' | 'hostile' | 'neutral';
  /** Uid of the holder that delivered the element (for arcs). */
  sourceUid?: number;
}

export type ApplyOutcome =
  | { kind: 'reacted'; reaction: ReactionDef }
  | { kind: 'stored' }
  | { kind: 'blocked' }
  | { kind: 'ignored' };

interface Pending {
  target: AnyHolder;
  element: string;
  amount: number;
  ctx: ApplyContext;
}

/**
 * Owns every elemental state change. Other systems never edit auras directly; they call
 * `apply()` and the engine resolves at most one reaction per application in a deterministic
 * order (highest partner amount first, then id), queuing chained applications breadth-first.
 */
export class ReactionEngine {
  private queue: Pending[] = [];
  private flushing = false;
  reactionsThisStep = 0;

  constructor(private world: World) {}

  beginStep(): void {
    this.reactionsThisStep = 0;
  }

  /** Apply an element to a holder. Chained applications caused by the result are resolved before returning. */
  apply(target: AnyHolder, element: string, amount: number, ctx: ApplyContext): ApplyOutcome {
    if (this.flushing) {
      this.queue.push({ target, element, amount, ctx });
      return { kind: 'blocked' };
    }
    this.flushing = true;
    let out: ApplyOutcome;
    try {
      out = this.applyNow(target, element, amount, ctx);
      // Breadth-first: chained applications queued while resolving run in FIFO order.
      let guard = 0;
      while (this.queue.length > 0 && guard++ < 512) {
        const p = this.queue.shift()!;
        this.applyNow(p.target, p.element, p.amount, p.ctx);
      }
      this.queue.length = 0;
    } finally {
      this.flushing = false;
    }
    return out;
  }

  /** Remove an element (e.g. cleansing). */
  remove(target: AnyHolder, element: string): void {
    target.auras.delete(element);
  }

  /** Find the reaction that would fire. Pure query: used by the engine, the lab and tests. */
  evaluate(target: AnyHolder, element: string, amount: number, ctx: ApplyContext): { reaction?: ReactionDef; partner?: string; stirred?: string[]; inert?: string[] } {
    const partners = [...target.auras.entries()]
      .filter(([el, amt]) => amt > AURA_EPS && el !== element)
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    const stirred: string[] = [];
    const inert: string[] = [];
    const def = elementDef(element);
    for (const [partner, partnerAmt] of partners) {
      const candidates = this.candidates(element, partner);
      if (candidates.length === 0) {
        if (def.tier === 'base' && elementDef(partner).tier === 'base') inert.push(pairKey(element, partner));
        continue;
      }
      for (const r of candidates) {
        if (r.unlock && !this.world.unlocks.has(r.unlock)) continue;
        if (r.holders && !r.holders.includes(target.kind)) continue;
        if (!this.conditionsHold(r, target, element, amount, partner, partnerAmt, ctx)) {
          stirred.push(pairKey(element, partner));
          continue;
        }
        return { reaction: r, partner, stirred, inert };
      }
    }
    return { stirred, inert };
  }

  private candidates(a: string, b: string): ReactionDef[] {
    const exact = reactionsByPair.get(pairKey(a, b)) ?? [];
    const baseB = elementDef(b).tier === 'base';
    const baseA = elementDef(a).tier === 'base';
    const wildA = baseB ? reactionsByPair.get(`${a}+*`) ?? [] : [];
    const wildB = baseA ? reactionsByPair.get(`${b}+*`) ?? [] : [];
    if (wildA.length === 0 && wildB.length === 0) return exact;
    return [...exact, ...wildA, ...wildB];
  }

  private conditionsHold(r: ReactionDef, target: AnyHolder, applied: string, appliedAmt: number, partner: string, partnerAmt: number, ctx: ApplyContext): boolean {
    const c = r.conditions;
    if (!c) return true;
    if (c.minImpactSpeed !== undefined && (ctx.impactSpeed ?? 0) < c.minImpactSpeed) return false;
    if (c.holderStatus && !target.statuses.has(c.holderStatus)) return false;
    if (c.holderTags && !c.holderTags.some((t) => target.tags.includes(t))) return false;
    if (c.minRatio !== undefined || c.maxRatio !== undefined) {
      const amtOf = (id: string) => (id === applied ? appliedAmt : id === partner ? partnerAmt : 0);
      const ratio = amtOf(r.inputs[0]) / Math.max(1e-6, amtOf(r.inputs[1]));
      if (c.minRatio !== undefined && ratio < c.minRatio) return false;
      if (c.maxRatio !== undefined && ratio >= c.maxRatio) return false;
    }
    return true;
  }

  private applyNow(target: AnyHolder, element: string, amount: number, ctx: ApplyContext): ApplyOutcome {
    if (target.dead || amount <= 0) return { kind: 'ignored' };
    const def = Content.elements.get(element);
    if (!def) return { kind: 'ignored' };

    if (target.kind === 'enemy') {
      const e = target as Enemy;
      const resist = (e.def.resist?.[element] ?? 1) * (e.adapt.get(element) ?? 1);
      amount *= resist;
      if (amount <= 0.01) return { kind: 'ignored' };
      if (e.def.adaptive && def.tier !== 'hidden') this.world.adaptTo(e, element);
    }
    if (def.tier !== 'hidden') this.world.noteElementSeen(element);

    const overBudget = this.reactionsThisStep >= MAX_REACTIONS_PER_STEP || ctx.depth > MAX_CHAIN_DEPTH;
    const ev = overBudget ? { stirred: [], inert: [] } : this.evaluate(target, element, amount, ctx);
    for (const p of ev.stirred ?? []) if (!ev.reaction) this.world.emit({ type: 'stirred', pair: p, pos: { ...target.pos } });
    for (const p of ev.inert ?? []) this.world.emit({ type: 'inert', pair: p });

    const r = ev.reaction;
    if (r && ev.partner) {
      if ((target.cooldowns.get(r.id) ?? 0) > 0) {
        // On cooldown: the element is absorbed without reacting (prevents rapid re-triggers).
        this.store(target, element, amount * 0.5);
        return { kind: 'blocked' };
      }
      this.execute(r, target, element, amount, ev.partner, ctx);
      return { kind: 'reacted', reaction: r };
    }
    this.store(target, element, amount);
    return { kind: 'stored' };
  }

  private store(target: AnyHolder, element: string, amount: number): void {
    const def = elementDef(element);
    if (def.tier === 'hidden') return;
    const cur = target.auras.get(element) ?? 0;
    target.auras.set(element, Math.min(def.maxAmount, cur + amount));
  }

  private execute(r: ReactionDef, holder: AnyHolder, applied: string, appliedAmt: number, partner: string, ctx: ApplyContext): void {
    const w = this.world;
    this.reactionsThisStep++;
    holder.cooldowns.set(r.id, r.cooldown);

    // Consume inputs.
    const partnerAmt = holder.auras.get(partner) ?? 0;
    const left = partnerAmt * (1 - r.consume.present);
    if (left > AURA_EPS) holder.auras.set(partner, left);
    else holder.auras.delete(partner);
    const appliedLeft = appliedAmt * (1 - r.consume.applied);
    if (appliedLeft > AURA_EPS) this.store(holder, applied, appliedLeft);
    if (r.output) this.store(holder, r.output.element, r.output.amount);

    const potency = w.reactionPotency(r);
    const color = r.color ?? (r.output ? elementDef(r.output.element).color : elementDef(r.inputs[0] === '*' ? partner : r.inputs[0]).color);
    const stats = { targets: 0, kills: 0, onBoss: false, radius: 0 };
    const faction = ctx.faction ?? (holder.kind === 'ball' ? 'player' : 'player');

    for (const eff of r.effects) this.runEffect(eff, r, holder, partner, potency, ctx, faction, stats);

    if (w.mods.lifesteal) w.healBall(w.mods.lifesteal);
    if (w.mods.iceArmor && (r.inputs.includes('ice') || r.id === 'freeze' || r.id === 'freeze_pool')) w.ball.shield = Math.min(40, w.ball.shield + w.mods.iceArmor);
    w.onReaction(r);
    w.emit({
      type: 'reaction', reactionId: r.id, pos: { ...holder.pos }, holderKind: holder.kind, holderUid: holder.uid,
      depth: ctx.depth, targets: stats.targets, kills: stats.kills, onBoss: stats.onBoss, color, radius: Math.max(stats.radius, holder.radius * 2),
    });
  }

  private runEffect(
    eff: EffectDef, r: ReactionDef, holder: AnyHolder, partner: string, potency: number, ctx: ApplyContext,
    faction: 'player' | 'hostile' | 'neutral', stats: { targets: number; kills: number; onBoss: boolean; radius: number },
  ): void {
    const w = this.world;
    const zoneR = holder.kind === 'zone' ? holder.radius : 0;
    const areaOf = (radius: number | undefined) => (radius === undefined ? undefined : radius === 0 && zoneR ? zoneR : radius);
    switch (eff.type) {
      case 'damage': {
        const area = areaOf(eff.radius);
        const targets = w.damageTargetsAround(holder, area);
        stats.radius = Math.max(stats.radius, area ?? 0);
        let dmg = eff.amount * potency;
        if (r.inputs.includes('lightning')) dmg *= 1 + (w.mods.lightningDmg ?? 0);
        if (r.id === 'shatter') dmg *= 1 + (w.mods.shatterDmg ?? 0);
        for (const t of targets) {
          let d = dmg;
          if (eff.tagMul) for (const [tag, m] of Object.entries(eff.tagMul)) if (t.tags.includes(tag) || (tag === 'brittle' && t.statuses.has('petrified'))) d *= m;
          if (eff.statusMul) for (const [st, m] of Object.entries(eff.statusMul)) if (t.statuses.has(st as StatusId)) d *= m!;
          const killed = w.damageHolder(t, d, 'reaction', r.id, partner);
          stats.targets++;
          if (killed) stats.kills++;
          if (t.kind === 'enemy' && (t as Enemy).isBoss) stats.onBoss = true;
        }
        break;
      }
      case 'status': {
        const area = areaOf(eff.radius);
        let dur = eff.duration;
        if (eff.status === 'frozen') dur *= 1 + (w.mods.freezeDuration ?? 0);
        if (holder.kind === 'ball' && area === undefined) {
          w.setStatus(holder, eff.status, dur * 0.35);
          break;
        }
        for (const t of w.damageTargetsAround(holder, area)) {
          if (t.kind === 'enemy' && (t as Enemy).isBoss && (eff.status === 'frozen' || eff.status === 'stunned')) {
            w.setStatus(t, eff.status, dur * 0.3);
          } else w.setStatus(t, eff.status, dur);
          if (t.kind === 'enemy' && (t as Enemy).isBoss) stats.onBoss = true;
          stats.targets++;
        }
        break;
      }
      case 'clearStatus':
        holder.statuses.delete(eff.status);
        break;
      case 'spawnZone': {
        // Loop guard: a zone never re-spawns its own kind (e.g. water painted on an ice sheet).
        if (holder.kind === 'zone' && (holder as Zone).def.id === eff.zone) break;
        const radius = eff.radius === 0 ? holder.radius : eff.radius;
        w.spawnZone(eff.zone, holder.pos, radius, eff.duration, faction, ctx.depth + 1);
        stats.radius = Math.max(stats.radius, radius);
        break;
      }
      case 'impulse': {
        w.impulseFrom(holder.pos, eff.strength * potency, eff.radius, holder);
        if (holder.kind === 'ball' && eff.selfBoost) {
          const b = w.ball;
          const sp = vlen(b.vel);
          const boost = eff.selfBoost * (1 + (w.mods.steamSelfBoost ?? 0));
          if (sp < 150) b.vel = { x: 0, y: -600 * boost };
          else b.vel = { x: b.vel.x * boost, y: b.vel.y * boost };
        }
        stats.radius = Math.max(stats.radius, eff.radius);
        break;
      }
      case 'chain': {
        const radius = eff.radius * (1 + (eff.element === 'lightning' ? w.mods.chainRadius ?? 0 : 0));
        const maxT = eff.maxTargets + (w.mods.chainTargets ?? 0);
        const cands = w.chainTargetsAround(holder, radius, eff.requireAura, eff.requireTag).slice(0, maxT);
        for (const t of cands) {
          w.emit({ type: 'arc', from: { ...holder.pos }, to: { ...t.pos }, element: eff.element });
          if (eff.damage) w.damageHolder(t, eff.damage * potency, 'reaction', r.id, eff.element);
          this.queue.push({ target: t, element: eff.element, amount: eff.amount, ctx: { depth: ctx.depth + 1, faction, sourceUid: holder.uid } });
          stats.targets++;
        }
        stats.radius = Math.max(stats.radius, radius * 0.5);
        break;
      }
      case 'spawnObstacle':
        w.spawnObject(eff.obstacle, holder.pos, eff.duration);
        break;
      case 'consumeZone':
        if (holder.kind === 'zone') (holder as Zone).ttl = 0;
        break;
      case 'ballBuff':
        if (holder.kind === 'ball') {
          w.ball.buffs.set(eff.buff, eff.duration);
          w.emit({ type: 'buff', buff: eff.buff });
        }
        break;
      case 'amplify': {
        const cur = holder.auras.get(partner) ?? 0;
        const max = elementDef(partner).maxAmount;
        holder.auras.set(partner, Math.min(max, Math.max(cur, 0.5) * eff.mul));
        // Overload spreads the amplified element outward.
        for (const t of w.chainTargetsAround(holder, 140).slice(0, 3)) {
          w.emit({ type: 'arc', from: { ...holder.pos }, to: { ...t.pos }, element: partner });
          this.queue.push({ target: t, element: partner, amount: 0.6, ctx: { depth: ctx.depth + 1, faction, sourceUid: holder.uid } });
        }
        break;
      }
    }
  }
}

/** Direction from a to b, safe for coincident points. */
export function dirFrom(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
  const d = vsub(b, a);
  return vdist(a, b) < 1e-6 ? { x: 0, y: -1 } : vnorm(d);
}
