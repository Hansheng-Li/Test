import { GameState, INVENTORY_SLOTS, SAVE_VERSION } from '../game/GameState';
import { STARTING_CASH } from '../data/items';
import { SPAWN } from '../data/city';
import { initCustomers } from './CustomerSystem';
import { CUSTOMER_MAP } from '../data/customers';
import { ITEMS } from '../data/items';
import { BASES, ALL_EFFECTS } from '../data/products';

const ORDER_STATUSES = new Set(['pending', 'accepted', 'runner', 'completed', 'declined', 'expired', 'failed']);
const STATION_KINDS = new Set(['prep_table', 'pack_table', 'storage']);
const PROPERTY_IDS = new Set(['safehouse', 'warehouse', 'motel', 'laundromat']);
const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const validStack = (x: unknown): x is { id: string; qty: number } => !!x && typeof x === 'object' && typeof (x as { id: unknown }).id === 'string' && isFiniteNum((x as { qty: unknown }).qty) && (x as { qty: number }).qty > 0;

export const SAVE_KEY = 'sunset_syndicate_save_v1';

export function createNewState(): GameState {
  const state: GameState = {
    version: SAVE_VERSION,
    cash: STARTING_CASH,
    heat: 0,
    suspicion: 0,
    clockMinutes: 24 * 60 + 15 * 60 + 30, // day 1, 15:30
    inventory: Array.from({ length: INVENTORY_SLOTS }, () => null),
    storage: { safehouse: [] },
    customers: {},
    orders: [],
    recipes: {},
    upgrades: [],
    properties: ['safehouse'],
    placedStations: [],
    runner: null,
    worker: null,
    dealer: null,
    loan: null,
    vehicle: null,
    player: { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z, yaw: SPAWN.yaw },
    stats: { sales: 0, earned: 0, arrests: 0, declined: 0, produced: 0, playSeconds: 0, earnedAtDayStart: 0, salesAtDayStart: 0, lastDay: 1 },
    flags: {},
    nextOrderId: 1,
    lastOrderMinute: 0,
    trend: null,
    event: null,
    crewName: '',
    seed: Math.floor(Math.random() * 1e9),
  };
  initCustomers(state);
  return state;
}

export interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

