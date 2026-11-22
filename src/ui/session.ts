import { Content } from '../content';
import { clamp, type Vec2 } from '../core/vec';
import { ChallengeTracker } from '../game/challenges';
import { featUnlocks } from '../game/feats';
import { potencyMap, unlockedIds } from '../game/profile';
import type { Run, RoomType } from '../game/run';
import { ProgressionTracker, type Notice } from '../game/tracker';
import type { AimState } from '../render/renderer';
import { PHYS } from '../sim/ballPhysics';
import type { SimEvent } from '../sim/events';
import { World, type Difficulty, type EncounterSpec } from '../sim/world';
import type { App } from './app';
import { clear, h, toast } from './dom';

export interface SessionEnd {
  cleared: boolean;
  cause?: string;
  hp: number;
  abandoned?: boolean;
  /** Optional room challenge completed. */
  challenge?: { catalysts: number; essence: number };
  /** Cleared without taking any damage. */
  noHit?: boolean;
}

/** Coach lines for handcrafted tutorial rooms, advanced by gameplay events rather than timers. */
const COACH: Record<string, { until: SimEvent['type'] | 'wave2'; text: string }[]> = {
  tutorial_launch: [
    { until: 'launch', text: 'Touch anywhere, pull back, and release to launch the ball.' },
    { until: 'hit', text: 'Aim at a dummy. The dotted line shows your path — the ghost ball shows where you will connect.' },
    { until: 'wave2', text: 'Faster impacts deal more damage. Launches use pips (top left), which recharge.' },
    { until: 'brake', text: 'Quick-tap (no drag) to brake. Enemies can only hurt you when you are slow. Drag back to the centre to cancel a shot.' },
  ],
  tutorial_react: [
    { until: 'reaction', text: 'Your Ember Core carries Fire. Slimes are always wet. Hit one and see what happens.' },
    { until: 'wave2', text: 'Every collision swaps elements. Touch the Spring Font (blue) to carry Water too.' },
    { until: 'cleared', text: 'Imps carry fire. Steam blinds shooters: they cannot fire from inside a cloud. Keep the ball moving to build a combo!' },
  ],
};

/** Combo tiers (research: colour + size thresholds at 5 / 10 / 20). */
function comboTier(n: number): { name: string; cls: string } {
  if (n >= 30) return { name: 'TRANSCENDENT', cls: 't4' };
  if (n >= 20) return { name: 'ALCHEMICAL', cls: 't3' };
  if (n >= 10) return { name: 'VOLATILE', cls: 't2' };
  if (n >= 5) return { name: 'REACTIVE', cls: 't1' };
  return { name: 'COMBO', cls: 't0' };
}

/**
 * One playable encounter: owns the World, fixed-step loop, input, HUD and in-run notices.
 * Real time drives presentation; simulated time is scaled for bullet time, hit-stop and
 * discovery slow-motion.
 */
export class Session {
  readonly world: World;
  readonly tracker: ProgressionTracker;
  readonly challenge?: ChallengeTracker;
  private acc = 0;
  private aim: AimState = { active: false, dir: { x: 0, y: -1 }, power: 0 };
  private dragStart: Vec2 | null = null;
  private dragCur: Vec2 | null = null;
  private hadAim = false;
  private pointerId: number | null = null;
  paused = false;
  private blocking = 0;
  private slowmo = 0;
  private endTimer = -1;
  private ended = false;
  private hud!: HTMLElement;
  private hudRefs: Record<string, HTMLElement> = {};
  private feed: { text: string; color: string; t: number }[] = [];
  private coachIdx = 0;
  private coachSteps: { until: string; text: string }[];
  private recentReactions = 0;
  private unsub: (() => void)[] = [];
  private shownEnemyIds = new Set<string>();
  private damaged = false;
  private challengeAnnounced = false;
  private heartbeat = 0;
  private comboShown = 0;
  private comboFade = 0;

