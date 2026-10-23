/**
 * Sun + sky. The HDRI (public/hdri/sky_1k.hdr, partly-cloudy pure sky) lights and reflects the
 * world through the scene environment; a shadow-casting DirectionalLight plays its sun.
 *
 * The sun disc inside the HDRI is ~3000x brighter than the sky. Fed straight into the IBL it would
 * add several lux of UN-shadowed light everywhere (interiors included) and flatten the mapped
 * shadows, so `useSkyEnvironment` clamps the sun out of the copies used for lighting and for the
 * background and the DirectionalLight carries it instead. The lighting copy also gets a lawn-coloured
 * lower hemisphere (the file's blue-grey "ground" lit soffits and ceilings from below as brightly
 * as the sky) and a slight warm bias; the background copy is only clamped.
 *
 * The sky is turned half a turn about Y (`SKY_ROTATION_Y`, applied through scene.environmentRotation
 * and scene.backgroundRotation) so the sun, measured in the file at elevation 48° from the rear /
 * south side of the house, rakes the street elevation instead of back-lighting it. `SUN_DIR` is the
 * measured direction turned by the same angle, so the lit faces, the cast shadows and the visible
 * disc in the background agree.
 */
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useLoader, useThree } from '@react-three/fiber';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { useStore } from '../store/useStore';
import { HDRI_URL } from './materials';

const DEG = Math.PI / 180;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** Rotation of the sky about Y (radians): scene.environmentRotation.y and scene.backgroundRotation.y. */
export const SKY_ROTATION_Y = Math.PI;
/** Unit vector towards the sun as stored in the HDRI (brightest pixel: elevation 48.0°, atan2(z, x) = 34.3°). */
const HDRI_SUN_DIR = new THREE.Vector3(0.553, 0.743, 0.377).normalize();
/**
 * Unit vector from the house towards the sun in world space. three samples the rotated environment
 * at R⁻¹·d, so the stored sun shows at d = R·S: the file's direction turned by SKY_ROTATION_Y about Y
 * (→ (-0.553, 0.743, -0.377): from the street / north-west, 48° up).
 */
export const SUN_DIR = HDRI_SUN_DIR.clone().applyAxisAngle(Y_AXIS, SKY_ROTATION_Y).normalize();
/** Point the sun's shadow camera is centred on (middle of the house, at grade). */
export const SUN_TARGET = new THREE.Vector3(6, 0, 5);
const SUN_DISTANCE = 40;
export const SUN_POSITION: [number, number, number] = [
  SUN_TARGET.x + SUN_DIR.x * SUN_DISTANCE,
  SUN_TARGET.y + SUN_DIR.y * SUN_DISTANCE,
  SUN_TARGET.z + SUN_DIR.z * SUN_DISTANCE,
];

/**
 * The HDRI's own sun disc is worth ~4.5 irradiance at normal incidence; the DirectionalLight that
 * replaces it is a little stronger so that, against the clamped sky + the small bounce fill, a
 * sunlit white wall is ~4x (linear) brighter than the same wall in shade (a clear day is 5–8x).
 */
export const SUN_INTENSITY = 5.5;
export const SUN_COLOR = '#fff1dc';
export const ENV_INTENSITY = 0.9;
export const BACKGROUND_INTENSITY = 1.0;
/** Radiance ceiling applied to both HDRI copies (clouds stay, the sun disc goes). */
const HDRI_CLAMP = 6;
/**
 * Multiplier for the rows below the horizon of the LIGHTING copy: the albedo of a lawn, so that what
 * reaches a soffit, an eave or a ceiling from below is ~10–15 % of the sky and warm-green instead of
 * 40 % and blue. (The real lawn hides the HDRI ground in the background anyway.)
 */
const GROUND_TINT: [number, number, number] = [0.22, 0.24, 0.14];
/** Half-width of the blend between sky and tinted ground, either side of the horizon. */
const HORIZON_BLEND = 3 * DEG;
/** Small warm bias baked into the lighting copy only (shade was reading lavender). */
const WARM_BIAS: [number, number, number] = [1.06, 1, 0.94];
/**
 * Half-extent (m) of the orthographic shadow frustum: the house and the fenced lot. At 4096 px a
 * texel is ~1 cm, so muntins and pickets keep their own shadows.
 */
const SHADOW_EXTENT = 20;

/** Sky / ground colours of the bounce fill (cool off-white sky, warm earth) — see <Lighting/>. */
export const HEMISPHERE_SKY = '#e9eef4';
export const HEMISPHERE_GROUND = '#a08c74';
export const HEMISPHERE_INTENSITY = 0.12;

export interface SkyMaps {
  /** Sun clamped, ground hemisphere tinted, warm bias: for scene.environment. */
  lighting: THREE.DataTexture;
  /** Sun clamped only: for scene.background. */
  background: THREE.DataTexture;
}

function equirectTexture(data: Uint16Array, width: number, height: number, flipY: boolean): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.flipY = flipY;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/**
 * The sky HDRI as two equirectangular HalfFloat textures (see the header). Suspends while the file
 * loads; the result is memoised per source texture.
 */
