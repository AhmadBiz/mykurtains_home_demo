/**
 * The handful of materials shared by every window: created once per <WindowMeshes/> mount and
 * disposed when it unmounts.
 */
import * as THREE from 'three';
import { useEffect, useMemo } from 'react';

export interface WindowMaterials {
  /** Warm white: window frames, stools, aprons and casing. */
  wood: THREE.MeshStandardMaterial;
  /** Exterior stone sill ledge. */
  stone: THREE.MeshStandardMaterial;
  /** Patio door frames and track. */
  alu: THREE.MeshStandardMaterial;
  /** Door pull handle. */
  metal: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  frosted: THREE.MeshPhysicalMaterial;
  /** Amber glow for the selected window (its emissiveIntensity is pulsed by WindowMeshes). */
  hiSelected: THREE.MeshStandardMaterial;
  /** Soft white glow for the hovered / aimed window. */
  hiHover: THREE.MeshStandardMaterial;
  /** Never rendered; the hit mesh stays raycastable. */
  hit: THREE.MeshBasicMaterial;
}

export function useWindowMaterials(): WindowMaterials {
  const mats = useMemo<WindowMaterials>(
    () => ({
      wood: new THREE.MeshStandardMaterial({ color: '#f3eee4', roughness: 0.55, metalness: 0 }),
      stone: new THREE.MeshStandardMaterial({ color: '#9b9da1', roughness: 0.85, metalness: 0 }),
      alu: new THREE.MeshStandardMaterial({ color: '#e6e7e4', roughness: 0.45, metalness: 0.35 }),
      metal: new THREE.MeshStandardMaterial({ color: '#3b3d42', roughness: 0.35, metalness: 0.75 }),
      glass: new THREE.MeshPhysicalMaterial({
        color: '#cfdde8',
        transparent: true,
        opacity: 0.22,
        roughness: 0.05,
        metalness: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      frosted: new THREE.MeshPhysicalMaterial({
        color: '#f3f5f7',
        transparent: true,
        opacity: 0.85,
        roughness: 0.6,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
      hiSelected: new THREE.MeshStandardMaterial({
        color: '#f2b544',
        emissive: '#f2b544',
        emissiveIntensity: 1,
        transparent: true,
        opacity: 0.9,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
      }),
      hiHover: new THREE.MeshStandardMaterial({
        color: '#ffffff',
        emissive: '#ffffff',
        emissiveIntensity: 0.6,
        transparent: true,
        opacity: 0.55,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
      }),
      hit: new THREE.MeshBasicMaterial({ visible: false }),
    }),
    [],
  );
  useEffect(
    () => () => {
      for (const m of Object.values(mats)) m.dispose();
    },
    [mats],
  );
  return mats;
}
