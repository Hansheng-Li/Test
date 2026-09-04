import * as THREE from 'three';
import {
  BUILDINGS, BuildingSpec, ROADS_X, ROADS_Z, ROAD_WIDTH, SIDEWALK_WIDTH, MAP_MIN_X, MAP_MAX_X, MAP_MIN_Z, MAP_MAX_Z,
  OCEAN_X, CANAL_X, CANAL_Z, PAYPHONES, BUS_STOPS, SUPPLIER_SPOT, RUNNER_CONTACT_SPOT, WORKER_CONTACT_SPOT, DEALER_CONTACT_SPOT, CAR_SALE_SPOT, RESPRAY_SPOT, WAREHOUSE_SIGN, Facing,
} from '../data/city';
import { CollisionWorld, aabbFromBottom } from '../physics/Colliders';
import { lambert, basic, boxGeo, cylGeo, PALETTE } from './Materials';
import { facadeTexture, signTexture, asphaltTexture, sidewalkTexture, sandTexture, grassTexture } from './Textures';
import {
  PropBuilder, buildPalms, buildStreetLights, buildBench, buildTrashCan, buildDumpster, buildCar, buildFence,
  buildContainer, buildPayphone, buildLifeguardTower, buildBusStop, buildDiceTable,
} from './Props';
import { furnishInterior, InteriorContext, makeLabel, makeFigure } from './Interiors';
import { WorldObject, NightToggle } from './WorldTypes';
import { WaypointGraph } from './Waypoints';
import { seeded } from '../utils/math';
import { mergeStaticMeshes } from './StaticMerge';

const SLAB = 0.15;

export interface CityResult {
  group: THREE.Group;
  colliders: CollisionWorld;
  objects: WorldObject[];
  night: NightToggle;
  waypoints: WaypointGraph;
  water: THREE.Mesh[];
  buildings: Map<string, { spec: BuildingSpec; doorPos: THREE.Vector3; box: THREE.Box3 }>;
  lampPositions: { x: number; z: number }[];
  /** Box cars parked along the streets (swapped for GLB models when those load). */
  parkedGroup: THREE.Group;
  parkedCars: { x: number; z: number; rot: number; color: string; model?: string }[];
}

function facingDir(f: Facing): THREE.Vector3 {
  switch (f) {
    case 'N': return new THREE.Vector3(0, 0, -1);
    case 'S': return new THREE.Vector3(0, 0, 1);
    case 'E': return new THREE.Vector3(1, 0, 0);
    case 'W': return new THREE.Vector3(-1, 0, 0);
  }
}

