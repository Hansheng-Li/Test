import { describe, it, expect } from 'vitest';
import { createNewState, serialize, deserialize } from '../src/systems/SaveSystem';
import { resprayCar, carPaint } from '../src/systems/GarageSystem';
import { CAR_PAINTS, RESPRAY_PRICE } from '../src/data/city';
import { checkMilestones } from '../src/systems/MilestoneSystem';

describe('Rojas respray', () => {
  it('needs the car and the fee', () => {
    const s = createNewState();
    s.cash = 1000;
    expect(resprayCar(s).reason).toBe('no_car');
    s.vehicle = { owned: true, x: 0, z: 0, yaw: 0 };
    s.cash = RESPRAY_PRICE - 1;
    expect(resprayCar(s).reason).toBe('no_cash');
    expect(s.cash).toBe(RESPRAY_PRICE - 1);
  });

  it('cycles through the paint rack, drops heat and pays a milestone', () => {
    const s = createNewState();
    s.cash = 1000;
    s.heat = 50;
    s.vehicle = { owned: true, x: 0, z: 0, yaw: 0 };
    expect(carPaint(s)).toEqual(CAR_PAINTS[0]);
    const r = resprayCar(s);
    expect(r.ok).toBe(true);
    expect(r.paint).toBe(CAR_PAINTS[1].hex);
    expect(s.heat).toBe(20);
    expect(s.cash).toBe(1000 - RESPRAY_PRICE);
    expect(checkMilestones(s).map((m) => m.id)).toContain('respray');
    for (let i = 0; i < CAR_PAINTS.length - 1; i++) resprayCar(s);
    expect(s.vehicle.paint).toBe(CAR_PAINTS[0].hex);
    expect(s.heat).toBe(0);
  });

  it('keeps the colour across a save and drops a bad one', () => {
    const s = createNewState();
    s.cash = 1000;
    s.vehicle = { owned: true, x: 1, z: 2, yaw: 0 };
    resprayCar(s);
    expect(deserialize(serialize(s))!.vehicle!.paint).toBe(CAR_PAINTS[1].hex);
    const bad = deserialize(JSON.stringify({ cash: 1, inventory: [], vehicle: { owned: true, x: 1, z: 2, yaw: 0, paint: 'javascript:alert(1)' } }))!;
    expect(bad.vehicle!.paint).toBeUndefined();
  });
});
