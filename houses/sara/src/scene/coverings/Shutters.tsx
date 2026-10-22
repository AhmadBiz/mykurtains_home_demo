/**
 * PLANTATION SHUTTERS — inside mount: the panels sit in the reveal, between the jambs, their
 * front face 1.2 cm behind the interior wall face (in front of the frame's central mullion).
 *
 *   - two hinged panels (left / right), or four bi-fold panels (two per side) when the opening
 *     is wider than 1.4 m. Each panel is a frame (two stiles + top & bottom rails, 4.5 × 2.5 cm,
 *     plus a divider rail on panels taller than 1.3 m) holding 6.3 cm louvres at a 6.3 cm pitch
 *     and a tilt rod attached to the louvres' front edges (it rides up / down as they tilt),
 *   - `tilt` rotates every louvre about X by tilt × 85°,
 *   - `open` swings each outer panel about its hinge on the jamb into the room by open × 100°.
 *     A bi-fold pair swings to open × 90° while the inner panel folds back by twice that angle,
 *     which keeps its free end sliding along the head track (the wall plane) exactly like the
 *     real mechanism; at open = 1 both panels stand stacked face to face beside the jamb,
 *   - dark hinge knuckles on every hinged edge.
 *
 * Rendering: four InstancedMeshes for the whole window — frames (one merged geometry per
 * panel), louvres, tilt rods and hinges — so a shutter costs four draw calls whatever its
 * size. All instance matrices are composed in a layout effect from the panel transforms.
 *
 * Panel transforms (canonical panel frame: hinge axis = Y through the origin at the panel's
 * mid-depth, panel extends along +X, front face at +Z):
 *   left  : T(−innerW/2, 0, HINGE_Z) · rotY(−swing)
 *   right : T(+innerW/2, 0, HINGE_Z) · rotY(+swing) · rotZ(π)      (a rotation, never a mirror,
 *           so instanced winding / normals stay correct; the tilt sense is negated to compensate)
 *   inner : outer · T(W, 0, D/2) · rotY(+fold) · T(0, 0, −D/2)      (folds about the front edge;
 *           fold = 2 × swing keeps its free end on the wall plane, so the pair forms a V whose
 *           apex is the fold hinge out in the room)
 *
 * Material: catalogue hex, roughness 0.6; 'oak' gets a procedural grain using the accent.
 * Local frame (see ./types.ts): origin = centre of the opening on the interior wall face,
 * +X along the wall, +Y up, +Z into the room. Pure & prop-driven, no store access.
 */
import * as THREE from 'three';
import { useLayoutEffect, useMemo } from 'react';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
  makeSlatMaterial,
  safeSize,
  setInstanceMatrix,
  useDisposable,
  useInstancedMesh,
  woodGrainTexture,
} from './slats';

const STILE = 0.045;
const RAIL = 0.045;
const PANEL_D = 0.025;
const LOUVRE_W = 0.063;
const LOUVRE_PITCH = 0.063;
const LOUVRE_T = 0.007;
const ROD_W = 0.012;
const ROD_D = 0.008;
const BIFOLD_MIN_W = 1.4;
const MID_RAIL_MIN_H = 1.3;
const SWING_MAX = 100 * DEG;
const TILT_MAX = 85 * DEG;
/** z of the closed panels' front face (inside the reveal). */
const FRONT_Z = -0.012;
/** The hinge axis runs through the panel's mid-depth. */
const HINGE_Z = FRONT_Z - PANEL_D / 2;
const HINGE_LEN = 0.07;
const HINGE_R = 0.0055;
/** Hinge knuckles this far from the panel's top / bottom. */
const HINGE_INSET = 0.12;

interface Section {
  y0: number;
  y1: number;
  /** Louvre centre heights (canonical panel frame). */
  ys: number[];
}

interface Layout {
  innerW: number;
  bifold: boolean;
  panelW: number;
  panelH: number;
  midRail: boolean;
  sections: Section[];
  louvreLen: number;
  panels: number;
  louvresPerPanel: number;
}