  constructor(
    private app: App,
    readonly spec: EncounterSpec,
    readonly room: RoomType | 'lab',
    readonly run: Run | null,
    opts: { coreElement: string; hp: number; maxHp: number; mods: Record<string, number>; maxPips: number; seed: number; sandbox?: boolean; difficulty?: Partial<Difficulty> },
    private onEnd: (r: SessionEnd) => void,
  ) {
    const p = app.profile;
    app.fx.reset();
    this.world = new World({
      encounter: spec, coreElement: opts.coreElement, maxHp: opts.maxHp, hp: opts.hp, shell: run ? Content.shells.get(run.cfg.shell) : undefined,
      mods: opts.mods, unlocks: new Set(unlockedIds(p)), potency: potencyMap(p), maxPips: opts.maxPips, seed: opts.seed, sandbox: opts.sandbox, difficulty: opts.difficulty,
    });
    this.tracker = new ProgressionTracker(p, run, (n) => this.onNotice(n), !!opts.sandbox);
    this.coachSteps = COACH[room] ?? [];
    if (run && room !== 'lab') {
      const def = run.rollChallenge(room, spec.waves.length);
      if (def) this.challenge = new ChallengeTracker(def);
    }
    this.unsub.push(this.world.events.onAny((e) => this.onSim(e)));
    this.buildHud();
    this.bindInput();
    document.body.classList.add('in-game');
    const region = run?.region;
    app.audio.setScene(spec.boss ? 'boss' : 'combat', region?.id ?? 'cinder_marsh');
    app.renderer.style = {
      trail: Content.cosmetics.get(p.cosmetics.trail), skin: Content.cosmetics.get(p.cosmetics.skin),
      badges: p.settings.elementBadges, lens: p.research.includes('res_scanner'), known: new Set(Object.keys(p.discovered)),
    };
    if (spec.boss) this.bossIntro(spec.boss);
    else if (run && room !== 'lab') this.roomIntro();
  }

  // ─── Intros & banners ───────────────────────────────────────────────────────
  private roomIntro(): void {
    const run = this.run!;
    const label = run.cfg.mode === 'endless' ? `Depth ${run.floor + 1}` : `Floor ${run.floor + 1} of ${run.map.length}`;
    this.banner2(label, this.room === 'elite' ? 'ELITE ENCOUNTER' : run.region.name.toUpperCase(), this.room === 'elite' ? '#ffd23a' : run.region.palette.accent);
  }

  private bossIntro(id: string): void {
    const data = Content.bosses[id];
    if (!data) return;
    this.blocking++;
    this.app.audio.bossIntro();
    const el = h('div', { class: 'boss-intro' },
      h('div', { class: 'boss-intro-band' },
        h('div', { class: 'kicker' }, data.title.toUpperCase()),
        h('h2', null, data.name),
        h('div', { class: 'small dim' }, data.lesson)));
    let done = false;
    const close = () => {
      if (done) return;
      done = true;
      el.classList.add('out');
      this.blocking--;
      setTimeout(() => el.remove(), 400);
    };
    el.addEventListener('pointerdown', close);
    this.app.root.append(el);
    setTimeout(close, 2600);
  }

  /** Big centred banner (wave starts, cleared, challenge done). Non-blocking. */
  private banner2(title: string, sub: string, color: string): void {
    const b = h('div', { class: 'big-banner', style: `--c:${color}` }, h('div', { class: 'bb-sub' }, sub), h('div', { class: 'bb-title' }, title));
    this.app.root.append(b);
    setTimeout(() => b.remove(), 1700);
  }

