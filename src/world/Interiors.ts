import * as THREE from 'three';
import { BuildingSpec } from '../data/city';
import { PropBuilder } from './Props';
import { lambert, basic, boxGeo, cylGeo } from './Materials';
import { signTexture } from './Textures';
import { WorldObject, NightToggle } from './WorldTypes';
import { aabbFromBottom } from '../physics/Colliders';

export interface InteriorContext {
  pb: PropBuilder;
  objects: WorldObject[];
  night: NightToggle;
  /** Floor level (top of block slab). */
  floorY: number;
}

function addObject(ctx: InteriorContext, kind: WorldObject['kind'], id: string, mesh: THREE.Object3D, property?: string, data?: Record<string, unknown>): WorldObject {
  const pos = new THREE.Vector3();
  mesh.getWorldPosition(pos);
  const o: WorldObject = { kind, id, position: pos, mesh, property, data };
  ctx.objects.push(o);
  return o;
}

export function makeLabel(text: string, color = '#ffe9a8'): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({ map: signTexture(text, { color, bg: 'rgba(0,0,0,0.6)', glow: false, font: 'bold 54px Arial' }), depthTest: true, transparent: true });
  const s = new THREE.Sprite(mat);
  s.scale.set(1.3, 0.33, 1);
  return s;
}

function pointLight(ctx: InteriorContext, x: number, y: number, z: number, color: string, intensity: number, distance: number): THREE.PointLight {
  const l = new THREE.PointLight(color, intensity, distance, 1.6);
  l.position.set(x, y, z);
  ctx.pb.group.add(l);
  return l;
}

/** Simple furniture helpers ------------------------------------------------ */

function table(ctx: InteriorContext, x: number, z: number, w: number, d: number, topColor: string, legColor = '#4a3b2f'): THREE.Group {
  const g = new THREE.Group();
  const top = new THREE.Mesh(boxGeo(w, 0.08, d), lambert(topColor));
  top.position.y = 0.9;
  g.add(top);
  const legGeo = boxGeo(0.08, 0.86, 0.08);
  for (const [lx, lz] of [[-w / 2 + 0.1, -d / 2 + 0.1], [w / 2 - 0.1, -d / 2 + 0.1], [-w / 2 + 0.1, d / 2 - 0.1], [w / 2 - 0.1, d / 2 - 0.1]]) {
    const l = new THREE.Mesh(legGeo, lambert(legColor));
    l.position.set(lx, 0.43, lz);
    g.add(l);
  }
  g.position.set(x, ctx.floorY, z);
  ctx.pb.group.add(g);
  ctx.pb.collider(aabbFromBottom(x, ctx.floorY, z, w, 0.95, d, 'table'));
  return g;
}

function shelf(ctx: InteriorContext, x: number, z: number, w: number, rotY: number, color = '#8b6b4a'): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(boxGeo(w, 0.05, 0.5), lambert(color));
    s.position.y = 0.3 + i * 0.55;
    g.add(s);
  }
  const back = new THREE.Mesh(boxGeo(w, 2.1, 0.05), lambert(color));
  back.position.set(0, 1.05, -0.25);
  g.add(back);
  // a few boxes on shelves
  const colors = ['#ff7f50', '#5dade2', '#f4d03f', '#58d68d', '#af7ac5'];
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < Math.max(1, Math.floor(w / 0.6)); j++) {
      if ((i * 7 + j * 3) % 5 === 0) continue;
      const b = new THREE.Mesh(boxGeo(0.35, 0.3, 0.3), lambert(colors[(i + j) % colors.length]));
      b.position.set(-w / 2 + 0.35 + j * 0.6, 0.48 + i * 0.55, 0);
      g.add(b);
    }
  g.position.set(x, ctx.floorY, z);
  g.rotation.y = rotY;
  ctx.pb.group.add(g);
  const along = Math.abs(Math.cos(rotY)) > 0.5;
  ctx.pb.collider(aabbFromBottom(x, ctx.floorY, z, along ? w : 0.6, 2.2, along ? 0.6 : w, 'shelf'));
  return g;
}

