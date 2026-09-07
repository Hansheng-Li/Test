/**
 * Game clock. One real second = GAME_MINUTES_PER_SECOND game minutes.
 * A full day takes 24 * 60 / 60 = 24 real minutes at the default rate.
 */
export const GAME_MINUTES_PER_SECOND = 1;

export class GameClock {
  /** Minutes since 00:00 of day 1. */
  totalMinutes: number;
  rate = GAME_MINUTES_PER_SECOND;

  constructor(startMinutes = 24 * 60 + 15 * 60 + 30) {
    this.totalMinutes = startMinutes;
  }

  tick(dtSeconds: number): void {
    this.totalMinutes += dtSeconds * this.rate;
  }

  get day(): number {
    return Math.floor(this.totalMinutes / (24 * 60));
  }

  get minuteOfDay(): number {
    return this.totalMinutes % (24 * 60);
  }

  get hour(): number {
    return this.minuteOfDay / 60;
  }

  get isNight(): boolean {
    const h = this.hour;
    return h >= 20 || h < 6;
  }

  /** 0 at midnight, 1 at noon, follows a smooth curve for lighting. */
  get daylight(): number {
    const h = this.hour;
    // sunrise 6:00 -> full 9:00, sunset starts 18:00 -> dark 20:30
    if (h < 5.5 || h >= 20.5) return 0;
    if (h < 8.5) return (h - 5.5) / 3;
    if (h < 18) return 1;
    return 1 - (h - 18) / 2.5;
  }

  formatClock(): string {
    const m = Math.floor(this.minuteOfDay);
    const hh = Math.floor(m / 60).toString().padStart(2, '0');
    const mm = (m % 60).toString().padStart(2, '0');
    return `${hh}:${mm}`;
  }

  static formatMinutes(total: number): string {
    const m = Math.floor(total % (24 * 60));
    const hh = Math.floor(m / 60).toString().padStart(2, '0');
    const mm = (m % 60).toString().padStart(2, '0');
    return `${hh}:${mm}`;
  }
}
