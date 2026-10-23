/**
 * Real steps for every exterior ramp with steps > 0: formed-concrete risers with bullnosed flagstone
 * treads for the porch and side-door steps, a wooden stair (bullnosed plank treads, risers,
 * stringers, chamfered posts, rounded handrail, black aluminium balusters) for the balcony.
 * The driveway (steps = 0) is a smooth slab drawn in Ground.tsx.
 */
import * as THREE from 'three';
import { useMemo } from 'react';
import type { StairFlight } from '../../data/types';
import { GRADE_Y, RAILING, RAMPS, balconyStairRailX } from './data';
import { mergeAll, metreBox, metreRoundedBox, place, slopedBox, stepBlocks, stepRuns } from './geom';
import { Instanced } from './Instanced';
import type { InstanceItem } from './Instanced';
import { useDispose } from './hooks';
import { useBlackMetal, useFormedConcrete, usePavement, usePlanks } from './materials';
import { CHAMFER, useBalusterGeometry } from './Platforms';

const STONE_TREAD_T = 0.05;
const WOOD_TREAD_T = 0.04;
const NOSING = 0.03;
const RISER_T = 0.025;
const STRINGER_H = 0.25;
const RAIL_H = 0.95;

/** Bullnosed treads for a flight, the nosing overhanging toward the low end. */
function treadGeoms(f: StairFlight, thick: number, radius: number): THREE.BufferGeometry[] {
  const [x1, z1, x2, z2] = f.bounds;
  const alongX = f.dir === '+x' || f.dir === '-x';
  const ascending = f.dir === '+x' || f.dir === '+z';
  return stepRuns(f).map(({ a, b, top }, i) => {
    const lo = ascending ? a - NOSING : a;
    const hi = ascending ? b : b + NOSING;
    const mid = (lo + hi) / 2;
    const uv = { offset: [i * 0.37, i * 0.23] as [number, number] };
    const g = alongX ? metreRoundedBox(hi - lo, thick, z2 - z1, radius, uv) : metreRoundedBox(x2 - x1, thick, hi - lo, radius, uv);
    return place(g, alongX ? [mid, top - thick / 2, (z1 + z2) / 2] : [(x1 + x2) / 2, top - thick / 2, mid]);
  });
}

export function ExteriorSteps() {
  const concrete = useFormedConcrete();
  const pavement = usePavement();
  const planks = usePlanks();
  const black = useBlackMetal();
  const balusterGeom = useBalusterGeometry();

  const riserGeom = useMemo(
    () =>
      mergeAll(
        [...stepBlocks(RAMPS.perron, GRADE_Y - 0.02), ...stepBlocks(RAMPS.side, GRADE_Y - 0.02)].map((b) =>
          place(metreBox(b.size[0], b.size[1] - STONE_TREAD_T, b.size[2]), [b.center[0], b.center[1] - STONE_TREAD_T / 2, b.center[2]]),
        ),
      ),
    [],
  );
  const treadGeom = useMemo(() => mergeAll([...treadGeoms(RAMPS.perron, STONE_TREAD_T, 0.02), ...treadGeoms(RAMPS.side, STONE_TREAD_T, 0.02)]), []);
  useDispose(riserGeom, treadGeom);

  return (
    <group name="exterior-steps">
      <mesh geometry={riserGeom} material={concrete} castShadow receiveShadow />
      <mesh geometry={treadGeom} material={pavement} castShadow receiveShadow />
      <WoodStairs flight={RAMPS.balcon} planks={planks} black={black} balusterGeom={balusterGeom} />
    </group>
  );
}

interface WoodProps {
  flight: StairFlight;
  planks: THREE.Material;
  black: THREE.Material;
  balusterGeom: THREE.BufferGeometry;
}