function bed(ctx: InteriorContext, x: number, z: number, rotY: number, blanket = '#c2185b'): THREE.Group {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(boxGeo(2, 0.4, 1.4), lambert('#5b3d2a'));
  frame.position.y = 0.2;
  const mattress = new THREE.Mesh(boxGeo(1.9, 0.25, 1.3), lambert(blanket));
  mattress.position.y = 0.52;
  const pillow = new THREE.Mesh(boxGeo(0.4, 0.12, 0.9), lambert('#f5f0e6'));
  pillow.position.set(-0.7, 0.7, 0);
  g.add(frame, mattress, pillow);
  g.position.set(x, ctx.floorY, z);
  g.rotation.y = rotY;
  ctx.pb.group.add(g);
  const along = Math.abs(Math.cos(rotY)) > 0.5;
  ctx.pb.collider(aabbFromBottom(x, ctx.floorY, z, along ? 2 : 1.4, 0.7, along ? 1.4 : 2, 'bed'));
  return g;
}

function counter(ctx: InteriorContext, x: number, z: number, w: number, rotY: number, color = '#c8a97e'): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(boxGeo(w, 1.0, 0.8), lambert(color));
  body.position.y = 0.5;
  const top = new THREE.Mesh(boxGeo(w + 0.1, 0.06, 0.9), lambert('#3b2f2f'));
  top.position.y = 1.03;
  g.add(body, top);
  g.position.set(x, ctx.floorY, z);
  g.rotation.y = rotY;
  ctx.pb.group.add(g);
  const along = Math.abs(Math.cos(rotY)) > 0.5;
  ctx.pb.collider(aabbFromBottom(x, ctx.floorY, z, along ? w : 0.9, 1.1, along ? 0.9 : w, 'counter'));
  return g;
}

/** A static shopkeeper figure behind a counter. */
export function makeFigure(shirt: string, skin = '#d9a077', pants = '#2c3e50'): THREE.Group {
  const g = new THREE.Group();
  const legs = new THREE.Mesh(boxGeo(0.5, 0.8, 0.3), lambert(pants));
  legs.position.y = 0.4;
  const torso = new THREE.Mesh(boxGeo(0.6, 0.7, 0.35), lambert(shirt));
  torso.position.y = 1.15;
  const head = new THREE.Mesh(boxGeo(0.34, 0.36, 0.34), lambert(skin));
  head.position.y = 1.7;
  const armL = new THREE.Mesh(boxGeo(0.14, 0.6, 0.14), lambert(shirt));
  armL.position.set(-0.38, 1.12, 0);
  const armR = armL.clone();
  armR.position.x = 0.38;
  g.add(legs, torso, head, armL, armR);
  g.castShadow = true;
  return g;
}

// ---------------------------------------------------------------- interiors

