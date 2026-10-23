/**
 * Procedural-geometry helpers for the exterior.
 *
 * Convention: every textured surface built here carries UVs in METRES (u, v = world distance),
 * so a texture tiles at real-world scale once the material's `repeat` is set to 1 / tile-size.
 *  - TriangleSoup: flat-shaded triangle collector (planar or explicit UVs, optional vertex colour).
 *  - box helpers: BoxGeometry / RoundedBoxGeometry with per-face UVs rescaled to metres, placed
 *    anywhere, merged into one geometry per material (one draw call for dozens of parts).
 *  - rectilinear polygon offsets and edge strips (contact-shadow ring, planting beds).
 *  - axis-aligned rectangle unions on a cell grid: plane, outer boundary, maximal rectangles
 *    (the roof surface is the max of the hip roofs over every maximal rectangle).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** [x1, z1, x2, z2] in metres. */
export type Rect = [number, number, number, number];
export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

export const UP: Vec3 = [0, 1, 0];
export const DOWN: Vec3 = [0, -1, 0];

export function growRect(r: Rect, e: number): Rect {
  return [r[0] - e, r[1] - e, r[2] + e, r[3] + e];
}

export function rectContains(r: Rect, x: number, z: number, eps = 0): boolean {
  return x >= r[0] - eps && x <= r[2] + eps && z >= r[1] - eps && z <= r[3] + eps;
}

// ---------------------------------------------------------------------------------------------
// Triangle collector
// ---------------------------------------------------------------------------------------------

/**
 * Collects triangles into a non-indexed BufferGeometry (so computeVertexNormals() yields crisp
 * flat faces). Default UVs are planar: u / v are taken from two world axes (0 = X, 1 = Y, 2 = Z)
 * divided by `uvScale` metres per unit; `triUV` / `quadUV` take explicit UVs instead.
 */
export class TriangleSoup {
  private readonly pos: number[] = [];
  private readonly uv: number[] = [];
  private readonly col: number[] = [];
  private useColor = false;
  private color: [number, number, number] = [1, 1, 1];
  private uAxis: 0 | 1 | 2 = 0;
  private vAxis: 0 | 1 | 2 = 2;

  constructor(private readonly uvScale = 1) {}

  /** Which world axes feed the planar UVs of the triangles added afterwards. */
  setUvAxes(u: 0 | 1 | 2, v: 0 | 1 | 2): this {
    this.uAxis = u;
    this.vAxis = v;
    return this;
  }

  /** Vertex colour (linear RGB 0..1) for the triangles added afterwards; enables the colour attribute. */
  setColor(r: number, g: number, b: number): this {
    this.useColor = true;
    this.color = [r, g, b];
    return this;
  }

  private push(p: Vec3, uv: Vec2): void {
    this.pos.push(p[0], p[1], p[2]);
    this.uv.push(uv[0], uv[1]);
    this.col.push(this.color[0], this.color[1], this.color[2]);
  }

  private planarUv(p: Vec3): Vec2 {
    return [p[this.uAxis] / this.uvScale, p[this.vAxis] / this.uvScale];
  }

  /** Adds a triangle with explicit UVs, flipping its winding so the face normal agrees with `want`. */
  triUV(a: Vec3, b: Vec3, c: Vec3, ua: Vec2, ub: Vec2, uc: Vec2, want: Vec3): void {
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
    if (dot >= 0) {
      this.push(a, ua);
      this.push(b, ub);
      this.push(c, uc);
    } else {
      this.push(a, ua);
      this.push(c, uc);
      this.push(b, ub);
    }
  }

  tri(a: Vec3, b: Vec3, c: Vec3, want: Vec3): void {
    this.triUV(a, b, c, this.planarUv(a), this.planarUv(b), this.planarUv(c), want);
  }

  /** Planar convex quad a-b-c-d (any winding). */
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, want: Vec3): void {
    this.tri(a, b, c, want);
    this.tri(a, c, d, want);
  }

  quadUV(a: Vec3, b: Vec3, c: Vec3, d: Vec3, ua: Vec2, ub: Vec2, uc: Vec2, ud: Vec2, want: Vec3): void {
    this.triUV(a, b, c, ua, ub, uc, want);
    this.triUV(a, c, d, ua, uc, ud, want);
  }

  get triangleCount(): number {
    return this.pos.length / 9;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.useColor) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// ---------------------------------------------------------------------------------------------
