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
  /** Last recipe bought and how many times in a row (boredom drives requests for something new). */
  lastRecipe?: string;
  sameStreak?: number;
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
  /** Status the order had when it expired (a stood-up accepted order costs relationship; an ignored page does not). */
  expiredFrom?: OrderStatus;
  createdMinute: number;
  /** Runner progress 0..1 when status === 'runner'. */
  runnerProgress?: number;
  runnerItemKey?: string;
  /** Property the runner picked the goods up from. */
  runnerFrom?: string;
  /** Player already made a counter-offer on this order. */
  haggled?: boolean;
  /** Big-money rush order: double size, better pay, tight window. */
  vip?: boolean;
  /** Customer is bored of their usual and explicitly wants something different. */
  bored?: boolean;
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
  /** Orders waiting for the runner, in dispatch order. */
  queue?: number[];
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
  /** Consecutive sales rounds with empty stock. */
  starvedRounds?: number;
}

/** Marker written by Sol Palma Pawn: cash now, more cash later, collectors when late. */
export interface LoanState {
  principal: number;
  owed: number;
  takenDay: number;
  /** Due by the end of this calendar day. */
  dueDay: number;
  lateDays: number;
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
  loan: LoanState | null;
  vehicle: { owned: boolean; x: number; z: number; yaw: number; /** Body colour hex from CAR_PAINTS; unset = as sold. */ paint?: string } | null;
  /** Player-chosen name for the operation; shows on the warehouse sign and the ledger. */
  crewName: string;
  player: { x: number; y: number; z: number; yaw: number };
  stats: {
    /** Bus rides taken (flavour and a milestone). */
    busRides?: number;
    /** Street dice: throws and lifetime net. */
    diceRolls?: number;
    diceNet?: number;
    /** Pawn shop markers taken and paid off. */
    loansTaken?: number;
    loansRepaid?: number;
    /** Resprays bought at Rojas. */
    resprays?: number; sales: number; earned: number; arrests: number; declined: number; produced: number; playSeconds: number; earnedAtDayStart: number; salesAtDayStart: number; lastDay: number };
  flags: Record<string, boolean>;
  /** Per-save seed so daily trends and world events differ between playthroughs. */
  seed: number;
  nextOrderId: number;
  lastOrderMinute: number;
  /** Daily trend: products with this effect sell for a bonus. */
  trend: { effect: import('../data/products').Effect; day: number } | null;
  /** Daily world event (crackdown / shortage / club night). */
  event: import('../systems/EventSystem').WorldEvent | null;
}

export const INVENTORY_SLOTS = 8;
export const SAVE_VERSION = 3;
