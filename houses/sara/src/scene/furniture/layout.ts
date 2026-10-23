import * as THREE from 'three';
import { LEVEL_BY_ID, LEVEL_ORDER, ROOM_BY_ID } from '../../data/geometry';
import { FT } from '../../data/types';
import type { LevelId } from '../../data/types';
import { Frame, PartSet } from './builder';
import type { BuiltLevel } from './builder';
import { cardboardBox } from './pieces';
import * as P from './pieces';

/**
 * Where every prop goes. Positions are derived from `HOUSE.rooms` bounds (metres, wall
 * centre-lines); `IN` keeps pieces ≥ 0.2 m inside a wall centre-line (exterior walls are 0.30 m
 * thick, interior 0.13 m) and every door keeps a ≥ 1 m clear path into its room; nothing stands
 * in front of a window.
 *
 * Facing yaws: a piece's front is local +Z, and rotating +Z by `yaw` about Y gives world
 * (sin yaw, 0, cos yaw) — so N faces −Z (plan top), S faces +Z, E faces +X (rear), W faces −X.
 * Note that a yaw of N (π) also flips local +X to world −X.
 */
const N = Math.PI;
const S = 0;
const E = Math.PI / 2;
const W = -Math.PI / 2;
const IN = 0.2;
/** Half thickness of an exterior / interior wall (distance from centre-line to its face). */
const EXT_FACE = 0.5 * FT;
const INT_FACE = 0.21 * FT;

type Bounds = [number, number, number, number];

function bounds(id: string): Bounds {
  const r = ROOM_BY_ID.get(id);
  if (!r) throw new Error(`Furniture: unknown room ${id}`);
  return r.bounds;
}

// =============================================================================================
// Ground floor
// =============================================================================================

function salon(f: Frame): void {
  const [x1, z1] = bounds('g-salon');
  // Media unit on the north wall, west of the window (the west side of the room is the stair
  // entry + the opening to the hall, so a wall unit at Z ≈ 5 ft would block the first step).
  const tvX = x1 + IN + 0.5;
  P.tvUnit(f.at(tvX, 0, z1 + IN + 0.22, S), 1.0);
  P.tv(f.at(tvX, 0.48, z1 + IN + 0.22, S), 0.9, 0);
  // Seating group facing the window / TV, leaving the Z 9–12.5 ft walkway from the hall free.
  const cx = x1 + 1.83; // X ≈ 26.5 ft
  P.rug(f.at(cx, 0, 1.5), 2.6, 1.9, 'rugRust');
  P.sofa(f.at(cx, 0, 2.0, N), 2.1, 3, 'fabricCharcoal', 0.95, ['velvetMustard', 'velvetRust']);
  P.coffeeTable(f.at(cx, 0, 1.1), 1.1, 0.6);
  const ax = x1 + 2.9; // X ≈ 30 ft
  P.armchair(f.at(ax, 0, 0.95, W + 0.35), 'leather');
  P.armchair(f.at(ax, 0, 2.2, W - 0.35), 'leather');
  P.floorLamp(f.at(ax + 0.35, 0, 1.57));
  P.plant(f.at(x1 + 3.35, 0, 3.1), true);
}

function diningRoom(f: Frame): void {
  const [x1, z1, x2, z2] = bounds('g-sam');
  // Sideboard on the north wall in the pier between the living-room and dining-room windows.
  P.dresser(f.at(x1 + 0.15, 0, z1 + IN + 0.225, S), 1.3, 0.8, 0.45, 'walnut', 2);
  P.picture(f.at(x1 + 0.15, 0, z1 + EXT_FACE, S), 0.8, 0.55, 1.45, 'art2', 'walnut');
  const tx = x1 + 1.83; // X ≈ 38 ft
  const tz = (z1 + z2) / 2 + 0.1;
  P.diningTable(f.at(tx, 0, tz), 1.0, 1.9, 'walnut');
  for (const dz of [-0.45, 0.45]) {
    P.chair(f.at(tx - 0.78, 0, tz + dz, E));
    P.chair(f.at(tx + 0.78, 0, tz + dz, W));
  }
  P.chair(f.at(tx, 0, tz - 1.25, S));
  P.chair(f.at(tx, 0, tz + 1.25, N));
  P.plant(f.at(x2 - 0.43, 0, z2 - 0.45));
}

