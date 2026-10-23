import { HOUSE } from '../../data/house';
import { LEVEL_BY_ID, WALL_BY_ID, WALL_GEOMS, levelForY, pointAlongWall, pointInLevelOutline } from '../../data/geometry';
import type { WallGeom } from '../../data/geometry';
import type { LevelId, WallDef } from '../../data/types';
import { addBox, frameMatrix } from './bucket';
import type { BoxKeys, BucketSet, FaceId } from './bucket';
import { K } from './keys';
import { BAND_LIP } from './walls';

/**
 * Painted exterior trim the clapboard storey needs so the siding does not end in space:
 *  - 1x4 corner boards (90 × 20 mm) on both faces of every outside corner of the siding, from the
 *    rim band to the soffit — the board on the second face is 20 mm wider and covers the first
 *    board's edge, as nailed on site; a 30 mm square post in every inside corner;
 *  - a 1x6 frieze board (140 × 20 mm) under the soffit along every siding wall, butting into the
 *    corner boards and running into the inside-corner posts;
 *  - a 1x2 drip cap (20 mm tall, projecting 40 mm) on top of the exterior head casing of every
 *    window and the patio door (the brick mould of windows/geometry.ts: 6 cm wide, 1 cm over the
 *    frame → 5 cm past the opening), 1 cm longer than the casing at each end.
 *
 * Everything is built in the wall's local frame (walls.ts) and merged into the storey's `extTrim`
 * bucket. Faces lying on a wall, in the rim band, in the soffit plane or inside a mating board are
 * not emitted (coplanar faces flicker; hidden faces cost triangles).
 */

/** Nominal 1x stock. */
const T = 0.02;
const CORNER_W = 0.09;
const INSIDE_POST = 0.03;
const FRIEZE_H = 0.14;
/** Underside of the soffit below the eave line (exterior/Roof.tsx SOFFIT_DROP). */
const SOFFIT_DROP = 0.12;
/** Trim pushed this far into the soffit plane so no hairline opens at the joint. */
const BURY = 0.004;
const DRIP_H = 0.02;
const DRIP_PROJ = 0.04;
/** Exterior head casing past the opening (windows/geometry.ts BRICKMOULD_W − BRICKMOULD_IN). */
const HEAD_CASING = 0.05;
const DRIP_OVERHANG = 0.01;
const EPS = 1e-3;

type End = 'a' | 'b';

interface Joint {
  kind: 'convex' | 'concave' | 'collinear' | 'free';
  partner?: WallDef;
}

/** Only the listed faces are emitted. */
function faces(ids: FaceId[]): BoxKeys {
  const keys: BoxKeys = { rest: '' };
  for (const id of ids) keys[id] = K.extTrim;
  return keys;
}

/** Which local side (+1 = local +Z) of an exterior wall faces out, decided at its midpoint. */
function outsideOf(w: WallDef, g: WallGeom): 1 | -1 {
  const lvl = LEVEL_BY_ID[w.level];
  return pointInLevelOutline(lvl, g.mid[0] + g.normal[0] * 0.6, g.mid[1] + g.normal[1] * 0.6) ? -1 : 1;
}

/** How the siding of wall `w` ends at `end`: against which exterior wall, and whether the corner points out or in. */
function jointAt(w: WallDef, g: WallGeom, end: End, y0: number, y1: number): Joint {
  const P = end === 'a' ? w.a : w.b;
  const bodyDir: [number, number] = end === 'a' ? g.dir : [-g.dir[0], -g.dir[1]];
  for (const o of HOUSE.walls) {
    if (o.id === w.id || !o.exterior || o.kind !== 'wall') continue;
    if (o.baseY > y0 + 0.01 || o.baseY + o.height < y1 - 0.01) continue; // must carry siding over the same height
    const og = WALL_GEOMS.get(o.id);
    if (!og) continue;
    const rx = P[0] - o.a[0];
    const rz = P[1] - o.a[1];
    const along = rx * og.dir[0] + rz * og.dir[1];
    const across = Math.abs(rx * og.normal[0] + rz * og.normal[1]);
    if (across > 0.02 || (Math.abs(along) > 0.02 && Math.abs(along - og.length) > 0.02)) continue;
    const perpendicular = Math.abs(g.dir[0] * og.dir[0] + g.dir[1] * og.dir[1]) < 0.5;
    if (!perpendicular) return { kind: 'collinear', partner: o };
    // the corner is re-entrant when this wall's body runs along the partner's outside
    const so = outsideOf(o, og);
    const concave = bodyDir[0] * og.normal[0] * so + bodyDir[1] * og.normal[1] * so > 0;
    return { kind: concave ? 'concave' : 'convex', partner: o };
  }
  return { kind: 'free' };
}

