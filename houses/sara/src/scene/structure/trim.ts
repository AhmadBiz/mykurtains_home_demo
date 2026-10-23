import * as THREE from 'three';
import { HOUSE } from '../../data/house';
import { LEVEL_BY_ID, WALL_GEOMS, roomAt } from '../../data/geometry';
import type { WallGeom } from '../../data/geometry';
import type { Level, LevelId, Opening, Room, WallDef } from '../../data/types';
import { frameMatrix } from './bucket';
import type { BucketSet } from './bucket';
import { K, isTiledRoom } from './keys';
import { coveArc, extrudeProfile } from './profile';
import type { ProfilePoint, RunEnd } from './profile';
import { roomBoundaryCuts } from './walls';

/**
 * Painted trim along the walls: 10 cm × 1.4 cm baseboards on every finished room's wall faces on
 * every storey, and an 8 cm coved crown moulding along the ceiling line of the ground and upper
 * floor rooms. Runs follow the same wall-face segmentation as the walls (room boundaries) and stop
 * at the casing of every door / cased opening (the same gaps the wall pieces use). At wall
 * junctions the runs are mitred at 45° — inner corners, outer corners wrapped around a wall end,
 * and the end faces of free-standing wall ends — so adjacent runs share one diagonal plane and
 * never overlap; where no mating run exists (an unfinished room around the corner, a door right
 * at the corner) the run ends in a flat cap instead.
 *
 * Unfinished rooms (concrete / epoxy floors: garage, mechanical, storage, cold room) and the open
 * stairwell get no trim; the basement gets baseboards but no crown; the tiled bathrooms keep
 * their crown but no baseboard (the wall tile runs down to the floor).
 */

const BASE_H = 0.1;
const BASE_T = 0.014;
const BASE_PROFILE: ProfilePoint[] = [
  { out: BASE_T, y: 0 },
  { out: BASE_T, y: BASE_H - 0.016 },
  { out: BASE_T - 0.002, y: BASE_H - 0.007, smooth: true },
  { out: BASE_T - 0.007, y: BASE_H - 0.001, smooth: true },
  { out: 0.003, y: BASE_H },
  { out: 0, y: BASE_H },
];

const CROWN = 0.08;
const CROWN_PROFILE: ProfilePoint[] = [
  { out: 0, y: -CROWN },
  { out: 0.012, y: -CROWN },
  { out: 0.012, y: -CROWN + 0.012 },
  ...coveArc([0.012, -CROWN + 0.012], [CROWN - 0.012, -0.012], 7),
  { out: CROWN - 0.012, y: -0.012 },
  { out: CROWN, y: -0.012 },
  { out: CROWN, y: 0 },
];

/** Casing overlap beside an opening: trim stops against the casing's backband. */
const GAP_MARGIN = 0.03;
const EPS = 1e-3;

type Kind = 'base' | 'crown';

interface Band {
  kind: Kind;
  /** World y range of the trim piece (partner / opening tests). */
  y0: number;
  y1: number;
  /** Base line of the profile (world y). */
  baseline: number;
}

function hasTrim(room: Room | undefined, kind: Kind): boolean {
  if (!room || room.noFloor) return false;
  if (room.floor === 'concrete' || room.floor === 'epoxy') return false;
  if (kind === 'base') return !isTiledRoom(room);
  return room.level !== 'basement';
}

function trimAt(level: LevelId, x: number, z: number, kind: Kind): boolean {
  return hasTrim(roomAt(level, x, z), kind);
}

/** World y range of an opening on a wall. */
function openingRange(o: Opening, wall: WallDef): [number, number] {
  const floorY = LEVEL_BY_ID[wall.level].floorY;
  return [floorY + o.sill, floorY + o.sill + o.height];
}

function interrupts(o: Opening, wall: WallDef, band: Band): boolean {
  const [b, t] = openingRange(o, wall);
  return b < band.y1 - EPS && t > band.y0 + EPS;
}

// ---------------------------------------------------------------------------------------------
// Junctions
// ---------------------------------------------------------------------------------------------

interface Partner {
  wall: WallDef;
  perpendicular: boolean;
  /** The junction point is at one of the partner's ends (L-corner) rather than inside it (T). */
  atEnd: boolean;
  /** Direction the partner's body extends from the junction point (perpendicular partners at an end). */
  bodyDir: [number, number];
  /** An opening on the partner interrupts its trim right at the junction. */
  blocked: boolean;
}

