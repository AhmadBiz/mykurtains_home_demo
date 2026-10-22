import * as THREE from 'three';
import { HOUSE } from '../../data/house';
import { LEVEL_BY_ID, WALL_BY_ID, WALL_GEOMS, pointAlongWall, pointInLevelOutline, roomAt } from '../../data/geometry';
import type { WallGeom } from '../../data/geometry';
import type { LevelId, WallDef } from '../../data/types';
import { addBox } from './bucket';
import type { BucketSet } from './bucket';
import { K } from './keys';
import { frameMatrix } from './bucket';

/**
 * Doors and cased openings. Everything is built in the wall's local frame (see walls.ts):
 *  - casing: two jambs + head, 7 cm face, 2 cm proud of both wall faces, white;
 *  - 'door': white two-panel leaf hinged on one jamb, rendered open ~95° into the room with more
 *    free space (and away from halls / garage when possible);
 *  - 'frontDoor': charcoal leaf with a tall glazed panel + two fixed glazed sidelights, open inward;
 *  - 'exteriorDoor': grey leaf with a small window, open inward;
 *  - 'garage': closed sectional door (4 raised-panel sections) just inside the exterior face;
 *  - 'cased': casing only.
 */

const CASING_W = 0.07;
const CASING_OVERLAP = 0.03; // casing over the wall beside the opening
const CASING_IN = CASING_W - CASING_OVERLAP; // casing inside the opening
const CASING_PROUD = 0.02;
const LEAF_T = 0.04;
const GAP = 0.006;
const OPEN_ANGLE = (95 * Math.PI) / 180;
const CIRCULATION = /hall|corridor|vestibule|garage/;

type Matrix = THREE.Matrix4;

function addCasing(set: BucketSet, s: number, e: number, y0: number, H: number, t: number, M: Matrix): void {
  const depth = t + 2 * CASING_PROUD;
  const jambH = H - CASING_OVERLAP;
  for (const x of [s + CASING_IN - CASING_W / 2, e - CASING_IN + CASING_W / 2]) {
    addBox(set, { ny: '', py: '', rest: K.trim }, { cx: x, cy: y0 + jambH / 2, cz: 0, sx: CASING_W, sy: jambH, sz: depth }, M);
  }
  addBox(set, K.trim, { cx: (s + e) / 2, cy: y0 + jambH + CASING_W / 2, cz: 0, sx: e - s + 2 * CASING_OVERLAP, sy: CASING_W, sz: depth }, M);
}

/**
 * Frame of an open leaf: origin at the hinge (bottom), local +X from the hinge to the free edge.
 * `dirSign` is the closed leaf's direction along the wall (+1 = toward b), `sigma` the swing side (local ±Z).
 */
function leafMatrix(M: Matrix, hingeX: number, y0: number, hingeZ: number, dirSign: 1 | -1, sigma: 1 | -1): Matrix {
  const phi = Math.atan2(-sigma * Math.sin(OPEN_ANGLE), dirSign * Math.cos(OPEN_ANGLE));
  return M.clone().multiply(new THREE.Matrix4().makeRotationY(phi).setPosition(hingeX, y0 + GAP, hingeZ));
}

function addLever(set: BucketSet, x: number, y: number, th: number, M: Matrix): void {
  for (const side of [-1, 1] as const) {
    addBox(set, K.handle, { cx: x, cy: y, cz: side * (th / 2 + 0.008), sx: 0.055, sy: 0.055, sz: 0.016 }, M);
    addBox(set, K.handle, { cx: x - 0.05, cy: y, cz: side * (th / 2 + 0.03), sx: 0.13, sy: 0.018, sz: 0.018 }, M);
  }
}

function addPanelLeaf(set: BucketSet, lw: number, lh: number, M: Matrix): void {
  addBox(set, K.doorLeaf, { cx: lw / 2, cy: lh / 2, cz: 0, sx: lw, sy: lh, sz: LEAF_T }, M);
  const pw = Math.max(0.1, lw - 0.22);
  for (const [py0, py1] of [
    [0.14, lh * 0.44],
    [lh * 0.52, lh - 0.14],
  ]) {
    addBox(set, K.doorLeaf, { cx: lw / 2, cy: (py0 + py1) / 2, cz: 0, sx: pw, sy: py1 - py0, sz: LEAF_T + 0.012 }, M);
  }
  addLever(set, lw - 0.08, 1.0, LEAF_T, M);
}

