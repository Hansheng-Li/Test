import * as THREE from 'three';
import { Input } from '../core/Input';
import { GameClock } from '../core/Time';
import { PlayerController } from '../player/PlayerController';
import { buildCity, CityResult } from '../world/City';
import { DayNight } from '../world/DayNight';
import { SPAWN } from '../data/city';

export class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  input: Input;
  clock = new GameClock();
  player: PlayerController;
  city: CityResult;
  dayNight: DayNight;
  private last = performance.now();
  private debugEl: HTMLElement;
  private frames = 0;
  private fpsTime = 0;
  fps = 0;

  constructor(root: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    root.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 600);
    this.input = new Input(this.renderer.domElement);
    this.city = buildCity();
    this.scene.add(this.city.group);
    this.dayNight = new DayNight(this.scene, this.city.night);
    this.dayNight.setLampPositions(this.city.lampPositions);
    this.player = new PlayerController(this.camera, this.input, this.city.colliders);
    this.player.teleport(SPAWN.x, SPAWN.y + 0.2, SPAWN.z, SPAWN.yaw);
    this.debugEl = document.createElement('div');
    this.debugEl.id = 'debug';
    this.debugEl.style.display = 'block';
    root.appendChild(this.debugEl);
    window.addEventListener('resize', () => this.onResize());
    this.renderer.domElement.addEventListener('click', () => this.input.requestLock());
  }

  onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  start(): void {
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private frame(): void {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.clock.tick(dt);
    this.player.update(dt);
    this.dayNight.update(this.clock, this.player.position);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
    this.frames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 1) {
      this.fps = this.frames / this.fpsTime;
      this.frames = 0;
      this.fpsTime = 0;
      const p = this.player.position;
      this.debugEl.textContent = `fps ${this.fps.toFixed(0)}  calls ${this.renderer.info.render.calls}  tris ${this.renderer.info.render.triangles}\npos ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}  time ${this.clock.formatClock()}`;
    }
  }
}
