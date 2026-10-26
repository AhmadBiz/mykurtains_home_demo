/**
 * Real steps for every exterior ramp with steps > 0: one poured formed-concrete mass per flight
 * (no stacked slabs showing on the sides) with bullnosed flagstone treads for the porch and
 * side-door steps — the porch flight between two concrete cheek walls tying it to the porch
 * body — and a wooden stair (bullnosed plank treads, risers, stringers, chamfered posts, rounded
 * handrail, black aluminium balusters) for the balcony. The driveway (steps = 0) is a smooth
 * slab drawn in Ground.tsx.
 */
import * as THREE from 'three';
import { useMemo } from 'react';
import type { StairFlight } from '../../data/types';
import { GRADE_Y, RAILING, RAMPS, balconyStairRailX } from './data';
import { TriangleSoup, mergeAll, metreBox, metreRoundedBox, place, slabPrism, slopedBox, stairMass, stepRuns, withColor } from './geom';
import type { BoxUvOptions } from './geom';
import { Instanced } from './Instanced';
import type { InstanceItem } from './Instanced';
import { useDispose } from './hooks';
import { mulberry32 } from './textures';
import { useBlackMetal, useFormedConcrete, usePavement, usePlanks } from './materials';
import { CHAMFER, useBalusterGeometry } from './Platforms';

const STONE_TREAD_T = 0.05;
const WOOD_TREAD_T = 0.04;
const NOSING = 0.03;
const RISER_T = 0.025;
const STRINGER_H = 0.25;
const RAIL_H = 0.95;
/** Flagstone treads: a full-round 24 mm bullnose (the 20 mm fillet still read razor-edged at 2 m). */
const STONE_BULLNOSE = 0.024;
/** Porch cheek walls: thickness, top above the nosing line, and the riser inset between them. */
const CHEEK_T = 0.2;
const CHEEK_ABOVE = 0.15;
const CHEEK_INSET = 0.02;
const CHEEK_CHAMFER = 0.01;

/**
 * Bullnosed treads for a flight, the nosing overhanging toward the low end. Every tread gets a
 * random offset into the 2 m flagstone tile, alternate treads are turned 90° and (with `tint`)
 * tinted ±3 % through a vertex colour, so no two treads share a stone.
 */
function treadGeoms(f: StairFlight, thick: number, radius: number, rnd: () => number, tint: boolean): THREE.BufferGeometry[] {
  const [x1, z1, x2, z2] = f.bounds;
  const alongX = f.dir === '+x' || f.dir === '-x';
  const ascending = f.dir === '+x' || f.dir === '+z';
  return stepRuns(f).map(({ a, b, top }, i) => {
    const lo = ascending ? a - NOSING : a;
    const hi = ascending ? b : b + NOSING;
    const mid = (lo + hi) / 2;
    const uv: BoxUvOptions = { offset: [rnd() * 2, rnd() * 2], swap: i % 2 ? [2, 3] : undefined };
    const g = alongX ? metreRoundedBox(hi - lo, thick, z2 - z1, radius, uv, 2) : metreRoundedBox(x2 - x1, thick, hi - lo, radius, uv, 2);
    if (tint) {
      const k = 1 + (i % 2 ? 1 : -1) * 0.03;
      withColor(g, new THREE.Color(k, k, k));
    }
    return place(g, alongX ? [mid, top - thick / 2, (z1 + z2) / 2] : [(x1 + x2) / 2, top - thick / 2, mid]);
  });
}

/**
 * Two formed-concrete cheek walls either side of a flight running along +X (the porch steps),
 * from the porch body down to grade, their top 0.15 m above the nosing line at the foot and
 * flush with a 5 cm curb at the porch, 10 mm chamfer on the top edges.
 */
function cheekWalls(f: StairFlight): THREE.BufferGeometry {
  const [x1, z1, x2, z2] = f.bounds;
  const rise = (f.y1 - f.y0) / Math.max(1, f.steps);
  const yLow = f.y0 + rise + CHEEK_ABOVE;
  const yHigh = f.y1 + 0.05;
  const top = (x: number) => yLow + (yHigh - yLow) * THREE.MathUtils.clamp((x - x1) / (x2 - x1), 0, 1);
  const soup = new TriangleSoup(1);
  for (const za of [z1 - CHEEK_T, z2]) slabPrism(soup, x1 - 0.05, za, x2 + 0.02, za + CHEEK_T, () => GRADE_Y - 0.1, top, CHEEK_CHAMFER);
  return soup.build();
}

export function ExteriorSteps() {
  const concrete = useFormedConcrete();
  const pavement = usePavement();
  const planks = usePlanks();
  const black = useBlackMetal();
  const balusterGeom = useBalusterGeometry();
  const treadMat = useMemo(() => {
    const m = pavement.clone();
    m.vertexColors = true;
    return m;
  }, [pavement]);

  const riserGeom = useMemo(() => mergeAll([stairMass(RAMPS.perron, GRADE_Y - 0.02, CHEEK_INSET, STONE_TREAD_T), stairMass(RAMPS.side, GRADE_Y - 0.02, 0, STONE_TREAD_T), cheekWalls(RAMPS.perron)]), []);
  const treadGeom = useMemo(() => {
    const rnd = mulberry32(19);
    return mergeAll([...treadGeoms(RAMPS.perron, STONE_TREAD_T, STONE_BULLNOSE, rnd, true), ...treadGeoms(RAMPS.side, STONE_TREAD_T, STONE_BULLNOSE, rnd, true)]);
  }, []);
  useDispose(treadMat, riserGeom, treadGeom);

  return (
    <group name="exterior-steps">
      <mesh geometry={riserGeom} material={concrete} castShadow receiveShadow />
      <mesh geometry={treadGeom} material={treadMat} castShadow receiveShadow />
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
    const parts = treadGeoms(flight, WOOD_TREAD_T, CHAMFER, mulberry32(23), false);
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
