# Design

## Identity

**Elements + Physics + Collision + Context = Emergent Gameplay.**

The ball is a slingshot projectile in a top-down arena, which works well one-handed in portrait. Every contact exchanges elements, and elements react on whatever holds them: the ball, an enemy, a pool, a cloud or an object. The same pair of elements behaves differently depending on:

- quantity: a trickle of fire on a lot of water only Quenches, while a balanced mix makes a Steam Burst;
- what holds it: in the ball, Steam Burst launches you forward; on an enemy it knocks the crowd back;
- impact speed: Shatter and Resonant Clang need a hard hit;
- target state: only a Frozen target shatters;
- environment: Flash Freeze needs a water pool, and a new magma pool next to water forges obsidian.

### Pillars → systems

| Pillar | Where it lives |
| --- | --- |
| Satisfying physics | Slingshot launch with trajectory preview, aim bullet-time, brake, element-dependent mass/drag/bounce, bumpers, wall slams that damage knocked-back enemies, hit-stop and shake |
| Discoverable chemistry | 31 data-driven reactions under consistent rules (below); stirred and inert feedback; Codex matrix |
| Meaningful progression | Research unlocks cores, slots, tools and modes rather than stats; mastery rewards variety |
| Player expression | 9 cores, 4 shells, 23 upgrades tagged by archetype, socket slot, hybrid options always offered |
| Emergent combat | Enemies carry elements and pick them up from sources and zones; enemy-on-enemy reactions happen (an imp wandering into a bloat's poison cloud explodes) |
| Respectful replayability | No energy, timers or paid randomness; discoveries and Essence can't be lost; failure explains itself |
| Expandable architecture | Content registry, validator, simulator, effect vocabulary |

## Elemental rules

The catalogue is written to follow a few rules a player can learn:

1. **Heat + wet makes steam.** The ratio decides whether it fizzles (Quench) or bursts (Steam Burst).
2. **Charge travels along wet or conductive holders.** Conductive Surge chains through wet targets, and a charged pool shocks everything in it.
3. **Cold + wet freezes. Frozen things are brittle, and a hard hit shatters them.**
4. **Earth grounds charge.** Grounded is a deliberate "useless" reaction, and it is the counter to Coil Sentinels.
5. **Wind spreads whatever it meets:** Inferno, Miasma, Blizzard.
6. **Arcane never acts alone.** It amplifies its partner through a wildcard reaction.
7. **Your own reactions never hurt you.** Only hostile zones, projectiles and telegraphed attacks deal damage to the ball.

The ball's elements change how it handles, as well as what it does to targets:

| Element | On the ball |
| --- | --- |
| Metal | ×1.8 mass, harder hits, heavier launches |
| Ice | Slick and bouncy |
| Wind | Light and fast |
| Water | Glides further |
| Lightning | Stronger launches |
| Earth | Sturdy and heavier |
| Fire | Slightly harder hits |

Each element's effect scales with the amount carried.

### Catalogue (vertical slice)

- **Base elements (9):** Fire, Water, Ice, Lightning, Metal, Earth, Wind, Poison, Arcane.
- **Compounds (3):** Steam, Mud, Magma.
- **Hidden:** Impact (`kinetic`).
- **Reactions (31), by category:**
  - Primary: Quench, Steam Burst, Melt, Freeze, Frost Shock, Magnetized Charge, Grounded, Searing Metal, Petrify, Toxic Combustion, Corrode, Contaminate.
  - Secondary: Thermal Shock, Storm Cloud, Grounded (mud).
  - Environmental: Flash Freeze, Electrified Pool, Toxic Spill, Magma, Mud.
  - Impact: Shatter, Resonant Clang, Spore Burst.
  - Chain: Conductive Surge, Blizzard, Inferno, Miasma.
  - Transformation: Ball Lightning, Ironstone.
  - Rare: Obsidian Forge, Arcane Overload.
- **Deliberately inert pairs** (a failed experiment still teaches something, and these are room for future content): fire+lightning, water+metal, water+wind, ice+metal, ice+earth, ice+poison, lightning+poison, metal+wind, earth+wind, earth+poison.

## Enemies teach one idea each

| Enemy | Teaches |
| --- | --- |
| Training Dummy | Launching; faster means more damage |
| Bog Slime (always wet) | Wet enemies conduct and freeze |
| Ember Imp (fire, ranged) | Fire rubs off and spreads; keep moving; steam blinds shooters |
| Iron Beetle (armored, metal) | Armor ignores impacts; heat or poison Exposes it |
| Frost Wisp (flying) | Flyers ignore floor zones |
| Spore Bloat (poison, bursts) | Enemies become hazards; poison near fire explodes |
| Coil Sentinel (rooted, charge) | Conductive chains; earth grounds bolts |
| Crystal Golem (elite, adaptive, brittle) | One-note builds get punished; brittle giants shatter |
| Magma Salamander (elite) | Hazard makers; water turns magma into cover |
| **The Crucible Warden** (boss) | Three phases change its aura (Metal → Fire → Lightning), its armor and its attacks. The arena provides a counter for each phase: a brazier to Expose the metal shell, fonts and pools against fire, a boulder to ground the charge, a barrel and a coil for combos. Attacks are telegraphed (slam rings, flask landing circles). No single hit can deal more than 8% of its HP. |

## Progression layers

| Layer | Earned by | Spent on / gives |
| --- | --- | --- |
| **Essence** ◆ | Kills (+15% per Heat level), room-clear bonus; banked every room | Ball research (shells, pips, reroll, socket), world research |
| **Research Fragments** ✦ | First discovery of each reaction (2–12), mastery tier-ups (+3), Research Caches (+4), level-ups | Element research (new cores), lab tools |
| **Catalysts** ⬡ | Rooms (+1, elites +2), Catalyst Harvest upgrade; run-only | Rerolls, Distill (3 → rare upgrade choice) |
| **Mastery Marks** ♛ | Beating the boss (1 + Heat) | Arcanology, Unstable Crucible (Heat) |
| **Player level** | XP from discoveries (20), mastery tiers (12), rooms (8), boss (80), kills (1) | Fragment and Essence grants, titles |
| **Reaction mastery** ★ | *Distinct feats* with that reaction: on an enemy, inside the ball, in a zone, on an object, in a chain, 3+ links deep, hitting 3+ targets, a kill, against a boss | +10/20/35% potency at 3/5/7 feats. Repeating the same feat earns nothing. |
| **Collection** | Codex matrix, bestiary, boss trophies per core, milestones | Long-term goals |

Research opens options rather than adding power:

- Elements: new cores, gated in a chain that ends at Arcanology.
- Ball: Shell slot, +1 pip, reroll, Catalyst Socket.
- Lab: the Laboratory sandbox, an annotated Codex (hints), Reagent Lens.
- World: Daily Experiment, Heat levels.

### Run structure (Cinder Marsh, 7 floors)

1. Skirmish, or the two tutorial rooms on the first run.
2. Floors 2–5 offer a choice of two room types among Skirmish, Research Cache, Elite (from floor 3) and Reliquary (from floor 4). There is always a fighting option.
3. Floor 6 is a choice between a Still Spring (heal, temper or distill) and a Reliquary.
4. Floor 7 is the Crucible Warden.

Encounters come from 7 handcrafted arena templates, randomly mirrored. Waves are filled from a floor-gated enemy pool by threat budget (`4 + 1.8·floor + 2·heat`). Spawns are placed away from objects in the upper arena, with a 0.8 s spawn telegraph during which enemies are intangible.

### Upgrade offers

Three distinct options, weighted by rarity and by synergy with your core element or existing tags. Maxed upgrades are never offered, and at least one element-agnostic option is always included so hybrid builds stay open. The card explains the synergy ("★ Matches your Fire core").

## Discovery UX

- **First sighting of an element:** a toast explaining it.
- **A reaction whose conditions failed:** "Something stirred between Fire and Ice…". The Codex cell turns yellow.
- **Two base elements that don't react:** the Codex cell marks the pair as tested and inert.
- **A new reaction:** 0.7 s slow-motion. The first five discoveries show a full card (formula, rule, "Try next", reward), queued if several arrive at once. Later discoveries show a non-blocking banner.
- **Research Caches** reveal the hint for one undiscovered reaction. *Annotated Codex* research reveals hints for every pair you have seen.
- **The Laboratory** is a no-death sandbox with every source you have seen, spawnable test enemies, and any seen element as your core. Discoveries made there count, but boss feats don't.

## Failure

The results screen shows:

- the cause, with specific advice (for example, "Slams are telegraphed by a red ring…");
- stats and rewards kept;
- the discoveries made, each with its follow-up tip;
- your most-used reactions;
- one concrete **next goal** computed from your profile, such as "3 Fragments to research Galvanics (Storm Core)".

## v0.4 additions

The reasoning and sources are in [RESEARCH.md](RESEARCH.md).

### The shot combo

- **What raises it:** every enemy hit, and every reaction while the ball keeps moving.
- **What ends it:** the ball resting for 0.6 s, or the ball being hurt.
- **Rewards:**
  - Kills give +2% Essence per combo step, up to +40%.
  - A combo of 3 or more pays `floor(n²/40)` Essence when it ends.
- **Combo Engine:** this upgrade and the Tempo aspect add damage per step.

### Regions

| Region | Elements | Boss (phases) | Unlock |
| --- | --- | --- | --- |
| The Cinder Marsh | Fire · Water · Poison | The Crucible Warden (Metal → Fire → Lightning) | start |
| The Frostvein Caverns | Ice · Water · Earth | The Rime Matriarch (Ice → Water → Wind). Uses ice novas, charges and wind flasks. | beat the Warden |
| The Storm Spire | Lightning · Metal · Arcane | The Tempest Engine (Lightning → Metal → Arcane). Uses storm flasks, novas and charges. | beat the Matriarch |

Each region tier adds +10% enemy HP and damage, and +1.5 to the encounter budget.

Bosses are data (`BOSSES`), each made of phases, attacks and an arena. Every attack is telegraphed:

- **Slam:** a ring with a countdown arc.
- **Flask:** the landing circle is marked.
- **Nova:** a charging ring, followed by radial bolts.
- **Charge:** a lane marked with chevrons.

### New enemies (each still teaches one idea)

| Enemy | Teaches |
| --- | --- |
| Rime Hound (fast, carries ice) | Soak a cold foe with water and it freezes solid; then shatter it. |
| Mire Crawler (earth, armored, grounded) | Earth grounds lightning. Heat turns it to magma, water to mud. |
| Storm Kite (flying, charged shooter) | Lightning jumps to flyers through wet allies. |
| Prism Mote (arcane shooter) | Arcane amplifies whatever you bring. |
| Rime Knight (elite) | An armored knight goes down to freeze, then a hard hit. |
| Storm Conductor (elite, adaptive) | Ground it, and keep varying your elements. |

### Affixes

- **Who gets them:**
  - Elites from floor 5, from region tier 1, or in endless mode.
  - One extra affix at Heat 4.
  - Ordinary foes sometimes at Heat 7 and in endless mode.
- **The affixes:**
  - **Shielded:** a ward equal to 35% of HP.
  - **Swift:** +40% speed.
  - **Volatile:** a telegraphed blast 0.9 s after death.
  - **Regenerating:** heals 3% per second after 2 s untouched.
  - **Insulated:** immune to your core element.
  - **Enraged:** +35% damage.

### Heat ladder (cumulative)

| Level | Rule |
| --- | --- |
| 1 | More enemies |
| 2 | −10 max HP |
| 3 | +15% enemy HP |
| 4 | Elite affix |
| 5 | +15% enemy speed |
| 6 | Less healing |
| 7 | Affixes on ordinary foes |
| 8 | Bosses +25% HP and faster |
| 9 | Pips recharge 15% slower |
| 10 | +25% enemy damage |

- **Rewards:** +15% Essence per level, and +⌊Heat/2⌋ Mastery Marks on a win.
- **Records:** the best Heat is kept per core.

### Run economy and rooms

| Room | Contents |
| --- | --- |
| Merchant | Upgrades priced in Catalysts (common 2 / uncommon 3 / rare 5 / evolution 8). A remedy heals 30% HP for 2. |
| Anomaly | 8 events with clear costs, e.g. "lose 15 HP, gain 8 Fragments and 2 Catalysts". |

- **Room challenges** pay 2–3 Catalysts plus Essence.
- **Pity:** a rare upgrade is guaranteed after 3 offers without one.
- **Banish:** 2 per run, from research.
- **Evolutions:** offered whenever every ingredient is held at max stacks. Reliquaries and elite rewards always include one if available.

### Meta layers

| Layer | Earned by | Gives |
| --- | --- | --- |
| Core mastery (Lv 1–10 per core) | Rooms, kills, discoveries, bosses, Heat | Aspects at Lv 3 and 6, +1 reroll at Lv 5, Essence, Fragments, a gilded skin at Lv 10 |
| Feats (46) | Behaviours: bank shots, ×10 combos, 4-deep chains, untouched rooms, Heat wins, Codex milestones… | New upgrades in the run pool, cosmetics, currencies |
| Contracts (3 slots) | Targeted goals | Essence or Fragments, claimed by hand. One free swap per day. No expiry. |
| Cosmetics | Player levels, feats, core level 10 | Trails and skins. They never change stats. |
| Abyssal Descent | Research (Marks + Essence) | Endless region loops: each loop adds +22% enemy HP and +12% damage. Best-depth record, and Marks per boss. |
| Assist mode | Setting | 20% damage resistance, +2% per defeat, capped at 60%. |
