export type ItemCategory = 'supply' | 'product' | 'packaged_product' | 'equipment' | 'misc';

export interface ItemDef {
  id: string;
  name: string;
  category: ItemCategory;
  /** Reference value (buy price at the usual vendor). */
  value: number;
  stack: number;
  desc: string;
}

/** Static item catalogue. Products are dynamic (see products.ts) and use ids `prod:<key>` / `pkg:<key>`. */
export const ITEMS: Record<string, ItemDef> = {
  pulp_sunset: { id: 'pulp_sunset', name: 'Sunset Pulp', category: 'supply', value: 9, stack: 20, desc: 'Orange base pulp. Prep it into SUNSET.' },
  wax_velvet: { id: 'wax_velvet', name: 'Velvet Wax', category: 'supply', value: 14, stack: 20, desc: 'Purple base wax. Prep it into VELVET.' },
  gel_neon: { id: 'gel_neon', name: 'Neon Gel', category: 'supply', value: 20, stack: 20, desc: 'Glowing green base gel. Prep it into NEON.' },
  mod_flux: { id: 'mod_flux', name: 'Flux Chips', category: 'supply', value: 6, stack: 20, desc: 'Modifier. Adds ENERGY. Sharpens CHILL into FOCUS.' },
  mod_velvet_drops: { id: 'mod_velvet_drops', name: 'Velvet Drops', category: 'supply', value: 8, stack: 20, desc: 'Modifier. Adds CHILL. Turns ENERGY into SOCIAL.' },
  mod_solar: { id: 'mod_solar', name: 'Solar Tabs', category: 'supply', value: 7, stack: 20, desc: 'Modifier. Adds CONFIDENT. Warms CHILL into SOCIAL.' },
  mod_static: { id: 'mod_static', name: 'Static Dust', category: 'supply', value: 9, stack: 20, desc: 'Modifier. Adds CHAOTIC. Melts CHILL into DREAMY.' },
  mod_sparks: { id: 'mod_sparks', name: 'Blue Sparks', category: 'supply', value: 10, stack: 20, desc: 'Modifier. Adds FOCUS. Tames CHAOTIC into FOCUS, DREAMY into GLOW.' },
  mod_glow: { id: 'mod_glow', name: 'Glow Powder', category: 'supply', value: 12, stack: 20, desc: 'Modifier. Adds GLOW. Softens ENERGY into DREAMY.' },
  baggies: { id: 'baggies', name: 'Zip Baggies', category: 'supply', value: 1, stack: 50, desc: 'One baggie per packaged unit.' },
  eq_mixer: { id: 'eq_mixer', name: 'Turbo Mixer', category: 'equipment', value: 220, stack: 1, desc: 'Prep table works twice as fast and yields +1 unit per batch.' },
  eq_sealer: { id: 'eq_sealer', name: 'Heat Sealer', category: 'equipment', value: 340, stack: 1, desc: 'Packaging table seals a whole batch in one go.' },
  eq_backpack: { id: 'eq_backpack', name: 'Courier Backpack', category: 'equipment', value: 180, stack: 1, desc: 'Doubles stack size for everything you carry.' },
  eq_brickphone: { id: 'eq_brickphone', name: 'Brick Phone', category: 'equipment', value: 450, stack: 1, desc: 'Orders arrive more often and you can call customers back from anywhere.' },
  eq_scanner: { id: 'eq_scanner', name: 'Police Scanner', category: 'equipment', value: 260, stack: 1, desc: 'Heat decays faster and police positions show on the map.' },
  prep_station_kit: { id: 'prep_station_kit', name: 'Prep Station Kit', category: 'equipment', value: 400, stack: 1, desc: 'Place a prep station in your warehouse.' },
  pack_station_kit: { id: 'pack_station_kit', name: 'Packaging Table Kit', category: 'equipment', value: 300, stack: 1, desc: 'Place a packaging table in your warehouse.' },
  shelf_kit: { id: 'shelf_kit', name: 'Storage Shelf Kit', category: 'equipment', value: 150, stack: 1, desc: 'Place an extra storage shelf in your warehouse.' },
};

export const BASE_SUPPLY_IDS = ['pulp_sunset', 'wax_velvet', 'gel_neon'] as const;
export const MODIFIER_IDS = ['mod_flux', 'mod_velvet_drops', 'mod_solar', 'mod_static', 'mod_sparks', 'mod_glow'] as const;

export interface ShopEntry {
  itemId: string;
  price: number;
  /** Requires this upgrade/flag to be visible. */
  requires?: string;
}

export const SHOPS: Record<string, { name: string; entries: ShopEntry[] }> = {
  store: {
    name: 'Quick Stop 24',
    entries: [
      { itemId: 'baggies', price: 1 },
      { itemId: 'mod_solar', price: 7 },
      { itemId: 'mod_sparks', price: 10 },
      { itemId: 'mod_glow', price: 12 },
    ],
  },
  supplier: {
    name: "Rico's Van",
    entries: [
      { itemId: 'pulp_sunset', price: 9 },
      { itemId: 'wax_velvet', price: 14 },
      { itemId: 'gel_neon', price: 20 },
      { itemId: 'mod_flux', price: 6 },
      { itemId: 'mod_velvet_drops', price: 8 },
      { itemId: 'mod_static', price: 9 },
    ],
  },
  pawn: {
    name: 'Sol Palma Pawn',
    entries: [
      { itemId: 'eq_backpack', price: 180 },
      { itemId: 'eq_mixer', price: 220 },
      { itemId: 'eq_scanner', price: 260 },
      { itemId: 'eq_sealer', price: 340 },
      { itemId: 'eq_brickphone', price: 450 },
      { itemId: 'shelf_kit', price: 150, requires: 'warehouse' },
      { itemId: 'pack_station_kit', price: 300, requires: 'warehouse' },
      { itemId: 'prep_station_kit', price: 400, requires: 'warehouse' },
    ],
  },
};

export const WAREHOUSE_PRICE = 1800;
export const RUNNER_HIRE_PRICE = 600;
export const RUNNER_CUT = 0.2;
export const WORKER_HIRE_PRICE = 900;
export const DEALER_HIRE_PRICE = 1000;
export const DEALER_MAX_CUSTOMERS = 5;
export const DEALER_MAX_STOCK = 60;
export const DEALER_PRICE_FACTOR = 0.65;
export const STARTING_CASH = 80;
export const VEHICLE_PRICE = 900;
export const MOTEL_PRICE = 1200;
