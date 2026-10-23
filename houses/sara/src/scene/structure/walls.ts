import { HOUSE } from '../../data/house';
import { LEVEL_BY_ID, WALL_GEOMS, levelForY, pointInLevelOutline, roomAt } from '../../data/geometry';
import type { WallGeom } from '../../data/geometry';
import type { Level, LevelId, Room, WallDef } from '../../data/types';
import { addBox, frameMatrix } from './bucket';
import type { BoxKeys, BucketSet } from './bucket';
import { K, paintKey, wallTileKey, wallTileTop } from './keys';
import { addRailing } from './railings';

/**
 * Walls. Every HOUSE.walls entry becomes box pieces in the wall's local frame (origin at `a`,
 * y = baseY, local +X along a→b, local +Z = WALL_GEOMS normal). Openings are cut out by splitting
 * the wall into full-height pieces between openings plus a sill piece and a header piece per
 * opening. Pieces are also split at storey floor lines (so a double-height wall gets a brick
 * ground storey and a siding upper storey, and belongs to the right level for the dollhouse
 * view) and at room boundaries (so each side of an interior wall takes the colour of the room it
 * actually faces). A face looking into a tiled bathroom (keys.ts WALL_TILE) is split once more
 * at the room's tile line: glazed tile below it, the room's paint above.
 *
 * Extras drawn from the elevations:
 *  - a light rim board along the upper-storey floor line (covers the slab edge between brick and siding),
 *  - a concrete foundation skirt under ground-floor exterior walls that have no basement wall
 *    below them (the unexcavated garage), down to below grade.
 *
 * Seam hygiene (faces hidden a few mm behind a visible face flicker through it at grazing angles,
 * and shared edges between a hidden and a visible face produce hairlines):
 *  - a wall body ends exactly at the junction point; its end face is emitted only where it is
 *    really visible (free end, or a reveal when the adjoining wall has an opening right there);
 *  - an L-corner is closed by a small corner box on ONE of the two walls, emitting only its
 *    visible faces (outer side, end, top); a T-junction end is simply buried in the through wall;
 *  - faces created by internal splits are not emitted, and the reveals of an opening are explicit
 *    quads covering just the opening's height.
 */

const WARM_WHITE = '#efe9df';
const FLOOR_BAND = 0.26;
const BAND_LIP = 0.02;
const SKIRT_DEPTH = 0.5;
const SKIRT_INSET = 0.005;
const EPS = 1e-3;

type End = 'a' | 'b';

/** A box closing an L-corner beyond one end of the wall. */
interface Corner {
  end: End;
  /** Length beyond the wall end (half the partner's thickness). */
  along: number;
  /** Local side (+1 = local +Z) the box sits on: away from the partner's body. */
  side: 1 | -1;
  /** Spans the full wall thickness (the partner was pulled back for an opening) instead of the far half. */
  full: boolean;
  /** World y range the partner covers. */
  y0: number;
  y1: number;
  partnerExterior: boolean;
}

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
  hideY1?: boolean;
  /** A single reveal quad (s === e) at the side of an opening, facing +X ('px') or -X ('nx') into it. */
  reveal?: 'px' | 'nx';
  /** A corner box (see Corner). */
  corner?: Corner;
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
      out.push({ ...sp, y0, y1: y, hideY0, hideY1: true });
      y0 = y;
      hideY0 = true;
    }
    out.push({ ...sp, y0, y1: sp.y1, hideY0 });
  }
  return out;
}

/** Material of a wall face looking into `room` at height y: tile below the room's tile line, its paint elsewhere. */
function faceKey(room: Room | undefined, level: Level, y: number): string {
  const top = wallTileTop(room, level);
  if (top !== undefined && y < top) return wallTileKey(level.floorY);
  return paintKey(room?.wallColor ?? WARM_WHITE);
}

