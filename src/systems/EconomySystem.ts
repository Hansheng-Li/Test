import { GameState } from '../game/GameState';
import { SHOPS, ITEMS } from '../data/items';
import { addItem, spaceFor, storageAdd, storageCapacity, storageUsed, countItem, removeItem } from './InventorySystem';
import { shopPriceMultiplier } from './EventSystem';

export interface PurchaseResult {
  ok: boolean;
  reason?: 'no_cash' | 'no_space' | 'unknown' | 'owned' | 'locked' | 'no_warehouse';
  spent?: number;
}

export const DELIVERY_FEE = 0.2;

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

/** Effective shop price today (events can change it). */
export function shopPrice(state: GameState, shopId: string, itemId: string): number {
  const entry = SHOPS[shopId]?.entries.find((e) => e.itemId === itemId);
  if (!entry) return 0;
  return Math.round(entry.price * shopPriceMultiplier(state, itemId));
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
  const total = shopPrice(state, shopId, itemId) * (isEquipment ? 1 : qty);
  if (state.cash < total) return { ok: false, reason: 'no_cash' };
  const needsSlot = !isEquipment || itemId.endsWith('_kit');
  if (needsSlot && spaceFor(state, itemId) < (isEquipment ? 1 : qty)) return { ok: false, reason: 'no_space' };
  spendCash(state, total);
  if (isEquipment) {
    if (itemId.endsWith('_kit')) addItem(state, itemId, 1);
    else state.upgrades.push(itemId);
  } else {
    addItem(state, itemId, qty);
  }
  return { ok: true, spent: total };
}

/**
 * Rico drops supplies straight into your warehouse storage for a 20% fee.
 * One less backpack trip across town — automation for the supply side.
 */
export function buyDelivered(state: GameState, shopId: string, itemId: string, qty: number): PurchaseResult {
  if (!state.properties.includes('warehouse')) return { ok: false, reason: 'no_warehouse' };
  const shop = SHOPS[shopId];
  const entry = shop?.entries.find((e) => e.itemId === itemId);
  if (!entry) return { ok: false, reason: 'unknown' };
  const def = ITEMS[itemId];
  if (def.category === 'equipment') return { ok: false, reason: 'unknown' };
  const total = Math.round(shopPrice(state, shopId, itemId) * qty * (1 + DELIVERY_FEE));
  if (state.cash < total) return { ok: false, reason: 'no_cash' };
  if (storageUsed(state, 'warehouse') + qty > storageCapacity(state, 'warehouse')) return { ok: false, reason: 'no_space' };
  spendCash(state, total);
  storageAdd(state, 'warehouse', itemId, qty);
  return { ok: true, spent: total };
}

/** Shops buy back what they sell (supplies, modifiers, ammo) at half the sticker price. */
export const SELL_BACK_RATE = 0.5;

export function sellPrice(state: GameState, shopId: string, itemId: string): number {
  const entry = SHOPS[shopId]?.entries.find((e) => e.itemId === itemId);
  if (!entry || ITEMS[itemId]?.category === 'equipment') return 0;
  return Math.max(1, Math.floor(shopPrice(state, shopId, itemId) * SELL_BACK_RATE));
}

/** Sell `qty` of an item the shop lists; returns the cash received (0 when nothing was sold). */
export function sellToShop(state: GameState, shopId: string, itemId: string, qty: number): number {
  const unit = sellPrice(state, shopId, itemId);
  if (unit <= 0 || !Number.isFinite(qty) || qty < 1) return 0;
  const n = Math.min(Math.floor(qty), countItem(state, itemId));
  if (n <= 0) return 0;
  removeItem(state, itemId, n);
  addCash(state, unit * n);
  return unit * n;
}
