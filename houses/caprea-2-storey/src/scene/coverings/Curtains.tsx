/**
 * CURTAINS (drapes): a dark-bronze rod with finials, wall brackets and rings, and two pinch-pleated
 * panels hanging from rod height to the floor (or 15 cm below the opening for high-sill windows).
 * `open` slides each panel back toward its outer edge, gathering the pleats tighter; the outer
 * edge of each panel never moves. With `state.sheer`, a closed white voile (<Sheers/>) hangs
 * behind the drapes — the classic "sheers under open drapes" look.
 *
 * Local frame (see ./types.ts): origin = centre of the opening on the interior wall face,
 * +X along the wall, +Y up, +Z into the room. Panels hang at z ≈ 0.10, the rod at 0.11.
 * Pure & prop-driven: no store access, geometry rebuilt only when the quantised `open` changes.
 */
import * as THREE from 'three';
import { useLayoutEffect, useRef } from 'react';
import type { ColorOption } from '../../data/coverings';
import type { CoveringProps } from './types';
import { floorY } from './types';
import { Sheers } from './Sheers';
import { buildPleatedPanel, clamp, finite, lerp, makeFabricMaterial, quantizeOpen, safeSize, useDisposable } from './fabric';

/** Depth of the panels in front of the wall face (m). */
const PANEL_Z = 0.1;
/** Depth of the rod axis in front of the wall face (m). */
const ROD_Z = 0.11;
const ROD_RADIUS = 0.012;
/** The rod sits this far above the head of the opening (m). */
const ROD_LIFT = 0.12;
/** Flat fabric width ÷ gathered width (standard double fullness). */
const FULLNESS = 2;
/** Pleats per metre of flat fabric (≈ 8 cm between pleats on the gathered panel). */
const PLEATS_PER_M = 6;
/** Width of the stack each panel gathers into when fully drawn back (m). */
const STACK_W = 0.18;
/** Windows whose sill is below this get floor-length panels (m). */
const FLOOR_LENGTH_SILL = 1.1;
const RING_R = 0.02;

/** Voile used for the sheer layer behind drapes. */
const WHITE_VOILE: ColorOption = { id: 'white', name: 'White voile', nameFr: 'Voile blanc', hex: '#ffffff', translucency: 0.6 };

// scratch objects for instance matrices (module-level, never retained)
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
/** Torus lies in XY by default; rotate it so the ring encircles the X-axis rod. */
const _ringQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));

