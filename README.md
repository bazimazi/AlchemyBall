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
| Launch | Touch anywhere, pull back, release. The dotted line previews the path, including one bounce. |
| Aim slow-motion | Time slows while you hold an aim. This drains the focus bar next to the pips. |
| Brake | Quick tap without dragging. Has a 1 s cooldown. |
| Pause | ❚❚ button, or `Esc` / `P` |

Launches spend **pips** (the white circles at the top), which recharge over time. Enemies can only hurt you on contact while you are moving slowly.

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

The docs cover the details:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): engine choice, module map, reaction pipeline, safety limits, saves and performance.
- [docs/DESIGN.md](docs/DESIGN.md): pillars, the elemental rules, content catalogue, progression and economy.
- [docs/ROADMAP.md](docs/ROADMAP.md): phase status, acceptance criteria, known limitations and next steps.

## Adding content

Everything is data in `src/content/`:

- A new reaction is one object in `reactions.ts`.
- A new enemy goes in `enemies.ts`.
- A new arena layout is a template in `progression.ts`.

Run `npm run validate` after each change: it catches unknown ids, unreachable inputs, ambiguous context variants and new cycles. Behaviour that the data model cannot express goes in `src/sim/reactionEngine.ts` as a new `EffectDef` type.

## License

MIT
