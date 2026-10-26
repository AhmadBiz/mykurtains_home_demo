import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { HOUSE } from '../../data/house';
import { WALL_GEOMS } from '../../data/geometry';
import type { WallGeom } from '../../data/geometry';
import type { WallDef } from '../../data/types';
import { addBox } from './bucket';
import type { BucketSet } from './bucket';
import { K } from './keys';

/**
 * Guard rails (WallDef.kind === 'railing'): an oak top rail with rounded edges, a white bottom
 * rail, square white balusters every 11 cm and a square newel post with an oak cap at each end.
 * Built in the wall's local frame (origin at `a`, +X along a→b) and merged into the level's
 * buckets, so a railing costs no extra draw calls.
 */

const TOP_W = 0.06;
const TOP_H = 0.04;
const BOTTOM_W = 0.04;
const BOTTOM_H = 0.03;
const BOTTOM_Y = 0.08;
const BALUSTER = 0.035;
const PITCH = 0.11;
const NEWEL = 0.09;
const NEWEL_ABOVE = 0.03;
const CAP = 0.13;
const CAP_H = 0.03;

/** Half thickness of the thickest wall whose body sits on the point `p` at the railing's height. */
function wallHalfThicknessAt(p: [number, number], self: WallDef): number {
  let best = 0;
  for (const o of HOUSE.walls) {
    if (o.id === self.id || o.kind === 'railing') continue;
    if (o.baseY > self.baseY + self.height - 0.01 || o.baseY + o.height < self.baseY + 0.01) continue;
    const og = WALL_GEOMS.get(o.id);
    if (!og) continue;
    const rx = p[0] - o.a[0];
    const rz = p[1] - o.a[1];
    const along = rx * og.dir[0] + rz * og.dir[1];
    const across = Math.abs(rx * og.normal[0] + rz * og.normal[1]);
    if (across <= o.thickness / 2 + 0.01 && along >= -o.thickness / 2 - 0.01 && along <= og.length + o.thickness / 2 + 0.01) best = Math.max(best, o.thickness / 2);
  }
  return best;
}

export function addRailing(set: BucketSet, w: WallDef, g: WallGeom, M: THREE.Matrix4): void {
  const h = w.height;
  const L = g.length;
  const insA = wallHalfThicknessAt(w.a, w);
  const insB = wallHalfThicknessAt(w.b, w);
  const newelA = insA + NEWEL / 2 + (insA > 0 ? 0.005 : 0);
  const newelB = L - insB - NEWEL / 2 - (insB > 0 ? 0.005 : 0);

  // oak top rail, rounded edges, running wall to wall (its ends are buried in the walls / newels)
  const rail = new RoundedBoxGeometry(L, TOP_H, TOP_W, 1, 0.009);
  set.get(K.oak).addGeometry(rail, M.clone().multiply(new THREE.Matrix4().makeTranslation(L / 2, h - TOP_H / 2, 0)), 1);
  rail.dispose();

  // white bottom rail between the newels
  const span = newelB - newelA - NEWEL;
  addBox(set, { px: '', nx: '', rest: K.trim }, { cx: (newelA + newelB) / 2, cy: BOTTOM_Y + BOTTOM_H / 2, cz: 0, sx: span, sy: BOTTOM_H, sz: BOTTOM_W }, M);

  // square balusters
  const n = Math.max(1, Math.round(span / PITCH));
  const y0 = BOTTOM_Y + BOTTOM_H;
  const y1 = h - TOP_H;
  for (let i = 1; i < n; i++) {
    const x = newelA + NEWEL / 2 + (span * i) / n;
    addBox(set, { py: '', ny: '', rest: K.trim }, { cx: x, cy: (y0 + y1) / 2, cz: 0, sx: BALUSTER, sy: y1 - y0, sz: BALUSTER }, M);
  }

  // newel posts with oak caps
  const cap = new RoundedBoxGeometry(CAP, CAP_H, CAP, 1, 0.008);
  for (const x of [newelA, newelB]) {
    const postH = h + NEWEL_ABOVE;
    addBox(set, { ny: '', rest: K.trim }, { cx: x, cy: postH / 2, cz: 0, sx: NEWEL, sy: postH, sz: NEWEL }, M);
    set.get(K.oak).addGeometry(cap, M.clone().multiply(new THREE.Matrix4().makeTranslation(x, postH + CAP_H / 2, 0)), 1);
  }
  cap.dispose();
}
