import * as THREE from 'three';

/** Segments kept on the ground; older ones are overwritten in a ring. Two tyres × ~15 s of sliding at 60 fps. */
const MAX_SEGMENTS = 1600;
/** Seconds until a mark has faded away. */
const FADE_SECONDS = 40;

/**
 * Tyre marks laid behind a sliding car: one mesh, a ring buffer of quads, faded in the shader by age.
 * Each tyre is a stroke; `point()` extends it by a quad from the previous contact patch to the new one.
 */
export class SkidMarks {
  readonly mesh: THREE.Mesh;
  private geometry: THREE.BufferGeometry;
  private positions: Float32Array;
  private births: Float32Array;
  private head = 0;
  private time = 0;
  private uniforms = { uTime: { value: 0 }, uFade: { value: FADE_SECONDS } };
  private last = new Map<number, { x: number; z: number }>();

  constructor() {
    this.positions = new Float32Array(MAX_SEGMENTS * 4 * 3);
    this.births = new Float32Array(MAX_SEGMENTS * 4).fill(-1e9);
    const index = new Uint32Array(MAX_SEGMENTS * 6);
    for (let i = 0; i < MAX_SEGMENTS; i++) {
      const v = i * 4;
      index.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], i * 6);
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('birth', new THREE.BufferAttribute(this.births, 1));
    this.geometry.setIndex(new THREE.BufferAttribute(index, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `
        attribute float birth;
        varying float vAge;
        void main() {
          vAge = birth;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform float uTime;
        uniform float uFade;
        varying float vAge;
        void main() {
          float a = clamp(1.0 - (uTime - vAge) / uFade, 0.0, 1.0);
          if (a <= 0.0) discard;
          gl_FragColor = vec4(0.012, 0.01, 0.01, 0.88 * a);
        }`,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  /** Advance the fade clock. */
  update(dt: number): void {
    this.time += dt;
    this.uniforms.uTime.value = this.time;
  }

  /** A tyre stopped sliding: the next point starts a fresh stroke instead of joining the old one. */
  lift(tyre: number): void {
    this.last.delete(tyre);
  }

  /** Lay the mark from the tyre's previous contact patch to (x, z); the first call only remembers the spot. */
  point(tyre: number, x: number, y: number, z: number, width = 0.34): void {
    const prev = this.last.get(tyre);
    this.last.set(tyre, { x, z });
    if (!prev) return;
    const dx = x - prev.x;
    const dz = z - prev.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.06) {
      this.last.set(tyre, prev);
      return;
    }
    // perpendicular to the segment, half a mark wide
    const nx = (-dz / len) * width * 0.5;
    const nz = (dx / len) * width * 0.5;
    const i = this.head;
    this.head = (this.head + 1) % MAX_SEGMENTS;
    const p = this.positions;
    const v = i * 12;
    p[v] = prev.x + nx; p[v + 1] = y; p[v + 2] = prev.z + nz;
    p[v + 3] = prev.x - nx; p[v + 4] = y; p[v + 5] = prev.z - nz;
    p[v + 6] = x + nx; p[v + 7] = y; p[v + 8] = z + nz;
    p[v + 9] = x - nx; p[v + 10] = y; p[v + 11] = z - nz;
    this.births.fill(this.time, i * 4, i * 4 + 4);
    (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.birth as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Number of segments laid so far (capped by the ring), for tests and scripts. */
  get count(): number {
    let n = 0;
    for (let i = 0; i < MAX_SEGMENTS; i++) if (this.births[i * 4] > -1e8) n++;
    return n;
  }
}
