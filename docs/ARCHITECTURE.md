# Architecture

## Engine decision

The repository was empty apart from a Node `.gitignore`, so there was no existing stack to keep. I chose **TypeScript + Vite + HTML5 Canvas 2D**, with a **custom deterministic physics step** and **no game-engine dependency**.

- **Mobile reach:** it runs in any mobile browser today, installs as a PWA (`public/manifest.webmanifest`), and can be wrapped as a native iOS/Android app with Capacitor without code changes. That wrapper is not added yet.
- **Physics we control:** the game needs ball-feel tuning and exact collision semantics more than it needs a general rigid-body solver. Only circles and segments collide. A fixed-step integrator with substeps is small (see `sim/world.ts`), deterministic, and testable headless in Node.
- **Headless simulation:** `src/sim` and `src/game` never touch the DOM. The same code runs in Vitest, in the balance simulator (`tools/sim.ts`) and in the browser.
- **Size:** the production bundle is about 50 KB gzipped, and all audio is synthesized, so there are no assets to download.

If rendering demands grow (lighting, thousands of particles), the renderer can move to WebGL (for example PixiJS) behind the same `Renderer.draw(world, fx)` boundary without touching the simulation.

## Module map

```
src/
  core/        vec math, seeded RNG (mulberry32), typed event emitter
  content/     ALL game data + types + registry + validator   ← designers work here
  sim/         headless simulation
    world.ts           fixed-step World: ball/enemy/zone/object/projectile update, collisions, damage API
    reactionEngine.ts  the only system that changes elemental state
    ballPhysics.ts     tunable constants (PHYS) + element/buff/shell/upgrade → physics mods
    boss.ts            Crucible Warden controller (phases from data)
    entities.ts        entity shapes (every reactive thing is a Holder)
    events.ts          SimEvent union: the simulation's only output channel
  game/        run & meta layer (pure logic, no DOM)
    run.ts         map, room types, encounter generation, upgrade offers
    profile.ts     permanent profile, research, mastery, codex knowledge queries
    tracker.ts     SimEvent → permanent progression (discoveries commit instantly)
    rewards.ts     end-of-run rewards, failure advice, next-goal suggestion
    save.ts        versioned, checksummed, backed-up persistence + migrations
    autoplay.ts    scripted bot used by the simulator and the soak test
    analytics.ts   opt-in, local-only aggregate counters
  render/      Canvas renderer + FX (pooled particles, rings, arcs, floating text)
  audio/       procedural WebAudio synth, adaptive drone, haptics
  ui/          DOM screens: app flow, session (loop + input + HUD), codex
tools/         validate / sim / browser smoke + playthrough
tests/         vitest suites
```

The dependency direction is `content ← sim ← game ← ui`, with `render` and `audio` depending only on `content` and sim types. The simulation never imports presentation code.

## The collision → reaction pipeline

Every reactive thing implements `Holder`: the ball, enemies, zones (pools and clouds) and arena objects. A holder carries **auras** (element → amount), **statuses**, **tags** and per-reaction **cooldowns**.

1. **Physics contact.** `World.collideBall*` resolves the impulse (mass-weighted, with restitution by material and element) and measures the relative normal speed.
2. **Impact element.** A fast contact applies the hidden `kinetic` element, with its amount scaled by speed. Impact reactions such as Shatter or Resonant Clang are ordinary reactions that take `kinetic` as an input, so they share every rule and safety limit. Kinetic goes first so impact reactions see the target's state before other elements change it.
3. **Two-way exchange.** The ball paints each of its auras onto the target (the core element is never drained), and the target's innate or source element rubs off onto the ball. Zones do the same on a tick while something is inside them.
4. **Resolution.** `ReactionEngine.apply(target, element, amount, ctx)`:
   - Applies resistance and adaptation for enemies.
   - Picks partners from the holder's current auras, ordered by amount, then id, which keeps it deterministic.
   - For each partner, tries candidate reactions (exact pair plus `*` wildcards) in descending `priority`. The first one whose holder kind and conditions hold wins. Conditions can be impact speed, holder status, holder tags, or the quantity ratio. This is how one pair produces different outcomes in different contexts, such as Quench versus Steam Burst, or Flash Freeze on a pool versus Freeze on an enemy.
   - A per-holder reaction cooldown blocks rapid re-triggers.
   - It then consumes inputs, stores the leftover and output auras, and runs the effects.
   - **Chain effects are queued, not recursed.** They resolve breadth-first in FIFO order at `depth + 1`.
