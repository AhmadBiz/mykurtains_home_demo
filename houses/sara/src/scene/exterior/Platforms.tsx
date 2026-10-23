/**
 * Front porch (chamfered flagstone slab on a split-face block body, two trimmed PVC-kit columns, a flat ballasted
 * roof with a 1:48 fall, two-piece fascia, half-round gutter and a downspout), rear balcony (deck
 * boards, chamfered posts, rounded top rail, instanced black aluminium balusters, the same
 * covered roof on two columns) and the side-door landing. Bounds / heights come from
 * HOUSE.platforms and HOUSE.ramps so they match groundHeightAt(). Woodwork of each platform is
 * merged into one geometry (one draw call).
 */
import * as THREE from 'three';
import { useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { EXT_HALF_WALL, GRADE_Y, PLATFORMS, RAILING, SMALL_ROOF_THICKNESS, SMALL_ROOF_TOP, balconyStairRailX } from './data';
import { DOWN, TriangleSoup, UP, cylinderBetween, halfPipeUnit, mergeAll, metreBox, metreRoundedBox, place } from './geom';
import type { Vec3 } from './geom';
import { Instanced } from './Instanced';
import type { InstanceItem } from './Instanced';
import { useDispose } from './hooks';
import { useBlackMetal, useBlockWall, useFormedConcrete, useMembrane, usePavement, usePlanks, useWhiteTrim } from './materials';
import { soffitBoardTexture } from './textures';
import { LEVEL_BY_ID, pointInLevelOutline } from '../../data/geometry';

const ROOF_BOTTOM = SMALL_ROOF_TOP - SMALL_ROOF_THICKNESS;
const FASCIA_T = 0.03;
const FASCIA_H = 0.2;
const FASCIA_TOP = SMALL_ROOF_TOP + 0.02;
/** Aluminium drip edge over the fascia board: height and how far it stands proud. */
const DRIP_H = 0.04;
const DRIP_PROUD = 0.015;
/** Membrane fall away from the wall (1:48). */
const FALL = 1 / 48;
const GUTTER_R = 0.05;
const PIPE_R = 0.035;
export const CHAMFER = 0.012;

/** The small roofs sit at the upper-floor level: hide them in orbit mode unless that level is shown. */
function useSmallRoofVisible(): boolean {
  const mode = useStore((s) => s.mode);
  const orbitLevel = useStore((s) => s.orbitLevel);
  return mode !== 'orbit' || orbitLevel === 'upper';
}

function useSoffitBoards(): THREE.MeshStandardMaterial {
  const tex = useMemo(() => soffitBoardTexture(), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: tex.map, roughness: 0.6, envMapIntensity: 0.6 }), [tex]);
  useDispose(tex.map, mat);
  return mat;
}

// ---------------------------------------------------------------------------------------------
// Columns: a standard PVC porch-column kit — two-step base, tapered shaft with a recessed panel
// on each face, and a swept cap (fillet + ogee + fillet, 4 cm proud).
// ---------------------------------------------------------------------------------------------
/** Cap profile [proud, height]: 1 cm fillet, 2.5 cm ogee, 1.5 cm fillet to a vertical band. */
const CAP_PROFILE: [number, number][] = [
  [0, 0],
  [0.003, 0.006],
  [0.01, 0.012],
  [0.013, 0.02],
  [0.02, 0.03],
  [0.03, 0.04],
  [0.035, 0.05],
  [0.038, 0.06],
  [0.04, 0.075],
  [0.04, 0.09],
];
const CAP_H = 0.09;
/** Base bead (quarter round, 3 cm) over the plinth. */
const BEAD_PROFILE: [number, number][] = [
  [0.03, 0],
  [0.028, 0.012],
  [0.02, 0.024],
  [0.008, 0.029],
  [0, 0.03],
];
const BEAD_H = 0.03;
const PLINTH_W = 0.3;
const PLINTH_H = 0.1;
const TAPER = 0.03;
const STILE = 0.04;
const RAIL = 0.12;
const RECESS = 0.02;

