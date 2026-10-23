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

/**
 * Clear glazing. The geometry is front-sided (one face per side of the unit), so `side` stays
 * FrontSide: with transmission, a DoubleSide material would make three draw every pane's back
 * face into the transmission buffer again (27 extra draws + a mipmap rebuild per frame).
 */
function clearGlass(high: boolean): THREE.MeshPhysicalMaterial {
  if (high) {
    return new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      transmission: 1,
      thickness: 0, // flat pane: no refraction offset, no volume attenuation
      ior: GLASS_IOR,
      roughness: 0.06, // a touch of micro-roughness: the room lights reflect as soft spots, not pinpoints
      metalness: 0,
      specularIntensity: 1,
      envMapIntensity: 1,
      // Written as an opaque surface over the transmission sample; no depth so that transparent
      // coverings (sheers) and the highlight ring still show through from the other side.
      transparent: false,
      depthWrite: false,
      side: THREE.FrontSide,
    });
  }
  // dst × (1 − 0.12) + src: 88 % of the view, plus the pane's own (reflection-only) shading at
  // full strength — a plain alpha blend would scale the 4 % Fresnel reflection down to nothing.
  return new THREE.MeshPhysicalMaterial({
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
  });
}

/** Frosted (acid-etched) glazing: milky, lit, and on 'high' a heavily blurred transmission of the outside. */
function frostedGlass(high: boolean): THREE.MeshPhysicalMaterial {
  if (high) {
    return new THREE.MeshPhysicalMaterial({
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
    });
  }
  return new THREE.MeshPhysicalMaterial({
    color: '#e8eef0',
    transparent: true,
    opacity: 0.75,
    roughness: 0.7,
    metalness: 0,
    envMapIntensity: 0.8,
    depthWrite: false,
    side: THREE.FrontSide,
  });
}

export function useWindowMaterials(): WindowMaterials {
  const high = useStore((s) => s.quality) === 'high';
  // Fine paint texture (normal + roughness only, tinted white), 3 tiles per metre.
  const paintTex = usePbr('white_plaster_02', { repeat: [3, 3], normalScale: 0.3 });
  // Same maps, barely there, to break up the reflections on the aluminium.
  const aluTex = usePbr('white_plaster_02', { repeat: [2, 2], normalScale: 0.12 });
  // Cast stone: one tile per 2 m (the manifest's real-world scale).
  const stoneTex = usePbr('concrete_wall_008', { size: [1, 1] });

  const mats = useMemo<WindowMaterials>(
    () => ({
      paint: new THREE.MeshPhysicalMaterial({
        color: PAINT,
        normalMap: paintTex.normalMap,
        normalScale: paintTex.normalScale,
        roughnessMap: paintTex.roughnessMap,
        roughness: 0.45, // × the map's mean 0.91 ≈ 0.4
        metalness: 0,
        clearcoat: 0.2,
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
      for (const m of Object.values(mats)) m.dispose();
    },
    [mats],
  );
  return mats;
}
