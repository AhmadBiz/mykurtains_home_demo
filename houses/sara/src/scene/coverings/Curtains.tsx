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
 * +X along the wall, +Y up, +Z into the room. The drape channel is at z = 0.145 (0.19 on a double
 * track) so the wave troughs clear the 6.7 cm window stool and the sheer's crests. Pure &
 * prop-driven: no store access; the panel geometry is rebuilt only when the quantised `open`
 * changes.
 */
import * as THREE from 'three';
import { useLayoutEffect, useRef } from 'react';
import type { ColorOption } from '../../data/coverings';
import { useIndoorEnvironment } from '../Lighting';
import { floorY } from './types';
import { SHEER_Z, Sheers } from './Sheers';
import {
  GLIDER,
  TRACK_H,
  WAVE_PERIOD,
  buildTrack,
  buildWavePanel,
  carrierXs,
  ceilingLocal,
  fabricKind,
  fillInstances,
  finite,
  lerp,
  makeDrapeMaterial,
  makeSlotMaterial,
  makeTrackMaterial,
  quantizeOpen,
  safeSize,
  stackBackFor,
  useDisposable,
  useFabricMaps,
} from './fabric';
import type { FabricProps } from './fabric';

/** Depth of the drape channel in front of the wall face: single track / outer channel of a double track (m). */
const DRAPE_Z_SINGLE = 0.145;
const DRAPE_Z_DOUBLE = 0.19;
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

  // ---- vertical extent: carriers under the channel → hem 1 cm above the floor ------------------
  const ceil = ceilingLocal(props);
  const hem = finite(floorY(props), -height / 2) + 0.01;
  const fabricTop = ceil - TRACK_H - GLIDER.drop;
  const panelH = Math.max(0.05, fabricTop - hem);
  const panelY = hem + panelH / 2;

  // ---- horizontal extent: outer edges fixed at the track ends, inner edges travel --------------
  const stackBack = stackBackFor(width);
  const trackLen = width + 2 * stackBack;
  const closedCovered = trackLen / 2 + OVERLAP / 2;
  const waves = Math.max(2, Math.round(closedCovered / WAVE_PERIOD));
  const covered = lerp(closedCovered, stackBack, open);
  const amplitude = lerp(AMP_CLOSED, AMP_OPEN, open);
  const leftX = -trackLen / 2 + covered / 2;
  const rightX = trackLen / 2 - covered / 2;

  // ---- geometry & materials -------------------------------------------------------------------
  const panel = useDisposable(() => buildWavePanel({ covered, height: panelH, waves, amplitude }), [covered, panelH, waves, amplitude]);
  const kind = fabricKind(color.id);
  const maps = useFabricMaps(kind);
  const env = useIndoorEnvironment();
  const fabric = useDisposable(() => makeDrapeMaterial({ hex: color.hex, kind, maps, envMap: env }), [color.hex, kind, maps, env]);

  const track = useDisposable(() => buildTrack(trackLen, double ? [SHEER_Z, DRAPE_Z_DOUBLE] : [DRAPE_Z_SINGLE]), [trackLen, double]);
  const trackMat = useDisposable(makeTrackMaterial, []);
  const slotMat = useDisposable(makeSlotMaterial, []);
  const gliderGeo = useDisposable(() => new THREE.BoxGeometry(GLIDER.w, GLIDER.h, GLIDER.d), []);
  const gliderCount = 2 * (2 * waves + 1);
  const gliders = useRef<THREE.InstancedMesh>(null);
  const gliderY = ceil - TRACK_H - GLIDER.h / 2;
  useLayoutEffect(() => {
    const im = gliders.current;
    if (!im) return;
    const xs = [...carrierXs(leftX, covered, waves), ...carrierXs(rightX, covered, waves)];
    fillInstances(
      im,
      xs.map((x) => [x, gliderY, z] as const),
    );
  }, [leftX, rightX, covered, waves, gliderY, z, gliderGeo, trackMat]);

  return (
    <group name="curtains">
      {/* sheer layer on the inner channel of the double track, always drawn closed */}
      {double && <Sheers {...props} color={WHITE_VOILE} state={{ ...state, type: 'sheers', open: 0, sheer: false }} layer />}
      <mesh geometry={track.body} material={trackMat} position={[0, ceil, 0]} />
      <mesh geometry={track.slot} material={slotMat} position={[0, ceil, 0]} />
      <instancedMesh key={gliderCount} ref={gliders} args={[gliderGeo, trackMat, gliderCount]} />
      {/* left panel — its outer edge stays at the left end of the track */}
      <mesh geometry={panel} material={fabric} position={[leftX, panelY, z]} castShadow receiveShadow />
      {/* right panel — same geometry (its leading half-wave bows forward, over the left panel's) */}
      <mesh geometry={panel} material={fabric} position={[rightX, panelY, z]} castShadow receiveShadow />
    </group>
  );
}
