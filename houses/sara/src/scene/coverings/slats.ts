/**
 * Helpers shared by the SLATTED / ROLLED coverings only (RollerBlind, VenetianBlind,
 * VerticalBlind, Shutters). The fabric coverings (Curtains, Sheers, RomanShade, CellularShade)
 * belong to another engineer and have their own helper (./fabric.ts); neither side depends on
 * the other.
 *
 * Everything here is pure three.js / React: no store access, no side effects beyond creating
 * GPU resources that `useDisposable` / `useInstancedMesh` free again. All units are metres.
 *
 * Texture convention: every geometry built here carries UVs in METRES (`boxMapUV`), so a PBR
 * set configured for a 1 × 1 m surface (`usePbr(id, { size: [1, 1] })`) repeats at its
 * real-world tile size whatever the part's dimensions, and one material serves every part.
 */
import * as THREE from 'three';
import { useEffect, useMemo } from 'react';
import type { DependencyList } from 'react';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PbrSet, TexId } from '../materials';
import { CASING_W, FRAME_FACE } from '../windows/geometry';

// The window frame members that line the reveal (head, sill, jambs) are FRAME_FACE wide, and
// the interior casing is CASING_W wide — both defined by the window geometry module so that
// inside-mounted blinds fit the clear opening and outside-mounted ones clear the trim.
export { CASING_W, FRAME_FACE };

// ---------------------------------------------------------------------------------------------
// Small maths
// ---------------------------------------------------------------------------------------------
export const DEG = Math.PI / 180;
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const clamp01 = (v: number) => clamp(v, 0, 1);
/** `v` if it is a finite number, otherwise `fallback` (guards NaN / ±Infinity from bad data). */
export const finite = (v: number, fallback: number) => (Number.isFinite(v) ? v : fallback);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** A finite, clamped size so a degenerate opening never produces NaN / zero-size geometry. */
export const safeSize = (v: number, min = 0.05, max = 12) => clamp(finite(v, min), min, max);

/** Clear opening inside the frame members (centred on the origin), never smaller than 4 cm. */
export function clearOpening(width: number, height: number): { innerW: number; innerH: number; innerTop: number; innerBottom: number } {
  const innerW = Math.max(0.04, safeSize(width) - 2 * FRAME_FACE);
  const innerH = Math.max(0.04, safeSize(height) - 2 * FRAME_FACE);
  return { innerW, innerH, innerTop: innerH / 2, innerBottom: -innerH / 2 };
}

/**
 * Room-side face of the deepest frame member that protrudes into the reveal: the central
 * mullion of wide windows (0.7 × wall thickness, centred on the wall → z = −0.3 × reveal). The
 * 60 % horizontal rail (0.5 × t) reaches z = −0.5 × reveal. Inside-mounted blinds hang in front
 * of both so neither bar ever shows through the slats / fabric. (Proportions from
 * ../windows/geometry.ts `windowWoodwork`.)
 */
export const mullionFrontZ = (reveal: number) => -0.3 * Math.max(0.02, finite(reveal, 0.1));

/** Centre z of an inside-mounted part of the given depth: as deep in the reveal as the mullion allows. */
export const insideMountZ = (reveal: number, depth: number) => mullionFrontZ(reveal) + 0.003 + depth / 2;

/** True for catalogue colours darker than a mid grey (hardware is then anthracite instead of white). */
export function isDark(hex: string): boolean {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b < 0.18;
}

// ---------------------------------------------------------------------------------------------
// Resource lifecycle
// ---------------------------------------------------------------------------------------------
interface Disposable {
  dispose(): void;
}

/**
 * `useMemo` for three.js resources (geometry / material / a bundle of them): the previous value
 * is disposed whenever the deps change and on unmount. The factory may return null.
 */
export function useDisposable<T extends Disposable | null>(factory: () => T, deps: DependencyList): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const obj = useMemo(factory, deps);
  useEffect(
    () => () => {
      obj?.dispose();
    },
    [obj],
  );
  return obj;
}

