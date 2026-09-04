import { SynthLoop } from './SynthLoop';

export interface Track {
  file: string;
  title: string;
  artist: string;
  /** Seconds; known up front so a station keeps "playing" while you are tuned elsewhere. */
  dur: number;
}

export interface Station {
  id: string;
  name: string;
  freq: string;
  dj: string;
  /** Lines the DJ says between tracks. {crew} = the player's operation, {zone} = a district. */
  lines: string[];
  tracks: Track[];
  /** Procedural station: no files, the synth loop plays instead. */
  synth?: boolean;
  color: string;
}

/** Everything the radio is allowed to know about the game, for topical chatter. */
export interface RadioContext {
  heat: number;
  night: boolean;
  crewName: string;
  eventId: string | null;
  day: number;
  /** Today's hot effect, if any (products with it sell for a bonus). */
  trend: string | null;
}

/** All music is CC0 — see public/assets/LICENSES.md. Files live in public/assets/music. */
export const STATIONS: Station[] = [
  {
    id: 'solpalma',
    name: 'SOL PALMA FM',
    freq: '101.5',
    dj: 'Rico Delgado',
    color: '#ff4fd8',
    lines: [
      "Rico Delgado with you till sunrise. Windows down, volume up, Sol Palma.",
      'That was for everybody stuck at the Bus Depot right now. We see you.',
      "It's 1996 and the city still smells like sunscreen and gasoline. Stay with me.",
      'Neon on the Beach strip is looking extra pink tonight. Somebody paid the power bill.',
      'Requests on the hotline, we lost the number, keep listening anyway.',
      'Word on the boardwalk is {crew} is the name on everybody lips. Not that I know anything.',
      "Traffic: heavy police presence around {zone} tonight. Take the long way, kids.",
      'This next one goes out to the night shift at the Flamingo Diner.',
    ],
    tracks: [
      { file: 'holizna_back_in_the_80s', title: 'Back In The 80s', artist: 'HoliznaCC0', dur: 240 },
      { file: 'holizna_night_driving', title: 'Night Driving', artist: 'HoliznaCC0', dur: 131 },
      { file: 'holizna_retro_synths', title: 'Retro Synths', artist: 'HoliznaCC0', dur: 223 },
    ],
  },
  {
    id: 'wave',
    name: 'THE WAVE',
    freq: '96.3',
    dj: 'Marina Costa',
    color: '#4fe3ff',
    lines: [
      "Marina Costa, The Wave 96.3, the sound of the shoreline. Feet in the sand, please.",
      'Tide is coming in at the pier. Bring a towel, leave the worries.',
      "Ocean View Motel says the ice machine works again. That's the news.",
      'Slow it down. Nobody in Sol Palma is in a hurry except the guys in the sedans.',
      'A shout to whoever left the boombox on the beach. Good taste, bad memory.',
      'Sunset is at 7:41 tonight. Be somewhere nice for it.',
      'Lifeguards remind you: no glass on the beach, no arguments on the pier.',
    ],
    tracks: [
      { file: 'komiku_sunset_on_the_beach', title: 'Sunset On The Beach', artist: 'Komiku', dur: 80 },
      { file: 'holizna_city_lights', title: 'City Lights', artist: 'HoliznaCC0', dur: 277 },
      { file: 'komiku_beach', title: 'Beach', artist: 'Komiku', dur: 64 },
    ],
  },
  {
    id: 'funk',
    name: 'FUNK CITY',
    freq: '105.1',
    dj: 'Big Lou',
    color: '#ffd166',
    lines: [
      "Big Lou on Funk City 105. If your neighbors can't hear this, you're doing it wrong.",
      'Club Mirage is open late tonight. Dress code: sunglasses indoors.',
      'This one is for the bartender at the Canal Side Bar who never counts his tips wrong.',
      "Hot night in Sol Palma. The cops are out, the kids are out, everybody's out.",
      'Somebody just double-parked a purple van outside the studio. Respect.',
      'Rumor has it {crew} throws the best parties on the strip. I am not invited.',
      'Keep the bass low if you see blue lights in {zone}. Or do not. I am a DJ, not a lawyer.',
    ],
    tracks: [
      { file: 'holizna_make_funk', title: 'Make Funk', artist: 'HoliznaCC0', dur: 163 },
      { file: 'loyaltyfreak_chillin_at_the_club', title: "Chillin' At The Club", artist: 'Loyalty Freak Music', dur: 223 },
      { file: 'holizna_night_life', title: 'Night Life', artist: 'HoliznaCC0', dur: 224 },
    ],
  },
  {
    id: 'signalzero',
    name: 'SIGNAL ZERO',
    freq: '88.1',
    dj: '???',
    color: '#7dff9a',
    synth: true,
    lines: [
      'You are listening to a signal that does not exist. Do not adjust your set.',
      'Pirate broadcast from a van somewhere behind the Container Yard. Keep it quiet.',
      'No ads, no DJ, no license. Just the loop.',
      'If the police ask, you never heard this frequency.',
    ],
    tracks: [{ file: '', title: 'Untitled Loop', artist: 'Signal Zero', dur: 90 }],
  },
];

