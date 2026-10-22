import { HOUSE } from '../../data/house';
import { LEVEL_BY_ID, WALL_GEOMS, levelForY, pointInLevelOutline, roomAt } from '../../data/geometry';
import type { WallGeom } from '../../data/geometry';
import type { Level, LevelId, WallDef } from '../../data/types';
import { addBox, frameMatrix } from './bucket';
import type { BoxKeys, BucketSet } from './bucket';
import { K, paintKey } from './keys';

/**
 * Walls. Every HOUSE.walls entry becomes box pieces in the wall's local frame (origin at `a`,
 * y = baseY, local +X along a→b, local +Z = WALL_GEOMS normal). Openings are cut out by splitting
 * the wall into full-height pieces between openings plus a sill piece and a header piece per
 * opening. Pieces are also split at storey floor lines (so a double-height wall gets a brick
 * ground storey and a siding upper storey, and belongs to the right level for the dollhouse
 * view) and at room boundaries (so each side of an interior wall takes the colour of the room it
 * actually faces).
 *
 * Extras drawn from the elevations:
 *  - a light rim board along the upper-storey floor line (covers the slab edge between brick and siding),
 *  - a concrete foundation skirt under ground-floor exterior walls that have no basement wall
 *    below them (the unexcavated garage), down to below grade.
 *
 * Seam hygiene: faces created by internal splits are not emitted (they would share edges with the
 * neighbouring piece's faces and flicker), the reveals of an opening are explicit quads covering
 * just the opening's height, wall ends are extended by half the thickness to close corners (end
 * faces at outside corners take the facade material so the residual 6 mm sliver is invisible), and
 * an end is pulled back when the adjoining wall has an opening right at that corner (front door
 * next to the vestibule jog).
 */

const WARM_WHITE = '#efe9df';
const FLOOR_BAND = 0.26;
const BAND_LIP = 0.02;
const SKIRT_DEPTH = 0.5;
/** Wall ends stop this far short of the adjoining wall's outer face (keeps hidden faces out of z-fighting range). */
const CORNER_PULLBACK = 0.006;
const EPS = 1e-3;

/** A rectangular wall piece: local x range along a→b and WORLD y range. */
interface Span {
  s: number;
  e: number;
  y0: number;
  y1: number;
  /** Faces to skip because they are internal (covered by a neighbouring piece). */
  hideS?: boolean;
  hideE?: boolean;
  hideY0?: boolean;
  /** A single reveal quad (s === e) at the side of an opening, facing +X ('px') or -X ('nx') into it. */
  reveal?: 'px' | 'nx';
}

/** An opening projected on the wall: local x range and WORLD bottom / top. */
interface Cut {
  s: number;
  e: number;
  bottom: number;
  top: number;
}

function openingCuts(w: WallDef, lvl: Level): Cut[] {
  return HOUSE.openings
    .filter((o) => o.wall === w.id)
    .map((o) => ({ s: o.at - o.width / 2, e: o.at + o.width / 2, bottom: lvl.floorY + o.sill, top: lvl.floorY + o.sill + o.height }))
    .sort((p, q) => p.s - q.s);
}

/**
 * Splits the rectangle [xs,xe]×[y0,y1] around the openings. With `reveals`, the end faces of the
 * pieces beside an opening are not emitted (they would be hidden behind the sill / header pieces
 * and z-fight along the shared edge); a reveal quad covering just the opening's height replaces them.
 */