interface Hole {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** A leaf made of two stiles + two rails around a glazed hole. */
function addGlazedLeaf(set: BucketSet, key: string, lw: number, lh: number, th: number, hole: Hole, M: Matrix): void {
  addBox(set, key, { cx: hole.x0 / 2, cy: lh / 2, cz: 0, sx: hole.x0, sy: lh, sz: th }, M);
  addBox(set, key, { cx: (hole.x1 + lw) / 2, cy: lh / 2, cz: 0, sx: lw - hole.x1, sy: lh, sz: th }, M);
  addBox(set, key, { cx: (hole.x0 + hole.x1) / 2, cy: hole.y0 / 2, cz: 0, sx: hole.x1 - hole.x0, sy: hole.y0, sz: th }, M);
  addBox(set, key, { cx: (hole.x0 + hole.x1) / 2, cy: (hole.y1 + lh) / 2, cz: 0, sx: hole.x1 - hole.x0, sy: lh - hole.y1, sz: th }, M);
  addBox(set, K.glass, { cx: (hole.x0 + hole.x1) / 2, cy: (hole.y0 + hole.y1) / 2, cz: 0, sx: hole.x1 - hole.x0, sy: hole.y1 - hole.y0, sz: 0.008 }, M);
}

/** Fixed glazed sidelight in the wall frame between local x0 and x1. */
function addSidelight(set: BucketSet, x0: number, x1: number, y0: number, H: number, M: Matrix): void {
  const fw = 0.045;
  const th = 0.05;
  const kick = 0.2;
  const head = 0.08;
  addBox(set, K.doorDark, { cx: x0 + fw / 2, cy: y0 + H / 2, cz: 0, sx: fw, sy: H, sz: th }, M);
  addBox(set, K.doorDark, { cx: x1 - fw / 2, cy: y0 + H / 2, cz: 0, sx: fw, sy: H, sz: th }, M);
  addBox(set, K.doorDark, { cx: (x0 + x1) / 2, cy: y0 + kick / 2, cz: 0, sx: x1 - x0 - 2 * fw, sy: kick, sz: th }, M);
  addBox(set, K.doorDark, { cx: (x0 + x1) / 2, cy: y0 + H - head / 2, cz: 0, sx: x1 - x0 - 2 * fw, sy: head, sz: th }, M);
  addBox(set, K.glass, { cx: (x0 + x1) / 2, cy: y0 + (kick + H - head) / 2, cz: 0, sx: x1 - x0 - 2 * fw, sy: H - head - kick, sz: 0.008 }, M);
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
        const wx = lw / 2;
        addGlazedLeaf(set, K.doorGrey, lw, lh, LEAF_T, { x0: wx - 0.16, x1: wx + 0.16, y0: lh * 0.58, y1: Math.min(lh - 0.15, lh * 0.58 + 0.45) }, LM);
        addLever(set, lw - 0.08, 1.0, LEAF_T, LM);
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
        for (const side of [-1, 1] as const) {
          const cz = side * (th / 2 + 0.035);
          addBox(set, K.handle, { cx: flw - 0.09, cy: 1.05, cz, sx: 0.025, sy: 0.45, sz: 0.025 }, LM);
          for (const dy of [-0.18, 0.18]) addBox(set, K.handle, { cx: flw - 0.09, cy: 1.05 + dy, cz: side * (th / 2 + 0.015), sx: 0.02, sy: 0.02, sz: 0.03 }, LM);
        }
        break;
      }
      case 'garage': {
        const outside: 1 | -1 = inside > 0 ? -1 : 1;
        const zc = outside * (t / 2 - 0.07);
        const W = e - s - 2 * CASING_IN;
        const sections = 4;
        const sh = (H - CASING_OVERLAP) / sections;
        for (let i = 0; i < sections; i++) {
          const cy = y0 + (i + 0.5) * sh;
          addBox(set, K.garage, { cx: (s + e) / 2, cy, cz: zc, sx: W, sy: sh + 0.002, sz: 0.04 }, M);
          for (let j = 0; j < 3; j++) {
            addBox(set, K.garage, { cx: s + CASING_IN + (j + 0.5) * (W / 3), cy, cz: zc + outside * 0.025, sx: W / 3 - 0.12, sy: sh - 0.12, sz: 0.012 }, M);
          }
        }
        break;
      }
      default:
        break;
    }
  }
}
