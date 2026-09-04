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
  maxSpeed = 16;
  reverseMax = -5;
  accel = 9;
  brake = 18;
  friction = 3.5;
  lastHit = 0;

  constructor(x: number, z: number, yaw: number, private world: CollisionWorld) {
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
    this.sync();
  }

  /** Respray: recolour whichever body the car currently has. */
  setPaint(hex: string): void {
    for (const m of this.paintMats) m.color.set(hex);
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
    if (fwd) this.speed += this.accel * dt;
    else if (back) this.speed -= (this.speed > 0 ? this.brake : this.accel * 0.6) * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), this.friction * dt);
    if (handbrake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), this.brake * 1.2 * dt);
    this.speed = Math.max(this.reverseMax, Math.min(this.maxSpeed, this.speed));
    const targetSteer = (left ? 1 : 0) - (right ? 1 : 0);
    this.steer += (targetSteer - this.steer) * Math.min(1, dt * 8);
    const steerRate = 1.8 * Math.min(1, Math.abs(this.speed) / 6);
    this.yaw += this.steer * steerRate * dt * Math.sign(this.speed || 1);
    const vx = Math.sin(this.yaw) * this.speed;
    const vz = Math.cos(this.yaw) * this.speed;
    const pos = { x: this.position.x, y: this.position.y, z: this.position.z };
    const vel = { x: vx, y: -2, z: vz };
    const before = { x: pos.x, z: pos.z };
    const res = this.world.moveBody(pos, vel, 1.05, 1.4, dt, 0.35);
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

  /** Where the player stands after getting out (driver side). */
  exitSpot(): { x: number; z: number } {
    return this.local(-2.3, 0);
  }

  /** Camera yaw that looks along the car's heading (player convention: forward = (-sin, -cos)). */
  get cameraYaw(): number {
    return this.yaw + Math.PI;
  }

  get mph(): number {
    return Math.abs(this.speed) * 2.237;
  }
}
