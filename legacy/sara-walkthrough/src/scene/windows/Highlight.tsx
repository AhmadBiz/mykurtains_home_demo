import * as THREE from 'three';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { playerState, useStore } from '../../store/useStore';
import type { WindowMaterials } from './materials';

/** Drawn after the glass (-1) and the coverings group (1). */
const HIGHLIGHT_RENDER_ORDER = 2;

interface Props {
  id: string;
  geometry: THREE.BufferGeometry;
  /** Local z of the outline (just in front of the casing). */
  z: number;
  mats: WindowMaterials;
}

/**
 * Glowing outline on the interior face: amber when the window is selected, soft white when it is
 * hovered with the mouse or aimed at by the walk-mode crosshair. The aimed id is written by the
 * Player outside React every frame, so it is polled in useFrame and only the mesh's `visible`
 * flag is toggled — no re-render.
 */
export function Highlight({ id, geometry, z, mats }: Props) {
  const ref = useRef<THREE.Mesh>(null);
  const selected = useStore((s) => s.selectedWindowId === id);
  const hovered = useStore((s) => s.hoveredWindowId === id);
  // UI-only: never drawn in the photo mode (stills).
  const photo = useStore((s) => s.mode === 'photo');
  useFrame(() => {
    const m = ref.current;
    if (m) m.visible = !photo && (selected || hovered || playerState.aimedWindowId === id);
  });
  return (
    <mesh
      ref={ref}
      geometry={geometry}
      material={selected ? mats.hiSelected : mats.hiHover}
      position={[0, 0, z]}
      visible={!photo && (selected || hovered)}
      renderOrder={HIGHLIGHT_RENDER_ORDER}
    />
  );
}
