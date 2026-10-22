/**
 * Three overlapping hip roofs (4:12, 0.45 m eaves) over the upper storey, with one union soffit
 * plane (no overlapping faces) and fascia boards along the combined outer edge only.
 * Hidden in orbit (dollhouse) mode so the floor plans stay visible.
 */
import * as THREE from 'three';
import { useMemo } from 'react';
import { LEVEL_BY_ID } from '../../data/geometry';
import { FT } from '../../data/types';
import { useStore } from '../../store/useStore';
import { COLORS } from './data';
import { gridBoundary, gridPlaneGeometry, growRect, hipRoofGeometry, rectUnionGrid } from './geom';
import type { Rect, Vec3 } from './geom';
import { shingleTexture } from './textures';
import { useDispose } from './hooks';

/** Roof rectangles (feet, wall centre-lines): R1 west block, R2 living/dining block, R3 kitchen. */
const ROOF_RECTS_FT: Rect[] = [
  [0, 3, 25, 33.5],
  [20.5, 0, 43, 12.5],
  [20.5, 12.5, 33.5, 20.5],
];
const EAVE = 0.45;
const SLOPE = 1 / 3; // 4:12
const FASCIA_T = 0.06;
const FASCIA_ABOVE = 0.02; // lip above the shingle edge
/** Soffit depth under the eave line: stays above the upper ceiling (wallTop − ceiling = 0.15 m). */
const SOFFIT_DROP = 0.12;
const UV_SCALE = 1.2; // metres per shingle tile (8 courses)

const ftRect = (r: Rect): Rect => [r[0] * FT, r[1] * FT, r[2] * FT, r[3] * FT];

export function HipRoofs() {
  const mode = useStore((s) => s.mode);
  const baseY = LEVEL_BY_ID.upper.wallTop;
  const rects = useMemo(() => ROOF_RECTS_FT.map((r) => growRect(ftRect(r), EAVE)), []);

  const shingleMap = useMemo(() => shingleTexture([1, 1]), []);
  const shingle = useMemo(() => new THREE.MeshStandardMaterial({ map: shingleMap, roughness: 0.95 }), [shingleMap]);
  const fascia = useMemo(() => new THREE.MeshStandardMaterial({ color: COLORS.fascia, roughness: 0.7 }), []);
  const soffit = useMemo(() => new THREE.MeshStandardMaterial({ color: COLORS.soffit, roughness: 0.9 }), []);

  const roofGeoms = useMemo(() => rects.map((r) => hipRoofGeometry(r, baseY, SLOPE, UV_SCALE)), [rects, baseY]);
  const { soffitGeom, fasciaBoxes } = useMemo(() => {
    const grid = rectUnionGrid(rects);
    const fasciaH = SOFFIT_DROP + FASCIA_ABOVE;
    const fy = baseY + FASCIA_ABOVE - fasciaH / 2;
    const boxes = gridBoundary(grid).map((s): { position: Vec3; size: Vec3 } => {
      const len = s.to - s.from + FASCIA_T; // slight overlap closes the corners
      const mid = (s.from + s.to) / 2;
      const inner = s.at - s.outward * (FASCIA_T / 2);
      return s.axis === 'x'
        ? { position: [mid, fy, inner], size: [len, fasciaH, FASCIA_T] }
        : { position: [inner, fy, mid], size: [FASCIA_T, fasciaH, len] };
    });
    return { soffitGeom: gridPlaneGeometry(grid, baseY - SOFFIT_DROP, 'down', 1), fasciaBoxes: boxes };
  }, [rects, baseY]);
  useDispose(shingleMap, shingle, fascia, soffit, soffitGeom, roofGeoms[0], roofGeoms[1], roofGeoms[2]);

  return (
    <group name="roof" visible={mode !== 'orbit'}>
      {roofGeoms.map((g, i) => (
        <mesh key={i} geometry={g} material={shingle} castShadow receiveShadow />
      ))}
      <mesh geometry={soffitGeom} material={soffit} />
      {fasciaBoxes.map((b, i) => (
        <mesh key={i} position={b.position} material={fascia} castShadow>
          <boxGeometry args={b.size} />
        </mesh>
      ))}
    </group>
  );
}
