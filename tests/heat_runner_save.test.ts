import { describe, it, expect } from 'vitest';
import { createNewState, serialize, deserialize } from '../src/systems/SaveSystem';
import { addItem, countItem, storageAdd, storageCount } from '../src/systems/InventorySystem';
import { witnessedDeal, decayHeat, applyArrest, heatLevel } from '../src/systems/HeatSystem';
import { hireRunner, assignRunner, tickRunner, runnerTripSeconds } from '../src/systems/RunnerSystem';
import { generateOrder, acceptOrder } from '../src/systems/OrderSystem';
import { computeRecipe } from '../src/data/products';

const seq = (vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};

describe('heat', () => {
  it('rises after a witnessed deal and decays over time', () => {
    const s = createNewState();
    witnessedDeal(s, 60);
    expect(s.heat).toBeGreaterThan(25);
    expect(heatLevel(s.heat)).not.toBe('calm');
    const before = s.heat;
    decayHeat(s, 10, { atSafehouse: false, hidden: false });
    expect(s.heat).toBeLessThan(before);
    decayHeat(s, 100, { atSafehouse: true, hidden: false });
    expect(s.heat).toBe(0);
  });

  it('arrest confiscates contraband only, fines, and keeps the state usable', () => {
    const s = createNewState();
    s.cash = 200;
    s.heat = 90;
    addItem(s, 'pkg:SUNSET', 3);
    addItem(s, 'prod:VELVET', 2);
    addItem(s, 'baggies', 5);
    addItem(s, 'pulp_sunset', 2);
    const r = applyArrest(s);
    expect(r.confiscated.map((c) => c.id).sort()).toEqual(['pkg:SUNSET', 'prod:VELVET']);
    expect(countItem(s, 'baggies')).toBe(5);
    expect(countItem(s, 'pulp_sunset')).toBe(2);
    expect(s.cash).toBe(170);
    expect(s.heat).toBe(0);
    expect(s.stats.arrests).toBe(1);
    expect(s.inventory.length).toBe(8);
  });

  it('arrest never drives cash negative', () => {
    const s = createNewState();
    s.cash = 10;
    applyArrest(s);
    expect(s.cash).toBe(0);
  });
});

describe('runner automation', () => {
  it('runner completes an assigned order from storage and takes a cut', () => {
    const s = createNewState();
    s.cash = 1000;
    expect(hireRunner(s, 600)).toBe(true);
    expect(s.cash).toBe(400);
    const o = generateOrder(s, { now: s.clockMinutes, customerId: 'moe', simple: true, rng: seq([0.1]) })!;
    acceptOrder(s, o.id);
    s.recipes['SUNSET'] = { ...computeRecipe('SUNSET', []) };
    storageAdd(s, 'safehouse', 'pkg:SUNSET', o.qty + 2);
    const a = assignRunner(s, o.id);
    expect(a.ok).toBe(true);
    expect(o.status).toBe('runner');
    expect(storageCount(s, 'safehouse', 'pkg:SUNSET')).toBe(2);
    const trip = runnerTripSeconds('safehouse', o.locationId);
    expect(tickRunner(s, trip / 2, () => 0.9).completed).toBeUndefined();
    const r = tickRunner(s, trip, () => 0.9);
    expect(r.completed).toBeDefined();
    expect(o.status).toBe('completed');
    expect(s.cash).toBe(400 + o.price - Math.round(o.price * 0.2));
    expect(s.runner!.activeOrderId).toBeNull();
    expect(s.customers['moe'].relationship).toBeGreaterThan(0);
  });

  it('runner refuses orders without stock', () => {
    const s = createNewState();
    s.cash = 1000;
    hireRunner(s, 600);
    const o = generateOrder(s, { now: s.clockMinutes, customerId: 'moe', simple: true, rng: seq([0.1]) })!;
    acceptOrder(s, o.id);
    expect(assignRunner(s, o.id).reason).toBe('no_stock');
    expect(o.status).toBe('accepted');
  });
});

describe('save / load', () => {
  it('round-trips meaningful state', () => {
    const s = createNewState();
    s.cash = 321;
    s.heat = 33;
    addItem(s, 'pkg:SUNSET', 2);
    s.recipes['SUNSET'] = { ...computeRecipe('SUNSET', []), customName: 'PALM PANIC' };
    s.customers['tasha'].relationship = 12;
    s.upgrades.push('eq_mixer');
    s.properties.push('warehouse');
    hireRunner(s, 0);
    const o = generateOrder(s, { now: s.clockMinutes, customerId: 'moe', simple: true, rng: seq([0.1]) })!;
    acceptOrder(s, o.id);
    const loaded = deserialize(serialize(s))!;
    expect(loaded).not.toBeNull();
    expect(loaded.cash).toBe(321);
    expect(loaded.heat).toBe(33);
    expect(countItem(loaded, 'pkg:SUNSET')).toBe(2);
    expect(loaded.recipes['SUNSET'].customName).toBe('PALM PANIC');
    expect(loaded.customers['tasha'].relationship).toBe(12);
    expect(loaded.upgrades).toContain('eq_mixer');
    expect(loaded.properties).toContain('warehouse');
    expect(loaded.runner?.hired).toBe(true);
    expect(loaded.orders.find((x) => x.id === o.id)?.status).toBe('accepted');
    expect(loaded.inventory.length).toBe(8);
  });

  it('rejects garbage and repairs partial saves', () => {
    expect(deserialize('not json')).toBeNull();
    expect(deserialize('{"foo":1}')).toBeNull();
    const partial = deserialize(JSON.stringify({ cash: 50, inventory: [{ id: 'baggies', qty: 2 }] }))!;
    expect(partial.cash).toBe(50);
    expect(partial.inventory.length).toBe(8);
    expect(partial.customers['tasha']).toBeDefined();
    expect(partial.properties).toEqual(['safehouse']);
  });
});