export function useSkyEnvironment(): SkyMaps {
  const src = useLoader(HDRLoader, HDRI_URL, (loader) => (loader as HDRLoader).setDataType(THREE.FloatType));
  return useMemo(() => {
    const { width, height, data } = src.image as { width: number; height: number; data: Float32Array };
    const toHalf = THREE.DataUtils.toHalfFloat;
    const one = toHalf(1);
    const background = new Uint16Array(data.length);
    const lighting = new Uint16Array(data.length);
    for (let y = 0; y < height; y++) {
      // Row 0 is the top of the file (the zenith, flipY); v = asin(dir.y) / π + 0.5.
      const elevation = (0.5 - (y + 0.5) / height) * Math.PI;
      const sky = THREE.MathUtils.smoothstep(elevation, -HORIZON_BLEND, HORIZON_BLEND);
      const fr = WARM_BIAS[0] * (GROUND_TINT[0] + (1 - GROUND_TINT[0]) * sky);
      const fg = WARM_BIAS[1] * (GROUND_TINT[1] + (1 - GROUND_TINT[1]) * sky);
      const fb = WARM_BIAS[2] * (GROUND_TINT[2] + (1 - GROUND_TINT[2]) * sky);
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const r = Math.min(data[i], HDRI_CLAMP);
        const g = Math.min(data[i + 1], HDRI_CLAMP);
        const b = Math.min(data[i + 2], HDRI_CLAMP);
        background[i] = toHalf(r);
        background[i + 1] = toHalf(g);
        background[i + 2] = toHalf(b);
        background[i + 3] = one;
        lighting[i] = toHalf(r * fr);
        lighting[i + 1] = toHalf(g * fg);
        lighting[i + 2] = toHalf(b * fb);
        lighting[i + 3] = one;
      }
    }
    return {
      lighting: equirectTexture(lighting, width, height, src.flipY),
      background: equirectTexture(background, width, height, src.flipY),
    };
  }, [src]);
}

/**
 * Installs the sky: lighting copy as scene.environment, background copy as scene.background, both
 * turned by SKY_ROTATION_Y, with their intensities. Restores the scene on unmount.
 */
export function Sky() {
  const scene = useThree((s) => s.scene);
  const { lighting, background } = useSkyEnvironment();
  useLayoutEffect(() => {
    const prev = {
      environment: scene.environment,
      background: scene.background,
      environmentIntensity: scene.environmentIntensity,
      backgroundIntensity: scene.backgroundIntensity,
      environmentRotation: scene.environmentRotation.clone(),
      backgroundRotation: scene.backgroundRotation.clone(),
    };
    scene.environment = lighting;
    scene.background = background;
    scene.environmentIntensity = ENV_INTENSITY;
    scene.backgroundIntensity = BACKGROUND_INTENSITY;
    scene.backgroundBlurriness = 0;
    scene.environmentRotation.set(0, SKY_ROTATION_Y, 0);
    scene.backgroundRotation.set(0, SKY_ROTATION_Y, 0);
    return () => {
      scene.environment = prev.environment;
      scene.background = prev.background;
      scene.environmentIntensity = prev.environmentIntensity;
      scene.backgroundIntensity = prev.backgroundIntensity;
      scene.environmentRotation.copy(prev.environmentRotation);
      scene.backgroundRotation.copy(prev.backgroundRotation);
    };
  }, [scene, lighting, background]);
  return null;
}

// ---------------------------------------------------------------------------------------------
// Indoor reflection environment
// ---------------------------------------------------------------------------------------------

/** envMapIntensity to use with the indoor environment on a material that had the default 1. */
export const INDOOR_ENV_INTENSITY = 0.7;

const indoorCache = new WeakMap<THREE.WebGLRenderer, THREE.Texture>();

/**
 * A neutral studio-room PMREM (three's RoomEnvironment: grey walls, a few soft boxes, its light
 * panels clamped to INDOOR_PANEL_MAX) for the reflections of INTERIOR metals, glass and gloss. Seen from inside the house the sky HDRI is a
 * uniform blue-grey, which gives chrome, stainless and clearcoat nothing to reflect but one tone, so
 * they read as flat grey plastic. Built once per renderer (a few ms). Assign it as `material.envMap`
 * (with `envMapIntensity` ≈ INDOOR_ENV_INTENSITY) in the material resolvers of interior objects —
 * furniture, covering hardware, door levers, light fixtures; walls, floors, window frames, glass and
 * the exterior keep scene.environment (the sky).
 */
export function indoorEnvironment(gl: THREE.WebGLRenderer): THREE.Texture {
  let tex = indoorCache.get(gl);
  if (!tex) {
    const room = new RoomEnvironment();
    room.traverse((o) => clampPanel((o as THREE.Mesh).material));
    const pmrem = new THREE.PMREMGenerator(gl);
    tex = pmrem.fromScene(room, 0.04).texture;
    pmrem.dispose();
    room.dispose();
    indoorCache.set(gl, tex);
  }
  return tex;
}

