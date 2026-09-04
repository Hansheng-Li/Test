import * as THREE from 'three';
import { CollisionWorld } from '../physics/Colliders';
import { WaypointGraph } from '../world/Waypoints';
import { makeFigure } from '../world/Interiors';
import { speechTexture } from '../world/Textures';

export type CivilianState = 'IDLE' | 'WANDER' | 'GO_TO_DESTINATION' | 'WAIT' | 'TALK' | 'REACT' | 'FLEE';

/** Shared low-cost character: box figure, waypoint navigation, speech bubble, walk bob. */
export class NPC {
  mesh: THREE.Group;
  position: THREE.Vector3;
  velocity = new THREE.Vector3();
  yaw = 0;
  speed = 1.6;
  state: CivilianState = 'WANDER';
  stateTime = 0;
  target = new THREE.Vector3();
  hasTarget = false;
  currentNode = -1;
  nextNode = -1;
  path: number[] = [];
  private bubble: THREE.Sprite | null = null;
  private bubbleTimer = 0;
  private walkPhase = 0;
  private parts: { legL: THREE.Object3D; legR: THREE.Object3D; armL: THREE.Object3D; armR: THREE.Object3D } | null = null;
  fleeFrom = new THREE.Vector3();
  reactKind: string | null = null;
  /** Timer used by managers for LOD updates. */
  lodAccum = 0;

  constructor(public id: string, x: number, z: number, shirt: string, skin: string, pants = '#2c3e50', public world?: CollisionWorld, public graph?: WaypointGraph) {
    this.mesh = makeFigure(shirt, skin, pants);
    this.position = new THREE.Vector3(x, 0.15, z);
    this.mesh.position.copy(this.position);
    const kids = this.mesh.children;
    // legs are the first child (single box); split visually by adding two thin legs
    const legs = kids[0] as THREE.Mesh;
    legs.visible = false;
    const legGeo = new THREE.BoxGeometry(0.22, 0.8, 0.28);
    const legMat = legs.material;
    const legL = new THREE.Mesh(legGeo, legMat);
    legL.position.set(-0.13, 0.4, 0);
    const legR = new THREE.Mesh(legGeo, legMat);
    legR.position.set(0.13, 0.4, 0);
    this.mesh.add(legL, legR);
    this.parts = { legL, legR, armL: kids[3], armR: kids[4] };
    // only the torso casts a shadow: one shadow draw per character instead of six
    for (const c of this.mesh.children) c.castShadow = false;
    kids[1].castShadow = true;
  }

  /** Free GPU resources owned only by this NPC (the speech bubble); call before dropping the mesh. */
  dispose(): void {
    if (this.bubble) {
      this.mesh.remove(this.bubble);
      (this.bubble.material as THREE.SpriteMaterial).map?.dispose();
      this.bubble.material.dispose();
      this.bubble = null;
    }
  }

  say(text: string, color = '#ffffff', seconds = 3): void {
    this.dispose();
    const mat = new THREE.SpriteMaterial({ map: speechTexture(text, color), transparent: true, depthTest: false });
    this.bubble = new THREE.Sprite(mat);
    this.bubble.scale.set(2.4, 0.75, 1);
    this.bubble.position.set(0, 2.5, 0);
    this.bubble.renderOrder = 999;
    this.mesh.add(this.bubble);
    this.bubbleTimer = seconds;
  }

  setTarget(x: number, z: number): void {
    this.target.set(x, 0.15, z);
    this.hasTarget = true;
  }

