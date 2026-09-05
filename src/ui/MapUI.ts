import { Panel } from './Panel';
import { GameAPI } from './UIContext';
import { BUS_STOPS, PAYPHONES, BUILDINGS, LANDMARKS, ROADS_X, ROADS_Z, MAP_MIN_X, MAP_MAX_X, MAP_MIN_Z, MAP_MAX_Z, OCEAN_X, CANAL_X, CANAL_Z, SAFEHOUSE_DOOR, SUPPLIER_SPOT, DEALER_CONTACT_SPOT, RUNNER_CONTACT_SPOT, WORKER_CONTACT_SPOT, PROPERTY_ANCHORS } from '../data/city';
import { activeOrders } from '../systems/OrderSystem';
import { CUSTOMER_MAP } from '../data/customers';

/** Short map names: what fits on a block at a readable size. Anything not listed keeps its full name. */
const SHORT: Record<string, string> = {
  coralarms: 'CORAL ARMS', palmcourt: 'PALM COURT', seagrass: 'SEAGRASS APTS', palmetto: 'PALMETTO APTS', police: 'POLICE DEPT', busdepot: 'BUS DEPOT',
  fishmarket: 'FISH MARKET', boatrepair: 'BOAT REPAIR', storage: 'SELF STORAGE', pagercity: 'PAGER CITY', records: 'DEL MAR RECORDS', lotus: 'GOLDEN LOTUS',
  tropicmart: 'TROPIC MART', video: 'VIDEO PALACE', laundromat: 'LAUNDROMAT', pawn: 'PAWN SHOP', store: 'QUICK STOP 24', safehouse: 'BACK ROOM',
  warehouse: 'WAREHOUSE 7', port: 'PORT AUTHORITY', motel: 'OCEAN VIEW MOTEL', club: 'CLUB MIRAGE', arcade: 'NEPTUNE ARCADE', icecream: 'SANDBAR ICE CREAM',
  garage: 'PARK & GO', azure: 'AZURE PALMS', rojas: 'ROJAS AUTO', bank: 'SUN COAST BANK', diner: 'FLAMINGO DINER', canalbar: 'CANAL SIDE BAR', bait: 'BAIT & TACKLE', cinema: 'BAY CINEMA',
};
/** Apartments and the like: drawn, labelled small and grey so the places you go stand out. */
const QUIET = new Set(['coralarms', 'palmcourt', 'seagrass', 'palmetto', 'azure', 'storage', 'bait', 'canalbar']);

/** "Paper map" of Sol Palma drawn on a canvas: only the places that matter get a bold label. */
export class MapUI extends Panel {
  private canvas: HTMLCanvasElement;
  private scale = 2.6;

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

  /** Text with a light halo so it reads on any ground colour. */
  private text(g: CanvasRenderingContext2D, txt: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center', bold = true): void {
    g.font = `${bold ? 'bold ' : ''}${size}px 'Segoe UI', Arial, sans-serif`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = Math.max(3, size * 0.35);
    g.strokeStyle = 'rgba(255,250,235,0.92)';
    g.strokeText(txt, x, y);
    g.fillStyle = color;
    g.fillText(txt, x, y);
  }