/**
 * Radiance ceiling for the RoomEnvironment's light panels. Stock they are 17–100 (emissive
 * MeshLambert in r186, a scaled-colour MeshBasic before): 4 % Fresnel × 50 × 0.9 = 1.9 linear, so a
 * clear pane in front of a wall mirrored them as a sheet of clipped white (the shower screen washed
 * the slats behind it to 200–254 sRGB). At 8 the panels are still the brightest thing chrome and
 * steel see, and no panel can clip through glass.
 */
const INDOOR_PANEL_MAX = 8;

function clampPanel(material: THREE.Material | THREE.Material[] | undefined): void {
  if (!material || Array.isArray(material)) return;
  if (material instanceof THREE.MeshLambertMaterial) {
    material.emissiveIntensity = Math.min(material.emissiveIntensity, INDOOR_PANEL_MAX);
  } else if (material instanceof THREE.MeshBasicMaterial) {
    const c = material.color;
    c.setRGB(Math.min(c.r, INDOOR_PANEL_MAX), Math.min(c.g, INDOOR_PANEL_MAX), Math.min(c.b, INDOOR_PANEL_MAX));
  }
}

/** Hook form of `indoorEnvironment` for the current Canvas. */
export function useIndoorEnvironment(): THREE.Texture {
  const gl = useThree((s) => s.gl);
  return useMemo(() => indoorEnvironment(gl), [gl]);
}

const indoorScaled = new WeakSet<THREE.Material>();

/**
 * Switches a material's reflections from the sky to the indoor environment. Its envMapIntensity,
 * tuned against the sky, is scaled once by `scale` (default: the indoor level relative to the
 * furniture default of 0.9); call it again freely (e.g. with a new renderer).
 */
export function applyIndoorEnvironment(material: THREE.MeshStandardMaterial, env: THREE.Texture, scale = INDOOR_ENV_INTENSITY / 0.9): void {
  if (material.envMap !== env) {
    material.envMap = env;
    material.needsUpdate = true;
  }
  if (!indoorScaled.has(material)) {
    material.envMapIntensity *= scale;
    indoorScaled.add(material);
  }
}

const skyScaled = new WeakSet<THREE.Material>();

/**
 * Gives a material the sky as an EXPLICIT envMap. Needed because three (r16x+) ignores
 * `material.envMapIntensity` on any material that falls back to `scene.environment`: the renderer
 * overwrites the uniform with `scene.environmentIntensity` (WebGLRenderer.setProgram), so the
 * per-material values tuned all over src/scene (paint 0.4, lawn 0.6, foliage 1.3, glass 1 …) only
 * take effect once the texture is assigned directly. The intensity is scaled once by ENV_INTENSITY
 * so a material at 1.0 matches what scene.environment gave it, and the rotation follows the sky.
 */
export function applySkyEnvironment(material: THREE.MeshStandardMaterial, sky: THREE.Texture): void {
  if (material.envMap !== sky) {
    material.envMap = sky;
    material.envMapRotation.set(0, SKY_ROTATION_Y, 0);
    material.needsUpdate = true;
  }
  if (!skyScaled.has(material)) {
    material.envMapIntensity *= ENV_INTENSITY;
    skyScaled.add(material);
  }
}

// ---------------------------------------------------------------------------------------------
// Sun
// ---------------------------------------------------------------------------------------------

/**
 * Sun (shadow-casting) + a weak sky/ground bounce fill. The HDRI environment does the rest; there is
 * no ambient term (it was lifting every shadow and the room interiors to the same flat grey).
 */
export function Lighting() {
  const quality = useStore((s) => s.quality);
  const light = useRef<THREE.DirectionalLight>(null);
  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.copy(SUN_TARGET);
    return o;
  }, []);
  const mapSize = quality === 'high' ? 4096 : 2048;

  useLayoutEffect(() => {
    const l = light.current;
    if (!l) return;
    l.target = target;
    l.shadow.mapSize.set(mapSize, mapSize);
    // force the shadow map to be re-allocated at the new size
    l.shadow.map?.dispose();
    l.shadow.map = null;
    l.shadow.camera.updateProjectionMatrix();
  }, [target, mapSize]);

  return (
    <>
      <primitive object={target} />
      <hemisphereLight args={[HEMISPHERE_SKY, HEMISPHERE_GROUND, HEMISPHERE_INTENSITY]} />
      <directionalLight
        ref={light}
        position={SUN_POSITION}
        intensity={SUN_INTENSITY}
        color={SUN_COLOR}
        castShadow
        // ~1 cm texels: a small normal offset keeps muntin and picket shadows attached to their casters
        shadow-bias={-0.00008}
        shadow-normalBias={0.008}
        shadow-radius={2}
        shadow-camera-left={-SHADOW_EXTENT}
        shadow-camera-right={SHADOW_EXTENT}
        shadow-camera-top={SHADOW_EXTENT}
        shadow-camera-bottom={-SHADOW_EXTENT}
        shadow-camera-near={2}
        shadow-camera-far={SUN_DISTANCE + SHADOW_EXTENT + 10}
      />
    </>
  );
}