  /** Walk directly to a point through the collision world; returns true when arrived. */
  moveToward(x: number, z: number, dt: number, speed = this.speed): boolean {
    const dx = x - this.position.x;
    const dz = z - this.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.35) {
      this.velocity.set(0, 0, 0);
      return true;
    }
    const vx = (dx / d) * speed;
    const vz = (dz / d) * speed;
    this.velocity.set(vx, 0, vz);
    this.yaw = Math.atan2(vx, vz);
    if (this.world) {
      const vel = { x: vx, y: -1, z: vz };
      const pos = { x: this.position.x, y: this.position.y, z: this.position.z };
      this.world.moveBody(pos, vel, 0.3, 1.8, dt, 0.5);
      this.position.set(pos.x, pos.y, pos.z);
    } else {
      this.position.x += vx * dt;
      this.position.z += vz * dt;
    }
    return false;
  }

  /** Follow waypoint path; returns true when the path is finished. */
  followPath(dt: number, speed = this.speed): boolean {
    if (!this.graph) return true;
    if (this.path.length === 0) return true;
    const n = this.graph.nodes[this.path[0]];
    if (this.moveToward(n.x, n.z, dt, speed)) {
      this.currentNode = this.path.shift()!;
    }
    return this.path.length === 0;
  }

  pickRandomNextNode(): void {
    if (!this.graph) return;
    if (this.currentNode < 0) this.currentNode = this.graph.nearest(this.position.x, this.position.z).id;
    const node = this.graph.nodes[this.currentNode];
    const links = node.links.filter((l) => l !== this.nextNode);
    const pickFrom = links.length ? links : node.links;
    this.nextNode = pickFrom[Math.floor(Math.random() * pickFrom.length)];
    this.path = [this.nextNode];
  }

  routeTo(x: number, z: number): void {
    if (!this.graph) return;
    const from = this.graph.nearest(this.position.x, this.position.z);
    const to = this.graph.nearest(x, z);
    this.path = this.graph.path(from.id, to.id);
    if (this.path[0] === this.currentNode) this.path.shift();
  }

  /** Visual update: sync mesh, animate walk cycle, expire speech. */
  syncVisual(dt: number): void {
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.yaw;
    const moving = this.velocity.lengthSq() > 0.05;
    if (this.parts) {
      this.walkPhase += dt * (moving ? this.speed * 5 : 0);
      const swing = moving ? Math.sin(this.walkPhase) * 0.6 : 0;
      this.parts.legL.rotation.x = swing;
      this.parts.legR.rotation.x = -swing;
      this.parts.armL.rotation.x = -swing * 0.8;
      this.parts.armR.rotation.x = swing * 0.8;
    }
    if (this.bubble) {
      this.bubbleTimer -= dt;
      if (this.bubbleTimer <= 0) this.dispose();
    }
  }

  faceToward(x: number, z: number): void {
    this.yaw = Math.atan2(x - this.position.x, z - this.position.z);
  }

  distanceTo(x: number, z: number): number {
    return Math.hypot(this.position.x - x, this.position.z - z);
  }
}

const IDLE_LINES = ['Hot one today.', 'Did you see the game?', 'This humidity, man.', 'Beach later?', 'I love this town.', 'My pager died again.', 'Lotto tonight!', 'Is that a real Rolex?'];
const REACT_LINES = ['Whoa!', 'Hey, watch it!', 'Is that guy okay?', 'Sol Palma, baby.', 'Somebody call someone!'];

/** Ambient pedestrian with a tiny state machine. */
export class Civilian extends NPC {
  private waitTimer = 0;

  constructor(id: string, x: number, z: number, shirt: string, skin: string, pants: string, world: CollisionWorld, graph: WaypointGraph) {
    super(id, x, z, shirt, skin, pants, world, graph);
    this.speed = 1.3 + Math.random() * 0.8;
    this.currentNode = graph.nearest(x, z).id;
    this.pickRandomNextNode();
  }

  update(dt: number, ctx: { playerX: number; playerZ: number; night: boolean; gossip?: string[] }): void {
    this.stateTime += dt;
    switch (this.state) {
      case 'WANDER':
        if (this.followPath(dt)) {
          if (Math.random() < 0.35) {
            this.state = 'WAIT';
            this.waitTimer = 1.5 + Math.random() * 4;
            this.velocity.set(0, 0, 0);
            if (Math.random() < 0.25) {
              const useGossip = ctx.gossip && ctx.gossip.length && Math.random() < 0.4;
              const pool = useGossip ? ctx.gossip! : IDLE_LINES;
              this.say(pool[Math.floor(Math.random() * pool.length)], useGossip ? '#ff8fd8' : '#bbbbbb', 2.5);
            }
          } else this.pickRandomNextNode();
        }
        break;
      case 'WAIT':
        this.waitTimer -= dt;
        this.velocity.set(0, 0, 0);
        if (this.waitTimer <= 0) {
          this.state = 'WANDER';
          this.pickRandomNextNode();
        }
        break;
      case 'REACT':
        this.velocity.set(0, 0, 0);
        this.faceToward(this.fleeFrom.x, this.fleeFrom.z);
        if (this.stateTime > 3) {
          this.state = 'WANDER';
          this.pickRandomNextNode();
        }
        break;
      case 'FLEE': {
        const dx = this.position.x - this.fleeFrom.x;
        const dz = this.position.z - this.fleeFrom.z;
        const d = Math.hypot(dx, dz) || 1;
        this.moveToward(this.position.x + (dx / d) * 10, this.position.z + (dz / d) * 10, dt, 4.2);
        if (this.stateTime > 4 || d > 30) {
          this.state = 'WANDER';
          this.currentNode = this.graph!.nearest(this.position.x, this.position.z).id;
          this.pickRandomNextNode();
        }
        break;
      }
      default:
        this.state = 'WANDER';
    }
    void ctx;
  }

  reactTo(x: number, z: number, flee = false): void {
    if (this.state === 'FLEE') return;
    this.fleeFrom.set(x, 0, z);
    this.state = flee ? 'FLEE' : 'REACT';
    this.stateTime = 0;
    this.say(REACT_LINES[Math.floor(Math.random() * REACT_LINES.length)], '#ffd166', 2.5);
  }
}
