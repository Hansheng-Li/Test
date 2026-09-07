import * as THREE from 'three';
import { NPC } from './NPC';
import { CollisionWorld } from '../physics/Colliders';
import { WaypointGraph } from '../world/Waypoints';
import { attachFace, FACE_POLICE } from '../world/Faces';

export type PoliceState = 'PATROL' | 'NOTICE' | 'INVESTIGATE' | 'APPROACH' | 'SEARCH' | 'CHASE' | 'RETURN_TO_PATROL';

export interface PoliceContext {
  playerX: number;
  playerZ: number;
  playerY: number;
  heat: number;
  /** Player is inside their own property (police do not enter). */
  playerSafe: boolean;
  /** Player is carrying contraband right now. */
  playerHolding: boolean;
  los: (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => boolean;
  /** Sight range multiplier (fog mornings shorten it). */
  sight?: number;
}

const NOTICE_LINES = ['Hm?', 'What was that?', 'Hold on…'];
const APPROACH_LINES = ['Hey! You there!', 'Got a minute, pal?', 'Sir. SIR.'];
const CHASE_LINES = ['STOP RIGHT THERE!', 'Freeze!', 'Dispatch, in pursuit!', 'Nobody outruns District 3!'];
const LOST_LINES = ['Lost him.', 'Where did he go?', 'Ugh. Lunch break.'];

/**
 * Patrol officer state machine. Forgiving by design: heat gates every escalation
 * and losing line of sight for a few seconds ends a chase.
 */
export class Police extends NPC {
  pstate: PoliceState = 'PATROL';
  lastSeen = new THREE.Vector3();
  private lostTimer = 0;
  private arrestTimer = 0;
  private lineTimer = 0;
  private searchTimer = 0;
  private waitTimer = 0;
  hatMesh: THREE.Mesh;
  lightMesh: THREE.Mesh;
  private noticeCooldown = 0;
  /** Stuck detection: when direct steering makes no progress, fall back to the sidewalk graph for a while. */
  private stuckTimer = 0;
  private lastStuckX = 0;
  private lastStuckZ = 0;
  private detourTimer = 0;
  /** Knocked down by the bat: no arrests, no movement, then a furious chase. */
  private stunTimer = 0;