function partnersAt(w: WallDef, P: [number, number], g: WallGeom, band: Band): Partner[] {
  const out: Partner[] = [];
  for (const o of HOUSE.walls) {
    if (o.id === w.id || o.kind === 'railing') continue;
    if (o.baseY > band.y1 - 0.01 || o.baseY + o.height < band.y0 + 0.01) continue;
    const og = WALL_GEOMS.get(o.id);
    if (!og) continue;
    const rx = P[0] - o.a[0];
    const rz = P[1] - o.a[1];
    const along = rx * og.dir[0] + rz * og.dir[1];
    const across = Math.abs(rx * og.normal[0] + rz * og.normal[1]);
    if (across > 0.02 || along < -0.02 || along > og.length + 0.02) continue;
    const perpendicular = Math.abs(g.dir[0] * og.dir[0] + g.dir[1] * og.dir[1]) < 0.5;
    const atA = along < 0.02;
    const atB = along > og.length - 0.02;
    const bodyDir: [number, number] = atA ? og.dir : [-og.dir[0], -og.dir[1]];
    const half = w.thickness / 2 + GAP_MARGIN;
    const blocked = HOUSE.openings.some((op) => op.wall === o.id && interrupts(op, o, band) && op.at - op.width / 2 < along + half && op.at + op.width / 2 > along - half);
    out.push({ wall: o, perpendicular, atEnd: atA || atB, bodyDir, blocked });
  }
  return out;
}

const MITRE_IN: RunEnd = { ext: 0, slope: -1, cap: false };
const BUTT: RunEnd = { ext: 0, slope: 0, cap: false };
const CAP: RunEnd = { ext: 0, slope: 0, cap: true };

/** How a side run ends at one of the wall's ends. */
function endJoint(w: WallDef, g: WallGeom, end: 'a' | 'b', side: 1 | -1, level: LevelId, band: Band): RunEnd {
  const P = end === 'a' ? w.a : w.b;
  const dirOut: [number, number] = end === 'a' ? [-g.dir[0], -g.dir[1]] : g.dir;
  const [nx, nz] = g.normal;
  const partners = partnersAt(w, P, g, band);

  // 1. the run meets a wall standing on this side (T-junction, or an L whose body is on this side)
  const inner = partners.find((p) => p.perpendicular && (!p.atEnd || (p.bodyDir[0] * nx + p.bodyDir[1] * nz) * side > 0));
  if (inner) {
    const ext = -inner.wall.thickness / 2;
    return inner.blocked ? { ext, slope: 0, cap: true } : { ...MITRE_IN, ext };
  }
  // 2. the wall continues collinearly: the run simply carries on (or stops if the continuation has no trim)
  const collinear = partners.find((p) => !p.perpendicular);
  if (collinear) {
    const cont = trimAt(level, P[0] + dirOut[0] * 0.3 + side * nx * 0.3, P[1] + dirOut[1] * 0.3 + side * nz * 0.3, band.kind) && !collinear.blocked;
    return cont ? BUTT : CAP;
  }
  // 3. outer corner: wrap around the end of the partner standing on the other side
  const outer = partners.find((p) => p.perpendicular && p.atEnd);
  if (outer) {
    const tp = outer.wall.thickness;
    const mate = trimAt(level, P[0] + dirOut[0] * (tp / 2 + 0.3) + side * nx * 0.3, P[1] + dirOut[1] * (tp / 2 + 0.3) + side * nz * 0.3, band.kind) && !outer.blocked;
    return mate ? { ext: tp / 2, slope: 1, cap: false } : { ext: tp / 2, slope: 0, cap: true };
  }
  // 4. free end: mitre into the run across the end face when the room beyond is finished
  const endFace = trimAt(level, P[0] + dirOut[0] * 0.3, P[1] + dirOut[1] * 0.3, band.kind);
  return endFace ? { ext: 0, slope: 1, cap: false } : CAP;
}

// ---------------------------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------------------------

interface Piece {
  s: number;
  e: number;
  a: RunEnd;
  b: RunEnd;
}

function subtractGaps(s: number, e: number, gaps: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  let cursor = s;
  for (const [gs, ge] of gaps) {
    if (ge <= cursor + EPS || gs >= e - EPS) continue;
    if (gs > cursor + EPS) out.push([cursor, gs]);
    cursor = Math.max(cursor, ge);
  }
  if (cursor < e - EPS) out.push([cursor, e]);
  return out;
}