  // ─── Events ───────────────────────────────────────────────────────────────
  private onSim(e: SimEvent): void {
    this.tracker.handle(e);
    this.app.fx.onEvent(e);
    this.app.audio.onEvent(e);
    this.app.haptics.onEvent(e);
    if (this.challenge && this.challenge.handle(e, this.world.time)) this.onChallengeDone();
    switch (e.type) {
      case 'reaction': {
        const r = Content.reactions.get(e.reactionId);
        this.recentReactions += 1;
        this.pushFeed(`${r?.name ?? e.reactionId}${e.depth ? ` ×${e.depth + 1}` : ''}`, e.color);
        this.app.analytics.track('reaction', e.reactionId);
        break;
      }
      case 'waveStart': {
        const ids = this.world.enemies.map((x) => x.def.id).filter((id) => !this.shownEnemyIds.has(id));
        for (const id of ids) this.shownEnemyIds.add(id);
        this.tracker.noteEnemiesSeen([...new Set(ids)]);
        for (const id of new Set(ids)) {
          const best = this.app.profile.bestiary[id];
          if (best && best.seen === 1) {
            const d = Content.enemies.get(id)!;
            toast(this.app.root, `New foe: ${d.name} — ${d.lesson}`, d.color, 4200, '◉');
          }
        }
        const affixed = this.world.enemies.filter((x) => x.affixes.length);
        if (affixed.length && e.wave === 1) {
          const names = [...new Set(affixed.flatMap((x) => x.affixes))].map((a) => Content.affixes.get(a)).filter(Boolean).map((a) => `${a!.glyph} ${a!.name}: ${a!.description}`);
          toast(this.app.root, names.join('  ·  '), '#ffb347', 4200, '⚠');
        }
        if (e.wave >= 2 && e.total > 1) this.banner2(`Wave ${e.wave}`, `OF ${e.total}`, '#a0e4e7');
        if (e.wave === 2) this.advanceCoach('wave2');
        break;
      }
      case 'bossPhase':
        this.banner2(`Phase ${e.phase}`, `AURA OF ${(Content.elements.get(e.element)?.name ?? e.element).toUpperCase()}`, Content.elements.get(e.element)?.color ?? '#fff');
        break;
      case 'ballDamaged':
        this.damaged = true;
        break;
      case 'ballDied':
        this.app.analytics.track('death', e.cause);
        this.app.audio.defeat();
        break;
      case 'cleared':
        // Peggle-style finale: a beat of slow motion and a camera punch on the last kill.
        this.slowmo = Math.max(this.slowmo, 0.55);
        this.app.fx.punchZoom(this.spec.boss ? 0.1 : 0.05, this.world.ball.pos);
        if (!this.spec.boss) this.banner2('Cleared', this.damaged ? 'ROOM COMPLETE' : 'UNTOUCHED', this.damaged ? '#7be07b' : '#ffd23a');
        else this.app.audio.victory();
        break;
      case 'combo':
        this.comboFade = 1.6;
        break;
      case 'comboEnd':
        if (e.count >= 5) this.pushFeed(`×${e.count} combo${e.essence ? ` +${e.essence}◆` : ''}`, '#ffd23a');
        break;
    }
    this.advanceCoach(e.type);
  }

  private onChallengeDone(): void {
    const c = this.challenge!;
    this.app.audio.challengeComplete();
    toast(this.app.root, `Challenge complete: ${c.def.text} — +${c.def.reward.catalysts} ⬡, +${c.def.reward.essence} ◆`, '#ffd23a', 3200, '★');
    this.tracker.milestone('challenge');
    this.app.profile.stats.challenges++;
    if (this.run) this.run.stats.challenges++;
  }

  private advanceCoach(type: string): void {
    const step = this.coachSteps[this.coachIdx];
    if (step && step.until === type) this.coachIdx++;
  }

