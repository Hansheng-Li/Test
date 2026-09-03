/**
 * Hand-authored layout of SOL PALMA's playable district (~460m x 380m).
 * Coordinates are world meters, x = east, z = south.
 * Roads form a grid; buildings sit inside the blocks. Everything here is original.
 */
export type Facing = 'N' | 'S' | 'E' | 'W';
export type Zone = 'beach' | 'downtown' | 'docks';
export type InteriorKind = 'safehouse' | 'store' | 'pawn' | 'motel' | 'warehouse' | 'club';
export type FacadeStyle = 'deco' | 'motel' | 'industrial' | 'shop' | 'plain';

export interface BuildingSpec {
  id: string;
  name: string;
  x: number;
  z: number;
  w: number;
  d: number;
  floors: number;
  floorHeight?: number;
  color: string;
  style: FacadeStyle;
  facing: Facing;
  zone: Zone;
  sign?: { text: string; color: string; sub?: string };
  interior?: InteriorKind;
  roof?: 'flat' | 'stepped' | 'tower';
  trim?: string;
}

export const ROADS_X = [-130, -50, 30, 110, 160];
export const ROADS_Z = [-100, -30, 40, 110];
export const ROAD_WIDTH = 12;
export const SIDEWALK_WIDTH = 3;
export const MAP_MIN_X = -235;
export const MAP_MAX_X = 235;
export const MAP_MIN_Z = -190;
export const MAP_MAX_Z = 190;
export const OCEAN_X = 200;
export const CANAL_X = -205;
export const CANAL_Z = 152;

