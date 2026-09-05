import { describe, it, expect } from 'vitest';
import { createNewState } from '../src/systems/SaveSystem';
import { eventSlot, rollWorldEvent, shopPriceMultiplier, orderPriceMultiplier, heatMultiplier, applyInspection, rivalTarget, winBackFromRival, curfewExtraPolice } from '../src/systems/EventSystem';
import { generateOrder, streetSale, acceptOrder, completeSale } from '../src/systems/OrderSystem';
import { addItem } from '../src/systems/InventorySystem';
import { computeRecipe } from '../src/data/products';
import { buyFromShop, shopPrice } from '../src/systems/EconomySystem';

describe('world events', () => {
  it('are deterministic per day and start on day 2', () => {
    const a = createNewState();
    const b = createNewState();
    b.seed = a.seed; // same save seed -> same calendar; different saves get different ones
    expect(rollWorldEvent(a, 1)).toBeNull();
    for (let d = 2; d < 12; d++) {
      rollWorldEvent(a, d);
      rollWorldEvent(b, d);
      expect(a.event).toEqual(b.event);
    }
  });

  it('shortage doubles the supplier price for that supply only', () => {
    const s = createNewState();
    s.cash = 100;
    s.event = { id: 'shortage', day: 3, param: 'pulp_sunset' };
    expect(shopPriceMultiplier(s, 'pulp_sunset')).toBe(2);
    expect(shopPrice(s, 'supplier', 'pulp_sunset')).toBe(18);
    expect(shopPrice(s, 'supplier', 'wax_velvet')).toBe(14);
    buyFromShop(s, 'supplier', 'pulp_sunset', 1);
    expect(s.cash).toBe(82);
  });

  it('club night and crackdown multipliers apply to the right zone/time', () => {
    const s = createNewState();
    s.event = { id: 'club_night', day: 3 };
    expect(orderPriceMultiplier(s, 'beach', true)).toBe(1.3);
    expect(orderPriceMultiplier(s, 'beach', false)).toBe(1);
    expect(orderPriceMultiplier(s, 'downtown', true)).toBe(1);
    s.event = { id: 'crackdown', day: 3, param: 'docks' };
    expect(heatMultiplier(s, 'docks')).toBe(1.6);
    expect(heatMultiplier(s, 'beach')).toBe(1);
  });
});

describe('warehouse inspection', () => {
  it('seizes a quarter of stored contraband and leaves supplies alone', () => {
    const s = createNewState();
    s.properties.push('warehouse');
    s.storage.warehouse = [{ id: 'pkg:SUNSET', qty: 8 }, { id: 'prod:VELVET', qty: 1 }, { id: 'baggies', qty: 20 }];
    const r = applyInspection(s);
    expect(r.seized).toBe(3);
    expect(s.storage.warehouse).toEqual([{ id: 'pkg:SUNSET', qty: 6 }, { id: 'baggies', qty: 20 }]);
    expect(s.suspicion).toBe(10);
  });

  it('rolls for warehouse owners with a reputation on an inspection day', () => {
    let found = false;
    for (let d = 2; d < 200 && !found; d++) {
      const s = createNewState();
      s.properties.push('warehouse');
      s.suspicion = 40;
      rollWorldEvent(s, d);
      if (s.event!.id === 'inspection') found = true;
    }
    expect(found).toBe(true);
  });

  it('only rolls for warehouse owners with a reputation', () => {
    for (let d = 2; d < 40; d++) {
      const s = createNewState();
      rollWorldEvent(s, d);
      expect(s.event!.id).not.toBe('inspection');
    }
  });
});

describe('rival crew', () => {
  it('blocks pages from the courted customer until a street deal wins them back', () => {
    const s = createNewState();
    for (const c of Object.values(s.customers)) c.unlocked = true;
    let day = 2;
    while (day < 300) {
      const t = createNewState();
      t.seed = s.seed;
      for (const c of Object.values(t.customers)) c.unlocked = true;
      rollWorldEvent(t, day);
      if (t.event!.id === 'rival') break;
      day++;
    }
    rollWorldEvent(s, day);
    expect(s.event!.id).toBe('rival');
    const target = rivalTarget(s)!;
    expect(target).toBeTruthy();
    expect(generateOrder(s, { now: 5000, customerId: target, simple: true, rng: () => 0.1 })).toBeNull();
    s.recipes['SUNSET'] = { ...computeRecipe('SUNSET', []) };
    addItem(s, 'pkg:SUNSET', 2);
    const r = streetSale(s, target, 5000, () => 0.9);
    expect(r.ok && r.wonBack).toBe(true);
    expect(rivalTarget(s)).toBeNull();
    expect(winBackFromRival(s, target)).toBe(false);
  });
});