/** Fake 1996 spots for the businesses you can actually visit in the game. */
export const ADS: string[] = [
  'Sol Palma Pawn: we buy gold, we buy watches, we ask no questions. Mixers, sealers, scanners — every tool a small business needs.',
  'Quick Stop 24, open twenty-four hours because sleep is for the rich. Baggies, batteries, boiled peanuts.',
  'Club Mirage. DJ Tidal every night this week. Dress code: sunglasses indoors.',
  'Ocean View Motel, room by the hour, day or week. Color TV, vacancy, no questions at the desk.',
  'Lucky Laundromat: your whites come out white and your questions come out answered. Open late, cash only.',
  "Rojas Auto Repair: brakes, A/C, tires, and one '88 sedan out front with your name on it. Financing available, references not.",
  'Neptune Arcade. Two-for-one tokens on Tuesdays. Adults welcome, nobody checks.',
  'Marlin Fish Market: fresh off the boat, or at least fresh off a boat.',
  'Flamingo Diner, corner booth always open. Coffee refills until the night nurse shift ends.',
  "Del Mar Records: CDs, tapes, vinyl. If it charted in '96, it is on the wall.",
  'Bay Cinema: RIPTIDE II, now on the big screen and, allegedly, already on VHS.',
  'Sandbar Ice Cream on the pier. Two scoops, one sunburn.',
]

const ZONES = ['Downtown', 'the Docks', 'the Beach strip'];

/**
 * GTA-style radio: several stations with their own DJ, playlist and chatter. Stations keep
 * running while you are tuned elsewhere, so switching back lands you mid-song. Music is played
 * through an HTMLAudioElement routed into the WebAudio master gain so the volume sliders apply.
 */
export class Radio {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private el: HTMLAudioElement | null = null;
  private synth = new SynthLoop();
  playing = false;
  volume = 0.35;
  private level = 1;
  station = 0;
  /** Playlist position per station (seconds into the whole playlist) + when we last saw it. */
  private pos: number[] = STATIONS.map((_, i) => (i * 97) % 200);
  private leftAt: number[] = STATIONS.map(() => performance.now());
  private trackIndex = 0;
  private synthFallback = false;
  private chatterTimer = 0;
  private pendingSeek: (() => void) | null = null;
  private lineIndex: number[] = STATIONS.map(() => 0);
  private adIndex = 0;
  private lastText = '';
  /** HUD hook: station label, track label (null while off), a transient DJ/ad line. */
  onAir: ((station: Station | null, track: string, line: string | null) => void) | null = null;
  context: (() => RadioContext) | null = null;

  attach(ctx: AudioContext, master: AudioNode): void {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(master);
    this.synth.attach(ctx, this.out);
    this.synth.volume = 1;
    try {
      this.el = new Audio();
      this.el.preload = 'auto';
      this.el.crossOrigin = 'anonymous';
      const node = ctx.createMediaElementSource(this.el);
      node.connect(this.out);
      this.el.addEventListener('ended', () => this.advance());
      this.el.addEventListener('error', () => this.onError());
    } catch {
      this.el = null;
    }
  }

  get current(): Station {
    return STATIONS[this.station];
  }

  nowPlaying(): { station: Station; track: Track } {
    const st = this.current;
    return { station: st, track: st.tracks[this.trackIndex % st.tracks.length] };
  }

  start(): void {
    if (!this.ctx || !this.out || this.playing) return;
    this.playing = true;
    this.out.gain.setTargetAtTime(this.volume * this.level, this.ctx.currentTime, 0.3);
    this.tuneIn(true);
  }

  stop(): void {
    if (!this.ctx || !this.out) return;
    if (!this.playing) return;
    this.playing = false;
    this.rememberPos();
    this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
    this.synth.stop();
    if (this.el) this.el.pause();
    this.onAir?.(null, '', null);
  }

  /** Switch station (wraps). Returns the new station. */
  tune(index: number): Station {
    const next = ((index % STATIONS.length) + STATIONS.length) % STATIONS.length;
    if (next === this.station && this.playing) return this.current;
    if (this.playing) this.rememberPos();
    this.station = next;
    if (this.playing) this.tuneIn(true);
    return this.current;
  }

