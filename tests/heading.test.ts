import { describe, it, expect } from 'vitest';
import { compassAngle, mapArrowRotation, wrapAngle } from '../src/systems/Heading';

describe('heading maths', () => {
  it('wraps angles into (-π, π]', () => {
    expect(wrapAngle(0)).toBe(0);
    expect(wrapAngle(Math.PI * 2.5)).toBeCloseTo(Math.PI / 2);
    expect(wrapAngle(-Math.PI * 1.5)).toBeCloseTo(Math.PI / 2);
  });

  it('points the compass straight ahead, right, left and behind', () => {
    // yaw 0 looks toward -z; a target further along -z is straight ahead
    expect(compassAngle(0, 0, 0, 0, -10)).toBeCloseTo(0);
    // +x is on the right when facing -z
    expect(compassAngle(0, 0, 0, 10, 0)).toBeCloseTo(Math.PI / 2);
    expect(compassAngle(0, 0, 0, -10, 0)).toBeCloseTo(-Math.PI / 2);
    expect(Math.abs(compassAngle(0, 0, 0, 0, 10))).toBeCloseTo(Math.PI);
    // turn the view 90° left (yaw +π/2 looks toward -x): a target at -x is now dead ahead
    expect(compassAngle(0, 0, Math.PI / 2, -10, 0)).toBeCloseTo(0);
    expect(compassAngle(5, 5, Math.PI / 2, 5, -5)).toBeCloseTo(Math.PI / 2);
  });

  it('rotates the map arrow to the facing on a north-up map', () => {
    expect(mapArrowRotation(0)).toBeCloseTo(0); // north: arrow stays up
    expect(mapArrowRotation(-Math.PI / 2)).toBeCloseTo(Math.PI / 2); // yaw -π/2 faces +x (east): clockwise quarter turn
    expect(mapArrowRotation(Math.PI / 2)).toBeCloseTo(-Math.PI / 2); // west
    expect(Math.abs(mapArrowRotation(Math.PI))).toBeCloseTo(Math.PI); // south
  });
});