function cutSpans(xs: number, xe: number, y0: number, y1: number, cuts: Cut[], reveals: boolean): Span[] {
  const out: Span[] = [];
  let cursor = xs;
  let prevOpening = false;
  for (const c of cuts) {
    const cs = Math.max(xs, Math.min(xe, c.s));
    const ce = Math.max(xs, Math.min(xe, c.e));
    if (ce - cs < EPS) continue;
    const hasLeft = cs > cursor + EPS;
    const hasRight = ce < xe - EPS;
    if (hasLeft) out.push({ s: cursor, e: cs, y0, y1, hideS: reveals && prevOpening, hideE: reveals });
    const rb = Math.max(c.bottom, y0);
    const rt = Math.min(c.top, y1);
    if (reveals && hasLeft && rt - rb > EPS) out.push({ s: cs, e: cs, y0: rb, y1: rt, reveal: 'px' });
    if (c.bottom > y0 + EPS) out.push({ s: cs, e: ce, y0, y1: Math.min(c.bottom, y1), hideS: reveals && hasLeft, hideE: reveals && hasRight });
    if (c.top < y1 - EPS) out.push({ s: cs, e: ce, y0: Math.max(c.top, y0), y1, hideS: reveals && hasLeft, hideE: reveals && hasRight });
    if (reveals && hasRight && rt - rb > EPS) out.push({ s: ce, e: ce, y0: rb, y1: rt, reveal: 'nx' });
    cursor = Math.max(cursor, ce);
    prevOpening = true;
  }
  if (cursor < xe - EPS) out.push({ s: cursor, e: xe, y0, y1, hideS: reveals && prevOpening });
  return out.filter((p) => (p.reveal || p.e - p.s > EPS) && p.y1 - p.y0 > EPS);
}

function splitAtY(spans: Span[], ys: number[]): Span[] {
  const out: Span[] = [];
  for (const sp of spans) {
    const inner = ys.filter((y) => y > sp.y0 + EPS && y < sp.y1 - EPS).sort((a, b) => a - b);
    let y0 = sp.y0;
    let hideY0 = sp.hideY0;
    for (const y of inner) {
      out.push({ ...sp, y0, y1: y, hideY0 });
      y0 = y;
      hideY0 = true;
    }
    out.push({ ...sp, y0, y1: sp.y1, hideY0 });
  }
  return out;
}

function splitAtX(spans: Span[], xs: number[]): Span[] {
  const out: Span[] = [];
  for (const sp of spans) {
    const inner = xs.filter((x) => x > sp.s + 0.02 && x < sp.e - 0.02).sort((a, b) => a - b);
    let s = sp.s;
    let hideS = sp.hideS;
    for (const x of inner) {
      out.push({ ...sp, s, e: x, hideS, hideE: true });
      s = x;
      hideS = true;
    }
    out.push({ ...sp, s, e: sp.e, hideS });
  }
  return out;
}

/** Local x positions (strictly inside the wall) where a room edge perpendicular to the wall meets it. */
function roomBoundaryCuts(w: WallDef, g: WallGeom, level: LevelId): number[] {
  const [dx, dz] = g.dir;
  const [nx, nz] = g.normal;
  const aN = w.a[0] * nx + w.a[1] * nz;
  const aD = w.a[0] * dx + w.a[1] * dz;
  const out: number[] = [];
  for (const r of HOUSE.rooms) {
    if (r.level !== level) continue;
    const [x1, z1, x2, z2] = r.bounds;
    let nMin = Infinity;
    let nMax = -Infinity;
    let dMin = Infinity;
    let dMax = -Infinity;
    for (const [cx, cz] of [
      [x1, z1],
      [x2, z1],
      [x2, z2],
      [x1, z2],
    ]) {
      const cn = cx * nx + cz * nz;
      const cd = cx * dx + cz * dz;
      nMin = Math.min(nMin, cn);
      nMax = Math.max(nMax, cn);
      dMin = Math.min(dMin, cd);
      dMax = Math.max(dMax, cd);
    }
    if (aN < nMin - 0.05 || aN > nMax + 0.05) continue;
    for (const x of [dMin - aD, dMax - aD]) {
      if (x > 0.05 && x < g.length - 0.05 && !out.some((o) => Math.abs(o - x) < 0.01)) out.push(x);
    }
  }
  return out;
}

/**
 * How far the wall extends past one end. Normally half its thickness (minus 2 mm) so corners
 * close. When a roughly perpendicular wall meets this end AND has an opening right there, the
 * end is pulled back to that wall's far face so this wall does not intrude into the opening.
 */
