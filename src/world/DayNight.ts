import * as THREE from 'three';
import { GameClock } from '../core/Time';
import { NightToggle } from './WorldTypes';
import { lerp } from '../utils/math';

/**
 * Drives sky colour, fog, sun and the emissive neon / street lights from the
 * game clock. Atmosphere first, not astronomy.
 */
export class DayNight {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  ambient: THREE.AmbientLight;
  private skyDay = new THREE.Color('#8fd3ff');
  private skySunset = new THREE.Color('#ff8f6b');
  private skyNight = new THREE.Color('#0b0f2a');
  private tmp = new THREE.Color();
  private lastNightState = -1;
  private lampPool: THREE.PointLight[] = [];
  private lampPositions: { x: number; z: number }[] = [];
  private lampTimer = 0;

  constructor(private scene: THREE.Scene, private night: NightToggle) {
    this.sun = new THREE.DirectionalLight('#fff2d0', 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.near = 1;
    cam.far = 400;
    cam.left = -120;
    cam.right = 120;
    cam.top = 120;
    cam.bottom = -120;
    this.sun.shadow.bias = -0.0015;
    this.sun.shadow.normalBias = 0.05;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight('#bfe8ff', '#8a6a4a', 0.9);
    scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight('#ffffff', 0.25);
    scene.add(this.ambient);
    scene.fog = new THREE.Fog('#8fd3ff', 120, 420);
    scene.background = new THREE.Color('#8fd3ff');
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight('#ffd9a0', 60, 30, 1.7);
      l.visible = false;
      scene.add(l);
      this.lampPool.push(l);
    }
  }

  setLampPositions(p: { x: number; z: number }[]): void {
    this.lampPositions = p;
  }

  /** Only the 6 street lamps nearest the player get a real point light. */
  private updateLampPool(focus: THREE.Vector3, on: boolean): void {
    if (!on) {
      for (const l of this.lampPool) l.visible = false;
      return;
    }
    this.lampTimer -= 1;
    if (this.lampTimer > 0) return;
    this.lampTimer = 15;
    const sorted = this.lampPositions
      .map((p) => ({ p, d: (p.x - focus.x) ** 2 + (p.z - focus.z) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, this.lampPool.length);
    this.lampPool.forEach((l, i) => {
      const s = sorted[i];
      if (!s) {
        l.visible = false;
        return;
      }
      l.visible = true;
      l.position.set(s.p.x, 5.6, s.p.z);
    });
  }

  private rainSky = new THREE.Color('#6d7683');

  update(clock: GameClock, focus: THREE.Vector3, rain = 0): void {
    const h = clock.hour;
    const daylight = clock.daylight;
    // sunset tint peaks around 18:30-19:30
    const sunsetAmt = Math.max(0, 1 - Math.abs(h - 19) / 1.6) * 0.9 + Math.max(0, 1 - Math.abs(h - 6.5) / 1.2) * 0.6;
    this.tmp.copy(this.skyNight).lerp(this.skyDay, daylight).lerp(this.skySunset, Math.min(1, sunsetAmt) * (0.35 + 0.65 * daylight));
    if (rain > 0) this.tmp.lerp(this.rainSky, rain * (0.35 + 0.4 * daylight));
    (this.scene.background as THREE.Color).copy(this.tmp);
    (this.scene.fog as THREE.Fog).color.copy(this.tmp);
    (this.scene.fog as THREE.Fog).near = lerp(60, 120, daylight) * (1 - 0.45 * rain);
    (this.scene.fog as THREE.Fog).far = lerp(260, 420, daylight) * (1 - 0.45 * rain);

    const sunAngle = ((h - 6) / 12) * Math.PI; // 6h -> 0, 18h -> PI
    const isNight = daylight < 0.15;
    // at night the directional light becomes a high moon so shadows stay short and readable
    const sx = isNight ? 40 : Math.cos(sunAngle) * 100;
    const sy = isNight ? 110 : Math.max(20, Math.sin(sunAngle) * 120);
    this.sun.position.set(focus.x + sx, sy, focus.z + 60);
    this.sun.target.position.copy(focus);
    this.sun.intensity = (isNight ? 0.35 : lerp(0.3, 2.3, daylight)) * (1 - 0.45 * rain);
    this.sun.color.set(sunsetAmt > 0.3 ? '#ffb27a' : daylight > 0.05 ? '#fff2d0' : '#7080c0');
    this.hemi.intensity = lerp(0.7, 0.9, daylight);
    this.hemi.color.set(daylight > 0.1 ? '#bfe8ff' : '#4a5a9a');
    this.hemi.groundColor.set(daylight > 0.1 ? '#8a6a4a' : '#202038');
    this.ambient.intensity = lerp(0.75, 0.28, daylight);
    this.ambient.color.set(daylight > 0.1 ? '#ffffff' : '#8088d0');
    this.updateLampPool(focus, daylight < 0.7);

    const darkness = 1 - daylight;
    for (const m of this.night.emissive) m.emissiveIntensity = darkness > 0.3 ? 1.2 : 0.15;
    for (const l of this.night.lights) l.visible = darkness > 0.25;
    const nightState = darkness > 0.3 ? 1 : 0;
    if (nightState !== this.lastNightState) {
      this.lastNightState = nightState;
      for (const f of this.night.facades) {
        f.material.map = nightState ? f.night : f.day;
        f.material.needsUpdate = true;
      }
    }
  }
}