/**
 * An InstancedMesh with `count` slots (at least 1) whose instance buffer is freed when the
 * geometry / material / count change or the component unmounts. Render it with <primitive/>
 * and fill it with `setInstance` + `commitInstances` in a layout effect. The geometry and
 * material are NOT owned by the mesh (dispose them with `useDisposable`).
 */
export function useInstancedMesh(geometry: THREE.BufferGeometry, material: THREE.Material, count: number, castShadow = false): THREE.InstancedMesh {
  const n = Math.max(1, Math.floor(finite(count, 1)));
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(geometry, material, n);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = castShadow;
    m.receiveShadow = true;
    return m;
  }, [geometry, material, n, castShadow]);
  useEffect(() => () => mesh.dispose(), [mesh]);
  return mesh;
}

// ---------------------------------------------------------------------------------------------
// Instance matrices
// ---------------------------------------------------------------------------------------------
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scl = new THREE.Vector3();
const _euler = new THREE.Euler();
const _mat = new THREE.Matrix4();

/** Instance i = translate(x, y, z) · rotate(rx, ry, rz as XYZ Euler) · scale(sx, sy, sz). */
export function setInstance(
  mesh: THREE.InstancedMesh,
  i: number,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = 1,
  sz = 1,
): void {
  _pos.set(x, y, z);
  _quat.setFromEuler(_euler.set(rx, ry, rz));
  _scl.set(sx, sy, sz);
  mesh.setMatrixAt(i, _mat.compose(_pos, _quat, _scl));
}

/** Instance i from a ready-made matrix. */
export function setInstanceMatrix(mesh: THREE.InstancedMesh, i: number, m: THREE.Matrix4): void {
  mesh.setMatrixAt(i, m);
}

/** After a batch of setInstance calls: upload the matrices and fix the culling sphere. */
export function commitInstances(mesh: THREE.InstancedMesh, count: number): void {
  mesh.count = clamp(Math.floor(finite(count, 0)), 0, mesh.instanceMatrix.count);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}

// ---------------------------------------------------------------------------------------------
// Shared unit geometries (scaled per mesh / instance) — module singletons, never disposed.
// three r186 corrects instance normals for non-uniform scale, so scaling these is safe.
// ---------------------------------------------------------------------------------------------
/** 1 × 1 × 1 box centred on the origin. */
export const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
/** Cylinder of radius 1 and length 1 along the X axis (scale = [length, r, r]). */
export const UNIT_CYL_X = new THREE.CylinderGeometry(1, 1, 1, 20, 1).rotateZ(Math.PI / 2);
/** Cylinder of radius 1 and length 1 along the Y axis (scale = [r, length, r]). */
export const UNIT_CYL_Y = new THREE.CylinderGeometry(1, 1, 1, 12, 1);
/** Low-poly cylinders for cords, rungs, chain links (6 sides, open ends). */
export const THIN_CYL_X = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).rotateZ(Math.PI / 2);
export const THIN_CYL_Y = new THREE.CylinderGeometry(1, 1, 1, 6, 1);
/** Low-poly unit sphere for bead chains (scale = bead radius). */
export const BEAD = new THREE.SphereGeometry(1, 6, 4);

