/**
 * Hip roof over an arbitrary rectilinear footprint (the union of the roof rectangles), built as
 * the EXACT constant-pitch roof an architect would draw: height = pitch × (L∞ distance to the
 * eave line), i.e. the straight-skeleton roof. For a rectilinear polygon that equals the maximum,
 * over every maximal inscribed rectangle, of the plain hip roof over that rectangle — so ridges
 * meet, valleys run diagonally from the inside corners and nothing is left open or troughed.
 *
 * The surface is sampled on a fine grid whose pitch divides every breakline position (eave
 * coordinates are multiples of 0.5 ft, ridges therefore of 0.25 ft, hips / valleys are 45°
 * diagonals through grid corners), so every grid cell is either one plane (merged into long
 * quads) or split exactly along its diagonal. The triangles are classified by plane, which
 * gives each face its own UV frame (u along the eave, v up the slope, in metres) so the slate
 * courses run horizontally on every face.
 */
import * as THREE from 'three';
import { TriangleSoup, UP, maximalRects, rectUnionGrid } from './geom';
import type { Rect, Vec2, Vec3 } from './geom';

export interface RoofOptions {
  /** Roof rectangles already grown by the eave overhang (metres). */
  rects: Rect[];
  /** Height of the eave line (metres). */
  eaveY: number;
  /** Rise per metre of horizontal run. */
  slope: number;
  /** Grid pitch (metres): must divide every eave coordinate difference by 2 (0.25 ft for plans on a 0.5 ft module). */
  cell: number;
  /** Texture tile size [along the eave, up the slope] in metres. */
  tile: Vec2;
}

export interface Segment {
  from: Vec3;
  to: Vec3;
}

export interface RoofSurface {
  geometry: THREE.BufferGeometry;
  /** Horizontal ridges on the visible surface. */
  ridges: Segment[];
  /** Sloped hip lines (convex corners up to the ridges) on the visible surface. */
  hips: Segment[];
  /** Maximal rectangles the surface is the max of (for debugging / tests). */
  rects: Rect[];
}

/** 0: h = s(x − at), 1: h = s(at − x), 2: h = s(z − at), 3: h = s(at − z). */
interface Plane {
  kind: 0 | 1 | 2 | 3;
  at: number;
}

const EPS = 1e-7;
const TOL = 1e-5;

function planeKey(p: Plane): string {
  return `${p.kind}:${p.at.toFixed(6)}`;
}

function planeT(p: Plane, x: number, z: number): number {
  switch (p.kind) {
    case 0: return x - p.at;
    case 1: return p.at - x;
    case 2: return z - p.at;
    case 3: return p.at - z;
  }
}

/** Largest half-size of an axis-aligned square centred at (x, z) inside the union, and the edge that limits it. */
function evalT(rects: Rect[], x: number, z: number): { t: number; plane: Plane } | null {
  let best = -1;
  let plane: Plane | null = null;
  for (const r of rects) {
    const dx1 = x - r[0];
    const dx2 = r[2] - x;
    const dz1 = z - r[1];
    const dz2 = r[3] - z;
    if (dx1 < -EPS || dx2 < -EPS || dz1 < -EPS || dz2 < -EPS) continue;
    let t = dx1;
    let p: Plane = { kind: 0, at: r[0] };
    if (dx2 < t) {
      t = dx2;
      p = { kind: 1, at: r[2] };
    }
    if (dz1 < t) {
      t = dz1;
      p = { kind: 2, at: r[1] };
    }
    if (dz2 < t) {
      t = dz2;
      p = { kind: 3, at: r[3] };
    }
    if (t > best + EPS) {
      best = t;
      plane = p;
    }
  }
  return plane ? { t: Math.max(0, best), plane } : null;
}

