import { Radio } from './Radio';

export type SfxName = 'pager' | 'cash' | 'click' | 'error' | 'siren' | 'seal' | 'mix' | 'arrest' | 'unlock' | 'step' | 'horn' | 'bump' | 'thud' | 'open' | 'close' | 'confirm' | 'collect' | 'door' | 'bag' | 'page' | 'jingle_goal' | 'jingle_customer' | 'jingle_bust' | 'jingle_property' | 'jingle_intro' | 'switch' | 'tick';

/** CC0 sample files (see public/assets/LICENSES.md). Missing files fall back to the synth versions. */
const SAMPLES: Partial<Record<SfxName, { files: string[]; gain: number; synthFallback?: SfxName }>> = {
  step: { files: ['step_0', 'step_1', 'step_2', 'step_3'], gain: 0.35 },
  cash: { files: ['cash', 'cash2'], gain: 0.7 },
  collect: { files: ['collect'], gain: 0.7, synthFallback: 'cash' },
  bump: { files: ['bump'], gain: 0.6 },
  thud: { files: ['thud'], gain: 0.6, synthFallback: 'bump' },
  click: { files: ['ui_click'], gain: 0.35 },
  confirm: { files: ['ui_confirm'], gain: 0.5, synthFallback: 'click' },
  error: { files: ['ui_error'], gain: 0.5 },
  open: { files: ['ui_open'], gain: 0.4, synthFallback: 'click' },
  close: { files: ['ui_close'], gain: 0.4, synthFallback: 'click' },
  switch: { files: ['ui_switch'], gain: 0.4, synthFallback: 'click' },
  tick: { files: ['ui_tick'], gain: 0.3, synthFallback: 'click' },
  door: { files: ['door_open', 'door_close'], gain: 0.6, synthFallback: 'click' },
  bag: { files: ['bag'], gain: 0.6, synthFallback: 'seal' },
  page: { files: ['page'], gain: 0.5, synthFallback: 'click' },
  jingle_goal: { files: ['jingle_goal'], gain: 0.5, synthFallback: 'unlock' },
  jingle_customer: { files: ['jingle_customer'], gain: 0.5, synthFallback: 'unlock' },
  jingle_bust: { files: ['jingle_bust'], gain: 0.55, synthFallback: 'arrest' },
  jingle_property: { files: ['jingle_property'], gain: 0.5, synthFallback: 'unlock' },
  jingle_intro: { files: ['jingle_intro'], gain: 0.45, synthFallback: 'unlock' },
};

