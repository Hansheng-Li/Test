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
    player: { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z, yaw: SPAWN.yaw },
    stats: { sales: 0, earned: 0, arrests: 0, declined: 0, produced: 0, playSeconds: 0 },
    flags: {},
    nextOrderId: 1,
    lastOrderMinute: 0,
    trend: null,
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
