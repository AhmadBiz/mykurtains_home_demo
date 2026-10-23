/**
 * VENETIAN BLIND — inside mount, in the reveal just in front of the frame's central mullion
 * (so neither the mullion nor the 60 % rail of the frame ever shows between the slats).
 *
 *   - a rounded headrail in the slat finish just under the head of the frame,
 *   - slats as ONE InstancedMesh: 25 mm aluminium slats (21.5 mm pitch, a curved slab with real
 *     thickness) or 50 mm wood slats (43 mm pitch, rounded 3 mm boards). Aluminium reflects the
 *     environment (silver: metalness 0.85 / roughness 0.3; white and black are painted —
 *     semi-gloss clearcoat over a lower metalness); oak / walnut carry real wood maps running
 *     along the slat (one material with metric UVs serves slats, rails and tassel),
 *   - each slat is rotated about X by tilt × 80°,
 *   - raising: the bottom rail collects the slats from the bottom into a flat stack (2 mm per
 *     aluminium slat, 3.5 mm per wood slat) under a 1.5 cm gap below the headrail,
 *   - ladders: 2.5 cm fabric tapes in the catalogue colour (wood) or thin cords with a thread
 *     rung under every hanging slat (aluminium), a rounded bottom rail, a clear acrylic tilt
 *     wand on its hook (left) and the pair of lift cords with a tassel (right).
 *
 * Local frame (see ./types.ts): origin = centre of the opening on the interior wall face,
 * +X along the wall, +Y up, +Z into the room. Pure & prop-driven; instance matrices are
 * rewritten in layout effects only when open / tilt / size change. ≤ 9 draw calls.
 */
import * as THREE from 'three';
import { useLayoutEffect } from 'react';
import type { ColorOption } from '../../data/coverings';
import { usePbr } from '../materials';
import type { PbrSet } from '../materials';
import type { CoveringProps } from './types';
import {
  DEG,
  HARDWARE,
  THIN_CYL_X,
  THIN_CYL_Y,
  UNIT_BOX,
  clamp,
  clamp01,
  clearOpening,
  commitInstances,
  curvedSlabGeometry,
  finite,
  insideMountZ,
  makeFinish,
  roundedBox,
  setInstance,
  useDisposable,
  useInstancedMesh,
  woodFinish,
} from './slats';
import type { WoodFinish } from './slats';

/** Gap between the headrail and the first slat / the top of the stack. */
const TOP_GAP = 0.015;
const TILT_MAX = 80 * DEG;
/** One ladder every ~60 cm, at least two. */
const LADDER_SPACING = 0.6;
const WOOD_IDS = new Set(['oak', 'walnut', 'white-wood']);

interface Spec {
  pitch: number;
  slatD: number;
  slatT: number;
  sag: number;
  stackPitch: number;
  headH: number;
  headD: number;
  bottomH: number;
  bottomD: number;
  tapeW: number;
}
const ALU: Spec = { pitch: 0.0215, slatD: 0.025, slatT: 0.0007, sag: 0.0012, stackPitch: 0.002, headH: 0.025, headD: 0.025, bottomH: 0.009, bottomD: 0.025, tapeW: 0 };
const WOOD: Spec = { pitch: 0.043, slatD: 0.05, slatT: 0.003, sag: 0, stackPitch: 0.0035, headH: 0.055, headD: 0.05, bottomH: 0.015, bottomD: 0.05, tapeW: 0.025 };

function finishFor(color: ColorOption, maps: PbrSet, wood: WoodFinish | null): THREE.MeshPhysicalMaterial {
  if (wood) return makeFinish({ color: '#ffffff', tint: wood.tint, maps, roughness: 1, envMapIntensity: 0.8 });
  switch (color.id) {
    case 'silver':
      return makeFinish({ color: color.hex, roughness: 0.3, metalness: 0.85, envMapIntensity: 1.2 });
    case 'black':
      return makeFinish({ color: color.hex, roughness: 0.45, metalness: 0.3, clearcoat: 0.15, clearcoatRoughness: 0.4, envMapIntensity: 1 });
    case 'white-wood':
      return makeFinish({ color: color.hex, roughness: 0.5, clearcoat: 0.12, clearcoatRoughness: 0.4, envMapIntensity: 0.8 });
    default: // white painted aluminium
      return makeFinish({ color: color.hex, roughness: 0.3, metalness: 0.45, clearcoat: 0.3, clearcoatRoughness: 0.25, envMapIntensity: 1.2 });
  }
}

