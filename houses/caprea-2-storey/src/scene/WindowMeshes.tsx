/**
 * One <WindowMesh/> per coverable opening (WINDOWS): frame, glass, exterior ledge, interior trim,
 * the mounted <Covering/>, an invisible hit box for picking and the hover / selection highlight.
 * In orbit (dollhouse) mode the windows of the storeys that <House/> hides are not mounted either,
 * so they neither float in mid-air nor catch raycasts.
 */
import { useFrame } from '@react-three/fiber';
import { useStore } from '../store/useStore';
import { LEVEL_ORDER, WINDOWS } from '../data/geometry';
import { useWindowMaterials } from './windows/materials';
import { WindowMesh } from './windows/WindowMesh';

export function WindowMeshes() {
  const mats = useWindowMaterials();
  const mode = useStore((s) => s.mode);
  const orbitLevel = useStore((s) => s.orbitLevel);
  const maxLevel = mode === 'orbit' ? LEVEL_ORDER.indexOf(orbitLevel) : LEVEL_ORDER.length - 1;

  // Gentle pulse of the selected window's amber outline (one shared material, one callback).
  useFrame(({ clock }) => {
    mats.hiSelected.emissiveIntensity = 0.9 + 0.35 * Math.sin(clock.elapsedTime * 4);
  });

  return (
    <group name="windows">
      {WINDOWS.filter((w) => LEVEL_ORDER.indexOf(w.level) <= maxLevel).map((w) => (
        <WindowMesh key={w.id} win={w} mats={mats} />
      ))}
    </group>
  );
}
