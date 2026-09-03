import { Recipe } from '../data/products';

export interface ItemStack {
  id: string;
  qty: number;
}

export interface CustomerState {
  id: string;
  relationship: number;
  deals: number;
  unlocked: boolean;
  lastOrderMinute: number;
  /** Set when this customer was introduced through a friend and the player got notified. */
  introduced: boolean;
  /** Free samples handed to this customer while locked. */
  samples?: number;
}

export type OrderStatus = 'pending' | 'accepted' | 'runner' | 'completed' | 'declined' | 'expired' | 'failed';

export interface Order {
  id: number;
  customerId: string;
  /** Required base product. */
  base: import('../data/products').BaseId;
  /** Required effect tags (subset match). Empty = plain base is fine. */
  effects: import('../data/products').Effect[];
  /** If the customer asked for one of the player's named products, its recipe key. */
  recipeKey?: string;
  qty: number;
  /** Total offered price. */
  price: number;
  locationId: string;
  /** Game-minute when the window opens / closes. */
  windowStart: number;
  windowEnd: number;
  status: OrderStatus;
  createdMinute: number;
  /** Runner progress 0..1 when status === 'runner'. */
  runnerProgress?: number;
  runnerItemKey?: string;
  /** Player already made a counter-offer on this order. */
  haggled?: boolean;
}

export interface PlacedStation {
  id: string;
  kind: 'prep_table' | 'pack_table' | 'storage';
  x: number;
  z: number;
  rot: number;
}

export interface RunnerState {
  hired: boolean;
  name: string;
  /** Order id currently being delivered. */
  activeOrderId: number | null;
  /** Total delivered count. */
  deliveries: number;
  earned: number;
}

export interface WorkerState {
  hired: boolean;
  name: string;
  /** Recipe key to keep producing. */
  recipeKey: string | null;
  property: string;
  progress: number;
  produced: number;
}

export interface DealerState {
  hired: boolean;
  name: string;
  stock: ItemStack[];
  /** Cash held by the dealer, waiting to be collected. */
  cash: number;
  customers: string[];
  lastTickMinute: number;
  sales: number;
  earnedTotal: number;
}

export interface GameState {
  version: number;
  cash: number;
  heat: number;
  suspicion: number;
  clockMinutes: number;
  inventory: (ItemStack | null)[];
  storage: Record<string, ItemStack[]>;
  customers: Record<string, CustomerState>;
  orders: Order[];
  recipes: Record<string, Recipe & { customName?: string }>;
  upgrades: string[];
  properties: string[];
  placedStations: PlacedStation[];
  runner: RunnerState | null;
  worker: WorkerState | null;
  dealer: DealerState | null;
  vehicle: { owned: boolean; x: number; z: number; yaw: number } | null;
  player: { x: number; y: number; z: number; yaw: number };
  stats: { sales: number; earned: number; arrests: number; declined: number; produced: number; playSeconds: number; earnedAtDayStart: number; salesAtDayStart: number; lastDay: number };
  flags: Record<string, boolean>;
  nextOrderId: number;
  lastOrderMinute: number;
  /** Daily trend: products with this effect sell for a bonus. */
  trend: { effect: import('../data/products').Effect; day: number } | null;
  /** Daily world event (crackdown / shortage / club night). */
  event: import('../systems/EventSystem').WorldEvent | null;
}

export const INVENTORY_SLOTS = 8;
export const SAVE_VERSION = 1;