  private onNotice(n: Notice): void {
    const p = this.app.profile;
    switch (n.kind) {
      case 'discovery': {
        this.app.audio.discovery();
        this.app.analytics.track('discovery', n.reactionId);
        this.slowmo = 0.7;
        this.app.renderer.style.known.add(n.reactionId);
        const total = Object.keys(p.discovered).length;
        // Early discoveries get a full card; later ones a banner so play is not interrupted.
        if (total <= 5 && !this.world.sandbox) this.showDiscoveryCard(n.reactionId, n.reward);
        else this.banner(n.reactionId, n.reward);
        this.app.save();
        break;
      }
      case 'mastery': {
        const r = Content.reactions.get(n.reactionId)!;
        this.app.audio.mastery();
        toast(this.app.root, `${r.name} mastery ${'★'.repeat(n.tier)} — +${[10, 20, 35][n.tier - 1]}% potency, +3 Fragments`, '#ffd23a', 2800, '★');
        this.app.save();
        break;
      }
      case 'element': {
        const el = Content.elements.get(n.element);
        if (el && el.tier !== 'hidden') toast(this.app.root, `${el.name}: ${el.description}`, el.color, 4200, el.glyph);
        break;
      }
      case 'stirred': {
        const [a, b] = n.pair.split('+').map((x) => Content.elements.get(x)?.name ?? x);
        toast(this.app.root, `Something stirred between ${a} and ${b}… but the conditions were not right.`, '#ffd23a', 3800, '!');
        break;
      }
      case 'levelUp':
        this.app.audio.levelUp();
        toast(this.app.root, `Level ${n.level}! ${n.reward}`, '#ffd23a', 3800, '▲');
        break;
      case 'feat': {
        this.app.audio.feat();
        const unl = featUnlocks(n.feat.id);
        toast(this.app.root, `Feat unlocked: ${n.feat.name}${unl.length ? ` — unlocks ${unl.join(', ')}` : ''}`, '#ffd23a', 4200, '♜', 'feat');
        this.app.save();
        break;
      }
      case 'contract':
        this.app.audio.challengeComplete();
        toast(this.app.root, `Contract complete: ${n.contract.text} — claim it in the hub`, '#7be0c0', 3600, '✓');
        break;
    }
  }

  private cardQueue: { id: string; reward: number }[] = [];

  /** Discovery cards are shown one at a time; simultaneous discoveries queue up. */
  private showDiscoveryCard(id: string, reward: number): void {
    this.cardQueue.push({ id, reward });
    if (this.cardQueue.length === 1) this.openCard();
  }

  private openCard(): void {
    const next = this.cardQueue[0];
    if (!next) return;
    const { id, reward } = next;
    const r = Content.reactions.get(id)!;
    const els = r.inputs.map((x) => (x === '*' ? '✱ any' : `${Content.elements.get(x)!.glyph} ${Content.elements.get(x)!.name}`));
    this.blocking++;
    const color = r.color ?? Content.elements.get(r.output?.element ?? r.inputs[0])?.color ?? '#fff';
    const card = h('div', { class: 'screen overlay' },
      h('div', { class: 'discovery', style: `--c:${color}` },
        h('div', { class: 'kicker' }, 'New reaction discovered'),
        h('h2', { style: `color:${color}` }, r.name),
        h('div', { class: 'formula' }, els.join('  +  ')),
        h('div', { class: 'tiny dim' }, `${r.category.toUpperCase()} REACTION · ${r.rarity}`),
        h('p', null, r.description),
        h('div', { class: 'next' }, '💡 Try next: ', r.followUp),
        h('p', { class: 'frag' }, `+${reward} Research Fragments · recorded in the Codex`),
        h('button', { class: 'primary', onclick: () => { card.remove(); this.blocking--; this.app.audio.confirm(); this.cardQueue.shift(); this.openCard(); } }, this.cardQueue.length > 1 ? `Next discovery (${this.cardQueue.length - 1} more)` : 'Continue'),
      ),
    );
    this.app.root.append(card);
  }