// Box helpers (UVs in metres, placement, merging)
// ---------------------------------------------------------------------------------------------

export interface BoxUvOptions {
  /** Swap u/v on these faces (0 +x, 1 -x, 2 +y, 3 -y, 4 +z, 5 -z) or on all faces: grain direction. */
  swap?: boolean | number[];
  /** Added after scaling (de-synchronises identical pieces). */
  offset?: Vec2;
}

/**
 * Rescales the per-face 0..1 UVs of a BoxGeometry / RoundedBoxGeometry to metres. Both geometries
 * list their six faces in the order +x, -x, +y, -y, +z, -z with the same vertex count per face.
 */
export function boxUvMetres(geom: THREE.BufferGeometry, w: number, h: number, d: number, o: BoxUvOptions = {}): THREE.BufferGeometry {
  const uv = geom.getAttribute('uv') as THREE.BufferAttribute;
  const per = uv.count / 6;
  const dims: Vec2[] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  const ou = o.offset?.[0] ?? 0;
  const ov = o.offset?.[1] ?? 0;
  for (let f = 0; f < 6; f++) {
    const [du, dv] = dims[f];
    const swap = o.swap === true || (Array.isArray(o.swap) && o.swap.includes(f));
    for (let i = f * per; i < (f + 1) * per; i++) {
      const u = uv.getX(i) * du;
      const v = uv.getY(i) * dv;
      if (swap) uv.setXY(i, v + ou, u + ov);
      else uv.setXY(i, u + ou, v + ov);
    }
  }
  uv.needsUpdate = true;
  return geom;
}

/** BoxGeometry with metre UVs. */
export function metreBox(w: number, h: number, d: number, o: BoxUvOptions = {}): THREE.BufferGeometry {
  return boxUvMetres(new THREE.BoxGeometry(w, h, d), w, h, d, o);
}

/** RoundedBoxGeometry (bevelled edges) with metre UVs. */
export function metreRoundedBox(w: number, h: number, d: number, radius: number, o: BoxUvOptions = {}, segments = 1): THREE.BufferGeometry {
  return boxUvMetres(new RoundedBoxGeometry(w, h, d, segments, radius), w, h, d, o);
}

const tmpM = new THREE.Matrix4();
const tmpP = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3(1, 1, 1);
const tmpE = new THREE.Euler();

/** Moves (and optionally rotates about Y / Euler) a geometry in place; returns it for chaining. */
export function place(geom: THREE.BufferGeometry, position: Vec3, rotation: Vec3 | number = 0): THREE.BufferGeometry {
  tmpP.set(position[0], position[1], position[2]);
  if (typeof rotation === 'number') tmpE.set(0, rotation, 0);
  else tmpE.set(rotation[0], rotation[1], rotation[2]);
  tmpQ.setFromEuler(tmpE);
  tmpM.compose(tmpP, tmpQ, tmpS);
  geom.applyMatrix4(tmpM);
  return geom;
}

/** Vertex colour attribute (one flat colour) so the geometry can be merged with coloured ones. */
export function withColor(geom: THREE.BufferGeometry, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const n = geom.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geom;
}

/**
 * Merges geometries into ONE non-indexed geometry and disposes the inputs. Every input must carry
 * the same attribute set (position / normal / uv, plus colour when any has it).
 */
export function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(parts, false) ?? new THREE.BufferGeometry();
  for (const g of parts) g.dispose();
  for (const g of list) g.dispose();
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

/** Orientation for a box whose local Z runs from `from` to `to`, local X kept horizontal. */
export function runFrame(from: Vec3, to: Vec3): { mid: THREE.Vector3; quaternion: THREE.Quaternion; length: number } {
  const a = new THREE.Vector3(from[0], from[1], from[2]);
  const b = new THREE.Vector3(to[0], to[1], to[2]);
  const dir = b.clone().sub(a);
  const length = dir.length();
  dir.normalize();
  const x = new THREE.Vector3(0, 1, 0).cross(dir);
  if (x.lengthSq() < 1e-8) x.set(1, 0, 0);
  x.normalize();
  const y = dir.clone().cross(x).normalize();
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, dir));
  return { mid: a.add(b).multiplyScalar(0.5), quaternion, length };
}