function endExtension(w: WallDef, g: WallGeom, end: 'a' | 'b'): number {
  let ext = Math.max(0, w.thickness / 2 - CORNER_PULLBACK);
  const P = end === 'a' ? w.a : w.b;
  for (const other of HOUSE.walls) {
    if (other.id === w.id || other.kind === 'railing') continue;
    const og = WALL_GEOMS.get(other.id);
    if (!og) continue;
    if (other.baseY >= w.baseY + w.height - 0.01 || other.baseY + other.height <= w.baseY + 0.01) continue;
    if (Math.abs(g.dir[0] * og.dir[0] + g.dir[1] * og.dir[1]) > 0.5) continue;
    const rx = P[0] - other.a[0];
    const rz = P[1] - other.a[1];
    const along = rx * og.dir[0] + rz * og.dir[1];
    const across = Math.abs(rx * og.normal[0] + rz * og.normal[1]);
    if (across > 0.02 || along < -0.02 || along > og.length + 0.02) continue;
    const lo = along - w.thickness / 2;
    const hi = along + w.thickness / 2;
    const blocked = HOUSE.openings.some((o) => o.wall === other.id && o.at - o.width / 2 < hi - 0.005 && o.at + o.width / 2 > lo + 0.005);
    if (blocked) ext = Math.min(ext, -other.thickness / 2 + 0.001);
  }
  return ext;
}

/** Ground-floor exterior walls over the unexcavated garage have nothing below them. */
function hasBasementBelow(g: WallGeom): boolean {
  const b = LEVEL_BY_ID.basement;
  const [mx, mz] = g.mid;
  const [nx, nz] = g.normal;
  return pointInLevelOutline(b, mx + nx * 0.3, mz + nz * 0.3) || pointInLevelOutline(b, mx - nx * 0.3, mz - nz * 0.3);
}

function emitBox(set: BucketSet, keys: BoxKeys, sp: Span, thickness: number, w: WallDef, matrix: ReturnType<typeof frameMatrix>): void {
  addBox(set, keys, { cx: (sp.s + sp.e) / 2, cy: (sp.y0 + sp.y1) / 2 - w.baseY, cz: 0, sx: sp.e - sp.s, sy: sp.y1 - sp.y0, sz: thickness }, matrix);
}

function addRailing(set: BucketSet, w: WallDef, g: WallGeom, matrix: ReturnType<typeof frameMatrix>): void {
  const h = w.height;
  const L = g.length;
  addBox(set, K.oak, { cx: L / 2, cy: h - 0.03, cz: 0, sx: L, sy: 0.06, sz: 0.07 }, matrix);
  addBox(set, K.trim, { cx: L / 2, cy: 0.09, cz: 0, sx: L, sy: 0.04, sz: 0.04 }, matrix);
  const balTop = h - 0.06;
  const balBottom = 0.11;
  const n = Math.max(1, Math.round(L / 0.12));
  for (let i = 1; i < n; i++) {
    const x = (L * i) / n;
    addBox(set, { py: '', ny: '', rest: K.trim }, { cx: x, cy: (balTop + balBottom) / 2, cz: 0, sx: 0.022, sy: balTop - balBottom, sz: 0.022 }, matrix);
  }
  for (const x of [0.045, L - 0.045]) {
    addBox(set, { ny: '', rest: K.trim }, { cx: x, cy: (h + 0.05) / 2, cz: 0, sx: 0.09, sy: h + 0.05, sz: 0.09 }, matrix);
  }
}

