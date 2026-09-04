import { NPC } from './NPC';
import { CustomerDef } from '../data/customers';
import { CollisionWorld } from '../physics/Colliders';
import { WaypointGraph } from '../world/Waypoints';
import { Effect } from '../data/products';
import { makeLabel } from '../world/Interiors';
import { labelTexture } from '../world/Textures';
import * as THREE from 'three';

export type CustomerVisualState = 'WAITING' | 'TALK' | 'REACT' | 'LEAVE' | 'DONE';

/**
 * A customer standing at a meeting spot. After the deal they play a cartoonish
 * reaction based on the product's effect tags, then wander off along the sidewalk.
 */
let meetTex: THREE.Texture | null = null;
/** One shared '$ MEET' texture for every customer (a fresh one per spawn leaked a texture each time). */
function meetTexture(): THREE.Texture {
  meetTex ??= labelTexture('$ MEET', '#7dff9a');
  return meetTex;
}

export class CustomerNPC extends NPC {
  cstate: CustomerVisualState = 'WAITING';
  reaction: Effect | null = null;
  private reactTime = 0;
  private spin = 0;
  private baseY = 0.15;
  private glowMat: import('three').MeshLambertMaterial | null = null;
  private marker: THREE.Sprite;
  private markerT = 0;

  constructor(public def: CustomerDef, public orderId: number, x: number, z: number, world: CollisionWorld, graph: WaypointGraph) {
    super('customer_' + def.id, x, z, def.shirt, def.skin, '#37474f', world, graph);
    this.speed = 1.6;
    this.baseY = this.position.y;
    this.currentNode = graph.nearest(x, z).id;
    const torso = this.mesh.children[1] as import('three').Mesh;
    this.glowMat = (torso.material as import('three').MeshLambertMaterial).clone();
    torso.material = this.glowMat;
    const label = makeLabel(def.name.toUpperCase(), '#ffd166');
    label.position.y = 2.25;
    this.mesh.add(label);
    // tall bobbing "$" marker so the meeting spot reads from a block away
    this.marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: meetTexture(), transparent: true, depthTest: false, sizeAttenuation: true }));
    this.marker.scale.set(5, 1, 1);
    this.marker.position.y = 4;
    this.marker.renderOrder = 998;
    this.mesh.add(this.marker);
  }

  update(dt: number, playerX: number, playerZ: number): void {
    this.stateTime += dt;
    this.markerT += dt;
    this.marker.visible = this.cstate === 'WAITING';
    this.marker.position.y = 4 + Math.sin(this.markerT * 3) * 0.2;
    const d = this.distanceTo(playerX, playerZ);
    const k = d > 60 ? 2.2 : d > 25 ? 1.6 : 1;
    this.marker.scale.set(5 * k, k, 1);
    switch (this.cstate) {
      case 'WAITING':
        this.velocity.set(0, 0, 0);
        if (this.distanceTo(playerX, playerZ) < 8) this.faceToward(playerX, playerZ);
        else this.yaw += Math.sin(this.stateTime * 0.7) * dt * 0.3;
        break;
      case 'TALK':
        this.velocity.set(0, 0, 0);
        this.faceToward(playerX, playerZ);
        break;
      case 'REACT':
        this.reactTime += dt;
        this.playReaction(dt, playerX, playerZ);
        if (this.reactTime > (this.reaction === 'ENERGY' ? 6 : 5)) this.startLeaving();
        break;
      case 'LEAVE':
        if (this.followPath(dt, this.reaction === 'ENERGY' ? 4.5 : 1.7)) {
          this.pickRandomNextNode();
          if (this.stateTime > 30) this.cstate = 'DONE';
        }
        break;
      case 'DONE':
        break;
    }
  }

  startReaction(effect: Effect | null): void {
    this.cstate = 'REACT';
    this.reaction = effect;
    this.reactTime = 0;
    this.stateTime = 0;
  }

  startLeaving(): void {
    this.cstate = 'LEAVE';
    this.stateTime = 0;
    this.position.y = this.baseY;
    this.mesh.rotation.z = 0;
    if (this.glowMat) this.glowMat.emissiveIntensity = 0;
    this.currentNode = this.graph!.nearest(this.position.x, this.position.z).id;
    this.pickRandomNextNode();
  }

  private playReaction(dt: number, playerX: number, playerZ: number): void {
    switch (this.reaction) {
      case 'ENERGY': {
        // sprints in circles then bolts
        this.spin += dt * 3;
        const r = 2.5;
        this.moveToward(this.position.x + Math.cos(this.spin) * r, this.position.z + Math.sin(this.spin) * r, dt, 5);
        break;
      }
      case 'CHAOTIC':
        // dancing: hop + spin
        this.velocity.set(0, 0, 0);
        this.yaw += dt * 9;
        this.position.y = this.baseY + Math.abs(Math.sin(this.reactTime * 8)) * 0.4;
        break;
      case 'SOCIAL':
        this.velocity.set(0, 0, 0);
        this.faceToward(playerX, playerZ);
        this.mesh.rotation.z = Math.sin(this.reactTime * 6) * 0.15;
        break;
      case 'DREAMY':
        // sits down slowly and stares at the sky
        this.velocity.set(0, 0, 0);
        this.position.y = Math.max(this.baseY - 0.5, this.position.y - dt * 0.4);
        this.mesh.rotation.z = Math.min(0.5, this.reactTime * 0.15);
        break;
      case 'CONFIDENT':
        this.velocity.set(0, 0, 0);
        this.mesh.rotation.z = Math.sin(this.reactTime * 3) * 0.08;
        this.yaw += Math.sin(this.reactTime * 2) * dt;
        break;
      case 'GLOW':
        this.velocity.set(0, 0, 0);
        if (this.glowMat) {
          this.glowMat.emissive.set('#4ff2e8');
          this.glowMat.emissiveIntensity = 0.5 + Math.sin(this.reactTime * 5) * 0.5;
        }
        this.yaw += dt * 1.5;
        break;
      case 'FOCUS':
        this.velocity.set(0, 0, 0);
        this.faceToward(playerX, playerZ);
        break;
      case 'CHILL':
      default:
        this.velocity.set(0, 0, 0);
        this.mesh.rotation.z = Math.sin(this.reactTime * 1.2) * 0.1;
        break;
    }
  }
}

export const REACTION_LINES: Record<Effect, string[]> = {
  ENERGY: ['I CAN RUN FOREVER!', 'WHO WANTS TO RACE?!', 'GOTTA GO GOTTA GO GOTTA GO'],
  CHILL: ['…yeah. Yeah. Nice.', 'Everything is a hammock.', 'Sea breeze in my bones.'],
  SOCIAL: ['I LOVE EVERYONE HERE!', 'You! You are my best friend now!', 'GROUP HUG, SOL PALMA!'],
  FOCUS: ['I can see the matrix.', 'I could file taxes RIGHT NOW.', 'Every detail. Every. Detail.'],
  DREAMY: ['The clouds are singing…', 'Is the sky always this purple?', 'Wake me up in 1997.'],
  CONFIDENT: ['I am going to buy this street.', 'Somebody get me a microphone!', 'Nobody tells ME what to do!'],
  CHAOTIC: ['DANCE BATTLE! NOW!', 'WHY ARE MY SHOES LOUD', 'THE FLAMINGOS KNOW!'],
  GLOW: ['Am I… glowing?', 'I am a human lava lamp!', 'Do I look radioactive to you?'],
};
