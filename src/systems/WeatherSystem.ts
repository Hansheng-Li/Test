import { hashString } from '../utils/math';

/** Share of mornings that start in fog. */
export const FOG_CHANCE = 35;
/** Fog sits on the city from FOG_START, holds until FOG_HOLD_UNTIL and is gone by FOG_END (hours). */
export const FOG_START = 5;
export const FOG_HOLD_UNTIL = 7.5;
export const FOG_END = 8.5;
/** At full fog everyone (officers, the cruiser, witnesses) sees this much less far. */
export const FOG_SIGHT_CUT = 0.45;

/** Whether this calendar day starts in fog: decided by the save seed, like the showers. */
export function foggyDay(seed: number, day: number): boolean {
  return hashString('fog' + day + ':' + seed) % 100 < FOG_CHANCE;
}

/** Fog density 0..1 for a moment of the day: a ramp in over half an hour, a hold, a slow burn-off. */
export function fogLevel(seed: number, day: number, hour: number): number {
  if (!foggyDay(seed, day)) return 0;
  if (hour < FOG_START || hour >= FOG_END) return 0;
  if (hour < FOG_START + 0.5) return (hour - FOG_START) / 0.5;
  if (hour <= FOG_HOLD_UNTIL) return 1;
  return Math.max(0, 1 - (hour - FOG_HOLD_UNTIL) / (FOG_END - FOG_HOLD_UNTIL));
}

/** Multiplier on every sight range while it is foggy. */
export function sightMultiplier(fog: number): number {
  return 1 - FOG_SIGHT_CUT * Math.max(0, Math.min(1, fog));
}