function kitchen(f: Frame): void {
  const [x1, z1, x2, z2] = bounds('g-cuisine');
  const wallZ = z2 - IN; // south wall line (inside face + clearance)
  // South run: fridge east of the pantry door, then the sink counter under the window.
  // (The west wall segment is only 0.9 m long and sits right beside the pantry door, so the
  // fridge there would block the door; the patio door reaches to Z 20 ft, so the run stops
  // ~0.7 m short of the east wall.)
  const fridgeX = x1 + 1.55; // X ≈ 25.6 ft
  P.fridge(f.at(fridgeX, 0, wallZ - 0.36, N), 0.9, 1.78, 0.72);
  P.upperCabinets(f.at(fridgeX, 0, wallZ - 0.175, N), 0.9, 1.85, 0.55, 0.35);
  const runX1 = fridgeX + 0.47;
  const runX2 = x2 - 0.91;
  const runLen = runX2 - runX1;
  const runC = (runX1 + runX2) / 2;
  const sinkX = x1 + 2.74; // under w-cuisine-s (X ≈ 29.5 ft)
  // the run faces N (yaw π), which maps world X to local −X
  const sinkL = runC - sinkX;
  const dwL = runC - (runX1 + 0.235);
  P.baseCabinets(f.at(runC, 0, wallZ - 0.3, N), runLen, 0.6, 0.9, { hole: { x: sinkL, w: 0.5, d: 0.38 }, skip: [[dwL - 0.2, dwL + 0.2]] });
  P.sink(f.at(sinkX, 0, wallZ - 0.3, N), 0.9, 0.52, 0.4);
  P.dishwasherFront(f.at(runX1 + 0.235, 0, wallZ - 0.6, N), runLen / 2, 0.9);
  // Island with a slide-in gas range under a chimney hood, breakfast overhang + stools on the
  // north (living-room) side, a fruit bowl and cookbooks on the counter.
  const ix = x1 + 1.7; // X ≈ 26.1 ft: ≥ 1.15 m walkway between the island's east end and the patio-door wall
  const iz = z1 + 0.34 + 0.425; // Z ≈ 14.4 ft
  const islandF = f.at(ix, 0, iz, S);
  // The range bay is at the WEST end (local x −1.09…−0.33; doors fill the rest): the patio-door
  // viewpoint stands 1.65 m inside the door, beside the island's east half, so a hood over the
  // east end would hang at eye level right next to the camera and fill the frame.
  const rangeX = -0.71;
  P.baseCabinets(islandF, 2.2, 0.85, 0.9, { mat: 'cabinet', overhang: 0.3, drawers: true, doorSpan: [-0.32, 1.1], hole: { x: rangeX, w: 0.77, d: 0.68, z: 0.12 } });
  P.rangeSlideIn(islandF.at(rangeX, 0, 0.12), 0.65);
  const ceil = LEVEL_BY_ID.ground.ceilingHeight;
  P.rangeHood(islandF.at(rangeX, 0, 0.1), 1.65, ceil);
  P.fruitBowl(islandF.at(0.55, 0.9, -0.3));
  P.bookStack(islandF, [0.05, 0.9, -0.42], 3, 0.12);
  for (const dx of [-0.7, 0, 0.7]) P.stool(f.at(ix + dx, 0, iz - 0.425 - 0.22));
}

function pantry(f: Frame): void {
  const [, z1, x2, z2] = bounds('g-garde-manger');
  P.jarShelves(f.at(x2 - IN - 0.125, 0, (z1 + z2) / 2, W), 1.7, 2.0, 0.25, 5);
}

