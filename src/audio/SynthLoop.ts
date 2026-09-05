/**
 * Procedural pirate-radio loop: an original synth track built from oscillators — a
 * pulsing bass, a triangle arpeggio, a soft pad and a noise-based drum kit.
 * Nothing sampled, nothing copyrighted. Scheduled ahead with the WebAudio clock.
 * Used by the "SIGNAL ZERO" station and as the fallback when a music file fails to load.
 */
export class SynthLoop {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private nextBeat = 0;
  private beat = 0;
  private timer: number | null = null;
  playing = false;
  volume = 0.35;
  private noiseBuf: AudioBuffer | null = null;
  /** Chord progression in semitones from A (A minor / F / C / G — a familiar 90s loop). */
  private chords = [
    [0, 3, 7], // Am
    [-4, 0, 3], // F
    [3, 7, 10], // C
    [-2, 2, 5], // G
  ];

  attach(ctx: AudioContext, master: AudioNode): void {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3200;
    this.out.connect(lp).connect(master);
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  start(): void {
    if (!this.ctx || !this.out || this.playing) return;
    this.playing = true;
    this.out.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.4);
    this.nextBeat = this.ctx.currentTime + 0.1;
    this.beat = 0;
    this.schedule();
  }

  stop(): void {
    if (!this.ctx || !this.out) return;
    this.playing = false;
    this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.ctx && this.out && this.playing) this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.2);
  }

  /** 0..1 loudness (used for distance falloff). */
  setLevel(level: number): void {
    if (!this.ctx || !this.out || !this.playing) return;
    this.out.gain.setTargetAtTime(this.volume * level, this.ctx.currentTime, 0.2);
  }

  private freq(semi: number, octave = 0): number {
    return 220 * Math.pow(2, semi / 12 + octave);
  }

  private schedule(): void {
    if (!this.ctx || !this.playing) return;
    const bpm = 112;
    const step = 60 / bpm / 2; // eighth notes
    while (this.nextBeat < this.ctx.currentTime + 0.5) {
      this.playStep(this.beat, this.nextBeat, step);
      this.nextBeat += step;
      this.beat++;
    }
    this.timer = window.setTimeout(() => this.schedule(), 120);
  }

  private playStep(i: number, t: number, step: number): void {
    const bar = Math.floor(i / 8) % 4;
    const chord = this.chords[bar];
    const inBar = i % 8;
    // kick on 1 and 3 (eighths 0 and 4), snare on 2 and 4
    if (inBar === 0 || inBar === 4) this.kick(t);
    if (inBar === 2 || inBar === 6) this.snare(t);
    if (inBar % 2 === 1) this.hat(t);
    // bass: root eighths, octave down
    this.tone(this.freq(chord[0], -1), t, step * 0.9, 'sawtooth', 0.11, 600);
    // arpeggio: cycle chord tones up an octave
    const arpNote = chord[i % 3];
    this.tone(this.freq(arpNote, 1), t, step * 0.6, 'triangle', 0.07, 4000);
    // pad on beat 1 of each bar
    if (inBar === 0) for (const n of chord) this.tone(this.freq(n, 0), t, step * 8, 'sine', 0.035, 1200);
  }

  private tone(freq: number, t: number, dur: number, type: OscillatorType, gain: number, cutoff: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.out!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private kick(t: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g).connect(this.out!);
    o.start(t);
    o.stop(t + 0.3);
  }

  private noise(t: number, dur: number, gain: number, hp: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf!;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.out!);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private snare(t: number): void {
    this.noise(t, 0.14, 0.22, 1800);
  }

  private hat(t: number): void {
    this.noise(t, 0.05, 0.08, 6000);
  }
}