/** Appends every wall of the house to the per-level bucket sets. */
export function addWalls(sets: Record<LevelId, BucketSet>): void {
  const upperFloor = LEVEL_BY_ID.upper.floorY;
  const groundFloor = LEVEL_BY_ID.ground.floorY;
  const floorYs = HOUSE.levels.map((l) => l.floorY);

  for (const w of HOUSE.walls) {
    const g = WALL_GEOMS.get(w.id);
    if (!g) continue;
    const lvl = LEVEL_BY_ID[w.level];
    const matrix = frameMatrix(g.yaw, w.a[0], w.baseY, w.a[1]);

    if (w.kind === 'railing') {
      addRailing(sets[w.level], w, g, matrix);
      continue;
    }

    const extA = endExtension(w, g, 'a');
    const extB = endExtension(w, g, 'b');
    const xs = -extA;
    const xe = g.length + extB;
    const top = w.baseY + w.height;
    const cuts = openingCuts(w, lvl);
    const [nx, nz] = g.normal;
    // Which side of an exterior wall faces out (+1 = local +Z / the normal side). Decided once per
    // wall at its midpoint: the corner extensions would otherwise probe past the adjoining wall.
    const outside = w.exterior ? (pointInLevelOutline(lvl, g.mid[0] + nx * 0.6, g.mid[1] + nz * 0.6) ? -1 : 1) : 0;

    // ---- 1. the wall body ----
    for (const sp of splitAtY(cutSpans(xs, xe, w.baseY, top, cuts, true), floorYs)) {
      const midY = (sp.y0 + sp.y1) / 2;
      const pieceLevel = levelForY(midY);
      const facade = midY < groundFloor - 0.01 ? K.concrete : midY < upperFloor - 0.01 ? K.brick : K.siding;
      if (sp.reveal) {
        const keys: BoxKeys = sp.reveal === 'px' ? { px: K.paintLight, rest: '' } : { nx: K.paintLight, rest: '' };
        emitBox(sets[pieceLevel], keys, sp, w.thickness, w, matrix);
        continue;
      }
      for (const p of splitAtX([sp], roomBoundaryCuts(w, g, pieceLevel))) {
        const mx = w.a[0] + g.dir[0] * ((p.s + p.e) / 2);
        const mz = w.a[1] + g.dir[1] * ((p.s + p.e) / 2);
        let pz: string;
        let nzKey: string;
        if (w.exterior) {
          const room = roomAt(pieceLevel, mx - outside * nx * 0.3, mz - outside * nz * 0.3);
          const inside = paintKey(room?.wallColor ?? WARM_WHITE);
          pz = outside > 0 ? facade : inside;
          nzKey = outside > 0 ? inside : facade;
        } else {
          pz = paintKey(roomAt(pieceLevel, mx + nx * 0.3, mz + nz * 0.3)?.wallColor ?? WARM_WHITE);
          nzKey = paintKey(roomAt(pieceLevel, mx - nx * 0.3, mz - nz * 0.3)?.wallColor ?? WARM_WHITE);
        }
        // end faces: facade at an outside corner (the sliver left by the 2 mm pull-back), paint elsewhere (reveals)
        const nxKey = p.hideS ? '' : w.exterior && extA > 0 && p.s <= xs + EPS ? facade : K.paintLight;
        const pxKey = p.hideE ? '' : w.exterior && extB > 0 && p.e >= xe - EPS ? facade : K.paintLight;
        const onFloor = floorYs.some((f) => Math.abs(p.y0 - f) < 0.01);
        const keys: BoxKeys = { pz, nz: nzKey, px: pxKey, nx: nxKey, ny: p.hideY0 || onFloor ? '' : K.paintLight, rest: K.paintLight };
        emitBox(sets[pieceLevel], keys, p, w.thickness, w, matrix);
      }
    }

    if (!w.exterior) continue;

    // ---- 2. rim board along the upper floor line ----
    if (w.baseY <= upperFloor + 0.01 && top >= upperFloor + 0.01) {
      for (const sp of cutSpans(xs, xe, upperFloor - FLOOR_BAND, upperFloor + BAND_LIP, cuts, false)) {
        emitBox(sets.upper, K.trim, sp, w.thickness + 0.04, w, matrix);
      }
    }

    // ---- 3. foundation skirt where there is no basement wall below ----
    if (w.level === 'ground' && !hasBasementBelow(g)) {
      for (const sp of cutSpans(xs, xe, HOUSE.gradeY - SKIRT_DEPTH, groundFloor, cuts, false)) {
        emitBox(sets.ground, { py: '', ny: '', rest: K.concrete }, sp, w.thickness - 0.01, w, matrix);
      }
    }
  }
}
