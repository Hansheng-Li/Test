import { describe, it, expect } from 'vitest';
import { createNewState } from '../src/systems/SaveSystem';
import { storageAdd, storageCount } from '../src/systems/InventorySystem';
import { hireWorker, assignWorkerRecipe, tickWorker, WORKER_SECONDS_PER_UNIT } from '../src/systems/WorkerSystem';

describe('production worker automation', () => {
  it('converts stored supplies into packaged product over time', () => {
    const s = createNewState();
    s.cash = 1000;
    s.properties.push('warehouse');
    expect(hireWorker(s, 900, 'warehouse')).toBe(true);
    expect(assignWorkerRecipe(s, 'SUNSET+mod_flux')).toBe(true);
    storageAdd(s, 'warehouse', 'pulp_sunset', 2);
    storageAdd(s, 'warehouse', 'mod_flux', 1);
    storageAdd(s, 'warehouse', 'baggies', 5);
    expect(tickWorker(s, WORKER_SECONDS_PER_UNIT / 2).produced).toBeUndefined();
    const r = tickWorker(s, WORKER_SECONDS_PER_UNIT);
    expect(r.produced?.packaged).toBe(true);
    expect(storageCount(s, 'warehouse', 'pkg:SUNSET+mod_flux')).toBe(1);
    expect(storageCount(s, 'warehouse', 'pulp_sunset')).toBe(1);
    expect(storageCount(s, 'warehouse', 'mod_flux')).toBe(0);
    expect(storageCount(s, 'warehouse', 'baggies')).toBe(4);
    // out of modifiers: blocked, nothing consumed
    expect(tickWorker(s, WORKER_SECONDS_PER_UNIT * 2).blocked).toBe('no_mods');
    expect(storageCount(s, 'warehouse', 'pulp_sunset')).toBe(1);
  });

  it('produces loose product when there are no baggies', () => {
    const s = createNewState();
    s.cash = 1000;
    hireWorker(s, 0, 'safehouse');
    assignWorkerRecipe(s, 'VELVET');
    storageAdd(s, 'safehouse', 'wax_velvet', 1);
    const r = tickWorker(s, WORKER_SECONDS_PER_UNIT + 0.1);
    expect(r.produced?.packaged).toBe(false);
    expect(storageCount(s, 'safehouse', 'prod:VELVET')).toBe(1);
  });
});
