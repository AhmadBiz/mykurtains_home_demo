/**
 * The house, transcribed from the architect's plans (Caprea):
 *   p.14  Rez-de-chaussée (ground floor)   p.15  Étage (upper floor)
 *   p.16  Sous-sol (basement) + the four elevations.
 *
 * Everything below is authored in FEET and converted to metres at the bottom of this file.
 * Front of the house = small X (street). North side of the plan (page top) = small Z.
 *
 * Ground-floor footprint (wall centre-lines, feet), clockwise from the NW corner of the powder room:
 *   (5,3) (20.5,3) (20.5,0) (43,0) (43,12.5) (33.5,12.5) (33.5,20.5) (25,20.5) (25,33.5)
 *   (0,33.5) (0,22) (2.5,22) (2.5,12) (5,12)
 * The garage (X 0–20.5, Z 22–33.5) projects furthest toward the street; the entry block (vestibule)
 * sits at X 2.5; the powder-room / stair block at X 5; the big open living block at the rear.
 */
import { FT } from './types';
import type { HouseData, Level, Room, WallDef, Opening, StairFlight, Platform, LevelId } from './types';

// ---------------------------------------------------------------------------------------------
// Heights (feet)
// ---------------------------------------------------------------------------------------------
const BASEMENT_FLOOR = -9;
const GROUND_FLOOR = 0;
const UPPER_FLOOR = 10;
const UPPER_WALL_TOP = 19.5;
export const GRADE_FT = -3.5;

const EXT = 1.0; // exterior wall thickness (ft)
const INT = 0.42; // interior wall thickness (ft)
const RAIL = 0.25;

type P = [number, number];

const levelsFt: Level[] = [
  {
    id: 'basement',
    name: 'Basement',
    nameFr: 'Sous-sol',
    floorY: BASEMENT_FLOOR,
    ceilingHeight: 8,
    wallTop: GROUND_FLOOR,
    outline: [
      [5, 3], [20.5, 3], [20.5, 0], [43, 0], [43, 20.5], [25, 20.5], [25, 33.5], [20.5, 33.5],
      [20.5, 22], [-3.5, 22], [-3.5, 12], [5, 12],
    ],
    holes: [],
  },
  {
    id: 'ground',
    name: 'Ground floor',
    nameFr: 'Rez-de-chaussée',
    floorY: GROUND_FLOOR,
    ceilingHeight: 9,
    wallTop: UPPER_FLOOR,
    outline: [
      [5, 3], [20.5, 3], [20.5, 0], [43, 0], [43, 12.5], [33.5, 12.5], [33.5, 20.5], [25, 20.5],
      [25, 33.5], [0, 33.5], [0, 22], [2.5, 22], [2.5, 12], [5, 12],
    ],
    // stair void: both the up-flight and the down-flight live here
    holes: [[[10.5, 3], [20.5, 3], [20.5, 9], [10.5, 9]]],
  },
  {
    id: 'upper',
    name: 'Upper floor',
    nameFr: 'Étage',
    floorY: UPPER_FLOOR,
    ceilingHeight: 9,
    wallTop: UPPER_WALL_TOP,
    outline: [
      [4, 3], [20.5, 3], [20.5, 0], [43, 0], [43, 12.5], [33.5, 12.5], [33.5, 20.5], [25, 20.5],
      [25, 33.5], [0, 33.5], [0, 12.5], [4, 12.5],
    ],
    holes: [[[10.5, 3], [20.5, 3], [20.5, 9], [10.5, 9]]],
  },
];

// ---------------------------------------------------------------------------------------------
// Rooms (feet) — bounds [x1, z1, x2, z2]
// ---------------------------------------------------------------------------------------------
const WARM_WHITE = '#efe9df';
const SOFT_GREY = '#e3e4e6';
const SAGE = '#d9e0d3';
const BLUE_GREY = '#d6dde6';
const BLUSH = '#ece0da';
const GARAGE_GREY = '#cfd2d6';

