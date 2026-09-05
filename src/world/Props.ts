import * as THREE from 'three';
import { AABB, aabbFromBottom, CollisionWorld } from '../physics/Colliders';
import { lambert, basic, boxGeo, cylGeo, PALETTE } from './Materials';
import { containerTexture, signTexture } from './Textures';
import { seeded } from '../utils/math';

/** Helper that places a mesh and registers its collider in one call. */
export class PropBuilder {
  /** Every collider this builder registered (so dynamic objects can be torn down again). */
  added: AABB[] = [];

  constructor(public group: THREE.Group, public colliders: CollisionWorld) {}

  solidBox(cx: number, bottomY: number, cz: number, w: number, h: number, d: number, material: THREE.Material | THREE.Material[], tag?: string, castShadow = false): THREE.Mesh {
    const m = new THREE.Mesh(boxGeo(w, h, d), material);
    m.position.set(cx, bottomY + h / 2, cz);
    m.castShadow = castShadow;
    m.receiveShadow = true;
    this.group.add(m);
    this.added.push(this.colliders.add(aabbFromBottom(cx, bottomY, cz, w, h, d, tag)));
    return m;
  }

  visualBox(cx: number, bottomY: number, cz: number, w: number, h: number, d: number, material: THREE.Material | THREE.Material[]): THREE.Mesh {
    const m = new THREE.Mesh(boxGeo(w, h, d), material);
    m.position.set(cx, bottomY + h / 2, cz);
    m.receiveShadow = true;
    this.group.add(m);
    return m;
  }

  collider(box: AABB): void {
    this.added.push(this.colliders.add(box));
  }
}

// ---------------------------------------------------------------- palms

export interface PalmSet {
  trunks: THREE.InstancedMesh;
  fronds: THREE.InstancedMesh;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();

export function buildPalms(group: THREE.Group, colliders: CollisionWorld, positions: { x: number; z: number; y?: number; h?: number }[]): PalmSet {
  const n = positions.length;
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.32, 1, 6);
  trunkGeo.translate(0, 0.5, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, lambert(PALETTE.trunk), n);
  // frond crown: 6 flat tilted boxes merged into one geometry
  const frondPieces: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const g = new THREE.BoxGeometry(0.5, 0.08, 3.4);
    g.translate(0, 0, 1.5);
    const e = new THREE.Euler(-0.55, (i / 7) * Math.PI * 2, 0, 'YXZ');
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(e));
    frondPieces.push(g);
  }
  const frondGeo = mergeGeometries(frondPieces);
  const fronds = new THREE.InstancedMesh(frondGeo, lambert(PALETTE.frond), n);
  const rnd = seeded(99);
  positions.forEach((p, i) => {
    const h = p.h ?? 5 + rnd() * 3;
    const y = p.y ?? 0.15;
    const lean = (rnd() - 0.5) * 0.18;
    _e.set(lean, rnd() * Math.PI * 2, 0);
    _q.setFromEuler(_e);
    _s.set(1, h, 1);
    _p.set(p.x, y, p.z);
    _m.compose(_p, _q, _s);
    trunks.setMatrixAt(i, _m);
    _s.set(1, 1, 1);
    _p.set(p.x + Math.sin(lean) * h * -0.5, y + h - 0.2, p.z);
    _e.set(0, rnd() * Math.PI * 2, 0);
    _q.setFromEuler(_e);
    _m.compose(_p, _q, _s);
    fronds.setMatrixAt(i, _m);
    colliders.add(aabbFromBottom(p.x, y, p.z, 0.6, h, 0.6, 'palm'));
  });
  trunks.castShadow = true;
  fronds.castShadow = true;
  group.add(trunks, fronds);
  return { trunks, fronds };
}

// ---------------------------------------------------------------- street lights

