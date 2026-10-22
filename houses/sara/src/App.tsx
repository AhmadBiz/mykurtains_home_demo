import { Suspense, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { useStore } from './store/useStore';
import { Scene } from './scene/Scene';
import { Hud } from './ui/Hud';
import { CoveringPanel } from './ui/CoveringPanel';
import { WindowList } from './ui/WindowList';
import { MiniMap } from './ui/MiniMap';
import { IntroOverlay } from './ui/IntroOverlay';
import { TouchControls } from './ui/TouchControls';
import { LoadingFallback } from './ui/LoadingFallback';

export default function App() {
  const quality = useStore((s) => s.quality);
  const isTouch = useStore((s) => s.isTouch);
  const setIsTouch = useStore((s) => s.setIsTouch);

  useEffect(() => {
    const touch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    setIsTouch(touch);
  }, [setIsTouch]);

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Canvas
        shadows={quality === 'high'}
        dpr={quality === 'high' ? [1, 2] : [0.75, 1]}
        camera={{ fov: 70, near: 0.05, far: 400, position: [0, 1.7, 0] }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
      <Suspense fallback={<LoadingFallback />}>
        <Hud />
        <MiniMap />
        <CoveringPanel />
        <WindowList />
        {isTouch && <TouchControls />}
        <IntroOverlay />
      </Suspense>
    </div>
  );
}
