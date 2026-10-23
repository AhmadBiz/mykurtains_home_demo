/**
 * The handful of materials shared by every window: created once per <WindowMeshes/> mount and
 * disposed when it unmounts. The window geometries carry UVs in local metres, so the texture
 * sets are configured as tiles-per-metre (see ./profile.ts metricUVs).
 *
 * Glass depends on the quality tier (the Canvas is keyed on it, so the materials are rebuilt):
 *  - 'high': MeshPhysicalMaterial transmission — three renders the opaque scene once more into
 *    its transmission buffer and every pane samples it, so the view through the glass keeps its
 *    full colour and contrast and the pane only adds the Fresnel reflection of the sky HDRI
 *    (ior 1.52 → 4 % at normal incidence, rising at grazing angles). One pass per frame whatever
 *    the number of windows.
 *  - 'low': no transmission pass. A near-black pane blended as `reflection + 0.88 × view`
 *    (custom One / OneMinusSrcAlpha blending): the diffuse term is ~0, so the blended fragment
 *    carries only the env reflection and the sun glint, and nothing whitens the view behind.
 * Float glass transmits ~90 %; a lit pale-blue alpha pane (the previous look) replaced a third of
 * the view with a flat wash.
 *
 * Every glazing material ignores the room's point / spot lights (ignorePunctualLights): a
 * zero-size light on a roughness-0.06 pane is a delta highlight, and the 35 room lights were
 * showing as 8–12 px white pinpoints on every pane (twice, one per face of the unit). The sun
 * (a DirectionalLight) and the sky Fresnel still reflect.
 *
 * The painted trim carries, besides the orange-peel normal / roughness set, a seamless ±2 %
 * albedo noise at one tile per 1.5 m, so a long stool or casing leg is not one flat value.
 *
 * Must run under <Suspense> (the PBR hooks suspend while the maps load).
 */
import * as THREE from 'three';
import { useEffect, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { usePbr } from '../materials';

export interface WindowMaterials {
  /** White semi-gloss paint: frames, sashes, muntins, casing, stool, apron, brick mould. */
  paint: THREE.MeshPhysicalMaterial;
  /** Exterior stone sill. */
  stone: THREE.MeshStandardMaterial;
  /** Patio door: dark aluminium-clad frames, tracks and panel frames. */
  alu: THREE.MeshStandardMaterial;
  /** Patio door stainless pulls. */
  metal: THREE.MeshStandardMaterial;
  /** Clear glazing (both faces of the unit, front-sided geometry — see geometry.ts windowGlazing). */
  glass: THREE.MeshPhysicalMaterial;
  /** Acid-etched bathroom glazing: on 'high' a rough transmission (the outside as blurred blobs of light). */
  frosted: THREE.MeshPhysicalMaterial;
  /** Amber glow for the selected window (its emissiveIntensity is pulsed by WindowMeshes). */
  hiSelected: THREE.MeshStandardMaterial;
  /** Soft white glow for the hovered / aimed window. */
  hiHover: THREE.MeshStandardMaterial;
  /** Never rendered; the hit mesh stays raycastable. */
  hit: THREE.MeshBasicMaterial;
}

/** Matches the structure module's painted trim (#f4f2ee). */
const PAINT = '#f4f2ee';

/** Soda-lime float glass. */
const GLASS_IOR = 1.52;

// ---------------------------------------------------------------------------------------------
// Punctual-light suppression (glazing)
// ---------------------------------------------------------------------------------------------

/**
 * Start of the directional-light loop in three's lights_fragment_begin chunk. In this three build
 * the point (l. 81), spot (l. 107) and sun (l. 155) loops run before it and the directional loop
 * (l. 181) after, so zeroing the accumulated direct terms right here drops the punctual lights
 * and keeps the DirectionalLight sun.
 */
const DIR_LIGHT_LOOP = '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )';
const ZERO_DIRECT = '\treflectedLight.directDiffuse = vec3( 0.0 );\n\treflectedLight.directSpecular = vec3( 0.0 );\n\n';
const LIGHTS_INCLUDE = '#include <lights_fragment_begin>';
const CACHE_KEY = 'ignorePunctualLights';

/**
 * Makes a standard / physical material ignore every point and spot light: the direct diffuse and
 * specular accumulated by their loops are discarded before the directional loop runs, so the
 * surface keeps the sun glint, the environment reflection and the indirect terms. Meant for
 * glass, screens and mirrors, whose near-zero roughness turns each zero-size room light into a
 * pinpoint. The env map, transmission and blending of the material are untouched. Returns the
 * material for chaining.
 */
export function ignorePunctualLights<M extends THREE.Material>(material: M): M {
  const chunk = THREE.ShaderChunk.lights_fragment_begin;
  const at = chunk.indexOf(DIR_LIGHT_LOOP);
  if (at < 0) return material; // another three: keep the stock shading rather than break the shader
  const patched = chunk.slice(0, at) + ZERO_DIRECT + chunk.slice(at);
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(LIGHTS_INCLUDE, () => patched);
  };
  material.customProgramCacheKey = () => CACHE_KEY;
  return material;
}