export function buildStreetLights(group: THREE.Group, colliders: CollisionWorld, positions: { x: number; z: number }[]): { bulbMaterial: THREE.MeshLambertMaterial } {
  const n = positions.length;
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 6, 6);
  poleGeo.translate(0, 3, 0);
  const poles = new THREE.InstancedMesh(poleGeo, lambert(PALETTE.darkMetal), n);
  const headGeo = new THREE.BoxGeometry(0.5, 0.25, 1.2);
  const bulbMat = lambert('#fff1b8', { emissive: '#ffd77a', emissiveIntensity: 0 });
  const heads = new THREE.InstancedMesh(headGeo, bulbMat, n);
  positions.forEach((p, i) => {
    _m.makeTranslation(p.x, 0.15, p.z);
    poles.setMatrixAt(i, _m);
    _m.makeTranslation(p.x, 6.05, p.z);
    heads.setMatrixAt(i, _m);
    colliders.add(aabbFromBottom(p.x, 0.15, p.z, 0.3, 6, 0.3, 'pole'));
  });
  group.add(poles, heads);
  return { bulbMaterial: bulbMat };
}

// ---------------------------------------------------------------- small props

export function buildBench(pb: PropBuilder, x: number, z: number, rot: number): void {
  const g = new THREE.Group();
  const seat = new THREE.Mesh(boxGeo(1.8, 0.1, 0.5), lambert('#a9744f'));
  seat.position.y = 0.55;
  const back = new THREE.Mesh(boxGeo(1.8, 0.4, 0.08), lambert('#a9744f'));
  back.position.set(0, 0.85, -0.22);
  const legL = new THREE.Mesh(boxGeo(0.08, 0.5, 0.5), lambert(PALETTE.darkMetal));
  legL.position.set(-0.8, 0.3, 0);
  const legR = legL.clone();
  legR.position.x = 0.8;
  g.add(seat, back, legL, legR);
  g.position.set(x, 0.15, z);
  g.rotation.y = rot;
  pb.group.add(g);
  pb.collider(aabbFromBottom(x, 0.15, z, 1.8, 1, 0.6, 'bench'));
}

export function buildTrashCan(pb: PropBuilder, x: number, z: number): void {
  const m = new THREE.Mesh(cylGeo(0.35, 0.3, 0.9, 8), lambert('#4c5a3a'));
  m.position.set(x, 0.6, z);
  pb.group.add(m);
  pb.collider(aabbFromBottom(x, 0.15, z, 0.7, 0.9, 0.7, 'trash'));
}

export function buildDumpster(pb: PropBuilder, x: number, z: number, rot = 0): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(boxGeo(2.4, 1.3, 1.4), lambert('#2f6b4f'));
  body.position.y = 0.75;
  const lid = new THREE.Mesh(boxGeo(2.5, 0.12, 1.5), lambert('#245640'));
  lid.position.y = 1.45;
  g.add(body, lid);
  g.position.set(x, 0.15, z);
  g.rotation.y = rot;
  pb.group.add(g);
  pb.collider(aabbFromBottom(x, 0.15, z, rot ? 1.5 : 2.5, 1.6, rot ? 2.5 : 1.5, 'dumpster'));
  return g;
}

const carMats = new Map<string, THREE.MeshLambertMaterial>();
function carMat(color: string): THREE.MeshLambertMaterial {
  let m = carMats.get(color);
  if (!m) {
    m = lambert(color);
    carMats.set(color, m);
  }
  return m;
}

/** Box fallback for a parked car (shared materials per colour so the static merge stays small). */
export function buildCar(pb: PropBuilder, x: number, z: number, rot: number, color: string): void {
  const g = new THREE.Group();
  const body = new THREE.Mesh(boxGeo(4.4, 0.7, 1.9), carMat(color));
  body.position.y = 0.55;
  const cabin = new THREE.Mesh(boxGeo(2.4, 0.65, 1.7), carMat('#1c2533'));
  cabin.position.set(-0.2, 1.2, 0);
  g.add(body, cabin);
  const wheelGeo = cylGeo(0.35, 0.35, 0.25, 8);
  for (const [wx, wz] of [[-1.4, 0.95], [1.4, 0.95], [-1.4, -0.95], [1.4, -0.95]]) {
    const w = new THREE.Mesh(wheelGeo, carMat('#151515'));
    w.rotation.x = Math.PI / 2;
    w.position.set(wx, 0.35, wz);
    g.add(w);
  }
  g.position.set(x, 0.15, z);
  g.rotation.y = rot;
  g.castShadow = true;
  pb.group.add(g);
  const along = Math.abs(Math.cos(rot)) > 0.5;
  pb.collider(aabbFromBottom(x, 0.15, z, along ? 4.4 : 1.9, 1.6, along ? 1.9 : 4.4, 'car'));
}

