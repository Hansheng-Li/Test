import { GameState, ItemStack, INVENTORY_SLOTS } from '../game/GameState';
import { ITEMS, ItemCategory } from '../data/items';
import { recipeKeyFromItem, isPackagedItem, isProductItem } from '../data/products';

export interface ResolvedItem {
  id: string;
  name: string;
  category: ItemCategory;
  value: number;
  stack: number;
  desc: string;
  recipeKey?: string;
}

/** Resolve static or dynamic (product) item definitions. */
export function resolveItem(state: GameState, id: string): ResolvedItem {
  const stackMult = state.upgrades.includes('eq_backpack') ? 2 : 1;
  const def = ITEMS[id];
  if (def) return { ...def, stack: def.stack * stackMult };
  const key = recipeKeyFromItem(id);
  if (key) {
    const r = state.recipes[key];
    const name = r?.customName ?? r?.defaultName ?? key;
    const packaged = isPackagedItem(id);
    return {
      id,
      name: packaged ? name : name + ' (loose)',
      category: packaged ? 'packaged_product' : 'product',
      value: r?.value ?? 0,
      stack: (packaged ? 10 : 10) * stackMult,
      desc: r ? `${r.base} · ${r.effects.join(' · ')}` : '',
      recipeKey: key,
    };
  }
  return { id, name: id, category: 'misc', value: 0, stack: 1, desc: '' };
}

export function ensureInventory(state: GameState): void {
  while (state.inventory.length < INVENTORY_SLOTS) state.inventory.push(null);
}

export function countItem(state: GameState, id: string): number {
  let n = 0;
  for (const s of state.inventory) if (s && s.id === id) n += s.qty;
  return n;
}

/** How many more units of an item fit. */
export function spaceFor(state: GameState, id: string): number {
  ensureInventory(state);
  const def = resolveItem(state, id);
  let space = 0;
  for (const s of state.inventory) {
    if (!s) space += def.stack;
    else if (s.id === id) space += Math.max(0, def.stack - s.qty);
  }
  return space;
}

/** Add items; returns the number that did NOT fit. */
export function addItem(state: GameState, id: string, qty: number): number {
  ensureInventory(state);
  const def = resolveItem(state, id);
  let left = qty;
  for (const s of state.inventory) {
    if (left <= 0) break;
    if (s && s.id === id && s.qty < def.stack) {
      const take = Math.min(left, def.stack - s.qty);
      s.qty += take;
      left -= take;
    }
  }
  for (let i = 0; i < state.inventory.length && left > 0; i++) {
    if (!state.inventory[i]) {
      const take = Math.min(left, def.stack);
      state.inventory[i] = { id, qty: take };
      left -= take;
    }
  }
  return left;
}

/** Remove items; returns false (and changes nothing) if not enough. */
export function removeItem(state: GameState, id: string, qty: number): boolean {
  if (countItem(state, id) < qty) return false;
  let left = qty;
  for (let i = state.inventory.length - 1; i >= 0 && left > 0; i--) {
    const s = state.inventory[i];
    if (!s || s.id !== id) continue;
    const take = Math.min(left, s.qty);
    s.qty -= take;
    left -= take;
    if (s.qty <= 0) state.inventory[i] = null;
  }
  return true;
}

export function removeAllOfCategory(state: GameState, categories: ItemCategory[]): ItemStack[] {
  const removed: ItemStack[] = [];
  for (let i = 0; i < state.inventory.length; i++) {
    const s = state.inventory[i];
    if (!s) continue;
    if (categories.includes(resolveItem(state, s.id).category)) {
      removed.push({ ...s });
      state.inventory[i] = null;
    }
  }
  return removed;
}

/** Storage (property shelves) is an unbounded list of stacks. */
export function storageOf(state: GameState, property: string): ItemStack[] {
  if (!state.storage[property]) state.storage[property] = [];
  return state.storage[property];
}

export function storageCount(state: GameState, property: string, id: string): number {
  return storageOf(state, property).filter((s) => s.id === id).reduce((a, s) => a + s.qty, 0);
}

export function storageAdd(state: GameState, property: string, id: string, qty: number): void {
  const st = storageOf(state, property);
  const existing = st.find((s) => s.id === id);
  if (existing) existing.qty += qty;
  else st.push({ id, qty });
}

export function storageRemove(state: GameState, property: string, id: string, qty: number): boolean {
  const st = storageOf(state, property);
  const existing = st.find((s) => s.id === id);
  if (!existing || existing.qty < qty) return false;
  existing.qty -= qty;
  if (existing.qty <= 0) st.splice(st.indexOf(existing), 1);
  return true;
}

/** Capacity in units for a property's storage (grows with shelves). */
/** The sedan's trunk: a stash on wheels, searched if you are busted next to it. */
export const TRUNK_CAPACITY = 24;

export function storageCapacity(state: GameState, property: string): number {
  if (property === 'trunk') return TRUNK_CAPACITY;
  const base = property === 'warehouse' ? 200 : property === 'motel' ? 60 : 40;
  const shelves = property === 'warehouse' ? state.placedStations.filter((p) => p.kind === 'storage').length : 0;
  return base + shelves * 60;
}

export function storageUsed(state: GameState, property: string): number {
  return storageOf(state, property).reduce((a, s) => a + s.qty, 0);
}

/** Move from inventory to storage; returns moved count. */
export function depositToStorage(state: GameState, property: string, id: string, qty: number): number {
  const have = countItem(state, id);
  const free = storageCapacity(state, property) - storageUsed(state, property);
  const n = Math.max(0, Math.min(have, qty, free));
  if (n <= 0) return 0;
  removeItem(state, id, n);
  storageAdd(state, property, id, n);
  return n;
}

export function withdrawFromStorage(state: GameState, property: string, id: string, qty: number): number {
  const have = storageCount(state, property, id);
  const n = Math.min(have, qty, spaceFor(state, id));
  if (n <= 0) return 0;
  storageRemove(state, property, id, n);
  addItem(state, id, n);
  return n;
}

/** Packaged products in inventory, grouped by recipe. */
export function packagedInInventory(state: GameState): { id: string; key: string; qty: number }[] {
  const out = new Map<string, number>();
  for (const s of state.inventory) {
    if (!s || !isPackagedItem(s.id)) continue;
    out.set(s.id, (out.get(s.id) ?? 0) + s.qty);
  }
  return Array.from(out.entries()).map(([id, qty]) => ({ id, key: recipeKeyFromItem(id)!, qty }));
}

export function looseProductsInInventory(state: GameState): { id: string; key: string; qty: number }[] {
  const out = new Map<string, number>();
  for (const s of state.inventory) {
    if (!s || !isProductItem(s.id)) continue;
    out.set(s.id, (out.get(s.id) ?? 0) + s.qty);
  }
  return Array.from(out.entries()).map(([id, qty]) => ({ id, key: recipeKeyFromItem(id)!, qty }));
}
