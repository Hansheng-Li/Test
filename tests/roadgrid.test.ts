import { describe, it, expect } from 'vitest';
import { roadDistance, onRoadGrid, clampToRoad } from '../src/systems/RoadGrid';
import { ROADS_X, ROADS_Z, ROAD_WIDTH } from '../src/data/city';

describe('road grid', () => {
  it('knows the road surface from the blocks', () => {
    expect(roadDistance(ROADS_X[2], 12)).toBe(0);
    expect(roadDistance(-20, ROADS_Z[1])).toBe(0);
    expect(roadDistance(ROADS_X[2] + ROAD_WIDTH / 2 + 4, 12)).toBeCloseTo(4);
    expect(onRoadGrid(-20, 14)).toBe(false); // the back room sits inside a block
    expect(onRoadGrid(-47, -97)).toBe(true); // the cruiser's lane
  });

  it('keeps a point on a road band and slides an off-road point onto the nearer one', () => {
    expect(clampToRoad(33, 12)).toEqual({ x: 33, z: 12 });
    expect(clampToRoad(-20, -32)).toEqual({ x: -20, z: -32 });
    // the back room: 30 m from the x=-50 road, 26 m from the z=40 road, so it slides onto the z road
    expect(clampToRoad(-20, 14)).toEqual({ x: -20, z: 35.5 });
    const d = clampToRoad(36, 20);
    expect(d).toEqual({ x: 34.5, z: 20 });
  });
});