/** Sweeps a [proud, height] profile around a square of half-width `half0` centred at (cx, cz), starting at y0. */
function squareMoulding(soup: TriangleSoup, cx: number, cz: number, y0: number, half0: number, profile: [number, number][]): void {
  const corners = (h: number, y: number): Vec3[] => [
    [cx - h, y, cz - h],
    [cx + h, y, cz - h],
    [cx + h, y, cz + h],
    [cx - h, y, cz + h],
  ];
  const wants: Vec3[] = [
    [0, 0, -1],
    [1, 0, 0],
    [0, 0, 1],
    [-1, 0, 0],
  ];
  for (let k = 0; k + 1 < profile.length; k++) {
    const a = corners(half0 + profile[k][0], y0 + profile[k][1]);
    const b = corners(half0 + profile[k + 1][0], y0 + profile[k + 1][1]);
    for (let s = 0; s < 4; s++) {
      const s2 = (s + 1) % 4;
      soup.quad(a[s], a[s2], b[s2], b[s], wants[s]);
    }
  }
}

/** Painted column from yBottom (floor) to yTop (roof underside), `shaft` wide at the base — as merge-ready geometries. */
export function columnParts(x: number, z: number, yBottom: number, yTop: number, shaft: number): THREE.BufferGeometry[] {
  const soup = new TriangleSoup(1);
  const y0 = yBottom + PLINTH_H + BEAD_H;
  const y1 = yTop - CAP_H;
  const w0 = shaft;
  const w1 = shaft - TAPER;
  squareMoulding(soup, x, z, yBottom + PLINTH_H, w0 / 2, BEAD_PROFILE);
  squareMoulding(soup, x, z, y1, w1 / 2, CAP_PROFILE);
  const hc = w1 / 2 + CAP_PROFILE[CAP_PROFILE.length - 1][0];
  soup.quad([x - hc, yTop, z - hc], [x + hc, yTop, z - hc], [x + hc, yTop, z + hc], [x - hc, yTop, z + hc], UP);
  const half = (y: number) => (w0 + ((w1 - w0) * (y - y0)) / (y1 - y0)) / 2;
  const pb = y0 + RAIL;
  const pt = y1 - RAIL;
  for (const [nx, nz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const tx = -nz;
    const tz = nx;
    const P = (s: number, y: number, depth: number): Vec3 => [x + nx * (half(y) - depth) + tx * s, y, z + nz * (half(y) - depth) + tz * s];
    const n: Vec3 = [nx, 0, nz];
    // frame: bottom and top rails, two stiles (the shaft surface)
    soup.quad(P(-half(y0), y0, 0), P(half(y0), y0, 0), P(half(pb), pb, 0), P(-half(pb), pb, 0), n);
    soup.quad(P(-half(pt), pt, 0), P(half(pt), pt, 0), P(half(y1), y1, 0), P(-half(y1), y1, 0), n);
    soup.quad(P(-half(pb), pb, 0), P(-half(pb) + STILE, pb, 0), P(-half(pt) + STILE, pt, 0), P(-half(pt), pt, 0), n);
    soup.quad(P(half(pb) - STILE, pb, 0), P(half(pb), pb, 0), P(half(pt), pt, 0), P(half(pt) - STILE, pt, 0), n);
    // recessed panel and its four reveals
    const ib = half(pb) - STILE;
    const it = half(pt) - STILE;
    soup.quad(P(-ib, pb, RECESS), P(ib, pb, RECESS), P(it, pt, RECESS), P(-it, pt, RECESS), n);
    soup.quad(P(-ib, pb, 0), P(ib, pb, 0), P(ib, pb, RECESS), P(-ib, pb, RECESS), UP);
    soup.quad(P(-it, pt, 0), P(it, pt, 0), P(it, pt, RECESS), P(-it, pt, RECESS), DOWN);
    soup.quad(P(-ib, pb, 0), P(-ib, pb, RECESS), P(-it, pt, RECESS), P(-it, pt, 0), [tx, 0, tz]);
    soup.quad(P(ib, pb, 0), P(ib, pb, RECESS), P(it, pt, RECESS), P(it, pt, 0), [-tx, 0, -tz]);
  }
  return [place(metreRoundedBox(PLINTH_W, PLINTH_H, PLINTH_W, 0.006), [x, yBottom + PLINTH_H / 2, z]), soup.build()];
}

// ---------------------------------------------------------------------------------------------
// Flat roofs
// ---------------------------------------------------------------------------------------------
type Edge = 'n' | 's' | 'e' | 'w';

interface FlatRoofProps {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  /** Exposed edges (edges buried in a wall are omitted): fascia board + drip edge. */
  edges: Edge[];
  /** Edge the membrane falls toward (1:48 away from the wall). */
  fall: Edge;
  /** Edges carrying a half-round gutter. */
  gutters: Edge[];
  /** Foot of the downspout [x, y, z]; it drops from the nearest gutter corner. */
  downspout: Vec3;
}

/**
 * Flat roof: light ballasted membrane on a 1:48 fall, boarded soffit below, trim edges, a 20 cm
 * fascia board with a 4 cm aluminium drip edge standing 1.5 cm proud, half-round gutters and
 * one downspout with two wall straps.
 */
function FlatRoof({ x1, z1, x2, z2, edges, fall, gutters, downspout }: FlatRoofProps) {
  const membrane = useMembrane();
  const trim = useWhiteTrim();
  const boards = useSoffitBoards();
  const gutterMat = useMemo(() => {
    const m = trim.clone();
    m.side = THREE.DoubleSide;
    return m;
  }, [trim]);
  const { topGeom, soffitGeom, trimGeom, gutterGeom } = useMemo(() => {
    const topY = (x: number, z: number) => {
      const d = fall === 'e' ? x - x1 : fall === 'w' ? x2 - x : fall === 's' ? z - z1 : z2 - z;
      return SMALL_ROOF_TOP - d * FALL;
    };
    const top = new TriangleSoup(1).setUvAxes(0, 2);
    top.quad([x1, topY(x1, z1), z1], [x2, topY(x2, z1), z1], [x2, topY(x2, z2), z2], [x1, topY(x1, z2), z2], UP);
    const soffit = new TriangleSoup(1).setUvAxes(0, 2);
    soffit.quad([x1, ROOF_BOTTOM, z1], [x2, ROOF_BOTTOM, z1], [x2, ROOF_BOTTOM, z2], [x1, ROOF_BOTTOM, z2], DOWN);
    const sides = new TriangleSoup(1).setUvAxes(0, 1);
    sides.quad([x1, ROOF_BOTTOM, z1], [x2, ROOF_BOTTOM, z1], [x2, topY(x2, z1), z1], [x1, topY(x1, z1), z1], [0, 0, -1]);
    sides.quad([x1, ROOF_BOTTOM, z2], [x2, ROOF_BOTTOM, z2], [x2, topY(x2, z2), z2], [x1, topY(x1, z2), z2], [0, 0, 1]);
    sides.setUvAxes(2, 1);
    sides.quad([x1, ROOF_BOTTOM, z1], [x1, ROOF_BOTTOM, z2], [x1, topY(x1, z2), z2], [x1, topY(x1, z1), z1], [-1, 0, 0]);
    sides.quad([x2, ROOF_BOTTOM, z1], [x2, ROOF_BOTTOM, z2], [x2, topY(x2, z2), z2], [x2, topY(x2, z1), z1], [1, 0, 0]);
    const parts: THREE.BufferGeometry[] = [sides.build()];
    const fy = FASCIA_TOP - FASCIA_H / 2;
    const dy = FASCIA_TOP - DRIP_H / 2;
    const dripT = FASCIA_T + DRIP_PROUD;
    for (const e of edges) {
      switch (e) {
        case 'n':
          parts.push(place(metreBox(x2 - x1, FASCIA_H, FASCIA_T), [(x1 + x2) / 2, fy, z1 + FASCIA_T / 2]));
          parts.push(place(metreBox(x2 - x1 + 2 * DRIP_PROUD, DRIP_H, dripT), [(x1 + x2) / 2, dy, z1 + dripT / 2 - DRIP_PROUD]));
          break;
        case 's':
          parts.push(place(metreBox(x2 - x1, FASCIA_H, FASCIA_T), [(x1 + x2) / 2, fy, z2 - FASCIA_T / 2]));
          parts.push(place(metreBox(x2 - x1 + 2 * DRIP_PROUD, DRIP_H, dripT), [(x1 + x2) / 2, dy, z2 - dripT / 2 + DRIP_PROUD]));
          break;
        case 'w':
          parts.push(place(metreBox(FASCIA_T, FASCIA_H, z2 - z1), [x1 + FASCIA_T / 2, fy, (z1 + z2) / 2]));
          parts.push(place(metreBox(dripT, DRIP_H, z2 - z1 + 2 * DRIP_PROUD), [x1 + dripT / 2 - DRIP_PROUD, dy, (z1 + z2) / 2]));
          break;
        case 'e':
          parts.push(place(metreBox(FASCIA_T, FASCIA_H, z2 - z1), [x2 - FASCIA_T / 2, fy, (z1 + z2) / 2]));
          parts.push(place(metreBox(dripT, DRIP_H, z2 - z1 + 2 * DRIP_PROUD), [x2 - dripT / 2 + DRIP_PROUD, dy, (z1 + z2) / 2]));
          break;
      }
    }
    // gutters hung just under the drip edge, their rim GUTTER_R + 5 mm out from the fascia face
    const gy = FASCIA_TOP - DRIP_H - 0.01;
    const off = GUTTER_R + 0.005;
    const gutterParts: THREE.BufferGeometry[] = [];
    const corner = { x: 0, z: 0 };
    for (const e of gutters) {
      if (e === 'n' || e === 's') {
        const z = e === 'n' ? z1 - off : z2 + off;
        gutterParts.push(halfPipeUnit(GUTTER_R).scale(x2 - x1 + 2 * off, 1, 1).translate((x1 + x2) / 2, gy, z));
        corner.z = z;
      } else {
        const x = e === 'w' ? x1 - off : x2 + off;
        gutterParts.push(halfPipeUnit(GUTTER_R).rotateY(Math.PI / 2).scale(1, 1, z2 - z1 + 2 * off).translate(x, gy, (z1 + z2) / 2));
        corner.x = x;
      }
    }
    // downspout: vertical run at the foot, an offset up to the gutter corner, two straps
    const [fx, fyFoot, fz] = downspout;
    const outlet: Vec3 = [gutters.some((e) => e === 'e' || e === 'w') ? corner.x : fx, gy - GUTTER_R, gutters.some((e) => e === 'n' || e === 's') ? corner.z : fz];
    const elbowY = gy - GUTTER_R - 0.3;
    parts.push(cylinderBetween([fx, fyFoot, fz], [fx, elbowY, fz], PIPE_R));
    parts.push(cylinderBetween([fx, elbowY, fz], [outlet[0], outlet[1] - 0.04, outlet[2]], PIPE_R));
    parts.push(cylinderBetween([outlet[0], outlet[1] - 0.04, outlet[2]], [outlet[0], outlet[1] + 0.02, outlet[2]], PIPE_R));
    for (const y of [elbowY - 0.5, fyFoot + 0.4]) parts.push(place(metreBox(PIPE_R * 2 + 0.03, 0.03, PIPE_R * 2 + 0.03), [fx, y, fz]));
    return { topGeom: top.build(), soffitGeom: soffit.build(), trimGeom: mergeAll(parts), gutterGeom: mergeAll(gutterParts) };
  }, [x1, x2, z1, z2, edges, fall, gutters, downspout]);
  useDispose(gutterMat, topGeom, soffitGeom, trimGeom, gutterGeom);
  return (
    <group>
      <mesh geometry={topGeom} material={membrane} castShadow receiveShadow />
      <mesh geometry={soffitGeom} material={boards} />
      <mesh geometry={trimGeom} material={trim} castShadow receiveShadow />
      <mesh geometry={gutterGeom} material={gutterMat} castShadow />
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Front porch
// ---------------------------------------------------------------------------------------------
const TOP_T = 0.05;
const COLUMN = 0.24;
const COLUMN_INSET = 0.22;

export function Porch() {
  const { bounds, y } = PLATFORMS.perron;
  const [x1, z1, x2, z2] = bounds;
  const pavement = usePavement();
  const block = useBlockWall();
  const trim = useWhiteTrim();
  const roofVisible = useSmallRoofVisible();
  const bottom = GRADE_Y - 0.05;
  // slab edge chamfered 12 mm, standing 20 mm proud of the block body (a drip reveal under it)
  const topGeom = useMemo(() => place(metreRoundedBox(x2 - x1, TOP_T, z2 - z1, CHAMFER, { offset: [0.5, 1.3] }, 2), [(x1 + x2) / 2, y - TOP_T / 2, (z1 + z2) / 2]), [x1, x2, z1, z2, y]);
  const bodyGeom = useMemo(() => place(metreBox(x2 - x1 - 0.04, y - TOP_T - bottom, z2 - z1 - 0.04), [(x1 + x2) / 2, (y - TOP_T + bottom) / 2, (z1 + z2) / 2]), [x1, x2, z1, z2, y, bottom]);
  const columnGeom = useMemo(
    () => mergeAll([...columnParts(x1 + COLUMN_INSET, z1 + COLUMN_INSET, y, ROOF_BOTTOM, COLUMN), ...columnParts(x1 + COLUMN_INSET, z2 - COLUMN_INSET, y, ROOF_BOTTOM, COLUMN)]),
    [x1, z1, z2, y],
  );
  const downspout = useMemo<Vec3>(() => [x1 - 0.06, GRADE_Y, z2 - 0.1], [x1, z2]);
  useDispose(topGeom, bodyGeom, columnGeom);
  return (
    <group name="porch">
      <mesh geometry={topGeom} material={pavement} castShadow receiveShadow />
      <mesh geometry={bodyGeom} material={block} receiveShadow />
      <mesh geometry={columnGeom} material={trim} castShadow receiveShadow />
      <group visible={roofVisible}>
        {/* east edge tucks into the upper-storey front wall (X = 0), so no fascia there; the membrane falls to the street side */}
        <FlatRoof x1={x1 - 0.35} z1={z1 - 0.04} x2={-EXT_HALF_WALL + 0.05} z2={z2 + 0.35} edges={['n', 's', 'w']} fall="w" gutters={['w', 's']} downspout={downspout} />
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Rear balcony
// ---------------------------------------------------------------------------------------------
const DECK_T = 0.04;
const RIM_H = 0.18;
const POST = 0.14;

interface RailSegment {
  axis: 'x' | 'z';
  at: number;
  from: number;
  to: number;
}

/** Unit cylinder (height 1, centred) scaled per instance into a baluster. */
export function useBalusterGeometry(): THREE.CylinderGeometry {
  const g = useMemo(() => new THREE.CylinderGeometry(RAILING.balusterRadius, RAILING.balusterRadius, 1, 8), []);
  useDispose(g);
  return g;
}

export function Balcony() {
  const { bounds, y } = PLATFORMS.balcon;
  const [x1, z1, x2, z2] = bounds;
  const wallN = z1 + EXT_HALF_WALL; // outer face of the dining-room wall
  const wallW = x1 + EXT_HALF_WALL; // outer face of the kitchen wall
  const rx = x2 - 0.08; // east railing line
  const rz = z2 - 0.08; // south railing line
  const [railXa, railXb] = balconyStairRailX();

  const planks = usePlanks();
  const black = useBlackMetal();
  const trim = useWhiteTrim();
  const balusterGeom = useBalusterGeometry();
  const roofVisible = useSmallRoofVisible();

  const railPosts = useMemo<[number, number][]>(() => [[wallW + 0.06, rz], [railXa, rz], [railXb, rz]], [wallW, rz, railXa, railXb]);
  // Posts only where the deck is not carried by the basement foundation: a post inside the basement
  // footprint would stand in the middle of a basement room.
  const supportPosts = useMemo<[number, number][]>(
    () =>
      (
        [[x2 - 0.1, wallN + 0.1], [x2 - 0.1, z2 - 0.1], [x2 - 0.1, (wallN + z2) / 2], [wallW + 0.1, z2 - 0.1], [(wallW + x2) / 2, z2 - 0.1]] as [number, number][]
      ).filter(([px, pz]) => !pointInLevelOutline(LEVEL_BY_ID.basement, px, pz)),
    [x2, z2, wallN, wallW],
  );

  const segments = useMemo<RailSegment[]>(() => {
    const p = RAILING.postSize / 2;
    const segs: RailSegment[] = [
      { axis: 'z', at: rx, from: wallN + 0.08 + POST / 2, to: rz - POST / 2 },
      { axis: 'x', at: rz, from: wallW + 0.06 + p, to: railXa - p },
      { axis: 'x', at: rz, from: railXb + p, to: rx - POST / 2 },
    ];
    return segs.filter((s) => s.to - s.from > 0.08);
  }, [rx, rz, wallN, wallW, railXa, railXb]);

  const railTopY = y + RAILING.height - RAILING.topRailH / 2;
  const railBottomY = y + 0.1;
  const postTop = y + RAILING.height + 0.02;

  const balusters = useMemo<InstanceItem[]>(() => {
    const items: InstanceItem[] = [];
    const yb = railBottomY + 0.02;
    const yt = railTopY - RAILING.topRailH / 2;
    const len = yt - yb;
    for (const s of segments) {
      const l = s.to - s.from;
      const n = Math.max(1, Math.floor(l / RAILING.balusterSpacing));
      const step = l / (n + 1);
      for (let k = 1; k <= n; k++) {
        const t = s.from + step * k;
        items.push({ position: s.axis === 'x' ? [t, yb + len / 2, s.at] : [s.at, yb + len / 2, t], scale: [1, len, 1] });
      }
    }
    return items;
  }, [segments, railBottomY, railTopY]);

  const woodGeom = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    // deck boards run along Z (parallel to the kitchen wall); rim joist around
    parts.push(place(metreBox(x2 - x1, DECK_T, z2 - z1, { swap: [2, 3] }), [(x1 + x2) / 2, y - DECK_T / 2, (z1 + z2) / 2]));
    parts.push(place(metreBox(x2 - x1, RIM_H, z2 - z1, { offset: [0.3, 0.9] }), [(x1 + x2) / 2, y - DECK_T - RIM_H / 2, (z1 + z2) / 2]));
    const postBottom = GRADE_Y - 0.05;
    const deckBottom = y - DECK_T - RIM_H;
    for (const [px, pz] of supportPosts) parts.push(place(metreRoundedBox(POST, deckBottom - postBottom, POST, CHAMFER, { swap: true }), [px, (deckBottom + postBottom) / 2, pz]));
    for (const [px, pz] of railPosts) {
      parts.push(place(metreRoundedBox(RAILING.postSize, postTop - y, RAILING.postSize, CHAMFER, { swap: true, offset: [px, 0] }), [px, (postTop + y) / 2, pz]));
      parts.push(place(metreRoundedBox(RAILING.postSize + 0.04, 0.03, RAILING.postSize + 0.04, 0.008), [px, postTop + 0.015, pz]));
    }
    for (const s of segments) {
      const len = s.to - s.from;
      const mid = (s.from + s.to) / 2;
      const at = (yy: number): Vec3 => (s.axis === 'x' ? [mid, yy, s.at] : [s.at, yy, mid]);
      const top = s.axis === 'x' ? metreRoundedBox(len, RAILING.topRailH, RAILING.topRailW, CHAMFER) : metreRoundedBox(RAILING.topRailW, RAILING.topRailH, len, CHAMFER, { swap: true });
      const bottom = s.axis === 'x' ? metreBox(len, 0.04, 0.05) : metreBox(0.05, 0.04, len, { swap: true });
      parts.push(place(top, at(railTopY)));
      parts.push(place(bottom, at(railBottomY)));
    }
    return mergeAll(parts);
  }, [x1, x2, z1, z2, y, supportPosts, railPosts, segments, postTop, railTopY, railBottomY]);

  const columnGeom = useMemo(() => mergeAll([...columnParts(rx, wallN + 0.08, y, ROOF_BOTTOM, POST), ...columnParts(rx, rz, y, ROOF_BOTTOM, POST)]), [rx, rz, wallN, y]);
  const downspout = useMemo<Vec3>(() => [x2 + 0.06, GRADE_Y, z2 + 0.06], [x2, z2]);
  useDispose(woodGeom, columnGeom);

  return (
    <group name="balcony">
      <mesh geometry={woodGeom} material={planks} castShadow receiveShadow />
      <mesh geometry={columnGeom} material={trim} castShadow receiveShadow />
      <Instanced geometry={balusterGeom} material={black} items={balusters} />
      <group visible={roofVisible}>
        {/* walls on the north and west: the membrane falls toward the yard */}
        <FlatRoof x1={x1 - 0.06} z1={z1 - 0.06} x2={x2 + 0.3} z2={z2 + 0.3} edges={['n', 's', 'e', 'w']} fall="e" gutters={['e', 's']} downspout={downspout} />
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Side-door landing
// ---------------------------------------------------------------------------------------------
export function SideLanding() {
  const { bounds, y } = PLATFORMS.sideLanding;
  const [x1, z1, x2, z2] = bounds;
  const concrete = useFormedConcrete();
  const pavement = usePavement();
  const bottom = GRADE_Y - 0.05;
  const topGeom = useMemo(() => place(metreRoundedBox(x2 - x1, TOP_T, z2 - z1, 0.01, { offset: [1.7, 0.4] }), [(x1 + x2) / 2, y - TOP_T / 2, (z1 + z2) / 2]), [x1, x2, z1, z2, y]);
  const bodyGeom = useMemo(() => place(metreBox(x2 - x1 - 0.02, y - TOP_T - bottom, z2 - z1 - 0.02), [(x1 + x2) / 2, (y - TOP_T + bottom) / 2, (z1 + z2) / 2]), [x1, x2, z1, z2, y, bottom]);
  useDispose(topGeom, bodyGeom);
  return (
    <group name="side-landing">
      <mesh geometry={topGeom} material={pavement} castShadow receiveShadow />
      <mesh geometry={bodyGeom} material={concrete} receiveShadow />
    </group>
  );
}