export function furnishInterior(spec: BuildingSpec, ctx: InteriorContext, doorDir: THREE.Vector3): void {
  const { x, z, w, d } = spec;
  const fh = spec.floorHeight ?? 3.3;
  const y = ctx.floorY;
  switch (spec.interior) {
    case 'safehouse': {
      // door is on +x side. Lay out along the room.
      const light = pointLight(ctx, x, y + fh - 0.4, z, '#ffd9a0', 18, 18);
      ctx.night.lights.push(light);
      const b = bed(ctx, x - w / 2 + 1.4, z - d / 2 + 1.2, 0, '#6a1b9a');
      addObject(ctx, 'bed', 'safehouse_bed', b, 'safehouse');
      const prep = table(ctx, x - 3, z + d / 2 - 1.2, 2.2, 1, '#8ea9c8');
      const mixer = new THREE.Mesh(boxGeo(0.6, 0.5, 0.6), lambert('#b0bec5'));
      mixer.position.set(0.5, 1.2, 0);
      const bowl = new THREE.Mesh(cylGeo(0.35, 0.25, 0.3, 10), lambert('#ffcc80'));
      bowl.position.set(-0.5, 1.1, 0);
      prep.add(mixer, bowl);
      const prepLabel = makeLabel('PREP TABLE', '#8ee7ff');
      prepLabel.position.set(0, 2.1, 0);
      prep.add(prepLabel);
      addObject(ctx, 'prep_table', 'safehouse_prep', prep, 'safehouse');
      const pack = table(ctx, x + 0.5, z + d / 2 - 1.2, 2.2, 1, '#c8b08e');
      const bags = new THREE.Mesh(boxGeo(0.7, 0.3, 0.5), lambert('#f5f5f5'));
      bags.position.set(-0.5, 1.1, 0);
      const sealer = new THREE.Mesh(boxGeo(0.7, 0.2, 0.4), lambert('#e53935'));
      sealer.position.set(0.5, 1.05, 0);
      pack.add(bags, sealer);
      const packLabel = makeLabel('PACKAGING', '#ffd166');
      packLabel.position.set(0, 2.1, 0);
      pack.add(packLabel);
      addObject(ctx, 'pack_table', 'safehouse_pack', pack, 'safehouse');
      const stor = shelf(ctx, x - w / 2 + 0.4, z + 1, 3, Math.PI / 2, '#6d4c41');
      const storLabel = makeLabel('STORAGE', '#b3ffb3');
      storLabel.position.set(0, 2.4, 0);
      stor.add(storLabel);
      addObject(ctx, 'storage', 'safehouse_storage', stor, 'safehouse');
      // starter supply box near the door
      const box = new THREE.Mesh(boxGeo(0.9, 0.6, 0.7), lambert('#c9a066'));
      box.position.set(x + w / 2 - 1.4, y + 0.3, z - d / 2 + 1.2);
      const boxLabel = makeLabel('STARTER BOX', '#ffe9a8');
      boxLabel.position.set(0, 0.9, 0);
      box.add(boxLabel);
      ctx.pb.group.add(box);
      const boxCol = aabbFromBottom(box.position.x, y, box.position.z, 0.9, 0.6, 0.7, 'box');
      ctx.pb.collider(boxCol);
      addObject(ctx, 'starter_box', 'starter_box', box, 'safehouse').colliders = [boxCol];
      // desk with fax machine & pager charger
      const desk = table(ctx, x + 2.2, z - d / 2 + 1.0, 2, 0.9, '#5d4037');
      const fax = new THREE.Mesh(boxGeo(0.7, 0.25, 0.5), lambert('#e0e0e0'));
      fax.position.set(0.3, 1.06, 0);
      const crt = new THREE.Mesh(boxGeo(0.5, 0.45, 0.45), lambert('#cfd8dc'));
      crt.position.set(-0.5, 1.17, 0);
      const screen = new THREE.Mesh(boxGeo(0.4, 0.32, 0.02), lambert('#0f2a1a', { emissive: '#22ff88', emissiveIntensity: 0.6 }));
      screen.position.set(-0.5, 1.17, 0.23);
      desk.add(fax, crt, screen);
      addObject(ctx, 'fax', 'safehouse_fax', desk, 'safehouse');
      // posters, rug, boombox, pager on the desk, a window with blinds
      const poster = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), new THREE.MeshBasicMaterial({ map: signTexture('SOL PALMA', { color: '#ff9a3c', bg: '#2a1a3a', sub: 'SUNSET CAPITAL OF FLORIDA' }) }));
      poster.position.set(x, y + 2, z - d / 2 + 0.4);
      ctx.pb.group.add(poster);
      const poster2 = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.75), new THREE.MeshBasicMaterial({ map: signTexture('NEON TIDE II', { color: '#4ff2e8', bg: '#101a3a', sub: 'NOW ON VHS' }) }));
      poster2.position.set(x - 4.5, y + 2.1, z - d / 2 + 0.4);
      ctx.pb.group.add(poster2);
      const rug = new THREE.Mesh(new THREE.PlaneGeometry(5, 3.2), lambert('#7b3f61'));
      rug.rotation.x = -Math.PI / 2;
      rug.position.set(x + 0.5, y + 0.03, z + 0.5);
      ctx.pb.group.add(rug);
      const rugBorder = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.6), lambert('#c68bb0'));
      rugBorder.rotation.x = -Math.PI / 2;
      rugBorder.position.set(x + 0.5, y + 0.035, z + 0.5);
      ctx.pb.group.add(rugBorder);
      const boombox = new THREE.Mesh(boxGeo(0.7, 0.32, 0.25), lambert('#37474f'));
      boombox.position.set(x - w / 2 + 0.6, y + 0.16, z + 3.6);
      ctx.pb.group.add(boombox);
      for (const sx of [-0.2, 0.2]) {
        const spk = new THREE.Mesh(cylGeo(0.09, 0.09, 0.03, 10), lambert('#90a4ae'));
        spk.rotation.x = Math.PI / 2;
        spk.position.set(x - w / 2 + 0.6 + sx, y + 0.16, z + 3.74);
        ctx.pb.group.add(spk);
      }
      const pager = new THREE.Mesh(boxGeo(0.14, 0.05, 0.09), lambert('#212121'));
      pager.position.set(x + 2.9, y + 0.97, z - d / 2 + 1.3);
      ctx.pb.group.add(pager);
      const pagerScreen = new THREE.Mesh(boxGeo(0.08, 0.01, 0.04), lambert('#9fbf7a', { emissive: '#9fbf7a', emissiveIntensity: 0.6 }));
      pagerScreen.position.set(x + 2.9, y + 1.0, z - d / 2 + 1.3);
      ctx.pb.group.add(pagerScreen);
      const blinds = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.3), lambert('#e8e2d0'));
      blinds.position.set(x + 4.2, y + 2.0, z + d / 2 - 0.4);
      blinds.rotation.y = Math.PI;
      ctx.pb.group.add(blinds);
      for (let i = 0; i < 6; i++) {
        const slat = new THREE.Mesh(boxGeo(2.2, 0.04, 0.02), lambert('#b8b09a'));
        slat.position.set(x + 4.2, y + 1.45 + i * 0.2, z + d / 2 - 0.42);
        ctx.pb.group.add(slat);
      }
      const cassetteShelf = new THREE.Mesh(boxGeo(1.2, 0.05, 0.2), lambert('#5d4037'));
      cassetteShelf.position.set(x - 2, y + 1.7, z - d / 2 + 0.5);
      ctx.pb.group.add(cassetteShelf);
      for (let i = 0; i < 8; i++) {
        const tape = new THREE.Mesh(boxGeo(0.1, 0.16, 0.11), lambert(['#ff4fd8', '#4ff2e8', '#ffe066', '#b388ff'][i % 4]));
        tape.position.set(x - 2.5 + i * 0.14, y + 1.8, z - d / 2 + 0.5);
        ctx.pb.group.add(tape);
      }
      break;
    }
    case 'store': {
      ctx.night.lights.push(pointLight(ctx, x, y + fh - 0.5, z, '#f0f6ff', 24, 22));
      const c = counter(ctx, x - w / 2 + 3.5, z + 2, 5, Math.PI / 2, '#d7d2c8');
      const clerk = makeFigure('#e53935', '#c68642');
      clerk.position.set(x - w / 2 + 2.2, y, z + 2);
      clerk.rotation.y = Math.PI / 2;
      ctx.pb.group.add(clerk);
      const register = new THREE.Mesh(boxGeo(0.5, 0.35, 0.4), lambert('#37474f'));
      register.position.set(0, 1.25, -1.2);
      c.add(register);
      const lbl = makeLabel('QUICK STOP · BUY', '#ffdd57');
      lbl.position.set(0, 2.0, 0);
      c.add(lbl);
      addObject(ctx, 'store_counter', 'store', c, undefined, { shop: 'store' });
      shelf(ctx, x + 2, z - d / 2 + 0.5, 6, 0, '#eceff1');
      shelf(ctx, x + 2, z + 1.5, 6, 0, '#eceff1');
      shelf(ctx, x + w / 2 - 0.5, z, 8, Math.PI / 2, '#eceff1');
      // drink cooler glow
      const cooler = new THREE.Mesh(boxGeo(2.5, 2.1, 0.8), lambert('#b3e5fc', { emissive: '#5ad0ff', emissiveIntensity: 0.4 }));
      cooler.position.set(x + w / 2 - 2.5, y + 1.05, z + d / 2 - 1.2);
      ctx.pb.group.add(cooler);
      ctx.pb.collider(aabbFromBottom(cooler.position.x, y, cooler.position.z, 2.5, 2.1, 0.8, 'cooler'));
      break;
    }
    case 'pawn': {
      ctx.night.lights.push(pointLight(ctx, x, y + fh - 0.5, z, '#ffe4b3', 20, 20));
      const c = counter(ctx, x, z - d / 2 + 6, 8, 0, '#8d6e63');
      const owner = makeFigure('#795548', '#8d5524', '#3e2723');
      owner.position.set(x, y, z - d / 2 + 4.6);
      owner.rotation.y = Math.PI;
      ctx.pb.group.add(owner);
      const lbl = makeLabel('PAWN · EQUIPMENT', '#ffd23f');
      lbl.position.set(0, 2.0, 0);
      c.add(lbl);
      addObject(ctx, 'pawn_counter', 'pawn', c, undefined, { shop: 'pawn' });
      shelf(ctx, x - w / 2 + 0.5, z - 2, 10, Math.PI / 2, '#5d4037');
      shelf(ctx, x + w / 2 - 0.5, z - 2, 10, -Math.PI / 2, '#5d4037');
      shelf(ctx, x, z - d / 2 + 0.5, 12, 0, '#5d4037');
      // guitar / tv junk
      const tv = new THREE.Mesh(boxGeo(0.8, 0.7, 0.7), lambert('#455a64'));
      tv.position.set(x - 3, y + 1.4, z - d / 2 + 5.6);
      ctx.pb.group.add(tv);
      break;
    }
    case 'motel': {
      // interior is one room at the front; door on +x. room occupies x in [x+w/2-8, x+w/2], z in [z-4, z+4]
      ctx.night.lights.push(pointLight(ctx, x + w / 2 - 4, y + fh - 0.5, z, '#ffd0a0', 14, 14));
      const b = bed(ctx, x + w / 2 - 5.5, z - 2, Math.PI / 2, '#ff8a65');
      addObject(ctx, 'bed', 'motel_bed', b, undefined, { rest: true });
      const lbl = makeLabel('MOTEL BED · REST', '#ffb4d1');
      lbl.position.set(0, 1.6, 0);
      b.add(lbl);
      // stash shelf: usable once the player rents the room
      const stash = shelf(ctx, x + w / 2 - 7.6, z + 3, 2.4, Math.PI / 2, '#6d4c41');
      const stashLabel = makeLabel('ROOM 6 STASH', '#b3ffb3');
      stashLabel.position.set(0, 2.4, 0);
      stash.add(stashLabel);
      addObject(ctx, 'storage', 'motel_storage', stash, 'motel');
      const tvStand = table(ctx, x + w / 2 - 2, z + 2.5, 1.2, 0.6, '#5d4037');
      const tv = new THREE.Mesh(boxGeo(0.8, 0.6, 0.6), lambert('#37474f'));
      tv.position.set(0, 1.25, 0);
      const screen = new THREE.Mesh(boxGeo(0.6, 0.45, 0.02), lambert('#102030', { emissive: '#7fbfff', emissiveIntensity: 0.7 }));
      screen.position.set(0, 1.25, -0.31);
      tvStand.add(tv, screen);
      break;
    }
    case 'warehouse': {
      ctx.night.lights.push(pointLight(ctx, x - 10, y + fh - 1, z, '#e8f0ff', 30, 40));
      ctx.night.lights.push(pointLight(ctx, x + 10, y + fh - 1, z, '#e8f0ff', 30, 40));
      // big racks along the back wall
      shelf(ctx, x - w / 2 + 0.6, z - 10, 16, Math.PI / 2, '#78909c');
      shelf(ctx, x - w / 2 + 0.6, z + 10, 16, Math.PI / 2, '#78909c');
      const stor = shelf(ctx, x, z - d / 2 + 0.6, 10, 0, '#546e7a');
      const lbl = makeLabel('WAREHOUSE STORAGE', '#b3ffb3');
      lbl.position.set(0, 2.5, 0);
      stor.add(lbl);
      addObject(ctx, 'storage', 'warehouse_storage', stor, 'warehouse');
      // pallets
      for (let i = 0; i < 4; i++) {
        const p = new THREE.Mesh(boxGeo(1.4, 0.15, 1.4), lambert('#a1887f'));
        p.position.set(x - 8 + i * 4, y + 0.08, z + d / 2 - 3);
        ctx.pb.group.add(p);
      }
      // placement area marker (invisible anchor at room center)
      const anchor = new THREE.Object3D();
      anchor.position.set(x + 4, y, z);
      ctx.pb.group.add(anchor);
      addObject(ctx, 'placement_area', 'warehouse_area', anchor, 'warehouse', { minX: x - 16, maxX: x + 22, minZ: z - 18, maxZ: z + 18 });
      break;
    }
    case 'club': {
      const l1 = pointLight(ctx, x - 4, y + fh - 0.8, z - 6, '#ff2fd0', 26, 22);
      const l2 = pointLight(ctx, x - 4, y + fh - 0.8, z + 6, '#2fd6ff', 26, 22);
      ctx.night.lights.push(l1, l2);
      (ctx.night as unknown as { clubLights?: THREE.PointLight[] }).clubLights = [l1, l2];
      // dance floor tiles
      const tileColors = ['#ff4fd8', '#4ff2e8', '#ffe066', '#b388ff'];
      let k = 0;
      for (let ix = 0; ix < 6; ix++)
        for (let iz = 0; iz < 8; iz++) {
          const m = lambert(tileColors[(ix + iz) % 4], { emissive: tileColors[(ix + iz) % 4], emissiveIntensity: 0.35 });
          const t = new THREE.Mesh(boxGeo(1.9, 0.05, 1.9), m);
          t.position.set(x - 8 + ix * 2, y + 0.03, z - 7 + iz * 2);
          ctx.pb.group.add(t);
          if (k % 3 === 0) ctx.night.emissive.push(m);
          k++;
        }
      const c = counter(ctx, x + 6, z, 12, Math.PI / 2, '#4a148c');
      const bartender = makeFigure('#212121', '#f1c27d');
      bartender.position.set(x + 7.5, y, z);
      bartender.rotation.y = -Math.PI / 2;
      ctx.pb.group.add(bartender);
      const lbl = makeLabel('BAR', '#ff4fd8');
      lbl.position.set(0, 2.0, 0);
      c.add(lbl);
      addObject(ctx, 'club_bar', 'club_bar', c);
      // speakers
      for (const sz of [-12, 12]) {
        const sp = new THREE.Mesh(boxGeo(1.2, 2.2, 1.2), lambert('#111'));
        sp.position.set(x - 10, y + 1.1, z + sz);
        ctx.pb.group.add(sp);
        ctx.pb.collider(aabbFromBottom(x - 10, y, z + sz, 1.2, 2.2, 1.2, 'speaker'));
      }
      // DJ booth
      const dj = table(ctx, x - 11, z, 1.2, 4, '#1a1a2e');
      const djLabel = makeLabel('DJ TIDAL', '#4ff2e8');
      djLabel.position.set(0, 2.2, 0);
      dj.add(djLabel);
      break;
    }
  }
  void doorDir;
  void basic;
}

