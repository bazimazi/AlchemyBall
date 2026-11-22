import { aspectsFor, Content, MAX_HEAT } from '../content';
import type { UpgradeDef } from '../content/types';
import { Audio, Haptics } from '../audio/audio';
import { hashString } from '../core/rng';
import { ANOMALIES } from '../game/anomalies';
import { Analytics } from '../game/analytics';
import { claimContract, contractDone, ensureContracts, swapContract } from '../game/contracts';
import { checkFeats, FEATS, featRewardText, featUnlocks } from '../game/feats';
import {
  assistResistance, buyResearch, canAfford, coreRecord, createSaveSlot, SAVE_KEY, SAVE_VERSION, freshProfile, nextLevel, researchState, unlockedCores, unlockedIds,
  unlockedRegions, unlockedShells, type Profile,
} from '../game/profile';
import { finishRun, type RunSummary } from '../game/rewards';
import { dailyKey, dailyMutator, dailySeed, labEncounter, MUTATORS, ROOM_INFO, Run, type RoomType } from '../game/run';
import type { SaveSlot } from '../game/save';
import { Fx } from '../render/fx';
import { Renderer } from '../render/renderer';
import { renderCodex } from './codex';
import { confirmDialog, countUp, h, toast } from './dom';
import { Session, type SessionEnd } from './session';

const RARITY_LABEL = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', legendary: 'Evolution' };
const PRICE = { common: 2, uncommon: 3, rare: 5, legendary: 8 };

/** Top-level application: owns persistence, presentation services, screen flow and the frame loop. */
export class App {
  readonly root: HTMLElement;
  readonly renderer: Renderer;
  readonly fx = new Fx();
  readonly audio = new Audio();
  readonly haptics = new Haptics();
  readonly analytics: Analytics;
  readonly slot: SaveSlot<Profile>;
  profile: Profile;
  session: Session | null = null;
  run: Run | null = null;
  private screen: HTMLElement | null = null;
  private pauseEl: HTMLElement | null = null;
  private last = performance.now();
  private saveTimer: number | null = null;
  private quality = 1;
  private frameTimes: number[] = [];
  private menuT = 0;