/** Wooden stair for a flight running along Z (the balcony stair descends toward +Z). */
function WoodStairs({ flight, planks, black, balusterGeom }: WoodProps) {
  const [x1, z1, x2, z2] = flight.bounds;
  const width = x2 - x1;
  const rise = (flight.y1 - flight.y0) / flight.steps;
  const run = (z2 - z1) / flight.steps;
  // low end toward +Z for '-z' (ascends toward -Z), toward -Z for '+z'
  const s = flight.dir === '-z' ? 1 : -1;
  const zLow = s === 1 ? z2 : z1;
  const zHigh = s === 1 ? z1 : z2;
  const [railXa, railXb] = balconyStairRailX();
  const postZ = zLow + s * 0.05;
  const bottomPostTop = flight.y0 + RAIL_H;
  const topRailY = flight.y1 + RAIL_H;
  const railEndZ = zHigh - s * 0.06;

  const woodGeom = useMemo(() => {
    const parts = treadGeoms(flight, WOOD_TREAD_T, CHAMFER);
    for (const { a, b, top } of stepRuns(flight)) {
      const lowEdge = s === 1 ? b : a;
      parts.push(place(metreBox(width - 0.02, rise - WOOD_TREAD_T, RISER_T, { offset: [0.2, top] }), [(x1 + x2) / 2, top - (rise + WOOD_TREAD_T) / 2, lowEdge - (s * RISER_T) / 2]));
    }
    // stringers: straight line under the tread/riser inner corners, STRINGER_H deep
    const drop = rise + WOOD_TREAD_T + STRINGER_H / 2;
    for (const x of [x1 + 0.03, x2 - 0.03]) parts.push(slopedBox([x, flight.y0 + rise - drop, zLow], [x, flight.y1 + rise / 2 - drop, zHigh + (s * run) / 2], 0.05, STRINGER_H));
    // handrails: a post at the foot of each side, a sloped rounded rail up to the deck posts, a bottom rail
    const postBottom = GRADE_Y - 0.05;
    for (const x of [railXa, railXb]) {
      const top = bottomPostTop + 0.04;
      parts.push(place(metreRoundedBox(RAILING.postSize, top - postBottom, RAILING.postSize, CHAMFER, { swap: true, offset: [x, 0] }), [x, (top + postBottom) / 2, postZ]));
      parts.push(place(metreRoundedBox(RAILING.postSize + 0.04, 0.03, RAILING.postSize + 0.04, 0.008), [x, top + 0.015, postZ]));
      parts.push(slopedBox([x, bottomPostTop, postZ], [x, topRailY, railEndZ], RAILING.topRailW, RAILING.topRailH, CHAMFER, { swap: true }));
      parts.push(slopedBox([x, flight.y0 + 0.14, postZ], [x, flight.y1 + 0.14, railEndZ], 0.05, 0.04, 0, { swap: true }));
    }
    return mergeAll(parts);
  }, [flight, width, rise, run, s, zLow, zHigh, x1, x2, railXa, railXb, postZ, bottomPostTop, topRailY, railEndZ]);
  useDispose(woodGeom);

  const balusters = useMemo<InstanceItem[]>(() => {
    const items: InstanceItem[] = [];
    const yb0 = flight.y0 + 0.16;
    const yb1 = flight.y1 + 0.16;
    const yt0 = bottomPostTop - RAILING.topRailH / 2;
    const len = yt0 - yb0;
    const z0 = postZ - s * 0.12;
    const z1r = railEndZ + s * 0.06;
    const span = Math.abs(z1r - z0);
    const n = Math.max(1, Math.floor(span / RAILING.balusterSpacing));
    for (const x of [railXa, railXb]) {
      for (let k = 1; k <= n; k++) {
        const t = k / (n + 1);
        const z = z0 + (z1r - z0) * t;
        const yb = yb0 + (yb1 - yb0) * t;
        items.push({ position: [x, yb + len / 2, z], scale: [1, len, 1] });
      }
    }
    return items;
  }, [flight, bottomPostTop, postZ, railEndZ, s, railXa, railXb]);

  return (
    <group name="wood-stairs">
      <mesh geometry={woodGeom} material={planks} castShadow receiveShadow />
      <Instanced geometry={balusterGeom} material={black} items={balusters} />
    </group>
  );
}
