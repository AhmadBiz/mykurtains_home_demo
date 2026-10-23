/**
 * Lawn (near the house: a flat textured plane with an exact hole under the basement and a
 * 90°-rotated 30 % overlay against tiling; beyond the yard: a displaced grid that rolls and rises
 * toward the horizon), large-scale brightness / scorch variation so the 4 m grass tile never
 * reads as a grid, a soft contact band around the house, street + curbs, the raised driveway
 * (sloped asphalt slab held between two capped block retaining walls), the front walkway, the
 * rear patio and the mulch planting beds along the foundation. All heights follow HOUSE.gradeY /
 * HOUSE.ramps / HOUSE.platforms; the far relief lives in terrain.ts.
 */
import * as THREE from 'three';
import { useMemo } from 'react';
import { COLORS, GRADE_Y, PATIO, PAVING_LIFT, PLATFORMS, RAMPS, STREET } from './data';
import { TriangleSoup, UP, edgeStrips, gridPlaneGeometry, growRect, mergeAll, metreBox, metreRoundedBox, offsetRectilinear, place, pointInPoly, rectContains, rectUnionGridMinus, ringGeometry, slabPrism } from './geom';
import type { Rect, Vec2 } from './geom';
import { useAsphalt, useBlockWall, useConcrete, useMulch, usePavement } from './materials';
import { lawnMacroTextures } from './textures';
import { FLAT_HALF_X, FLAT_HALF_Z, LAWN_CELL, LAWN_CX, LAWN_CZ, LAWN_SIZE, lawnHeightAt } from './terrain';
import { useDispose } from './hooks';
import { usePbr } from '../materials';
import { LEVEL_BY_ID } from '../../data/geometry';

/** Slight green tint over the (olive) aerial grass albedo so it reads as a kept lawn, without going cartoon against the trees. */
const LAWN_TINT = '#b3c998';
/** Contact shadow: alpha at the wall foot and the width of the fade. */
const CONTACT_ALPHA = 0.3;
const CONTACT_WIDTH = 1.5;
/** Planting beds: distance from the wall face and total width. */
const BED_INNER = 0.15;
const BED_OUTER = 0.72;
/** Driveway retaining walls: thickness, kerb above the slab, cap. */
const WALL_T = 0.2;
const KERB = 0.08;
const CAP_H = 0.08;
const CAP_PROUD = 0.03;

/** Grass set tiled every 4 m on the metre UVs. */
function useGrass(rotation = 0, offset: Vec2 = [0, 0]) {
  return usePbr('aerial_grass_rock', { repeat: [1 / 4, 1 / 4], normalScale: 0.7, anisotropy: 16, rotation, offset });
}

