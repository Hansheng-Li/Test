import { GameState } from '../game/GameState';
import { BUILDINGS, LANDMARKS, ROADS_X, ROADS_Z, MAP_MIN_X, MAP_MAX_X, MAP_MIN_Z, MAP_MAX_Z, OCEAN_X, CANAL_X, CANAL_Z, SAFEHOUSE_DOOR, SUPPLIER_SPOT, DEALER_CONTACT_SPOT, RUNNER_CONTACT_SPOT, WORKER_CONTACT_SPOT, PROPERTY_ANCHORS, BUS_STOPS, PAYPHONES } from '../data/city';

export interface MinimapDot {
  x: number;
  z: number;
}

export interface MinimapFrame {
  px: number;
  pz: number;
  /** Player yaw (forward is (-sin yaw, -cos yaw)). */
  yaw: number;
  target: { x: number; z: number } | null;
  police: MinimapDot[];
  customers: MinimapDot[];
  cars: MinimapDot[];
  runner: MinimapDot | null;
  night: boolean;
}

/** Pixels per metre on the cached city layer. */
const STATIC_SCALE = 1.6;
/** Metres from the player to the edge of the circle. */
const VIEW_RADIUS = 62;
const SIZE = 200;

/**
 * GTA-style radar in the HUD corner: the city is drawn once to an offscreen canvas, then every
 * update copies a rotated window around the player (heading up) and paints the live dots on top.
 */