export function buildCity(): CityResult {
  const group = new THREE.Group();
  const colliders = new CollisionWorld();
  const pb = new PropBuilder(group, colliders);
  const objects: WorldObject[] = [];
  const night: NightToggle = { emissive: [], lights: [], facades: [] };
  const water: THREE.Mesh[] = [];
  const buildings = new Map<string, { spec: BuildingSpec; doorPos: THREE.Vector3; box: THREE.Box3 }>();
  const rnd = seeded(2024);

  // ------------------------------------------------------------ ground & water
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(MAP_MAX_X - MAP_MIN_X + 200, MAP_MAX_Z - MAP_MIN_Z + 200), new THREE.MeshLambertMaterial({ map: asphaltTexture() }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((MAP_MIN_X + MAP_MAX_X) / 2, 0, (MAP_MIN_Z + MAP_MAX_Z) / 2);
  ground.receiveShadow = true;
  group.add(ground);
  // invisible floor collider so nothing falls through
  colliders.add({ minX: -1000, maxX: 1000, minY: -2, maxY: 0, minZ: -1000, maxZ: 1000, tag: 'ground' });

  const waterMat = new THREE.MeshLambertMaterial({ color: PALETTE.water, transparent: true, opacity: 0.85 });
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(160, 700), waterMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(OCEAN_X + 80, 0.05, 0);
  group.add(ocean);
  water.push(ocean);
  const canalW = new THREE.Mesh(new THREE.PlaneGeometry(90, 700), waterMat);
  canalW.rotation.x = -Math.PI / 2;
  canalW.position.set(CANAL_X - 45, 0.05, 0);
  group.add(canalW);
  const canalS = new THREE.Mesh(new THREE.PlaneGeometry(700, 120), waterMat);
  canalS.rotation.x = -Math.PI / 2;
  canalS.position.set(0, 0.05, CANAL_Z + 60);
  group.add(canalS);
  // water is not walkable: colliders as low walls at the shore
  colliders.add({ minX: OCEAN_X, maxX: OCEAN_X + 300, minY: -1, maxY: 1.2, minZ: -1000, maxZ: 1000, tag: 'water' });
  colliders.add({ minX: -1000, maxX: CANAL_X, minY: -1, maxY: 1.2, minZ: -1000, maxZ: 1000, tag: 'water' });
  colliders.add({ minX: -1000, maxX: 1000, minY: -1, maxY: 1.2, minZ: CANAL_Z, maxZ: 1000, tag: 'water' });

  // beach sand
  const sand = new THREE.Mesh(boxGeo(OCEAN_X - 169, SLAB, MAP_MAX_Z - MAP_MIN_Z), new THREE.MeshLambertMaterial({ map: sandTexture() }));
  sand.position.set((169 + OCEAN_X) / 2, SLAB / 2 - 0.02, 0);
  sand.receiveShadow = true;
  group.add(sand);
  colliders.add(aabbFromBottom(sand.position.x, -0.02, 0, OCEAN_X - 169, SLAB, MAP_MAX_Z - MAP_MIN_Z, 'sand'));

  // ------------------------------------------------------------ blocks (slabs)
  const xsEdges = [MAP_MIN_X, ...ROADS_X, OCEAN_X];
  const zsEdges = [MAP_MIN_Z, ...ROADS_Z, CANAL_Z];
  const slabMat = new THREE.MeshLambertMaterial({ map: sidewalkTexture() });
  const grassMat = new THREE.MeshLambertMaterial({ map: grassTexture() });
  const half = ROAD_WIDTH / 2;
  for (let i = 0; i + 1 < xsEdges.length; i++)
    for (let j = 0; j + 1 < zsEdges.length; j++) {
      const x0 = xsEdges[i] + (i === 0 ? 0 : half);
      const x1 = xsEdges[i + 1] - (i + 1 === xsEdges.length - 1 ? 0 : half);
      const z0 = zsEdges[j] + (j === 0 ? 0 : half);
      const z1 = zsEdges[j + 1] - (j + 1 === zsEdges.length - 1 ? 0 : half);
      if (x1 <= x0 || z1 <= z0) continue;
      if (x0 >= 160) continue; // beach handled separately
      const w = x1 - x0;
      const d = z1 - z0;
      const geo = new THREE.BoxGeometry(w, SLAB, d);
      const mat = slabMat.clone();
      mat.map = sidewalkTexture().clone();
      mat.map.repeat.set(w / 4, d / 4);
      mat.map.needsUpdate = true;
      const slab = new THREE.Mesh(geo, mat);
      slab.position.set((x0 + x1) / 2, SLAB / 2, (z0 + z1) / 2);
      slab.receiveShadow = true;
      group.add(slab);
      colliders.add(aabbFromBottom(slab.position.x, 0, slab.position.z, w, SLAB, d, 'slab'));
      // inner lot ground: grass patches in downtown blocks, darker concrete for docks
      const innerW = w - SIDEWALK_WIDTH * 2;
      const innerD = d - SIDEWALK_WIDTH * 2;
      if (innerW > 10 && innerD > 10) {
        const isDocks = x1 < -110;
        const inner = new THREE.Mesh(new THREE.PlaneGeometry(innerW, innerD), isDocks ? lambert('#9a9388') : (rnd() < 0.5 ? grassMat : lambert('#b7ae9e')));
        inner.rotation.x = -Math.PI / 2;
        inner.position.set(slab.position.x, SLAB + 0.01, slab.position.z);
        inner.receiveShadow = true;
        group.add(inner);
      }
    }

  // ------------------------------------------------------------ road markings
  const dashGeo = boxGeo(3, 0.02, 0.2);
  const dashGeoZ = boxGeo(0.2, 0.02, 3);
  const dashes: THREE.Matrix4[] = [];
  const dashesZ: THREE.Matrix4[] = [];
  for (const z of ROADS_Z) for (let x = MAP_MIN_X; x < OCEAN_X; x += 6) dashes.push(new THREE.Matrix4().makeTranslation(x, 0.011, z));
  for (const x of ROADS_X) for (let z = MAP_MIN_Z; z < CANAL_Z; z += 6) dashesZ.push(new THREE.Matrix4().makeTranslation(x, 0.011, z));
  const dashMesh = new THREE.InstancedMesh(dashGeo, basic('#e8c547'), dashes.length);
  dashes.forEach((m, i) => dashMesh.setMatrixAt(i, m));
  const dashMeshZ = new THREE.InstancedMesh(dashGeoZ, basic('#e8c547'), dashesZ.length);
  dashesZ.forEach((m, i) => dashMeshZ.setMatrixAt(i, m));
  group.add(dashMesh, dashMeshZ);

  // ------------------------------------------------------------ buildings
  for (const spec of BUILDINGS) {
    const info = buildBuilding(spec, pb, night, objects);
    buildings.set(spec.id, info);
  }

  // ------------------------------------------------------------ street furniture
  const lightPositions: { x: number; z: number }[] = [];
  for (const z of ROADS_Z)
    for (let x = MAP_MIN_X + 30; x < OCEAN_X - 10; x += 28) {
      if (ROADS_X.some((rx) => Math.abs(rx - x) < 9)) continue;
      lightPositions.push({ x, z: z - half - 1 }, { x: x + 14, z: z + half + 1 });
    }
  for (const x of ROADS_X)
    for (let z = MAP_MIN_Z + 30; z < CANAL_Z - 10; z += 28) {
      if (ROADS_Z.some((rz) => Math.abs(rz - z) < 9)) continue;
      lightPositions.push({ x: x - half - 1, z }, { x: x + half + 1, z: z + 14 });
    }
  const lampPositions = lightPositions.filter((p) => p.x > CANAL_X + 4 && p.z < CANAL_Z - 4);
  const lights = buildStreetLights(group, colliders, lampPositions);
  night.emissive.push(lights.bulbMaterial);

  // palms: beach boulevard, beach, and scattered lots
  const palms: { x: number; z: number; y?: number; h?: number }[] = [];
  for (let z = MAP_MIN_Z + 20; z < CANAL_Z - 10; z += 11) {
    if (ROADS_Z.some((rz) => Math.abs(rz - z) < 9)) continue;
    palms.push({ x: 160 - half - 1.5, z }, { x: 160 + half + 1.5, z: z + 5 });
  }
  for (let i = 0; i < 40; i++) palms.push({ x: 172 + rnd() * 24, z: MAP_MIN_Z + 10 + rnd() * (CANAL_Z - MAP_MIN_Z - 20), y: 0.13, h: 4 + rnd() * 4 });
  const lotPalms = [
    [-45, -95], [24, -95], [-45, 34], [24, 34], [-45, 105], [24, 105], [35, -35], [104, -35], [35, 105], [104, 105],
    [-56, -35], [-124, -35], [-124, 105], [-56, 105], [115, -95], [115, 35], [115, 105], [-20, -108], [0, -108], [60, -108], [80, -108],
    [-20, 118], [30, 118], [-100, 118], [-60, 118], [140, 118], [-10, 44], [-10, 10],
  ];
  for (const [x, z] of lotPalms) palms.push({ x: x + (rnd() - 0.5) * 2, z: z + (rnd() - 0.5) * 2 });
  buildPalms(group, colliders, palms);

  // benches / trash along sidewalks
  const benchSpots = [[-70, -38.5], [-10, -38.5], [70, -38.5], [-70, 31.5], [-10, 31.5], [50, 31.5], [-70, 101.5], [-10, 101.5], [90, 101.5], [152, -20], [152, 30], [152, 70], [152, -100]];
  for (const [x, z] of benchSpots) buildBench(pb, x, z, Math.abs(x) === 152 ? -Math.PI / 2 : 0);
  const trashSpots = [[-60, -38.5], [20, -38.5], [40, -38.5], [100, -38.5], [-60, 31.5], [20, 31.5], [40, 31.5], [100, 31.5], [-60, 101.5], [20, 101.5], [100, 101.5], [152, -50], [152, 10], [152, 90], [-121, -20], [-121, 60]];
  for (const [x, z] of trashSpots) buildTrashCan(pb, x, z);

  // alleys between buildings: dumpsters
  const alleyDumpsters = [[-10, -52], [70, -52], [-10, 62], [70, 62], [-10, -10], [-10, 16], [-121 + 8, -66], [-121 + 8, 82]];
  alleyDumpsters.forEach(([x, z], i) => {
    const g = buildDumpster(pb, x, z, rnd() < 0.5 ? 0 : Math.PI / 2);
    objects.push({ kind: 'dumpster', id: 'dumpster_' + i, position: new THREE.Vector3(x, SLAB, z), mesh: g });
  });

  // parked cars along streets
  const carColors = ['#e74c3c', '#f1c40f', '#1abc9c', '#9b59b6', '#ecf0f1', '#3498db', '#e67e22', '#2c3e50'];
  const carSpots: [number, number, number][] = [];
  for (const z of ROADS_Z) for (let x = MAP_MIN_X + 40; x < OCEAN_X - 20; x += 22) {
    if (ROADS_X.some((rx) => Math.abs(rx - x) < 12)) continue;
    if (rnd() < 0.45) carSpots.push([x, z + (rnd() < 0.5 ? -4.5 : 4.5), 0]);
  }
  for (const x of ROADS_X) for (let z = MAP_MIN_Z + 40; z < CANAL_Z - 20; z += 22) {
    if (ROADS_Z.some((rz) => Math.abs(rz - z) < 12)) continue;
    if (rnd() < 0.4) carSpots.push([x + (rnd() < 0.5 ? -4.5 : 4.5), z, Math.PI / 2]);
  }
  const parkedGroup = new THREE.Group();
  parkedGroup.userData.dynamic = true; // merged on its own so it can be swapped for models later
  group.add(parkedGroup);
  const pbCars = new PropBuilder(parkedGroup, colliders);
  const parkedCars: CityResult['parkedCars'] = [];
  const parkCar = (x: number, z: number, rot: number, color: string, model?: string): void => {
    buildCar(pbCars, x, z, rot, color);
    parkedCars.push({ x, z, rot, color, model });
  };
  // cruisers outside the police station (the release spot at x=70 stays clear)
  parkCar(58, -25.5, 0, '#f4f6f8', 'police');
  parkCar(84, -25.5, 0, '#f4f6f8', 'police');
  for (const [x, z, r] of carSpots) parkCar(x, z, r, carColors[Math.floor(rnd() * carColors.length)]);
  // yard cars at Rojas
  parkCar(-70, -66, 0.3, '#95a5a6');
  parkCar(-108, -66, -0.4, '#c0392b');

  // industrial fences and containers
  buildFence(pb, -200, -40, -150, -40);
  buildFence(pb, -200, 36, -150, 36);
  buildFence(pb, -150, -40, -150, -20);
  buildFence(pb, -150, 20, -150, 36);
  const containerColors = ['#c0392b', '#2980b9', '#27ae60', '#d35400', '#7f8c8d'];
  let ci = 0;
  for (let zz = -32; zz <= 28; zz += 8) {
    buildContainer(pb, -185, zz, containerColors[ci++ % 5]);
    if (rnd() < 0.5) buildContainer(pb, -185, zz, containerColors[ci++ % 5], 0, 2.6);
  }
  buildContainer(pb, -165, -30, containerColors[1], 0);
  buildContainer(pb, -165, -22, containerColors[3], 0, 2.6);
  buildContainer(pb, -165, 0, containerColors[2], 0);
  // more dock clutter: crates, a truck, extra containers near the warehouse, bollards
  for (let i = 0; i < 14; i++) {
    const cx = -200 + rnd() * 45;
    const cz = 44 + rnd() * 26;
    pb.solidBox(cx, SLAB, cz, 1.2, 0.9 + rnd() * 0.6, 1.2, lambert(rnd() < 0.5 ? '#a1887f' : '#8d6e63'), 'crate', true);
  }
  for (let i = 0; i < 6; i++) pb.solidBox(-150 + i * 8, SLAB, -100, 1.2, 1.1, 1.2, lambert('#a1887f'), 'crate', true);
  buildContainer(pb, -175, -100, containerColors[4], 0);
  buildContainer(pb, -175, -108, containerColors[0], 0);
  buildContainer(pb, -175, -108, containerColors[2], 0, 2.6);
  buildContainer(pb, -130 + 6, -132, containerColors[1], 0);
  parkCar(-150, 52, Math.PI / 2, '#ecf0f1');
  parkCar(-145, 62, Math.PI / 2, '#5d6d7e');
  // box truck at the port
  pb.solidBox(-160, SLAB, 70, 7, 3, 2.6, lambert('#f5f5f5'), 'truck', true);
  pb.solidBox(-165.5, SLAB, 70, 2.2, 2.2, 2.4, lambert('#c0392b'), 'truck', true);
  // north-west lots: fenced storage yard with junk cars
  buildFence(pb, -121, -180, -59, -180);
  buildFence(pb, -121, -180, -121, -110);
  buildFence(pb, -59, -180, -59, -110);
  parkCar(-110, -150, 0.2, '#7f8c8d');
  parkCar(-95, -160, -0.3, '#b03a2e');
  parkCar(-75, -145, 0.8, '#1f618d');
  parkCar(-100, -125, 0.1, '#f4d03f');
  // west block empty lot: basketball court + bleachers
  pb.visualBox(-90, SLAB, -140, 26, 0.04, 16, lambert('#3e7c59'));
  pb.solidBox(-103, SLAB, -140, 0.2, 3.2, 0.2, lambert(PALETTE.darkMetal), 'hoop');
  pb.solidBox(-77, SLAB, -140, 0.2, 3.2, 0.2, lambert(PALETTE.darkMetal), 'hoop');
  // parking lot behind Palmetto / Coral Arms (north row) with cars
  for (let i = 0; i < 5; i++) parkCar(40 + i * 6, -150, Math.PI / 2, carColors[(i * 3) % carColors.length]);
  for (let i = 0; i < 4; i++) parkCar(-40 + i * 6, -155, Math.PI / 2, carColors[(i * 5 + 1) % carColors.length]);
  // beach umbrellas + towels
  for (let i = 0; i < 14; i++) {
    const ux = 174 + rnd() * 20;
    const uz = MAP_MIN_Z + 20 + rnd() * (CANAL_Z - MAP_MIN_Z - 40);
    const pole = new THREE.Mesh(cylGeo(0.04, 0.04, 2.2, 5), lambert('#f5f5f5'));
    pole.position.set(ux, SLAB + 1.1, uz);
    const top = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.5, 8), lambert(['#ff6fb0', '#4ff2e8', '#ffe066', '#ff9a3c'][i % 4]));
    top.position.set(ux, SLAB + 2.2, uz);
    const towel = new THREE.Mesh(boxGeo(1, 0.03, 1.8), lambert(['#ff4fd8', '#b388ff', '#7dff9a'][i % 3]));
    towel.position.set(ux + 1.2, SLAB + 0.02, uz);
    group.add(pole, top, towel);
  }
  // south canal boardwalk benches + railing
  buildFence(pb, -200, CANAL_Z - 1, 168, CANAL_Z - 1);
  for (const bx of [-100, -27, 40, 110]) buildBench(pb, bx, CANAL_Z - 4, 0);
  // dock piers
  buildPier(pb, CANAL_X, 60, 30, 8, true);
  buildPier(pb, CANAL_X, 110, 30, 8, true);
  buildPier(pb, OCEAN_X - 6, 5, 40, 6, false);
  buildLifeguardTower(pb, 185, -60);
  buildLifeguardTower(pb, 185, 70);

  // sidewalk strip between the boulevard and the sand
  const strip = new THREE.Mesh(boxGeo(4, SLAB, CANAL_Z - MAP_MIN_Z), slabMat);
  strip.position.set(168, SLAB / 2, (MAP_MIN_Z + CANAL_Z) / 2);
  strip.receiveShadow = true;
  group.add(strip);
  colliders.add(aabbFromBottom(168, 0, (MAP_MIN_Z + CANAL_Z) / 2, 4, SLAB, CANAL_Z - MAP_MIN_Z, 'slab'));
  // beach boulevard sidewalk along the sand (walkable strip)
  const bw = new THREE.Mesh(boxGeo(OCEAN_X - 166, 0.05, 20), lambert('#d9cbb0'));
  bw.position.set((166 + OCEAN_X) / 2, SLAB, 5);
  group.add(bw);

  // street dice by the arcade door, a few steps from Vince
  const dice = buildDiceTable(pb, 155, 93, 0.3);
  objects.push({ kind: 'dice_table', id: 'dice_table', position: new THREE.Vector3(155, SLAB, 93), mesh: dice });
  // transit stops
  for (const b of BUS_STOPS) {
    const g = buildBusStop(pb, b.x, b.z, b.rot);
    objects.push({ kind: 'bus_stop', id: 'bus_' + b.id, position: new THREE.Vector3(b.x, SLAB, b.z), mesh: g, data: { stop: b.id } });
  }
  // payphones
  PAYPHONES.forEach((p, i) => {
    const g = buildPayphone(pb, p.x, p.z, p.rot);
    objects.push({ kind: 'payphone', id: 'payphone_' + i, position: new THREE.Vector3(p.x, SLAB, p.z), mesh: g });
  });

  // supplier + runner contact figures
  const rico = makeFigure('#f39c12', '#8d5524', '#1c1c1c', 'rico');
  rico.position.set(SUPPLIER_SPOT.x, SLAB, SUPPLIER_SPOT.z);
  rico.rotation.y = Math.PI / 2;
  const ricoLabel = makeLabel('RICO · SUPPLIER', '#ffd166');
  ricoLabel.position.y = 2.3;
  rico.add(ricoLabel);
  group.add(rico);
  colliders.add(aabbFromBottom(SUPPLIER_SPOT.x, SLAB, SUPPLIER_SPOT.z, 0.7, 1.9, 0.7, 'npc'));
  objects.push({ kind: 'supplier', id: 'supplier', position: rico.position.clone(), mesh: rico });
  // van behind Rico
  parkCar(SUPPLIER_SPOT.x + 4, SUPPLIER_SPOT.z + 5, Math.PI / 2, '#ecf0f1');

  const dizzy = makeFigure('#00bcd4', '#f1c27d', '#ff4081', 'dizzy');
  dizzy.position.set(RUNNER_CONTACT_SPOT.x, SLAB, RUNNER_CONTACT_SPOT.z);
  dizzy.rotation.y = -Math.PI / 2;
  const dizzyLabel = makeLabel('DIZZY', '#7fffd4');
  dizzyLabel.position.y = 2.3;
  dizzy.add(dizzyLabel);
  group.add(dizzy);
  colliders.add(aabbFromBottom(RUNNER_CONTACT_SPOT.x, SLAB, RUNNER_CONTACT_SPOT.z, 0.7, 1.9, 0.7, 'npc'));
  objects.push({ kind: 'runner_contact', id: 'runner_contact', position: dizzy.position.clone(), mesh: dizzy });

  const marisol = makeFigure('#8e24aa', '#c68642', '#263238', 'marisol');
  marisol.position.set(WORKER_CONTACT_SPOT.x, SLAB, WORKER_CONTACT_SPOT.z);
  marisol.rotation.y = Math.PI / 2;
  const marisolLabel = makeLabel('MARISOL', '#e1bee7');
  marisolLabel.position.y = 2.3;
  marisol.add(marisolLabel);
  group.add(marisol);
  colliders.add(aabbFromBottom(WORKER_CONTACT_SPOT.x, SLAB, WORKER_CONTACT_SPOT.z, 0.7, 1.9, 0.7, 'npc'));
  objects.push({ kind: 'worker_contact', id: 'worker_contact', position: marisol.position.clone(), mesh: marisol });

  const vince = makeFigure('#212121', '#e0ac69', '#f5f5f5', 'vince');
  vince.position.set(DEALER_CONTACT_SPOT.x, SLAB, DEALER_CONTACT_SPOT.z);
  vince.rotation.y = -Math.PI / 2;
  const vinceLabel = makeLabel('VINCE', '#ffd166');
  vinceLabel.position.y = 2.3;
  vince.add(vinceLabel);
  // sunglasses
  const shades = new THREE.Mesh(boxGeo(0.36, 0.08, 0.05), lambert('#000'));
  shades.position.set(0, 1.74, 0.17);
  vince.add(shades);
  group.add(vince);
  colliders.add(aabbFromBottom(DEALER_CONTACT_SPOT.x, SLAB, DEALER_CONTACT_SPOT.z, 0.7, 1.9, 0.7, 'npc'));
  objects.push({ kind: 'dealer_contact', id: 'dealer_contact', position: vince.position.clone(), mesh: vince });

  // car for sale in front of Rojas Auto Repair
  const carSign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.9), new THREE.MeshBasicMaterial({ map: signTexture('FOR SALE', { color: '#ffffff', bg: '#c62828', glow: false, sub: "'88 SEDAN · RUNS GREAT" }), side: THREE.DoubleSide }));
  carSign.position.set(CAR_SALE_SPOT.x, SLAB + 1.9, CAR_SALE_SPOT.z - 1.6);
  group.add(carSign);
  const carAnchor = new THREE.Object3D();
  carAnchor.position.set(CAR_SALE_SPOT.x, SLAB, CAR_SALE_SPOT.z);
  group.add(carAnchor);
  objects.push({ kind: 'car_sale', id: 'car_sale', position: carAnchor.position.clone(), mesh: carSign });
  // respray bay at the other end of the lot
  const spraySign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.9), new THREE.MeshBasicMaterial({ map: signTexture('RESPRAY $150', { color: '#ffffff', bg: '#1565c0', glow: false, sub: 'NEW COAT · NO QUESTIONS' }), side: THREE.DoubleSide }));
  spraySign.position.set(RESPRAY_SPOT.x, SLAB + 1.9, RESPRAY_SPOT.z - 1.6);
  group.add(spraySign);
  objects.push({ kind: 'respray', id: 'respray', position: new THREE.Vector3(RESPRAY_SPOT.x, SLAB, RESPRAY_SPOT.z), mesh: spraySign });

  // laundromat business for sale (legit front)
  const laundro = BUILDINGS.find((b) => b.id === 'laundromat')!;
  const frontSign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1), new THREE.MeshBasicMaterial({ map: signTexture('BUSINESS FOR SALE', { color: '#ffffff', bg: '#6a1b9a', glow: false, sub: 'LUCKY LAUNDROMAT · TURNKEY' }), side: THREE.DoubleSide }));
  frontSign.position.set(laundro.x - 8, SLAB + 1.6, laundro.z - laundro.d / 2 - 1.2);
  group.add(frontSign);
  const frontPost = new THREE.Mesh(boxGeo(0.1, 2.1, 0.1), lambert(PALETTE.darkMetal));
  frontPost.position.set(laundro.x - 8, SLAB + 1.05, laundro.z - laundro.d / 2 - 1.2);
  group.add(frontPost);
  objects.push({ kind: 'front_sign', id: 'front_sign', position: frontSign.position.clone(), mesh: frontSign, property: 'laundromat' });

  // motel room 6 for rent (beach-side stash + safe spot)
  const motelSpec = BUILDINGS.find((b) => b.id === 'motel')!;
  const roomSign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.9), new THREE.MeshBasicMaterial({ map: signTexture('ROOM 6', { color: '#ffffff', bg: '#00838f', glow: false, sub: 'WEEKLY RATES · ASK INSIDE' }), side: THREE.DoubleSide }));
  roomSign.position.set(motelSpec.x + motelSpec.w / 2 + 0.3, SLAB + 2.4, motelSpec.z - 2.2);
  roomSign.rotation.y = Math.PI / 2;
  group.add(roomSign);
  objects.push({ kind: 'motel_sign', id: 'motel_sign', position: new THREE.Vector3(motelSpec.x + motelSpec.w / 2 + 1, SLAB, motelSpec.z - 2), mesh: roomSign, property: 'motel' });

  // crew neon sign above the warehouse door (blank until the player names their operation)
  const crewMat = new THREE.MeshLambertMaterial({ map: signTexture(' ', { color: '#ff4fd8' }), emissive: '#ffffff', emissiveMap: signTexture(' ', { color: '#ff4fd8' }), emissiveIntensity: 0.6, transparent: true });
  const crewSign = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), crewMat);
  const whSpec = BUILDINGS.find((b) => b.id === 'warehouse')!;
  crewSign.position.set(whSpec.x + whSpec.w / 2 + 0.12, SLAB + 4.6, whSpec.z + 16);
  crewSign.rotation.y = Math.PI / 2;
  crewSign.visible = false;
  crewSign.userData.dynamic = true;
  group.add(crewSign);
  night.emissive.push(crewMat);
  objects.push({ kind: 'crew_sign', id: 'crew_sign', position: crewSign.position.clone(), mesh: crewSign, property: 'warehouse' });

  // warehouse for-sale sign
  const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.2), new THREE.MeshBasicMaterial({ map: signTexture('FOR SALE', { color: '#ffffff', bg: '#c62828', glow: false, sub: 'WAREHOUSE 7 · SEE INSIDE' }), side: THREE.DoubleSide }));
  signMesh.position.set(WAREHOUSE_SIGN.x, SLAB + 1.8, WAREHOUSE_SIGN.z);
  signMesh.rotation.y = Math.PI / 2;
  group.add(signMesh);
  const post = new THREE.Mesh(boxGeo(0.12, 2.4, 0.12), lambert(PALETTE.darkMetal));
  post.position.set(WAREHOUSE_SIGN.x, SLAB + 1.2, WAREHOUSE_SIGN.z);
  group.add(post);
  objects.push({ kind: 'warehouse_sign', id: 'warehouse_sign', position: signMesh.position.clone(), mesh: signMesh, property: 'warehouse' });

  // gameplay-referenced meshes must stay individually addressable
  for (const o of objects) o.mesh.userData.dynamic = true;
  for (const w of water) w.userData.dynamic = true;
  const stats = mergeStaticMeshes(group);
  parkedGroup.userData.dynamic = false;
  const carStats = mergeStaticMeshes(parkedGroup);
  if (typeof console !== 'undefined') console.info(`[city] static merge: ${stats.before} meshes -> ${stats.after - carStats.before + carStats.after}`);
  const waypoints = new WaypointGraph();
  return { group, colliders, objects, night, waypoints, water, buildings, lampPositions, parkedGroup, parkedCars };
}

