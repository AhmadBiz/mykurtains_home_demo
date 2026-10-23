import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { usePbr } from '../materials';
import type { PbrSet } from '../materials';
import { K, wallTileFloorY } from './keys';
import { makeSiding, makeSubwayTile } from './procedural';
import type { CanvasSet } from './procedural';

/**
 * Materials for the merged structure geometry. The geometry writes UVs in WORLD METRES, so every
 * texture is configured with an explicit repeat (1 / its real-world tile size) and tiles at true
 * scale across every piece it is applied to. PBR sets come from the shared texture pack
 * (../materials.ts, Poly Haven CC0); the lap siding of the upper storey and the bathroom wall
 * tile have no texture in the pack and are generated once on a canvas (procedural.ts).
 *
 * `useStructureMaterials()` suspends until the textures are loaded (the whole <Scene/> sits in a
 * Suspense boundary) and returns a lazy, memoised resolver from bucket key → material.
 */

export interface StructureMaterials {
  get(key: string): THREE.Material;
  dispose(): void;
}

export interface RenderFlags {
  castShadow: boolean;
  receiveShadow: boolean;
  transparent: boolean;
}

/** Shadow / transparency flags per bucket key. */
export function renderFlags(key: string): RenderFlags {
  if (key === K.glass) return { castShadow: false, receiveShadow: false, transparent: true };
  if (key.startsWith('floor:') || key === K.ceiling) return { castShadow: false, receiveShadow: true, transparent: false };
  return { castShadow: true, receiveShadow: true, transparent: false };
}

// ---------------------------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------------------------

/** The brick texture reads ~2× real size at the manifest's 2 m: tile it at 1.2 m → 21 cm bricks, 8.5 cm courses. */
const BRICK_TILE = 1.2;
/**
 * Plaster: the 512 px normal map carries the orange-peel of rolled paint only when it is tiled
 * small (0.6 m → 0.85 px/mm); the ceiling is seen from further away and gets a coarser, fainter repeat.
 */
const PLASTER_TILE = 0.6;
const CEILING_TILE = 0.8;
/**
 * Real wall paints reflect 75–80 %; the room chips in HOUSE (#efe9df and friends) are 85 %+ and
 * clip to flat white around the windows. Every paint is rendered ~10 % darker in linear light
 * (≈ 8 % in sRGB: #efe9df → #e4ddd1), a touch more on blue so the whites stay warm.
 */
const PAINT_ALBEDO = new THREE.Color(0.9, 0.89, 0.87);
const CEILING_COLOR = '#ededea';
/** The sky IBL is not occluded by the walls: interior paint / tile gets a lower envMapIntensity than the facades (0.8). */
const PAINT_ENV = 0.4;
const CEILING_ENV = 0.45;
const TILE_ENV = 0.5;

interface Sets {
  brick: PbrSet;
  foundation: PbrSet;
  plaster: PbrSet;
  plasterCeiling: PbrSet;
  hardwood: PbrSet;
  laminate: PbrSet;
  tiles: PbrSet;
  concreteFloor: PbrSet;
  carpet: PbrSet;
  tread: PbrSet;
  oak: PbrSet;
}

function paintColor(hex: string): THREE.Color {
  return new THREE.Color(hex).multiply(PAINT_ALBEDO);
}

