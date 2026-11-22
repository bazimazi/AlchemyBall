# Roadmap and status

Last updated: 2026-11-20 (v0.4.0). The research behind v0.4 is in [RESEARCH.md](RESEARCH.md).

## Phase status

| Phase | Status | Evidence |
| --- | --- | --- |
| 1. Core physics prototype | **Done** | Slingshot launch with a floating anchor, cancel zone and multi-bounce preview. Brake, bullet-time aim, substepped collisions (no tunnelling at 5000 u/s, tested), materials, element-dependent physics, wall slams. |
| 2. Elemental reaction foundation | **Done** | Data-driven engine: 31 reactions, context variants, zone reactions, bounded chains, stirred and inert reporting, validator. |
| 3. Vertical slice | **Done, pending human playtest** | Tutorial, region, boss, map, upgrades, Codex, research, save and resume. The automated browser playthrough goes from a fresh save through the tutorial and the boss to results and the Codex with zero console errors. |
| 4. Full core progression | **Done** | 9 cores with mastery levels and 2 unlockable aspects each. 3 regions and 3 data-driven bosses. 51 upgrades including 8 Evolutions. 46 feats, an unlock cascade, contracts and cosmetics. |
| 5. Replayability and endgame | **Mostly done** | A 10-rung Heat ladder with records per core, the Abyssal Descent (endless), daily mutators, elite and Heat affixes, room challenges, Anomaly and Merchant rooms. Missing: Boss Rush and handcrafted Challenge runs. |
| 6. Polish and optimization | **Largely done** | Trauma-based camera, weighted hit-stop, decals, a combo system, cached glows, adaptive per-region music, a sound redesign, an accessibility pack (shake and flash sliders, shape badges, assist mode), and save backup and restore. Missing: physical-device testing and Capacitor packaging. |

## v0.4 at a glance

- **Feel:**
  - trauma² shake with rotation and a directional kick;
  - zoom punches and a Peggle-style clear finale;
  - hit-stop weighted by event, with a 150 ms/s budget;
  - squash and stretch;
  - merged pop-in damage numbers;
  - gradient reaction titles with chain and target tags;
  - floor decals;
  - the shot combo, with tier names and pentatonic audio.
- **Aiming:**
  - a rubber-band anchor;
  - a three-tier power ring;
  - `predictShot()` traces walls and objects to the first enemy, then draws a ghost ball and a push arrow;
  - the Reagent Lens now works.
- **UI:**
  - a new hub with contracts, modes and a level ring;
  - region and aspect selection, and the Heat ladder;
  - a node map with the route revealed;
  - dealt rarity cards with foil, banish and pity;
  - Merchant and Anomaly screens;
  - animated results with goal-gradient bars;
  - Feats, Wardrobe and boss trophy grid screens;
  - an in-game confirm dialog;
  - compact combat toasts;
  - a boss intro card and wave/clear banners.
- **Content:**
  - the Frostvein Caverns and the Storm Spire;
  - the Rime Matriarch and the Tempest Engine;
  - Rime Hound, Mire Crawler, Storm Kite, Prism Mote, Rime Knight and Storm Conductor;
  - affixes;
  - 28 new upgrades;
  - 18 aspects;
  - 8 anomalies;
  - 8 daily mutators.
- **Persistence:**
  - save v3 (migrated from v2);
  - mid-run save and resume;
  - `navigator.storage.persist()`;
  - clipboard backup and restore.

## Balance snapshot

From `npm run sim -- 8 0.6` (8 seeded runs per core in the Cinder Marsh). The bot aims with noise and **never dodges telegraphs**, so treat the win rate as a relative measure between cores, not the difficulty a person will feel.

| Core | Bot win | Reactions/min | Discoveries/run |
| --- | --- | --- | --- |
| Ember | 100% | 40 | 16 |
| Tide | 63% | 44 | 17 |
| Storm | 88% | 73 | 17 |
| Frost | 50% | 36 | 20 |
| Iron | 100% | 63 | 18 |
| Venom | 38% | 49 | 16 |
| Gale | 75% | 49 | 21 |
| Stone | 63% | 31 | 18 |
| Prism | 88% | 116 | 17 |

The new regions add enemy HP and damage per tier (+10% each) and a larger encounter budget. The soak tests run every region and boss across several cores, plus an endless descent past the first boss. They check stability (bounded reactions per step, finite state). They are not a measure of difficulty.

## Known limitations and technical debt

1. **No human playtest yet.** Feel, difficulty at high Heat, the region-tier scaling and onboarding clarity have only been checked with the bot, the automated browser playthrough and screenshots. This is the top priority.
2. **Mid-run resume restarts the room in progress.** The run is saved at the map, so closing the app during a fight returns you to the map before that room, with the same room choices.
3. **Venom and Frost cores trail the others** in bot win rate. A human dodges, so confirm this with playtests before buffing either.
4. **Enemy-enemy collision is O(n²).** This is fine at the current counts (the encounter budget is capped at 26 threat). Add a spatial hash if endless depths raise it.
5. **Accessibility:** shape-coded element badges exist, but there is no full colour-blind palette switch. The Codex matrix still has no screen-reader labels.
6. **Paused frames differ by a few pixels** in headless Chrome (rasteriser noise). The visual review now tolerates up to 0.05% of pixels instead of requiring byte-identical frames. A frame that is still shaking shifts the whole arena, so the check still catches that.

## Next milestones (in order)

1. **Human playtest round.** Five or more new players. Instrument with the opt-in analytics export.
2. **Boss Rush and Challenge runs** (12 fixed-rule experiments that pay cosmetics).
3. **Secret and three-element reactions** as an endgame discovery layer, plus a colour-blind palette.
4. **Narrative drip**: journal entries triggered by weighted conditions.
5. **Capacitor wrap** for iOS and Android, a device performance pass, and store builds.
6. **Content expansion** into the inert pairs (fire+lightning → *Plasma*, water+wind → *Squall*, ice+metal → *Cold Weld*…). The validator's inert list is the backlog.
