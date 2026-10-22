import * as THREE from 'three';
import { HOUSE } from '../../data/house';
import { LEVEL_BY_ID, LEVEL_ORDER } from '../../data/geometry';
import type { Level, LevelId } from '../../data/types';
import { IDENTITY, addBox } from './bucket';
import type { BucketSet } from './bucket';
import { floorKey } from './keys';

/**
 * Floor slabs, per-room floor finishes and ceilings.
 *
 *  - Slab: the level outline (minus its holes) extruded SLAB_THICKNESS downward from floorY.
 *  - Finishes: one quad per room 4 mm above the slab, keyed by the room's FloorFinish.
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

/** Per-room floor finish quads (top face only), merged by finish into the level's bucket set. */
export function addFloorFinishes(sets: Record<LevelId, BucketSet>): void {
  for (const room of HOUSE.rooms) {
    if (room.noFloor) continue;
    const level = LEVEL_BY_ID[room.level];
    const [x1, z1, x2, z2] = room.bounds;
    addBox(
      sets[room.level],
      { py: floorKey(room.floor), rest: '' },
      { cx: (x1 + x2) / 2, cy: level.floorY + FINISH_LIFT, cz: (z1 + z2) / 2, sx: x2 - x1, sy: 0.002, sz: z2 - z1 },
      IDENTITY,
    );
  }
}
