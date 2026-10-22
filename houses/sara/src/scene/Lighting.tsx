import { useStore } from '../store/useStore';

/** Sun + sky + soft fill. Shadows only in high quality. */
export function Lighting() {
  const quality = useStore((s) => s.quality);
  return (
    <>
      <hemisphereLight args={['#dfe9ff', '#b8b2aa', 0.55]} />
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[18, 30, -14]}
        intensity={2.2}
        color="#fff4e0"
        castShadow={quality === 'high'}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-camera-near={1}
        shadow-camera-far={90}
      />
    </>
  );
}
