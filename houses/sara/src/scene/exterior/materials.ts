/**
 * Exterior materials, all in METRE space: the geometry carries UVs in metres (see geom.ts) and
 * each material's texture repeat is 1 / real-world tile size, so one material serves every
 * surface it is applied to regardless of size (fence planks, deck boards, posts, treads…).
 * Everything suspends through the shared texture pack helper (../materials.ts).
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { usePbr, usePbrMaterial } from '../materials';
import type { MaterialOptions, TexId } from '../materials';
import { COLORS } from './data';
import { farTreeTexture, leafCardTexture, leafSpeckleTexture } from './textures';

/** weathered_brown_planks shows 13 boards per tile → 14 cm boards at 1.82 m per tile. */
export const PLANK_TILE = 1.82;
/** roof_slates_03 cropped of its ridge-flashing strip (see useSlateTextures): 1024 × 954 px. */
export const SLATE_CROP = { x: 0, y: 68, w: 1024, h: 954 };
/** Slate tile in metres [along the course, up the slope]: 27 courses of 13.8 cm, ~17 cm slates. */
export const SLATE_TILE: [number, number] = [4.0, (4.0 * SLATE_CROP.h) / SLATE_CROP.w];

type MetreOptions = Omit<MaterialOptions, 'size' | 'repeat'>;

/** Material whose texture tiles every `tile` metres of the (metre-space) UVs. */
export function useMetreMaterial(id: TexId, tile: number | [number, number], o: MetreOptions = {}): THREE.MeshStandardMaterial {
  const tu = typeof tile === 'number' ? tile : tile[0];
  const tv = typeof tile === 'number' ? tile : tile[1];
  return usePbrMaterial(id, { ...o, repeat: [1 / tu, 1 / tv] });
}

export function usePlanks(o: MetreOptions = {}): THREE.MeshStandardMaterial {
  return useMetreMaterial('weathered_brown_planks', PLANK_TILE, { roughness: 0.85, envMapIntensity: 0.7, normalScale: 0.9, ...o });
}

/** Flagstone paving (walkway, porch, patio, treads). */
export function usePavement(o: MetreOptions = {}): THREE.MeshStandardMaterial {
  return useMetreMaterial('pavement_02', 2.0, { roughness: 0.9, envMapIntensity: 0.6, ...o });
}

/** Light poured concrete (curbs, step risers, foundations of the porch). */
export function useConcrete(color: THREE.ColorRepresentation = COLORS.concrete, o: MetreOptions = {}): THREE.MeshStandardMaterial {
  return useMetreMaterial('concrete_floor_02', 2.0, { color, roughness: 0.92, envMapIntensity: 0.6, normalScale: 0.6, ...o });
}

/** Bark mulch of the planting beds: the concrete grain tiled at 35 cm with a strong normal reads as chips. */
export function useMulch(): THREE.MeshStandardMaterial {
  return useMetreMaterial('concrete_floor_02', 0.35, { color: COLORS.mulch, roughness: 1, envMapIntensity: 0.35, normalScale: 1.6 });
}

/** Formed (board-marked) concrete for step risers and landing bodies. */
export function useFormedConcrete(color: THREE.ColorRepresentation = COLORS.concrete): THREE.MeshStandardMaterial {
  return useMetreMaterial('concrete_wall_008', 1.2, { color, roughness: 0.9, envMapIntensity: 0.6, normalScale: 1.0 });
}

/** Segmental / parged block (porch body, driveway retaining wall): 0.6 m repeat so the courses read. */
export function useBlockWall(): THREE.MeshStandardMaterial {
  return useMetreMaterial('concrete_wall_008', 0.6, { color: COLORS.block, roughness: 0.92, envMapIntensity: 0.6, normalScale: 1.0 });
}

export function useAsphalt(o: MetreOptions = {}): THREE.MeshStandardMaterial {
  return useMetreMaterial('asphalt_02', 3.0, { roughness: 0.95, envMapIntensity: 0.5, ...o });
}

export function useBark(): THREE.MeshStandardMaterial {
  return useMetreMaterial('bark_brown_02', 1.0, { roughness: 0.95, envMapIntensity: 0.4 });
}

export function useRock(): THREE.MeshStandardMaterial {
  return useMetreMaterial('concrete_wall_008', 1.2, { color: COLORS.rock, roughness: 0.9, envMapIntensity: 0.5, normalScale: 1.3 });
}

function usePlain(make: () => THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  const m = useMemo(make, [make]);
  useEffect(() => () => m.dispose(), [m]);
  return m;
}

const makeTrim = () => new THREE.MeshStandardMaterial({ color: COLORS.trim, roughness: 0.5, metalness: 0.05, envMapIntensity: 0.8 });
const makeBlack = () => new THREE.MeshStandardMaterial({ color: '#1b1b1e', roughness: 0.4, metalness: 0.7, envMapIntensity: 1 });

/** Painted / aluminium white trim: fascia, soffit frames, columns, gutters. */
export function useWhiteTrim(): THREE.MeshStandardMaterial {
  return usePlain(makeTrim);
}

