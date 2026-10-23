/**
 * Small geometry kit for the window module: a profile sweep (mouldings with true 45° mitres),
 * chamfered boxes and metric UVs. Everything returns indexed BufferGeometries with position /
 * normal / uv so the parts of one material can be merged into a single draw call.
 *
 * UVs are written in LOCAL METRES (planar projection on the dominant axis of each face), so a
 * texture configured with `repeat = tiles per metre` tiles at true scale on every part.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export interface ProfilePoint {
  /** Across the moulding (from its inner edge outward). */
  u: number;
  /** Out of the surface it is applied to. */
  v: number;
  /** Average the normals of the two adjacent segments (rounded / coved parts of a profile). */
  smooth?: boolean;
}

export interface SweepEnd {
  /** 45° mitre: the end is offset along the run by `slope × u` (+1 = outer edge longer). 0 = square. */
  slope?: number;
  /** Close a square end with a flat face. */
  cap?: boolean;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _n = new THREE.Vector3();

/** Signed area of a polygon (positive = counter-clockwise in the u/v plane). */
function signedArea(p: ProfilePoint[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    s += p[i].u * q.v - q.u * p[i].v;
  }
  return s / 2;
}

/**
 * Sweeps a closed profile along +X for `length`: u → +Y, v → +Z. Normals are flat per segment
 * (or averaged at `smooth` points) so a bevel reads as a crisp facet and a bull-nose as a curve.
 */
export function sweepProfile(points: ProfilePoint[], length: number, a: SweepEnd = {}, b: SweepEnd = {}): THREE.BufferGeometry {
  const profile = signedArea(points) < 0 ? [...points].reverse() : points;
  const n = profile.length;
  const slopeA = a.slope ?? 0;
  const slopeB = b.slope ?? 0;

  // outward normal of every segment i → i+1
  const segN: [number, number][] = [];
  const segLen: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = profile[i];
    const q = profile[(i + 1) % n];
    const du = q.u - p.u;
    const dv = q.v - p.v;
    const len = Math.hypot(du, dv) || 1;
    segN.push([dv / len, -du / len]);
    segLen.push(len);
  }
  const pointN = (i: number, seg: number): [number, number] => {
    if (!profile[i].smooth) return segN[seg];
    const prev = segN[(i - 1 + n) % n];
    const next = segN[i];
    const x = prev[0] + next[0];
    const y = prev[1] + next[1];
    const l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  };

  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const push = (x: number, y: number, z: number, nx: number, ny: number, nz: number, s: number, t: number) => {
    pos.push(x, y, z);
    nor.push(nx, ny, nz);
    uv.push(s, t);
    return pos.length / 3 - 1;
  };
  const quad = (i0: number, i1: number, i2: number, i3: number, nx: number, ny: number, nz: number) => {
    _a.fromArray(pos, i0 * 3);
    _b.fromArray(pos, i1 * 3);
    _c.fromArray(pos, i2 * 3);
    _n.subVectors(_b, _a).cross(_c.sub(_a));
    if (_n.x * nx + _n.y * ny + _n.z * nz >= 0) idx.push(i0, i1, i2, i0, i2, i3);
    else idx.push(i0, i2, i1, i0, i3, i2);
  };

  let arc = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const p = profile[i];
    const q = profile[j];
    const [nu, nv] = segN[i];
    const np = pointN(i, i);
    const nq = pointN(j, i);
    const x0p = -p.u * slopeA;
    const x0q = -q.u * slopeA;
    const x1p = length + p.u * slopeB;
    const x1q = length + q.u * slopeB;
    const arcQ = arc + segLen[i];
    const i0 = push(x0p, p.u, p.v, 0, np[0], np[1], x0p, arc);
    const i1 = push(x0q, q.u, q.v, 0, nq[0], nq[1], x0q, arcQ);
    const i2 = push(x1q, q.u, q.v, 0, nq[0], nq[1], x1q, arcQ);
    const i3 = push(x1p, p.u, p.v, 0, np[0], np[1], x1p, arc);
    quad(i0, i1, i2, i3, 0, nu, nv);
    arc = arcQ;
  }

  const capAt = (x: number, dir: 1 | -1) => {
    const base = pos.length / 3;
    for (const p of profile) push(x, p.u, p.v, dir, 0, 0, p.u, p.v);
    const tris = THREE.ShapeUtils.triangulateShape(
      profile.map((p) => new THREE.Vector2(p.u, p.v)),
      [],
    );
    for (const [t0, t1, t2] of tris) {
      if (dir === 1) idx.push(base + t0, base + t1, base + t2);
      else idx.push(base + t0, base + t2, base + t1);
    }
  };
  if (a.cap && slopeA === 0) capAt(0, -1);
  if (b.cap && slopeB === 0) capAt(length, 1);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

const _m = new THREE.Matrix4();

/**
 * Places a sweep built along +X (u → +Y, v → +Z) into the part's frame: `origin` is the start of
 * the run, `axis` the run direction, `across` the profile's u direction and `out` its v direction.
 * A left-handed basis is allowed: the winding is flipped so the faces stay front-facing.
 */
export function place(g: THREE.BufferGeometry, origin: THREE.Vector3Like, axis: THREE.Vector3Like, across: THREE.Vector3Like, out: THREE.Vector3Like): THREE.BufferGeometry {
  _a.copy(axis);
  _b.copy(across);
  _c.copy(out);
  _m.makeBasis(_a, _b, _c);
  _m.setPosition(origin.x, origin.y, origin.z);
  const flip = _m.determinant() < 0;
  g.applyMatrix4(_m);
  if (flip && g.index) {
    const arr = g.index.array;
    for (let i = 0; i < arr.length; i += 3) {
      const t = arr[i + 1];
      arr[i + 1] = arr[i + 2];
      arr[i + 2] = t;
    }
    g.index.needsUpdate = true;
  }
  return g;
}

/** Rewrites the UVs as a planar projection in local metres on the dominant axis of each vertex normal. */
export function metricUVs(g: THREE.BufferGeometry, scale = 1): THREE.BufferGeometry {
  const p = g.getAttribute('position');
  const nrm = g.getAttribute('normal');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(nrm.getX(i));
    const ny = Math.abs(nrm.getY(i));
    const nz = Math.abs(nrm.getZ(i));
    let s: number;
    let t: number;
    if (nx >= ny && nx >= nz) {
      s = p.getZ(i);
      t = p.getY(i);
    } else if (ny >= nz) {
      s = p.getX(i);
      t = p.getZ(i);
    } else {
      s = p.getX(i);
      t = p.getY(i);
    }
    uv[i * 2] = s * scale;
    uv[i * 2 + 1] = t * scale;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Axis-aligned box centred at (x, y, z) with metric UVs. */
export function box(w: number, h: number, d: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  return metricUVs(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
}

/**
 * Chamfered box (RoundedBoxGeometry with one segment = a crisp 45° bevel of `r`) centred at
 * (x, y, z). Falls back to a plain box when a side is too small for the bevel.
 */
export function chamfered(w: number, h: number, d: number, r: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  const minSide = Math.min(w, h, d);
  if (minSide <= 2.5 * r) return box(w, h, d, x, y, z);
  return metricUVs(new RoundedBoxGeometry(w, h, d, 1, r).translate(x, y, z));
}

/** Quad in the XY plane (a glass pane) centred at (x, y, z), facing +Z — or −Z when `back` is set. */
export function pane(w: number, h: number, x = 0, y = 0, z = 0, back = false): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  if (back) g.rotateY(Math.PI);
  return g.translate(x, y, z);
}