  private banner(id: string, reward: number): void {
    const r = Content.reactions.get(id)!;
    const b = h('div', { class: 'banner' }, h('div', { class: 'tiny', style: 'color:#c9a6ff;letter-spacing:2px' }, 'NEW DISCOVERY'), h('b', null, r.name), h('div', { class: 'small dim' }, `${r.followUp}  (+${reward} Fragments)`));
    this.app.root.append(b);
    setTimeout(() => b.remove(), 3300);
  }

  private pushFeed(text: string, color: string): void {
    this.feed.unshift({ text, color, t: 3 });
    if (this.feed.length > 5) this.feed.pop();
  }

  // ─── Input ────────────────────────────────────────────────────────────────
  private bindInput(): void {
    const c = this.app.renderer.canvas;
    const dead = 14;
    const down = (ev: PointerEvent) => {
      this.app.audio.unlock();
      if (this.paused || this.blocking || this.pointerId !== null) return;
      this.pointerId = ev.pointerId;
      c.setPointerCapture(ev.pointerId);
      this.dragStart = { x: ev.clientX, y: ev.clientY };
      this.dragCur = { ...this.dragStart };
      this.aim.active = false;
      this.hadAim = false;
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== this.pointerId || !this.dragStart) return;
      this.dragCur = { x: ev.clientX, y: ev.clientY };
      const dx = this.dragStart.x - this.dragCur.x;
      const dy = this.dragStart.y - this.dragCur.y;
      const len = Math.hypot(dx, dy);
      if (len > dead) {
        this.aim.active = true;
        this.hadAim = true;
        this.aim.dir = { x: dx / len, y: dy / len };
        this.aim.power = clamp(len / this.app.profile.settings.dragDistance, 0.15, 1);
        this.aim.anchor = this.dragStart;
        this.aim.cur = this.dragCur;
      } else if (this.aim.active) {
        // Dragged back into the dead zone: the shot is cancelled.
        this.aim.active = false;
        this.app.audio.aimEnd();
      }
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== this.pointerId) return;
      this.pointerId = null;
      if (this.aim.active) {
        if (this.world.launch(this.aim.dir, this.aim.power)) this.app.analytics.track('launch');
        else this.app.audio.denied();
      } else if (this.dragStart && !this.hadAim && !this.paused && !this.blocking) this.world.brake();
      this.app.audio.aimEnd();
      this.aim.active = false;
      this.dragStart = this.dragCur = null;
    };
    const cancel = (ev: PointerEvent) => {
      if (ev.pointerId !== this.pointerId) return;
      this.pointerId = null;
      this.aim.active = false;
      this.dragStart = null;
      this.app.audio.aimEnd();
    };
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', cancel);
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' || ev.key === 'p') this.togglePause();
    };
    window.addEventListener('keydown', key);
    const vis = () => {
      if (document.hidden && !this.paused) this.togglePause();
    };
    document.addEventListener('visibilitychange', vis);
    this.unsub.push(() => {
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key);
      document.removeEventListener('visibilitychange', vis);
    });
  }

  togglePause(): void {
    if (this.ended) return;
    this.paused = !this.paused;
    this.aim.active = false;
    this.pointerId = null;
    this.app.audio.aimEnd();
    if (this.paused) this.app.showPause(this);
    else this.app.hidePause();
  }

  // ─── Frame ────────────────────────────────────────────────────────────────
  frame(dtReal: number): void {
    const w = this.world;
    const fx = this.app.fx;
    const s = this.app.profile.settings;
    let scale = 1;
    if (this.paused || this.blocking) scale = 0;
    else {
      const b = w.ball;
      if (this.aim.active && s.bulletTime && b.focus > 0) {
        scale = 0.22;
        b.focus = Math.max(0, b.focus - dtReal);
      } else b.focus = Math.min(b.maxFocus, b.focus + dtReal * 0.5);
      if (this.slowmo > 0) {
        this.slowmo -= dtReal;
        scale = Math.min(scale, 0.25);
      }
      if (fx.hitstop > 0) {
        fx.hitstop -= dtReal;
        scale = 0.05;
      }
      if (this.aim.active) this.app.audio.aim(this.aim.power);
    }
    this.acc += Math.min(dtReal, 0.1) * scale;
    let steps = 0;
    while (this.acc >= PHYS.step && steps < 14) {
      w.step();
      this.acc -= PHYS.step;
      steps++;
    }
    if (this.run && scale > 0) this.run.stats.timeSec += dtReal * scale;
    if (!this.paused) fx.update(dtReal * (scale > 0 ? Math.max(scale, 0.3) : 0));
    this.challenge?.tick(w.time);
    this.tracker.flushFeats();
    this.recentReactions = Math.max(0, this.recentReactions - dtReal * 0.8);
    const hpFrac = w.ball.hp / w.ball.maxHp;
    this.app.renderer.danger = this.world.sandbox ? 0 : clamp((0.35 - hpFrac) / 0.35, 0, 1);
    if (hpFrac < 0.3 && !w.over && !this.paused && !this.world.sandbox) {
      this.heartbeat -= dtReal;
      if (this.heartbeat <= 0) {
        this.heartbeat = 0.6 + hpFrac * 2;
        this.app.audio.heartbeat();
      }
    }
    this.app.audio.update(dtReal, clamp(w.enemies.length / 8 + this.recentReactions / 6 + w.ball.combo / 30, 0, 1));
    this.app.renderer.draw(w, fx, this.run?.region, this.aim, this.paused || this.blocking ? 0 : dtReal);
    this.updateHud(dtReal);
    if (this.tracker.consumeDirty()) this.app.saveSoon();
    if (w.over && !this.ended) {
      if (this.endTimer < 0) this.endTimer = w.cleared ? 1.3 : 1.8;
      this.endTimer -= dtReal;
      if (this.endTimer <= 0 && !this.blocking) {
        const c = this.challenge;
        if (c && w.cleared && !c.done && !c.failed && c.def.kind === 'nohit' && !this.damaged) c.done = true;
        this.finish({
          cleared: w.cleared, cause: w.ball.dead ? this.deathCause() : undefined, hp: w.ball.hp,
          challenge: w.cleared && c?.done ? c.def.reward : undefined, noHit: w.cleared && !this.damaged,
        });
      }
    }
  }

  private lastDeathCause?: string;
  private deathCause(): string {
    return this.lastDeathCause ?? 'Unknown';
  }

  finish(r: SessionEnd): void {
    if (this.ended) return;
    this.ended = true;
    this.destroy();
    this.onEnd(r);
  }

  abandon(): void {
    this.finish({ cleared: false, cause: 'Abandoned', hp: this.world.ball.hp, abandoned: true });
  }

  destroy(): void {
    for (const u of this.unsub) u();
    this.unsub = [];
    this.hud?.remove();
    document.body.classList.remove('in-game');
    this.app.audio.aimEnd();
    this.app.renderer.danger = 0;
  }

  // ─── HUD ──────────────────────────────────────────────────────────────────
  private buildHud(): void {
    this.world.events.on('ballDied', (e) => (this.lastDeathCause = e.cause));
    const r: Record<string, HTMLElement> = {};
    const lefty = this.app.profile.settings.leftHanded;
    this.hud = h('div', { class: `hud${lefty ? ' lefty' : ''}` },
      h('div', { class: 'hud-top' },
        (r.hp = h('div', { class: 'hpbar' }, (r.hpGhost = h('b')), (r.hpFill = h('i')), (r.shield = h('s')), (r.hpText = h('span')))),
        (r.pips = h('div', { class: 'pips' })),
        (r.focus = h('div', { class: 'focus', title: 'Aiming focus (slow motion)' }, h('i'))),
        h('div', { class: 'spacer' }),
        h('button', { class: 'pause-btn', 'aria-label': 'Pause', onclick: () => this.togglePause() }, '❚❚'),
      ),
      (r.objective = h('div', { class: 'hud-objective' })),
      (r.challenge = h('div', { class: 'hud-challenge', style: 'display:none' })),
      (r.combo = h('div', { class: 'combo', style: 'display:none' }, (r.comboN = h('b')), (r.comboName = h('span')))),
      (r.boss = h('div', { class: 'boss-bar', style: 'display:none' }, (r.bossName = h('div', { class: 'small' })), h('div', { class: 'bar' }, (r.bossGhost = h('b')), (r.bossFill = h('i')), h('u', { style: 'left:66%' }), h('u', { style: 'left:33%' })))),
      (r.feed = h('div', { class: 'feed' })),
      (r.coach = h('div', { class: 'coach', style: 'display:none' })),
      (r.bottom = h('div', { class: 'hud-bottom' })),
    );
    this.hudRefs = r;
    this.app.root.append(this.hud);
  }

  private hudCache: Record<string, string> = {};
  /** Only touch the DOM when a HUD element's signature changed. */
  private set(key: string, fn: () => void, sig: string): void {
    if (this.hudCache[key] === sig) return;
    this.hudCache[key] = sig;
    fn();
  }

  private ghostHp = 1;
  private ghostBoss = 1;

  private updateHud(dt: number): void {
    const w = this.world;
    const b = w.ball;
    const r = this.hudRefs;
    const hpFrac = clamp(b.hp / b.maxHp, 0, 1);
    // The ghost bar trails the real HP so every hit visibly "bites".
    this.ghostHp = this.ghostHp > hpFrac ? Math.max(hpFrac, this.ghostHp - dt * 0.6) : hpFrac;
    r.hpGhost.style.transform = `scaleX(${this.ghostHp})`;
    this.set('hp', () => {
      r.hpFill.style.transform = `scaleX(${hpFrac})`;
      r.shield.style.transform = `scaleX(${clamp(b.shield / b.maxHp, 0, 1)})`;
      r.hpText.textContent = `${Math.ceil(b.hp)} / ${b.maxHp}${b.shield > 0 ? ` (+${Math.ceil(b.shield)})` : ''}`;
      r.hp.classList.toggle('low', hpFrac < 0.3);
    }, `${Math.ceil(b.hp)}|${Math.ceil(b.shield)}`);
    const pipSig = `${b.pips}|${b.maxPips}|${Math.round((b.pipTimer / PHYS.pipRegen) * 10)}`;
    this.set('pips', () => {
      clear(r.pips);
      for (let i = 0; i < b.maxPips; i++) {
        const full = i < b.pips;
        const pip = h('div', { class: `pip${full ? ' full' : ''}` });
        if (i === b.pips) pip.append(h('i', { style: `height:${(b.pipTimer / PHYS.pipRegen) * 100}%` }));
        r.pips.append(pip);
      }
    }, pipSig);
    (r.focus.firstChild as HTMLElement).style.width = `${(b.focus / b.maxFocus) * 100}%`;
    const chips = w.ballAuras().filter((a) => Content.elements.get(a.element)?.tier !== 'hidden' && a.amount > 0.05);
    const buffs = [...b.buffs.keys()];
    const statuses = [...b.statuses.keys()];
    this.set('chips', () => {
      clear(r.bottom);
      for (const a of chips) {
        const d = Content.elements.get(a.element)!;
        r.bottom.append(h('span', { class: 'chip', style: `border-color:${d.color};color:${d.color}` }, `${d.glyph} ${d.name}${a.element === b.coreElement ? ' ◆' : ''}`, h('span', { class: 'amt' }, h('i', { style: `width:${Math.min(100, a.amount * 100)}%;background:${d.color}` }))));
      }
      for (const bf of buffs) r.bottom.append(h('span', { class: 'chip', style: 'border-color:#fff27a;color:#fff27a' }, bf === 'ballLightning' ? 'ϟ Ball Lightning' : bf === 'ironstone' ? '■ Ironstone' : bf));
      for (const st of statuses) r.bottom.append(h('span', { class: 'chip', style: 'border-color:#bdf3ff;color:#bdf3ff' }, st));
    }, chips.map((c) => `${c.element}${Math.round(c.amount * 10)}`).join(',') + buffs.join() + statuses.join());
    const wavesTotal = w.spec.waves.length;
    const run = this.run;
    const floorLabel = run ? (run.cfg.mode === 'endless' ? `  ·  depth ${run.floor + 1}` : `  ·  floor ${run.floor + 1}/${run.map.length}`) : '';
    const obj = w.spec.objective + (wavesTotal > 1 && w.wave >= 0 ? `  ·  wave ${w.wave + 1}/${wavesTotal}` : '') + floorLabel;
    this.set('obj', () => (r.objective.textContent = obj), obj);
    if (this.challenge) {
      const c = this.challenge;
      const label = `★ ${c.label()}`;
      this.set('ch', () => {
        r.challenge.style.display = '';
        r.challenge.textContent = label;
        r.challenge.className = `hud-challenge${c.done ? ' done' : c.failed ? ' failed' : ''}`;
      }, label + c.done + c.failed);
      if (!this.challengeAnnounced && w.time > 0.5) {
        this.challengeAnnounced = true;
        r.challenge.classList.add('flash');
      }
    }
    // Combo meter: pops on each step, colours by tier, lingers briefly after the combo ends.
    const combo = b.combo;
    this.comboFade = combo > 0 ? 1.6 : Math.max(0, this.comboFade - dt);
    if (combo >= 2 || (this.comboFade > 0 && this.comboShown >= 2)) {
      const shown = combo >= 2 ? combo : this.comboShown;
      const tier = comboTier(shown);
      this.set('combo', () => {
        r.combo.style.display = '';
        r.comboN.textContent = `×${shown}`;
        r.comboName.textContent = tier.name;
        r.combo.className = `combo ${tier.cls}${combo === 0 ? ' fading' : ''}`;
        if (combo > 0) {
          r.combo.classList.remove('bump');
          void r.combo.offsetWidth;
          r.combo.classList.add('bump');
        }
      }, `${shown}|${combo === 0}`);
      if (combo >= 2) this.comboShown = combo;
    } else this.set('combo', () => (r.combo.style.display = 'none'), 'none');
    if (w.boss) {
      r.boss.style.display = '';
      const e = w.boss.enemy;
      const frac = clamp(e.hp / e.maxHp, 0, 1);
      this.ghostBoss = this.ghostBoss > frac ? Math.max(frac, this.ghostBoss - dt * 0.25) : frac;
      r.bossGhost.style.width = `${this.ghostBoss * 100}%`;
      const sig = `${Math.ceil(e.hp)}|${w.boss.phase}`;
      this.set('boss', () => {
        const el = Content.elements.get(w.boss!.phaseData.element);
        r.bossName.textContent = `${w.boss!.data.name} — ${el?.glyph ?? ''} phase ${w.boss!.phase + 1}`;
        r.bossName.style.color = el?.color ?? '';
        r.bossFill.style.width = `${frac * 100}%`;
      }, sig);
    }
    for (const f of this.feed) f.t -= dt;
    this.feed = this.feed.filter((f) => f.t > 0);
    const feedSig = this.feed.map((f) => f.text).join('|');
    this.set('feed', () => {
      clear(r.feed);
      for (const f of this.feed) r.feed.append(h('div', { style: `border-color:${f.color}` }, f.text));
    }, feedSig);
    const coach = this.coachSteps[this.coachIdx]?.text;
    this.set('coach', () => {
      r.coach.style.display = coach ? '' : 'none';
      r.coach.textContent = coach ?? '';
    }, coach ?? '');
  }
}
