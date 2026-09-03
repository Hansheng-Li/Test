import { GameState, CustomerState } from '../game/GameState';
import { CUSTOMERS, CUSTOMER_MAP, CustomerDef } from '../data/customers';
import { parseRecipeKey, computeRecipe } from '../data/products';
import { countItem, removeItem } from './InventorySystem';

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

export interface SampleResult {
  ok: boolean;
  reason?: 'no_item' | 'already_unlocked' | 'unknown';
  unlocked?: boolean;
  matched?: boolean;
  line?: string;
}

/**
 * Hand a locked customer one free unit of a packaged product. A product that fits
 * their taste unlocks them immediately; anything else needs a second try.
 */
export function offerSample(state: GameState, customerId: string, packagedItemId: string): SampleResult {
  const def = CUSTOMER_MAP[customerId];
  if (!def) return { ok: false, reason: 'unknown' };
  const cs = customerState(state, customerId);
  if (cs.unlocked) return { ok: false, reason: 'already_unlocked' };
  if (!packagedItemId.startsWith('pkg:') || countItem(state, packagedItemId) < 1) return { ok: false, reason: 'no_item' };
  const parsed = parseRecipeKey(packagedItemId.slice(4));
  if (!parsed) return { ok: false, reason: 'no_item' };
  removeItem(state, packagedItemId, 1);
  const r = computeRecipe(parsed.base, parsed.mods);
  const matched = parsed.base === def.prefBase || r.effects.some((e) => def.prefEffects.includes(e));
  cs.samples = (cs.samples ?? 0) + 1;
  const unlocked = matched || cs.samples >= 2;
  if (unlocked) {
    cs.unlocked = true;
    cs.introduced = true;
    cs.relationship = Math.max(cs.relationship, matched ? 3 : 1);
  }
  const line = unlocked
    ? matched
      ? `Oh. OH. This is exactly my thing. I will page you.`
      : `Not really my taste… but you keep showing up. Fine, page me sometime.`
    : `Hm. Not my thing. I like ${def.prefBase} with ${def.prefEffects.join(' or ')}.`;
  return { ok: true, unlocked, matched, line };
}
