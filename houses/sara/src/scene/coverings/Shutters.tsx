/**
 * PLANTATION SHUTTERS — inside mount: a shutter frame lines the reveal between the jambs and
 * the louvred panels hang on it, their front face 1.2 cm behind the interior wall face (in
 * front of the window frame's central mullion).
 *
 *   - the shutter frame: head, sill and two jambs (3.8 cm face, 3 mm rounded edges),
 *   - two hinged panels (left / right), or four bi-fold panels (two per side) when the opening
 *     is wider than 1.4 m. Each panel is a frame of 4.8 cm stiles and rails (rounded 3 mm,
 *     plus a divider rail on panels taller than 1.3 m) holding 6.3 cm elliptical-section
 *     louvres (8 mm thick) at a 6.3 cm pitch, and a tilt rod stapled to the louvres' front
 *     edges (it rides up / down as they tilt),
 *   - `tilt` rotates every louvre about X by tilt × 85°,
 *   - `open` swings each outer panel about its hinges on the frame into the room by open × 100°.
 *     A bi-fold pair swings to open × 90° while the inner panel folds back by twice that angle,
 *     which keeps its free end sliding along the head track (the wall plane) exactly like the
 *     real mechanism; at open = 1 both panels stand stacked face to face beside the jamb,
 *   - brushed nickel hardware: hinge knuckles with their two leaves on every hinged edge (2, or
 *     3 on tall panels), and a magnet catch (plate on the frame head, magnet on the panel) at
 *     the meeting stiles.
 *
 * Finishes: white / cream / grey semi-gloss paint (roughness 0.45, clearcoat 0.15), black
 * (roughness 0.5), 'oak' with a real wood map running along the stiles, rails and louvres.
 *
 * Rendering: eight InstancedMeshes for the whole window — frame, panels (one merged geometry
 * per panel), louvres, rods, staples, knuckles, leaves and catches — so a shutter costs eight
 * draw calls whatever its size. All instance matrices are composed in a layout effect from the
 * panel transforms.
 *
 * Panel transforms (canonical panel frame: hinge axis = Y through the origin at the panel's
 * mid-depth, panel extends along +X, front face at +Z):
 *   left  : T(−openW/2, 0, HINGE_Z) · rotY(−swing)
 *   right : T(+openW/2, 0, HINGE_Z) · rotY(+swing) · rotZ(π)      (a rotation, never a mirror,
 *           so instanced winding / normals stay correct; the tilt sense is negated to compensate)
 *   inner : outer · T(W, 0, D/2) · rotY(+fold) · T(0, 0, −D/2)      (folds about the front edge;
 *           fold = 2 × swing keeps its free end on the wall plane, so the pair forms a V whose
 *           apex is the fold hinge out in the room)
 *
 * Local frame (see ./types.ts): origin = centre of the opening on the interior wall face,
 * +X along the wall, +Y up, +Z into the room. Pure & prop-driven, no store access.
 */
import * as THREE from 'three';
import { useLayoutEffect, useMemo } from 'react';
import { usePbr } from '../materials';
import type { CoveringProps } from './types';
import {
  DEG,
  HARDWARE,
  THIN_CYL_Y,
  UNIT_BOX,
  UNIT_CYL_Y,
  clamp,
  clamp01,
  clearOpening,
  commitInstances,
  ellipticalSlatGeometry,
  finite,
  makeFinish,
  mergeParts,
  roundedBox,
  safeSize,
  setInstanceMatrix,
  useDisposable,
  useInstancedMesh,
  woodFinish,
} from './slats';

