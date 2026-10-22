import * as THREE from 'three';

/**
 * Material palette for the furniture. Every prop is built from primitives tagged with one of
 * these keys; all primitives of a level sharing a key are merged into one mesh → one draw call
 * per key per storey (≈ 30 keys × 3 storeys ≪ the 600 draw-call budget).
 *
 * The scene has no environment map, so true metals (metalness ≈ 1) would render black; metals
 * are faked with light base colours and low metalness instead.
 */
export type MatKey =
  | 'oak'
  | 'walnut'
  | 'white'
  | 'charcoal'
  | 'linen'
  | 'brass'
  | 'steel'
  | 'black'
  | 'leaf'
  | 'quartz'
  | 'ceramic'
  | 'chrome'
  | 'glass'
  | 'mirror'
  | 'screen'
  | 'carBody'
  | 'tyre'
  | 'pingpong'
  | 'leather'
  | 'greyFabric'
  | 'mustard'
  | 'jar'
  | 'terracotta'
  | 'cardboard'
  | 'navy'
  | 'sage'
  | 'cream'
  | 'rust'
  | 'grey'
  | 'water';

interface MatDef {
  color: string;
  roughness?: number;
  metalness?: number;
  opacity?: number;
  /** No shadow casting (rugs, glass). */
  noCast?: boolean;
}

export const MATERIALS: Record<MatKey, MatDef> = {
  oak: { color: '#b58b57', roughness: 0.65 },
  walnut: { color: '#5a3d2b', roughness: 0.6 },
  white: { color: '#f4f1ea', roughness: 0.55 },
  charcoal: { color: '#3a3d42', roughness: 0.9 },
  linen: { color: '#e6dfd0', roughness: 0.95 },
  brass: { color: '#c9a35b', roughness: 0.4, metalness: 0.3 },
  steel: { color: '#c6cacf', roughness: 0.35, metalness: 0.25 },
  black: { color: '#222222', roughness: 0.6 },
  leaf: { color: '#4f7a45', roughness: 0.8 },
  quartz: { color: '#ececea', roughness: 0.25 },
  ceramic: { color: '#f7f7f5', roughness: 0.15, metalness: 0.05 },
  chrome: { color: '#e3e7eb', roughness: 0.2, metalness: 0.3 },
  glass: { color: '#cfe6ea', roughness: 0.05, metalness: 0, opacity: 0.22, noCast: true },
  mirror: { color: '#c0cbd6', roughness: 0.08, metalness: 0.25 },
  screen: { color: '#0b0d10', roughness: 0.25, metalness: 0.1 },
  carBody: { color: '#80868d', roughness: 0.45, metalness: 0.15 },
  tyre: { color: '#1b1b1b', roughness: 0.9 },
  pingpong: { color: '#1f5a3a', roughness: 0.8 },
  leather: { color: '#8b5a3c', roughness: 0.5 },
  greyFabric: { color: '#8c8f94', roughness: 0.95 },
  mustard: { color: '#c9a13b', roughness: 0.95 },
  jar: { color: '#c98a3c', roughness: 0.2, opacity: 0.85 },
  terracotta: { color: '#9c5f3f', roughness: 0.8 },
  cardboard: { color: '#b89a6a', roughness: 0.9 },
  navy: { color: '#2f3a5a', roughness: 0.9 },
  sage: { color: '#8fa58a', roughness: 0.95 },
  cream: { color: '#dcd3c0', roughness: 0.95 },
  rust: { color: '#a8705a', roughness: 0.95 },
  grey: { color: '#9a9ea3', roughness: 0.5, metalness: 0.1 },
  water: { color: '#9fc9d6', roughness: 0.05, metalness: 0, opacity: 0.55, noCast: true },
};

const cache = new Map<MatKey, THREE.MeshStandardMaterial>();

/** Shared material instance for a key (created once per app lifetime). */
export function furnitureMaterial(key: MatKey): THREE.MeshStandardMaterial {
  let m = cache.get(key);
  if (!m) {
    const d = MATERIALS[key];
    const transparent = d.opacity !== undefined && d.opacity < 1;
    m = new THREE.MeshStandardMaterial({
      color: d.color,
      roughness: d.roughness ?? 0.7,
      metalness: d.metalness ?? 0,
      transparent,
      opacity: d.opacity ?? 1,
      depthWrite: !transparent,
      side: transparent ? THREE.DoubleSide : THREE.FrontSide,
    });
    cache.set(key, m);
  }
  return m;
}

export function castsShadow(key: MatKey): boolean {
  return !MATERIALS[key].noCast;
}

export function isTransparent(key: MatKey): boolean {
  const o = MATERIALS[key].opacity;
  return o !== undefined && o < 1;
}
