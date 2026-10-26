/**
 * Core data model for the house.
 *
 * COORDINATE SYSTEM (world, metres, Y up):
 *  - X runs from the FRONT of the house (street side, small X) to the REAR (large X).
 *  - Z runs from the NORTH side of the plan (plan top, small Z) to the SOUTH side (plan bottom, large Z).
 *  - Y is up. Ground-floor finished floor is Y = 0. Basement floor is below 0, upper floor above.
 *  - Exterior grade (lawn) is at GRADE_Y (negative).
 *
 * All values in `house.ts` are authored in FEET (matching the architect's plans) and converted
 * to metres once, so every consumer of `HOUSE` works in metres.
 */

export const FT = 0.3048;

export type LevelId = 'basement' | 'ground' | 'upper';

export interface Level {
  id: LevelId;
  name: string;
  nameFr: string;
  /** Finished floor height (m). */
  floorY: number;
  /** Clear height floor → ceiling (m). */
  ceilingHeight: number;
  /** Top of the level's walls (m) — i.e. the floorY of the level above, or roof base for the top level. */
  wallTop: number;
  /** Footprint polygon of this level (wall centre-lines), [x, z] pairs, metres. */
  outline: [number, number][];
  /** Holes in the floor slab (e.g. stair voids), each a polygon of [x, z] pairs. */
  holes: [number, number][][];
}

export type FloorFinish = 'hardwood' | 'tile' | 'carpet' | 'concrete' | 'epoxy' | 'laminate';

export interface Room {
  id: string;
  level: LevelId;
  name: string;
  nameFr: string;
  /** Axis-aligned bounds [x1, z1, x2, z2] in metres (nominal, to wall centre-lines). */
  bounds: [number, number, number, number];
  floor: FloorFinish;
  /** Wall paint colour for this room (hex). */
  wallColor: string;
  /** Rooms that have no floor slab of their own (e.g. stair voids) or are exterior. */
  noFloor?: boolean;
}

export type WallKind = 'wall' | 'railing' | 'halfwall';

export interface WallDef {
  id: string;
  level: LevelId;
  /** Centre-line start [x, z] (m). */
  a: [number, number];
  /** Centre-line end [x, z] (m). */
  b: [number, number];
  /** Full thickness (m). */
  thickness: number;
  exterior: boolean;
  kind: WallKind;
  /** Bottom of the wall (m). Defaults to the level's floorY. */
  baseY: number;
  /** Height of the wall from baseY (m). Defaults to level.wallTop - floorY. */
  height: number;
}

export type OpeningKind =
  | 'window' // coverable
  | 'patio' // sliding glass door, coverable
  | 'frontDoor' // glazed entry door with sidelights, not coverable
  | 'exteriorDoor' // solid side door
  | 'garage' // garage door
  | 'door' // interior swing door (rendered open)
  | 'cased'; // cased opening, no door leaf

export interface Opening {
  id: string;
  /** Wall id this opening is cut into. */
  wall: string;
  kind: OpeningKind;
  /** Distance (m) along the wall from `a` to the CENTRE of the opening. */
  at: number;
  /** Opening width (m). */
  width: number;
  /** Opening height (m). */
  height: number;
  /** Bottom of the opening above the level's floor (m). 0 for doors. */
  sill: number;
  /** Room the opening belongs to (for windows: the room whose coverings apply). */
  room?: string;
  name?: string;
  nameFr?: string;
  /** Frosted / privacy glass. */
  frosted?: boolean;
}

export interface StairFlight {
  id: string;
  /** [x1, z1, x2, z2] footprint in metres. */
  bounds: [number, number, number, number];
  /** Direction of ASCENT. */
  dir: '+x' | '-x' | '+z' | '-z';
  /** Height at the low end (m). */
  y0: number;
  /** Height at the high end (m). */
  y1: number;
  steps: number;
  /** Which levels this flight connects. */
  from: LevelId | 'exterior';
  to: LevelId | 'exterior';
  /** Visual style. */
  style: 'interior' | 'exterior';
}

export interface Platform {
  id: string;
  bounds: [number, number, number, number];
  y: number;
  kind: 'landing' | 'porch' | 'deck' | 'driveway' | 'path';
}

export interface HouseData {
  /** Exterior grade height (m). */
  gradeY: number;
  levels: Level[];
  rooms: Room[];
  walls: WallDef[];
  openings: Opening[];
  stairs: StairFlight[];
  platforms: Platform[];
  /** Exterior ramps (porch steps, driveway, balcony stairs) — walkable slopes. */
  ramps: StairFlight[];
}
