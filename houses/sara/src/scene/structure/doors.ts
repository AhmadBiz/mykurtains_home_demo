import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { HOUSE } from '../../data/house';
import { LEVEL_BY_ID, WALL_BY_ID, WALL_GEOMS, pointAlongWall, pointInLevelOutline, roomAt } from '../../data/geometry';
import type { WallGeom } from '../../data/geometry';
import type { LevelId, WallDef } from '../../data/types';
import { addBox, addQuad, frameMatrix } from './bucket';
import type { BoxKeys, BucketSet } from './bucket';
import { K } from './keys';

/**
 * Doors and cased openings. Everything is built in the wall's local frame (see walls.ts):
 *  - casing: a 5 cm flat board plus a 2 cm backband (7 cm total, 1.8 cm proud of both wall faces)
 *    around every opening, jambs butting under the head;
 *  - 'door': white two-panel leaf (rounded stiles and rails, recessed bevelled panels), brushed
 *    nickel lever + rosette on both faces, three hinge knuckles, rendered open ~95° into the room
 *    with more free space (and away from halls / garage when possible);
 *  - 'frontDoor': charcoal leaf with a tall glazed panel + two fixed glazed sidelights, a long
 *    nickel pull, open inward;
 *  - 'exteriorDoor': grey half-light leaf with a lever, open inward;
 *  - 'garage': closed sectional door — four sections separated by V-grooves, three rows of
 *    bevelled raised panels and a row of four windows in the top section — just inside the
 *    exterior face;
 *  - 'cased': casing only.
 */

const CASING_W = 0.07;
const CASING_OVERLAP = 0.03; // casing over the wall beside the opening
const CASING_IN = CASING_W - CASING_OVERLAP; // casing inside the opening
const BACKBAND = 0.02;
const PROUD = 0.018;
const PROUD_IN = 0.012;
const HEAD_FLAT = 0.05;
const LEAF_T = 0.04;
const EDGE_R = 0.004;
const GAP = 0.006;
const STILE = 0.11;
const TOP_RAIL = 0.11;
const BOTTOM_RAIL = 0.2;
const LOCK_RAIL = 0.1;
const RECESS = 0.01;
const BEVEL = 0.014;
const HANDLE_Y = 1.0;
const OPEN_ANGLE = (95 * Math.PI) / 180;
const CIRCULATION = /hall|corridor|vestibule|garage/;

type Matrix = THREE.Matrix4;

const translate = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);

// ---------------------------------------------------------------------------------------------
// Casing
// ---------------------------------------------------------------------------------------------

function addCasing(set: BucketSet, s: number, e: number, y0: number, H: number, t: number, M: Matrix): void {
  const dIn = t + 2 * PROUD_IN;
  const dOut = t + 2 * PROUD;
  const top = y0 + H - CASING_OVERLAP; // underside of the head
  const flatW = CASING_W - BACKBAND;
  const jambH = top - y0;
  // jambs: flat board (into the opening) + backband (outside), each butting under the head
  addBox(set, { ny: '', py: '', nx: '', rest: K.trim }, { cx: s - CASING_OVERLAP + BACKBAND + flatW / 2, cy: y0 + jambH / 2, cz: 0, sx: flatW, sy: jambH, sz: dIn }, M);
  addBox(set, { ny: '', py: '', px: '', rest: K.trim }, { cx: e + CASING_OVERLAP - BACKBAND - flatW / 2, cy: y0 + jambH / 2, cz: 0, sx: flatW, sy: jambH, sz: dIn }, M);
  const bbH = jambH + HEAD_FLAT;
  addBox(set, { ny: '', py: '', px: '', rest: K.trim }, { cx: s - CASING_OVERLAP + BACKBAND / 2, cy: y0 + bbH / 2, cz: 0, sx: BACKBAND, sy: bbH, sz: dOut }, M);
  addBox(set, { ny: '', py: '', nx: '', rest: K.trim }, { cx: e + CASING_OVERLAP - BACKBAND / 2, cy: y0 + bbH / 2, cz: 0, sx: BACKBAND, sy: bbH, sz: dOut }, M);
  // head: flat board between the jamb backbands, backband across the full width on top
  const headW = e - s + 2 * CASING_OVERLAP - 2 * BACKBAND;
  addBox(set, { py: '', px: '', nx: '', rest: K.trim }, { cx: (s + e) / 2, cy: top + HEAD_FLAT / 2, cz: 0, sx: headW, sy: HEAD_FLAT, sz: dIn }, M);
  addBox(set, K.trim, { cx: (s + e) / 2, cy: top + HEAD_FLAT + BACKBAND / 2, cz: 0, sx: e - s + 2 * CASING_OVERLAP, sy: BACKBAND, sz: dOut }, M);
}

