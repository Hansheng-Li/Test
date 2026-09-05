import * as THREE from 'three';
import { CollisionWorld } from '../physics/Colliders';
import { Input } from '../core/Input';
import { lambert, boxGeo, cylGeo } from '../world/Materials';

export interface VehicleState {
  owned: boolean;
  x: number;
  z: number;
  yaw: number;
}

/**
 * Arcade car: accelerate / brake / steer with simple friction, a square AABB
 * footprint for collisions and a bounce when you hit something. No suspension,
 * no drift model — it is a 1996 sedan for getting across Sol Palma faster.
 */
export class Vehicle {
  mesh: THREE.Group;
  position = new THREE.Vector3();
  yaw = 0;
  speed = 0;
  private steer = 0;
  private wheels: THREE.Mesh[] = [];
  private headlights: THREE.MeshLambertMaterial;
  /** Body materials Rojas can respray (box body + hood, or the model's paint* materials). */
  private paintMats: THREE.MeshLambertMaterial[] = [];
  private hornCooldown = 0;
  maxSpeed = 22.4;
  reverseMax = -6;
  accel = 12;
  brake = 22;
  friction = 3.5;
  lastHit = 0;
  /** Direction the car actually travels; lags behind `yaw` while drifting. */
  private travelYaw = 0;
  /** True while the handbrake is sliding the car sideways. */
  drifting = false;
  /** 0..1 nitro charge; F burns it, it refills when unused. */
  nitro = 1;
  boosting = false;

  /** Half-width of the collision body. */
  private bodyRadius = 1.05;

  constructor(x: number, z: number, yaw: number, private world: CollisionWorld, public kind: 'sedan' | 'beater' = 'sedan') {
    this.mesh = new THREE.Group();
    // local +z is the front of the car; rotation.y = yaw maps it to world (sin yaw, cos yaw)
    const body = new THREE.Mesh(boxGeo(1.9, 0.7, 4.4), lambert('#ff7eb6'));
    this.paintMats.push(body.material as THREE.MeshLambertMaterial);
    body.position.y = 0.55;
    body.castShadow = true;
    const cabin = new THREE.Mesh(boxGeo(1.7, 0.65, 2.2), lambert('#2a1a3a', { transparent: true, opacity: 0.85 }));
    cabin.position.set(0, 1.2, -0.2);
    const hood = new THREE.Mesh(boxGeo(1.7, 0.12, 1.2), lambert('#ff9ecb'));
    this.paintMats.push(hood.material as THREE.MeshLambertMaterial);
    hood.position.set(0, 0.95, 1.6);
    this.headlights = lambert('#fff7d6', { emissive: '#fff2b0', emissiveIntensity: 0 });
    for (const side of [-0.65, 0.65]) {
      const hl = new THREE.Mesh(boxGeo(0.35, 0.2, 0.1), this.headlights);
      hl.position.set(side, 0.6, 2.2);
      this.mesh.add(hl);
      const tl = new THREE.Mesh(boxGeo(0.35, 0.2, 0.1), lambert('#ff2d2d', { emissive: '#ff2d2d', emissiveIntensity: 0.6 }));
      tl.position.set(side, 0.6, -2.2);
      this.mesh.add(tl);
    }
    this.mesh.add(body, cabin, hood);
    const wheelGeo = cylGeo(0.36, 0.36, 0.26, 10);
    for (const [wx, wz] of [[0.95, 1.4], [-0.95, 1.4], [0.95, -1.4], [-0.95, -1.4]]) {
      const pivot = new THREE.Group();
      pivot.rotation.order = 'YXZ';
      pivot.position.set(wx, 0.36, wz);
      const w = new THREE.Mesh(wheelGeo, lambert('#151515'));
      w.rotation.z = Math.PI / 2;
      pivot.add(w);
      this.mesh.add(pivot);
      this.wheels.push(pivot as unknown as THREE.Mesh);
    }
    this.position.set(x, 0.15, z);
    this.yaw = yaw;
    this.travelYaw = yaw;
    if (kind === 'beater') {
      // Rico's old hatchback: slower, softer brakes, rust for paint
      this.maxSpeed = 15.4;
      this.reverseMax = -5;
      this.accel = 8.5;
      this.brake = 17;
      this.bodyRadius = 0.95;
      this.setPaint('#9a5b34');
    }
    this.sync();
  }

