import { GameState } from '../game/GameState';
import { addCash, spendCash } from './EconomySystem';

export const DICE_BETS = [10, 50, 200] as const;
export const DICE_MAX_BET = 200;
/** A street game draws a little attention every throw. */
export const DICE_HEAT_PER_ROLL = 2;

export type DicePick = 'high' | 'low';

export interface DiceResult {
  ok: boolean;
  reason?: 'no_cash' | 'bad_bet';
  dice?: [number, number];
  sum?: number;
  /** Net change to cash (negative on a loss). */
  net?: number;
  /** 1 = even money, 3 = snake eyes on LOW, 0 = lost. */
  payout?: number;
  line?: string;
}

/**
 * Street dice by the arcade: pick HIGH (8+) or LOW (6-), 7 is the house. Even money, snake eyes on LOW
 * pay triple. Expected value is -8% per throw, so it is a thrill and a money sink, not an income.
 */
export function rollDice(state: GameState, bet: number, pick: DicePick, rng: () => number = Math.random): DiceResult {
  if (!Number.isFinite(bet) || bet < 1 || bet > DICE_MAX_BET || Math.floor(bet) !== bet) return { ok: false, reason: 'bad_bet' };
  if (!spendCash(state, bet)) return { ok: false, reason: 'no_cash' };
  const a = 1 + Math.floor(rng() * 6);
  const b = 1 + Math.floor(rng() * 6);
  const sum = a + b;
  let payout = 0;
  if (pick === 'high' && sum >= 8) payout = 1;
  if (pick === 'low' && sum <= 6) payout = a === 1 && b === 1 ? 3 : 1;
  const won = bet * payout;
  if (won > 0) addCash(state, bet + won);
  const net = payout > 0 ? won : -bet;
  state.stats.diceNet = (state.stats.diceNet ?? 0) + net;
  state.stats.diceRolls = (state.stats.diceRolls ?? 0) + 1;
  state.heat = Math.min(100, state.heat + DICE_HEAT_PER_ROLL);
  const line = sum === 7 ? 'Seven. House.' : payout === 3 ? 'SNAKE EYES! Triple!' : payout > 0 ? (pick === 'high' ? 'High rolls. Pay the man.' : 'Low rolls. Pay the man.') : 'Not your throw.';
  return { ok: true, dice: [a, b], sum, net, payout, line };
}
