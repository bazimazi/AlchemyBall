# Alchemy Ball

**Every collision changes the ball.**

Alchemy Ball is a physics-driven elemental discovery roguelite for mobile. You fling an alchemical ball around an arena. Each collision swaps elements between the ball, enemies, pools, clouds and arena objects, and those elements react. Fire on a wet slime flashes into a Steam Burst. Lightning through a pool shocks everything standing in it. A hard hit on a frozen enemy shatters it. You discover reactions by experimenting, record them in the Alchemy Codex, master them by using them in different ways, and spend what you learn on permanent research that opens new cores, tools and challenges.

## Play

```bash
npm install
npm run dev        # http://localhost:5173 (also exposed on your LAN for testing on a phone)
```

**Controls (touch or mouse)**

| Action | Input |
| --- | --- |
| Launch | Touch anywhere, pull back, release. The dotted line previews the path through several bounces. A ghost ball marks where you will connect, and an arrow shows where the foe will be pushed. |
| Cancel a shot | While aiming, drag back to where you started, then let go. |
| Aim slow-motion | Time slows while you hold an aim. This drains the focus bar next to the pips. |
| Brake | Quick tap without dragging. Has a 1 s cooldown. |
| Pause | ❚❚ button, or `Esc` / `P` |

Launches spend **pips** (the white circles at the top), which recharge over time. Enemies can only hurt you on contact while you are moving slowly.

Hits and reactions while the ball keeps moving build a **combo**. A higher combo means more Essence from kills, and the combo pays out when it ends. Runs are saved between rooms, so you can close the app and **Continue** later.

## What is in the game

- **Three regions, each with its own boss:**
  - The Cinder Marsh (the Crucible Warden).
  - The Frostvein Caverns (the Rime Matriarch), unlocked by beating the Warden.
  - The Storm Spire (the Tempest Engine), unlocked by beating the Matriarch.
- **Enemies:** 18 types, including elites with **affixes** (Shielded, Swift, Volatile, Regenerating, Insulated, Enraged).
- **31 reactions** to discover and master.
- **51 run upgrades**, including **8 Evolutions** that each fuse two maxed upgrades into a legendary.
- **Rooms:** Skirmish, Elite, Reliquary, Still Spring, Research Cache, **Merchant** and **Anomaly** (text events). Every combat room offers an optional **challenge**.
- **Long-term goals:**
  - 9 cores, each with **mastery levels** and **2 unlockable aspects**.
  - A **Heat ladder** from 1 to 10, with records kept per core.
  - **46 feats**, most of which unlock new upgrades or cosmetics.
  - Three **contracts** with no timers.
  - **Trails and ball skins** that are cosmetic only.
  - Player levels up to 25.
- **Modes:** the Daily Experiment (with a daily mutator), the **Abyssal Descent** (endless), and the Laboratory sandbox.
- **Accessibility:**
  - Sliders for shake and flash.
  - Reduced motion.
  - High contrast.
  - Element badges coded by shape.
  - A left-handed HUD.
  - **Assist mode**: damage resistance that grows after each defeat.
  - Save backup and restore.

## Develop

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Typecheck and production build to `dist/` |
| `npm test` | Vitest suite: reactions, physics, save/migration, run generation, progression, and a full-run soak across every core |
| `npm run validate` | Content validator: integrity, reachability, ambiguous variants, reaction cycles, and pair coverage |
| `npm run graph` | Same as `validate`, plus the reaction dependency graph as Mermaid |
| `npm run sim -- 20 0.6` | Balance simulation: bot runs × cores × skill. Prints win rate, reactions/min, discovery rate, reaction share and room length |
| `node tools/smoke.mjs` / `node tools/playthrough.mjs <url> <outDir> <seconds>` | Drive the built game in a real browser (Chrome or Edge via `playwright-core`), take screenshots, and fail on console errors. Start `npm run preview` first. |
| `npm run build` then `node tools/gallery.mjs` | Screenshot every major screen, the full creature roster and all three bosses into `smoke-out/gallery/`. |
| `npm run build` then `node tools/visual-review.mjs --playthrough` | Start a temporary preview server, capture desktop/mobile art and combat scenes, check narrow layouts and reduced motion, then run smoke and playthrough checks. Screenshots go to `smoke-out/visual/`; set `BROWSER` to use a different Chromium executable. |

The visual style uses engraved stone, brass details and luminous elemental sources. Creatures have distinct silhouettes, gaze tracking, idle motion and impact deformation. Reactions combine shockwaves, sparks, crystal shards and layered lightning; the orb leaves a time-based light trail. Everything is drawn locally with Canvas and CSS, with no external art downloads. Reduced motion follows both the in-game setting and the operating system preference.

The docs cover the details:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): engine choice, module map, reaction pipeline, safety limits, saves and performance.
- [docs/DESIGN.md](docs/DESIGN.md): pillars, the elemental rules, content catalogue, progression and economy.
- [docs/ROADMAP.md](docs/ROADMAP.md): phase status, acceptance criteria, known limitations and next steps.
- [docs/RESEARCH.md](docs/RESEARCH.md): the research on game feel, UI/UX and long-term progression behind v0.4, with sources, and how each finding was applied.

## Adding content

Everything is data in `src/content/`:

- A new reaction is one object in `reactions.ts`.
- A new enemy goes in `enemies.ts`.
- A new arena layout is a template in `progression.ts`. A new region is one `RegionDef` there.
- A new boss is one entry in `BOSSES` (`enemies.ts`): phases, attacks (slam, flask, nova, charge) and an arena. It also needs an enemy body with the same id.
- A new upgrade or Evolution goes in `build.ts`. A new feat goes in `src/game/feats.ts`, and an aspect in `ASPECTS`.

Run `npm run validate` after each change: it catches unknown ids, unreachable inputs, ambiguous context variants and new cycles. Behaviour that the data model cannot express goes in `src/sim/reactionEngine.ts` as a new `EffectDef` type.

## License

MIT