  constructor(root: HTMLElement, canvas: HTMLCanvasElement) {
    this.root = root;
    this.renderer = new Renderer(canvas);
    this.slot = createSaveSlot(window.localStorage);
    this.profile = this.slot.load();
    this.analytics = new Analytics(window.localStorage);
    if (this.slot.lastLoadSource === 'backup') setTimeout(() => toast(this.root, 'Your save was damaged; restored the last good copy.', '#ffd23a', 5000, '!'), 500);
    checkFeats(this.profile);
    ensureContracts(this.profile);
    this.applySettings();
    window.addEventListener('resize', () => this.renderer.resize(this.quality));
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => this.applySettings());
    window.addEventListener('pagehide', () => this.save());
    void navigator.storage?.persist?.().catch(() => undefined);
    this.renderer.resize(this.quality);
    // Any first interaction unlocks audio (browser autoplay policy).
    window.addEventListener('pointerdown', () => this.audio.unlock(), { once: true });
    requestAnimationFrame((t) => this.loop(t));
    this.showMenu();
  }

  // ─── Persistence ──────────────────────────────────────────────────────────
  save(): void {
    try {
      if (this.run && !this.session) this.profile.activeRun = this.run.serialize();
      this.slot.save(this.profile);
      this.analytics.flush();
    } catch (e) {
      console.error('Save failed', e);
    }
  }

  saveSoon(): void {
    if (this.saveTimer !== null) return;
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      this.save();
    }, 1500);
  }

  applySettings(): void {
    const s = this.profile.settings;
    this.audio.setVolumes(s.sfxVolume, s.musicVolume);
    this.haptics.enabled = s.haptics;
    const reducedMotion = s.reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.fx.reducedMotion = reducedMotion;
    this.fx.shakeScale = s.shake;
    this.fx.flashScale = s.flash;
    if (reducedMotion) { this.fx.shake = 0; this.fx.flash = 0; }
    this.fx.damageNumbers = s.showDamageNumbers;
    this.renderer.highContrast = s.highContrast;
    this.analytics.enabled = s.analyticsOptIn;
    document.body.classList.toggle('hc', s.highContrast);
    document.body.classList.toggle('rm', reducedMotion);
    document.body.classList.toggle('lefty', s.leftHanded);
  }

  // ─── Loop ─────────────────────────────────────────────────────────────────
  private loop(t: number): void {
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    if (this.session) {
      this.session.frame(dt);
      this.autoQuality(dt);
    } else {
      this.menuT += dt;
      this.audio.update(dt, 0);
    }
    requestAnimationFrame((n) => this.loop(n));
  }

  /** Graceful quality scaling: if frames are consistently slow, reduce particles and resolution. */
  private autoQuality(dt: number): void {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 120) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes = [];
    if (avg > 1 / 45 && this.quality > 0.5) {
      this.quality = Math.max(0.5, this.quality - 0.25);
      this.fx.quality = this.quality;
      this.renderer.resize(this.quality);
    } else if (avg < 1 / 58 && this.quality < 1) {
      this.quality = Math.min(1, this.quality + 0.25);
      this.fx.quality = this.quality;
      this.renderer.resize(this.quality);
    }
  }

  // ─── Screen helpers ───────────────────────────────────────────────────────
  private show(el: HTMLElement, scene?: 'menu' | 'map' | 'results'): void {
    if (!this.session) this.renderer.clear();
    this.screen?.remove();
    this.screen = el;
    this.root.append(el);
    if (scene) this.audio.setScene(scene, this.run?.region.id ?? this.profile.loadout.region);
  }

  private resBar(): HTMLElement {
    const p = this.profile;
    return h('div', { class: 'res' },
      h('span', { class: 'essence', title: 'Essence — earned from encounters' }, '◆ ', h('b', null, p.essence)),
      h('span', { class: 'frag', title: 'Research Fragments — earned from discoveries' }, '✦ ', h('b', null, p.fragments)),
      h('span', { class: 'marks', title: 'Mastery Marks — earned from bosses' }, '♛ ', h('b', null, p.marks)),
    );
  }

  private back(fn: () => void, label = '← Back'): HTMLElement {
    return h('button', { class: 'ghost small', onclick: () => (this.audio.back(), fn()) }, label);
  }

  private bar(cur: number, goal: number, cls = ''): HTMLElement {
    return h('div', { class: `meter ${cls}` }, h('i', { style: `width:${Math.min(100, (cur / Math.max(1, goal)) * 100)}%` }));
  }

  private levelTitle(): string {
    const lv = this.profile.level;
    return lv >= 25 ? 'Philosopher' : lv >= 20 ? 'Archmage' : lv >= 15 ? 'Grand Alchemist' : lv >= 10 ? 'Master Alchemist' : lv >= 8 ? 'Adept' : lv >= 5 ? 'Journeyman' : 'Apprentice';
  }

  // ─── Hub ──────────────────────────────────────────────────────────────────
  showMenu(): void {
    const p = this.profile;
    ensureContracts(p);
    const nl = nextLevel(p);
    const prevXp = Content.masteryLevels.find((l) => l.level === p.level)?.xp ?? 0;
    const known = Object.keys(p.discovered).length;
    const total = Content.lists.REACTIONS.length;
    const today = dailyKey(new Date());
    const hasLab = p.research.includes('res_lab');
    const hasDaily = p.research.includes('res_daily');
    const hasEndless = p.research.includes('res_endless');
    const active = p.activeRun;
    const claimable = p.contracts.filter(contractDone).length;
    const featsReady = FEATS.length;
    const mut = dailyMutator(dailySeed(new Date()));
    const cta = active
      ? h('button', { class: 'primary cta', onclick: () => (this.audio.confirm(), this.continueRun()) },
        h('span', { class: 'cta-k' }, 'CONTINUE'), h('span', { class: 'cta-t' }, `${Content.regions.get(active.cfg.regionId)?.name ?? ''} · ${active.cfg.mode === 'endless' ? `depth ${active.floor + 1}` : `floor ${active.floor + 1}`}`))
      : h('button', { class: 'primary cta', onclick: () => (this.audio.confirm(), p.tutorialDone ? this.showPrep() : this.startRun({ tutorial: true })) },
        h('span', { class: 'cta-k' }, p.tutorialDone ? 'NEW EXPEDITION' : 'BEGIN'), h('span', { class: 'cta-t' }, p.tutorialDone ? 'Begin a run' : 'Your first experiment'));
    this.show(h('div', { class: 'screen menu-screen' },
      h('div', { class: 'wrap menu-wrap' },
        h('div', { class: 'row menu-top' },
          h('div', { class: 'lvl-ring', style: `--p:${nl ? ((p.xp - prevXp) / (nl.xp - prevXp)) * 100 : 100}`, title: nl ? `${p.xp - prevXp}/${nl.xp - prevXp} XP` : 'Max level' }, h('b', null, p.level)),
          h('div', { class: 'who' }, h('b', null, this.levelTitle()), h('span', { class: 'tiny dim' }, nl ? `${nl.xp - p.xp} XP to level ${nl.level}` : 'Max level')),
          h('div', { class: 'spacer' }), this.resBar()),
        h('div', { class: 'menu-hero' },
          h('div', { class: 'hero-art', 'aria-hidden': 'true' },
            h('div', { class: 'hero-plate' }), h('div', { class: 'hero-glints' }),
          ),
          h('div', { class: 'title' }, h('div', { class: 'eyebrow' }, 'A PHYSICS-DRIVEN ALCHEMICAL ROGUELITE'), h('h1', null, 'Alchemy Ball'), h('div', { class: 'dim' }, 'Every collision changes the ball.')),
        ),
        h('div', { class: 'menu-panel' },
          h('div', { class: 'menu-buttons' },
            cta,
            active ? h('button', { class: 'ghost small', onclick: async () => {
              if (await confirmDialog(this.root, 'Abandon this run?', 'You keep your discoveries and banked Essence.', 'Abandon', true)) {
                this.run = Run.restore(active);
                this.endRun(false, 'Abandoned');
              }
            } }, 'Abandon saved run') : null,
            h('div', { class: 'modes' },
              hasDaily ? h('button', { class: 'mode-card', onclick: () => (this.audio.confirm(), this.startRun({ daily: true })) },
                h('span', { class: 'mode-ic' }, '☀'), h('b', null, 'Daily Experiment'), h('span', { class: 'tiny dim' }, `${mut.name} · ${p.daily[today] ? `best ${p.daily[today].score}` : 'not yet played'}`)) : null,
              hasEndless ? h('button', { class: 'mode-card', onclick: () => (this.audio.confirm(), this.startRun({ endless: true })) },
                h('span', { class: 'mode-ic' }, '∞'), h('b', null, 'Abyssal Descent'), h('span', { class: 'tiny dim' }, p.endlessBest ? `deepest: floor ${p.endlessBest}` : 'endless mode')) : null,
              hasLab ? h('button', { class: 'mode-card', onclick: () => (this.audio.select(), this.showLabSetup()) },
                h('span', { class: 'mode-ic' }, '⚗'), h('b', null, 'Laboratory'), h('span', { class: 'tiny dim' }, 'safe sandbox')) : null,
            ),
            h('div', { class: 'nav-grid' },
              h('button', { onclick: () => (this.audio.select(), this.showCodex()) }, h('span', { class: 'nav-symbol' }, '✧'), 'Codex', h('small', null, `${known}/${total}`)),
              h('button', { onclick: () => (this.audio.select(), this.showResearch()) }, h('span', { class: 'nav-symbol' }, '⚗'), 'Research',
                Content.lists.RESEARCH.some((n) => researchState(p, n) === 'available' && canAfford(p, n.cost)) ? h('i', { class: 'dot' }) : null),
              h('button', { onclick: () => (this.audio.select(), this.showFeats()) }, h('span', { class: 'nav-symbol' }, '♜'), 'Feats', h('small', null, `${p.feats.length}/${featsReady}`)),
              h('button', { onclick: () => (this.audio.select(), this.showWardrobe()) }, h('span', { class: 'nav-symbol' }, '◐'), 'Wardrobe'),
            ),
          ),
          this.contractsPanel(claimable),
          h('div', { class: 'discovery-progress' },
            h('div', { class: 'row small' }, h('span', { class: 'dim' }, 'Reactions discovered'), h('div', { class: 'spacer' }), h('b', null, `${known} / ${total}`)),
            h('div', { class: 'progress-track' }, h('i', { style: `width:${(known / total) * 100}%` })),
            h('div', { class: 'row tiny dim' }, h('span', null, p.stats.runs > 0 ? `${p.stats.wins} wins · ${p.stats.runs} runs · best floor ${p.stats.bestFloor}` : 'Apprentice alchemist'), h('div', { class: 'spacer' }),
              h('button', { class: 'ghost small', onclick: () => (this.audio.select(), this.showSettings(() => this.showMenu())) }, '⚙ Settings')),
          ),
        ),
        h('div', { class: 'menu-footer' }, h('span', null, 'PULL BACK. LET GO. EXPERIMENT.'), h('span', null, `${unlockedRegions(p).length} / ${Content.lists.REGIONS.length} REGIONS`)),
      ),
    ), 'menu');
  }

  private contractsPanel(claimable: number): HTMLElement {
    const p = this.profile;
    const today = dailyKey(new Date());
    const canSwap = p.contractSwapDay !== today;
    return h('div', { class: 'contracts' },
      h('div', { class: 'row' }, h('span', { class: 'eyebrow' }, 'CONTRACTS'), h('div', { class: 'spacer' }), claimable ? h('span', { class: 'pill gold' }, `${claimable} ready`) : h('span', { class: 'tiny dim' }, 'No timers. Claim when done.')),
      ...p.contracts.map((c) => {
        const done = contractDone(c);
        const reward = [c.reward.essence && `◆${c.reward.essence}`, c.reward.fragments && `✦${c.reward.fragments}`].filter(Boolean).join(' ');
        return h('div', { class: `contract${done ? ' done' : ''}` },
          h('div', { class: 'row' }, h('span', { class: 'small' }, c.text), h('div', { class: 'spacer' }), h('span', { class: 'tiny gold' }, reward)),
          h('div', { class: 'row' }, this.bar(c.progress, c.goal, done ? 'gold' : ''), h('span', { class: 'tiny dim' }, `${Math.min(c.progress, c.goal)}/${c.goal}`),
            done ? h('button', { class: 'small primary', onclick: () => {
              const got = claimContract(p, c.id);
              if (got) { this.audio.purchase(); toast(this.root, `Contract claimed: ${reward}`, '#7be0c0', 2400, '✓'); checkFeats(p); this.save(); this.showMenu(); }
            } }, 'Claim') : canSwap ? h('button', { class: 'small ghost', title: 'Swap for another contract (once a day)', onclick: () => {
              if (swapContract(p, c.id, today)) { this.audio.cardFlip(); this.save(); this.showMenu(); }
            } }, '⟳') : null));
      }),
    );
  }

  // ─── Run preparation ──────────────────────────────────────────────────────
  showPrep(): void {
    const p = this.profile;
    const cores = unlockedCores(p);
    const shells = unlockedShells(p);
    const regions = unlockedRegions(p);
    if (!cores.some((c) => c.id === p.loadout.core)) p.loadout.core = cores[0].id;
    if (!regions.some((r) => r.id === p.loadout.region)) p.loadout.region = 'cinder_marsh';
    const socketUnlocked = p.research.includes('res_catalyst_slot');
    const heatUnlocked = p.research.includes('res_heat');
    const render = () => {
      const core = Content.cores.get(p.loadout.core)!;
      const crec = coreRecord(p, core.id);
      const regionCards = Content.lists.REGIONS.map((r) => {
        const open = regions.includes(r);
        const req = r.requiresBoss ? Content.bosses[r.requiresBoss]?.name : '';
        return h('button', {
          class: `region-card${p.loadout.region === r.id ? ' selected' : ''}${open ? '' : ' locked'}`, 'data-region': r.id, style: `--a:${r.palette.accent};--l:${r.palette.light}`,
          onclick: () => { if (open) { p.loadout.region = r.id; this.audio.select(); this.audio.setScene('menu', r.id); render(); } else this.audio.denied(); },
        }, h('b', null, r.name), h('span', { class: 'tiny' }, open ? r.flavor : `Defeat ${req} to unlock`), h('span', { class: 'tiny dim' }, open ? `Boss: ${Content.bosses[r.boss]?.name}` : '🔒'));
      });
      const coreCards = Content.lists.CORES.map((c) => {
        const unlocked = cores.includes(c);
        const el = Content.elements.get(c.element)!;
        const req = c.unlock ? Content.research.get(c.unlock)?.name : '';
        const rec = p.cores[c.id];
        return h('div', {
          class: `card selectable core-card${p.loadout.core === c.id ? ' selected' : ''}${unlocked ? '' : ' locked'}`, style: `--c:${el.color}`,
          onclick: () => { if (unlocked) { p.loadout.core = c.id; this.audio.select(); render(); } else this.audio.denied(); },
        },
          h('div', { class: 'row' }, h('span', { class: 'core-glyph' }, el.glyph), h('b', null, c.name), h('div', { class: 'spacer' }), rec ? h('span', { class: 'pill tiny' }, `Lv ${rec.level}`) : null),
          h('div', { class: 'tiny', style: `color:${el.color}` }, c.archetype + (rec && rec.bestHeat >= 0 ? ` · 🔥${rec.bestHeat}` : '')),
          h('div', { class: 'tiny dim' }, unlocked ? c.description : `Locked — research ${req}`),
        );
      });
      const aspects = aspectsFor(core.id);
      const curAspect = p.loadout.aspects[core.id] ?? aspects[0]?.id;
      const aspectRow = h('div', null, h('h3', null, 'Aspect'), h('div', { class: 'tiny dim' }, `Core level ${crec.level}. Aspects are alternative forms of the ${core.name}, unlocked by playing it.`),
        h('div', { class: 'aspect-row' }, ...aspects.map((a) => {
          const open = crec.level >= a.level;
          return h('div', {
            class: `card selectable small aspect${curAspect === a.id ? ' selected' : ''}${open ? '' : ' locked'}`,
            onclick: () => { if (open) { p.loadout.aspects[core.id] = a.id; this.audio.select(); render(); } else this.audio.denied(); },
          }, h('b', null, a.name), h('div', { class: 'tiny dim' }, open ? a.description : `Reach core level ${a.level}`));
        })));
      const shellRow = shells.length > 1 ? h('div', null, h('h3', null, 'Shell'), h('div', { class: 'grid2', style: 'margin-top:6px' },
        ...shells.map((s) => h('div', { class: `card selectable small${p.loadout.shell === s.id ? ' selected' : ''}`, onclick: () => { p.loadout.shell = s.id; this.audio.select(); render(); } }, h('b', null, s.name), h('div', { class: 'tiny dim' }, s.description))))) : null;
      const socketRow = socketUnlocked ? h('div', null, h('h3', null, 'Catalyst Socket'), h('div', { class: 'tiny dim' }, 'Start with one common upgrade.'),
        h('div', { class: 'row wrap-row', style: 'margin-top:6px' },
          h('button', { class: `small${!p.loadout.socket ? ' primary' : ''}`, onclick: () => { p.loadout.socket = undefined; render(); } }, 'None'),
          ...Content.lists.UPGRADES.filter((u) => u.rarity === 'common' && unlockedIds(p).concat(['']).includes(u.unlock ?? '')).map((u) => h('button', { class: `small${p.loadout.socket === u.id ? ' primary' : ''}`, onclick: () => { p.loadout.socket = u.id; this.audio.select(); render(); } }, `${u.icon ?? ''} ${u.name}`)))) : null;
      const maxHeat = Math.min(MAX_HEAT, p.maxHeatWon + 1);
      const heatRow = heatUnlocked ? h('div', { class: 'card heat-card' },
        h('div', { class: 'row' }, h('b', null, `Heat ${p.heat}`), h('span', { class: 'tiny dim' }, `best with this core: ${crec.bestHeat >= 0 ? crec.bestHeat : '—'}`), h('div', { class: 'spacer' }),
          h('button', { class: 'small', disabled: p.heat <= 0, onclick: () => { p.heat--; this.audio.select(); render(); } }, '−'),
          h('button', { class: 'small', disabled: p.heat >= maxHeat, onclick: () => { p.heat++; this.audio.select(); render(); } }, '+')),
        h('div', { class: 'heat-ladder' }, ...Content.heatLevels.map((l) => h('div', { class: `heat-rung${l.level <= p.heat ? ' on' : ''}${l.level > maxHeat ? ' locked' : ''}` }, h('b', null, l.level), h('span', null, `${l.name} — ${l.description}`)))),
        h('div', { class: 'tiny dim' }, p.heat ? `+${p.heat * 15}% Essence · +${Math.floor(p.heat / 2)} Mastery Marks on victory.` : 'Win a run to raise the Heat further.')) : null;
      const region = Content.regions.get(p.loadout.region)!;
      this.show(h('div', { class: 'screen prep-screen', style: `--a:${region.palette.accent}` }, h('div', { class: 'wrap' },
        h('div', { class: 'row' }, this.back(() => this.showMenu()), h('div', { class: 'spacer' }), this.resBar()),
        h('h2', { class: 'prep-heading', 'data-region': region.id }, 'Prepare your expedition'),
        regions.length > 1 ? h('div', null, h('h3', null, 'Region'), h('div', { class: 'region-row' }, ...regionCards)) : null,
        h('h3', null, 'Core'),
        h('div', { class: 'small dim' }, 'Your core is the element your ball always carries. Pick up others from the arena.'),
        h('div', { class: 'grid2' }, ...coreCards),
        aspects.length > 1 ? aspectRow : null,
        shellRow, socketRow, heatRow,
        h('button', { class: 'primary sticky-cta', onclick: () => (this.audio.confirm(), this.save(), this.startRun({})) }, `Enter ${region.name}`),
      )));
    };
    render();
  }

  startRun(o: { tutorial?: boolean; daily?: boolean; endless?: boolean }): void {
    const p = this.profile;
    const today = new Date();
    let core = o.tutorial ? 'ember' : p.loadout.core;
    let seed = (Date.now() ^ hashString(String(Math.random()))) >>> 0;
    let mutator: string | undefined;
    if (o.daily) {
      seed = dailySeed(today);
      // Daily uses a fixed core for everyone (even if not yet unlocked) for a fair, comparable ruleset.
      core = Content.lists.CORES[seed % Content.lists.CORES.length].id;
      mutator = dailyMutator(seed).id;
    }
    const region = o.tutorial || o.daily || o.endless ? 'cinder_marsh' : p.loadout.region;
    const coreLv = coreRecord(p, core).level;
    const aspect = o.daily || o.tutorial ? undefined : p.loadout.aspects[core];
    const regionCycle = o.endless ? unlockedRegions(p).map((r) => r.id) : undefined;
    this.run = new Run({
      seed, mode: o.daily ? 'daily' : o.endless ? 'endless' : 'standard', regionId: region, core, shell: o.daily || o.tutorial ? 'glass' : p.loadout.shell,
      heat: o.daily ? 1 : o.tutorial || o.endless ? 0 : p.heat, tutorial: !!o.tutorial, maxPips: 3 + (p.research.includes('res_pip') ? 1 : 0),
      rerolls: (p.research.includes('res_reroll') ? 1 : 0) + (p.research.includes('res_reroll2') ? 1 : 0) + (coreLv >= 5 && !o.daily ? 1 : 0),
      banishes: p.research.includes('res_banish') ? 2 : 0, socket: o.daily || o.tutorial ? undefined : p.loadout.socket,
      aspect: aspect && Content.aspects.get(aspect)?.core === core && coreLv >= (Content.aspects.get(aspect)?.level ?? 99) ? aspect : undefined,
      mutator, unlocked: unlockedIds(p), regionCycle,
    });
    p.stats.regionRuns[region] = (p.stats.regionRuns[region] ?? 0) + 1;
    checkFeats(p);
    this.analytics.track('runStart', core);
    this.save();
    if (o.daily && mutator) toast(this.root, `Daily mutator — ${dailyMutator(seed).name}: ${dailyMutator(seed).description}`, '#ffd23a', 4200, '☀');
    this.showMap();
  }

  continueRun(): void {
    const saved = this.profile.activeRun;
    if (!saved) return this.showMenu();
    try {
      this.run = Run.restore(saved);
    } catch (e) {
      console.error('Could not restore run', e);
      this.profile.activeRun = undefined;
      this.save();
      return this.showMenu();
    }
    this.showMap();
  }

  // ─── Map ──────────────────────────────────────────────────────────────────
  showMap(): void {
    const run = this.run!;
    if (run.finished) return this.endRun(true);
    this.save();
    const region = run.region;
    const loopStart = run.floor - run.regionFloor;
    const rows = run.map.slice(loopStart, loopStart + 7).map((choices, k) => {
      const i = loopStart + k;
      const state = i < run.floor ? 'done' : i === run.floor ? 'here' : 'ahead';
      return h('div', { class: `map-row ${state}` },
        h('span', { class: 'map-floor' }, run.cfg.mode === 'endless' ? i + 1 : k + 1),
        ...choices.map((room) => {
          const taken = state === 'done' && run.path[i] === room;
          return h('button', {
            class: `map-node r-${room}${taken ? ' taken' : ''}`, disabled: state !== 'here', title: `${ROOM_INFO[room].name} — ${ROOM_INFO[room].blurb}`,
            onclick: () => (this.audio.confirm(), this.enterRoom(room)),
          }, h('span', { class: 'ic' }, ROOM_INFO[room].icon), state === 'here' ? h('span', { class: 'lbl' }, ROOM_INFO[room].name) : null);
        }));
    }).reverse();
    const core = Content.cores.get(run.cfg.core)!;
    const ups = [...run.upgrades.keys()].map((id) => Content.upgrades.get(id)!).filter(Boolean);
    const evo = run.eligibleEvolutions();
    const aspect = run.cfg.aspect ? Content.aspects.get(run.cfg.aspect) : undefined;
    const mut = run.cfg.mutator ? MUTATORS.find((m) => m.id === run.cfg.mutator) : undefined;
    const hpFrac = run.hp / run.maxHp;
    this.show(h('div', { class: 'screen map-screen', style: `--a:${region.palette.accent};--l:${region.palette.light}` }, h('div', { class: 'wrap' },
      h('div', { class: 'row map-heading', 'data-region': region.id },
        h('div', null, h('div', { class: 'eyebrow' }, run.cfg.mode === 'endless' ? `ABYSSAL DESCENT · LOOP ${run.loop + 1}` : run.cfg.mode === 'daily' ? 'DAILY EXPERIMENT' : run.cfg.heat ? `HEAT ${run.cfg.heat}` : 'EXPEDITION'), h('h2', { class: 'region-title' }, region.name)),
        h('div', { class: 'spacer' }),
        h('button', { class: 'ghost small', onclick: () => (this.audio.select(), this.showPauseMenuFromMap()) }, '☰')),
      h('div', { class: 'tiny dim' }, region.flavor + (mut ? ` · Mutator: ${mut.name}` : '')),
      h('div', { class: 'build-strip' },
        h('div', { class: 'hp-strip' }, h('i', { style: `width:${hpFrac * 100}%` }), h('span', null, `❤ ${Math.ceil(run.hp)} / ${run.maxHp}`)),
        h('span', { class: 'pill cata' }, `⬡ ${run.catalysts}`),
        run.rerolls ? h('span', { class: 'pill' }, `⟳ ${run.rerolls}`) : null,
        run.banishes ? h('span', { class: 'pill' }, `✕ ${run.banishes}`) : null),
      h('div', { class: 'map' }, ...rows),
      h('div', { class: 'card small build' },
        h('div', null, h('b', null, core.name), h('span', { class: 'dim' }, ` · ${aspect ? aspect.name : core.archetype}`)),
        ups.length ? h('div', { class: 'up-chips' }, ...ups.map((u) => h('span', { class: `up-chip rar-${u.rarity}`, title: `${u.name}: ${u.description}` }, h('i', null, u.icon ?? '•'), `${u.name}${(run.upgrades.get(u.id) ?? 0) > 1 ? ` ×${run.upgrades.get(u.id)}` : ''}`))) : h('div', { class: 'tiny dim' }, 'No upgrades yet.'),
        evo.length ? h('div', { class: 'syn', style: 'margin-top:6px' }, `✦ Evolution ready: ${evo.map((e) => e.name).join(', ')} — look for it in Reliquaries and elite rewards.`) : null,
      ),
    )), 'map');
  }

  private async showPauseMenuFromMap(): Promise<void> {
    const el = h('div', { class: 'screen overlay' }, h('div', { class: 'wrap', style: 'max-width:360px' },
      h('h2', { style: 'text-align:center' }, 'Expedition'),
      h('button', { class: 'primary', onclick: () => el.remove() }, 'Return to map'),
      h('button', { onclick: () => { el.remove(); this.save(); this.run = null; this.showMenu(); } }, 'Save & quit to hub'),
      h('button', { onclick: () => { el.remove(); this.showCodex(() => this.showMap()); } }, 'Codex'),
      h('button', { class: 'ghost', onclick: async () => {
        if (await confirmDialog(this.root, 'Abandon this run?', 'You keep your discoveries and banked Essence.', 'Abandon', true)) { el.remove(); this.endRun(false, 'Abandoned'); }
      } }, 'Abandon run'),
    ));
    this.root.append(el);
  }

  enterRoom(room: RoomType): void {
    const run = this.run!;
    run.enter(room);
    this.analytics.track('room', room);
    if (room === 'rest') return this.showRest();
    if (room === 'research') return this.showResearchCache();
    if (room === 'treasure') return this.showUpgradePick('rare');
    if (room === 'merchant') return this.showMerchant();
    if (room === 'event') return this.showAnomaly();
    const spec = run.generateEncounter(room);
    this.screen?.remove();
    this.screen = null;
    const coreEl = Content.cores.get(run.cfg.core)!.element;
    this.session = new Session(this, spec, room, run,
      { coreElement: coreEl, hp: run.hp, maxHp: run.maxHp, mods: run.mods(), maxPips: run.maxPips, seed: run.rng.int(0, 2 ** 30), difficulty: { ...run.difficulty(), playerResist: assistResistance(this.profile) } },
      (r) => this.onRoomEnd(room, r));
  }

  private onRoomEnd(room: RoomType, r: SessionEnd): void {
    const run = this.run!;
    const p = this.profile;
    this.session = null;
    this.hidePause();
    run.hp = r.hp;
    if (r.challenge) {
      run.catalysts += r.challenge.catalysts;
      run.stats.essence += r.challenge.essence;
    }
    if (r.cleared && r.noHit && room !== 'boss') {
      p.stats.noHitRooms++;
      run.stats.noHitRooms++;
      this.trackMilestone('noHit');
    }
    if (r.cleared && r.noHit && room === 'boss') p.stats.flawlessBoss = true;
    this.bankEssence();
    if (!r.cleared) return this.endRun(false, r.cause);
    if (room === 'boss') {
      run.completeRoom();
      if (run.cfg.mode === 'endless') {
        run.heal(Math.round(run.maxHp * 0.4));
        toast(this.root, `Loop ${run.loop} complete — the descent continues, and grows harder.`, '#c9a6ff', 3600, '∞');
        this.save();
        return this.showUpgradePick('rare');
      }
      return this.endRun(true);
    }
    run.heal(run.roomHeal);
    run.catalysts += room === 'elite' ? 2 : 1;
    this.save();
    this.showUpgradePick(room === 'elite' ? 'elite' : 'normal');
  }

  private trackMilestone(kind: 'noHit'): void {
    for (const f of checkFeats(this.profile)) toast(this.root, `Feat unlocked: ${f.name}`, '#ffd23a', 3200, '♜', 'feat');
    void kind;
  }

  private bankEssence(): void {
    const run = this.run!;
    const delta = run.stats.essence - run.bankedEssence;
    if (delta > 0) this.profile.essence += delta;
    run.bankedEssence = run.stats.essence;
    this.save();
  }

  // ─── Rooms without combat ─────────────────────────────────────────────────
  private upgradeCard(o: { def: UpgradeDef; synergy?: string }, i: number, onPick: () => void, extra?: HTMLElement | null, price?: number): HTMLElement {
    const run = this.run!;
    const stacks = run.upgrades.get(o.def.id) ?? 0;
    const els = o.def.elements.map((e) => Content.elements.get(e)!);
    const req = o.def.requires?.map((id) => Content.upgrades.get(id)?.name).join(' + ');
    let picked = false;
    const card = h('div', {
      class: `card selectable offer rar-${o.def.rarity}`, style: `--i:${i}`, tabindex: '0', role: 'button',
      onclick: () => {
        if (picked) return;
        picked = true;
        card.classList.add('chosen');
        o.def.rarity === 'legendary' ? this.audio.evolution() : this.audio.confirm();
        setTimeout(onPick, this.fx.reducedMotion ? 0 : 260);
      },
    },
      h('div', { class: 'offer-art' }, h('span', null, o.def.icon ?? '✦')),
      h('div', { class: 'offer-body' },
        h('div', { class: 'row' }, h('span', { class: `rar ${o.def.rarity}` }, RARITY_LABEL[o.def.rarity]), h('div', { class: 'spacer' }), ...els.map((e) => h('span', { style: `color:${e.color}` }, e.glyph)), price !== undefined ? h('span', { class: 'pill cata' }, `⬡ ${price}`) : null),
        h('b', { class: 'offer-name' }, o.def.name + (stacks ? ` (${stacks + 1}/${o.def.maxStacks})` : '')),
        h('div', { class: 'small' }, o.def.description),
        req ? h('div', { class: 'tiny gold' }, `Fuses ${req}`) : null,
        o.synergy ? h('div', { class: 'syn' }, `★ ${o.synergy}`) : null,
        h('div', { class: 'tiny dim' }, o.def.tags.join(' · ')),
        extra ?? null,
      ),
    );
    setTimeout(() => this.audio.cardDeal(i), 80 * i);
    return card;
  }

  showUpgradePick(quality: 'normal' | 'elite' | 'rare', after?: () => void): void {
    const run = this.run!;
    let offers = run.offerUpgrades(3, quality);
    const done = after ?? (() => this.afterRoom());
    const render = () => {
      const cards = offers.map((o, i) => this.upgradeCard(o, i, () => {
        run.addUpgrade(o.def.id);
        if (!this.profile.seenUpgrades.includes(o.def.id)) this.profile.seenUpgrades.push(o.def.id);
        this.analytics.track('upgradePick', o.def.id);
        if (o.def.rarity === 'legendary') {
          checkFeats(this.profile);
          toast(this.root, `Evolution! ${o.def.name}`, '#ffd23a', 3000, o.def.icon ?? '✦', 'feat');
        }
        done();
      }, run.banishes > 0 ? h('button', { class: 'tiny ghost banish', onclick: (e: MouseEvent) => {
        e.stopPropagation();
        if (run.banish(o.def.id)) {
          this.audio.back();
          offers = run.offerUpgrades(3, quality);
          render();
        }
      } }, `✕ Banish (${run.banishes})`) : null));
      this.show(h('div', { class: 'screen pick-screen' }, h('div', { class: 'wrap' },
        h('div', { class: 'row' }, h('h2', null, quality === 'rare' ? 'Reliquary' : quality === 'elite' ? 'Elite spoils' : 'Choose an upgrade'), h('div', { class: 'spacer' }), h('span', { class: 'pill cata' }, `⬡ ${run.catalysts}`)),
        h('div', { class: 'small dim' }, 'Upgrades last for this run. Hold two related upgrades at full strength to unlock an Evolution.'),
        h('div', { class: 'offers' }, ...cards),
        h('div', { class: 'row' },
          h('button', { class: 'small', disabled: run.rerolls <= 0 && run.catalysts < 1, onclick: () => {
            if (run.rerolls > 0) run.rerolls--;
            else run.catalysts--;
            this.audio.cardFlip();
            offers = run.offerUpgrades(3, quality);
            render();
          } }, run.rerolls > 0 ? `⟳ Reroll (free ×${run.rerolls})` : '⟳ Reroll (1 ⬡)'),
          h('div', { class: 'spacer' }),
          h('button', { class: 'ghost small', onclick: () => { run.catalysts += 1; this.audio.back(); done(); } }, 'Skip (+1 ⬡)'),
        ),
      )), 'map');
    };
    render();
  }

  private afterRoom(): void {
    this.run!.completeRoom();
    this.save();
    this.showMap();
  }

  private showRest(): void {
    const run = this.run!;
    const heal = Math.round(run.maxHp * run.restHeal);
    this.show(h('div', { class: 'screen' }, h('div', { class: 'wrap' },
      h('div', { class: 'room-hero' }, h('span', null, '♨')),
      h('h2', null, 'Still Spring'), h('div', { class: 'dim small' }, 'Warm water hums with residual alchemy. Choose one.'),
      h('div', { class: 'card selectable choice', onclick: () => { this.audio.confirm(); run.heal(heal); this.afterRoom(); } }, h('b', null, `Rest: heal ${heal} HP`), h('div', { class: 'small dim' }, `❤ ${Math.ceil(run.hp)}/${run.maxHp}`)),
      h('div', { class: 'card selectable choice', onclick: () => { this.audio.confirm(); run.maxHp += 12; run.hp += 12; this.afterRoom(); } }, h('b', null, 'Temper: +12 max HP'), h('div', { class: 'small dim' }, 'A sturdier shell for the rest of the run.')),
      h('div', { class: `card selectable choice${run.catalysts < 3 ? ' locked' : ''}`, onclick: () => { if (run.catalysts >= 3) { run.catalysts -= 3; this.audio.purchase(); this.showUpgradePick('rare'); } else this.audio.denied(); } },
        h('b', null, 'Distill: 3 ⬡ → rare upgrade choice'), h('div', { class: 'small dim' }, `You have ${run.catalysts} Catalysts.`)),
    )), 'map');
  }

  private showMerchant(): void {
    const run = this.run!;
    const stock = run.offerUpgrades(4, 'elite');
    const sold = new Set<string>();
    let healed = false;
    const render = () => {
      const cards = stock.map((o, i) => {
        const price = PRICE[o.def.rarity];
        if (sold.has(o.def.id)) return h('div', { class: 'card offer sold', style: `--i:${i}` }, h('b', null, 'Sold'));
        const c = this.upgradeCard(o, i, () => {
          if (run.catalysts < price) { this.audio.denied(); return render(); }
          run.catalysts -= price;
          run.addUpgrade(o.def.id);
          sold.add(o.def.id);
          this.audio.purchase();
          render();
        }, null, price);
        if (run.catalysts < price) c.classList.add('unaffordable');
        return c;
      });
      this.show(h('div', { class: 'screen pick-screen' }, h('div', { class: 'wrap' },
        h('div', { class: 'room-hero' }, h('span', null, '⚖')),
        h('div', { class: 'row' }, h('h2', null, 'Wandering Merchant'), h('div', { class: 'spacer' }), h('span', { class: 'pill cata' }, `⬡ ${run.catalysts}`)),
        h('div', { class: 'small dim' }, '“Catalysts only, friend. Everything else is too unstable to carry.”'),
        h('div', { class: 'offers' }, ...cards),
        h('div', { class: `card selectable choice${healed || run.catalysts < 2 ? ' locked' : ''}`, onclick: () => {
          if (healed || run.catalysts < 2) return this.audio.denied();
          run.catalysts -= 2; healed = true; run.heal(Math.round(run.maxHp * 0.3)); this.audio.purchase(); render();
        } }, h('b', null, `Remedy: heal 30% HP for 2 ⬡`), h('div', { class: 'small dim' }, `❤ ${Math.ceil(run.hp)}/${run.maxHp}`)),
        h('button', { class: 'primary', onclick: () => (this.audio.confirm(), this.afterRoom()) }, 'Leave'),
      )), 'map');
    };
    render();
  }

  private showAnomaly(): void {
    const run = this.run!;
    const p = this.profile;
    const ev = ANOMALIES[run.rng.int(0, ANOMALIES.length - 1)];
    const choices = ev.choices.filter((c) => !c.available || c.available(run));
    this.show(h('div', { class: 'screen' }, h('div', { class: 'wrap anomaly' },
      h('div', { class: 'room-hero violet' }, h('span', null, ev.icon)),
      h('div', { class: 'eyebrow' }, 'ANOMALY'),
      h('h2', null, ev.name),
      h('p', { class: 'lore' }, ev.text),
      ...choices.map((c) => h('div', { class: 'card selectable choice', onclick: () => {
        this.audio.confirm();
        const out = c.apply(run, p);
        this.save();
        this.show(h('div', { class: 'screen' }, h('div', { class: 'wrap anomaly' },
          h('div', { class: 'room-hero violet' }, h('span', null, ev.icon)),
          h('h2', null, ev.name),
          h('p', { class: 'lore' }, out.text),
          h('button', { class: 'primary', onclick: () => (this.audio.confirm(), out.offer ? this.showUpgradePick(out.offer) : this.afterRoom()) }, out.offer ? 'Choose' : 'Continue'),
        )), 'map');
      } }, h('b', null, c.label), h('div', { class: 'small dim' }, c.detail))),
    )), 'map');
  }

  private showResearchCache(): void {
    const p = this.profile;
    const run = this.run!;
    const candidates = Content.lists.REACTIONS.filter((r) => !p.discovered[r.id] && !p.revealed.includes(r.id));
    const pick = candidates.length ? candidates[run.rng.int(0, candidates.length - 1)] : undefined;
    if (pick) p.revealed.push(pick.id);
    p.fragments += 4;
    run.stats.fragments += 4;
    this.save();
    const ins = pick ? pick.inputs.map((x) => (x === '*' ? 'any element' : Content.elements.get(x)!.name)) : [];
    this.show(h('div', { class: 'screen' }, h('div', { class: 'wrap' },
      h('div', { class: 'room-hero' }, h('span', null, '⚗')),
      h('h2', null, 'Research Cache'),
      h('div', { class: 'card' },
        h('p', { class: 'frag' }, '+4 Research Fragments'),
        pick ? h('div', null, h('div', { class: 'small dim' }, 'A scorched notebook describes an experiment:'), h('p', { class: 'lore' }, `“${pick.hint}”`),
          h('div', { class: 'small' }, `It involves ${ins.join(' and ')}.`), h('div', { class: 'tiny dim' }, 'The hint is now in your Codex.')) : h('p', null, 'Nothing new to learn here — you have seen it all.'),
      ),
      h('button', { class: 'primary', onclick: () => (this.audio.confirm(), this.afterRoom()) }, 'Continue'),
    )), 'map');
  }

  // ─── Run end ──────────────────────────────────────────────────────────────
  endRun(won: boolean, cause?: string): void {
    const run = this.run!;
    this.session?.destroy();
    this.session = null;
    this.hidePause();
    this.bankEssence();
    this.profile.activeRun = undefined;
    const summary = finishRun(this.profile, run, won, cause);
    if (run.cfg.mode === 'daily') {
      const key = dailyKey(new Date());
      const score = run.stats.kills * 10 + run.stats.reactions * 2 + (won ? 500 : 0) + run.floor * 50 + run.stats.maxCombo * 5;
      const prev = this.profile.daily[key];
      if (!prev || score > prev.score) this.profile.daily[key] = { score, won };
    }
    this.analytics.track(won ? 'runWon' : 'runLost', run.cfg.core);
    this.run = null;
    this.save();
    this.showResults(summary, run);
  }

  private showResults(s: RunSummary, run: Run): void {
    const disc = s.discoveries.map((id) => Content.reactions.get(id)!).filter(Boolean);
    const endless = s.mode === 'endless';
    const title = endless ? `Depth ${s.floorReached}` : s.won ? 'Victory' : 'The ball shattered';
    const statEl = (label: string, v: number, prefix = '') => {
      const b = h('b', null, '0');
      setTimeout(() => countUp(b, v, 650, prefix, (i) => this.audio.tick(i)), 250);
      return h('div', null, label, b);
    };
    const coreName = Content.cores.get(s.core)?.name ?? s.core;
    if (s.won) this.audio.victory();
    const bars = s.goals.map((g) => {
      const fill = h('i', { style: 'width:0%' });
      setTimeout(() => (fill.style.width = `${Math.min(100, (g.cur / Math.max(1, g.goal)) * 100)}%`), 400);
      return h('div', { class: 'goal' }, h('div', { class: 'row tiny' }, h('span', null, g.label), h('div', { class: 'spacer' }), h('span', { class: 'dim' }, `${Math.min(g.cur, g.goal)}/${g.goal}`)), h('div', { class: 'meter' }, fill));
    });
    this.show(h('div', { class: `screen results-screen${s.won ? ' won' : ''}` }, h('div', { class: 'wrap' },
      h('div', { class: 'title results-title', 'data-region': run.region.id },
        h('div', { class: 'eyebrow' }, endless ? 'ABYSSAL DESCENT' : s.mode === 'daily' ? 'DAILY EXPERIMENT' : run.region.name.toUpperCase()),
        h('h1', null, title),
        s.newRecord ? h('div', { class: 'pill gold' }, '★ New record') : null),
      !s.won && s.cause ? h('div', { class: 'card' }, h('b', null, `Cause: ${s.cause}`), s.causeAdvice ? h('div', { class: 'small dim' }, s.causeAdvice) : null) : null,
      h('div', { class: 'stat-grid' },
        statEl('Floor', Math.min(s.floorReached, endless ? s.floorReached : run.map.length)),
        statEl('Reactions', run.stats.reactions),
        statEl('Kills', run.stats.kills),
        statEl('Best combo', run.stats.maxCombo, '×'),
      ),
      h('div', { class: 'card rewards' }, h('h3', null, 'Rewards (kept forever)'),
        h('div', { class: 'res big' }, h('span', { class: 'essence' }, '◆ +', this.counter(s.essence)), h('span', { class: 'frag' }, '✦ +', this.counter(s.fragments)), s.marks ? h('span', { class: 'marks' }, '♛ +', this.counter(s.marks)) : null),
        h('div', { class: 'tiny dim' }, `+${s.xpGained} XP · ${coreName} +${s.coreXp} core XP${s.coreLevelUps.length ? ` · core level ${s.coreLevelUps.at(-1)}!` : ''}${s.levelUps.length ? ` · player level ${s.levelUps.at(-1)}!` : ''}`)),
      s.feats.length ? h('div', { class: 'card feat-card' }, h('h3', null, `Feats unlocked (${s.feats.length})`),
        ...s.feats.map((f) => h('div', { class: 'small' }, h('b', { class: 'gold' }, `♜ ${f.name}`), h('span', { class: 'dim' }, ` — ${[featRewardText(f), ...featUnlocks(f.id)].filter(Boolean).join(' · ')}`)))) : null,
      h('div', { class: 'card' }, h('h3', null, 'Closest goals'), ...bars),
      disc.length ? h('div', { class: 'card' }, h('h3', null, `New discoveries (${disc.length})`), ...disc.map((r) => h('div', { class: 'small', style: 'margin-top:4px' }, h('b', null, r.name), h('span', { class: 'dim' }, ` — ${r.followUp}`)))) : h('div', { class: 'card small dim' }, 'No new reactions this time. Check the Codex for hints — yellow cells mean you were close.'),
      s.topReactions.length ? h('div', { class: 'small dim' }, 'Your go-to reactions: ', s.topReactions.map((t) => `${Content.reactions.get(t.id)?.name} ×${t.count}`).join(', ')) : null,
      h('div', { class: 'card' }, h('div', { class: 'tiny dim' }, 'NEXT GOAL'), h('div', null, s.nextGoal)),
      h('button', { class: 'primary', onclick: () => (this.audio.confirm(), this.showPrep()) }, 'Next run'),
      h('div', { class: 'grid2' },
        h('button', { onclick: () => (this.audio.select(), this.showResearch()) }, 'Research'),
        h('button', { onclick: () => (this.audio.select(), this.showCodex()) }, 'Codex')),
      h('button', { class: 'ghost', onclick: () => (this.audio.back(), this.showMenu()) }, 'Hub'),
    )), 'results');
  }

  private counter(v: number): HTMLElement {
    const b = h('b', null, '0');
    setTimeout(() => countUp(b, v, 900), 500);
    return b;
  }

  // ─── Pause ────────────────────────────────────────────────────────────────
  showPause(s: Session): void {
    this.hidePause();
    const run = this.run;
    const ups = run ? [...run.upgrades.keys()].map((id) => Content.upgrades.get(id)!).filter(Boolean) : [];
    this.pauseEl = h('div', { class: 'screen overlay' }, h('div', { class: 'wrap', style: 'max-width:380px' },
      h('h2', { style: 'text-align:center' }, 'Paused'),
      s.challenge ? h('div', { class: 'card small' }, h('div', { class: 'tiny dim' }, 'ROOM CHALLENGE'), s.challenge.label()) : null,
      ups.length ? h('div', { class: 'up-chips' }, ...ups.map((u) => h('span', { class: `up-chip rar-${u.rarity}`, title: u.description }, h('i', null, u.icon ?? '•'), u.name))) : null,
      h('button', { class: 'primary', onclick: () => s.togglePause() }, 'Resume'),
      h('button', { onclick: () => { this.hidePause(); this.showCodex(() => this.showPause(s)); } }, 'Codex'),
      h('button', { onclick: () => { this.hidePause(); this.showSettings(() => { this.screen?.remove(); this.screen = null; this.showPause(s); }); } }, 'Settings'),
      h('button', { class: 'ghost', onclick: async () => {
        if (s.room === 'lab' || (await confirmDialog(this.root, 'Abandon the run?', 'Discoveries and banked Essence are kept.', 'Abandon', true))) { this.hidePause(); s.abandon(); }
      } }, s.room === 'lab' ? 'Leave laboratory' : 'Abandon run'),
    ));
    this.root.append(this.pauseEl);
  }

  hidePause(): void {
    this.pauseEl?.remove();
    this.pauseEl = null;
  }

  // ─── Codex / Research / Feats / Wardrobe / Settings ──────────────────────
  showCodex(onBack?: () => void): void {
    const el = h('div', { class: 'screen' });
    this.show(el);
    renderCodex(el, this.profile, () => (this.audio.back(), onBack ? (this.screen?.remove(), (this.screen = null), onBack()) : this.showMenu()));
  }

  showResearch(): void {
    const p = this.profile;
    const branches: { id: 'elements' | 'ball' | 'lab' | 'world'; name: string; ic: string }[] = [
      { id: 'elements', name: 'Elements', ic: '△' }, { id: 'ball', name: 'Ball', ic: '●' }, { id: 'lab', name: 'Laboratory', ic: '⚗' }, { id: 'world', name: 'World', ic: '◈' },
    ];
    const cost = (c: { fragments?: number; essence?: number; marks?: number }) =>
      [c.fragments && `✦${c.fragments}`, c.essence && `◆${c.essence}`, c.marks && `♛${c.marks}`].filter(Boolean).join(' ');
    const owned = p.research.length;
    this.show(h('div', { class: 'screen' }, h('div', { class: 'wrap' },
      h('div', { class: 'row' }, this.back(() => this.showMenu()), h('div', { class: 'spacer' }), this.resBar()),
      h('h2', null, 'Alchemical Research'),
      h('div', { class: 'small dim' }, `Permanent. Research opens new options — cores, slots, tools, modes — never raw power. ${owned}/${Content.lists.RESEARCH.length} researched.`),
      ...branches.map((b) => h('div', { class: 'branch' }, h('h3', null, `${b.ic} ${b.name}`),
        h('div', { class: 'node-grid' }, ...Content.lists.RESEARCH.filter((n) => n.branch === b.id).map((n) => {
          const st = researchState(p, n);
          const afford = canAfford(p, n.cost);
          return h('div', { class: `card node ${st}${st === 'available' && afford ? ' ready' : ''}` },
            h('div', { class: 'row' }, h('b', null, n.name), h('div', { class: 'spacer' }), st === 'owned' ? h('span', { class: 'pill', style: 'color:var(--good)' }, '✓') : h('span', { class: 'pill' }, cost(n.cost))),
            h('div', { class: 'small' }, n.grants),
            h('div', { class: 'tiny dim' }, n.description),
            st === 'locked' ? h('div', { class: 'tiny dim' }, `Requires: ${n.requires.map((r) => Content.research.get(r)?.name).join(', ')}`) : null,
            st === 'available' ? h('button', { class: afford ? 'primary small' : 'small', disabled: !afford, onclick: () => {
              if (buyResearch(p, n.id)) { this.audio.unlock2(); this.analytics.track('research', n.id); checkFeats(p); this.save(); this.showResearch(); }
            } }, afford ? 'Research' : 'Not enough') : null,
          );
        })))),
    )), 'menu');
  }

  showFeats(): void {
    const p = this.profile;
    const cats = ['Discovery', 'Mastery', 'Combat', 'Journey', 'Challenge'] as const;
    this.show(h('div', { class: 'screen' }, h('div', { class: 'wrap' },
      h('div', { class: 'row' }, this.back(() => this.showMenu()), h('div', { class: 'spacer' }), h('span', { class: 'pill gold' }, `${p.feats.length}/${FEATS.length}`)),
      h('h2', null, 'Feats'),
      h('div', { class: 'small dim' }, 'Most feats unlock something new: upgrades join your runs, cosmetics join your wardrobe.'),
      ...cats.map((cat) => h('div', { class: 'branch' }, h('h3', null, cat),
        ...FEATS.filter((f) => f.category === cat).map((f) => {
          const got = p.feats.includes(f.id);
          const pr = f.progress?.(p);
          const unl = featUnlocks(f.id);
          return h('div', { class: `card feat${got ? ' got' : ''}` },
            h('div', { class: 'row' }, h('span', { class: 'feat-ic' }, got ? '♜' : '♙'), h('b', null, f.name), h('div', { class: 'spacer' }), h('span', { class: 'tiny gold' }, featRewardText(f))),
            h('div', { class: 'small dim' }, f.description),
            unl.length ? h('div', { class: 'tiny', style: 'color:#a0e4e7' }, `Unlocks ${unl.join(', ')}`) : null,
            !got && pr ? h('div', { class: 'row' }, this.bar(pr[0], pr[1]), h('span', { class: 'tiny dim' }, `${pr[0]}/${pr[1]}`)) : null,
          );
        }))),
    )), 'menu');
  }

  showWardrobe(): void {
    const p = this.profile;
    const section = (kind: 'trail' | 'skin', title: string) => h('div', { class: 'branch' }, h('h3', null, title),
      h('div', { class: 'wardrobe' }, ...Content.lists.COSMETICS.filter((c) => c.kind === kind).map((c) => {
        const owned = p.cosmetics.owned.includes(c.id);
        const sel = (kind === 'trail' ? p.cosmetics.trail : p.cosmetics.skin) === c.id;
        const cols = c.colors.length ? c.colors : ['#ff8a3d', '#3aa7ff'];
        return h('button', {
          class: `cosmetic${sel ? ' selected' : ''}${owned ? '' : ' locked'}`,
          onclick: () => {
            if (!owned) return this.audio.denied();
            if (kind === 'trail') p.cosmetics.trail = c.id;
            else p.cosmetics.skin = c.id;
            this.audio.select();
            this.save();
            this.showWardrobe();
          },
        }, h('span', { class: `swatch ${kind}`, style: `background:${kind === 'trail' ? `linear-gradient(90deg, transparent, ${cols.join(',')})` : `radial-gradient(circle at 35% 30%, #fff, ${cols.join(',')}, #0b1018)`}` }),
        h('b', null, c.name), h('span', { class: 'tiny dim' }, owned ? c.description : `🔒 ${c.unlock}`));
      })));
    this.show(h('div', { class: 'screen' }, h('div', { class: 'wrap' },
      h('div', { class: 'row' }, this.back(() => this.showMenu())),
      h('h2', null, 'Wardrobe'),
      h('div', { class: 'small dim' }, 'Cosmetics never change how your ball plays. They are earned through levels, feats and core mastery.'),
      section('trail', 'Trails'), section('skin', 'Ball skins'),
    )), 'menu');
  }

  showSettings(onBack: () => void): void {
    const s = this.profile.settings;
    const slider = (label: string, key: 'sfxVolume' | 'musicVolume' | 'shake' | 'flash', hint?: string) =>
      h('div', { class: 'setting' }, h('div', null, label, hint ? h('div', { class: 'tiny dim' }, hint) : null),
        h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(s[key]), oninput: (e: Event) => { s[key] = Number((e.target as HTMLInputElement).value); this.applySettings(); } }));
    const toggle = (label: string, key: 'haptics' | 'reducedMotion' | 'highContrast' | 'bulletTime' | 'leftHanded' | 'showDamageNumbers' | 'analyticsOptIn' | 'assist' | 'elementBadges', hint?: string) =>
      h('div', { class: 'setting' }, h('div', null, label, hint ? h('div', { class: 'tiny dim' }, hint) : null),
        h('input', { type: 'checkbox', checked: s[key], onchange: (e: Event) => { s[key] = (e.target as HTMLInputElement).checked; this.audio.select(); this.applySettings(); } }));
    this.show(h('div', { class: 'screen' }, h('div', { class: 'wrap' },
      h('div', { class: 'row' }, this.back(() => (this.save(), onBack()))),
      h('h2', null, 'Settings'),
      h('h3', null, 'Audio'),
      h('div', { class: 'card' }, slider('Sound effects', 'sfxVolume'), slider('Music', 'musicVolume'), toggle('Haptics', 'haptics')),
      h('h3', null, 'Controls'),
      h('div', { class: 'card' },
        h('div', { class: 'setting' }, h('div', null, 'Launch sensitivity', h('div', { class: 'tiny dim' }, 'Drag distance for a full-power launch')),
          h('input', { type: 'range', min: '100', max: '320', step: '10', value: String(s.dragDistance), oninput: (e: Event) => { s.dragDistance = Number((e.target as HTMLInputElement).value); } })),
        toggle('Aim slow-motion', 'bulletTime', 'Time slows while you aim (uses focus)'),
        toggle('Left-handed HUD', 'leftHanded')),
      h('h3', null, 'Visuals & accessibility'),
      h('div', { class: 'card' },
        slider('Screen shake', 'shake'), slider('Flashes', 'flash'),
        toggle('Damage numbers', 'showDamageNumbers'),
        toggle('Element badges on every foe', 'elementBadges', 'Shape-coded element icons (colour-blind friendly)'),
        toggle('Reduced motion', 'reducedMotion', 'Calmer particles; no ambient motion, shake or flashes'),
        toggle('High contrast', 'highContrast'),
        toggle('Assist mode', 'assist', `Take ${Math.round(assistResistance({ ...this.profile, settings: { ...s, assist: true } }) * 100)}% less damage (+2% per defeat, max 60%). No penalties.`)),
      h('h3', null, 'Data'),
      h('div', { class: 'card' },
        toggle('Share anonymous stats', 'analyticsOptIn', 'Stored locally only; export for playtests'),
        h('div', { class: 'row wrap-row', style: 'margin-top:8px' },
          h('button', { class: 'small', onclick: () => { void navigator.clipboard?.writeText(this.analytics.export()); toast(this.root, 'Diagnostics copied to clipboard', undefined, 2400, '✓'); } }, 'Export diagnostics'),
          h('button', { class: 'small', onclick: () => { this.save(); void navigator.clipboard?.writeText(localStorage.getItem(SAVE_KEY) ?? ''); toast(this.root, 'Save copied to clipboard — keep it somewhere safe', undefined, 2800, '✓'); } }, 'Back up save'),
          h('button', { class: 'small', onclick: () => this.importSave() }, 'Restore save'),
        ),
        h('div', { class: 'row', style: 'margin-top:8px' }, h('div', { class: 'spacer' }),
          h('button', { class: 'small ghost', style: 'color:var(--bad)', onclick: async () => {
            if (await confirmDialog(this.root, 'Erase ALL progress?', 'This cannot be undone. Every discovery, unlock and record will be lost.', 'Erase everything', true)) {
              this.slot.wipe();
              this.profile = freshProfile();
              ensureContracts(this.profile);
              this.save();
              this.applySettings();
              this.showMenu();
            }
          } }, 'Erase progress'))),
      h('div', { class: 'tiny dim', style: 'text-align:center' }, `Alchemy Ball v${__APP_VERSION__} · save v${SAVE_VERSION}`),
    )), 'menu');
  }

  private importSave(): void {
    const area = h('textarea', { class: 'import', placeholder: 'Paste a save backup here…', rows: 5 });
    const el = h('div', { class: 'screen overlay modal-wrap' }, h('div', { class: 'modal' },
      h('h2', null, 'Restore save'), h('p', { class: 'small dim' }, 'This replaces your current progress.'), area,
      h('div', { class: 'row' }, h('button', { class: 'ghost', onclick: () => el.remove() }, 'Cancel'), h('div', { class: 'spacer' }),
        h('button', { class: 'primary', onclick: () => {
          const text = (area as HTMLTextAreaElement).value.trim();
          const prev = localStorage.getItem(SAVE_KEY);
          try {
            localStorage.setItem(SAVE_KEY, text);
            const loaded = this.slot.load();
            if (this.slot.lastLoadSource !== 'main') throw new Error('invalid');
            this.profile = loaded;
            el.remove();
            this.applySettings();
            toast(this.root, 'Save restored', '#7be07b', 2400, '✓');
            this.showMenu();
          } catch {
            if (prev) localStorage.setItem(SAVE_KEY, prev);
            toast(this.root, 'That does not look like a valid save.', '#ff5a5a', 2800, '!');
          }
        } }, 'Restore'))));
    this.root.append(el);
  }

  // ─── Laboratory ───────────────────────────────────────────────────────────
  showLabSetup(): void {
    const p = this.profile;
    const els = Content.lists.ELEMENTS.filter((e) => e.tier === 'base' && (p.seenElements.includes(e.id) || e.id === 'fire' || e.id === 'water'));
    this.show(h('div', { class: 'screen' }, h('div', { class: 'wrap' },
      h('div', { class: 'row' }, this.back(() => this.showMenu())),
      h('div', { class: 'room-hero' }, h('span', null, '⚗')),
      h('h2', null, 'Laboratory'),
      h('div', { class: 'small dim' }, 'A safe sandbox. Your ball cannot break here, and discoveries still count. Choose the element your ball carries:'),
      h('div', { class: 'grid3' }, ...els.map((e) => h('button', { class: 'lab-el', style: `--c:${e.color}`, onclick: () => (this.audio.confirm(), this.startLab(e.id)) }, h('span', null, e.glyph), e.name))),
    )), 'menu');
  }

  private startLab(core: string): void {
    const p = this.profile;
    const sources = ['brazier', 'font', 'coil', 'frost_crystal', 'iron_post', 'boulder', 'fan', 'toxic_barrel', 'rune'].filter((id) => {
      const el = Content.objects.get(id)!.element!;
      return p.seenElements.includes(el) || id === 'brazier' || id === 'font';
    });
    const spec = labEncounter(sources);
    this.screen?.remove();
    this.screen = null;
    const session = new Session(this, spec, 'lab', null, { coreElement: core, hp: 100, maxHp: 100, mods: {}, maxPips: 4, seed: 7, sandbox: true },
      () => { lab.remove(); this.session = null; this.save(); this.showMenu(); });
    this.session = session;
    const spawn = (id: string) => session.world.spawnEnemy(id, { x: 120 + Math.random() * 480, y: 140 + Math.random() * 200 });
    const seen = Object.keys(p.bestiary).filter((id) => Content.enemies.get(id) && !Content.enemies.get(id)!.tags.includes('boss'));
    const lab = h('div', { class: 'lab-panel' },
      ...['dummy', 'slime', 'beetle', 'bloat', ...seen.filter((x) => !['dummy', 'slime', 'beetle', 'bloat'].includes(x)).slice(0, 4)].map((id) =>
        h('button', { class: 'small', onclick: () => spawn(id) }, `+ ${Content.enemies.get(id)!.name.split(' ').at(-1)}`)),
      h('button', { class: 'small', onclick: () => { for (const e of session.world.enemies) e.dead = true; } }, 'Clear'),
    );
    this.root.append(lab);
  }
}

declare const __APP_VERSION__: string;