function createResolver(t: Sets): StructureMaterials {
  const cache = new Map<string, THREE.Material>();
  let siding: CanvasSet | undefined;
  let subway: CanvasSet | undefined;
  /** Per-storey copies of the tile maps (shifted along V), disposed with the resolver. */
  const aligned: THREE.Texture[] = [];
  /** A copy of a procedural texture shifted along V so a course line lands on `y` (world metres). */
  const alignedToY = (tex: THREE.CanvasTexture, metres: number, y: number): THREE.Texture => {
    const c = tex.clone();
    c.offset.set(0, -((((y / metres) % 1) + 1) % 1));
    c.needsUpdate = true;
    aligned.push(c);
    return c;
  };
  const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ envMapIntensity: 0.8, ...p });
  const phys = (p: THREE.MeshPhysicalMaterialParameters) => new THREE.MeshPhysicalMaterial({ envMapIntensity: 0.8, ...p });

  const create = (key: string): THREE.Material => {
    if (key.startsWith('paint:')) return std({ color: paintColor(key.slice(6)), ...t.plaster.props, roughness: 0.85, envMapIntensity: PAINT_ENV });
    if (key.startsWith('floor:carpet:')) {
      const color = key.slice('floor:carpet:'.length);
      return phys({ color, ...t.carpet.props, roughness: 1, sheen: 0.35, sheenRoughness: 0.9, sheenColor: new THREE.Color(color).offsetHSL(0, 0, 0.12), envMapIntensity: 0.5 });
    }
    if (key.startsWith('walltile:')) {
      // glazed ceramic: the roughness map carries tile (0.28) vs grout (0.9), a thin clearcoat gives the glaze its sheen
      subway ??= makeSubwayTile();
      const floorY = wallTileFloorY(key);
      return phys({
        map: alignedToY(subway.map, subway.metres, floorY),
        normalMap: alignedToY(subway.normalMap, subway.metres, floorY),
        roughnessMap: alignedToY(subway.roughnessMap, subway.metres, floorY),
        normalScale: new THREE.Vector2(1, 1),
        roughness: 1,
        clearcoat: 0.4,
        clearcoatRoughness: 0.15,
        envMapIntensity: TILE_ENV,
      });
    }
    switch (key) {
      case K.brick:
        return std({ ...t.brick.props, roughness: 1 });
      case K.siding: {
        siding ??= makeSiding();
        return std({ map: siding.map, normalMap: siding.normalMap, roughnessMap: siding.roughnessMap, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 1 });
      }
      case K.concrete:
        return std({ ...t.foundation.props, color: '#b9b7b2', roughness: 1 });
      case K.trim:
        return std({ color: '#f4f2ee', roughness: 0.45 });
      case K.oak:
        return std({ ...t.oak.props, roughness: 0.75 });
      case K.tread:
        return std({ ...t.tread.props, roughness: 0.65 });
      case K.soffit:
        return std({ color: '#e9e6e0', roughness: 0.9 });
      case K.slab:
      case K.ceiling:
        return std({ color: CEILING_COLOR, ...t.plasterCeiling.props, roughness: 0.95, envMapIntensity: CEILING_ENV });
      case 'floor:hardwood':
        return std({ ...t.hardwood.props, roughness: 0.85 });
      case 'floor:laminate':
        return std({ ...t.laminate.props, roughness: 0.8 });
      case 'floor:tile':
        return phys({ ...t.tiles.props, roughness: 0.75, clearcoat: 0.35, clearcoatRoughness: 0.25 });
      case 'floor:concrete':
        return std({ ...t.concreteFloor.props, roughness: 1 });
      case 'floor:epoxy':
        return phys({ ...t.concreteFloor.props, color: '#b4b9be', roughness: 0.35, clearcoat: 0.3, clearcoatRoughness: 0.15 });
      case K.doorLeaf:
        return std({ color: '#f3f1ec', roughness: 0.45 });
      case K.doorDark:
        return std({ color: '#2f3337', roughness: 0.4 });
      case K.doorGrey:
        return std({ color: '#878c91', roughness: 0.5 });
      case K.handle:
        return std({ color: '#d7d9db', roughness: 0.3, metalness: 0.9, envMapIntensity: 1 });
      case K.garage:
        return std({ color: '#ece8df', roughness: 0.55 });
      case K.glass:
        // Front-door glazing, same recipe as the windows' Eco-tier glass (windows/materials.ts):
        // a near-black pane blended as `reflection + 0.9 × view` (One / OneMinusSrcAlpha), so the
        // Fresnel sky reflection stays at full strength and nothing whitens the view behind.
        return phys({
          color: '#0b0f12',
          transparent: true,
          opacity: 0.1,
          roughness: 0.03,
          metalness: 0,
          reflectivity: 0.5,
          blending: THREE.CustomBlending,
          blendEquation: THREE.AddEquation,
          blendSrc: THREE.OneFactor,
          blendDst: THREE.OneMinusSrcAlphaFactor,
          side: THREE.DoubleSide,
          depthWrite: false,
          envMapIntensity: 1,
        });
      default:
        return std({ color: '#ff00ff' });
    }
  };

  return {
    get(key: string): THREE.Material {
      let m = cache.get(key);
      if (!m) {
        m = create(key);
        cache.set(key, m);
      }
      return m;
    },
    dispose(): void {
      for (const m of cache.values()) m.dispose();
      cache.clear();
      for (const tex of aligned) tex.dispose();
      aligned.length = 0;
      siding?.dispose();
      subway?.dispose();
      siding = undefined;
      subway = undefined;
    },
  };
}

/** Loads (suspending) the structure's texture sets and returns the key → material resolver. */
export function useStructureMaterials(): StructureMaterials {
  const brick = usePbr('red_brick_03', { repeat: [1 / BRICK_TILE, 1 / BRICK_TILE], normalScale: 0.8 });
  const foundation = usePbr('concrete_wall_008', { size: [1, 1], normalScale: 0.6 });
  const plaster = usePbr('white_plaster_02', { repeat: [1 / PLASTER_TILE, 1 / PLASTER_TILE], normalScale: 0.9 });
  const plasterCeiling = usePbr('white_plaster_02', { repeat: [1 / CEILING_TILE, 1 / CEILING_TILE], normalScale: 0.4 });
  const hardwood = usePbr('wood_floor', { size: [1, 1] });
  const laminate = usePbr('laminate_floor_02', { size: [1, 1] });
  const tiles = usePbr('floor_tiles_06', { size: [1, 1] });
  const concreteFloor = usePbr('concrete_floor_02', { size: [1, 1] });
  const carpet = usePbr('fabric_pattern_07', { size: [1, 1] });
  const tread = usePbr('dark_wood', { size: [1, 1], rotation: Math.PI / 2 });
  // kitchen_wood is the pack's lightest oak; its grain runs along V, rotated so it follows the rails
  const oak = usePbr('kitchen_wood', { size: [1, 1], rotation: Math.PI / 2 });
  const mats = useMemo(
    () => createResolver({ brick, foundation, plaster, plasterCeiling, hardwood, laminate, tiles, concreteFloor, carpet, tread, oak }),
    [brick, foundation, plaster, plasterCeiling, hardwood, laminate, tiles, concreteFloor, carpet, tread, oak],
  );
  useEffect(() => () => mats.dispose(), [mats]);
  return mats;
}