const roomsFt: Room[] = [
  // ---- Ground floor ----
  { id: 'g-salon', level: 'ground', name: 'Living room', nameFr: 'Salon', bounds: [20.5, 0, 32, 12.5], floor: 'hardwood', wallColor: WARM_WHITE },
  { id: 'g-sam', level: 'ground', name: 'Dining room', nameFr: 'Salle à manger', bounds: [32, 0, 43, 12.5], floor: 'hardwood', wallColor: WARM_WHITE },
  { id: 'g-cuisine', level: 'ground', name: 'Kitchen', nameFr: 'Cuisine', bounds: [20.5, 12.5, 33.5, 20.5], floor: 'hardwood', wallColor: WARM_WHITE },
  { id: 'g-garde-manger', level: 'ground', name: 'Pantry', nameFr: 'Garde-manger', bounds: [20.5, 20.5, 25, 29.5], floor: 'tile', wallColor: SOFT_GREY },
  { id: 'g-entree-garage', level: 'ground', name: 'Mudroom', nameFr: 'Entrée de garage', bounds: [20.5, 29.5, 25, 33.5], floor: 'tile', wallColor: SOFT_GREY },
  { id: 'g-garage', level: 'ground', name: 'Garage', nameFr: 'Garage', bounds: [0, 22, 20.5, 33.5], floor: 'epoxy', wallColor: GARAGE_GREY },
  { id: 'g-hall', level: 'ground', name: 'Hall', nameFr: 'Hall', bounds: [10.5, 9, 20.5, 22], floor: 'hardwood', wallColor: WARM_WHITE },
  { id: 'g-hall-nook', level: 'ground', name: 'Hall', nameFr: 'Hall', bounds: [5, 9, 10.5, 12], floor: 'hardwood', wallColor: WARM_WHITE },
  { id: 'g-vestibule', level: 'ground', name: 'Vestibule', nameFr: 'Vestibule', bounds: [2.5, 12, 10.5, 17.5], floor: 'tile', wallColor: WARM_WHITE },
  { id: 'g-vestiaire', level: 'ground', name: 'Coat room', nameFr: 'Vestiaire', bounds: [2.5, 17.5, 10.5, 22], floor: 'tile', wallColor: SOFT_GREY },
  { id: 'g-sdeau', level: 'ground', name: 'Powder room', nameFr: "Salle d'eau", bounds: [5, 3, 10.5, 9], floor: 'tile', wallColor: BLUE_GREY },
  { id: 'g-escalier', level: 'ground', name: 'Stairwell', nameFr: "Cage d'escalier", bounds: [10.5, 3, 20.5, 9], floor: 'hardwood', wallColor: WARM_WHITE, noFloor: true },
  // ---- Upper floor ----
  { id: 'u-ch1', level: 'upper', name: 'Master bedroom', nameFr: 'Chambre #1 (principale)', bounds: [27, 0, 43, 12.5], floor: 'hardwood', wallColor: BLUE_GREY },
  { id: 'u-walkin1', level: 'upper', name: 'Master walk-in', nameFr: 'Walk-in (chambre #1)', bounds: [20.5, 0, 27, 9], floor: 'hardwood', wallColor: SOFT_GREY },
  { id: 'u-sdb1', level: 'upper', name: 'Ensuite bathroom', nameFr: 'Salle de bain #1', bounds: [20.5, 12.5, 33.5, 20.5], floor: 'tile', wallColor: SOFT_GREY },
  { id: 'u-corridor', level: 'upper', name: 'Upper hall', nameFr: "Corridor de l'étage", bounds: [4, 9, 27, 12.5], floor: 'hardwood', wallColor: WARM_WHITE },
  { id: 'u-corridor2', level: 'upper', name: 'Upper hall', nameFr: "Corridor de l'étage", bounds: [9.5, 12.5, 12.5, 29.5], floor: 'hardwood', wallColor: WARM_WHITE },
  { id: 'u-lingerie', level: 'upper', name: 'Laundry / linen', nameFr: 'Lingerie', bounds: [12.5, 12.5, 20.5, 17.5], floor: 'tile', wallColor: SOFT_GREY },
  { id: 'u-ch2', level: 'upper', name: 'Bedroom 2', nameFr: 'Chambre #2', bounds: [12.5, 17.5, 25, 29.5], floor: 'hardwood', wallColor: SAGE },
  { id: 'u-walkin2', level: 'upper', name: 'Walk-in (bedroom 2)', nameFr: 'Walk-in (chambre #2)', bounds: [12.5, 29.5, 25, 33.5], floor: 'hardwood', wallColor: SOFT_GREY },
  { id: 'u-placard', level: 'upper', name: 'Linen closet', nameFr: 'Placard', bounds: [9.5, 29.5, 12.5, 33.5], floor: 'hardwood', wallColor: SOFT_GREY },
  { id: 'u-ch3', level: 'upper', name: 'Bedroom 3', nameFr: 'Chambre #3', bounds: [0, 23, 9.5, 33.5], floor: 'hardwood', wallColor: BLUSH },
  { id: 'u-ch4', level: 'upper', name: 'Bedroom 4', nameFr: 'Chambre #4', bounds: [0, 12.5, 9.5, 23], floor: 'hardwood', wallColor: SAGE },
  { id: 'u-sdb2', level: 'upper', name: 'Family bathroom', nameFr: 'Salle de bain #2', bounds: [4, 3, 10.5, 9], floor: 'tile', wallColor: BLUE_GREY },
  { id: 'u-escalier', level: 'upper', name: 'Stairwell', nameFr: "Cage d'escalier", bounds: [10.5, 3, 20.5, 9], floor: 'hardwood', wallColor: WARM_WHITE, noFloor: true },
  // ---- Basement ----
  { id: 'b-sdb3', level: 'basement', name: 'Bathroom 3', nameFr: 'Salle de bain #3', bounds: [5, 3, 10.5, 12], floor: 'tile', wallColor: BLUE_GREY },
  { id: 'b-escalier', level: 'basement', name: 'Stairwell', nameFr: "Cage d'escalier", bounds: [10.5, 3, 20.5, 9], floor: 'laminate', wallColor: WARM_WHITE, noFloor: true },
  { id: 'b-corridor', level: 'basement', name: 'Basement hall', nameFr: 'Corridor du sous-sol', bounds: [20.5, 0, 25, 9], floor: 'laminate', wallColor: WARM_WHITE },
  { id: 'b-jeux', level: 'basement', name: 'Games room', nameFr: 'Salle de jeux', bounds: [10.5, 9, 25, 22], floor: 'laminate', wallColor: WARM_WHITE },
  { id: 'b-mecanique', level: 'basement', name: 'Mechanical room', nameFr: 'Salle mécanique', bounds: [2.5, 12, 10.5, 22], floor: 'concrete', wallColor: GARAGE_GREY },
  { id: 'b-froide', level: 'basement', name: 'Cold room', nameFr: 'Chambre froide', bounds: [-3.5, 12, 2.5, 22], floor: 'concrete', wallColor: GARAGE_GREY },
  { id: 'b-ch5', level: 'basement', name: 'Bedroom 5', nameFr: 'Chambre #5', bounds: [25, 0, 34, 11], floor: 'carpet', wallColor: SAGE },
  { id: 'b-ch6', level: 'basement', name: 'Bedroom 6', nameFr: 'Chambre #6', bounds: [34, 0, 43, 11], floor: 'carpet', wallColor: BLUSH },
  { id: 'b-familiale', level: 'basement', name: 'Family room', nameFr: 'Salle familiale', bounds: [25, 11, 43, 20.5], floor: 'laminate', wallColor: WARM_WHITE },
  { id: 'b-rangement', level: 'basement', name: 'Storage', nameFr: 'Rangement', bounds: [20.5, 22, 25, 33.5], floor: 'concrete', wallColor: GARAGE_GREY },
];

