import { GameState, Order } from '../game/GameState';
import { RUNNER_CUT } from '../data/items';
import { LANDMARKS, PROPERTY_ANCHORS } from '../data/city';
import { packagedItemId, parseRecipeKey, computeRecipe } from '../data/products';
import { storageOf, storageRemove } from './InventorySystem';
import { orderMatchesItem } from './OrderSystem';
import { addCash } from './EconomySystem';
import { recordSuccessfulDeal } from './CustomerSystem';

export const RUNNER_SPEED = 4.5; // m/s along the trip estimate

export function hireRunner(state: GameState, price: number): boolean {
  if (state.runner?.hired) return false;
  if (state.cash < price) return false;
  state.cash -= price;
  state.runner = { hired: true, name: 'Dizzy', activeOrderId: null, deliveries: 0, earned: 0 };
  return true;
}

/** Packaged stacks in any owned property storage that could fulfil the order. */
export function storageItemForOrder(state: GameState, order: Order): { property: string; id: string; key: string } | null {
  for (const property of state.properties) {
    for (const s of storageOf(state, property)) {
      if (!s.id.startsWith('pkg:')) continue;
      const key = s.id.slice(4);
      if (orderMatchesItem(order, key) && s.qty >= order.qty) return { property, id: s.id, key };
    }
  }
  return null;
}

export interface AssignResult {
  ok: boolean;
  reason?: 'no_runner' | 'busy' | 'no_stock' | 'bad_order';
  property?: string;
  key?: string;
  queued?: boolean;
}

/**
 * Hand an accepted order to the runner. Product is taken from property storage
 * immediately (the runner picks it up), the order moves to status 'runner'.
 */
export function assignRunner(state: GameState, orderId: number): AssignResult {
  if (!state.runner?.hired) return { ok: false, reason: 'no_runner' };
  const o = state.orders.find((x) => x.id === orderId);
  if (!o || o.status !== 'accepted') return { ok: false, reason: 'bad_order' };
  const stock = storageItemForOrder(state, o);
  if (!stock) return { ok: false, reason: 'no_stock' };
  storageRemove(state, stock.property, stock.id, o.qty);
  o.status = 'runner';
  o.runnerProgress = 0;
  o.runnerItemKey = stock.key;
  if (state.runner.activeOrderId === null) state.runner.activeOrderId = o.id;
  else {
    state.runner.queue = state.runner.queue ?? [];
    state.runner.queue.push(o.id);
    return { ok: true, property: stock.property, key: stock.key, queued: true };
  }
  return { ok: true, property: stock.property, key: stock.key };
}

/** Pop the next queued order into the active slot. Returns it, or null. */
export function advanceRunnerQueue(state: GameState): Order | null {
  const r = state.runner;
  if (!r?.hired || r.activeOrderId !== null) return null;
  while (r.queue && r.queue.length) {
    const id = r.queue.shift()!;
    const o = state.orders.find((x) => x.id === id);
    if (o && o.status === 'runner') {
      r.activeOrderId = o.id;
      o.runnerProgress = 0;
      return o;
    }
  }
  return null;
}

/** Trip time in seconds from the property to the landmark and back-ish (one way counts). */
export function runnerTripSeconds(property: string, locationId: string): number {
  const from = PROPERTY_ANCHORS[property] ?? PROPERTY_ANCHORS.safehouse;
  const l = LANDMARKS.find((x) => x.id === locationId) ?? LANDMARKS[0];
  const d = Math.hypot(l.x - from.x, l.z - from.z);
  return Math.max(8, d / RUNNER_SPEED + 6);
}

export interface RunnerTickResult {
  completed?: { order: Order; earned: number; cut: number; unlocked: string[] };
  problem?: string;
}

/**
 * Advance the runner's delivery. Deterministic: progress is time-based, so it
 * keeps working while the player does other things. Takes a cut of the price.
 */
export function tickRunner(state: GameState, dtSeconds: number, rng: () => number = Math.random): RunnerTickResult {
  const r = state.runner;
  if (!r?.hired) return {};
  if (r.activeOrderId === null) {
    const next = advanceRunnerQueue(state);
    if (!next) return {};
  }
  const o = state.orders.find((x) => x.id === r.activeOrderId);
  if (!o || o.status !== 'runner') {
    r.activeOrderId = null;
    return {};
  }
  const property = state.properties.includes('warehouse') ? 'warehouse' : 'safehouse';
  const total = runnerTripSeconds(property, o.locationId);
  o.runnerProgress = (o.runnerProgress ?? 0) + dtSeconds / total;
  if (o.runnerProgress < 1) return {};
  // delivered
  const earned = o.price;
  const cut = Math.round(earned * RUNNER_CUT);
  addCash(state, earned - cut);
  r.earned += cut;
  r.deliveries += 1;
  r.activeOrderId = null;
  o.status = 'completed';
  state.stats.sales += 1;
  state.stats.earned += earned - cut;
  const parsed = parseRecipeKey(o.runnerItemKey ?? '');
  const matched = parsed ? computeRecipe(parsed.base, parsed.mods).effects.length > 1 : false;
  const unlocked = recordSuccessfulDeal(state, o.customerId, { onTime: true, matchedPreference: matched });
  // small chance of a comedic hiccup that costs a little heat
  if (rng() < 0.15) state.heat = Math.min(100, state.heat + 6);
  return { completed: { order: o, earned: earned - cut, cut, unlocked } };
}

export function runnerBusy(state: GameState): boolean {
  return !!state.runner?.hired && state.runner.activeOrderId !== null;
}

export function packagedIdFor(key: string): string {
  return packagedItemId(key);
}
