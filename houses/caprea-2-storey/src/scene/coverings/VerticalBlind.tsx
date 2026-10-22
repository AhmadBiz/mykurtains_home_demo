/**
 * VERTICAL BLIND — outside mount on the interior wall face, above the casing.
 *
 *   - a white headrail (opening width + 6 cm) on short wall brackets,
 *   - 8.9 cm vanes as ONE InstancedMesh of thin boxes hanging from the headrail to 1 cm above
 *     the floor for a patio door, or 2 cm below the opening otherwise. At open = 0 the vanes are
 *     evenly spread (7.6 cm pitch, 1.3 cm overlap), each turned about Y by tilt × 85°; as `open`
 *     grows every vane travels to the LEFT (local −X) and the row compresses to a 1.2 cm pitch,
 *     the vanes keeping their rotation. Each vane sits at a slightly different depth (1.2 mm
 *     stagger) so overlapping vanes never z-fight,
 *   - a bead chain + traverse cord on the right-hand end.
 *
 * The vanes hang 9 cm in front of the wall face: the window stool projects 4 cm into the room
 * (see ../windows/geometry.ts) and a vane turned to 85° sweeps ±4.4 cm, so this stand-off keeps
 * turned vanes clear of the stool. Material from the catalogue colour (fabric rough, PVC smoother).
 *
 * Local frame (see ./types.ts): origin = centre of the opening on the interior wall face,
 * +X along the wall, +Y up, +Z into the room. Pure & prop-driven; the instance matrices are
 * rewritten in a layout effect only when open / tilt / size change.
 */
import * as THREE from 'three';
import { useLayoutEffect } from 'react';
import type { CoveringProps } from './types';
import { floorY } from './types';
import {
  CASING_W,
  DEG,
  HARDWARE,
  UNIT_BOX,
  UNIT_CYL_Y,
  chainLoopGeometry,
  clamp,
  clamp01,
  commitInstances,
  finite,
  lerp,
  makeSlatMaterial,
  safeSize,
  setInstance,
  useDisposable,
  useInstancedMesh,
} from './slats';

const VANE_W = 0.089;
const VANE_T = 0.001;
const PITCH_SPREAD = 0.076;
const PITCH_STACK = 0.012;
const Z_STAGGER = 0.0012;
const RAIL_H = 0.04;
const RAIL_D = 0.05;
/** Depth of the vane row / headrail centre in front of the wall face. */
const RAIL_Z = 0.09;
const TILT_MAX = 85 * DEG;

export function VerticalBlind(props: CoveringProps) {
  const { isDoor, state, color } = props;
  const w = safeSize(props.width);
  const h = safeSize(props.height);
  const open = clamp01(finite(state.open, 0));
  const tilt = clamp(finite(state.tilt, 0), -1, 1);

  // ---- layout ---------------------------------------------------------------------------------
  const span = w + 0.06;
  const railY = h / 2 + CASING_W + 0.03; // just above the head casing
  const vaneTop = railY - RAIL_H / 2 - 0.004;
  const vaneBottom = isDoor ? finite(floorY(props), -h / 2) + 0.01 : -h / 2 - 0.02;
  const L = Math.max(0.05, vaneTop - vaneBottom);
  const vaneY = (vaneTop + vaneBottom) / 2;
  const n = Math.max(1, Math.round(span / PITCH_SPREAD));

  // ---- resources ------------------------------------------------------------------------------
  const vaneGeo = useDisposable(() => new THREE.BoxGeometry(VANE_W, L, VANE_T), [L]);
  const vaneMat = useDisposable(
    () => makeSlatMaterial(color, { roughness: color.roughness ?? 0.9, metalness: color.metalness ?? 0 }),
    [color.hex, color.roughness, color.metalness],
  );
  const vanes = useInstancedMesh(vaneGeo, vaneMat, n, true);
  const chainLen = clamp(L * 0.35, 0.15, 0.7);
  const chain = useDisposable(() => chainLoopGeometry(0.009, chainLen, 0.0014), [chainLen]);

  // ---- vane matrices --------------------------------------------------------------------------
  useLayoutEffect(() => {
    const angle = tilt * TILT_MAX;
    const stackX0 = -span / 2 + VANE_W / 2 + 0.004;
    const z0 = RAIL_Z - ((n - 1) * Z_STAGGER) / 2;
    for (let i = 0; i < n; i++) {
      const spreadX = (i - (n - 1) / 2) * PITCH_SPREAD;
      const stackX = stackX0 + i * PITCH_STACK;
      setInstance(vanes, i, lerp(spreadX, stackX, open), vaneY, z0 + i * Z_STAGGER, 0, angle, 0);
    }
    commitInstances(vanes, n);
  }, [vanes, n, open, tilt, span, vaneY]);

  // ---- headrail, brackets, controls -----------------------------------------------------------
  const bracketD = RAIL_Z - RAIL_D / 2; // wall face → back of the rail
  const bracketXs = span > 1.6 ? [-span / 2 + 0.08, 0, span / 2 - 0.08] : [-span / 2 + 0.08, span / 2 - 0.08];
  const railBottom = railY - RAIL_H / 2;
  const chainX = span / 2 - 0.03;
  const cordLen = Math.min(chainLen + 0.12, L - 0.05);

  return (
    <group name="vertical-blind">
      <mesh geometry={UNIT_BOX} material={HARDWARE.white} position={[0, railY, RAIL_Z]} scale={[span, RAIL_H, RAIL_D]} castShadow receiveShadow />
      {bracketXs.map((x) => (
        <mesh key={x} geometry={UNIT_BOX} material={HARDWARE.white} position={[x, railY, bracketD / 2]} scale={[0.03, 0.03, bracketD]} />
      ))}
      <primitive object={vanes} />
      {/* bead chain (tilt) and traverse cord on the right end of the rail */}
      <mesh geometry={chain} material={HARDWARE.metal} position={[chainX, railBottom, RAIL_Z + RAIL_D / 2 + 0.012]} />
      <mesh geometry={UNIT_CYL_Y} material={HARDWARE.white} position={[chainX - 0.03, railBottom - cordLen / 2, RAIL_Z + RAIL_D / 2 + 0.012]} scale={[0.0015, Math.max(0.05, cordLen), 0.0015]} />
    </group>
  );
}