  next(): Station {
    return this.tune(this.station + 1);
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.ctx && this.out && this.playing) this.out.gain.setTargetAtTime(v * this.level, this.ctx.currentTime, 0.2);
  }

  /** 0..1 loudness (car stereo vs. walkman). */
  setLevel(level: number): void {
    this.level = level;
    if (!this.ctx || !this.out || !this.playing) return;
    this.out.gain.setTargetAtTime(this.volume * level, this.ctx.currentTime, 0.2);
  }

  /** Drives the DJ chatter. Call once per frame with the real (uncapped) dt. */
  update(dt: number): void {
    if (!this.playing) return;
    this.chatterTimer -= dt;
    if (this.chatterTimer <= 0) {
      this.chatterTimer = 50 + Math.random() * 40;
      this.say(Math.random() < 0.4 && !this.current.synth ? this.nextAd() : this.nextLine());
    }
  }

  private totalDur(st: Station): number {
    return st.tracks.reduce((a, t) => a + t.dur, 0);
  }

  private rememberPos(): void {
    const st = this.current;
    let elapsed = 0;
    for (let i = 0; i < this.trackIndex; i++) elapsed += st.tracks[i].dur;
    elapsed += this.el && !st.synth && !this.synthFallback ? this.el.currentTime : 0;
    this.pos[this.station] = elapsed % this.totalDur(st);
    this.leftAt[this.station] = performance.now();
  }

  /** Resume the station where it "would be" now. */
  private tuneIn(announce: boolean): void {
    const st = this.current;
    const total = this.totalDur(st);
    const away = (performance.now() - this.leftAt[this.station]) / 1000;
    let p = (this.pos[this.station] + away) % total;
    this.trackIndex = 0;
    while (p >= st.tracks[this.trackIndex].dur) {
      p -= st.tracks[this.trackIndex].dur;
      this.trackIndex++;
    }
    this.synthFallback = false;
    this.playTrack(p);
    this.chatterTimer = announce ? 3 : 20;
    if (announce) this.announce();
  }

  private playTrack(offset: number): void {
    const st = this.current;
    const track = st.tracks[this.trackIndex];
    if (st.synth || !this.el) {
      if (this.el) this.el.pause();
      this.synth.start();
      return;
    }
    this.synth.stop();
    const el = this.el;
    if (this.pendingSeek) el.removeEventListener('loadedmetadata', this.pendingSeek);
    const src = `/assets/music/${track.file}.ogg`;
    el.src = src;
    const seek = (): void => {
      this.pendingSeek = null;
      if (!el.src.endsWith(src)) return; // a later tune replaced this track
      try {
        if (offset > 1 && offset < (Number.isFinite(el.duration) ? el.duration : track.dur) - 2) el.currentTime = offset;
      } catch {
        /* not seekable yet */
      }
    };
    this.pendingSeek = seek;
    el.addEventListener('loadedmetadata', seek, { once: true });
    void el.play().catch(() => this.onError());
  }

  private onError(): void {
    // file missing or blocked: keep the station identity, play the synth loop instead
    if (!this.playing || this.synthFallback) return;
    this.synthFallback = true;
    if (this.el) this.el.pause();
    this.synth.start();
  }

  private advance(): void {
    if (!this.playing) return;
    const st = this.current;
    this.trackIndex = (this.trackIndex + 1) % st.tracks.length;
    this.playTrack(0);
    this.announce();
    this.chatterTimer = 45 + Math.random() * 45;
  }

  private announce(): void {
    this.say(this.nextLine());
  }

  private say(line: string): void {
    const { station, track } = this.nowPlaying();
    this.onAir?.(station, `${track.title} · ${track.artist}`, line);
  }

  private fill(line: string): string {
    const c = this.context?.();
    const crew = c?.crewName || 'some new crew';
    const zone = ZONES[(c?.day ?? 0) % ZONES.length];
    return line.replace('{crew}', crew).replace('{zone}', zone);
  }

  private nextLine(): string {
    const st = this.current;
    const c = this.context?.();
    // topical lines first: the city reacts to what you are doing
    if (c && c.heat >= 60 && Math.random() < 0.6 && this.lastText !== 'heat') {
      this.lastText = 'heat';
      return `${st.dj}: ` + this.fill(st.synth ? 'Scanner says every unit in the city is looking for somebody. Stay off the main roads.' : `News flash: police report a suspect on foot near {zone}. Drivers, expect checkpoints.`);
    }
    if (c && c.eventId === 'crackdown' && Math.random() < 0.5 && this.lastText !== 'event') {
      this.lastText = 'event';
      return `${st.dj}: Sol Palma PD announced a crackdown this morning. Extra patrols, extra attitude.`;
    }
    if (c && c.trend && Math.random() < 0.35 && this.lastText !== 'trend') {
      this.lastText = 'trend';
      return `${st.dj}: ` + (st.synth ? `Everybody on the strip wants ${c.trend} tonight. You did not hear it from me.` : `Street report: ${c.trend} is the word on the boardwalk today. Whatever that means.`);
    }
    if (c && c.eventId === 'club_night' && Math.random() < 0.5 && this.lastText !== 'event') {
      this.lastText = 'event';
      return `${st.dj}: Club night at Club Mirage. Line around the block, wallets wide open.`;
    }
    this.lastText = 'line';
    const i = this.lineIndex[this.station]++ % st.lines.length;
    return `${st.dj}: ${this.fill(st.lines[i])}`;
  }

  private nextAd(): string {
    this.lastText = 'ad';
    return 'AD · ' + ADS[this.adIndex++ % ADS.length];
  }
}
