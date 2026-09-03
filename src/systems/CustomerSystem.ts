import { GameState, CustomerState } from '../game/GameState';
import { CUSTOMERS, CUSTOMER_MAP, CustomerDef } from '../data/customers';

export const MAX_RELATIONSHIP = 100;

export function initCustomers(state: GameState): void {
  for (const c of CUSTOMERS) {
    if (!state.customers[c.id]) {
      state.customers[c.id] = { id: c.id, relationship: 0, deals: 0, unlocked: c.unlockAt === 0, lastOrderMinute: -9999, introduced: c.unlockAt === 0 };
    }
  }
}

export function customerState(state: GameState, id: string): CustomerState {
  if (!state.customers[id]) initCustomers(state);
  return state.customers[id];
}

/** Relationship tier used for order size / price tolerance. */
export function relationshipTier(rel: number): 'stranger' | 'acquaintance' | 'regular' | 'friend' | 'family' {
  if (rel < 5) return 'stranger';
  if (rel < 15) return 'acquaintance';
  if (rel < 30) return 'regular';
  if (rel < 60) return 'friend';
  return 'family';
}

/** Successful deal: relationship up, may unlock friends. Returns newly unlocked customer ids. */
export function recordSuccessfulDeal(state: GameState, customerId: string, opts: { onTime: boolean; matchedPreference: boolean }): string[] {
  const cs = customerState(state, customerId);
  let gain = 3;
  if (opts.onTime) gain += 1;
  if (opts.matchedPreference) gain += 2;
  cs.relationship = Math.min(MAX_RELATIONSHIP, cs.relationship + gain);
  cs.deals += 1;
  const unlocked: string[] = [];
  for (const c of CUSTOMERS) {
    const s = customerState(state, c.id);
    if (s.unlocked) continue;
    if (c.introducedBy === customerId && cs.relationship >= c.unlockAt) {
      s.unlocked = true;
      unlocked.push(c.id);
    }
  }
  return unlocked;
}

export function recordFailedDeal(state: GameState, customerId: string): void {
  const cs = customerState(state, customerId);
  cs.relationship = Math.max(0, cs.relationship - 4);
}

export function unlockedCustomers(state: GameState): CustomerDef[] {
  return CUSTOMERS.filter((c) => customerState(state, c.id).unlocked);
}

export function customerDef(id: string): CustomerDef {
  return CUSTOMER_MAP[id];
}