function mudroom(f: Frame): void {
  const [x1, z1, x2, z2] = bounds('g-entree-garage');
  const cz = (z1 + z2) / 2;
  P.bench(f.at(x2 - IN - 0.13, 0, cz, W), 0.9, 0.26, 0.45, 'lightOak', true);
  P.coatHooks(f.at(x2 - IN - 0.02, 0, cz, W), 0.9, 1.6);
  P.plainRug(f.at((x1 + x2) / 2, 0, z2 - 0.4), 0.75, 0.45, 'rugCharcoal');
}

function vestibule(f: Frame): void {
  const [x1, z1, x2, z2] = bounds('g-vestibule');
  const cx = x2 - 1.1;
  P.consoleTable(f.at(cx, 0, z1 + IN + 0.15, S), 0.8, 0.3);
  P.mirror(f.at(cx, 0, z1 + INT_FACE + 0.002, S), 0.6, 0.8, 1.5, 'brass');
  P.plainRug(f.at(x1 + EXT_FACE + 0.55, 0, (z1 + z2) / 2), 1.0, 0.65, 'rugCharcoal');
}

function coatRoom(f: Frame): void {
  const [x1, z1, x2, z2] = bounds('g-vestiaire');
  const cz = (z1 + z2) / 2 + 0.03;
  P.hangerRod(f.at(x1 + IN + 0.3, 0, cz, E), 0.9, 1.7);
  P.bench(f.at(x2 - IN - 0.175, 0, cz, W), 0.9, 0.35, 0.45, 'lightOak', true);
  P.coatHooks(f.at(x2 - IN, 0, cz, W), 0.9, 1.6);
}

function powderRoom(f: Frame): void {
  const [x1, , x2, z2] = bounds('g-sdeau');
  P.pedestalSink(f.at(x1 + IN + 0.2, 0, 1.45, E));
  P.mirror(f.at(x1 + EXT_FACE + 0.002, 0, 1.45, E), 0.5, 0.7, 1.5);
  P.towelBar(f.at(x1 + EXT_FACE, 0, 2.15, E), 0.45, 1.0);
  P.toilet(f.at(x2 - INT_FACE - 0.32, 0, 1.6, W));
  P.plainRug(f.at((x1 + x2) / 2, 0, z2 - 0.5), 0.6, 0.4, 'rugSage');
}

function garage(f: Frame): void {
  const [x1, z1, x2, z2] = bounds('g-garage');
  // Sedan parked nose toward the garage door (X = 0 wall), centred on the door (Z ≈ 27.75 ft).
  const carZ = z1 + 5.75 * FT;
  P.car(f.at(x1 + 3.1, 0, carZ, W));
  P.metalShelving(f.at(x1 + 3.9, 0, z1 + IN + 0.2, S), 2.0, 1.9, 0.4, 4);
  P.workbench(f.at(x2 - 1.75, 0, z2 - IN - 0.3, N), 1.6, 0.6);
  // spare tyres in the NE corner
  for (let i = 0; i < 2; i++) f.cyl('tyre', 0.33, 0.33, 0.22, [x2 - 0.65, 0.11 + i * 0.22, z1 + IN + 0.35], undefined, 24);
  f.cyl('chrome', 0.19, 0.19, 0.23, [x2 - 0.65, 0.33, z1 + IN + 0.35], undefined, 16);
  cardboardBox(f, 0.5, 0.35, 0.4, [x2 - 0.65, 0.46, z1 + IN + 0.3], [0, 0.2, 0]);
}