// ------------------------------------------------------------------ helpers

function buildPier(pb: PropBuilder, x: number, z: number, len: number, wid: number, westward: boolean): void {
  const cx = westward ? x - len / 2 + 2 : x + len / 2 - 2;
  const deck = new THREE.Mesh(boxGeo(len, 0.3, wid), lambert(PALETTE.wood));
  deck.position.set(cx, 0.55, z);
  deck.receiveShadow = true;
  pb.group.add(deck);
  pb.collider(aabbFromBottom(cx, 0.4, z, len, 0.3, wid, 'pier'));
  // ramp from the slab up to the deck
  const rx = westward ? x + 3 : x - 3;
  pb.solidBox(rx, 0.15, z, 4, 0.25, wid, lambert(PALETTE.wood), 'ramp');
  pb.solidBox(westward ? x - 1 : x + 1, 0.15, z, 4, 0.5, wid, lambert(PALETTE.wood), 'ramp');
  const postGeo = boxGeo(0.3, 1.6, 0.3);
  for (let i = 0; i <= len; i += 5)
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(postGeo, lambert('#5a3a20'));
      p.position.set(westward ? x - i : x + i, 0.4, z + (side * wid) / 2);
      pb.group.add(p);
    }
  // rails
  for (const side of [-1, 1]) {
    const r = new THREE.Mesh(boxGeo(len, 0.1, 0.1), lambert('#5a3a20'));
    r.position.set(cx, 1.5, z + (side * wid) / 2);
    pb.group.add(r);
    pb.collider(aabbFromBottom(cx, 0.6, z + (side * wid) / 2, len, 1.2, 0.2, 'rail'));
  }
  const end = new THREE.Mesh(boxGeo(0.1, 1.2, wid), lambert('#5a3a20'));
  end.position.set(westward ? x - len + 2 : x + len - 2, 1.2, z);
  pb.group.add(end);
  pb.collider(aabbFromBottom(end.position.x, 0.6, z, 0.2, 1.2, wid, 'rail'));
}