export function buildFence(pb: PropBuilder, x0: number, z0: number, x1: number, z1: number): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const mesh = new THREE.Mesh(boxGeo(len, 2.2, 0.08), lambert('#8f9aa3', { transparent: true, opacity: 0.55 }));
  mesh.position.set(cx, 0.15 + 1.1, cz);
  mesh.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
  pb.group.add(mesh);
  const horizontal = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  pb.collider(aabbFromBottom(cx, 0.15, cz, horizontal ? len : 0.3, 2.2, horizontal ? 0.3 : len, 'fence'));
  // posts
  const n = Math.floor(len / 4);
  const postGeo = cylGeo(0.05, 0.05, 2.3, 5);
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0.5 : i / n;
    const p = new THREE.Mesh(postGeo, lambert(PALETTE.metal));
    p.position.set(x0 + (x1 - x0) * t, 0.15 + 1.15, z0 + (z1 - z0) * t);
    pb.group.add(p);
  }
}

export function buildContainer(pb: PropBuilder, x: number, z: number, color: string, rot = 0, stackY = 0): void {
  const tex = containerTexture(color);
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  const m = new THREE.Mesh(boxGeo(12, 2.6, 2.5), [mat, mat, lambert(color), lambert(color), lambert(color), lambert(color)]);
  m.position.set(x, 0.15 + stackY + 1.3, z);
  m.rotation.y = rot;
  m.castShadow = true;
  pb.group.add(m);
  if (stackY === 0) {
    const along = Math.abs(Math.cos(rot)) > 0.5;
    pb.collider(aabbFromBottom(x, 0.15, z, along ? 12 : 2.5, 5.4, along ? 2.5 : 12, 'container'));
  }
}

/** Street dice: a crate with two dice and a chalk line, tucked by the arcade. */
export function buildDiceTable(pb: PropBuilder, x: number, z: number, rot: number): THREE.Group {
  const g = new THREE.Group();
  const crate = new THREE.Mesh(boxGeo(1.4, 0.8, 1.0), lambert('#8d6e63'));
  crate.position.y = 0.4;
  const felt = new THREE.Mesh(boxGeo(1.3, 0.04, 0.9), lambert('#1b5e20'));
  felt.position.y = 0.82;
  const dieMat = lambert('#f5f5f5');
  for (const [dx, dz, ry] of [[-0.25, 0.1, 0.4], [0.2, -0.15, 1.1]]) {
    const die = new THREE.Mesh(boxGeo(0.18, 0.18, 0.18), dieMat);
    die.position.set(dx, 0.93, dz);
    die.rotation.y = ry;
    g.add(die);
  }
  const cash = new THREE.Mesh(boxGeo(0.35, 0.03, 0.18), lambert('#7dff9a'));
  cash.position.set(0.45, 0.85, 0.3);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.45), new THREE.MeshBasicMaterial({ map: signTexture('STREET DICE', { color: '#ffd166', bg: '#111111', glow: false, sub: 'HIGH · LOW · 7 IS THE HOUSE' }), side: THREE.DoubleSide }));
  sign.position.set(0, 1.6, -0.55);
  g.add(crate, felt, cash, sign);
  g.position.set(x, 0.15, z);
  g.rotation.y = rot;
  pb.group.add(g);
  pb.collider(aabbFromBottom(x, 0.15, z, 1.4, 1.0, 1.0, 'dice'));
  return g;
}

