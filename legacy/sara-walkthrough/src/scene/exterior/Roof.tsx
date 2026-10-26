/**
 * The hip roof over the upper storey: one exact constant-pitch surface over the union of the
 * three roof rectangles (see roof.ts — ridges meet, valleys run from the inside corners, no
 * troughs or gaps), slates at real-world scale with the courses horizontal on every face,
 * shingle caps on the ridges and hips, white aluminium fascia, a vented soffit, half-round gutters
 * along every eave and two downspouts. Hidden in orbit (dollhouse) mode so the plans stay visible.
 */
import * as THREE from 'three';
import { useMemo } from 'react';
import { LEVEL_BY_ID } from '../../data/geometry';
import { FT } from '../../data/types';
import { useStore } from '../../store/useStore';
import { EXT_HALF_WALL, GRADE_Y } from './data';
import { cylinderBetween, edgeOutwardNormal, gridBoundary, gridPlaneGeometry, growRect, halfPipeUnit, mergeAll, metreBox, place, rectUnionGrid, slopedBox } from './geom';
import type { Rect, Vec2, Vec3 } from './geom';
import { buildRoofSurface } from './roof';
import { SLATE_TILE, useSlateTextures, useWhiteTrim } from './materials';
import { soffitVentTexture } from './textures';
import { useDispose } from './hooks';

/**
 * Roof rectangles (feet, wall centre-lines), following the UPPER-storey outline: the west block
 * is split at Z = 12.5 because the upper wall steps back to X = 4 over the bathroom / stair bay
 * (Z 3–12.5), so the eave keeps its 1.5 ft overhang there instead of a 5.5 ft floating slab;
 * then the living / dining block and the kitchen.
 */
const ROOF_RECTS_FT: Rect[] = [
  [4, 3, 25, 12.5],
  [0, 12.5, 25, 33.5],
  [20.5, 0, 43, 12.5],
  [20.5, 12.5, 33.5, 20.5],
];
/** Eave overhang (feet) — on the plan's 0.5 ft module so the roof grid stays exact. */
const EAVE_FT = 2.0;
/**
 * 8:12. A 6:12 roof with a 1.5 ft eave showed only as a thin grey sliver above the fascia from
 * the street (the eave is 5.3 m above the eye) and as a flat lid from the rear garden; at 8:12
 * with a 2 ft eave the slope is visible from eye level at 12–15 m and the ridge / hip caps read.
 */
const SLOPE = 2 / 3;
const CELL_FT = 0.25;
const FASCIA_T = 0.03;
const FASCIA_H = 0.19;
const FASCIA_ABOVE = 0.015; // lip above the slate edge
/** Soffit depth under the eave line: stays above the upper ceiling (wallTop − ceiling = 0.15 m). */
const SOFFIT_DROP = 0.12;
/** 1×6 frieze board on the wall under the soffit, 2 cm proud of the siding. */
const FRIEZE_H = 0.14;
const FRIEZE_T = 0.02;
const GUTTER_R = 0.065;
const PIPE_R = 0.04;

const ftRect = (r: Rect): Rect => [r[0] * FT, r[1] * FT, r[2] * FT, r[3] * FT];