// ---------------------------------------------------------------------------------------------
// Walls (feet). Exterior walls follow the outlines; interior walls partition the rooms.
// ---------------------------------------------------------------------------------------------
function wall(
  id: string,
  level: LevelId,
  a: P,
  b: P,
  opts: Partial<Pick<WallDef, 'thickness' | 'exterior' | 'kind' | 'baseY' | 'height'>> = {},
): WallDef {
  const lvl = levelsFt.find((l) => l.id === level)!;
  const exterior = opts.exterior ?? false;
  const kind = opts.kind ?? 'wall';
  const baseY = opts.baseY ?? lvl.floorY;
  const height = opts.height ?? (kind === 'railing' ? 3 : kind === 'halfwall' ? 3.5 : lvl.wallTop - baseY);
  return {
    id,
    level,
    a,
    b,
    thickness: opts.thickness ?? (exterior ? EXT : kind === 'railing' ? RAIL : INT),
    exterior,
    kind,
    baseY,
    height,
  };
}
const ext = (id: string, level: LevelId, a: P, b: P, o: Partial<WallDef> = {}) => wall(id, level, a, b, { ...o, exterior: true });
const int = (id: string, level: LevelId, a: P, b: P, o: Partial<WallDef> = {}) => wall(id, level, a, b, { ...o, exterior: false });