/** Transit stop: a pole with a sign and a small shelter roof over a bench. */
export function buildBusStop(pb: PropBuilder, x: number, z: number, rot: number): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(cylGeo(0.06, 0.06, 2.8, 6), lambert(PALETTE.metal));
  pole.position.set(-1.2, 1.4, 0);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.5), new THREE.MeshBasicMaterial({ map: signTexture('BUS', { color: '#ffffff', bg: '#e67e22', glow: false, sub: 'SOL PALMA TRANSIT' }), side: THREE.DoubleSide }));
  sign.position.set(-1.2, 2.55, 0.05);
  const roof = new THREE.Mesh(boxGeo(3, 0.1, 1.4), lambert('#e67e22'));
  roof.position.set(0.4, 2.4, -0.2);
  const back = new THREE.Mesh(boxGeo(3, 2.3, 0.08), lambert('#dfe6ee', { transparent: true, opacity: 0.55 }));
  back.position.set(0.4, 1.25, -0.85);
  const seat = new THREE.Mesh(boxGeo(2.4, 0.1, 0.5), lambert('#a9744f'));
  seat.position.set(0.4, 0.55, -0.4);
  for (const sx of [-0.6, 1.4]) {
    const leg = new THREE.Mesh(boxGeo(0.1, 0.5, 0.4), lambert(PALETTE.darkMetal));
    leg.position.set(sx, 0.25, -0.4);
    g.add(leg);
    const post = new THREE.Mesh(boxGeo(0.08, 2.4, 0.08), lambert(PALETTE.darkMetal));
    post.position.set(sx, 1.2, -0.85);
    g.add(post);
  }
  g.add(pole, sign, roof, back, seat);
  g.position.set(x, 0.15, z);
  g.rotation.y = rot;
  pb.group.add(g);
  const along = Math.abs(Math.cos(rot)) > 0.5;
  pb.collider(aabbFromBottom(x + (along ? 0.4 : 0), 0.15, z + (along ? -0.6 : 0.4), along ? 3 : 1.2, 2.4, along ? 0.8 : 3, 'bus_stop'));
  return g;
}

export function buildPayphone(pb: PropBuilder, x: number, z: number, rot: number): THREE.Group {
  const g = new THREE.Group();
  const booth = new THREE.Mesh(boxGeo(0.9, 2.3, 0.9), lambert('#2b7bd6', { transparent: true, opacity: 0.85 }));
  booth.position.y = 1.15;
  const phone = new THREE.Mesh(boxGeo(0.3, 0.5, 0.15), lambert('#222'));
  phone.position.set(0, 1.3, 0.3);
  const top = new THREE.Mesh(boxGeo(1, 0.15, 1), basic('#ffffff'));
  top.position.y = 2.35;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.3), new THREE.MeshBasicMaterial({ map: signTexture('PHONE', { color: '#ffffff', bg: '#2b7bd6', glow: false }) }));
  sign.position.set(0, 2.55, 0.5);
  g.add(booth, phone, top, sign);
  g.position.set(x, 0.15, z);
  g.rotation.y = rot;
  pb.group.add(g);
  pb.collider(aabbFromBottom(x, 0.15, z, 1, 2.5, 1, 'payphone'));
  return g;
}

export function buildLifeguardTower(pb: PropBuilder, x: number, z: number): void {
  const g = new THREE.Group();
  const legGeo = boxGeo(0.2, 3, 0.2);
  for (const [lx, lz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
    const l = new THREE.Mesh(legGeo, lambert('#d9c7a3'));
    l.position.set(lx, 1.5, lz);
    g.add(l);
  }
  const floor = new THREE.Mesh(boxGeo(3, 0.2, 3), lambert('#f2b8c6'));
  floor.position.y = 3;
  const hut = new THREE.Mesh(boxGeo(2.6, 2, 2.6), lambert('#7fe0d6'));
  hut.position.y = 4.1;
  const roof = new THREE.Mesh(boxGeo(3.2, 0.2, 3.2), lambert('#ff6fb0'));
  roof.position.y = 5.2;
  g.add(floor, hut, roof);
  g.position.set(x, 0.1, z);
  pb.group.add(g);
  pb.collider(aabbFromBottom(x, 0.1, z, 3, 5.4, 3, 'tower'));
}

export function mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // minimal merge for non-indexed / indexed BoxGeometry sets with identical attributes
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let offset = 0;
  for (const g of geos) {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const u = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      normals.push(n.getX(i), n.getY(i), n.getZ(i));
      uvs.push(u.getX(i), u.getY(i));
    }
    const idx = g.getIndex();
    if (idx) for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + offset);
    else for (let i = 0; i < p.count; i++) indices.push(i + offset);
    offset += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  out.setIndex(indices);
  return out;
}