export function HipRoofs() {
  const mode = useStore((s) => s.mode);
  const eaveY = LEVEL_BY_ID.upper.wallTop;
  const rects = useMemo(() => ROOF_RECTS_FT.map((r) => growRect(ftRect(r), EAVE_FT * FT)), []);

  const slateTex = useSlateTextures();
  const slate = useMemo(
    () => new THREE.MeshStandardMaterial({ map: slateTex.map, normalMap: slateTex.normalMap, roughnessMap: slateTex.roughnessMap, normalScale: new THREE.Vector2(1, 1), color: '#d9d9d9', roughness: 1, envMapIntensity: 0.55 }),
    [slateTex],
  );
  const cap = useMemo(() => {
    const clone = (t: THREE.Texture) => {
      const c = t.clone();
      c.repeat.set(1 / 0.6, 1 / 6.75);
      c.needsUpdate = true;
      return c;
    };
    return new THREE.MeshStandardMaterial({ map: clone(slateTex.map), normalMap: clone(slateTex.normalMap), roughnessMap: clone(slateTex.roughnessMap), color: '#e6e6e6', roughness: 1, envMapIntensity: 0.55 });
  }, [slateTex]);
  const trim = useWhiteTrim();
  const gutterMat = useMemo(() => {
    const m = trim.clone();
    m.side = THREE.DoubleSide;
    return m;
  }, [trim]);
  const vent = useMemo(() => soffitVentTexture(), []);
  const soffit = useMemo(() => new THREE.MeshStandardMaterial({ map: vent.map, color: '#ffffff', roughness: 0.6, envMapIntensity: 0.6 }), [vent]);

  const surface = useMemo(() => buildRoofSurface({ rects, eaveY, slope: SLOPE, cell: CELL_FT * FT, tile: SLATE_TILE }), [rects, eaveY]);

  const capGeom = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    for (const s of surface.ridges) parts.push(slopedBox(s.from, s.to, 0.26, 0.05));
    for (const s of surface.hips) parts.push(slopedBox(s.from, s.to, 0.24, 0.05));
    // small end blocks so the caps do not float at the eave corners
    for (const s of surface.hips) {
      const low = s.from[1] < s.to[1] ? s.from : s.to;
      parts.push(place(metreBox(0.24, 0.05, 0.1), [low[0], low[1] + 0.005, low[2]]));
    }
    return mergeAll(parts);
  }, [surface]);

  const { soffitGeom, fasciaGeom, gutterGeom } = useMemo(() => {
    const grid = rectUnionGrid(rects);
    const fy = eaveY + FASCIA_ABOVE - FASCIA_H / 2;
    const fascia: THREE.BufferGeometry[] = [];
    const gutters: THREE.BufferGeometry[] = [];
    for (const s of gridBoundary(grid)) {
      const len = s.to - s.from + FASCIA_T; // slight overlap closes the corners
      const mid = (s.from + s.to) / 2;
      const inner = s.at - s.outward * (FASCIA_T / 2);
      const gAt = s.at + s.outward * (GUTTER_R + 0.012);
      const gLen = s.to - s.from + 2 * GUTTER_R;
      const gy = eaveY - 0.012;
      if (s.axis === 'x') {
        fascia.push(place(metreBox(len, FASCIA_H, FASCIA_T), [mid, fy, inner]));
        gutters.push(halfPipeUnit(GUTTER_R).scale(gLen, 1, 1).translate(mid, gy, gAt));
      } else {
        fascia.push(place(metreBox(FASCIA_T, FASCIA_H, len), [inner, fy, mid]));
        gutters.push(halfPipeUnit(GUTTER_R).rotateY(Math.PI / 2).scale(1, 1, gLen).translate(gAt, gy, mid));
      }
    }
    // frieze: a board along every upper-storey wall face, just under the soffit
    const outline = LEVEL_BY_ID.upper.outline as Vec2[];
    const fz = eaveY - SOFFIT_DROP - FRIEZE_H / 2;
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i];
      const b = outline[(i + 1) % outline.length];
      const [nx, nz] = edgeOutwardNormal(outline, i);
      const off = EXT_HALF_WALL + FRIEZE_T / 2;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) + 2 * (EXT_HALF_WALL + FRIEZE_T); // overlaps close the corners
      const mid: Vec3 = [(a[0] + b[0]) / 2 + nx * off, fz, (a[1] + b[1]) / 2 + nz * off];
      fascia.push(place(Math.abs(nx) > 0.5 ? metreBox(FRIEZE_T, FRIEZE_H, len, { swap: true }) : metreBox(len, FRIEZE_H, FRIEZE_T), mid));
    }
    return { soffitGeom: gridPlaneGeometry(grid, eaveY - SOFFIT_DROP, 'down'), fasciaGeom: mergeAll(fascia), gutterGeom: mergeAll(gutters) };
  }, [rects, eaveY]);

  // Two downspouts hugging the wall corners: front-south (garage corner) and rear-north.
  const pipeGeom = useMemo(() => {
    const x0 = Math.min(...rects.map((r) => r[0]));
    const x1 = Math.max(...rects.map((r) => r[2]));
    const z0 = Math.min(...rects.map((r) => r[1]));
    const z1 = Math.max(...rects.map((r) => r[3]));
    const wallHalf = 0.5 * FT;
    const gTop = eaveY - 0.012 - GUTTER_R;
    const specs: { pipe: [number, number]; gutter: [number, number] }[] = [
      { pipe: [-wallHalf - 0.06, z1 - EAVE_FT * FT + wallHalf + 0.06], gutter: [x0 - GUTTER_R - 0.012, z1 - EAVE_FT * FT + wallHalf + 0.06] },
      { pipe: [x1 - EAVE_FT * FT + wallHalf + 0.06, -wallHalf - 0.06], gutter: [x1 - EAVE_FT * FT + wallHalf + 0.06, z0 - GUTTER_R - 0.012] },
    ];
    const parts: THREE.BufferGeometry[] = [];
    for (const { pipe, gutter } of specs) {
      const top = gTop - 0.35;
      const foot: Vec3 = [pipe[0], GRADE_Y - 0.02, pipe[1]];
      parts.push(cylinderBetween(foot, [pipe[0], top, pipe[1]], PIPE_R));
      parts.push(cylinderBetween([pipe[0], top, pipe[1]], [gutter[0], gTop - 0.08, gutter[1]], PIPE_R));
      parts.push(cylinderBetween([gutter[0], gTop - 0.08, gutter[1]], [gutter[0], gTop + 0.03, gutter[1]], PIPE_R));
      // wall straps
      for (const y of [top - 0.6, top - 2.6, top - 4.6]) parts.push(place(metreBox(PIPE_R * 2 + 0.03, 0.03, PIPE_R * 2 + 0.03), [pipe[0], y, pipe[1]]));
    }
    return mergeAll(parts);
  }, [rects, eaveY]);

  useDispose(slate, cap, gutterMat, soffit, vent.map, surface.geometry, capGeom, soffitGeom, fasciaGeom, gutterGeom, pipeGeom);

  return (
    <group name="roof" visible={mode !== 'orbit'}>
      <mesh geometry={surface.geometry} material={slate} castShadow receiveShadow />
      <mesh geometry={capGeom} material={cap} castShadow />
      <mesh geometry={soffitGeom} material={soffit} />
      <mesh geometry={fasciaGeom} material={trim} castShadow />
      <mesh geometry={gutterGeom} material={gutterMat} castShadow />
      <mesh geometry={pipeGeom} material={trim} castShadow />
    </group>
  );
}
