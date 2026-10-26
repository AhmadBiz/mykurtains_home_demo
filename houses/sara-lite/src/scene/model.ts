/**
 * Scene data for the CSS-3D glass model, derived once from the plans (metres).
 *
 * World → CSS: x → translateX, y → −translateY, z → translateZ (this keeps the handedness, so the
 * model is not mirrored). Every leaf of the model is placed in absolute world coordinates.
 */
import { HOUSE } from '../data/house';
import { HOUSE_BOUNDS, LEVEL_BY_ID, LEVEL_ORDER, WALL_GEOMS, WINDOWS, pointInPolygon } from '../data/geometry';
import type { WindowInstance } from '../data/geometry';
import type { LevelId, OpeningKind, WallDef } from '../data/types';
import type { LevelFilter } from '../store/useStore';

/**
 * Storey lift (m). The geometry below is in true plan heights; each storey's world element is lifted by its own
 * amount at run time (HouseModel tweens it):
 *   'all'    → the house reads as one assembled silhouette, storeys only ALL_GAP apart (a hairline seam);
 *   a storey → the storeys explode FOCUS_GAP apart, and the ones above / below the focused storey are pushed a
 *              further PUSH away so the stage around the focused storey stays free for its chips.
 */
export const ALL_GAP = 0.12;
export const FOCUS_GAP = 1.4;
export const PUSH = 2.6;
export type Lifts = Record<LevelId, number>;

export function liftsFor(filter: LevelFilter): Lifts {
  const idx = (id: LevelId) => LEVEL_ORDER.indexOf(id) - LEVEL_ORDER.indexOf('ground');
  if (filter === 'all') return { basement: -ALL_GAP, ground: 0, upper: ALL_GAP };
  const f = LEVEL_ORDER.indexOf(filter);
  const out = {} as Lifts;
  for (const id of LEVEL_ORDER) {
    const i = LEVEL_ORDER.indexOf(id);
    out[id] = idx(id) * FOCUS_GAP + (i > f ? PUSH : i < f ? -PUSH : 0);
  }
  return out;
}

/** True plan Y of a storey's floor / wall top. */
export const floorOf = (id: LevelId) => LEVEL_BY_ID[id].floorY;
export const topOf = (id: LevelId) => LEVEL_BY_ID[id].wallTop;

const r3 = (v: number) => Math.round(v * 1000) / 1000;

// -------------------------------------------------------------------------------------------
// Exterior walls (glass planes) with their doors and windows
// -------------------------------------------------------------------------------------------
export interface DoorShape {
  id: string;
  kind: OpeningKind;
  /** Left edge from wall.a (m), bottom above the wall base (m), size (m). */
  left: number;
  bottom: number;
  width: number;
  height: number;
}

export interface GlassWall {
  wall: WallDef;
  /** Bottom-left corner (wall.a) in scene coordinates. */
  x: number;
  y: number;
  z: number;
  length: number;
  height: number;
  /** CSS rotateY (deg) turning the element's +x axis onto a → b. */
  ry: number;
  /** Unit outward normal in XZ (for the back-face test). */
  out: [number, number];
  doors: DoorShape[];
  windows: WindowInstance[];
}

const DOOR_KINDS: OpeningKind[] = ['frontDoor', 'garage', 'exteriorDoor'];