function sectionLouvres(y0: number, y1: number): Section {
  const span = Math.max(0, y1 - y0);
  const count = Math.floor(span / LOUVRE_PITCH);
  const offset = (span - count * LOUVRE_PITCH) / 2;
  const ys: number[] = [];
  for (let k = 0; k < count; k++) ys.push(y1 - offset - LOUVRE_PITCH / 2 - k * LOUVRE_PITCH);
  return { y0, y1, ys };
}

/** Stiles + rails of one panel, merged. Canonical frame: hinge edge at x = 0, extends to x = W. */
function panelFrameGeometry(W: number, H: number, midRail: boolean): THREE.BufferGeometry {
  const railW = Math.max(0.01, W - 2 * STILE);
  const parts: THREE.BufferGeometry[] = [
    grainBox(STILE, H, PANEL_D, STILE / 2, 0, 0, 'y'),
    grainBox(STILE, H, PANEL_D, W - STILE / 2, 0, 0, 'y'),
    grainBox(railW, RAIL, PANEL_D, W / 2, H / 2 - RAIL / 2, 0, 'x'),
    grainBox(railW, RAIL, PANEL_D, W / 2, -H / 2 + RAIL / 2, 0, 'x'),
  ];
  if (midRail) parts.push(grainBox(railW, RAIL, PANEL_D, W / 2, 0, 0, 'x'));
  const merged = mergeGeometries(parts, false) ?? new THREE.BoxGeometry(W, H, PANEL_D).translate(W / 2, 0, 0);
  for (const p of parts) p.dispose();
  return merged;
}

// scratch objects for composing instance matrices (module-level, never retained)
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _mA = new THREE.Matrix4();
const _mB = new THREE.Matrix4();
const _mOut = new THREE.Matrix4();
const _panelMats = [new THREE.Matrix4(), new THREE.Matrix4()];

function compose(out: THREE.Matrix4, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  return out.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
}

