import type * as THREE from 'three';
import { LEVEL_ORDER } from '../../data/geometry';
import type { LevelId } from '../../data/types';
import { BucketSet } from './bucket';
import type { MergedPart } from './bucket';
import { addDoors } from './doors';
import { addExteriorTrim } from './exteriorTrim';
import { addFloorFinishes, buildCeilings, buildSlabs } from './floors';
import { addStairs } from './stairs';
import { addTrim } from './trim';
import { addWalls } from './walls';

/** Everything the <House/> renders for one level. */
export interface LevelStructure {
  /** Walls, trim, floor finishes, stairs, railings, doors — merged by material key. */
  parts: MergedPart[];
  slab: THREE.BufferGeometry;
  ceiling: THREE.BufferGeometry;
  /** Triangle count of the merged parts (budget reporting). */
  triangles: number;
}

let cache: Record<LevelId, LevelStructure> | null = null;

/**
 * Builds (once, lazily) the merged geometry of the whole house. Pure geometry — no DOM access —
 * so it is also runnable in node for validation.
 */
export function getStructure(): Record<LevelId, LevelStructure> {
  if (cache) return cache;
  const sets: Record<LevelId, BucketSet> = { basement: new BucketSet(), ground: new BucketSet(), upper: new BucketSet() };
  addWalls(sets);
  addExteriorTrim(sets);
  addTrim(sets);
  addFloorFinishes(sets);
  addStairs(sets);
  addDoors(sets);
  const slabs = buildSlabs();
  const ceilings = buildCeilings();
  cache = Object.fromEntries(
    LEVEL_ORDER.map((id) => [id, { parts: sets[id].build(), slab: slabs[id], ceiling: ceilings[id], triangles: sets[id].triangles }]),
  ) as Record<LevelId, LevelStructure>;
  return cache;
}
