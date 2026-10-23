/**
 * VERTICAL BLIND — outside mount on the interior wall face, above the casing.
 *
 *   - a rounded headrail (white, or anthracite for the grey / charcoal vanes; opening width
 *     + 6 cm) on short wall brackets, with a carrier under the rail for every vane,
 *   - 8.9 cm vanes as ONE InstancedMesh of slightly bowed panels (3.5 mm camber across the
 *     width, real 1.2 mm thickness) so every vane carries the light gradient of a stiffened
 *     strip: linen weave normal / roughness maps on the fabric colours (UVs in metres, 0.2 m per
 *     tile, sheen 0.5), smooth semi-gloss PVC for white. No two vanes are identical: each gets
 *     a deterministic ±3 % albedo (instance colour) and hangs ±0.4° off its neighbours. Each
 *     vane hangs from a hanger clip, carries a bottom weight sewn into its hem, and a fine chain
 *     links the weights,
 *   - at open = 0 the vanes are evenly spread (7.6 cm pitch, 1.3 cm overlap), each turned about
 *     Y by tilt × 85°; as `open` grows every vane travels to the LEFT (local −X) and the row
 *     compresses to a 1.2 cm pitch, the vanes keeping their rotation. Each vane sits 0.8 mm
 *     further from the wall than the previous one so overlapping vanes never z-fight,
 *   - a nickel bead chain (tilt) and a cord loop (traverse) on the right-hand end of the rail.
 *
 * The nearest vane hangs 9 cm in front of the wall face: the window stool projects 4 cm into
 * the room (see ../windows/geometry.ts) and a vane turned to 85° sweeps ±4.4 cm, so this
 * stand-off keeps turned vanes clear of the stool.
 *
 * Local frame (see ./types.ts): origin = centre of the opening on the interior wall face,
 * +X along the wall, +Y up, +Z into the room. Pure & prop-driven; the instance matrices are
 * rewritten in a layout effect only when open / tilt / size change. 10 draw calls.
 */
import * as THREE from 'three';
import { useLayoutEffect, useMemo } from 'react';
import { usePbr } from '../materials';
import type { CoveringProps } from './types';
import { floorY } from './types';
import {
  BEAD,
  CASING_W,
  DEG,
  HARDWARE,
  THIN_CYL_X,
  UNIT_BOX,
  beadLoop,
  boxMapUV,
  chainLoopGeometry,
  clamp,
  clamp01,
  commitInstances,
  fillBeads,
  finite,
  lerp,
  makeFinish,
  roundedBox,
  safeSize,
  setInstance,
  useDisposable,
  useInstancedMesh,
} from './slats';

const VANE_W = 0.089;
const VANE_T = 0.0012;
const VANE_BEND = 0.0035;
/** Per-vane variation: albedo ±3 %, hang ±0.4°. */
const ALBEDO_JITTER = 0.03;
const HANG_JITTER = 0.4 * DEG;
/** Weave tiles every 0.2 m (UVs are metric). */
const LINEN_REPEAT: [number, number] = [5, 5];
const PITCH_SPREAD = 0.076;
const PITCH_STACK = 0.012;
const Z_STAGGER = 0.0008;
const RAIL_H = 0.038;
const RAIL_D = 0.045;
/** Carrier under the rail and hanger clip on the vane. */
const CARRIER_H = 0.012;
const HANGER_H = 0.016;
/** Depth of the first (nearest to the wall) vane in front of the wall face. */
const VANE_Z = 0.09;
const TILT_MAX = 85 * DEG;
const BEAD_R = 0.002;
const BEAD_PITCH = 0.006;
const LOOP_R = 0.011;
const FABRIC_IDS = new Set(['ivory-fabric', 'grey-fabric', 'charcoal']);
const DARK_RAIL_IDS = new Set(['grey-fabric', 'charcoal']);

/** Deterministic pseudo-random in [−1, 1] for vane i (stable between renders and sessions). */
function jitter(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return 2 * (x - Math.floor(x)) - 1;
}

