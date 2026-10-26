import type { FloorFinish, Level, Room } from '../../data/types';

/**
 * Material keys used by the merged structure geometry. Every box / quad of the house is pushed
 * into a bucket named by one of these keys, and `useStructureMaterials().get(key)` (materials.ts)
 * turns the key into a shared THREE.Material — so the whole structure renders as a few dozen
 * draw calls per storey.
 */
export const K = {
  /** Ground-storey facade: red brick (texture pack). */
  brick: 'brick',
  /** Upper-storey facade: procedural painted lap siding. */
  siding: 'siding',
  /** Exposed foundation concrete. */
  concrete: 'concrete',
  /** Plain light paint for wall ends / tops / reveals. */
  paintLight: 'paint:#f1eee8',
  /** White semi-gloss painted trim: baseboards, crown, casings, risers, stringers, balusters. */
  trim: 'trim',
  /** Exterior painted trim (matches the fascia / columns): rim band, corner boards, frieze, drip caps. */
  extTrim: 'extTrim',
  /** Oak: handrails, railing top rails, newel caps. */
  oak: 'oak',
  /** Dark stained wood: stair treads and landings. */
  tread: 'tread',
  /** Painted underside of stair carriages / landings. */
  soffit: 'soffit',
  slab: 'slab',
  ceiling: 'ceiling',
  doorLeaf: 'doorLeaf',
  doorDark: 'doorDark',
  doorGrey: 'doorGrey',
  /** Brushed nickel hardware. */
  handle: 'handle',
  garage: 'garageDoor',
  glass: 'glass',
} as const;

/** Room wall paint (hex colour from Room.wallColor). */
export function paintKey(hex: string): string {
  return `paint:${hex.toLowerCase()}`;
}

/**
 * Bathrooms with a shower get glazed ceramic wall tile instead of paint, up to this height above
 * the floor (m) or 'full' to the ceiling. The tile runs down to the floor (no baseboard there).
 * Upstairs it stops 10 cm above the window casings; the basement bath is tiled to its ceiling.
 */
const WALL_TILE: Record<string, number | 'full'> = { 'u-sdb2': 2.3, 'u-sdb1': 2.3, 'b-sdb3': 'full' };

export function isTiledRoom(room: Room | undefined): boolean {
  return room !== undefined && WALL_TILE[room.id] !== undefined;
}

/** World y where the wall tile of this room stops, or undefined for a painted room. */
export function wallTileTop(room: Room | undefined, level: Level): number | undefined {
  const h = room ? WALL_TILE[room.id] : undefined;
  if (h === undefined) return undefined;
  return level.floorY + (h === 'full' ? level.ceilingHeight : h);
}

/** Wall tile key: one material per storey so the tile courses start on that storey's floor. */
export function wallTileKey(floorY: number): string {
  return `walltile:${floorY.toFixed(3)}`;
}

/** Floor height encoded in a wall tile key. */
export function wallTileFloorY(key: string): number {
  return Number(key.slice('walltile:'.length));
}

/** Carpet colour per room (warm greys; the family bedroom slightly cooler). */
export function carpetColor(room: Room): string {
  return room.id === 'b-ch6' ? '#8f8a86' : '#9a948a';
}

/** Floor finish material key; carpets carry their colour. */
export function floorKey(finish: FloorFinish, room?: Room): string {
  if (finish === 'carpet') return `floor:carpet:${room ? carpetColor(room) : '#9a948a'}`;
  return `floor:${finish}`;
}
