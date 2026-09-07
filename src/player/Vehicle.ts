import * as THREE from 'three';
import { CollisionWorld } from '../physics/Colliders';
import { Input } from '../core/Input';
import { lambert, boxGeo, cylGeo } from '../world/Materials';
import { stepCar, newCarSim, slipAngle, type CarSim, type CarSpec, type CarEvents } from '../systems/CarSystem';

export interface VehicleState {
  owned: boolean;
  x: number;
  z: number;
  yaw: number;
}

/**
 * Arcade car: the pure model in systems/CarSystem (throttle, kart-style drift, nitro) drives a
 * square AABB footprint through the collision world, with a bounce when you hit something.
 * The visuals live here: wheels, paint, headlights, nitro flames.
 */
export class Vehicle {
  mesh: THREE.Group;
  position = new THREE.Vector3();
  /** Live driving model: speed, heading, drift and nitro state. */
  sim: CarSim;
  private wheels: THREE.Mesh[] = [];
  private headlights: THREE.MeshLambertMaterial;
  /** Body materials Rojas can respray (box body + hood, or the model's paint* materials). */
  private paintMats: THREE.MeshLambertMaterial[] = [];
  private hornCooldown = 0;
  spec: CarSpec = { maxSpeed: 29, reverseMax: -7, accel: 15.5, brake: 26, friction: 3.5 };
  lastHit = 0;
  /** Events from the last update (drift start/end, boost-out, nitro start) for sound and effects. */
  events: CarEvents = { driftStart: false, driftEnd: false, boostOut: false, nitroStart: false };
  /** True while the tyres are sliding: a drift, or the handbrake locking them at speed. */
  skidding = false;
  /** Blue exhaust flames, shown while boosting. */
  private flames: THREE.Group;

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
    this.flames = buildFlames();
    this.mesh.add(this.flames);
    this.position.set(x, 0.15, z);
    this.sim = newCarSim(yaw);
    if (kind === 'beater') {
      // Rico's old hatchback: slower, softer brakes, rust for paint
      this.spec = { maxSpeed: 20, reverseMax: -6, accel: 11, brake: 20, friction: 3.5 };
      this.bodyRadius = 0.95;
      this.setPaint('#9a5b34');
    }
    this.sync();
  }

  get yaw(): number {
    return this.sim.yaw;
  }
  set yaw(v: number) {
    this.sim.yaw = v;
    this.sim.travelYaw = v;
  }
  get speed(): number {
    return this.sim.speed;
  }
  set speed(v: number) {
    this.sim.speed = v;
  }
  get maxSpeed(): number {
    return this.spec.maxSpeed;
  }
  get drifting(): boolean {
    return this.sim.drifting;
  }
  get nitro(): number {
    return this.sim.nitro;
  }
  get boosting(): boolean {
    return this.sim.boosting;
  }
  /** Seconds left on the drift boost-out. */
  get kick(): number {
    return this.sim.kick;
  }
  /** Nose angle relative to the travel direction (positive = nose left of travel). */
  get slip(): number {
    return slipAngle(this.sim);
  }
  /** World positions of the rear tyres' contact patches (for skid marks). */
  rearWheels(): { x: number; z: number }[] {
    return [this.local(-0.85, -1.35), this.local(0.85, -1.35)];
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
    this.mesh.add(this.flames);
    this.setNight(this.night);
  }

  /** Drive with keyboard. Returns 'hit' on a wall bump, 'horn' when honking. */
  update(dt: number, input: Input): 'hit' | 'horn' | null {
    let result: 'hit' | 'horn' | null = null;
    const left = input.isDown('KeyA') || input.isDown('ArrowLeft');
    const right = input.isDown('KeyD') || input.isDown('ArrowRight');
    const handbrake = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    this.hornCooldown -= dt;
    if (input.wasPressed('Space') && this.hornCooldown <= 0) {
      this.hornCooldown = 0.6;
      result = 'horn';
    }
    const s = this.sim;
    this.events = stepCar(s, this.spec, {
      throttle: input.isDown('KeyW') || input.isDown('ArrowUp'),
      reverse: input.isDown('KeyS') || input.isDown('ArrowDown'),
      steer: (left ? 1 : 0) - (right ? 1 : 0),
      handbrake,
      nitro: input.isDown('KeyF'),
    }, dt);
    this.skidding = s.drifting || (handbrake && Math.abs(s.speed) > 4) || (s.kick > 0 && Math.abs(this.slip) > 0.12);
    const vx = Math.sin(s.travelYaw) * s.speed;
    const vz = Math.cos(s.travelYaw) * s.speed;
    const pos = { x: this.position.x, y: this.position.y, z: this.position.z };
    const vel = { x: vx, y: -2, z: vz };
    const before = { x: pos.x, z: pos.z };
    const res = this.world.moveBody(pos, vel, this.bodyRadius, 1.4, dt, 0.35);
    this.position.set(pos.x, pos.y, pos.z);
    if (res.hitWall) {
      const moved = Math.hypot(pos.x - before.x, pos.z - before.z);
      if (moved < Math.abs(s.speed) * dt * 0.5) {
        if (Math.abs(s.speed) > 3) result = result ?? 'hit';
        s.speed *= -0.25;
        s.travelYaw = s.yaw;
      }
    }
    // nitro flames flicker behind the car while boosting; the drift boost-out shows a shorter lick
    const flame = s.boosting ? 1 : s.kick > 0 ? 0.55 : 0;
    this.flames.visible = flame > 0;
    if (flame > 0) {
      const k = (0.7 + Math.random() * 0.6) * flame;
      this.flames.scale.set(1, 1, k);
      this.flames.children.forEach((f, i) => { f.rotation.z = (Math.random() - 0.5) * 0.3 + (i === 0 ? 0.1 : -0.1); });
    }
    // wheel spin + steer visuals (in a drift the fronts point where the driver is steering, exaggerated)
    for (let i = 0; i < this.wheels.length; i++) {
      const w = this.wheels[i];
      w.rotation.y = i < 2 ? s.steer * (s.drifting ? 0.7 : 0.5) : 0;
      w.rotation.x += (s.speed * dt) / 0.36;
    }
    this.sync();
    return result;
  }

  sync(): void {
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.sim.yaw;
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

/** Two blue-white exhaust flames pointing backwards (local -z), additive so they glow over anything. */
function buildFlames(): THREE.Group {
  const g = new THREE.Group();
  const core = new THREE.MeshBasicMaterial({ color: '#dff6ff', transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const outer = new THREE.MeshBasicMaterial({ color: '#2f7fff', transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
  const coneOuter = new THREE.ConeGeometry(0.16, 1.6, 8);
  coneOuter.rotateX(Math.PI / 2);
  coneOuter.translate(0, 0, -0.8);
  const coneCore = new THREE.ConeGeometry(0.07, 1.1, 6);
  coneCore.rotateX(Math.PI / 2);
  coneCore.translate(0, 0, -0.55);
  for (const x of [-0.5, 0.5]) {
    const o = new THREE.Mesh(coneOuter, outer);
    o.position.set(x, 0.42, -2.1);
    const c = new THREE.Mesh(coneCore, core);
    c.position.set(x, 0.42, -2.1);
    g.add(o, c);
  }
  const glow = new THREE.PointLight('#4f9bff', 6, 9, 1.6);
  glow.position.set(0, 0.5, -2.6);
  g.add(glow);
  g.visible = false;
  return g;
}