const wallsFt: WallDef[] = [
  // ===================== GROUND — exterior (clockwise) =====================
  ext('g-ext-n1', 'ground', [5, 3], [10.5, 3]), // powder room, north
  // stair block north wall: double height (ground floor to upper ceiling) — holds the tall stair window
  ext('g-ext-n2', 'ground', [10.5, 3], [20.5, 3], { height: UPPER_WALL_TOP - GROUND_FLOOR }),
  ext('g-ext-w2', 'ground', [20.5, 0], [20.5, 3]), // jog
  ext('g-ext-n3', 'ground', [20.5, 0], [43, 0]), // living / dining, north
  ext('g-ext-e1', 'ground', [43, 0], [43, 12.5]), // dining, rear
  ext('g-ext-s1', 'ground', [33.5, 12.5], [43, 12.5]), // dining, south (faces the balcony)
  ext('g-ext-e2', 'ground', [33.5, 12.5], [33.5, 20.5]), // kitchen, rear (patio door)
  ext('g-ext-s2', 'ground', [25, 20.5], [33.5, 20.5]), // kitchen, south
  ext('g-ext-e3', 'ground', [25, 20.5], [25, 33.5]), // pantry + mudroom, east
  ext('g-ext-s3', 'ground', [0, 33.5], [25, 33.5]), // garage + mudroom, south
  ext('g-ext-w1', 'ground', [0, 22], [0, 33.5]), // garage, front (garage door)
  ext('g-ext-n4', 'ground', [0, 22], [2.5, 22]), // jog garage → vestibule
  ext('g-ext-w3', 'ground', [2.5, 12], [2.5, 22]), // vestibule + coat room, front (entry door)
  ext('g-ext-n5', 'ground', [2.5, 12], [5, 12]), // jog
  ext('g-ext-w4', 'ground', [5, 3], [5, 12]), // powder room, front
  // ===================== GROUND — interior =====================
  int('g-int-1', 'ground', [5, 9], [10.5, 9]), // powder room south (door)
  int('g-int-2', 'ground', [10.5, 3], [10.5, 9]), // powder room / stair
  int('g-int-3', 'ground', [10.5, 9], [20.5, 9]), // stair block south / hall north
  // stair spine wall between the two flights: runs from the basement floor to the upper ceiling
  int('g-int-spine', 'ground', [13.5, 6], [20.5, 6], { baseY: BASEMENT_FLOOR, height: UPPER_WALL_TOP - BASEMENT_FLOOR }),
  int('g-int-5', 'ground', [10.5, 12], [10.5, 22]), // vestibule / coat room east (cased opening to hall)
  int('g-int-6', 'ground', [2.5, 17.5], [10.5, 17.5]), // vestibule / coat room
  int('g-int-7', 'ground', [2.5, 22], [20.5, 22]), // garage north wall (door from coat room)
  int('g-int-8', 'ground', [20.5, 17.5], [20.5, 33.5]), // fridge wall + garage east wall (door to mudroom)
  int('g-int-9', 'ground', [20.5, 20.5], [25, 20.5]), // kitchen / pantry (door)
  int('g-int-10', 'ground', [20.5, 29.5], [25, 29.5]), // pantry / mudroom (cased)
  int('g-int-11', 'ground', [5, 12], [10.5, 12]), // vestibule north
  // ===================== UPPER — exterior =====================
  ext('u-ext-n1', 'upper', [4, 3], [10.5, 3]), // family bath, north
  ext('u-ext-w2', 'upper', [20.5, 0], [20.5, 3]), // jog
  ext('u-ext-n3', 'upper', [20.5, 0], [43, 0]), // walk-in + master, north
  ext('u-ext-e1', 'upper', [43, 0], [43, 12.5]), // master, rear
  ext('u-ext-s1', 'upper', [33.5, 12.5], [43, 12.5]), // master, south
  ext('u-ext-e2', 'upper', [33.5, 12.5], [33.5, 20.5]), // ensuite, rear
  ext('u-ext-s2', 'upper', [25, 20.5], [33.5, 20.5]), // ensuite, south
  ext('u-ext-e3', 'upper', [25, 20.5], [25, 33.5]), // bedroom 2 + walk-in, east
  ext('u-ext-s3', 'upper', [0, 33.5], [25, 33.5]), // bedroom 3 + walk-in 2, south
  ext('u-ext-w1', 'upper', [0, 12.5], [0, 33.5]), // bedrooms 3 & 4, front
  ext('u-ext-n4', 'upper', [0, 12.5], [4, 12.5]), // jog
  ext('u-ext-w4', 'upper', [4, 3], [4, 12.5]), // family bath, front
  // ===================== UPPER — interior =====================
  int('u-int-1', 'upper', [4, 9], [10.5, 9]), // family bath south (door)
  int('u-int-2', 'upper', [10.5, 3], [10.5, 9]), // family bath / stair
  wall('u-rail-1', 'upper', [10.5, 9], [17.5, 9], { kind: 'railing' }), // stair guard rail
  int('u-int-4', 'upper', [20.5, 3], [20.5, 9]), // stair / walk-in
  int('u-int-5', 'upper', [20.5, 9], [27, 9]), // walk-in south / corridor
  int('u-int-6', 'upper', [27, 0], [27, 9]), // walk-in / master (door)
  int('u-int-7', 'upper', [27, 9], [27, 12.5]), // master west (door from corridor)
  int('u-int-8', 'upper', [27, 12.5], [33.5, 12.5]), // master / ensuite (door)
  int('u-int-9', 'upper', [12.5, 12.5], [27, 12.5]), // corridor south (laundry door)
  int('u-int-10', 'upper', [20.5, 12.5], [20.5, 20.5]), // laundry + bedroom 2 / ensuite
  int('u-int-11', 'upper', [12.5, 17.5], [20.5, 17.5]), // laundry / bedroom 2
  int('u-int-12', 'upper', [12.5, 12.5], [12.5, 33.5]), // N-S corridor east (bedroom 2 door)
  int('u-int-13', 'upper', [9.5, 12.5], [9.5, 33.5]), // N-S corridor west (bedroom 3 & 4 doors)
  int('u-int-14', 'upper', [9.5, 29.5], [12.5, 29.5]), // linen closet (door)
  int('u-int-15', 'upper', [0, 23], [9.5, 23]), // bedroom 3 / bedroom 4
  int('u-int-16', 'upper', [12.5, 29.5], [25, 29.5]), // bedroom 2 / walk-in 2 (door)
  // ===================== BASEMENT — exterior =====================
  ext('b-ext-n1', 'basement', [5, 3], [10.5, 3]),
  ext('b-ext-n2', 'basement', [10.5, 3], [20.5, 3]),
  ext('b-ext-w2', 'basement', [20.5, 0], [20.5, 3]),
  ext('b-ext-n3', 'basement', [20.5, 0], [43, 0]),
  ext('b-ext-e1', 'basement', [43, 0], [43, 20.5]),
  ext('b-ext-s1', 'basement', [25, 20.5], [43, 20.5]),
  ext('b-ext-e2', 'basement', [25, 20.5], [25, 33.5]),
  ext('b-ext-s2', 'basement', [20.5, 33.5], [25, 33.5]),
  ext('b-ext-w3', 'basement', [20.5, 22], [20.5, 33.5]), // against the unexcavated garage
  ext('b-ext-s3', 'basement', [-3.5, 22], [20.5, 22]), // against the unexcavated garage
  ext('b-ext-w4', 'basement', [-3.5, 12], [-3.5, 22]), // cold room, front
  ext('b-ext-n4', 'basement', [-3.5, 12], [5, 12]), // cold room, north
  ext('b-ext-w5', 'basement', [5, 3], [5, 12]), // bathroom 3, front
  // ===================== BASEMENT — interior =====================
  int('b-int-1', 'basement', [5, 12], [10.5, 12]), // bathroom 3 south (door)
  int('b-int-2', 'basement', [10.5, 3], [10.5, 9]), // stair west
  int('b-int-3', 'basement', [10.5, 9], [20.5, 9]), // stair south / games room
  int('b-int-4', 'basement', [10.5, 9], [10.5, 22]), // games room / mechanical (door)
  int('b-int-5', 'basement', [2.5, 12], [2.5, 22]), // cold room / mechanical (door)
  int('b-int-6', 'basement', [25, 0], [25, 11]), // hall / bedroom 5 (door)
  int('b-int-7', 'basement', [25, 11], [43, 11]), // bedrooms 5 & 6 / family room (door to 6)
  int('b-int-8', 'basement', [25, 11], [25, 20.5]), // games room / family room (cased)
  int('b-int-9', 'basement', [34, 0], [34, 11]), // bedroom 5 / bedroom 6
  int('b-int-10', 'basement', [20.5, 22], [25, 22]), // games room / storage (door)
];