export function Curtains(props: CoveringProps) {
  const { sill, isDoor, state, color } = props;
  const width = safeSize(props.width);
  const height = safeSize(props.height);
  const open = quantizeOpen(state.open, 24);

  // ---- vertical extent ------------------------------------------------------------------------
  const rodY = height / 2 + ROD_LIFT;
  const floorLength = isDoor || finite(sill, 0) < FLOOR_LENGTH_SILL;
  const bottom = floorLength ? finite(floorY(props), -height / 2) + 0.01 : -height / 2 - 0.15;
  const top = rodY - 0.035; // header hangs just below the rings
  const panelH = Math.max(0.05, top - bottom);
  const panelCY = (top + bottom) / 2;

  // ---- horizontal extent ----------------------------------------------------------------------
  const outerX = width / 2 + 0.25; // fixed outer edge of each panel
  const fullW = width / 2 + 0.2; // closed panel width (panels overlap 0.1 m at the centre)
  const panelW = lerp(fullW, STACK_W, open);
  // Fixed pleat count → pleats get denser as the panel narrows.
  const pleats = Math.max(3, Math.round(fullW * FULLNESS * PLEATS_PER_M));
  const amplitude = lerp(0.03, 0.04, open);

  const panel = useDisposable(
    () => buildPleatedPanel({ width: panelW, height: panelH, pleats, amplitude }),
    [panelW, panelH, pleats, amplitude],
  );
  const fabric = useDisposable(
    () => makeFabricMaterial({ hex: color.hex, roughness: color.roughness ?? 0.95 }),
    [color.hex, color.roughness],
  );

  // ---- hardware: rod, finials, brackets, rings (dark bronze) ----------------------------------
  const span = width + 0.5;
  const rodGeo = useDisposable(() => {
    const g = new THREE.CylinderGeometry(ROD_RADIUS, ROD_RADIUS, span, 12, 1);
    g.rotateZ(Math.PI / 2); // along X
    return g;
  }, [span]);
  const collarGeo = useDisposable(() => {
    const g = new THREE.CylinderGeometry(ROD_RADIUS * 1.5, ROD_RADIUS * 1.5, 0.02, 12, 1);
    g.rotateZ(Math.PI / 2);
    return g;
  }, []);
  const finialGeo = useDisposable(() => new THREE.SphereGeometry(0.028, 12, 10), []);
  const armGeo = useDisposable(() => new THREE.BoxGeometry(0.025, 0.025, ROD_Z), []);
  const plateGeo = useDisposable(() => new THREE.BoxGeometry(0.05, 0.07, 0.012), []);
  const ringGeo = useDisposable(() => new THREE.TorusGeometry(RING_R, 0.0035, 6, 14), []);
  const bronze = useDisposable(() => new THREE.MeshStandardMaterial({ color: '#4a3726', roughness: 0.4, metalness: 0.7 }), []);

  // Rings: a fixed number per panel (one per pleat-ish), spread over the panel's current width.
  const ringsPerPanel = clamp(Math.round(fullW * 7), 4, 14);
  const rings = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const im = rings.current;
    if (!im) return;
    for (let i = 0; i < ringsPerPanel; i++) {
      const t = ringsPerPanel > 1 ? i / (ringsPerPanel - 1) : 0.5;
      const dx = 0.015 + t * Math.max(0, panelW - 0.03);
      _p.set(-outerX + dx, rodY, ROD_Z);
      _m.compose(_p, _ringQ, _s);
      im.setMatrixAt(i, _m);
      _p.set(outerX - dx, rodY, ROD_Z);
      _m.compose(_p, _ringQ, _s);
      im.setMatrixAt(ringsPerPanel + i, _m);
    }
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
  }, [ringsPerPanel, panelW, outerX, rodY]);

  const bracketX = width / 2 + 0.15;
  const collarX = span / 2 + 0.005;
  const finialX = span / 2 + 0.035;

  return (
    <group>
      {/* sheer layer behind the drapes */}
      {state.sheer && <Sheers {...props} color={WHITE_VOILE} state={{ ...state, type: 'sheers', open: 0, sheer: false }} />}

      {/* rod + finials */}
      <mesh geometry={rodGeo} material={bronze} position={[0, rodY, ROD_Z]} />
      <mesh geometry={collarGeo} material={bronze} position={[-collarX, rodY, ROD_Z]} />
      <mesh geometry={collarGeo} material={bronze} position={[collarX, rodY, ROD_Z]} />
      <mesh geometry={finialGeo} material={bronze} position={[-finialX, rodY, ROD_Z]} />
      <mesh geometry={finialGeo} material={bronze} position={[finialX, rodY, ROD_Z]} />

      {/* brackets: a wall plate and an arm reaching out to the rod */}
      <mesh geometry={plateGeo} material={bronze} position={[-bracketX, rodY - 0.035, 0.006]} />
      <mesh geometry={plateGeo} material={bronze} position={[bracketX, rodY - 0.035, 0.006]} />
      <mesh geometry={armGeo} material={bronze} position={[-bracketX, rodY - 0.02, ROD_Z / 2]} />
      <mesh geometry={armGeo} material={bronze} position={[bracketX, rodY - 0.02, ROD_Z / 2]} />

      {/* rings */}
      <instancedMesh ref={rings} args={[ringGeo, bronze, ringsPerPanel * 2]} />

      {/* left panel — its outer (left) edge stays at -outerX */}
      <mesh geometry={panel} material={fabric} position={[-outerX + panelW / 2, panelCY, PANEL_Z]} castShadow receiveShadow />
      {/* right panel — the same geometry mirrored so its outer (right) edge stays at +outerX */}
      <mesh geometry={panel} material={fabric} position={[outerX - panelW / 2, panelCY, PANEL_Z]} scale={[-1, 1, 1]} castShadow receiveShadow />
    </group>
  );
}