/** A (rounded) box running from `from` to `to`: stringers, sloped rails, hip caps. UVs in metres. */
export function slopedBox(from: Vec3, to: Vec3, width: number, height: number, radius = 0, uv: BoxUvOptions = {}): THREE.BufferGeometry {
  const { mid, quaternion, length } = runFrame(from, to);
  const g = radius > 0 ? metreRoundedBox(width, height, length, radius, uv) : metreBox(width, height, length, uv);
  tmpM.compose(mid, quaternion, tmpS);
  g.applyMatrix4(tmpM);
  return g;
}

/** Cylinder whose axis runs from `from` to `to` (pipes, branches). UVs: u around (metres), v along. */
export function cylinderBetween(from: Vec3, to: Vec3, radius: number, segments = 10, radiusEnd = radius): THREE.BufferGeometry {
  const { mid, quaternion, length } = runFrame(from, to);
  const g = new THREE.CylinderGeometry(radiusEnd, radius, length, segments, 1);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const circ = Math.PI * (radius + radiusEnd);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ, uv.getY(i) * length);
  g.rotateX(Math.PI / 2); // cylinder axis Y → local Z
  tmpM.compose(mid, quaternion, tmpS);
  g.applyMatrix4(tmpM);
  return g;
}

// ---------------------------------------------------------------------------------------------
// Rectilinear polygons
// ---------------------------------------------------------------------------------------------

export function pointInPoly(x: number, z: number, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    const intersect = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Unit outward normal of edge i (axis-aligned polygon, any winding). */
export function edgeOutwardNormal(poly: Vec2[], i: number): Vec2 {
  const a = poly[i];
  const b = poly[(i + 1) % poly.length];
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz) || 1;
  let nx = dz / len;
  let nz = -dx / len;
  const mx = (a[0] + b[0]) / 2 + nx * 0.05;
  const mz = (a[1] + b[1]) / 2 + nz * 0.05;
  if (pointInPoly(mx, mz, poly)) {
    nx = -nx;
    nz = -nz;
  }
  return [nx, nz];
}

/** Offsets an axis-aligned polygon outward by `d` (mitred corners; negative d shrinks). */
export function offsetRectilinear(poly: Vec2[], d: number): Vec2[] {
  const n = poly.length;
  const normals = poly.map((_, i) => edgeOutwardNormal(poly, i));
  return poly.map((v, i) => {
    const nIn = normals[(i - 1 + n) % n];
    const nOut = normals[i];
    return [v[0] + d * (nIn[0] + nOut[0]), v[1] + d * (nIn[1] + nOut[1])];
  });
}

/** For every edge of an axis-aligned polygon, the rectangle from `inner` to `outer` outside it, extended `ext` past both ends. */
export function edgeStrips(poly: Vec2[], inner: number, outer: number, ext: number): Rect[] {
  const out: Rect[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const [nx, nz] = edgeOutwardNormal(poly, i);
    if (Math.abs(nx) > 0.5) {
      const x1 = a[0] + nx * inner;
      const x2 = a[0] + nx * outer;
      out.push([Math.min(x1, x2), Math.min(a[1], b[1]) - ext, Math.max(x1, x2), Math.max(a[1], b[1]) + ext]);
    } else {
      const z1 = a[1] + nz * inner;
      const z2 = a[1] + nz * outer;
      out.push([Math.min(a[0], b[0]) - ext, Math.min(z1, z2), Math.max(a[0], b[0]) + ext, Math.max(z1, z2)]);
    }
  }
  return out;
}

/**
 * Flat ring between an inner and an outer polygon with the same vertex count (an offset pair),
 * vertex colour black with alpha fading from `alphaInner` to `alphaOuter`: a soft contact shadow.
 */
