import { Content } from '../content';
import type { SimEvent } from '../sim/events';

/** Base pitch per element so each element has a recognizable sonic signature. */
const ELEMENT_NOTE: Record<string, number> = {
  fire: 220, water: 262, ice: 523, lightning: 330, metal: 147, earth: 98, wind: 392, poison: 185, arcane: 440, steam: 294, mud: 110, magma: 165,
};
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];

/**
 * Procedural WebAudio synth: every sound is generated, so there are no assets to load. Includes
 * an adaptive drone whose brightness follows combat intensity.
 */
export class Audio {
  private ctx?: AudioContext;
  private master?: GainNode;
  private sfx?: GainNode;
  private music?: GainNode;
  private droneFilter?: BiquadFilterNode;
  private droneOsc: OscillatorNode[] = [];
  private lastImpact = 0;
  private lastReaction = 0;
  intensity = 0;
  sfxVolume = 0.8;
  musicVolume = 0.5;

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
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.connect(this.master);
    this.setVolumes(this.sfxVolume, this.musicVolume);
    this.startDrone();
  }

  setVolumes(sfx: number, music: number): void {
    this.sfxVolume = sfx;
    this.musicVolume = music;
    if (this.sfx) this.sfx.gain.value = sfx * 0.6;
    if (this.music) this.music.gain.value = music * 0.12;
  }

  private startDrone(): void {
    const ctx = this.ctx!;
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 300;
    this.droneFilter.connect(this.music!);
    for (const [f, type] of [[55, 'sawtooth'], [82.4, 'triangle'], [110.3, 'sine']] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = type === 'sawtooth' ? 0.25 : 0.5;
      o.connect(g).connect(this.droneFilter);
      o.start();
      this.droneOsc.push(o);
    }
  }

  /** Called every frame with 0..1 combat intensity. */
  update(dt: number, intensity: number): void {
    this.intensity += (intensity - this.intensity) * Math.min(1, dt * 1.5);
    if (this.droneFilter && this.ctx) this.droneFilter.frequency.setTargetAtTime(250 + this.intensity * 1600, this.ctx.currentTime, 0.3);
    // Sparse pentatonic plucks when things heat up.
    if (this.ctx && Math.random() < dt * this.intensity * 1.2) this.tone(110 * Math.pow(2, PENTA[Math.floor(Math.random() * PENTA.length)] / 12) * 2, 0.5, 'triangle', 0.05, this.music);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, dest?: AudioNode, slideTo?: number, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(dest ?? this.sfx);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, vol: number, filterFreq: number, q = 1, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = filterFreq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.sfx);
    src.start(ctx.currentTime + delay);
  }

  ui(): void {
    this.tone(660, 0.06, 'sine', 0.12);
  }

  discovery(): void {
    [0, 4, 7, 12, 16].forEach((s, i) => this.tone(440 * Math.pow(2, s / 12), 0.5, 'triangle', 0.18, undefined, undefined, i * 0.07));
    this.noise(0.8, 0.12, 5000, 0.5);
  }

  mastery(): void {
    [0, 7, 12].forEach((s, i) => this.tone(523 * Math.pow(2, s / 12), 0.35, 'sine', 0.14, undefined, undefined, i * 0.06));
  }

  onEvent(e: SimEvent): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    switch (e.type) {
      case 'impact': {
        if (now - this.lastImpact < 0.03) return;
        this.lastImpact = now;
        const v = Math.min(0.35, e.speed / 2500);
        if (e.material === 'bumper') this.tone(700, 0.12, 'square', v * 0.6, undefined, 1100);
        else if (e.material === 'metal' || e.material === 'post') this.tone(880, 0.25, 'triangle', v, undefined, 860);
        else this.tone(90 + e.speed * 0.05, 0.09, 'sine', v * 1.4, undefined, 60);
        this.noise(0.05, v * 0.6, 1800);
        break;
      }
      case 'hit':
        this.tone(160 + e.speed * 0.08, 0.12, 'square', Math.min(0.2, e.speed / 4000), undefined, 70);
        this.noise(0.08, 0.15, 900);
        break;
      case 'launch':
        this.tone(200, 0.18, 'sine', 0.12 + e.power * 0.1, undefined, 500 + e.power * 400);
        break;
      case 'reaction': {
        if (now - this.lastReaction < 0.05) return;
        this.lastReaction = now;
        const r = Content.reactions.get(e.reactionId);
        const base = ELEMENT_NOTE[r?.output?.element ?? r?.inputs[0] ?? 'fire'] ?? 262;
        // Chains climb in pitch — escalating feedback for bigger cascades.
        const up = Math.pow(2, Math.min(e.depth, 4) * 2 / 12);
        this.tone(base * up, 0.35, 'sawtooth', 0.09);
        this.tone(base * up * 1.5, 0.3, 'triangle', 0.08, undefined, undefined, 0.02);
        this.noise(0.25, 0.1, base * 4, 0.8);
        break;
      }
      case 'arc':
        this.noise(0.07, 0.06, 4000, 3);
        break;
      case 'kill':
        this.tone(e.isBoss ? 110 : 520, e.isBoss ? 1.5 : 0.15, 'triangle', e.isBoss ? 0.3 : 0.1, undefined, e.isBoss ? 40 : 900);
        break;
      case 'ballDamaged':
        this.tone(140, 0.25, 'sawtooth', 0.18, undefined, 60);
        break;
      case 'shoot':
        this.tone(ELEMENT_NOTE[e.element ?? 'fire'] ?? 300, 0.1, 'square', 0.04, undefined, 200);
        break;
      case 'telegraph':
        this.tone(300, 0.4, 'sawtooth', 0.05, undefined, 150);
        break;
      case 'bossPhase':
        this.tone(55, 1.8, 'sawtooth', 0.25, undefined, 45);
        this.tone(82, 1.8, 'triangle', 0.2);
        break;
      case 'cleared':
        [0, 4, 7].forEach((s, i) => this.tone(392 * Math.pow(2, s / 12), 0.4, 'triangle', 0.14, undefined, undefined, i * 0.1));
        break;
    }
  }
}

export class Haptics {
  enabled = true;
  private last = 0;
  pulse(ms: number | number[]): void {
    if (!this.enabled || typeof navigator === 'undefined' || !navigator.vibrate) return;
    const now = performance.now();
    if (now - this.last < 60) return;
    this.last = now;
    navigator.vibrate(ms);
  }
  onEvent(e: SimEvent): void {
    if (e.type === 'hit' && e.speed > 600) this.pulse(12);
    else if (e.type === 'reaction' && e.depth === 0) this.pulse(18);
    else if (e.type === 'ballDamaged') this.pulse([30, 30, 30]);
    else if (e.type === 'kill' && e.isBoss) this.pulse([60, 40, 120]);
  }
}
