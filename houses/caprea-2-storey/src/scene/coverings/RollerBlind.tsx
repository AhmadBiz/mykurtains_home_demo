/**
 * ROLLER BLIND — inside mount, in the reveal.
 *
 *   - a fabric roll at the top (cylinder along X) whose radius grows as the blind is raised
 *     (2.2 cm + open × 1.5 cm) between two white end brackets screwed to the jambs,
 *   - a flat fabric sheet leaving the FRONT of the roll (reverse roll) and hanging down to
 *     y = innerTop − drop, where drop = (available height) × (1 − open) — clamped to ≥ 1 cm so
 *     only the roll and the hem bar remain when fully raised,
 *   - a fabric-wrapped weighted hem bar,
 *   - a bead-chain control loop on the right-hand side.
 *
 * Material: catalogue hex, roughness 0.9, DoubleSide; light-filtering fabrics
 * (translucency > 0) are transparent with opacity = 1 − translucency × 0.6, blackouts are opaque.
 * The roll and the hem bar are always opaque (many layers of fabric).
 *
 * Local frame (see ./types.ts): origin = centre of the opening on the interior wall face,
 * +X along the wall, +Y up, +Z into the room, glass at z = −reveal. The blind sits in the clear
 * opening between the window frame members (FRAME_FACE wide, see ../windows/geometry.ts); the
 * roll is placed so the hanging sheet is always in front of the frame's central mullion and
 * 60 % rail (reverse roll = the sheet is on the room side of the roll), the roll itself as deep
 * in the reveal as that allows (its back stays ≥ 5 cm clear of the glass).
 * Pure & prop-driven: no store access; the only geometry rebuilt on size change is the chain.
 */
import * as THREE from 'three';
import type { CoveringProps } from './types';
import { HARDWARE, UNIT_BOX, UNIT_CYL_X, UNIT_PLANE, chainLoopGeometry, clamp, clamp01, clearOpening, finite, mullionFrontZ, useDisposable } from './slats';

/** Roll radius fully lowered (all fabric hanging) and the extra radius when fully raised. */
const ROLL_R = 0.022;
const ROLL_R_GAIN = 0.015;
/** End brackets (x × y × z). */
const BRACKET_W = 0.012;
const BRACKET_H = 0.05;
const BRACKET_D = 0.04;
/** Weighted hem bar. */
const BAR_H = 0.025;
const BAR_D = 0.012;
/** Bead chain loop. */
const CHAIN_R = 0.011;
const CHAIN_TUBE = 0.0016;

export function RollerBlind(props: CoveringProps) {
  const { state, color } = props;
  const { innerW, innerTop, innerBottom } = clearOpening(props.width, props.height);
  const open = clamp01(finite(state.open, 0));
  const translucency = clamp01(finite(color.translucency ?? 0, 0));
  const opaque = translucency === 0;

  // ---- layout ---------------------------------------------------------------------------------
  // Roll axis depth: the sheet (at z + r, r ≥ ROLL_R) clears the mullion face by 4 mm.
  const z = mullionFrontZ(props.reveal) + 0.004 - ROLL_R;
  const r = ROLL_R + open * ROLL_R_GAIN;
  // The roll axis is fixed; the roll grows outward. Leave 4 mm under the head at full radius.
  const rollY = innerTop - (ROLL_R + ROLL_R_GAIN) - 0.004;
  const rollLen = Math.max(0.02, innerW - 2 * BRACKET_W - 0.004);
  const sheetW = Math.max(0.01, rollLen - 0.03);
  // Lowest position of the hem (bar resting just above the sill member).
  const lowestHem = innerBottom + BAR_H / 2 + 0.003;
  const drop = Math.max(0.01, (rollY - lowestHem) * (1 - open));
  const hemY = rollY - drop;
  const sheetZ = z + r; // fabric leaves the front (room side) of the roll
  const chainLen = clamp((innerTop - innerBottom) * 0.45, 0.15, 0.9);

  // ---- materials & geometry -------------------------------------------------------------------
  const fabric = useDisposable(
    () =>
      new THREE.MeshStandardMaterial({
        color: color.hex,
        roughness: 0.9,
        metalness: 0,
        side: THREE.DoubleSide,
        transparent: !opaque,
        opacity: opaque ? 1 : 1 - translucency * 0.6,
      }),
    [color.hex, opaque, translucency],
  );
  const rolled = useDisposable(() => new THREE.MeshStandardMaterial({ color: color.hex, roughness: 0.9, metalness: 0 }), [color.hex]);
  const chain = useDisposable(() => chainLoopGeometry(CHAIN_R, chainLen, CHAIN_TUBE), [chainLen]);

  const bracketX = innerW / 2 - BRACKET_W / 2;
  return (
    <group name="roller-blind">
      {/* end brackets on the jambs */}
      <mesh geometry={UNIT_BOX} material={HARDWARE.white} position={[-bracketX, rollY, z]} scale={[BRACKET_W, BRACKET_H, BRACKET_D]} />
      <mesh geometry={UNIT_BOX} material={HARDWARE.white} position={[bracketX, rollY, z]} scale={[BRACKET_W, BRACKET_H, BRACKET_D]} />
      {/* fabric roll */}
      <mesh geometry={UNIT_CYL_X} material={rolled} position={[0, rollY, z]} scale={[rollLen, r, r]} castShadow receiveShadow />
      {/* hanging sheet */}
      <mesh
        geometry={UNIT_PLANE}
        material={fabric}
        position={[0, (rollY + hemY) / 2, sheetZ]}
        scale={[sheetW, drop, 1]}
        castShadow={opaque}
        receiveShadow
      />
      {/* weighted hem bar */}
      <mesh geometry={UNIT_BOX} material={rolled} position={[0, hemY, sheetZ]} scale={[sheetW + 0.006, BAR_H, BAR_D]} castShadow receiveShadow />
      {/* bead chain loop hanging from the right bracket, a little in front of the roll */}
      <mesh geometry={chain} material={HARDWARE.metal} position={[innerW / 2 - BRACKET_W - CHAIN_R - 0.006, rollY, z + ROLL_R + ROLL_R_GAIN + 0.012]} />
    </group>
  );
}
