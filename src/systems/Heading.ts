/**
 * Heading maths shared by the HUD compass, the radar and the city map.
 * Convention everywhere: the player looks along (-sin yaw, -cos yaw); yaw 0 faces -z (north on the map).
 */

/** Wrap an angle into (-π, π]. */
export function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/**
 * Angle of a target relative to the view, clockwise positive (0 = straight ahead, +π/2 = on the right).
 * This is the CSS rotation the compass arrow needs, in radians.
 */
export function compassAngle(px: number, pz: number, yaw: number, tx: number, tz: number): number {
  const bearing = Math.atan2(-(tx - px), -(tz - pz));
  return -wrapAngle(bearing - yaw);
}

/**
 * Canvas rotation for an "up-pointing" arrow so it shows the facing on a north-up map
 * (screen x = world x, screen y = world z). Facing north is 0, east is +π/2 (clockwise), west is -π/2.
 */
export function mapArrowRotation(yaw: number): number {
  return wrapAngle(-yaw);
}
