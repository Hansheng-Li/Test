import { describe, it, expect } from 'vitest';
import { createNewState } from '../src/systems/SaveSystem';
import { generateOrder, acceptOrder, counterOffer, completeSale, expireOrders } from '../src/systems/OrderSystem';
import { hireDealer, giveDealerStock, collectDealerCash, tickDealer, assignDealerCustomer } from '../src/systems/DealerSystem';
import { applyArrest } from '../src/systems/HeatSystem';
import { offerSample } from '../src/systems/CustomerSystem';
import { checkMilestones } from '../src/systems/MilestoneSystem';
import { executePrep, executePackage } from '../src/systems/ProductionSystem';
import { addItem, countItem } from '../src/systems/InventorySystem';
import { computeRecipe } from '../src/data/products';

const seq = (vals: number[]) => { let i = 0; return () => vals[Math.min(i++, vals.length - 1)]; };

/** Things a hostile player (or a buggy caller) would try; every one must be a no-op, not a payday. */
describe('adversarial: money and state cannot be created by repeating calls', () => {
  it('a pager order cannot be completed twice or with fewer units than asked', () => {
    const s = createNewState();
    s.recipes['SUNSET'] = { ...computeRecipe('SUNSET', []) };
    const o = generateOrder(s, { now: s.clockMinutes, customerId: 'tasha', simple: true, rng: seq([0.1]) })!;
    o.qty = 3;
    acceptOrder(s, o.id);
    addItem(s, 'pkg:SUNSET', 2);
    expect(completeSale(s, o.id, s.clockMinutes).ok).toBe(false);
    expect(countItem(s, 'pkg:SUNSET')).toBe(2);
    addItem(s, 'pkg:SUNSET', 1);
    const cashBefore = s.cash;
    expect(completeSale(s, o.id, s.clockMinutes).ok).toBe(true);
    expect(s.cash).toBeGreaterThan(cashBefore);
    const after = s.cash;
    expect(completeSale(s, o.id, s.clockMinutes).ok).toBe(false);
    expect(s.cash).toBe(after);
  });

  it('haggling is one attempt per order', () => {
    const s = createNewState();
    const o = generateOrder(s, { now: s.clockMinutes, customerId: 'tasha', simple: true, rng: seq([0.1]) })!;
    const r1 = counterOffer(s, o.id, 0.01, () => 0.99);
    expect(r1?.outcome).toBe('accepted');
    expect(counterOffer(s, o.id, 0.01, () => 0.99)).toBeNull();
  });

  it('dealer cash can only be collected once and malformed stock is refused', () => {
    const s = createNewState();
    s.cash = 5000;
    hireDealer(s, 1000);
    expect(giveDealerStock(s, 'baggies', 5)).toBe(0); // not a packaged product
    s.recipes['SUNSET'] = { ...computeRecipe('SUNSET', []) };
    addItem(s, 'pkg:SUNSET', 4);
    expect(giveDealerStock(s, 'pkg:SUNSET', 99)).toBe(4);
    assignDealerCustomer(s, 'tasha');
    tickDealer(s, s.clockMinutes + 10000, () => 0.1);
    const owed = s.dealer!.cash;
    expect(owed).toBeGreaterThan(0);
    const before = s.cash;
    expect(collectDealerCash(s)).toBe(Math.round(owed));
    expect(collectDealerCash(s)).toBe(0);
    expect(s.cash).toBe(before + Math.round(owed));
  });

  it('an arrest never drives cash negative', () => {
    const s = createNewState();
    s.cash = 10;
    const r = applyArrest(s);
    expect(r.fine).toBe(10);
    expect(s.cash).toBe(0);
    s.cash = 0;
    applyArrest(s);
    expect(s.cash).toBe(0);
  });

  it('samples cannot be given to an already unlocked customer and the second sample always unlocks', () => {
    const s = createNewState();
    s.recipes['VELVET'] = { ...computeRecipe('VELVET', []) };
    addItem(s, 'pkg:VELVET', 3);
    const locked = Object.values(s.customers).find((c) => !c.unlocked)!;
    const r1 = offerSample(s, locked.id, 'pkg:VELVET');
    expect(r1.ok).toBe(true);
    if (!r1.unlocked) expect(offerSample(s, locked.id, 'pkg:VELVET').unlocked).toBe(true);
    expect(offerSample(s, locked.id, 'pkg:VELVET').reason).toBe('already_unlocked');
    expect(countItem(s, 'pkg:VELVET')).toBeGreaterThanOrEqual(1);
  });

  it('milestone rewards are paid once even if the condition keeps holding', () => {
    const s = createNewState();
    s.stats.sales = 1;
    const first = checkMilestones(s);
    expect(first.some((m) => m.id === 'first_sale')).toBe(true);
    const cash = s.cash;
    expect(checkMilestones(s)).toEqual([]);
    expect(s.cash).toBe(cash);
  });

  it('prep and packaging never mint units without inputs', () => {
    const s = createNewState();
    expect(executePrep(s, { inputItem: 'pulp_sunset', mods: [], units: 1 }).ok).toBe(false);
    addItem(s, 'pulp_sunset', 1);
    expect(executePrep(s, { inputItem: 'pulp_sunset', mods: [], units: 5 }).reason).toBe('no_input');
    expect(executePrep(s, { inputItem: 'pulp_sunset', mods: ['mod_flux'], units: 1 }).reason).toBe('no_mods');
    expect(executePackage(s, 'SUNSET', 1).reason).toBe('no_product');
    expect(executePrep(s, { inputItem: 'pulp_sunset', mods: [], units: 1, bonusUnits: 99 }).units).toBeLessThanOrEqual(3);
  });

  it('the order list stays bounded and finished orders are the ones trimmed', () => {
    const s = createNewState();
    for (let i = 0; i < 80; i++) s.orders.push({ id: i + 1, customerId: 'tasha', base: 'SUNSET', effects: [], qty: 1, price: 10, locationId: 'pier', windowStart: 0, windowEnd: 1, status: i < 5 ? 'accepted' : 'completed', createdMinute: 0 });
    expireOrders(s, 0);
    expect(s.orders.length).toBeLessThanOrEqual(35);
    expect(s.orders.filter((o) => o.status === 'accepted')).toHaveLength(5);
  });
});