export const BUILDINGS: BuildingSpec[] = [
  // ---- west transitional blocks
  { id: 'rojas', name: 'Rojas Auto Repair', x: -90, z: -52, w: 40, d: 22, floors: 1, floorHeight: 5, color: '#b9b1a4', style: 'industrial', facing: 'S', zone: 'docks', sign: { text: 'ROJAS AUTO REPAIR', color: '#ffb347', sub: 'BRAKES · A/C · TIRES' } },
  { id: 'storage', name: 'Sun Coast Storage', x: -90, z: -78, w: 40, d: 20, floors: 1, floorHeight: 4.5, color: '#d9c48c', style: 'industrial', facing: 'N', zone: 'docks', sign: { text: 'SUN COAST STORAGE', color: '#ffe066' } },
  { id: 'fishmarket', name: 'Marlin Fish Market', x: -90, z: -8, w: 44, d: 22, floors: 1, floorHeight: 4.5, color: '#9fc5d1', style: 'industrial', facing: 'N', zone: 'docks', sign: { text: 'MARLIN FISH MARKET', color: '#7ef0ff', sub: 'FRESH DAILY' } },
  { id: 'pagercity', name: 'Pager City', x: -90, z: 20, w: 30, d: 18, floors: 1, color: '#f4d6e8', style: 'shop', facing: 'S', zone: 'downtown', sign: { text: 'PAGER CITY', color: '#ff5fd2', sub: 'BEEPERS · CORDLESS · FAX' } },
  { id: 'boatrepair', name: 'Bayside Boat Repair', x: -90, z: 62, w: 44, d: 22, floors: 1, floorHeight: 5, color: '#a8b8b0', style: 'industrial', facing: 'N', zone: 'docks', sign: { text: 'BAYSIDE BOAT REPAIR', color: '#9dffb0' } },
  { id: 'bait', name: 'Canal Bait & Tackle', x: -90, z: 90, w: 24, d: 16, floors: 1, color: '#f6e7b2', style: 'shop', facing: 'S', zone: 'docks', sign: { text: 'CANAL BAIT & TACKLE', color: '#ffd166' } },
  // ---- downtown core
  { id: 'pawn', name: 'Sol Palma Pawn', x: -27, z: -52, w: 26, d: 20, floors: 2, color: '#e9c7a0', style: 'shop', facing: 'S', zone: 'downtown', sign: { text: 'SOL PALMA PAWN', color: '#ffd23f', sub: 'WE BUY GOLD · TOOLS · PAGERS' }, interior: 'pawn' },
  { id: 'store', name: 'Quick Stop 24', x: 7, z: -52, w: 26, d: 20, floors: 1, floorHeight: 4, color: '#f7f0d8', style: 'shop', facing: 'S', zone: 'downtown', sign: { text: 'QUICK STOP 24', color: '#ff3d7f', sub: 'ICE · SNACKS · LOTTO' }, interior: 'store' },
  { id: 'coralarms', name: 'Coral Arms Apartments', x: -10, z: -80, w: 50, d: 18, floors: 4, color: '#f7b8c4', style: 'deco', facing: 'N', zone: 'downtown', roof: 'stepped', sign: { text: 'CORAL ARMS', color: '#ffffff' } },
  { id: 'laundromat', name: 'Lucky Laundromat', x: -27, z: -10, w: 26, d: 18, floors: 2, color: '#bfe8e0', style: 'shop', facing: 'N', zone: 'downtown', sign: { text: 'LUCKY LAUNDROMAT', color: '#4ff2e8', sub: 'OPEN LATE' } },
  { id: 'safehouse', name: 'Back Room', x: -27, z: 14, w: 26, d: 16, floors: 1, floorHeight: 3.4, color: '#a9d9d1', style: 'plain', facing: 'E', zone: 'downtown', interior: 'safehouse' },
  { id: 'palmcourt', name: 'Palm Court Apartments', x: 7, z: -8, w: 26, d: 22, floors: 3, color: '#f9d5a2', style: 'deco', facing: 'N', zone: 'downtown', roof: 'stepped', sign: { text: 'PALM COURT', color: '#ffffff' } },
  { id: 'video', name: 'Video Palace', x: 7, z: 18, w: 26, d: 20, floors: 1, color: '#d6c9f2', style: 'shop', facing: 'S', zone: 'downtown', sign: { text: 'VIDEO PALACE', color: '#c77dff', sub: 'VHS RENTALS · BE KIND REWIND' } },
  { id: 'cinema', name: 'Bay Cinema', x: -27, z: 62, w: 26, d: 22, floors: 2, floorHeight: 4, color: '#f2e6cf', style: 'deco', facing: 'N', zone: 'downtown', roof: 'tower', sign: { text: 'BAY CINEMA', color: '#ff6b6b', sub: 'NOW SHOWING: NEON TIDE II' } },
  { id: 'tropicmart', name: 'Tropic Mart', x: 7, z: 62, w: 26, d: 20, floors: 1, color: '#c9ead4', style: 'shop', facing: 'N', zone: 'downtown', sign: { text: 'TROPIC MART', color: '#7dff9a' } },
  { id: 'seagrass', name: 'Seagrass Apartments', x: -10, z: 90, w: 48, d: 16, floors: 3, color: '#e7d3f5', style: 'plain', facing: 'S', zone: 'downtown', sign: { text: 'SEAGRASS APTS', color: '#ffffff' } },
  // ---- east downtown
  { id: 'records', name: 'Del Mar Records', x: 53, z: -52, w: 26, d: 20, floors: 2, color: '#ffd6a5', style: 'shop', facing: 'S', zone: 'downtown', sign: { text: 'DEL MAR RECORDS', color: '#ff8c42', sub: 'CDs · TAPES · VINYL' } },
  { id: 'lotus', name: 'Golden Lotus', x: 87, z: -52, w: 26, d: 20, floors: 2, color: '#f2c9c9', style: 'shop', facing: 'S', zone: 'downtown', sign: { text: 'GOLDEN LOTUS', color: '#ff4d4d', sub: 'TAKE OUT · DELIVERY' } },
  { id: 'palmetto', name: 'Palmetto Apartments', x: 70, z: -80, w: 50, d: 18, floors: 3, color: '#fff1c1', style: 'plain', facing: 'N', zone: 'downtown', sign: { text: 'PALMETTO APTS', color: '#ffffff' } },
  { id: 'police', name: 'Sol Palma Police Dept.', x: 70, z: -6, w: 50, d: 26, floors: 2, floorHeight: 3.6, color: '#e6ecf2', style: 'deco', facing: 'N', zone: 'downtown', roof: 'stepped', trim: '#2b5fb3', sign: { text: 'SOL PALMA POLICE', color: '#4d9fff', sub: 'DISTRICT 3' } },
  { id: 'diner', name: 'Flamingo Diner', x: 70, z: 22, w: 30, d: 16, floors: 1, floorHeight: 4, color: '#ffb4d1', style: 'shop', facing: 'S', zone: 'downtown', sign: { text: 'FLAMINGO DINER', color: '#ff4fa3', sub: 'BREAKFAST ALL DAY' } },
  { id: 'garage', name: 'Park & Go Garage', x: 53, z: 66, w: 26, d: 30, floors: 2, floorHeight: 3.2, color: '#c4c4c4', style: 'industrial', facing: 'N', zone: 'downtown', sign: { text: 'PARK & GO', color: '#ffee58' } },
  { id: 'azure', name: 'Azure Palms Hotel', x: 87, z: 66, w: 26, d: 30, floors: 4, color: '#bfe3ff', style: 'deco', facing: 'N', zone: 'downtown', roof: 'tower', sign: { text: 'AZURE PALMS', color: '#7fdcff', sub: 'HOTEL · POOL · VACANCY' } },
  // ---- beach strip
  { id: 'motel', name: 'Ocean View Motel', x: 135, z: -65, w: 30, d: 44, floors: 2, color: '#ffc2d4', style: 'motel', facing: 'E', zone: 'beach', trim: '#5fe0d0', sign: { text: 'OCEAN VIEW MOTEL', color: '#ff6fb0', sub: 'VACANCY · COLOR TV · A/C' }, interior: 'motel' },
  { id: 'club', name: 'Club Mirage', x: 135, z: 5, w: 30, d: 40, floors: 2, floorHeight: 4.5, color: '#8f6bd6', style: 'deco', facing: 'E', zone: 'beach', roof: 'stepped', trim: '#ff4fd8', sign: { text: 'CLUB MIRAGE', color: '#ff4fd8', sub: 'TONIGHT: DJ TIDAL' }, interior: 'club' },
  { id: 'icecream', name: 'Sandbar Ice Cream', x: 135, z: 60, w: 30, d: 18, floors: 1, color: '#fff3b0', style: 'shop', facing: 'E', zone: 'beach', sign: { text: 'SANDBAR ICE CREAM', color: '#ff7eb6', sub: '32 FLAVORS' } },
  { id: 'arcade', name: 'Neptune Arcade', x: 135, z: 88, w: 30, d: 20, floors: 1, floorHeight: 4.5, color: '#9fe0ff', style: 'deco', facing: 'E', zone: 'beach', sign: { text: 'NEPTUNE ARCADE', color: '#3dffb8', sub: 'TOKENS · PRIZES' } },
  // ---- north edge
  { id: 'bank', name: 'Sun Coast Bank', x: -10, z: -126, w: 40, d: 24, floors: 3, color: '#f6efe3', style: 'deco', facing: 'S', zone: 'downtown', roof: 'stepped', sign: { text: 'SUN COAST BANK', color: '#ffffff' } },
  { id: 'busdepot', name: 'Bus Depot', x: 70, z: -126, w: 40, d: 20, floors: 1, floorHeight: 5, color: '#d8d2c6', style: 'industrial', facing: 'S', zone: 'downtown', sign: { text: 'SOL PALMA TRANSIT', color: '#ffb347' } },
  // ---- south edge
  { id: 'canalbar', name: 'Canal Side Bar', x: 7, z: 132, w: 30, d: 16, floors: 1, color: '#d1f0e8', style: 'shop', facing: 'N', zone: 'downtown', sign: { text: 'CANAL SIDE', color: '#4ff2e8', sub: 'LIVE MUSIC FRI · SAT' } },
  // ---- industrial docks (far west)
  { id: 'warehouse', name: 'Warehouse 7', x: -175, z: -60, w: 50, d: 44, floors: 1, floorHeight: 7, color: '#b8b0a0', style: 'industrial', facing: 'E', zone: 'docks', sign: { text: 'WAREHOUSE 7', color: '#ffd166', sub: 'FOR SALE - INQUIRE' }, interior: 'warehouse' },
  { id: 'port', name: 'Port Authority', x: -175, z: 80, w: 40, d: 20, floors: 1, floorHeight: 4.5, color: '#c7bfae', style: 'industrial', facing: 'E', zone: 'docks', sign: { text: 'PORT AUTHORITY', color: '#ffffff' } },
];

