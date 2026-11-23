# Alchemy Ball design research

## The Observatory update

The research reviewed official game descriptions, developer talks and patch notes, platform accessibility guidance, and a study of player motivation. It covered physics games, elemental combat, and replayable progression from studios and authors in Japan, China, Finland, France, Canada, Italy, and the US. The comparisons informed design choices for Alchemy Ball's real-time arena combat.

### Shot readability and combat feel

| Reference | Finding | Application in Alchemy Ball |
| --- | --- | --- |
| Red Nexus Games, Canada, and Wonderbelly Games, US | Peglin and Roundguard combine physics shots with run builds and encounter variety. Their shot decisions start with a visible target and a learnable physical rule. | The aim guide estimates travel against drag and restitution, marks the likely contact, and stops when the predicted shot falls below useful impact speed. Keyboard aiming uses the same preview and launch as drag. [Peglin developer listing](https://store.steampowered.com/app/1296610/Peglin/), [Wonderbelly Games](https://www.wonderbellygames.com/) |
| Aladdin X, Japan, and Gabriele Cirulli, Italy | Suika Game and 2048 apply a predictable collision rule that players can repeat and plan around. Suika's alternate modes change the pressure around that rule. | Each Trial states its trade-off during preparation and on the route screen. The standard launch and reaction rules stay familiar across trials. [Suika Game rules](https://suikagame.jp/about/), [Original 2048](https://classic.play2048.co/) |
| HoYoverse, China, and Nolla Games, Finland | Elemental interactions can be the tactical decision itself. HoYoverse describes designing encounters around reactions, and Noita shows how familiar substances can combine into different physical outcomes. | Pulse uses Alchemy Ball's existing reaction engine. Its effect depends on the chosen core and what enemies are already carrying. The Archive provides reagents and enemy auras that support several counters. [HoYoverse developer discussion](https://genshin.hoyoverse.com/en/news/detail/124539), [Noita](https://www.noitagame.com/) |
| Enhance, Japan and US | Tetris Effect's Zone is a player-timed resource with both defensive and scoring uses. The audiovisual feedback makes the state change clear. | Players can spend Resonance to answer an incoming volley or wait to spread their core element to several foes. Readiness has a text and audio cue, and the cast has a distinct ring, chime, and haptic pattern. [Tetris Effect: Connected](https://www.tetriseffect.game/connected/) |
| Martin Jonasson and Petri Purho, Sweden and Finland | Their GDC demonstration shows how small, layered feedback changes can make the same mechanic feel more responsive. | Launch effects, hit effects, and Resonance use different visual and audio signatures. The orb interpolates between fixed simulation steps to reduce visible stepping on high-refresh displays. [Juice It or Lose It](https://www.gdcvault.com/play/1016789/Juice-It-or-Lose) |
| Kenny Sun and team, US | The Ball x Pit developer documents sound design around dense, repeated impacts. The game also uses ball combinations and expanded post-clear goals to sustain experimentation. | Resonance sounds once on readiness and once on discharge. The Archive mixes pressures and reactions in four layouts, and the Trials give a reason to take those layouts on with different builds. [Sound design by Kenny Sun](https://kennysun.com/game-dev/the-sound-design-of-ball-x-pit/), [Devolver's Regal Update](https://www.devolverdigital.com/propaganda/new-characters-new-balls-a-new-mode-and-more) |

A launch preview is an estimate for the current board. It accounts for drag and bounce losses. Moving enemies, floor currents, and aura changes can alter the actual path. In particular, the reagent lens withholds an enemy reaction forecast after an intervening object that could change the ball's chemistry.

### Progression and accessibility

- **Give difficulty a purpose.** Supergiant's Pact adds challenge through rules and its aspects create alternate ways to play. Alchemy Ball uses its existing Heat ladder for escalating difficulty and introduces four distinct Trial rules. Medal thresholds give players concrete targets for their favorite core. Collection rewards give them reasons to try unfamiliar loadouts. [Supergiant's Hades update notes](https://www.supergiantgames.com/blog/hades-updates/)
- **Give the first clear and the fiftieth clear different jobs.** The first clear of a region points to the next boss. Each subsequent Trial clear improves a record for one core and region. Four trials, four regions, nine cores and three tiers produce up to 432 medals. The four cosmetics unlock after nine medals each, so collecting every medal is a separate completion goal. The use of named tiers and different build routes reflects research linking perceived competence and autonomy with enjoyment and preference. [Ryan, Rigby and Przybylski](https://selfdeterminationtheory.org/SDT/documents/2006_RyanRigbyPrzybylski_MandE.pdf)
- **Make seeded modes predictable.** Mega Crit's GDC slides explain why a Daily Climb uses the same seed and choices. A new Alchemy Ball daily uses a fixed initial loadout and pool, and a resumed run keeps its start date. Personal scores remain local and accessibility settings can still differ. [Casey Yano's Slay the Spire GDC slides](https://media.gdcvault.com/gdc2019/presentations/Yano_Casey_SlayTheSpire.pdf)
- **Give players multiple input and feedback channels.** Motion Twin's Breaking Barriers walkthrough and Microsoft's guidelines cover option-specific assistance, alternative inputs, and combining visual cues with other signals. Alchemy Ball's charge readout stays visible during play, combat supports single-key actions, core and shell selection uses native buttons, and the Codex grid supports arrow navigation. Reduced motion suppresses decorative movement and strong flashes. [Motion Twin's accessibility walkthrough](https://www.youtube.com/watch?v=joDnuQaGXsg), [Xbox Accessibility Guidelines](https://learn.microsoft.com/en-us/xbox/accessibility/guidelines)

### What the evidence can establish

The external references support design hypotheses about clarity, agency, and variety. Project checks cover deterministic combat, content integrity, save persistence, and browser input and layout. A scripted player can expose softlocks, timer problems, or runaway reaction chains. Human playtesting is still needed to measure first-session comprehension, boss difficulty, and whether players keep returning to Trials.

The baseline simulation completed 90 Cinder Marsh runs, won 80, and encountered all 31 reactions. A separate Archive sweep ran each Trial with Ember, Tide, and Storm at Heat 0 and 7 across four seeds (`1337 + 31 × n`, `n = 0–3`). The scripted player won 10 of 48 at Heat 0 and 1 of 48 at Heat 7. These runs help identify where to focus balance playtests. The bot selects mostly direct shots and samples builds without planning, which matters for rules designed around bank shots, reaction setups, and selective use of Resonance.

### Art prompts

Both plates were generated with the built-in image tool and compressed as WebP for the game.

<details>
<summary>Observatory and Umbral Archive prompts</summary>

**Observatory**

> Use case: stylized-concept. Create the original key art for the playable home screen of Alchemy Ball, an elemental physics roguelite. Wide landscape artwork, cinematic 3:2 or wider. An ancient alchemist's observatory overlooking a rugged, foggy alpine valley at dusk. On the right half, a huge glowing translucent amber glass sphere with a swirling molten star inside, suspended within several fine engraved brass armillary rings and mounted atop a substantial weathered stone plinth. Turquoise alchemical light and faint violet nebular mist around the apparatus; rays through the open columns on the right. Atmospheric dark forest teal, midnight green, brushed bronze, warm amber accents. Premium painted game environment concept art, tactile weathered materials, strong artistic silhouette and a clear single point of interest. Composition deliberately keeps left 40 percent dark and quiet for white game title and buttons that will be overlaid in code; orb centered around 69% horizontally and 47% vertically with room around it for mobile cropping. Dark edges and foreground fade into near-black. No text, characters, watermarks, type, UI, or frames.

**Umbral Archive**

> Use case: stylized-concept. Wide cinematic environment key art for The Umbral Archive, an original late-game region in the dark fantasy elemental roguelite Alchemy Ball. Ancient subterranean library and astronomical engine, an enormous eclipsed violet luminous disc behind a Gothic vault, lined with dark obsidian columns, bronze astronomical instrument fragments, green luminescent vapors drifting across stepped marble. Broad view with strong silhouette, readable bright violet focal point in center-right, misty teal-green highlights in the lower third, warm bronze minute accents. Tactile painted game environment, cinematic depth, distinct violet glass and mineral surfaces. The image must read clearly when cropped into small 16:9 menu cards; keep the primary disc within the middle 60 percent of the frame. No text, people, logos, type, watermarks, UI or frames.

</details>

## Prior research for v0.4

This document summarises the research behind the v0.4 overhaul. Two questions were investigated, using GDC talks, developer postmortems, design analyses, academic papers and player discussions:

1. Game feel, visuals and UI/UX for mobile physics roguelites.
2. Progression systems that keep a roguelite enjoyable for 100+ hours.

Reference games: Peglin, Ball x Pit, Balatro, Hades and Hades II, Slay the Spire, Vampire Survivors, Dead Cells, Brotato, Roundguard, Magicka, Noita, Genshin Impact, Isaac, Risk of Rain 2, Monster Train, Angry Birds and pool games.

Each finding below is paired with how Alchemy Ball now uses it. Some of the numbers are common practice that could not be tied to a primary source; those are marked *(rule)*. Treat every number as a starting point and tune it on a real phone.

---

## Part 1: Game feel, visuals and UI/UX

### Launch and physics feel

| Finding | Source | In Alchemy Ball |
|---|---|---|
| Pulling back to fire keeps the finger off the aim. A drag that can start anywhere suits one-handed play. A dead zone stops taps from firing, and dragging back into it cancels the shot. | [gamedev.net](https://gamedev.net/forums/topic/715283-aiming-feature-like-angry-bird/5460529/), *(rule)* | A floating anchor with a rubber band to the finger. Dragging back into the 14px dead zone cancels the shot instead of braking. |
| The trajectory preview must match real collisions. Show the first bounce in full and later bounces faded. Pool games draw a ghost ball at the contact point. | [ghost-ball aiming](https://www.engr.colostate.edu/~dga/pool/ghost-ball/), [Construct](https://www.construct.net/en/forum/construct-2/how-do-i-18/predictive-trajectory-line-78234) | `predictShot()` traces walls (offset by the ball radius), reflects off objects, and stops at the first enemy. It draws marching dots, faded later segments, a ghost ball, and an arrow showing where the struck foe will be pushed. |
| Pull-back feedback: squash the ball along the pull, show a three-tier power ring with ticks, and play a tone that rises with tension. | design analyses, *(rule)* | The ball squashes while aiming. The power ring has ticks at 0.4, 0.7 and 0.95 that change colour, with a click and a haptic pulse at each. The aim tone (`Audio.aim`) follows power. |
| Squash and stretch along velocity should preserve area: `sx = 1+s`, `sy = 1/(1+s)`, with s capped. | [velocity skinning](https://arxiv.org/pdf/2104.04934) | The ball stretches with speed, with s capped at 0.3. |
| Hit-stop of roughly 30ms for a hit, 60–80ms for a crit or reaction, and 120–150ms for a kill. Take the maximum rather than the sum. Freeze only the simulation. | [SmashWiki hitlag](https://ssbwiki.com/Hitlag), [Lin et al. 2022](https://arxiv.org/abs/2208.06155) | Hit-stop is weighted by event in `Fx.stop()`. A budget caps it at 150ms per second so chain reactions never feel like a freeze. UI and particles keep running. |
| Trauma-based screen shake: offset is `trauma²` driven by smooth noise, with a small rotation and a directional kick. Offer a slider. | [Eiserloh, GDC 2016](https://gdcvault.com/play/1023146/Math-for-Game-Programmers-Juicing), [Brotato accessibility](https://www.ludo.guide/guide/brotato/getting-started/controls-keybindings/accessibility-options) | The camera uses trauma², sine noise and up to 2° of rotation. A kick recoils along the impact normal and springs back. There are sliders for shake and flash. |
| A Peggle-style finale: slow motion plus a zoom on the last enemy or a boss kill. | [Peggle](https://wikipedia.com/wiki/Peggle) | Clearing a room triggers about 0.55s of slow motion and a zoom punch. Boss kills get a larger zoom and a flash. |
| Roundguard fudged its physics toward what players expect, and players needed a focused tutorial. | [Game Developer: Roundguard](https://gamedeveloper.com/design/the-design-of-i-peggle-i--like-dungeon-crawler-i-roundguard-i-) | Impacts now require the ball itself to be driving into the target, so an enemy ramming a resting ball doesn't count as your hit. The tutorial coach text was extended. |

### Impact feedback ("juice")

| Finding | Source | In Alchemy Ball |
|---|---|---|
| Layer feedback, and leave lasting marks. | [Vlambeer, *The Art of Screenshake*](https://gamedeveloper.com/design/vlambeer-co-founder-shares-advice-on-building-better-action-games) | A decal layer keeps scorch, frost cracks, splashes, impact cracks and kill glows on the floor for about 15s. |
| Damage numbers should pop (0 → 1.35 → 1), have an outline, and merge when they land on the same target. Crits should be bigger and gold. | [vberai checklist](https://blog.vberai.com/blog/game-ui-floating-damage-numbers-handoff-2026) | `Fx.damage()` merges hits on a target within 300ms into one growing number. Crits get a starburst and a "!". |
| Balatro, Peglin and Vampire Survivors make numbers satisfying through sequential count-ups with rising pitch, and fixed colours per kind of value. | [GMTK](https://gmtk.substack.com/p/balatros-cursed-design-problem), [Crosley](https://blakecrosley.com/guides/design/balatro), [PC Gamer](https://www.pcgamer.com/games/localthunk-gave-up-making-balatro-for-3-months-but-resumed-because-i-was-bored-but-the-internet-was-out-so-i-couldnt-play-rocket-league/) | **The shot combo**: hits and reactions while the ball keeps moving raise a ×N meter. It has tier names and colours, pops on each step, climbs a pentatonic note ladder, and pays Essence when the combo ends. Results screens count up with ticking sounds. |
| Give kills shards, a light pulse and pickups that fly away. | [Kotaku on Vampire Survivors](https://kotaku.com/vampire-crawlers-survivors-garlic-poe-decks-chests-sponge-2000689719) | Kills release elemental shards and rising essence motes, add hit-stop weighted for elites and bosses, and leave a floor glow. |

### Readable elemental reactions

| Finding | Source | In Alchemy Ball |
|---|---|---|
| Genshin shows each applied element as an icon on the enemy, and names the reaction just before the damage. | [KQM](https://library.keqingmains.com/evidence/combat-mechanics/enemy-mechanics/enemy-elemental-gauge) | Element badges with a drain ring appear above enemies. Reaction names pop in a gradient of the two input colours, labelled "CHAIN ×n" or "n TARGETS". |
| Magicka players couldn't tell which combinations had happened until a spell bar made them visible. | [Slow Rush devlog](https://slowrush-com.pages.dev/news/spellbar) | The **Reagent Lens** research now works: while aiming, it names the reaction your shot will cause, or shows "?" for one you haven't discovered. |
| Never use colour alone; pair it with shape. | [Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/ensure-no-essential-information-is-conveyed-by-a-fixed-colour-alone/), [Xbox XAG 103](https://devdocs.xbox.com/gaming/accessibility/xbox-accessibility-guidelines/103) | `elementShape()` gives each element a distinct silhouette: flame, drop, snowflake, bolt, hexagon, block, swirl, spores and star. These are used for ball orbit chips and enemy badges. An optional setting shows badges for every aura. |

### Rendering on mobile Canvas 2D

| Finding | Source | In Alchemy Ball |
|---|---|---|
| Pre-render glows into sprites, avoid `shadowBlur`, use `alpha:false`, and cache static layers. | [MDN: Optimizing canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas), [web.dev](https://web.dev/articles/canvas-performance) | `glow()` draws cached 128px sprites. `shadowBlur` is gone from the renderer. The vignette and region floors are cached. The decal layer renders at half resolution. Median draw time in the review harness is about 0.4ms. |
| Give each region its own look. | — | Each region has its own palette, light colour and motes (snow falls in the Frostvein Caverns), and its own floor motif: moss, hoarfrost veins, or copper conduits. |

### UI and UX

| Finding | Source | In Alchemy Ball |
|---|---|---|
| Keep information at the top, controls in the bottom third, and touch targets at 44–48px or larger. | [Smashing / Hoober](https://www.smashingmagazine.com/2016/09/the-thumb-zone-designing-for-mobile-users) | During play, toasts are compact and sit at the bottom. The combo meter and reaction feed sit on opposite sides, and the left-handed setting mirrors them. |
| A Slay the Spire-style map: drawn bottom to top, reachable nodes pulse, the path taken is inked, and icons are readable. | [branching DAG notes](https://saschb2b.github.io/game-mechanics/concepts/branching-dag-map) | There is a vertical node map with the whole region revealed. The current floor pulses, taken rooms are inked in gold, and each room type has its own colour. |
| Upgrade cards: deal them with a stagger, use rarity frames with a foil sweep on rare cards, and add a tactile pick. | [Hades boon rarity](https://www.dbltap.com/posts/hades-boon-rarity-guide-to-standard-and-special-boons-01ek30qqebzt), [Crosley](https://blakecrosley.com/guides/design/balatro) | Cards deal in at 90ms intervals with a 3D tilt. Common, Uncommon, Rare and Evolution each have their own frame, the higher rarities get a foil sweep, and picking a card plays a "chosen" pop. |
| Motion timing: micro-interactions 100–200ms, screens 300–500ms, overshoot easing. Respect reduced motion. | [Emil Kowalski standards](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/review-animations/STANDARDS.md) | Screens enter with a staggered rise, and an overshoot curve is defined as a CSS variable. The `.rm` class and the OS preference turn off all decorative motion. |
| Assist mode, like Hades' God Mode: damage resistance that grows with each defeat. | [Inverse](https://inverse.com/gaming/hades-god-mode-interview) | **Assist mode** in Settings: 20% damage resistance plus 2% per defeat, capped at 60%. No penalties. |

### Audio

| Finding | Source | In Alchemy Ball |
|---|---|---|
| Vary pitch slightly, cap voices per sound, pan by position, and layer impacts from a transient, a body and a tail. | [Kenny Sun: the sound design of Ball x Pit](https://kennysun.com/game-dev/the-sound-design-of-ball-x-pit/), [web.dev](https://web.dev/articles/webaudio-games) | The synth was rewritten: ±3% detune, about 3 voices per category with a 40–100ms cooldown, stereo pan by x position, and a different element tail for each reaction. |
| Adaptive music built from vertical layers, scheduled ahead of time. | [GDC 2021: vertical layering](https://www.gamedeveloper.com/game-platforms/pure-vertical-layering-for-game-music-composers-from-spyder-to-sackboy-gdc-2021-) | A lookahead sequencer runs scenes (menu, map, combat, boss, results) with a key and tempo per region. Layers fade in with combat intensity, and the music ducks on big events. |

---

## Part 2: Long-term progression

### Principles

- **Horizontal over vertical.** Players dislike meta-progression that only adds stats, because it blurs their sense of their own skill. [Game Developer](https://gamedeveloper.com/design/the-fundamentals-of-game-progression), [GCORES](https://www.gcores.com/articles/217944)
  - Research and unlocks still add *options*, not power.
- **Unlocks act as a slow tutorial and an unlock cascade.** Isaac's "it keeps unfolding" ([GamesRadar](https://gamesradar.com/i-did-make-it-so-it-goes-forever-edmund-mcmillen-binding-of-isaac)) and Balatro's checklist ([GamesRadar](https://www.gamesradar.com/exploring-balatros-hype-its-ingenious-twists-on-poker-and-its-mysterious-creator)).
  - 46 feats, most of which unlock a new upgrade or cosmetic.
- **Goal gradient.** People speed up as a reward gets closer. [Kivetz, Urminsky & Zheng 2006](https://business.columbia.edu/sites/default/files-efs/pubfiles/1200/goalgradient.pdf)
  - The results screen shows the closest goals as progress bars: next level, next core level, the nearest feat, and the Codex.
- **Self-Determination Theory: competence, autonomy and relatedness.** [Ryan, Rigby & Przybylski 2006](https://link.springer.com/content/pdf/10.1007%2Fs11031-006-9051-8.pdf)
  - **Competence:** mastery tiers, Heat records and combos.
  - **Autonomy:** choice of region, aspect and Heat; banish, reroll and route choices.
- **Mobile sessions.** The median session is 5–6 minutes. [GameAnalytics 2025](https://gamedevreports.substack.com/p/gameanalytics-mobile-gaming-benchmarks)
  - Runs now **save between rooms and can be resumed**.
- **At most three persistent currencies, each with one job.**
  - Still Essence (spend), Fragments (knowledge) and Marks (prestige). Catalysts stay run-only.
  - Marks gained new sinks: Magnum Opus and the Abyssal Descent.

### Systems added

| System | Inspiration | Implementation |
|---|---|---|
| **Heat ladder 1–10**, cumulative, with a record per core | StS Ascension (20), Peglin Cruciball, Hades Pact ([Kotaku](https://kotaku.com/everything-you-need-to-know-about-hades-endgame-1845239105)) | 10 named rungs, as data in `HEAT_LEVELS`: more enemies, less HP, +15% enemy HP, elite affixes, faster foes, less healing, affixes on ordinary foes, tougher bosses, slower pips, +25% damage. Rewards are +15% Essence per level and extra Marks. The best Heat is shown on each core card. |
| **Evolutions** (fusions) | VS evolutions ([PC Gamer](https://pcgamer.com/vampire-survivors-evolve-weapons-evolutions-guide)), Ball x Pit fusion ([Destructoid](https://www.destructoid.com/ball-x-pit-review/)) | 8 legendary upgrades, each fusing two maxed upgrades, e.g. Wildfire + Volatile Remains → Phoenix Engine. They appear in Reliquaries and elite rewards once the *Magnum Opus* research is bought. Ingredient cards are flagged "Ingredient for …". |
| **Upgrade pool 23 → 51** | the research recommends 60 | 28 new upgrades: ricochet, combo, crit, execute, thorns, launch and brake novas, elemental wake, per-element damage, Glass Cannon, and others. |
| **Offer tools** | Hades boon design | Pity (a rare is guaranteed after 3 offers without one), banish (research), a second reroll, and synergy explanations. |
| **Feats → unlocks** | Isaac, VS arcana | `game/feats.ts`: 46 feats in 5 categories, each with progress, rewards and visible unlocks. Feats are checked live during play. |
| **Contracts** | Hades Fated List | 3 slots, no timers, claimed by hand, one free swap per day (`game/contracts.ts`). |
| **Core mastery and aspects** | Hades weapon aspects | Every core earns XP and has 10 levels. Levels 3 and 6 unlock 2 alternative aspects per core (18 in total); other levels give rerolls, Essence, Fragments and a gilded skin. |
| **Regions and bosses** | region and boss rotation | The Frostvein Caverns (Rime Matriarch) and the Storm Spire (Tempest Engine) join the Cinder Marsh. Each new region unlocks by beating the previous boss. Bosses are now data: phases, novas, charges, flasks and an arena. 6 new enemies. |
| **Affixes** | Brotato and Diablo-style elites | Shielded, Swift, Volatile, Regenerating, Insulated (immune to your core element, so you must borrow another) and Enraged. |
| **Room challenges** | optional objectives | Each combat room offers a bonus objective: reactions, a combo, no damage, a 3-deep chain, reaction kills, bank shots, or speed. The reward is Catalysts and Essence. |
| **Anomalies and the Merchant** | StS events and shops | 8 text events with deterministic bargains, and a Catalyst shop. Both are unlocked by research. |
| **The Abyssal Descent** (endless) | the research's "Distillation" endless proposal | Loops through every unlocked region, getting harder each time. A best-floor record is kept, and each boss beaten pays Marks. |
| **Daily mutators** | Spelunky daily, Balatro decks | 8 rule changes (Glass Cannon, Volatile World, Warded Foes and others), the same for everyone each day. |
| **Cosmetics, as rewards only** | research recommendation | 9 trails (ribbon, sparks, rainbow, flame, void) and 7 ball skins, earned through levels, feats and core mastery. They never change stats. |
| **Session safety** | Mobile Safari can evict storage | `navigator.storage.persist()`, plus save backup and restore in Settings. |

### Expected arc

| Stage | What the player is doing |
|---|---|
| Runs 1–5 | Tutorial, first discoveries, first contracts and the first feat unlocks. The research recommends a first boss win by about run 3–6. |
| Runs 5–20 | Element cores via research, the first aspects, the Frostvein Caverns, Heat 1–3, first Evolutions. |
| Runs 20–60 | The Storm Spire, all aspects, Heat 4–6, the Codex well past half, the Abyssal Descent. |
| 60+ | Heat 10 with every core (a 9 × 10 grid of records), boss trophy seals (3 × 9), every Evolution, the deepest Descent, every cosmetic, and daily streaks. |

## Not yet done (research items still open)

- Human playtests on real devices, especially for control feel, readability and balance at high Heat.
- A colour-blind *palette* switch. Shape badges exist today.
- Three-element and secret reactions (a late-game discovery layer, in the spirit of Magicka).
- Boss Rush and handcrafted Challenge runs.
- A narrative drip: journal entries delivered by weighted conditional triggers, in the Hades style.