/** Tile lines (world y) of the rooms a piece faces, to split it at. */
function tileLines(rooms: readonly (Room | undefined)[], level: Level): number[] {
  const out: number[] = [];
  for (const r of rooms) {
    const top = wallTileTop(r, level);
    if (top !== undefined && !out.includes(top)) out.push(top);
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
export function roomBoundaryCuts(w: WallDef, g: WallGeom, level: LevelId): number[] {
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

// ---------------------------------------------------------------------------------------------
// Wall ends: junction analysis
// ---------------------------------------------------------------------------------------------

/** True if an opening on `wallId` overlaps [centre - half, centre + half] along that wall. */
function openingOverlaps(wallId: string, centre: number, half: number): boolean {
  return HOUSE.openings.some((o) => o.wall === wallId && o.at - o.width / 2 < centre + half - 0.005 && o.at + o.width / 2 > centre - half + 0.005);
}

interface EndInfo {
  /** Offset of the body end (<= 0: pulled back to the far face of a wall whose opening sits at this corner). */
  ext: number;
  /** The end face is visible inside that opening. */
  blocked: boolean;
  corners: Corner[];
  /** World y ranges over which the end face is buried in another wall. */
  hidden: [number, number][];
}

function endInfo(w: WallDef, g: WallGeom, end: End): EndInfo {
  const P = end === 'a' ? w.a : w.b;
  const alongW = end === 'a' ? 0 : g.length;
  const info: EndInfo = { ext: 0, blocked: false, corners: [], hidden: [] };
  for (const other of HOUSE.walls) {
    if (other.id === w.id || other.kind === 'railing') continue;
    const og = WALL_GEOMS.get(other.id);
    if (!og) continue;
    const y0 = Math.max(w.baseY, other.baseY);
    const y1 = Math.min(w.baseY + w.height, other.baseY + other.height);
    if (y1 - y0 < 0.01) continue;
    const rx = P[0] - other.a[0];
    const rz = P[1] - other.a[1];
    const along = rx * og.dir[0] + rz * og.dir[1];
    const across = Math.abs(rx * og.normal[0] + rz * og.normal[1]);
    if (across > 0.02 || along < -0.02 || along > og.length + 0.02) continue;
    const perpendicular = Math.abs(g.dir[0] * og.dir[0] + g.dir[1] * og.dir[1]) < 0.5;
    if (!perpendicular) {
      info.hidden.push([y0, y1]); // collinear continuation
      continue;
    }
    if (openingOverlaps(other.id, along, w.thickness / 2)) {
      // the partner's opening sits right at this corner: stop at the partner's far face
      info.blocked = true;
      info.ext = Math.min(info.ext, -other.thickness / 2 + 0.001);
      continue;
    }
    info.hidden.push([y0, y1]);
    const atA = along < 0.02;
    const atB = along > og.length - 0.02;
    if (!atA && !atB) continue; // T-junction: buried in the through wall
    const bodyDir: [number, number] = atA ? og.dir : [-og.dir[0], -og.dir[1]];
    const side: 1 | -1 = bodyDir[0] * g.normal[0] + bodyDir[1] * g.normal[1] > 0 ? -1 : 1;
    const full = openingOverlaps(w.id, alongW, other.thickness / 2);
    if (!full && w.id >= other.id) continue; // the partner closes this corner
    const c: Corner = { end, along: other.thickness / 2, side, full, y0, y1, partnerExterior: other.exterior };
    const dup = info.corners.some(
      (o) => Math.abs(o.along - c.along) < EPS && o.side === c.side && o.full === c.full && Math.abs(o.y0 - c.y0) < EPS && Math.abs(o.y1 - c.y1) < EPS,
    );
    if (!dup) info.corners.push(c);
  }
  return info;
}

function endHidden(info: EndInfo, y0: number, y1: number): boolean {
  if (info.blocked) return false;
  return info.hidden.some((r) => r[0] <= y0 + 0.01 && r[1] >= y1 - 0.01);
}

/** Ground-floor exterior walls over the unexcavated garage have nothing below them. */
function hasBasementBelow(g: WallGeom): boolean {
  const b = LEVEL_BY_ID.basement;
  const [mx, mz] = g.mid;
  const [nx, nz] = g.normal;
  return pointInLevelOutline(b, mx + nx * 0.3, mz + nz * 0.3) || pointInLevelOutline(b, mx - nx * 0.3, mz - nz * 0.3);
}

type Matrix = ReturnType<typeof frameMatrix>;

function emitBox(set: BucketSet, keys: BoxKeys, sp: Span, thickness: number, w: WallDef, matrix: Matrix): void {
  addBox(set, keys, { cx: (sp.s + sp.e) / 2, cy: (sp.y0 + sp.y1) / 2 - w.baseY, cz: 0, sx: sp.e - sp.s, sy: sp.y1 - sp.y0, sz: thickness }, matrix);
}

/** Emits a corner box: only its far side face, end face and top are drawn. */
function emitCorner(set: BucketSet, sp: Span, c: Corner, thickness: number, sideKey: string, endKey: string, topKey: string, w: WallDef, matrix: Matrix): void {
  const far = (c.side * thickness) / 2;
  const near = c.full ? -far : 0;
  const keys: BoxKeys = { rest: '' };
  keys[c.side > 0 ? 'pz' : 'nz'] = sideKey;
  keys[c.end === 'a' ? 'nx' : 'px'] = endKey;
  keys.py = topKey;
  addBox(
    set,
    keys,
    { cx: (sp.s + sp.e) / 2, cy: (sp.y0 + sp.y1) / 2 - w.baseY, cz: (near + far) / 2, sx: sp.e - sp.s, sy: sp.y1 - sp.y0, sz: Math.abs(far - near) },
    matrix,
  );
}

function cornerSpan(c: Corner, length: number, extra: number, y0: number, y1: number): Span | null {
  const yy0 = Math.max(y0, c.y0);
  const yy1 = Math.min(y1, c.y1);
  if (yy1 - yy0 < EPS) return null;
  const along = c.along + extra;
  if (along < EPS) return null;
  return c.end === 'a' ? { s: -along, e: 0, y0: yy0, y1: yy1, corner: c } : { s: length, e: length + along, y0: yy0, y1: yy1, corner: c };
}

/** Appends every wall of the house to the per-level bucket sets. */
export function addWalls(sets: Record<LevelId, BucketSet>): void {
  const upperFloor = LEVEL_BY_ID.upper.floorY;
  const groundFloor = LEVEL_BY_ID.ground.floorY;
  const floorYs = HOUSE.levels.map((l) => l.floorY);
  const bandY0 = upperFloor - FLOOR_BAND;
  const bandY1 = upperFloor + BAND_LIP;
  const skirtY0 = HOUSE.gradeY - SKIRT_DEPTH;

  for (const w of HOUSE.walls) {
    const g = WALL_GEOMS.get(w.id);
    if (!g) continue;
    const lvl = LEVEL_BY_ID[w.level];
    const matrix = frameMatrix(g.yaw, w.a[0], w.baseY, w.a[1]);

    if (w.kind === 'railing') {
      addRailing(sets[w.level], w, g, matrix);
      continue;
    }

    const endA = endInfo(w, g, 'a');
    const endB = endInfo(w, g, 'b');
    const xs = -endA.ext;
    const xe = g.length + endB.ext;
    const top = w.baseY + w.height;
    const cuts = openingCuts(w, lvl);
    const [nx, nz] = g.normal;
    // Which side of an exterior wall faces out (+1 = local +Z / the normal side), decided once per wall at its midpoint.
    const outside = w.exterior ? (pointInLevelOutline(lvl, g.mid[0] + nx * 0.6, g.mid[1] + nz * 0.6) ? -1 : 1) : 0;
    const facadeAt = (y: number): string => (y < groundFloor - 0.01 ? K.concrete : y < upperFloor - 0.01 ? K.brick : K.siding);
    /** The room a wall face on `side` looks into at (mx, mz). */
    const roomBeside = (side: 1 | -1, level: LevelId, mx: number, mz: number): Room | undefined => roomAt(level, mx + side * nx * 0.3, mz + side * nz * 0.3);
    const hasBand = w.exterior && w.baseY <= upperFloor + 0.01 && top >= upperFloor + 0.01;
    const hasSkirt = w.exterior && w.level === 'ground' && !hasBasementBelow(g);

    // ---- 1. the wall body ----
    for (const sp of splitAtY(cutSpans(xs, xe, w.baseY, top, cuts, true), floorYs)) {
      const midY = (sp.y0 + sp.y1) / 2;
      const pieceLevel = LEVEL_BY_ID[levelForY(midY)];
      const facade = facadeAt(midY);
      if (sp.reveal) {
        const keys: BoxKeys = sp.reveal === 'px' ? { px: K.paintLight, rest: '' } : { nx: K.paintLight, rest: '' };
        emitBox(sets[pieceLevel.id], keys, sp, w.thickness, w, matrix);
        continue;
      }
      for (const p of splitAtX([sp], roomBoundaryCuts(w, g, pieceLevel.id))) {
        const mx = w.a[0] + g.dir[0] * ((p.s + p.e) / 2);
        const mz = w.a[1] + g.dir[1] * ((p.s + p.e) / 2);
        const roomP = roomBeside(1, pieceLevel.id, mx, mz);
        const roomN = roomBeside(-1, pieceLevel.id, mx, mz);
        const atStart = p.s <= xs + EPS;
        const atEnd = p.e >= xe - EPS;
        for (const q of splitAtY([p], tileLines([roomP, roomN], pieceLevel))) {
          const y = (q.y0 + q.y1) / 2;
          const pz = w.exterior && outside === 1 ? facade : faceKey(roomP, pieceLevel, y);
          const nzKey = w.exterior && outside === -1 ? facade : faceKey(roomN, pieceLevel, y);
          const nxKey = q.hideS || (atStart && endHidden(endA, q.y0, q.y1)) ? '' : K.paintLight;
          const pxKey = q.hideE || (atEnd && endHidden(endB, q.y0, q.y1)) ? '' : K.paintLight;
          const onFloor = floorYs.some((f) => Math.abs(q.y0 - f) < 0.01);
          const keys: BoxKeys = { pz, nz: nzKey, px: pxKey, nx: nxKey, ny: q.hideY0 || onFloor ? '' : K.paintLight, py: q.hideY1 ? '' : K.paintLight, rest: K.paintLight };
          emitBox(sets[pieceLevel.id], keys, q, w.thickness, w, matrix);
        }
      }
    }

    // ---- 2. corner boxes (body, rim board, skirt) ----
    for (const c of [...endA.corners, ...endB.corners]) {
      const P = c.end === 'a' ? w.a : w.b;
      const dirOut: [number, number] = c.end === 'a' ? [-g.dir[0], -g.dir[1]] : g.dir;
      const body = cornerSpan(c, g.length, 0, w.baseY, top);
      if (body) {
        const cx = P[0] + (dirOut[0] * c.along) / 2;
        const cz = P[1] + (dirOut[1] * c.along) / 2;
        const ex = P[0] + dirOut[0] * (c.along + 0.1) + c.side * nx * 0.1;
        const ez = P[1] + dirOut[1] * (c.along + 0.1) + c.side * nz * 0.1;
        const endOutside = w.exterior && !pointInLevelOutline(lvl, ex, ez);
        for (const sp of splitAtY([body], floorYs)) {
          const midY = (sp.y0 + sp.y1) / 2;
          const pieceLevel = LEVEL_BY_ID[levelForY(midY)];
          const facade = facadeAt(midY);
          const sideRoom = roomBeside(c.side, pieceLevel.id, cx, cz);
          const endRoom = roomAt(pieceLevel.id, ex, ez);
          for (const q of splitAtY([sp], tileLines([sideRoom, endRoom], pieceLevel))) {
            const y = (q.y0 + q.y1) / 2;
            const sideKey = w.exterior && c.side === outside ? facade : faceKey(sideRoom, pieceLevel, y);
            const endKey = endOutside ? facade : faceKey(endRoom, pieceLevel, y);
            emitCorner(sets[pieceLevel.id], q, c, w.thickness, sideKey, endKey, q.hideY1 ? '' : K.paintLight, w, matrix);
          }
        }
      }
      if (hasBand && c.partnerExterior) {
        const band = cornerSpan(c, g.length, BAND_LIP, bandY0, bandY1);
        if (band) emitCorner(sets.upper, band, c, w.thickness + 2 * BAND_LIP, K.trim, K.trim, K.trim, w, matrix);
      }
      if (hasSkirt) {
        const skirt = cornerSpan(c, g.length, -SKIRT_INSET, skirtY0, groundFloor);
        if (skirt) emitCorner(sets.ground, skirt, c, w.thickness - 2 * SKIRT_INSET, K.concrete, K.concrete, '', w, matrix);
      }
    }

    // ---- 3. rim board along the upper floor line ----
    if (hasBand) {
      for (const sp of cutSpans(xs, xe, bandY0, bandY1, cuts, false)) {
        const keys: BoxKeys = { rest: K.trim };
        if (sp.s <= xs + EPS && endHidden(endA, sp.y0, sp.y1)) keys.nx = '';
        if (sp.e >= xe - EPS && endHidden(endB, sp.y0, sp.y1)) keys.px = '';
        emitBox(sets.upper, keys, sp, w.thickness + 2 * BAND_LIP, w, matrix);
      }
    }

    // ---- 4. foundation skirt where there is no basement wall below ----
    if (hasSkirt) {
      for (const sp of cutSpans(xs, xe, skirtY0, groundFloor, cuts, false)) {
        emitBox(sets.ground, { py: '', ny: '', rest: K.concrete }, sp, w.thickness - 2 * SKIRT_INSET, w, matrix);
      }
    }
  }
}
