import * as THREE from 'three';
import type { BucketSet } from './bucket';

/**
 * Extrusion of a 2D moulding profile along a wall face — baseboards, crown moulding and the
 * returns around free wall ends. Lets every run end in a true 45° mitre (so two runs meeting at
 * a corner share one diagonal plane, with no overlapping or coplanar faces) or in a flat cap.
 *
 * Profile points are (out, y): `out` is the distance from the wall face into the room, `y` the
 * height above the run's base line. The profile is ordered so that the normal (dy, -dout) of
 * every segment points out of the material; the solid section is closed by the wall face
 * (out = 0) and the base / ceiling line (handled by the caps only).
 */

export interface ProfilePoint {
  out: number;
  y: number;
  /** Average the normals of the two adjacent segments at this point (rounded / coved profiles). */
  smooth?: boolean;
}

export interface RunEnd {
  /** Offset of the run end along +X (beyond the nominal end when positive). */
  ext: number;
  /** 45° mitre: each profile point is shifted by slope × out (+1 wraps an outer corner, -1 meets an inner one). */
  slope: -1 | 0 | 1;
  /** Emit a flat end face (only meaningful with slope 0). */
  cap: boolean;
}

export interface RunSpec {
  /** Local x range along the run. */
  s: number;
  e: number;
  a: RunEnd;
  b: RunEnd;
  /** Side of the wall the profile grows from: +1 → local +Z face, -1 → local -Z face. */
  side: 1 | -1;
  /** Distance from the frame origin to the wall face along local Z. */
  halfT: number;
  /** Base line height in the local frame. */
  y: number;
  /** The corner the solid section closes to, (out, y) — (0, 0) for baseboards, (0, 0) for crown with y ≤ 0 profiles. */
  closeAt: [number, number];
}

const p0 = new THREE.Vector3();
const p1 = new THREE.Vector3();
const p2 = new THREE.Vector3();
const p3 = new THREE.Vector3();
const n0 = new THREE.Vector3();
const n1 = new THREE.Vector3();
const n2 = new THREE.Vector3();
const n3 = new THREE.Vector3();
const segN = new THREE.Vector3();
const capN = new THREE.Vector3();
const capA = new THREE.Vector3();
const capB = new THREE.Vector3();
const capC = new THREE.Vector3();

/** Per-segment outward normals in the (out, y) plane. */
function segmentNormals(profile: ProfilePoint[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < profile.length - 1; i++) {
    const dOut = profile[i + 1].out - profile[i].out;
    const dy = profile[i + 1].y - profile[i].y;
    const len = Math.hypot(dOut, dy) || 1;
    out.push([dy / len, -dOut / len]);
  }
  return out;
}

/** Normal at a profile point: the adjacent segment's, or the average when the point is smooth. */
function pointNormal(profile: ProfilePoint[], segs: [number, number][], i: number, segIndex: number): [number, number] {
  const p = profile[i];
  if (!p.smooth) return segs[segIndex];
  const prev = segs[i - 1];
  const next = segs[i];
  if (!prev || !next) return segs[segIndex];
  const ox = prev[0] + next[0];
  const oy = prev[1] + next[1];
  const len = Math.hypot(ox, oy) || 1;
  return [ox / len, oy / len];
}

/**
 * Emits the run into the bucket. Positions are built in the local frame and transformed by
 * `matrix` (rotation about Y + translation), normals with its rotation.
 */
