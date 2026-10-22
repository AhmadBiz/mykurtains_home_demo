/**
 * Lawn, street + curbs, driveway (sloped slab + flat apron to the street), front walkway and
 * the rear patio flagstones. All heights follow HOUSE.gradeY / HOUSE.ramps.
 */
import * as THREE from 'three';
import { useMemo } from 'react';
import { COLORS, GRADE_Y, PAVING_LIFT, RAMPS, STREET } from './data';
import { asphaltTexture, concreteTexture, lawnTexture, mulberry32 } from './textures';
import { TriangleSoup, UP } from './geom';
import type { Vec3 } from './geom';
import { Instanced } from './Instanced';
import type { InstanceItem } from './Instanced';
import { useDispose } from './hooks';

const LAWN_SIZE = 240;
const STONE_COLORS = ['#a9a49a', '#9c978d', '#b3ada2', '#8f8a80', '#a39d92'];

export function Ground() {
  const dw = RAMPS.driveway;
  const pr = RAMPS.perron;
  const [dx1, dz1, dx2, dz2] = dw.bounds;
  const [px1, pz1, , pz2] = pr.bounds;
  const walkLen = px1 - STREET.x2;
  const walkW = pz2 - pz1;

  const lawnMap = useMemo(() => lawnTexture(), []);
  const asphaltMap = useMemo(() => asphaltTexture([1, 1]), []);
  const walkMap = useMemo(() => concreteTexture([walkLen / 1.5, walkW / 1.5]), [walkLen, walkW]);
  const lawnMat = useMemo(() => new THREE.MeshStandardMaterial({ map: lawnMap, roughness: 1 }), [lawnMap]);
  const asphaltMat = useMemo(() => new THREE.MeshStandardMaterial({ map: asphaltMap, roughness: 0.95 }), [asphaltMap]);
  const walkMat = useMemo(() => new THREE.MeshStandardMaterial({ map: walkMap, roughness: 0.9 }), [walkMap]);
  const curbMat = useMemo(() => new THREE.MeshStandardMaterial({ color: COLORS.curb, roughness: 0.9 }), []);
  const edgeMat = useMemo(() => new THREE.MeshStandardMaterial({ color: COLORS.concreteDark, roughness: 0.9 }), []);
  const roadMat = useMemo(() => new THREE.MeshStandardMaterial({ color: COLORS.road, roughness: 0.95 }), []);
  const stoneMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 }), []);
  const stoneGeom = useMemo(() => new THREE.BoxGeometry(0.55, 0.03, 0.55), []);
  useDispose(lawnMap, asphaltMap, walkMap, lawnMat, asphaltMat, walkMat, curbMat, edgeMat, roadMat, stoneMat, stoneGeom);

  // Driveway: flat apron from the street to the ramp's low end, then the sloped slab up to the garage.
  const { driveTop, driveSides } = useMemo(() => {
    const yLow = dw.y0 + PAVING_LIFT;
    const yHigh = dw.y1 + PAVING_LIFT;
    const yBot = GRADE_Y - 0.02;
    const xs = STREET.x2;
    const top = new TriangleSoup(2);
    top.quad([xs, yLow, dz1], [dx1, yLow, dz1], [dx1, yLow, dz2], [xs, yLow, dz2], UP);
    top.quad([dx1, yLow, dz1], [dx2, yHigh, dz1], [dx2, yHigh, dz2], [dx1, yLow, dz2], UP);
    const sides = new TriangleSoup(1).setUvAxes(0, 1);
    for (const [z, want] of [
      [dz1, [0, 0, -1]],
      [dz2, [0, 0, 1]],
    ] as [number, Vec3][]) {
      sides.quad([xs, yBot, z], [xs, yLow, z], [dx1, yLow, z], [dx1, yBot, z], want);
      sides.quad([dx1, yBot, z], [dx1, yLow, z], [dx2, yHigh, z], [dx2, yBot, z], want);
    }
    return { driveTop: top.build(), driveSides: sides.build() };
  }, [dw, dx1, dx2, dz1, dz2]);
  useDispose(driveTop, driveSides);

  // Curb on the house side, interrupted by the walkway and the driveway apron.
  const curbRuns = useMemo<[number, number][]>(
    () => [
      [-STREET.zHalf, pz1],
      [pz2, dz1],
      [dz2, STREET.zHalf],
    ],
    [pz1, pz2, dz1, dz2],
  );

  // Rear patio: a loose grid of flagstones at the foot of the balcony stairs.
  const stones = useMemo<InstanceItem[]>(() => {
    const bs = RAMPS.balcon;
    const [bx1, , bx2, bz2] = bs.bounds;
    const rnd = mulberry32(99);
    const items: InstanceItem[] = [];
    const cols = 5;
    const rows = 4;
    const pitch = 0.62;
    const x0 = (bx1 + bx2) / 2 - ((cols - 1) * pitch) / 2;
    const z0 = bz2 + 0.4;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const s = 0.88 + rnd() * 0.12;
        items.push({
          position: [x0 + c * pitch, GRADE_Y + 0.02, z0 + r * pitch],
          scale: [s, 1, s],
          rotation: [0, (rnd() - 0.5) * 0.1, 0],
          color: STONE_COLORS[(r * cols + c) % STONE_COLORS.length],
        });
      }
    }
    return items;
  }, []);

  const curbH = STREET.curbH + 0.02;
  const curbY = GRADE_Y - 0.02 + curbH / 2;

  return (
    <group name="ground">
      {/* lawn */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[6, GRADE_Y, 5]} material={lawnMat} receiveShadow>
        <planeGeometry args={[LAWN_SIZE, LAWN_SIZE]} />
      </mesh>

      {/* street */}
      <mesh position={[(STREET.x1 + STREET.x2) / 2, GRADE_Y - 0.0225, 0]} material={roadMat} receiveShadow>
        <boxGeometry args={[STREET.x2 - STREET.x1, 0.055, STREET.zHalf * 2]} />
      </mesh>
      {curbRuns.map(([za, zb], i) => (
        <mesh key={i} position={[STREET.x2 + STREET.curbW / 2, curbY, (za + zb) / 2]} material={curbMat} receiveShadow>
          <boxGeometry args={[STREET.curbW, curbH, zb - za]} />
        </mesh>
      ))}
      <mesh position={[STREET.x1 - STREET.curbW / 2, curbY, 0]} material={curbMat} receiveShadow>
        <boxGeometry args={[STREET.curbW, curbH, STREET.zHalf * 2]} />
      </mesh>

      {/* driveway */}
      <mesh geometry={driveTop} material={asphaltMat} receiveShadow />
      <mesh geometry={driveSides} material={edgeMat} />

      {/* front walkway */}
      <mesh position={[(STREET.x2 + px1) / 2, GRADE_Y, (pz1 + pz2) / 2]} material={walkMat} receiveShadow>
        <boxGeometry args={[walkLen, 0.04, walkW]} />
      </mesh>

      {/* rear patio */}
      <Instanced geometry={stoneGeom} material={stoneMat} items={stones} receiveShadow />
    </group>
  );
}
