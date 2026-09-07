/** The baseball bat: a short swing in front of the player. Pure hit test so the rules are testable. */
export const BAT_RANGE = 2.4;
/** Cosine of the half-angle of the swing cone (about 50°). */
export const BAT_CONE = 0.64;
export const BAT_STUN_SECONDS = 4;
export const BAT_HEAT_COP = 18;
export const BAT_HEAT_CIVILIAN = 6;

export interface Point {
  x: number;
  z: number;
}

/**
 * Indices of targets inside the swing: within BAT_RANGE and in the player's forward cone.
 * Player forward is (-sin yaw, -cos yaw).
 */
export function swingTargets(px: number, pz: number, yaw: number, targets: Point[], range = BAT_RANGE, cone = BAT_CONE): number[] {
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const out: number[] = [];
  targets.forEach((tg, i) => {
    const dx = tg.x - px;
    const dz = tg.z - pz;
    const d = Math.hypot(dx, dz);
    if (d > range || d < 1e-6) return;
    if ((dx / d) * fx + (dz / d) * fz >= cone) out.push(i);
  });
  return out;
}
