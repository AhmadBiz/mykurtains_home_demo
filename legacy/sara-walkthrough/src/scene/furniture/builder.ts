/**
 * Geometry builder for the furniture. Props are authored as primitives (rounded boxes, tapered
 * cylinders, lathes, tori, bent leaves…) in a local frame, each tagged with a material key.
 *
 *  - `PartSet.build()` merges every primitive of a key into ONE BufferGeometry (one draw call per
 *    key per storey), and collects the instance matrices of repeated items (chairs, stools,
 *    hangers, pulls, books, jars, fruit, leaves) for InstancedMeshes.
 *  - Every merged / instanced geometry carries two uv sets: `uv` is box-projected in the piece's
 *    frame in METRES (textures tile at real-world scale, seamlessly across the primitives of one
 *    piece), `uv1` keeps the primitive's native 0..1 uvs for maps that must fit a face exactly.
 *  - Geometries are cached by size at module level, so a thousand primitives share a few dozen
 *    source geometries; the merged results are built once per app lifetime.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { MatKey } from './materials';

export type Vec3 = readonly [number, number, number];
/** Euler angles (radians, XYZ order). */
export type Rot = readonly [number, number, number];

export const NO_ROT: Rot = [0, 0, 0];
export const ONE: Vec3 = [1, 1, 1];

/** Repeated items rendered with InstancedMesh (specs in instances.ts). */
export type InstanceKind = 'chair' | 'stool' | 'hangerHook' | 'garment' | 'pull' | 'knob' | 'book' | 'jar' | 'fruit' | 'leaf';

export interface MergedPart {
  key: MatKey;
  geometry: THREE.BufferGeometry;
}

export interface InstanceGroup {
  kind: InstanceKind;
  matrices: THREE.Matrix4[];
  /** Per-instance tints (white when a kind is not coloured). */
  colors: THREE.Color[];
}

export interface BuiltLevel {
  parts: MergedPart[];
  instances: InstanceGroup[];
  /** Triangles in the merged parts (instances counted in Furniture.tsx). */
  triangles: number;
}

// ---------------------------------------------------------------------------------------------
// UV projection
// ---------------------------------------------------------------------------------------------

/**
 * How a primitive's metric `uv` set is derived:
 *  - box: dominant-axis projection of the (piece-frame) position — tops read (x, z), ±X faces
 *    (z, y), ±Z faces (x, y). `swap` exchanges u/v so a wood grain runs the other way.
 *  - native: the primitive's own uvs scaled to metres (su along u, sv along v); `swap` puts
 *    the height on U (turned legs: grain along the leg).
 */
export type UvMode = { kind: 'box'; swap?: boolean } | { kind: 'native'; su: number; sv: number; swap?: boolean };

const BOX_UV: UvMode = { kind: 'box' };

function writeUvs(g: THREE.BufferGeometry, mode: UvMode): void {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const uv0 = g.attributes.uv as THREE.BufferAttribute;
  const n = pos.count;
  const out = new Float32Array(n * 2);
  if (mode.kind === 'box') {
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const ax = Math.abs(nor.getX(i));
      const ay = Math.abs(nor.getY(i));
      const az = Math.abs(nor.getZ(i));
      let u: number;
      let v: number;
      if (ay >= ax && ay >= az) {
        u = x;
        v = z;
      } else if (ax >= az) {
        u = z;
        v = y;
      } else {
        u = x;
        v = y;
      }
      if (mode.swap) {
        out[i * 2] = v;
        out[i * 2 + 1] = u;
      } else {
        out[i * 2] = u;
        out[i * 2 + 1] = v;
      }
    }
  } else {
    for (let i = 0; i < n; i++) {
      const u = uv0.getX(i) * mode.su;
      const v = uv0.getY(i) * mode.sv;
      if (mode.swap) {
        out[i * 2] = v;
        out[i * 2 + 1] = u;
      } else {
        out[i * 2] = u;
        out[i * 2 + 1] = v;
      }
    }
  }
  g.setAttribute('uv1', uv0);
  g.setAttribute('uv', new THREE.BufferAttribute(out, 2));
}

