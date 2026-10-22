/**
 * VENETIAN BLIND — inside mount, in the reveal just in front of the frame's central mullion
 * (so neither the mullion nor the 60 % rail of the frame ever shows between the slats).
 *
 *   - a headrail box just under the head of the frame,
 *   - horizontal slats as ONE InstancedMesh: 2.5 cm pitch / depth for the aluminium colours
 *     (curved 1 mm shells), 5 cm pitch / depth for the wood colours (3 mm flat boxes with a
 *     procedural grain texture). Each slat is rotated about X by tilt × 80°,
 *   - raising: the lift cord pulls the bottom rail up, which collects the slats from the bottom.
 *     The hanging part keeps its pitch from the headrail down over avail × (1 − open); the raised
 *     slats sit flat in a compact stack on the bottom rail (≈ 2 mm per aluminium slat, 4.5 mm per
 *     wood slat) — at open = 1 the whole stack hangs right under the headrail,
 *   - a bottom rail, ladder tapes (cloth tapes for wood, cords for aluminium) as a second small
 *     InstancedMesh, a clear tilt wand on the left and the lift cord with its tassel on the right.
 *
 * Local frame (see ./types.ts): origin = centre of the opening on the interior wall face,
 * +X along the wall, +Y up, +Z into the room. The blind fits the clear opening between the
 * frame members (FRAME_FACE wide, see ../windows/geometry.ts). Pure & prop-driven; instance
 * matrices are rewritten in a layout effect only when open / tilt / size change.
 */
import * as THREE from 'three';
import { useLayoutEffect } from 'react';
import type { CoveringProps } from './types';
import {
  DEG,
  HARDWARE,
  UNIT_BOX,
  UNIT_CYL_Y,
  clamp,
  clamp01,
  clearOpening,
  commitInstances,
  finite,
  grainBox,
  insideMountZ,
  makeSlatMaterial,
  setInstance,
  useDisposable,
  useInstancedMesh,
  woodGrainTexture,
} from './slats';

const WOOD_IDS = new Set(['oak', 'walnut', 'white-wood']);
const BOTTOM_RAIL_H = 0.012;
/** Gap between the headrail and the first slat. */
const TOP_GAP = 0.012;
const TILT_MAX = 80 * DEG;
/** Ladder tapes: one every ~70 cm, at least two, inset from the slat ends. */
const LADDER_SPACING = 0.7;

/** Curved aluminium slat: a thin shell (no thickness) in the XZ plane whose long edges are lifted by `sag`. */
function curvedSlatGeometry(w: number, d: number, sag: number): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(w, d, 1, 6).rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const t = (2 * pos.getZ(i)) / d; // -1 at the back edge, +1 at the front edge
    pos.setY(i, sag * t * t);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