  /** Respray: recolour whichever body the car currently has. */
  setPaint(hex: string): void {
    for (const m of this.paintMats) m.color.set(hex);
  }

  distanceTo(x: number, z: number): number {
    return Math.hypot(this.position.x - x, this.position.z - z);
  }

  setNight(night: boolean): void {
    this.night = night;
    this.headlights.emissiveIntensity = night ? 1.5 : 0;
  }

  private night = false;

  /** Swap the box body for a loaded model (already scaled). Wheels named wheel_* keep spinning and steering. */
  applyModel(model: THREE.Group): void {
    this.mesh.clear();
    this.wheels = [];
    this.paintMats = [];
    const wheels: THREE.Object3D[] = [];
    model.traverse((o) => {
      if (o.name.startsWith('wheel')) wheels.push(o);
      if (o instanceof THREE.Mesh && (o.material as THREE.Material).name.startsWith('paint') && !this.paintMats.includes(o.material as THREE.MeshLambertMaterial)) this.paintMats.push(o.material as THREE.MeshLambertMaterial);
      if (o instanceof THREE.Mesh && (o.material as THREE.Material).name === 'lightFront') {
        this.headlights = (o.material as THREE.MeshLambertMaterial).clone();
        this.headlights.emissive.set('#fff2b0');
        o.material = this.headlights;
      }
      if (o instanceof THREE.Mesh && (o.material as THREE.Material).name === 'lightBack') {
        const m = (o.material as THREE.MeshLambertMaterial).clone();
        m.emissive.set('#ff2d2d');
        m.emissiveIntensity = 0.5;
        o.material = m;
      }
    });
    // front wheels first so the steering rule (index < 2) keeps working (the source model faces -z)
    wheels.sort((a, b) => a.position.z - b.position.z);
    for (const w of wheels) {
      const pivot = new THREE.Group();
      pivot.rotation.order = 'YXZ';
      pivot.position.copy(w.position);
      w.parent!.add(pivot);
      w.position.set(0, 0, 0);
      pivot.add(w);
      this.wheels.push(pivot as unknown as THREE.Mesh);
    }
    this.mesh.add(model);
    this.setNight(this.night);
  }

