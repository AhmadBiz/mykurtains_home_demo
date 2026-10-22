/**
 * Helpers shared by the SLATTED / ROLLED coverings only (RollerBlind, VenetianBlind,
 * VerticalBlind, Shutters). The fabric coverings (Curtains, Sheers, RomanShade, CellularShade)
 * belong to another engineer and have their own helper (./fabric.ts); neither side depends on
 * the other.
 *
 * Everything here is pure three.js / React: no store access, no side effects beyond creating
 * GPU resources that `useDisposable` / `useInstancedMesh` free again. All units are metres.
 */
import * as THREE from 'three';
import { useEffect, useMemo } from 'react';
import type { DependencyList } from 'react';
import type { ColorOption } from '../../data/coverings';
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
// Shared unit geometries (scaled per mesh) and hardware materials — module singletons, never disposed
// ---------------------------------------------------------------------------------------------
/** 1 × 1 × 1 box centred on the origin. */
export const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
/** 1 × 1 plane in XY facing +Z. */
export const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);
/** Cylinder of radius 1 and length 1 along the X axis (scale = [length, r, r]). */
export const UNIT_CYL_X = new THREE.CylinderGeometry(1, 1, 1, 20, 1).rotateZ(Math.PI / 2);
/** Cylinder of radius 1 and length 1 along the Y axis (scale = [r, length, r]). */
export const UNIT_CYL_Y = new THREE.CylinderGeometry(1, 1, 1, 12, 1);

/** Hardware finishes shared by all slatted coverings. */
export const HARDWARE = {
  /** Painted steel / white plastic (brackets, headrails). */
  white: new THREE.MeshStandardMaterial({ color: '#f3f2ee', roughness: 0.5, metalness: 0.05 }),
  /** Nickel bead chain, cords. */
  metal: new THREE.MeshStandardMaterial({ color: '#b7bbc1', roughness: 0.35, metalness: 0.75 }),
  /** Dark bronze hinges. */
  dark: new THREE.MeshStandardMaterial({ color: '#45464a', roughness: 0.45, metalness: 0.6 }),
  /** Clear acrylic tilt wand. */
  clear: new THREE.MeshStandardMaterial({ color: '#e4e8ee', roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.65 }),
};

// ---------------------------------------------------------------------------------------------
// Colours & materials
// ---------------------------------------------------------------------------------------------
/** Lighten (amount > 0) or darken (amount < 0) a hex colour; returns a hex string. */
export function shade(hex: string, amount: number): string {
  const c = new THREE.Color(hex);
  c.lerp(new THREE.Color(amount > 0 ? '#ffffff' : '#000000'), clamp01(Math.abs(amount)));
  return `#${c.getHexString()}`;
}

export interface SlatMaterialOptions {
  roughness?: number;
  metalness?: number;
  /** Baked-colour texture (the colour is then white so the map shows as drawn). */
  map?: THREE.Texture | null;
  side?: THREE.Side;
  /** 0..1; < 1 makes the material transparent. */
  opacity?: number;
}

/**
 * A MeshStandardMaterial for a slat / vane / panel from a catalogue colour. The explicit options
 * win over the catalogue hints, which win over the defaults. The caller owns disposal.
 */
export function makeSlatMaterial(color: ColorOption, o: SlatMaterialOptions = {}): THREE.MeshStandardMaterial {
  const map = o.map ?? null;
  const opacity = clamp01(finite(o.opacity ?? 1, 1));
  return new THREE.MeshStandardMaterial({
    color: map ? '#ffffff' : color.hex,
    map,
    roughness: o.roughness ?? color.roughness ?? 0.6,
    metalness: o.metalness ?? color.metalness ?? 0,
    side: o.side ?? THREE.FrontSide,
    transparent: opacity < 1,
    opacity,
  });
}

// ---------------------------------------------------------------------------------------------
// Procedural wood grain (shared per colour, cached for the life of the page)
// ---------------------------------------------------------------------------------------------
const grainCache = new Map<string, THREE.CanvasTexture>();

/**
 * A tileable wood-grain CanvasTexture: the base colour with accent streaks running along U.
 * One texture per (hex, accent) pair is ever created; the same object is shared by every mesh
 * that uses it, so callers must NOT dispose it. Scale the grain with `scaleUV` on the geometry
 * (one texture period ≈ GRAIN_PERIOD metres along the grain).
 */
export function woodGrainTexture(hex: string, accent?: string): THREE.CanvasTexture {
  const dark = accent ?? shade(hex, -0.14);
  const key = `${hex}|${dark}`;
  const cached = grainCache.get(key);
  if (cached) return cached;

  const W = 512;
  const H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, W, H);
    // Deterministic pseudo-random so every build of the texture is identical.
    let seed = 20240917;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const light = shade(hex, 0.1);
    const TWO_PI_W = (Math.PI * 2) / W; // integer multiples of this tile seamlessly in U
    ctx.lineCap = 'round';
    for (let i = 0; i < 90; i++) {
      const y0 = rnd() * H;
      const amp = 1.5 + rnd() * 5;
      const k = 1 + Math.floor(rnd() * 5);
      const phase = rnd() * Math.PI * 2;
      const isDark = rnd() < 0.7;
      ctx.strokeStyle = isDark ? dark : light;
      ctx.globalAlpha = isDark ? 0.1 + rnd() * 0.28 : 0.12 + rnd() * 0.22;
      ctx.lineWidth = 0.6 + rnd() * 2.4;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 8) {
        const y = y0 + Math.sin(x * k * TWO_PI_W + phase) * amp + Math.sin(x * 3 * k * TWO_PI_W + phase * 2) * amp * 0.3;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  grainCache.set(key, tex);
  return tex;
}

/** Length of one grain-texture period along the grain (m). */
export const GRAIN_PERIOD = 0.45;

/** Multiplies the UVs of a geometry in place (texture tiling baked into the geometry). */
export function scaleUV(geo: THREE.BufferGeometry, su: number, sv: number): THREE.BufferGeometry {
  const uv = geo.getAttribute('uv');
  if (uv) {
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    uv.needsUpdate = true;
  }
  return geo;
}

/** Swaps U and V in place so a grain drawn along U runs along the geometry's V direction. */
export function swapUV(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const uv = geo.getAttribute('uv');
  if (uv) {
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), uv.getX(i));
    uv.needsUpdate = true;
  }
  return geo;
}

/**
 * A BoxGeometry translated to (x, y, z) whose UVs tile the wood grain along its long axis
 * (`along` = 'x' for rails / slats, 'y' for stiles). Harmless for untextured materials.
 */
export function grainBox(w: number, h: number, d: number, x = 0, y = 0, z = 0, along: 'x' | 'y' = 'x'): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(Math.max(1e-4, w), Math.max(1e-4, h), Math.max(1e-4, d));
  if (along === 'y') {
    swapUV(geo);
    scaleUV(geo, h / GRAIN_PERIOD, 1);
  } else {
    scaleUV(geo, w / GRAIN_PERIOD, 1);
  }
  geo.translate(x, y, z);
  return geo;
}

// ---------------------------------------------------------------------------------------------
// Chain loop (roller / vertical blind control chain)
// ---------------------------------------------------------------------------------------------
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

/** A thin tube following a hanging loop (bead chain / cord loop). Origin = top of the loop. */
export function chainLoopGeometry(r: number, len: number, tube: number): THREE.TubeGeometry {
  return new THREE.TubeGeometry(new StadiumCurve(Math.max(0.004, r), Math.max(0.02, finite(len, 0.2))), 64, Math.max(0.0005, tube), 5, true);
}
