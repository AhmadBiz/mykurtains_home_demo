/**
 * Helpers shared by the FABRIC coverings only (Curtains, Sheers, RomanShade, CellularShade).
 * The slatted / rolled coverings (RollerBlind, VenetianBlind, VerticalBlind, Shutters) are owned
 * by another engineer and must NOT depend on this file (nor this file on ./slats.ts — the two
 * helpers deliberately duplicate the few inside-mount formulas they share).
 *
 * Everything here is pure three.js / React — no store access, no side effects beyond creating
 * disposable GPU resources that `useDisposable` frees again. All units are metres.
 *
 * Texture convention: every fabric geometry built here carries UVs in METRES (u along the flat
 * fabric, v up from the hem) and the PBR sets repeat at the real-world scale of the weave
 * (FABRIC_TILE: 30 cm for the velvet nap, 50 cm — the texture's true scale — for the linen,
 * turned by a few hundredths of a radian so a tile edge never lands as a horizontal band across
 * the panel) whatever the panel's size or gathering, so the structure stays visible from 1–2 m
 * instead of blurring into a few stripes or repeating as a line every fold.
 *
 * Reflections: fabric hangs inside the house, so every fabric material takes the indoor
 * environment (Lighting.tsx `useIndoorEnvironment`) as its envMap — seen from inside, the sky
 * HDRI is one flat tone, and the broad sheen of velvet and the voile need a varied environment
 * (the room environment's soft boxes) to brighten softly over the crests of the folds.
 */
import * as THREE from 'three';
import { useEffect, useMemo } from 'react';
import type { DependencyList } from 'react';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { usePbr } from '../materials';
import type { PbrSet } from '../materials';
import { FRAME_FACE } from '../windows/geometry';
import type { CoveringProps } from './types';

// ---------------------------------------------------------------------------------------------
// Small maths
// ---------------------------------------------------------------------------------------------
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const clamp01 = (v: number) => clamp(v, 0, 1);
/** `v` if it is a finite number, otherwise `fallback` (guards NaN / ±Infinity from bad data). */
export const finite = (v: number, fallback: number) => (Number.isFinite(v) ? v : fallback);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** A finite, clamped size so a degenerate opening never produces NaN / zero-size geometry. */
export const safeSize = (v: number, min = 0.05, max = 12) => clamp(finite(v, min), min, max);

/**
 * Quantise `open` (0..1) to 1/steps so a geometry keyed on it is rebuilt at most `steps` times
 * while the visitor drags the slider, instead of every frame.
 */
export const quantizeOpen = (open: number, steps = 20) => Math.round(clamp01(finite(open, 0)) * steps) / steps;

// ---------------------------------------------------------------------------------------------
// Props / placement
// ---------------------------------------------------------------------------------------------
/**
 * Props of the fabric coverings: the shared CoveringProps plus the room's ceiling height, which
 * the ceiling-mounted tracks need. `ceiling` is optional until the window component passes
 * LEVEL_BY_ID[level].ceilingHeight (see the report's requests); until then DEFAULT_CEILING is used.
 */
export interface FabricProps extends CoveringProps {
  /** Height of the room's ceiling above the floor (m). */
  ceiling?: number;
}

/** 9 ft — the ceiling height of the two main storeys (the basement is 8 ft). */
export const DEFAULT_CEILING = 2.743;

/**
 * Local y of the ceiling relative to the opening centre. The double-height stair window pokes
 * through the storey's ceiling: there the track goes 25 cm above the head of the opening.
 */
export function ceilingLocal(p: FabricProps): number {
  const height = safeSize(p.height);
  const c = finite(p.ceiling ?? DEFAULT_CEILING, DEFAULT_CEILING) - finite(p.sill, 0) - height / 2;
  return c < height / 2 + 0.05 ? height / 2 + 0.25 : c;
}

/** Clear opening inside the window's frame members (centred on the origin), never smaller than 4 cm. */
export function clearOpening(width: number, height: number): { innerW: number; innerH: number; innerTop: number; innerBottom: number } {
  const innerW = Math.max(0.04, safeSize(width) - 2 * FRAME_FACE);
  const innerH = Math.max(0.04, safeSize(height) - 2 * FRAME_FACE);
  return { innerW, innerH, innerTop: innerH / 2, innerBottom: -innerH / 2 };
}

