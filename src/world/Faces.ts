import * as THREE from 'three';
import { hashString } from '../utils/math';
import { lambert } from './Materials';

/**
 * CC0 face textures from the Kenney Blocky Characters pack (see public/assets/LICENSES.md),
 * pasted on the front of the block figures' heads. Each face ships its own skin tone, so the
 * head cube is tinted to match. If a file is missing the quad stays skin-coloured and invisible.
 */
export const FACES: { file: string; skin: string }[] = [
  { file: 'face_man', skin: '#ffe0b1' },
  { file: 'face_manAlternative', skin: '#ffe0b1' },
  { file: 'face_woman', skin: '#ffe0b1' },
  { file: 'face_womanAlternative', skin: '#ffe0b1' },
  { file: 'face_adventurer', skin: '#fedfb0' },
  { file: 'face_soldier', skin: '#957544' },
];
/** The moustached soldier face is kept for District 3's officers. */
export const FACE_POLICE = 5;

let loader: THREE.TextureLoader | null = null;
const materials = new Map<number, THREE.MeshLambertMaterial>();
let quad: THREE.PlaneGeometry | null = null;

/** A civilian face picked by name: stable per customer / contact, spread across the crowd. */
export function faceIndexFor(key: string): number {
  return hashString('face:' + key) % FACE_POLICE;
}

function faceMaterial(index: number): THREE.MeshLambertMaterial {
  let m = materials.get(index);
  if (m) return m;
  const face = FACES[index];
  m = lambert(face.skin);
  materials.set(index, m);
  loader ??= new THREE.TextureLoader();
  const mat = m;
  loader.load(
    `/assets/textures/faces/${face.file}.png`,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      mat.map = tex;
      mat.color.set('#ffffff');
      mat.needsUpdate = true;
    },
    undefined,
    () => {
      /* file missing: the quad stays the skin colour */
    },
  );
  return m;
}

/** Put a face on a figure's head (the head is a 0.34 m cube whose front is +z). */
export function attachFace(head: THREE.Mesh, index: number): void {
  const i = ((index % FACES.length) + FACES.length) % FACES.length;
  quad ??= new THREE.PlaneGeometry(0.33, 0.35);
  const old = head.getObjectByName('face');
  if (old) head.remove(old);
  const face = new THREE.Mesh(quad, faceMaterial(i));
  face.name = 'face';
  face.position.z = 0.171;
  face.castShadow = false;
  head.add(face);
  (head.material as THREE.MeshLambertMaterial).color.set(FACES[i].skin);
}
