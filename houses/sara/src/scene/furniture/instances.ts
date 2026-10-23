/**
 * Repeated items rendered with InstancedMesh: one geometry per (kind, material) built once in
 * the kind's local frame (origin on the floor / mounting point, front toward +Z), placed by the
 * instance matrices the layout records through `Frame.instance()`.
 *
 * A kind may have several parts (a chair = walnut frame + linen seat): each part becomes its own
 * InstancedMesh sharing the kind's matrices. `colored` parts take the per-instance tint.
 */
import * as THREE from 'three';
import { Frame, PartSet, bentSlab, leafGeometry } from './builder';
import type { InstanceKind, MergedPart } from './builder';
import type { MatKey } from './materials';

export interface InstancePart extends MergedPart {
  colored: boolean;
  castShadow: boolean;
}

const COLORED: ReadonlySet<MatKey> = new Set<MatKey>(['linenWhite', 'paper', 'fruit', 'leaf']);

function build(draw: (f: Frame) => void): InstancePart[] {
  const set = new PartSet();
  draw(new Frame(set, new THREE.Matrix4()));
  const { parts } = set.build();
  return parts.map((p) => ({ ...p, colored: COLORED.has(p.key), castShadow: p.key !== 'leaf' }));
}

const PI = Math.PI;
const H = PI / 2;

/** Dining chair: tapered walnut legs, a seat frame, two raked back posts and a bowed top rail. Seat 0.45 m. */
function chair(f: Frame): void {
  const seatY = 0.44;
  // legs (front vertical, back legs rake back with the posts)
  for (const s of [-1, 1]) {
    f.cyl('walnut', 0.02, 0.014, seatY, [s * 0.19, seatY / 2, 0.19], undefined, 10);
    f.cyl('walnut', 0.02, 0.015, seatY, [s * 0.19, seatY / 2, -0.17], undefined, 10);
    // back posts, raked 7°
    f.cyl('walnut', 0.017, 0.02, 0.5, [s * 0.19, seatY + 0.24, -0.2], [-0.12, 0, 0], 10);
  }
  // seat frame + aprons
  f.rbox('walnut', 0.45, 0.035, 0.44, 0.008, [0, seatY - 0.0175, 0.005], { seg: 1 });
  f.box('walnut', 0.40, 0.05, 0.025, [0, seatY - 0.06, 0.2]);
  f.box('walnut', 0.40, 0.05, 0.025, [0, seatY - 0.06, -0.19]);
  // upholstered seat pad (tinted per chair)
  f.rbox('linenWhite', 0.42, 0.045, 0.41, 0.018, [0, seatY + 0.02, 0.01], { seg: 2 });
  // bowed back rail + a lower slat
  f.geom('walnut', bentSlab(0.42, 0.2, 0.022, 0.035), [0, seatY + 0.42, -0.26], { rot: [-0.12, 0, 0] });
  f.geom('walnut', bentSlab(0.4, 0.06, 0.018, 0.03), [0, seatY + 0.2, -0.235], { rot: [-0.12, 0, 0] });
}

/** Counter stool: round walnut seat on four splayed black legs with a footrest ring. Seat 0.68 m. */
function stool(f: Frame): void {
  const seatY = 0.68;
  f.cyl('walnut', 0.18, 0.17, 0.04, [0, seatY - 0.02, 0], undefined, 24);
  f.cyl('paintBlack', 0.015, 0.015, 0.03, [0, seatY - 0.055, 0], undefined, 10);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + PI / 4;
    const tilt = 0.14;
    f.cyl('paintBlack', 0.011, 0.011, 0.68, [Math.cos(a) * 0.15, 0.33, Math.sin(a) * 0.15], [Math.sin(a) * tilt, 0, -Math.cos(a) * tilt], 8);
  }
  f.torus('paintBlack', 0.16, 0.007, [0, 0.25, 0], [H, 0, 0], PI * 2, [6, 24]);
}

/** Chrome hanger hook + bar (hangs from a rod at the origin; garment below is a separate kind). */
function hangerHook(f: Frame): void {
  // the hook rings around the rod (which runs along X), open toward the floor
  f.torus('chrome', 0.025, 0.0035, [0, -0.012, 0], [0, H, -PI / 4], PI * 1.5, [6, 14]);
  f.cyl('chrome', 0.0035, 0.0035, 0.07, [0, -0.065, 0], undefined, 6);
  f.cyl('chrome', 0.004, 0.004, 0.42, [0, -0.11, 0], [0, 0, H], 6);
}

/** A hanging garment (shoulders 0.42 m, 0.7 m long — scaled per instance), tinted per instance. */
function garment(f: Frame): void {
  f.rbox('linenWhite', 0.42, 0.7, 0.045, 0.02, [0, -0.11 - 0.35, 0], { seg: 2 });
}

/** 128 mm bar pull: the bar along X, posts into the door at -Z. */
function pull(f: Frame): void {
  f.rbox('chrome', 0.14, 0.01, 0.01, 0.004, [0, 0, 0.02], { seg: 1 });
  for (const s of [-1, 1]) f.cyl('chrome', 0.004, 0.004, 0.02, [s * 0.064, 0, 0.01], [H, 0, 0], 8);
}

/** Round knob (stem into the door at -Z). */
function knob(f: Frame): void {
  f.cyl('chrome', 0.006, 0.006, 0.018, [0, 0, 0.009], [H, 0, 0], 10);
  f.sphere('chrome', 0.013, [0, 0, 0.022], 12);
}

/** Unit book (scaled per instance to w × h × d; spine toward +Z), tinted per instance. */
function book(f: Frame): void {
  f.box('paper', 1, 1, 1, [0, 0.5, 0]);
}

/** Preserve jar with a brass lid (base at the origin). */
function jar(f: Frame): void {
  f.cyl('jar', 0.042, 0.04, 0.12, [0, 0.06, 0], undefined, 14);
  f.cyl('brass', 0.045, 0.045, 0.014, [0, 0.127, 0], undefined, 14);
}

/** Piece of fruit (r 0.04), tinted per instance. */
function fruit(f: Frame): void {
  f.sphere('fruit', 0.04, [0, 0.04, 0], 14);
}

/** Leaf, base at the origin along +Y, tinted per instance. */
function leaf(f: Frame): void {
  f.geom('leaf', leafGeometry(0.1, 0.32), [0, 0, 0]);
}

const DRAW: Record<InstanceKind, (f: Frame) => void> = { chair, stool, hangerHook, garment, pull, knob, book, jar, fruit, leaf };

const cache = new Map<InstanceKind, InstancePart[]>();

/** The parts of a kind (built once per app lifetime). */
export function instanceParts(kind: InstanceKind): InstancePart[] {
  let p = cache.get(kind);
  if (!p) {
    p = build(DRAW[kind]);
    cache.set(kind, p);
  }
  return p;
}