function hall(f: Frame): void {
  const [x1, z1, x2, z2] = bounds('g-hall');
  const cx = (x1 + x2) / 2;
  P.bench(f.at(cx, 0, z2 - IN - 0.175, N), 1.3, 0.35, 0.45, 'lightOak', true);
  P.coatHooks(f.at(cx, 0, z2 - INT_FACE, N), 1.3, 1.6);
  P.plainRug(f.at(cx, 0, z1 + 1.5), 2.4, 0.8, 'rugNavy');
  P.picture(f.at(cx, 0, z1 + INT_FACE, S), 0.9, 0.6, 1.55, 'art1');
}

// =============================================================================================
// Upper floor
// =============================================================================================

function masterBedroom(f: Frame): void {
  const [x1, z1, x2, z2] = bounds('u-ch1');
  // The west wall holds the walk-in door and the corridor door, so the bed sits on the south
  // wall between the ensuite door and the south window (low headboard, below the sill).
  const bx = x1 + 2.47; // X ≈ 35 ft
  P.bed(f.at(bx, 0, z2 - IN - 1.05, N), { w: 1.55, l: 2.1, headH: 0.75, frame: 'walnut', duvet: 'linenWhite', throw: 'velvetNavy', headboard: 'fabricGrey' });
  P.nightstand(f.at(bx - 0.975, 0, z2 - IN - 0.2, N), 'walnut', 0.4);
  P.nightstand(f.at(bx + 1.0, 0, z2 - IN - 0.2, N), 'walnut', 0.4);
  P.rug(f.at(bx, 0, 1.45), 2.2, 1.6, 'rugNavy');
  P.picture(f.at(bx - 0.05, 0, z2 - EXT_FACE, N), 0.6, 0.45, 1.35, 'art3', 'walnut');
  P.dresser(f.at(x1 + 1.57, 0, z1 + IN + 0.25, S), 1.1, 0.85, 0.5, 'paintWhite', 3);
  P.mirror(f.at(x1 + 1.57, 0, z1 + EXT_FACE + 0.002, S), 0.7, 0.8, 1.45, 'brass');
  P.armchair(f.at(x2 - 0.85, 0, z1 + 0.85, -Math.PI / 4), 'velvetForest');
  P.plant(f.at(x2 - 0.45, 0, z2 - 0.45), true);
}

function masterWalkIn(f: Frame): void {
  const [x1, z1, x2, z2] = bounds('u-walkin1');
  const cz = (z1 + z2) / 2;
  P.hangerRod(f.at(x1 + IN + 0.3, 0, cz, E), 2.2, 1.7);
  P.shelfUnit(f.at(x1 + IN + 0.15, 0, cz, E), 2.2, 0.5, 0.3, 2, 'paintWhite');
  // east wall: rods either side of the door (door at Z 3.75–6.25 ft)
  P.hangerRod(f.at(x2 - IN - 0.3, 0, z1 + 0.72, W), 0.55, 1.7);
  P.hangerRod(f.at(x2 - IN - 0.3, 0, z2 - 0.48, W), 0.5, 1.7);
}

function ensuite(f: Frame): void {
  const [x1, z1, x2, z2] = bounds('u-sdb1');
  P.vanity(f.at(x1 + 1.05, 0, z1 + IN + 0.275, S), 1.8, 2, 0.55, 0.86, 'cabinet');
  P.mirror(f.at(x1 + 1.05, 0, z1 + INT_FACE + 0.002, S), 1.6, 0.8, 1.5);
  P.tub(f.at(x2 - 0.72, 0, z2 - 0.985, E), 1.55, 0.72);
  P.showerStall(f.at(x1 + IN + 0.5, 0, z2 - IN - 0.5, N), 1.0, 1.0, 2.0, -1);
  P.toilet(f.at(x1 + 1.65, 0, z2 - EXT_FACE - 0.32, N));
  P.towelBar(f.at(x1 + 2.3, 0, z2 - EXT_FACE, N), 0.6, 1.15);
  P.plainRug(f.at(x1 + 2.4, 0, z2 - 0.95), 0.8, 0.5, 'rugSage');
}