export interface Landmark {
  id: string;
  name: string;
  x: number;
  z: number;
  zone: Zone;
}

/** Customer meeting spots referenced by orders. */
export const LANDMARKS: Landmark[] = [
  { id: 'motel_front', name: 'Ocean View Motel', x: 156, z: -65, zone: 'beach' },
  { id: 'club_back', name: 'Behind Club Mirage', x: 122, z: 5, zone: 'beach' },
  { id: 'pier', name: 'Beach Pier', x: 208, z: 5, zone: 'beach' },
  { id: 'icecream', name: 'Sandbar Ice Cream', x: 156, z: 60, zone: 'beach' },
  { id: 'arcade', name: 'Neptune Arcade', x: 156, z: 88, zone: 'beach' },
  { id: 'records', name: 'Del Mar Records', x: 53, z: -36, zone: 'downtown' },
  { id: 'diner', name: 'Flamingo Diner', x: 70, z: 35, zone: 'downtown' },
  { id: 'cinema', name: 'Bay Cinema', x: -27, z: 46, zone: 'downtown' },
  { id: 'garage', name: 'Park & Go Garage', x: 53, z: 46, zone: 'downtown' },
  { id: 'coralarms', name: 'Coral Arms', x: -10, z: -95, zone: 'downtown' },
  { id: 'azure', name: 'Azure Palms Hotel', x: 87, z: 46, zone: 'downtown' },
  { id: 'busdepot', name: 'Bus Depot', x: 70, z: -111, zone: 'downtown' },
  { id: 'fishmarket', name: 'Marlin Fish Market', x: -90, z: -24, zone: 'docks' },
  { id: 'boatyard', name: 'Boat Repair Yard', x: -90, z: 46, zone: 'docks' },
  { id: 'containers', name: 'Container Yard', x: -158, z: 10, zone: 'docks' },
  { id: 'canal', name: 'Canal Boardwalk', x: -27, z: 142, zone: 'docks' },
];

export const PAYPHONES: { x: number; z: number; rot: number }[] = [
  { x: -43, z: -36, rot: 0 },
  { x: 118, z: -36, rot: 0 },
  { x: 36, z: 47, rot: Math.PI / 2 },
  { x: -123, z: 47, rot: Math.PI / 2 },
  { x: 154, z: 47, rot: -Math.PI / 2 },
  { x: -43, z: 117, rot: 0 },
  { x: 168, z: -95, rot: -Math.PI / 2 },
  { x: -157, z: -35, rot: Math.PI },
];

export const SPAWN = { x: -22, y: 0, z: 16, yaw: -0.51 };
export const SAFEHOUSE_DOOR = { x: -13, z: 14 };
export const SUPPLIER_SPOT = { x: -158, z: 22, name: 'Rico' };
export const RUNNER_CONTACT_SPOT = { x: 154, z: -84, name: 'Dizzy' };
export const WORKER_CONTACT_SPOT = { x: -152, z: 86, name: 'Marisol' };
export const WAREHOUSE_SIGN = { x: -149, z: -66 };
