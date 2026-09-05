import { GameState } from '../game/GameState';
import { BASES, BaseId, computeRecipe, MODIFIERS, MAX_MODIFIERS, productItemId, packagedItemId, parseRecipeKey, Recipe } from '../data/products';
import { countItem, removeItem, addItem, spaceFor } from './InventorySystem';

export interface PrepPlan {
  /** Either a base supply item (start a new product) or a loose product item (refine). */
  inputItem: string;
  mods: string[];
  units: number;
  /** Extra units earned by a well-played stir minigame (0-2). */
  bonusUnits?: number;
}

export interface PrepResult {
  ok: boolean;
  reason?: 'no_input' | 'no_mods' | 'no_space' | 'too_many_mods' | 'bad_input';
  recipe?: Recipe;
  outputItem?: string;
  units?: number;
  /** Skill bonus units actually awarded. */
  bonus?: number;
}

/** Seconds a prep batch takes (upgrades speed it up). */
export function prepDuration(state: GameState): number {
  return state.upgrades.includes('eq_mixer') ? 3 : 6;
}

export function prepYieldBonus(state: GameState): number {
  return state.upgrades.includes('eq_mixer') ? 1 : 0;
}

export function baseFromSupply(itemId: string): BaseId | null {
  for (const b of Object.values(BASES)) if (b.supplyItem === itemId) return b.id;
  return null;
}

/** Figure out what recipe a plan would produce without changing state. */
export function previewPrep(state: GameState, plan: PrepPlan): PrepResult {
  let base: BaseId | null = null;
  let mods: string[] = [];
  if (plan.inputItem.startsWith('prod:')) {
    const parsed = parseRecipeKey(plan.inputItem.slice(5));
    if (!parsed) return { ok: false, reason: 'bad_input' };
    base = parsed.base;
    mods = [...parsed.mods];
  } else {
    base = baseFromSupply(plan.inputItem);
    if (!base) return { ok: false, reason: 'bad_input' };
  }
  const allMods = [...mods, ...plan.mods];
  if (allMods.length > MAX_MODIFIERS) return { ok: false, reason: 'too_many_mods' };
  for (const m of plan.mods) if (!MODIFIERS[m]) return { ok: false, reason: 'bad_input' };
  const recipe = computeRecipe(base, allMods);
  return { ok: true, recipe, outputItem: productItemId(recipe.key), units: plan.units };
}

/**
 * Consume inputs and create loose product. Each unit of input needs one of each modifier.
 * Registers the recipe in state so it can be named later.
 */
export function executePrep(state: GameState, plan: PrepPlan): PrepResult {
  const preview = previewPrep(state, plan);
  if (!preview.ok || !preview.recipe) return preview;
  const units = Math.max(1, Math.floor(plan.units));
  if (countItem(state, plan.inputItem) < units) return { ok: false, reason: 'no_input' };
  for (const m of plan.mods) if (countItem(state, m) < units) return { ok: false, reason: 'no_mods' };
  const outId = preview.outputItem!;
  const refine = plan.inputItem.startsWith('prod:');
  // skill bonus scales with the batch (at most one extra per two units) and never applies to refines
  const skill = refine ? 0 : Math.max(0, Math.min(2, Math.ceil(units / 2), Math.floor(plan.bonusUnits ?? 0)));
  const outUnits = units + (refine ? 0 : prepYieldBonus(state)) + skill;
  // space check: inputs free their slots, so simulate on a copy
  const sim: GameState = { ...state, inventory: state.inventory.map((s) => (s ? { ...s } : null)) };
  removeItem(sim, plan.inputItem, units);
  for (const m of plan.mods) removeItem(sim, m, units);
  if (spaceFor(sim, outId) < outUnits) return { ok: false, reason: 'no_space' };
  removeItem(state, plan.inputItem, units);
  for (const m of plan.mods) removeItem(state, m, units);
  if (!state.recipes[preview.recipe.key]) state.recipes[preview.recipe.key] = { ...preview.recipe };
  addItem(state, outId, outUnits);
  state.stats.produced += outUnits;
  return { ok: true, recipe: preview.recipe, outputItem: outId, units: outUnits, bonus: skill };
}

export interface PackageResult {
  ok: boolean;
  reason?: 'no_product' | 'no_bags' | 'no_space';
  outputItem?: string;
  units?: number;
}

export function packagingPerUnitSeconds(state: GameState): number {
  return state.upgrades.includes('eq_sealer') ? 0.15 : 0.9;
}

/** Turn loose product + baggies into packaged product. */
export function executePackage(state: GameState, recipeKey: string, qty: number): PackageResult {
  const loose = productItemId(recipeKey);
  const packed = packagedItemId(recipeKey);
  const n = Math.max(1, Math.floor(qty));
  if (countItem(state, loose) < n) return { ok: false, reason: 'no_product' };
  if (countItem(state, 'baggies') < n) return { ok: false, reason: 'no_bags' };
  const sim: GameState = { ...state, inventory: state.inventory.map((s) => (s ? { ...s } : null)) };
  removeItem(sim, loose, n);
  removeItem(sim, 'baggies', n);
  if (spaceFor(sim, packed) < n) return { ok: false, reason: 'no_space' };
  removeItem(state, loose, n);
  removeItem(state, 'baggies', n);
  addItem(state, packed, n);
  return { ok: true, outputItem: packed, units: n };
}

/** Player-chosen street name for a recipe. */
export function nameRecipe(state: GameState, recipeKey: string, name: string): boolean {
  const r = state.recipes[recipeKey];
  if (!r) return false;
  const clean = name.replace(/[<>&"'`]/g, '').trim().slice(0, 24).toUpperCase();
  if (!clean) return false;
  r.customName = clean;
  return true;
}

export function recipeDisplayName(state: GameState, recipeKey: string): string {
  const r = state.recipes[recipeKey];
  if (r) return r.customName ?? r.defaultName;
  const parsed = parseRecipeKey(recipeKey);
  return parsed ? computeRecipe(parsed.base, parsed.mods).defaultName : recipeKey;
}