function upperHall(f: Frame): void {
  const [x1, z1, x2, z2] = bounds('u-corridor');
  P.plainRug(f.at(x1 + 3.4, 0, (z1 + z2) / 2 + 0.0, S), 3.6, 0.7, 'rugNavy');
  P.bench(f.at(x2 - 1.45, 0, z1 + IN + 0.125, S), 0.8, 0.25, 0.45, 'walnut');
  P.picture(f.at(x2 - 1.45, 0, z1 + INT_FACE, S), 0.6, 0.45, 1.5, 'art2');
  const [cx1, cz1, cx2, cz2] = bounds('u-corridor2');
  P.plainRug(f.at((cx1 + cx2) / 2, 0, (cz1 + cz2) / 2), 0.55, 3.0, 'rugNavy');
}

function laundry(f: Frame): void {
  const [x1, z1, x2, z2] = bounds('u-lingerie');
  const cz = (z1 + z2) / 2 + 0.18;
  // the door is in the middle of the north wall, so the machines flank it on the side walls
  P.appliance(f.at(x1 + IN + 0.3, 0, cz, E), 'washer');
  P.appliance(f.at(x2 - IN - 0.3, 0, cz, W), 'dryer');
  const cx = (x1 + x2) / 2;
  P.baseCabinets(f.at(cx, 0, z2 - IN - 0.2, N), 0.76, 0.4, 0.9);
  P.wallShelf(f.at(cx, 0, z2 - INT_FACE, N), 0.76, 1.45, 0.3);
  P.wallShelf(f.at(cx, 0, z2 - INT_FACE, N), 0.76, 1.85, 0.3);
  const stacks = ['towel', 'fabricSage', 'linenWhite'] as const;
  stacks.forEach((k, i) => {
    const y = 1.46 + (i % 2) * 0.4;
    f.rbox(k, 0.3, 0.07, 0.26, 0.02, [cx - 0.2 + i * 0.2, y + 0.035, z2 - INT_FACE - 0.15], { seg: 2 });
    f.rbox(stacks[(i + 1) % 3], 0.28, 0.06, 0.25, 0.02, [cx - 0.2 + i * 0.2, y + 0.1, z2 - INT_FACE - 0.15], { seg: 2 });
  });
  // laundry hamper + detergent on the folding counter
  f.lathe('fabricCream', [[0, 0], [0.18, 0], [0.2, 0.45], [0.21, 0.47], [0.19, 0.47], [0.17, 0.44], [0.16, 0.03], [0, 0.02]], [x1 + IN + 0.3, 0, z1 + 0.42], 18);
  f.rbox('fabricNavy', 0.14, 0.26, 0.09, 0.01, [cx + 0.2, 0.9 + 0.13, z2 - IN - 0.25], { seg: 1 });
}

function bedroom2(f: Frame): void {
  const [x1, , x2, z2] = bounds('u-ch2');
  // Headboard on the south wall east of the walk-in door (the north wall is the laundry wall
  // and the bedroom door opens on the west wall).
  const bx = x2 - 1.37;
  P.bed(f.at(bx, 0, z2 - IN - 1.0, N), { w: 1.4, l: 2.0, frame: 'oak', duvet: 'fabricSage', throw: 'velvetRust', headboard: 'fabricCream' });
  P.nightstand(f.at(bx - 0.95, 0, z2 - IN - 0.2, N), 'oak', 0.4);
  P.nightstand(f.at(bx + 0.95, 0, z2 - IN - 0.2, N), 'oak', 0.4);
  P.dresser(f.at(x1 + IN + 0.25, 0, z2 - 1.69, E), 1.0, 0.85, 0.5, 'paintWhite', 3);
  P.rug(f.at(bx, 0, z2 - 2.0), 2.0, 1.4, 'rugRust');
  P.picture(f.at(bx, 0, z2 - INT_FACE, N), 0.9, 0.55, 1.55, 'art1');
}

