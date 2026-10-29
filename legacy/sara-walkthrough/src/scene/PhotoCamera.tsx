/**
 * Photo mode camera (mode === 'photo', see useStore `photoCam` and window.__house.photo): places the
 * default camera at `position`, aims it at `target`, sets the VERTICAL fov and a 3 cm near plane,
 * and applies the still's exposure to `gl.toneMappingExposure` (read by the ACES <ToneMapping>
 * effect, see Effects.tsx). Nothing moves the camera while it is mounted (the Player and the
 * OrbitView are unmounted), so a still is perfectly repeatable. On unmount the walk-mode lens and
 * the default exposure are restored.
 *
 * Keep target.y === position.y for a level camera: vertical lines then stay vertical (two-point
 * perspective), the way interiors are photographed.
 */
import { useLayoutEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useStore } from '../store/useStore';
import { RENDER_EXPOSURE } from './Lighting';

const PHOTO_NEAR = 0.03;
/** The Canvas defaults (App.tsx), restored when the photo mode ends. */
const WALK_FOV = 70;
const WALK_NEAR = 0.05;

export function PhotoCamera() {
  const cam = useStore((s) => s.photoCam);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);

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
