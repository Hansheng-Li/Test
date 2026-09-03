export type SfxName = 'pager' | 'cash' | 'click' | 'error' | 'siren' | 'seal' | 'mix' | 'arrest' | 'unlock' | 'step';

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
  private lastSfx = new Map<string, number>();

  init(): void {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.startAmbient();
    } catch {
      this.ctx = null;
    }
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

  play(name: SfxName): void {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    this.resume();
    const t = performance.now();
    const last = this.lastSfx.get(name) ?? 0;
    if (t - last < 60) return;
    this.lastSfx.set(name, t);
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
        this.tone(90, 0, 0.05, 'sine', 0.05);
        break;
    }
  }
}
