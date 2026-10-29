/**
 * ROLLER BLIND — cassette blind, inside mount in the reveal.
 *
 *   - a white (anthracite for dark fabrics) powder-coated aluminium cassette just under the head
 *     of the frame: a REAL extruded profile, 68 mm high × 68 mm deep, 1.5 mm folded sheet with a
 *     32 mm radius on the front-top corner, closed underneath except for a 3 mm fabric slot
 *     behind a 2 mm front lip. Two solid end caps stand 1.5 mm proud of the shell (the usual
 *     reveal line of a clip-on cap), and a 12 mm L-bracket screwed to each jamb carries the
 *     cassette. The inside of the slot is a matt black box so the exit of the fabric reads as the
 *     dark line it is in reality,
 *   - inside the cassette the fabric is wound on a tube (a real cylinder whose radius grows as the
 *     blind is raised; glimpsed through the slot from below),
 *   - the fabric sheet leaves the FRONT of the roll (reverse roll): its top is bent around the
 *     tube (a strip of 8 quads hugging the cylinder), runs to the slot and hangs flat to the hem
 *     bar. UVs are metric (continuous around the bend, metric on the roll too). Two fabrics:
 *       · screen / light-filtering colours are a woven sheet: the linen normal / roughness maps
 *         at a 0.45 m tile (offset per blind so neighbouring windows never show the same seam),
 *         85 % opaque: the sheet reads as white fabric with the daylight glowing through it, not as frosted glass, with only a
 *         faint, very rough sheen;
 *       · blackout / opaque colours are a PVC-coated sheet: the weave normal all but off, a plain
 *         roughness of 0.75, no sheen.
 *     Both carry a 2 m value-noise albedo mottle at ±1.5 % so the sheet is never one flat value,
 *   - an anodised aluminium hem bar the fabric runs through: brushed (anisotropic along its
 *     axis), reflecting the indoor environment rather than the sky,
 *   - a nickel bead chain loop (instanced 4 mm beads, 6 mm pitch) hanging from the right end
 *     cap, held at the bottom by a small clip.
 *
 * Local frame (see ./types.ts): origin = centre of the opening on the interior wall face,
 * +X along the wall, +Y up, +Z into the room, glass at z = −reveal. The cassette sits in the
 * clear opening between the frame members, its back just in front of the frame's central
 * mullion (so the hanging sheet is always in front of the mullion and the 60 % rail), its front
 * about flush with the casing. Pure & prop-driven; the sheet strip is rewritten in place (no
 * allocations) when open / size change. 8 draw calls.
 */
import * as THREE from 'three';
import { useLayoutEffect, useMemo } from 'react';
import { useIndoorEnvironment } from '../Lighting';
import { usePbr } from '../materials';
import type { PbrSet } from '../materials';
import type { CoveringProps } from './types';
import {
  BEAD,
  HARDWARE,
  UNIT_BOX,
  beadLoop,
  clamp,
  clamp01,
  clearOpening,
  fillBeads,
  finite,
  isDark,
  lerp,
  makeFinish,
  mergeParts,
  mottled,
  mullionFrontZ,
  roundedBox,
  useDisposable,
  useInstancedMesh,
  uvJitter,
} from './slats';

/** Cassette profile (y × z section), extruded along x between the end caps. */
const CASSETTE_H = 0.068;
const CASSETTE_D = 0.068;
const SHELL_T = 0.0015;
/** Radius of the front-top corner of the profile. */
const CORNER_R = 0.032;
/** Fabric slot in the bottom of the profile and the front lip in front of it. */
const SLOT_W = 0.003;
const LIP_W = 0.002;
/** Solid end caps, standing this much proud of the shell all round. */
const CAP_T = 0.008;
const CAP_REVEAL = 0.0015;
/** Jamb brackets: a 12 mm wide block screwed to each jamb under the frame head, the cap clips onto it. */
const BRACKET_W = 0.012;
const BRACKET_H = 0.044;
const BRACKET_D = 0.046;
/** Clearance frame head → cap top, and cap → bracket. */
const TOP_GAP = 0.0035;
const SIDE_GAP = 0.002;
/** Fabric wound on the tube: radius fully lowered + growth when fully raised. */
const ROLL_R0 = 0.019;
const ROLL_GAIN = 0.011;
/** Tube end (plug / clutch) between the roll and each end cap. */
const PLUG_L = 0.012;
/** Hem bar section. */
const BAR_H = 0.028;
const BAR_D = 0.012;
/** Bead chain. */
const BEAD_R = 0.002;
const BEAD_PITCH = 0.006;
const LOOP_R = 0.012;
/** Sheet strip: rows on the bend around the roll, one at the slot exit, one at the hem. */
const ARC_ROWS = 8;
const ROWS = ARC_ROWS + 3;
const BEND_LEN = 0.05;
/** The straight part of the sheet starts this far below the cassette (inside the slot box). */
const EXIT_DROP = 0.002;
/** The weave tiles every 0.45 m (UVs are metric): big enough that its seams never form a lattice across a sheet. */
const WEAVE_TILE = 0.45;
const WEAVE_REPEAT: [number, number] = [1 / WEAVE_TILE, 1 / WEAVE_TILE];
/** Screen / light-filtering sheet: woven, 85 % opaque, a faint very rough sheen. */
const SCREEN_NORMAL = 0.6;
const SCREEN_OPACITY = 0.85;
/** Blackout sheet: PVC-coated, the weave barely there under the coating, plain roughness, no sheen. */
const COATED_NORMAL = 0.15;
const COATED_ROUGHNESS = 0.75;