// ---------------------------------------------------------------------------------------------
// Openings (feet). `at` = distance from wall.a to the opening centre.
// ---------------------------------------------------------------------------------------------
const DOOR_H = 6.83;
const win = (id: string, wallId: string, at: number, width: number, height: number, sill: number, room: string, name: string, nameFr: string, frosted = false): Opening => ({
  id, wall: wallId, kind: 'window', at, width, height, sill, room, name, nameFr, frosted,
});
const door = (id: string, wallId: string, at: number, width = 2.67, kind: Opening['kind'] = 'door', height = DOOR_H): Opening => ({
  id, wall: wallId, kind, at, width, height, sill: 0,
});

const openingsFt: Opening[] = [
  // ---------------- Ground floor windows ----------------
  win('w-salon-n', 'g-ext-n3', 6.5, 6, 5, 2.5, 'g-salon', 'Living room — north window', 'Salon — fenêtre nord'),
  win('w-sam-n', 'g-ext-n3', 17, 5, 5, 2.5, 'g-sam', 'Dining room — north window', 'Salle à manger — fenêtre nord'),
  win('w-sam-e', 'g-ext-e1', 6, 7, 5, 2.5, 'g-sam', 'Dining room — rear window', 'Salle à manger — fenêtre arrière'),
  win('w-sam-s', 'g-ext-s1', 4.75, 5, 5, 2.5, 'g-sam', 'Dining room — balcony-side window', 'Salle à manger — fenêtre côté balcon'),
  { id: 'd-patio', wall: 'g-ext-e2', kind: 'patio', at: 4.5, width: 6, height: 6.67, sill: 0, room: 'g-cuisine', name: 'Kitchen — patio door to balcony', nameFr: 'Cuisine — porte-patio (balcon)' },
  win('w-cuisine-s', 'g-ext-s2', 4.5, 4, 3, 3.5, 'g-cuisine', 'Kitchen — window over sink', 'Cuisine — fenêtre au-dessus de l’évier'),
  win('w-sdeau-n', 'g-ext-n1', 2.75, 2.5, 2.5, 4.5, 'g-sdeau', 'Powder room window', "Salle d'eau — fenêtre", true),
  win('w-escalier', 'g-ext-n2', 5, 4, 12, 3, 'g-escalier', 'Stairwell — tall window', "Cage d'escalier — fenêtre haute"),
  win('w-garage-s', 'g-ext-s3', 10, 3, 2, 5.5, 'g-garage', 'Garage — side window', 'Garage — fenêtre latérale'),
  // ---------------- Ground floor doors ----------------
  door('d-front', 'g-ext-w3', 2.75, 5.33, 'frontDoor', 6.83),
  door('d-garage', 'g-ext-w1', 5.75, 9, 'garage', 7),
  door('d-side', 'g-ext-s3', 22.5, 3, 'exteriorDoor'),
  door('d-sdeau', 'g-int-1', 2.75, 2.5),
  door('d-vestibule-hall', 'g-int-5', 2.75, 4, 'cased', 7),
  door('d-vestiaire', 'g-int-6', 4, 2.5),
  door('d-vestiaire-garage', 'g-int-7', 4, 2.67),
  door('d-garage-mudroom', 'g-int-8', 14, 2.67),
  door('d-pantry', 'g-int-9', 2.25, 2.5),
  door('d-pantry-mudroom', 'g-int-10', 2.25, 3, 'cased', 7),
  // ---------------- Upper floor windows ----------------
  win('w-ch1-e', 'u-ext-e1', 6, 6, 4.5, 2.5, 'u-ch1', 'Master bedroom — rear window', 'Chambre #1 — fenêtre arrière'),
  win('w-ch1-n', 'u-ext-n3', 15.5, 4, 4.5, 2.5, 'u-ch1', 'Master bedroom — north window', 'Chambre #1 — fenêtre nord'),
  win('w-ch1-s', 'u-ext-s1', 4.75, 4, 4.5, 2.5, 'u-ch1', 'Master bedroom — south window', 'Chambre #1 — fenêtre sud'),
  win('w-walkin1-n', 'u-ext-n3', 3.5, 3, 2.5, 5, 'u-walkin1', 'Master walk-in — window', 'Walk-in (chambre #1) — fenêtre'),
  win('w-sdb1-e', 'u-ext-e2', 4.5, 3, 3, 4, 'u-sdb1', 'Ensuite — window over tub', 'Salle de bain #1 — fenêtre du bain', true),
  win('w-sdb1-s', 'u-ext-s2', 4, 3, 2.5, 4.5, 'u-sdb1', 'Ensuite — south window', 'Salle de bain #1 — fenêtre sud', true),
  win('w-ch2-e', 'u-ext-e3', 4.5, 5, 4.5, 2.5, 'u-ch2', 'Bedroom 2 — window', 'Chambre #2 — fenêtre'),
  win('w-walkin2-s', 'u-ext-s3', 18.75, 2.5, 2, 5.5, 'u-walkin2', 'Walk-in (bedroom 2) — window', 'Walk-in (chambre #2) — fenêtre'),
  win('w-ch3-s', 'u-ext-s3', 4.75, 4, 4.5, 2.5, 'u-ch3', 'Bedroom 3 — side window', 'Chambre #3 — fenêtre latérale'),
  win('w-ch3-w', 'u-ext-w1', 15.75, 5, 4.5, 2.5, 'u-ch3', 'Bedroom 3 — front window', 'Chambre #3 — fenêtre avant'),
  win('w-ch4-w', 'u-ext-w1', 5.25, 5, 4.5, 2.5, 'u-ch4', 'Bedroom 4 — front window', 'Chambre #4 — fenêtre avant'),
  win('w-sdb2-n', 'u-ext-n1', 3.25, 3, 2.5, 4.5, 'u-sdb2', 'Family bathroom — window', 'Salle de bain #2 — fenêtre', true),
  // ---------------- Upper floor doors ----------------
  door('d-sdb2', 'u-int-1', 3.25, 2.5),
  door('d-walkin1', 'u-int-6', 5, 2.5),
  door('d-ch1', 'u-int-7', 1.75, 2.67),
  door('d-sdb1', 'u-int-8', 3, 2.5),
  door('d-lingerie', 'u-int-9', 4, 2.5),
  door('d-ch2', 'u-int-12', 7.5, 2.67),
  door('d-ch4', 'u-int-13', 2.5, 2.67),
  door('d-ch3', 'u-int-13', 13.5, 2.67),
  door('d-placard', 'u-int-14', 1.5, 2.33),
  door('d-walkin2', 'u-int-16', 3, 2.5),
  // ---------------- Basement windows ----------------
  win('w-ch5-n', 'b-ext-n3', 9, 3.5, 1.75, 5.75, 'b-ch5', 'Bedroom 5 — window', 'Chambre #5 — fenêtre'),
  win('w-ch6-n', 'b-ext-n3', 18, 3.5, 1.75, 5.75, 'b-ch6', 'Bedroom 6 — north window', 'Chambre #6 — fenêtre nord'),
  win('w-ch6-e', 'b-ext-e1', 5.5, 3.5, 1.75, 5.75, 'b-ch6', 'Bedroom 6 — rear window', 'Chambre #6 — fenêtre arrière'),
  win('w-familiale-e', 'b-ext-e1', 16, 4, 1.75, 5.75, 'b-familiale', 'Family room — rear window', 'Salle familiale — fenêtre arrière'),
  win('w-familiale-s', 'b-ext-s1', 10, 4, 1.75, 5.75, 'b-familiale', 'Family room — side window', 'Salle familiale — fenêtre latérale'),
  win('w-sdb3-n', 'b-ext-n1', 2.75, 2.5, 1.5, 6, 'b-sdb3', 'Bathroom 3 — window', 'Salle de bain #3 — fenêtre', true),
  // ---------------- Basement doors ----------------
  door('d-sdb3', 'b-int-1', 2.75, 2.5),
  door('d-mecanique', 'b-int-4', 8, 2.67),
  door('d-froide', 'b-int-5', 5, 2.5),
  door('d-ch5', 'b-int-6', 6, 2.67),
  door('d-ch6', 'b-int-7', 13.5, 2.67),
  door('d-jeux-familiale', 'b-int-8', 4.5, 5, 'cased', 7),
  door('d-rangement', 'b-int-10', 2.25, 2.5),
];

