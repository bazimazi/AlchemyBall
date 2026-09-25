# Roadmap and status

Last updated: 2026-09-25.

## Phase status

| Phase | Status | Evidence |
| --- | --- | --- |
| 1. Core physics prototype | **Done** | Slingshot launch, brake, bullet-time aim, substepped collisions (no tunnelling at 5000 u/s, tested), materials (stone, bumper, metal), element-dependent physics, wall slams |
| 2. Elemental reaction foundation | **Done** | Data-driven engine: 31 reactions across all 7 categories, context variants, zone reactions, chains with depth, budget and cooldown limits, stirred and inert reporting, validator and cycle report |
| 3. Vertical slice | **Done, pending human playtest** | Two-room tutorial, the Cinder Marsh region (7 templates, 9 enemy types including 2 elites), the Crucible Warden (3 phases), run map, 23 upgrades, Codex, research tree, save and load, results → next-run loop. An automated browser playthrough completes tutorial → boss → results → Codex with zero console errors. |
| 4. Full core progression | **Partly started** | Present: 9 cores gated by research, reaction mastery, shells and socket slot, levels. Missing: more regions, more bosses, the signature-ability slot. |
| 5. Replayability and endgame | **Partly started** | Present: Daily Experiment (seeded, fixed core), Heat levels, Laboratory, procedural encounters. Missing: Boss Rush, Reaction Trials, Chaos Arena, Endless. |
| 6. Polish and optimization | **Partly started** | Present: auto quality scaling, reduced motion, high contrast, left-handed HUD, haptics, procedural audio. Missing: device testing, Capacitor packaging. |

## Balance snapshot

From `npm run sim -- 10 0.6` (10 seeded runs per core). The bot aims with noise and **never dodges telegraphs**, so treat the win rate as a relative measure between cores, not the difficulty a human will feel.

| Core | Bot win | Reactions/min | Discoveries/run |
| --- | --- | --- | --- |
| Ember | 80% | 38 | 14 |
| Tide | 80% | 44 | 17 |
| Storm | 60% | 72 | 18 |
| Frost | 50% | 27 | 20 |
| Iron | 80% | 68 | 19 |
| Venom | 90% | 48 | 16 |
| Gale | 60% | 50 | 22 |
| Stone | 40% | 37 | 18 |
| Prism | 80% | 99 | 17 |

Most bot deaths come from the boss's Crucible Slam, which a person can dodge. The median room lasts about 15–20 s for the bot. People aim more slowly, so expect about 45–90 s per room and a 10–15 minute run. That needs confirming with playtests.

Balance issues found and fixed through simulation:

- Toxic Combustion and Miasma fed each other (40% of all reactions). Fixed with longer cooldowns, and by making combustion leave flames instead of poison.
- Water on an ice sheet re-triggered Flash Freeze every tick. Water on poison zones kept re-spawning toxic pools. Fixed with zone-type conditions and the engine's self-respawn guard. Both have regression tests.
- Mastery tier 1 unlocked on the first use of a reaction. It now needs 3 distinct feats.

## Known limitations and technical debt

1. **Mid-run state is not saved.** Closing the app mid-run loses the current run, but discoveries, mastery and banked Essence are safe. Next step: serialize `Run` (seed, floor, upgrades, HP, catalysts, RNG positions) at each map screen.
2. **Only one region and one boss.** The region, template and boss data formats support more, but boss behaviour is code (`BossController`). A second boss should prompt a small behaviour-script format (attack patterns as data).
3. **No human playtest yet.** Feel, difficulty and onboarding clarity have only been checked with the bot, the automated browser playthrough and screenshots.
4. **Visuals are programmer art:** vector shapes, glyphs and particles. They are readable and consistent, but the art pass is still to come.
5. **Audio is synthesized placeholder.** The event → sound mapping and the adaptive intensity drone are in place for real assets to slot into.
6. **Reagent Lens research is purchasable but has no in-game effect yet.** It is planned to show enemy weaknesses while aiming. Implement it or hide it before release.
7. **Enemy-enemy collision is O(n²).** This is fine at the current counts (≤ 15). Add a spatial hash if Endless mode raises them.
8. **Accessibility** covers reduced motion, high contrast, a left-handed HUD, sensitivity and haptics. A colour-blind palette and screen-reader labels for the Codex matrix are still to do.

## Next milestones (in order)

1. **Human playtest round.** Five or more new players, using the structured questions from the brief (§19.3): control feel, reaction readability, first-discovery moment, build diversity, fairness. Instrument with the opt-in analytics export.
2. **Mid-run save and resume.**
3. **Reagent Lens**, plus the signature-ability slot (for example, a Steam Jet dash).
4. **Region 2: Frostvein Caverns.** Ice sheets as the default floor, brittle crystal terrain, resonance and reflection walls. It adds a second boss and new elites that recombine existing rules.
5. **Challenge modes:** Reaction Trials (handcrafted puzzle rooms solved with a named reaction), then Boss Rush and Chaos Arena.
6. **Capacitor wrap** for iOS and Android, device performance pass, store builds.
7. **Content expansion** into the inert pairs (fire+lightning → *Plasma*, water+wind → *Squall*, ice+metal → *Cold Weld*…). The validator's inert list is the backlog.