// ---------------------------------------------------------------------------------------------
// Hardware finishes shared by all slatted coverings (module singletons, never disposed)
// ---------------------------------------------------------------------------------------------
const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ envMapIntensity: 1, ...o });
export const HARDWARE = {
  /** White powder-coated aluminium / white plastic (cassettes, headrails, brackets, clips). */
  white: std({ color: '#f3f2ee', roughness: 0.4, metalness: 0.25 }),
  /** Anthracite powder coat, for the dark fabrics. */
  anthracite: std({ color: '#3a3b3e', roughness: 0.4, metalness: 0.25 }),
  /** Anodised aluminium tube. */
  alu: std({ color: '#d4d6d9', roughness: 0.35, metalness: 0.6 }),
  /** Nickel bead chain. */
  metal: std({ color: '#b7bbc1', roughness: 0.3, metalness: 0.9 }),
  /** Brushed nickel hinges / catches. */
  nickel: std({ color: '#c9cbcf', roughness: 0.35, metalness: 0.9 }),
  /** Dark bronze. */
  dark: std({ color: '#45464a', roughness: 0.45, metalness: 0.6 }),
  /** Off-white polyester cord. */
  cord: std({ color: '#ece9e2', roughness: 0.9, metalness: 0 }),
  /** Matt near-black: the unlit inside of a cassette slot / channel seen through its opening. */
  shadow: std({ color: '#121214', roughness: 0.95, metalness: 0, envMapIntensity: 0.2 }),
  /** Clear acrylic tilt wand. */
  clear: new THREE.MeshPhysicalMaterial({
    color: '#e6edf4',
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    opacity: 0.5,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1,
  }),
};

// ---------------------------------------------------------------------------------------------
// Finishes (slats, vanes, panels, fabric sheets)
// ---------------------------------------------------------------------------------------------
export interface FinishOptions {
  color: THREE.ColorRepresentation;
  /** Multiplies the colour — brightens an albedo map toward the catalogue swatch. */
  tint?: THREE.Color;
  /** PBR maps from `usePbr(id, { size: [1, 1] })`; geometry UVs must then be in metres. */
  maps?: PbrSet | null;
  roughness?: number;
  metalness?: number;
  side?: THREE.Side;
  /** 0..1; < 1 makes the material transparent. */
  opacity?: number;
  envMapIntensity?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  sheen?: number;
  sheenColor?: THREE.ColorRepresentation;
  sheenRoughness?: number;
}

/** A MeshPhysicalMaterial for a finish. The caller owns disposal. */
export function makeFinish(o: FinishOptions): THREE.MeshPhysicalMaterial {
  const opacity = clamp01(finite(o.opacity ?? 1, 1));
  const m = new THREE.MeshPhysicalMaterial({
    color: o.maps?.map ? '#ffffff' : o.color,
    map: o.maps?.map ?? null,
    normalMap: o.maps?.normalMap ?? null,
    roughnessMap: o.maps?.roughnessMap ?? null,
    roughness: o.roughness ?? 0.6,
    metalness: o.metalness ?? 0,
    side: o.side ?? THREE.FrontSide,
    transparent: opacity < 1,
    opacity,
    envMapIntensity: o.envMapIntensity ?? 1,
    clearcoat: o.clearcoat ?? 0,
    clearcoatRoughness: o.clearcoatRoughness ?? 0.3,
  });
  if (o.maps?.normalMap) m.normalScale.copy(o.maps.normalScale);
  if (o.tint) m.color.multiply(o.tint);
  if (o.sheen !== undefined) {
    m.sheen = o.sheen;
    m.sheenColor = new THREE.Color(o.sheenColor ?? '#ffffff');
    m.sheenRoughness = o.sheenRoughness ?? 0.8;
  }
  return m;
}

/** Real wood texture for a wood catalogue colour: which pack id, how to turn it so the grain runs along U, and a tint toward the swatch. */
export interface WoodFinish {
  tex: TexId;
  rotation: number;
  tint: THREE.Color;
}

// kitchen_wood is a plain straight-grained veneer (grain along V in the image, mean #6f5d48) — the
// closest thing in the pack to natural oak once brightened; dark_wood (grain along U, mean
// #5c2a17) is a dark red-brown that passes for walnut. Tints are linear multipliers of the map.
const WOOD_FINISHES: Record<string, WoodFinish> = {
  oak: { tex: 'kitchen_wood', rotation: Math.PI / 2, tint: new THREE.Color(2.2, 2.0, 1.5) },
  walnut: { tex: 'dark_wood', rotation: 0, tint: new THREE.Color(1.2, 1.6, 1.7) },
};
/** The wood finish of a catalogue colour id, or null for painted / aluminium colours. Stable identity. */
export const woodFinish = (colorId: string): WoodFinish | null => WOOD_FINISHES[colorId] ?? null;

