import { describe, it, expect } from 'vitest';
import { createNewState, serialize, deserialize } from '../src/systems/SaveSystem';
import { addItem, countItem, depositToStorage, withdrawFromStorage, storageCapacity, storageCount, TRUNK_CAPACITY } from '../src/systems/InventorySystem';
import { applyArrest, searchTrunk } from '../src/systems/HeatSystem';
import { computeRecipe } from '../src/data/products';

describe('sedan trunk', () => {
  it('holds 24 units and round-trips through a save', () => {
    const s = createNewState();
    s.vehicle = { owned: true, x: 0, z: 0, yaw: 0 };
    s.recipes['SUNSET'] = { ...computeRecipe('SUNSET', []) };
    addItem(s, 'pkg:SUNSET', 30);
    expect(storageCapacity(s, 'trunk')).toBe(TRUNK_CAPACITY);
    expect(depositToStorage(s, 'trunk', 'pkg:SUNSET', 30)).toBe(TRUNK_CAPACITY);
    expect(countItem(s, 'pkg:SUNSET')).toBe(30 - TRUNK_CAPACITY);
    const loaded = deserialize(serialize(s))!;
    expect(storageCount(loaded, 'trunk', 'pkg:SUNSET')).toBe(TRUNK_CAPACITY);
    expect(withdrawFromStorage(loaded, 'trunk', 'pkg:SUNSET', 5)).toBe(5);
  });

  it('a bust next to the car pops the trunk: contraband gone, supplies stay', () => {
    const s = createNewState();
    s.cash = 100;
    s.recipes['SUNSET'] = { ...computeRecipe('SUNSET', []) };
    s.storage.trunk = [{ id: 'pkg:SUNSET', qty: 6 }, { id: 'prod:SUNSET', qty: 2 }, { id: 'baggies', qty: 9 }];
    expect(searchTrunk(s)).toBe(8);
    expect(s.storage.trunk).toEqual([{ id: 'baggies', qty: 9 }]);
    expect(searchTrunk(s)).toBe(0);
    // the arrest itself never touches the trunk: that is the game's call, by distance
    s.storage.trunk = [{ id: 'pkg:SUNSET', qty: 3 }];
    applyArrest(s);
    expect(storageCount(s, 'trunk', 'pkg:SUNSET')).toBe(3);
  });
});