  /** Drive with keyboard. Returns 'hit' on a wall bump, 'horn' when honking. */
  update(dt: number, input: Input): 'hit' | 'horn' | null {
    let result: 'hit' | 'horn' | null = null;
    const fwd = input.isDown('KeyW') || input.isDown('ArrowUp');
    const back = input.isDown('KeyS') || input.isDown('ArrowDown');
    const left = input.isDown('KeyA') || input.isDown('ArrowLeft');
    const right = input.isDown('KeyD') || input.isDown('ArrowRight');
    const handbrake = input.isDown('ShiftLeft');
    this.hornCooldown -= dt;
    if (input.wasPressed('Space') && this.hornCooldown <= 0) {
      this.hornCooldown = 0.6;
      result = 'horn';
    }
    // nitro: Ctrl burns the charge for a big push; it refills slowly when unused
    this.boosting = input.isDown('KeyF') && this.nitro > 0.02 && fwd && this.speed > 1;
    if (this.boosting) this.nitro = Math.max(0, this.nitro - dt / 2.5);
    else this.nitro = Math.min(1, this.nitro + dt / 9);
    const top = this.maxSpeed * (this.boosting ? 1.3 : 1);
    if (fwd) this.speed += this.accel * (this.boosting ? 2.2 : 1) * dt;
    else if (back) this.speed -= (this.speed > 0 ? this.brake : this.accel * 0.6) * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), this.friction * dt);
    // handbrake at speed: the rear steps out (drift); at low speed it just brakes
    this.drifting = handbrake && Math.abs(this.speed) > 7;
    if (handbrake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), (this.drifting ? this.friction * 2.5 : this.brake * 1.2) * dt);
    this.speed = Math.max(this.reverseMax, Math.min(top, this.speed));
    const targetSteer = (left ? 1 : 0) - (right ? 1 : 0);
    this.steer += (targetSteer - this.steer) * Math.min(1, dt * 8);
    const steerRate = (this.drifting ? 3.2 : 1.8) * Math.min(1, Math.abs(this.speed) / 6);
    this.yaw += this.steer * steerRate * dt * Math.sign(this.speed || 1);
    // the travel direction follows the nose: instantly with grip, lazily in a drift
    let rel = this.yaw - this.travelYaw;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    this.travelYaw += rel * Math.min(1, dt * (this.drifting ? 2.2 : 14));
    const vx = Math.sin(this.travelYaw) * this.speed;
    const vz = Math.cos(this.travelYaw) * this.speed;
    const pos = { x: this.position.x, y: this.position.y, z: this.position.z };
    const vel = { x: vx, y: -2, z: vz };
    const before = { x: pos.x, z: pos.z };
    const res = this.world.moveBody(pos, vel, this.bodyRadius, 1.4, dt, 0.35);
    this.position.set(pos.x, pos.y, pos.z);
    if (res.hitWall) {
      const moved = Math.hypot(pos.x - before.x, pos.z - before.z);
      if (moved < Math.abs(this.speed) * dt * 0.5) {
        if (Math.abs(this.speed) > 3) result = result ?? 'hit';
        this.speed *= -0.25;
      }
    }
    // wheel spin + steer visuals
    for (let i = 0; i < this.wheels.length; i++) {
      const w = this.wheels[i];
      w.rotation.y = i < 2 ? this.steer * 0.5 : 0;
      w.rotation.x += (this.speed * dt) / 0.36;
    }
    this.sync();
    return result;
  }

  sync(): void {
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.yaw;
  }

  /** Local (x right, z forward) offset to world space. */
  private local(x: number, z: number): { x: number; z: number } {
    return {
      x: this.position.x + x * Math.cos(this.yaw) + z * Math.sin(this.yaw),
      z: this.position.z - x * Math.sin(this.yaw) + z * Math.cos(this.yaw),
    };
  }

  /** Where the player stands after getting out: the driver side, or the first side that is not inside a wall. */
  exitSpot(): { x: number; z: number } {
    const candidates: [number, number][] = [[-2.3, 0], [2.3, 0], [-2.3, 2.2], [2.3, 2.2], [0, -3.8], [0, 3.8], [-2.3, -2.2], [2.3, -2.2]];
    for (const [lx, lz] of candidates) {
      const p = this.local(lx, lz);
      if (this.spotFree(p.x, p.z)) return p;
    }
    return this.local(-2.3, 0);
  }

  /** No solid box overlaps a standing player at (x, z). */
  private spotFree(x: number, z: number): boolean {
    const r = 0.4;
    const y0 = this.position.y + 0.3;
    const y1 = y0 + 1.7;
    for (const b of this.world.query(x - r, z - r, x + r, z + r)) {
      if (b.maxY <= y0 || b.minY >= y1) continue;
      if (b.maxX <= x - r || b.minX >= x + r || b.maxZ <= z - r || b.minZ >= z + r) continue;
      return false;
    }
    return true;
  }

  /** Camera yaw that looks along the car's heading (player convention: forward = (-sin, -cos)). */
  get cameraYaw(): number {
    return this.yaw + Math.PI;
  }

  get mph(): number {
    return Math.abs(this.speed) * 2.237;
  }
}
