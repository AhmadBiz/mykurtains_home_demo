import type * as THREE from 'three';
import { LEVEL_ORDER } from '../../data/geometry';
import type { LevelId } from '../../data/types';
import { BucketSet } from './bucket';
import type { MergedPart } from './bucket';
import { addDoors } from './doors';
import { addFloorFinishes, buildCeilings, buildSlabs } from './floors';
import { addStairs } from './stairs';
import { addWalls } from './walls';

/** Everything the <House/> renders for one level. */
export interface LevelStructure {
  /** Walls, floor finishes, stairs, doors — merged by material key. */
  parts: MergedPart[];
  slab: THREE.BufferGeometry;
  ceiling: THREE.BufferGeometry;
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
  addFloorFinishes(sets);
  addStairs(sets);
  addDoors(sets);
  const slabs = buildSlabs();
  const ceilings = buildCeilings();
  cache = Object.fromEntries(LEVEL_ORDER.map((id) => [id, { parts: sets[id].build(), slab: slabs[id], ceiling: ceilings[id] }])) as Record<
    LevelId,
    LevelStructure
  >;
  return cache;
}