interface Frame {
  set: BucketSet;
  M: ReturnType<typeof frameMatrix>;
  /** Local x of the wall end and the direction out of the body along local x. */
  xE: number;
  dOut: 1 | -1;
  /** Local side facing out, this wall's thickness and the partner's. */
  sA: 1 | -1;
  tA: number;
  tB: number;
  /** Local y range of the boards (band top → soffit, buried). */
  cy: number;
  sy: number;
}

/** The pair of corner boards wrapping an outside corner, emitted from one of its two walls. */
function addConvexCorner(f: Frame): void {
  const { xE, dOut, sA, tA, tB } = f;
  const front = sA > 0 ? 'pz' : 'nz';
  // board on this wall's face: from the corner edge back CORNER_W; its corner end is buried in the other board
  addBox(f.set, faces([front, dOut > 0 ? 'nx' : 'px']), { cx: xE + dOut * (tB / 2 - CORNER_W / 2), cy: f.cy, cz: sA * (tA / 2 + T / 2), sx: CORNER_W, sy: f.sy, sz: T }, f.M);
  // board on the partner's face: covers the first board's edge, so it shows CORNER_W + T wide
  addBox(
    f.set,
    faces([dOut > 0 ? 'px' : 'nx', front, sA > 0 ? 'nz' : 'pz']),
    { cx: xE + dOut * (tB / 2 + T / 2), cy: f.cy, cz: sA * (tA / 2 + (T - CORNER_W) / 2), sx: T, sy: f.sy, sz: CORNER_W + T },
    f.M,
  );
}

/** Square post in a re-entrant corner; the two friezes run into it. */
function addConcavePost(f: Frame): void {
  const { xE, dOut, sA, tA, tB } = f;
  addBox(
    f.set,
    faces([dOut > 0 ? 'nx' : 'px', sA > 0 ? 'pz' : 'nz']),
    { cx: xE - dOut * (tB / 2 + INSIDE_POST / 2), cy: f.cy, cz: sA * (tA / 2 + INSIDE_POST / 2), sx: INSIDE_POST, sy: f.sy, sz: INSIDE_POST },
    f.M,
  );
}