// ---------------------------------------------------------------------------------------------
// UV helpers
// ---------------------------------------------------------------------------------------------
/** Multiplies the UVs of a geometry in place. */
export function scaleUV(geo: THREE.BufferGeometry, su: number, sv: number): THREE.BufferGeometry {
  const uv = geo.getAttribute('uv');
  if (uv) {
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    uv.needsUpdate = true;
  }
  return geo;
}

/** Swaps U and V in place. */
export function swapUV(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const uv = geo.getAttribute('uv');
  if (uv) {
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), uv.getX(i));
    uv.needsUpdate = true;
  }
  return geo;
}

/**
 * Rewrites the UVs of a box-like geometry (BoxGeometry, RoundedBoxGeometry, bent boxes) from
 * its vertex positions: every face is mapped planarly along its dominant normal axis with
 * 1 UV unit = 1 metre, so a texture continues around the edges like real grain. `along = 'y'`
 * swaps U and V so a texture whose grain runs along U follows the geometry's Y (stiles).
 */
export function boxMapUV(geo: THREE.BufferGeometry, along: 'x' | 'y' = 'x'): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const uv = geo.getAttribute('uv');
  if (!pos || !nor || !uv) return geo;
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));
    let u: number;
    let v: number;
    if (nx >= ny && nx >= nz) {
      u = pos.getZ(i);
      v = pos.getY(i);
    } else if (ny >= nz) {
      u = pos.getX(i);
      v = pos.getZ(i);
    } else {
      u = pos.getX(i);
      v = pos.getY(i);
    }
    if (along === 'y') uv.setXY(i, v, u);
    else uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
  return geo;
}

// ---------------------------------------------------------------------------------------------
// Geometry builders (all with metric UVs)
// ---------------------------------------------------------------------------------------------
/**
 * A RoundedBoxGeometry of w × h × d with edge radius r, translated to (x, y, z). `segments` = 1
 * gives a 3-step rounding (enough for r ≤ 4 mm seen from 1 m), 2 a 5-step one.
 */
export function roundedBox(w: number, h: number, d: number, r = 0.003, x = 0, y = 0, z = 0, along: 'x' | 'y' = 'x', segments = 1): THREE.BufferGeometry {
  const geo = new RoundedBoxGeometry(Math.max(1e-4, w), Math.max(1e-4, h), Math.max(1e-4, d), segments, Math.max(1e-5, r));
  boxMapUV(geo, along);
  geo.translate(x, y, z);
  return geo;
}

/** Merges parts (indexed or not) into one non-indexed geometry and disposes the parts. */
export function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((g) => {
    if (!g.index) return g;
    const f = g.toNonIndexed();
    g.dispose();
    return f;
  });
  const merged = mergeGeometries(flat, false);
  for (const g of flat) g.dispose();
  return merged ?? new THREE.BufferGeometry();
}

/**
 * A thin slab of w × t × d (X × Y × Z) whose long edges (±Z) are lifted by `sag`: the curved
 * section of an aluminium venetian slat, with real thickness so it never z-fights or vanishes
 * edge-on. Smooth normals across the curve, metric UVs.
 */
export function curvedSlabGeometry(w: number, t: number, d: number, sag: number, segments = 6): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(Math.max(1e-4, w), Math.max(1e-4, t), Math.max(1e-4, d), 1, 1, segments);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const s = (2 * pos.getZ(i)) / d; // -1 at the back edge, +1 at the front edge
    pos.setY(i, pos.getY(i) + sag * s * s);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return boxMapUV(geo);
}

/**
 * A louvre with an elliptical section: length along X, `thick` along Y, `width` along Z. The
 * ellipse is baked into the vertices (normals stay correct); UVs: U along the length, V around.
 */