/** A felt blackjack table with a dealer's shoe and chips. Local -z is the customer side. */
export function buildBlackjackTable(pb: PropBuilder, x: number, z: number, rot: number): THREE.Group {
  const g = new THREE.Group();
  const top = new THREE.Mesh(boxGeo(2.4, 0.1, 1.3), lambert('#0f5a2c'));
  top.position.y = 0.9;
  const rail = new THREE.Mesh(boxGeo(2.5, 0.08, 0.16), lambert('#5d3a1a'));
  rail.position.set(0, 0.98, -0.6);
  const base = new THREE.Mesh(boxGeo(2.0, 0.85, 0.9), lambert('#3e2723'));
  base.position.y = 0.43;
  const shoe = new THREE.Mesh(boxGeo(0.3, 0.12, 0.22), lambert('#111'));
  shoe.position.set(0.8, 1.0, 0.35);
  g.add(top, rail, base, shoe);
  const cardMat = lambert('#f5f5f5');
  for (const [dx, dz, ry] of [[-0.5, 0.2, 0.1], [-0.3, 0.2, 0.15], [0.3, -0.2, -0.2]]) {
    const card = new THREE.Mesh(boxGeo(0.14, 0.01, 0.2), cardMat);
    card.position.set(dx, 0.96, dz);
    card.rotation.y = ry;
    g.add(card);
  }
  for (const [dx, dz, c] of [[0.6, -0.25, '#e53935'], [0.75, -0.3, '#1e88e5'], [0.5, -0.4, '#43a047']] as [number, number, string][]) {
    const chip = new THREE.Mesh(cylGeo(0.06, 0.06, 0.05, 10), lambert(c));
    chip.position.set(dx, 0.98, dz);
    g.add(chip);
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshBasicMaterial({ map: signTexture('BLACKJACK', { color: '#ffd166', bg: '#111111', glow: false, sub: 'DEALER DRAWS TO 17 · 3:2' }), side: THREE.DoubleSide }));
  sign.position.set(0, 1.75, 0.6);
  g.add(sign);
  g.position.set(x, 0.15, z);
  g.rotation.y = rot;
  pb.group.add(g);
  pb.collider(aabbFromBottom(x, 0.15, z, 2.4, 1.0, 1.3, 'blackjack'));
  return g;
}

/** A cabinet slot machine with a lit face. Local -z is the front. */
export function buildSlotMachine(pb: PropBuilder, x: number, z: number, rot: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(boxGeo(0.9, 1.9, 0.7), lambert('#8e0038'));
  body.position.y = 0.95;
  const face = new THREE.Mesh(boxGeo(0.7, 0.5, 0.05), lambert('#fff3b0', { emissive: '#ffd166', emissiveIntensity: 0.6 }));
  face.position.set(0, 1.35, -0.36);
  const marquee = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.32), new THREE.MeshBasicMaterial({ map: signTexture('SUNSET SEVENS', { color: '#ffd166', bg: '#3a0018', glow: false }), side: THREE.DoubleSide }));
  marquee.position.set(0, 1.78, -0.37);
  marquee.rotation.y = Math.PI;
  const arm = new THREE.Mesh(cylGeo(0.03, 0.03, 0.5, 6), lambert('#c0c0c0'));
  arm.position.set(0.55, 1.35, 0);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), lambert('#e53935'));
  knob.position.set(0.55, 1.62, 0);
  g.add(body, face, marquee, arm, knob);
  g.position.set(x, 0.15, z);
  g.rotation.y = rot;
  pb.group.add(g);
  pb.collider(aabbFromBottom(x, 0.15, z, 1.0, 2.0, 0.8, 'slot'));
  return g;
}
