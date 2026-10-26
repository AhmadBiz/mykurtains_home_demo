import * as THREE from 'three';
import { HOUSE } from '../../data/house';
import { LEVEL_BY_ID, LEVEL_ORDER } from '../../data/geometry';
import type { Level, LevelId, Room } from '../../data/types';
import type { BucketSet } from './bucket';
import { floorKey } from './keys';

/**
 * Floor slabs, per-room floor finishes and ceilings.
 *
 *  - Slab: the level outline (minus its holes) extruded SLAB_THICKNESS downward from floorY.
 *  - Finishes: one quad per room 4 mm above the slab, keyed by the room's FloorFinish, with UVs
 *    in world metres so the texture tiles at real scale. Plank floors run along the room's long
 *    axis (the hardwood texture's planks follow V, the laminate's follow U) and every room gets
 *    its own random offset so repeats never line up across a doorway; tiles stay aligned to the
 *    house grid.
 *  - Ceiling: a single-sided plane facing -Y at floorY + ceilingHeight. Its holes are the slab
 *    holes of the level ABOVE (the stair void continues through the ceiling), none for the top level.
 */

export const SLAB_THICKNESS = 0.25;
const FINISH_LIFT = 0.004;

function makeShape(outline: [number, number][], holes: [number, number][][]): THREE.Shape {
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, z)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, z))));
  return shape;
}

/** Extruded slab with its top face at level.floorY (shape authored in plan XZ, rotated so Y is up). */
export function buildSlab(level: Level): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(makeShape(level.outline, level.holes), { depth: SLAB_THICKNESS, bevelEnabled: false, curveSegments: 1 });
  geo.rotateX(Math.PI / 2); // (x, y, z) → (x, -z, y): top cap at y = 0 facing up, bottom at -depth facing down
  geo.translate(0, level.floorY, 0);
  geo.clearGroups();
  geo.computeBoundingSphere();
  return geo;
}

/** Ceiling plane facing down (single-sided). */
export function buildCeiling(level: Level): THREE.BufferGeometry {
  const idx = LEVEL_ORDER.indexOf(level.id);
  const above = idx >= 0 && idx < LEVEL_ORDER.length - 1 ? LEVEL_BY_ID[LEVEL_ORDER[idx + 1]] : undefined;
  const geo = new THREE.ShapeGeometry(makeShape(level.outline, above ? above.holes : []), 1);
  geo.rotateX(Math.PI / 2); // normal (0,0,1) → (0,-1,0)
  geo.translate(0, level.floorY + level.ceilingHeight, 0);
  geo.computeBoundingSphere();
  return geo;
}

export function buildSlabs(): Record<LevelId, THREE.BufferGeometry> {
  return Object.fromEntries(HOUSE.levels.map((l) => [l.id, buildSlab(l)])) as Record<LevelId, THREE.BufferGeometry>;
}

export function buildCeilings(): Record<LevelId, THREE.BufferGeometry> {
  return Object.fromEntries(HOUSE.levels.map((l) => [l.id, buildCeiling(l)])) as Record<LevelId, THREE.BufferGeometry>;
}

/** Deterministic PRNG (mulberry32): the same offsets on every load. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const UP = new THREE.Vector3(0, 1, 0);
const quad = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

/** True when the texture's U axis should follow world Z (planks along the room's long side). */
function swapAxes(room: Room): boolean {
  const [x1, z1, x2, z2] = room.bounds;
  const longX = x2 - x1 >= z2 - z1;
  if (room.floor === 'hardwood') return longX; // planks follow V in wood_floor
  if (room.floor === 'laminate') return !longX; // planks follow U in laminate_floor_02
  return false;
}

/** Per-room floor finish quads (top face only), merged by finish into the level's bucket set. */
export function addFloorFinishes(sets: Record<LevelId, BucketSet>): void {
  const r = rng(7);
  for (const room of HOUSE.rooms) {
    if (room.noFloor) continue;
    const level = LEVEL_BY_ID[room.level];
    const [x1, z1, x2, z2] = room.bounds;
    const y = level.floorY + FINISH_LIFT;
    const aligned = room.floor === 'tile';
    const ou = aligned ? 0 : r() * 2;
    const ov = aligned ? 0 : r() * 2;
    const swap = swapAxes(room);
    // CCW seen from above: (x1,z2) (x2,z2) (x2,z1) (x1,z1)
    quad[0].set(x1, y, z2);
    quad[1].set(x2, y, z2);
    quad[2].set(x2, y, z1);
    quad[3].set(x1, y, z1);
    const uvs = quad.map((p): [number, number] => (swap ? [p.z + ou, p.x + ov] : [p.x + ou, p.z + ov]));
    sets[room.level].get(floorKey(room.floor, room)).quad(quad, UP, uvs);
  }
}
