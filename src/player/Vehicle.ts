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
  private hornCooldown = 0;
  maxSpeed = 16;
  reverseMax = -5;
  accel = 9;
  brake = 18;
  friction = 3.5;
  lastHit = 0;

  constructor(x: number, z: number, yaw: number, private world: CollisionWorld) {
    this.mesh = new THREE.Group();
    const body = new THREE.Mesh(boxGeo(4.4, 0.7, 1.9), lambert('#ff7eb6'));
    body.position.y = 0.55;
    body.castShadow = true;
    const cabin = new THREE.Mesh(boxGeo(2.2, 0.65, 1.7), lambert('#2a1a3a', { transparent: true, opacity: 0.85 }));
    cabin.position.set(-0.2, 1.2, 0);
    const hood = new THREE.Mesh(boxGeo(1.2, 0.12, 1.7), lambert('#ff9ecb'));
    hood.position.set(1.6, 0.95, 0);
    this.headlights = lambert('#fff7d6', { emissive: '#fff2b0', emissiveIntensity: 0 });
    for (const side of [-0.65, 0.65]) {
      const hl = new THREE.Mesh(boxGeo(0.1, 0.2, 0.35), this.headlights);
      hl.position.set(2.2, 0.6, side);
      this.mesh.add(hl);
      const tl = new THREE.Mesh(boxGeo(0.1, 0.2, 0.35), lambert('#ff2d2d', { emissive: '#ff2d2d', emissiveIntensity: 0.6 }));
      tl.position.set(-2.2, 0.6, side);
      this.mesh.add(tl);
    }
    this.mesh.add(body, cabin, hood);
    const wheelGeo = cylGeo(0.36, 0.36, 0.26, 10);
    for (const [wx, wz] of [[1.4, 0.95], [1.4, -0.95], [-1.4, 0.95], [-1.4, -0.95]]) {
      const w = new THREE.Mesh(wheelGeo, lambert('#151515'));
      w.rotation.x = Math.PI / 2;
      w.position.set(wx, 0.36, wz);
      this.mesh.add(w);
      this.wheels.push(w);
    }
    this.position.set(x, 0.15, z);
    this.yaw = yaw;
    this.sync();
  }

  setNight(night: boolean): void {
    this.headlights.emissiveIntensity = night ? 1.5 : 0;
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
      w.rotation.z += (this.speed * dt) / 0.36;
    }
    this.sync();
    return result;
  }

  sync(): void {
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.yaw;
  }

  /** Driver eye position in world space. */
  eye(out: THREE.Vector3): THREE.Vector3 {
    const ox = -0.3, oz = 0.4; // slightly back, left seat
    out.set(
      this.position.x + Math.sin(this.yaw) * ox + Math.cos(this.yaw) * oz,
      this.position.y + 1.35,
      this.position.z + Math.cos(this.yaw) * ox - Math.sin(this.yaw) * oz,
    );
    return out;
  }

  /** Where the player stands after getting out (driver side). */
  exitSpot(): { x: number; z: number } {
    return { x: this.position.x + Math.cos(this.yaw) * 2.2, z: this.position.z - Math.sin(this.yaw) * 2.2 };
  }

  get kmh(): number {
    return Math.abs(this.speed) * 3.6 * 1.6; // exaggerated dash number for fun
  }
}