function buildWalls(level: LevelId): GlassWall[] {
  const lvl = LEVEL_BY_ID[level];
  return HOUSE.walls
    .filter((w) => w.level === level && w.exterior)
    .map((w) => {
      const g = WALL_GEOMS.get(w.id)!;
      // A wall taller than its storey (the double-height stair wall) also spans the assembled seam.
      const tall = w.baseY + w.height > lvl.wallTop + 0.01;
      const height = w.height + (tall ? ALL_GAP : 0);
      const mx = (w.a[0] + w.b[0]) / 2;
      const mz = (w.a[1] + w.b[1]) / 2;
      const inside = pointInPolygon(mx + g.normal[0] * 0.3, mz + g.normal[1] * 0.3, lvl.outline);
      const out: [number, number] = inside ? [-g.normal[0], -g.normal[1]] : [g.normal[0], g.normal[1]];
      const doors: DoorShape[] = HOUSE.openings
        .filter((o) => o.wall === w.id && DOOR_KINDS.includes(o.kind))
        .map((o) => ({ id: o.id, kind: o.kind, left: o.at - o.width / 2, bottom: o.sill, width: o.width, height: o.height }));
      return {
        wall: w,
        x: w.a[0],
        y: w.baseY,
        z: w.a[1],
        length: g.length,
        height,
        ry: r3((Math.atan2(-g.dir[1], g.dir[0]) * 180) / Math.PI),
        out,
        doors,
        windows: WINDOWS.filter((win) => win.wall.id === w.id),
      };
    });
}

// -------------------------------------------------------------------------------------------
// Floor slabs: SVG paths in metres (svg x = world x, svg y = world z)
// -------------------------------------------------------------------------------------------
export interface RoomLabel {
  id: string;
  /** Room name as in the plans (several room boxes can share it). */
  key: string;
  name: string;
  nameFr: string;
  x: number;
  z: number;
  size: number;
  /** Extent available for the text along its baseline (m). */
  room: [number, number, number, number];
}

export interface Slab {
  /** Bounds of the outline: x0, z0, width, depth. */
  box: [number, number, number, number];
  y: number;
  /** Outline (+ holes, even-odd). */
  fill: string;
  outline: string;
  inner: string;
  rails: string;
  labels: RoomLabel[];
}

const ring = (pts: [number, number][]) => 'M' + pts.map((p) => `${r3(p[0])} ${r3(p[1])}`).join('L') + 'Z';
const seg = (w: WallDef) => `M${r3(w.a[0])} ${r3(w.a[1])}L${r3(w.b[0])} ${r3(w.b[1])}`;

function buildSlab(level: LevelId): Slab {
  const lvl = LEVEL_BY_ID[level];
  const xs = lvl.outline.map((p) => p[0]);
  const zs = lvl.outline.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const z0 = Math.min(...zs);
  const walls = HOUSE.walls.filter((w) => w.level === level && !w.exterior);
  // One label per room name (keep the largest room of a name: the hall is split in two boxes).
  const byName = new Map<string, (typeof HOUSE.rooms)[number]>();
  const area = (b: [number, number, number, number]) => (b[2] - b[0]) * (b[3] - b[1]);
  for (const r of HOUSE.rooms) {
    if (r.level !== level || r.noFloor) continue;
    const prev = byName.get(r.nameFr);
    if (!prev || area(r.bounds) > area(prev.bounds)) byName.set(r.nameFr, r);
  }
  const labels: RoomLabel[] = Array.from(byName.values()).map((r) => {
    const [a, b, c, d] = r.bounds;
    return { id: r.id, key: r.nameFr, name: r.name, nameFr: r.nameFr.replace(/\s*\(.*\)$/, ''), x: (a + c) / 2, z: (b + d) / 2, size: 0.42, room: r.bounds };
  });
  return {
    box: [x0, z0, Math.max(...xs) - x0, Math.max(...zs) - z0],
    y: floorOf(level),
    fill: ring(lvl.outline) + lvl.holes.map(ring).join(''),
    outline: ring(lvl.outline),
    inner: walls.filter((w) => w.kind !== 'railing').map(seg).join(''),
    rails: walls.filter((w) => w.kind === 'railing').map(seg).join(''),
    labels,
  };
}

// -------------------------------------------------------------------------------------------
// Everything per storey
// -------------------------------------------------------------------------------------------
export interface SceneLevel {
  id: LevelId;
  walls: GlassWall[];
  slab: Slab;
  windows: WindowInstance[];
  /** Footprint centre (x, z) and radius (m) for framing. */
  cx: number;
  cz: number;
  radius: number;
  y0: number;
  y1: number;
  /** Outline points (x, z) for the chip layout hull. */
  outline: [number, number][];
}

