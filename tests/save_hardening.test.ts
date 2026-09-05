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
    expect(deserialize(JSON.stringify({ cash: 1, inventory: [], dealer: { hired: true, stock: [{ id: 'prod:SUNSET', qty: 2 }, { id: 'baggies', qty: 3 }] }, recipes: { SUNSET: { key: 'SUNSET', base: 'SUNSET', mods: [], effects: ['ENERGY'], value: 24 } } }))!.dealer!.stock).toEqual([]);
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
    const s = deserialize(JSON.stringify({ cash: 1, inventory: [], runner: { hired: true, queue: [9], activeOrderId: null }, orders: [{ id: 9, customerId: 'moe', status: 'runner', base: 'SUNSET', qty: 1, price: 30, locationId: 'pier' }] }))!;
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

describe('save hardening: round trips keep legitimate state', () => {
  it('loose product survives a save/load round trip', async () => {
    const { createNewState, serialize } = await import('../src/systems/SaveSystem');
    const { addItem, countItem, storageAdd, storageCount } = await import('../src/systems/InventorySystem');
    const { executePrep } = await import('../src/systems/ProductionSystem');
    const s = createNewState();
    addItem(s, 'pulp_sunset', 3);
    expect(executePrep(s, { inputItem: 'pulp_sunset', mods: [], units: 3 }).ok).toBe(true);
    storageAdd(s, 'safehouse', 'prod:SUNSET', 2);
    const back = deserialize(serialize(s))!;
    expect(countItem(back, 'prod:SUNSET')).toBe(countItem(s, 'prod:SUNSET'));
    expect(storageCount(back, 'safehouse', 'prod:SUNSET')).toBe(2);
  });

  it('a queued runner order survives a round trip and orphaned runner orders are re-queued', async () => {
    const { createNewState, serialize } = await import('../src/systems/SaveSystem');
    const { hireRunner, assignRunner } = await import('../src/systems/RunnerSystem');
    const { generateOrder, acceptOrder } = await import('../src/systems/OrderSystem');
    const { storageAdd } = await import('../src/systems/InventorySystem');
    const { computeRecipe } = await import('../src/data/products');
    const s = createNewState();
    s.cash = 1000;
    hireRunner(s, 600);
    s.recipes['SUNSET'] = { ...computeRecipe('SUNSET', []) };
    storageAdd(s, 'safehouse', 'pkg:SUNSET', 20);
    const o1 = generateOrder(s, { now: s.clockMinutes, customerId: 'moe', simple: true, rng: () => 0.1 })!;
    const o2 = generateOrder(s, { now: s.clockMinutes, customerId: 'tasha', simple: true, rng: () => 0.1 })!;
    acceptOrder(s, o1.id);
    acceptOrder(s, o2.id);
    assignRunner(s, o1.id);
    assignRunner(s, o2.id);
    const back = deserialize(serialize(s))!;
    expect(back.runner!.activeOrderId).toBe(o1.id);
    expect(back.runner!.queue).toEqual([o2.id]);
    // a save whose queue was lost still recovers the stranded order
    const lost = JSON.parse(serialize(s));
    lost.runner.queue = [];
    expect(deserialize(JSON.stringify(lost))!.runner!.queue).toEqual([o2.id]);
  });
});

describe('starter car in saves', () => {
  it('a new run parks the hatchback outside the back room', async () => {
    const { createNewState } = await import('../src/systems/SaveSystem');
    const { STARTER_CAR_SPOT } = await import('../src/data/city');
    expect(createNewState().starterCar).toEqual({ x: STARTER_CAR_SPOT.x, z: STARTER_CAR_SPOT.z, yaw: STARTER_CAR_SPOT.yaw });
  });

  it('saves without a starter car, or with a broken one, get it back at the door', async () => {
    const { createNewState, serialize, deserialize } = await import('../src/systems/SaveSystem');
    const { STARTER_CAR_SPOT } = await import('../src/data/city');
    const s = createNewState();
    const raw = JSON.parse(serialize(s));
    delete raw.starterCar;
    expect(deserialize(JSON.stringify(raw))!.starterCar).toEqual({ x: STARTER_CAR_SPOT.x, z: STARTER_CAR_SPOT.z, yaw: STARTER_CAR_SPOT.yaw });
    raw.starterCar = { x: 'nope', z: 12, yaw: null };
    const b = deserialize(JSON.stringify(raw))!.starterCar;
    expect(b.x).toBe(STARTER_CAR_SPOT.x);
    expect(b.z).toBe(12);
    expect(b.yaw).toBe(STARTER_CAR_SPOT.yaw);
  });
});