/**
 * A flattened copy of `source` transformed by `local` (the primitive's placement inside its
 * piece) with the metric uvs written in that space, then moved by `frame` into the world.
 */
export function prepare(source: THREE.BufferGeometry, local: THREE.Matrix4, frame: THREE.Matrix4, mode: UvMode = BOX_UV): THREE.BufferGeometry {
  const g = source.index ? source.toNonIndexed() : source.clone();
  g.applyMatrix4(local);
  writeUvs(g, mode);
  g.applyMatrix4(frame);
  return g;
}

// ---------------------------------------------------------------------------------------------
// Geometry caches (keyed by size, shared across every piece)
// ---------------------------------------------------------------------------------------------

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const geomCache = new Map<string, THREE.BufferGeometry>();
const k = (v: number) => Math.round(v * 1000);

function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geomCache.get(key);
  if (!g) {
    g = make();
    geomCache.set(key, g);
  }
  return g;
}

/** Rounded box; `seg` = corner segments (1: 108 tris, 2: 300, 3: 588). */
export function roundedBox(w: number, h: number, d: number, r: number, seg = 2): THREE.BufferGeometry {
  return cached(`rb:${k(w)}:${k(h)}:${k(d)}:${k(r)}:${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, r));
}

export function cylinder(rTop: number, rBot: number, h: number, seg: number, open = false): THREE.BufferGeometry {
  return cached(`cy:${k(rTop)}:${k(rBot)}:${k(h)}:${seg}:${open ? 1 : 0}`, () => new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open));
}

export function unitSphere(seg: number): THREE.BufferGeometry {
  return cached(`sp:${seg}`, () => new THREE.SphereGeometry(1, seg, Math.max(6, Math.round(seg * 0.7))));
}

export function torus(r: number, tube: number, arc: number, radial = 8, tubular = 24): THREE.BufferGeometry {
  return cached(`to:${k(r)}:${k(tube)}:${k(arc)}:${radial}:${tubular}`, () => new THREE.TorusGeometry(r, tube, radial, tubular, arc));
}

/**
 * Rectangular pyramid frustum: base wb × db on y = 0 tapering to a top wt × dt at y = h. Four
 * flat-shaded sloped faces + the top, no bottom (a chimney hood draws its own underside with the
 * filter recess). 10 triangles.
 */
export function pyramidFrustum(wb: number, db: number, wt: number, dt: number, h: number): THREE.BufferGeometry {
  return cached(`pf:${k(wb)}:${k(db)}:${k(wt)}:${k(dt)}:${k(h)}`, () => {
    const ring = (w: number, d: number, y: number): Vec3[] => [[-w / 2, y, d / 2], [w / 2, y, d / 2], [w / 2, y, -d / 2], [-w / 2, y, -d / 2]];
    const b = ring(wb, db, 0);
    const t = ring(wt, dt, h);
    const pos: number[] = [];
    const uv: number[] = [];
    const quad = (p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3): void => {
      pos.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
      uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
    };
    for (let i = 0; i < 4; i++) quad(b[i], b[(i + 1) % 4], t[(i + 1) % 4], t[i]);
    quad(t[0], t[1], t[2], t[3]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  });
}

/** Lathe of a profile [[radius, y], …]; not cached (profiles are one-offs). */
export function latheGeometry(profile: readonly (readonly [number, number])[], seg: number): THREE.LatheGeometry {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    seg,
  );
}

/**
 * A leaf: a tapered plane along +Y (base at the origin, tip at `len`), folded along its midrib
 * and curling back at the tip. Rendered double-sided.
 */
export function leafGeometry(width = 0.09, len = 0.3): THREE.BufferGeometry {
  return cached(`leaf:${k(width)}:${k(len)}`, () => {
    const g = new THREE.PlaneGeometry(width, len, 3, 8);
    g.translate(0, len / 2, 0);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const t = y / len; // 0 base → 1 tip
      const taper = Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95)); // pointed tip, narrow base
      const nx = x * taper;
      const fold = Math.abs(nx) / (width / 2);
      pos.setX(i, nx);
      pos.setZ(i, -fold * 0.012 - t * t * len * 0.35);
    }
    g.computeVertexNormals();
    return g;
  });
}

/** A curved chair back: a thin rounded box bent about Y (the sides come forward by `bow`). */
export function bentSlab(w: number, h: number, t: number, bow: number, r = 0.006): THREE.BufferGeometry {
  return cached(`bent:${k(w)}:${k(h)}:${k(t)}:${k(bow)}`, () => {
    const g = new RoundedBoxGeometry(w, h, t, 2, r);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const nor = g.attributes.normal as THREE.BufferAttribute;
    const c = bow / ((w / 2) * (w / 2));
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      pos.setZ(i, pos.getZ(i) + c * x * x);
      const a = -Math.atan(2 * c * x);
      const nx = nor.getX(i);
      const nz = nor.getZ(i);
      nor.setX(i, nx * Math.cos(a) + nz * Math.sin(a));
      nor.setZ(i, -nx * Math.sin(a) + nz * Math.cos(a));
    }
    return g;
  });
}

// ---------------------------------------------------------------------------------------------
// PartSet: buckets per material + instance lists
// ---------------------------------------------------------------------------------------------

export class PartSet {
  private readonly buckets = new Map<MatKey, THREE.BufferGeometry[]>();
  private readonly instances = new Map<InstanceKind, InstanceGroup>();

  /** Appends an already prepared (world-space, flattened) geometry. */
  add(key: MatKey, geometry: THREE.BufferGeometry): void {
    let list = this.buckets.get(key);
    if (!list) {
      list = [];
      this.buckets.set(key, list);
    }
    list.push(geometry);
  }

  instance(kind: InstanceKind, matrix: THREE.Matrix4, color?: THREE.ColorRepresentation): void {
    let g = this.instances.get(kind);
    if (!g) {
      g = { kind, matrices: [], colors: [] };
      this.instances.set(kind, g);
    }
    g.matrices.push(matrix);
    g.colors.push(new THREE.Color(color ?? '#ffffff'));
  }

  /** One merged geometry per material key + the instance groups. Empties the set. */
  build(): BuiltLevel {
    const parts: MergedPart[] = [];
    let triangles = 0;
    for (const [key, list] of this.buckets) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      triangles += merged.attributes.position.count / 3;
      parts.push({ key, geometry: merged });
    }
    this.buckets.clear();
    const instances = Array.from(this.instances.values());
    this.instances.clear();
    return { parts, instances, triangles };
  }
}

// ---------------------------------------------------------------------------------------------
// Frame: a local coordinate system to draw a piece in
// ---------------------------------------------------------------------------------------------

const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();
const tmpScale = new THREE.Vector3();

export interface PlaceOpts {
  rot?: Rot;
  scale?: Vec3;
  uv?: UvMode;
}

/**
 * A local frame (translation + yaw about Y, composed with its parent). Pieces are authored with
 * the origin on the floor under their centre and their FRONT toward local +Z; `Frame.at()`
 * places them. Rotating local +Z by `yaw` about Y gives world (sin yaw, 0, cos yaw).
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

  private localMatrix(pos: Vec3, rot: Rot, scale: Vec3): THREE.Matrix4 {
    tmpPos.set(pos[0], pos[1], pos[2]);
    tmpQuat.setFromEuler(tmpEuler.set(rot[0], rot[1], rot[2], 'XYZ'));
    tmpScale.set(scale[0], scale[1], scale[2]);
    return new THREE.Matrix4().compose(tmpPos, tmpQuat, tmpScale);
  }

  /** Any geometry, placed with its own transform; uvs per `o.uv` (box projection by default). */
  geom(key: MatKey, geometry: THREE.BufferGeometry, pos: Vec3, o: PlaceOpts = {}): void {
    this.set.add(key, prepare(geometry, this.localMatrix(pos, o.rot ?? NO_ROT, o.scale ?? ONE), this.matrix, o.uv));
  }

  /** Plain box of size (w, h, d) centred at `pos`. */
  box(key: MatKey, w: number, h: number, d: number, pos: Vec3, rot: Rot = NO_ROT, swap = false): void {
    this.geom(key, UNIT_BOX, pos, { rot, scale: [w, h, d], uv: swap ? { kind: 'box', swap: true } : BOX_UV });
  }

  /** Rounded box (edge radius `r`) centred at `pos`. */
  rbox(key: MatKey, w: number, h: number, d: number, r: number, pos: Vec3, o: { rot?: Rot; seg?: number; swap?: boolean; scale?: Vec3 } = {}): void {
    this.geom(key, roundedBox(w, h, d, r, o.seg ?? 2), pos, { rot: o.rot, scale: o.scale, uv: o.swap ? { kind: 'box', swap: true } : BOX_UV });
  }

  /** Cylinder (axis along local Y unless rotated) centred at `pos`; height runs along U for wood grain. */
  cyl(key: MatKey, rTop: number, rBot: number, h: number, pos: Vec3, rot: Rot = NO_ROT, seg = 16, open = false): void {
    const circ = Math.PI * (rTop + rBot);
    this.geom(key, cylinder(rTop, rBot, h, seg, open), pos, { rot, uv: { kind: 'native', su: circ, sv: h, swap: true } });
  }

  sphere(key: MatKey, r: number, pos: Vec3, seg = 12): void {
    this.ellipsoid(key, r, r, r, pos, seg);
  }

  ellipsoid(key: MatKey, rx: number, ry: number, rz: number, pos: Vec3, seg = 12, rot: Rot = NO_ROT): void {
    this.geom(key, unitSphere(seg), pos, { rot, scale: [rx, ry, rz], uv: { kind: 'native', su: Math.PI * (rx + rz), sv: Math.PI * ry } });
  }

  /** Lathe of a profile [[radius, y], …] (y from 0 at the base), base at `pos`; optional (x, y, z) scale. */
  lathe(key: MatKey, profile: readonly (readonly [number, number])[], pos: Vec3, seg = 24, o: { scale?: Vec3; rot?: Rot } = {}): void {
    const g = latheGeometry(profile, seg);
    let rMax = 0;
    let len = 0;
    for (let i = 0; i < profile.length; i++) {
      rMax = Math.max(rMax, profile[i][0]);
      if (i > 0) len += Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]);
    }
    this.geom(key, g, pos, { rot: o.rot, scale: o.scale, uv: { kind: 'native', su: 2 * Math.PI * rMax, sv: len, swap: true } });
    g.dispose();
  }

  /** Torus (ring) in the local XY plane (axis along Z) unless rotated; `arc` for partial rings. */
  torus(key: MatKey, r: number, tube: number, pos: Vec3, rot: Rot = NO_ROT, arc = Math.PI * 2, seg: [number, number] = [8, 24]): void {
    this.geom(key, torus(r, tube, arc, seg[0], seg[1]), pos, { rot, uv: { kind: 'native', su: r * arc, sv: 2 * Math.PI * tube } });
  }

  /** A repeated item (see instances.ts), placed like a primitive. */
  instance(kind: InstanceKind, pos: Vec3, rot: Rot = NO_ROT, scale: Vec3 = ONE, color?: THREE.ColorRepresentation): void {
    const m = this.localMatrix(pos, rot, scale).premultiply(this.matrix);
    this.set.instance(kind, m, color);
  }
}