function walkIn2(f: Frame): void {
  const [x1, , x2, z2] = bounds('u-walkin2');
  const cx = (x1 + x2) / 2 - 0.02;
  P.hangerRod(f.at(cx, 0, z2 - EXT_FACE - 0.25, N), 3.3, 1.6, false);
  P.shelfUnit(f.at(cx, 0, z2 - EXT_FACE - 0.2, N), 3.3, 0.45, 0.28, 2, 'paintWhite');
  P.wallShelf(f.at(x2 - 0.82, 0, z2 - EXT_FACE, N), 1.2, 1.95, 0.3);
}

function linenCloset(f: Frame): void {
  const [x1, , x2, z2] = bounds('u-placard');
  P.linenStack(f.at((x1 + x2) / 2, 0, z2 - EXT_FACE - 0.18, N), 0.55, 5, 2.0);
}

function bedroom3(f: Frame): void {
  const [x1, z1, x2, z2] = bounds('u-ch3');
  const bx = x1 + 1.25;
  P.bed(f.at(bx, 0, z1 + IN + 1.0, S), { w: 1.4, l: 2.0, frame: 'paintWhite', duvet: 'fabricCream', throw: 'velvetRust', headboard: 'velvetBlush' });
  P.nightstand(f.at(x1 + IN + 0.175, 0, z1 + IN + 0.25, S), 'paintWhite', 0.35);
  P.picture(f.at(bx, 0, z1 + INT_FACE, S), 0.8, 0.5, 1.6, 'art2');
  P.desk(f.at(x2 - IN - 0.275, 0, z2 - 1.0, W), 1.1, 0.55, 'paintWhite');
  P.chair(f.at(x2 - IN - 0.85, 0, z2 - 1.0, E), '#8fa58a');
  P.rug(f.at(bx, 0, z2 - 0.85), 1.8, 1.0, 'rugCream');
  P.plant(f.at(x1 + 0.45, 0, z2 - 0.5));
}

function bedroom4(f: Frame): void {
  const [x1, z1, x2, z2] = bounds('u-ch4');
  const bx = x1 + 1.25;
  P.bed(f.at(bx, 0, z2 - IN - 1.0, N), { w: 1.4, l: 2.0, frame: 'oak', duvet: 'fabricNavy', throw: 'velvetMustard', headboard: 'fabricGrey' });
  P.nightstand(f.at(x1 + IN + 0.175, 0, z2 - IN - 0.25, N), 'oak', 0.35);
  P.nightstand(f.at(x2 - IN - 0.4, 0, z2 - IN - 0.25, N), 'oak', 0.4);
  P.wardrobe(f.at(x1 + 0.9, 0, z1 + IN + 0.3, S), 1.2, 2.0, 0.6, 'paintWhite');
  P.rug(f.at(bx, 0, z2 - 2.1), 1.8, 1.2, 'rugSage');
  P.picture(f.at(bx, 0, z2 - INT_FACE, N), 0.8, 0.5, 1.6, 'art3');
}

function familyBath(f: Frame): void {
  const [x1, z1, x2] = bounds('u-sdb2');
  P.tubShower(f.at((x1 + x2) / 2, 0, z1 + IN + 0.35, S), 1.5, 0.7);
  P.vanity(f.at(x1 + IN + 0.225, 0, 2.2, E), 0.6, 1, 0.45);
  P.mirror(f.at(x1 + EXT_FACE + 0.002, 0, 2.2, E), 0.5, 0.7, 1.5);
  P.toilet(f.at(x2 - INT_FACE - 0.31, 0, 2.15, W));
  P.towelBar(f.at(x2 - INT_FACE, 0, 1.4, W), 0.5, 1.15);
}

// =============================================================================================
// Basement
// =============================================================================================