// ---------------------------------------------------------------------------------------------
// Stairs (feet). Two parallel straight flights per storey with a landing at the west end.
// Up-stair: A (north half, Z 3–6) rises westward from X 20.5 → 13.5, landing (X 10.5–13.5), B (south half) rises eastward to the upper floor.
// Down-stair: C (south half) descends westward from the ground floor, landing, D (north half) descends eastward to the basement.
// The spine wall at Z = 6 separates the halves. Entries are from the living-room side at X = 20.5.
// ---------------------------------------------------------------------------------------------
const stairsFt: StairFlight[] = [
  // `dir` is the direction of ASCENT; y0 is the height at the LOW end, y1 at the HIGH end.
  { id: 'st-up-a', bounds: [13.5, 3, 20.5, 6], dir: '-x', y0: GROUND_FLOOR, y1: 5, steps: 8, from: 'ground', to: 'upper', style: 'interior' },
  { id: 'st-up-b', bounds: [13.5, 6, 20.5, 9], dir: '+x', y0: 5, y1: UPPER_FLOOR, steps: 8, from: 'ground', to: 'upper', style: 'interior' },
  { id: 'st-down-c', bounds: [13.5, 6, 20.5, 9], dir: '+x', y0: -4.5, y1: GROUND_FLOOR, steps: 7, from: 'basement', to: 'ground', style: 'interior' },
  { id: 'st-down-d', bounds: [13.5, 3, 20.5, 6], dir: '-x', y0: BASEMENT_FLOOR, y1: -4.5, steps: 7, from: 'basement', to: 'ground', style: 'interior' },
];