/** A vane of w × L × t bowed by `bend` toward +Z at its centre, smooth normals, metric UVs. */
function vaneGeometry(w: number, L: number, t: number, bend: number): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, Math.max(1e-3, L), t, 6, 1, 1);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const s = (2 * pos.getX(i)) / w;
    pos.setZ(i, pos.getZ(i) + bend * (1 - s * s));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return boxMapUV(geo);
}

export function VerticalBlind(props: CoveringProps) {
  const { isDoor, state, color } = props;
  const w = safeSize(props.width);
  const h = safeSize(props.height);
  const open = clamp01(finite(state.open, 0));
  const tilt = clamp(finite(state.tilt, 0), -1, 1);
  const fabric = FABRIC_IDS.has(color.id);
  const railMat = DARK_RAIL_IDS.has(color.id) ? HARDWARE.anthracite : HARDWARE.white;

  // ---- layout ---------------------------------------------------------------------------------
  const span = w + 0.06;
  const railY = h / 2 + CASING_W + 0.03; // just above the head casing
  const railBottom = railY - RAIL_H / 2;
  const vaneTop = railBottom - CARRIER_H - 0.002;
  const vaneBottom = isDoor ? finite(floorY(props), -h / 2) + 0.01 : -h / 2 - 0.02;
  const L = Math.max(0.05, vaneTop - vaneBottom);
  const vaneY = (vaneTop + vaneBottom) / 2;
  const n = Math.max(1, Math.round(span / PITCH_SPREAD));
  const rowDepth = (n - 1) * Z_STAGGER; // depth spread of the vane row
  const railD = RAIL_D + rowDepth;
  const railZ = VANE_Z + rowDepth / 2;
  const railFront = railZ + railD / 2;
  const bracketD = railZ - railD / 2; // wall face → back of the rail
  const bracketXs = useMemo(() => (span > 1.6 ? [-span / 2 + 0.08, 0, span / 2 - 0.08] : [-span / 2 + 0.08, span / 2 - 0.08]), [span]);
  const loopLen = clamp(L * 0.4, 0.2, 0.8);
  const chainX = span / 2 - 0.025;
  const cordX = chainX - 0.03;
  const loopZ = railFront + 0.012;

  // ---- resources ------------------------------------------------------------------------------
  const linen = usePbr('fabric_pattern_05', { repeat: LINEN_REPEAT, normalScale: 1.2 });
  const vaneMat = useDisposable(
    () =>
      fabric
        ? makeFinish({ color: color.hex, maps: linen, roughness: 1, sheen: 0.5, sheenColor: '#ffffff', sheenRoughness: 0.6, envMapIntensity: 0.7 })
        : makeFinish({ color: color.hex, roughness: 0.5, clearcoat: 0.2, clearcoatRoughness: 0.35, envMapIntensity: 0.9 }),
    [fabric, color.hex, linen],
  );
  const vaneGeo = useDisposable(() => vaneGeometry(VANE_W, L, VANE_T, VANE_BEND), [L]);
  const railGeo = useDisposable(() => roundedBox(span, RAIL_H, railD, 0.003), [span, railD]);
  const cord = useDisposable(() => chainLoopGeometry(0.008, loopLen + 0.08, 0.0012), [loopLen]);
  const loop = useMemo(() => beadLoop(LOOP_R, loopLen, BEAD_PITCH), [loopLen]);

  const vanes = useInstancedMesh(vaneGeo, vaneMat, n, true);
  const hangers = useInstancedMesh(UNIT_BOX, railMat, n);
  const carriers = useInstancedMesh(UNIT_BOX, railMat, n);
  const weights = useInstancedMesh(UNIT_BOX, vaneMat, n);
  const links = useInstancedMesh(THIN_CYL_X, HARDWARE.metal, Math.max(1, n - 1));
  const brackets = useInstancedMesh(UNIT_BOX, railMat, bracketXs.length);
  const beads = useInstancedMesh(BEAD, HARDWARE.metal, loop.length / 2);

  // ---- per-vane albedo (the weight sewn into the hem is cut from the same vane) ---------------
  useLayoutEffect(() => {
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      c.setScalar(1 + ALBEDO_JITTER * jitter(i));
      vanes.setColorAt(i, c);
      weights.setColorAt(i, c);
    }
    if (vanes.instanceColor) vanes.instanceColor.needsUpdate = true;
    if (weights.instanceColor) weights.instanceColor.needsUpdate = true;
  }, [vanes, weights, n]);

  // ---- vane row -------------------------------------------------------------------------------
  useLayoutEffect(() => {
    const tiltAngle = tilt * TILT_MAX;
    const stackX0 = -span / 2 + VANE_W / 2 + 0.004;
    const weightY = vaneBottom + 0.012;
    const linkY = vaneBottom - 0.002;
    let px = 0;
    let pz = 0;
    for (let i = 0; i < n; i++) {
      const spreadX = (i - (n - 1) / 2) * PITCH_SPREAD;
      const stackX = stackX0 + i * PITCH_STACK;
      const x = lerp(spreadX, stackX, open);
      const z = VANE_Z + i * Z_STAGGER;
      const angle = tiltAngle + HANG_JITTER * jitter(i + 1000);
      setInstance(vanes, i, x, vaneY, z, 0, angle, 0);
      setInstance(hangers, i, x, vaneTop - HANGER_H / 2 + 0.004, z, 0, angle, 0, 0.022, HANGER_H, 0.005);
      setInstance(carriers, i, x, railBottom - CARRIER_H / 2, railZ, 0, 0, 0, 0.016, CARRIER_H, 0.024);
      setInstance(weights, i, x, weightY, z, 0, angle, 0, 0.07, 0.018, 0.003);
      if (i > 0) {
        const dx = x - px;
        const dz = z - pz;
        const len = Math.max(0.002, Math.hypot(dx, dz));
        setInstance(links, i - 1, (x + px) / 2, linkY, (z + pz) / 2, 0, Math.atan2(-dz, dx), 0, len, 0.0008, 0.0008);
      }
      px = x;
      pz = z;
    }
    commitInstances(vanes, n);
    commitInstances(hangers, n);
    commitInstances(carriers, n);
    commitInstances(weights, n);
    commitInstances(links, n - 1);
  }, [vanes, hangers, carriers, weights, links, n, open, tilt, span, vaneY, vaneTop, vaneBottom, railBottom, railZ]);

  // ---- brackets & controls --------------------------------------------------------------------
  useLayoutEffect(() => {
    bracketXs.forEach((x, i) => setInstance(brackets, i, x, railY, bracketD / 2, 0, 0, 0, 0.03, 0.03, Math.max(0.005, bracketD)));
    commitInstances(brackets, bracketXs.length);
    fillBeads(beads, loop, chainX, railBottom, loopZ, BEAD_R);
  }, [brackets, bracketXs, railY, bracketD, beads, loop, chainX, railBottom, loopZ]);

  return (
    <group name="vertical-blind">
      <mesh geometry={railGeo} material={railMat} position={[0, railY, railZ]} castShadow receiveShadow />
      <primitive object={brackets} />
      <primitive object={carriers} />
      <primitive object={hangers} />
      <primitive object={vanes} />
      <primitive object={weights} />
      <primitive object={links} />
      {/* bead chain (tilt) with its tensioner clip, and the traverse cord loop, right end */}
      <primitive object={beads} />
      <mesh geometry={UNIT_BOX} material={railMat} position={[chainX, railBottom - loopLen - LOOP_R - 0.012, loopZ]} scale={[0.012, 0.03, 0.007]} />
      <mesh geometry={cord} material={HARDWARE.cord} position={[cordX, railBottom, loopZ]} />
    </group>
  );
}
