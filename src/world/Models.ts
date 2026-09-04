import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeStaticMeshes } from './StaticMerge';
import { seeded } from '../utils/math';
import type { CityResult } from './City';

/**
 * Optional CC0 GLB models (Kenney Car Kit, see public/assets/LICENSES.md). Everything here is a visual
 * upgrade over the procedural box props: if a file is missing or fails to parse, the boxes stay.
 * Materials are converted to MeshLambertMaterial so the models shade like the rest of the city.
 */
const cache = new Map<string, Promise<THREE.Group | null>>();
let loader: GLTFLoader | null = null;

export function loadModel(name: string): Promise<THREE.Group | null> {
  let p = cache.get(name);
  if (p) return p;
  loader ??= new GLTFLoader();
  p = new Promise<THREE.Group | null>((resolve) => {
    loader!.load(
      `/assets/models/${name}.glb`,
      (gltf) => {
        // Kenney cars face -z; the game's vehicles and props treat +z as the front, so flip the root
        const root = new THREE.Group();
        gltf.scene.rotation.y = Math.PI;
        root.add(gltf.scene);
        root.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          const src = o.material as THREE.MeshStandardMaterial;
          const m = new THREE.MeshLambertMaterial({ color: src.color, transparent: src.transparent, opacity: src.opacity });
          m.name = src.name;
          o.material = m;
          o.castShadow = true;
          // the static merge needs a uv channel; Kenney models are vertex-coloured and ship without one
          const g = o.geometry as THREE.BufferGeometry;
          if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
        });
        resolve(root);
      },
      undefined,
      () => resolve(null),
    );
  });
  cache.set(name, p);
  return p;
}

/** Clone with an optional body colour: any material named paint* is replaced. */
export function instanceModel(model: THREE.Group, opts: { paint?: string; scale?: number } = {}): THREE.Group {
  const g = model.clone(true);
  const painted = new Map<string, THREE.Material>();
  g.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const mat = o.material as THREE.MeshLambertMaterial;
    if (opts.paint && mat.name.startsWith('paint')) {
      let pm = painted.get(mat.name);
      if (!pm) {
        pm = new THREE.MeshLambertMaterial({ color: opts.paint });
        pm.name = mat.name;
        painted.set(mat.name, pm);
      }
      o.material = pm;
    }
  });
  if (opts.scale) g.scale.setScalar(opts.scale);
  return g;
}

export const CAR_SCALE = 1.55;

let wheelGeo: THREE.BufferGeometry | null = null;
/** Low-poly stand-in for the Kenney wheel (axle along x, same 0.3 radius). */
function parkedWheelGeometry(): THREE.BufferGeometry {
  if (!wheelGeo) {
    wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.24, 10);
    wheelGeo.rotateZ(Math.PI / 2);
  }
  return wheelGeo;
}
const PARKED_VARIANTS = ['sedan', 'sedanSports', 'hatchbackSports', 'suv', 'suvLuxury', 'taxi', 'van', 'delivery'];

/** Replace the box cars parked along the streets with Kenney models, merged into a few draw calls. */
export async function upgradeParkedCars(city: CityResult): Promise<boolean> {
  const models = await Promise.all(PARKED_VARIANTS.map((v) => loadModel(v)));
  const ok = models.filter((m): m is THREE.Group => !!m);
  const special = new Map<string, THREE.Group | null>();
  for (const spec of city.parkedCars) if (spec.model && !special.has(spec.model)) special.set(spec.model, await loadModel(spec.model));
  if (!ok.length || !city.parkedGroup.parent) return false;
  const rnd = seeded(77);
  const group = new THREE.Group();
  for (const spec of city.parkedCars) {
    const idx = Math.floor(rnd() * ok.length);
    const model = (spec.model ? special.get(spec.model) : null) ?? ok[idx];
    // taxis and police cruisers keep their livery, everything else gets the spot's colour
    const paint = spec.model || PARKED_VARIANTS[models.indexOf(model)] === 'taxi' ? undefined : spec.color;
    const car = instanceModel(model, { paint, scale: CAR_SCALE });
    // parked cars are scenery: no shadow pass, and the 284-triangle wheels become 10-sided cylinders
    const wheels: THREE.Object3D[] = [];
    car.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = false;
      if (o.name.startsWith('wheel')) wheels.push(o);
    });
    for (const w of wheels) {
      // a wheel node is a Group of primitives (tire + hub) or a single mesh; either way keep the tire material
      let mat: THREE.Material | null = null;
      w.traverse((o) => { if (!mat && o instanceof THREE.Mesh) mat = Array.isArray(o.material) ? o.material[0] : o.material; });
      if (!mat) continue;
      w.clear();
      const m = new THREE.Mesh(parkedWheelGeometry(), mat);
      m.castShadow = false;
      w.add(m);
    }
    car.position.set(spec.x, 0.15, spec.z);
    // box cars are built along local x; the (flipped) models face +z
    car.rotation.y = spec.rot + Math.PI / 2;
    group.add(car);
  }
  // shared materials so the merge can bucket by material: reuse one paint material per colour
  const byColor = new Map<string, THREE.MeshLambertMaterial>();
  group.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const m = o.material as THREE.MeshLambertMaterial;
    const key = m.name + '#' + m.color.getHexString() + (m.transparent ? 'T' : '');
    let shared = byColor.get(key);
    if (!shared) {
      shared = m;
      byColor.set(key, m);
    }
    o.material = shared;
  });
  mergeStaticMeshes(group);
  const parent = city.parkedGroup.parent;
  parent.remove(city.parkedGroup);
  parent.add(group);
  city.parkedGroup = group;
  return true;
}