export function Shutters(props: CoveringProps) {
  const { state, color } = props;
  const width = safeSize(props.width);
  const { innerW, innerH } = clearOpening(width, props.height);
  const open = clamp01(finite(state.open, 0));
  const tilt = clamp(finite(state.tilt, 0), -1, 1);

  // ---- layout ---------------------------------------------------------------------------------
  const layout = useMemo<Layout>(() => {
    const bifold = width > BIFOLD_MIN_W;
    const leaf = Math.max(0.08, innerW / 2 - 0.003); // 6 mm gap where the leaves meet
    const panelW = bifold ? leaf / 2 : leaf;
    const panelH = Math.max(0.1, innerH - 0.006);
    const midRail = panelH > MID_RAIL_MIN_H;
    const sections = midRail
      ? [sectionLouvres(RAIL / 2, panelH / 2 - RAIL), sectionLouvres(-panelH / 2 + RAIL, -RAIL / 2)]
      : [sectionLouvres(-panelH / 2 + RAIL, panelH / 2 - RAIL)];
    const louvresPerPanel = sections.reduce((acc, s) => acc + s.ys.length, 0);
    return {
      innerW,
      bifold,
      panelW,
      panelH,
      midRail,
      sections,
      louvreLen: Math.max(0.01, panelW - 2 * STILE + 0.012),
      panels: bifold ? 4 : 2,
      louvresPerPanel,
    };
  }, [width, innerW, innerH]);
  const { panelW, panelH, midRail, sections, louvreLen, panels, louvresPerPanel, bifold } = layout;

  // ---- resources ------------------------------------------------------------------------------
  const grain = color.id === 'oak' ? woodGrainTexture(color.hex, color.accent) : null; // shared, never disposed
  const mat = useDisposable(() => makeSlatMaterial(color, { map: grain, roughness: color.roughness ?? 0.6, metalness: 0 }), [color.hex, color.roughness, grain]);
  const frameGeo = useDisposable(() => panelFrameGeometry(panelW, panelH, midRail), [panelW, panelH, midRail]);
  const louvreGeo = useDisposable(() => grainBox(louvreLen, LOUVRE_T, LOUVRE_W), [louvreLen]);

  const frames = useInstancedMesh(frameGeo, mat, panels, true);
  const louvres = useInstancedMesh(louvreGeo, mat, panels * louvresPerPanel, true);
  const rods = useInstancedMesh(UNIT_BOX, mat, panels * sections.length);
  const hinges = useInstancedMesh(UNIT_CYL_Y, HARDWARE.dark, panels * 2);

  // ---- instance matrices ----------------------------------------------------------------------
  useLayoutEffect(() => {
    // A bi-fold is track-guided: the pair swings to 90° while the inner panel folds by 2 × swing.
    const swing = open * (bifold ? Math.PI / 2 : SWING_MAX);
    const fold = 2 * swing;
    const tiltA = tilt * TILT_MAX;
    let fi = 0;
    let li = 0;
    let ri = 0;
    let hi = 0;
    for (const side of [-1, 1] as const) {
      // outer panel, hinged on the jamb
      const outer = compose(_panelMats[0], (side * innerW) / 2, 0, HINGE_Z, 0, side * swing, 0);
      if (side > 0) outer.multiply(compose(_mA, 0, 0, 0, 0, 0, Math.PI));
      const count = bifold ? 2 : 1;
      if (bifold) {
        // inner panel folds about the front edge of the outer panel's inner stile
        _panelMats[1]
          .copy(outer)
          .multiply(compose(_mA, panelW, 0, PANEL_D / 2, 0, fold, 0))
          .multiply(compose(_mB, 0, 0, -PANEL_D / 2));
      }
      // rotZ(π) on the right-hand side mirrors the sense of a rotation about X
      const tau = side < 0 ? tiltA : -tiltA;
      const rodYOff = -(LOUVRE_W / 2) * Math.sin(tau);
      const rodZOff = (LOUVRE_W / 2) * Math.cos(tau) + ROD_D / 2 + 0.002;
      for (let p = 0; p < count; p++) {
        const mp = _panelMats[p];
        setInstanceMatrix(frames, fi++, mp);
        for (const sec of sections) {
          for (const y of sec.ys) setInstanceMatrix(louvres, li++, _mOut.copy(mp).multiply(compose(_mA, panelW / 2, y, 0, tau)));
          const rodLen = Math.max(0.01, sec.y1 - sec.y0 - 0.03);
          setInstanceMatrix(rods, ri++, _mOut.copy(mp).multiply(compose(_mA, panelW / 2, (sec.y0 + sec.y1) / 2 + rodYOff, rodZOff, 0, 0, 0, ROD_W, rodLen, ROD_D)));
        }
        // hinge knuckles on the front face at the hinged edge (x = 0 of the canonical frame)
        const hy = Math.max(0.02, panelH / 2 - HINGE_INSET);
        setInstanceMatrix(hinges, hi++, _mOut.copy(mp).multiply(compose(_mA, 0, hy, PANEL_D / 2, 0, 0, 0, HINGE_R, HINGE_LEN, HINGE_R)));
        setInstanceMatrix(hinges, hi++, _mOut.copy(mp).multiply(compose(_mA, 0, -hy, PANEL_D / 2, 0, 0, 0, HINGE_R, HINGE_LEN, HINGE_R)));
      }
    }
    commitInstances(frames, fi);
    commitInstances(louvres, li);
    commitInstances(rods, ri);
    commitInstances(hinges, hi);
  }, [frames, louvres, rods, hinges, open, tilt, innerW, bifold, panelW, panelH, sections]);

  return (
    <group name="shutters">
      <primitive object={frames} />
      <primitive object={louvres} />
      <primitive object={rods} />
      <primitive object={hinges} />
    </group>
  );
}
