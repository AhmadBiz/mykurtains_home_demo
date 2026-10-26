/**
 * Scene data for the CSS-3D glass model, derived once from the plans (metres).
 *
 * World → CSS: x → translateX, y → −translateY, z → translateZ (this keeps the handedness, so the
 * model is not mirrored). Every leaf of the model is placed in absolute world coordinates.
 */
import { HOUSE } from '../data/house';
import { HOUSE_BOUNDS, LEVEL_BY_ID, LEVEL_ORDER, WALL_GEOMS, WINDOWS } from '../data/geometry';
import type { WindowInstance } from '../data/geometry';
import type { LevelId, OpeningKind, WallDef } from '../data/types';

/** Vertical gap added between storeys so each reads on its own (m). */
export const GAP = 0.9;
export const LEVEL_OFFSET: Record<LevelId, number> = { basement: -GAP, ground: 0, upper: GAP };

/** Scene Y of a storey's floor / wall top (exploded). */
export const floorOf = (id: LevelId) => LEVEL_BY_ID[id].floorY + LEVEL_OFFSET[id];
export const topOf = (id: LevelId) => LEVEL_BY_ID[id].wallTop + LEVEL_OFFSET[id];

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
      // A wall taller than its storey (the double-height stair wall) also spans the exploded gap.
      const tall = w.baseY + w.height > lvl.wallTop + 0.01;
      const height = w.height + (tall ? GAP : 0);
      const doors: DoorShape[] = HOUSE.openings
        .filter((o) => o.wall === w.id && DOOR_KINDS.includes(o.kind))
        .map((o) => ({ id: o.id, kind: o.kind, left: o.at - o.width / 2, bottom: o.sill, width: o.width, height: o.height }));
      return {
        wall: w,
        x: w.a[0],
        y: w.baseY + LEVEL_OFFSET[level],
        z: w.a[1],
        length: g.length,
        height,
        ry: r3((Math.atan2(-g.dir[1], g.dir[0]) * 180) / Math.PI),
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
    return { id: r.id, name: r.name, nameFr: r.nameFr.replace(/\s*\(.*\)$/, ''), x: (a + c) / 2, z: (b + d) / 2, size: 0.42, room: r.bounds };
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

/** Scene position of a window's centre (exploded). */
export function windowAnchor(w: WindowInstance): [number, number, number] {
  return [w.center.x, w.center.y + LEVEL_OFFSET[w.level], w.center.z];
}
