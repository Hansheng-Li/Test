import { describe, it, expect } from 'vitest';
import { createNewState, serialize, deserialize } from '../src/systems/SaveSystem';
import { hireHandler, tickHandler } from '../src/systems/HandlerSystem';
import { hireDealer, dealerStockCount } from '../src/systems/DealerSystem';
import { storageAdd, storageCount } from '../src/systems/InventorySystem';
import { checkMilestones } from '../src/systems/MilestoneSystem';
import { HANDLER_INTERVAL, DEALER_MAX_STOCK } from '../src/data/items';
import { computeRecipe } from '../src/data/products';

function setup(): ReturnType<typeof createNewState> {
  const s = createNewState();
  s.cash = 5000;
  s.properties.push('warehouse');
  s.storage.warehouse = [];
  hireDealer(s, 1000);
  s.recipes['SUNSET'] = { ...computeRecipe('SUNSET', []) };
  return s;
}

describe('handler', () => {
  it('needs a warehouse and a dealer before he takes the job', () => {
    const s = createNewState();
    s.cash = 5000;
    expect(hireHandler(s, 1100)).toBe(false);
    s.properties.push('warehouse');
    expect(hireHandler(s, 1100)).toBe(false);
    hireDealer(s, 1000);
    expect(hireHandler(s, 1100)).toBe(true);
    expect(s.cash).toBe(5000 - 1000 - 1100);
    expect(hireHandler(s, 1100)).toBe(false);
  });

  it('carries up to 20 packaged units an hour from the warehouse to Vince', () => {
    const s = setup();
    hireHandler(s, 1100);
    storageAdd(s, 'warehouse', 'pkg:SUNSET', 30);
    storageAdd(s, 'warehouse', 'baggies', 10);
    expect(tickHandler(s, s.clockMinutes + HANDLER_INTERVAL - 1, () => 0.9)).toEqual({});
    const r = tickHandler(s, s.clockMinutes + HANDLER_INTERVAL, () => 0.9);
    expect(r.moved).toBe(20);
    expect(dealerStockCount(s)).toBe(20);
    expect(storageCount(s, 'warehouse', 'pkg:SUNSET')).toBe(10);
    expect(storageCount(s, 'warehouse', 'baggies')).toBe(10);
    const r2 = tickHandler(s, s.clockMinutes + HANDLER_INTERVAL * 2, () => 0.9);
    expect(r2.moved).toBe(10);
    expect(tickHandler(s, s.clockMinutes + HANDLER_INTERVAL * 3, () => 0.9).idle).toBe('no_stock');
    expect(s.handler!.moved).toBe(30);
    expect(checkMilestones(s).map((m) => m.id)).toContain('handler');
  });

  it('stops when Vince is full and replays missed rounds after a sleep without mishaps', () => {
    const s = setup();
    hireHandler(s, 1100);
    storageAdd(s, 'warehouse', 'pkg:SUNSET', 100);
    const r = tickHandler(s, s.clockMinutes + HANDLER_INTERVAL * 5, () => 0.0);
    expect(r.moved).toBe(DEALER_MAX_STOCK);
    expect(r.idle).toBe('dealer_full');
    expect(r.lost).toBeUndefined();
    expect(dealerStockCount(s)).toBe(DEALER_MAX_STOCK);
  });

  it('a live trip can be stopped by police: units lost, suspicion up', () => {
    const s = setup();
    hireHandler(s, 1100);
    storageAdd(s, 'warehouse', 'pkg:SUNSET', 5);
    const r = tickHandler(s, s.clockMinutes + HANDLER_INTERVAL, () => 0.01);
    expect(r.lost).toBe(5);
    expect(r.moved).toBeUndefined();
    expect(dealerStockCount(s)).toBe(0);
    expect(s.suspicion).toBe(5);
  });

  it('survives a save round trip and repairs junk', () => {
    const s = setup();
    hireHandler(s, 1100);
    expect(deserialize(serialize(s))!.handler).toEqual(s.handler);
    const junk = deserialize(JSON.stringify({ cash: 1, inventory: [], handler: { hired: true, trips: 'x' } }))!;
    expect(junk.handler).toEqual({ hired: true, name: 'Teddy', lastTickMinute: junk.clockMinutes, trips: 0, moved: 0 });
    expect(deserialize(JSON.stringify({ cash: 1, inventory: [], handler: { hired: false } }))!.handler).toBeNull();
  });
});
