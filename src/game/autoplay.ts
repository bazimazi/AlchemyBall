import { Content } from '../content';
import { Rng } from '../core/rng';
import { vlen, vnorm, vsub } from '../core/vec';
import { PHYS } from '../sim/ballPhysics';
import { World } from '../sim/world';
import { freshProfile, potencyMap, type Profile } from './profile';
import { Run, type RoomType } from './run';
import { ProgressionTracker } from './tracker';

export interface BotResult {
  won: boolean;
  floor: number;
  seconds: number;
  reactions: number;
  discoveries: number;
  kills: number;
  maxDepth: number;
  reactionCounts: Record<string, number>;
  cause?: string;
  maxReactionsInStep: number;
  roomSeconds: number[];
}

/**
 * A simple scripted player used for balance simulation and soak tests. It is deliberately
 * mediocre: launches at the nearest enemy or at a random elemental source with aim noise.
 */
export function botRun(opts: { seed: number; core: string; profile?: Profile; maxRoomSeconds?: number; skill?: number; heat?: number }): BotResult {
  const profile = opts.profile ?? freshProfile();
  const run = new Run({ seed: opts.seed, mode: 'standard', regionId: 'cinder_marsh', core: opts.core, shell: 'glass', heat: opts.heat ?? 0, tutorial: false, maxPips: 3, rerolls: 0 });
  const tracker = new ProgressionTracker(profile, run, () => {});
  const rng = new Rng(opts.seed ^ 0xabc);
  const skill = opts.skill ?? 0.6;
  let cause: string | undefined;
  let maxStep = 0;
  const roomSeconds: number[] = [];
  const coreEl = Content.cores.get(opts.core)!.element;

  while (!run.finished) {
    const room: RoomType = run.choices.includes('combat') ? 'combat' : run.choices[0];
    run.enter(room);
    if (room === 'rest') {
      run.hp = Math.min(run.maxHp, run.hp + run.maxHp * 0.35);
      run.completeRoom();
      continue;
    }
    if (room === 'research') {
      run.completeRoom();
      continue;
    }
    if (room === 'treasure') {
      const o = run.offerUpgrades(3, 'rare', () => true);
      if (o[0]) run.addUpgrade(o[0].def.id);
      run.completeRoom();
      continue;
    }
    const world = new World({
      encounter: run.generateEncounter(room), coreElement: coreEl, maxHp: run.maxHp, hp: run.hp, mods: run.mods(),
      unlocks: new Set(profile.research), potency: potencyMap(profile), maxPips: run.maxPips, seed: rng.int(0, 1e9),
    });
    world.events.onAny((e) => tracker.handle(e));
    world.events.on('ballDied', (e) => (cause = e.cause));
    const limit = (opts.maxRoomSeconds ?? 240) / PHYS.step;
    let steps = 0;
    while (!world.over && steps < limit) {
      const b = world.ball;
      if (vlen(b.vel) < 220 && world.canLaunch()) {
        const targets = world.enemies.filter((e) => e.spawnFx <= 0);
        let tgt = targets.length ? targets.reduce((a, c) => (vlen(vsub(c.pos, b.pos)) < vlen(vsub(a.pos, b.pos)) ? c : a)).pos : { x: PHYS.arenaW / 2, y: 200 };
        if (world.objects.length && rng.chance(0.3)) tgt = rng.pick(world.objects).pos;
        const d = vnorm(vsub(tgt, b.pos));
        const noise = (1 - skill) * 0.6;
        const a = Math.atan2(d.y, d.x) + rng.range(-noise, noise);
        world.launch({ x: Math.cos(a), y: Math.sin(a) }, rng.range(0.6, 1));
      }
      world.step();
      maxStep = Math.max(maxStep, world.engine.reactionsThisStep);
      steps++;
      assertFinite(world);
    }
    const secs = steps * PHYS.step;
    run.stats.timeSec += secs;
    roomSeconds.push(secs);
    run.hp = world.ball.hp;
    if (!world.cleared) {
      if (!cause) cause = 'Timeout';
      return result(false);
    }
    const offer = run.offerUpgrades(3, room === 'elite' ? 'elite' : 'normal', () => true);
    if (offer.length) run.addUpgrade(offer[Math.floor(rng.next() * offer.length)].def.id);
    run.completeRoom();
  }
  return result(true);

  function result(won: boolean): BotResult {
    return {
      won, floor: run.floor, seconds: run.stats.timeSec, reactions: run.stats.reactions, discoveries: run.stats.discoveries.length,
      kills: run.stats.kills, maxDepth: run.stats.maxChainDepth, reactionCounts: run.stats.reactionCounts, cause, maxReactionsInStep: maxStep, roomSeconds,
    };
  }
}

function assertFinite(w: World): void {
  const b = w.ball;
  if (!Number.isFinite(b.pos.x) || !Number.isFinite(b.pos.y) || !Number.isFinite(b.vel.x) || !Number.isFinite(b.vel.y)) throw new Error('Ball state became non-finite');
  if (b.pos.x < 0 || b.pos.x > PHYS.arenaW || b.pos.y < 0 || b.pos.y > PHYS.arenaH) throw new Error('Ball escaped the arena');
  for (const e of w.enemies) if (!Number.isFinite(e.pos.x) || !Number.isFinite(e.hp)) throw new Error(`Enemy ${e.def.id} became non-finite`);
}
