import { GameState } from '../game/GameState';
import { MODIFIERS, BASES, parseRecipeKey, computeRecipe, productItemId, packagedItemId } from '../data/products';
import { storageCount, storageRemove, storageAdd, storageCapacity, storageUsed } from './InventorySystem';

/** Seconds per unit for the production worker. */
export const WORKER_SECONDS_PER_UNIT = 8;

export function hireWorker(state: GameState, price: number, property: string): boolean {
  if (state.worker?.hired) return false;
  if (state.cash < price) return false;
  state.cash -= price;
  state.worker = { hired: true, name: 'Marisol', recipeKey: null, property, progress: 0, produced: 0 };
  return true;
}

export function assignWorkerRecipe(state: GameState, recipeKey: string | null): boolean {
  if (!state.worker?.hired) return false;
  if (recipeKey !== null && !parseRecipeKey(recipeKey)) return false;
  state.worker.recipeKey = recipeKey;
  state.worker.progress = 0;
  return true;
}

export interface WorkerNeeds {
  base: string;
  mods: string[];
  hasBase: boolean;
  hasMods: boolean;
  hasBags: boolean;
  hasSpace: boolean;
}

/** What the worker needs in storage to make one more unit of the assigned recipe. */
export function workerNeeds(state: GameState, property: string, recipeKey: string): WorkerNeeds | null {
  const parsed = parseRecipeKey(recipeKey);
  if (!parsed) return null;
  const base = BASES[parsed.base].supplyItem;
  const mods = parsed.mods.filter((m) => MODIFIERS[m]);
  return {
    base,
    mods,
    hasBase: storageCount(state, property, base) >= 1,
    hasMods: mods.every((m) => storageCount(state, property, m) >= 1),
    hasBags: storageCount(state, property, 'baggies') >= 1,
    hasSpace: storageUsed(state, property) < storageCapacity(state, property) + 2,
  };
}

export interface WorkerTickResult {
  produced?: { recipeKey: string; packaged: boolean };
  blocked?: 'no_base' | 'no_mods' | 'no_space' | 'unassigned';
}

/**
 * Production worker: pulls one base + modifiers from property storage, and after
 * WORKER_SECONDS_PER_UNIT puts one unit back — packaged if baggies are available,
 * loose otherwise. Runs while the player is anywhere in the city.
 */
export function tickWorker(state: GameState, dtSeconds: number): WorkerTickResult {
  const w = state.worker;
  if (!w?.hired) return {};
  if (!w.recipeKey) return { blocked: 'unassigned' };
  const property = state.properties.includes(w.property) ? w.property : 'safehouse';
  const needs = workerNeeds(state, property, w.recipeKey);
  if (!needs) return { blocked: 'unassigned' };
  if (!needs.hasBase) return { blocked: 'no_base' };
  if (!needs.hasMods) return { blocked: 'no_mods' };
  if (!needs.hasSpace) return { blocked: 'no_space' };
  w.progress += dtSeconds / WORKER_SECONDS_PER_UNIT;
  if (w.progress < 1) return {};
  w.progress = 0;
  storageRemove(state, property, needs.base, 1);
  for (const m of needs.mods) storageRemove(state, property, m, 1);
  const parsed = parseRecipeKey(w.recipeKey)!;
  const recipe = computeRecipe(parsed.base, parsed.mods);
  if (!state.recipes[recipe.key]) state.recipes[recipe.key] = { ...recipe };
  const packaged = needs.hasBags;
  if (packaged) {
    storageRemove(state, property, 'baggies', 1);
    storageAdd(state, property, packagedItemId(recipe.key), 1);
  } else storageAdd(state, property, productItemId(recipe.key), 1);
  w.produced += 1;
  state.stats.produced += 1;
  return { produced: { recipeKey: recipe.key, packaged } };
}