const platformsFt: Platform[] = [
  { id: 'pl-up-landing', bounds: [10.5, 3, 13.5, 9], y: 5, kind: 'landing' },
  { id: 'pl-down-landing', bounds: [10.5, 3, 13.5, 9], y: -4.5, kind: 'landing' },
  { id: 'pl-perron', bounds: [-3.5, 12, 2.5, 22], y: GROUND_FLOOR, kind: 'porch' },
  { id: 'pl-balcon', bounds: [33.5, 12.5, 43, 20.5], y: GROUND_FLOOR, kind: 'deck' },
  { id: 'pl-side-landing', bounds: [21, 33.5, 24, 35], y: GROUND_FLOOR, kind: 'landing' },
];

// Exterior walkable slopes (treated like stairs by the player controller).
const rampsFt: StairFlight[] = [
  // front porch steps: descend westward from the porch to the walkway
  { id: 'rp-perron', bounds: [-8.5, 14, -3.5, 20], dir: '+x', y0: GRADE_FT, y1: GROUND_FLOOR, steps: 5, from: 'exterior', to: 'ground', style: 'exterior' },
  // driveway rises gently to the garage door
  { id: 'rp-driveway', bounds: [-24, 22.5, 0, 33], dir: '+x', y0: GRADE_FT, y1: GROUND_FLOOR, steps: 0, from: 'exterior', to: 'ground', style: 'exterior' },
  // balcony stairs down to the back yard (descend southward)
  { id: 'rp-balcon', bounds: [38, 20.5, 42, 26], dir: '-z', y0: GRADE_FT, y1: GROUND_FLOOR, steps: 5, from: 'exterior', to: 'ground', style: 'exterior' },
  // side door steps (descend southward)
  { id: 'rp-side', bounds: [21, 35, 24, 39], dir: '-z', y0: GRADE_FT, y1: GROUND_FLOOR, steps: 5, from: 'exterior', to: 'ground', style: 'exterior' },
];

