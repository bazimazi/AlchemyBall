import { Content } from '../content';
import type { SimEvent } from '../sim/events';

/*
 * Procedural WebAudio engine. Every sound is synthesized (no assets).
 *
 * Graph:   [per-sound voices] -> (StereoPanner) -> sfx --------------------\
 *          [chimes/sparkles]  -> bright -> sfx  + sfxEcho -> sfx           +-> master -> compressor -> out
 *          [scene voices] -> scene.out -> duck -> music (volume) ---------/
 *                            scene.lead -> musicEcho -> duck
 *
 * Design rules (mobile-friendly): voices are short-lived oscillators / slices of one shared noise
 * buffer, created per note and stopped; every SFX category has a voice cap + cooldown; every SFX
 * gets slight random pitch variation; music uses a lookahead scheduler on the AudioContext clock
 * and schedules nothing while the context is suspended or the tab is hidden.
 */

export type MusicScene = 'menu' | 'map' | 'combat' | 'boss' | 'results' | 'none';

// ---------------------------------------------------------------------------------------------
// Tables & helpers
// ---------------------------------------------------------------------------------------------

const ARENA_W = 720;
const LOOKAHEAD = 0.1; // seconds of music scheduled ahead
const SCHEDULE_MS = 25;
const XFADE = 1.5; // scene crossfade seconds

/** Base pitch per element so each element has a recognizable sonic signature. */
const ELEMENT_NOTE: Record<string, number> = {
  fire: 220, water: 262, ice: 523, lightning: 330, metal: 147, earth: 98, wind: 392, poison: 185, arcane: 440, steam: 294, mud: 110, magma: 165,
};

/** Major-pentatonic ladder (semitones): combo climb, count-up ticks, chain depth. Tops out at +2 octaves. */
const LADDER = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const AEOLIAN = [0, 2, 3, 5, 7, 8, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];

/** Per-region musical identity. `root` = tonic MIDI note (octave 2–3); `comboRoot` = relative-major root for stingers. */
interface RegionSound {
  root: number;
  scale: number[];
  bpm: number;
  /** Chord roots as scale degrees (0-based), one per bar (two bars in calm scenes). */
  prog: number[];
  comboRoot: number;
  pad: OscillatorType;
  padVol: number;
  lead: 'wood' | 'glass' | 'wire';
  bass: OscillatorType;
  /** Base low-pass cutoff (Hz) — timbre brightness. */
  bright: number;
}

const REGION_SOUND: Record<string, RegionSound> = {
  // Warm, earthy: D dorian (i – IV – i – VII), soft triangles.
  cinder_marsh: { root: 50, scale: DORIAN, bpm: 96, prog: [0, 3, 0, 6], comboRoot: 72, pad: 'triangle', padVol: 1, lead: 'wood', bass: 'triangle', bright: 1100 },
  // Glassy, bell-like: E aeolian (i – VI – III – VII), FM bells.
  frostvein: { root: 52, scale: AEOLIAN, bpm: 88, prog: [0, 5, 2, 6], comboRoot: 67, pad: 'sine', padVol: 1.1, lead: 'glass', bass: 'sine', bright: 2600 },
  // Driving, saw-ish: A phrygian (i – bII – i – bVII).
  storm_spire: { root: 45, scale: PHRYGIAN, bpm: 112, prog: [0, 1, 0, 6], comboRoot: 65, pad: 'sawtooth', padVol: 0.6, lead: 'wire', bass: 'sawtooth', bright: 1500 },
  umbral_archive: { root: 48, scale: AEOLIAN, bpm: 102, prog: [0, 5, 3, 4], comboRoot: 72, pad: 'triangle', padVol: 0.88, lead: 'glass', bass: 'sine', bright: 1900 },
};
const DEFAULT_REGION = 'cinder_marsh';
const BOSS_PROG = [0, 0, 5, 1];
const TEMPO: Record<MusicScene, number> = { menu: 0.75, map: 0.85, combat: 1, boss: 1.15, results: 0.7, none: 1 };
// One phrase per measure, with rests left open for the lead's delay.
const CALM_PHRASES: Partial<Record<MusicScene, readonly (readonly number[])[]>> = {
  menu: [[0, -1, -1, 2, -1, 4, -1, 3], [1, -1, 2, -1, 0, -1, -1, -1]],
  map: [[0, -1, 2, 3, -1, 4, 3, -1], [1, -1, 2, -1, 4, 2, -1, -1]],
  results: [[4, -1, 3, -1, 2, -1, -1, 1], [2, -1, 1, -1, 0, -1, -1, -1]],
};

const hz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);
const st = (f: number, semis: number): number => f * Math.pow(2, semis / 12);
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
/** 0..1 as x goes a..b — used to fade music layers in with intensity. */
const ramp = (x: number, a: number, b: number): number => clamp((x - a) / (b - a), 0, 1);
const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
/** Random pitch multiplier: ±3% for non-tonal SFX; tonal stingers pass a smaller amount to stay in tune. */
const vary = (amt = 0.03): number => 1 + (Math.random() * 2 - 1) * amt;
const TONAL = 0.006;
/** Scale degree -> semitones above the region root (degrees may exceed one octave). */
const degSemi = (R: RegionSound, deg: number): number => {
  const n = R.scale.length;
  return R.scale[((deg % n) + n) % n] + 12 * Math.floor(deg / n);
};

interface ToneOpts { type?: OscillatorType; to?: number; glide?: number; attack?: number; detune?: number }
interface NoiseOpts { type?: BiquadFilterType; q?: number; to?: number; attack?: number }
interface Echo { input: GainNode; delay: DelayNode }
interface SceneVoice {
  scene: MusicScene;
  R: RegionSound;
  out: GainNode;
  pad: BiquadFilterNode;
  lead: BiquadFilterNode;
  send: GainNode;
  step: number;
  next: number;
  stepDur: number;
}
interface AimVoice { o1: OscillatorNode; o2: OscillatorNode; f: BiquadFilterNode; g: GainNode }

// ---------------------------------------------------------------------------------------------
// Audio engine
// ---------------------------------------------------------------------------------------------

export class Audio {
  /** Smoothed 0..1 combat intensity (drives music layers). */
  intensity = 0;
  sfxVolume = 0.8;
  musicVolume = 0.5;

  private ctx?: AudioContext;
  private master?: GainNode;
  private sfx?: GainNode;
  private bright?: GainNode;
  private music?: GainNode;
  private duckGain?: GainNode;
  private musicEcho?: Echo;
  private noiseBuf?: AudioBuffer;
  private canPan = false;
  private voices = new Map<string, { last: number; ends: number[] }>();

  private cur?: SceneVoice;
  private sceneName: MusicScene = 'menu';
  private regionId = DEFAULT_REGION;

  private lastTimbre = 0;

  private aimV?: AimVoice;
  private aimTier = 0;
  private aimLast = 0;

  // ---- lifecycle -----------------------------------------------------------------------------

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.canPan = typeof ctx.createStereoPanner === 'function';

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -13;
    comp.knee.value = 16;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.007;
    comp.release.value = 0.16;
    this.master.connect(comp).connect(ctx.destination);

    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    const sfxEcho = this.makeEcho(this.sfx, 0.19, 0.3, 0.3, 3200);
    this.bright = ctx.createGain();
    this.bright.connect(this.sfx);
    this.bright.connect(sfxEcho.input);

    this.music = ctx.createGain();
    this.music.connect(this.master);
    this.duckGain = ctx.createGain();
    this.duckGain.connect(this.music);
    this.musicEcho = this.makeEcho(this.duckGain, 0.4, 0.35, 0.32, 2400);

    // One shared second of white noise; every noise voice plays a random slice of it.
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // iOS: playing a buffer inside the gesture fully unlocks output.
    const silent = ctx.createBufferSource();
    silent.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    silent.connect(ctx.destination);
    silent.start(0);
    if (ctx.state === 'suspended') void ctx.resume();