/**
 * Room-side face of the deepest frame member inside the reveal (the central mullion of wide
 * windows, see ../windows/geometry.ts): inside-mounted shades keep everything in front of it.
 */
export const mullionFrontZ = (reveal: number) => -0.3 * Math.max(0.02, finite(reveal, 0.1));

// ---------------------------------------------------------------------------------------------
// Resource lifecycle
// ---------------------------------------------------------------------------------------------
interface Disposable {
  dispose(): void;
}

/**
 * `useMemo` for three.js resources (geometry / material / texture / a bundle of them): the previous
 * value is disposed whenever the deps change and on unmount. The factory may return null.
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

/** Merges parts into one geometry (RoundedBoxGeometry is non-indexed, so everything is flattened first). */
export function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((g) => {
    if (!g.index) return g;
    const f = g.toNonIndexed();
    g.dispose();
    return f;
  });
  const merged = mergeGeometries(flat, false);
  for (const g of flat) g.dispose();
  if (!merged) throw new Error('fabric: geometry merge failed');
  return merged;
}

/** Fills an InstancedMesh with axis-aligned unit instances at the given positions. */
export function fillInstances(mesh: THREE.InstancedMesh, positions: readonly (readonly [number, number, number])[]): void {
  const n = Math.min(positions.length, mesh.instanceMatrix.count);
  for (let i = 0; i < n; i++) {
    const [x, y, z] = positions[i];
    _m.makeTranslation(x, y, z);
    mesh.setMatrixAt(i, _m);
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (n > 0) mesh.computeBoundingSphere();
}
const _m = new THREE.Matrix4();

// ---------------------------------------------------------------------------------------------
// Fabric textures & materials
// ---------------------------------------------------------------------------------------------
export type FabricKind = 'linen' | 'velvet';
const VELVET_IDS = new Set(['navy', 'forest']);
/** Velvet for the two velvet catalogue colours, linen for everything else. */
export const fabricKind = (colorId: string): FabricKind => (VELVET_IDS.has(colorId) ? 'velvet' : 'linen');

/**
 * Real-world size of one tile of the weave (m). Both textures are 50 cm tiles: the linen is used
 * at its true scale; the velvet's nap is stretched to 30 cm and kept faint (FABRIC_NORMAL) so it
 * reads as the soft mottle of a crushed pile rather than a salt-and-pepper grain over the panel.
 */
export const FABRIC_TILE: Record<FabricKind, number> = { velvet: 0.3, linen: 0.5 };
/** Default normal strength per fabric. The velvet pile stays soft; makeDrapeMaterial lifts the linen weave on dark colours. */
const FABRIC_NORMAL: Record<FabricKind, number> = { velvet: 0.5, linen: 1 };
/** The linen tile is turned by this much (rad) so its edges never line up with the folds as a horizontal band. */
const LINEN_ROTATION = 0.05;

/**
 * Normal + roughness maps of the fabric (the colour comes from the catalogue), repeating every
 * FABRIC_TILE[kind] metres on geometry whose UVs are in metres. Suspends while the maps load
 * (under <Suspense>).
 */
export function useFabricMaps(kind: FabricKind, normalScale = FABRIC_NORMAL[kind]): PbrSet {
  const repeat = 1 / FABRIC_TILE[kind];
  const velvet = kind === 'velvet';
  return usePbr(velvet ? 'velour_velvet' : 'fabric_pattern_05', { repeat: [repeat, repeat], rotation: velvet ? 0 : LINEN_ROTATION, normalScale });
}

const WHITE = new THREE.Color('#ffffff');
/** The colour mixed toward white by `amount` (0..1) — a linear mix, so it desaturates quickly. */
export const lighten = (hex: string, amount: number): THREE.Color => new THREE.Color(hex).lerp(WHITE, amount);

/** Relative luminance (linear light, 0..1) of an sRGB hex: #3c3f45 anthracite ≈ 0.05, #5b6670 slate ≈ 0.13, #8fa58a sage ≈ 0.35. */
const luminance = (hex: string): number => {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};

const _hsl = { h: 0, s: 0, l: 0 };
/**
 * The colour of a velvet's sheen lobe: the hue kept, the lightness lifted by `lift` and the
 * saturation eased by `desaturate` (sRGB HSL), so navy velvet brightens to a lighter steel navy
 * over the crests of its folds (#1f2a4a → ≈ #556493 at lift 0.25) instead of the near-white grey a
 * plain mix toward white gives (#cccdd0 at 0.6), which reads as satin / plastic.
 */
export const sheenTint = (hex: string, lift: number, desaturate: number): THREE.Color => {
  const c = new THREE.Color(hex);
  c.getHSL(_hsl, THREE.SRGBColorSpace);
  return c.setHSL(_hsl.h, clamp01(_hsl.s - desaturate), clamp01(_hsl.l + lift), THREE.SRGBColorSpace);
};

export interface DrapeMaterialOptions {
  hex: string;
  kind: FabricKind;
  maps: PbrSet;
  /** Optional colour map (e.g. ticking stripes); the base colour then comes from the map. */
  map?: THREE.Texture | null;
  side?: THREE.Side;
  /** Indoor reflection environment (Lighting.tsx `useIndoorEnvironment`); null keeps scene.environment. */
  envMap?: THREE.Texture | null;
  /**
   * Multiply the colour by the geometry's `color` attribute (the cloth-shade noise written by
   * buildWavePanel). Only for geometries that carry one — a geometry without it renders black.
   */
  vertexColors?: boolean;
}

/**
 * Opaque fabric, two-sided, with the weave normal / roughness maps and the indoor environment:
 *  - linen: roughness 0.95, sheen 0.6 at sheenRoughness 0.5 in a tint slightly lighter than the
 *    colour. On dark colours (relative luminance below 0.2 — anthracite, indigo, slate) the weave
 *    normal contributes nothing to the diffuse and a dim sheen reads as one thin bright line on
 *    each crest, so the treatment slides (fully at luminance ≤ 0.1) to: normal strength 1.6, so
 *    the weave is read in the specular; sheenColor lightened by 0.45; roughness 0.9; sheenRoughness 0.7.
 *  - velvet: roughness 0.85, sheen 0.8 at sheenRoughness 0.75 in a lighter, slightly desaturated
 *    tint of the colour — one broad, soft sheen that brightens the crests of the ripple folds over
 *    5–10 cm and lets the troughs stay dark, the crush coming from the indoor environment's soft
 *    boxes (envMapIntensity 0.6) rather than a tight direct lobe, which drew a hard specular line
 *    on every crest and read as foil.
 */
export function makeDrapeMaterial(o: DrapeMaterialOptions): THREE.MeshPhysicalMaterial {
  const velvet = o.kind === 'velvet';
  // 0 on mid / light linen → 1 on the darkest colours; the velvet keeps its own treatment
  const dark = velvet ? 0 : 1 - smoothstep(0.1, 0.2, luminance(o.hex));
  const normal = velvet ? o.maps.normalScale.x : lerp(o.maps.normalScale.x, 1.6, dark);
  return new THREE.MeshPhysicalMaterial({
    color: o.map ? '#ffffff' : o.hex,
    map: o.map ?? null,
    vertexColors: o.vertexColors ?? false,
    normalMap: o.maps.normalMap ?? null,
    normalScale: new THREE.Vector2(normal, normal),
    roughnessMap: o.maps.roughnessMap ?? null,
    roughness: velvet ? 0.85 : lerp(0.95, 0.9, dark),
    metalness: 0,
    sheen: velvet ? 0.8 : 0.6,
    sheenColor: velvet ? sheenTint(o.hex, 0.25, 0.14) : lighten(o.hex, lerp(0.3, 0.45, dark)),
    sheenRoughness: velvet ? 0.75 : lerp(0.5, 0.7, dark),
    side: o.side ?? THREE.DoubleSide,
    envMap: o.envMap ?? null,
    envMapIntensity: 0.6,
  });
}

/**
 * Voile: transparent, no depth write, rough, with the linen weave at low strength and a soft white
 * sheen (0.4 at sheenRoughness 0.6) that draws the moiré of the gathered weave. An open weave lets
 * most of the light through, so its diffuse albedo is far below the catalogue colour (× 0.35) and
 * it takes the indoor environment faintly (0.2): a white DoubleSide plane at albedo 1, lit on both
 * faces by the unoccluded sky, clips to white in front of a window and hides the view. A sheer must
 * sit a little BELOW the view behind it, as a veil does.
 */
export function makeVoileMaterial(hex: string, opacity: number, maps: PbrSet, envMap: THREE.Texture | null = null): THREE.MeshPhysicalMaterial {
  const color = new THREE.Color(hex).multiplyScalar(0.35);
  return new THREE.MeshPhysicalMaterial({
    color,
    normalMap: maps.normalMap ?? null,
    normalScale: maps.normalScale,
    roughnessMap: maps.roughnessMap ?? null,
    roughness: 1,
    metalness: 0,
    sheen: 0.4,
    sheenColor: WHITE.clone(),
    sheenRoughness: 0.6,
    side: THREE.DoubleSide,
    transparent: true,
    opacity,
    depthWrite: false,
    envMap,
    envMapIntensity: 0.2,
  });
}

/** White powder-coated aluminium (tracks, carriers, end caps). */
export const makeTrackMaterial = () => new THREE.MeshStandardMaterial({ color: '#f3f3f1', roughness: 0.5, metalness: 0.3, envMapIntensity: 0.8 });
/** The dark slot under a track channel. */
export const makeSlotMaterial = () => new THREE.MeshStandardMaterial({ color: '#2e2e2c', roughness: 0.85, metalness: 0.1 });

// ---------------------------------------------------------------------------------------------
// Procedural textures
// ---------------------------------------------------------------------------------------------
/**
 * Draws into an offscreen canvas and wraps it in a repeating sRGB CanvasTexture. The texture is
 * tiny (a few KB) — scale it with `texture.repeat` (geometry UVs are in metres).
 */
export function makeCanvasTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx, width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------------------------
// Ripple-fold (wave-fold) panels on a ceiling track — the client's installation standard
// ---------------------------------------------------------------------------------------------
/** One full S-wave per 12 cm of covered track at 100 % fullness. */
export const WAVE_PERIOD = 0.12;
/** Track channel section (m): 2.4 cm wide, 1.6 cm tall, top face flush with the ceiling. */
export const TRACK_W = 0.024;
export const TRACK_H = 0.016;
/** Carrier (glider) under the channel: a 1 cm snap button; the fabric's top edge hangs `drop` below the channel. */
export const GLIDER = { w: 0.01, h: 0.008, d: 0.008, drop: 0.012 };
/** Width of the stack each panel compresses into when fully drawn back (≈ 18 % of the window, ≥ 30 cm). */
export const stackBackFor = (width: number) => Math.max(0.3, 0.18 * width);

export interface WaveParams {
  /** Covered (visible) length of the panel along the track (m). */
  covered: number;
  /** Drop of the panel (m). */
  height: number;
  /** Number of full S-waves across the panel — constant for a given curtain, so the waves tighten as it opens. */
  waves: number;
  /** Wave depth: vertices are displaced by ±amplitude in Z (m). */
  amplitude: number;
  segY?: number;
}

/**
 * Slow, smooth noise in −1..1 over the flat fabric (metres), periods 0.5–0.9 m — far above the
 * 12 cm wave, so successive folds pick up slightly different shades instead of repeating identically.
 */
function clothNoise(u: number, v: number): number {
  return 0.5 * Math.sin(u * 7.1 + v * 2.3 + 0.7) * Math.sin(v * 5.3 - u * 1.7 + 2.1) + 0.35 * Math.sin(u * 11.7 - v * 3.9 + 4.2) + 0.15 * Math.sin(v * 13.1 + u * 4.3 + 1.3);
}
/** Amplitude of the cloth-shade noise baked into the panel's vertex colours (±2 % lightness). */
const CLOTH_SHADE = 0.02;

/**
 * A ripple-fold panel: a PlaneGeometry in the XY plane (centred on the origin, facing +Z) whose
 * vertices follow a UNIFORM S-wave z = A·sin(2π·x/P) from the top edge to the hem (snap tape on
 * carriers — no pleated header, no flaring), with a faint breathing of the depth so the cloth
 * does not read as machined. Both side edges sit on carriers (zero crossings). UVs are in metres
 * along the flat fabric (its arc length) and up from the hem, so the weave compresses with the
 * panel. A `color` attribute carries a ±2 % lightness noise (clothNoise, in flat-fabric metres as
 * well) for materials with vertexColors, so no two folds are lit identically. Smooth vertex
 * normals. ≤ ~5 k vertices for the widest window of the house.
 */
export function buildWavePanel(p: WaveParams): THREE.BufferGeometry {
  const covered = Math.max(0.02, finite(p.covered, 0.02));
  const height = Math.max(0.02, finite(p.height, 0.02));
  const waves = Math.max(1, Math.round(finite(p.waves, 1)));
  const amplitude = finite(p.amplitude, 0);
  const segX = clamp(waves * 10, 24, 400);
  const segY = p.segY ?? 12;
  const geo = new THREE.PlaneGeometry(covered, height, segX, segY);
  const cols = segX + 1;
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  // arc length (flat fabric metres) at each column
  const arc = new Float32Array(cols);
  const dx = covered / segX;
  let zPrev = 0;
  for (let ix = 1; ix < cols; ix++) {
    const z = amplitude * Math.sin((ix / segX) * waves * Math.PI * 2);
    arc[ix] = arc[ix - 1] + Math.hypot(dx, z - zPrev);
    zPrev = z;
  }
  const shade = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const ix = i % cols;
    const u = ix / segX; // 0 = left edge, 1 = right edge
    const v = pos.getY(i) / height + 0.5; // 0 = hem, 1 = top edge
    const phase = u * waves * Math.PI * 2;
    const breathe = 1 + 0.04 * Math.sin(v * 7.3 + u * waves * 1.9) * Math.sin(v * Math.PI);
    pos.setZ(i, amplitude * breathe * Math.sin(phase));
    uv.setXY(i, arc[ix], v * height);
    const s = 1 + CLOTH_SHADE * clothNoise(arc[ix], v * height);
    shade[3 * i] = s;
    shade[3 * i + 1] = s;
    shade[3 * i + 2] = s;
  }
  pos.needsUpdate = true;
  uv.needsUpdate = true;
  geo.setAttribute('color', new THREE.BufferAttribute(shade, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/** x of every carrier (the zero crossings of the wave) of a panel of `covered` length centred at `cx`. */
export function carrierXs(cx: number, covered: number, waves: number): number[] {
  const n = 2 * Math.max(1, Math.round(waves));
  const xs: number[] = [];
  for (let k = 0; k <= n; k++) xs.push(cx - covered / 2 + (covered * k) / n);
  return xs;
}

/**
 * Ceiling track(s) with the ceiling at y = 0, running along X and centred on the window: one
 * channel per entry of `channelZs` (a double track for drapes + sheer), each with a dark slot
 * underneath and end caps; a double track also gets the flat bridging plate of a one-piece
 * double-channel profile. Returns the white body and the slots as two geometries.
 */
export function buildTrack(len: number, channelZs: number[]): { body: THREE.BufferGeometry; slot: THREE.BufferGeometry; dispose(): void } {
  const L = Math.max(0.1, finite(len, 0.1));
  const body: THREE.BufferGeometry[] = [];
  const slot: THREE.BufferGeometry[] = [];
  for (const z of channelZs) {
    body.push(new RoundedBoxGeometry(L, TRACK_H, TRACK_W, 1, 0.002).translate(0, -TRACK_H / 2, z));
    body.push(new THREE.BoxGeometry(0.012, TRACK_H + 0.004, TRACK_W + 0.004).translate(-L / 2 - 0.004, -TRACK_H / 2, z));
    body.push(new THREE.BoxGeometry(0.012, TRACK_H + 0.004, TRACK_W + 0.004).translate(L / 2 + 0.004, -TRACK_H / 2, z));
    slot.push(new THREE.BoxGeometry(L - 0.004, 0.003, 0.006).translate(0, -TRACK_H + 0.0005, z));
  }
  if (channelZs.length > 1) {
    const zMin = Math.min(...channelZs) - TRACK_W / 2;
    const zMax = Math.max(...channelZs) + TRACK_W / 2;
    body.push(new THREE.BoxGeometry(L, 0.004, zMax - zMin).translate(0, -0.002, (zMin + zMax) / 2));
  }
  const b = mergeParts(body);
  const s = mergeParts(slot);
  return {
    body: b,
    slot: s,
    dispose() {
      b.dispose();
      s.dispose();
    },
  };
}
