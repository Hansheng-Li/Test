import * as THREE from 'three';

export interface Interactable {
  id: string;
  position: THREE.Vector3;
  /** Return null to hide the prompt (e.g. nothing to do right now). */
  prompt: () => string | null;
  onInteract: () => void;
  radius?: number;
  /** Extra height offset for aim test (default: 1m above position). */
  aimY?: number;
}

/**
 * Center-screen interaction. Instead of raycasting against geometry we test each
 * interactable for distance and angular offset from the view direction; cheap and
 * forgiving, which suits a management game.
 */
export class InteractionSystem {
  private items = new Map<string, Interactable>();
  current: Interactable | null = null;
  private dir = new THREE.Vector3();
  private to = new THREE.Vector3();

  add(i: Interactable): void {
    this.items.set(i.id, i);
  }

  remove(id: string): void {
    this.items.delete(id);
    if (this.current?.id === id) this.current = null;
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  update(camera: THREE.Camera, eye: THREE.Vector3): Interactable | null {
    camera.getWorldDirection(this.dir);
    let best: Interactable | null = null;
    let bestScore = Infinity;
    for (const it of this.items.values()) {
      const r = it.radius ?? 3.2;
      this.to.set(it.position.x, it.position.y + (it.aimY ?? 1.0), it.position.z).sub(eye);
      const d = this.to.length();
      if (d > r) continue;
      this.to.normalize();
      const cos = this.to.dot(this.dir);
      // must be roughly in front; closer objects allow a wider cone
      const minCos = d < 1.6 ? 0.25 : 0.72;
      if (cos < minCos) continue;
      if (it.prompt() === null) continue;
      const score = d * (2 - cos);
      if (score < bestScore) {
        bestScore = score;
        best = it;
      }
    }
    this.current = best;
    return best;
  }
}