describe('rival win-back through a pager deal', () => {
  it('an in-person pager sale also wins the customer back', () => {
    const s = createNewState();
    const o = generateOrder(s, { now: 1000, customerId: 'moe', simple: true, rng: () => 0.1 })!;
    acceptOrder(s, o.id);
    s.event = { id: 'rival', day: s.clockMinutes / 1440, param: 'moe' };
    s.event.day = Math.floor(s.event.day);
    expect(rivalTarget(s)).toBe('moe');
    s.recipes['SUNSET'] = { ...computeRecipe('SUNSET', []) };
    addItem(s, 'pkg:SUNSET', o.qty);
    const r = completeSale(s, o.id, 1000);
    expect(r.ok && r.wonBack).toBe(true);
    expect(rivalTarget(s)).toBeNull();
    expect(s.event!.wonBack).toBe(true);
  });
});

describe('per-save seed', () => {
  it('the first afternoon has no event, the first evening can', () => {
    expect(eventSlot(1, 15)).toBe(2);
    expect(eventSlot(1, 20)).toBe(3);
    expect(eventSlot(2, 9)).toBe(4);
  });

  it('different saves see different event calendars', () => {
    const ids = new Set<string>();
    for (let seed = 0; seed < 12; seed++) {
      const s = createNewState();
      s.seed = seed;
      rollWorldEvent(s, 4);
      ids.add(s.event!.id);
    }
    expect(ids.size).toBeGreaterThan(1);
  });
});

describe('event slots', () => {
  it('the night slot runs 20:00-05:59 and belongs to the day it started; club nights only at night, rivals only by day', () => {
    expect(eventSlot(3, 20)).toBe(7);
    expect(eventSlot(4, 2)).toBe(7);
    expect(eventSlot(4, 6)).toBe(8);
    for (let seed = 0; seed < 40; seed++) {
      const s = createNewState();
      s.seed = seed;
      for (const c of Object.values(s.customers)) c.unlocked = true;
      for (let slot = 4; slot < 30; slot++) {
        rollWorldEvent(s, slot);
        if (s.event!.id === 'club_night') expect(slot % 2).toBe(1);
        if (s.event!.id === 'rival') expect(slot % 2).toBe(0);
      }
    }
  });

  it('a v2 save keyed by calendar day keeps its event on load', async () => {
    const { deserialize } = await import('../src/systems/SaveSystem');
    const s = deserialize(JSON.stringify({ version: 2, cash: 1, inventory: [], clockMinutes: 3 * 24 * 60 + 10 * 60, event: { id: 'rival', day: 3, param: 'tasha', wonBack: true } }))!;
    expect(s.event).toEqual({ id: 'rival', day: 6, param: 'tasha', wonBack: true });
    expect(rollWorldEvent(s, eventSlot(3, 10))).toBeNull();
  });
});

describe('curfew', () => {
  it('only falls on night slots from the fourth night and never before', () => {
    let seen = 0;
    for (let seed = 0; seed < 60; seed++) {
      const s = createNewState();
      s.seed = seed;
      for (let slot = 3; slot < 40; slot++) {
        rollWorldEvent(s, slot);
        if (s.event!.id === 'curfew') {
          seen++;
          expect(slot % 2).toBe(1);
          expect(slot).toBeGreaterThanOrEqual(8);
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('raises heat everywhere, pays more after dark and adds two patrols', () => {
    const s = createNewState();
    s.event = { id: 'curfew', day: 9 };
    expect(heatMultiplier(s, 'beach')).toBe(1.5);
    expect(heatMultiplier(s, 'docks')).toBe(1.5);
    expect(orderPriceMultiplier(s, 'downtown', true)).toBe(1.2);
    expect(orderPriceMultiplier(s, 'downtown', false)).toBe(1);
    expect(curfewExtraPolice(s)).toBe(2);
    s.event = { id: 'none', day: 10 };
    expect(curfewExtraPolice(s)).toBe(0);
  });
});