function bedroom5(f: Frame): void {
  const [x1, , x2, z2] = bounds('b-ch5');
  const bx = x2 - 0.96;
  P.bed(f.at(bx, 0, z2 - IN - 1.0, N), { w: 1.4, l: 2.0, frame: 'walnut', duvet: 'fabricSage', throw: 'velvetCream', headboard: 'fabricCharcoal' });
  P.nightstand(f.at(bx - 0.95, 0, z2 - IN - 0.2, N), 'walnut', 0.4);
  P.wardrobe(f.at(x1 + IN + 0.3, 0, 0.75, E), 1.0, 2.0, 0.6, 'paintWhite');
  P.rug(f.at(bx, 0, z2 - 2.05), 1.6, 1.2, 'rugRust');
  P.picture(f.at(bx, 0, z2 - INT_FACE, N), 0.7, 0.45, 1.5, 'art2');
}

function bedroom6(f: Frame): void {
  const [x1, z1, x2, z2] = bounds('b-ch6');
  const bz = 1.3;
  P.bed(f.at(x1 + IN + 1.0, 0, bz, E), { w: 1.4, l: 2.0, frame: 'oak', duvet: 'fabricCream', throw: 'velvetNavy', headboard: 'fabricGrey' });
  P.nightstand(f.at(x1 + IN + 0.25, 0, z1 + IN + 0.2, E), 'oak', 0.4);
  P.wardrobe(f.at(x2 - 0.555, 0, z2 - IN - 0.3, N), 0.8, 2.0, 0.6, 'paintWhite');
  P.rug(f.at(x2 - 0.9, 0, bz), 1.4, 1.2, 'rugCream');
  P.picture(f.at(x1 + INT_FACE, 0, bz, E), 0.7, 0.45, 1.5, 'art1');
}

function familyRoom(f: Frame): void {
  const [x1, z1, x2, z2] = bounds('b-familiale');
  const ux = x1 + 2.28;
  P.tvUnit(f.at(ux, 0, z1 + IN + 0.22, S), 1.6, 'walnut');
  P.tv(f.at(ux, 0.48, z1 + IN + 0.22, S), 1.3, 0);
  P.rug(f.at(ux + 0.2, 0, z1 + 1.5), 3.0, 2.0, 'rugRust');
  // One wide sofa instead of an L-sectional: the chaise sat exactly on the viewpoint in front of w-familiale-e.
  P.sofa(f.at(ux, 0, z2 - 0.8, N), 2.8, 3, 'fabricGrey', 0.95, ['velvetNavy', 'velvetMustard']);
  P.coffeeTable(f.at(ux - 0.2, 0, z1 + 1.25), 1.0, 0.5, 'walnut');
  P.floorLamp(f.at(x2 - IN - 0.3, 0, z2 - IN - 0.2));
  P.bookshelf(f.at(x2 - 0.55, 0, z1 + IN + 0.15, S), 0.7, 1.6, 0.3, 4);
  P.plant(f.at(x1 + 0.45, 0, z2 - 0.45));
}

function gamesRoom(f: Frame): void {
  const [x1, z1, , z2] = bounds('b-jeux');
  P.pingPongTable(f.at(x1 + 2.21, 0, (z1 + z2) / 2, E));
  P.beanBag(f.at(x1 + 0.6, 0, z1 + 0.6), 'velvetMustard');
  P.beanBag(f.at(x1 + 0.7, 0, z1 + 1.35), 'velvetNavy');
  P.bookshelf(f.at(x1 + 0.75, 0, z2 - IN - 0.15, N), 0.9, 1.8, 0.3, 4);
  P.picture(f.at(x1 + 2.3, 0, z1 + INT_FACE, S), 0.5, 0.5, 1.6, 'art3');
}

