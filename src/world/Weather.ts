import * as THREE from 'three';

const DROPS = 1600;

/** A thin vertical streak so each point reads as a falling drop rather than a snowflake. */
function streakTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(6, 0, 3, 64);
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter;
  return t;
}
const BOX = 60;
const HEIGHT = 30;

/** Rain: a cloud of points that falls around the camera and wraps with it. Cosmetic plus a little faster heat decay. */
export class Weather {
  points: THREE.Points;
  private positions: Float32Array;
  private material: THREE.PointsMaterial;
  /** 0..1, eased toward the target so showers start and stop softly. */
  intensity = 0;
  private target = 0;

  constructor(scene: THREE.Scene) {
    this.positions = new Float32Array(DROPS * 3);
    for (let i = 0; i < DROPS; i++) {
      this.positions[i * 3] = (Math.random() - 0.5) * BOX;
      this.positions[i * 3 + 1] = Math.random() * HEIGHT;
      this.positions[i * 3 + 2] = (Math.random() - 0.5) * BOX;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.material = new THREE.PointsMaterial({ color: '#b8c8dc', size: 0.5, map: streakTexture(), transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true, alphaTest: 0.05 });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
  }

  setRaining(on: boolean): void {
    this.target = on ? 1 : 0;
  }

  update(dt: number, focus: THREE.Vector3): void {
    this.intensity += (this.target - this.intensity) * Math.min(1, dt * 0.6);
    if (this.intensity < 0.02 && this.target === 0) {
      this.intensity = 0;
      this.points.visible = false;
      return;
    }
    this.points.visible = true;
    this.material.opacity = 0.6 * this.intensity;
    const p = this.positions;
    const fall = 26 * dt;
    const half = BOX / 2;
    for (let i = 0; i < DROPS; i++) {
      let x = p[i * 3] - focus.x;
      let y = p[i * 3 + 1] - fall;
      let z = p[i * 3 + 2] - focus.z;
      // wrap horizontally around the focus and recycle drops that hit the ground
      x = ((x + half) % BOX + BOX) % BOX - half;
      z = ((z + half) % BOX + BOX) % BOX - half;
      if (y < -1) {
        y += HEIGHT;
        x = (Math.random() - 0.5) * BOX;
        z = (Math.random() - 0.5) * BOX;
      }
      p[i * 3] = x + focus.x;
      p[i * 3 + 1] = y;
      p[i * 3 + 2] = z + focus.z;
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}