/** Black powder-coated aluminium (balusters, mailbox). */
export function useBlackMetal(): THREE.MeshStandardMaterial {
  return usePlain(makeBlack);
}

/** Light-grey ballasted membrane on the flat porch / balcony roofs (gravel over the roofing). */
export function useMembrane(): THREE.MeshStandardMaterial {
  return useMetreMaterial('concrete_floor_02', 0.5, { color: COLORS.membrane, roughness: 0.95, envMapIntensity: 0.5, normalScale: 0.9 });
}

/**
 * The leaf speckle / card maps are drawn light (average ≈ 0.5 linear) so one map serves every
 * species: the vertex colours carry the albedo × this gain, i.e. the species tones in data.ts
 * are what the lit canopy averages to.
 */
export const LEAF_MAP_GAIN = 2.0;

/**
 * Solid foliage (canopy cores, conifer cones, hedge bodies): a 12 cm leaf-speckle albedo tinted
 * by the per-plant vertex colour, the woven normal map tiled at 8 cm for leaf-sized relief, and
 * a strong environment term so the shaded / backlit sides pick up sky instead of going black
 * under the high-contrast sun.
 */
export function useLeaf(): THREE.MeshStandardMaterial {
  const set = usePbr('fabric_pattern_07', { repeat: [1 / 0.08, 1 / 0.08], normalScale: 0.7 });
  const speckle = useMemo(() => leafSpeckleTexture(), []);
  const m = useMemo(
    () =>
      // emissiveMap × 0.12: the same translucency term as the leaf cards, weaker on the solid crown.
      new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, map: speckle.map, normalMap: set.normalMap, roughnessMap: set.roughnessMap, normalScale: set.normalScale, roughness: 0.9, envMapIntensity: 1.8, emissive: '#ffffff', emissiveMap: speckle.map, emissiveIntensity: 0.12 }),
    [set, speckle],
  );
  useEffect(
    () => () => {
      m.dispose();
      speckle.map.dispose();
    },
    [m, speckle],
  );
  return m;
}

/**
 * Alpha-tested leaf-cluster / needle-frond cards around every crown: double-sided and
 * shadow-casting, but only their FRONT faces go into the shadow map — a back-lit double-sided
 * quad otherwise shadows itself (the normal bias pushes its sample behind its own depth) and
 * every second card went black.
 */
export function useLeafCards(): THREE.MeshStandardMaterial {
  const tex = useMemo(() => leafCardTexture(), []);
  const m = useMemo(
    () =>
      // emissive = 22 % of the card's own albedo: a cheap translucency term so back-lit cards (the
      // whole rear garden faces away from the sun) read as dark green leaves instead of black blades.
      new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, map: tex, alphaTest: 0.5, side: THREE.DoubleSide, shadowSide: THREE.FrontSide, roughness: 0.9, envMapIntensity: 1.8, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.22 }),
    [tex],
  );
  useEffect(
    () => () => {
      m.dispose();
      tex.dispose();
    },
    [m, tex],
  );
  return m;
}

/** Crossed alpha billboards of the horizon tree line. */
export function useFarTrees(): THREE.MeshStandardMaterial {
  const tex = useMemo(() => farTreeTexture(), []);
  const m = useMemo(
    () => new THREE.MeshStandardMaterial({ color: COLORS.farTree, vertexColors: true, map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1, envMapIntensity: 0.6 }),
    [tex],
  );
  useEffect(
    () => () => {
      m.dispose();
      tex.dispose();
    },
    [m, tex],
  );
  return m;
}

export interface SlateTextures {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

function cropToCanvas(src: THREE.Texture, color: boolean, repeat: [number, number]): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = SLATE_CROP.w;
  canvas.height = SLATE_CROP.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  const image = src.image as CanvasImageSource;
  ctx.drawImage(image, SLATE_CROP.x, SLATE_CROP.y, SLATE_CROP.w, SLATE_CROP.h, 0, 0, SLATE_CROP.w, SLATE_CROP.h);
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/**
 * roof_slates_03 carries a lead ridge-flashing strip along the top ~7 % of the image; tiled over a
 * roof face it would repeat as a bright band every few metres. The three maps are redrawn without
 * it (27 whole courses, still seamless) into canvases of the same resolution.
 */
export function useSlateTextures(tile: [number, number] = SLATE_TILE): SlateTextures {
  const set = usePbr('roof_slates_03');
  const textures = useMemo(() => {
    if (!set.map || !set.normalMap || !set.roughnessMap) throw new Error('roof_slates_03: incomplete texture set');
    const repeat: [number, number] = [1 / tile[0], 1 / tile[1]];
    return { map: cropToCanvas(set.map, true, repeat), normalMap: cropToCanvas(set.normalMap, false, repeat), roughnessMap: cropToCanvas(set.roughnessMap, false, repeat) };
  }, [set, tile]);
  useEffect(
    () => () => {
      textures.map.dispose();
      textures.normalMap.dispose();
      textures.roughnessMap.dispose();
    },
    [textures],
  );
  return textures;
}
