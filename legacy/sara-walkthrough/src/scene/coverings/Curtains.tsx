/**
 * CURTAINS (drapes) — the client's installation standard (ARCHITECTURE.md "Installation
 * standard"): a slim white aluminium track fixed flush under the ceiling and two ripple-fold
 * (wave-fold) panels hanging from carriers by snap tape, so the top edge is the same continuous
 * S-wave as the hem (no pleated header), floor length (hem 1 cm above the floor), meeting at the
 * centre when drawn and compressing into a neat, regular stack at each end of the track as
 * `open` → 1 (constant wave count, tighter waves). No rod, rings, finials or valance.
 * With `state.sheer` the track is a double channel: a closed white voile (<Sheers layer/>) on
 * the inner channel, the drapes on the outer one.
 *
 * Local frame (see ./types.ts): origin = centre of the opening on the interior wall face,
 * +X along the wall, +Y up, +Z into the room. The drape channel is at z = 0.145 (0.20 on a double
 * track) so the wave troughs clear the 6.7 cm window stool and, by ≥ 8 mm, the sheer's crests.
 * The track stops short of a wall or fixture beside the opening (`sideRoom`) and the hem stops
 * above a counter / tub / stair under the window (`hemAbove`). Pure &
 * prop-driven: no store access; the panel geometry is rebuilt only when the quantised `open`
 * changes.
 */
import * as THREE from 'three';
import { useLayoutEffect, useRef } from 'react';
import type { ColorOption } from '../../data/coverings';
import { useIndoorEnvironment } from '../Lighting';
import { SHEER_Z, Sheers } from './Sheers';
import {
  GLIDER,
  TRACK_H,
  buildTrack,
  buildWavePanel,
  carrierXs,
  ceilingLocal,
  fabricKind,
  fillInstances,
  finite,
  hemLocal,
  lerp,
  makeDrapeMaterial,
  makeSlotMaterial,
  makeTrackMaterial,
  quantizeOpen,
  safeSize,
  stackBackFor,
  trackLayout,
  useDisposable,
  useFabricMaps,
} from './fabric';
import type { FabricProps } from './fabric';

/** Depth of the drape channel in front of the wall face: single track / outer channel of a double track (m). */
const DRAPE_Z_SINGLE = 0.145;
const DRAPE_Z_DOUBLE = 0.2;
/**
 * Wave depth (±, m): 9 cm peak-to-peak drawn (100 % fullness ripple fold); deeper in the stack so
 * the flat fabric length (the arc of the wave) stays the same as the panel compresses.
 */
const AMP_CLOSED = 0.045;
const AMP_OPEN = 0.056;
/** The two panels overlap this much at the centre when drawn. */
const OVERLAP = 0.02;

/** Voile of the sheer layer behind drapes. */
const WHITE_VOILE: ColorOption = { id: 'white', name: 'White voile', nameFr: 'Voile blanc', hex: '#ffffff', translucency: 0.6 };

export function Curtains(props: FabricProps) {
  const { state, color } = props;
  const width = safeSize(props.width);
  const height = safeSize(props.height);
  const open = quantizeOpen(state.open, 24);
  const double = state.sheer;
  const z = double ? DRAPE_Z_DOUBLE : DRAPE_Z_SINGLE;

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
  const panelL = useDisposable(() => buildWavePanel({ covered: coveredL, height: panelH, waves: wavesL, amplitude }), [coveredL, panelH, wavesL, amplitude]);
  // the right panel has its own shape only where a wall beside the opening shortens its track end
  const ownR = useDisposable(
    () => (sameShape ? null : buildWavePanel({ covered: coveredR, height: panelH, waves: wavesR, amplitude })),
    [sameShape, coveredR, panelH, wavesR, amplitude],
  );
  const panelR = ownR ?? panelL;
  const kind = fabricKind(color.id);
  const maps = useFabricMaps(kind);
  const env = useIndoorEnvironment();
  // vertexColors: the panel's baked ±2 % cloth-shade noise, so the folds are not lit identically;
  // opaqueSheet: the sun behind the panel no longer leaks onto the room side of the fold walls
  const fabric = useDisposable(() => makeDrapeMaterial({ hex: color.hex, kind, maps, envMap: env, vertexColors: true, opaqueSheet: true }), [color.hex, kind, maps, env]);

  const track = useDisposable(() => buildTrack(trackLen, double ? [SHEER_Z, DRAPE_Z_DOUBLE] : [DRAPE_Z_SINGLE]), [trackLen, double]);
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
      xs.map((x) => [x, gliderY, z] as const),
    );
  }, [leftX, rightX, coveredL, coveredR, wavesL, wavesR, gliderY, z, gliderGeo, trackMat]);

  return (
    <group name="curtains">
      {/* sheer layer on the inner channel of the double track, always drawn closed */}
      {double && <Sheers {...props} color={WHITE_VOILE} state={{ ...state, type: 'sheers', open: 0, sheer: false }} layer />}
      <mesh geometry={track.body} material={trackMat} position={[trackCx, ceil, 0]} />
      <mesh geometry={track.slot} material={slotMat} position={[trackCx, ceil, 0]} />
      <instancedMesh key={gliderCount} ref={gliders} args={[gliderGeo, trackMat, gliderCount]} />
      {/* left panel — its outer edge stays at the left end of the track */}
      <mesh geometry={panelL} material={fabric} position={[leftX, panelY, z]} castShadow receiveShadow />
      {/* right panel — same wave orientation (its leading half-wave bows forward, over the left panel's) */}
      <mesh geometry={panelR} material={fabric} position={[rightX, panelY, z]} castShadow receiveShadow />
    </group>
  );
}
