/**
 * Far-lawn relief (finding 8). The grade is exactly GRADE_Y (what groundHeightAt() walks on)
 * inside FLAT_RECT — the house, the fenced yard and the street — and along the whole street
 * strip; beyond a 14 m fade the lawn rolls (two noise octaves) and rises toward the horizon so
 * the far plane never ends in a tabletop line. Shared by Ground.tsx (the displaced plane) and
 * Landscaping.tsx (the horizon billboards stand on it).
 */
import { GRADE_Y } from './data';
import type { Rect } from './geom';
import { fbm3 } from './noise';

/** Centre of the lawn plane (metres); the relief rises radially from here. */
export const LAWN_CX = 6;
export const LAWN_CZ = 5;
/** Extent of the lawn plane (metres, square). */
export const LAWN_SIZE = 240;
/** Half extents of the flat zone around the house: multiples of LAWN_CELL so the grid seams align. */
export const FLAT_HALF_X = 28;
export const FLAT_HALF_Z = 24;
export const FLAT_RECT: Rect = [LAWN_CX - FLAT_HALF_X, LAWN_CZ - FLAT_HALF_Z, LAWN_CX + FLAT_HALF_X, LAWN_CZ + FLAT_HALF_Z];
/** Grid cell of the displaced outer lawn. */
export const LAWN_CELL = 2;
const FADE = 14;
/** X range kept flat for the full length of the street (the slab, curbs, hedge and mailbox sit on it). */
const STREET_FLAT_X: [number, number] = [-26, -9];
const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** Height of the lawn above GRADE_Y at (x, z): 0 near the house, ±0.35 m rolls plus a 1.2 m rise far out. */
export function lawnLift(x: number, z: number): number {
  const dx = Math.max(FLAT_RECT[0] - x, 0, x - FLAT_RECT[2]);
  const dz = Math.max(FLAT_RECT[1] - z, 0, z - FLAT_RECT[3]);
  const dStreet = Math.max(STREET_FLAT_X[0] - x, 0, x - STREET_FLAT_X[1]);
  const w = smooth(Math.hypot(dx, dz) / FADE) * smooth(dStreet / FADE);
  if (w <= 0) return 0;
  const n = fbm3(x, 0, z, [{ wavelength: 18, amplitude: 0.35 }, { wavelength: 7, amplitude: 0.1 }], 5);
  const r = Math.hypot(x - LAWN_CX, z - LAWN_CZ);
  const rise = 1.2 * smooth((r - 20) / 60);
  return w * (n + rise);
}

export function lawnHeightAt(x: number, z: number): number {
  return GRADE_Y + lawnLift(x, z);
}
