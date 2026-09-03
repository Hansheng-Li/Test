import { describe, it, expect } from 'vitest';
import { createNewState } from '../src/systems/SaveSystem';
import { addItem, countItem } from '../src/systems/InventorySystem';
import { hireDealer, giveDealerStock, takeDealerStock, assignDealerCustomer, tickDealer, collectDealerCash, DEALER_INTERVAL } from '../src/systems/DealerSystem';
import { generateOrder } from '../src/systems/OrderSystem';
import { computeRecipe } from '../src/data/products';

describe('dealer network', () => {
  it('sells stock to assigned customers over time and holds the cash until collected', () => {
    const s = createNewState();
    s.cash = 2000;
    expect(hireDealer(s, 1200)).toBe(true);
    s.recipes['SUNSET'] = { ...computeRecipe('SUNSET', []) };
    addItem(s, 'pkg:SUNSET', 10);
    expect(giveDealerStock(s, 'pkg:SUNSET', 6)).toBe(6);
    expect(countItem(s, 'pkg:SUNSET')).toBe(4);
    expect(assignDealerCustomer(s, 'tasha')).toBe(true);
    expect(assignDealerCustomer(s, 'gloria')).toBe(false); // locked
    const now = s.clockMinutes;
    expect(tickDealer(s, now + 5, () => 0.1).sales).toHaveLength(0); // too soon
    const r = tickDealer(s, now + DEALER_INTERVAL, () => 0.1);
    expect(r.sales).toHaveLength(1);
    expect(r.sales[0].qty).toBe(2);
    expect(s.dealer!.cash).toBeGreaterThan(0);
    expect(s.dealer!.stock[0].qty).toBe(4);
    expect(s.customers['tasha'].relationship).toBe(1);
    const cash = s.cash;
    const got = collectDealerCash(s);
    expect(got).toBeGreaterThan(0);
    expect(s.cash).toBe(cash + got);
    expect(s.dealer!.cash).toBe(0);
    expect(takeDealerStock(s, 'pkg:SUNSET', 10)).toBe(4);
  });

  it('dealer customers stop paging the player', () => {
    const s = createNewState();
    s.cash = 2000;
    hireDealer(s, 1200);
    assignDealerCustomer(s, 'moe');
    const o = generateOrder(s, { now: s.clockMinutes, customerId: 'moe', simple: true, rng: () => 0.1 });
    expect(o).toBeNull();
  });

  it('a shakedown costs stock and adds heat, but never breaks the state', () => {
    const s = createNewState();
    s.cash = 2000;
    hireDealer(s, 1200);
    addItem(s, 'pkg:SUNSET', 10);
    giveDealerStock(s, 'pkg:SUNSET', 10);
    assignDealerCustomer(s, 'tasha');
    // rng: skip the sale (0.9 > 0.6), then trigger the hassle (0.01 < 0.06)
    const seq = [0.9, 0.01];
    let i = 0;
    const r = tickDealer(s, s.clockMinutes + DEALER_INTERVAL, () => seq[i++ % seq.length]);
    expect(r.hassled?.lost).toBe(2);
    expect(s.dealer!.stock[0].qty).toBe(8);
    expect(s.heat).toBe(8);
  });
});

describe('dealer pressure + supplier delivery', () => {
  it('an empty corner for four rounds can lose a customer to a rival crew', () => {
    const s = createNewState();
    s.cash = 2000;
    hireDealer(s, 1000);
    assignDealerCustomer(s, 'tasha');
    s.customers['tasha'].relationship = 10;
    let t = s.clockMinutes;
    let poached: string | undefined;
    for (let i = 0; i < 4; i++) {
      t += DEALER_INTERVAL;
      const r = tickDealer(s, t, () => 0.1);
      if (r.poached) poached = r.poached;
    }
    expect(poached).toBe('tasha');
    expect(s.dealer!.customers).toEqual([]);
    expect(s.customers['tasha'].relationship).toBe(5);
  });
});
