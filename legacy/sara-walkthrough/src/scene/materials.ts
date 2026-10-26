/**
 * Shared PBR texture helpers. Textures live in public/textures/<id>/{diff,nor,rough}.jpg (CC0, Poly Haven —
 * see public/textures/CREDITS.md) and are described by src/data/textures.json (size, real-world metres per tile).
 *
 * Usage inside a component rendered under <Suspense>:
 *   const floor = usePbr('wood_floor', { size: [roomW, roomD] });
 *   <meshStandardMaterial {...floor.props} />
 * or
 *   const mat = usePbrMaterial('red_brick_03', { size: [wallLen, wallH], color: '#ffffff' });
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { useTexture } from '@react-three/drei';
import manifest from '../data/textures.json';

export type TexId = keyof typeof manifest;
type Maps = { diff?: string; nor?: string; rough?: string };

/** Public asset base: '/' when served standalone, '/houses/<id>/' when built into the multi-house site. */
export const ASSET_BASE: string = import.meta.env.BASE_URL;
export const assetUrl = (rel: string) => ASSET_BASE + rel.replace(/^\//, '');
export const HDRI_URL = assetUrl('hdri/sky_1k.hdr');

export interface PbrOptions {
  /** Surface size in metres [u, v] — repeat is derived from the texture's real-world tile size. */
  size?: [number, number];
  /** Explicit repeat override [u, v]. */
  repeat?: [number, number];
  /** Rotation of the texture in radians (e.g. Math.PI / 2 to run planks the other way). */
  rotation?: number;
  /** Offset to de-synchronise identical surfaces. */
  offset?: [number, number];
  anisotropy?: number;
  /** Normal map strength multiplier. */
  normalScale?: number;
}

export interface PbrSet {
  map?: THREE.Texture;
  normalMap?: THREE.Texture;
  roughnessMap?: THREE.Texture;
  normalScale: THREE.Vector2;
  /** Spread straight onto <meshStandardMaterial {...props}> / <meshPhysicalMaterial {...props}>. */
  props: { map?: THREE.Texture; normalMap?: THREE.Texture; roughnessMap?: THREE.Texture; normalScale: THREE.Vector2 };
  metres: number;
}

function configure(tex: THREE.Texture, color: boolean, repeat: [number, number], o: PbrOptions): THREE.Texture {
  const t = tex.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.rotation = o.rotation ?? 0;
  t.center.set(0.5, 0.5);
  if (o.offset) t.offset.set(o.offset[0], o.offset[1]);
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = o.anisotropy ?? 8;
  t.needsUpdate = true;
  return t;
}

/** Load (suspending) and configure a texture set. Textures are cached by URL and cloned per call. */
export function usePbr(id: TexId, o: PbrOptions = {}): PbrSet {
  const entry = manifest[id] as { size: number; metres: number; maps: Maps };
  const maps = entry.maps;
  const urls = useMemo(() => [maps.diff, maps.nor, maps.rough].map((m) => (m ? assetUrl(m) : assetUrl('textures/_blank.png'))), [maps.diff, maps.nor, maps.rough]);
  const [diff, nor, rough] = useTexture(urls) as THREE.Texture[];
  return useMemo(() => {
    const repeat: [number, number] = o.repeat ?? (o.size ? [o.size[0] / entry.metres, o.size[1] / entry.metres] : [1, 1]);
    const set: PbrSet = {
      map: maps.diff ? configure(diff, true, repeat, o) : undefined,
      normalMap: maps.nor ? configure(nor, false, repeat, o) : undefined,
      roughnessMap: maps.rough ? configure(rough, false, repeat, o) : undefined,
      normalScale: new THREE.Vector2(o.normalScale ?? 1, o.normalScale ?? 1),
      props: { normalScale: new THREE.Vector2(o.normalScale ?? 1, o.normalScale ?? 1) },
      metres: entry.metres,
    };
    // Only the maps that exist: three warns ("parameter 'map' has value of undefined") when a
    // material constructor receives an explicit undefined.
    set.props = { normalScale: set.normalScale };
    if (set.map) set.props.map = set.map;
    if (set.normalMap) set.props.normalMap = set.normalMap;
    if (set.roughnessMap) set.props.roughnessMap = set.roughnessMap;
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diff, nor, rough, o.size?.[0], o.size?.[1], o.repeat?.[0], o.repeat?.[1], o.rotation, o.offset?.[0], o.offset?.[1], o.anisotropy, o.normalScale]);
}

export interface MaterialOptions extends PbrOptions {
  color?: THREE.ColorRepresentation;
  roughness?: number;
  metalness?: number;
  side?: THREE.Side;
  envMapIntensity?: number;
  /** Use MeshPhysicalMaterial (sheen / clearcoat available). */
  physical?: boolean;
  sheen?: number;
  sheenColor?: THREE.ColorRepresentation;
  sheenRoughness?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  transparent?: boolean;
  opacity?: number;
}

/** A ready-to-use material instance (memoised). Prefer this for meshes created in loops / instancing. */
export function usePbrMaterial(id: TexId, o: MaterialOptions = {}): THREE.MeshStandardMaterial {
  const set = usePbr(id, o);
  return useMemo(() => {
    const base = {
      color: new THREE.Color(o.color ?? '#ffffff'),
      roughness: o.roughness ?? 1,
      metalness: o.metalness ?? 0,
      side: o.side ?? THREE.FrontSide,
      envMapIntensity: o.envMapIntensity ?? 1,
      transparent: o.transparent ?? false,
      opacity: o.opacity ?? 1,
      ...set.props,
    };
    if (o.physical) {
      const m = new THREE.MeshPhysicalMaterial(base);
      if (o.sheen !== undefined) m.sheen = o.sheen;
      if (o.sheenColor !== undefined) m.sheenColor = new THREE.Color(o.sheenColor);
      if (o.sheenRoughness !== undefined) m.sheenRoughness = o.sheenRoughness;
      if (o.clearcoat !== undefined) m.clearcoat = o.clearcoat;
      if (o.clearcoatRoughness !== undefined) m.clearcoatRoughness = o.clearcoatRoughness;
      return m;
    }
    return new THREE.MeshStandardMaterial(base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set, o.color, o.roughness, o.metalness, o.side, o.envMapIntensity, o.physical, o.sheen, o.sheenColor, o.sheenRoughness, o.clearcoat, o.clearcoatRoughness, o.transparent, o.opacity]);
}

/** Preload every texture set listed in the manifest (call once at startup to avoid pop-in). */
export function preloadAllTextures() {
  const urls: string[] = [];
  for (const entry of Object.values(manifest) as { maps: Maps }[]) {
    for (const m of Object.values(entry.maps)) if (m) urls.push(assetUrl(m));
  }
  useTexture.preload(urls);
}

/** Ids available, for quick reference / validation. */
export const TEXTURE_IDS = Object.keys(manifest) as TexId[];
