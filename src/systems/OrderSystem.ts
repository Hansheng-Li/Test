import { GameState, Order } from '../game/GameState';
import { CustomerDef } from '../data/customers';
import { BASES, computeRecipe, Effect, packagedItemId, parseRecipeKey } from '../data/products';
import { LANDMARKS } from '../data/city';
import { customerState, relationshipTier, unlockedCustomers, recordSuccessfulDeal } from './CustomerSystem';
import { countItem, removeItem, packagedInInventory } from './InventorySystem';
import { addCash } from './EconomySystem';
import { recipeDisplayName } from './ProductionSystem';

export interface OrderGenOptions {
  /** Force a specific customer (used for the scripted first order). */
  customerId?: string;
  /** Force a simple order (base only). */
  simple?: boolean;
  rng?: () => number;
  now: number;
}

function pickWeighted<T>(items: T[], weight: (t: T) => number, rng: () => number): T | null {
  const ws = items.map(weight);
  const total = ws.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= ws[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

/** Price the customer offers for a requested product; generosity and relationship raise it. */
export function offeredUnitPrice(state: GameState, c: CustomerDef, recipeValue: number): number {
  const rel = customerState(state, c.id).relationship;
  const relBonus = 1 + Math.min(0.3, rel / 200);
  const gen = 1.15 + c.generosity * 0.5;
  return Math.round(recipeValue * gen * relBonus);
}

/** Create a pending pager order from an unlocked customer. Returns null if nobody is available. */
export function generateOrder(state: GameState, opts: OrderGenOptions): Order | null {
  const rng = opts.rng ?? Math.random;
  const now = opts.now;
  const hour = (now % (24 * 60)) / 60;
  const isNight = hour >= 20 || hour < 6;
  const busy = new Set(state.orders.filter((o) => o.status === 'pending' || o.status === 'accepted' || o.status === 'runner').map((o) => o.customerId));
  let candidates = unlockedCustomers(state).filter((c) => !busy.has(c.id));
  if (opts.customerId) candidates = candidates.filter((c) => c.id === opts.customerId);
  candidates = candidates.filter((c) => now - customerState(state, c.id).lastOrderMinute > 40);
  const c = pickWeighted(
    candidates,
    (cd) => {
      let w = 1 + customerState(state, cd.id).relationship / 20;
      if (cd.timePref === 'night' && !isNight) w *= 0.35;
      if (cd.timePref === 'day' && isNight) w *= 0.35;
      return w;
    },
    rng,
  );
  if (!c) return null;
  const cs = customerState(state, c.id);
  const tier = relationshipTier(cs.relationship);
  // decide what they want
  let base = c.prefBase;
  let effects: Effect[] = [];
  let recipeKey: string | undefined;
  const known = Object.values(state.recipes);
  if (!opts.simple && tier !== 'stranger') {
    const roll = rng();
    const liked = known.filter((r) => r.customName && r.effects.some((e) => c.prefEffects.includes(e)));
    if (roll < 0.35 && liked.length > 0) {
      const r = liked[Math.floor(rng() * liked.length)];
      recipeKey = r.key;
      base = r.base;
      effects = [...r.effects];
    } else if (roll < 0.75) {
      // ask for a preferred effect on top of the base
      const e = c.prefEffects[Math.floor(rng() * c.prefEffects.length)];
      effects = [e];
      if (tier === 'friend' || tier === 'family') {
        const e2 = c.prefEffects.find((x) => x !== e);
        if (e2 && rng() < 0.5) effects.push(e2);
      }
    }
  }
  if (opts.simple) {
    base = 'SUNSET';
    effects = [];
  }
  // quantity grows with relationship
  const sizeBoost = tier === 'stranger' ? 0 : tier === 'acquaintance' ? 0 : tier === 'regular' ? 1 : 2;
  const qty = Math.max(1, Math.min(c.orderSize[0] + Math.floor(rng() * (c.orderSize[1] - c.orderSize[0] + 1)) + sizeBoost, 8));
  // value reference: the cheapest recipe that satisfies the request
  const refValue = referenceValue(base, effects, recipeKey, state);
  const unit = offeredUnitPrice(state, c, refValue);
  const spots = c.spots.filter((s) => LANDMARKS.some((l) => l.id === s));
  const locationId = spots[Math.floor(rng() * spots.length)] ?? LANDMARKS[0].id;
  const windowStart = now + 5;
  const windowEnd = now + 90 + Math.floor(rng() * 90);
  const order: Order = {
    id: state.nextOrderId++,
    customerId: c.id,
    base,
    effects,
    recipeKey,
    qty,
    price: unit * qty,
    locationId,
    windowStart,
    windowEnd,
    status: 'pending',
    createdMinute: now,
  };
  state.orders.push(order);
  cs.lastOrderMinute = now;
  state.lastOrderMinute = now;
  return order;
}

/** Value of the simplest recipe matching the request (for pricing). */
export function referenceValue(base: import('../data/products').BaseId, effects: Effect[], recipeKey: string | undefined, state: GameState): number {
  if (recipeKey) {
    const parsed = parseRecipeKey(recipeKey);
    if (parsed) return computeRecipe(parsed.base, parsed.mods).value;
  }
  if (effects.length === 0) return BASES[base].baseValue;
  // search known recipes and 1-2 modifier combos for the cheapest match
  let best = Infinity;
  const consider = (b: import('../data/products').BaseId, mods: string[]): void => {
    const r = computeRecipe(b, mods);
    if (effects.every((e) => r.effects.includes(e)) && r.value < best) best = r.value;
  };
  const modIds = ['mod_flux', 'mod_velvet_drops', 'mod_solar', 'mod_static', 'mod_sparks', 'mod_glow'];
  consider(base, []);
  for (const m of modIds) consider(base, [m]);
  for (const m of modIds) for (const n of modIds) consider(base, [m, n]);
  for (const r of Object.values(state.recipes)) if (r.base === base) consider(r.base, r.mods);
  if (best === Infinity) best = BASES[base].baseValue * 2;
  return best;
}

export function orderMatchesItem(order: Order, packagedItemKey: string): boolean {
  const parsed = parseRecipeKey(packagedItemKey);
  if (!parsed) return false;
  if (order.recipeKey) return order.recipeKey === packagedItemKey;
  if (parsed.base !== order.base) return false;
  const r = computeRecipe(parsed.base, parsed.mods);
  return order.effects.every((e) => r.effects.includes(e));
}

/** Human-readable product request, using the player's custom name when the customer asked for it. */
export function describeRequest(state: GameState, order: Order): string {
  if (order.recipeKey) return recipeDisplayName(state, order.recipeKey);
  if (order.effects.length === 0) {
    const plain = state.recipes[order.base];
    return plain?.customName ? `${order.base} (your ${plain.customName})` : order.base;
  }
  return `${order.base} (${order.effects.join('+')})`;
}

export function acceptOrder(state: GameState, orderId: number): boolean {
  const o = state.orders.find((x) => x.id === orderId);
  if (!o || o.status !== 'pending') return false;
  o.status = 'accepted';
  return true;
}

export function declineOrder(state: GameState, orderId: number): boolean {
  const o = state.orders.find((x) => x.id === orderId);
  if (!o || o.status !== 'pending') return false;
  o.status = 'declined';
  state.stats.declined += 1;
  return true;
}

export function activeOrders(state: GameState): Order[] {
  return state.orders.filter((o) => o.status === 'accepted' || o.status === 'runner');
}

export function pendingOrders(state: GameState): Order[] {
  return state.orders.filter((o) => o.status === 'pending');
}

/** Which packaged item in inventory could fulfil this order (first match). */
export function findFulfillingItem(state: GameState, order: Order): { id: string; key: string; qty: number } | null {
  for (const p of packagedInInventory(state)) {
    if (orderMatchesItem(order, p.key) && p.qty >= order.qty) return p;
  }
  return null;
}

export interface SaleResult {
  ok: boolean;
  reason?: 'no_item' | 'bad_status' | 'no_order';
  earned?: number;
  itemKey?: string;
  onTime?: boolean;
  unlocked?: string[];
  matchedPreference?: boolean;
}

/** Complete a sale in person: remove product, add cash, bump relationship. */
export function completeSale(state: GameState, orderId: number, now: number): SaleResult {
  const o = state.orders.find((x) => x.id === orderId);
  if (!o) return { ok: false, reason: 'no_order' };
  if (o.status !== 'accepted') return { ok: false, reason: 'bad_status' };
  const item = findFulfillingItem(state, o);
  if (!item) return { ok: false, reason: 'no_item' };
  removeItem(state, item.id, o.qty);
  const onTime = now <= o.windowEnd;
  const earned = onTime ? o.price : Math.round(o.price * 0.7);
  addCash(state, earned);
  o.status = 'completed';
  state.stats.sales += 1;
  state.stats.earned += earned;
  const parsed = parseRecipeKey(item.key)!;
  const r = computeRecipe(parsed.base, parsed.mods);
  const cdef = unlockedCustomers(state).find((c) => c.id === o.customerId);
  const matchedPreference = !!cdef && cdef.prefEffects.some((e) => r.effects.includes(e));
  const unlocked = recordSuccessfulDeal(state, o.customerId, { onTime, matchedPreference });
  return { ok: true, earned, itemKey: item.key, onTime, unlocked, matchedPreference };
}

/** Expire stale orders; returns the ones that just expired. */
export function expireOrders(state: GameState, now: number): Order[] {
  const expired: Order[] = [];
  for (const o of state.orders) {
    if ((o.status === 'pending' || o.status === 'accepted') && now > o.windowEnd + (o.status === 'pending' ? -60 : 0)) {
      o.status = 'expired';
      expired.push(o);
    }
  }
  // keep the list bounded
  if (state.orders.length > 60) {
    state.orders = state.orders.filter((o) => o.status === 'pending' || o.status === 'accepted' || o.status === 'runner').concat(
      state.orders.filter((o) => !(o.status === 'pending' || o.status === 'accepted' || o.status === 'runner')).slice(-30),
    );
  }
  return expired;
}

export function hasPackagedFor(state: GameState, order: Order): boolean {
  return findFulfillingItem(state, order) !== null;
}

export function packagedCountFor(state: GameState, key: string): number {
  return countItem(state, packagedItemId(key));
}
