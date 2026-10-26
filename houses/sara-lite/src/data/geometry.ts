/**
 * Derived geometry for the lightweight (DOM / CSS-3D) house model. No three.js.
 * All units are metres (HOUSE is already converted). See src/data/types.ts for the axes:
 * X = front (street, small X) → rear, Z = north (plan top) → south, Y = up, ground floor at Y = 0.
 */
import { HOUSE } from './house';
import type { Level, LevelId, Opening, Room, WallDef } from './types';

export const WALL_BY_ID: Map<string, WallDef> = new Map(HOUSE.walls.map((w) => [w.id, w]));
export const ROOM_BY_ID: Map<string, Room> = new Map(HOUSE.rooms.map((r) => [r.id, r]));
export const LEVEL_BY_ID: Record<LevelId, Level> = Object.fromEntries(HOUSE.levels.map((l) => [l.id, l])) as Record<LevelId, Level>;
/** Bottom → top. */
export const LEVEL_ORDER: LevelId[] = ['basement', 'ground', 'upper'];

export interface Vec3 { x: number; y: number; z: number }

export interface WallGeom {
  wall: WallDef;
  length: number;
  /** Unit direction a → b in XZ. */
  dir: [number, number];
  /** Unit normal (dir rotated +90° about Y): (-dz, dx). */
  normal: [number, number];
  /** True when the wall runs along X (a.z === b.z), false when it runs along Z. */
  alongX: boolean;
}

export function wallGeom(w: WallDef): WallGeom {
  const dx = w.b[0] - w.a[0];
  const dz = w.b[1] - w.a[1];
  const length = Math.hypot(dx, dz);
  const dir: [number, number] = [dx / length, dz / length];
  return { wall: w, length, dir, normal: [-dir[1], dir[0]], alongX: Math.abs(dz) < 1e-6 };
}

export const WALL_GEOMS: Map<string, WallGeom> = new Map(HOUSE.walls.map((w) => [w.id, wallGeom(w)]));

export function pointAlongWall(w: WallDef, t: number): [number, number] {
  const g = WALL_GEOMS.get(w.id)!;
  return [w.a[0] + g.dir[0] * t, w.a[1] + g.dir[1] * t];
}

export function pointInPolygon(x: number, z: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export const inBounds = (x: number, z: number, b: [number, number, number, number]) => x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3];

export function roomAt(level: LevelId, x: number, z: number): Room | undefined {
  return HOUSE.rooms.find((r) => r.level === level && inBounds(x, z, r.bounds));
}

/** Exterior bounds of all levels (metres): [minX, minZ, maxX, maxZ]. */
export const HOUSE_BOUNDS: [number, number, number, number] = (() => {
  const xs = HOUSE.levels.flatMap((l) => l.outline.map((p) => p[0]));
  const zs = HOUSE.levels.flatMap((l) => l.outline.map((p) => p[1]));
  return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
})();

// ---------------------------------------------------------------------------------------------
// Windows (everything coverable: windows + the patio door)
// ---------------------------------------------------------------------------------------------
export interface WindowInstance {
  id: string;
  opening: Opening;
  wall: WallDef;
  level: LevelId;
  room: Room | undefined;
  name: string;
  nameFr: string;
  /** World centre of the opening, on the wall centre-line. */
  center: Vec3;
  /** Unit XZ vector from the wall into the room. */
  inward: [number, number];
  width: number;
  height: number;
  /** Bottom of the opening above the level's floor. */
  sill: number;
  /** Floor-to-ceiling height of the level. */
  ceiling: number;
  /** Curtains stop this high above the floor (0 = floor length). */
  hemAbove: number;
  wallThickness: number;
  frosted: boolean;
  isDoor: boolean;
}

function buildWindows(): WindowInstance[] {
  const out: WindowInstance[] = [];
  for (const o of HOUSE.openings) {
    if (o.kind !== 'window' && o.kind !== 'patio') continue;
    const wall = WALL_BY_ID.get(o.wall);
    if (!wall) throw new Error(`Opening ${o.id} references unknown wall ${o.wall}`);
    const g = WALL_GEOMS.get(wall.id)!;
    const level = LEVEL_BY_ID[wall.level];
    const [px, pz] = pointAlongWall(wall, o.at);
    const probe = 0.6;
    const inside = pointInPolygon(px + g.normal[0] * probe, pz + g.normal[1] * probe, level.outline);
    const inward: [number, number] = inside ? [g.normal[0], g.normal[1]] : [-g.normal[0], -g.normal[1]];
    out.push({
      id: o.id,
      opening: o,
      wall,
      level: wall.level,
      room: o.room ? ROOM_BY_ID.get(o.room) : undefined,
      name: o.name ?? o.id,
      nameFr: o.nameFr ?? o.name ?? o.id,
      center: { x: px, y: level.floorY + o.sill + o.height / 2, z: pz },
      inward,
      width: o.width,
      height: o.height,
      sill: o.sill,
      ceiling: level.ceilingHeight,
      hemAbove: o.hemAbove ?? 0,
      wallThickness: wall.thickness,
      frosted: !!o.frosted,
      isDoor: o.kind === 'patio',
    });
  }
  return out;
}

export const WINDOWS: WindowInstance[] = buildWindows();
export const WINDOW_BY_ID: Map<string, WindowInstance> = new Map(WINDOWS.map((w) => [w.id, w]));

/** Windows grouped by level (top floor first), then by room, in a stable order. */
export function windowsByLevel(): { level: Level; rooms: { room: Room | undefined; windows: WindowInstance[] }[] }[] {
  return [...LEVEL_ORDER].reverse().map((lid) => {
    const level = LEVEL_BY_ID[lid];
    const ws = WINDOWS.filter((w) => w.level === lid);
    const roomIds = Array.from(new Set(ws.map((w) => w.room?.id ?? '')));
    return { level, rooms: roomIds.map((rid) => ({ room: rid ? ROOM_BY_ID.get(rid) : undefined, windows: ws.filter((w) => (w.room?.id ?? '') === rid) })) };
  });
}

/** Stack-back of a ripple-fold curtain on one side (m): the folded fabric parked beside the opening. */
export const stackBackFor = (width: number) => Math.max(0.3, 0.18 * width);
