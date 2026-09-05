/**
 * Extremely small AABB collision world. Everything solid in the city is an
 * axis-aligned box. Characters are boxes too. This keeps the game deterministic,
 * dependency-free and fast enough for ~30 NPCs.
 */
export interface AABB {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  /** Tag for debugging / filtering. */
  tag?: string;
}

export function aabbFromCenter(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, tag?: string): AABB {
  return {
    minX: cx - sx / 2,
    maxX: cx + sx / 2,
    minY: cy - sy / 2,
    maxY: cy + sy / 2,
    minZ: cz - sz / 2,
    maxZ: cz + sz / 2,
    tag,
  };
}

export function aabbFromBottom(cx: number, bottomY: number, cz: number, sx: number, sy: number, sz: number, tag?: string): AABB {
  return aabbFromCenter(cx, bottomY + sy / 2, cz, sx, sy, sz, tag);
}

export class CollisionWorld {
  boxes: AABB[] = [];
  /** Coarse grid for broad phase. */
  private cell = 16;
  private grid = new Map<string, AABB[]>();

  add(box: AABB): AABB {
    this.boxes.push(box);
    this.index(box);
    return box;
  }

  remove(box: AABB): void {
    const i = this.boxes.indexOf(box);
    if (i >= 0) this.boxes.splice(i, 1);
    this.rebuild();
  }

  removeMany(boxes: AABB[]): void {
    const set = new Set(boxes);
    this.boxes = this.boxes.filter((b) => !set.has(b));
    this.rebuild();
  }

  rebuild(): void {
    this.grid.clear();
    for (const b of this.boxes) this.index(b);
  }

  private key(ix: number, iz: number): string {
    return ix + ',' + iz;
  }

  private index(b: AABB): void {
    const x0 = Math.floor(b.minX / this.cell);
    const x1 = Math.floor(b.maxX / this.cell);
    const z0 = Math.floor(b.minZ / this.cell);
    const z1 = Math.floor(b.maxZ / this.cell);
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const k = this.key(x, z);
        let arr = this.grid.get(k);
        if (!arr) {
          arr = [];
          this.grid.set(k, arr);
        }
        arr.push(b);
      }
  }

  query(minX: number, minZ: number, maxX: number, maxZ: number, out: AABB[] = []): AABB[] {
    out.length = 0;
    const x0 = Math.floor(minX / this.cell);
    const x1 = Math.floor(maxX / this.cell);
    const z0 = Math.floor(minZ / this.cell);
    const z1 = Math.floor(maxZ / this.cell);
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const arr = this.grid.get(this.key(x, z));
        if (!arr) continue;
        for (const b of arr) if (!out.includes(b)) out.push(b);
      }
    return out;
  }

  /**
   * Move a box-shaped body. Resolves X and Z separately with a step-up allowance so
   * curbs, stairs and low ramps can be climbed. Returns the resolved position and
   * whether the body stands on something.
   */
  moveBody(
    pos: { x: number; y: number; z: number },
    vel: { x: number; y: number; z: number },
    halfW: number,
    height: number,
    dt: number,
    stepHeight = 0.55,
  ): { grounded: boolean; groundY: number; hitWall: boolean } {
    const tmp: AABB[] = [];
    let hitWall = false;
    const tryAxis = (axis: 'x' | 'z', delta: number): void => {
      if (delta === 0) return;
      const nx = pos.x + (axis === 'x' ? delta : 0);
      const nz = pos.z + (axis === 'z' ? delta : 0);
      const feet = pos.y + 0.02;
      const head = pos.y + height;
      this.query(nx - halfW, nz - halfW, nx + halfW, nz + halfW, tmp);
      let blocked = false;
      let stepTop = -Infinity;
      for (const b of tmp) {
        if (nx - halfW >= b.maxX || nx + halfW <= b.minX || nz - halfW >= b.maxZ || nz + halfW <= b.minZ) continue;
        if (feet >= b.maxY || head <= b.minY) continue;
        // overlap: can we step up onto it?
        if (b.maxY - pos.y <= stepHeight && b.maxY > stepTop) {
          stepTop = b.maxY;
          continue;
        }
        blocked = true;
        break;
      }
      if (blocked) {
        hitWall = true;
        return;
      }
      if (stepTop > -Infinity) {
        // ensure head room after stepping
        const newFeet = stepTop + 0.02;
        const newHead = stepTop + height;
        for (const b of tmp) {
          if (nx - halfW >= b.maxX || nx + halfW <= b.minX || nz - halfW >= b.maxZ || nz + halfW <= b.minZ) continue;
          if (newFeet >= b.maxY || newHead <= b.minY) continue;
          hitWall = true;
          return;
        }
        pos.y = stepTop;
      }
      if (axis === 'x') pos.x = nx;
      else pos.z = nz;
    };

    tryAxis('x', vel.x * dt);
    tryAxis('z', vel.z * dt);

    // vertical
    const ny = pos.y + vel.y * dt;
    this.query(pos.x - halfW, pos.z - halfW, pos.x + halfW, pos.z + halfW, tmp);
    let groundY = 0;
    let ceiling = Infinity;
    for (const b of tmp) {
      if (pos.x - halfW >= b.maxX || pos.x + halfW <= b.minX || pos.z - halfW >= b.maxZ || pos.z + halfW <= b.minZ) continue;
      if (b.maxY <= pos.y + stepHeight && b.maxY > groundY) groundY = b.maxY;
      if (b.minY >= pos.y + height * 0.5 && b.minY < ceiling) ceiling = b.minY;
    }
    let grounded = false;
    if (ny <= groundY) {
      pos.y = groundY;
      grounded = true;
    } else {
      pos.y = ny;
      if (pos.y + height > ceiling) {
        pos.y = ceiling - height;
        vel.y = Math.min(vel.y, 0);
      }
    }
    return { grounded, groundY, hitWall };
  }

  /** Cheap line-of-sight test on the XZ plane at a given height (samples along the segment). */
  lineOfSight(ax: number, ay: number, az: number, bx: number, by: number, bz: number, steps = 12): boolean {
    const tmp: AABB[] = [];
    const minX = Math.min(ax, bx), maxX = Math.max(ax, bx);
    const minZ = Math.min(az, bz), maxZ = Math.max(az, bz);
    this.query(minX, minZ, maxX, maxZ, tmp);
    if (tmp.length === 0) return true;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      const z = az + (bz - az) * t;
      for (const b of tmp) {
        if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && y > b.minY && y < b.maxY) return false;
      }
    }
    return true;
  }
}