    this.setVolumes(this.sfxVolume, this.musicVolume);
    setInterval(this.pump, SCHEDULE_MS); // lives as long as the page (the context is never closed)
    this.startScene();
  }

  setVolumes(sfx: number, music: number): void {
    this.sfxVolume = sfx;
    this.musicVolume = music;
    if (this.sfx) this.sfx.gain.value = sfx * 0.6;
    if (this.music) this.music.gain.value = music * 0.12;
  }

  /** Called every frame with 0..1 combat intensity. */
  update(dt: number, intensity: number): void {
    this.intensity += (intensity - this.intensity) * Math.min(1, dt * 1.5);
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    // Safety: release the aim tone if the caller stopped calling aim() without aimEnd().
    if (this.aimV && t - this.aimLast > 0.3) this.aimEnd();
    const s = this.cur;
    if (s && t - this.lastTimbre > 0.2) { // timbre follows intensity (throttled: few automation events)
      this.lastTimbre = t;
      const I = this.sceneIntensity(s.scene);
      const calm = s.scene !== 'combat' && s.scene !== 'boss';
      s.pad.frequency.setTargetAtTime(s.R.bright * (calm ? 0.75 : s.scene === 'boss' ? 0.45 + I * 0.5 : 0.6 + I * 0.9), t, 0.4);
      s.lead.frequency.setTargetAtTime(s.R.bright * (1.4 + I * 1.6), t, 0.4);
    }
  }

  // ---- music ---------------------------------------------------------------------------------

  /** Switch the adaptive music (crossfades ~1.5s). Region keeps its previous value when omitted. */
  setScene(scene: MusicScene, regionId?: string): void {
    const rid = regionId ?? this.regionId;
    const same = scene === this.sceneName && rid === this.regionId;
    this.sceneName = scene;
    this.regionId = rid;
    if (!this.ctx || (same && (this.cur || scene === 'none'))) return; // before unlock: applied on unlock
    this.startScene();
  }

  private startScene(): void {
    const ctx = this.ctx;
    const bus = this.duckGain;
    if (!ctx || !bus) return;
    const t = ctx.currentTime;
    const old = this.cur;
    this.cur = undefined;
    if (old) {
      for (const node of [old.out, old.send]) {
        const g = node.gain;
        g.cancelScheduledValues(t);
        g.setValueAtTime(g.value, t);
        g.linearRampToValueAtTime(0, t + XFADE);
      }
      setTimeout(() => { old.out.disconnect(); old.pad.disconnect(); old.lead.disconnect(); old.send.disconnect(); }, (XFADE + 0.8) * 1000);
    }
    if (this.sceneName === 'none') return;

    const R = REGION_SOUND[this.regionId] ?? REGION_SOUND[DEFAULT_REGION];
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.linearRampToValueAtTime(1, t + (old ? XFADE : 0.8));
    out.connect(bus);
    const pad = ctx.createBiquadFilter();
    pad.type = 'lowpass';
    pad.frequency.value = R.bright * 0.7;
    pad.Q.value = 0.5;
    pad.connect(out);
    const lead = ctx.createBiquadFilter();
    lead.type = 'lowpass';
    lead.frequency.value = R.bright * 1.6;
    lead.connect(out);
    const send = ctx.createGain();
    send.gain.setValueAtTime(0, t);
    send.gain.linearRampToValueAtTime(R.lead === 'glass' ? 0.9 : 0.62, t + (old ? XFADE : 0.8));
    if (this.musicEcho) lead.connect(send).connect(this.musicEcho.input);

    const stepDur = 60 / (R.bpm * TEMPO[this.sceneName]) / 4;
    this.musicEcho?.delay.delayTime.setTargetAtTime(Math.min(0.9, stepDur * 3), t, 0.1); // dotted 8th
    this.cur = { scene: this.sceneName, R, out, pad, lead, send, step: 0, next: t + 0.08, stepDur };
  }

  private sceneIntensity(scene: MusicScene): number {
    return scene === 'boss' ? Math.max(0.6, this.intensity) : scene === 'combat' ? this.intensity : 0;
  }

  /** Lookahead scheduler tick (setInterval). Schedules 16th-note steps up to LOOKAHEAD ahead. */
  private pump = (): void => {
    const ctx = this.ctx;
    const s = this.cur;
    if (!ctx || !s || ctx.state !== 'running' || (typeof document !== 'undefined' && document.hidden)) return;
    const now = ctx.currentTime;
    if (now - s.next > 0.25) s.next = now + 0.03; // fell behind (tab hidden / suspended): resync, never burst
    while (s.next < now + LOOKAHEAD) {
      this.musicStep(s, s.step++, s.next);
      s.next += s.stepDur;
    }
  };

  /** Generate one 16th-note step of the current scene. */
  private musicStep(s: SceneVoice, step: number, t: number): void {
    const { R, scene, stepDur } = s;
    const pos = step % 16;
    const bar = Math.floor(step / 16);
    const calm = scene === 'menu' || scene === 'map' || scene === 'results';
    const boss = scene === 'boss';
    const I = this.sceneIntensity(scene);
    const chordBars = calm ? 2 : 1;
    const prog = boss ? BOSS_PROG : R.prog;
    const deg = prog[Math.floor(bar / chordBars) % prog.length];
    const barDur = stepDur * 16;
    const bassMidi = (d: number): number => { const sm = degSemi(R, d); return R.root - 12 + (sm > 6 ? sm - 12 : sm); };

    // Pad (+ drone root in calm scenes): one chord per bar / two bars, legato overlap.
    if (pos === 0 && bar % chordBars === 0) {
      const dur = barDur * chordBars + 0.4;
      const oct = boss ? 0 : 12;
      const padVol = 0.055 * R.padVol * (calm ? 1 : 1 - I * 0.3);
      for (const k of [0, 2, 4]) {
        const f = hz(R.root + oct + degSemi(R, deg + k));
        for (const det of [-7, 7]) this.sustain(s.pad, t, f, dur, padVol, boss ? 'sawtooth' : R.pad, calm ? 0.9 : 0.3, 0.6, det);
      }
      if (calm || boss) this.sustain(s.out, t, hz(bassMidi(deg)), dur, calm ? 0.16 : 0.12, 'sine', 0.8, 0.6);
      if (calm) this.sustain(s.pad, t + stepDur * 2, hz(R.root + 24 + degSemi(R, deg + 4)), dur * 0.8, 0.024, 'sine', 1.4, 1);
    }

    // Bass pulse.
    if (scene === 'combat' || boss) {
      const lb = boss ? 1 : ramp(I, 0.05, 0.3);
      const rate = boss || I > 0.75 ? 1 : 2;
      if (lb > 0.02 && pos % rate === 0) {
        const up = (pos % 4 === 2 && I > 0.5) || (boss && pos % 4 === 3);
        const accent = pos % 4 === 0 ? 1 : 0.7;
        this.note(s.out, t, hz(bassMidi(deg) + (up ? 12 : 0)), stepDur * 1.7, 0.26 * lb * accent, R.bass === 'sawtooth' ? 'sawtooth' : R.bass, 0.004, R.bass === 'sawtooth' ? 700 : 0);
      }
    } else if (scene === 'map' && pos === 8 && Math.random() < 0.5) {
      this.note(s.out, t, hz(bassMidi(deg)), stepDur * 6, 0.12, 'sine', 0.02);
    }

    const phrases = CALM_PHRASES[scene];
    const pulse = boss || I > 0.62 ? 1 : 2;
    const pattern = phrases?.[bar % phrases.length] ?? (boss ? [0, 1, 2, 0, 1, 4, 2, 1] : [0, 1, 2, 3, 4, 2, 3, 1]);
    const tone = pattern[Math.floor(pos / pulse) % pattern.length];
    if (pos % pulse === 0 && tone >= 0) {
      const noteDegree = [0, 2, 4, 7, 9][tone];
      const f = hz(R.root + (boss ? 0 : 12) + degSemi(R, deg + noteDegree)) * vary(0.002);
      const vol = (calm ? 0.085 : 0.045 + I * 0.04) * (pos % 2 === 1 ? 0.56 : 1);
      const length = stepDur * pulse * (calm ? 2.7 : 1.7);
      if (R.lead === 'glass') this.glass(s.lead, t, f, vol, length * 1.35);
      else if (R.lead === 'wire') this.fm(s.lead, t, f, 1.5, 0.55, length, vol);
      else {
        this.osc(s.lead, t, f, length, vol, { type: 'triangle', attack: 0.008 });
        this.osc(s.lead, t, f * 3.02, length * 0.34, vol * 0.28);
      }
    }

    // Percussion (noise-based hats/snare, sine kick), fading in with intensity.
    if (scene === 'combat' || boss) {
      const lh = boss ? 1 : ramp(I, 0.2, 0.45);
      if (lh > 0.02 && (pos % 4 === 2 || ((I > 0.75 || boss) && pos % 2 === 1))) this.hat(s.out, t, (pos % 4 === 2 ? 0.05 : 0.025) * lh);
      const lk = boss ? 1 : ramp(I, 0.4, 0.65);
      if (lk > 0.02 && (pos === 0 || pos === 8 || (boss && pos % 4 === 0) || ((I > 0.8 || boss) && pos === 14))) this.kick(s.out, t, 0.45 * lk);
      const ls = boss ? 1 : ramp(I, 0.65, 0.9);
      if (ls > 0.02 && (pos === 4 || pos === 12)) this.snare(s.out, t, 0.15 * ls);
    }
  }

  private kick(d: AudioNode, t: number, v: number): void {
    this.osc(d, t, 150, 0.28, v, { to: 42, glide: 0.11, attack: 0.002 });
  }
  private hat(d: AudioNode, t: number, v: number): void {
    this.noise(d, t, 0.035, v, 7500, { type: 'highpass', q: 0.7 });
  }
  private snare(d: AudioNode, t: number, v: number): void {
    this.noise(d, t, 0.14, v, 1800, { q: 0.8 });
    this.osc(d, t, 190, 0.08, v * 0.6, { type: 'triangle', to: 150 });
  }

  /** Duck the music by `amount` for `hold` seconds (big reactions, discoveries, stingers). */
  private duck(amount = 0.3, hold = 0.25): void {
    const ctx = this.ctx;
    const g = this.duckGain?.gain;
    if (!ctx || !g) return;
    const t = ctx.currentTime;
    const v = Math.min(1 - amount, g.value);
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(v, t + 0.04);
    g.setValueAtTime(v, t + hold);
    g.linearRampToValueAtTime(1, t + hold + 0.35);
  }

  // ---- synthesis primitives ------------------------------------------------------------------

  /** Start time for an SFX, or undefined when audio is not running (every public method then no-ops). */
  private t(): number | undefined {
    const c = this.ctx;
    return c && this.sfx && c.state === 'running' ? c.currentTime + 0.005 : undefined;
  }

  /** SFX destination panned by world x (arena 720 wide), or the plain sfx bus. */
  private at(x?: number): AudioNode {
    const ctx = this.ctx!;
    if (x === undefined || !this.canPan) return this.sfx!;
    const p = ctx.createStereoPanner();
    p.pan.value = clamp((x / ARENA_W) * 2 - 1, -1, 1) * 0.7;
    p.connect(this.sfx!);
    return p;
  }

  /** Voice cap + cooldown per sound category. Returns false when the sound should be skipped. */
  private gate(cat: string, cooldown: number, dur: number, max = 3): boolean {
    const now = this.ctx!.currentTime;
    let v = this.voices.get(cat);
    if (!v) this.voices.set(cat, (v = { last: -1, ends: [] }));
    if (now - v.last < cooldown) return false;
    v.ends = v.ends.filter((e) => e > now);
    if (v.ends.length >= max) return false;
    v.last = now;
    v.ends.push(now + dur);
    return true;
  }

  /** Percussive envelope: exponential attack then exponential decay to silence at t+dur. */
  private pEnv(t: number, dur: number, vol: number, attack: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + Math.min(attack, dur * 0.9));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }

  private filter(dest: AudioNode, type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
    const f = this.ctx!.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    f.connect(dest);
    return f;
  }

  /** One-shot oscillator with optional exponential pitch glide. */
  private osc(dest: AudioNode, t: number, f: number, dur: number, vol: number, o: ToneOpts = {}): OscillatorNode {
    const ctx = this.ctx!;
    const n = ctx.createOscillator();
    n.type = o.type ?? 'sine';
    n.frequency.setValueAtTime(f, t);
    if (o.to) n.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + (o.glide ?? dur));
    if (o.detune) n.detune.value = o.detune;
    n.connect(this.pEnv(t, dur, vol, o.attack ?? 0.004)).connect(dest);
    n.start(t);
    n.stop(t + dur + 0.03);
    return n;
  }

  /** Filtered slice of the shared noise buffer, optional filter sweep. */
  private noise(dest: AudioNode, t: number, dur: number, vol: number, freq: number, o: NoiseOpts = {}): void {
    const ctx = this.ctx!;
    if (!this.noiseBuf) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(freq, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    f.Q.value = o.q ?? 1;
    src.connect(f).connect(this.pEnv(t, dur, vol, o.attack ?? 0.002)).connect(dest);
    src.start(t, Math.random() * 0.9);
    src.stop(t + dur + 0.03);
  }

  /** 2-op FM voice: bells, glass, 'tink's. Modulation index decays for a natural strike. */
  private fm(dest: AudioNode, t: number, f: number, ratio: number, index: number, dur: number, vol: number): void {
    const ctx = this.ctx!;
    const car = this.osc(dest, t, f, dur, vol, { attack: 0.002 });
    const m = ctx.createOscillator();
    m.frequency.value = f * ratio;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(f * index, t);
    mg.gain.exponentialRampToValueAtTime(Math.max(1, f * index * 0.04), t + dur);
    m.connect(mg).connect(car.frequency);
    m.start(t);
    m.stop(t + dur + 0.03);
  }

  /** Music note: oscillator with optional per-note low-pass (for saw timbres). */
  private note(dest: AudioNode, t: number, f: number, dur: number, vol: number, type: OscillatorType, attack: number, lp = 0): void {
    this.osc(lp ? this.filter(dest, 'lowpass', lp, 1.5) : dest, t, f, dur, vol, { type, attack });
  }

  /** Sustained pad voice: linear attack, hold, exponential release ending at t+dur. */
  private sustain(dest: AudioNode, t: number, f: number, dur: number, vol: number, type: OscillatorType, attack: number, release: number, detune = 0): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, Math.max(t + attack, t + dur - release));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private makeEcho(dest: AudioNode, time: number, feedback: number, wet: number, tone: number): Echo {
    const ctx = this.ctx!;
    const input = ctx.createGain();
    const delay = ctx.createDelay(1);
    delay.delayTime.value = time;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = tone;
    const fb = ctx.createGain();
    fb.gain.value = feedback;
    const w = ctx.createGain();
    w.gain.value = wet;
    input.connect(delay);
    delay.connect(lp);
    lp.connect(fb).connect(delay);
    lp.connect(w).connect(dest);
    return { input, delay };
  }

  /** Strummed chord (semitones over root). */
  private chord(dest: AudioNode, t: number, root: number, semis: number[], dur: number, vol: number, type: OscillatorType, strum: number): void {
    semis.forEach((s, i) => this.osc(dest, t + i * strum, st(root, s) * vary(TONAL), dur, vol, { type, attack: 0.006 }));
  }

  private comboRoot(): number {
    return hz((REGION_SOUND[this.regionId] ?? REGION_SOUND[DEFAULT_REGION]).comboRoot);
  }

  // ---- layered impact building blocks --------------------------------------------------------

  /** Click/crack transient: 10–30ms band-passed noise. */
  private transient(d: AudioNode, t: number, v: number, freq = 2500, dur = 0.02): void {
    this.noise(d, t, dur, v, freq * vary(), { q: 1.2, attack: 0.001 });
  }

  /** Body: sine/triangle with a fast pitch drop. */
  private body(d: AudioNode, t: number, f: number, v: number, dur = 0.16, type: OscillatorType = 'triangle'): void {
    this.osc(d, t, f * 1.6 * vary(), dur, v, { type, to: f * 0.5, glide: dur * 0.6, attack: 0.002 });
  }

  /** Jittered square 'zap' (lightning, arcs). */
  private zap(d: AudioNode, t: number, dur: number, v: number, base = 140): void {
    const o = this.osc(this.filter(d, 'bandpass', 2200 * vary(), 0.7), t, base * vary(), dur, v, { type: 'square', attack: 0.002 });
    for (let k = 1; k * 0.018 < dur; k++) o.frequency.setValueAtTime(base * rnd(0.5, 3), t + k * 0.018);
    this.noise(d, t, dur * 0.8, v * 0.7, 5000, { type: 'highpass', q: 0.6 });
  }

  /** Ringing inharmonic partials (struck metal bar). */
  private ring(d: AudioNode, t: number, f: number, v: number, len = 0.9): void {
    const parts: [number, number, number][] = [[1, 1, 1], [2.76, 0.6, 0.65], [5.4, 0.4, 0.45], [8.93, 0.22, 0.28]];
    for (const [ratio, amp, dl] of parts) this.osc(d, t, f * ratio * vary(0.01), len * dl, v * amp, { attack: 0.002 });
  }

  /** Glass keeps a rounded fundamental and loses its bright overtones quickly after the strike. */
  private glass(d: AudioNode, t: number, f: number, v: number, len: number): void {
    this.osc(d, t, f, len, v, { attack: 0.003 });
    this.osc(d, t, f * 2.63, len * 0.53, v * 0.38, { attack: 0.002 });
    this.osc(d, t, f * 4.21, len * 0.26, v * 0.18, { attack: 0.002 });
  }

  /** Element-flavoured tail for reactions and element-tinted sounds. */
  private tail(el: string, d: AudioNode, t: number, f: number, v: number): void {
    switch (el) {
      case 'fire':
      case 'magma': // lowpassed whoosh + crackles
        this.noise(d, t, 0.45, v * 0.5, 1400, { type: 'lowpass', to: 400, attack: 0.015 });
        for (let i = 0; i < 4; i++) this.noise(d, t + rnd(0.02, 0.35), 0.012, v * rnd(0.25, 0.5), rnd(2500, 5500), { type: 'highpass' });
        if (el === 'magma') this.osc(d, t, 90, 0.4, v * 0.4, { to: 45 });
        break;
      case 'ice': { // high FM tink pair
        const ff = clamp(f * 4, 1500, 3500) * vary();
        this.fm(d, t, ff, 3.47, 2.5, 0.35, v * 0.3);
        this.fm(d, t + 0.06, ff * 1.5, 3.47, 1.8, 0.25, v * 0.18);
        this.noise(d, t, 0.05, v * 0.15, 7000, { type: 'highpass' });
        break;
      }
      case 'lightning':
        this.zap(d, t, 0.22, v * 0.28, 120);
        break;
      case 'water': { // bloop + wobble
        this.osc(d, t, 260 * vary(), 0.16, v * 0.4, { to: 720, glide: 0.08 });
        const w = this.osc(d, t + 0.05, f * vary(), 0.35, v * 0.22);
        const lfo = this.ctx!.createOscillator();
        lfo.frequency.value = 9;
        const lg = this.ctx!.createGain();
        lg.gain.value = f * 0.08;
        lfo.connect(lg).connect(w.frequency);
        lfo.start(t + 0.05);
        lfo.stop(t + 0.45);
        this.noise(d, t, 0.25, v * 0.22, 1200, { type: 'lowpass', to: 400 });
        break;
      }
      case 'poison': // bubbly low
        for (let i = 0; i < 4; i++) {
          const bf = rnd(140, 300);
          this.osc(d, t + i * 0.05 + rnd(0, 0.03), bf, 0.09, v * 0.32, { to: bf * 1.9, glide: 0.06 });
        }
        this.noise(d, t, 0.3, v * 0.16, 600, { type: 'lowpass' });
        break;
      case 'metal':
        this.ring(d, t, clamp(f * 2, 250, 700) * vary(), v * 0.25);
        break;
      case 'earth':
      case 'mud': // low thud + rumble
        this.osc(d, t, 110 * vary(), 0.35, v * 0.6, { to: 38, glide: 0.2 });
        this.noise(d, t, 0.4, v * 0.4, 300, { type: 'lowpass', to: 120 });
        if (el === 'mud') this.osc(d, t + 0.08, 180, 0.12, v * 0.2, { to: 320, glide: 0.06 });
        break;
      case 'wind': // whoosh sweep
        this.noise(d, t, 0.5, v * 0.4, 400 * vary(), { q: 2, to: 2600, attack: 0.12 });
        break;
      case 'steam': // hiss
        this.noise(d, t, 0.45, v * 0.3, 3000, { type: 'highpass', attack: 0.03 });
        this.noise(d, t, 0.35, v * 0.15, 900, { q: 1.5, to: 3500, attack: 0.05 });
        break;
      case 'arcane': { // shimmering detuned chord
        const r = clamp(f, 330, 660) * vary(TONAL);
        for (const s of [0, 7, 16]) for (const det of [-8, 8]) this.osc(d, t, st(r, s), 0.8, v * 0.075, { attack: 0.04, detune: det });
        if (this.bright) this.fm(this.bright, t + 0.05, r * 4, 2.01, 1, 0.5, v * 0.06);
        break;
      }
    }
  }

  private reactionElements(id: string): string[] {
    const r = Content.reactions.get(id);
    if (!r) return ['arcane'];
    const out: string[] = [];
    for (const el of [r.output?.element, ...r.inputs]) if (el && el !== 'kinetic' && el !== '*' && !out.includes(el)) out.push(el);
    return out.length ? out.slice(0, 2) : ['earth'];
  }

  // ---- aiming --------------------------------------------------------------------------------

  /** Called every frame while pulling back (power ~0.15..1): rising tension tone + tier clicks. */
  aim(power: number): void {
    const t = this.t();
    if (t === undefined) return;
    const ctx = this.ctx!;
    const p = clamp(power, 0, 1);
    this.aimLast = ctx.currentTime;
    if (!this.aimV) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.Q.value = 2;
      f.frequency.value = 600;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      f.connect(g).connect(this.sfx!);
      const o1 = ctx.createOscillator();
      o1.type = 'triangle';
      const o2 = ctx.createOscillator();
      o2.type = 'sine';
      o1.frequency.value = 160;
      o2.frequency.value = 320;
      o1.connect(f);
      o2.connect(f);
      o1.start(t);
      o2.start(t);
      this.aimV = { o1, o2, f, g };
    }
    const v = this.aimV;
    const f = 160 * Math.pow(2, p * 1.6);
    v.o1.frequency.setTargetAtTime(f, t, 0.03);
    v.o2.frequency.setTargetAtTime(f * 2 * (1 + p * 0.012), t, 0.03); // beating grows with power = tension
    v.f.frequency.setTargetAtTime(500 + p * 2600, t, 0.04);
    v.g.gain.setTargetAtTime(0.015 + p * 0.045, t, 0.03);

    const tier = p >= 0.95 ? 3 : p >= 0.7 ? 2 : p >= 0.4 ? 1 : 0;
    if (tier > this.aimTier) {
      const cf = [0, 1047, 1319, 1568][tier] * vary(TONAL);
      this.osc(this.sfx!, t, cf, 0.05, 0.1, { type: 'triangle', attack: 0.001 });
      this.noise(this.sfx!, t, 0.012, 0.08, 6000, { type: 'highpass' });
      if (tier === 3 && this.bright) this.fm(this.bright, t + 0.02, cf * 2, 3.01, 1, 0.25, 0.05);
    }
    this.aimTier = tier;
  }

  /** Stop the aim tension tone (release or cancel). */
  aimEnd(): void {
    const ctx = this.ctx;
    const v = this.aimV;
    this.aimV = undefined;
    this.aimTier = 0;
    if (!ctx || !v) return;
    const t = ctx.currentTime;
    v.g.gain.cancelScheduledValues(t);
    v.g.gain.setTargetAtTime(0, t, 0.025);
    v.o1.stop(t + 0.15);
    v.o2.stop(t + 0.15);
  }

  // ---- combo ---------------------------------------------------------------------------------

  /** Combo step: pentatonic ladder climbing with count (cap +2 octaves), sparkle at high combos. */
  combo(count: number, x?: number): void {
    const t = this.t();
    if (t === undefined || count < 1 || !this.gate('combo', 0.04, 0.25)) return;
    const d = this.at(x);
    const f = st(this.comboRoot(), LADDER[Math.min(count - 1, LADDER.length - 1)]) * vary(TONAL);
    this.osc(d, t, f, 0.22, 0.12, { type: 'triangle', attack: 0.003 });
    this.osc(d, t, f * 2, 0.1, 0.05, { attack: 0.002 });
    this.noise(d, t, 0.01, 0.05, 6000, { type: 'highpass' });
    if (count >= 8 && this.bright) {
      this.fm(this.bright, t + 0.02, f * 3, 3.01, 0.8, 0.3, 0.04);
      this.noise(this.bright, t, 0.07, 0.04, 8000, { type: 'highpass' });
    }
    if (count >= 15) this.osc(d, t + 0.03, f * 1.5, 0.2, 0.06, { type: 'triangle' });
  }

  /** Combo finished: sus4 grace resolving to a major chord; size/length/sparkle scale with count. */
  comboEnd(count: number): void {
    const t = this.t();
    if (t === undefined || count < 3 || !this.gate('comboEnd', 0.2, 1, 1)) return;
    const d = this.sfx!;
    const s = clamp((count - 3) / 20, 0, 1);
    const root = this.comboRoot() / 2;
    const notes = [0, 4, 7, 12, 16, 19, 24].slice(0, 3 + Math.floor(s * 4));
    const dur = 0.6 + s * 0.8;
    const vol = 0.06 + s * 0.035;
    this.osc(d, t, st(root, 17), 0.09, vol * 0.7, { type: 'triangle' }); // grace (4th) -> resolves to 3rd
    this.chord(d, t + 0.06, root, notes.map((n) => n + 12), dur, vol, 'triangle', 0.03);
    this.chord(d, t + 0.06, root, [12, 24], dur * 0.6, vol * 0.4, 'sine', 0);
    this.osc(d, t + 0.06, root / 2, dur, 0.1 * (0.5 + s), { attack: 0.01 });
    if (count >= 10 && this.bright) {
      for (let i = 0; i < 4; i++) this.fm(this.bright, t + 0.15 + i * 0.06, st(root * 4, LADDER[i * 2 + 2]), 3.01, 0.7, 0.35, 0.035);
    }
    if (count >= 20 && this.bright) {
      this.noise(this.bright, t, 1.2, 0.05, 6000, { type: 'highpass', attack: 0.3 });
      this.duck(0.35, 0.5);
    } else if (count >= 10) this.duck(0.25, 0.3);
  }

  // ---- UI ------------------------------------------------------------------------------------

  ui(): void {
    const t = this.t();
    if (t === undefined || !this.gate('ui', 0.03, 0.06)) return;
    this.osc(this.sfx!, t, 660 * vary(), 0.06, 0.12);
  }

  hover(): void {
    const t = this.t();
    if (t === undefined || !this.gate('hover', 0.05, 0.03, 2)) return;
    this.osc(this.sfx!, t, 2000 * vary(), 0.025, 0.025, { attack: 0.001 });
  }

  select(): void {
    const t = this.t();
    if (t === undefined || !this.gate('ui', 0.03, 0.06)) return;
    this.glass(this.sfx!, t, 620 * vary(), 0.09, 0.11);
    this.transient(this.sfx!, t, 0.035, 3300, 0.012);
  }

  confirm(): void {
    const t = this.t();
    if (t === undefined || !this.gate('ui', 0.03, 0.2)) return;
    const f = 784 * vary(TONAL);
    this.glass(this.sfx!, t, f, 0.11, 0.15);
    this.glass(this.bright!, t + 0.06, st(f, 7), 0.075, 0.25);
  }

  back(): void {
    const t = this.t();
    if (t === undefined || !this.gate('ui', 0.03, 0.15)) return;
    const f = 784 * vary(TONAL);
    this.osc(this.sfx!, t, f, 0.07, 0.08, { type: 'triangle' });
    this.osc(this.sfx!, t + 0.06, st(f, -5), 0.12, 0.08, { type: 'triangle' });
  }

  /** Card dealt into a hand; pitch steps up with index. */
  cardDeal(index: number): void {
    const t = this.t();
    if (t === undefined || !this.gate('card', 0.03, 0.1)) return;
    this.noise(this.sfx!, t, 0.09, 0.12, 2500 * vary(), { q: 0.8, to: 1100 });
    this.osc(this.sfx!, t + 0.02, st(600, LADDER[clamp(index, 0, LADDER.length - 1)]) * vary(TONAL), 0.04, 0.04, { type: 'triangle' });
  }

  cardFlip(): void {
    const t = this.t();
    if (t === undefined || !this.gate('card', 0.03, 0.1)) return;
    this.noise(this.sfx!, t, 0.04, 0.1, 3000 * vary(), { type: 'highpass' });
    this.osc(this.sfx!, t + 0.01, 1200 * vary(), 0.08, 0.06, { type: 'triangle', to: 1800 });
  }

  purchase(): void {
    const t = this.t();
    if (t === undefined || !this.gate('purchase', 0.08, 0.4, 2)) return;
    const d = this.bright!;
    this.osc(d, t, 988 * vary(TONAL), 0.07, 0.05, { type: 'square', attack: 0.001 });
    this.osc(d, t + 0.07, 1319 * vary(TONAL), 0.35, 0.05, { type: 'square', attack: 0.001 });
    this.ring(d, t + 0.07, 1319, 0.05, 0.5);
    this.noise(d, t, 0.03, 0.06, 6000, { type: 'highpass' });
  }

  denied(): void {
    const t = this.t();
    if (t === undefined || !this.gate('denied', 0.15, 0.25, 1)) return;
    const d = this.filter(this.sfx!, 'lowpass', 900);
    this.osc(d, t, 150 * vary(), 0.09, 0.08, { type: 'square' });
    this.osc(d, t + 0.11, 140 * vary(), 0.12, 0.08, { type: 'square' });
  }

  /** Count-up tick; pitch climbs the pentatonic ladder with `step`. */
  tick(step: number): void {
    const t = this.t();
    if (t === undefined || !this.gate('tick', 0.03, 0.06)) return;
    const f = st(880, LADDER[clamp(Math.floor(step), 0, LADDER.length - 1)]) * vary(TONAL);
    this.osc(this.sfx!, t, f, 0.05, 0.05, { attack: 0.001 });
    this.osc(this.sfx!, t, f * 2, 0.03, 0.015, { type: 'triangle', attack: 0.001 });
  }

  levelUp(): void {
    const t = this.t();
    if (t === undefined || !this.gate('stinger', 0.15, 0.6, 2)) return;
    const r = this.comboRoot();
    this.chord(this.sfx!, t, r, [0, 4, 7, 12, 16], 0.3, 0.08, 'triangle', 0.05);
    this.fm(this.bright!, t + 0.25, st(r, 24), 3.01, 0.8, 0.6, 0.06);
    this.noise(this.bright!, t + 0.2, 0.4, 0.04, 7000, { type: 'highpass', attack: 0.05 });
  }

  /** Achievement chime. */
  feat(): void {
    const t = this.t();
    if (t === undefined || !this.gate('stinger', 0.15, 0.8, 2)) return;
    const r = this.comboRoot();
    [12, 19, 24].forEach((s, i) => this.fm(this.bright!, t + i * 0.08, st(r, s) * vary(TONAL), 3.5, 1.1, 0.7, 0.06));
    this.noise(this.bright!, t, 0.6, 0.035, 8000, { type: 'highpass', attack: 0.1 });
    this.duck(0.2, 0.4);
  }

  /** Big unlock reveal: low swell blooming into a wide chord with bells. */
  unlock2(): void {
    const t = this.t();
    if (t === undefined || !this.gate('big', 0.3, 1.5, 1)) return;
    const d = this.sfx!;
    const r = this.comboRoot() / 2;
    this.noise(d, t, 0.6, 0.1, 200, { type: 'lowpass', to: 3000, attack: 0.5 });
    this.osc(d, t, 55, 0.6, 0.15, { attack: 0.5 });
    this.chord(d, t + 0.5, r, [0, 7, 12, 16, 19], 1.6, 0.06, 'triangle', 0.02);
    this.osc(d, t + 0.5, r / 2, 1.2, 0.2, { to: r / 2.2 });
    for (let i = 0; i < 5; i++) this.fm(this.bright!, t + 0.55 + i * 0.07, st(r * 4, LADDER[i + 3]), 3.01, 0.8, 0.6, 0.04);
    this.duck(0.45, 1.5);
  }

  waveStart(wave: number): void {
    const t = this.t();
    if (t === undefined || !this.gate('wave', 0.4, 0.6, 1)) return;
    const R = REGION_SOUND[this.regionId] ?? REGION_SOUND[DEFAULT_REGION];
    const f = st(hz(R.root + 12), LADDER[clamp(wave - 1, 0, 4)]) * vary(TONAL);
    const d = this.filter(this.sfx!, 'lowpass', 1800);
    this.osc(d, t, f, 0.25, 0.09, { type: 'sawtooth', attack: 0.02 });
    this.osc(d, t + 0.12, st(f, 7), 0.45, 0.09, { type: 'sawtooth', attack: 0.02 });
    this.osc(this.sfx!, t + 0.12, f * 2, 0.4, 0.05, { type: 'triangle' });
    this.noise(this.sfx!, t, 0.35, 0.05, 300, { q: 1, to: 2000, attack: 0.2 });
    this.kick(this.sfx!, t + 0.12, 0.3);
  }

  /** Ominous swell before a boss: low dissonant saw cluster opening up, then a hit. */
  bossIntro(): void {
    const t = this.t();
    if (t === undefined || !this.gate('big', 0.3, 2.6, 1)) return;
    const lp = this.filter(this.sfx!, 'lowpass', 150, 2);
    lp.frequency.setValueAtTime(150, t);
    lp.frequency.exponentialRampToValueAtTime(1400, t + 2.2);
    const R = REGION_SOUND[this.regionId] ?? REGION_SOUND[DEFAULT_REGION];
    const base = hz(R.root - 12);
    for (const s of [0, 1, 6]) this.osc(lp, t, st(base, s), 2.6, 0.09, { type: 'sawtooth', attack: 1.6 });
    this.osc(this.sfx!, t, 40, 2.6, 0.2, { attack: 1.8 });
    this.noise(this.sfx!, t, 2.3, 0.12, 120, { type: 'lowpass', to: 900, attack: 1.8 });
    this.osc(this.sfx!, t + 2.2, 90, 0.8, 0.35, { to: 35, glide: 0.4 });
    this.noise(this.sfx!, t + 2.2, 0.9, 0.18, 2000, { type: 'lowpass', to: 200 });
    this.duck(0.5, 2.6);
  }

  victory(): void {
    const t = this.t();
    if (t === undefined || !this.gate('big', 0.3, 1.8, 1)) return;
    const r = this.comboRoot() / 2;
    const brass = this.filter(this.sfx!, 'lowpass', 2400);
    [0, 4, 7].forEach((s, i) => this.osc(brass, t + i * 0.12, st(r, s + 12), 0.14, 0.07, { type: 'sawtooth', attack: 0.01 }));
    this.chord(brass, t + 0.38, r, [12, 16, 19, 24], 1.3, 0.05, 'sawtooth', 0.01);
    this.chord(this.sfx!, t + 0.38, r, [0, 12, 16, 19], 1.3, 0.06, 'triangle', 0.01);
    this.osc(this.sfx!, t + 0.38, 98, 0.6, 0.3, { to: 65, glide: 0.3 });
    this.noise(this.sfx!, t + 0.38, 0.8, 0.08, 5000, { type: 'highpass', to: 2000 });
    for (let i = 0; i < 4; i++) this.fm(this.bright!, t + 0.5 + i * 0.08, st(r * 4, LADDER[i * 2 + 1]), 3.01, 0.7, 0.5, 0.035);
    this.duck(0.5, 1.6);
  }

  defeat(): void {
    const t = this.t();
    if (t === undefined || !this.gate('big', 0.3, 1.8, 1)) return;
    const d = this.filter(this.sfx!, 'lowpass', 1600);
    const r = this.comboRoot();
    [7, 3, 0, -5].forEach((s, i) => this.osc(d, t + i * 0.3, st(r, s), i === 3 ? 1.4 : 0.4, 0.08, { type: 'triangle', attack: 0.02 }));
    this.osc(this.sfx!, t + 0.9, st(r, -29), 1.4, 0.12, { attack: 0.1 });
    this.duck(0.4, 1.6);
  }

  challengeComplete(): void {
    const t = this.t();
    if (t === undefined || !this.gate('stinger', 0.15, 0.8, 2)) return;
    const r = this.comboRoot();
    this.chord(this.sfx!, t, r, [0, 4, 7, 12], 0.25, 0.07, 'triangle', 0.06);
    this.chord(this.sfx!, t, r, [12, 16, 19, 24], 0.15, 0.025, 'sine', 0.06);
    this.fm(this.bright!, t + 0.24, st(r, 24), 3.5, 1, 0.7, 0.06);
    this.noise(this.bright!, t + 0.2, 0.5, 0.04, 8000, { type: 'highpass', attack: 0.05 });
    this.duck(0.25, 0.6);
  }

  /** Grand, magical transformation: rising sweep into a shimmering maj9 bloom with bells. */
  evolution(): void {
    const t = this.t();
    if (t === undefined || !this.gate('big', 0.3, 3, 1)) return;
    const d = this.sfx!;
    const r = this.comboRoot() / 2;
    this.noise(d, t, 1.1, 0.1, 200, { q: 1.5, to: 6000, attack: 0.9 });
    this.osc(d, t, 200, 1.05, 0.06, { to: 1600, attack: 0.8 });
    for (const s of [0, 4, 7, 11, 14]) for (const det of [-9, 9]) this.osc(d, t + 1, st(r, s + 12), 2.6, 0.035, { type: 'triangle', attack: 0.08, detune: det });
    this.osc(d, t + 1, r / 2, 2, 0.25, { to: r / 2.4, glide: 0.5 });
    for (let i = 0; i < 8; i++) this.fm(this.bright!, t + 1.05 + i * 0.06, st(r * 4, LADDER[i + 1]), 3.01, 0.8, 0.7, 0.035);
    this.noise(this.bright!, t + 1, 1.6, 0.05, 7000, { type: 'highpass', attack: 0.2 });
    this.duck(0.6, 3);
  }

  /** Low-HP warning: lub-dub. */
  heartbeat(): void {
    const t = this.t();
    if (t === undefined || !this.gate('heartbeat', 0.35, 0.4, 1)) return;
    this.osc(this.sfx!, t, 70, 0.14, 0.35, { to: 42, glide: 0.1, attack: 0.004 });
    this.osc(this.sfx!, t + 0.17, 62, 0.16, 0.25, { to: 38, glide: 0.1, attack: 0.004 });
    this.noise(this.sfx!, t, 0.08, 0.08, 180, { type: 'lowpass' });
  }

  discovery(): void {
    const t = this.t();
    if (t === undefined || !this.gate('big', 0.3, 1, 1)) return;
    [0, 4, 7, 12, 16].forEach((s, i) => {
      this.osc(this.sfx!, t + i * 0.07, st(440, s) * vary(TONAL), 0.5, 0.14, { type: 'triangle', attack: 0.006 });
      this.fm(this.bright!, t + i * 0.07, st(880, s), 3.01, 0.6, 0.5, 0.03);
    });
    this.noise(this.bright!, t, 0.8, 0.08, 5000, { q: 0.5, attack: 0.05 });
    this.duck(0.3, 0.6);
  }

  mastery(): void {
    const t = this.t();
    if (t === undefined || !this.gate('stinger', 0.15, 0.5, 2)) return;
    [0, 7, 12].forEach((s, i) => {
      this.osc(this.sfx!, t + i * 0.06, st(523, s) * vary(TONAL), 0.35, 0.12, { attack: 0.004 });
      this.fm(this.bright!, t + i * 0.06, st(1046, s), 3.5, 0.8, 0.4, 0.03);
    });
  }

  // ---- simulation events ---------------------------------------------------------------------

  onEvent(e: SimEvent): void {
    const t = this.t();
    if (t === undefined) return;
    switch (e.type) {
      case 'impact': {
        const v = Math.min(0.35, e.speed / 2500);
        if (v < 0.015 || !this.gate('impact', 0.04, 0.15)) return;
        const d = this.at(e.pos.x);
        switch (e.material) {
          case 'bumper':
            this.transient(d, t, v * 0.55, 3100);
            this.osc(d, t, 360 * vary(), 0.15, v * 0.65, { type: 'triangle', to: 920, glide: 0.045 });
            this.glass(d, t + 0.016, 840 * vary(), v * 0.32, 0.2);
            break;
          case 'metal':
          case 'post':
          case 'coil':
            this.transient(d, t, v * 0.55, 3600);
            this.ring(d, t, 430 * vary(), v * 0.48, 0.36);
            break;
          case 'crystal':
          case 'rune':
            this.glass(d, t, 760 * vary(), v * 0.78, 0.28);
            break;
          case 'font':
            this.osc(d, t, 255 * vary(), 0.16, v * 0.7, { to: 460, glide: 0.06 });
            this.noise(d, t, 0.095, v * 0.65, 2050, { q: 0.65, to: 780 });
            break;
          default: {
            const slam = e.material === 'slam';
            this.transient(d, t, v * 0.62, slam ? 1050 : 1550);
            this.body(d, t, slam ? 76 : 112 + e.speed * 0.042, v, slam ? 0.24 : 0.115);
            if (slam) this.noise(d, t, 0.19, v * 0.58, 600, { type: 'lowpass', to: 150 });
          }
        }
        break;
      }
      case 'hit': {
        if (!this.gate('hit', 0.045, 0.2)) return;
        const v = clamp(e.speed / 4000, 0.04, 0.22);
        const d = this.at(e.pos.x);
        this.transient(d, t, v * 1.2, 2600, 0.015);
        this.body(d, t, 120 + e.speed * 0.05, v, 0.13);
        if (e.armored) this.ring(d, t, 520 * vary(), v * 0.35, 0.3);
        if (e.crit) {
          this.osc(d, t, 1760 * vary(TONAL), 0.18, v * 0.5, { attack: 0.002 });
          this.osc(d, t + 0.03, 2637 * vary(TONAL), 0.16, v * 0.3, { attack: 0.002 });
          this.noise(this.bright!, t, 0.08, v * 0.4, 7000, { type: 'highpass' });
        }
        break;
      }
      case 'launch': {
        this.aimEnd();
        if (!this.gate('launch', 0.08, 0.3, 2)) return;
        const p = clamp(e.power, 0, 1);
        const d = this.at(e.pos.x);
        this.transient(d, t, 0.085 + p * 0.14, 1750);
        this.body(d, t, 120 + p * 75, 0.1 + p * 0.15, 0.13);
        this.noise(d, t + 0.008, 0.16 + p * 0.12, 0.1 + p * 0.15, 2400 * vary(), { q: 0.65, to: 420 + 420 * p, attack: 0.02 });
        this.glass(d, t + 0.025, 420 + p * 310, 0.07 * p, 0.13 + p * 0.16);
        break;
      }
      case 'reaction': {
        if (!this.gate('reaction', 0.06, 0.5)) return;
        const els = this.reactionElements(e.reactionId);
        const base = ELEMENT_NOTE[els[0]] ?? 262;
        const up = Math.pow(2, LADDER[Math.min(e.depth, 6)] / 12); // chains climb the ladder
        const big = e.targets >= 3 || e.kills > 0 || e.depth >= 2 || e.onBoss || e.radius > 120;
        const v = Math.max(0.1, 0.16 + (big ? 0.06 : 0) - e.depth * 0.01);
        const d = this.at(e.pos.x);
        this.transient(d, t, v * 0.8, 1900, 0.023);
        this.body(d, t, base * up, v * 0.7, 0.19);
        els.forEach((el, i) => this.tail(el, d, t + 0.012 + i * 0.022,
          (ELEMENT_NOTE[el] ?? base) * up, v * (els.length > 1 ? 0.68 : 1)));
        if (e.depth > 0) this.glass(d, t + 0.035, this.comboRoot() * up, v * 0.38, 0.31);
        if (big) {
          this.osc(d, t, 70, 0.25, v * 0.8, { to: 40, attack: 0.002 });
          this.duck(0.3, 0.25);
        }
        break;
      }
      case 'stirred': {
        if (!this.gate('stirred', 0.25, 0.3, 2)) return;
        const d = this.at(e.pos.x);
        this.fm(d, t, 1400 * vary(), 2.01, 0.6, 0.25, 0.04);
        this.osc(d, t + 0.03, 220 * vary(), 0.08, 0.04, { to: 400 });
        break;
      }
      case 'inert':
        if (!this.gate('inert', 0.3, 0.2, 1)) return;
        this.osc(this.sfx!, t, 200 * vary(), 0.12, 0.03, { type: 'triangle', to: 110 });
        this.noise(this.sfx!, t, 0.1, 0.03, 800, { type: 'lowpass' });
        break;
      case 'arc':
        if (!this.gate('arc', 0.05, 0.15)) return;
        this.zap(this.at((e.from.x + e.to.x) / 2), t, 0.08, 0.06, 200);
        break;
      case 'kill': {
        const d = this.at(e.pos.x);
        if (e.isBoss) {
          this.osc(d, t, 110, 1.5, 0.3, { type: 'triangle', to: 40 });
          this.osc(d, t, 55, 1.8, 0.3, { attack: 0.01 });
          this.noise(d, t, 1.2, 0.25, 900, { type: 'lowpass', to: 100 });
          this.chord(this.bright!, t + 0.3, this.comboRoot(), [0, 7, 12, 16], 1.2, 0.04, 'triangle', 0.05);
          this.duck(0.45, 0.8);
          return;
        }
        if (!this.gate('kill', 0.05, 0.3)) return;
        if (e.elite) {
          this.osc(d, t, 120 * vary(), 0.35, 0.3, { to: 40, glide: 0.2 });
          this.noise(d, t, 0.18, 0.2, 1200 * vary(), { q: 0.8 });
          this.osc(d, t, 400 * vary(), 0.2, 0.12, { type: 'triangle', to: 900 });
          this.ring(d, t + 0.02, 330 * vary(), 0.06, 0.6);
          this.duck(0.2, 0.2);
        } else {
          this.transient(d, t, 0.08, 3000);
          this.osc(d, t, 520 * vary(), 0.14, 0.1, { type: 'triangle', to: 900 });
          this.osc(d, t + 0.03, 1568 * vary(), 0.08, 0.035);
        }
        break;
      }
      case 'objectDestroyed': {
        if (!this.gate('object', 0.06, 0.3)) return;
        const d = this.at(e.pos.x);
        this.noise(d, t, 0.22, 0.2, 900 * vary(), { q: 0.7 });
        this.osc(d, t, 110 * vary(), 0.25, 0.25, { to: 40, glide: 0.15 });
        for (let i = 0; i < 3; i++) this.noise(d, t + rnd(0.02, 0.15), 0.015, 0.1, rnd(2000, 5000), { type: 'highpass' });
        break;
      }
      case 'ballDamaged':
        if (!this.gate('hurt', 0.12, 0.3, 2)) return;
        this.osc(this.sfx!, t, 160 * vary(), 0.25, 0.14, { type: 'sawtooth', to: 60 });
        this.noise(this.sfx!, t, 0.15, 0.18, 600 * vary(), { q: 0.8 });
        this.osc(this.sfx!, t, 80, 0.2, 0.25, { to: 40 });
        this.duck(0.2, 0.2);
        break;
      case 'ballDied': {
        const r = 330 * vary(TONAL);
        [0, -3, -7, -12].forEach((s, i) => this.osc(this.sfx!, t + i * 0.12, st(r, s), 0.3, 0.1, { type: 'triangle' }));
        this.osc(this.sfx!, t, 90, 0.6, 0.3, { to: 30 });
        this.duck(0.4, 0.8);
        break;
      }
      case 'brake': {
        if (!this.gate('brake', 0.15, 0.2, 1)) return;
        const d = this.at(e.pos.x);
        this.noise(d, t, 0.2, 0.08, 2000, { type: 'lowpass', to: 300, attack: 0.01 });
        this.osc(d, t, 300 * vary(), 0.12, 0.04, { to: 150 });
        break;
      }
      case 'resonanceReady':
      case 'resonancePulse': {
        const discharge = e.type === 'resonancePulse';
        const d = this.at(e.pos.x);
        const root = discharge ? 330 : 660;
        [1, 1.5, 2].forEach((ratio, i) => this.osc(d, t + i * 0.042, root * ratio, 0.24, discharge ? 0.08 : 0.045, { type: 'sine' }));
        if (discharge) this.noise(d, t, 0.3, 0.08, 1700, { to: 350 });
        break;
      }
      case 'shoot': {
        if (!this.gate('shoot', 0.08, 0.15)) return;
        const d = this.at(e.pos.x);
        const f = (ELEMENT_NOTE[e.element ?? 'fire'] ?? 300) * 2 * vary();
        this.osc(this.filter(d, 'lowpass', 2500), t, f, 0.1, 0.035, { type: 'square', to: f * 0.5 });
        this.transient(d, t, 0.03, 3000, 0.01);
        break;
      }
      case 'zoneSpawned': {
        if (!this.gate('zone', 0.15, 0.4, 2)) return;
        const d = this.at(e.pos.x);
        this.noise(d, t, 0.4, 0.06, 300, { q: 1, to: 1200, attack: 0.1 });
        this.osc(d, t, 200 * vary(), 0.2, 0.05, { to: 400, glide: 0.1 });
        break;
      }
      case 'waveStart':
        this.waveStart(e.wave);
        break;
      case 'cleared': {
        const r = 392 * vary(TONAL);
        this.chord(this.sfx!, t, r, [0, 4, 7, 12], 0.45, 0.12, 'triangle', 0.09);
        [0, 4, 7, 12].forEach((s, i) => this.fm(this.bright!, t + i * 0.09, st(r * 2, s), 3.01, 0.6, 0.5, 0.03));
        this.duck(0.3, 0.5);
        break;
      }
      case 'bossPhase': {
        const d = this.filter(this.sfx!, 'lowpass', 700);
        this.osc(d, t, 55, 1.8, 0.25, { type: 'sawtooth', to: 45 });
        this.osc(this.sfx!, t, 82, 1.8, 0.2, { type: 'triangle' });
        this.osc(d, t, st(55, 6), 1.6, 0.12, { type: 'sawtooth', attack: 0.3 });
        this.noise(this.sfx!, t, 1.4, 0.15, 150, { type: 'lowpass', to: 1000, attack: 0.6 });
        this.duck(0.45, 1.2);
        break;
      }
      case 'telegraph': {
        if (!this.gate('telegraph', 0.12, 0.4)) return;
        const d = this.at(e.pos.x);
        if (e.kind === 'line') this.osc(this.filter(d, 'lowpass', 2000), t, 900 * vary(), 0.3, 0.05, { type: 'sawtooth', to: 400 });
        else if (e.kind === 'nova') this.fm(d, t, 600 * vary(), 1.5, 2, 0.4, 0.05);
        else this.osc(d, t, 300 * vary(), 0.35, 0.06, { type: 'triangle', to: 600, attack: 0.05 });
        break;
      }
      case 'buff': {
        if (!this.gate('buff', 0.1, 0.3, 2)) return;
        const f = 784 * vary(TONAL);
        this.osc(this.bright!, t, f, 0.15, 0.08, { type: 'triangle' });
        this.osc(this.bright!, t + 0.06, st(f, 7), 0.2, 0.08, { type: 'triangle' });
        this.noise(this.bright!, t, 0.15, 0.03, 8000, { type: 'highpass' });
        break;
      }
      case 'combo':
        this.combo(e.count, e.pos.x);
        break;
      case 'comboEnd':
        this.comboEnd(e.count);
        break;
      case 'bossAttack':
        this.bossAttack(e.kind, e.pos.x, t);
        break;
      case 'wardBroken': {
        if (!this.gate('ward', 0.06, 0.4)) return;
        const d = this.at(e.pos.x);
        this.transient(d, t, 0.2, 5000, 0.015);
        this.noise(d, t, 0.25, 0.2, 4000, { type: 'highpass', attack: 0.001 });
        this.noise(d, t + 0.01, 0.12, 0.1, 7000, { q: 3 });
        for (let i = 0; i < 5; i++) this.osc(d, t + rnd(0, 0.08), rnd(2500, 6000), rnd(0.15, 0.3), 0.04, { attack: 0.001 });
        break;
      }
      case 'execute': {
        if (!this.gate('execute', 0.06, 0.3)) return;
        const d = this.at(e.pos.x);
        this.noise(d, t, 0.12, 0.3, 6000 * vary(), { q: 2, to: 1200, attack: 0.004 });
        this.osc(d, t + 0.02, 2400 * vary(), 0.25, 0.08, { attack: 0.001 });
        this.osc(d, t + 0.03, 100, 0.18, 0.3, { to: 40, attack: 0.002 });
        this.duck(0.15, 0.2);
        break;
      }
    }
  }

  /** Distinct warning per boss attack kind. */
  private bossAttack(kind: 'slam' | 'flask' | 'nova' | 'charge', x: number, t: number): void {
    if (!this.gate('bossAttack', 0.15, 0.8, 2)) return;
    const d = this.at(x);
    switch (kind) {
      case 'slam': // rumble build
        this.noise(d, t, 0.7, 0.3, 200, { type: 'lowpass', to: 80, attack: 0.15 });
        this.osc(d, t, 60, 0.7, 0.35, { to: 35, attack: 0.1 });
        this.osc(this.filter(d, 'lowpass', 300), t, 45, 0.7, 0.15, { type: 'sawtooth', attack: 0.2 });
        break;
      case 'flask': // falling whistle
        this.osc(d, t, 1800 * vary(), 0.55, 0.07, { to: 700, attack: 0.05 });
        this.noise(d, t, 0.5, 0.03, 2500, { q: 4, to: 1000, attack: 0.05 });
        break;
      case 'nova': // charge-up shimmer
        this.noise(d, t, 0.8, 0.12, 400, { q: 1.5, to: 5000, attack: 0.6 });
        for (const det of [-12, 0, 12]) this.osc(d, t, 300 * vary(TONAL), 0.8, 0.04, { to: 1200, attack: 0.5, detune: det });
        break;
      case 'charge': { // growl
        const saw = this.osc(this.filter(d, 'lowpass', 500, 2), t, 90 * vary(), 0.6, 0.2, { type: 'sawtooth', to: 60, attack: 0.05 });
        const lfo = this.ctx!.createOscillator();
        lfo.frequency.value = 22;
        const lg = this.ctx!.createGain();
        lg.gain.value = 15;
        lfo.connect(lg).connect(saw.frequency);
        lfo.start(t);
        lfo.stop(t + 0.65);
        this.noise(d, t, 0.5, 0.18, 400, { type: 'lowpass', attack: 0.05 });
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Haptics
// ---------------------------------------------------------------------------------------------

export class Haptics {
  enabled = true;
  private last = 0;

  /** Vibrate with throttling. `priority` pulses use a shorter gap so milestones are not swallowed by hit spam. */
  pulse(ms: number | number[], priority = false): void {
    if (!this.enabled || typeof navigator === 'undefined' || !navigator.vibrate) return;
    const now = performance.now();
    if (now - this.last < (priority ? 25 : 60)) return;
    this.last = now;
    navigator.vibrate(ms);
  }

  onEvent(e: SimEvent): void {
    switch (e.type) {
      case 'resonancePulse':
        this.pulse([16, 20, 28], true);
        break;
      case 'hit':
        if (e.crit) this.pulse([10, 20, 16]);
        else if (e.speed > 600) this.pulse(12);
        break;
      case 'reaction':
        if (e.depth === 0) this.pulse(e.kills > 0 || e.targets >= 3 ? [18, 20, 24] : 18);
        break;
      case 'ballDamaged':
        this.pulse([30, 30, 30], true);
        break;
      case 'kill':
        if (e.isBoss) this.pulse([60, 40, 120], true);
        else if (e.elite) this.pulse([25, 20, 35]);
        break;
      case 'combo':
        if (e.count > 0 && e.count % 5 === 0) this.pulse(e.count >= 15 ? [12, 16, 12, 16, 24] : [12, 18, 16], true);
        break;
      case 'comboEnd':
        if (e.count >= 10) this.pulse(e.count >= 20 ? [25, 30, 25, 30, 60] : [20, 30, 40], true);
        break;
      case 'bossAttack':
        this.pulse(e.kind === 'slam' ? [50, 30, 70] : e.kind === 'charge' ? [40, 20, 40] : [20, 25, 20], true);
        break;
      case 'wardBroken':
        this.pulse([15, 10, 25], true);
        break;
      case 'execute':
        this.pulse(35, true);
        break;
    }
  }
}