  /** Split a label into at most two lines that fit `maxW` at `size` px. */
  private wrap(g: CanvasRenderingContext2D, txt: string, size: number, maxW: number): string[] {
    g.font = `bold ${size}px 'Segoe UI', Arial, sans-serif`;
    if (g.measureText(txt).width <= maxW) return [txt];
    const words = txt.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? cur + ' ' + w : w;
      if (g.measureText(next).width <= maxW || !cur) cur = next;
      else {
        lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines.slice(0, 2);
  }

  render(): void {
    const g = this.canvas.getContext('2d')!;
    const s = this.scale;
    const W = this.canvas.width;
    const H = this.canvas.height;
    g.fillStyle = '#efdcb8';
    g.fillRect(0, 0, W, H);
    // water and sand
    g.fillStyle = '#7fc8e0';
    g.fillRect(this.px(OCEAN_X), 0, W, H);
    g.fillRect(0, 0, this.px(CANAL_X), H);
    g.fillRect(0, this.pz(CANAL_Z), W, H);
    g.fillStyle = '#f7e7a8';
    g.fillRect(this.px(169), 0, this.px(OCEAN_X) - this.px(169), H);
    // roads with a centre line
    g.fillStyle = '#a8946c';
    for (const z of ROADS_Z) g.fillRect(0, this.pz(z - 6), this.px(OCEAN_X), 12 * s);
    for (const x of ROADS_X) g.fillRect(this.px(x - 6), 0, 12 * s, this.pz(CANAL_Z));
    g.strokeStyle = 'rgba(255,240,200,0.55)';
    g.lineWidth = 1.5;
    g.setLineDash([6, 8]);
    for (const z of ROADS_Z) {
      g.beginPath();
      g.moveTo(0, this.pz(z));
      g.lineTo(this.px(OCEAN_X), this.pz(z));
      g.stroke();
    }
    for (const x of ROADS_X) {
      g.beginPath();
      g.moveTo(this.px(x), 0);
      g.lineTo(this.px(x), this.pz(CANAL_Z));
      g.stroke();
    }
    g.setLineDash([]);
    // districts
    for (const [name, x] of [['DOCKS', -160], ['DOWNTOWN', 30], ['BEACH', 140]] as const) this.text(g, name, this.px(x), this.pz(MAP_MIN_Z + 14), 22, 'rgba(90,60,30,0.55)');
    // buildings
    const st = this.api.state;
    for (const b of BUILDINGS) {
      const quiet = QUIET.has(b.id);
      const owned = st.properties.includes(b.id) || b.id === 'safehouse';
      g.fillStyle = owned ? '#8ef0a5' : b.interior ? '#ffd166' : quiet ? '#d4c2a6' : b.zone === 'beach' ? '#f4b6cf' : b.zone === 'docks' ? '#b9b3a4' : '#dcc7a6';
      const x0 = this.px(b.x - b.w / 2);
      const z0 = this.pz(b.z - b.d / 2);
      g.fillRect(x0, z0, b.w * s, b.d * s);
      g.strokeStyle = owned ? '#1b5e20' : '#5a3a20';
      g.lineWidth = owned ? 3 : 1.5;
      g.strokeRect(x0, z0, b.w * s, b.d * s);
      if (b.w < 22) continue;
      const label = (SHORT[b.id] ?? b.name).toUpperCase();
      const size = quiet ? 10 : 12;
      const lines = this.wrap(g, label, size, b.w * s - 8);
      const cy = this.pz(b.z) - ((lines.length - 1) * (size + 2)) / 2;
      lines.forEach((ln, i) => this.text(g, ln, this.px(b.x), cy + i * (size + 2), size, quiet ? '#6b5a48' : '#2b1a0c'));
    }
    // payphones and bus stops
    for (const p of PAYPHONES) {
      g.fillStyle = '#1e6fd9';
      g.fillRect(this.px(p.x) - 2.5 * s, this.pz(p.z) - 2.5 * s, 5 * s, 5 * s);
    }
    for (const b of BUS_STOPS) {
      g.fillStyle = '#e67e22';
      g.fillRect(this.px(b.x) - 4 * s, this.pz(b.z) - 4 * s, 8 * s, 8 * s);
      this.text(g, 'B', this.px(b.x), this.pz(b.z) + 1, 12, '#fff');
    }
    // meeting spots (dots), customers waiting (pins with a name)
    const orders = activeOrders(st);
    for (const l of LANDMARKS) {
      const o = orders.find((x) => x.locationId === l.id);
      g.beginPath();
      g.arc(this.px(l.x), this.pz(l.z), o ? 6 * s : 2.2 * s, 0, Math.PI * 2);
      g.fillStyle = o ? (o.status === 'runner' ? '#00c2a8' : '#e91e63') : '#7a5a3a';
      g.fill();
      if (o) {
        g.strokeStyle = '#fff';
        g.lineWidth = 2.5;
        g.stroke();
        this.text(g, `${CUSTOMER_MAP[o.customerId].name.split(' ')[0]} · ${l.name}`, this.px(l.x) + 8 * s, this.pz(l.z), 14, '#7a0030', 'left');
      }
    }
    // key spots
    const dot = (x: number, z: number, color: string, label: string, r = 4.5): void => {
      g.fillStyle = color;
      g.beginPath();
      g.arc(this.px(x), this.pz(z), r * s, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#fff';
      g.lineWidth = 2;
      g.stroke();
      if (label) this.text(g, label, this.px(x) + (r + 3) * s, this.pz(z), 14, '#1e1208', 'left');
    };
    dot(SAFEHOUSE_DOOR.x, SAFEHOUSE_DOOR.z, '#2e7d32', 'BACK ROOM (home)');
    dot(SUPPLIER_SPOT.x, SUPPLIER_SPOT.z, '#ff9800', 'RICO · supplies');
    if (st.properties.includes('warehouse')) dot(PROPERTY_ANCHORS.warehouse.x, PROPERTY_ANCHORS.warehouse.z, '#2e7d32', 'YOUR WAREHOUSE');
    if (st.properties.includes('motel')) dot(PROPERTY_ANCHORS.motel.x, PROPERTY_ANCHORS.motel.z, '#2e7d32', 'ROOM 6');
    if (st.properties.includes('laundromat')) dot(-27, -22, '#2e7d32', 'YOUR LAUNDROMAT');
    dot(DEALER_CONTACT_SPOT.x, DEALER_CONTACT_SPOT.z, '#8e24aa', st.dealer?.hired ? `VINCE · holding $${Math.round(st.dealer.cash)}` : 'VINCE · dealer for hire');
    if (!st.runner?.hired) dot(RUNNER_CONTACT_SPOT.x, RUNNER_CONTACT_SPOT.z, '#00838f', 'DIZZY · runner for hire');
    if (!st.worker?.hired) dot(WORKER_CONTACT_SPOT.x, WORKER_CONTACT_SPOT.z, '#6a1b9a', 'MARISOL · worker for hire');
    if (this.api.hasScanner()) for (const p of this.api.policeXZ()) dot(p.x, p.z, '#1e88e5', '', 3.5);
    const r = this.api.runnerXZ();
    if (r) dot(r.x, r.z, '#00c2a8', 'DIZZY');
    // player
    const p = this.api.playerXZ();
    g.fillStyle = 'rgba(213,0,0,0.25)';
    g.beginPath();
    g.arc(this.px(p.x), this.pz(p.z), 11 * s, 0, Math.PI * 2);
    g.fill();
    dot(p.x, p.z, '#d50000', '', 5.5);
    this.text(g, 'YOU', this.px(p.x), this.pz(p.z) - 9 * s, 16, '#b71c1c');
    // legend: swatches, not bullets
    const items: [string, string, 'dot' | 'box'][] = [['#d50000', 'you', 'dot'], ['#e91e63', 'customer waiting', 'dot'], ['#00c2a8', 'runner', 'dot'], ['#ffd166', 'shops', 'box'], ['#8ef0a5', 'your property', 'box'], ['#1e6fd9', 'payphone', 'box'], ['#e67e22', 'bus stop (B)', 'box'], ['#1e88e5', 'police (scanner)', 'dot']];
    const lh = 22;
    const lw = 250;
    const lx = 14;
    const ly = H - 14 - lh * 4 - 10;
    g.fillStyle = 'rgba(255,252,240,0.9)';
    g.fillRect(lx, ly, lw * 2 + 10, lh * 4 + 10);
    g.strokeStyle = '#8a5a33';
    g.lineWidth = 1.5;
    g.strokeRect(lx, ly, lw * 2 + 10, lh * 4 + 10);
    items.forEach(([color, label, kind], i) => {
      const x = lx + 12 + (i % 2) * lw;
      const y = ly + 5 + lh * Math.floor(i / 2) + lh / 2;
      g.fillStyle = color;
      if (kind === 'dot') {
        g.beginPath();
        g.arc(x + 7, y, 6, 0, Math.PI * 2);
        g.fill();
      } else g.fillRect(x + 1, y - 6, 12, 12);
      g.font = "14px 'Segoe UI', Arial, sans-serif";
      g.fillStyle = '#2b1a0c';
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(label, x + 22, y);
    });
  }
}