const FRAME_W = 0.038;
const STILE = 0.048;
const RAIL = 0.048;
const PANEL_D = 0.025;
const EDGE_R = 0.003;
const LOUVRE_W = 0.063;
const LOUVRE_PITCH = 0.063;
const LOUVRE_T = 0.008;
const ROD_W = 0.012;
const ROD_D = 0.008;
/** Staple between a louvre's front edge and the back of the rod. */
const STAPLE = 0.006;
const BIFOLD_MIN_W = 1.4;
const MID_RAIL_MIN_H = 1.3;
const SWING_MAX = 100 * DEG;
const TILT_MAX = 85 * DEG;
/** z of the closed panels' (and the frame's) front face, inside the reveal. */
const FRONT_Z = -0.012;
/** The hinge axis runs through the panel's mid-depth. */
const HINGE_Z = FRONT_Z - PANEL_D / 2;
const HINGE_LEN = 0.07;
const HINGE_R = 0.0055;
const LEAF_W = 0.028;
const LEAF_T = 0.0015;
/** Hinge knuckles this far from the panel's top / bottom. */
const HINGE_INSET = 0.12;

interface Section {
  y0: number;
  y1: number;
  /** Louvre centre heights (canonical panel frame). */
  ys: number[];
}

interface Layout {
  frameW: number;
  frameH: number;
  openW: number;
  openH: number;
  bifold: boolean;
  panelW: number;
  panelH: number;
  midRail: boolean;
  sections: Section[];
  louvreLen: number;
  panels: number;
  louvresPerPanel: number;
  hingesPerEdge: number;
  rodLen: number;
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
    roundedBox(STILE, H, PANEL_D, EDGE_R, STILE / 2, 0, 0, 'y'),
    roundedBox(STILE, H, PANEL_D, EDGE_R, W - STILE / 2, 0, 0, 'y'),
    roundedBox(railW, RAIL, PANEL_D, EDGE_R, W / 2, H / 2 - RAIL / 2, 0, 'x'),
    roundedBox(railW, RAIL, PANEL_D, EDGE_R, W / 2, -H / 2 + RAIL / 2, 0, 'x'),
  ];
  if (midRail) parts.push(roundedBox(railW, RAIL, PANEL_D, EDGE_R, W / 2, 0, 0, 'x'));
  return mergeParts(parts);
}

