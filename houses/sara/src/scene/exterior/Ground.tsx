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
import { GRASS_TILE, useAsphalt, useBlockWall, useConcrete, useLawnTextures, useMulch, usePavement } from './materials';
import { lawnMacroTextures } from './textures';
import { FLAT_HALF_X, FLAT_HALF_Z, LAWN_CELL, LAWN_CX, LAWN_CZ, LAWN_SIZE, lawnHeightAt } from './terrain';
import { useDispose } from './hooks';
import { LEVEL_BY_ID } from '../../data/geometry';

/**
 * Lawn albedo: the hue of a kept lawn (≈ 85°) over the desaturated, brightened aerial map
 * (materials.ts useLawnTextures), aiming at a lit lawn of about sRGB 85,115,45 — in the same
 * hue family as the hedge (111,153,89) and shrubs, which the ochre map never was.
 */
const LAWN_TINT = '#6fa746';
/** Detail layer: the grass normal sampled again at this tile (m) so the near 3 m carry grain; blade-grain tile of the roughness. */
const LAWN_DETAIL_TILE = 0.45;
const LAWN_BLADE_TILE = 0.3;
/** Contact shadow: alpha at the wall foot and the width of the fade (the shadow map draws the real porch shadow). */
const CONTACT_ALPHA = 0.12;
const CONTACT_WIDTH = 0.6;
/** Planting beds: distance from the wall face and total width. */
const BED_INNER = 0.15;
const BED_OUTER = 0.72;
/** Driveway retaining walls: thickness, kerb above the slab, 60 mm precast cap 25 mm proud with a 10 mm chamfer. */
const WALL_T = 0.2;
const KERB = 0.08;
const CAP_H = 0.06;
const CAP_PROUD = 0.025;
const CAP_CHAMFER = 0.01;
/** Clearance of the beds around the porch steps (their cheek walls stand 0.2 m outside the flight). */
const PERRON_CLEAR = 0.3;

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
  const grass = useLawnTextures();
  const macro = useMemo(() => lawnMacroTextures(), []);
  const lawn = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      map: grass.map,
      normalMap: grass.normalMap,
      roughnessMap: grass.roughnessMap,
      normalScale: new THREE.Vector2(0.8, 0.8),
      color: LAWN_TINT,
      roughness: 1,
      envMapIntensity: 1.0,
      aoMap: macro.aoMap,
      aoMapIntensity: 0.7,
      lightMap: macro.lightMap,
      lightMapIntensity: 0.12,
    });
    // aoMap only dims the indirect light; the same slow noise also modulates the albedo so the
    // large-scale variation shows in full sun (the orbit views), where the tile cadence was worst.
    // A second sample of the normal map at 0.45 m (50/50) and the 0.3 m blade-grain tile on the
    // albedo and roughness give the foreground 3–5 mm grain instead of a blurred smear.
    const macroScale = (GRASS_TILE / 37).toFixed(5);
    const bladeScale = (GRASS_TILE / LAWN_BLADE_TILE).toFixed(5);
    const detailScale = (GRASS_TILE / LAWN_DETAIL_TILE).toFixed(5);
    m.onBeforeCompile = (shader) => {
      shader.uniforms.lawnMacro = { value: macro.aoMap };
      shader.uniforms.lawnBlade = { value: macro.blade };
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D lawnMacro;\nuniform sampler2D lawnBlade;')
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>\n{\n\tfloat lawnMacroK = texture2D( lawnMacro, vMapUv * ${macroScale} ).r;\n\tfloat lawnBladeK = texture2D( lawnBlade, vMapUv * ${bladeScale} ).r;\n\tdiffuseColor.rgb *= mix( 1.0, lawnMacroK, 0.7 ) * mix( 0.86, 1.12, lawnBladeK );\n}`,
        )
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor *= mix( 0.8, 1.0, texture2D( lawnBlade, vMapUv * ${bladeScale} ).r );`)
        .replace(
          '#include <normal_fragment_maps>',
          THREE.ShaderChunk.normal_fragment_maps.replace(
            'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
            `vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;\n\tvec3 lawnDetailN = texture2D( normalMap, vNormalMapUv * ${detailScale} + vec2( 0.37, 0.61 ) ).xyz * 2.0 - 1.0;\n\tmapN = normalize( mix( mapN, lawnDetailN, 0.5 ) );`,
          ),
        );
    };
    m.customProgramCacheKey = () => 'lawn-detail';
    return m;
  }, [grass, macro]);
  const lawnOverlay = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: grass.mapRotated,
        normalMap: grass.normalMapRotated,
        roughnessMap: grass.roughnessMapRotated,
        normalScale: new THREE.Vector2(0.8, 0.8),
        color: LAWN_TINT,
        roughness: 1,
        envMapIntensity: 1.0,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    [grass],
  );
  const road = useAsphalt({ color: '#a9a8a4' });
  const drive = useAsphalt({ color: '#c0bfba', offset: [0.4, 0.2] });
  const curb = useConcrete(COLORS.curb);
  const block = useBlockWall();
  const pavement = usePavement();
  const mulch = useMulch();
  const contact = useMemo(() => new THREE.MeshBasicMaterial({ color: '#000000', vertexColors: true, transparent: true, depthWrite: false }), []);
  useDispose(contact, lawn, lawnOverlay, macro.aoMap, macro.lightMap, macro.blade);

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
          CAP_CHAMFER,
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
      growRect(RAMPS.perron.bounds, PERRON_CLEAR),
      // the basement wall under the porch's west face: no bed sliver between the porch and the lawn
      [PLATFORMS.perron.bounds[0] - 1.0, PLATFORMS.perron.bounds[1] - 0.6, PLATFORMS.perron.bounds[0], PLATFORMS.perron.bounds[3] + 0.6],
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
