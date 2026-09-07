import { describe, it, expect } from 'vitest';
import { pickShot, SHOT_RANGE } from '../src/systems/ShootSystem';

describe('pistol shot', () => {
  it('hits the nearest figure on the line of fire and nothing beside it', () => {
    // facing -z from the origin
    const r = pickShot(0, 0, 0, -1, [{ x: 0, z: -12 }, { x: 0.3, z: -5 }, { x: 2, z: -6 }, { x: 0, z: 4 }]);
    expect(r).toEqual({ index: 1, dist: 5 });
  });

  it('misses beyond the range and behind the shooter', () => {
    expect(pickShot(0, 0, 0, -1, [{ x: 0, z: -SHOT_RANGE - 1 }, { x: 0, z: 3 }])).toBeNull();
  });

  it('normalises the direction', () => {
    expect(pickShot(10, 10, -3, 0, [{ x: 4, z: 10.2 }])).toEqual({ index: 0, dist: 6 });
  });

  it('a figure standing on the shooter is not hit', () => {
    expect(pickShot(0, 0, 0, -1, [{ x: 0, z: 0 }])).toBeNull();
  });
});
