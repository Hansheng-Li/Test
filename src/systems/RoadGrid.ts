import { ROADS_X, ROADS_Z, ROAD_WIDTH } from '../data/city';

/** Metres from the nearest road surface (0 while on one). Roads are the grid in city.ts. */
export function roadDistance(x: number, z: number): number {
  const dx = Math.min(...ROADS_X.map((r) => Math.abs(x - r)));
  const dz = Math.min(...ROADS_Z.map((r) => Math.abs(z - r)));
  return Math.max(0, Math.min(dx, dz) - ROAD_WIDTH / 2);
}

/** On (or within `margin` of) the road grid: where a cruiser can follow you. */
export function onRoadGrid(x: number, z: number, margin = 3): boolean {
  return roadDistance(x, z) <= margin;
}

/** Pull a point into the nearest road band: a cruiser on rails never drives through a block. */
export function clampToRoad(x: number, z: number, lane = 4.5): { x: number; z: number } {
  const nx = ROADS_X.reduce((a, r) => (Math.abs(x - r) < Math.abs(x - a) ? r : a), ROADS_X[0]);
  const nz = ROADS_Z.reduce((a, r) => (Math.abs(z - r) < Math.abs(z - a) ? r : a), ROADS_Z[0]);
  const ex = Math.abs(x - nx) - lane;
  const ez = Math.abs(z - nz) - lane;
  if (ex <= 0 || ez <= 0) return { x, z };
  // off both bands: slide onto whichever is closer
  if (ex < ez) return { x: nx + Math.sign(x - nx) * lane, z };
  return { x, z: nz + Math.sign(z - nz) * lane };
}