// ---------------------------------------------------------------------------------------------
// Leaves
// ---------------------------------------------------------------------------------------------

/**
 * Frame of an open leaf: origin at the hinge (bottom), local +X from the hinge to the free edge.
 * `dirSign` is the closed leaf's direction along the wall (+1 = toward b), `sigma` the swing side (local ±Z).
 */
function leafMatrix(M: Matrix, hingeX: number, y0: number, hingeZ: number, dirSign: 1 | -1, sigma: 1 | -1): Matrix {
  const phi = Math.atan2(-sigma * Math.sin(OPEN_ANGLE), dirSign * Math.cos(OPEN_ANGLE));
  return M.clone().multiply(new THREE.Matrix4().makeRotationY(phi).setPosition(hingeX, y0 + GAP, hingeZ));
}

/** A leaf member (stile / rail) with 4 mm rounded edges, centred at (cx, cy) in the leaf frame. */
function addMember(set: BucketSet, key: string, w: number, h: number, th: number, cx: number, cy: number, M: Matrix): void {
  const g = new RoundedBoxGeometry(w, h, th, 1, EDGE_R);
  set.get(key).addGeometry(g, M.clone().multiply(translate(cx, cy, 0)));
  g.dispose();
}

/** Lever handle on a rosette, both faces of a leaf; `th` is the leaf thickness. */
function addLever(set: BucketSet, x: number, y: number, th: number, M: Matrix): void {
  const rose = new THREE.CylinderGeometry(0.026, 0.026, 0.007, 16).rotateX(Math.PI / 2);
  const neck = new THREE.CylinderGeometry(0.009, 0.009, 0.03, 8).rotateX(Math.PI / 2);
  const lever = new THREE.CapsuleGeometry(0.0085, 0.1, 2, 8).rotateZ(Math.PI / 2);
  const b = set.get(K.handle);
  for (const side of [-1, 1] as const) {
    const z0 = side * (th / 2);
    b.addGeometry(rose, M.clone().multiply(translate(x, y, z0 + side * 0.0035)));
    b.addGeometry(neck, M.clone().multiply(translate(x, y, z0 + side * 0.022)));
    b.addGeometry(lever, M.clone().multiply(translate(x - 0.05, y, z0 + side * 0.0405)));
  }
  rose.dispose();
  neck.dispose();
  lever.dispose();
}

