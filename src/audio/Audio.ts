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

/** Sounds that play once per event: wait briefly for the sample instead of using the synth version. */
const ONE_SHOT = new Set<SfxName>(['jingle_goal', 'jingle_customer', 'jingle_bust', 'jingle_property', 'jingle_intro', 'door', 'page', 'collect', 'thud', 'bag', 'switch', 'confirm', 'open', 'close']);

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
  private engineGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineSub: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private clubEl: HTMLAudioElement | null = null;
  private clubMusicGain: GainNode | null = null;
  private clubFilter: BiquadFilterNode | null = null;
  private clubStarted = false;
  private waveGain: GainNode | null = null;
  private sirenTimer = 20;

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
    // surf: band-passed noise swelling with a slow LFO, faded in by beach proximity
    const surf = ctx.createBufferSource();
    surf.buffer = buf;
    surf.loop = true;
    surf.playbackRate.value = 0.7;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.4;
    const swell = ctx.createGain();
    swell.gain.value = 0.6;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.11;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.4;
    lfo.connect(lfoDepth).connect(swell.gain);
    this.waveGain = ctx.createGain();
    this.waveGain.gain.value = 0;
    surf.connect(bp).connect(swell).connect(this.waveGain).connect(this.master);
    surf.start();
    lfo.start();
  }

  /** Car engine: a two-oscillator drone whose pitch and brightness follow the throttle (0..1). */
  setEngine(on: boolean, throttle: number): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    if (!this.engineGain) {
      this.engineGain = ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineFilter = ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 400;
      this.engineOsc = ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineSub = ctx.createOscillator();
      this.engineSub.type = 'square';
      const subGain = ctx.createGain();
      subGain.gain.value = 0.5;
      this.engineOsc.connect(this.engineFilter);
      this.engineSub.connect(subGain).connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain).connect(this.master);
      this.engineOsc.start();
      this.engineSub.start();
    }
    const t = Math.max(0, Math.min(1, throttle));
    const target = on ? 0.045 + t * 0.075 : 0;
    this.engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.12);
    if (on) {
      this.engineOsc!.frequency.setTargetAtTime(55 + t * 120, ctx.currentTime, 0.15);
      this.engineSub!.frequency.setTargetAtTime(27 + t * 60, ctx.currentTime, 0.15);
      this.engineFilter!.frequency.setTargetAtTime(350 + t * 1200, ctx.currentTime, 0.15);
    }
  }

  /** Club Mirage plays a CC0 track: muffled through the walls outside, full range inside. */
  private updateClubMusic(level: number, inside: boolean): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    if (!this.clubEl) {
      try {
        this.clubEl = new Audio('/assets/music/loyaltyfreak_chillin_at_the_club.ogg');
        this.clubEl.loop = true;
        this.clubEl.preload = 'none';
        this.clubEl.addEventListener('error', () => { this.clubEl = null; this.clubStarted = true; });
        const node = ctx.createMediaElementSource(this.clubEl);
        this.clubFilter = ctx.createBiquadFilter();
        this.clubFilter.type = 'lowpass';
        this.clubFilter.frequency.value = 400;
        this.clubMusicGain = ctx.createGain();
        this.clubMusicGain.gain.value = 0;
        node.connect(this.clubFilter).connect(this.clubMusicGain).connect(this.master);
      } catch {
        this.clubStarted = true;
        return;
      }
    }
    if (!this.clubEl || !this.clubMusicGain || !this.clubFilter) return;
    if (level > 0.02 && !this.clubStarted) {
      this.clubStarted = true;
      void this.clubEl.play().catch(() => { this.clubStarted = false; });
    }
    const gain = inside ? 0.55 : level * level * 0.35;
    this.clubMusicGain.gain.setTargetAtTime(gain, ctx.currentTime, 0.4);
    this.clubFilter.frequency.setTargetAtTime(inside ? 14000 : 300 + level * 500, ctx.currentTime, 0.4);
    // the synth bass thump only carries outside; inside the real track takes over
    if (this.clubEl.paused && this.clubStarted && level > 0.02) void this.clubEl.play().catch(() => undefined);
    if (level <= 0.02 && !this.clubEl.paused) this.clubEl.pause();
  }

  private titleEl: HTMLAudioElement | null = null;
  private titleGain: GainNode | null = null;

  /** Title-screen theme (CC0 'Retro Synths'); needs a user gesture first, so call it from a click. */
  setTitleMusic(on: boolean): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    if (!this.titleEl) {
      if (!on) return;
      try {
        this.titleEl = new Audio('/assets/music/holizna_retro_synths.ogg');
        this.titleEl.loop = true;
        this.titleGain = ctx.createGain();
        this.titleGain.gain.value = 0;
        ctx.createMediaElementSource(this.titleEl).connect(this.titleGain).connect(this.master);
      } catch {
        this.titleEl = null;
        return;
      }
    }
    if (!this.titleGain) return;
    this.titleGain.gain.setTargetAtTime(on ? 0.3 : 0, ctx.currentTime, on ? 1.2 : 0.4);
    if (on && this.titleEl.paused) void this.titleEl.play().catch(() => undefined);
    if (!on) window.setTimeout(() => { if (this.titleEl && this.titleGain && this.titleGain.gain.value < 0.01) this.titleEl.pause(); }, 1500);
  }

  get titlePlaying(): boolean {
    return !!this.titleEl && !this.titleEl.paused;
  }

  get clubPlaying(): boolean {
    return !!this.clubEl && !this.clubEl.paused;
  }

  /** Called every frame with proximity factors 0..1. */
  update(dt: number, opts: { club: number; beach: number; night: boolean; insideClub?: boolean; heat?: number }): void {
    if (!this.ctx || !this.clubGain || !this.ambientGain) return;
    const ctx = this.ctx;
    if (this.waveGain) this.waveGain.gain.setTargetAtTime(opts.beach * 0.5, ctx.currentTime, 0.6);
    // a distant siren now and then when the city is on edge
    this.sirenTimer -= dt;
    if (this.sirenTimer <= 0) {
      this.sirenTimer = 30 + Math.random() * 40;
      const heat = opts.heat ?? 0;
      if (heat >= 30 || (opts.night && Math.random() < 0.3)) this.distantSiren();
    }
    const musicLevel = opts.night ? opts.club : opts.club * 0.4;
    this.updateClubMusic(musicLevel, !!opts.insideClub);
    const clubLevel = opts.insideClub ? 0.1 : opts.night ? opts.club * 0.35 : opts.club * 0.12;
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

  private distantSiren(): void {
    for (let i = 0; i < 4; i++) {
      this.tone(620, i * 0.7, 0.35, 'sine', 0.018, 880);
      this.tone(880, i * 0.7 + 0.35, 0.35, 'sine', 0.018, 620);
    }
  }

  private gull(vol: number): void {
    const base = 1200 + Math.random() * 600;
    this.tone(base, 0, 0.18, 'sine', 0.05 * vol, base * 1.4);
    this.tone(base * 1.1, 0.22, 0.14, 'sine', 0.04 * vol, base * 0.8);
  }

  /** Warm the whole sample cache (a few hundred KB) so first plays use the real samples. */
  preload(names: SfxName[] = Object.keys(SAMPLES) as SfxName[]): void {
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
      const p = this.loadBuffer(file);
      // one-shots (jingles, doors, page flips) are worth a short wait; rapid sounds fall back at once
      if (ONE_SHOT.has(name)) {
        const at = performance.now();
        void p.then((b) => { if (b && performance.now() - at < 2500) this.playBuffer(b, def.gain, 1); });
        return true;
      }
      return false;
    }
    if (!buf) return false;
    this.playBuffer(buf, def.gain, name === 'step' ? 0.92 + Math.random() * 0.16 : 1);
    return true;
  }

  private playBuffer(buf: AudioBuffer, gain: number, rate: number): void {
    if (!this.ctx || !this.master) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.master);
    src.start();
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