const HALF_H = CASSETTE_H / 2;
const HALF_D = CASSETTE_D / 2;
/** Slot edges on the bottom of the profile, relative to the cassette centre (z toward the room). */
const SLOT_FRONT = HALF_D - LIP_W;
const SLOT_BACK = SLOT_FRONT - SLOT_W;
const SLOT_Z = (SLOT_FRONT + SLOT_BACK) / 2;
/** Height of the matt black box filling the slot (shell thickness + a little of the inside). */
const SLOT_BOX_H = SHELL_T + 0.0024;

/** Outer outline of the cassette profile in the (z, y) plane, offset outward by `e`. */
function cassetteOutline(e: number): THREE.Shape {
  const h = HALF_H + e;
  const d = HALF_D + e;
  const r = CORNER_R + e;
  const s = new THREE.Shape();
  s.moveTo(-d, -h);
  s.lineTo(d, -h);
  s.lineTo(d, h - r);
  s.absarc(d - r, h - r, r, 0, Math.PI / 2, false);
  s.lineTo(-d, h);
  s.closePath();
  return s;
}

/** The folded-sheet shell: outer outline, then back along the inner skin, open only at the slot. */
function shellProfile(): THREE.Shape {
  const h = HALF_H;
  const d = HALF_D;
  const r = CORNER_R;
  const t = SHELL_T;
  const s = new THREE.Shape();
  // outer skin: from the lip round the front, over the top, down the back and along the bottom to the slot
  s.moveTo(SLOT_FRONT, -h);
  s.lineTo(d, -h);
  s.lineTo(d, h - r);
  s.absarc(d - r, h - r, r, 0, Math.PI / 2, false);
  s.lineTo(-d, h);
  s.lineTo(-d, -h);
  s.lineTo(SLOT_BACK, -h);
  // inner skin back to the lip
  s.lineTo(SLOT_BACK, -h + t);
  s.lineTo(-d + t, -h + t);
  s.lineTo(-d + t, h - t);
  s.lineTo(d - r, h - t);
  s.absarc(d - r, h - r, r - t, Math.PI / 2, 0, true);
  s.lineTo(d - t, -h + t);
  s.lineTo(SLOT_FRONT, -h + t);
  s.closePath();
  return s;
}

/** Extrudes a (z, y) profile along local X, centred on the origin, `len` long. */
function extrudeX(shape: THREE.Shape, len: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(1e-4, len), bevelEnabled: false, steps: 1, curveSegments: 12 });
  // shape (x, y) + extrusion z  →  local (z, y, −x): the extrusion runs along −X, then recentre
  g.rotateY(-Math.PI / 2);
  g.translate(len / 2, 0, 0);
  return g;
}

/**
 * Fabric wound on the tube: a unit-radius cylinder of length `len` along X (scale = [1, r, r])
 * with metric UVs — U around the circumference at the mean roll radius, V along the tube.
 */
function rollGeometry(len: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(1, 1, Math.max(1e-3, len), 24, 1).rotateZ(Math.PI / 2);
  const uv = g.getAttribute('uv');
  const around = 2 * Math.PI * (ROLL_R0 + ROLL_GAIN / 2);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * around, uv.getY(i) * len);
  uv.needsUpdate = true;
  return g;
}

/** A 2-column strip of ROWS vertex rows (positions / normals / UVs rewritten in a layout effect). */
function sheetGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const n = ROWS * 2;
  for (const [name, size] of [
    ['position', 3],
    ['normal', 3],
    ['uv', 2],
  ] as const) {
    const attr = new THREE.BufferAttribute(new Float32Array(n * size), size);
    attr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute(name, attr);
  }
  const idx: number[] = [];
  for (let k = 0; k < ROWS - 1; k++) {
    const a = 2 * k; // left, this row
    const b = a + 1; // right, this row
    const c = a + 2; // left, next row (lower)
    const d = a + 3; // right, next row
    idx.push(a, c, b, b, c, d); // counter-clockwise seen from +Z (the room)
  }
  g.setIndex(idx);
  return g;
}