export function VenetianBlind(props: CoveringProps) {
  const { state, color } = props;
  const { innerW, innerTop, innerBottom } = clearOpening(props.width, props.height);
  const open = clamp01(finite(state.open, 0));
  const tilt = clamp(finite(state.tilt, 0), -1, 1);
  const wood = WOOD_IDS.has(color.id);
  const spec = wood ? WOOD : ALU;
  const grain = woodFinish(color.id);

  // ---- dimensions -----------------------------------------------------------------------------
  const slatW = Math.max(0.02, innerW - 0.012);
  const headW = Math.max(0.02, innerW - 0.004);
  // Headrail and slats share one depth; the headrail (the deepest part) sits just in front of the mullion.
  const z = insideMountZ(props.reveal, spec.headD);
  const railY = innerTop - spec.headH / 2 - 0.002;
  const railBottom = railY - spec.headH / 2;
  const frontZ = z + spec.headD / 2;

  // ---- lowered / raised split -----------------------------------------------------------------
  const avail = Math.max(spec.pitch, railBottom - TOP_GAP - innerBottom - spec.bottomH - 0.004);
  const n = Math.max(1, Math.floor(avail / spec.pitch));
  const hang = avail * (1 - open);
  const lowered = clamp(Math.round(hang / spec.pitch), 0, n);
  const raised = n - lowered;
  const stackTop = railBottom - TOP_GAP - lowered * spec.pitch;
  const bottomRailY = stackTop - raised * spec.stackPitch - spec.bottomH / 2;
  const ladders = Math.max(2, Math.ceil(slatW / LADDER_SPACING));
  const inset = clamp(slatW * 0.1, 0.04, 0.2);
  const ladderX = (k: number) => -slatW / 2 + inset + (k * (slatW - 2 * inset)) / (ladders - 1);

  // ---- controls -------------------------------------------------------------------------------
  const maxDrop = Math.max(0.05, railBottom - innerBottom - 0.03);
  const wandLen = clamp(avail * 0.55, 0.2, Math.min(0.9, maxDrop));
  const cordLen = clamp(0.25 + (avail - hang) * 0.9, 0.2, maxDrop);
  const wandX = -innerW / 2 + 0.03;
  const cordX = innerW / 2 - 0.035;

  // ---- materials ------------------------------------------------------------------------------
  const maps = usePbr(grain?.tex ?? 'kitchen_wood', { size: [1, 1], rotation: grain?.rotation ?? 0 });
  const slatMat = useDisposable(() => finishFor(color, maps, grain), [color, maps, grain]);
  const tapeMat = useDisposable(() => makeFinish({ color: color.hex, roughness: 0.95, sheen: 0.3, sheenColor: '#ffffff', envMapIntensity: 0.7 }), [color.hex]);

  // ---- geometry -------------------------------------------------------------------------------
  const slatGeo = useDisposable(
    () => (wood ? roundedBox(slatW, spec.slatT, spec.slatD, 0.001) : curvedSlabGeometry(slatW, spec.slatT, spec.slatD, spec.sag)),
    [wood, slatW, spec],
  );
  const headGeo = useDisposable(() => roundedBox(headW, spec.headH, spec.headD, 0.002), [headW, spec]);
  const bottomGeo = useDisposable(() => roundedBox(slatW, spec.bottomH, spec.bottomD, 0.002), [slatW, spec]);
  const tasselGeo = useDisposable(() => roundedBox(0.012, 0.04, 0.012, 0.004, 0, 0, 0, 'y'), []);

  const slats = useInstancedMesh(slatGeo, slatMat, n, true);
  const strands = useInstancedMesh(wood ? UNIT_BOX : THIN_CYL_Y, wood ? tapeMat : HARDWARE.cord, ladders * 2);
  const rungs = useInstancedMesh(THIN_CYL_X, HARDWARE.cord, wood ? 1 : ladders * n);
  const cords = useInstancedMesh(THIN_CYL_Y, HARDWARE.cord, 2);

  // ---- slats + rungs --------------------------------------------------------------------------
  useLayoutEffect(() => {
    const angle = tilt * TILT_MAX;
    for (let i = 0; i < n; i++) {
      if (i < lowered) setInstance(slats, i, 0, railBottom - TOP_GAP - spec.pitch * (i + 0.5), z, angle);
      else setInstance(slats, i, 0, stackTop - spec.stackPitch * (i - lowered + 0.5), z, 0);
    }
    commitInstances(slats, n);
    if (!wood) {
      // a thread between the front and back cords under every hanging slat
      let k = 0;
      for (let l = 0; l < ladders; l++) {
        const x = ladderX(l);
        for (let i = 0; i < lowered; i++) {
          const y = railBottom - TOP_GAP - spec.pitch * (i + 0.5) - spec.slatT / 2 - 0.0005;
          setInstance(rungs, k++, x, y, z, angle, 0, 0, spec.slatD * 0.96, 0.0004, 0.0004);
        }
      }
      commitInstances(rungs, k);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slats, rungs, n, lowered, tilt, railBottom, spec, z, stackTop, wood, ladders, slatW, inset]);

  // ---- ladders (front + back strand each) and lift cords --------------------------------------
  useLayoutEffect(() => {
    const top = railBottom;
    const bottom = bottomRailY + spec.bottomH / 2;
    const len = Math.max(0.005, top - bottom);
    const yMid = (top + bottom) / 2;
    const zOff = spec.slatD / 2 - 0.004;
    for (let l = 0; l < ladders; l++) {
      const x = ladderX(l);
      if (wood) {
        setInstance(strands, 2 * l, x, yMid, z + zOff, 0, 0, 0, spec.tapeW, len, 0.0008);
        setInstance(strands, 2 * l + 1, x, yMid, z - zOff, 0, 0, 0, spec.tapeW, len, 0.0008);
      } else {
        setInstance(strands, 2 * l, x, yMid, z + zOff, 0, 0, 0, 0.0007, len, 0.0007);
        setInstance(strands, 2 * l + 1, x, yMid, z - zOff, 0, 0, 0, 0.0007, len, 0.0007);
      }
    }
    commitInstances(strands, ladders * 2);
    setInstance(cords, 0, cordX - 0.0025, railBottom - cordLen / 2, frontZ + 0.008, 0, 0, 0, 0.0011, cordLen, 0.0011);
    setInstance(cords, 1, cordX + 0.0025, railBottom - cordLen / 2, frontZ + 0.008, 0, 0, 0, 0.0011, cordLen, 0.0011);
    commitInstances(cords, 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strands, cords, ladders, railBottom, bottomRailY, wood, spec, z, slatW, inset, cordX, cordLen, frontZ]);

  return (
    <group name="venetian-blind">
      <mesh geometry={headGeo} material={slatMat} position={[0, railY, z]} castShadow receiveShadow />
      <primitive object={slats} />
      <primitive object={strands} />
      {!wood && <primitive object={rungs} />}
      <mesh geometry={bottomGeo} material={slatMat} position={[0, bottomRailY, z]} castShadow receiveShadow />
      {/* tilt wand on its hook, left */}
      <mesh geometry={THIN_CYL_Y} material={HARDWARE.metal} position={[wandX, railBottom - 0.006, frontZ + 0.012]} scale={[0.0015, 0.014, 0.0015]} />
      <mesh geometry={THIN_CYL_Y} material={HARDWARE.clear} position={[wandX, railBottom - 0.012 - wandLen / 2, frontZ + 0.012]} scale={[0.0045, wandLen, 0.0045]} />
      {/* lift cords + tassel, right (longer as the blind is raised) */}
      <primitive object={cords} />
      <mesh geometry={tasselGeo} material={slatMat} position={[cordX, railBottom - cordLen - 0.02, frontZ + 0.008]} castShadow />
    </group>
  );
}
