import * as THREE from 'three';
import { Input } from '../core/Input';
import { CollisionWorld } from '../physics/Colliders';
import { clamp } from '../utils/math';

export const PLAYER_HEIGHT = 1.7;
export const PLAYER_HALF_WIDTH = 0.35;

/** First-person controller: WASD, mouse look, jump, sprint, AABB collision with step-up. */
export class PlayerController {
  position = new THREE.Vector3(0, 0, 0);
  velocity = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  grounded = false;
  walkSpeed = 5.6;
  sprintSpeed = 11.5;
  jumpSpeed = 5.5;
  gravity = -18;
  sensitivity = 0.0022;
  bobTime = 0;
  /** Set to true for one frame whenever a footstep lands (for audio). */
  stepped = false;
  private lastBobPhase = 0;
  /** Set by gameplay: player cannot move (arrested, menus). */
  frozen = false;
  sprinting = false;
  /** Shift toggles this (playtest feedback: no holding). Moving with it on sprints. */
  sprintOn = false;
  /** 0..1; sprinting drains it, resting refills it. Makes police chases a real decision. */
  stamina = 1;
  /** Sprinting no longer costs stamina (playtest feedback): the field stays for the HUD bar, which simply never drains. */
  staminaDrain = 0;
  staminaRegen = 1 / 4;
  private staminaLock = false;
  private forward = new THREE.Vector3();
  private right = new THREE.Vector3();

  constructor(public camera: THREE.PerspectiveCamera, private input: Input, private world: CollisionWorld) {}

  teleport(x: number, y: number, z: number, yaw?: number): void {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    if (yaw !== undefined) this.yaw = yaw;
    this.syncCamera(0);
  }

  update(dt: number): void {
    const { dx, dy } = this.input.consumeMouse();
    if (this.input.locked && !this.frozen) {
      this.yaw -= dx * this.sensitivity;
      this.pitch -= dy * this.sensitivity;
      this.pitch = clamp(this.pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
    }

    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    let mx = 0;
    let mz = 0;
    if (!this.frozen && this.input.locked) {
      if (this.input.isDown('KeyW') || this.input.isDown('ArrowUp')) mz += 1;
      if (this.input.isDown('KeyS') || this.input.isDown('ArrowDown')) mz -= 1;
      if (this.input.isDown('KeyD') || this.input.isDown('ArrowRight')) mx += 1;
      if (this.input.isDown('KeyA') || this.input.isDown('ArrowLeft')) mx -= 1;
    }
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len;
      mz /= len;
    }
    if (!this.frozen && this.input.locked && this.input.wasPressed('ShiftLeft')) this.sprintOn = !this.sprintOn;
    const wantSprint = len > 0 && this.sprintOn && !this.frozen;
    if (this.stamina <= 0) this.staminaLock = true;
    if (this.stamina >= 0.3) this.staminaLock = false;
    this.sprinting = wantSprint && !this.staminaLock && this.stamina > 0;
    if (this.sprinting) this.stamina = Math.max(0, this.stamina - this.staminaDrain * dt);
    else this.stamina = Math.min(1, this.stamina + this.staminaRegen * dt);
    const speed = this.sprinting ? this.sprintSpeed : this.walkSpeed;
    const targetX = (this.forward.x * mz + this.right.x * mx) * speed;
    const targetZ = (this.forward.z * mz + this.right.z * mx) * speed;
    // quick acceleration for responsive feel
    const accel = this.grounded ? 14 : 4;
    this.velocity.x += (targetX - this.velocity.x) * Math.min(1, accel * dt);
    this.velocity.z += (targetZ - this.velocity.z) * Math.min(1, accel * dt);

    if (this.grounded && !this.frozen && this.input.wasPressed('Space') && this.input.locked) {
      this.velocity.y = this.jumpSpeed;
      this.grounded = false;
    }
    this.velocity.y += this.gravity * dt;
    this.velocity.y = Math.max(this.velocity.y, -30);

    const res = this.world.moveBody(this.position, this.velocity, PLAYER_HALF_WIDTH, PLAYER_HEIGHT, dt);
    this.grounded = res.grounded;
    if (this.grounded && this.velocity.y < 0) this.velocity.y = 0;

    // keep inside the map bounds
    this.position.x = clamp(this.position.x, -230, 230);
    this.position.z = clamp(this.position.z, -190, 190);
    if (this.position.y < -5) this.position.y = 0;

    const moving = len > 0 && this.grounded;
    this.bobTime += dt * (moving ? (this.sprinting ? 13 : 9) : 0);
    // a footstep lands every time the bob crosses its bottom (sin goes negative -> positive)
    const phase = Math.sin(this.bobTime);
    this.stepped = moving && this.lastBobPhase < 0 && phase >= 0;
    this.lastBobPhase = phase;
    const targetFov = this.sprinting ? 80 : 75;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 6);
      this.camera.updateProjectionMatrix();
    }
    this.syncCamera(moving ? (this.sprinting ? 0.045 : 0.03) : 0);
  }

  private syncCamera(bobAmp: number): void {
    const bob = Math.sin(this.bobTime) * bobAmp;
    this.camera.position.set(this.position.x, this.position.y + PLAYER_HEIGHT - 0.1 + bob, this.position.z);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  get eyeY(): number {
    return this.position.y + PLAYER_HEIGHT - 0.1;
  }
}