// ---------------------------------------------------------------------------------------------
// Convert feet → metres
// ---------------------------------------------------------------------------------------------
const m = (v: number) => v * FT;
const mp = (p: P): P => [m(p[0]), m(p[1])];
const mb = (b: [number, number, number, number]): [number, number, number, number] => [m(b[0]), m(b[1]), m(b[2]), m(b[3])];

export const HOUSE: HouseData = {
  gradeY: m(GRADE_FT),
  levels: levelsFt.map((l) => ({
    ...l,
    floorY: m(l.floorY),
    ceilingHeight: m(l.ceilingHeight),
    wallTop: m(l.wallTop),
    outline: l.outline.map(mp),
    holes: l.holes.map((h) => h.map(mp)),
  })),
  rooms: roomsFt.map((r) => ({ ...r, bounds: mb(r.bounds) })),
  walls: wallsFt.map((w) => ({ ...w, a: mp(w.a), b: mp(w.b), thickness: m(w.thickness), baseY: m(w.baseY), height: m(w.height) })),
  openings: openingsFt.map((o) => ({ ...o, at: m(o.at), width: m(o.width), height: m(o.height), sill: m(o.sill) })),
  stairs: stairsFt.map((s) => ({ ...s, bounds: mb(s.bounds), y0: m(s.y0), y1: m(s.y1) })),
  platforms: platformsFt.map((p) => ({ ...p, bounds: mb(p.bounds), y: m(p.y) })),
  ramps: rampsFt.map((s) => ({ ...s, bounds: mb(s.bounds), y0: m(s.y0), y1: m(s.y1) })),
};

/** Identity of this house (shown in the UI). */
export const HOUSE_META = {
  name: 'Maison Sara',
  nameEn: "Sara's house",
  client: 'Sara',
  address: '6274 Blvd. des Rossignols, Laval, QC H7L 5V6, Canada',
  description: 'Maison à deux étages avec garage et sous-sol aménagé.',
  descriptionEn: 'Two-storey house with garage and finished basement.',
};

/** Where the visitor starts: on the front walkway, looking at the house. */
export const START_POSITION: [number, number, number] = [m(-16), m(GRADE_FT), m(17)];
/** Yaw (radians, about +Y) at start. yaw = -PI/2 looks toward +X (into the house). */
export const START_YAW = -Math.PI / 2;

export const PLAYER_EYE_HEIGHT = m(5.5);
export const PLAYER_RADIUS = 0.28;