export function ellipticalSlatGeometry(len: number, thick: number, width: number, radial = 14): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(1, 1, 1, radial, 1, false);
  geo.rotateZ(Math.PI / 2);
  geo.scale(Math.max(1e-4, len), Math.max(1e-5, thick / 2), Math.max(1e-5, width / 2));
  const a = width / 2;
  const b = thick / 2;
  const perimeter = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  scaleUV(geo, perimeter, len);
  return swapUV(geo);
}

// ---------------------------------------------------------------------------------------------
// Chains & cords
// ---------------------------------------------------------------------------------------------
/**
 * Bead centres along a hanging "stadium" loop: top at y = 0, strands at x = ±r, bottom arc at
 * y = −len, beads `pitch` apart along the loop. Returns [x0, y0, x1, y1, …].
 */
export function beadLoop(r: number, len: number, pitch: number): Float32Array {
  const rr = Math.max(0.004, r);
  const L = Math.max(0.02, finite(len, 0.2));
  const p = Math.max(0.002, pitch);
  const total = 2 * L + 2 * Math.PI * rr;
  const n = Math.max(4, Math.floor(total / p));
  const out = new Float32Array(2 * n);
  for (let i = 0; i < n; i++) {
    const s = (i * total) / n;
    let x: number;
    let y: number;
    if (s < L) {
      x = rr;
      y = -s;
    } else if (s < L + Math.PI * rr) {
      const a = (s - L) / rr;
      x = rr * Math.cos(a);
      y = -L - rr * Math.sin(a);
    } else if (s < 2 * L + Math.PI * rr) {
      x = -rr;
      y = -L + (s - L - Math.PI * rr);
    } else {
      const a = (s - 2 * L - Math.PI * rr) / rr;
      x = -rr * Math.cos(a);
      y = rr * Math.sin(a);
    }
    out[2 * i] = x;
    out[2 * i + 1] = y;
  }
  return out;
}

/** Fills an InstancedMesh of BEAD spheres along a `beadLoop` hung from (x, y, z). */
export function fillBeads(mesh: THREE.InstancedMesh, loop: Float32Array, x: number, y: number, z: number, radius: number): void {
  const n = Math.min(loop.length / 2, mesh.instanceMatrix.count);
  for (let i = 0; i < n; i++) setInstance(mesh, i, x + loop[2 * i], y + loop[2 * i + 1], z, 0, 0, 0, radius, radius, radius);
  commitInstances(mesh, n);
}

/**
 * Closed "stadium" path in the XY plane: top at y = 0, strands at x = ±r down to y = -len.
 * `t` is split into four EQUAL quarters (right strand, bottom arc, left strand, top arc) and the
 * arc-length remapping is disabled, so a TubeGeometry spends a quarter of its segments on each
 * small semicircle instead of one or two (the arcs are < 2 % of the length of a long loop).
 */
class StadiumCurve extends THREE.Curve<THREE.Vector3> {
  constructor(
    private readonly r: number,
    private readonly len: number,
  ) {
    super();
  }

  getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const { r, len } = this;
    const u = clamp01(t) * 4;
    const k = Math.min(3, Math.floor(u));
    const f = u - k;
    switch (k) {
      case 0:
        return target.set(r, -len * f, 0); // right strand, downward
      case 1: {
        const a = Math.PI * f; // bottom semicircle
        return target.set(r * Math.cos(a), -len - r * Math.sin(a), 0);
      }
      case 2:
        return target.set(-r, -len + len * f, 0); // left strand, upward
      default: {
        const a = Math.PI * f; // top semicircle
        return target.set(-r * Math.cos(a), r * Math.sin(a), 0);
      }
    }
  }

  /** Identity: keep the quarter parametrisation instead of equal arc-length spacing. */
  getUtoTmapping(u: number): number {
    return clamp01(u);
  }
}

/** A thin tube following a hanging loop (cord loop). Origin = top of the loop. */
export function chainLoopGeometry(r: number, len: number, tube: number): THREE.TubeGeometry {
  return new THREE.TubeGeometry(new StadiumCurve(Math.max(0.004, r), Math.max(0.02, finite(len, 0.2))), 64, Math.max(0.0005, tube), 5, true);
}
