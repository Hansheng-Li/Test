import * as THREE from 'three';
import { loadModel, instanceModel } from './Models';
import { mergeStaticMeshes } from './StaticMerge';
import { aabbFromBottom } from '../physics/Colliders';
import type { CityResult } from './City';

/** Kenney Furniture Kit is built at half scale: x2 puts a sofa at two metres. */
const SCALE = 2;
const FLOOR = 0.15;

interface Piece {
  model: string;
  x: number;
  z: number;
  /** Y rotation in radians. */
  rot?: number;
  /** Solid footprint (w, h, d) in metres; omitted for rugs, lamps and small props. */
  solid?: [number, number, number];
}

/**
 * Set dressing for the interiors: CC0 furniture placed around the gameplay props that already exist.
 * Purely additive — if a model fails to load the room keeps its box furniture.
 */
const PIECES: Piece[] = [
  // back room (x -28..-14, z 8..20; bed NW, prep/pack tables along the south wall, shelf on the west wall)
  { model: 'rugRectangle', x: -19, z: 13.5 },
  { model: 'loungeSofa', x: -17.5, z: 16, rot: Math.PI, solid: [2, 0.9, 0.9] },
  { model: 'cabinetTelevision', x: -17.5, z: 11, rot: 0, solid: [1.6, 0.6, 0.5] },
  { model: 'televisionVintage', x: -17.5, z: 11, rot: 0 },
  { model: 'pottedPlant', x: -15, z: 19, rot: 0 },
  { model: 'lampSquareFloor', x: -15, z: 12.3, rot: 0 },
  { model: 'bookcaseOpen', x: -27.4, z: 19.2, rot: Math.PI / 2, solid: [0.5, 1.8, 0.8] },
  // motel room 6 (x 142..150, z -69..-61)
  { model: 'rugRectangle', x: 146, z: -64.5 },
  { model: 'loungeChair', x: 147.5, z: -64.5, rot: -Math.PI / 2, solid: [1, 0.9, 0.9] },
  { model: 'plantSmall2', x: 149.2, z: -68.5, rot: 0 },
  { model: 'lampSquareFloor', x: 149.3, z: -61.6, rot: 0 },
  // club lounge corner + bar stools (bar counter at x 141, public side -x)
  { model: 'stoolBar', x: 139.3, z: -2.5, rot: Math.PI / 2, solid: [0.5, 0.9, 0.5] },
  { model: 'stoolBar', x: 139.3, z: -0.5, rot: Math.PI / 2, solid: [0.5, 0.9, 0.5] },
  { model: 'stoolBar', x: 139.3, z: 1.5, rot: Math.PI / 2, solid: [0.5, 0.9, 0.5] },
  { model: 'stoolBar', x: 139.3, z: 3.5, rot: Math.PI / 2, solid: [0.5, 0.9, 0.5] },
  { model: 'loungeSofa', x: 144, z: -12.5, rot: Math.PI, solid: [2, 0.9, 0.9] },
  { model: 'tableCoffee', x: 144, z: -10, rot: 0, solid: [1.3, 0.5, 0.8] },
  { model: 'pottedPlant', x: 148, z: -13.5, rot: 0 },
  { model: 'speaker', x: 121.5, z: -3, rot: 0 },
  { model: 'speaker', x: 121.5, z: 13, rot: 0 },
  // warehouse office corner (outside the placement area)
  { model: 'deskCorner', x: -156, z: -79.5, rot: Math.PI, solid: [2, 0.8, 2.3] },
  { model: 'computerScreen', x: -156.4, z: -79.8, rot: Math.PI },
  { model: 'chair', x: -156, z: -77, rot: 0 },
  { model: 'bookcaseOpen', x: -152.5, z: -76, rot: -Math.PI / 2, solid: [0.5, 1.8, 0.8] },
  { model: 'kitchenFridgeSmall', x: -197, z: -80, rot: 0, solid: [0.9, 1.2, 0.7] },
];

export async function dressInteriors(scene: THREE.Scene, city: CityResult): Promise<number> {
  const names = Array.from(new Set(PIECES.map((p) => p.model)));
  const loaded = new Map<string, THREE.Group | null>();
  await Promise.all(names.map(async (n) => loaded.set(n, await loadModel('furniture/' + n))));
  const group = new THREE.Group();
  let placed = 0;
  for (const p of PIECES) {
    const model = loaded.get(p.model);
    if (!model) continue;
    const inst = instanceModel(model, { scale: SCALE });
    inst.position.set(p.x, FLOOR, p.z);
    inst.rotation.y = p.rot ?? 0;
    inst.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = false; });
    group.add(inst);
    if (p.solid) city.colliders.add(aabbFromBottom(p.x, FLOOR, p.z, p.solid[0], p.solid[1], p.solid[2], 'furniture'));
    placed++;
  }
  if (!placed) return 0;
  mergeStaticMeshes(group);
  scene.add(group);
  return placed;
}
