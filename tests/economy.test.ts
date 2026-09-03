import { describe, it, expect } from 'vitest';
import { createNewState } from '../src/systems/SaveSystem';
import { buyFromShop } from '../src/systems/EconomySystem';
import { countItem, addItem, spaceFor, depositToStorage, withdrawFromStorage, storageCount } from '../src/systems/InventorySystem';

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