/** Three hinge knuckles along the hinge edge of a leaf. */
function addHinges(set: BucketSet, lh: number, M: Matrix): void {
  const cyl = new THREE.CylinderGeometry(0.0065, 0.0065, 0.09, 8);
  const b = set.get(K.handle);
  for (const y of [0.25, lh / 2, lh - 0.25]) b.addGeometry(cyl, M.clone().multiply(translate(-0.002, y, 0)));
  cyl.dispose();
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A panel recessed 1 cm into both faces, with a bevelled frame sloping down to it. */
function addRecessedPanel(set: BucketSet, key: string, x0: number, x1: number, y0: number, y1: number, M: Matrix): void {
  addBox(set, { pz: key, nz: key, rest: '' }, { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, cz: 0, sx: x1 - x0, sy: y1 - y0, sz: LEAF_T - 2 * RECESS }, M);
  const b = BEVEL;
  for (const f of [1, -1] as const) {
    const zo = f * (LEAF_T / 2);
    const zi = f * (LEAF_T / 2 - RECESS);
    addQuad(set, key, [v(x0, y0, zo), v(x0, y1, zo), v(x0 + b, y1 - b, zi), v(x0 + b, y0 + b, zi)], v(RECESS, 0, f * b), M);
    addQuad(set, key, [v(x1, y0, zo), v(x1, y1, zo), v(x1 - b, y1 - b, zi), v(x1 - b, y0 + b, zi)], v(-RECESS, 0, f * b), M);
    addQuad(set, key, [v(x0, y0, zo), v(x1, y0, zo), v(x1 - b, y0 + b, zi), v(x0 + b, y0 + b, zi)], v(0, RECESS, f * b), M);
    addQuad(set, key, [v(x0, y1, zo), v(x1, y1, zo), v(x1 - b, y1 - b, zi), v(x0 + b, y1 - b, zi)], v(0, -RECESS, f * b), M);
  }
}

/** White two-panel interior leaf. */
function addPanelLeaf(set: BucketSet, lw: number, lh: number, M: Matrix): void {
  const key = K.doorLeaf;
  addMember(set, key, STILE, lh, LEAF_T, STILE / 2, lh / 2, M);
  addMember(set, key, STILE, lh, LEAF_T, lw - STILE / 2, lh / 2, M);
  const iw = Math.max(0.05, lw - 2 * STILE);
  addMember(set, key, iw, TOP_RAIL, LEAF_T, lw / 2, lh - TOP_RAIL / 2, M);
  addMember(set, key, iw, BOTTOM_RAIL, LEAF_T, lw / 2, BOTTOM_RAIL / 2, M);
  const mid = BOTTOM_RAIL + (lh - TOP_RAIL - BOTTOM_RAIL) * 0.5;
  addMember(set, key, iw, LOCK_RAIL, LEAF_T, lw / 2, mid, M);
  addRecessedPanel(set, key, STILE, lw - STILE, BOTTOM_RAIL, mid - LOCK_RAIL / 2, M);
  addRecessedPanel(set, key, STILE, lw - STILE, mid + LOCK_RAIL / 2, lh - TOP_RAIL, M);
  addLever(set, lw - 0.07, HANDLE_Y, LEAF_T, M);
  addHinges(set, lh, M);
}

interface Hole {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** A leaf made of two stiles + two rails (rounded edges) around a glazed hole. */
function addGlazedLeaf(set: BucketSet, key: string, lw: number, lh: number, th: number, hole: Hole, M: Matrix): void {
  addMember(set, key, hole.x0, lh, th, hole.x0 / 2, lh / 2, M);
  addMember(set, key, lw - hole.x1, lh, th, (hole.x1 + lw) / 2, lh / 2, M);
  const iw = hole.x1 - hole.x0;
  addMember(set, key, iw, hole.y0, th, (hole.x0 + hole.x1) / 2, hole.y0 / 2, M);
  addMember(set, key, iw, lh - hole.y1, th, (hole.x0 + hole.x1) / 2, (hole.y1 + lh) / 2, M);
  addBox(set, { pz: K.glass, nz: K.glass, rest: '' }, { cx: (hole.x0 + hole.x1) / 2, cy: (hole.y0 + hole.y1) / 2, cz: 0, sx: iw, sy: hole.y1 - hole.y0, sz: 0.008 }, M);
  addHinges(set, lh, M);
}

/** Fixed glazed sidelight in the wall frame between local x0 and x1. */
function addSidelight(set: BucketSet, x0: number, x1: number, y0: number, H: number, M: Matrix): void {
  const fw = 0.045;
  const th = 0.05;
  const kick = 0.2;
  const head = 0.08;
  addBox(set, { ny: '', rest: K.doorDark }, { cx: x0 + fw / 2, cy: y0 + H / 2, cz: 0, sx: fw, sy: H, sz: th }, M);
  addBox(set, { ny: '', rest: K.doorDark }, { cx: x1 - fw / 2, cy: y0 + H / 2, cz: 0, sx: fw, sy: H, sz: th }, M);
  addBox(set, { ny: '', px: '', nx: '', rest: K.doorDark }, { cx: (x0 + x1) / 2, cy: y0 + kick / 2, cz: 0, sx: x1 - x0 - 2 * fw, sy: kick, sz: th }, M);
  addBox(set, { px: '', nx: '', rest: K.doorDark }, { cx: (x0 + x1) / 2, cy: y0 + H - head / 2, cz: 0, sx: x1 - x0 - 2 * fw, sy: head, sz: th }, M);
  addBox(set, { pz: K.glass, nz: K.glass, rest: '' }, { cx: (x0 + x1) / 2, cy: y0 + (kick + H - head) / 2, cz: 0, sx: x1 - x0 - 2 * fw, sy: H - head - kick, sz: 0.008 }, M);
}

/** Which side (local ±Z) an interior door should swing to: the room with more free depth, away from circulation. */
function swingSide(wall: WallDef, g: WallGeom, px: number, pz: number): 1 | -1 {
  const [nx, nz] = g.normal;
  const score = (sigma: number): number => {
    const room = roomAt(wall.level, px + sigma * nx * 0.3, pz + sigma * nz * 0.3);
    if (!room) return 0;
    const [x1, z1, x2, z2] = room.bounds;
    let far = 0;
    for (const [cx, cz] of [
      [x1, z1],
      [x2, z1],
      [x2, z2],
      [x1, z2],
    ]) {
      far = Math.max(far, (cx - px) * sigma * nx + (cz - pz) * sigma * nz);
    }
    return Math.min(far, 1.5) - (CIRCULATION.test(room.id) ? 0.5 : 0);
  };
  return score(1) >= score(-1) ? 1 : -1;
}

// ---------------------------------------------------------------------------------------------
// Garage door
// ---------------------------------------------------------------------------------------------

const GD_T = 0.04; // section thickness
const GD_INSET = 0.07; // door face behind the exterior wall face
const GD_GROOVE_W = 0.008; // V-groove at every section joint: width × depth
const GD_GROOVE_D = 0.006;
const GD_PANEL_PROUD = 0.012; // raised panel: flat face proud of the section...
const GD_PANEL_BEVEL = 0.02; // ...over a 20 mm (≈ 30°) bevelled frame
const GD_PANEL_SHADOW = 0.008; // dark shadow line around the panel base
const GD_SHADOW_PROUD = 0.0015;
const GD_WINDOW_PROUD = 0.01;
const GD_FRAME = 0.03; // window frame width and depth

/**
 * Closed sectional door just inside the exterior face: four 4 cm sections separated by dark
 * 8 × 6 mm V-grooves (so the joints read from the street), three rows of four raised panels —
 * a 12 mm proud bevelled frame (ExtrudeGeometry chamfer) standing on an 8 mm shadow line — and a
 * row of four windows in the top section, their dark frames 1 cm proud.
 */
function addGarageDoor(set: BucketSet, s: number, e: number, y0: number, H: number, t: number, outside: 1 | -1, M: Matrix): void {
  const zc = outside * (t / 2 - GD_INSET);
  const face = zc + outside * (GD_T / 2);
  const W = e - s - 2 * CASING_IN;
  const x0 = s + CASING_IN;
  const cx = (s + e) / 2;
  const sections = 4;
  const sh = (H - CASING_OVERLAP) / sections;
  const panelW = W / 4 - 0.12;
  const panelH = sh - 0.12;
  const gw = GD_GROOVE_W;
  const outN = v(0, 0, outside);

  // Raised panel: the shape is the flat top; the single bevel segment widens it to panelW × panelH
  // at its base (z = 0), the second bevel + body end up buried in the section. three puts the
  // shape cap at z = -bevelThickness, so for a +Z-facing door the geometry is turned around.
  const hx = panelW / 2 - GD_PANEL_BEVEL;
  const hy = panelH / 2 - GD_PANEL_BEVEL;
  const shape = new THREE.Shape([new THREE.Vector2(-hx, -hy), new THREE.Vector2(hx, -hy), new THREE.Vector2(hx, hy), new THREE.Vector2(-hx, hy)]);
  const panel = new THREE.ExtrudeGeometry(shape, { depth: 0.002, bevelEnabled: true, bevelThickness: GD_PANEL_PROUD, bevelSize: GD_PANEL_BEVEL, bevelSegments: 1, curveSegments: 1 });
  if (outside > 0) panel.rotateY(Math.PI);
  const zBase = face + outside * GD_SHADOW_PROUD;
  const innerKeys: BoxKeys = outside > 0 ? { nz: K.garage, rest: '' } : { pz: K.garage, rest: '' };

  for (let i = 0; i < sections; i++) {
    const first = i === 0;
    const last = i === sections - 1;
    const yb = y0 + i * sh + (first ? 0 : gw / 2);
    const yt = y0 + (i + 1) * sh - (last ? 0 : gw / 2);
    const cy = (yb + yt) / 2;
    addBox(set, { py: last ? K.garage : '', ny: first ? K.garage : '', rest: K.garage }, { cx, cy, cz: zc, sx: W, sy: yt - yb, sz: GD_T }, M);
    for (let j = 0; j < 4; j++) {
      const px = x0 + (j + 0.5) * (W / 4);
      if (!last) {
        // shadow line: a dark ring on the section face around the panel base
        const ox = panelW / 2 + GD_PANEL_SHADOW;
        const oy = panelH / 2 + GD_PANEL_SHADOW;
        const ix = panelW / 2;
        const iy = panelH / 2;
        addQuad(set, K.doorDark, [v(px - ox, cy - oy, zBase), v(px + ox, cy - oy, zBase), v(px + ox, cy - iy, zBase), v(px - ox, cy - iy, zBase)], outN, M);
        addQuad(set, K.doorDark, [v(px - ox, cy + iy, zBase), v(px + ox, cy + iy, zBase), v(px + ox, cy + oy, zBase), v(px - ox, cy + oy, zBase)], outN, M);
        addQuad(set, K.doorDark, [v(px - ox, cy - iy, zBase), v(px - ix, cy - iy, zBase), v(px - ix, cy + iy, zBase), v(px - ox, cy + iy, zBase)], outN, M);
        addQuad(set, K.doorDark, [v(px + ix, cy - iy, zBase), v(px + ox, cy - iy, zBase), v(px + ox, cy + iy, zBase), v(px + ix, cy + iy, zBase)], outN, M);
        set.get(K.garage).addGeometry(panel, M.clone().multiply(translate(px, cy, zBase)));
      } else {
        // window row: dark frame ring 1 cm proud of the section + glass behind it
        const ww = panelW;
        const wh = sh - 0.14;
        const fr = GD_FRAME;
        const zf = face + outside * (GD_WINDOW_PROUD - GD_FRAME / 2);
        addBox(set, K.doorDark, { cx: px, cy: cy + wh / 2 - fr / 2, cz: zf, sx: ww, sy: fr, sz: GD_FRAME }, M);
        addBox(set, K.doorDark, { cx: px, cy: cy - wh / 2 + fr / 2, cz: zf, sx: ww, sy: fr, sz: GD_FRAME }, M);
        addBox(set, K.doorDark, { cx: px - ww / 2 + fr / 2, cy, cz: zf, sx: fr, sy: wh - 2 * fr, sz: GD_FRAME }, M);
        addBox(set, K.doorDark, { cx: px + ww / 2 - fr / 2, cy, cz: zf, sx: fr, sy: wh - 2 * fr, sz: GD_FRAME }, M);
        addBox(set, { pz: K.glass, nz: K.glass, rest: '' }, { cx: px, cy, cz: face + outside * 0.004, sx: ww - 2 * fr, sy: wh - 2 * fr, sz: 0.006 }, M);
      }
    }
    if (!last) {
      // V-groove at the joint with the section above: a filler closes the slit from inside the
      // garage, the two dark slopes meet 6 mm behind the face
      const yj = y0 + (i + 1) * sh;
      const za = face - outside * GD_GROOVE_D;
      addBox(set, innerKeys, { cx, cy: yj, cz: zc - outside * (GD_GROOVE_D / 2), sx: W, sy: gw, sz: GD_T - GD_GROOVE_D }, M);
      addQuad(set, K.doorDark, [v(x0, yj + gw / 2, face), v(x0 + W, yj + gw / 2, face), v(x0 + W, yj, za), v(x0, yj, za)], v(0, -gw / 2, outside * GD_GROOVE_D), M);
      addQuad(set, K.doorDark, [v(x0, yj - gw / 2, face), v(x0 + W, yj - gw / 2, face), v(x0 + W, yj, za), v(x0, yj, za)], v(0, gw / 2, outside * GD_GROOVE_D), M);
    }
  }
  panel.dispose();
}

// ---------------------------------------------------------------------------------------------

/** Appends every door / cased opening to the per-level bucket sets. */
export function addDoors(sets: Record<LevelId, BucketSet>): void {
  for (const o of HOUSE.openings) {
    if (o.kind === 'window' || o.kind === 'patio') continue;
    const wall = WALL_BY_ID.get(o.wall);
    const g = wall ? WALL_GEOMS.get(wall.id) : undefined;
    if (!wall || !g) continue;
    const lvl = LEVEL_BY_ID[wall.level];
    const set = sets[wall.level];
    const M = frameMatrix(g.yaw, wall.a[0], wall.baseY, wall.a[1]);
    const y0 = lvl.floorY - wall.baseY;
    const s = o.at - o.width / 2;
    const e = o.at + o.width / 2;
    const H = o.height;
    const t = wall.thickness;
    const [px, pz] = pointAlongWall(wall, o.at);
    const inside: 1 | -1 = pointInLevelOutline(lvl, px + g.normal[0] * 0.6, pz + g.normal[1] * 0.6) ? 1 : -1;
    const hingeStart = s >= g.length - e;
    const dirSign: 1 | -1 = hingeStart ? 1 : -1;
    const lw = e - s - 2 * CASING_IN - 2 * GAP;
    const lh = H - CASING_OVERLAP - 2 * GAP;
    const hingeX = hingeStart ? s + CASING_IN + GAP : e - CASING_IN - GAP;

    addCasing(set, s, e, y0, H, t, M);

    switch (o.kind) {
      case 'cased':
        break;
      case 'door': {
        const sigma = swingSide(wall, g, px, pz);
        addPanelLeaf(set, lw, lh, leafMatrix(M, hingeX, y0, sigma * (t / 2 - 0.01), dirSign, sigma));
        break;
      }
      case 'exteriorDoor': {
        const LM = leafMatrix(M, hingeX, y0, inside * (t / 2 - 0.01), dirSign, inside);
        addGlazedLeaf(set, K.doorGrey, lw, lh, LEAF_T, { x0: 0.11, x1: lw - 0.11, y0: lh * 0.52, y1: lh - 0.13 }, LM);
        addLever(set, lw - 0.07, HANDLE_Y, LEAF_T, LM);
        break;
      }
      case 'frontDoor': {
        const clearS = s + CASING_IN;
        const clearE = e - CASING_IN;
        const clearH = H - CASING_OVERLAP;
        const mullion = 0.06;
        const leafW = 0.914;
        const sw = (clearE - clearS - leafW - 2 * mullion) / 2;
        const hasSidelights = sw >= 0.12;
        const leafS = hasSidelights ? clearS + sw + mullion : clearS;
        const leafE = hasSidelights ? leafS + leafW : clearE;
        if (hasSidelights) {
          addSidelight(set, clearS, clearS + sw, y0, clearH, M);
          addSidelight(set, leafE + mullion, clearE, y0, clearH, M);
          for (const mx of [leafS - mullion / 2, leafE + mullion / 2]) {
            addBox(set, { ny: '', rest: K.doorDark }, { cx: mx, cy: y0 + clearH / 2, cz: 0, sx: mullion, sy: clearH, sz: t + 0.01 }, M);
          }
        }
        const flw = leafE - leafS - 2 * GAP;
        const flh = clearH - 2 * GAP;
        const th = 0.045;
        const LM = leafMatrix(M, leafS + GAP, y0, inside * (t / 2 - 0.01), 1, inside);
        addGlazedLeaf(set, K.doorDark, flw, flh, th, { x0: 0.13, x1: flw - 0.13, y0: 0.35, y1: flh - 0.16 }, LM);
        // long pull bar on standoffs, both faces
        const bar = new THREE.CylinderGeometry(0.011, 0.011, 0.45, 10);
        const stand = new THREE.CylinderGeometry(0.008, 0.008, 0.04, 8).rotateX(Math.PI / 2);
        for (const side of [-1, 1] as const) {
          set.get(K.handle).addGeometry(bar, LM.clone().multiply(translate(flw - 0.09, 1.05, side * (th / 2 + 0.045))));
          for (const dy of [-0.17, 0.17]) set.get(K.handle).addGeometry(stand, LM.clone().multiply(translate(flw - 0.09, 1.05 + dy, side * (th / 2 + 0.02))));
        }
        bar.dispose();
        stand.dispose();
        break;
      }
      case 'garage': {
        const outside: 1 | -1 = inside > 0 ? -1 : 1;
        addGarageDoor(set, s, e, y0, H, t, outside, M);
        break;
      }
      default:
        break;
    }
  }
}
