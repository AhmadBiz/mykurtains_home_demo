/**
 * Helpers shared by the FABRIC coverings only (Curtains, Sheers, RomanShade, CellularShade).
 * The slatted / rolled coverings (RollerBlind, VenetianBlind, VerticalBlind, Shutters) are owned
 * by another engineer and must NOT depend on this file.
 *
 * Everything here is pure three.js / React — no store access, no side effects beyond creating
 * disposable GPU resources that `useDisposable` frees again.
 */
import * as THREE from 'three';
import { useEffect, useMemo } from 'react';
import type { DependencyList } from 'react';

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
export const safeSize = (v: number, min = 0.05, max = 12) => clamp(Number.isFinite(v) ? v : min, min, max);

/**
 * Quantise `open` (0..1) to 1/steps so a geometry keyed on it is rebuilt at most `steps` times
 * while the visitor drags the slider, instead of every frame.
 */
export const quantizeOpen = (open: number, steps = 20) =>
  Math.round(clamp01(Number.isFinite(open) ? open : 0) * steps) / steps;

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

// ---------------------------------------------------------------------------------------------
// Pleated fabric panel (drapes / voile)
// ---------------------------------------------------------------------------------------------
export interface PleatParams {
  /** Visible (gathered) width of the panel (m). */
  width: number;
  /** Drop of the panel (m). */
  height: number;
  /** Number of pleats (sine periods) across the panel. */
  pleats: number;
  /** Pleat depth: vertices are displaced by ±amplitude in Z (m). */
  amplitude: number;
  /** Amplitude multiplier applied at the header (top edge). Pleats are crisper / shallower there. */
  headerDamp?: number;
  /** Optional overrides of the mesh resolution. */
  segX?: number;
  segY?: number;
}

/**
 * A PlaneGeometry in the XY plane (centred on the origin, facing +Z) whose vertices are displaced
 * in Z by a sine wave to read as gathered fabric. `u = 0` is the LEFT edge, so a mirrored copy
 * (`scale={[-1, 1, 1]}`) gives the matching right-hand panel.
 */
export function buildPleatedPanel(p: PleatParams): THREE.BufferGeometry {
  const w = Math.max(0.02, finite(p.width, 0.02));
  const h = Math.max(0.02, finite(p.height, 0.02));
  const pleats = Math.max(1, finite(p.pleats, 1));
  const amplitude = finite(p.amplitude, 0);
  const segX = p.segX ?? clamp(Math.round(pleats * 4), 24, 72);
  const segY = p.segY ?? 8;
  const headerDamp = p.headerDamp ?? 0.5;

  const geo = new THREE.PlaneGeometry(w, h, segX, segY);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / w + 0.5; // 0 = left edge, 1 = right edge
    const v = pos.getY(i) / h + 0.5; // 0 = hem, 1 = header
    const damp = lerp(1, headerDamp, smoothstep(0.82, 1, v));
    const phase = u * pleats * Math.PI * 2;
    // main pleats + a half-frequency ripple so alternate pleats differ slightly (less "corrugated")
    const wave = Math.sin(phase) + 0.18 * Math.sin(phase * 0.5 + 1.3);
    pos.setZ(i, amplitude * damp * wave);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

// ---------------------------------------------------------------------------------------------
// Procedural textures
// ---------------------------------------------------------------------------------------------
/**
 * Draws into an offscreen canvas and wraps it in a repeating sRGB CanvasTexture. The texture is
 * tiny (a few KB) — scale it with `texture.repeat` or by scaling the geometry's UVs.
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
// Materials
// ---------------------------------------------------------------------------------------------
export interface FabricMaterialOptions {
  hex: string;
  roughness?: number;
  metalness?: number;
  /** 0..1; < 1 makes the material transparent. */
  opacity?: number;
  /** Defaults to true unless `opacity < 1` (voile / light-filtering fabrics). */
  depthWrite?: boolean;
  side?: THREE.Side;
  map?: THREE.Texture | null;
}

/** A MeshStandardMaterial tuned for cloth. The caller owns disposal (use `useDisposable`). */
export function makeFabricMaterial(o: FabricMaterialOptions): THREE.MeshStandardMaterial {
  const opacity = o.opacity ?? 1;
  const transparent = opacity < 1;
  return new THREE.MeshStandardMaterial({
    color: o.map ? '#ffffff' : o.hex,
    map: o.map ?? null,
    roughness: o.roughness ?? 0.95,
    metalness: o.metalness ?? 0,
    side: o.side ?? THREE.DoubleSide,
    transparent,
    opacity,
    depthWrite: o.depthWrite ?? !transparent,
  });
}
