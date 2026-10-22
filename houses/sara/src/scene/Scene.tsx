import { Sky } from '@react-three/drei';
import { useStore } from '../store/useStore';
import { Lighting } from './Lighting';
import { House } from './House';
import { Exterior } from './Exterior';
import { WindowMeshes } from './WindowMeshes';
import { Furniture } from './Furniture';
import { Player } from './Player';
import { OrbitView } from './OrbitView';

/**
 * Composition root of the 3D world. Every sub-component reads HOUSE from src/data and the
 * store from src/store; this file only wires them together.
 */
export function Scene() {
  const mode = useStore((s) => s.mode);
  return (
    <>
      <Sky distance={4000} sunPosition={[18, 30, -14]} turbidity={6} rayleigh={1.2} mieCoefficient={0.004} mieDirectionalG={0.8} />
      <fog attach="fog" args={['#dfe7f2', 60, 260]} />
      <Lighting />
      <Exterior />
      <House />
      <WindowMeshes />
      <Furniture />
      {mode === 'walk' ? <Player /> : <OrbitView />}
    </>
  );
}