describe('adversarial: typed names cannot carry markup', () => {
  it('nameRecipe strips markup characters and esc() neutralises what a hostile save carries', async () => {
    const { nameRecipe } = await import('../src/systems/ProductionSystem');
    const { esc } = await import('../src/ui/UIContext');
    const s = createNewState();
    s.recipes['SUNSET'] = { ...computeRecipe('SUNSET', []) };
    expect(nameRecipe(s, 'SUNSET', '<img src=x onerror=alert(1)>')).toBe(true);
    expect(s.recipes['SUNSET'].customName).not.toMatch(/[<>&"'`]/);
    expect(nameRecipe(s, 'SUNSET', '<>')).toBe(false);
    expect(esc('<b>&"x')).toBe('&lt;b&gt;&amp;&quot;x');
  });
});

describe('adversarial: time jumps', () => {
  it('the dealer plays the rounds a sleep or arrest skipped, capped', () => {
    const s = createNewState();
    s.cash = 5000;
    hireDealer(s, 1000);
    s.recipes['SUNSET'] = { ...computeRecipe('SUNSET', []) };
    addItem(s, 'pkg:SUNSET', 40);
    giveDealerStock(s, 'pkg:SUNSET', 40);
    assignDealerCustomer(s, 'tasha');
    const start = s.dealer!.lastTickMinute;
    const r = tickDealer(s, start + 12 * 60, () => 0.1);
    expect(r.sales.length).toBe(8);
    expect(s.dealer!.sales).toBe(8);
    expect(tickDealer(s, start + 12 * 60 + 10, () => 0.1).sales.length).toBe(0);
  });
});

describe('design: customer wallets', () => {
  it('a corner customer cannot afford top-shelf product until the relationship is there', () => {
    const s = createNewState();
    s.cash = 5000;
    hireDealer(s, 1000);
    const rich = computeRecipe('NEON', ['mod_sparks', 'mod_glow', 'mod_solar']);
    s.recipes[rich.key] = { ...rich };
    addItem(s, 'pkg:' + rich.key, 10);
    giveDealerStock(s, 'pkg:' + rich.key, 10);
    assignDealerCustomer(s, 'tasha');
    const start = s.dealer!.lastTickMinute;
    const r0 = tickDealer(s, start + 100, () => 0.1);
    expect(r0.sales).toEqual([]);
    expect(r0.tooPricey).toEqual(['tasha']);
    s.customers.tasha.relationship = 40;
    const r1 = tickDealer(s, start + 200, () => 0.1);
    expect(r1.sales.length).toBe(1);
    expect(r1.sales[0].qty).toBe(1);
  });
});
