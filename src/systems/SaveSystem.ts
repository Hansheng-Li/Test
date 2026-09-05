import { GameState, INVENTORY_SLOTS, SAVE_VERSION } from '../game/GameState';
import { STARTING_CASH } from '../data/items';
import { SPAWN, STARTER_CAR_SPOT } from '../data/city';
import { initCustomers } from './CustomerSystem';
import { CUSTOMER_MAP } from '../data/customers';
import { ITEMS } from '../data/items';
import { BASES, ALL_EFFECTS } from '../data/products';
import { LOAN_TIERS, LOAN_CAP_MULT } from './LoanSystem';

const ORDER_STATUSES = new Set(['pending', 'accepted', 'runner', 'completed', 'declined', 'expired', 'failed']);
const STATION_KINDS = new Set(['prep_table', 'pack_table', 'storage']);
const PROPERTY_IDS = new Set(['safehouse', 'warehouse', 'motel', 'laundromat']);
const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const validStack = (x: unknown): x is { id: string; qty: number } => !!x && typeof x === 'object' && typeof (x as { id: unknown }).id === 'string' && isFiniteNum((x as { qty: unknown }).qty) && (x as { qty: number }).qty > 0;

export const SAVE_KEY = 'sunset_syndicate_save_v1';
/** Stolen cars you can keep at once; the oldest gets towed when a new one is taken. */
export const MAX_STOLEN_CARS = 4;

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
    handler: null,
    vehicle: null,
    starterCar: { x: STARTER_CAR_SPOT.x, z: STARTER_CAR_SPOT.z, yaw: STARTER_CAR_SPOT.yaw },
    stolenCars: [],
    tracked: null,
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
  state.dealer = rd && typeof rd === 'object' && rd.hired ? { hired: true, name: typeof rd.name === 'string' ? rd.name : 'Vince', stock: Array.isArray(rd.stock) ? rd.stock.filter(validStack) : [], cash: num(rd.cash, 0), customers: Array.isArray(rd.customers) ? rd.customers.filter((x) => typeof x === 'string' && !!CUSTOMER_MAP[x]) : [], lastTickMinute: Math.min(num(rd.lastTickMinute, state.clockMinutes), state.clockMinutes), sales: num(rd.sales, 0), earnedTotal: num(rd.earnedTotal, 0), starvedRounds: num(rd.starvedRounds, 0) } : null;
  if (state.dealer) state.dealer.stock = state.dealer.stock.filter((st) => st.id.startsWith('pkg:') && knownItem(st.id));
  if (state.worker && !state.properties.includes(state.worker.property)) state.worker.property = 'warehouse';
  if (state.worker && state.worker.recipeKey && !state.recipes[state.worker.recipeKey]) state.worker.recipeKey = null;
  const rh = r.handler;
  state.handler = rh && typeof rh === 'object' && rh.hired ? { hired: true, name: typeof rh.name === 'string' ? rh.name : 'Teddy', lastTickMinute: Math.min(num(rh.lastTickMinute, state.clockMinutes), state.clockMinutes), trips: num(rh.trips, 0), moved: num(rh.moved, 0) } : null;
  const rl = r.loan;
  // a marker can never be due later than three days from now, and never owe a fraction
  const today = Math.floor(state.clockMinutes / (24 * 60));
  const dueDay = rl && typeof rl === 'object' && isFiniteNum(rl.dueDay) ? Math.min(Math.floor(rl.dueDay), today + 3) : 0;
  state.loan = rl && typeof rl === 'object' && isFiniteNum(rl.principal) && isFiniteNum(rl.owed) && Math.ceil(rl.owed) >= 1 && isFiniteNum(rl.dueDay)
    ? (() => {
        // no marker is bigger than the pawn shop writes, and no balance beyond the late cap
        const principal = Math.min(Math.max(1, Math.floor(rl.principal)), Math.max(...LOAN_TIERS));
        return { principal, owed: Math.min(Math.ceil(rl.owed), principal * LOAN_CAP_MULT), takenDay: num(rl.takenDay, dueDay - 3), dueDay, lateDays: Math.max(0, Math.floor(num(rl.lateDays, 0))) };
      })()
    : null;
  const rb = r.starterCar as { x?: unknown; z?: unknown; yaw?: unknown } | undefined;
  state.starterCar = rb && typeof rb === 'object' ? { x: num(rb.x, STARTER_CAR_SPOT.x), z: num(rb.z, STARTER_CAR_SPOT.z), yaw: num(rb.yaw, STARTER_CAR_SPOT.yaw) } : { x: STARTER_CAR_SPOT.x, z: STARTER_CAR_SPOT.z, yaw: STARTER_CAR_SPOT.yaw };
  const tr = r.tracked as { kind?: unknown; id?: unknown; orderId?: unknown; x?: unknown; z?: unknown; label?: unknown } | null | undefined;
  state.tracked = tr && typeof tr === 'object' && (tr.kind === 'step' || tr.kind === 'order' || tr.kind === 'goal' || tr.kind === 'place')
    ? {
        kind: tr.kind,
        ...(typeof tr.id === 'string' ? { id: tr.id.slice(0, 40) } : {}),
        ...(Number.isInteger(tr.orderId) ? { orderId: tr.orderId as number } : {}),
        ...(isFiniteNum(tr.x) && isFiniteNum(tr.z) ? { x: tr.x, z: tr.z } : {}),
        ...(typeof tr.label === 'string' ? { label: tr.label.slice(0, 60) } : {}),
      }
    : null;
  if (state.tracked?.kind === 'place' && state.tracked.x === undefined) state.tracked = null;
  if (state.tracked?.kind === 'order' && state.tracked.orderId === undefined) state.tracked = null;
  if (state.tracked?.kind === 'goal' && !state.tracked.id) state.tracked = null;
  const seenSpots = new Set<number>();
  state.stolenCars = (Array.isArray(r.stolenCars) ? (r.stolenCars as unknown[]) : [])
    .filter((c): c is { spot: number; model: string; paint?: unknown; x: unknown; z: unknown; yaw: unknown } => !!c && typeof c === 'object' && Number.isInteger((c as { spot: unknown }).spot) && (c as { spot: number }).spot >= 0 && typeof (c as { model: unknown }).model === 'string')
    .filter((c) => (seenSpots.has(c.spot) ? false : (seenSpots.add(c.spot), true)))
    .slice(-MAX_STOLEN_CARS)
    .map((c) => ({ spot: c.spot, model: c.model, ...(typeof c.paint === 'string' && /^#[0-9a-f]{6}$/i.test(c.paint) ? { paint: c.paint } : {}), x: num(c.x, 0), z: num(c.z, 0), yaw: num(c.yaw, 0) }));
  const rv = r.vehicle;
  state.vehicle = rv && typeof rv === 'object' && rv.owned ? { owned: true, x: num(rv.x, -70), z: num(rv.z, -32), yaw: num(rv.yaw, 0), ...(typeof rv.paint === 'string' && /^#[0-9a-f]{6}$/i.test(rv.paint) ? { paint: rv.paint } : {}) } : null;
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

export const SLOT_COUNT = 3;
export const ACTIVE_SLOT_KEY = 'sunset_syndicate_active_slot';
/** localStorage key of one save slot (1-based). */
export const slotKey = (slot: number): string => `sunset_syndicate_save_slot${slot}`;

export interface SlotInfo {
  slot: number;
  state: GameState | null;
  /** Wall-clock ms of the last write, null when the slot is empty. */
  savedAt: number | null;
}

const validSlot = (slot: number): boolean => Number.isInteger(slot) && slot >= 1 && slot <= SLOT_COUNT;

/** Moves the pre-slot single save (v0.3 and earlier) into slot 1 so old players keep their run. */
export function migrateLegacySave(storage: Storage, now = Date.now()): boolean {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return false;
    if (!storage.getItem(slotKey(1)) && deserialize(raw)) {
      storage.setItem(slotKey(1), JSON.stringify({ savedAt: now, state: JSON.parse(raw) }));
      if (!storage.getItem(ACTIVE_SLOT_KEY)) storage.setItem(ACTIVE_SLOT_KEY, '1');
    }
    storage.removeItem(SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function saveToSlot(state: GameState, storage: Storage, slot: number, now = Date.now()): boolean {
  if (!validSlot(slot)) return false;
  try {
    storage.setItem(slotKey(slot), JSON.stringify({ savedAt: now, state }));
    storage.setItem(ACTIVE_SLOT_KEY, String(slot));
    return true;
  } catch {
    return false;
  }
}

function readSlot(storage: Storage, slot: number): SlotInfo {
  const empty: SlotInfo = { slot, state: null, savedAt: null };
  if (!validSlot(slot)) return empty;
  try {
    const raw = storage.getItem(slotKey(slot));
    if (!raw) return empty;
    const wrapped = JSON.parse(raw) as { savedAt?: unknown; state?: unknown };
    const state = wrapped && typeof wrapped === 'object' && wrapped.state ? deserialize(JSON.stringify(wrapped.state)) : null;
    if (!state) return empty;
    return { slot, state, savedAt: isFiniteNum(wrapped.savedAt) ? wrapped.savedAt : 0 };
  } catch {
    return empty;
  }
}

export function loadFromSlot(storage: Storage, slot: number): GameState | null {
  return readSlot(storage, slot).state;
}

export function listSlots(storage: Storage): SlotInfo[] {
  return Array.from({ length: SLOT_COUNT }, (_, i) => readSlot(storage, i + 1));
}

export function clearSlot(storage: Storage, slot: number): void {
  if (!validSlot(slot)) return;
  try {
    storage.removeItem(slotKey(slot));
    if (storage.getItem(ACTIVE_SLOT_KEY) === String(slot)) storage.removeItem(ACTIVE_SLOT_KEY);
  } catch {
    /* ignore */
  }
}

export function hasAnySave(storage: Storage): boolean {
  return listSlots(storage).some((s) => s.state !== null);
}

/** Slot of the most recent write (falls back to the stored active slot), null when nothing is saved. */
export function latestSlot(storage: Storage): number | null {
  const filled = listSlots(storage).filter((s) => s.state !== null);
  if (filled.length === 0) return null;
  let active: number | null = null;
  try {
    const raw = storage.getItem(ACTIVE_SLOT_KEY);
    active = raw ? parseInt(raw, 10) : null;
  } catch {
    active = null;
  }
  const best = filled.reduce((a, b) => ((b.savedAt ?? 0) > (a.savedAt ?? 0) ? b : a));
  if (active !== null && filled.some((s) => s.slot === active && (s.savedAt ?? 0) >= (best.savedAt ?? 0))) return active;
  return best.slot;
}

export function firstEmptySlot(storage: Storage): number | null {
  return listSlots(storage).find((s) => s.state === null)?.slot ?? null;
}