function buildBuilding(spec: BuildingSpec, pb: PropBuilder, night: NightToggle, objects: WorldObject[]): { spec: BuildingSpec; doorPos: THREE.Vector3; box: THREE.Box3 } {
  const fh = spec.floorHeight ?? 3.3;
  const height = fh * spec.floors;
  const { x, z, w, d } = spec;
  const dir = facingDir(spec.facing);
  const y0 = SLAB;
  /** Facade material sized for a wall segment: one window column per ~4m, one row per floor. */
  const facadeMat = (widthMeters: number, floorsCount: number, axis: string): THREE.MeshLambertMaterial => {
    const cols = Math.max(1, Math.round(widthMeters / 4));
    const day = facadeTexture({ color: spec.color, floors: floorsCount, cols, style: spec.style, seed: spec.id + axis });
    const nightTex = facadeTexture({ color: spec.color, floors: floorsCount, cols, style: spec.style, night: true, seed: spec.id + axis });
    const m = new THREE.MeshLambertMaterial({ map: day });
    night.facades.push({ material: m, day, night: nightTex });
    return m;
  };
  const matX = facadeMat(d, spec.floors, 'x');
  const matZ = facadeMat(w, spec.floors, 'z');
  const roofMat = lambert(spec.trim ?? '#9a9086');
  const interiorMat = lambert(spec.interior ? '#f3ede2' : spec.color);
  const faceMats = [matX, matX, roofMat, roofMat, matZ, matZ];

  const box = new THREE.Box3(new THREE.Vector3(x - w / 2, y0, z - d / 2), new THREE.Vector3(x + w / 2, y0 + height, z + d / 2));
  const doorPos = new THREE.Vector3(x + dir.x * (w / 2 + 1.5), y0, z + dir.z * (d / 2 + 1.5));

  if (!spec.interior) {
    const m = pb.solidBox(x, y0, z, w, height, d, faceMats, 'building', true);
    m.castShadow = true;
  } else {
    // ground floor: four walls with a door gap in the facing wall
    const t = 0.35;
    const doorW = 2.4;
    const walls: { cx: number; cz: number; sx: number; sz: number; outer: number }[] = [];
    // outer index: 0=+x,1=-x,4=+z,5=-z (BoxGeometry face order)
    const addWall = (cx: number, cz: number, sx: number, sz: number, outer: number, h = fh, by = y0): void => {
      const mats = [interiorMat, interiorMat, interiorMat, interiorMat, interiorMat, interiorMat];
      // each ground-floor wall segment gets its own one-storey facade; the door lintel stays plain
      mats[outer] = h < fh ? lambert(spec.color) : facadeMat(outer < 2 ? sz : sx, 1, 'g' + outer + sx.toFixed(0));
      pb.solidBox(cx, by, cz, sx, h, sz, mats, 'wall', true);
    };
    const front = spec.facing;
    const sides: Facing[] = ['N', 'S', 'E', 'W'];
    for (const s of sides) {
      const isFront = s === front;
      if (s === 'N' || s === 'S') {
        const cz = s === 'N' ? z - d / 2 + t / 2 : z + d / 2 - t / 2;
        const outer = s === 'N' ? 5 : 4;
        if (!isFront) walls.push({ cx: x, cz, sx: w, sz: t, outer });
        else {
          const segW = (w - doorW) / 2;
          addWall(x - w / 2 + segW / 2, cz, segW, t, outer);
          addWall(x + w / 2 - segW / 2, cz, segW, t, outer);
          addWall(x, cz, doorW, t, outer, fh - 2.5, y0 + 2.5);
        }
      } else {
        const cx = s === 'W' ? x - w / 2 + t / 2 : x + w / 2 - t / 2;
        const outer = s === 'W' ? 1 : 0;
        if (!isFront) walls.push({ cx, cz: z, sx: t, sz: d, outer });
        else {
          const segD = (d - doorW) / 2;
          addWall(cx, z - d / 2 + segD / 2, t, segD, outer);
          addWall(cx, z + d / 2 - segD / 2, t, segD, outer);
          addWall(cx, z, t, doorW, outer, fh - 2.5, y0 + 2.5);
        }
      }
    }
    for (const wl of walls) addWall(wl.cx, wl.cz, wl.sx, wl.sz, wl.outer);
    // interior floor tint
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w - t * 2, d - t * 2), lambert(spec.interior === 'club' ? '#1a1030' : spec.interior === 'warehouse' ? '#7d7a72' : '#c9b79c'));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(x, y0 + 0.02, z);
    floor.receiveShadow = true;
    pb.group.add(floor);
    // ceiling / upper floors
    if (spec.floors > 1) {
      const uX = facadeMat(d, spec.floors - 1, 'ux');
      const uZ = facadeMat(w, spec.floors - 1, 'uz');
      const upperMats = [uX, uX, roofMat, interiorMat, uZ, uZ];
      pb.solidBox(x, y0 + fh, z, w, height - fh, d, upperMats, 'building', true);
    } else {
      pb.solidBox(x, y0 + fh, z, w, 0.3, d, [roofMat, roofMat, roofMat, interiorMat, roofMat, roofMat], 'roof');
    }
    const ctx: InteriorContext = { pb, objects, night, floorY: y0 };
    furnishInterior(spec, ctx, dir);
    // door mat / threshold marker so the entrance reads from outside
    const mat = new THREE.Mesh(boxGeo(dir.x !== 0 ? 1.2 : doorW + 0.4, 0.03, dir.z !== 0 ? 1.2 : doorW + 0.4), lambert('#3e2723'));
    mat.position.set(x + dir.x * (w / 2 + 0.4), y0 + 0.02, z + dir.z * (d / 2 + 0.4));
    pb.group.add(mat);
  }

  // parapet & roof details
  const parapet = new THREE.Mesh(boxGeo(w + 0.3, 0.6, d + 0.3), lambert(spec.trim ?? '#ffffff'));
  parapet.position.set(x, y0 + height + 0.2, z);
  pb.group.add(parapet);
  if (spec.roof === 'stepped') {
    pb.visualBox(x, y0 + height, z, w * 0.6, 1.6, d * 0.6, faceMats);
    pb.visualBox(x, y0 + height + 1.6, z, w * 0.3, 1.2, d * 0.3, lambert(spec.trim ?? '#ffffff'));
  } else if (spec.roof === 'tower') {
    pb.visualBox(x + dir.x * (w / 2 - 2), y0 + height, z + dir.z * (d / 2 - 2), dir.x !== 0 ? 3 : 6, 5, dir.z !== 0 ? 3 : 6, lambert(spec.trim ?? spec.color));
    const beacon = lambert('#fff', { emissive: spec.sign?.color ?? '#ff4fd8', emissiveIntensity: 0 });
    pb.visualBox(x + dir.x * (w / 2 - 2), y0 + height + 5, z + dir.z * (d / 2 - 2), 1, 1, 1, beacon);
    night.emissive.push(beacon);
  } else {
    // AC units
    const ac = new THREE.Mesh(boxGeo(1.4, 0.9, 1.4), lambert('#b0b0b0'));
    ac.position.set(x - w / 4, y0 + height + 0.45, z + d / 4);
    pb.group.add(ac);
  }

  // awning for shops
  if (spec.style === 'shop' || spec.style === 'motel') {
    const awn = new THREE.Mesh(boxGeo(dir.x !== 0 ? 1.6 : w * 0.9, 0.15, dir.z !== 0 ? 1.6 : d * 0.9), lambert(spec.sign?.color ?? '#ff6fb0'));
    awn.position.set(x + dir.x * (w / 2 + 0.8), y0 + 2.9, z + dir.z * (d / 2 + 0.8));
    pb.group.add(awn);
  }

  // sign on the facing wall
  if (spec.sign) {
    const tex = signTexture(spec.sign.text, { color: spec.sign.color, sub: spec.sign.sub });
    const signMat = new THREE.MeshLambertMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.5 });
    const isX = dir.x !== 0;
    const span = isX ? d : w;
    const sw = Math.min(span * 0.7, 12);
    const sh = sw / 4;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), signMat);
    const signY = Math.min(y0 + height - sh / 2 - 0.3, y0 + fh + sh / 2 + 0.6);
    sign.position.set(x + dir.x * (w / 2 + 0.06), signY, z + dir.z * (d / 2 + 0.06));
    sign.rotation.y = isX ? (dir.x > 0 ? Math.PI / 2 : -Math.PI / 2) : dir.z > 0 ? 0 : Math.PI;
    pb.group.add(sign);
    night.emissive.push(signMat);
    // neon tube outline at night
    const tube = lambert(spec.sign.color, { emissive: spec.sign.color, emissiveIntensity: 0 });
    const outline = new THREE.Mesh(boxGeo(isX ? 0.08 : sw + 0.4, 0.08, isX ? sw + 0.4 : 0.08), tube);
    outline.position.set(sign.position.x, signY + sh / 2 + 0.15, sign.position.z);
    pb.group.add(outline);
    const outline2 = outline.clone();
    outline2.position.y = signY - sh / 2 - 0.15;
    pb.group.add(outline2);
    night.emissive.push(tube);
    if (spec.zone === 'beach' || spec.id === 'cinema' || spec.id === 'pawn') {
      const l = new THREE.PointLight(spec.sign.color, 40, 26, 1.8);
      l.position.set(x + dir.x * (w / 2 + 3), signY, z + dir.z * (d / 2 + 3));
      pb.group.add(l);
      night.lights.push(l);
    }
  }

  return { spec, doorPos, box };
}