/**
 * Procedural WebAudio sound effects and an ambient bed. No external assets.
 * The context is created lazily on the first user gesture.
 */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private clubGain: GainNode | null = null;
  private clubOsc: OscillatorNode | null = null;
  private clubTimer = 0;
  private gullTimer = 3;
  enabled = true;
  masterVolume = 0.5;
  private lastSfx = new Map<string, number>();
  radio = new Radio();
  private buffers = new Map<string, AudioBuffer | null>();
  private loading = new Set<string>();
  /** Set false to force the procedural sounds (tests / offline). */
  useSamples = true;

  init(): void {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.masterVolume;
      this.master.connect(this.ctx.destination);
      this.startAmbient();
      this.radio.attach(this.ctx, this.master);
      this.preload();
    } catch {
      this.ctx = null;
    }
  }

  setMasterVolume(v: number): void {
    this.masterVolume = v;
    if (this.master) this.master.gain.value = v;
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private startAmbient(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    // wind / traffic bed: filtered noise
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 400;
    this.ambientGain = ctx.createGain();
    this.ambientGain.gain.value = 0.12;
    src.connect(filt).connect(this.ambientGain).connect(this.master);
    src.start();
    // club bass (gain driven by proximity)
    this.clubGain = ctx.createGain();
    this.clubGain.gain.value = 0;
    this.clubGain.connect(this.master);
    this.clubOsc = ctx.createOscillator();
    this.clubOsc.type = 'sine';
    this.clubOsc.frequency.value = 55;
    const thump = ctx.createGain();
    thump.gain.value = 0;
    this.clubOsc.connect(thump).connect(this.clubGain);
    this.clubOsc.start();
    (this as unknown as { thump: GainNode }).thump = thump;
  }

  /** Called every frame with proximity factors 0..1. */
  update(dt: number, opts: { club: number; beach: number; night: boolean }): void {
    if (!this.ctx || !this.clubGain || !this.ambientGain) return;
    const ctx = this.ctx;
    const clubLevel = opts.night ? opts.club * 0.35 : opts.club * 0.12;
    this.clubGain.gain.setTargetAtTime(clubLevel, ctx.currentTime, 0.3);
    this.clubTimer -= dt;
    if (this.clubTimer <= 0 && clubLevel > 0.01) {
      this.clubTimer = 0.48;
      const thump = (this as unknown as { thump: GainNode }).thump;
      thump.gain.cancelScheduledValues(ctx.currentTime);
      thump.gain.setValueAtTime(1, ctx.currentTime);
      thump.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    }
    this.gullTimer -= dt;
    if (this.gullTimer <= 0) {
      this.gullTimer = 4 + Math.random() * 8;
      if (opts.beach > 0.05 && !opts.night) this.gull(opts.beach);
    }
    this.ambientGain.gain.setTargetAtTime(opts.night ? 0.07 : 0.12, ctx.currentTime, 0.5);
  }

  private tone(freq: number, start: number, dur: number, type: OscillatorType = 'square', gain = 0.2, endFreq?: number): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, ctx.currentTime + start);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + start + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
    g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
    o.connect(g).connect(this.master);
    o.start(ctx.currentTime + start);
    o.stop(ctx.currentTime + start + dur + 0.05);
  }

  private gull(vol: number): void {
    const base = 1200 + Math.random() * 600;
    this.tone(base, 0, 0.18, 'sine', 0.05 * vol, base * 1.4);
    this.tone(base * 1.1, 0.22, 0.14, 'sine', 0.04 * vol, base * 0.8);
  }

  /** Warm the sample cache so the first footstep is not silent. */
  preload(names: SfxName[] = ['step', 'cash', 'click', 'confirm', 'error', 'open', 'close', 'bump']): void {
    for (const n of names) {
      const def = SAMPLES[n];
      if (def) for (const f of def.files) void this.loadBuffer(f);
    }
  }

  private async loadBuffer(file: string): Promise<AudioBuffer | null> {
    if (this.buffers.has(file)) return this.buffers.get(file)!;
    if (this.loading.has(file) || !this.ctx) return null;
    this.loading.add(file);
    try {
      const res = await fetch(`/assets/audio/${file}.ogg`);
      if (!res.ok) throw new Error(String(res.status));
      const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
      this.buffers.set(file, buf);
      return buf;
    } catch {
      this.buffers.set(file, null);
      return null;
    } finally {
      this.loading.delete(file);
    }
  }

  /** Try a CC0 sample; returns false when it is unavailable so the synth version can run instead. */
  private playSample(name: SfxName): boolean {
    const def = SAMPLES[name];
    if (!def || !this.useSamples || !this.ctx || !this.master) return false;
    const file = def.files[Math.floor(Math.random() * def.files.length)];
    const buf = this.buffers.get(file);
    if (buf === undefined) {
      void this.loadBuffer(file);
      return false;
    }
    if (!buf) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = name === 'step' ? 0.92 + Math.random() * 0.16 : 1;
    const g = this.ctx.createGain();
    g.gain.value = def.gain;
    src.connect(g).connect(this.master);
    src.start();
    return true;
  }

  play(name: SfxName): void {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    this.resume();
    const t = performance.now();
    const last = this.lastSfx.get(name) ?? 0;
    if (t - last < 60) return;
    this.lastSfx.set(name, t);
    if (this.playSample(name)) return;
    const fallback = SAMPLES[name]?.synthFallback;
    if (fallback) name = fallback;
    switch (name) {
      case 'pager':
        // the signature beep: three double-chirps
        for (let i = 0; i < 3; i++) {
          this.tone(2200, i * 0.42, 0.09, 'square', 0.16);
          this.tone(2900, i * 0.42 + 0.12, 0.09, 'square', 0.16);
        }
        break;
      case 'cash':
        this.tone(880, 0, 0.08, 'triangle', 0.25);
        this.tone(1175, 0.08, 0.08, 'triangle', 0.25);
        this.tone(1760, 0.16, 0.18, 'triangle', 0.3);
        break;
      case 'click':
        this.tone(600, 0, 0.04, 'square', 0.08);
        break;
      case 'error':
        this.tone(220, 0, 0.12, 'sawtooth', 0.15, 160);
        break;
      case 'siren':
        this.tone(700, 0, 0.35, 'sawtooth', 0.12, 1000);
        this.tone(1000, 0.35, 0.35, 'sawtooth', 0.12, 700);
        break;
      case 'seal':
        this.tone(300, 0, 0.06, 'square', 0.12);
        this.tone(140, 0.05, 0.12, 'sawtooth', 0.1);
        break;
      case 'mix':
        this.tone(120, 0, 0.5, 'sawtooth', 0.08, 180);
        break;
      case 'arrest':
        this.tone(500, 0, 0.5, 'sawtooth', 0.14, 300);
        this.tone(400, 0.5, 0.6, 'sawtooth', 0.14, 200);
        break;
      case 'unlock':
        this.tone(523, 0, 0.1, 'triangle', 0.2);
        this.tone(659, 0.1, 0.1, 'triangle', 0.2);
        this.tone(784, 0.2, 0.1, 'triangle', 0.2);
        this.tone(1046, 0.3, 0.25, 'triangle', 0.25);
        break;
      case 'step':
        this.tone(70 + Math.random() * 30, 0, 0.06, 'triangle', 0.045, 45);
        break;
      case 'horn':
        this.tone(392, 0, 0.45, 'square', 0.14);
        this.tone(494, 0, 0.45, 'square', 0.12);
        break;
      case 'bump':
        this.tone(70, 0, 0.18, 'sawtooth', 0.2, 40);
        break;
      default:
        break;
    }
  }
}
