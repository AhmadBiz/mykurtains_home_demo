/**
 * Small procedural-geometry helpers for the exterior: a flat-shaded triangle collector, hip
 * roofs, and an axis-aligned rectangle union (used for a single non-overlapping soffit plane
 * and for fascia boards that follow only the outer edge of the combined roof).
 */
import * as THREE from 'three';

/** [x1, z1, x2, z2] in metres. */
export type Rect = [number, number, number, number];
export type Vec3 = [number, number, number];

export const UP: Vec3 = [0, 1, 0];
export const DOWN: Vec3 = [0, -1, 0];

export function growRect(r: Rect, e: number): Rect {
  return [r[0] - e, r[1] - e, r[2] + e, r[3] + e];
}

/**
 * Collects triangles into a non-indexed BufferGeometry (so computeVertexNormals() yields crisp
 * flat faces). UVs are planar: u / v are taken from two world axes (0 = X, 1 = Y, 2 = Z)
 * divided by `uvScale` metres per texture tile.
 */
export class TriangleSoup {
  private readonly pos: number[] = [];
  private readonly uv: number[] = [];
  private uAxis: 0 | 1 | 2 = 0;
  private vAxis: 0 | 1 | 2 = 2;

  constructor(private readonly uvScale = 1) {}

  /** Which world axes feed the UVs of the triangles added afterwards. */
  setUvAxes(u: 0 | 1 | 2, v: 0 | 1 | 2): this {
    this.uAxis = u;
    this.vAxis = v;
    return this;
  }

  /** Adds a triangle, flipping its winding so the face normal agrees with `want`. */
  tri(a: Vec3, b: Vec3, c: Vec3, want: Vec3): void {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const dot = nx * want[0] + ny * want[1] + nz * want[2];
    const order = dot >= 0 ? [a, b, c] : [a, c, b];
    for (const p of order) {
      this.pos.push(p[0], p[1], p[2]);
      this.uv.push(p[this.uAxis] / this.uvScale, p[this.vAxis] / this.uvScale);
    }
  }

  /** Planar convex quad a-b-c-d (any winding). */
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, want: Vec3): void {
    this.tri(a, b, c, want);
    this.tri(a, c, d, want);
  }

  get triangleCount(): number {
    return this.pos.length / 9;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * Closed hip roof over `r` (already grown by the eave): four eave corners at `eaveY`, a ridge
 * along the longer axis at eaveY + slope * (shortSide / 2). A square becomes a pyramid.
 */
export function hipRoofGeometry(r: Rect, eaveY: number, slope: number, uvScale: number): THREE.BufferGeometry {
  const [x1, z1, x2, z2] = r;
  const w = x2 - x1;
  const d = z2 - z1;
  const hs = Math.min(w, d) / 2;
  const ridgeY = eaveY + hs * slope;
  const A: Vec3 = [x1, eaveY, z1];
  const B: Vec3 = [x2, eaveY, z1];
  const C: Vec3 = [x2, eaveY, z2];
  const D: Vec3 = [x1, eaveY, z2];
  const soup = new TriangleSoup(uvScale);
  if (w >= d) {
    const zc = (z1 + z2) / 2;
    const R1: Vec3 = [x1 + hs, ridgeY, zc];
    const R2: Vec3 = [x2 - hs, ridgeY, zc];
    soup.quad(A, B, R2, R1, UP); // north slope
    soup.quad(C, D, R1, R2, UP); // south slope
    soup.tri(D, A, R1, UP); // west hip
    soup.tri(B, C, R2, UP); // east hip
  } else {
    const xc = (x1 + x2) / 2;
    const R1: Vec3 = [xc, ridgeY, z1 + hs];
    const R2: Vec3 = [xc, ridgeY, z2 - hs];
    soup.tri(A, B, R1, UP); // north hip
    soup.quad(B, C, R2, R1, UP); // east slope
    soup.tri(C, D, R2, UP); // south hip
    soup.quad(D, A, R1, R2, UP); // west slope
  }
  return soup.build();
}

/** Grid partition of the union of axis-aligned rectangles. covered[i][j] is the cell xs[i..i+1] × zs[j..j+1]. */
export interface CellGrid {
  xs: number[];
  zs: number[];
  covered: boolean[][];
}

export function rectUnionGrid(rects: Rect[]): CellGrid {
  const uniq = (v: number[]) => Array.from(new Set(v.map((n) => Math.round(n * 1e6) / 1e6))).sort((a, b) => a - b);
  const xs = uniq(rects.flatMap((r) => [r[0], r[2]]));
  const zs = uniq(rects.flatMap((r) => [r[1], r[3]]));
  const covered: boolean[][] = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    const col: boolean[] = [];
    for (let j = 0; j + 1 < zs.length; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cz = (zs[j] + zs[j + 1]) / 2;
      col.push(rects.some((r) => cx > r[0] && cx < r[2] && cz > r[1] && cz < r[3]));
    }
    covered.push(col);
  }
  return { xs, zs, covered };
}