export function extrudeProfile(set: BucketSet, key: string, profile: ProfilePoint[], run: RunSpec, matrix: THREE.Matrix4): void {
  if (run.e - run.s < 1e-4 || profile.length < 2) return;
  // `ext` / `slope` are expressed along the run's outward direction at each end: at end a that is
  // -x, so an extension (+ext) moves the start to a smaller x and an inner mitre (-slope) makes the
  // outer edge start later.
  const xStart = (out: number) => run.s - run.a.ext - run.a.slope * out;
  const xEnd = (out: number) => run.e + run.b.ext + run.b.slope * out;
  // a run too short to carry its mitres (a sliver between a casing and a corner) would fold over: drop it
  const outMax = Math.max(...profile.map((p) => p.out));
  if (Math.min(xEnd(0), xEnd(outMax)) <= Math.max(xStart(0), xStart(outMax)) + 1e-4) return;
  const bucket = set.get(key);
  const side = run.side;
  const segs = segmentNormals(profile);
  const z = (out: number) => side * (run.halfT + out);
  const setNormal = (v: THREE.Vector3, n: [number, number]) => v.set(0, n[1], side * n[0]).transformDirection(matrix);

  let vAcc = 0;
  for (let i = 0; i < profile.length - 1; i++) {
    const p = profile[i];
    const q = profile[i + 1];
    const segLen = Math.hypot(q.out - p.out, q.y - p.y);
    const xsP = xStart(p.out);
    const xeP = xEnd(p.out);
    const xsQ = xStart(q.out);
    const xeQ = xEnd(q.out);
    if (xeP - xsP < 1e-5 && xeQ - xsQ < 1e-5) {
      vAcc += segLen;
      continue;
    }
    // corners: (start, p), (end, p), (end, q), (start, q); mirrored along x for the -Z side so the winding stays CCW
    if (side > 0) {
      p0.set(xsP, run.y + p.y, z(p.out));
      p1.set(xeP, run.y + p.y, z(p.out));
      p2.set(xeQ, run.y + q.y, z(q.out));
      p3.set(xsQ, run.y + q.y, z(q.out));
    } else {
      p0.set(xeP, run.y + p.y, z(p.out));
      p1.set(xsP, run.y + p.y, z(p.out));
      p2.set(xsQ, run.y + q.y, z(q.out));
      p3.set(xeQ, run.y + q.y, z(q.out));
    }
    for (const v of [p0, p1, p2, p3]) v.applyMatrix4(matrix);
    const nP = pointNormal(profile, segs, i, i);
    const nQ = pointNormal(profile, segs, i + 1, i);
    setNormal(n0, nP);
    setNormal(n1, nP);
    setNormal(n2, nQ);
    setNormal(n3, nQ);
    const uv: [number, number][] = [
      [p0.x + p0.z, vAcc],
      [p1.x + p1.z, vAcc],
      [p2.x + p2.z, vAcc + segLen],
      [p3.x + p3.z, vAcc + segLen],
    ];
    bucket.quadSmooth([p0, p1, p2, p3], [n0, n1, n2, n3], uv);
    vAcc += segLen;
  }

  // flat caps: a fan from the closing corner over the profile polygon
  for (const end of ['a', 'b'] as const) {
    const re = end === 'a' ? run.a : run.b;
    if (!re.cap || re.slope !== 0) continue;
    const x = end === 'a' ? run.s - re.ext : run.e + re.ext;
    const dir = end === 'a' ? -1 : 1;
    capN.set(dir, 0, 0).transformDirection(matrix);
    capA.set(x, run.y + run.closeAt[1], z(run.closeAt[0])).applyMatrix4(matrix);
    for (let i = 0; i < profile.length - 1; i++) {
      capB.set(x, run.y + profile[i].y, z(profile[i].out)).applyMatrix4(matrix);
      capC.set(x, run.y + profile[i + 1].y, z(profile[i + 1].out)).applyMatrix4(matrix);
      segN.copy(capN);
      bucket.tri(capA, capB, capC, segN, [
        [0, 0],
        [profile[i].out, profile[i].y],
        [profile[i + 1].out, profile[i + 1].y],
      ]);
    }
  }
}

/** Concave quarter-circle cove between two points, as a list of profile points (excluding the ends). */
export function coveArc(from: [number, number], to: [number, number], segments: number): ProfilePoint[] {
  // circle centred at (to.out, from.y) → passes through both points for a square cove
  const cx = to[0];
  const cy = from[1];
  const r = Math.hypot(from[0] - cx, from[1] - cy);
  const a0 = Math.atan2(from[1] - cy, from[0] - cx);
  const a1 = Math.atan2(to[1] - cy, to[0] - cx);
  const out: ProfilePoint[] = [];
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const a = a0 + (a1 - a0) * t;
    out.push({ out: cx + r * Math.cos(a), y: cy + r * Math.sin(a), smooth: true });
  }
  return out;
}
