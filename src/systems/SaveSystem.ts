import { GameState, INVENTORY_SLOTS, SAVE_VERSION } from '../game/GameState';
import { STARTING_CASH } from '../data/items';
import { SPAWN } from '../data/city';
import { initCustomers } from './CustomerSystem';

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
    vehicle: null,
    player: { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z, yaw: SPAWN.yaw },
    stats: { sales: 0, earned: 0, arrests: 0, declined: 0, produced: 0, playSeconds: 0, earnedAtDayStart: 0, salesAtDayStart: 0, lastDay: 1 },
    flags: {},
    nextOrderId: 1,
    lastOrderMinute: 0,
    trend: null,
    event: null,
    crewName: '',
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
    customers: { ...fresh.customers, ...(r.customers ?? {}) },
    orders: Array.isArray(r.orders) ? r.orders : [],
    recipes: r.recipes && typeof r.recipes === 'object' ? r.recipes : {},
    upgrades: Array.isArray(r.upgrades) ? r.upgrades : [],
    properties: Array.isArray(r.properties) && r.properties.includes('safehouse') ? r.properties : fresh.properties,
    placedStations: Array.isArray(r.placedStations) ? r.placedStations : [],
    stats: { ...fresh.stats, ...(r.stats ?? {}) },
    flags: r.flags && typeof r.flags === 'object' ? r.flags : {},
    player: r.player && typeof r.player.x === 'number' ? r.player : fresh.player,
  };
  while (state.inventory.length < INVENTORY_SLOTS) state.inventory.push(null);
  // nested objects: repair anything that would crash a system tick
  const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  state.clockMinutes = num(r.clockMinutes, fresh.clockMinutes);
  state.orders = state.orders.filter((o) => o && typeof o.id === 'number' && typeof o.customerId === 'string' && typeof o.status === 'string');
  const maxOrderId = state.orders.reduce((m, o) => Math.max(m, o.id), 0);
  state.nextOrderId = Math.max(num(r.nextOrderId, 1), maxOrderId + 1);
  state.lastOrderMinute = num(r.lastOrderMinute, 0);
  const rr = r.runner;
  state.runner = rr && typeof rr === 'object' && rr.hired ? { hired: true, name: typeof rr.name === 'string' ? rr.name : 'Dizzy', activeOrderId: typeof rr.activeOrderId === 'number' ? rr.activeOrderId : null, deliveries: num(rr.deliveries, 0), earned: num(rr.earned, 0), queue: Array.isArray(rr.queue) ? rr.queue.filter((x) => typeof x === 'number') : [] } : null;
  const rw = r.worker;
  state.worker = rw && typeof rw === 'object' && rw.hired ? { hired: true, name: typeof rw.name === 'string' ? rw.name : 'Marisol', recipeKey: typeof rw.recipeKey === 'string' ? rw.recipeKey : null, property: typeof rw.property === 'string' ? rw.property : 'warehouse', progress: num(rw.progress, 0), produced: num(rw.produced, 0) } : null;
  const rd = r.dealer;
  state.dealer = rd && typeof rd === 'object' && rd.hired ? { hired: true, name: typeof rd.name === 'string' ? rd.name : 'Vince', stock: Array.isArray(rd.stock) ? rd.stock.filter((x) => x && typeof x.id === 'string' && typeof x.qty === 'number' && x.qty > 0) : [], cash: num(rd.cash, 0), customers: Array.isArray(rd.customers) ? rd.customers.filter((x) => typeof x === 'string') : [], lastTickMinute: num(rd.lastTickMinute, state.clockMinutes), sales: num(rd.sales, 0), earnedTotal: num(rd.earnedTotal, 0), starvedRounds: num(rd.starvedRounds, 0) } : null;
  const rv = r.vehicle;
  state.vehicle = rv && typeof rv === 'object' && rv.owned ? { owned: true, x: num(rv.x, -70), z: num(rv.z, -32), yaw: num(rv.yaw, 0) } : null;
  state.crewName = typeof r.crewName === 'string' ? r.crewName.slice(0, 24) : '';
  state.trend = r.trend && typeof r.trend === 'object' && typeof r.trend.effect === 'string' && typeof r.trend.day === 'number' ? r.trend : null;
  state.event = r.event && typeof r.event === 'object' && typeof r.event.id === 'string' && typeof r.event.day === 'number' ? r.event : null;
  for (const key of Object.keys(state.storage)) if (!Array.isArray(state.storage[key])) state.storage[key] = [];
  for (const prop of state.properties) if (!state.storage[prop]) state.storage[prop] = [];
  state.heat = Math.max(0, Math.min(100, Number(state.heat) || 0));
  state.suspicion = Math.max(0, Math.min(100, Number(state.suspicion) || 0));
  if (!Number.isFinite(state.cash)) state.cash = 0;
  // a runner mid-delivery when the game was saved keeps going after load
  if (state.runner && state.runner.activeOrderId !== null) {
    const o = state.orders.find((x) => x.id === state.runner!.activeOrderId);
    if (!o || o.status !== 'runner') state.runner.activeOrderId = null;
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
