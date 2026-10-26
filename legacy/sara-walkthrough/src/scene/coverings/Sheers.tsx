/**
 * SHEERS (voilages) — the client's installation standard (ARCHITECTURE.md "Installation
 * standard"): a slim white aluminium track flush under the ceiling and two ripple-fold voile
 * panels hanging from carriers by snap tape — a continuous, uniform S-wave from the top edge to
 * the hem, floor length, meeting at the centre when drawn (open = 0) and compressing into a
 * neat stack at each end of the track as `open` → 1 (constant wave count, tighter waves).
 *
 * Also rendered by <Curtains/> as the sheer layer of a double track (`layer`): then the voile is
 * always drawn closed on the inner channel and the track itself is drawn by the curtains.
 *
 * The voile is a veil, not a lit sheet: opacity 0.3–0.45 from the colour's translucency, a dim
 * albedo and a faint indoor envMap (fabric.ts makeVoileMaterial) keep it a little darker than
 * the view behind it, and the linen weave at its true 0.5 m tiling (slightly turned) gives it a
 * moiré instead of a flat milky plane.
 *
 * Local frame (see ./types.ts): origin = centre of the opening on the interior wall face,
 * +X along the wall, +Y up, +Z into the room. The inner channel is at z = SHEER_Z, so the wave
 * troughs (z ≥ 0.0698 with the ±4 % breathing) clear the 6.7 cm window stool and its horns. The
 * track stops short of a wall or fixture beside the opening (`sideRoom`) and the hem stops above a
 * counter / tub / stair under the window (`hemAbove`). Pure & prop-driven: no store access; the
 * panel geometry is rebuilt only when the quantised `open` changes.
 */
import * as THREE from 'three';
import { useLayoutEffect, useRef } from 'react';
import { useIndoorEnvironment } from '../Lighting';
import {
  GLIDER,
  TRACK_H,
  buildTrack,
  buildWavePanel,
  carrierXs,
  ceilingLocal,
  clamp,
  fillInstances,
  finite,
  hemLocal,
  lerp,
  makeTrackMaterial,
  makeSlotMaterial,
  makeVoileMaterial,
  quantizeOpen,
  safeSize,
  stackBackFor,
  trackLayout,
  useDisposable,
  useFabricMaps,
} from './fabric';
import type { FabricProps } from './fabric';

/** Depth of the sheer channel in front of the wall face (m). */
export const SHEER_Z = 0.102;
/** Wave depth (±, m): 6 cm peak-to-peak drawn, a little deeper in the stack (troughs still clear the stool horns). */
const AMP_CLOSED = 0.03;
const AMP_OPEN = 0.031;
/** The two panels overlap this much at the centre when drawn. */
const OVERLAP = 0.02;
/** Opacity range of the voile (1 − translucency, so the catalogue's 0.6 → 0.4). */
const OPACITY_MIN = 0.3;
const OPACITY_MAX = 0.45;

export interface SheersProps extends FabricProps {
  /** Rendered by <Curtains/> on the inner channel of its double track: no track of its own. */
  layer?: boolean;
}

export function Sheers(props: SheersProps) {
  const { state, color, layer } = props;
  const width = safeSize(props.width);
  const height = safeSize(props.height);
  const open = quantizeOpen(state.open, 24);

  // ---- vertical extent: carriers under the channel → hem 1 cm above the floor (or what stands on it)
  const ceil = ceilingLocal(props);
  const hem = finite(hemLocal(props), -height / 2);
  const fabricTop = ceil - TRACK_H - GLIDER.drop;
  const panelH = Math.max(0.05, fabricTop - hem);
  const panelY = hem + panelH / 2;

  // ---- horizontal extent: outer edges fixed at the track ends, inner edges travel --------------
  const stackBack = stackBackFor(width);
  const { endL, endR, trackLen, trackCx, closedL, closedR, wavesL, wavesR } = trackLayout(props, width, stackBack, OVERLAP);
  const coveredL = lerp(closedL, stackBack, open);
  const coveredR = lerp(closedR, stackBack, open);
  const amplitude = lerp(AMP_CLOSED, AMP_OPEN, open);
  const leftX = -endL + coveredL / 2;
  const rightX = endR - coveredR / 2;
  const sameShape = Math.abs(coveredL - coveredR) < 1e-6 && wavesL === wavesR;

  // ---- geometry & materials -------------------------------------------------------------------
  const panelL = useDisposable(
    () => buildWavePanel({ covered: coveredL, height: panelH, waves: wavesL, amplitude, segY: 10 }),
    [coveredL, panelH, wavesL, amplitude],
  );
  // the right panel has its own shape only where a wall beside the opening shortens its track end
  const ownR = useDisposable(
    () => (sameShape ? null : buildWavePanel({ covered: coveredR, height: panelH, waves: wavesR, amplitude, segY: 10 })),
    [sameShape, coveredR, panelH, wavesR, amplitude],
  );
  const panelR = ownR ?? panelL;
  const maps = useFabricMaps('linen', 0.6);
  const env = useIndoorEnvironment();
  const opacity = clamp(1 - finite(color.translucency ?? 0.6, 0.6), OPACITY_MIN, OPACITY_MAX);
  const voile = useDisposable(() => makeVoileMaterial(color.hex, opacity, maps, env), [color.hex, opacity, maps, env]);

  const track = useDisposable(() => (layer ? null : buildTrack(trackLen, [SHEER_Z])), [layer, trackLen]);
  const trackMat = useDisposable(makeTrackMaterial, []);
  const slotMat = useDisposable(makeSlotMaterial, []);
  const gliderGeo = useDisposable(() => new THREE.BoxGeometry(GLIDER.w, GLIDER.h, GLIDER.d), []);
  const gliderCount = 2 * wavesL + 1 + 2 * wavesR + 1;
  const gliders = useRef<THREE.InstancedMesh>(null);
  const gliderY = ceil - TRACK_H - GLIDER.h / 2;
  useLayoutEffect(() => {
    const im = gliders.current;
    if (!im) return;
    const xs = [...carrierXs(leftX, coveredL, wavesL), ...carrierXs(rightX, coveredR, wavesR)];
    fillInstances(
      im,
      xs.map((x) => [x, gliderY, SHEER_Z] as const),
    );
  }, [leftX, rightX, coveredL, coveredR, wavesL, wavesR, gliderY, gliderGeo, trackMat]);

  return (
    <group name="sheers">
      {track && <mesh geometry={track.body} material={trackMat} position={[trackCx, ceil, 0]} />}
      {track && <mesh geometry={track.slot} material={slotMat} position={[trackCx, ceil, 0]} />}
      <instancedMesh key={gliderCount} ref={gliders} args={[gliderGeo, trackMat, gliderCount]} />
      {/* left panel — its outer edge stays at the left end of the track */}
      <mesh geometry={panelL} material={voile} position={[leftX, panelY, SHEER_Z]} receiveShadow />
      {/* right panel — same wave orientation (its leading half-wave bows forward, over the left panel's) */}
      <mesh geometry={panelR} material={voile} position={[rightX, panelY, SHEER_Z]} receiveShadow />
    </group>
  );
}
