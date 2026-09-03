import { describe, it, expect } from 'vitest';
import { createNewState } from '../src/systems/SaveSystem';
import { addItem, countItem } from '../src/systems/InventorySystem';
import { generateOrder, acceptOrder, completeSale, expireOrders, orderMatchesItem, counterOffer, rollTrend, streetSale } from '../src/systems/OrderSystem';
import { offerSample } from '../src/systems/CustomerSystem';
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

describe('haggling + trend', () => {
  it('small markups are accepted, only one attempt per order', () => {
    const s = createNewState();
    const o = generateOrder(s, { now: s.clockMinutes, customerId: 'sunny', simple: true, rng: seq([0.1]) })!; // generous tourist
    const before = o.price;
    const r = counterOffer(s, o.id, 0.1, () => 0.9)!;
    expect(r.outcome).toBe('accepted');
    expect(o.price).toBe(Math.round(before * 1.1));
    expect(counterOffer(s, o.id, 0.1)).toBeNull();
  });

  it('greedy markups on a stingy stranger lose the order', () => {
    const s = createNewState();
    const o = generateOrder(s, { now: s.clockMinutes, customerId: 'kenji', simple: true, rng: seq([0.1]) })!; // low generosity
    const r = counterOffer(s, o.id, 0.35, () => 0.9)!;
    expect(r.outcome).toBe('refused');
    expect(o.status).toBe('declined');
  });

  it('trend is deterministic per day and pays a bonus', () => {
    const s = createNewState();
    expect(rollTrend(s, 3)).toBe(true);
    const e = s.trend!.effect;
    expect(rollTrend(s, 3)).toBe(false);
    const s2 = createNewState();
    rollTrend(s2, 3);
    expect(s2.trend!.effect).toBe(e);
    // force a trend that a plain SUNSET has
    s.trend = { effect: 'ENERGY', day: 3 };
    const o = generateOrder(s, { now: s.clockMinutes, customerId: 'moe', simple: true, rng: seq([0.1]) })!;
    acceptOrder(s, o.id);
    s.recipes['SUNSET'] = { ...computeRecipe('SUNSET', []) };
    addItem(s, 'pkg:SUNSET', o.qty);
    const cash = s.cash;
    const r = completeSale(s, o.id, s.clockMinutes);
    expect(r.trendHit).toBe(true);
    expect(s.cash).toBe(cash + Math.round(o.price * 1.25));
  });
});

describe('samples + street deals', () => {
  it('a matching sample unlocks a locked customer and consumes one unit', () => {
    const s = createNewState();
    s.recipes['VELVET'] = { ...computeRecipe('VELVET', []) };
    addItem(s, 'pkg:VELVET', 2);
    expect(s.customers['gloria'].unlocked).toBe(false); // likes VELVET
    const r = offerSample(s, 'gloria', 'pkg:VELVET');
    expect(r.ok && r.unlocked && r.matched).toBe(true);
    expect(s.customers['gloria'].unlocked).toBe(true);
    expect(countItem(s, 'pkg:VELVET')).toBe(1);
    expect(offerSample(s, 'gloria', 'pkg:VELVET').reason).toBe('already_unlocked');
  });

  it('a wrong sample needs a second try', () => {
    const s = createNewState();
    s.recipes['SUNSET'] = { ...computeRecipe('SUNSET', []) };
    addItem(s, 'pkg:SUNSET', 3);
    const r1 = offerSample(s, 'hector', 'pkg:SUNSET'); // likes VELVET / CHILL
    expect(r1.unlocked).toBe(false);
    const r2 = offerSample(s, 'hector', 'pkg:SUNSET');
    expect(r2.unlocked).toBe(true);
    expect(countItem(s, 'pkg:SUNSET')).toBe(1);
  });

  it('street sale sells from the backpack with a cooldown', () => {
    const s = createNewState();
    s.recipes['SUNSET'] = { ...computeRecipe('SUNSET', []) };
    addItem(s, 'pkg:SUNSET', 4);
    const cash = s.cash;
    const r = streetSale(s, 'tasha', 1000, () => 0.1);
    expect(r.ok).toBe(true);
    expect(r.qty).toBe(2);
    expect(s.cash).toBeGreaterThan(cash);
    expect(countItem(s, 'pkg:SUNSET')).toBe(2);
    expect(s.customers['tasha'].relationship).toBeGreaterThan(0);
    expect(streetSale(s, 'tasha', 1005).reason).toBe('cooldown');
    expect(streetSale(s, 'gloria', 1005).reason).toBe('locked');
  });
});

describe('friend unlock visibility', () => {
  it('friend-introduced customers are marked introduced so they show up on the street', () => {
    const s = createNewState();
    s.customers['tasha'].relationship = 9;
    const o = generateOrder(s, { now: s.clockMinutes, customerId: 'tasha', simple: true, rng: seq([0.1]) })!;
    acceptOrder(s, o.id);
    s.recipes['SUNSET'] = { ...computeRecipe('SUNSET', []) };
    addItem(s, 'pkg:SUNSET', o.qty);
    completeSale(s, o.id, s.clockMinutes);
    expect(s.customers['dexter'].unlocked).toBe(true);
    expect(s.customers['dexter'].introduced).toBe(true);
  });
});