/** Trim pieces along one side of a wall for one band; marks which wall ends the pieces reach. */
function sidePieces(w: WallDef, g: WallGeom, side: 1 | -1, level: Level, band: Band, reaches: { a: boolean; b: boolean }): Piece[] {
  const [nx, nz] = g.normal;
  const L = g.length;
  const cuts = roomBoundaryCuts(w, g, level.id).sort((p, q) => p - q);
  const bounds = [0, ...cuts, L];
  const segs = bounds.slice(0, -1).map((s, i) => {
    const e = bounds[i + 1];
    const m = (s + e) / 2;
    return { s, e, trim: trimAt(level.id, w.a[0] + g.dir[0] * m + side * nx * 0.3, w.a[1] + g.dir[1] * m + side * nz * 0.3, band.kind) };
  });
  const gaps = HOUSE.openings
    .filter((o) => o.wall === w.id && interrupts(o, w, band))
    .map((o): [number, number] => [o.at - o.width / 2 - GAP_MARGIN, o.at + o.width / 2 + GAP_MARGIN])
    .sort((p, q) => p[0] - q[0]);
  const atGap = (x: number) => gaps.some(([gs, ge]) => Math.abs(x - gs) < EPS || Math.abs(x - ge) < EPS);
  const pieces: Piece[] = [];
  segs.forEach((seg, i) => {
    if (!seg.trim) return;
    for (const [s, e] of subtractGaps(seg.s, seg.e, gaps)) {
      let a: RunEnd;
      let b: RunEnd;
      if (s <= EPS) {
        a = endJoint(w, g, 'a', side, level.id, band);
        reaches.a = true;
      } else if (atGap(s)) a = CAP;
      else a = segs[i - 1]?.trim ? BUTT : CAP;
      if (e >= L - EPS) {
        b = endJoint(w, g, 'b', side, level.id, band);
        reaches.b = true;
      } else if (atGap(e)) b = CAP;
      else b = segs[i + 1]?.trim ? BUTT : CAP;
      pieces.push({ s, e, a, b });
    }
  });
  return pieces;
}

function profileFor(kind: Kind): ProfilePoint[] {
  return kind === 'base' ? BASE_PROFILE : CROWN_PROFILE;
}

/** Trim across the end face of a free-standing wall end, mitred into the side runs that reach it. */
function addEndFace(set: BucketSet, w: WallDef, g: WallGeom, end: 'a' | 'b', level: Level, band: Band, M: THREE.Matrix4, reach: Record<1 | -1, boolean>): void {
  const P = end === 'a' ? w.a : w.b;
  const dirOut: [number, number] = end === 'a' ? [-g.dir[0], -g.dir[1]] : g.dir;
  if (partnersAt(w, P, g, band).length > 0) return;
  if (!trimAt(level.id, P[0] + dirOut[0] * 0.3, P[1] + dirOut[1] * 0.3, band.kind)) return;
  // frame on the end face: local z' = outward normal of the end, x' runs across the wall thickness
  const theta = end === 'b' ? Math.PI / 2 : -Math.PI / 2;
  const xEnd = end === 'b' ? g.length : 0;
  const Mend = M.clone().multiply(new THREE.Matrix4().makeRotationY(theta).setPosition(xEnd, 0, 0));
  // with theta = +90° (end b) x' = -t/2 lies on the +Z side; with -90° (end a) on the -Z side
  const sideAtStart: 1 | -1 = end === 'b' ? 1 : -1;
  const joint = (side: 1 | -1): RunEnd => (reach[side] ? { ext: 0, slope: 1, cap: false } : CAP);
  const t = w.thickness;
  extrudeProfile(
    set,
    K.trim,
    profileFor(band.kind),
    { s: -t / 2, e: t / 2, a: joint(sideAtStart), b: joint(sideAtStart === 1 ? -1 : 1), side: 1, halfT: 0, y: band.baseline - w.baseY, closeAt: [0, 0] },
    Mend,
  );
}

function bandsFor(w: WallDef, level: Level): Band[] {
  const top = w.baseY + w.height;
  const bands: Band[] = [];
  if (level.floorY < w.baseY - 0.01 || level.floorY > top - 0.5) return bands;
  bands.push({ kind: 'base', y0: level.floorY, y1: level.floorY + BASE_H, baseline: level.floorY });
  const ceilingY = level.floorY + level.ceilingHeight;
  if (top >= ceilingY - 0.01) bands.push({ kind: 'crown', y0: ceilingY - CROWN, y1: ceilingY, baseline: ceilingY });
  return bands;
}

/** Appends baseboards and crown moulding for every wall to the per-level bucket sets. */
export function addTrim(sets: Record<LevelId, BucketSet>): void {
  for (const w of HOUSE.walls) {
    if (w.kind === 'railing') continue;
    const g = WALL_GEOMS.get(w.id);
    if (!g) continue;
    const M = frameMatrix(g.yaw, w.a[0], w.baseY, w.a[1]);
    for (const level of HOUSE.levels) {
      const set = sets[level.id];
      for (const band of bandsFor(w, level)) {
        const reach: Record<'a' | 'b', Record<1 | -1, boolean>> = { a: { 1: false, [-1]: false }, b: { 1: false, [-1]: false } };
        for (const side of [1, -1] as const) {
          const reaches = { a: false, b: false };
          const pieces = sidePieces(w, g, side, level, band, reaches);
          reach.a[side] = reaches.a;
          reach.b[side] = reaches.b;
          for (const p of pieces) {
            extrudeProfile(
              set,
              K.trim,
              profileFor(band.kind),
              { s: p.s, e: p.e, a: p.a, b: p.b, side, halfT: w.thickness / 2, y: band.baseline - w.baseY, closeAt: [0, 0] },
              M,
            );
          }
        }
        addEndFace(set, w, g, 'a', level, band, M, reach.a);
        addEndFace(set, w, g, 'b', level, band, M, reach.b);
      }
    }
  }
}