/** Where the frieze stops at a wall end (local x) and whether it shows an end face there. */
function friezeEnd(j: Joint, xE: number, dOut: 1 | -1, tB: number): { x: number; cap: boolean } {
  if (j.kind === 'convex') return { x: xE + dOut * (tB / 2 - CORNER_W), cap: false };
  if (j.kind === 'concave') return { x: xE - dOut * (tB / 2), cap: false };
  return { x: xE, cap: j.kind === 'free' };
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

function addSidingTrim(sets: Record<LevelId, BucketSet>): void {
  const upper = LEVEL_BY_ID.upper;
  const y0 = upper.floorY + BAND_LIP;
  const soffitY = upper.wallTop - SOFFIT_DROP;
  const y1 = soffitY + BURY;
  const set = sets.upper;
  for (const w of HOUSE.walls) {
    if (!w.exterior || w.kind !== 'wall') continue;
    const top = w.baseY + w.height;
    if (w.baseY > y0 + 0.01 || top < y1 - 0.01) continue; // no full-height siding on this wall
    const g = WALL_GEOMS.get(w.id);
    if (!g) continue;
    const M = frameMatrix(g.yaw, w.a[0], w.baseY, w.a[1]);
    const sA = outsideOf(w, g);
    const tA = w.thickness;
    const cy = (y0 + y1) / 2 - w.baseY;
    const sy = y1 - y0;
    const joints: Record<End, Joint> = { a: jointAt(w, g, 'a', y0, y1), b: jointAt(w, g, 'b', y0, y1) };
    const ends: { x: number; cap: boolean }[] = [];
    for (const end of ['a', 'b'] as const) {
      const j = joints[end];
      const xE = end === 'a' ? 0 : g.length;
      const dOut: 1 | -1 = end === 'a' ? -1 : 1;
      const tB = j.partner?.thickness ?? 0;
      ends.push(friezeEnd(j, xE, dOut, tB));
      // every corner is shared by two walls: the one with the smaller id builds it
      if (j.partner && w.id < j.partner.id) {
        const f: Frame = { set, M, xE, dOut, sA, tA, tB, cy, sy };
        if (j.kind === 'convex') addConvexCorner(f);
        else if (j.kind === 'concave') addConcavePost(f);
      }
    }
    // frieze under the soffit, cut around anything that reaches up into it
    const friezeY0 = soffitY - FRIEZE_H;
    const gaps = HOUSE.openings
      .filter((o) => o.wall === w.id && LEVEL_BY_ID[w.level].floorY + o.sill + o.height > friezeY0 - EPS)
      .map((o): [number, number] => [o.at - o.width / 2 - HEAD_CASING - DRIP_OVERHANG, o.at + o.width / 2 + HEAD_CASING + DRIP_OVERHANG])
      .sort((p, q) => p[0] - q[0]);
    const [ea, eb] = ends;
    for (const [s, e] of subtractGaps(ea.x, eb.x, gaps)) {
      const ids: FaceId[] = [sA > 0 ? 'pz' : 'nz', 'ny'];
      if (s <= ea.x + EPS ? ea.cap : true) ids.push('nx');
      if (e >= eb.x - EPS ? eb.cap : true) ids.push('px');
      addBox(set, faces(ids), { cx: (s + e) / 2, cy: (friezeY0 + y1) / 2 - w.baseY, cz: sA * (tA / 2 + T / 2), sx: e - s, sy: y1 - friezeY0, sz: T }, M);
    }
  }
}

function addDripCaps(sets: Record<LevelId, BucketSet>): void {
  for (const o of HOUSE.openings) {
    if (o.kind !== 'window' && o.kind !== 'patio') continue;
    const w = WALL_BY_ID.get(o.wall);
    if (!w || !w.exterior) continue;
    const g = WALL_GEOMS.get(w.id);
    if (!g) continue;
    const lvl = LEVEL_BY_ID[w.level];
    const [px, pz] = pointAlongWall(w, o.at);
    // same side test as the window instances (data/geometry.ts): outside = away from the room
    const outside: 1 | -1 = pointInLevelOutline(lvl, px + g.normal[0] * 0.6, pz + g.normal[1] * 0.6) ? -1 : 1;
    const capY = lvl.floorY + o.sill + o.height + HEAD_CASING;
    const keys = faces(['px', 'nx', 'py', 'ny', outside > 0 ? 'pz' : 'nz']);
    addBox(
      sets[levelForY(capY)],
      keys,
      { cx: o.at, cy: capY + DRIP_H / 2 - w.baseY, cz: outside * (w.thickness / 2 + DRIP_PROJ / 2), sx: o.width + 2 * (HEAD_CASING + DRIP_OVERHANG), sy: DRIP_H, sz: DRIP_PROJ },
      frameMatrix(g.yaw, w.a[0], w.baseY, w.a[1]),
    );
  }
}

/** Appends the corner boards, frieze and drip caps to the per-level bucket sets. */
export function addExteriorTrim(sets: Record<LevelId, BucketSet>): void {
  addSidingTrim(sets);
  addDripCaps(sets);
}
