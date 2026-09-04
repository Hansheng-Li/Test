import * as THREE from 'three';
import { lambert, boxGeo, cylGeo } from '../world/Materials';

export interface CruiserContext {
  /** Something (the player, their car) is in the lane just ahead: brake. */
  blockAhead: boolean;
  /** Lights on: the city is hot or it is curfew. */
  alert: boolean;
  night: boolean;
}

/** Cruising speed in m/s (about 20 mph): fast enough to matter, slow enough to read. */
const CRUISE = 9;
const TURN_RATE = 2.2;

/**
 * District 3's patrol cruiser. It drives a fixed loop around the downtown blocks on
 * rails (no physics), brakes for whoever is in front of it and, when the city is hot,
 * lights up and radios foot patrols to wherever it last saw you. A moving witness:
 * a corner that is quiet now may have a cruiser rolling past in twenty seconds.
 */
export class Cruiser {
  mesh = new THREE.Group();
  position = new THREE.Vector3();
  yaw = 0;
  speed = 0;
  /** Seconds the cruiser holds still (after a radio call it stops to look). */
  holdTimer = 0;
  private target = 1;
  private wheels: THREE.Object3D[] = [];
  private headlights: THREE.MeshLambertMaterial;
  private lightRed: THREE.MeshLambertMaterial;
  private lightBlue: THREE.MeshLambertMaterial;
  private flash = 0;
  private night = false;

  constructor(private route: { x: number; z: number }[]) {
    this.headlights = lambert('#fff7d6', { emissive: '#fff2b0', emissiveIntensity: 0 });
    this.lightRed = lambert('#ff3b3b', { emissive: '#ff2020', emissiveIntensity: 0 });
    this.lightBlue = lambert('#3b7bff', { emissive: '#2050ff', emissiveIntensity: 0 });
    this.buildBoxBody();
    const start = route[0];
    const next = route[1];
    this.position.set(start.x, 0.15, start.z);
    this.yaw = Math.atan2(next.x - start.x, next.z - start.z);
    this.sync();
  }

  /** Box stand-in used until (or unless) the Kenney police model loads. */
  private buildBoxBody(): void {
    this.mesh.clear();
    this.wheels = [];
    const body = new THREE.Mesh(boxGeo(1.9, 0.7, 4.4), lambert('#f4f6f8'));
    body.position.y = 0.55;
    body.castShadow = true;
    const cabin = new THREE.Mesh(boxGeo(1.7, 0.65, 2.2), lambert('#1e2a44', { transparent: true, opacity: 0.9 }));
    cabin.position.set(0, 1.2, -0.2);
    const stripe = new THREE.Mesh(boxGeo(1.95, 0.22, 4.2), lambert('#1e3a8a'));
    stripe.position.y = 0.55;
    this.mesh.add(body, cabin, stripe);
    for (const side of [-0.65, 0.65]) {
      const hl = new THREE.Mesh(boxGeo(0.35, 0.2, 0.1), this.headlights);
      hl.position.set(side, 0.6, 2.2);
      this.mesh.add(hl);
    }
    const wheelGeo = cylGeo(0.36, 0.36, 0.26, 10);
    for (const [wx, wz] of [[0.95, 1.4], [-0.95, 1.4], [0.95, -1.4], [-0.95, -1.4]]) {
      const w = new THREE.Mesh(wheelGeo, lambert('#151515'));
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.36, wz);
      this.mesh.add(w);
      this.wheels.push(w);
    }
    this.addLightBar(1.62);
  }

  private addLightBar(y: number): void {
    const bar = new THREE.Group();
    bar.position.set(0, y, -0.2);
    const red = new THREE.Mesh(boxGeo(0.5, 0.16, 0.3), this.lightRed);
    red.position.x = -0.32;
    const blue = new THREE.Mesh(boxGeo(0.5, 0.16, 0.3), this.lightBlue);
    blue.position.x = 0.32;
    const base = new THREE.Mesh(boxGeo(1.3, 0.06, 0.34), lambert('#222'));
    base.position.y = -0.1;
    bar.add(red, blue, base);
    bar.name = 'lightbar';
    this.mesh.add(bar);
  }

  /** Swap the box body for the loaded Kenney cruiser (already scaled). Wheels named wheel_* keep spinning. */
  applyModel(model: THREE.Group): void {
    this.mesh.clear();
    this.wheels = [];
    model.traverse((o) => {
      if (o.name.startsWith('wheel')) this.wheels.push(o);
      if (o instanceof THREE.Mesh && (o.material as THREE.Material).name === 'lightFront') {
        this.headlights = (o.material as THREE.MeshLambertMaterial).clone();
        this.headlights.emissive.set('#fff2b0');
        o.material = this.headlights;
      }
    });
    this.mesh.add(model);
    // the Kenney roof is lower than the box body's
    this.addLightBar(1.48);
    this.setNight(this.night);
  }

  setNight(night: boolean): void {
    this.night = night;
    this.headlights.emissiveIntensity = night ? 1.5 : 0;
  }

  distanceTo(x: number, z: number): number {
    return Math.hypot(this.position.x - x, this.position.z - z);
  }

  /** Forward unit vector (the game's vehicles treat +z as the front). */
  forward(): { x: number; z: number } {
    return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
  }

  update(dt: number, ctx: CruiserContext): void {
    if (this.holdTimer > 0) this.holdTimer -= dt;
    const t = this.route[this.target];
    const dx = t.x - this.position.x;
    const dz = t.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    let diff = want - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turning = Math.abs(diff) > 0.15;
    this.yaw += Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, diff));
    const targetSpeed = ctx.blockAhead || this.holdTimer > 0 ? 0 : turning ? CRUISE * 0.45 : dist < 6 ? CRUISE * 0.6 : CRUISE;
    if (this.speed < targetSpeed) this.speed = Math.min(targetSpeed, this.speed + 6 * dt);
    else this.speed = Math.max(targetSpeed, this.speed - 12 * dt);
    const f = this.forward();
    this.position.x += f.x * this.speed * dt;
    this.position.z += f.z * this.speed * dt;
    if (dist < 2.5) this.target = (this.target + 1) % this.route.length;
    for (const w of this.wheels) w.rotation.x += (this.speed * dt) / 0.36;
    // light bar: alternate red / blue four times a second when alert, dark otherwise
    if (ctx.alert) {
      this.flash += dt;
      const phase = Math.floor(this.flash * 4) % 2;
      this.lightRed.emissiveIntensity = phase === 0 ? 2 : 0.1;
      this.lightBlue.emissiveIntensity = phase === 1 ? 2 : 0.1;
    } else {
      this.lightRed.emissiveIntensity = 0.15;
      this.lightBlue.emissiveIntensity = 0.15;
    }
    if (ctx.night !== this.night) this.setNight(ctx.night);
    this.sync();
  }

  private sync(): void {
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.yaw;
  }
}