  constructor(id: string, x: number, z: number, world: CollisionWorld, graph: WaypointGraph) {
    super(id, x, z, '#1e3a8a', '#e0ac69', '#0f1e4a', world, graph);
    this.speed = 1.5;
    attachFace(this.mesh.children[2] as THREE.Mesh, FACE_POLICE);
    const hat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.4), new THREE.MeshLambertMaterial({ color: '#0f1e4a' }));
    hat.position.y = 1.95;
    this.mesh.add(hat);
    this.hatMesh = hat;
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.03), new THREE.MeshLambertMaterial({ color: '#ffd700', emissive: '#ffd700', emissiveIntensity: 0.3 }));
    badge.position.set(-0.15, 1.3, 0.19);
    this.mesh.add(badge);
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), new THREE.MeshLambertMaterial({ color: '#ff0000', emissive: '#ff0000', emissiveIntensity: 0 }));
    light.position.y = 2.15;
    this.mesh.add(light);
    this.lightMesh = light;
    this.currentNode = graph.nearest(x, z).id;
    this.pickRandomNextNode();
  }

  get stunned(): boolean {
    return this.stunTimer > 0;
  }

  /** Heard a shot or saw a colleague go down: straight into a chase toward that spot. */
  alarm(x: number, z: number): void {
    if (this.stunTimer > 0) return;
    this.lastSeen.set(x, 0, z);
    if (this.pstate !== 'CHASE') this.enter('CHASE', ['Shots fired! Shots fired!', 'GUN! Everybody down!', 'All units, shooter downtown!']);
  }

  /** Bat hit: down for a few seconds, then straight into a chase. */
  stun(seconds: number): void {
    this.stunTimer = seconds;
    this.velocity.set(0, 0, 0);
    this.say('OFFICER DOWN!', '#ff5c5c', 2.5);
  }

  /** The car they were after just changed colour: drop the pursuit and search instead. */
  loseTrack(): boolean {
    if (this.pstate !== 'CHASE' && this.pstate !== 'APPROACH') return false;
    this.enter('SEARCH', LOST_LINES);
    return true;
  }

  /** Radio call from the cruiser: an idle officer goes to look where the player was last seen. */
  dispatchTo(x: number, y: number, z: number): boolean {
    if (this.pstate !== 'PATROL' && this.pstate !== 'RETURN_TO_PATROL') return false;
    this.lastSeen.set(x, y, z);
    this.enter('INVESTIGATE', ['Copy. En route.', 'Dispatch, I am on it.']);
    return true;
  }

  /**
   * Move toward a point; if the officer has been stuck for ~1.5s, follow the waypoint
   * graph toward the target for a few seconds instead of pushing into the obstacle.
   */
  private pursue(tx: number, tz: number, dt: number, speed: number): boolean {
    this.stuckTimer += dt;
    if (this.stuckTimer >= 1.5) {
      const moved = Math.hypot(this.position.x - this.lastStuckX, this.position.z - this.lastStuckZ);
      if (moved < 0.6 && this.distanceTo(tx, tz) > 3 && this.detourTimer <= 0) {
        this.routeTo(tx, tz);
        this.detourTimer = 4;
      }
      this.stuckTimer = 0;
      this.lastStuckX = this.position.x;
      this.lastStuckZ = this.position.z;
    }
    if (this.detourTimer > 0) {
      this.detourTimer -= dt;
      if (this.path.length === 0 || this.followPath(dt, speed)) this.detourTimer = 0;
      return false;
    }
    return this.moveToward(tx, tz, dt, speed);
  }

  /** Returns 'arrest' when the officer catches the player, 'searched' after a clean stop-and-search. */
  update(dt: number, ctx: PoliceContext): 'arrest' | 'searched' | null {
    this.stateTime += dt;
    this.lineTimer -= dt;
    this.noticeCooldown -= dt;
    if (this.stunTimer > 0) {
      this.stunTimer -= dt;
      this.velocity.set(0, 0, 0);
      this.mesh.rotation.z = 1.35;
      if (this.stunTimer <= 0) {
        this.mesh.rotation.z = 0;
        this.lastSeen.set(ctx.playerX, 0, ctx.playerZ);
        this.enter('CHASE', ['You are DONE, punk!', 'Assault on an officer!', 'Nobody swings at District 3!']);
      }
      return null;
    }
    const d = this.distanceTo(ctx.playerX, ctx.playerZ);
    const eyeY = this.position.y + 1.6;
    const canSee = d < 32 * (ctx.sight ?? 1) && !ctx.playerSafe && ctx.los(this.position.x, eyeY, this.position.z, ctx.playerX, ctx.playerY + 1.2, ctx.playerZ);
    const facing = (): boolean => {
      const fx = Math.sin(this.yaw);
      const fz = Math.cos(this.yaw);
      const dx = (ctx.playerX - this.position.x) / (d || 1);
      const dz = (ctx.playerZ - this.position.z) / (d || 1);
      return fx * dx + fz * dz > -0.2;
    };
    const sees = canSee && (facing() || d < 6);
    if (sees) this.lastSeen.set(ctx.playerX, 0, ctx.playerZ);
    (this.lightMesh.material as THREE.MeshLambertMaterial).emissiveIntensity = this.pstate === 'CHASE' ? (Math.sin(performance.now() / 80) > 0 ? 2 : 0) : 0;

    switch (this.pstate) {
      case 'PATROL':
        if (this.waitTimer > 0) {
          this.waitTimer -= dt;
          this.velocity.set(0, 0, 0);
        } else if (this.followPath(dt)) {
          if (Math.random() < 0.3) this.waitTimer = 2 + Math.random() * 3;
          else this.pickRandomNextNode();
        }
        if (sees && ctx.heat >= 20 && this.noticeCooldown <= 0) this.enter('NOTICE', NOTICE_LINES);
        break;
      case 'NOTICE':
        this.velocity.set(0, 0, 0);
        this.faceToward(ctx.playerX, ctx.playerZ);
        if (this.stateTime > 1.2) {
          if (!sees) this.enter('RETURN_TO_PATROL');
          else if (ctx.heat >= 60) this.enter('CHASE', CHASE_LINES);
          else if (ctx.heat >= 40) this.enter('APPROACH', APPROACH_LINES);
          else this.enter('INVESTIGATE');
        }
        break;
      case 'INVESTIGATE':
        if (this.pursue(this.lastSeen.x, this.lastSeen.z, dt, 1.6) || this.stateTime > 12) {
          this.enter('SEARCH');
        }
        if (sees && ctx.heat >= 40) this.enter('APPROACH', APPROACH_LINES);
        if (sees && ctx.heat >= 60) this.enter('CHASE', CHASE_LINES);
        break;
      case 'APPROACH':
        this.pursue(ctx.playerX, ctx.playerZ, dt, 2.4);
        if (ctx.heat >= 60 && sees) this.enter('CHASE', CHASE_LINES);
        else if (!sees) {
          this.lostTimer += dt;
          if (this.lostTimer > 4) this.enter('SEARCH');
        } else this.lostTimer = 0;
        if (d < 2.2 && sees) {
          // stop-and-search: caught holding = arrest, clean = let go
          this.velocity.set(0, 0, 0);
          this.arrestTimer += dt;
          if (this.arrestTimer > 1.2) {
            this.arrestTimer = 0;
            if (ctx.playerHolding) {
              this.enter('RETURN_TO_PATROL');
              return 'arrest';
            }
            this.enter('RETURN_TO_PATROL', ['Clean. Move along.', 'Alright, you are fine. Beat it.']);
            return 'searched';
          }
        }
        if (this.stateTime > 25) this.enter('RETURN_TO_PATROL');
        break;
      case 'CHASE': {
        const target = sees ? { x: ctx.playerX, z: ctx.playerZ } : { x: this.lastSeen.x, z: this.lastSeen.z };
        this.pursue(target.x, target.z, dt, 5.8);
        if (this.lineTimer <= 0) {
          this.say(CHASE_LINES[Math.floor(Math.random() * CHASE_LINES.length)], '#ff5c5c', 2);
          this.lineTimer = 4;
        }
        if (!sees) {
          this.lostTimer += dt;
          if (this.lostTimer > 6 || ctx.playerSafe) this.enter('SEARCH', LOST_LINES);
        } else this.lostTimer = 0;
        if (d < 1.7 && !ctx.playerSafe) {
          this.arrestTimer += dt;
          if (this.arrestTimer > 0.7) {
            this.arrestTimer = 0;
            this.enter('RETURN_TO_PATROL');
            return 'arrest';
          }
        } else this.arrestTimer = Math.max(0, this.arrestTimer - dt);
        if (ctx.heat < 25) this.enter('RETURN_TO_PATROL', ['Not worth the paperwork.']);
        break;
      }
      case 'SEARCH':
        this.velocity.set(0, 0, 0);
        this.searchTimer -= dt;
        this.yaw += dt * 1.2;
        if (sees && ctx.heat >= 60) this.enter('CHASE', CHASE_LINES);
        else if (sees && ctx.heat >= 40) this.enter('APPROACH', APPROACH_LINES);
        else if (this.searchTimer <= 0) this.enter('RETURN_TO_PATROL');
        break;
      case 'RETURN_TO_PATROL':
        if (this.path.length === 0) this.routeTo(this.position.x, this.position.z);
        if (this.followPath(dt)) {
          this.pstate = 'PATROL';
          this.currentNode = this.graph!.nearest(this.position.x, this.position.z).id;
          this.pickRandomNextNode();
        }
        break;
    }
    return null;
  }

  private enter(s: PoliceState, lines?: string[]): void {
    this.pstate = s;
    this.stateTime = 0;
    this.lostTimer = 0;
    this.arrestTimer = 0;
    if (s === 'SEARCH') this.searchTimer = 4 + Math.random() * 3;
    if (s === 'RETURN_TO_PATROL') {
      this.noticeCooldown = 6;
      this.path = [];
    }
    this.detourTimer = 0;
    this.stuckTimer = 0;
    if (lines && lines.length) this.say(lines[Math.floor(Math.random() * lines.length)], s === 'CHASE' ? '#ff5c5c' : '#9ecbff', 2.5);
  }

  get alarmed(): boolean {
    return this.pstate === 'CHASE' || this.pstate === 'APPROACH';
  }
}
