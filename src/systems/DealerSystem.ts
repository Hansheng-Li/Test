import { GameState } from '../game/GameState';
import { DEALER_MAX_CUSTOMERS, DEALER_MAX_STOCK, DEALER_PRICE_FACTOR } from '../data/items';
import { computeRecipe, parseRecipeKey } from '../data/products';
import { countItem, removeItem, addItem, spaceFor } from './InventorySystem';
import { customerState, customerDef } from './CustomerSystem';
import { offeredUnitPrice } from './OrderSystem';
import { addCash } from './EconomySystem';

/** Game minutes between dealer sales rounds. */
export const DEALER_INTERVAL = 20;

export function hireDealer(state: GameState, price: number): boolean {
  if (state.dealer?.hired) return false;
  if (state.cash < price) return false;
  state.cash -= price;
  state.dealer = { hired: true, name: 'Vince', stock: [], cash: 0, customers: [], lastTickMinute: state.clockMinutes, sales: 0, earnedTotal: 0 };
  return true;
}

export function dealerStockCount(state: GameState): number {
  return state.dealer?.stock.reduce((a, s) => a + s.qty, 0) ?? 0;
}

/** Move packaged product from the backpack to the dealer. Returns units moved. */
export function giveDealerStock(state: GameState, itemId: string, qty: number): number {
  const d = state.dealer;
  if (!d?.hired || !itemId.startsWith('pkg:')) return 0;
  const n = Math.max(0, Math.min(qty, countItem(state, itemId), DEALER_MAX_STOCK - dealerStockCount(state)));
  if (n <= 0) return 0;
  removeItem(state, itemId, n);
  const st = d.stock.find((s) => s.id === itemId);
  if (st) st.qty += n;
  else d.stock.push({ id: itemId, qty: n });
  return n;
}

export function takeDealerStock(state: GameState, itemId: string, qty: number): number {
  const d = state.dealer;
  if (!d?.hired) return 0;
  const st = d.stock.find((s) => s.id === itemId);
  if (!st) return 0;
  const n = Math.min(qty, st.qty, spaceFor(state, itemId));
  if (n <= 0) return 0;
  st.qty -= n;
  if (st.qty <= 0) d.stock.splice(d.stock.indexOf(st), 1);
  addItem(state, itemId, n);
  return n;
}

export function assignDealerCustomer(state: GameState, customerId: string): boolean {
  const d = state.dealer;
  if (!d?.hired) return false;
  if (d.customers.includes(customerId)) return false;
  if (d.customers.length >= DEALER_MAX_CUSTOMERS) return false;
  if (!customerState(state, customerId).unlocked) return false;
  d.customers.push(customerId);
  return true;
}

export function unassignDealerCustomer(state: GameState, customerId: string): boolean {
  const d = state.dealer;
  if (!d?.hired) return false;
  const i = d.customers.indexOf(customerId);
  if (i < 0) return false;
  d.customers.splice(i, 1);
  return true;
}

export function collectDealerCash(state: GameState): number {
  const d = state.dealer;
  if (!d?.hired || d.cash <= 0) return 0;
  const n = Math.round(d.cash);
  d.cash = 0;
  addCash(state, n);
  return n;
}

export interface DealerTickResult {
  sales: { customerId: string; itemKey: string; qty: number; earned: number }[];
  hassled?: { lost: number };
  starved?: boolean;
}

/**
 * Every DEALER_INTERVAL game minutes each assigned customer may buy 1-2 units of
 * something the dealer carries (favourite base first) at a street discount.
 * Stock runs out, cash piles up, and now and then the cops shake him down.
 */
export function tickDealer(state: GameState, nowMinutes: number, rng: () => number = Math.random): DealerTickResult {
  const d = state.dealer;
  const out: DealerTickResult = { sales: [] };
  if (!d?.hired) return out;
  if (nowMinutes - d.lastTickMinute < DEALER_INTERVAL) return out;
  d.lastTickMinute = nowMinutes;
  if (d.customers.length === 0) return out;
  if (dealerStockCount(state) === 0) {
    out.starved = true;
    return out;
  }
  for (const cid of d.customers) {
    if (rng() > 0.6) continue;
    if (dealerStockCount(state) === 0) break;
    const def = customerDef(cid);
    const item = d.stock.find((s) => parseRecipeKey(s.id.slice(4))?.base === def.prefBase) ?? d.stock[0];
    const qty = Math.min(item.qty, rng() < 0.5 ? 2 : 1);
    const parsed = parseRecipeKey(item.id.slice(4))!;
    const recipe = computeRecipe(parsed.base, parsed.mods);
    const unit = Math.round(offeredUnitPrice(state, def, recipe.value) * DEALER_PRICE_FACTOR);
    const earned = unit * qty;
    item.qty -= qty;
    if (item.qty <= 0) d.stock.splice(d.stock.indexOf(item), 1);
    d.cash += earned;
    d.sales += 1;
    d.earnedTotal += earned;
    const cs = customerState(state, cid);
    cs.relationship = Math.min(100, cs.relationship + 1);
    cs.deals += 1;
    state.stats.sales += 1;
    state.stats.earned += earned;
    state.heat = Math.min(100, state.heat + 1);
    out.sales.push({ customerId: cid, itemKey: parsed.base + (parsed.mods.length ? '+' + parsed.mods.join('+') : ''), qty, earned });
  }
  if (rng() < 0.06 && dealerStockCount(state) > 0) {
    let lost = 0;
    for (const s of d.stock) {
      const l = Math.ceil(s.qty * 0.2);
      s.qty -= l;
      lost += l;
    }
    d.stock = d.stock.filter((s) => s.qty > 0);
    state.heat = Math.min(100, state.heat + 8);
    out.hassled = { lost };
  }
  return out;
}
