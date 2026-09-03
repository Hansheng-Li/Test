import { GameState } from '../game/GameState';
import { hashString } from '../utils/math';
import { BASE_SUPPLY_IDS } from '../data/items';

export type WorldEventId = 'none' | 'crackdown' | 'shortage' | 'club_night';

export interface WorldEvent {
  id: WorldEventId;
  day: number;
  /** crackdown: zone; shortage: supply item id. */
  param?: string;
}

const ZONES = ['beach', 'downtown', 'docks'] as const;

/**
 * One deterministic event per day (from day 2 on) so automation keeps creating
 * fresh problems: police crackdowns, supplier shortages, and a beach club night
 * that pays extra after dark.
 */
export function rollWorldEvent(state: GameState, day: number): WorldEvent | null {
  const cur = state.event;
  if (cur && cur.day === day) return null;
  if (day < 2) {
    state.event = { id: 'none', day };
    return null;
  }
  const roll = hashString('event' + day) % 10;
  let ev: WorldEvent;
  if (roll < 3) ev = { id: 'crackdown', day, param: ZONES[hashString('zone' + day) % ZONES.length] };
  else if (roll < 6) ev = { id: 'shortage', day, param: BASE_SUPPLY_IDS[hashString('supply' + day) % BASE_SUPPLY_IDS.length] };
  else if (roll < 8) ev = { id: 'club_night', day };
  else ev = { id: 'none', day };
  state.event = ev;
  return ev.id === 'none' ? null : ev;
}

export function activeEvent(state: GameState): WorldEvent | null {
  return state.event && state.event.id !== 'none' ? state.event : null;
}

/** Supplier price multiplier under a shortage. */
export function shopPriceMultiplier(state: GameState, itemId: string): number {
  const ev = activeEvent(state);
  if (ev?.id === 'shortage' && ev.param === itemId) return 2;
  return 1;
}

/** Heat gain multiplier for deals in a zone during a crackdown. */
export function heatMultiplier(state: GameState, zone: string): number {
  const ev = activeEvent(state);
  if (ev?.id === 'crackdown' && ev.param === zone) return 1.6;
  return 1;
}

/** Order price multiplier: beach customers pay more on club night after dark. */
export function orderPriceMultiplier(state: GameState, homeZone: string, isNight: boolean): number {
  const ev = activeEvent(state);
  if (ev?.id === 'club_night' && homeZone === 'beach' && isNight) return 1.3;
  return 1;
}

export function describeEvent(ev: WorldEvent | null): string | null {
  if (!ev) return null;
  switch (ev.id) {
    case 'crackdown':
      return `POLICE CRACKDOWN in the ${ev.param}: deals there draw 60% more heat and cops notice sooner.`;
    case 'shortage':
      return `SUPPLY SHORTAGE: Rico doubled the price of ${ev.param === 'pulp_sunset' ? 'Sunset Pulp' : ev.param === 'wax_velvet' ? 'Velvet Wax' : 'Neon Gel'} today.`;
    case 'club_night':
      return 'CLUB NIGHT at the beach: beach customers pay +30% after dark.';
    default:
      return null;
  }
}
