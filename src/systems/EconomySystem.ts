import { GameState } from '../game/GameState';
import { SHOPS, ITEMS } from '../data/items';
import { addItem, spaceFor } from './InventorySystem';

export interface PurchaseResult {
  ok: boolean;
  reason?: 'no_cash' | 'no_space' | 'unknown' | 'owned' | 'locked';
  spent?: number;
}

export function canAfford(state: GameState, amount: number): boolean {
  return state.cash >= amount;
}

export function addCash(state: GameState, amount: number): void {
  state.cash = Math.round((state.cash + amount) * 100) / 100;
}

export function spendCash(state: GameState, amount: number): boolean {
  if (state.cash < amount) return false;
  state.cash = Math.round((state.cash - amount) * 100) / 100;
  return true;
}

/** Buy `qty` of a shop entry. Equipment goes to upgrades, everything else to inventory. */
export function buyFromShop(state: GameState, shopId: string, itemId: string, qty = 1): PurchaseResult {
  const shop = SHOPS[shopId];
  const entry = shop?.entries.find((e) => e.itemId === itemId);
  if (!entry) return { ok: false, reason: 'unknown' };
  if (entry.requires && !state.properties.includes(entry.requires) && !state.upgrades.includes(entry.requires)) return { ok: false, reason: 'locked' };
  const def = ITEMS[itemId];
  const isEquipment = def.category === 'equipment';
  if (isEquipment && !itemId.endsWith('_kit') && state.upgrades.includes(itemId)) return { ok: false, reason: 'owned' };
  const total = entry.price * (isEquipment ? 1 : qty);
  if (state.cash < total) return { ok: false, reason: 'no_cash' };
  if (!isEquipment && spaceFor(state, itemId) < qty) return { ok: false, reason: 'no_space' };
  spendCash(state, total);
  if (isEquipment) {
    if (itemId.endsWith('_kit')) addItem(state, itemId, 1);
    else state.upgrades.push(itemId);
  } else {
    addItem(state, itemId, qty);
  }
  return { ok: true, spent: total };
}