describe('runner queue', () => {
  it('queues a second order and delivers it after the first', () => {
    const s = createNewState();
    s.cash = 1000;
    hireRunner(s, 600);
    s.recipes['SUNSET'] = { ...computeRecipe('SUNSET', []) };
    storageAdd(s, 'safehouse', 'pkg:SUNSET', 20);
    const o1 = generateOrder(s, { now: s.clockMinutes, customerId: 'moe', simple: true, rng: seq([0.1]) })!;
    const o2 = generateOrder(s, { now: s.clockMinutes, customerId: 'tasha', simple: true, rng: seq([0.1]) })!;
    acceptOrder(s, o1.id);
    acceptOrder(s, o2.id);
    expect(assignRunner(s, o1.id).ok).toBe(true);
    const a2 = assignRunner(s, o2.id);
    expect(a2.ok && a2.queued).toBe(true);
    expect(s.runner!.queue).toEqual([o2.id]);
    const trip1 = runnerTripSeconds('safehouse', o1.locationId);
    expect(tickRunner(s, trip1 + 1, () => 0.9).completed?.order.id).toBe(o1.id);
    // next tick picks up the queued order
    tickRunner(s, 0.01, () => 0.9);
    expect(s.runner!.activeOrderId).toBe(o2.id);
    const trip2 = runnerTripSeconds('safehouse', o2.locationId);
    expect(tickRunner(s, trip2 + 1, () => 0.9).completed?.order.id).toBe(o2.id);
    expect(s.runner!.deliveries).toBe(2);
  });
});

describe('save repair', () => {
  it('repairs broken nested objects instead of crashing later', () => {
    const broken = deserialize(JSON.stringify({ cash: 10, inventory: [], dealer: { hired: true }, runner: { hired: true, queue: 'x' }, vehicle: { owned: true }, clockMinutes: 'abc', orders: [{ id: 7, customerId: 'moe', status: 'accepted' }], nextOrderId: 1 }))!;
    expect(broken.dealer!.stock).toEqual([]);
    expect(broken.dealer!.customers).toEqual([]);
    expect(broken.runner!.queue).toEqual([]);
    expect(Number.isFinite(broken.clockMinutes)).toBe(true);
    expect(broken.nextOrderId).toBe(8);
    expect(typeof broken.vehicle!.x).toBe('number');
  });
});

describe('second review fixes', () => {
  it('a null entry in the saved orders list does not discard the save', () => {
    const s = deserialize(JSON.stringify({ cash: 99, inventory: [], orders: [null, { id: 3, customerId: 'moe', status: 'completed' }] }))!;
    expect(s).not.toBeNull();
    expect(s.cash).toBe(99);
    expect(s.orders).toHaveLength(1);
    expect(s.nextOrderId).toBe(4);
  });

  it('runner deliveries count toward customer boredom streaks', () => {
    const s = createNewState();
    s.cash = 1000;
    hireRunner(s, 600);
    s.recipes['SUNSET'] = { ...computeRecipe('SUNSET', []) };
    storageAdd(s, 'safehouse', 'pkg:SUNSET', 20);
    const o = generateOrder(s, { now: s.clockMinutes, customerId: 'moe', simple: true, rng: seq([0.1]) })!;
    acceptOrder(s, o.id);
    assignRunner(s, o.id);
    expect(o.runnerFrom).toBe('safehouse');
    tickRunner(s, runnerTripSeconds('safehouse', o.locationId) + 1, () => 0.9);
    expect(s.customers['moe'].lastRecipe).toBe('SUNSET');
    expect(s.customers['moe'].sameStreak).toBe(1);
  });
});

describe('save version migration', () => {
  it('drops player positions from saves older than the back-room resize', () => {
    const old = deserialize(JSON.stringify({ version: 1, cash: 10, inventory: [], player: { x: -39, y: 0, z: 15, yaw: 0 } }))!;
    expect(old.player.x).not.toBe(-39);
    const current = createNewState();
    current.player = { x: -20, y: 0, z: 12, yaw: 1 };
    expect(deserialize(serialize(current))!.player.x).toBe(-20);
  });
});
