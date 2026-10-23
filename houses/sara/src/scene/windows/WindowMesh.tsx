import { useCallback, useEffect, useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { useStore } from '../../store/useStore';
import { DEFAULT_COVERINGS, colorOption, defaultStateFor } from '../../data/coverings';
import { COLLISION_SEGMENTS, LEVEL_BY_ID, WALL_BY_ID, type WindowInstance } from '../../data/geometry';
import { HOUSE } from '../../data/house';
import type { StairFlight } from '../../data/types';
import { stackBackFor } from '../coverings/fabric';
import { Covering } from '../coverings';
import type { WindowMaterials } from './materials';
import { doorAluminium, doorGlazing, doorHandle, doorTrim, highlightFrame, highlightZ, hitBox, windowGlazing, windowSill, windowWoodwork } from './geometry';
import type { Dims } from './geometry';
import { Highlight } from './Highlight';

/**
 * Transparent sort: the glazing draws first (-1); the coverings group gets renderOrder 1, which
 * three.js uses as the *groupOrder* of every mesh inside it, so coverings — whatever renderOrder
 * their own meshes use — always draw after the glass and after other transparent scene objects.
 * (On 'high' quality the clear glass is a transmission material, which three draws in its own
 * pass between the opaque and the transparent objects; the order then only matters on 'low'.)
 */
const GLASS_RENDER_ORDER = -1;
const COVERING_GROUP_ORDER = 1;

const NO_COVERING = defaultStateFor('none');

interface BodyProps {
  dims: Dims;
  mats: WindowMaterials;
}

/**
 * Painted woodwork (one mesh), stone sill, the glazing (one mesh: both faces of the double glazing).
 * Glass never casts nor receives shadows (the sun must get in).
 */
function WindowBody({ dims, mats, frosted }: BodyProps & { frosted: boolean }) {
  const wood = useMemo(() => windowWoodwork(dims), [dims]);
  const sill = useMemo(() => windowSill(dims), [dims]);
  const glass = useMemo(() => windowGlazing(dims), [dims]);
  return (
    <>
      <mesh geometry={wood} material={mats.paint} castShadow receiveShadow />
      <mesh geometry={sill} material={mats.stone} castShadow receiveShadow />
      <mesh geometry={glass} material={frosted ? mats.frosted : mats.glass} renderOrder={GLASS_RENDER_ORDER} />
    </>
  );
}

/** Patio door: aluminium frame + tracks + two sliding panels, white casing, stainless pulls, one glazing mesh for both panels. */
function DoorBody({ dims, mats }: BodyProps) {
  const alu = useMemo(() => doorAluminium(dims), [dims]);
  const trim = useMemo(() => doorTrim(dims), [dims]);
  const handle = useMemo(() => doorHandle(dims), [dims]);
  const glass = useMemo(() => doorGlazing(dims), [dims]);
  return (
    <>
      <mesh geometry={alu} material={mats.alu} castShadow receiveShadow />
      <mesh geometry={trim} material={mats.paint} castShadow receiveShadow />
      <mesh geometry={handle} material={mats.metal} />
      <mesh geometry={glass} material={mats.glass} renderOrder={GLASS_RENDER_ORDER} />
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// What stands beside / under a window: where a ceiling track must stop, how high the hem must stay
// ---------------------------------------------------------------------------------------------
/** Trim on the walls (structure/trim.ts): crown moulding 8 cm deep under the ceiling, baseboard 1.4 cm. */
const CROWN_OUT = 0.08;
const CROWN_H = 0.08;
const BASE_OUT = 0.014;
const BASE_H = 0.1;
/** Clearance kept from anything beside the track (m). */
const SIDE_MARGIN = 0.01;
/** Depth of the zone in front of the wall face that the track and fabric occupy (m). */
const FABRIC_DEPTH = 0.3;

/**
 * Furniture standing under / beside a window (scene/furniture/layout.ts — static, so recorded
 * here rather than measured from the meshes). The installation standard is floor length; where
 * the furniture is in the way the hem stops 1 cm above it instead (the lead / client may prefer to
 * move the furniture):
 *  - w-cuisine-s: the 0.9 m sink base run (0.6 m deep) with the arched faucet centred under the
 *    window, 0.10 m from the wall face, its arch topping out at 1.17 m;
 *  - w-sdb1-e: the freestanding tub (rim 0.58 m) and its floor-mounted filler, 7 cm from the
 *    wall face under the window, whose spout arch reaches 1.01 m;
 *  - w-sdb2-n: the alcove tub-shower (rim 0.55 m) along the wall; its shower riser, mixer lever
 *    and head stand 0.12 m left of the opening's left edge (x ≤ 1.66 m against the edge at 1.75 m),
 *    so the left end of the track stops before them.
 */
const FURNITURE: Record<string, { hemAbove?: number; sideRoom?: [number, number] }> = {
  'w-cuisine-s': { hemAbove: 1.18 },
  'w-sdb1-e': { hemAbove: 1.03 },
  'w-sdb2-n': { hemAbove: 0.56, sideRoom: [0.08, Infinity] },
};

/** Linear walking height of a flight at (x, z) (as data/geometry.ts), plus one riser for the tread nosing. */
function flightTopAt(f: StairFlight, x: number, z: number): number {
  const [x1, z1, x2, z2] = f.bounds;
  const t = f.dir === '+x' ? (x - x1) / (x2 - x1) : f.dir === '-x' ? (x2 - x) / (x2 - x1) : f.dir === '+z' ? (z - z1) / (z2 - z1) : (z2 - z) / (z2 - z1);
  const rise = f.steps > 0 ? (f.y1 - f.y0) / f.steps : 0;
  return Math.min(f.y1, f.y0 + (f.y1 - f.y0) * Math.min(1, Math.max(0, t)) + rise);
}

/**
 * Side room for the ceiling track and minimum hem height of one opening (CoveringProps sideRoom /
 * hemAbove). The track line z = t/2 + 0.15 in front of the wall is intersected with every wall
 * (COLLISION_SEGMENTS) standing between the hem and the track: the free run from each edge of
 * the opening to the nearest face, less that wall's crown (or baseboard) and a 1 cm margin. The
 * hem clears the highest stair or landing under the track and the furniture listed above.
 */
function coveringClearance(win: WindowInstance): { sideRoom: [number, number]; hemAbove: number } {
  const level = LEVEL_BY_ID[win.level];
  const half = win.width / 2;
  const reach = stackBackFor(win.width) + 0.2;
  const ex = [Math.cos(win.yaw), -Math.sin(win.yaw)];
  const ez = [Math.sin(win.yaw), Math.cos(win.yaw)];
  const zl = win.wallThickness / 2 + 0.15;
  const p0 = [win.center.x + ez[0] * zl, win.center.z + ez[1] * zl];
  // track top: flush under the ceiling, or 25 cm over the head of an opening that pokes through it
  const topLocal = win.opening.sill + win.height;
  const trackTop = level.floorY + (level.ceilingHeight < topLocal + 0.05 ? topLocal + 0.25 : level.ceilingHeight);
  const furniture = FURNITURE[win.id] ?? {};

  // ---- hem: stairs and landings under the track ------------------------------------------------
  let hemAbove = furniture.hemAbove ?? 0;
  const xr = half + stackBackFor(win.width);
  const zone: [number, number][] = [];
  for (const sx of [-xr, xr]) {
    for (const sz of [win.wallThickness / 2, win.wallThickness / 2 + FABRIC_DEPTH]) {
      zone.push([win.center.x + ex[0] * sx + ez[0] * sz, win.center.z + ex[1] * sx + ez[1] * sz]);
    }
  }
  const zx0 = Math.min(...zone.map((p) => p[0]));
  const zx1 = Math.max(...zone.map((p) => p[0]));
  const zz0 = Math.min(...zone.map((p) => p[1]));
  const zz1 = Math.max(...zone.map((p) => p[1]));
  const surfaceTop = (b: [number, number, number, number], at: (x: number, z: number) => number): number | null => {
    const x0 = Math.max(zx0, b[0]);
    const x1 = Math.min(zx1, b[2]);
    const z0 = Math.max(zz0, b[1]);
    const z1 = Math.min(zz1, b[3]);
    if (x0 > x1 || z0 > z1) return null;
    return Math.max(at(x0, z0), at(x0, z1), at(x1, z0), at(x1, z1));
  };
  const surfaces = [
    ...HOUSE.stairs.map((f) => surfaceTop(f.bounds, (x, z) => flightTopAt(f, x, z))),
    ...HOUSE.platforms.map((p) => surfaceTop(p.bounds, () => p.y)),
  ];
  for (const y of surfaces) {
    if (y === null || y <= level.floorY + 0.02 || y >= trackTop - 0.3) continue;
    hemAbove = Math.max(hemAbove, y - level.floorY + 0.01);
  }
  const hemY = level.floorY + Math.max(0.01, hemAbove);

  // ---- sides: walls along the track line -------------------------------------------------------
  const free = [reach, reach];
  const allowance = [0, 0];
  for (const s of COLLISION_SEGMENTS) {
    if (s.wallId === win.wall.id || s.yMin >= trackTop - 0.001 || s.yMax <= hemY) continue;
    const ux = s.b[0] - s.a[0];
    const uz = s.b[1] - s.a[1];
    const len = Math.hypot(ux, uz);
    if (len < 1e-6) continue;
    const u = [ux / len, uz / len];
    const n = [-u[1], u[0]];
    // p(x) = p0 + x·ex: 0 ≤ (p − a)·u ≤ len and |(p − a)·n| ≤ halfThickness, each linear in x
    const r = [p0[0] - s.a[0], p0[1] - s.a[1]];
    let lo = -Infinity;
    let hi = Infinity;
    const clip = (c: number, k: number, min: number, max: number) => {
      // min ≤ c + k·x ≤ max
      if (Math.abs(k) < 1e-9) {
        if (c < min || c > max) lo = Infinity;
        return;
      }
      const a = (min - c) / k;
      const b = (max - c) / k;
      lo = Math.max(lo, Math.min(a, b));
      hi = Math.min(hi, Math.max(a, b));
    };
    clip(r[0] * u[0] + r[1] * u[1], ex[0] * u[0] + ex[1] * u[1], 0, len);
    clip(r[0] * n[0] + r[1] * n[1], ex[0] * n[0] + ex[1] * n[1], -s.halfThickness, s.halfThickness);
    if (lo > hi) continue;
    // trim on that wall in the height range of the track and fabric (as trim.ts bandsFor)
    const w = WALL_BY_ID.get(s.wallId);
    const top = w ? w.baseY + w.height : s.yMax;
    let trim = 0;
    for (const l of HOUSE.levels) {
      if (!w || l.floorY < w.baseY - 0.01 || l.floorY > top - 0.5) continue;
      const ceilingY = l.floorY + l.ceilingHeight;
      if (top >= ceilingY - 0.01 && ceilingY - CROWN_H < trackTop && ceilingY > hemY) trim = Math.max(trim, CROWN_OUT);
      if (l.floorY + BASE_H > hemY && l.floorY < trackTop) trim = Math.max(trim, BASE_OUT);
    }
    // right side (+X): the first face past x = 0; left side (−X): the first face before it
    if (hi > 0 && lo < half + reach) {
      const d = Math.max(0, lo) - half;
      if (d < free[1]) {
        free[1] = d;
        allowance[1] = trim;
      }
    }
    if (lo < 0 && hi > -(half + reach)) {
      const d = -Math.min(0, hi) - half;
      if (d < free[0]) {
        free[0] = d;
        allowance[0] = trim;
      }
    }
  }
  const side = (i: 0 | 1) => {
    const walls = free[i] >= reach ? Infinity : free[i] - allowance[i] - SIDE_MARGIN;
    return Math.min(walls, furniture.sideRoom?.[i] ?? Infinity);
  };
  return { sideRoom: [side(0), side(1)], hemAbove };
}

interface Props {
  win: WindowInstance;
  mats: WindowMaterials;
}

/**
 * One coverable opening. Local frame: +X along the wall, +Z into the room, origin at the centre of
 * the opening on the wall centre-line (see WindowInstance). Mounts the <Covering/> on the interior
 * face, an invisible hit box carrying `userData.windowId` for the Player's centre raycast, and the
 * hover / selection highlight.
 */
export function WindowMesh({ win, mats }: Props) {
  const { id, width, height, wallThickness, isDoor, frosted, opening, center, yaw } = win;

  const stored = useStore((s) => s.coverings[id]);
  const state = stored ?? DEFAULT_COVERINGS[id] ?? NO_COVERING;
  const color = colorOption(state);

  const dims = useMemo<Dims>(() => ({ width, height, wallThickness }), [width, height, wallThickness]);
  const position = useMemo<[number, number, number]>(() => [center.x, center.y, center.z], [center]);
  const userData = useMemo(() => ({ windowId: id }), [id]);
  const hit = useMemo(() => hitBox(dims), [dims]);
  const highlight = useMemo(() => highlightFrame(dims, isDoor), [dims, isDoor]);
  const clearance = useMemo(() => coveringClearance(win), [win]);

  // Mouse picking for orbit mode and for mouse users before pointer lock. Under pointer lock the
  // pointer position is stale, so the Player's centre raycast is the only source of truth there.
  const onPointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const s = useStore.getState();
      if (s.pointerLocked) return;
      e.stopPropagation();
      s.setHovered(id);
      document.body.style.cursor = 'pointer';
    },
    [id],
  );
  const onPointerOut = useCallback(() => {
    const s = useStore.getState();
    if (s.hoveredWindowId === id) s.setHovered(null);
    document.body.style.cursor = '';
  }, [id]);
  const onClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      const s = useStore.getState();
      if (s.pointerLocked) return;
      e.stopPropagation();
      s.selectWindow(id);
    },
    [id],
  );
  // If this window disappears while hovered (orbit level change), leave no stale hover behind.
  useEffect(
    () => () => {
      const s = useStore.getState();
      if (s.hoveredWindowId === id) {
        s.setHovered(null);
        document.body.style.cursor = '';
      }
    },
    [id],
  );

  return (
    <group position={position} rotation={[0, yaw, 0]} name={`window:${id}`} userData={userData}>
      {isDoor ? <DoorBody dims={dims} mats={mats} /> : <WindowBody dims={dims} mats={mats} frosted={frosted} />}
      <group position={[0, 0, wallThickness / 2]} renderOrder={COVERING_GROUP_ORDER}>
        <Covering
          width={width}
          height={height}
          sill={opening.sill}
          reveal={wallThickness / 2}
          isDoor={isDoor}
          ceiling={LEVEL_BY_ID[win.level].ceilingHeight}
          sideRoom={clearance.sideRoom}
          hemAbove={clearance.hemAbove}
          state={state}
          color={color}
        />
      </group>
      <mesh
        geometry={hit}
        material={mats.hit}
        userData={userData}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onClick={onClick}
      />
      <Highlight id={id} geometry={highlight} z={highlightZ(wallThickness)} mats={mats} />
    </group>
  );
}