export function Ground() {
  const dw = RAMPS.driveway;
  const pr = RAMPS.perron;
  const [dx1, dz1, dx2, dz2] = dw.bounds;
  const [px1, pz1, , pz2] = pr.bounds;
  const walkLen = px1 - STREET.x2;
  const walkW = pz2 - pz1;
  const walkRect = useMemo<Rect>(() => [STREET.x2, pz1, px1, pz2], [pz1, pz2, px1]);
  const patioRect = useMemo<Rect>(() => {
    const [bx1, , bx2, bz2] = RAMPS.balcon.bounds;
    const cx = (bx1 + bx2) / 2;
    return [cx - PATIO.w / 2, bz2 + 0.05, cx + PATIO.w / 2, bz2 + 0.05 + PATIO.d];
  }, []);

  // ---- materials (metre-space, texture pack)
  const grass = useGrass();
  const grassRotated = useGrass(Math.PI / 2, [0.37, 0.61]);
  const macro = useMemo(() => lawnMacroTextures(), []);
  const lawn = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      ...grass.props,
      color: LAWN_TINT,
      roughness: 1,
      envMapIntensity: 0.45,
      aoMap: macro.aoMap,
      aoMapIntensity: 0.7,
      lightMap: macro.lightMap,
      lightMapIntensity: 0.25,
    });
    // aoMap only dims the indirect light; the same slow noise also modulates the albedo so the
    // large-scale variation shows in full sun (the orbit views), where the tile cadence was worst.
    m.onBeforeCompile = (shader) => {
      shader.uniforms.lawnMacro = { value: macro.aoMap };
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D lawnMacro;')
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= mix(1.0, texture2D(lawnMacro, vMapUv * 4.0 / 37.0).r, 0.7);');
    };
    return m;
  }, [grass, macro]);
  const lawnOverlay = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        ...grassRotated.props,
        color: LAWN_TINT,
        roughness: 1,
        envMapIntensity: 0.45,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    [grassRotated],
  );
  const road = useAsphalt({ color: '#a9a8a4' });
  const drive = useAsphalt({ color: '#c0bfba', offset: [0.4, 0.2] });
  const curb = useConcrete(COLORS.curb);
  const block = useBlockWall();
  const pavement = usePavement();
  const mulch = useMulch();
  const contact = useMemo(() => new THREE.MeshBasicMaterial({ color: '#000000', vertexColors: true, transparent: true, depthWrite: false }), []);
  useDispose(contact, lawn, lawnOverlay, macro.aoMap, macro.lightMap);

  // ---- near lawn: flat plane over the yard with a hole under the basement footprint (the grade
  // sits 1 cm below a basement visitor's eye, so a solid plane would show as a green line through
  // every basement room).
  const lawnGeom = useMemo(() => {
    const shape = new THREE.Shape([
      new THREE.Vector2(-FLAT_HALF_X, -FLAT_HALF_Z),
      new THREE.Vector2(FLAT_HALF_X, -FLAT_HALF_Z),
      new THREE.Vector2(FLAT_HALF_X, FLAT_HALF_Z),
      new THREE.Vector2(-FLAT_HALF_X, FLAT_HALF_Z),
    ]);
    // mesh frame: rotation -PI/2 about X at (LAWN_CX, GRADE_Y, LAWN_CZ) → local x = X - cx, local y = cz - Z
    shape.holes.push(new THREE.Path(LEVEL_BY_ID.basement.outline.map(([x, z]) => new THREE.Vector2(x - LAWN_CX, LAWN_CZ - z))));
    // ShapeGeometry UVs are the raw shape coordinates, i.e. metres — exactly what the metre-space materials expect.
    return new THREE.ShapeGeometry(shape, 1);
  }, []);

  // ---- far lawn: 2 m grid from the flat rectangle out to the edge, displaced by terrain.ts
  // (zero lift on the shared boundary, so the two planes meet exactly), smooth normals.
  const farLawnGeom = useMemo(() => {
    const n = Math.round(LAWN_SIZE / LAWN_CELL);
    const cols = n + 1;
    const half = LAWN_SIZE / 2;
    const pos = new Float32Array(cols * cols * 3);
    const uv = new Float32Array(cols * cols * 2);
    for (let j = 0; j < cols; j++) {
      const z = LAWN_CZ - half + j * LAWN_CELL;
      for (let i = 0; i < cols; i++) {
        const x = LAWN_CX - half + i * LAWN_CELL;
        const k = j * cols + i;
        pos[k * 3] = x;
        pos[k * 3 + 1] = lawnHeightAt(x, z);
        pos[k * 3 + 2] = z;
        uv[k * 2] = x - LAWN_CX;
        uv[k * 2 + 1] = LAWN_CZ - z;
      }
    }
    const index: number[] = [];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const cx = LAWN_CX - half + (i + 0.5) * LAWN_CELL;
        const cz = LAWN_CZ - half + (j + 0.5) * LAWN_CELL;
        if (Math.abs(cx - LAWN_CX) < FLAT_HALF_X && Math.abs(cz - LAWN_CZ) < FLAT_HALF_Z) continue;
        const a = j * cols + i;
        const b = a + 1;
        const c = a + cols + 1;
        const d = a + cols;
        index.push(a, c, b, a, d, c); // counter-clockwise seen from above
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(index);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }, []);

  // ---- contact shadow ring around the ground-floor walls
  const ringGeom = useMemo(() => {
    const outline = LEVEL_BY_ID.ground.outline as Vec2[];
    return ringGeometry(offsetRectilinear(outline, BED_INNER), offsetRectilinear(outline, BED_INNER + CONTACT_WIDTH), GRADE_Y + 0.006, CONTACT_ALPHA, 0);
  }, []);

  // ---- driveway: flat apron from the street to the ramp's low end, then the sloped slab up to the
  // garage, held between two block retaining walls (kerb above the slab, proud cap) that end at the house
  const { driveTop, wallGeom, capGeom } = useMemo(() => {
    const yLow = dw.y0 + PAVING_LIFT;
    const yHigh = dw.y1 + PAVING_LIFT;
    const xs = STREET.x2;
    const slabY = (x: number) => (x <= dx1 ? yLow : yLow + ((yHigh - yLow) * (x - dx1)) / (dx2 - dx1));
    const top = new TriangleSoup(1);
    top.quad([xs, yLow, dz1], [dx1, yLow, dz1], [dx1, yLow, dz2], [xs, yLow, dz2], UP);
    top.quad([dx1, yLow, dz1], [dx2, yHigh, dz1], [dx2, yHigh, dz2], [dx1, yLow, dz2], UP);
    const walls = new TriangleSoup(1);
    const caps = new TriangleSoup(1);
    const xw = xs + STREET.curbW; // the walls start behind the street curb
    const footing = () => GRADE_Y - 0.3;
    for (const [za, zb] of [
      [dz1 - WALL_T, dz1],
      [dz2, dz2 + WALL_T],
    ]) {
      for (const [xa, xb] of [
        [xw, dx1],
        [dx1, dx2],
      ]) {
        slabPrism(walls, xa, za, xb, zb, footing, (x) => slabY(x) + KERB);
        slabPrism(
          caps,
          xa === xw ? xa - CAP_PROUD : xa,
          za - CAP_PROUD,
          xb,
          zb + CAP_PROUD,
          (x) => slabY(x) + KERB - 0.005,
          (x) => slabY(x) + KERB + CAP_H,
        );
      }
    }
    return { driveTop: top.build(), wallGeom: walls.build(), capGeom: caps.build() };
  }, [dw, dx1, dx2, dz1, dz2]);

  // ---- street slab and curbs (one merged geometry)
  const streetGeom = useMemo(() => place(metreBox(STREET.x2 - STREET.x1, 0.06, STREET.zHalf * 2), [(STREET.x1 + STREET.x2) / 2, GRADE_Y - 0.0225, 0]), []);
  const curbGeom = useMemo(() => {
    const h = STREET.curbH + 0.02;
    const y = GRADE_Y - 0.02 + h / 2;
    const runs: [number, number][] = [
      [-STREET.zHalf, pz1],
      [pz2, dz1],
      [dz2, STREET.zHalf],
    ];
    const parts = runs.map(([za, zb]) => place(metreBox(STREET.curbW, h, zb - za), [STREET.x2 + STREET.curbW / 2, y, (za + zb) / 2]));
    parts.push(place(metreBox(STREET.curbW, h, STREET.zHalf * 2), [STREET.x1 - STREET.curbW / 2, y, 0]));
    return mergeAll(parts);
  }, [pz1, pz2, dz1, dz2]);

  // ---- walkway + patio: bevelled flagstone slabs
  const walkGeom = useMemo(() => place(metreRoundedBox(walkLen, 0.06, walkW, 0.01, { offset: [0.3, 0.2] }), [(STREET.x2 + px1) / 2, GRADE_Y, (pz1 + pz2) / 2]), [walkLen, walkW, px1, pz1, pz2]);
  const patioGeom = useMemo(
    () => place(metreRoundedBox(PATIO.w, 0.06, PATIO.d, 0.01, { offset: [1.1, 0.7] }), [(patioRect[0] + patioRect[2]) / 2, GRADE_Y, (patioRect[1] + patioRect[3]) / 2]),
    [patioRect],
  );

  // ---- planting beds: a mulch strip along every exterior wall foot, minus paved / built areas
  const bedGeom = useMemo(() => {
    const ground = LEVEL_BY_ID.ground.outline as Vec2[];
    const basement = LEVEL_BY_ID.basement.outline as Vec2[];
    const strips = [...edgeStrips(ground, BED_INNER, BED_OUTER, BED_OUTER - BED_INNER), ...edgeStrips(basement, BED_INNER, BED_OUTER, BED_OUTER - BED_INNER)];
    const cuts: Rect[] = [
      growRect(PLATFORMS.perron.bounds, 0.12),
      growRect(RAMPS.perron.bounds, 0.1),
      growRect([dx1, dz1 - WALL_T, dx2, dz2 + WALL_T], 0.1),
      growRect(walkRect, 0.1),
      growRect(RAMPS.balcon.bounds, 0.12),
      growRect(PLATFORMS.sideLanding.bounds, 0.1),
      growRect(RAMPS.side.bounds, 0.1),
      growRect(patioRect, 0.1),
      [STREET.x1 - 1, -STREET.zHalf, STREET.x2 + STREET.curbW + 0.1, STREET.zHalf],
    ];
    const omit = (x: number, z: number) => pointInPoly(x, z, ground) || pointInPoly(x, z, basement) || cuts.some((r) => rectContains(r, x, z));
    return gridPlaneGeometry(rectUnionGridMinus(strips, cuts, omit), GRADE_Y + 0.03, 'up');
  }, [walkRect, patioRect, dx1, dx2, dz1, dz2]);

  useDispose(lawnGeom, farLawnGeom, ringGeom, driveTop, wallGeom, capGeom, streetGeom, curbGeom, walkGeom, patioGeom, bedGeom);

  return (
    <group name="ground">
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[LAWN_CX, GRADE_Y, LAWN_CZ]} material={lawn} geometry={lawnGeom} receiveShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[LAWN_CX, GRADE_Y + 0.002, LAWN_CZ]} material={lawnOverlay} geometry={lawnGeom} receiveShadow renderOrder={-2} />
      <mesh geometry={farLawnGeom} material={lawn} receiveShadow />
      <mesh geometry={ringGeom} material={contact} renderOrder={-1} />
      <mesh geometry={streetGeom} material={road} receiveShadow />
      <mesh geometry={curbGeom} material={curb} receiveShadow castShadow />
      <mesh geometry={driveTop} material={drive} receiveShadow />
      <mesh geometry={wallGeom} material={block} receiveShadow castShadow />
      <mesh geometry={capGeom} material={curb} receiveShadow castShadow />
      <mesh geometry={walkGeom} material={pavement} receiveShadow />
      <mesh geometry={patioGeom} material={pavement} receiveShadow />
      <mesh geometry={bedGeom} material={mulch} receiveShadow />
    </group>
  );
}
