import { Suspense, useEffect } from 'react';
import * as THREE from 'three';
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
import { RENDER_EXPOSURE } from './scene/Lighting';

/**
 * `?dpr=2` (0.5–4) overrides the device-pixel-ratio range so a still can be supersampled: the canvas
 * keeps its CSS size and renders 2× the pixels (scripts/photos.mjs downsizes the frame with Lanczos).
 */
function dprOverride(): number | null {
  const v = Number(new URLSearchParams(window.location.search).get('dpr'));
  return Number.isFinite(v) && v >= 0.5 && v <= 4 ? v : null;
}
const DPR_OVERRIDE = dprOverride();

export default function App() {
  const quality = useStore((s) => s.quality);
  const isTouch = useStore((s) => s.isTouch);
  const setIsTouch = useStore((s) => s.setIsTouch);
  // Photo mode is a canvas-only still: no HUD, panels or touch controls.
  const photo = useStore((s) => s.mode === 'photo');

  useEffect(() => {
    const touch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    setIsTouch(touch);
  }, [setIsTouch]);

  const high = quality === 'high';
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      {/* `antialias` is a WebGLRenderer constructor option, so the Canvas is keyed on the quality:
          high = SMAA in the post chain (no MSAA), low = MSAA and no post. The Player keeps its pose. */}
      <Canvas
        key={quality}
        shadows={{ type: THREE.PCFShadowMap }}
        dpr={DPR_OVERRIDE ?? (high ? [1, 1.75] : [0.75, 1])}
        camera={{ fov: 70, near: 0.05, far: 400, position: [0, 1.7, 0] }}
        gl={{
          antialias: !high,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: RENDER_EXPOSURE,
          outputColorSpace: THREE.SRGBColorSpace,
        }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
      <Suspense fallback={<LoadingFallback />}>
        {!photo && (
          <>
            <Hud />
            <MiniMap />
            <CoveringPanel />
            <WindowList />
            {isTouch && <TouchControls />}
            <IntroOverlay />
          </>
        )}
      </Suspense>
    </div>
  );
}
