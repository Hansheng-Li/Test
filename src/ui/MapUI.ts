import { Panel } from './Panel';
import { GameAPI } from './UIContext';
import { BUILDINGS, LANDMARKS, ROADS_X, ROADS_Z, MAP_MIN_X, MAP_MAX_X, MAP_MIN_Z, MAP_MAX_Z, OCEAN_X, CANAL_X, CANAL_Z, SAFEHOUSE_DOOR, SUPPLIER_SPOT, DEALER_CONTACT_SPOT, RUNNER_CONTACT_SPOT, WORKER_CONTACT_SPOT, PROPERTY_ANCHORS } from '../data/city';
import { activeOrders } from '../systems/OrderSystem';
import { CUSTOMER_MAP } from '../data/customers';

/** "Paper map" of Sol Palma drawn on a canvas. */
export class MapUI extends Panel {
  private canvas: HTMLCanvasElement;
  private scale = 2.2;

  constructor(parent: HTMLElement, private api: GameAPI) {
    super('map-panel', 'SOL PALMA · TOURIST MAP', parent);
    this.canvas = document.createElement('canvas');
    this.canvas.width = (MAP_MAX_X - MAP_MIN_X) * this.scale;
    this.canvas.height = (MAP_MAX_Z - MAP_MIN_Z) * this.scale;
    this.canvas.style.width = '100%';
    this.body.appendChild(this.canvas);
  }

  private px(x: number): number {
    return (x - MAP_MIN_X) * this.scale;
  }
  private pz(z: number): number {
    return (z - MAP_MIN_Z) * this.scale;
  }

  render(): void {
    const g = this.canvas.getContext('2d')!;
    const s = this.scale;
    g.fillStyle = '#f4e4c1';
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    // water
    g.fillStyle = '#7fc8e0';
    g.fillRect(this.px(OCEAN_X), 0, this.canvas.width, this.canvas.height);
    g.fillRect(0, 0, this.px(CANAL_X), this.canvas.height);
    g.fillRect(0, this.pz(CANAL_Z), this.canvas.width, this.canvas.height);
    g.fillStyle = '#f7e7a8';
    g.fillRect(this.px(169), 0, this.px(OCEAN_X) - this.px(169), this.canvas.height);
    // roads
    g.fillStyle = '#c9b48a';
    for (const z of ROADS_Z) g.fillRect(0, this.pz(z - 6), this.px(OCEAN_X), 12 * s);
    for (const x of ROADS_X) g.fillRect(this.px(x - 6), 0, 12 * s, this.pz(CANAL_Z));
    // buildings
    for (const b of BUILDINGS) {
      g.fillStyle = b.zone === 'beach' ? '#f2a7c3' : b.zone === 'docks' ? '#b0aa9a' : '#d9c3a3';
      if (b.interior) g.fillStyle = b.id === 'safehouse' ? '#7dff9a' : '#ffd166';
      g.fillRect(this.px(b.x - b.w / 2), this.pz(b.z - b.d / 2), b.w * s, b.d * s);
      g.strokeStyle = '#5a3a20';
      g.lineWidth = 1;
      g.strokeRect(this.px(b.x - b.w / 2), this.pz(b.z - b.d / 2), b.w * s, b.d * s);
      if (b.w >= 26) {
        g.fillStyle = '#3a2a1a';
        g.font = `bold ${Math.max(9, 4.5 * s)}px Arial`;
        g.textAlign = 'center';
        g.fillText(b.name.toUpperCase().slice(0, 18), this.px(b.x), this.pz(b.z) + 3);
      }
    }
    // landmarks with active orders
    const st = this.api.state;
    const orders = activeOrders(st);
    g.font = `bold ${6 * s}px Arial`;
    for (const l of LANDMARKS) {
      const o = orders.find((x) => x.locationId === l.id);
      g.beginPath();
      g.arc(this.px(l.x), this.pz(l.z), o ? 5 * s : 2 * s, 0, Math.PI * 2);
      g.fillStyle = o ? (o.status === 'runner' ? '#00c2a8' : '#e91e63') : '#6a4a2a';
      g.fill();
      if (o) {
        g.fillStyle = '#7a0030';
        g.textAlign = 'left';
        g.fillText(`${CUSTOMER_MAP[o.customerId].name.split(' ')[0]} · ${l.name}`, this.px(l.x) + 7 * s, this.pz(l.z) + 3);
      }
    }
    // key spots
    const dot = (x: number, z: number, color: string, label: string): void => {
      g.fillStyle = color;
      g.beginPath();
      g.arc(this.px(x), this.pz(z), 4 * s, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#222';
      g.textAlign = 'left';
      g.fillText(label, this.px(x) + 6 * s, this.pz(z) + 3);
    };
    dot(SAFEHOUSE_DOOR.x, SAFEHOUSE_DOOR.z, '#2e7d32', 'BACK ROOM');
    dot(SUPPLIER_SPOT.x, SUPPLIER_SPOT.z, '#ff9800', 'RICO');
    if (st.properties.includes('warehouse')) dot(PROPERTY_ANCHORS.warehouse.x, PROPERTY_ANCHORS.warehouse.z, '#2e7d32', 'YOUR WAREHOUSE');
    if (st.properties.includes('motel')) dot(PROPERTY_ANCHORS.motel.x, PROPERTY_ANCHORS.motel.z, '#2e7d32', 'ROOM 6');
    dot(DEALER_CONTACT_SPOT.x, DEALER_CONTACT_SPOT.z, '#8e24aa', st.dealer?.hired ? `VINCE ($${Math.round(st.dealer.cash)})` : 'VINCE (dealer)');
    if (!st.runner?.hired) dot(RUNNER_CONTACT_SPOT.x, RUNNER_CONTACT_SPOT.z, '#00838f', 'DIZZY (runner)');
    if (!st.worker?.hired) dot(WORKER_CONTACT_SPOT.x, WORKER_CONTACT_SPOT.z, '#6a1b9a', 'MARISOL (worker)');
    if (this.api.hasScanner()) for (const p of this.api.policeXZ()) dot(p.x, p.z, '#1e88e5', '');
    const r = this.api.runnerXZ();
    if (r) dot(r.x, r.z, '#00c2a8', 'RUNNER');
    // player
    const p = this.api.playerXZ();
    g.fillStyle = '#d50000';
    g.beginPath();
    g.arc(this.px(p.x), this.pz(p.z), 5 * s, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#fff';
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = '#222';
    g.font = `bold ${7 * s}px Arial`;
    g.textAlign = 'left';
    g.fillText('YOU', this.px(p.x) + 7 * s, this.pz(p.z) - 6);
    // legend
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillRect(8, this.canvas.height - 26 * s, 260 * s, 22 * s);
    g.fillStyle = '#222';
    g.font = `${6 * s}px Arial`;
    g.fillText('● RED: you   ● PINK: customer waiting   ● TEAL: runner   ● YELLOW: shops   ● GREEN: your property', 14, this.canvas.height - 12 * s);
  }
}