/** Head, sill and jambs of the shutter frame lining the clear opening (window frame). */
function shutterFrameGeometry(frameW: number, frameH: number): THREE.BufferGeometry {
  const jambH = Math.max(0.01, frameH - 2 * FRAME_W);
  return mergeParts([
    roundedBox(frameW, FRAME_W, PANEL_D, EDGE_R, 0, frameH / 2 - FRAME_W / 2, HINGE_Z, 'x'),
    roundedBox(frameW, FRAME_W, PANEL_D, EDGE_R, 0, -frameH / 2 + FRAME_W / 2, HINGE_Z, 'x'),
    roundedBox(FRAME_W, jambH, PANEL_D, EDGE_R, -frameW / 2 + FRAME_W / 2, 0, HINGE_Z, 'y'),
    roundedBox(FRAME_W, jambH, PANEL_D, EDGE_R, frameW / 2 - FRAME_W / 2, 0, HINGE_Z, 'y'),
  ]);
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
const _identity = new THREE.Matrix4();

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
    const frameW = Math.max(0.09, innerW - 0.004);
    const frameH = Math.max(0.09, innerH - 0.004);
    const openW = Math.max(0.02, frameW - 2 * FRAME_W);
    const openH = Math.max(0.02, frameH - 2 * FRAME_W);
    const bifold = width > BIFOLD_MIN_W;
    const leaf = Math.max(0.08, openW / 2 - 0.003); // 6 mm gap where the leaves meet
    const panelW = bifold ? leaf / 2 : leaf;
    const panelH = Math.max(0.1, openH - 0.006);
    const midRail = panelH > MID_RAIL_MIN_H;
    const sections = midRail
      ? [sectionLouvres(RAIL / 2, panelH / 2 - RAIL), sectionLouvres(-panelH / 2 + RAIL, -RAIL / 2)]
      : [sectionLouvres(-panelH / 2 + RAIL, panelH / 2 - RAIL)];
    const louvresPerPanel = sections.reduce((acc, s) => acc + s.ys.length, 0);
    const rodLen = sections.reduce((acc, s) => Math.max(acc, s.y1 - s.y0 - 0.03), 0.01);
    return {
      frameW,
      frameH,
      openW,
      openH,
      bifold,
      panelW,
      panelH,
      midRail,
      sections,
      louvreLen: Math.max(0.01, panelW - 2 * STILE + 0.012),
      panels: bifold ? 4 : 2,
      louvresPerPanel,
      hingesPerEdge: panelH > MID_RAIL_MIN_H ? 3 : 2,
      rodLen,
    };
  }, [width, innerW, innerH]);
  const { frameW, frameH, openW, panelW, panelH, midRail, sections, louvreLen, panels, louvresPerPanel, bifold, hingesPerEdge, rodLen } = layout;

  // ---- resources ------------------------------------------------------------------------------
  const grain = woodFinish(color.id);
  const maps = usePbr(grain?.tex ?? 'kitchen_wood', { size: [1, 1], rotation: grain?.rotation ?? 0 });
  const mat = useDisposable(() => {
    if (grain) return makeFinish({ color: '#ffffff', tint: grain.tint.clone().multiplyScalar(0.9), maps, roughness: 1, clearcoat: 0.1, clearcoatRoughness: 0.4, envMapIntensity: 0.9 });
    if (color.id === 'black') return makeFinish({ color: color.hex, roughness: 0.5, clearcoat: 0.1, clearcoatRoughness: 0.4, envMapIntensity: 0.9 });
    return makeFinish({ color: color.hex, roughness: 0.45, clearcoat: 0.15, clearcoatRoughness: 0.35, envMapIntensity: 0.9 });
  }, [color.id, color.hex, grain, maps]);
  const frameGeo = useDisposable(() => shutterFrameGeometry(frameW, frameH), [frameW, frameH]);
  const panelGeo = useDisposable(() => panelFrameGeometry(panelW, panelH, midRail), [panelW, panelH, midRail]);
  const louvreGeo = useDisposable(() => ellipticalSlatGeometry(louvreLen, LOUVRE_T, LOUVRE_W), [louvreLen]);
  const rodGeo = useDisposable(() => roundedBox(ROD_W, rodLen, ROD_D, 0.003, 0, 0, 0, 'y'), [rodLen]);

  const panelMeshes = useInstancedMesh(panelGeo, mat, panels, true);
  const louvres = useInstancedMesh(louvreGeo, mat, panels * louvresPerPanel, true);
  const rods = useInstancedMesh(rodGeo, mat, panels * sections.length);
  const staples = useInstancedMesh(THIN_CYL_Y, HARDWARE.nickel, panels * louvresPerPanel);
  const knuckles = useInstancedMesh(UNIT_CYL_Y, HARDWARE.nickel, panels * hingesPerEdge);
  const leaves = useInstancedMesh(UNIT_BOX, HARDWARE.nickel, panels * hingesPerEdge * 2);
  const catches = useInstancedMesh(UNIT_BOX, HARDWARE.nickel, 4);

  // ---- instance matrices ----------------------------------------------------------------------
  useLayoutEffect(() => {
    // A bi-fold is track-guided: the pair swings to 90° while the inner panel folds by 2 × swing.
    const swing = open * (bifold ? Math.PI / 2 : SWING_MAX);
    const fold = 2 * swing;
    const tiltA = tilt * TILT_MAX;
    const hinge: number[] = [];
    for (let k = 0; k < hingesPerEdge; k++) {
      const hy = Math.max(0.02, panelH / 2 - HINGE_INSET);
      hinge.push(hingesPerEdge === 1 ? 0 : -hy + (2 * hy * k) / (hingesPerEdge - 1));
    }
    let pi = 0;
    let li = 0;
    let ri = 0;
    let si = 0;
    let ki = 0;
    let fi = 0;
    let ci = 0;
    for (const side of [-1, 1] as const) {
      // outer panel, hinged on the frame jamb
      const outer = compose(_panelMats[0], (side * openW) / 2, 0, HINGE_Z, 0, side * swing, 0);
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
      const edgeY = -(LOUVRE_W / 2) * Math.sin(tau); // louvre front edge, relative to its centre
      const edgeZ = (LOUVRE_W / 2) * Math.cos(tau);
      const rodZ = edgeZ + STAPLE + ROD_D / 2;
      for (let p = 0; p < count; p++) {
        const mp = _panelMats[p];
        setInstanceMatrix(panelMeshes, pi++, mp);
        for (const sec of sections) {
          for (const y of sec.ys) {
            setInstanceMatrix(louvres, li++, _mOut.copy(mp).multiply(compose(_mA, panelW / 2, y, 0, tau)));
            setInstanceMatrix(staples, si++, _mOut.copy(mp).multiply(compose(_mA, panelW / 2, y + edgeY, edgeZ + STAPLE / 2, Math.PI / 2, 0, 0, 0.0011, STAPLE, 0.0011)));
          }
          const len = Math.max(0.01, sec.y1 - sec.y0 - 0.03);
          setInstanceMatrix(rods, ri++, _mOut.copy(mp).multiply(compose(_mA, panelW / 2, (sec.y0 + sec.y1) / 2 + edgeY, rodZ, 0, 0, 0, 1, len / rodLen, 1)));
        }
        // hinges on the hinged edge (x = 0 of the canonical frame): knuckle on the front face,
        // one leaf on this panel and one on what it hangs from (the frame jamb or the outer panel)
        for (const hy of hinge) {
          setInstanceMatrix(knuckles, ki++, _mOut.copy(mp).multiply(compose(_mA, 0, hy, PANEL_D / 2, 0, 0, 0, HINGE_R, HINGE_LEN, HINGE_R)));
          setInstanceMatrix(leaves, fi++, _mOut.copy(mp).multiply(compose(_mA, HINGE_R + LEAF_W / 2, hy, PANEL_D / 2 + LEAF_T / 2, 0, 0, 0, LEAF_W, HINGE_LEN, LEAF_T)));
          if (p === 0) {
            const x = side * (openW / 2 + HINGE_R + LEAF_W / 2);
            setInstanceMatrix(leaves, fi++, compose(_mOut, x, hy, FRONT_Z + LEAF_T / 2, 0, 0, 0, LEAF_W, HINGE_LEN, LEAF_T));
          } else {
            setInstanceMatrix(leaves, fi++, _mOut.copy(_panelMats[0]).multiply(compose(_mA, panelW - HINGE_R - LEAF_W / 2, hy, PANEL_D / 2 + LEAF_T / 2, 0, 0, 0, LEAF_W, HINGE_LEN, LEAF_T)));
          }
        }
      }
      // magnet catch at the meeting stile of the innermost panel: magnet on its top rail, plate on the frame head
      const last = _panelMats[count - 1];
      setInstanceMatrix(catches, ci++, _mOut.copy(last).multiply(compose(_mA, panelW - 0.035, panelH / 2 - RAIL / 2, PANEL_D / 2 + 0.003, 0, 0, 0, 0.02, 0.012, 0.006)));
      setInstanceMatrix(catches, ci++, compose(_mOut, side * 0.035, frameH / 2 - FRAME_W / 2, FRONT_Z + LEAF_T / 2, 0, 0, 0, 0.022, 0.012, LEAF_T));
    }
    commitInstances(panelMeshes, pi);
    commitInstances(louvres, li);
    commitInstances(rods, ri);
    commitInstances(staples, si);
    commitInstances(knuckles, ki);
    commitInstances(leaves, fi);
    commitInstances(catches, ci);
  }, [panelMeshes, louvres, rods, staples, knuckles, leaves, catches, open, tilt, openW, bifold, panelW, panelH, sections, hingesPerEdge, rodLen, frameH]);

  return (
    <group name="shutters">
      <mesh geometry={frameGeo} material={mat} matrix={_identity} castShadow receiveShadow />
      <primitive object={panelMeshes} />
      <primitive object={louvres} />
      <primitive object={rods} />
      <primitive object={staples} />
      <primitive object={knuckles} />
      <primitive object={leaves} />
      <primitive object={catches} />
    </group>
  );
}
