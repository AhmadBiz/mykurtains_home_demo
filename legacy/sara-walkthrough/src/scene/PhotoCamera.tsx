/**
 * Photo mode camera (mode === 'photo', see useStore `photoCam` and window.__house.photo): places the
 * default camera at `position`, aims it at `target`, sets the VERTICAL fov and a 3 cm near plane,
 * and applies the still's exposure to `gl.toneMappingExposure` (read by the ACES <ToneMapping>
 * effect, see Effects.tsx). Nothing moves the camera while it is mounted (the Player and the
 * OrbitView are unmounted), so a still is perfectly repeatable. On unmount the walk-mode lens and
 * the default exposure are restored.
 *
 * The sun is static and its shadow camera does not follow the view, so the 4096² shadow map is NOT
 * re-rendered every frame here (under software GL that pass is ~40 % of a frame): it is refreshed
 * for SHADOW_REFRESH_FRAMES frames after any change of the camera or of the coverings (coverings
 * mount new meshes that cast shadows), then frozen until the next change.
 *
 * Rendering: the Canvas runs with frameloop 'never' in photo mode (App.tsx) and nothing is drawn
 * until `window.__house.renderFrame()` is called (installed here): it renders one frame
 * synchronously, so the caller can read the canvas in the same task (the drawing buffer is still
 * intact — no preserveDrawingBuffer needed) and no frame is ever wasted.
 *
 * Keep target.y === position.y for a level camera: vertical lines then stay vertical (two-point
 * perspective), the way interiors are photographed.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useStore } from '../store/useStore';
import { RENDER_EXPOSURE } from './Lighting';

const PHOTO_NEAR = 0.03;
/** The Canvas defaults (App.tsx), restored when the photo mode ends. */
const WALK_FOV = 70;
const WALK_NEAR = 0.05;
/** Frames during which the shadow map is re-rendered after a change (covers a late Suspense mount). */
const SHADOW_REFRESH_FRAMES = 2;

export function PhotoCamera() {
  const cam = useStore((s) => s.photoCam);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const advance = useThree((s) => s.advance);
  const coverings = useStore((s) => s.coverings);
  const shadowFrames = useRef(SHADOW_REFRESH_FRAMES);

  // Freeze the shadow map while in photo mode; refresh it after every change.
  useEffect(() => {
    shadowFrames.current = SHADOW_REFRESH_FRAMES;
  }, [cam, coverings]);
  useLayoutEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);
  // Manual rendering hook for scripts/photos.mjs (R3F's clock is in seconds).
  useEffect(() => {
    const house = (window as unknown as { __house?: Record<string, unknown> }).__house;
    if (!house) return;
    house.renderFrame = () => advance(performance.now() / 1000, true);
    return () => {
      delete house.renderFrame;
    };
  }, [advance]);
  // Runs before the render of the same frame (priority < 1 keeps R3F's own render loop).
  useFrame(() => {
    if (shadowFrames.current > 0) {
      shadowFrames.current -= 1;
      gl.shadowMap.needsUpdate = true;
    }
  }, -1);

  useLayoutEffect(() => {
    if (!cam) return;
    camera.up.set(0, 1, 0);
    camera.position.set(cam.position[0], cam.position[1], cam.position[2]);
    camera.lookAt(cam.target[0], cam.target[1], cam.target[2]);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = cam.fov;
      camera.near = PHOTO_NEAR;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld(true);
    gl.toneMappingExposure = cam.exposure ?? RENDER_EXPOSURE;
    invalidate();
  }, [cam, camera, gl, invalidate]);

  useLayoutEffect(
    () => () => {
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = WALK_FOV;
        camera.near = WALK_NEAR;
        camera.updateProjectionMatrix();
      }
      gl.toneMappingExposure = RENDER_EXPOSURE;
    },
    [camera, gl],
  );

  return null;
}
