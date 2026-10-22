/**
 * SHEERS (voilages): one wide gathered voile covering the opening, made of two panels that meet at
 * the centre when closed and draw back to the sides (outer edges fixed, inner edges travel) as
 * `open` → 1. Hangs from a slim white rod on two small brackets.
 *
 * Also rendered by <Curtains/> as the "sheer layer" behind drapes (white voile, closed).
 *
 * Local frame (see ./types.ts): origin = centre of the opening on the interior wall face,
 * +X along the wall, +Y up, +Z into the room. The voile hangs at z ≈ 0.04 (behind drapes at 0.10).
 * Pure & prop-driven: no store access, geometry rebuilt only when the quantised `open` changes.
 */
import * as THREE from 'three';
import type { CoveringProps } from './types';
import { floorY } from './types';
import { buildPleatedPanel, finite, lerp, makeFabricMaterial, quantizeOpen, safeSize, useDisposable } from './fabric';

/** Depth of the voile in front of the wall face (m). */
const PANEL_Z = 0.04;
const ROD_RADIUS = 0.008;
/** The rod sits this far above the head of the opening (m). */
const ROD_LIFT = 0.07;
/** Flat fabric width ÷ gathered width. Voile is gathered generously. */
const FULLNESS = 2.5;
/** Pleats per metre of flat fabric. */
const PLEATS_PER_M = 7;
/** Width of the narrow stack each panel gathers into when fully drawn back (m). */
const STACK_W = 0.15;
/** Windows whose sill is below this get floor-length panels (m). */
const FLOOR_LENGTH_SILL = 1.1;

export function Sheers(props: CoveringProps) {
  const { sill, isDoor, state, color } = props;
  const width = safeSize(props.width);
  const height = safeSize(props.height);
  const open = quantizeOpen(state.open, 24);

  // ---- vertical extent ------------------------------------------------------------------------
  const rodY = height / 2 + ROD_LIFT;
  const floorLength = isDoor || finite(sill, 0) < FLOOR_LENGTH_SILL;
  const bottom = floorLength ? finite(floorY(props), -height / 2) + 0.01 : -height / 2 - 0.15;
  const top = rodY - 0.02; // header hangs just under the rod
  const panelH = Math.max(0.05, top - bottom);
  const panelCY = (top + bottom) / 2;

  // ---- horizontal extent ----------------------------------------------------------------------
  // Outer edges are fixed at ±outerX; closed, both panels reach x = 0 and meet at the centre.
  const outerX = width / 2 + 0.2;
  const fullW = outerX;
  const panelW = lerp(fullW, STACK_W, open);
  // Fixed pleat count → pleats get denser as the panel is bunched up toward the side.
  const pleats = Math.max(4, Math.round(fullW * FULLNESS * PLEATS_PER_M));
  const amplitude = lerp(0.018, 0.028, open);

  const panel = useDisposable(
    () => buildPleatedPanel({ width: panelW, height: panelH, pleats, amplitude, headerDamp: 0.6, segY: 6 }),
    [panelW, panelH, pleats, amplitude],
  );

  const opacity = 1 - (color.translucency ?? 0.55);
  const voile = useDisposable(
    () => makeFabricMaterial({ hex: color.hex, roughness: 1, opacity, depthWrite: false }),
    [color.hex, opacity],
  );

  // ---- slim white rod + finials + brackets ----------------------------------------------------
  const span = width + 0.4;
  const rodGeo = useDisposable(() => {
    const g = new THREE.CylinderGeometry(ROD_RADIUS, ROD_RADIUS, span, 10, 1);
    g.rotateZ(Math.PI / 2); // along X
    return g;
  }, [span]);
  const finialGeo = useDisposable(() => new THREE.SphereGeometry(ROD_RADIUS * 1.8, 10, 8), []);
  const bracketGeo = useDisposable(() => new THREE.BoxGeometry(0.018, 0.018, PANEL_Z), []);
  const rodMat = useDisposable(() => new THREE.MeshStandardMaterial({ color: '#f3f3f0', roughness: 0.5, metalness: 0.15 }), []);

  const bracketX = width / 2 + 0.1;
  const finialX = span / 2 + ROD_RADIUS;

  return (
    <group>
      {/* hardware */}
      <mesh geometry={rodGeo} material={rodMat} position={[0, rodY, PANEL_Z]} />
      <mesh geometry={finialGeo} material={rodMat} position={[-finialX, rodY, PANEL_Z]} />
      <mesh geometry={finialGeo} material={rodMat} position={[finialX, rodY, PANEL_Z]} />
      <mesh geometry={bracketGeo} material={rodMat} position={[-bracketX, rodY - 0.012, PANEL_Z / 2]} />
      <mesh geometry={bracketGeo} material={rodMat} position={[bracketX, rodY - 0.012, PANEL_Z / 2]} />
      {/* left panel — its outer (left) edge stays at -outerX */}
      <mesh geometry={panel} material={voile} position={[-outerX + panelW / 2, panelCY, PANEL_Z]} />
      {/* right panel — the same geometry mirrored so its outer (right) edge stays at +outerX */}
      <mesh geometry={panel} material={voile} position={[outerX - panelW / 2, panelCY, PANEL_Z]} scale={[-1, 1, 1]} />
    </group>
  );
}
