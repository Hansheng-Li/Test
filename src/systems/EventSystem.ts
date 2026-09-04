import { GameState } from '../game/GameState';
import { hashString } from '../utils/math';
import { BASE_SUPPLY_IDS } from '../data/items';
import { CUSTOMERS } from '../data/customers';
import { dealerHandles } from './DealerSystem';

export type WorldEventId = 'none' | 'crackdown' | 'shortage' | 'club_night' | 'inspection' | 'rival' | 'curfew';

export interface WorldEvent {
  id: WorldEventId;
  day: number;
  /** crackdown: zone; shortage: supply item id; rival: customer id. */
  param?: string;
  /** rival: the player already won the customer back today. */
  wonBack?: boolean;
}

const ZONES = ['beach', 'downtown', 'docks'] as const;

/** Two event slots a day: 06:00-19:59 (even) and the night from 20:00 to 05:59 (odd, belongs to the day it started). */
export function eventSlot(day: number, hour: number): number {
  if (hour >= 20) return day * 2 + 1;
  if (hour < 6) return (day - 1) * 2 + 1;
  return day * 2;
}

/**
 * One deterministic event per slot (two a day, none on the first afternoon) so a
 * 45-minute session meets three or four: police crackdowns, supplier shortages, a
 * beach club night that pays extra after dark, inspections, rival crews and, from
 * the fourth night, curfews that double the patrols but raise every price.
 * `day` is the slot number (see eventSlot); it only serves as the event's identity.
 */
export function rollWorldEvent(state: GameState, day: number): WorldEvent | null {
  const cur = state.event;
  if (cur && cur.day === day) return null;
  if (day < 3) {
    state.event = { id: 'none', day };
    return null;
  }
  const salt = ':' + (state.seed ?? 0);
  const roll = hashString('event' + day + salt) % 10;
  let ev: WorldEvent;
  if (roll < 3) ev = { id: 'crackdown', day, param: ZONES[hashString('zone' + day + salt) % ZONES.length] };
  else if (roll < 5) ev = { id: 'shortage', day, param: BASE_SUPPLY_IDS[hashString('supply' + day + salt) % BASE_SUPPLY_IDS.length] };
  else if (roll < 7) ev = day % 2 === 1 ? { id: 'club_night', day } : { id: 'none', day }; // club nights only at night
  else if (roll < 8 && day >= 4 && state.properties.includes('warehouse') && state.suspicion >= 20) ev = { id: 'inspection', day };
  else if (roll < 9 && day % 2 === 0) {
    // a rival crew works one of your unlocked customers for the day (day slot only, so the -3 lands once a day at most)
    const unlocked = CUSTOMERS.filter((c) => state.customers[c.id]?.unlocked && !dealerHandles(state, c.id));
    if (unlocked.length >= 3) {
      const target = unlocked[hashString('rival' + day + salt) % unlocked.length];
      ev = { id: 'rival', day, param: target.id };
      const cs = state.customers[target.id];
      cs.relationship = Math.max(0, cs.relationship - 3);
    } else ev = { id: 'none', day };
  } else if (day % 2 === 1 && day >= 8) ev = { id: 'curfew', day }; // curfew: night slots only, once the player knows the streets
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

/** Heat gain multiplier for deals in a zone during a crackdown, or anywhere under curfew. */
export function heatMultiplier(state: GameState, zone: string): number {
  const ev = activeEvent(state);
  if (ev?.id === 'crackdown' && ev.param === zone) return 1.6;
  if (ev?.id === 'curfew') return 1.5;
  return 1;
}

/** True while a crackdown is on in this zone: the flat extra heat and the crackdown wording belong to it alone. */
export function crackdownIn(state: GameState, zone: string): boolean {
  const ev = activeEvent(state);
  return ev?.id === 'crackdown' && ev.param === zone;
}

/** Curfew night: District 3 puts two more officers on the street until 06:00. */
export function curfewExtraPolice(state: GameState): number {
  return activeEvent(state)?.id === 'curfew' ? 2 : 0;
}

/** Order price multiplier: beach customers pay more on club night after dark; everyone pays more under curfew. */
export function orderPriceMultiplier(state: GameState, homeZone: string, isNight: boolean): number {
  const ev = activeEvent(state);
  if (ev?.id === 'club_night' && homeZone === 'beach' && isNight) return 1.3;
  if (ev?.id === 'curfew' && isNight) return 1.2;
  return 1;
}

export interface InspectionResult {
  seized: number;
}

/**
 * Warehouse inspection: the port authority walks through Warehouse 7 and seizes a
 * quarter of any contraband on the shelves. Runs once, when the event rolls.
 */
export function applyInspection(state: GameState): InspectionResult {
  const st = state.storage.warehouse ?? [];
  let seized = 0;
  for (const s of st) {
    if (!s.id.startsWith('pkg:') && !s.id.startsWith('prod:')) continue;
    const take = Math.ceil(s.qty * 0.25);
    s.qty -= take;
    seized += take;
  }
  state.storage.warehouse = st.filter((s) => s.qty > 0);
  if (seized > 0) state.suspicion = Math.min(100, state.suspicion + 10);
  return { seized };
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
    case 'curfew':
      return 'CURFEW 20:00-06:00: two extra patrols tonight and officers notice you sooner. Deals draw 50% more heat, but customers pay +20% after dark.';
    case 'inspection':
      return 'PORT AUTHORITY INSPECTION at Warehouse 7: a quarter of any product on the shelves was seized.';
    case 'rival':
      return `RIVAL CREW: Sal's people are working ${CUSTOMERS.find((c) => c.id === ev.param)?.name ?? 'one of your customers'} today. No pages from them until you show up in person with a deal.`;
    default:
      return null;
  }
}

/** Customer currently being courted by the rival crew (no pager orders until the player wins them back). */
export function rivalTarget(state: GameState): string | null {
  const ev = activeEvent(state);
  return ev?.id === 'rival' && ev.param && !ev.wonBack ? ev.param : null;
}

/** A face-to-face deal wins the customer back for the day. */
export function winBackFromRival(state: GameState, customerId: string): boolean {
  const ev = activeEvent(state);
  if (ev?.id !== 'rival' || ev.param !== customerId || ev.wonBack) return false;
  ev.wonBack = true;
  const cs = state.customers[customerId];
  if (cs) cs.relationship = Math.min(100, cs.relationship + 5);
  return true;
}
