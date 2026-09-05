import { describe, it, expect } from 'vitest';
import { createNewState } from '../src/systems/SaveSystem';
import { buyFromShop, sellToShop, sellPrice } from '../src/systems/EconomySystem';
import { countItem, addItem, spaceFor, depositToStorage, withdrawFromStorage, storageCount, compactInventory } from '../src/systems/InventorySystem';

describe('economy + inventory', () => {
  it('purchasing an item reduces cash and adds it to inventory', () => {
    const s = createNewState();
    s.cash = 100;
    const r = buyFromShop(s, 'supplier', 'pulp_sunset', 3);
    expect(r.ok).toBe(true);
    expect(s.cash).toBe(100 - 27);
    expect(countItem(s, 'pulp_sunset')).toBe(3);
  });

  it('purchase fails when cash is insufficient and nothing changes', () => {
    const s = createNewState();
    s.cash = 5;
    const r = buyFromShop(s, 'supplier', 'gel_neon', 1);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_cash');
    expect(s.cash).toBe(5);
    expect(countItem(s, 'gel_neon')).toBe(0);
  });

  it('equipment purchase registers an upgrade once', () => {
    const s = createNewState();
    s.cash = 1000;
    expect(buyFromShop(s, 'pawn', 'eq_mixer').ok).toBe(true);
    expect(s.upgrades).toContain('eq_mixer');
    expect(buyFromShop(s, 'pawn', 'eq_mixer').reason).toBe('owned');
    expect(s.cash).toBe(780);
  });

  it('inventory respects 8 slots and stack limits', () => {
    const s = createNewState();
    for (let i = 0; i < 8; i++) addItem(s, 'item' + i, 1);
    expect(spaceFor(s, 'pulp_sunset')).toBe(0);
    expect(addItem(s, 'pulp_sunset', 2)).toBe(2);
  });

  it('storage deposit and withdraw round-trips items', () => {
    const s = createNewState();
    addItem(s, 'baggies', 10);
    expect(depositToStorage(s, 'safehouse', 'baggies', 6)).toBe(6);
    expect(countItem(s, 'baggies')).toBe(4);
    expect(storageCount(s, 'safehouse', 'baggies')).toBe(6);
    expect(withdrawFromStorage(s, 'safehouse', 'baggies', 100)).toBe(6);
    expect(countItem(s, 'baggies')).toBe(10);
  });
});

describe('supplier delivery', () => {
  it('delivers to warehouse storage for a 20% fee, only with a warehouse', async () => {
    const { buyDelivered } = await import('../src/systems/EconomySystem');
    const { storageCount } = await import('../src/systems/InventorySystem');
    const s = createNewState();
    s.cash = 100;
    expect(buyDelivered(s, 'supplier', 'pulp_sunset', 5).reason).toBe('no_warehouse');
    s.properties.push('warehouse');
    const r = buyDelivered(s, 'supplier', 'pulp_sunset', 5);
    expect(r.ok).toBe(true);
    expect(r.spent).toBe(54);
    expect(s.cash).toBe(46);
    expect(storageCount(s, 'warehouse', 'pulp_sunset')).toBe(5);
    expect(countItem(s, 'pulp_sunset')).toBe(0);
  });
});

describe('review fixes', () => {
  it('a station kit is not sold into a full backpack', async () => {
    const { buyFromShop } = await import('../src/systems/EconomySystem');
    const s = createNewState();
    s.cash = 1000;
    s.properties.push('warehouse');
    for (let i = 0; i < 8; i++) addItem(s, 'junk' + i, 1);
    const r = buyFromShop(s, 'pawn', 'prep_station_kit');
    expect(r.reason).toBe('no_space');
    expect(s.cash).toBe(1000);
  });

  it('placed shelves only grow the warehouse capacity', async () => {
    const { storageCapacity } = await import('../src/systems/InventorySystem');
    const s = createNewState();
    s.placedStations.push({ id: 'a', kind: 'storage', x: 0, z: 0, rot: 0 });
    expect(storageCapacity(s, 'warehouse')).toBe(260);
    expect(storageCapacity(s, 'safehouse')).toBe(40);
  });
});

describe('selling back and stacking', () => {
  it('compacts split stacks into one', () => {
    const s = createNewState();
    s.inventory[0] = { id: 'baggies', qty: 17 };
    s.inventory[3] = { id: 'baggies', qty: 16 };
    s.inventory[5] = { id: 'pulp_sunset', qty: 18 };
    s.inventory[6] = { id: 'pulp_sunset', qty: 5 };
    compactInventory(s);
    expect(s.inventory[0]).toEqual({ id: 'baggies', qty: 33 });
    expect(s.inventory[3]).toBeNull();
    // pulp stacks to 20: 18 + 5 becomes 20 + 3
    expect(s.inventory[5]).toEqual({ id: 'pulp_sunset', qty: 20 });
    expect(s.inventory[6]).toEqual({ id: 'pulp_sunset', qty: 3 });
    addItem(s, 'baggies', 2);
    expect(s.inventory.filter((x) => x && x.id === 'baggies')).toHaveLength(1);
    expect(countItem(s, 'baggies')).toBe(35);
  });

  it('shops buy back listed items at half price and refuse the rest', () => {
    const s = createNewState();
    s.cash = 0;
    addItem(s, 'baggies', 10);
    expect(sellPrice(s, 'store', 'baggies')).toBe(1);
    expect(sellToShop(s, 'store', 'baggies', 4)).toBe(4);
    expect(countItem(s, 'baggies')).toBe(6);
    expect(s.cash).toBe(4);
    expect(sellToShop(s, 'store', 'baggies', 50)).toBe(6); // caps at what you hold
    expect(sellToShop(s, 'store', 'baggies', 1)).toBe(0);
    addItem(s, 'pulp_sunset', 3);
    expect(sellToShop(s, 'store', 'pulp_sunset', 1)).toBe(0); // Quick Stop does not list pulp
    expect(sellToShop(s, 'supplier', 'pulp_sunset', 2)).toBe(8); // Rico pays $4 of $9
    expect(sellPrice(s, 'pawn', 'eq_mixer')).toBe(0); // equipment is never bought back
  });
});