export function RollerBlind(props: CoveringProps) {
  const { state, color } = props;
  const { innerW, innerH, innerTop, innerBottom } = clearOpening(props.width, props.height);
  const open = clamp01(finite(state.open, 0));
  const translucent = clamp01(finite(color.translucency ?? 0, 0)) > 0;
  const dark = isDark(color.hex);

  // ---- layout ---------------------------------------------------------------------------------
  // brackets against the jambs, then a little air, then the caps, then the shell between them
  const cassW = Math.max(0.04, innerW - 2 * (BRACKET_W + SIDE_GAP));
  const shellLen = Math.max(0.01, cassW - 2 * CAP_T);
  const zc = mullionFrontZ(props.reveal) + 0.003 + HALF_D;
  const yc = innerTop - TOP_GAP - CAP_REVEAL - HALF_H;
  const bottomY = yc - HALF_H; // outer face of the shell's bottom
  const r = ROLL_R0 + open * ROLL_GAIN;
  const rollLen = Math.max(0.01, shellLen - 0.002 - 2 * PLUG_L);
  const sheetW = Math.max(0.01, rollLen - 0.004);
  const sheetZ = zc + SLOT_Z; // the fabric hangs through the slot, just behind the lip
  const exitY = bottomY - EXIT_DROP;
  // Hem bar: resting just above the sill member when lowered, just under the caps when raised.
  const barHighY = bottomY - CAP_REVEAL - BAR_H / 2 - 0.003;
  const barLowY = Math.min(barHighY, innerBottom + BAR_H / 2 + 0.004);
  const barY = lerp(barLowY, barHighY, open);
  const loopLen = clamp(innerH * 0.55, 0.2, 1.0);
  const loopX = cassW / 2 - CAP_T - 0.016;
  const loopZ = zc + 0.018;
  const loopTop = bottomY - CAP_REVEAL;
  const bracketX = innerW / 2 - BRACKET_W / 2;
  const bracketY = innerTop - 0.0005 - BRACKET_H / 2;

  // ---- materials ------------------------------------------------------------------------------
  const env = useIndoorEnvironment();
  // The weave tile is offset per blind (from the window's size) so two windows never show the
  // same seam at the same place; the coated sheet keeps the normal map at a trace and drops the
  // roughness map (a PVC coating is one plain roughness).
  const jitter = useMemo(() => uvJitter(props.width, props.height, props.sill, props.reveal), [props.width, props.height, props.sill, props.reveal]);
  const weave = usePbr('fabric_pattern_05', translucent ? { repeat: WEAVE_REPEAT, normalScale: SCREEN_NORMAL, offset: jitter } : { repeat: WEAVE_REPEAT, normalScale: COATED_NORMAL });
  const maps = useMemo<PbrSet>(() => (translucent ? weave : { ...weave, roughnessMap: undefined }), [weave, translucent]);
  const fabric = useDisposable(
    () =>
      mottled(
        translucent
          ? makeFinish({
              color: color.hex,
              maps,
              roughness: 1,
              side: THREE.DoubleSide,
              opacity: SCREEN_OPACITY,
              sheen: 0.15,
              sheenColor: '#ffffff',
              sheenRoughness: 0.95,
              envMapIntensity: 0.5,
            })
          : makeFinish({ color: color.hex, maps, roughness: COATED_ROUGHNESS, side: THREE.DoubleSide, envMapIntensity: 0.6 }),
      ),
    [color.hex, maps, translucent],
  );
  const rolled = useDisposable(
    () => mottled(makeFinish({ color: color.hex, maps, roughness: translucent ? 1 : COATED_ROUGHNESS, envMapIntensity: 0.6 })),
    [color.hex, maps, translucent],
  );
  // Brushed anodised aluminium: the grain runs along the bar (U of the metric box mapping = X).
  const barMat = useDisposable(() => {
    const m = makeFinish({ color: dark ? '#3a3b3e' : '#ecebe7', roughness: 0.3, metalness: 0.9, envMapIntensity: 0.9 });
    m.anisotropy = 0.8;
    m.anisotropyRotation = 0;
    m.envMap = env;
    return m;
  }, [dark, env]);
  const cassetteMat = dark ? HARDWARE.anthracite : HARDWARE.white;

  // ---- geometry -------------------------------------------------------------------------------
  const cassette = useDisposable(() => {
    const parts = [extrudeX(shellProfile(), shellLen)];
    for (const side of [-1, 1]) {
      const cap = extrudeX(cassetteOutline(CAP_REVEAL), CAP_T);
      cap.translate(side * (cassW / 2 - CAP_T / 2), 0, 0);
      parts.push(cap);
      // bracket block against the jamb, from the back of the cassette forward
      parts.push(roundedBox(BRACKET_W, BRACKET_H, BRACKET_D, 0.0008, side * bracketX, bracketY - yc, -HALF_D + BRACKET_D / 2));
    }
    const merged = mergeParts(parts);
    merged.translate(0, yc, zc);
    return merged;
  }, [cassW, shellLen, bracketX, bracketY, yc, zc]);
  const roll = useDisposable(() => rollGeometry(rollLen), [rollLen]);
  const bar = useDisposable(() => roundedBox(sheetW + 0.01, BAR_H, BAR_D, 0.004), [sheetW]);
  const sheet = useDisposable(sheetGeometry, []);
  const loop = useMemo(() => beadLoop(LOOP_R, loopLen, BEAD_PITCH), [loopLen]);
  const beads = useInstancedMesh(BEAD, HARDWARE.metal, loop.length / 2);

  // ---- sheet strip: bend around the roll, run to the slot, then straight down to the hem bar --
  useLayoutEffect(() => {
    const pos = sheet.getAttribute('position');
    const nor = sheet.getAttribute('normal');
    const uv = sheet.getAttribute('uv');
    const rs = r + 0.0005; // hugs the roll without z-fighting
    const th0 = Math.min(Math.PI / 2, BEND_LEN / rs);
    const setRow = (k: number, y: number, z: number, ny: number, nz: number, v: number) => {
      for (let s = 0; s < 2; s++) {
        const i = 2 * k + s;
        const x = ((s === 0 ? -1 : 1) * sheetW) / 2;
        pos.setXYZ(i, x, y, z);
        nor.setXYZ(i, 0, ny, nz);
        uv.setXY(i, x + sheetW / 2, v);
      }
    };
    for (let k = 0; k <= ARC_ROWS; k++) {
      const th = th0 * (1 - k / ARC_ROWS);
      setRow(k, yc + rs * Math.sin(th), zc + rs * Math.cos(th), Math.sin(th), Math.cos(th), rs * (th0 - th));
    }
    // from the front of the roll to the slot exit (inside the closed cassette), then vertical
    const vArc = rs * th0;
    const dy = yc - exitY;
    const dz = sheetZ - (zc + rs);
    const run = Math.hypot(dy, dz);
    const vExit = vArc + run;
    setRow(ARC_ROWS + 1, exitY, sheetZ, dz / run, dy / run, vExit);
    setRow(ARC_ROWS + 2, barY, sheetZ, 0, 1, vExit + (exitY - barY));
    pos.needsUpdate = true;
    nor.needsUpdate = true;
    uv.needsUpdate = true;
    sheet.computeBoundingSphere();
  }, [sheet, r, sheetW, yc, zc, exitY, sheetZ, barY]);

  // ---- bead chain -----------------------------------------------------------------------------
  useLayoutEffect(() => {
    fillBeads(beads, loop, loopX, loopTop, loopZ, BEAD_R);
  }, [beads, loop, loopX, loopTop, loopZ]);

  return (
    <group name="roller-blind">
      <mesh geometry={cassette} material={cassetteMat} castShadow receiveShadow />
      {/* the fabric wound on the tube, inside the cassette */}
      <mesh geometry={roll} material={rolled} position={[0, yc, zc]} scale={[1, r, r]} />
      {/* the dark inside of the slot the fabric exits through (0.5 mm clear of the slot walls) */}
      <mesh geometry={UNIT_BOX} material={HARDWARE.shadow} position={[0, bottomY - 0.0004 + SLOT_BOX_H / 2, sheetZ]} scale={[shellLen - 0.002, SLOT_BOX_H, SLOT_W - 0.001]} />
      {/* hanging sheet (bent over the roll at the top) */}
      <mesh geometry={sheet} material={fabric} castShadow={!translucent} receiveShadow />
      {/* hem bar the fabric runs through */}
      <mesh geometry={bar} material={barMat} position={[0, barY, sheetZ]} castShadow receiveShadow />
      {/* bead chain loop from the right end cap, with its tidy clip at the bottom */}
      <primitive object={beads} />
      <mesh geometry={UNIT_BOX} material={cassetteMat} position={[loopX, loopTop - loopLen - LOOP_R - 0.012, loopZ]} scale={[0.012, 0.03, 0.007]} />
    </group>
  );
}