5. **Events.** Every outcome is emitted: `reaction`, `stirred` (a reaction exists but its conditions failed), `inert` (two base elements with no reaction), `arc`, `damage`, `kill`, and so on. The Codex uses `stirred` and `inert` to tell a failed experiment apart from an untested one.

State ownership is strict. Only the engine mutates auras for reactions. The World exposes a small effect API (`damageHolder`, `setStatus`, `spawnZone`, `impulseFrom`, `chainTargetsAround`) that the engine calls. Enemy and object classes contain no reaction logic.

### Safety limits

| Risk | Guard |
| --- | --- |
| Infinite chains | `MAX_CHAIN_DEPTH = 4`. Deeper applications store the aura but never react. |
| Explosive cascades | `MAX_REACTIONS_PER_STEP = 40` across the world. The flush loop is also capped at 512 queued applications. |
| Re-trigger spam | Every reaction has a per-holder cooldown greater than 0. The validator enforces this. |
| Duplicate collision damage | Per-pair contact cooldown (0.12 s for enemies, 0.15 s for objects). A reaction's damage effect hits each target once. |
| Zone feedback loops | A zone-hosted reaction never spawns its own zone type. Environmental variants target specific zones through `zone:<id>` tags. Zones are capped at 24, and zone-on-zone application is capped by depth. |
| Destroyed holders | Every step checks `dead`. Cleanup runs once at the end of the step, so nothing is removed mid-iteration. |
| Physics tunnelling | The ball substeps so it never moves more than 40% of its radius per substep, with a hard arena clamp. Tested at 5000 u/s in every direction. |

`npm run validate` also lists reaction-graph cycles statically, so designers can see which loops rely on these runtime bounds.

## Time

The simulation runs at a fixed step of 1/120 s (`PHYS.step`) through an accumulator in `Session.frame`, capped at 14 steps per frame. Presentation runs on real time. Bullet time while aiming (×0.22), hit-stop (×0.05) and discovery slow-motion (×0.25) scale only simulated time. Physics is therefore frame-rate independent, and the same seed plus the same inputs gives the same result, which a test checks.

## Randomness

All gameplay randomness goes through `Rng` (seeded mulberry32). A `Run` forks independent streams for the map, encounters and upgrade offers, so a choice in one never perturbs the others. The daily challenge seeds from the UTC date. Visual-only randomness (particle spread, shake) uses `Math.random` and never feeds back into the simulation.

## Persistence

`SaveSlot<T>` (`game/save.ts`):

- The envelope is `{ v, sum, data }` with a 53-bit checksum.
- Before each write, the previous valid copy goes to `<key>.bak`, so an interrupted write always leaves one good copy.
- Loading tries main, then backup, then a fresh profile.
- Migrations run from the stored version to the current one. v1 → v2 is included as a real example.
- `normalize()` backfills new fields and drops references to content that no longer exists.
- A save from a newer game version is refused rather than overwritten.

Discoveries, mastery and pair knowledge are committed the moment they happen. Essence is banked after every room. A crash or a failed run can only lose the room in progress. Mid-run state is not persisted yet (see the roadmap).

## Performance

The simulation is O(n²) only for enemy-enemy separation (n ≤ about 15 in practice). A 7-floor bot run simulates in about 60 ms in Node. The renderer:

- pools particles (700, scaled by quality);
- only rewrites HUD DOM when a signature changes;
- degrades automatically: if frames average worse than 45 FPS, it lowers the particle budget and backing-store resolution, and raises them again when there is headroom.

The reaction burst budget keeps worst-case frames bounded. The soak test asserts at most 40 reactions per step.

## Testing

- `tests/reactions.test.ts`: every engine rule, including context variants, conditions, cooldowns, depth limit, wildcards, inert/stirred reporting, zone reactions and loop guards.
- `tests/physics.test.ts`: no tunnelling, pips, coming to rest, element physics, determinism, contact damage.
- `tests/save.test.ts`: round-trip, backup recovery, garbage input, v1 migration, newer-version refusal.
- `tests/run.test.ts`: content validation, map invariants, encounter fairness, difficulty scaling, upgrade offers, mastery-by-variety, discovery persistence, research prerequisites, Codex states, and a full-run soak for every core.
- `tools/playthrough.mjs`: plays the real build in a browser from the tutorial through the boss, results and Codex, and fails on any console error.
