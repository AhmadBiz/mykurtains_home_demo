/**
 * Derived geometry shared by the 3D scene, the player controller and the UI.
 * All units are metres (HOUSE is already converted).
 */
import * as THREE from 'three';
import { HOUSE, PLAYER_RADIUS } from './house';
import type { Level, LevelId, Opening, Room, StairFlight, WallDef } from './types';

export const WALL_BY_ID: Map<string, WallDef> = new Map(HOUSE.walls.map((w) => [w.id, w]));
export const ROOM_BY_ID: Map<string, Room> = new Map(HOUSE.rooms.map((r) => [r.id, r]));
export const LEVEL_BY_ID: Record<LevelId, Level> = Object.fromEntries(HOUSE.levels.map((l) => [l.id, l])) as Record<LevelId, Level>;
export const LEVEL_ORDER: LevelId[] = ['basement', 'ground', 'upper'];

export interface WallGeom {
  wall: WallDef;
  length: number;
  /** Unit direction a → b in XZ. */
  dir: [number, number];
  /** Unit normal (dir rotated +90° about Y): (-dz, dx). */
  normal: [number, number];
  /** Rotation about Y so that a box whose local +X runs along the wall is aligned with it. */
  yaw: number;
  /** Centre-line midpoint. */
  mid: [number, number];
}

export function wallGeom(w: WallDef): WallGeom {
  const dx = w.b[0] - w.a[0];
  const dz = w.b[1] - w.a[1];
  const length = Math.hypot(dx, dz);
  const dir: [number, number] = [dx / length, dz / length];
  const normal: [number, number] = [-dir[1], dir[0]];
  // local +X = dir. Rotating (1,0,0) about Y by yaw gives (cos yaw, 0, -sin yaw) → yaw = atan2(-dz, dx)
  const yaw = Math.atan2(-dir[1], dir[0]);
  return { wall: w, length, dir, normal, yaw, mid: [w.a[0] + dx / 2, w.a[1] + dz / 2] };
}

export const WALL_GEOMS: Map<string, WallGeom> = new Map(HOUSE.walls.map((w) => [w.id, wallGeom(w)]));

/** Point on the wall centre-line at distance t from a. */
export function pointAlongWall(w: WallDef, t: number): [number, number] {
  const g = WALL_GEOMS.get(w.id)!;
  return [w.a[0] + g.dir[0] * t, w.a[1] + g.dir[1] * t];
}

// ---------------------------------------------------------------------------------------------
// Point-in-polygon helpers
// ---------------------------------------------------------------------------------------------
export function pointInPolygon(x: number, z: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    const intersect = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function inBounds(x: number, z: number, b: [number, number, number, number]): boolean {
  return x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3];
}

/** True if (x, z) lies on the level's slab (inside the outline and not in a hole). */
export function pointOnLevelSlab(level: Level, x: number, z: number): boolean {
  if (!pointInPolygon(x, z, level.outline)) return false;
  for (const h of level.holes) if (pointInPolygon(x, z, h)) return false;
  return true;
}

export function pointInLevelOutline(level: Level, x: number, z: number): boolean {
  return pointInPolygon(x, z, level.outline);
}

/** The room that contains (x, z) on the given level, if any. */
export function roomAt(level: LevelId, x: number, z: number): Room | undefined {
  return HOUSE.rooms.find((r) => r.level === level && inBounds(x, z, r.bounds));
}

/** Level whose [floorY, floorY + ceiling + slab) contains y. Below the basement → basement; above → upper. */
export function levelForY(y: number): LevelId {
  const eps = 0.05;
  if (y < LEVEL_BY_ID.ground.floorY - eps) return 'basement';
  if (y < LEVEL_BY_ID.upper.floorY - eps) return 'ground';
  return 'upper';
}

// ---------------------------------------------------------------------------------------------
// Windows (anything coverable) with world transforms
// ---------------------------------------------------------------------------------------------
export interface WindowInstance {
  id: string;
  opening: Opening;
  wall: WallDef;
  level: LevelId;
  room: Room | undefined;
  name: string;
  nameFr: string;
  /** World-space centre of the opening (at the wall centre-line). */
  center: THREE.Vector3;
  /** Rotation about Y such that local +X runs along the wall and local +Z points INTO the room. */
  yaw: number;
  /** Unit vector pointing from the wall into the room (XZ). */
  inward: [number, number];
  width: number;
  height: number;
  wallThickness: number;
  frosted: boolean;
  isDoor: boolean;
}

