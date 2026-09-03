import { ROADS_X, ROADS_Z, ROAD_WIDTH, SIDEWALK_WIDTH, MAP_MIN_X, MAP_MIN_Z, OCEAN_X, CANAL_X, CANAL_Z } from '../data/city';

export interface Waypoint {
  id: number;
  x: number;
  z: number;
  links: number[];
  zone: 'beach' | 'downtown' | 'docks';
}

/**
 * Sidewalk waypoint graph generated from the road grid: corner nodes at every
 * intersection connected along sidewalks and across streets. Cheap enough for
 * 30+ NPCs picking random neighbours without pathfinding.
 */
export class WaypointGraph {
  nodes: Waypoint[] = [];

  constructor() {
    const off = ROAD_WIDTH / 2 + SIDEWALK_WIDTH / 2; // 7.5m from road centre
    const xs = [MAP_MIN_X + 20, ...ROADS_X, OCEAN_X - 10];
    const zs = [MAP_MIN_Z + 30, ...ROADS_Z, CANAL_Z - 12];
    const grid = new Map<string, number>();
    const key = (i: number, j: number, cx: number, cz: number): string => `${i},${j},${cx},${cz}`;
    const add = (x: number, z: number): number => {
      if (x < CANAL_X + 6 || x > OCEAN_X - 4 || z > CANAL_Z - 6) return -1;
      const zone = x > 116 ? 'beach' : x < -110 ? 'docks' : 'downtown';
      const id = this.nodes.length;
      this.nodes.push({ id, x, z, links: [], zone });
      return id;
    };
    for (let i = 0; i < xs.length; i++)
      for (let j = 0; j < zs.length; j++) {
        const isRoadX = ROADS_X.includes(xs[i]);
        const isRoadZ = ROADS_Z.includes(zs[j]);
        for (const cx of [-1, 1])
          for (const cz of [-1, 1]) {
            // edge rows/cols only get one node per side
            if (!isRoadX && cx === -1 && i === 0) continue;
            if (!isRoadX && cx === 1 && i === xs.length - 1) continue;
            if (!isRoadZ && cz === -1 && j === 0) continue;
            if (!isRoadZ && cz === 1 && j === zs.length - 1) continue;
            const x = xs[i] + (isRoadX ? cx * off : 0);
            const z = zs[j] + (isRoadZ ? cz * off : 0);
            const k = key(i, j, isRoadX ? cx : 0, isRoadZ ? cz : 0);
            if (grid.has(k)) continue;
            const id = add(x, z);
            if (id >= 0) grid.set(k, id);
          }
      }
    const link = (a: number | undefined, b: number | undefined): void => {
      if (a === undefined || b === undefined || a === b) return;
      if (!this.nodes[a].links.includes(b)) this.nodes[a].links.push(b);
      if (!this.nodes[b].links.includes(a)) this.nodes[b].links.push(a);
    };
    const get = (i: number, j: number, cx: number, cz: number): number | undefined => {
      const isRoadX = ROADS_X.includes(xs[i]);
      const isRoadZ = ROADS_Z.includes(zs[j]);
      return grid.get(key(i, j, isRoadX ? cx : 0, isRoadZ ? cz : 0));
    };
    for (let i = 0; i < xs.length; i++)
      for (let j = 0; j < zs.length; j++) {
        // within-intersection crossings
        link(get(i, j, -1, -1), get(i, j, 1, -1));
        link(get(i, j, -1, 1), get(i, j, 1, 1));
        link(get(i, j, -1, -1), get(i, j, -1, 1));
        link(get(i, j, 1, -1), get(i, j, 1, 1));
        // along sidewalks to next intersection east
        if (i + 1 < xs.length) {
          link(get(i, j, 1, -1), get(i + 1, j, -1, -1));
          link(get(i, j, 1, 1), get(i + 1, j, -1, 1));
        }
        if (j + 1 < zs.length) {
          link(get(i, j, -1, 1), get(i, j + 1, -1, -1));
          link(get(i, j, 1, 1), get(i, j + 1, 1, -1));
        }
      }
    // drop isolated nodes
    this.nodes = this.nodes.filter((n) => n.links.length > 0);
    const remap = new Map<number, number>();
    this.nodes.forEach((n, i) => remap.set(n.id, i));
    for (const n of this.nodes) {
      n.links = n.links.map((l) => remap.get(l)!).filter((l) => l !== undefined);
      n.id = remap.get(n.id)!;
    }
  }

  nearest(x: number, z: number): Waypoint {
    let best = this.nodes[0];
    let bd = Infinity;
    for (const n of this.nodes) {
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  random(): Waypoint {
    return this.nodes[Math.floor(Math.random() * this.nodes.length)];
  }

  /** BFS path of node ids from a to b (graph is small: ~100 nodes). */
  path(a: number, b: number): number[] {
    if (a === b) return [a];
    const prev = new Map<number, number>();
    const q = [a];
    prev.set(a, -1);
    while (q.length) {
      const c = q.shift()!;
      if (c === b) break;
      for (const l of this.nodes[c].links) {
        if (!prev.has(l)) {
          prev.set(l, c);
          q.push(l);
        }
      }
    }
    if (!prev.has(b)) return [a];
    const out: number[] = [];
    let c = b;
    while (c !== -1) {
      out.push(c);
      c = prev.get(c)!;
    }
    return out.reverse();
  }
}