export function ringGeometry(inner: Vec2[], outer: Vec2[], y: number, alphaInner: number, alphaOuter: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const n = inner.length;
  const push = (p: Vec2, a: number) => {
    pos.push(p[0], y, p[1]);
    col.push(0, 0, 0, a);
  };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    // two triangles, counter-clockwise seen from above (+y)
    const a = inner[i];
    const b = inner[j];
    const c = outer[j];
    const d = outer[i];
    const cross = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
    const ccw = cross < 0; // in x/z with y up, a negative cross means counter-clockwise from above
    const quad: [Vec2, number][] = ccw
      ? [[a, alphaInner], [b, alphaInner], [c, alphaOuter], [d, alphaOuter]]
      : [[a, alphaInner], [d, alphaOuter], [c, alphaOuter], [b, alphaInner]];
    push(quad[0][0], quad[0][1]);
    push(quad[1][0], quad[1][1]);
    push(quad[2][0], quad[2][1]);
    push(quad[0][0], quad[0][1]);
    push(quad[2][0], quad[2][1]);
    push(quad[3][0], quad[3][1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------------------------------------
// Axis-aligned rectangle unions on a cell grid
// ---------------------------------------------------------------------------------------------

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

/** Grid of `rects` with every cell whose centre satisfies `omit` removed (the grid is refined by `cuts` first). */
export function rectUnionGridMinus(rects: Rect[], cuts: Rect[], omit: (x: number, z: number) => boolean): CellGrid {
  const grid = rectUnionGrid([...rects, ...cuts]);
  for (let i = 0; i < grid.covered.length; i++) {
    for (let j = 0; j < grid.covered[i].length; j++) {
      const cx = (grid.xs[i] + grid.xs[i + 1]) / 2;
      const cz = (grid.zs[j] + grid.zs[j + 1]) / 2;
      const inRects = rects.some((r) => cx > r[0] && cx < r[2] && cz > r[1] && cz < r[3]);
      grid.covered[i][j] = inRects && !omit(cx, cz);
    }
  }
  return grid;
}

/** Horizontal plane made of the grid's covered cells (no overlaps → no z-fighting). UVs in metres. */
export function gridPlaneGeometry(g: CellGrid, y: number, facing: 'up' | 'down'): THREE.BufferGeometry {
  const soup = new TriangleSoup(1);
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

/** Every maximal axis-aligned rectangle inscribed in the union (none is contained in another). */
export function maximalRects(g: CellGrid): Rect[] {
  const nx = g.covered.length;
  const nz = nx ? g.covered[0].length : 0;
  const full = (i0: number, i1: number, j0: number, j1: number) => {
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) if (!g.covered[i][j]) return false;
    return true;
  };
  const found: [number, number, number, number][] = [];
  for (let i0 = 0; i0 < nx; i0++) {
    for (let i1 = i0; i1 < nx; i1++) {
      for (let j0 = 0; j0 < nz; j0++) {
        for (let j1 = j0; j1 < nz; j1++) {
          if (full(i0, i1, j0, j1)) found.push([i0, j0, i1, j1]);
        }
      }
    }
  }
  const maximal = found.filter(([a0, b0, a1, b1]) => !found.some(([c0, d0, c1, d1]) => (c0 !== a0 || d0 !== b0 || c1 !== a1 || d1 !== b1) && c0 <= a0 && d0 <= b0 && c1 >= a1 && d1 >= b1));
  return maximal.map(([i0, j0, i1, j1]) => [g.xs[i0], g.zs[j0], g.xs[i1 + 1], g.zs[j1 + 1]]);
}

// ---------------------------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------------------------

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

/** Steps of an exterior flight as solid blocks rising from `bottomY` (poured-concrete look). */
export function stepBlocks(f: FlightLike, bottomY: number): Block[] {
  const [x1, z1, x2, z2] = f.bounds;
  const alongX = f.dir === '+x' || f.dir === '-x';
  return stepRuns(f).map(({ a, b, top }) => ({
    center: alongX ? [(a + b) / 2, (bottomY + top) / 2, (z1 + z2) / 2] : [(x1 + x2) / 2, (bottomY + top) / 2, (a + b) / 2],
    size: alongX ? [b - a, top - bottomY, z2 - z1] : [x2 - x1, top - bottomY, b - a],
  }));
}

// ---------------------------------------------------------------------------------------------
// Smooth surfaces (foliage cones, hedge bodies) and small solids
// ---------------------------------------------------------------------------------------------

export interface GridVertex {
  p: Vec3;
  uv: Vec2;
  /** Linear RGB (0..1). */
  c: Vec3;
}

/**
 * Indexed quad grid of (nu + 1) × (nv + 1) vertices with SMOOTH normals. `at(i, j)` returns
 * position / UV / colour for column i (0..nu) and row j (0..nv). With `wrapU` the last column
 * must repeat the first position (a closed loop: the duplicate carries the UV seam) and the
 * seam normals are welded. Winding: looking from outside, i increases to the right and j upward.
 */
export function gridSurface(nu: number, nv: number, at: (i: number, j: number) => GridVertex, wrapU: boolean): THREE.BufferGeometry {
  const cols = nu + 1;
  const n = cols * (nv + 1);
  const pos = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const col = new Float32Array(n * 3);
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i < cols; i++) {
      const v = at(i, j);
      const k = j * cols + i;
      pos[k * 3] = v.p[0];
      pos[k * 3 + 1] = v.p[1];
      pos[k * 3 + 2] = v.p[2];
      uv[k * 2] = v.uv[0];
      uv[k * 2 + 1] = v.uv[1];
      col[k * 3] = v.c[0];
      col[k * 3 + 1] = v.c[1];
      col[k * 3 + 2] = v.c[2];
    }
  }
  const index: number[] = [];
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols + 1;
      const d = a + cols;
      index.push(a, b, c, a, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  if (wrapU) {
    const nor = g.getAttribute('normal') as THREE.BufferAttribute;
    for (let j = 0; j <= nv; j++) {
      const a = j * cols;
      const b = j * cols + nu;
      const x = nor.getX(a) + nor.getX(b);
      const y = nor.getY(a) + nor.getY(b);
      const z = nor.getZ(a) + nor.getZ(b);
      const len = Math.hypot(x, y, z) || 1;
      nor.setXYZ(a, x / len, y / len, z / len);
      nor.setXYZ(b, x / len, y / len, z / len);
    }
    nor.needsUpdate = true;
  }
  g.computeBoundingSphere();
  return g;
}

/** Unit half-pipe (open side up) running along X from -0.5 to 0.5 (gutters). */
export function halfPipeUnit(r: number): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(r, r, 1, 10, 1, true, 0, Math.PI).rotateZ(-Math.PI / 2);
}

/**
 * A solid over [x1, z1, x2, z2] whose top and bottom heights are given per corner by `topY` /
 * `bottomY` (retaining walls and caps that follow a sloped slab). All other faces are vertical;
 * UVs in metres (sides: along × height, top / bottom: X × Z).
 */
export function slabPrism(soup: TriangleSoup, x1: number, z1: number, x2: number, z2: number, bottomY: (x: number, z: number) => number, topY: (x: number, z: number) => number): void {
  const t11 = topY(x1, z1);
  const t21 = topY(x2, z1);
  const t22 = topY(x2, z2);
  const t12 = topY(x1, z2);
  const b11 = bottomY(x1, z1);
  const b21 = bottomY(x2, z1);
  const b22 = bottomY(x2, z2);
  const b12 = bottomY(x1, z2);
  soup.setUvAxes(0, 2);
  soup.quad([x1, t11, z1], [x2, t21, z1], [x2, t22, z2], [x1, t12, z2], UP);
  soup.quad([x1, b11, z1], [x2, b21, z1], [x2, b22, z2], [x1, b12, z2], DOWN);
  soup.setUvAxes(0, 1);
  soup.quad([x1, b11, z1], [x2, b21, z1], [x2, t21, z1], [x1, t11, z1], [0, 0, -1]);
  soup.quad([x1, b12, z2], [x2, b22, z2], [x2, t22, z2], [x1, t12, z2], [0, 0, 1]);
  soup.setUvAxes(2, 1);
  soup.quad([x1, b11, z1], [x1, b12, z2], [x1, t12, z2], [x1, t11, z1], [-1, 0, 0]);
  soup.quad([x2, b21, z1], [x2, b22, z2], [x2, t22, z2], [x2, t21, z1], [1, 0, 0]);
}