// ---------------------------------------------------------------------------------------------
// Paint albedo noise
// ---------------------------------------------------------------------------------------------

/** Orange-peel normal / roughness set of the paint, tiles per metre. */
const PAINT_TILES_PER_METRE = 3;
/** Period (metres) and amplitude (± fraction, sRGB) of the albedo noise. */
const PAINT_NOISE_METRES = 1.5;
const PAINT_NOISE_AMPLITUDE = 0.02;
const PAINT_NOISE_SIZE = 64;
/** The noise map averages 1 − amplitude (sRGB): the colour is lifted so the mean albedo stays PAINT. */
const PAINT_NOISE_GAIN = 1 / (1 - PAINT_NOISE_AMPLITUDE) ** 2.2;

/** Small deterministic PRNG (mulberry32) so the noise is the same on every mount. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Seamless low-frequency value noise (periodic lattices of 2, 4 and 8 cells, 1 : ½ : ¼), white
 * minus 0–4 % in sRGB, configured as an albedo map at one tile per PAINT_NOISE_METRES on metric
 * UVs. Exported for the other painted-trim modules that want the same finish.
 */
export function paintAlbedoNoise(): THREE.DataTexture {
  const n = PAINT_NOISE_SIZE;
  const rand = mulberry32(0x5eed);
  const octaves = [2, 4, 8].map((cells) => ({ cells, lattice: Float32Array.from({ length: cells * cells }, rand) }));
  const smooth = (f: number) => f * f * (3 - 2 * f);
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let sum = 0;
      let weight = 0;
      let w = 1;
      for (const { cells, lattice } of octaves) {
        const u = (x / n) * cells;
        const v = (y / n) * cells;
        const i0 = Math.floor(u);
        const j0 = Math.floor(v);
        const i1 = (i0 + 1) % cells;
        const j1 = (j0 + 1) % cells;
        const fu = smooth(u - i0);
        const fv = smooth(v - j0);
        const top = lattice[j0 * cells + i0] * (1 - fu) + lattice[j0 * cells + i1] * fu;
        const bottom = lattice[j1 * cells + i0] * (1 - fu) + lattice[j1 * cells + i1] * fu;
        sum += w * (top * (1 - fv) + bottom * fv);
        weight += w;
        w *= 0.5;
      }
      const t = sum / weight; // 0..1, mean ≈ ½
      const byte = Math.round(255 * (1 - 2 * PAINT_NOISE_AMPLITUDE * (1 - t)));
      const o = (y * n + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = byte;
      data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / PAINT_NOISE_METRES, 1 / PAINT_NOISE_METRES);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------------------------
// Glazing
// ---------------------------------------------------------------------------------------------

/**
 * Clear glazing. The geometry is front-sided (one face per side of the unit), so `side` stays
 * FrontSide: with transmission, a DoubleSide material would make three draw every pane's back
 * face into the transmission buffer again (27 extra draws + a mipmap rebuild per frame).
 * Roughness stays at 0.06 (higher blurs the transmission mip); the room lights are removed by
 * ignorePunctualLights instead.
 */
function clearGlass(high: boolean): THREE.MeshPhysicalMaterial {
  if (high) {
    return ignorePunctualLights(
      new THREE.MeshPhysicalMaterial({
        color: '#ffffff',
        transmission: 1,
        thickness: 0, // flat pane: no refraction offset, no volume attenuation
        ior: GLASS_IOR,
        roughness: 0.06,
        metalness: 0,
        specularIntensity: 1,
        envMapIntensity: 1,
        // Written as an opaque surface over the transmission sample; no depth so that transparent
        // coverings (sheers) and the highlight ring still show through from the other side.
        transparent: false,
        depthWrite: false,
        side: THREE.FrontSide,
      }),
    );
  }
  // dst × (1 − 0.12) + src: 88 % of the view, plus the pane's own (reflection-only) shading at
  // full strength — a plain alpha blend would scale the 4 % Fresnel reflection down to nothing.
  return ignorePunctualLights(
    new THREE.MeshPhysicalMaterial({
      color: '#0b0f12',
      transparent: true,
      opacity: 0.12,
      roughness: 0.06,
      metalness: 0,
      reflectivity: 0.5, // F0 = 0.04
      envMapIntensity: 1,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      depthWrite: false,
      side: THREE.FrontSide,
    }),
  );
}

/** Frosted (acid-etched) glazing: milky, lit by the sky and the sun, and on 'high' a heavily blurred transmission of the outside. */
function frostedGlass(high: boolean): THREE.MeshPhysicalMaterial {
  if (high) {
    return ignorePunctualLights(
      new THREE.MeshPhysicalMaterial({
        color: '#f3f6f7',
        transmission: 0.85, // 15 % stays diffuse: the etched face scatters daylight into a milky sheen
        thickness: 0,
        ior: GLASS_IOR,
        roughness: 0.6, // → transmission sampled ~5 mip levels down: shapes become blobs of light
        metalness: 0,
        specularIntensity: 0.6,
        envMapIntensity: 0.8,
        transparent: false,
        depthWrite: false,
        side: THREE.FrontSide,
      }),
    );
  }
  return ignorePunctualLights(
    new THREE.MeshPhysicalMaterial({
      color: '#e8eef0',
      transparent: true,
      opacity: 0.75,
      roughness: 0.7,
      metalness: 0,
      envMapIntensity: 0.8,
      depthWrite: false,
      side: THREE.FrontSide,
    }),
  );
}

export function useWindowMaterials(): WindowMaterials {
  const high = useStore((s) => s.quality) === 'high';
  // Orange-peel paint texture (normal + roughness only, tinted white), 3 tiles per metre.
  const paintTex = usePbr('white_plaster_02', { repeat: [PAINT_TILES_PER_METRE, PAINT_TILES_PER_METRE], normalScale: 0.8 });
  // Same maps, barely there, to break up the reflections on the aluminium.
  const aluTex = usePbr('white_plaster_02', { repeat: [2, 2], normalScale: 0.12 });
  // Cast stone: one tile per 2 m (the manifest's real-world scale).
  const stoneTex = usePbr('concrete_wall_008', { size: [1, 1] });

  const mats = useMemo<WindowMaterials>(
    () => ({
      paint: new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(PAINT).multiplyScalar(PAINT_NOISE_GAIN),
        map: paintAlbedoNoise(),
        normalMap: paintTex.normalMap,
        normalScale: paintTex.normalScale,
        roughnessMap: paintTex.roughnessMap,
        roughness: 0.5, // × the map's mean 0.91 ≈ 0.45
        metalness: 0,
        clearcoat: 0.1,
        clearcoatRoughness: 0.35,
        envMapIntensity: 0.9,
      }),
      stone: new THREE.MeshStandardMaterial({
        color: '#cfcac0',
        map: stoneTex.map,
        normalMap: stoneTex.normalMap,
        normalScale: stoneTex.normalScale,
        roughness: 0.8,
        metalness: 0,
        envMapIntensity: 0.6,
      }),
      alu: new THREE.MeshStandardMaterial({
        color: '#2b2d30',
        normalMap: aluTex.normalMap,
        normalScale: aluTex.normalScale,
        roughness: 0.5,
        metalness: 0.6,
        envMapIntensity: 1,
      }),
      metal: new THREE.MeshStandardMaterial({ color: '#d8dadc', roughness: 0.25, metalness: 1, envMapIntensity: 1.2 }),
      glass: clearGlass(high),
      frosted: frostedGlass(high),
      hiSelected: new THREE.MeshStandardMaterial({
        color: '#f2b544',
        emissive: '#f2b544',
        emissiveIntensity: 1,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        toneMapped: false,
      }),
      hiHover: new THREE.MeshStandardMaterial({
        color: '#ffffff',
        emissive: '#ffffff',
        emissiveIntensity: 0.7,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        toneMapped: false,
      }),
      hit: new THREE.MeshBasicMaterial({ visible: false }),
    }),
    [paintTex, aluTex, stoneTex, high],
  );
  useEffect(
    () => () => {
      mats.paint.map?.dispose(); // the procedural noise is owned here (the PBR sets are cached by usePbr)
      for (const m of Object.values(mats)) m.dispose();
    },
    [mats],
  );
  return mats;
}
