import { GameState } from '../game/GameState';
import { CAR_PAINTS, RESPRAY_PRICE, RESPRAY_HEAT } from '../data/city';
import { spendCash } from './EconomySystem';

export interface ResprayResult {
  ok: boolean;
  reason?: 'no_car' | 'no_cash';
  paint?: string;
  name?: string;
  heatDropped?: number;
}

/** Colour the sedan wears now (the first paint until Rojas has had a go at it). */
export function carPaint(state: GameState): { hex: string; name: string } {
  const hex = state.vehicle?.paint;
  return CAR_PAINTS.find((p) => p.hex === hex) ?? CAR_PAINTS[0];
}

/**
 * Rojas resprays the sedan: the next colour in the shop's rack, a chunk of heat gone
 * (the cops are looking for the old colour) and a fixed fee. No cooldown; the fee is the limit.
 */
export function resprayCar(state: GameState): ResprayResult {
  const v = state.vehicle;
  if (!v?.owned) return { ok: false, reason: 'no_car' };
  if (!spendCash(state, RESPRAY_PRICE)) return { ok: false, reason: 'no_cash' };
  // an unsprayed car wears the first colour, so the first respray is the second one
  const cur = Math.max(0, CAR_PAINTS.findIndex((p) => p.hex === (v.paint ?? CAR_PAINTS[0].hex)));
  const next = CAR_PAINTS[(cur + 1) % CAR_PAINTS.length];
  v.paint = next.hex;
  const heatDropped = Math.min(state.heat, RESPRAY_HEAT);
  state.heat -= heatDropped;
  state.stats.resprays = (state.stats.resprays ?? 0) + 1;
  return { ok: true, paint: next.hex, name: next.name, heatDropped };
}