export function VenetianBlind(props: CoveringProps) {
  const { state, color } = props;
  const { innerW, innerTop, innerBottom } = clearOpening(props.width, props.height);
  const open = clamp01(finite(state.open, 0));
  const tilt = clamp(finite(state.tilt, 0), -1, 1);
  const wood = WOOD_IDS.has(color.id);

  // ---- dimensions -----------------------------------------------------------------------------
  const pitch = wood ? 0.05 : 0.025;
  const slatD = wood ? 0.05 : 0.025;
  const slatT = wood ? 0.003 : 0.001;
  const stackPitch = wood ? 0.0045 : 0.002;
  const slatW = Math.max(0.02, innerW - 0.01);
  const railH = wood ? 0.05 : 0.04;
  const railD = wood ? 0.055 : 0.03;
  // Headrail and slats share one depth; the headrail (the deepest part) sits just in front of the mullion.
  const z = insideMountZ(props.reveal, railD);
  const railY = innerTop - railH / 2 - 0.002;
  const railBottom = railY - railH / 2;

  // ---- lowered / raised split -----------------------------------------------------------------
  // Height available for slats between the headrail and the bottom rail resting on the sill.
  const avail = Math.max(pitch, railBottom - TOP_GAP - innerBottom - BOTTOM_RAIL_H - 0.004);
  const n = Math.max(1, Math.floor(avail / pitch));
  const hang = avail * (1 - open);
  // The bottom rail rises continuously; a slat joins the stack once the stack reaches it.
  const stackTop = railBottom - TOP_GAP - hang;
  const lowered = clamp(Math.floor(hang / pitch + 0.5), 0, n);
  const raised = n - lowered;
  const bottomRailY = stackTop - raised * stackPitch - BOTTOM_RAIL_H / 2;

  // ---- materials ------------------------------------------------------------------------------
  const grain = wood ? woodGrainTexture(color.hex, color.accent) : null; // shared, never disposed
  const slatMat = useDisposable(
    () =>
      makeSlatMaterial(color, {
        map: grain,
        side: wood ? THREE.FrontSide : THREE.DoubleSide,
        roughness: color.roughness ?? (wood ? 0.8 : 0.5),
        metalness: color.metalness ?? (wood ? 0 : 0.2),
      }),
    [color.hex, color.roughness, color.metalness, grain, wood],
  );
  const tapeMat = useDisposable(() => makeSlatMaterial(color, { map: null, roughness: 0.95, metalness: 0 }), [color.hex]);

  // ---- geometry -------------------------------------------------------------------------------
  const slatGeo = useDisposable(
    () => (wood ? grainBox(slatW, slatT, slatD) : curvedSlatGeometry(slatW, slatD, 0.0015)),
    [wood, slatW, slatT, slatD],
  );
  const headGeo = useDisposable(() => grainBox(Math.max(0.02, innerW - 0.004), railH, railD), [innerW, railH, railD]);
  const bottomGeo = useDisposable(() => grainBox(slatW, BOTTOM_RAIL_H, slatD * 0.9), [slatW, slatD]);

  const slats = useInstancedMesh(slatGeo, slatMat, n, wood);
  const ladders = Math.max(2, Math.ceil(slatW / LADDER_SPACING));
  const tapes = useInstancedMesh(UNIT_BOX, tapeMat, ladders * 2);

  // ---- slat matrices --------------------------------------------------------------------------
  useLayoutEffect(() => {
    const angle = tilt * TILT_MAX;
    for (let i = 0; i < n; i++) {
      if (i < lowered) setInstance(slats, i, 0, railBottom - TOP_GAP - pitch * (i + 0.5), z, angle);
      else setInstance(slats, i, 0, stackTop - stackPitch * (i - lowered + 0.5), z, 0);
    }
    commitInstances(slats, n);
  }, [slats, n, lowered, tilt, railBottom, pitch, z, stackTop, stackPitch]);

  // ---- ladder tapes (front + back strand per ladder) ------------------------------------------
  useLayoutEffect(() => {
    const top = railBottom;
    const bottom = bottomRailY + BOTTOM_RAIL_H / 2;
    const len = Math.max(0.005, top - bottom);
    const tapeW = wood ? 0.025 : 0.0025;
    const inset = clamp(slatW * 0.12, 0.05, 0.3);
    const zOff = slatD * 0.42;
    for (let k = 0; k < ladders; k++) {
      const x = -slatW / 2 + inset + (k * (slatW - 2 * inset)) / (ladders - 1);
      setInstance(tapes, 2 * k, x, (top + bottom) / 2, z + zOff, 0, 0, 0, tapeW, len, 0.0012);
      setInstance(tapes, 2 * k + 1, x, (top + bottom) / 2, z - zOff, 0, 0, 0, tapeW, len, 0.0012);
    }
    commitInstances(tapes, ladders * 2);
  }, [tapes, ladders, railBottom, bottomRailY, wood, slatW, slatD, z]);

  // ---- controls -------------------------------------------------------------------------------
  const maxDrop = Math.max(0.05, railBottom - innerBottom - 0.02);
  const wandLen = clamp(avail * 0.5, 0.2, Math.min(0.8, maxDrop));
  const cordLen = clamp(0.25 + (avail - hang) * 0.9, 0.2, maxDrop);
  const frontZ = z + railD / 2;

  return (
    <group name="venetian-blind">
      <mesh geometry={headGeo} material={slatMat} position={[0, railY, z]} castShadow receiveShadow />
      <primitive object={slats} />
      <primitive object={tapes} />
      <mesh geometry={bottomGeo} material={slatMat} position={[0, bottomRailY, z]} castShadow receiveShadow />
      {/* clear acrylic tilt wand, left */}
      <mesh geometry={UNIT_CYL_Y} material={HARDWARE.clear} position={[-innerW / 2 + 0.035, railBottom - wandLen / 2, frontZ + 0.01]} scale={[0.004, wandLen, 0.004]} />
      {/* lift cord + tassel, right (longer as the blind is raised) */}
      <mesh geometry={UNIT_CYL_Y} material={tapeMat} position={[innerW / 2 - 0.035, railBottom - cordLen / 2, frontZ + 0.008]} scale={[0.0015, cordLen, 0.0015]} />
      <mesh geometry={UNIT_CYL_Y} material={tapeMat} position={[innerW / 2 - 0.035, railBottom - cordLen - 0.012, frontZ + 0.008]} scale={[0.006, 0.025, 0.006]} />
    </group>
  );
}
