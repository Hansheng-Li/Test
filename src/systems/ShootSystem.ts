/** The pawn-shop pistol: a straight shot along the player's facing. Pure hit test so the rules are testable. */
export const SHOT_RANGE = 30;
/** Half-width of a figure for the ray test. */
export const SHOT_RADIUS = 0.55;
export const SHOT_STUN_SECONDS = 8;
export const SHOT_HEAT_COP = 35;
export const SHOT_HEAT_CIVILIAN = 15;
/** Every shot is heard: heat for the noise alone. */
export const SHOT_HEAT_NOISE = 6;
export const SHOT_PANIC_RADIUS = 25;
export const SHOT_ALARM_RADIUS = 40;
export const MAGAZINE = 6;

export interface Point {
  x: number;
  z: number;
}

/**
 * The nearest target the shot hits: within SHOT_RANGE along the direction (dx, dz) and closer than
 * SHOT_RADIUS to the ray. Returns the index and the distance along the ray, or null on a miss.
 */
export function pickShot(px: number, pz: number, dx: number, dz: number, targets: Point[], range = SHOT_RANGE, radius = SHOT_RADIUS): { index: number; dist: number } | null {
  const len = Math.hypot(dx, dz) || 1;
  const fx = dx / len;
  const fz = dz / len;
  let best: { index: number; dist: number } | null = null;
  targets.forEach((tg, i) => {
    const ox = tg.x - px;
    const oz = tg.z - pz;
    const along = ox * fx + oz * fz;
    if (along <= 0 || along > range) return;
    const side = Math.abs(ox * fz - oz * fx);
    if (side > radius) return;
    if (!best || along < best.dist) best = { index: i, dist: along };
  });
  return best;
}
