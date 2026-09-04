import { GameState } from '../game/GameState';
import { removeAllOfCategory } from './InventorySystem';
import { ItemStack } from '../game/GameState';
import { LATE_GRACE_MINUTES } from './OrderSystem';

export const HEAT_MAX = 100;

export type HeatLevel = 'calm' | 'noticed' | 'watched' | 'hunted' | 'wanted';

export function heatLevel(heat: number): HeatLevel {
  if (heat < 20) return 'calm';
  if (heat < 40) return 'noticed';
  if (heat < 60) return 'watched';
  if (heat < 80) return 'hunted';
  return 'wanted';
}

export function addHeat(state: GameState, amount: number): number {
  state.heat = Math.max(0, Math.min(HEAT_MAX, state.heat + amount));
  return state.heat;
}

/**
 * Heat decays over time. Faster at the safehouse and with a police scanner.
 * `dtSeconds` is real seconds.
 */
export function decayHeat(state: GameState, dtSeconds: number, opts: { atSafehouse: boolean; hidden: boolean; rateMul?: number }): void {
  let rate = 0.9; // per second
  if (opts.atSafehouse) rate = 3.5;
  else if (opts.hidden) rate = 1.6;
  if (state.upgrades.includes('eq_scanner')) rate *= 1.4;
  rate *= opts.rateMul ?? 1; // weather only touches heat, never the long-term suspicion below
  state.heat = Math.max(0, state.heat - rate * dtSeconds);
  // long-term suspicion drifts down very slowly
  state.suspicion = Math.max(0, state.suspicion - 0.01 * dtSeconds);
}

/**
 * A police officer saw a transaction. Bigger deals and higher suspicion are noticed harder.
 * A witnessed deal of $60 or more lands at 40+: the officer comes over for a stop-and-search
 * unless you break line of sight, so being seen is a moment, not a number.
 */
export function witnessedDeal(state: GameState, dealValue: number): number {
  const base = 38 + Math.min(22, dealValue / 10);
  const susp = 1 + state.suspicion / 200;
  addHeat(state, base * susp);
  state.suspicion = Math.min(100, state.suspicion + 4);
  return state.heat;
}

export interface ArrestResult {
  confiscated: ItemStack[];
  fine: number;
  minutesLost: number;
}

/**
 * Getting caught: confiscate contraband, fine proportional to cash (never below 0),
 * raise suspicion, drop heat, advance the clock. Never resets the game.
 */
/** Busted beside (or in) the sedan: the officers pop the trunk and take the contraband. Returns units taken. */
export function searchTrunk(state: GameState): number {
  const trunk = state.storage.trunk ?? [];
  let taken = 0;
  for (const s of trunk) if (s.id.startsWith('pkg:') || s.id.startsWith('prod:')) taken += s.qty;
  state.storage.trunk = trunk.filter((s) => !s.id.startsWith('pkg:') && !s.id.startsWith('prod:'));
  return taken;
}

export function applyArrest(state: GameState): ArrestResult {
  const confiscated = removeAllOfCategory(state, ['product', 'packaged_product']);
  const fine = Math.min(state.cash, Math.max(25, Math.round(state.cash * 0.15)));
  state.cash = Math.round((state.cash - fine) * 100) / 100;
  state.suspicion = Math.min(100, state.suspicion + 15);
  state.heat = 0;
  const minutesLost = 6 * 60;
  state.clockMinutes += minutesLost;
  state.stats.arrests += 1;
  for (const o of state.orders) if (o.status === 'accepted' && o.windowEnd + LATE_GRACE_MINUTES < state.clockMinutes) o.status = 'failed';
  return { confiscated, fine, minutesLost };
}
