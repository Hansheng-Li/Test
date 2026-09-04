import { GameState, Order } from '../game/GameState';
import { CustomerDef } from '../data/customers';
import { BASES, computeRecipe, Effect, ALL_EFFECTS, packagedItemId, parseRecipeKey } from '../data/products';
import { hashString } from '../utils/math';
import { orderPriceMultiplier, rivalTarget, winBackFromRival } from './EventSystem';
import { LANDMARKS } from '../data/city';
import { customerState, relationshipTier, unlockedCustomers, recordSuccessfulDeal, customerDef } from './CustomerSystem';
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
  const hour = (state.clockMinutes % (24 * 60)) / 60;
  const night = hour >= 20 || hour < 6;
  return Math.round(recipeValue * gen * relBonus * orderPriceMultiplier(state, c.homeZone, night));
}

/** Create a pending pager order from an unlocked customer. Returns null if nobody is available. */
export function generateOrder(state: GameState, opts: OrderGenOptions): Order | null {
  const rng = opts.rng ?? Math.random;
  const now = opts.now;
  const hour = (now % (24 * 60)) / 60;
  const isNight = hour >= 20 || hour < 6;
  const busy = new Set(state.orders.filter((o) => o.status === 'pending' || o.status === 'accepted' || o.status === 'runner').map((o) => o.customerId));
  const dealerHas = new Set(state.dealer?.customers ?? []);
  const rival = rivalTarget(state);
  let candidates = unlockedCustomers(state).filter((c) => !busy.has(c.id) && !dealerHas.has(c.id) && c.id !== rival);
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
  const bored = !opts.simple && isBored(state, c.id);
  if (bored) {
    const last = parseRecipeKey(cs.lastRecipe!);
    const lastEffects = last ? computeRecipe(last.base, last.mods).effects : [];
    const wanted = c.prefEffects.find((e) => !lastEffects.includes(e)) ?? BORED_FALLBACK.find((e) => !lastEffects.includes(e))!;
    effects = [wanted];
  } else if (!opts.simple && tier !== 'stranger') {
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
  // VIP rush: regulars occasionally need a lot, fast, and pay for it
  const vip = !opts.simple && (tier === 'regular' || tier === 'friend' || tier === 'family') && rng() < 0.12;
  const finalQty = vip ? Math.min(12, qty * 2) : qty;
  const finalUnit = vip ? Math.round(unit * 1.6) : unit;
  const windowStart = now + 5;
  const windowEnd = now + (vip ? 50 : 90 + Math.floor(rng() * 90));
  const order: Order = {
    id: state.nextOrderId++,
    customerId: c.id,
    base,
    effects,
    recipeKey,
    qty: finalQty,
    price: finalUnit * finalQty,
    locationId,
    windowStart,
    windowEnd,
    status: 'pending',
    createdMinute: now,
    vip: vip || undefined,
    bored: bored || undefined,
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

/** Remember what a customer just bought so repeat purchases can bore them. */
export function noteRecipeBought(state: GameState, customerId: string, key: string): void {
  const cs = customerState(state, customerId);
  cs.sameStreak = cs.lastRecipe === key ? (cs.sameStreak ?? 1) + 1 : 1;
  cs.lastRecipe = key;
}

export const BORED_AFTER = 3;
/** Modded effects first so a bored customer is steered toward something you have to craft; plain-base effects last. */
const BORED_FALLBACK: Effect[] = ['SOCIAL', 'FOCUS', 'DREAMY', 'CONFIDENT', 'CHAOTIC', 'GLOW', 'ENERGY', 'CHILL'];

/** True when a customer has bought the same thing BORED_AFTER times in a row. */
export function isBored(state: GameState, customerId: string): boolean {
  const cs = customerState(state, customerId);
  return (cs.sameStreak ?? 0) >= BORED_AFTER && !!cs.lastRecipe;
}

export const TREND_BONUS = 0.25;
const TREND_EFFECTS: Effect[] = ALL_EFFECTS;

/** Deterministic daily trend so save/load and tests agree. Returns true when the trend changed. */
export function rollTrend(state: GameState, day: number): boolean {
  if (state.trend && state.trend.day === day) return false;
  const idx = hashString('trend' + day) % TREND_EFFECTS.length;
  state.trend = { effect: TREND_EFFECTS[idx], day };
  return true;
}

export interface HaggleResult {
  outcome: 'accepted' | 'countered' | 'refused';
  price: number;
  line: string;
}

/**
 * Counter-offer on a pending order. Generous customers and good friends tolerate
 * bigger markups; pushing too hard risks losing the order (and a little goodwill).
 * One attempt per order.
 */
export function counterOffer(state: GameState, orderId: number, markup: number, rng: () => number = Math.random): HaggleResult | null {
  const o = state.orders.find((x) => x.id === orderId);
  if (!o || o.status !== 'pending' || o.haggled) return null;
  const c = customerDef(o.customerId);
  const rel = customerState(state, o.customerId).relationship;
  const tierBonus = { stranger: 0, acquaintance: 0.04, regular: 0.08, friend: 0.12, family: 0.18 }[relationshipTier(rel)];
  const tolerance = 0.06 + c.generosity * 0.3 + tierBonus;
  o.haggled = true;
  const asked = Math.round(o.price * (1 + markup));
  if (markup <= tolerance) {
    o.price = asked;
    return { outcome: 'accepted', price: o.price, line: pick(rng, ['Fine, fine. You drive a hard bargain.', 'Ugh. Okay. But you owe me.', 'Deal. Do not tell anyone I paid that.']) };
  }
  if (markup <= tolerance * 1.8 && rng() < 0.6) {
    o.price = Math.round(o.price * (1 + tolerance));
    return { outcome: 'countered', price: o.price, line: pick(rng, [`Best I can do is $${o.price}. Take it or leave it.`, `$${o.price}. Final. My rent is due.`]) };
  }
  o.status = 'declined';
  customerState(state, o.customerId).relationship = Math.max(0, rel - 1);
  return { outcome: 'refused', price: o.price, line: c.lines.complaint };
}

function pick(rng: () => number, arr: string[]): string {
  return arr[Math.floor(rng() * arr.length)];
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
  trendHit?: boolean;
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
  const parsed = parseRecipeKey(item.key)!;
  const r = computeRecipe(parsed.base, parsed.mods);
  const trendHit = !!state.trend && r.effects.includes(state.trend.effect);
  let earned = onTime ? o.price : Math.round(o.price * 0.7);
  if (trendHit) earned = Math.round(earned * (1 + TREND_BONUS));
  addCash(state, earned);
  o.status = 'completed';
  state.stats.sales += 1;
  state.stats.earned += earned;
  const cdef = unlockedCustomers(state).find((c) => c.id === o.customerId);
  const matchedPreference = !!cdef && cdef.prefEffects.some((e) => r.effects.includes(e));
  noteRecipeBought(state, o.customerId, item.key);
  const unlocked = recordSuccessfulDeal(state, o.customerId, { onTime, matchedPreference });
  return { ok: true, earned, itemKey: item.key, onTime, unlocked, matchedPreference, trendHit };
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

export interface StreetSaleResult {
  ok: boolean;
  reason?: 'locked' | 'cooldown' | 'no_item' | 'bored' | 'dealer';
  earned?: number;
  qty?: number;
  itemKey?: string;
  unlocked?: string[];
  trendHit?: boolean;
  wonBack?: boolean;
}

export const STREET_SALE_COOLDOWN = 30; // game minutes

/** What a walking customer would buy from the backpack right now (prefers their favourite base). */
export function streetSaleCandidate(state: GameState, customerId: string): { id: string; key: string; qty: number } | null {
  const def = customerDef(customerId);
  const packs = packagedInInventory(state);
  if (!packs.length) return null;
  const cs = customerState(state, customerId);
  const fresh = isBored(state, customerId) ? packs.filter((p) => p.key !== cs.lastRecipe) : packs;
  const pool = fresh.length ? fresh : packs;
  return pool.find((p) => parseRecipeKey(p.key)?.base === def.prefBase) ?? pool[0];
}

export function streetUnitPrice(state: GameState, customerId: string, key: string): number {
  const parsed = parseRecipeKey(key)!;
  const value = computeRecipe(parsed.base, parsed.mods).value;
  return Math.round(offeredUnitPrice(state, customerDef(customerId), value) * 0.9);
}

/**
 * Sell directly to a customer met on the street: no pager, no meeting spot, a small
 * discount, 1-2 units. Uses the same relationship and trend rules as a pager deal.
 */
export function streetSale(state: GameState, customerId: string, now: number, rng: () => number = Math.random): StreetSaleResult {
  const cs = customerState(state, customerId);
  if (!cs.unlocked) return { ok: false, reason: 'locked' };
  if (state.dealer?.customers.includes(customerId)) return { ok: false, reason: 'dealer' };
  if (now - cs.lastOrderMinute < STREET_SALE_COOLDOWN) return { ok: false, reason: 'cooldown' };
  const item = streetSaleCandidate(state, customerId);
  if (!item) return { ok: false, reason: 'no_item' };
  if (isBored(state, customerId) && cs.lastRecipe === item.key) return { ok: false, reason: 'bored' };
  const qty = Math.min(item.qty, 1 + (rng() < 0.5 ? 1 : 0));
  const unit = streetUnitPrice(state, customerId, item.key);
  const parsed = parseRecipeKey(item.key)!;
  const recipe = computeRecipe(parsed.base, parsed.mods);
  const trendHit = !!state.trend && recipe.effects.includes(state.trend.effect);
  let earned = unit * qty;
  if (trendHit) earned = Math.round(earned * (1 + TREND_BONUS));
  removeItem(state, item.id, qty);
  addCash(state, earned);
  cs.lastOrderMinute = now;
  state.stats.sales += 1;
  state.stats.earned += earned;
  state.orders.push({ id: state.nextOrderId++, customerId, base: parsed.base, effects: [], recipeKey: item.key, qty, price: earned, locationId: 'street', windowStart: now, windowEnd: now, status: 'completed', createdMinute: now });
  const def = customerDef(customerId);
  noteRecipeBought(state, customerId, item.key);
  const wonBack = winBackFromRival(state, customerId);
  const unlocked = recordSuccessfulDeal(state, customerId, { onTime: true, matchedPreference: def.prefEffects.some((e) => recipe.effects.includes(e)) });
  return { ok: true, earned, qty, itemKey: item.key, unlocked, trendHit, wonBack };
}
