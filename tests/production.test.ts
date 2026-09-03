import { describe, it, expect } from 'vitest';
import { createNewState } from '../src/systems/SaveSystem';
import { addItem, countItem } from '../src/systems/InventorySystem';
import { executePrep, executePackage, nameRecipe, recipeDisplayName } from '../src/systems/ProductionSystem';
import { computeRecipe } from '../src/data/products';

describe('production', () => {
  it('prep consumes base + modifiers and creates loose product', () => {
    const s = createNewState();
    addItem(s, 'pulp_sunset', 3);
    addItem(s, 'mod_flux', 3);
    const r = executePrep(s, { inputItem: 'pulp_sunset', mods: ['mod_flux'], units: 2 });
    expect(r.ok).toBe(true);
    expect(countItem(s, 'pulp_sunset')).toBe(1);
    expect(countItem(s, 'mod_flux')).toBe(1);
    expect(countItem(s, 'prod:SUNSET+mod_flux')).toBe(2);
    expect(s.recipes['SUNSET+mod_flux']).toBeDefined();
  });

  it('prep fails without modifiers and changes nothing', () => {
    const s = createNewState();
    addItem(s, 'pulp_sunset', 1);
    const r = executePrep(s, { inputItem: 'pulp_sunset', mods: ['mod_flux'], units: 1 });
    expect(r.ok).toBe(false);
    expect(countItem(s, 'pulp_sunset')).toBe(1);
  });

  it('modifier order changes the result deterministically', () => {
    const a = computeRecipe('VELVET', ['mod_flux', 'mod_velvet_drops']);
    const b = computeRecipe('VELVET', ['mod_velvet_drops', 'mod_flux']);
    expect(a.key).not.toBe(b.key);
    expect(a.effects).not.toEqual(b.effects);
    expect(computeRecipe('VELVET', ['mod_flux', 'mod_velvet_drops'])).toEqual(a);
  });

  it('combos add value and a default name', () => {
    const r = computeRecipe('SUNSET', ['mod_velvet_drops', 'mod_solar']);
    expect(r.effects).toContain('SOCIAL');
    expect(r.effects).toContain('CONFIDENT');
    expect(r.comboName).toBe('Beach Party');
    expect(r.value).toBeGreaterThan(computeRecipe('SUNSET', []).value * 1.5);
  });

  it('packaging consumes product + baggies and produces packaged units', () => {
    const s = createNewState();
    addItem(s, 'prod:SUNSET', 4);
    addItem(s, 'baggies', 3);
    s.recipes['SUNSET'] = { ...computeRecipe('SUNSET', []) };
    const r = executePackage(s, 'SUNSET', 4);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_bags');
    const r2 = executePackage(s, 'SUNSET', 3);
    expect(r2.ok).toBe(true);
    expect(countItem(s, 'pkg:SUNSET')).toBe(3);
    expect(countItem(s, 'prod:SUNSET')).toBe(1);
    expect(countItem(s, 'baggies')).toBe(0);
  });

  it('custom product names show up in display names', () => {
    const s = createNewState();
    s.recipes['SUNSET'] = { ...computeRecipe('SUNSET', []) };
    expect(nameRecipe(s, 'SUNSET', 'palm panic')).toBe(true);
    expect(recipeDisplayName(s, 'SUNSET')).toBe('PALM PANIC');
  });
});

describe('stir minigame bonus', () => {
  it('a well-played batch yields extra units, capped at two', () => {
    const s = createNewState();
    addItem(s, 'pulp_sunset', 2);
    const r = executePrep(s, { inputItem: 'pulp_sunset', mods: [], units: 2, bonusUnits: 5 });
    expect(r.ok).toBe(true);
    expect(countItem(s, 'prod:SUNSET')).toBe(4);
  });
});
