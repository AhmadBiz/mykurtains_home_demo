import * as THREE from 'three';
import { HOUSE } from '../../data/house';
import { LEVEL_BY_ID, WALL_BY_ID, levelForY, pointInLevelOutline } from '../../data/geometry';
import { FT } from '../../data/types';
import type { LevelId, StairFlight } from '../../data/types';
import { IDENTITY, addBox, frameMatrix } from './bucket';
import type { BucketSet } from './bucket';
import { K } from './keys';

/**
 * Interior stairs: closed-riser oak treads with a nosing, a closed sloped carriage underneath
 * (painted soffit), white closed stringers / skirts on both sides, a wall-mounted oak handrail on
 * the spine-wall side, plus the two interior landings (oak slabs).
 *
 * Flight local frame: origin at the centre of the LOW edge, y = y0, local +X = direction of
 * ascent, local +Z across the flight.
 */

const TREAD_T = 0.04;
const NOSING = 0.02;
const RISER_T = 0.02;
const CARRIAGE_T = 0.22;
const SKIRT_H = 0.3;
const SKIRT_T = 0.025;
const RAIL_H = 0.9;
const RAIL_R = 0.022;
const RAIL_GAP = 0.075;
const LANDING_T = 0.15;
const SPINE_Z = WALL_BY_ID.get('g-int-spine')?.a[1] ?? 6 * FT;

interface Frame {
  matrix: THREE.Matrix4;
  /** Run length (m). */
  L: number;
  /** Total rise (m). */
  R: number;
  /** Clear width between the enclosing wall faces (m). */
  W: number;
  /** Local z of the clear-width centre. */
  zc: number;
  /** Local sign (+1 / -1) of the side nearest the spine wall. */
  spineSide: 1 | -1;
}

/** Half thickness of a wall lying along one side edge of the flight (0 if none). */
function edgeInset(alongX: boolean, coord: number, range: [number, number], f: StairFlight): number {
  let best = 0;
  for (const w of HOUSE.walls) {
    const ca = alongX ? w.a[1] : w.a[0];
    const cb = alongX ? w.b[1] : w.b[0];
    if (Math.abs(ca - coord) > 0.02 || Math.abs(cb - coord) > 0.02) continue;
    const la = alongX ? w.a[0] : w.a[1];
    const lb = alongX ? w.b[0] : w.b[1];
    if (Math.max(la, lb) < range[0] + 0.05 || Math.min(la, lb) > range[1] - 0.05) continue;
    if (w.baseY > f.y1 + 0.5 || w.baseY + w.height < f.y0 + 0.5) continue;
    best = Math.max(best, w.thickness / 2);
  }
  return best;
}

function flightFrame(f: StairFlight): Frame {
  const [x1, z1, x2, z2] = f.bounds;
  const alongX = f.dir === '+x' || f.dir === '-x';
  const L = alongX ? x2 - x1 : z2 - z1;
  const R = f.y1 - f.y0;
  const yaw = f.dir === '+x' ? 0 : f.dir === '-x' ? Math.PI : f.dir === '+z' ? -Math.PI / 2 : Math.PI / 2;
  const low: [number, number] =
    f.dir === '+x' ? [x1, (z1 + z2) / 2] : f.dir === '-x' ? [x2, (z1 + z2) / 2] : f.dir === '+z' ? [(x1 + x2) / 2, z1] : [(x1 + x2) / 2, z2];
  const matrix = frameMatrix(yaw, low[0], f.y0, low[1]);
  const c1 = alongX ? z1 : x1;
  const c2 = alongX ? z2 : x2;
  // world direction of local +Z: (sin yaw, 0, cos yaw)
  const plusZIsC2 = (alongX ? Math.cos(yaw) : Math.sin(yaw)) > 0;
  const range: [number, number] = alongX ? [x1, x2] : [z1, z2];
  const ins1 = edgeInset(alongX, c1, range, f);
  const ins2 = edgeInset(alongX, c2, range, f);
  const insPlus = plusZIsC2 ? ins2 : ins1;
  const insMinus = plusZIsC2 ? ins1 : ins2;
  const full = c2 - c1;
  const W = full - insPlus - insMinus;
  const zc = (insMinus - insPlus) / 2;
  const spineIsC2 = Math.abs(c2 - SPINE_Z) < Math.abs(c1 - SPINE_Z);
  const spineSide: 1 | -1 = spineIsC2 === plusZIsC2 ? 1 : -1;
  return { matrix, L, R, W, zc, spineSide };
}