/** Horizontal plane made of the grid's covered cells (no overlaps → no z-fighting). */
export function gridPlaneGeometry(g: CellGrid, y: number, facing: 'up' | 'down', uvScale: number): THREE.BufferGeometry {
  const soup = new TriangleSoup(uvScale);
  const want = facing === 'up' ? UP : DOWN;
  for (let i = 0; i < g.covered.length; i++) {
    for (let j = 0; j < g.covered[i].length; j++) {
      if (!g.covered[i][j]) continue;
      const xa = g.xs[i];
      const xb = g.xs[i + 1];
      const za = g.zs[j];
      const zb = g.zs[j + 1];
      soup.quad([xa, y, za], [xb, y, za], [xb, y, zb], [xa, y, zb], want);
    }
  }
  return soup.build();
}

export interface BoundarySegment {
  /** Axis the segment runs along. */
  axis: 'x' | 'z';
  /** Fixed coordinate (z for an 'x' segment, x for a 'z' segment). */
  at: number;
  from: number;
  to: number;
  /** Which side (along the fixed axis) is outside the union. */
  outward: 1 | -1;
}

/** Outer boundary of the union, merged into maximal straight runs. */
export function gridBoundary(g: CellGrid): BoundarySegment[] {
  const isCovered = (i: number, j: number) => i >= 0 && j >= 0 && i < g.covered.length && j < g.covered[i].length && g.covered[i][j];
  const raw: BoundarySegment[] = [];
  for (let i = 0; i < g.covered.length; i++) {
    for (let j = 0; j < g.covered[i].length; j++) {
      if (!g.covered[i][j]) continue;
      if (!isCovered(i, j - 1)) raw.push({ axis: 'x', at: g.zs[j], from: g.xs[i], to: g.xs[i + 1], outward: -1 });
      if (!isCovered(i, j + 1)) raw.push({ axis: 'x', at: g.zs[j + 1], from: g.xs[i], to: g.xs[i + 1], outward: 1 });
      if (!isCovered(i - 1, j)) raw.push({ axis: 'z', at: g.xs[i], from: g.zs[j], to: g.zs[j + 1], outward: -1 });
      if (!isCovered(i + 1, j)) raw.push({ axis: 'z', at: g.xs[i + 1], from: g.zs[j], to: g.zs[j + 1], outward: 1 });
    }
  }
  const groups = new Map<string, BoundarySegment[]>();
  for (const s of raw) {
    const key = `${s.axis}|${s.at}|${s.outward}`;
    const list = groups.get(key);
    if (list) list.push(s);
    else groups.set(key, [s]);
  }
  const merged: BoundarySegment[] = [];
  for (const list of groups.values()) {
    list.sort((a, b) => a.from - b.from);
    let cur = { ...list[0] };
    for (let k = 1; k < list.length; k++) {
      const s = list[k];
      if (s.from <= cur.to + 1e-6) cur.to = Math.max(cur.to, s.to);
      else {
        merged.push(cur);
        cur = { ...s };
      }
    }
    merged.push(cur);
  }
  return merged;
}

/** Steps of an exterior flight as solid blocks rising from `bottomY` (for poured-concrete looks). */
export interface Block {
  center: Vec3;
  size: Vec3;
}

export interface FlightLike {
  bounds: Rect;
  dir: '+x' | '-x' | '+z' | '-z';
  y0: number;
  y1: number;
  steps: number;
}

/** Per-step extents along the direction of ascent, from the low end: [a, b, topY]. */
export function stepRuns(f: FlightLike): { a: number; b: number; top: number }[] {
  const [x1, z1, x2, z2] = f.bounds;
  const n = Math.max(1, f.steps);
  const rise = (f.y1 - f.y0) / n;
  const alongX = f.dir === '+x' || f.dir === '-x';
  const run = (alongX ? x2 - x1 : z2 - z1) / n;
  const out: { a: number; b: number; top: number }[] = [];
  for (let i = 0; i < n; i++) {
    let a: number;
    switch (f.dir) {
      case '+x': a = x1 + i * run; break;
      case '-x': a = x2 - (i + 1) * run; break;
      case '+z': a = z1 + i * run; break;
      case '-z': a = z2 - (i + 1) * run; break;
    }
    out.push({ a, b: a + run, top: f.y0 + (i + 1) * rise });
  }
  return out;
}

export function stepBlocks(f: FlightLike, bottomY: number): Block[] {
  const [x1, z1, x2, z2] = f.bounds;
  const alongX = f.dir === '+x' || f.dir === '-x';
  return stepRuns(f).map(({ a, b, top }) => ({
    center: alongX ? [(a + b) / 2, (bottomY + top) / 2, (z1 + z2) / 2] : [(x1 + x2) / 2, (bottomY + top) / 2, (a + b) / 2],
    size: alongX ? [b - a, top - bottomY, z2 - z1] : [x2 - x1, top - bottomY, b - a],
  }));
}
