import { Civilian } from './NPC';
import { CustomerDef } from '../data/customers';
import { CollisionWorld } from '../physics/Colliders';
import { WaypointGraph } from '../world/Waypoints';
import { makeLabel } from '../world/Interiors';

/**
 * A customer living their life in their home zone. Locked customers can be won over
 * with a free sample; unlocked ones buy straight out of the backpack.
 */
export class WanderingCustomer extends Civilian {
  private labelSprite: import('three').Sprite;

  constructor(public def: CustomerDef, x: number, z: number, world: CollisionWorld, graph: WaypointGraph, unlocked: boolean) {
    super('wander_' + def.id, x, z, def.shirt, def.skin, '#37474f', world, graph);
    this.speed = 1.2 + Math.random() * 0.5;
    this.labelSprite = makeLabel(def.name.toUpperCase(), unlocked ? '#ffd166' : '#b0bec5');
    this.labelSprite.position.y = 2.25;
    this.mesh.add(this.labelSprite);
    this.unlockedShown = unlocked;
    this.pickRandomNextNode();
  }

  private unlockedShown: boolean;

  setUnlockedIfChanged(unlocked: boolean): void {
    if (unlocked !== this.unlockedShown) this.setUnlocked(unlocked);
  }

  setUnlocked(unlocked: boolean): void {
    this.unlockedShown = unlocked;
    this.mesh.remove(this.labelSprite);
    this.labelSprite = makeLabel(this.def.name.toUpperCase(), unlocked ? '#ffd166' : '#b0bec5');
    this.labelSprite.position.y = 2.25;
    this.mesh.add(this.labelSprite);
  }

  /** Prefer sidewalk nodes inside the home zone so Tasha stays downtown and Chip stays on the beach. */
  pickRandomNextNode(): void {
    if (!this.graph) return;
    // called from the parent constructor before `def` exists: fall back to plain wandering
    if (!this.def) {
      super.pickRandomNextNode();
      return;
    }
    if (this.currentNode < 0) this.currentNode = this.graph.nearest(this.position.x, this.position.z).id;
    const node = this.graph.nodes[this.currentNode];
    const zone = this.def.homeZone;
    const inZone = node.links.filter((l) => this.graph!.nodes[l].zone === zone && l !== this.nextNode);
    const pool = inZone.length ? inZone : node.links.filter((l) => l !== this.nextNode);
    const from = pool.length ? pool : node.links;
    this.nextNode = from[Math.floor(Math.random() * from.length)];
    this.path = [this.nextNode];
  }

  /** Stop and face the player while they are close (so a conversation feels natural). */
  attend(px: number, pz: number, dt: number): void {
    if (this.state === 'FLEE' || this.state === 'REACT') return;
    if (this.distanceTo(px, pz) < 3.5) {
      this.velocity.set(0, 0, 0);
      this.faceToward(px, pz);
      this.state = 'WAIT';
      (this as unknown as { waitTimer: number }).waitTimer = 0.6;
    }
    void dt;
  }
}
