import { NPC } from './NPC';
import { CollisionWorld } from '../physics/Colliders';
import { WaypointGraph } from '../world/Waypoints';
import { makeLabel } from '../world/Interiors';

/**
 * Visual for the hired runner. Walks from the property to the meeting spot while the
 * order's progress advances (RunnerSystem owns the logic; this just shows it).
 */
export class RunnerNPC extends NPC {
  private route: { x: number; z: number }[] = [];
  private routeLen = 0;
  private cum: number[] = [];
  homeX: number;
  homeZ: number;

  constructor(x: number, z: number, world: CollisionWorld, graph: WaypointGraph) {
    super('runner', x, z, '#00bcd4', '#f1c27d', '#ff4081', world, graph);
    this.homeX = x;
    this.homeZ = z;
    const label = makeLabel('DIZZY · RUNNER', '#7fffd4');
    label.position.y = 2.3;
    this.mesh.add(label);
    this.speed = 3;
  }

  setHome(x: number, z: number): void {
    this.homeX = x;
    this.homeZ = z;
    if (this.route.length === 0) this.position.set(x, 0.15, z);
  }

  setTrip(toX: number, toZ: number): void {
    if (!this.graph) return;
    const a = this.graph.nearest(this.homeX, this.homeZ);
    const b = this.graph.nearest(toX, toZ);
    const ids = this.graph.path(a.id, b.id);
    this.route = [{ x: this.homeX, z: this.homeZ }, ...ids.map((i) => ({ x: this.graph!.nodes[i].x, z: this.graph!.nodes[i].z })), { x: toX, z: toZ }];
    this.cum = [0];
    this.routeLen = 0;
    for (let i = 1; i < this.route.length; i++) {
      this.routeLen += Math.hypot(this.route[i].x - this.route[i - 1].x, this.route[i].z - this.route[i - 1].z);
      this.cum.push(this.routeLen);
    }
  }

  clearTrip(): void {
    this.route = [];
    this.position.set(this.homeX, 0.15, this.homeZ);
    this.velocity.set(0, 0, 0);
  }

  /** progress 0..1: 0..0.6 = walk there, 0.6..0.8 = deal, 0.8..1 = walk back. */
  showProgress(progress: number): void {
    if (this.route.length < 2) return;
    let t: number;
    if (progress < 0.6) t = progress / 0.6;
    else if (progress < 0.8) t = 1;
    else t = 1 - (progress - 0.8) / 0.2;
    const dist = t * this.routeLen;
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < dist) i++;
    const a = this.route[i - 1];
    const b = this.route[i];
    const segLen = this.cum[i] - this.cum[i - 1] || 1;
    const f = Math.max(0, Math.min(1, (dist - this.cum[i - 1]) / segLen));
    const nx = a.x + (b.x - a.x) * f;
    const nz = a.z + (b.z - a.z) * f;
    this.velocity.set(nx - this.position.x, 0, nz - this.position.z).multiplyScalar(10);
    if (this.velocity.lengthSq() > 0.01) this.yaw = Math.atan2(this.velocity.x, this.velocity.z);
    this.position.set(nx, 0.15, nz);
  }
}