export function buildRoofSurface(o: RoofOptions): RoofSurface {
  const grid = rectUnionGrid(o.rects);
  const rects = maximalRects(grid);
  const s = o.slope;
  const cosTheta = 1 / Math.sqrt(1 + s * s);
  const x0 = Math.min(...o.rects.map((r) => r[0]));
  const z0 = Math.min(...o.rects.map((r) => r[1]));
  const x1 = Math.max(...o.rects.map((r) => r[2]));
  const z1 = Math.max(...o.rects.map((r) => r[3]));
  const nx = Math.round((x1 - x0) / o.cell);
  const nz = Math.round((z1 - z0) / o.cell);
  const gx = (i: number) => x0 + i * o.cell;
  const gz = (j: number) => z0 + j * o.cell;

  // exact heights at the grid corners (NaN outside the footprint)
  const H = new Float64Array((nx + 1) * (nz + 1));
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const e = evalT(rects, gx(i), gz(j));
      H[j * (nx + 1) + i] = e ? e.t : NaN;
    }
  }
  const hAt = (i: number, j: number) => H[j * (nx + 1) + i];

  const soup = new TriangleSoup(1);
  const yOf = (t: number) => o.eaveY + s * t;
  const uvOf = (p: Plane, x: number, z: number): Vec2 => {
    const along = p.kind <= 1 ? z : x;
    const up = planeT(p, x, z) / cosTheta;
    return [along / o.tile[0], up / o.tile[1]];
  };
  const vertex = (p: Plane, x: number, z: number): Vec3 => [x, yOf(planeT(p, x, z)), z];
  const onPlane = (p: Plane, i: number, j: number) => Math.abs(hAt(i, j) - planeT(p, gx(i), gz(j))) < TOL;
  const emitTri = (p: Plane, a: Vec2, b: Vec2, c: Vec2) => {
    const A = vertex(p, a[0], a[1]);
    const B = vertex(p, b[0], b[1]);
    const C = vertex(p, c[0], c[1]);
    soup.triUV(A, B, C, uvOf(p, a[0], a[1]), uvOf(p, b[0], b[1]), uvOf(p, c[0], c[1]), UP);
  };
  const emitQuad = (p: Plane, i0: number, i1: number, j: number) => {
    const xa = gx(i0);
    const xb = gx(i1);
    const za = gz(j);
    const zb = gz(j + 1);
    emitTri(p, [xa, za], [xb, za], [xb, zb]);
    emitTri(p, [xa, za], [xb, zb], [xa, zb]);
  };
  /** Classified plane at a point, or null outside. */
  const planeAt = (x: number, z: number): Plane | null => evalT(rects, x, z)?.plane ?? null;
  /** A triangle given by grid corners is exactly on the plane found at its centroid. */
  const triPlane = (c: [number, number][]): Plane | null => {
    const cx = (gx(c[0][0]) + gx(c[1][0]) + gx(c[2][0])) / 3;
    const cz = (gz(c[0][1]) + gz(c[1][1]) + gz(c[2][1])) / 3;
    const p = planeAt(cx, cz);
    if (!p) return null;
    return c.every(([i, j]) => onPlane(p, i, j)) ? p : null;
  };

  let fallbacks = 0;
  for (let j = 0; j < nz; j++) {
    let runStart = -1;
    let runKey = '';
    let runPlane: Plane | null = null;
    const flush = (iEnd: number) => {
      if (runStart >= 0 && runPlane) emitQuad(runPlane, runStart, iEnd, j);
      runStart = -1;
      runPlane = null;
    };
    for (let i = 0; i < nx; i++) {
      const cx = gx(i) + o.cell / 2;
      const cz = gz(j) + o.cell / 2;
      const pc = planeAt(cx, cz);
      if (!pc) {
        flush(i);
        continue;
      }
      const c00: [number, number] = [i, j];
      const c10: [number, number] = [i + 1, j];
      const c11: [number, number] = [i + 1, j + 1];
      const c01: [number, number] = [i, j + 1];
      if ([c00, c10, c11, c01].every(([a, b]) => onPlane(pc, a, b))) {
        const key = planeKey(pc);
        if (runStart >= 0 && key === runKey) continue;
        flush(i);
        runStart = i;
        runKey = key;
        runPlane = pc;
        continue;
      }
      flush(i);
      // split along a diagonal: each half must be exactly one plane
      const tryDiag = (t1: [number, number][], t2: [number, number][]): boolean => {
        const p1 = triPlane(t1);
        const p2 = triPlane(t2);
        if (!p1 || !p2) return false;
        emitTri(p1, [gx(t1[0][0]), gz(t1[0][1])], [gx(t1[1][0]), gz(t1[1][1])], [gx(t1[2][0]), gz(t1[2][1])]);
        emitTri(p2, [gx(t2[0][0]), gz(t2[0][1])], [gx(t2[1][0]), gz(t2[1][1])], [gx(t2[2][0]), gz(t2[2][1])]);
        return true;
      };
      if (tryDiag([c00, c10, c11], [c00, c11, c01])) continue;
      if (tryDiag([c00, c10, c01], [c10, c11, c01])) continue;
      // should not happen on a conforming grid: fan around the exact centre height
      fallbacks++;
      const ec = evalT(rects, cx, cz);
      const centre: Vec3 = [cx, yOf(ec ? ec.t : 0), cz];
      const corners = [c00, c10, c11, c01];
      for (let k = 0; k < 4; k++) {
        const a = corners[k];
        const b = corners[(k + 1) % 4];
        const A: Vec3 = [gx(a[0]), yOf(hAt(a[0], a[1])), gz(a[1])];
        const B: Vec3 = [gx(b[0]), yOf(hAt(b[0], b[1])), gz(b[1])];
        const p = planeAt((A[0] + B[0] + cx) / 3, (A[2] + B[2] + cz) / 3) ?? pc;
        soup.triUV(A, B, centre, uvOf(p, A[0], A[2]), uvOf(p, B[0], B[2]), uvOf(p, cx, cz), UP);
      }
    }
    flush(nx);
  }
  const geometry = soup.build();
  geometry.userData.fallbacks = fallbacks;

  // ---- creases: ridge and hip lines of every maximal rectangle, kept where they lie on the surface
  const step = 0.08;
  const keyOf = (x: number, z: number) => `${Math.round(x * 1000)},${Math.round(z * 1000)}`;
  const lines = new Map<string, { kind: 'ridge' | 'hip'; samples: Map<string, { pos: number; p: Vec3 }> }>();
  const DELTA = 0.02;
  /**
   * Keeps a crease sample when the surface passes through it AND breaks there: the plane found a
   * little to either side (along `n`, horizontal perpendicular) must differ. A rectangle's ridge
   * that merely touches a bigger rectangle's slope from below is not a crease of the surface.
   */
  const addSample = (lineKey: string, kind: 'ridge' | 'hip', n: Vec2, pos: number, x: number, z: number, t: number) => {
    const e = evalT(rects, x, z);
    if (!e || Math.abs(e.t - t) > 1e-4) return;
    const pa = planeAt(x + n[0] * DELTA, z + n[1] * DELTA);
    const pb = planeAt(x - n[0] * DELTA, z - n[1] * DELTA);
    if (!pa && !pb) return; // outside
    if (pa && pb && planeKey(pa) === planeKey(pb)) return; // one plane: no crease (one side outside = eave corner, kept)
    let line = lines.get(lineKey);
    if (!line) {
      line = { kind, samples: new Map() };
      lines.set(lineKey, line);
    }
    line.samples.set(keyOf(x, z), { pos, p: [x, yOf(t), z] });
  };
  for (const r of rects) {
    const w = r[2] - r[0];
    const d = r[3] - r[1];
    const hs = Math.min(w, d) / 2;
    // hips: from each corner diagonally inward, rising with the axis distance
    for (const [cx, sx] of [
      [r[0], 1],
      [r[2], -1],
    ] as [number, number][]) {
      for (const [cz, sz] of [
        [r[1], 1],
        [r[3], -1],
      ] as [number, number][]) {
        const c = sx * sz > 0 ? cx - cz : cx + cz; // x − z or x + z stays constant along the hip
        const key = `h|${sx * sz}|${c.toFixed(4)}`;
        const n: Vec2 = [-sz / Math.SQRT2, sx / Math.SQRT2];
        for (let a = 0; a <= hs + 1e-9; a += step) {
          const aa = Math.min(a, hs);
          addSample(key, 'hip', n, cx + sx * aa, cx + sx * aa, cz + sz * aa, aa);
        }
        addSample(key, 'hip', n, cx + sx * hs, cx + sx * hs, cz + sz * hs, hs);
      }
    }
    // ridge along the long axis
    if (Math.abs(w - d) < 1e-6) continue;
    if (w > d) {
      const zc = (r[1] + r[3]) / 2;
      const key = `rx|${zc.toFixed(4)}|${hs.toFixed(4)}`;
      for (let x = r[0] + hs; x <= r[2] - hs + 1e-9; x += step) addSample(key, 'ridge', [0, 1], x, Math.min(x, r[2] - hs), zc, hs);
      addSample(key, 'ridge', [0, 1], r[2] - hs, r[2] - hs, zc, hs);
    } else {
      const xc = (r[0] + r[2]) / 2;
      const key = `rz|${xc.toFixed(4)}|${hs.toFixed(4)}`;
      for (let z = r[1] + hs; z <= r[3] - hs + 1e-9; z += step) addSample(key, 'ridge', [1, 0], z, xc, Math.min(z, r[3] - hs), hs);
      addSample(key, 'ridge', [1, 0], r[3] - hs, xc, r[3] - hs, hs);
    }
  }
  const ridges: Segment[] = [];
  const hips: Segment[] = [];
  for (const line of lines.values()) {
    const pts = Array.from(line.samples.values()).sort((a, b) => a.pos - b.pos);
    let start = 0;
    for (let k = 1; k <= pts.length; k++) {
      const gap = k < pts.length ? pts[k].pos - pts[k - 1].pos : Infinity;
      if (gap > step * 1.6) {
        const a = pts[start].p;
        const b = pts[k - 1].p;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        if (len > 0.25) (line.kind === 'ridge' ? ridges : hips).push({ from: a, to: b });
        start = k;
      }
    }
  }
  return { geometry, ridges, hips, rects };
}