/** Parse and validate a save; returns null if unusable. Missing fields are filled from a fresh state. */
export function deserialize(json: string): GameState | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<GameState>;
  if (typeof r.cash !== 'number' || !Array.isArray(r.inventory)) return null;
  const fresh = createNewState();
  const state: GameState = {
    ...fresh,
    ...r,
    version: SAVE_VERSION,
    inventory: r.inventory.slice(0, INVENTORY_SLOTS).map((s) => (s && typeof s.id === 'string' && typeof s.qty === 'number' && s.qty > 0 ? { id: s.id, qty: Math.floor(s.qty) } : null)),
    storage: r.storage && typeof r.storage === 'object' ? r.storage : fresh.storage,
    customers: { ...fresh.customers, ...Object.fromEntries(Object.entries(r.customers ?? {}).filter(([id, c]) => !!CUSTOMER_MAP[id] && !!c && typeof c === 'object')) },
    orders: Array.isArray(r.orders) ? r.orders : [],
    recipes: r.recipes && typeof r.recipes === 'object' ? r.recipes : {},
    upgrades: Array.isArray(r.upgrades) ? r.upgrades.filter((u) => typeof u === 'string' && !!ITEMS[u]) : [],
    properties: Array.isArray(r.properties) && r.properties.includes('safehouse') ? r.properties.filter((p) => PROPERTY_IDS.has(p)) : fresh.properties,
    placedStations: Array.isArray(r.placedStations) ? r.placedStations.filter((p) => !!p && typeof p === 'object' && typeof p.id === 'string' && STATION_KINDS.has(p.kind) && isFiniteNum(p.x) && isFiniteNum(p.z) && isFiniteNum(p.rot)) : [],
    stats: { ...fresh.stats, ...(r.stats ?? {}) },
    flags: r.flags && typeof r.flags === 'object' ? r.flags : {},
    // saves from before the back room was resized may hold a position inside a wall: respawn them at home
    player: r.player && typeof r.player.x === 'number' && typeof r.version === 'number' && r.version >= 2 ? r.player : fresh.player,
  };
  while (state.inventory.length < INVENTORY_SLOTS) state.inventory.push(null);
  // nested objects: repair anything that would crash a system tick
  const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  state.clockMinutes = num(r.clockMinutes, fresh.clockMinutes);
  const seenOrderIds = new Set<number>();
  state.orders = state.orders.filter((o) => {
    if (!o || !isFiniteNum(o.id) || seenOrderIds.has(o.id) || !CUSTOMER_MAP[o.customerId ?? ''] || !ORDER_STATUSES.has(o.status)) return false;
    seenOrderIds.add(o.id);
    // repair rather than drop: a half-written order is still the customer's order
    if (!BASES[o.base as keyof typeof BASES]) o.base = (Object.keys(BASES) as (keyof typeof BASES)[])[0];
    if (!isFiniteNum(o.qty) || o.qty <= 0) o.qty = 1;
    if (!isFiniteNum(o.price) || o.price < 0) o.price = 0;
    if (typeof o.locationId !== 'string') o.locationId = 'street';
    o.effects = Array.isArray(o.effects) ? o.effects.filter((e) => ALL_EFFECTS.includes(e)) : [];
    o.windowStart = num(o.windowStart, state.clockMinutes);
    o.windowEnd = num(o.windowEnd, o.windowStart + 90);
    o.createdMinute = num(o.createdMinute, o.windowStart);
    return true;
  });
  // recipes must look like recipes (a base and a modifier list) or systems will index into undefined
  for (const [key, rec] of Object.entries(state.recipes)) {
    const rr = rec as { base?: unknown; mods?: unknown } | null;
    if (!rr || typeof rr !== 'object' || !BASES[rr.base as keyof typeof BASES] || !Array.isArray(rr.mods)) delete state.recipes[key];
  }
  // stacks must name a real item or a packaged product whose recipe survived
  const knownItem = (id: string): boolean => !!ITEMS[id] || (id.startsWith('pkg:') && !!state.recipes[id.slice(4)]) || (id.startsWith('prod:') && !!state.recipes[id.slice(5)]);
  state.inventory = state.inventory.map((st) => (st && knownItem(st.id) ? st : null));
  for (const key of Object.keys(state.storage)) if (Array.isArray(state.storage[key])) state.storage[key] = state.storage[key].filter((st) => validStack(st) && knownItem(st.id));
  for (const c of Object.values(state.customers)) {
    c.relationship = num(c.relationship, 0);
    c.deals = num(c.deals, 0);
    c.lastOrderMinute = num(c.lastOrderMinute, 0);
    c.unlocked = !!c.unlocked;
  }
  const maxOrderId = state.orders.reduce((m, o) => Math.max(m, o.id), 0);
  state.nextOrderId = Math.max(num(r.nextOrderId, 1), maxOrderId + 1);
  state.lastOrderMinute = num(r.lastOrderMinute, 0);
  const rr = r.runner;
  state.runner = rr && typeof rr === 'object' && rr.hired ? { hired: true, name: typeof rr.name === 'string' ? rr.name : 'Dizzy', activeOrderId: typeof rr.activeOrderId === 'number' ? rr.activeOrderId : null, deliveries: num(rr.deliveries, 0), earned: num(rr.earned, 0), queue: Array.isArray(rr.queue) ? rr.queue.filter((x) => typeof x === 'number') : [] } : null;
  const rw = r.worker;
  state.worker = rw && typeof rw === 'object' && rw.hired ? { hired: true, name: typeof rw.name === 'string' ? rw.name : 'Marisol', recipeKey: typeof rw.recipeKey === 'string' ? rw.recipeKey : null, property: typeof rw.property === 'string' ? rw.property : 'warehouse', progress: num(rw.progress, 0), produced: num(rw.produced, 0) } : null;
  const rd = r.dealer;
  state.dealer = rd && typeof rd === 'object' && rd.hired ? { hired: true, name: typeof rd.name === 'string' ? rd.name : 'Vince', stock: Array.isArray(rd.stock) ? rd.stock.filter(validStack) : [], cash: num(rd.cash, 0), customers: Array.isArray(rd.customers) ? rd.customers.filter((x) => typeof x === 'string' && !!CUSTOMER_MAP[x]) : [], lastTickMinute: num(rd.lastTickMinute, state.clockMinutes), sales: num(rd.sales, 0), earnedTotal: num(rd.earnedTotal, 0), starvedRounds: num(rd.starvedRounds, 0) } : null;
  if (state.dealer) state.dealer.stock = state.dealer.stock.filter((st) => st.id.startsWith('pkg:') && knownItem(st.id));
  if (state.worker && !state.properties.includes(state.worker.property)) state.worker.property = 'warehouse';
  if (state.worker && state.worker.recipeKey && !state.recipes[state.worker.recipeKey]) state.worker.recipeKey = null;
  const rl = r.loan;
  state.loan = rl && typeof rl === 'object' && isFiniteNum(rl.principal) && isFiniteNum(rl.owed) && rl.owed > 0 && isFiniteNum(rl.dueDay)
    ? { principal: Math.max(1, Math.floor(rl.principal)), owed: Math.floor(rl.owed), takenDay: num(rl.takenDay, rl.dueDay - 3), dueDay: Math.floor(rl.dueDay), lateDays: Math.max(0, Math.floor(num(rl.lateDays, 0))) }
    : null;
  const rv = r.vehicle;
  state.vehicle = rv && typeof rv === 'object' && rv.owned ? { owned: true, x: num(rv.x, -70), z: num(rv.z, -32), yaw: num(rv.yaw, 0) } : null;
  const cleanName = (v: unknown): string => (typeof v === 'string' ? v.replace(/[<>&"'`]/g, '').slice(0, 24) : '');
  state.crewName = cleanName(r.crewName);
  for (const rec of Object.values(state.recipes)) if (rec.customName !== undefined) rec.customName = cleanName(rec.customName) || undefined;
  state.seed = Math.floor(num(r.seed, 0));
  state.trend = r.trend && typeof r.trend === 'object' && ALL_EFFECTS.includes(r.trend.effect) && isFiniteNum(r.trend.day) ? r.trend : null;
  state.event = r.event && typeof r.event === 'object' && typeof r.event.id === 'string' && isFiniteNum(r.event.day) ? r.event : null;
  if (state.event?.id === 'rival' && !CUSTOMER_MAP[state.event.param ?? '']) state.event = { id: 'none', day: state.event.day };
  // v2 saves keyed events by calendar day; v3 keys them by half-day slot
  if (state.event && (typeof r.version !== 'number' || r.version < 3)) {
    const day = Math.floor(state.clockMinutes / (24 * 60));
    const hour = (state.clockMinutes % (24 * 60)) / 60;
    state.event.day = hour >= 20 ? day * 2 + 1 : hour < 6 ? (day - 1) * 2 + 1 : day * 2;
  }
  for (const key of Object.keys(state.storage)) state.storage[key] = Array.isArray(state.storage[key]) ? state.storage[key].filter(validStack) : [];
  state.clockMinutes = Math.max(0, state.clockMinutes);
  for (const k of Object.keys(state.stats) as (keyof typeof state.stats)[]) state.stats[k] = num(state.stats[k], fresh.stats[k] ?? 0);
  for (const prop of state.properties) if (!state.storage[prop]) state.storage[prop] = [];
  state.heat = Math.max(0, Math.min(100, Number(state.heat) || 0));
  state.suspicion = Math.max(0, Math.min(100, Number(state.suspicion) || 0));
  if (!Number.isFinite(state.cash)) state.cash = 0;
  // a runner mid-delivery when the game was saved keeps going after load
  if (state.runner && state.runner.activeOrderId !== null) {
    const o = state.orders.find((x) => x.id === state.runner!.activeOrderId);
    if (!o || o.status !== 'runner') state.runner.activeOrderId = null;
  }
  if (state.runner) {
    // queued orders are already in status 'runner'; anything in that status that is neither active nor queued is re-queued
    const r2 = state.runner;
    r2.queue = (r2.queue ?? []).filter((id) => id !== r2.activeOrderId && state.orders.some((o) => o.id === id && o.status === 'runner'));
    for (const o of state.orders) if (o.status === 'runner' && o.id !== r2.activeOrderId && !r2.queue.includes(o.id)) r2.queue.push(o.id);
  }
  initCustomers(state);
  return state;
}

export function saveToStorage(state: GameState, storage: Storage): boolean {
  try {
    storage.setItem(SAVE_KEY, serialize(state));
    return true;
  } catch {
    return false;
  }
}

export function loadFromStorage(storage: Storage): GameState | null {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return null;
    return deserialize(raw);
  } catch {
    return null;
  }
}

export function hasSave(storage: Storage): boolean {
  try {
    return !!storage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}

export function clearSave(storage: Storage): void {
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}
