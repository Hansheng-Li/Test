import { GameState } from '../game/GameState';
import { DEALER_MAX_STOCK, HANDLER_INTERVAL, HANDLER_TRIP_UNITS, HANDLER_MISHAP_CHANCE } from '../data/items';
import { dealerStockCount, dealerAddStock } from './DealerSystem';
import { storageRemove } from './InventorySystem';

export function hireHandler(state: GameState, price: number): boolean {
  if (state.handler?.hired) return false;
  if (!state.properties.includes('warehouse') || !state.dealer?.hired) return false;
  if (state.cash < price) return false;
  state.cash -= price;
  state.handler = { hired: true, name: 'Teddy', lastTickMinute: state.clockMinutes, trips: 0, moved: 0 };
  return true;
}

export interface HandlerTickResult {
  /** Units carried from Warehouse 7 to Vince this tick. */
  moved?: number;
  /** A trip went wrong: units lost to a stop-and-search. */
  lost?: number;
  idle?: 'no_stock' | 'dealer_full';
}

/**
 * Every HANDLER_INTERVAL game minutes the handler walks up to HANDLER_TRIP_UNITS of
 * packaged product from Warehouse 7 storage to Vince's corner. Missed rounds after a
 * sleep are replayed (capped); only a live round can go wrong.
 */
export function tickHandler(state: GameState, nowMinutes: number, rng: () => number = Math.random): HandlerTickResult {
  const h = state.handler;
  const out: HandlerTickResult = {};
  if (!h?.hired) return out;
  const rounds = Math.min(8, Math.floor((nowMinutes - h.lastTickMinute) / HANDLER_INTERVAL));
  if (rounds < 1) return out;
  h.lastTickMinute = nowMinutes;
  if (!state.dealer?.hired || !state.properties.includes('warehouse')) return out;
  for (let round = 0; round < rounds; round++) {
    const room = DEALER_MAX_STOCK - dealerStockCount(state);
    if (room <= 0) {
      out.idle = 'dealer_full';
      break;
    }
    const packs = (state.storage.warehouse ?? []).filter((s) => s.id.startsWith('pkg:') && s.qty > 0);
    if (packs.length === 0) {
      out.idle = 'no_stock';
      break;
    }
    let budget = Math.min(HANDLER_TRIP_UNITS, room);
    const carried: { id: string; qty: number }[] = [];
    for (const p of packs) {
      if (budget <= 0) break;
      const n = Math.min(p.qty, budget);
      storageRemove(state, 'warehouse', p.id, n);
      carried.push({ id: p.id, qty: n });
      budget -= n;
    }
    const total = carried.reduce((a, c) => a + c.qty, 0);
    h.trips += 1;
    // a live round can run into a patrol: the bag is gone and the port gets curious
    if (rounds === 1 && rng() < HANDLER_MISHAP_CHANCE) {
      out.lost = (out.lost ?? 0) + total;
      state.suspicion = Math.min(100, state.suspicion + 5);
      continue;
    }
    for (const c of carried) dealerAddStock(state, c.id, c.qty);
    h.moved += total;
    out.moved = (out.moved ?? 0) + total;
  }
  return out;
}
