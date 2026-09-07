import * as THREE from 'three';

/** Shared material registry so repeated props reuse GPU state. */
const mats = new Map<string, THREE.Material>();

export function lambert(color: string | number, extra: Partial<THREE.MeshLambertMaterialParameters> = {}): THREE.MeshLambertMaterial {
  const key = 'l:' + color + JSON.stringify(extra);
  let m = mats.get(key) as THREE.MeshLambertMaterial | undefined;
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, ...extra });
    mats.set(key, m);
  }
  return m;
}

export function basic(color: string | number, extra: Partial<THREE.MeshBasicMaterialParameters> = {}): THREE.MeshBasicMaterial {
  const key = 'b:' + color + JSON.stringify(extra);
  let m = mats.get(key) as THREE.MeshBasicMaterial | undefined;
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, ...extra });
    mats.set(key, m);
  }
  return m;
}

const geos = new Map<string, THREE.BufferGeometry>();
export function boxGeo(w: number, h: number, d: number): THREE.BoxGeometry {
  const key = `box:${w},${h},${d}`;
  let g = geos.get(key) as THREE.BoxGeometry | undefined;
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    geos.set(key, g);
  }
  return g;
}
export function cylGeo(rt: number, rb: number, h: number, seg = 8): THREE.CylinderGeometry {
  const key = `cyl:${rt},${rb},${h},${seg}`;
  let g = geos.get(key) as THREE.CylinderGeometry | undefined;
  if (!g) {
    g = new THREE.CylinderGeometry(rt, rb, h, seg);
    geos.set(key, g);
  }
  return g;
}

export const PALETTE = {
  asphalt: '#3d3d44',
  concrete: '#cfc7b8',
  darkConcrete: '#8d877c',
  sand: '#efdcb0',
  water: '#2a9db5',
  wood: '#8a5a33',
  metal: '#7a7f86',
  darkMetal: '#3a3d42',
  trunk: '#7a5230',
  frond: '#2f9e5a',
  frondDark: '#1f7a42',
  neonPink: '#ff4fd8',
  neonCyan: '#4ff2e8',
  neonOrange: '#ff9a3c',
  neonPurple: '#b388ff',
};
