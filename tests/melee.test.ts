import { describe, it, expect } from 'vitest';
import { swingTargets, BAT_RANGE } from '../src/systems/MeleeSystem';

describe('bat swing', () => {
  // yaw 0: forward is -z
  it('hits what is in front and inside range', () => {
    const hits = swingTargets(0, 0, 0, [{ x: 0, z: -1.5 }, { x: 0, z: -BAT_RANGE - 0.1 }, { x: 0, z: 1.5 }, { x: 1.5, z: 0 }]);
    expect(hits).toEqual([0]);
  });

  it('follows the player yaw', () => {
    // yaw π/2: forward is -x
    expect(swingTargets(10, 10, Math.PI / 2, [{ x: 8.5, z: 10 }, { x: 11.5, z: 10 }])).toEqual([0]);
  });

  it('accepts targets slightly off-centre but not beside the player', () => {
    expect(swingTargets(0, 0, 0, [{ x: 0.8, z: -1.6 }, { x: 1.6, z: -0.3 }])).toEqual([0]);
  });

  it('ignores a target standing exactly on the player', () => {
    expect(swingTargets(0, 0, 0, [{ x: 0, z: 0 }])).toEqual([]);
  });
});
