import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useStore } from '../store/useStore';
import { preloadAllTextures } from './materials';
import { Lighting, Sky, applyIndoorEnvironment, applySkyEnvironment, useIndoorEnvironment } from './Lighting';
import { RoomLights } from './RoomLights';
import { House } from './House';
import { Exterior } from './Exterior';
import { WindowMeshes } from './WindowMeshes';
import { Furniture } from './Furniture';
import { Player } from './Player';
import { OrbitView } from './OrbitView';
import { Effects } from './Effects';

preloadAllTextures();

/**
 * Fog colour = the HDRI's horizon band (linear 0.41, 0.44, 0.54 averaged over ±1.5° of the horizon;
 * fog is mixed in before tone mapping), so the lawn's far edge dissolves into the sky.
 */
const FOG_COLOR = '#acb2c1';
/** Exponential-squared density: ~5 % at 20 m, 26 % at 50 m, 82 % at 120 m (the lawn's edge), 98 % at 180 m. */
const FOG_DENSITY = 0.011;

type GroupRef = RefObject<THREE.Group | null>;

/**
 * Assigns the reflection environments. Indoor (Lighting.tsx RoomEnvironment): every material under
 * <Furniture/>, and the metal hardware (metalness ≥ 0.5: door levers, blind slats and rails,
 * patio-door pulls) under <House/> and <WindowMeshes/>. Sky: every other MeshStandard / Physical
 * material in the scene gets scene.environment as an explicit envMap (applySkyEnvironment), because
 * three ignores a material's envMapIntensity while it relies on scene.environment — without this
 * pass every wall, lawn and crown was lit by the sky at the same 0.9. Materials are shared per
 * module, so each is switched once; coverings mount new ones on every covering change, hence the
 * `coverings` dependency.
 */
function Reflections({ all, metals }: { all: GroupRef[]; metals: GroupRef[] }) {
  const env = useIndoorEnvironment();
  const scene = useThree((s) => s.scene);
  const coverings = useStore((s) => s.coverings);
  useEffect(() => {
    const visit = (root: THREE.Object3D | null | undefined, accept: (m: THREE.MeshStandardMaterial) => boolean, apply: (m: THREE.MeshStandardMaterial) => void) =>
      root?.traverse((o) => {
        const material = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (!material) return;
        for (const m of Array.isArray(material) ? material : [material]) {
          if (m instanceof THREE.MeshStandardMaterial && accept(m)) apply(m);
        }
      });
    const indoor = (m: THREE.MeshStandardMaterial) => applyIndoorEnvironment(m, env);
    for (const r of all) visit(r.current, () => true, indoor);
    for (const r of metals) visit(r.current, (m) => m.metalness >= 0.5, indoor);
    // Sky (set by <Sky/> in a layout effect, so it is there by now) for everything still on the fallback.
    const sky = scene.environment;
    if (sky) visit(scene, (m) => m.envMap === null, (m) => applySkyEnvironment(m, sky));
  }, [env, scene, coverings, all, metals]);
  return null;
}

/**
 * Exposes the scene graph and the renderer on the debug API (window.__house.scene / .gl, see
 * src/store/useStore.ts) so scripts/screenshot.mjs can report draw calls and profile the scene.
 */
function DebugHandles() {
  // Re-assigned every frame (two property writes): the Canvas is re-created on a quality change,
  // and a one-shot effect left scripts racing against the remount.
  useFrame(({ scene, gl }) => {
    const house = (window as unknown as { __house?: Record<string, unknown> }).__house;
    if (house && (house.scene !== scene || house.gl !== gl)) Object.assign(house, { scene, gl });
  });
  return null;
}

/**
 * Composition root of the 3D world. Every sub-component reads HOUSE from src/data and the
 * store from src/store; this file only wires them together.
 */
export function Scene() {
  const mode = useStore((s) => s.mode);
  const house = useRef<THREE.Group>(null);
  const windows = useRef<THREE.Group>(null);
  const furniture = useRef<THREE.Group>(null);
  const all = useRef<GroupRef[]>([furniture]);
  const metals = useRef<GroupRef[]>([house, windows]);
  return (
    <>
      <Sky />
      <fogExp2 attach="fog" args={[FOG_COLOR, FOG_DENSITY]} />
      <Lighting />
      <RoomLights />
      <Exterior />
      <group ref={house}>
        <House />
      </group>
      <group ref={windows}>
        <WindowMeshes />
      </group>
      <group ref={furniture}>
        <Furniture />
      </group>
      {mode === 'walk' ? <Player /> : <OrbitView />}
      <Reflections all={all.current} metals={metals.current} />
      <Effects />
      <DebugHandles />
    </>
  );
}