export class Minimap {
  el: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private layer: HTMLCanvasElement;
  private layerKey = '';

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'minimap';
    this.canvas = document.createElement('canvas');
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
    this.el.appendChild(this.canvas);
    const n = document.createElement('span');
    n.className = 'north';
    n.textContent = 'N';
    this.el.appendChild(n);
    parent.appendChild(this.el);
    this.layer = document.createElement('canvas');
    this.layer.width = Math.ceil((MAP_MAX_X - MAP_MIN_X) * STATIC_SCALE);
    this.layer.height = Math.ceil((MAP_MAX_Z - MAP_MIN_Z) * STATIC_SCALE);
  }

  private lx(x: number): number {
    return (x - MAP_MIN_X) * STATIC_SCALE;
  }
  private lz(z: number): number {
    return (z - MAP_MIN_Z) * STATIC_SCALE;
  }

  /** Redraw the city layer when what it shows (owned property) changes. */
  private rebuildLayer(state: GameState): void {
    const key = state.properties.join(',') + '|' + (state.runner?.hired ? 1 : 0) + (state.worker?.hired ? 1 : 0) + (state.dealer?.hired ? 1 : 0);
    if (key === this.layerKey) return;
    this.layerKey = key;
    const g = this.layer.getContext('2d')!;
    const s = STATIC_SCALE;
    const W = this.layer.width;
    const H = this.layer.height;
    g.fillStyle = '#3b4a3a';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#2d6f8a';
    g.fillRect(this.lx(OCEAN_X), 0, W, H);
    g.fillRect(0, 0, this.lx(CANAL_X), H);
    g.fillRect(0, this.lz(CANAL_Z), W, H);
    g.fillStyle = '#b8a069';
    g.fillRect(this.lx(169), 0, this.lx(OCEAN_X) - this.lx(169), H);
    // roads
    g.fillStyle = '#8c8c8c';
    for (const z of ROADS_Z) g.fillRect(0, this.lz(z - 6), this.lx(OCEAN_X), 12 * s);
    for (const x of ROADS_X) g.fillRect(this.lx(x - 6), 0, 12 * s, this.lz(CANAL_Z));
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 1;
    g.setLineDash([5, 7]);
    for (const z of ROADS_Z) {
      g.beginPath();
      g.moveTo(0, this.lz(z));
      g.lineTo(this.lx(OCEAN_X), this.lz(z));
      g.stroke();
    }
    for (const x of ROADS_X) {
      g.beginPath();
      g.moveTo(this.lx(x), 0);
      g.lineTo(this.lx(x), this.lz(CANAL_Z));
      g.stroke();
    }
    g.setLineDash([]);
    // buildings
    for (const b of BUILDINGS) {
      const owned = state.properties.includes(b.id) || b.id === 'safehouse';
      g.fillStyle = owned ? '#4caf50' : b.interior ? '#c9a227' : '#6b6b78';
      g.fillRect(this.lx(b.x - b.w / 2), this.lz(b.z - b.d / 2), b.w * s, b.d * s);
      g.strokeStyle = owned ? '#a5ffb0' : '#9a9aaa';
      g.lineWidth = owned ? 2 : 1;
      g.strokeRect(this.lx(b.x - b.w / 2), this.lz(b.z - b.d / 2), b.w * s, b.d * s);
    }
    // small fixed markers
    for (const p of PAYPHONES) {
      g.fillStyle = '#2f80ed';
      g.fillRect(this.lx(p.x) - 2.5 * s, this.lz(p.z) - 2.5 * s, 5 * s, 5 * s);
    }
    for (const b of BUS_STOPS) {
      g.fillStyle = '#f39c12';
      g.fillRect(this.lx(b.x) - 3.5 * s, this.lz(b.z) - 3.5 * s, 7 * s, 7 * s);
    }
    for (const l of LANDMARKS) {
      g.fillStyle = '#d7c8a8';
      g.beginPath();
      g.arc(this.lx(l.x), this.lz(l.z), 2 * s, 0, Math.PI * 2);
      g.fill();
    }
    const spot = (x: number, z: number, color: string): void => {
      g.fillStyle = color;
      g.beginPath();
      g.arc(this.lx(x), this.lz(z), 4 * s, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#fff';
      g.lineWidth = 1.5;
      g.stroke();
    };
    spot(SAFEHOUSE_DOOR.x, SAFEHOUSE_DOOR.z, '#2e7d32');
    spot(SUPPLIER_SPOT.x, SUPPLIER_SPOT.z, '#ff9800');
    spot(DEALER_CONTACT_SPOT.x, DEALER_CONTACT_SPOT.z, '#8e24aa');
    if (!state.runner?.hired) spot(RUNNER_CONTACT_SPOT.x, RUNNER_CONTACT_SPOT.z, '#00838f');
    if (!state.worker?.hired) spot(WORKER_CONTACT_SPOT.x, WORKER_CONTACT_SPOT.z, '#6a1b9a');
    if (state.properties.includes('warehouse')) spot(PROPERTY_ANCHORS.warehouse.x, PROPERTY_ANCHORS.warehouse.z, '#2e7d32');
    if (state.properties.includes('motel')) spot(PROPERTY_ANCHORS.motel.x, PROPERTY_ANCHORS.motel.z, '#2e7d32');
  }

  update(state: GameState, f: MinimapFrame): void {
    this.rebuildLayer(state);
    const g = this.canvas.getContext('2d')!;
    const R = SIZE / 2;
    const k = R / VIEW_RADIUS; // screen px per metre
    g.clearRect(0, 0, SIZE, SIZE);
    g.save();
    g.beginPath();
    g.arc(R, R, R - 1, 0, Math.PI * 2);
    g.clip();
    // heading-up: rotating by yaw sends the player's forward (-sin yaw, -cos yaw) to (0, -1), straight up
    g.translate(R, R);
    g.rotate(f.yaw);
    g.scale(k / STATIC_SCALE, k / STATIC_SCALE);
    g.translate(-this.lx(f.px), -this.lz(f.pz));
    g.drawImage(this.layer, 0, 0);
    g.restore();
    if (f.night) {
      g.fillStyle = 'rgba(10,10,40,0.25)';
      g.fillRect(0, 0, SIZE, SIZE);
    }
    // live dots in screen space
    const toScreen = (x: number, z: number): { sx: number; sy: number } => {
      const dx = x - f.px;
      const dz = z - f.pz;
      const c = Math.cos(f.yaw);
      const s = Math.sin(f.yaw);
      return { sx: R + (dx * c - dz * s) * k, sy: R + (dx * s + dz * c) * k };
    };
    const dot = (x: number, z: number, color: string, r: number, ring = true): void => {
      const { sx, sy } = toScreen(x, z);
      if (Math.hypot(sx - R, sy - R) > R - 4) return;
      g.beginPath();
      g.arc(sx, sy, r, 0, Math.PI * 2);
      g.fillStyle = color;
      g.fill();
      if (ring) {
        g.strokeStyle = '#fff';
        g.lineWidth = 1.5;
        g.stroke();
      }
    };
    for (const c of f.cars) dot(c.x, c.z, '#ff7eb6', 4);
    for (const c of f.customers) dot(c.x, c.z, '#e91e63', 5);
    if (f.runner) dot(f.runner.x, f.runner.z, '#00c2a8', 4.5);
    for (const p of f.police) dot(p.x, p.z, '#1e88e5', 4.5);
    // objective: a diamond inside the circle, an arrow on the rim when out of range
    if (f.target) {
      const { sx, sy } = toScreen(f.target.x, f.target.z);
      const d = Math.hypot(sx - R, sy - R);
      const inside = d < R - 10;
      const ex = inside ? sx : R + ((sx - R) / d) * (R - 10);
      const ey = inside ? sy : R + ((sy - R) / d) * (R - 10);
      g.save();
      g.translate(ex, ey);
      if (!inside) g.rotate(Math.atan2(sy - R, sx - R) + Math.PI / 2);
      g.beginPath();
      if (inside) {
        g.moveTo(0, -8);
        g.lineTo(7, 0);
        g.lineTo(0, 8);
        g.lineTo(-7, 0);
      } else {
        g.moveTo(0, -9);
        g.lineTo(7, 5);
        g.lineTo(-7, 5);
      }
      g.closePath();
      g.fillStyle = '#ffd166';
      g.fill();
      g.strokeStyle = '#3a2a00';
      g.lineWidth = 1.5;
      g.stroke();
      g.restore();
    }
    // player: a white arrow pointing up
    g.beginPath();
    g.moveTo(R, R - 9);
    g.lineTo(R + 6, R + 7);
    g.lineTo(R, R + 3);
    g.lineTo(R - 6, R + 7);
    g.closePath();
    g.fillStyle = '#ffffff';
    g.fill();
    g.strokeStyle = '#d50000';
    g.lineWidth = 2;
    g.stroke();
    // north tick on the rim
    const n = toScreen(f.px, f.pz - 1);
    const nd = Math.hypot(n.sx - R, n.sy - R) || 1;
    (this.el.querySelector('.north') as HTMLElement).style.transform = `translate(${((n.sx - R) / nd) * (R - 4)}px, ${((n.sy - R) / nd) * (R - 4)}px)`;
  }
}
