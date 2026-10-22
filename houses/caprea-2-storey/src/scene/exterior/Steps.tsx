/**
 * Real steps for every exterior ramp with steps > 0: poured concrete blocks for the porch and
 * side-door steps, a wooden stair (treads, risers, stringers, handrails) for the balcony.
 * The driveway (steps = 0) is a smooth slab drawn in Ground.tsx.
 */
import * as THREE from 'three';
import { useMemo } from 'react';
import type { StairFlight } from '../../data/types';
import { COLORS, GRADE_Y, RAMPS, balconyStairRailX } from './data';
import { stepBlocks, stepRuns } from './geom';
import type { Vec3 } from './geom';
import { plankTexture } from './textures';
import { SlopedBox } from './SlopedBox';
import { useDispose } from './hooks';

const TREAD_T = 0.04;
const NOSING = 0.03;
const RISER_T = 0.025;
const STRINGER_H = 0.25;
const RAIL_H = 0.95;

export function ExteriorSteps() {
  const concrete = useMemo(() => new THREE.MeshStandardMaterial({ color: COLORS.concrete, roughness: 0.9 }), []);
  const treadMap = useMemo(() => plankTexture({ base: [138, 106, 75], variation: 0.12, planks: 8, gap: 2, seed: 5, repeat: [1, 2] }), []);
  const tread = useMemo(() => new THREE.MeshStandardMaterial({ map: treadMap, roughness: 0.85 }), [treadMap]);
  const frame = useMemo(() => new THREE.MeshStandardMaterial({ color: COLORS.post, roughness: 0.85 }), []);
  useDispose(concrete, treadMap, tread, frame);

  const concreteBlocks = useMemo(() => [...stepBlocks(RAMPS.perron, GRADE_Y - 0.02), ...stepBlocks(RAMPS.side, GRADE_Y - 0.02)], []);

  return (
    <group name="exterior-steps">
      {concreteBlocks.map((b, i) => (
        <mesh key={i} position={b.center} material={concrete} castShadow receiveShadow>
          <boxGeometry args={b.size} />
        </mesh>
      ))}
      <WoodStairs flight={RAMPS.balcon} tread={tread} frame={frame} />
    </group>
  );
}

interface WoodProps {
  flight: StairFlight;
  tread: THREE.Material;
  frame: THREE.Material;
}

/** Wooden stair for a flight running along Z (the balcony stair descends toward +Z). */
function WoodStairs({ flight, tread, frame }: WoodProps) {
  const [x1, z1, x2, z2] = flight.bounds;
  const width = x2 - x1;
  const runs = useMemo(() => stepRuns(flight), [flight]);
  const rise = (flight.y1 - flight.y0) / flight.steps;
  const run = (z2 - z1) / flight.steps;
  // low end toward +Z for '-z' (ascends toward -Z), toward -Z for '+z'
  const s = flight.dir === '-z' ? 1 : -1;
  const zLow = s === 1 ? z2 : z1;
  const zHigh = s === 1 ? z1 : z2;
  const [railXa, railXb] = balconyStairRailX();

  const stringer = useMemo(() => {
    // Straight line under the tread/riser inner corners, STRINGER_H deep.
    const drop = rise + TREAD_T + STRINGER_H / 2;
    const from: Vec3 = [0, flight.y0 + rise - drop, zLow];
    const to: Vec3 = [0, flight.y1 + rise / 2 - drop, zHigh + s * (run / 2)];
    return { from, to };
  }, [flight, rise, run, s, zLow, zHigh]);

  const bottomPostY = GRADE_Y - 0.05;
  const bottomPostTop = flight.y0 + RAIL_H;
  const topRailY = flight.y1 + RAIL_H;

  return (
    <group name="wood-stairs">
      {runs.map(({ a, b, top }, i) => {
        const lowEdge = s === 1 ? b : a;
        return (
          <group key={i}>
            <mesh position={[(x1 + x2) / 2, top - TREAD_T / 2, (a + b) / 2 + (s * NOSING) / 2]} material={tread} castShadow receiveShadow>
              <boxGeometry args={[width, TREAD_T, run + NOSING]} />
            </mesh>
            <mesh position={[(x1 + x2) / 2, top - (rise + TREAD_T) / 2, lowEdge - (s * RISER_T) / 2]} material={frame}>
              <boxGeometry args={[width - 0.02, rise - TREAD_T, RISER_T]} />
            </mesh>
          </group>
        );
      })}
      {[x1 + 0.03, x2 - 0.03].map((x) => (
        <SlopedBox key={x} from={[x, stringer.from[1], stringer.from[2]]} to={[x, stringer.to[1], stringer.to[2]]} width={0.05} height={STRINGER_H} material={frame} />
      ))}
      {/* handrails: a post at the foot of each side, a sloped rail up to the deck posts */}
      {[railXa, railXb].map((x) => (
        <group key={x}>
          <mesh position={[x, (bottomPostY + bottomPostTop + 0.05) / 2, zLow - s * 0.05]} material={frame} castShadow>
            <boxGeometry args={[0.09, bottomPostTop + 0.05 - bottomPostY, 0.09]} />
          </mesh>
          <SlopedBox from={[x, bottomPostTop, zLow - s * 0.05]} to={[x, topRailY, zHigh - s * 0.06]} width={0.06} height={0.05} material={frame} />
          <SlopedBox from={[x, bottomPostTop - 0.45, zLow - s * 0.05]} to={[x, topRailY - 0.45, zHigh - s * 0.06]} width={0.04} height={0.04} material={frame} />
        </group>
      ))}
    </group>
  );
}
