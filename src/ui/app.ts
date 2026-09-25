import { Content } from '../content';
import type { UpgradeDef } from '../content/types';
import { Audio, Haptics } from '../audio/audio';
import { hashString } from '../core/rng';
import { Analytics } from '../game/analytics';
import {
  buyResearch, canAfford, createSaveSlot, SAVE_VERSION, freshProfile, nextLevel, researchState, unlockedCores, unlockedShells, type Profile,
} from '../game/profile';
import { finishRun, type RunSummary } from '../game/rewards';
import { dailyKey, dailySeed, labEncounter, ROOM_INFO, Run, type RoomType } from '../game/run';
import type { SaveSlot } from '../game/save';
import { Fx } from '../render/fx';
import { Renderer } from '../render/renderer';
import { renderCodex } from './codex';
import { h, toast } from './dom';
import { Session, type SessionEnd } from './session';

const RARITY_LABEL = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare' };

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
  private bankedEssence = 0;
  private screen: HTMLElement | null = null;
  private pauseEl: HTMLElement | null = null;
  private last = performance.now();
  private saveTimer: number | null = null;
  private quality = 1;
  private frameTimes: number[] = [];

  constructor(root: HTMLElement, canvas: HTMLCanvasElement) {
    this.root = root;
    this.renderer = new Renderer(canvas);
    this.slot = createSaveSlot(window.localStorage);
    this.profile = this.slot.load();
    this.analytics = new Analytics(window.localStorage);
    if (this.slot.lastLoadSource === 'backup') setTimeout(() => toast(this.root, 'Your save was damaged; restored the last good copy.', '#ffd23a', 5000), 500);
    this.applySettings();
    window.addEventListener('resize', () => this.renderer.resize(this.quality));
    window.addEventListener('pagehide', () => this.save());
    this.renderer.resize(this.quality);
    requestAnimationFrame((t) => this.loop(t));
    this.showMenu();
  }

  // ─── Persistence ──────────────────────────────────────────────────────────
  save(): void {
    try {
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
    this.fx.reducedMotion = s.reducedMotion;
    this.fx.damageNumbers = s.showDamageNumbers;
    this.renderer.highContrast = s.highContrast;
    this.analytics.enabled = s.analyticsOptIn;
    document.body.classList.toggle('hc', s.highContrast);
    document.body.classList.toggle('rm', s.reducedMotion);
  }

  // ─── Loop ─────────────────────────────────────────────────────────────────
  private loop(t: number): void {
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    if (this.session) {
      this.session.frame(dt);
      this.autoQuality(dt);
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
    }
  }

  // ─── Screen helpers ───────────────────────────────────────────────────────
  private show(el: HTMLElement): void {
    if (!this.session) this.renderer.clear();
    this.screen?.remove();
    this.screen = el;
    this.root.append(el);
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
    return h('button', { class: 'ghost small', onclick: () => (this.audio.ui(), fn()) }, label);
  }

  // ─── Menu ─────────────────────────────────────────────────────────────────
  showMenu(): void {
    const p = this.profile;
    const nl = nextLevel(p);
    const known = Object.keys(p.discovered).length;
    const hasLab = p.research.includes('res_lab');
    const hasDaily = p.research.includes('res_daily');
    const today = dailyKey(new Date());
    this.show(h('div', { class: 'screen' },
      h('div', { class: 'wrap' },
        h('div', { class: 'row' }, this.resBar(), h('div', { class: 'spacer' }), h('span', { class: 'pill' }, `Lv ${p.level}`)),
        h('div', { class: 'title' }, h('h1', null, 'Alchemy Ball'), h('div', { class: 'dim' }, 'Every collision changes the ball.')),
        h('div', { class: 'card small' },
          h('div', { class: 'row' }, h('span', null, `Reactions discovered: `, h('b', null, `${known}/${Content.lists.REACTIONS.length}`)), h('div', { class: 'spacer' }), h('span', { class: 'dim' }, nl ? `${p.xp}/${nl.xp} XP` : 'Max level')),
          p.stats.runs > 0 ? h('div', { class: 'dim tiny', style: 'margin-top:6px' }, `Runs ${p.stats.runs} · Wins ${p.stats.wins} · Best floor ${p.stats.bestFloor}`) : null,
        ),
        h('div', { class: 'menu-buttons' },
          h('button', { class: 'primary', onclick: () => (this.audio.unlock(), this.audio.ui(), p.tutorialDone ? this.showPrep() : this.startRun({ tutorial: true })) }, p.tutorialDone ? 'Begin Run' : 'Begin — First Experiment'),
          hasDaily ? h('button', { onclick: () => (this.audio.unlock(), this.startRun({ daily: true })) }, `Daily Experiment ${p.daily[today] ? `(best ${p.daily[today].score})` : ''}`) : null,
          h('button', { onclick: () => (this.audio.ui(), this.showCodex()) }, 'Alchemy Codex'),
          h('button', { onclick: () => (this.audio.ui(), this.showResearch()) }, 'Research'),
          hasLab ? h('button', { onclick: () => (this.audio.unlock(), this.showLabSetup()) }, 'Laboratory') : null,
          h('button', { class: 'ghost', onclick: () => (this.audio.ui(), this.showSettings(() => this.showMenu())) }, 'Settings'),
        ),
      ),
    ));
  }

  // ─── Run preparation ──────────────────────────────────────────────────────
  showPrep(): void {
    const p = this.profile;
    const cores = unlockedCores(p);
    const shells = unlockedShells(p);
    if (!cores.some((c) => c.id === p.loadout.core)) p.loadout.core = cores[0].id;
    const socketUnlocked = p.research.includes('res_catalyst_slot');
    const heatUnlocked = p.research.includes('res_heat');
    const render = () => {
      const coreCards = Content.lists.CORES.map((c) => {
        const unlocked = cores.includes(c);
        const el = Content.elements.get(c.element)!;
        const req = c.unlock ? Content.research.get(c.unlock)?.name : '';
        return h('div', {
          class: `card selectable${p.loadout.core === c.id ? ' selected' : ''}${unlocked ? '' : ' locked'}`,
          onclick: () => { if (unlocked) { p.loadout.core = c.id; this.audio.ui(); render(); } },
        },
          h('div', { class: 'row' }, h('span', { style: `font-size:22px;color:${el.color}` }, el.glyph), h('b', null, c.name)),
          h('div', { class: 'tiny', style: `color:${el.color}` }, c.archetype),
          h('div', { class: 'tiny dim' }, unlocked ? c.description : `Locked — research ${req}`),
        );
      });
      const shellRow = shells.length > 1 ? h('div', null, h('h3', null, 'Shell'), h('div', { class: 'grid2', style: 'margin-top:6px' },
        ...shells.map((s) => h('div', { class: `card selectable small${p.loadout.shell === s.id ? ' selected' : ''}`, onclick: () => { p.loadout.shell = s.id; render(); } }, h('b', null, s.name), h('div', { class: 'tiny dim' }, s.description))))) : null;
      const socketRow = socketUnlocked ? h('div', null, h('h3', null, 'Catalyst Socket'), h('div', { class: 'tiny dim' }, 'Start with one common upgrade you have seen before.'),
        h('div', { class: 'row wrap-row', style: 'margin-top:6px' },
          h('button', { class: `small${!p.loadout.socket ? ' primary' : ''}`, onclick: () => { p.loadout.socket = undefined; render(); } }, 'None'),
          ...Content.lists.UPGRADES.filter((u) => u.rarity === 'common').map((u) => h('button', { class: `small${p.loadout.socket === u.id ? ' primary' : ''}`, onclick: () => { p.loadout.socket = u.id; render(); } }, u.name)))) : null;
      const heatRow = heatUnlocked ? h('div', { class: 'card' }, h('div', { class: 'row' }, h('b', null, `Heat ${p.heat}`), h('div', { class: 'spacer' }),
        h('button', { class: 'small', disabled: p.heat <= 0, onclick: () => { p.heat--; render(); } }, '−'),
        h('button', { class: 'small', disabled: p.heat >= Math.min(5, p.maxHeatWon + 1), onclick: () => { p.heat++; render(); } }, '+')),
        h('div', { class: 'tiny dim' }, p.heat ? `More enemies, −${p.heat * 5} max HP, +${p.heat * 15}% Essence, +${p.heat} Mastery Mark on victory.` : 'Win a run to raise the Heat further.')) : null;
      this.show(h('div', { class: 'screen' }, h('div', { class: 'wrap' },
        h('div', { class: 'row' }, this.back(() => this.showMenu()), h('div', { class: 'spacer' }), this.resBar()),
        h('h2', null, 'Prepare your ball'),
        h('div', { class: 'small dim' }, 'Your core is the element your ball always carries. Pick up others from the arena.'),
        h('div', { class: 'grid2' }, ...coreCards),
        shellRow, socketRow, heatRow,
        h('button', { class: 'primary', onclick: () => (this.audio.ui(), this.save(), this.startRun({})) }, `Enter ${Content.regions.get('cinder_marsh')!.name}`),
      )));
    };
    render();
  }

  startRun(o: { tutorial?: boolean; daily?: boolean }): void {
    const p = this.profile;
    const today = new Date();
    let core = o.tutorial ? 'ember' : p.loadout.core;
    let seed = (Date.now() ^ hashString(String(Math.random()))) >>> 0;
    if (o.daily) {
      seed = dailySeed(today);
      // Daily uses a fixed core for everyone (even if not yet unlocked) for a fair, comparable ruleset.
      core = Content.lists.CORES[seed % Content.lists.CORES.length].id;
    }
    this.run = new Run({
      seed, mode: o.daily ? 'daily' : 'standard', regionId: 'cinder_marsh', core, shell: o.daily || o.tutorial ? 'glass' : p.loadout.shell,
      heat: o.daily ? 1 : o.tutorial ? 0 : p.heat, tutorial: !!o.tutorial, maxPips: 3 + (p.research.includes('res_pip') ? 1 : 0),
      rerolls: p.research.includes('res_reroll') ? 1 : 0, socket: o.daily || o.tutorial ? undefined : p.loadout.socket,
    });
    this.bankedEssence = 0;
    this.analytics.track('runStart', core);
    this.showMap();
  }

  // ─── Map ──────────────────────────────────────────────────────────────────
  showMap(): void {
    const run = this.run!;
    if (run.finished) return this.endRun(true);
    const floors = run.map.map((choices, i) =>
      h('div', { class: `floor-dot${i < run.floor ? ' done' : i === run.floor ? ' here' : ''}`, title: choices.map((c) => ROOM_INFO[c].name).join(' / ') },
        i < run.floor ? ROOM_INFO[run.path[i]].icon : choices.length === 1 ? ROOM_INFO[choices[0]].icon : '?'));
    const core = Content.cores.get(run.cfg.core)!;
    const ups = [...run.upgrades.keys()].map((id) => Content.upgrades.get(id)!).filter(Boolean);
    this.show(h('div', { class: 'screen' }, h('div', { class: 'wrap' },
      h('div', { class: 'row' }, h('b', null, run.region.name), h('div', { class: 'spacer' }), h('span', { class: 'pill' }, `❤ ${Math.ceil(run.hp)}/${run.maxHp}`), h('span', { class: 'pill cata' }, `⬡ ${run.catalysts}`)),
      h('div', { class: 'floors' }, ...floors),
      h('h2', null, run.floor === 0 ? 'The marsh awaits' : 'Choose your path'),
      ...run.choices.map((room) => h('div', { class: 'card selectable room-card', onclick: () => (this.audio.ui(), this.enterRoom(room)) },
        h('div', { class: 'ic' }, ROOM_INFO[room].icon),
        h('div', null, h('b', null, ROOM_INFO[room].name), h('div', { class: 'small dim' }, ROOM_INFO[room].blurb)))),
      h('div', { class: 'card small' },
        h('div', null, h('b', null, core.name), h('span', { class: 'dim' }, ` · ${core.archetype}`)),
        ups.length ? h('div', { class: 'row wrap-row', style: 'margin-top:6px' }, ...ups.map((u) => h('span', { class: 'pill', title: u.description }, `${u.name}${(run.upgrades.get(u.id) ?? 0) > 1 ? ` ×${run.upgrades.get(u.id)}` : ''}`))) : h('div', { class: 'tiny dim' }, 'No upgrades yet.'),
      ),
      h('button', { class: 'ghost small', onclick: () => { if (confirm('Abandon this run? You keep discoveries and banked Essence.')) this.endRun(false, 'Abandoned'); } }, 'Abandon run'),
    )));
  }

  enterRoom(room: RoomType): void {
    const run = this.run!;
    run.enter(room);
    this.analytics.track('room', room);
    if (room === 'rest') return this.showRest();
    if (room === 'research') return this.showResearchCache();
    if (room === 'treasure') return this.showUpgradePick('rare');
    const spec = run.generateEncounter(room);
    this.screen?.remove();
    this.screen = null;
    const coreEl = Content.cores.get(run.cfg.core)!.element;
    this.session = new Session(this, spec, room, run,
      { coreElement: coreEl, hp: run.hp, maxHp: run.maxHp, mods: run.mods(), maxPips: run.maxPips, seed: run.rng.int(0, 2 ** 30) },
      (r) => this.onRoomEnd(room, r));
  }

  private onRoomEnd(room: RoomType, r: SessionEnd): void {
    const run = this.run!;
    this.session = null;
    this.hidePause();
    run.hp = r.hp;
    this.bankEssence();
    if (!r.cleared) return this.endRun(false, r.cause);
    if (room === 'boss') {
      run.completeRoom();
      return this.endRun(true);
    }
    run.hp = Math.min(run.maxHp, run.hp + 8);
    if (room === 'elite') run.catalysts += 2;
    else run.catalysts += 1;
    this.save();
    this.showUpgradePick(room === 'elite' ? 'elite' : 'normal');
  }

  private bankEssence(): void {
    const run = this.run!;
    const delta = run.stats.essence - this.bankedEssence;
    if (delta > 0) this.profile.essence += delta;
    this.bankedEssence = run.stats.essence;
    this.save();
  }

  // ─── Rooms without combat ─────────────────────────────────────────────────
  showUpgradePick(quality: 'normal' | 'elite' | 'rare'): void {
    const run = this.run!;
    const unlocked = (id?: string) => !id || this.profile.research.includes(id);
    let offers = run.offerUpgrades(3, quality, unlocked);
    const render = () => {
      const card = (o: { def: UpgradeDef; synergy?: string }) => {
        const stacks = run.upgrades.get(o.def.id) ?? 0;
        const els = o.def.elements.map((e) => Content.elements.get(e)!);
        return h('div', { class: 'card selectable offer', onclick: () => { this.audio.ui(); run.addUpgrade(o.def.id); this.analytics.track('upgradePick', o.def.id); this.afterRoom(); } },
          h('div', { class: 'row' }, h('span', { class: `rar ${o.def.rarity}` }, RARITY_LABEL[o.def.rarity]), h('div', { class: 'spacer' }), ...els.map((e) => h('span', { style: `color:${e.color}` }, e.glyph))),
          h('b', null, o.def.name + (stacks ? ` (${stacks + 1}/${o.def.maxStacks})` : '')),
          h('div', { class: 'small' }, o.def.description),
          o.synergy ? h('div', { class: 'syn' }, `★ ${o.synergy}`) : null,
          h('div', { class: 'tiny dim' }, o.def.tags.join(' · ')),
        );
      };
      this.show(h('div', { class: 'screen' }, h('div', { class: 'wrap' },
        h('div', { class: 'row' }, h('h2', null, quality === 'rare' ? 'Reliquary' : 'Choose an upgrade'), h('div', { class: 'spacer' }), h('span', { class: 'pill cata' }, `⬡ ${run.catalysts} Catalysts`)),
        h('div', { class: 'small dim' }, 'Upgrades last for this run only.'),
        ...offers.map(card),
        h('div', { class: 'row' },
          h('button', { class: 'small', disabled: run.rerolls <= 0 && run.catalysts < 1, onclick: () => {
            if (run.rerolls > 0) run.rerolls--;
            else run.catalysts--;
            offers = run.offerUpgrades(3, quality, unlocked);
            render();
          } }, run.rerolls > 0 ? `Reroll (free ×${run.rerolls})` : 'Reroll (1 ⬡)'),
          h('div', { class: 'spacer' }),
          h('button', { class: 'ghost small', onclick: () => { run.catalysts += 1; this.afterRoom(); } }, 'Skip (+1 ⬡)'),
        ),
      )));
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
    const heal = Math.round(run.maxHp * 0.35);
    this.show(h('div', { class: 'screen' }, h('div', { class: 'wrap' },
      h('h2', null, '♨ Still Spring'), h('div', { class: 'dim small' }, 'Warm water hums with residual alchemy.'),
      h('div', { class: 'card selectable', onclick: () => { run.hp = Math.min(run.maxHp, run.hp + heal); this.afterRoom(); } }, h('b', null, `Rest: heal ${heal} HP`), h('div', { class: 'small dim' }, `❤ ${Math.ceil(run.hp)}/${run.maxHp}`)),
      h('div', { class: 'card selectable', onclick: () => { run.maxHp += 12; run.hp += 12; this.afterRoom(); } }, h('b', null, 'Temper: +12 max HP'), h('div', { class: 'small dim' }, 'A sturdier shell for the rest of the run.')),
      h('div', { class: `card selectable${run.catalysts < 3 ? ' locked' : ''}`, onclick: () => { if (run.catalysts >= 3) { run.catalysts -= 3; this.showUpgradePick('rare'); } } },
        h('b', null, 'Distill: 3 ⬡ → rare upgrade choice'), h('div', { class: 'small dim' }, `You have ${run.catalysts} Catalysts.`)),
    )));
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
      h('h2', null, '⚗ Research Cache'),
      h('div', { class: 'card' },
        h('p', { class: 'frag' }, '+4 Research Fragments'),
        pick ? h('div', null, h('div', { class: 'small dim' }, 'A scorched notebook describes an experiment:'), h('p', null, `“${pick.hint}”`),
          h('div', { class: 'small' }, `It involves ${ins.join(' and ')}.`), h('div', { class: 'tiny dim' }, 'The hint is now in your Codex.')) : h('p', null, 'Nothing new to learn here — you have seen it all.'),
      ),
      h('button', { class: 'primary', onclick: () => this.afterRoom() }, 'Continue'),
    )));
  }

  // ─── Run end ──────────────────────────────────────────────────────────────
  endRun(won: boolean, cause?: string): void {
    const run = this.run!;
    this.session?.destroy();
    this.session = null;
    this.bankEssence();
    const summary = finishRun(this.profile, run, won, cause);
    if (run.cfg.mode === 'daily') {
      const key = dailyKey(new Date());
      const score = run.stats.kills * 10 + run.stats.reactions * 2 + (won ? 500 : 0) + run.floor * 50;
      const prev = this.profile.daily[key];
      if (!prev || score > prev.score) this.profile.daily[key] = { score, won };
    }
    this.analytics.track(won ? 'runWon' : 'runLost', run.cfg.core);
    this.save();
    this.showResults(summary);
  }

  private showResults(s: RunSummary): void {
    const run = this.run!;
    const disc = s.discoveries.map((id) => Content.reactions.get(id)!);
    this.show(h('div', { class: 'screen' }, h('div', { class: 'wrap' },
      h('div', { class: 'title', style: 'margin:2vh 0 0' }, h('h1', { style: `font-size:34px;color:${s.won ? 'var(--gold)' : 'var(--text)'}` }, s.won ? 'Victory' : 'The ball shattered')),
      !s.won && s.cause ? h('div', { class: 'card' }, h('b', null, `Cause: ${s.cause}`), s.causeAdvice ? h('div', { class: 'small dim' }, s.causeAdvice) : null) : null,
      h('div', { class: 'stat-grid' },
        h('div', null, 'Floor', h('b', null, `${Math.min(s.floorReached, run.map.length)}/${run.map.length}`)),
        h('div', null, 'Reactions', h('b', null, run.stats.reactions)),
        h('div', null, 'Kills', h('b', null, run.stats.kills)),
        h('div', null, 'Longest chain', h('b', null, run.stats.maxChainDepth + 1)),
      ),
      h('div', { class: 'card' }, h('h3', null, 'Rewards (kept forever)'),
        h('div', { class: 'res', style: 'margin-top:6px' }, h('span', { class: 'essence' }, `◆ +${s.essence} Essence`), h('span', { class: 'frag' }, `✦ +${s.fragments} Fragments`), s.marks ? h('span', { class: 'marks' }, `♛ +${s.marks}`) : null)),
      disc.length ? h('div', { class: 'card' }, h('h3', null, `New discoveries (${disc.length})`), ...disc.map((r) => h('div', { class: 'small', style: 'margin-top:4px' }, h('b', null, r.name), h('span', { class: 'dim' }, ` — ${r.followUp}`)))) : h('div', { class: 'card small dim' }, 'No new reactions this time. Check the Codex for hints — yellow cells mean you were close.'),
      s.topReactions.length ? h('div', { class: 'small dim' }, 'Your go-to reactions: ', s.topReactions.map((t) => `${Content.reactions.get(t.id)?.name} ×${t.count}`).join(', ')) : null,
      h('div', { class: 'card' }, h('div', { class: 'tiny dim' }, 'NEXT GOAL'), h('div', null, s.nextGoal)),
      h('button', { class: 'primary', onclick: () => (this.audio.ui(), this.showPrep()) }, 'Next run'),
      h('div', { class: 'grid2' },
        h('button', { onclick: () => this.showResearch() }, 'Research'),
        h('button', { onclick: () => this.showCodex() }, 'Codex')),
      h('button', { class: 'ghost', onclick: () => this.showMenu() }, 'Main menu'),
    )));
    this.run = null;
  }

  // ─── Pause ────────────────────────────────────────────────────────────────
  showPause(s: Session): void {
    this.hidePause();
    this.pauseEl = h('div', { class: 'screen overlay' }, h('div', { class: 'wrap', style: 'max-width:360px' },
      h('h2', { style: 'text-align:center' }, 'Paused'),
      h('button', { class: 'primary', onclick: () => s.togglePause() }, 'Resume'),
      h('button', { onclick: () => { this.hidePause(); this.showCodex(() => this.showPause(s)); } }, 'Codex'),
      h('button', { onclick: () => { this.hidePause(); this.showSettings(() => { this.screen?.remove(); this.screen = null; this.showPause(s); }); } }, 'Settings'),
      h('button', { class: 'ghost', onclick: () => { if (s.room === 'lab' || confirm('Abandon the run? Discoveries and banked Essence are kept.')) { this.hidePause(); s.abandon(); } } }, s.room === 'lab' ? 'Leave laboratory' : 'Abandon run'),
    ));
    this.root.append(this.pauseEl);
  }

  hidePause(): void {
    this.pauseEl?.remove();
    this.pauseEl = null;
  }

  // ─── Codex / Research / Settings ──────────────────────────────────────────
  showCodex(onBack?: () => void): void {
    const el = h('div', { class: 'screen' });
    this.show(el);
    renderCodex(el, this.profile, () => (this.audio.ui(), onBack ? (this.screen?.remove(), (this.screen = null), onBack()) : this.showMenu()));
  }

  showResearch(): void {
    const p = this.profile;
    const branches: { id: 'elements' | 'ball' | 'lab' | 'world'; name: string }[] = [
      { id: 'elements', name: 'Elements' }, { id: 'ball', name: 'Ball' }, { id: 'lab', name: 'Laboratory' }, { id: 'world', name: 'World' },
    ];
    const cost = (c: { fragments?: number; essence?: number; marks?: number }) =>
      [c.fragments && `✦${c.fragments}`, c.essence && `◆${c.essence}`, c.marks && `♛${c.marks}`].filter(Boolean).join(' ');
    this.show(h('div', { class: 'screen' }, h('div', { class: 'wrap' },
      h('div', { class: 'row' }, this.back(() => this.showMenu()), h('div', { class: 'spacer' }), this.resBar()),
      h('h2', null, 'Alchemical Research'),
      h('div', { class: 'small dim' }, 'Permanent. Research opens new options — cores, slots, tools and challenges — never raw power.'),
      ...branches.map((b) => h('div', { class: 'branch' }, h('h3', null, b.name),
        ...Content.lists.RESEARCH.filter((n) => n.branch === b.id).map((n) => {
          const st = researchState(p, n);
          const afford = canAfford(p, n.cost);
          return h('div', { class: `card node ${st}` },
            h('div', { class: 'row' }, h('b', null, n.name), h('div', { class: 'spacer' }), st === 'owned' ? h('span', { class: 'pill', style: 'color:var(--good)' }, 'Owned') : h('span', { class: 'pill' }, cost(n.cost))),
            h('div', { class: 'small' }, n.grants),
            h('div', { class: 'tiny dim' }, n.description),
            st === 'locked' ? h('div', { class: 'tiny dim' }, `Requires: ${n.requires.map((r) => Content.research.get(r)?.name).join(', ')}`) : null,
            st === 'available' ? h('button', { class: afford ? 'primary small' : 'small', disabled: !afford, onclick: () => { if (buyResearch(p, n.id)) { this.audio.mastery(); this.analytics.track('research', n.id); this.save(); this.showResearch(); } } }, afford ? 'Research' : 'Not enough') : null,
          );
        }))),
    )));
  }

  showSettings(onBack: () => void): void {
    const s = this.profile.settings;
    const slider = (label: string, key: 'sfxVolume' | 'musicVolume', hint?: string) =>
      h('div', { class: 'setting' }, h('div', null, label, hint ? h('div', { class: 'tiny dim' }, hint) : null),
        h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(s[key]), oninput: (e: Event) => { s[key] = Number((e.target as HTMLInputElement).value); this.applySettings(); } }));
    const toggle = (label: string, key: 'haptics' | 'reducedMotion' | 'highContrast' | 'bulletTime' | 'leftHanded' | 'showDamageNumbers' | 'analyticsOptIn', hint?: string) =>
      h('div', { class: 'setting' }, h('div', null, label, hint ? h('div', { class: 'tiny dim' }, hint) : null),
        h('input', { type: 'checkbox', checked: s[key], onchange: (e: Event) => { s[key] = (e.target as HTMLInputElement).checked; this.applySettings(); } }));
    this.show(h('div', { class: 'screen' }, h('div', { class: 'wrap' },
      h('div', { class: 'row' }, this.back(() => (this.save(), onBack()))),
      h('h2', null, 'Settings'),
      h('div', { class: 'card' },
        slider('Sound effects', 'sfxVolume'),
        slider('Music', 'musicVolume'),
        h('div', { class: 'setting' }, h('div', null, 'Launch sensitivity', h('div', { class: 'tiny dim' }, 'Drag distance for a full-power launch')),
          h('input', { type: 'range', min: '100', max: '320', step: '10', value: String(s.dragDistance), oninput: (e: Event) => { s.dragDistance = Number((e.target as HTMLInputElement).value); } })),
        toggle('Aim slow-motion', 'bulletTime', 'Time slows while you aim (uses focus)'),
        toggle('Haptics', 'haptics'),
        toggle('Left-handed HUD', 'leftHanded'),
        toggle('Damage numbers', 'showDamageNumbers'),
        toggle('Reduced motion', 'reducedMotion', 'No screen shake or flashes'),
        toggle('High contrast', 'highContrast'),
        toggle('Share anonymous stats', 'analyticsOptIn', 'Stored locally only; export for playtests'),
      ),
      h('div', { class: 'row' },
        h('button', { class: 'small', onclick: () => { const data = this.analytics.export(); void navigator.clipboard?.writeText(data); toast(this.root, 'Diagnostics copied to clipboard'); } }, 'Export diagnostics'),
        h('div', { class: 'spacer' }),
        h('button', { class: 'small ghost', style: 'color:var(--bad)', onclick: () => {
          if (confirm('Erase ALL progress? This cannot be undone.') && confirm('Really erase everything?')) {
            this.slot.wipe();
            this.profile = freshProfile();
            this.save();
            this.applySettings();
            this.showMenu();
          }
        } }, 'Erase progress'),
      ),
      h('div', { class: 'tiny dim', style: 'text-align:center' }, `Alchemy Ball v${__APP_VERSION__} · save v${SAVE_VERSION}`),
    )));
  }

  // ─── Laboratory ───────────────────────────────────────────────────────────
  showLabSetup(): void {
    const p = this.profile;
    const els = Content.lists.ELEMENTS.filter((e) => e.tier === 'base' && (p.seenElements.includes(e.id) || e.id === 'fire' || e.id === 'water'));
    this.show(h('div', { class: 'screen' }, h('div', { class: 'wrap' },
      h('div', { class: 'row' }, this.back(() => this.showMenu())),
      h('h2', null, 'Laboratory'),
      h('div', { class: 'small dim' }, 'A safe sandbox. Your ball cannot break here, and discoveries still count. Choose the element your ball carries:'),
      h('div', { class: 'grid3' }, ...els.map((e) => h('button', { style: `color:${e.color}`, onclick: () => this.startLab(e.id) }, `${e.glyph} ${e.name}`))),
    )));
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
    const lab = h('div', { class: 'lab-panel' },
      h('button', { class: 'small', onclick: () => spawn('dummy') }, '+ Dummy'),
      h('button', { class: 'small', onclick: () => spawn('slime') }, '+ Slime'),
      h('button', { class: 'small', onclick: () => spawn('beetle') }, '+ Beetle'),
      h('button', { class: 'small', onclick: () => spawn('bloat') }, '+ Bloat'),
      h('button', { class: 'small', onclick: () => { for (const e of session.world.enemies) e.dead = true; } }, 'Clear'),
    );
    this.root.append(lab);
  }
}

declare const __APP_VERSION__: string;