function buildWindowInstances(): WindowInstance[] {
  const out: WindowInstance[] = [];
  for (const o of HOUSE.openings) {
    if (o.kind !== 'window' && o.kind !== 'patio') continue;
    const wall = WALL_BY_ID.get(o.wall);
    if (!wall) throw new Error(`Opening ${o.id} references unknown wall ${o.wall}`);
    const g = WALL_GEOMS.get(wall.id)!;
    const level = LEVEL_BY_ID[wall.level];
    const [px, pz] = pointAlongWall(wall, o.at);
    // Decide which side of the wall is inside the house.
    const probe = 0.6;
    const nx = g.normal[0];
    const nz = g.normal[1];
    const sideA = pointInLevelOutline(level, px + nx * probe, pz + nz * probe);
    const inward: [number, number] = sideA ? [nx, nz] : [-nx, -nz];
    // yaw such that local +Z → inward: rotating (0,0,1) about Y by yaw gives (sin yaw, 0, cos yaw)
    const yaw = Math.atan2(inward[0], inward[1]);
    const room = o.room ? ROOM_BY_ID.get(o.room) : undefined;
    out.push({
      id: o.id,
      opening: o,
      wall,
      level: wall.level,
      room,
      name: o.name ?? o.id,
      nameFr: o.nameFr ?? o.name ?? o.id,
      center: new THREE.Vector3(px, level.floorY + o.sill + o.height / 2, pz),
      yaw,
      inward,
      width: o.width,
      height: o.height,
      wallThickness: wall.thickness,
      frosted: !!o.frosted,
      isDoor: o.kind === 'patio',
    });
  }
  return out;
}

export const WINDOWS: WindowInstance[] = buildWindowInstances();
export const WINDOW_BY_ID: Map<string, WindowInstance> = new Map(WINDOWS.map((w) => [w.id, w]));

/** Windows grouped by level, then by room, in a stable display order. */
export function windowsByLevel(): { level: Level; rooms: { room: Room | undefined; windows: WindowInstance[] }[] }[] {
  return LEVEL_ORDER.map((lid) => {
    const level = LEVEL_BY_ID[lid];
    const ws = WINDOWS.filter((w) => w.level === lid);
    const roomIds = Array.from(new Set(ws.map((w) => w.room?.id ?? '')));
    return {
      level,
      rooms: roomIds.map((rid) => ({ room: rid ? ROOM_BY_ID.get(rid) : undefined, windows: ws.filter((w) => (w.room?.id ?? '') === rid) })),
    };
  }).reverse(); // upper floor first
}

/**
 * A good spot to stand to look at a window: ~2 m into the room (clamped inside the room), standing
 * on the real walking surface, facing the window centre.
 */
export function viewpointForWindow(w: WindowInstance, eyeHeight: number): { position: [number, number, number]; yaw: number } {
  const level = LEVEL_BY_ID[w.level];
  let d = Math.min(2.2, Math.max(1.2, w.width * 0.9));
  let x = w.center.x + w.inward[0] * d;
  let z = w.center.z + w.inward[1] * d;
  if (w.id === 'w-escalier') {
    // tall stair window: stand on the lower flight, which faces it
    x = 17 * 0.3048;
    z = 4.6 * 0.3048;
  } else if (w.room) {
    const m = 0.45;
    const [x1, z1, x2, z2] = w.room.bounds;
    x = Math.min(Math.max(x, x1 + m), x2 - m);
    z = Math.min(Math.max(z, z1 + m), z2 - m);
    d = Math.hypot(x - w.center.x, z - w.center.z);
  }
  const y = groundHeightAt(x, z, level.floorY) + eyeHeight;
  // camera looks along (-sin yaw, 0, -cos yaw); look from (x, z) toward the window centre
  const lx = w.center.x - x;
  const lz = w.center.z - z;
  const yaw = Math.atan2(-lx, -lz);
  return { position: [x, y, z], yaw };
}

// ---------------------------------------------------------------------------------------------
// Collision segments (walls minus door openings), with vertical extents
// ---------------------------------------------------------------------------------------------
export interface CollisionSegment {
  a: [number, number];
  b: [number, number];
  halfThickness: number;
  yMin: number;
  yMax: number;
  wallId: string;
}

const PASSABLE: Set<Opening['kind']> = new Set(['door', 'cased', 'patio', 'frontDoor', 'exteriorDoor', 'garage']);

function buildCollisionSegments(): CollisionSegment[] {
  const segs: CollisionSegment[] = [];
  for (const w of HOUSE.walls) {
    const g = WALL_GEOMS.get(w.id)!;
    const gaps = HOUSE.openings
      .filter((o) => o.wall === w.id && PASSABLE.has(o.kind))
      .map((o) => [o.at - o.width / 2, o.at + o.width / 2] as [number, number])
      .sort((p, q) => p[0] - q[0]);
    let cursor = 0;
    const pieces: [number, number][] = [];
    for (const [s, e] of gaps) {
      if (s > cursor) pieces.push([cursor, s]);
      cursor = Math.max(cursor, e);
    }
    if (cursor < g.length) pieces.push([cursor, g.length]);
    for (const [s, e] of pieces) {
      segs.push({
        a: pointAlongWall(w, s),
        b: pointAlongWall(w, e),
        halfThickness: w.thickness / 2,
        yMin: w.baseY,
        yMax: w.baseY + w.height,
        wallId: w.id,
      });
    }
  }
  return segs;
}

export const COLLISION_SEGMENTS: CollisionSegment[] = buildCollisionSegments();

/**
 * Vertical slice of the player's body used for wall collision, relative to the feet (m).
 * The foot offset acts as a "step-over" height so walls of the storey below (which top out
 * exactly at this storey's floor) never snag a visitor climbing a ramp or stair onto it.
 */