describe('stolen cars in saves', () => {
  it('keeps only well-formed, unique, recent entries', async () => {
    const { createNewState, serialize, deserialize, MAX_STOLEN_CARS } = await import('../src/systems/SaveSystem');
    const s = createNewState();
    const raw = JSON.parse(serialize(s));
    raw.stolenCars = [
      { spot: 3, model: 'taxi', x: 1, z: 2, yaw: 0.5 },
      { spot: 3, model: 'sedan', x: 9, z: 9, yaw: 0 }, // duplicate spot: dropped
      { spot: -1, model: 'sedan', x: 0, z: 0, yaw: 0 }, // bad spot
      { spot: 4, model: 7, x: 0, z: 0, yaw: 0 }, // bad model
      { spot: 5, model: 'van', paint: 'red', x: 'NaN', z: null, yaw: 1 }, // bad paint / numbers
      null,
      { spot: 6, model: 'suv', paint: '#123abc', x: 3, z: 4, yaw: 2 },
      { spot: 7, model: 'suv', x: 3, z: 4, yaw: 2 },
      { spot: 8, model: 'suv', x: 3, z: 4, yaw: 2 },
    ];
    const out = deserialize(JSON.stringify(raw))!.stolenCars;
    expect(out.length).toBe(MAX_STOLEN_CARS);
    // 3, 5, 6, 7, 8 survive the filters; only the newest MAX_STOLEN_CARS stay
    expect(out.map((c) => c.spot)).toEqual([3, 5, 6, 7, 8].slice(-MAX_STOLEN_CARS));
    const five = out.find((c) => c.spot === 5)!;
    expect(five.paint).toBeUndefined();
    expect(five.x).toBe(0);
    expect(five.z).toBe(0);
    expect(out.find((c) => c.spot === 6)!.paint).toBe('#123abc');
  });

  it('a save without the field loads with none', async () => {
    const { createNewState, serialize, deserialize } = await import('../src/systems/SaveSystem');
    const raw = JSON.parse(serialize(createNewState()));
    delete raw.stolenCars;
    expect(deserialize(JSON.stringify(raw))!.stolenCars).toEqual([]);
  });
});

describe('tracked task in saves', () => {
  it('keeps a valid tracker and drops broken ones', async () => {
    const { createNewState, serialize, deserialize } = await import('../src/systems/SaveSystem');
    const base = JSON.parse(serialize(createNewState()));
    const load = (tracked: unknown) => deserialize(JSON.stringify({ ...base, tracked }))!.tracked;
    expect(load({ kind: 'goal', id: 'runner' })).toEqual({ kind: 'goal', id: 'runner' });
    expect(load({ kind: 'order', orderId: 3 })).toEqual({ kind: 'order', orderId: 3 });
    expect(load({ kind: 'place', x: 1, z: 2, label: 'Map marker' })).toEqual({ kind: 'place', x: 1, z: 2, label: 'Map marker' });
    expect(load({ kind: 'step' })).toEqual({ kind: 'step' });
    expect(load({ kind: 'place', label: 'no coords' })).toBeNull();
    expect(load({ kind: 'order' })).toBeNull();
    expect(load({ kind: 'goal' })).toBeNull();
    expect(load({ kind: 'nope', id: 'x' })).toBeNull();
    expect(load('garbage')).toBeNull();
    expect(load(undefined)).toBeNull();
    const long = load({ kind: 'place', x: 0, z: 0, label: 'x'.repeat(500) }) as { label: string };
    expect(long.label.length).toBe(60);
  });
});
