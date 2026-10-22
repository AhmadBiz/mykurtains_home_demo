import * as THREE from 'three';

/**
 * Geometry merging helpers. Instead of one mesh per wall piece / tread / jamb (thousands of draw
 * calls), every primitive is appended to a `Bucket` keyed by material; a bucket becomes one
 * non-indexed BufferGeometry → one mesh → one draw call.
 *
 * UVs are generated from WORLD positions in metres (u,v = horizontal distance / height for
 * vertical faces, x / z for horizontal faces) so textures with `repeat = 1 / sizeInMetres`
 * tile seamlessly across adjacent pieces.
 */

export interface MergedPart {
  key: string;
  geometry: THREE.BufferGeometry;
}

const QUAD_INDEX = [0, 1, 2, 0, 2, 3];

export class Bucket {
  private readonly pos: number[] = [];
  private readonly nor: number[] = [];
  private readonly uv: number[] = [];

  get isEmpty(): boolean {
    return this.pos.length === 0;
  }

  /** Four corners in CCW order as seen from the front, one normal, four uvs. */
  quad(p: readonly THREE.Vector3[], n: THREE.Vector3, uv: readonly (readonly [number, number])[]): void {
    for (const i of QUAD_INDEX) {
      const v = p[i];
      this.pos.push(v.x, v.y, v.z);
      this.nor.push(n.x, n.y, n.z);
      this.uv.push(uv[i][0], uv[i][1]);
    }
  }

  /** Appends any BufferGeometry (indexed or not), transformed by `matrix`. Does not dispose the input. */
  addGeometry(geometry: THREE.BufferGeometry, matrix?: THREE.Matrix4): void {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (matrix) g.applyMatrix4(matrix);
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const u = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      this.nor.push(n ? n.getX(i) : 0, n ? n.getY(i) : 1, n ? n.getZ(i) : 0);
      this.uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
    }
    g.dispose();
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

export class BucketSet {
  private readonly buckets = new Map<string, Bucket>();

  get(key: string): Bucket {
    let b = this.buckets.get(key);
    if (!b) {
      b = new Bucket();
      this.buckets.set(key, b);
    }
    return b;
  }

  build(): MergedPart[] {
    const out: MergedPart[] = [];
    for (const [key, b] of this.buckets) if (!b.isEmpty) out.push({ key, geometry: b.build() });
    return out;
  }
}

// ---------------------------------------------------------------------------------------------
// Boxes with a material key per face
// ---------------------------------------------------------------------------------------------

export interface BoxSpec {
  cx: number;
  cy: number;
  cz: number;
  sx: number;
  sy: number;
  sz: number;
}

export type FaceId = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz';

/**
 * Material key per face. A plain string applies to all six faces. In the object form, faces not
 * listed use `rest`; an empty string skips the face entirely (never visible → fewer triangles).
 */
export type BoxKeys = string | (Partial<Record<FaceId, string>> & { rest: string });

interface FaceDef {
  id: FaceId;
  n: THREE.Vector3;
  t: THREE.Vector3;
  b: THREE.Vector3;
}

// For every face t × b = n, so (-t-b, +t-b, +t+b, -t+b) is CCW seen from outside.
const FACES: FaceDef[] = [
  { id: 'px', n: new THREE.Vector3(1, 0, 0), t: new THREE.Vector3(0, 0, -1), b: new THREE.Vector3(0, 1, 0) },
  { id: 'nx', n: new THREE.Vector3(-1, 0, 0), t: new THREE.Vector3(0, 0, 1), b: new THREE.Vector3(0, 1, 0) },
  { id: 'py', n: new THREE.Vector3(0, 1, 0), t: new THREE.Vector3(1, 0, 0), b: new THREE.Vector3(0, 0, -1) },
  { id: 'ny', n: new THREE.Vector3(0, -1, 0), t: new THREE.Vector3(1, 0, 0), b: new THREE.Vector3(0, 0, 1) },
  { id: 'pz', n: new THREE.Vector3(0, 0, 1), t: new THREE.Vector3(1, 0, 0), b: new THREE.Vector3(0, 1, 0) },
  { id: 'nz', n: new THREE.Vector3(0, 0, -1), t: new THREE.Vector3(-1, 0, 0), b: new THREE.Vector3(0, 1, 0) },
];

const corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const centre = new THREE.Vector3();
const half = new THREE.Vector3();
const worldNormal = new THREE.Vector3();

export const IDENTITY = new THREE.Matrix4();

/** World-space UV in metres for a vertex on a face with the given world normal. */
function worldUV(p: THREE.Vector3, n: THREE.Vector3, scale: number): [number, number] {
  if (Math.abs(n.y) > 0.5) return [p.x * scale, p.z * scale];
  const tx = n.z;
  const tz = -n.x;
  const len = Math.hypot(tx, tz) || 1;
  return [((p.x * tx + p.z * tz) / len) * scale, p.y * scale];
}

/**
 * Appends a box (given in the frame of `matrix`) to the bucket set, one quad per face, each face
 * going to the bucket named by `keys`.
 */
export function addBox(set: BucketSet, keys: BoxKeys, box: BoxSpec, matrix: THREE.Matrix4, uvScale = 1): void {
  centre.set(box.cx, box.cy, box.cz);
  half.set(box.sx / 2, box.sy / 2, box.sz / 2);
  for (const f of FACES) {
    const key = typeof keys === 'string' ? keys : (keys[f.id] ?? keys.rest);
    if (!key) continue;
    const hn = Math.abs(f.n.dot(half));
    const ht = Math.abs(f.t.dot(half));
    const hb = Math.abs(f.b.dot(half));
    corners[0].copy(centre).addScaledVector(f.n, hn).addScaledVector(f.t, -ht).addScaledVector(f.b, -hb);
    corners[1].copy(centre).addScaledVector(f.n, hn).addScaledVector(f.t, ht).addScaledVector(f.b, -hb);
    corners[2].copy(centre).addScaledVector(f.n, hn).addScaledVector(f.t, ht).addScaledVector(f.b, hb);
    corners[3].copy(centre).addScaledVector(f.n, hn).addScaledVector(f.t, -ht).addScaledVector(f.b, hb);
    for (const c of corners) c.applyMatrix4(matrix);
    worldNormal.copy(f.n).transformDirection(matrix);
    const uvs = corners.map((c) => worldUV(c, worldNormal, uvScale));
    set.get(key).quad(corners, worldNormal, uvs);
  }
}

/** Rotation about Y by `yaw`, then translation — the wall / flight local frame used across the house. */
export function frameMatrix(yaw: number, x: number, y: number, z: number): THREE.Matrix4 {
  return new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z);
}
