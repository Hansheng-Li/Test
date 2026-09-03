import * as THREE from 'three';
import { mergeGeometries } from './Props';

/**
 * Draw-call reduction: static single-material meshes that share a material are
 * merged into one mesh per (material, shadow flags) bucket. Anything flagged
 * `userData.dynamic` (or under such a parent) is left alone so gameplay code can
 * still toggle visibility on it.
 */
export function mergeStaticMeshes(root: THREE.Object3D): { before: number; after: number } {
  root.updateMatrixWorld(true);
  const buckets = new Map<string, { material: THREE.Material; cast: boolean; receive: boolean; geos: THREE.BufferGeometry[]; meshes: THREE.Mesh[] }>();
  let before = 0;
  const isDynamic = (o: THREE.Object3D): boolean => {
    let p: THREE.Object3D | null = o;
    while (p) {
      if (p.userData.dynamic) return true;
      p = p.parent;
    }
    return false;
  };
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh) return;
    before++;
    if (Array.isArray(o.material)) return;
    if (isDynamic(o)) return;
    const g = o.geometry;
    if (!g.getAttribute('position') || !g.getAttribute('normal') || !g.getAttribute('uv')) return;
    const key = o.material.uuid + '|' + (o.castShadow ? 1 : 0) + (o.receiveShadow ? 1 : 0);
    let b = buckets.get(key);
    if (!b) {
      b = { material: o.material, cast: o.castShadow, receive: o.receiveShadow, geos: [], meshes: [] };
      buckets.set(key, b);
    }
    b.geos.push(g.clone().applyMatrix4(o.matrixWorld));
    b.meshes.push(o);
  });
  let merged = 0;
  for (const b of buckets.values()) {
    if (b.meshes.length < 2) {
      for (const g of b.geos) g.dispose();
      continue;
    }
    const geo = mergeGeometries(b.geos);
    for (const g of b.geos) g.dispose();
    const m = new THREE.Mesh(geo, b.material);
    m.castShadow = b.cast;
    m.receiveShadow = b.receive;
    m.frustumCulled = true;
    root.add(m);
    for (const old of b.meshes) old.parent?.remove(old);
    merged += b.meshes.length - 1;
  }
  return { before, after: before - merged };
}
