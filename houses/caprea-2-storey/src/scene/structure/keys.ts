import type { FloorFinish } from '../../data/types';

/**
 * Material keys used by the merged structure geometry. Every box / quad of the house is pushed
 * into a bucket named by one of these keys, and `materialFor(key)` (materials.ts) turns the key
 * into a shared THREE.Material — so the whole structure renders as a few dozen draw calls.
 */
export const K = {
  brick: 'brick',
  siding: 'siding',
  concrete: 'concrete',
  /** Plain light paint for wall ends / tops / reveals. */
  paintLight: 'paint:#f1eee8',
  trim: 'trim',
  oak: 'oak',
  soffit: 'soffit',
  slab: 'slab',
  ceiling: 'ceiling',
  hardwood: 'floor:hardwood',
  doorLeaf: 'doorLeaf',
  doorDark: 'doorDark',
  doorGrey: 'doorGrey',
  handle: 'handle',
  garage: 'garageDoor',
  glass: 'glass',
} as const;

/** Room wall paint (hex colour from Room.wallColor). */
export function paintKey(hex: string): string {
  return `paint:${hex.toLowerCase()}`;
}

/** Floor finish material. */
export function floorKey(finish: FloorFinish): string {
  return `floor:${finish}`;
}