function bathroom3(f: Frame): void {
  const [x1, z1, x2, z2] = bounds('b-sdb3');
  P.showerStall(f.at(x2 - EXT_FACE - 0.45, 0, z1 + EXT_FACE + 0.45, S), 0.9, 0.9, 2.0, -1);
  P.toilet(f.at(x2 - INT_FACE - 0.31, 0, 2.45, W));
  P.vanity(f.at(x1 + EXT_FACE + 0.21, 0, 2.27, E), 0.6, 1, 0.42);
  P.mirror(f.at(x1 + EXT_FACE + 0.002, 0, 2.27, E), 0.5, 0.7, 1.5);
  P.towelBar(f.at(x1 + EXT_FACE, 0, 1.55, E), 0.45, 1.1);
  P.plainRug(f.at((x1 + x2) / 2 + 0.05, 0, z2 - 0.55), 0.6, 0.4, 'rugSage');
}

function mechanical(f: Frame): void {
  const [x1, z1, , z2] = bounds('b-mecanique');
  const ceil = LEVEL_BY_ID.basement.ceilingHeight;
  P.furnace(f.at(x1 + 0.6, 0, z1 + 0.55, S), ceil);
  // the bathroom opens into this room: keep the strip between its door and the east door clear
  P.waterHeater(f.at(x1 + 1.9, 0, z2 - 0.6));
  P.electricalPanel(f.at(x1 + 0.75, 0, z2 - EXT_FACE, N));
}

function coldRoom(f: Frame): void {
  const [x1, z1, , z2] = bounds('b-froide');
  P.jarShelves(f.at(x1 + EXT_FACE + 0.16, 0, (z1 + z2) / 2, E), 2.5, 1.9, 0.3, 4);
  P.jarShelves(f.at(x1 + 1.07, 0, z1 + EXT_FACE + 0.16, S), 1.2, 1.9, 0.3, 4);
  cardboardBox(f, 0.4, 0.3, 0.35, [x1 + 1.4, 0, z2 - 0.5]);
  cardboardBox(f, 0.34, 0.26, 0.3, [x1 + 1.4, 0.3, z2 - 0.52], [0, 0.15, 0]);
}

function storage(f: Frame): void {
  const [x1, , x2, z2] = bounds('b-rangement');
  P.metalShelving(f.at(x2 - EXT_FACE - 0.22, 0, z2 - 1.26, W), 2.2, 1.9, 0.44, 4);
  cardboardBox(f, 0.45, 0.35, 0.4, [x1 + 0.45, 0, z2 - 0.45]);
  cardboardBox(f, 0.4, 0.3, 0.35, [x1 + 0.45, 0.35, z2 - 0.45], [0, -0.2, 0]);
}

function basementHall(f: Frame): void {
  const [x1, z1, x2] = bounds('b-corridor');
  P.consoleTable(f.at((x1 + x2) / 2, 0, z1 + EXT_FACE + 0.16, S), 0.8, 0.3);
  P.picture(f.at((x1 + x2) / 2, 0, z1 + EXT_FACE, S), 0.6, 0.45, 1.5, 'art2');
}

// =============================================================================================

const LAYOUT: Record<LevelId, ((f: Frame) => void)[]> = {
  ground: [salon, diningRoom, kitchen, pantry, mudroom, vestibule, coatRoom, powderRoom, garage, hall],
  upper: [masterBedroom, masterWalkIn, ensuite, upperHall, laundry, bedroom2, walkIn2, linenCloset, bedroom3, bedroom4, familyBath],
  basement: [bedroom5, bedroom6, familyRoom, gamesRoom, bathroom3, mechanical, coldRoom, storage, basementHall],
};

/** Builds every prop of the house, merged per material + instance groups, by storey. */
export function buildFurniture(): Record<LevelId, BuiltLevel> {
  const out = {} as Record<LevelId, BuiltLevel>;
  for (const id of LEVEL_ORDER) {
    const set = new PartSet();
    const root = new Frame(set, new THREE.Matrix4().makeTranslation(0, LEVEL_BY_ID[id].floorY, 0));
    for (const place of LAYOUT[id]) place(root);
    out[id] = set.build();
  }
  return out;
}
