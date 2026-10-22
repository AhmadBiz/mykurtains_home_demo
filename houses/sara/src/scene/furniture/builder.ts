import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MatKey } from './materials';

/**
 * Tiny geometry builder: props are authored as primitives (box / cylinder / sphere / lathe /
 * torus) in a local frame, each tagged with a material key. `PartSet.build()` merges every
 * primitive of a key into ONE BufferGeometry, so a whole storey of furniture is a few dozen
 * draw calls regardless of how many chairs, hangers or jars it holds.
 */

export interface MergedPart {
  key: MatKey;
  geometry: THREE.BufferGeometry;
}

export type Vec3 = readonly [number, number, number];
/** Euler angles (radians, XYZ order). */
export type Rot = readonly [number, number, number];

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const NO_ROT: Rot = [0, 0, 0];

export class PartSet {
  private readonly buckets = new Map<MatKey, THREE.BufferGeometry[]>();

  /** Appends `geometry` transformed by `matrix` (the input is not modified nor disposed). */
  add(key: MatKey, geometry: THREE.BufferGeometry, matrix: THREE.Matrix4): void {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    g.applyMatrix4(matrix);
    let list = this.buckets.get(key);
    if (!list) {
      list = [];
      this.buckets.set(key, list);
    }
    list.push(g);
  }

  /** One merged geometry per material key. Empties the set. */
  build(): MergedPart[] {
    const out: MergedPart[] = [];
    for (const [key, list] of this.buckets) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      out.push({ key, geometry: merged });
    }
    this.buckets.clear();
    return out;
  }
}

const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();
const tmpScale = new THREE.Vector3();

/**
 * A local coordinate frame (translation + yaw about Y, composed with its parent). Pieces are
 * authored with the origin on the floor under their centre and their FRONT toward local +Z;
 * `Frame.at()` places them. Rotating local +Z by `yaw` about Y gives world (sin yaw, 0, cos yaw).
 */
export class Frame {
  constructor(
    readonly set: PartSet,
    readonly matrix: THREE.Matrix4,
  ) {}

  /** Child frame translated by (x, y, z) and rotated by `yaw` about Y, in this frame. */
  at(x: number, y: number, z: number, yaw = 0): Frame {
    const m = new THREE.Matrix4().makeRotationY(yaw);
    m.setPosition(x, y, z);
    return new Frame(this.set, new THREE.Matrix4().multiplyMatrices(this.matrix, m));
  }

  private place(key: MatKey, geometry: THREE.BufferGeometry, pos: Vec3, rot: Rot, scale: Vec3): void {
    tmpPos.set(pos[0], pos[1], pos[2]);
    tmpQuat.setFromEuler(tmpEuler.set(rot[0], rot[1], rot[2], 'XYZ'));
    tmpScale.set(scale[0], scale[1], scale[2]);
    const m = new THREE.Matrix4().compose(tmpPos, tmpQuat, tmpScale);
    m.premultiply(this.matrix);
    this.set.add(key, geometry, m);
  }

  /** Axis-aligned box of size (w, h, d) centred at `pos`, optionally rotated. */
  box(key: MatKey, w: number, h: number, d: number, pos: Vec3, rot: Rot = NO_ROT): void {
    this.place(key, UNIT_BOX, pos, rot, [w, h, d]);
  }

  /** Cylinder with its axis along local Y (unless rotated), centred at `pos`. */
  cyl(key: MatKey, rTop: number, rBot: number, h: number, pos: Vec3, rot: Rot = NO_ROT, seg = 14): void {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
    this.place(key, g, pos, rot, [1, 1, 1]);
    g.dispose();
  }

  /** Sphere / ellipsoid (radii rx, ry, rz) centred at `pos`. */
  ellipsoid(key: MatKey, rx: number, ry: number, rz: number, pos: Vec3, seg = 10): void {
    const g = new THREE.SphereGeometry(1, seg, Math.max(6, Math.round(seg * 0.7)));
    this.place(key, g, pos, NO_ROT, [rx, ry, rz]);
    g.dispose();
  }

  sphere(key: MatKey, r: number, pos: Vec3, seg = 10): void {
    this.ellipsoid(key, r, r, r, pos, seg);
  }

  /** Lathe of a profile [[radius, y], …] (y from 0 at the base), placed with its base at `pos`. */
  lathe(key: MatKey, profile: readonly (readonly [number, number])[], pos: Vec3, seg = 16): void {
    const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
    const g = new THREE.LatheGeometry(pts, seg);
    this.place(key, g, pos, NO_ROT, [1, 1, 1]);
    g.dispose();
  }

  /** Torus (ring) lying in the local XY plane (axis along Z) unless rotated. */
  torus(key: MatKey, r: number, tube: number, pos: Vec3, rot: Rot = NO_ROT): void {
    const g = new THREE.TorusGeometry(r, tube, 6, 20);
    this.place(key, g, pos, rot, [1, 1, 1]);
    g.dispose();
  }
}