/** Player-placed equipment inside the warehouse. Returns the anchor object for interaction wiring. */
export function buildPlacedStation(ctx: InteriorContext, kind: 'prep_table' | 'pack_table' | 'storage', id: string, x: number, z: number, rot: number): WorldObject {
  if (kind === 'storage') {
    const s = shelf(ctx, x, z, 3, rot, '#6d4c41');
    const lbl = makeLabel('STORAGE', '#b3ffb3');
    lbl.position.set(0, 2.4, 0);
    s.add(lbl);
    return addObject(ctx, 'storage', id, s, 'warehouse');
  }
  const t = table(ctx, x, z, 2.2, 1, kind === 'prep_table' ? '#8ea9c8' : '#c8b08e');
  t.rotation.y = rot;
  if (kind === 'prep_table') {
    const mixer = new THREE.Mesh(boxGeo(0.6, 0.5, 0.6), lambert('#b0bec5'));
    mixer.position.set(0.5, 1.2, 0);
    const bowl = new THREE.Mesh(cylGeo(0.35, 0.25, 0.3, 10), lambert('#ffcc80'));
    bowl.position.set(-0.5, 1.1, 0);
    t.add(mixer, bowl);
    const lbl = makeLabel('PREP TABLE', '#8ee7ff');
    lbl.position.set(0, 2.1, 0);
    t.add(lbl);
  } else {
    const bags = new THREE.Mesh(boxGeo(0.7, 0.3, 0.5), lambert('#f5f5f5'));
    bags.position.set(-0.5, 1.1, 0);
    const sealer = new THREE.Mesh(boxGeo(0.7, 0.2, 0.4), lambert('#e53935'));
    sealer.position.set(0.5, 1.05, 0);
    t.add(bags, sealer);
    const lbl = makeLabel('PACKAGING', '#ffd166');
    lbl.position.set(0, 2.1, 0);
    t.add(lbl);
  }
  return addObject(ctx, kind, id, t, 'warehouse');
}
