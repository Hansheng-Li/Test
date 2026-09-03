import { describe, it, expect } from 'vitest';
import { createNewState } from '../src/systems/SaveSystem';
import { addItem, countItem } from '../src/systems/InventorySystem';
import { generateOrder, acceptOrder, completeSale, expireOrders, orderMatchesItem } from '../src/systems/OrderSystem';
import { computeRecipe } from '../src/data/products';

const seq = (vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};

describe('orders + customers', () => {
  it('generates a simple first order for a chosen customer', () => {
    const s = createNewState();
    const o = generateOrder(s, { now: s.clockMinutes, customerId: 'tasha', simple: true, rng: seq([0.1]) });
    expect(o).not.toBeNull();
    expect(o!.customerId).toBe('tasha');
    expect(o!.base).toBe('SUNSET');
    expect(o!.effects).toEqual([]);
    expect(o!.price).toBeGreaterThan(0);
    expect(o!.status).toBe('pending');
  });

  it('completed sale removes product, adds money and raises relationship', () => {
    const s = createNewState();
    const o = generateOrder(s, { now: s.clockMinutes, customerId: 'moe', simple: true, rng: seq([0.1]) })!;
    acceptOrder(s, o.id);
    s.recipes['SUNSET'] = { ...computeRecipe('SUNSET', []) };
    addItem(s, 'pkg:SUNSET', o.qty + 1);
    const cash = s.cash;
    const r = completeSale(s, o.id, s.clockMinutes + 10);
    expect(r.ok).toBe(true);
    expect(s.cash).toBe(cash + o.price);
    expect(countItem(s, 'pkg:SUNSET')).toBe(1);
    expect(s.customers['moe'].relationship).toBeGreaterThan(0);
    expect(o.status).toBe('completed');
  });

  it('sale fails without matching product and state is untouched', () => {
    const s = createNewState();
    const o = generateOrder(s, { now: s.clockMinutes, customerId: 'moe', simple: true, rng: seq([0.1]) })!;
    acceptOrder(s, o.id);
    const cash = s.cash;
    expect(completeSale(s, o.id, s.clockMinutes).ok).toBe(false);
    expect(s.cash).toBe(cash);
    expect(o.status).toBe('accepted');
  });

  it('effect requests match any recipe containing those effects', () => {
    const s = createNewState();
    const o = generateOrder(s, { now: s.clockMinutes, customerId: 'tasha', simple: true, rng: seq([0.1]) })!;
    o.effects = ['SOCIAL'];
    expect(orderMatchesItem(o, 'SUNSET')).toBe(false);
    expect(orderMatchesItem(o, 'SUNSET+mod_velvet_drops')).toBe(true);
    expect(orderMatchesItem(o, 'VELVET+mod_solar')).toBe(false); // wrong base
  });

  it('friends unlock when relationship grows', () => {
    const s = createNewState();
    s.customers['tasha'].relationship = 9;
    const o = generateOrder(s, { now: s.clockMinutes, customerId: 'tasha', simple: true, rng: seq([0.1]) })!;
    acceptOrder(s, o.id);
    s.recipes['SUNSET'] = { ...computeRecipe('SUNSET', []) };
    addItem(s, 'pkg:SUNSET', o.qty);
    const r = completeSale(s, o.id, s.clockMinutes);
    expect(r.unlocked).toContain('dexter');
    expect(s.customers['dexter'].unlocked).toBe(true);
  });

  it('accepted orders expire after their window', () => {
    const s = createNewState();
    const o = generateOrder(s, { now: s.clockMinutes, customerId: 'moe', simple: true, rng: seq([0.1]) })!;
    acceptOrder(s, o.id);
    expect(expireOrders(s, o.windowEnd - 1)).toHaveLength(0);
    expect(expireOrders(s, o.windowEnd + 1)).toHaveLength(1);
    expect(o.status).toBe('expired');
  });
});
