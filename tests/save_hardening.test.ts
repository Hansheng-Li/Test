import { describe, it, expect } from 'vitest';
import { deserialize } from '../src/systems/SaveSystem';
import { CUSTOMER_MAP } from '../src/data/customers';

/** Adversarial saves: hand-edited or truncated files must load into a state every system can tick. */
describe('save hardening', () => {
  const hostile = {
    cash: 100,
    inventory: [{ id: 'nope', qty: -3 }, { id: 5 }, null, 'x'],
    placedStations: [{ id: 1 }, { kind: 'prep_table' }, null, { id: 'p', kind: 'bogus', x: 'a', z: null, rot: 9 }, { id: 'ok', kind: 'storage', x: 1, z: 2, rot: 0 }],
    recipes: { K: null, L: { base: 'x' }, M: { base: 'SUNSET', mods: [] } },
    customers: { ghost: { unlocked: true }, tasha: { relationship: 'NaN' } },
    dealer: { hired: true, customers: ['ghost', 'tasha', 5], stock: [{ id: 'pkg:???', qty: 2 }, { id: 'x', qty: 'y' }], cash: '12' },
    worker: { hired: true, recipeKey: 'nope', property: 'mars' },
    vehicle: { owned: true, x: 'NaN', z: null },
    runner: { hired: true, queue: [999, 'a', 3], activeOrderId: 999 },
    orders: [
      { id: 3, customerId: 'ghost', status: 'accepted', qty: 2 },
      { id: 3, customerId: 'tasha', status: 'pending' },
      { id: 4, customerId: 'moe', status: 'accepted', base: 'bogus', qty: -1, price: 'x' },
      { id: 5, customerId: 'moe', status: 'teleported' },
    ],
    clockMinutes: -500,
    heat: 'hot',
    upgrades: ['bogus', 'eq_scanner'],
    properties: ['safehouse', 'mars'],
    storage: { safehouse: [{ id: 'pkg:SUNSET', qty: 0 }, { id: 'baggies', qty: 3 }], mars: 'x' },
    trend: { effect: 'NOPE', day: 1 },
    event: { id: 'rival', day: 1, param: 'ghost' },
    stats: { sales: 'a' },
  };

  it('drops or repairs every hostile field without throwing', () => {
    const s = deserialize(JSON.stringify(hostile))!;
    expect(s).not.toBeNull();
    expect(s.inventory.filter(Boolean)).toEqual([]);
    expect(s.placedStations).toEqual([{ id: 'ok', kind: 'storage', x: 1, z: 2, rot: 0 }]);
    expect(Object.keys(s.recipes)).toEqual(['M']);
    expect(s.customers.ghost).toBeUndefined();
    expect(Number.isFinite(s.customers.tasha.relationship)).toBe(true);
    expect(s.dealer!.customers).toEqual(['tasha']);
    expect(s.dealer!.stock).toEqual([]);
    expect(s.dealer!.cash).toBe(0);
    expect(s.worker!.property).toBe('warehouse');
    expect(s.worker!.recipeKey).toBeNull();
    expect(Number.isFinite(s.vehicle!.x) && Number.isFinite(s.vehicle!.z)).toBe(true);
    // unknown customer and duplicate id dropped; the moe order repaired; unknown status dropped
    // the ghost order is dropped, so the second id-3 entry (a real customer) survives; moe's is repaired
    expect(s.orders.map((o) => [o.id, o.customerId])).toEqual([[3, 'tasha'], [4, 'moe']]);
    expect(s.orders[1].qty).toBe(1);
    expect(s.orders[1].price).toBe(0);
    expect(typeof s.orders[1].base).toBe('string');
    expect(s.runner!.queue).toEqual([]);
    expect(s.runner!.activeOrderId).toBeNull();
    expect(s.clockMinutes).toBeGreaterThanOrEqual(0);
    expect(s.heat).toBe(0);
    expect(s.upgrades).toEqual(['eq_scanner']);
    expect(s.properties).toEqual(['safehouse']);
    expect(s.storage.safehouse).toEqual([{ id: 'baggies', qty: 3 }]);
    expect(s.storage.mars).toEqual([]);
    expect(s.trend).toBeNull();
    expect(s.event!.id).toBe('none');
    expect(s.stats.sales).toBe(0);
    for (const id of Object.keys(s.customers)) expect(CUSTOMER_MAP[id]).toBeDefined();
  });

  it('keeps a legitimate queued runner order', () => {
    const s = deserialize(JSON.stringify({ cash: 1, inventory: [], runner: { hired: true, queue: [9], activeOrderId: null }, orders: [{ id: 9, customerId: 'moe', status: 'accepted', base: 'SUNSET', qty: 1, price: 30, locationId: 'pier' }] }))!;
    expect(s.runner!.queue).toEqual([9]);
  });
});

describe('save hardening: names', () => {
  it('strips markup from crew and product names carried by a save', () => {
    const s = deserialize(JSON.stringify({ cash: 1, inventory: [], crewName: '<img src=x>CREW', recipes: { SUNSET: { key: 'SUNSET', base: 'SUNSET', mods: [], effects: ['ENERGY'], value: 24, customName: '<b>X</b>' } } }))!;
    expect(s.crewName).toBe('img src=xCREW');
    expect(s.recipes['SUNSET'].customName).toBe('bX/b');
  });
});