function addFlight(set: BucketSet, f: StairFlight): void {
  const { matrix: M, L, R, W, zc, spineSide } = flightFrame(f);
  const n = Math.max(1, f.steps);
  const riser = R / n;
  const tread = L / n;
  const theta = Math.atan2(R, L);
  const slopeLen = Math.hypot(L, R);

  // treads + risers
  for (let i = 0; i < n; i++) {
    const top = (i + 1) * riser;
    const x0 = i * tread;
    addBox(set, { pz: '', nz: '', rest: K.oak }, { cx: (x0 - NOSING + x0 + tread) / 2, cy: top - TREAD_T / 2, cz: zc, sx: tread + NOSING, sy: TREAD_T, sz: W }, M);
    const rb = i * riser;
    const rt = top - TREAD_T;
    addBox(set, { nx: K.oak, rest: '' }, { cx: x0 + RISER_T / 2, cy: (rb + rt) / 2, cz: zc, sx: RISER_T, sy: rt - rb, sz: W }, M);
  }

  // closed carriage under the flight: a sloped slab whose top face follows the riser-foot line
  {
    const local = new THREE.Matrix4()
      .makeRotationZ(theta)
      .setPosition(L / 2 + (Math.sin(theta) * CARRIAGE_T) / 2, R / 2 - (Math.cos(theta) * CARRIAGE_T) / 2, zc);
    addBox(set, { py: '', rest: K.soffit }, { cx: 0, cy: 0, cz: 0, sx: slopeLen, sy: CARRIAGE_T, sz: W }, M.clone().multiply(local));
  }

  // closed stringers / skirts on both sides, flush against the wall faces
  for (const side of [-1, 1] as const) {
    const zs = zc + side * (W / 2 - SKIRT_T / 2);
    const lift = SKIRT_H / 2 - 0.02;
    const local = new THREE.Matrix4().makeRotationZ(theta).setPosition(L / 2 - Math.sin(theta) * lift, R / 2 + Math.cos(theta) * lift, zs);
    const keys = side > 0 ? { pz: '', rest: K.trim } : { nz: '', rest: K.trim };
    addBox(set, keys, { cx: 0, cy: 0, cz: 0, sx: slopeLen + 0.1, sy: SKIRT_H, sz: SKIRT_T }, M.clone().multiply(local));
  }

  // wall-mounted handrail on the spine side, 0.9 m above the nosing line
  {
    const runX = L - tread;
    const runY = R - riser;
    const railLen = Math.hypot(runX, runY) + 0.3;
    const zr = zc + spineSide * (W / 2 - RAIL_GAP);
    const cyl = new THREE.CylinderGeometry(RAIL_R, RAIL_R, railLen, 10);
    const local = new THREE.Matrix4().makeRotationZ(theta - Math.PI / 2).setPosition(runX / 2, (riser + R) / 2 + RAIL_H, zr);
    set.get(K.oak).addGeometry(cyl, M.clone().multiply(local));
    cyl.dispose();
    for (const t of [0.2, 0.5, 0.8]) {
      const x = t * runX;
      const y = riser + RAIL_H + (x * R) / L - 0.045;
      addBox(set, K.handle, { cx: x, cy: y, cz: zc + spineSide * (W / 2 - RAIL_GAP / 2), sx: 0.03, sy: 0.06, sz: RAIL_GAP }, M);
    }
  }
}

/** Appends the interior flights and landings to the per-level bucket sets. */
export function addStairs(sets: Record<LevelId, BucketSet>): void {
  for (const f of HOUSE.stairs) {
    if (f.style !== 'interior' || f.from === 'exterior') continue;
    addFlight(sets[f.from], f);
  }
  for (const p of HOUSE.platforms) {
    if (p.kind !== 'landing') continue;
    const [x1, z1, x2, z2] = p.bounds;
    const cx = (x1 + x2) / 2;
    const cz = (z1 + z2) / 2;
    if (!pointInLevelOutline(LEVEL_BY_ID.ground, cx, cz)) continue; // exterior landings belong to Exterior
    const level = levelForY(p.y + 0.01);
    addBox(sets[level], { py: K.hardwood, ny: K.soffit, rest: K.oak }, { cx, cy: p.y - LANDING_T / 2, cz, sx: x2 - x1, sy: LANDING_T, sz: z2 - z1 }, IDENTITY);
  }
}