export const COLLISION_FOOT_OFFSET = 0.45;
export const COLLISION_HEAD_OFFSET = 1.75;

/** Convenience wrapper: resolve the player (feet at y) against walls. */
export function resolvePlayerCollisions(x: number, z: number, feetY: number, radius = PLAYER_RADIUS): [number, number] {
  return resolveCollisions(x, z, feetY + COLLISION_FOOT_OFFSET, feetY + COLLISION_HEAD_OFFSET, radius);
}

/**
 * Resolve a circle (player) against all wall segments whose vertical span overlaps [yFeet, yHead].
 * Returns the corrected XZ position.
 */
export function resolveCollisions(x: number, z: number, yFeet: number, yHead: number, radius = PLAYER_RADIUS): [number, number] {
  let px = x;
  let pz = z;
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    for (const s of COLLISION_SEGMENTS) {
      if (s.yMax <= yFeet || s.yMin >= yHead) continue;
      const ax = s.a[0];
      const az = s.a[1];
      const bx = s.b[0];
      const bz = s.b[1];
      const abx = bx - ax;
      const abz = bz - az;
      const len2 = abx * abx + abz * abz;
      let t = len2 > 0 ? ((px - ax) * abx + (pz - az) * abz) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const cx = ax + abx * t;
      const cz = az + abz * t;
      let dx = px - cx;
      let dz = pz - cz;
      let dist = Math.hypot(dx, dz);
      const minDist = radius + s.halfThickness;
      if (dist < minDist) {
        if (dist < 1e-6) {
          // on the line: push along the wall normal
          const nlen = Math.sqrt(len2) || 1;
          dx = -abz / nlen;
          dz = abx / nlen;
          dist = 1;
        }
        const push = minDist - dist;
        px += (dx / dist) * push;
        pz += (dz / dist) * push;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return [px, pz];
}

// ---------------------------------------------------------------------------------------------
// Walkable height: floors, stairs, landings, exterior platforms and ramps, grade
// ---------------------------------------------------------------------------------------------
function flightHeightAt(f: StairFlight, x: number, z: number): number {
  const [x1, z1, x2, z2] = f.bounds;
  let t: number;
  switch (f.dir) {
    case '+x': t = (x - x1) / (x2 - x1); break;
    case '-x': t = (x2 - x) / (x2 - x1); break;
    case '+z': t = (z - z1) / (z2 - z1); break;
    case '-z': t = (z2 - z) / (z2 - z1); break;
  }
  t = Math.max(0, Math.min(1, t));
  return f.y0 + (f.y1 - f.y0) * t;
}

/**
 * Height of the walking surface at (x, z), choosing — among all surfaces present there —
 * the one closest to `currentY` (so overlapping flights and floors resolve correctly).
 */
export function groundHeightAt(x: number, z: number, currentY: number): number {
  const candidates: number[] = [];
  for (const f of HOUSE.stairs) if (inBounds(x, z, f.bounds)) candidates.push(flightHeightAt(f, x, z));
  for (const f of HOUSE.ramps) if (inBounds(x, z, f.bounds)) candidates.push(flightHeightAt(f, x, z));
  for (const p of HOUSE.platforms) if (inBounds(x, z, p.bounds)) candidates.push(p.y);
  let onAnyLevel = false;
  for (const l of HOUSE.levels) {
    if (pointOnLevelSlab(l, x, z)) {
      candidates.push(l.floorY);
      onAnyLevel = true;
    } else if (pointInLevelOutline(l, x, z)) {
      onAnyLevel = true; // in a hole (stair void): stairs provide the surface
    }
  }
  // Outside the house, the lawn is the walking surface only where no ramp / platform exists,
  // otherwise a gentle ramp would lose out to the flat grade on every step.
  if (candidates.length === 0) return onAnyLevel ? currentY : HOUSE.gradeY;
  let best = candidates[0];
  let bestD = Math.abs(best - currentY);
  for (const c of candidates) {
    const d = Math.abs(c - currentY);
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/** Centre of a room, at floor level. */
export function roomCenter(room: Room): [number, number, number] {
  const l = LEVEL_BY_ID[room.level];
  return [(room.bounds[0] + room.bounds[2]) / 2, l.floorY, (room.bounds[1] + room.bounds[3]) / 2];
}

/** Sensible arrival points when jumping to a level (at the stair arrival). */
export const LEVEL_ENTRY: Record<LevelId, { position: [number, number]; yaw: number }> = {
  basement: { position: [HOUSE.rooms.find((r) => r.id === 'b-corridor')!.bounds[0] + 0.9, 1.4], yaw: Math.PI },
  ground: { position: [HOUSE.rooms.find((r) => r.id === 'g-hall')!.bounds[0] + 1.5, 4.5], yaw: -Math.PI / 2 },
  upper: { position: [HOUSE.rooms.find((r) => r.id === 'u-corridor')!.bounds[0] + 4.5, 3.3], yaw: Math.PI / 2 },
};