function radiusOf(pts: [number, number][], cx: number, cz: number) {
  return Math.max(...pts.map((p) => Math.hypot(p[0] - cx, p[1] - cz)));
}

export const SCENE_LEVELS: SceneLevel[] = LEVEL_ORDER.map((id) => {
  const lvl = LEVEL_BY_ID[id];
  const xs = lvl.outline.map((p) => p[0]);
  const zs = lvl.outline.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  return {
    id,
    walls: buildWalls(id),
    slab: buildSlab(id),
    windows: WINDOWS.filter((w) => w.level === id),
    cx,
    cz,
    radius: radiusOf(lvl.outline, cx, cz),
    y0: floorOf(id),
    y1: topOf(id),
    outline: lvl.outline,
  };
});
export const SCENE_LEVEL_BY_ID = Object.fromEntries(SCENE_LEVELS.map((l) => [l.id, l])) as Record<LevelId, SceneLevel>;

/** Whole-house framing data. */
export const HOUSE_FRAME = (() => {
  const cx = (HOUSE_BOUNDS[0] + HOUSE_BOUNDS[2]) / 2;
  const cz = (HOUSE_BOUNDS[1] + HOUSE_BOUNDS[3]) / 2;
  const pts = HOUSE.levels.flatMap((l) => l.outline);
  return { cx, cz, radius: radiusOf(pts, cx, cz), y0: floorOf('basement'), y1: topOf('upper') };
})();

/** A window taller than its storey (the stair window) also spans the assembled seam, like its wall. */
export const isTallWindow = (w: WindowInstance) => w.sill + w.height > LEVEL_BY_ID[w.level].wallTop - LEVEL_BY_ID[w.level].floorY + 0.01;

/** Scene position of a window's centre, for a storey lift. */
export function windowAnchor(w: WindowInstance, lift: number): [number, number, number] {
  return [w.center.x, w.center.y + lift + (isTallWindow(w) ? ALL_GAP / 2 : 0), w.center.z];
}

/** Scene points of a window's frame: top, bottom, left and right edge midpoints (for the leader line end). */
export function windowEdges(w: WindowInstance, lift: number): [number, number, number][] {
  const g = WALL_GEOMS.get(w.wall.id)!;
  const h = (w.height + (isTallWindow(w) ? ALL_GAP : 0)) / 2;
  const [x, y, z] = windowAnchor(w, lift);
  const dx = (g.dir[0] * w.width) / 2;
  const dz = (g.dir[1] * w.width) / 2;
  return [
    [x, y + h, z],
    [x, y - h, z],
    [x - dx, y, z - dz],
    [x + dx, y, z + dz],
  ];
}

// -------------------------------------------------------------------------------------------
// Roof (whole-house view only): a gable over the upper storey's outline bounding box, ridge along X
// so a gable end faces the street and the long slope faces north, like the reference's house.
// -------------------------------------------------------------------------------------------
export const ROOF = (() => {
  const o = LEVEL_BY_ID.upper.outline;
  const x0 = Math.min(...o.map((p) => p[0]));
  const x1 = Math.max(...o.map((p) => p[0]));
  const z0 = Math.min(...o.map((p) => p[1]));
  const z1 = Math.max(...o.map((p) => p[1]));
  const y = LEVEL_BY_ID.upper.wallTop;
  const half = (z1 - z0) / 2;
  const rise = half * 0.5;
  const slant = Math.hypot(half, rise);
  const tilt = (Math.atan2(half, rise) * 180) / Math.PI;
  return { x0, x1, z0, z1, y, rise, slant, tilt, zc: z0 + half };
})();

/** Plinth under the basement: HOUSE_BOUNDS grown by 0.6 m a side, 0.3 m thick. */
export const PLINTH = (() => {
  const pad = 0.6;
  const [bx0, bz0, bx1, bz1] = HOUSE_BOUNDS;
  return { x0: bx0 - pad, z0: bz0 - pad, x1: bx1 + pad, z1: bz1 + pad, y: LEVEL_BY_ID.basement.floorY - 0.02, t: 0.3 };
})();
