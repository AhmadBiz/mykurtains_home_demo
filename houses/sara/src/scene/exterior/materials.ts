/**
 * Exterior materials, all in METRE space: the geometry carries UVs in metres (see geom.ts) and
 * each material's texture repeat is 1 / real-world tile size, so one material serves every
 * surface it is applied to regardless of size (fence planks, deck boards, posts, treads…).
 * Everything suspends through the shared texture pack helper (../materials.ts).
 *
 * Outdoors the only fill is the sky environment (no ambient light), so every ground / wood /
 * concrete material runs at envMapIntensity 1.0: the values of 0.35–0.7 that used to "cut" the
 * sky turned every shadow into ink (finding 17).
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { usePbr, usePbrMaterial } from '../materials';
import type { MaterialOptions, TexId } from '../materials';
import { COLORS } from './data';
import { farTreeTexture, leafCardTexture, leafSpeckleTexture, paintTextures, splitFaceBlockTextures } from './textures';

/** weathered_brown_planks shows 13 boards per tile → 14 cm boards at 1.82 m per tile. */
export const PLANK_TILE = 1.82;
/** roof_slates_03 cropped of its ridge-flashing strip (see useSlateTextures): 1024 × 954 px. */
export const SLATE_CROP = { x: 0, y: 68, w: 1024, h: 954 };
/** Slate tile in metres [along the course, up the slope]: 27 courses of 13.8 cm, ~17 cm slates. */
export const SLATE_TILE: [number, number] = [4.0, (4.0 * SLATE_CROP.h) / SLATE_CROP.w];
/** aerial_grass_rock tiles every 4 m on the metre UVs. */
export const GRASS_TILE = 4;

type MetreOptions = Omit<MaterialOptions, 'size' | 'repeat'>;

/** Material whose texture tiles every `tile` metres of the (metre-space) UVs. */
export function useMetreMaterial(id: TexId, tile: number | [number, number], o: MetreOptions = {}): THREE.MeshStandardMaterial {
  const tu = typeof tile === 'number' ? tile : tile[0];
  const tv = typeof tile === 'number' ? tile : tile[1];
  return usePbrMaterial(id, { ...o, repeat: [1 / tu, 1 / tv] });
}

/** Weathered cedar (deck, fence, posts, stair): the lifted plank set (usePlankTextures) under the silver-brown tint. */
export function usePlanks(): THREE.MeshStandardMaterial {
  const set = usePlankTextures();
  const m = useMemo(() => new THREE.MeshStandardMaterial({ map: set.map, normalMap: set.normalMap, roughnessMap: set.roughnessMap, normalScale: new THREE.Vector2(0.9, 0.9), color: COLORS.cedar, roughness: 0.8, envMapIntensity: 1.0 }), [set]);
  useEffect(() => () => m.dispose(), [m]);
  return m;
}

/** Flagstone paving (walkway, porch, patio, treads). */
export function usePavement(o: MetreOptions = {}): THREE.MeshStandardMaterial {
  return useMetreMaterial('pavement_02', 2.0, { roughness: 0.9, envMapIntensity: 1.0, ...o });
}

/** Light poured concrete (curbs, foundations of the porch). */
export function useConcrete(color: THREE.ColorRepresentation = COLORS.concrete, o: MetreOptions = {}): THREE.MeshStandardMaterial {
  return useMetreMaterial('concrete_floor_02', 2.0, { color, roughness: 0.92, envMapIntensity: 1.0, normalScale: 0.6, ...o });
}

/** Bark mulch of the planting beds: the concrete grain tiled at 35 cm with a strong normal reads as chips. */
export function useMulch(): THREE.MeshStandardMaterial {
  return useMetreMaterial('concrete_floor_02', 0.35, { color: COLORS.mulch, roughness: 1, envMapIntensity: 1.0, normalScale: 1.6 });
}

/** Formed (board-marked) concrete for step risers, cheek walls and landing bodies, tinted neutral grey. */
export function useFormedConcrete(color: THREE.ColorRepresentation = COLORS.concrete): THREE.MeshStandardMaterial {
  return useMetreMaterial('concrete_wall_008', 1.2, { color, roughness: 0.9, envMapIntensity: 1.0, normalScale: 1.0 });
}

/**
 * Split-face concrete block (porch body, driveway retaining walls): the procedural 0.4 × 0.2 m
 * running-bond set with raked joints and a fractured-face normal (textures.ts).
 */
export function useBlockWall(): THREE.MeshStandardMaterial {
  const set = useMemo(() => splitFaceBlockTextures(), []);
  const m = useMemo(
    () => new THREE.MeshStandardMaterial({ map: set.map, normalMap: set.normalMap, roughnessMap: set.roughnessMap, normalScale: new THREE.Vector2(1, 1), color: COLORS.block, roughness: 1, envMapIntensity: 1.0 }),
    [set],
  );
  useEffect(
    () => () => {
      m.dispose();
      set.dispose();
    },
    [m, set],
  );
  return m;
}

export function useAsphalt(o: MetreOptions = {}): THREE.MeshStandardMaterial {
  return useMetreMaterial('asphalt_02', 3.0, { roughness: 0.95, envMapIntensity: 1.0, ...o });
}

export function useBark(): THREE.MeshStandardMaterial {
  return useMetreMaterial('bark_brown_02', 1.0, { roughness: 0.95, envMapIntensity: 1.0 });
}

export function useRock(): THREE.MeshStandardMaterial {
  return useMetreMaterial('concrete_wall_008', 1.2, { color: COLORS.rock, roughness: 0.9, envMapIntensity: 1.0, normalScale: 1.3 });
}

function usePlain(make: () => THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  const m = useMemo(make, [make]);
  useEffect(() => () => m.dispose(), [m]);
  return m;
}

const makeBlack = () => new THREE.MeshStandardMaterial({ color: '#1b1b1e', roughness: 0.4, metalness: 0.7, envMapIntensity: 1 });

/**
 * Painted PVC / aluminium trim: fascia, soffit frames, columns, gutters. Semi-matt paint whose
 * roughness wanders 0.45 ± 0.08 over 10 cm with a faint orange-peel normal (0.5 m tile), so it
 * no longer reads as flat plastic next to the brick.
 */
export function useWhiteTrim(): THREE.MeshStandardMaterial {
  const set = useMemo(() => paintTextures(), []);
  const m = useMemo(
    () => new THREE.MeshStandardMaterial({ color: COLORS.trim, roughness: 1, metalness: 0.05, envMapIntensity: 0.8, normalMap: set.normalMap, roughnessMap: set.roughnessMap, normalScale: new THREE.Vector2(1, 1) }),
    [set],
  );
  useEffect(
    () => () => {
      m.dispose();
      set.dispose();
    },
    [m, set],
  );
  return m;
}

/** Black powder-coated aluminium (balusters, mailbox). */
export function useBlackMetal(): THREE.MeshStandardMaterial {
  return usePlain(makeBlack);
}

/** Light-grey ballasted membrane on the flat porch / balcony roofs (gravel over the roofing). */
export function useMembrane(): THREE.MeshStandardMaterial {
  return useMetreMaterial('concrete_floor_02', 0.5, { color: COLORS.membrane, roughness: 0.95, envMapIntensity: 1.0, normalScale: 0.9 });
}

/**
 * The leaf speckle / card maps are drawn light (average ≈ 0.5 linear) so one map serves every
 * species: the vertex colours carry the albedo × this gain, i.e. the species tones in data.ts
 * are what the lit canopy averages to.
 */
export const LEAF_MAP_GAIN = 2.0;

/**
 * Solid foliage (canopy cores, conifer cones, hedge bodies): the 35 cm leaf-speckle albedo
 * tinted by the per-plant vertex colour (the cores are the shaded interior; the cards carry the
 * lit tone), the woven normal map tiled at 25 cm for leaf-sized relief, fully rough, sky at
 * 1.0 like everything else outdoors and a 4 % translucency term.
 */
function makeLeafMaterial(set: ReturnType<typeof usePbr>, speckle: THREE.Texture, roughness: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: '#ffffff',
    vertexColors: true,
    map: speckle,
    normalMap: set.normalMap,
    roughnessMap: set.roughnessMap,
    normalScale: set.normalScale,
    roughness,
    envMapIntensity: 1.0,
    emissive: '#ffffff',
    emissiveMap: speckle,
    emissiveIntensity: 0.04,
  });
}

function useLeafLike(roughness: number): THREE.MeshStandardMaterial {
  const set = usePbr('fabric_pattern_07', { repeat: [1 / 0.25, 1 / 0.25], normalScale: 0.5 });
  const speckle = useMemo(() => leafSpeckleTexture(), []);
  const m = useMemo(() => makeLeafMaterial(set, speckle.map, roughness), [set, speckle, roughness]);
  useEffect(
    () => () => {
      m.dispose();
      speckle.map.dispose();
    },
    [m, speckle],
  );
  return m;
}

export function useLeaf(): THREE.MeshStandardMaterial {
  return useLeafLike(1);
}

/** Privet / boxwood of the street hedge: the same map with a glossier leaf (roughness 0.6). */
export function useHedgeLeaf(): THREE.MeshStandardMaterial {
  return useLeafLike(0.6);
}

/**
 * Alpha-tested leaf-cluster / needle-frond cards around every crown: double-sided and
 * shadow-casting, but only their FRONT faces go into the shadow map — a back-lit double-sided
 * quad otherwise shadows itself (the normal bias pushes its sample behind its own depth) and
 * every second card went black.
 *
 * The cards carry the normal of the crown shell they sit on (geom.ts setNormal) and the shader
 * keeps it on the back face too (the `normal *= faceDirection` flip of three's double-sided
 * lighting is removed): a card is lit when the crown surface under it faces the sun, whichever
 * side the viewer sees, so the shade side of a tree reads ~4× darker than the lit side like a wall.
 */
export function useLeafCards(): THREE.MeshStandardMaterial {
  const tex = useMemo(() => leafCardTexture(), []);
  const m = useMemo(() => {
    // emissive = 8 % of the card's own albedo: a cheap translucency term so back-lit cards read
    // as dark green leaves instead of black blades.
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, map: tex, alphaTest: 0.5, side: THREE.DoubleSide, shadowSide: THREE.FrontSide, roughness: 0.9, envMapIntensity: 1.0, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.08 });
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
    };
    mat.customProgramCacheKey = () => 'leaf-cards-shell-normal';
    return mat;
  }, [tex]);
  useEffect(
    () => () => {
      m.dispose();
      tex.dispose();
    },
    [m, tex],
  );
  return m;
}

/** Alpha billboards of the horizon tree line and the tree-line band (per-tree tint and sun side in the vertex colour). */
export function useFarTrees(map: THREE.Texture): THREE.MeshStandardMaterial {
  const m = useMemo(() => new THREE.MeshStandardMaterial({ color: COLORS.farTree, vertexColors: true, map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1, envMapIntensity: 1.0 }), [map]);
  useEffect(() => () => m.dispose(), [m]);
  return m;
}

/** The horizon tree atlas (five silhouettes), disposed with its owner. */
export function useFarTreeAtlas(): THREE.CanvasTexture {
  const tex = useMemo(() => farTreeTexture(), []);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

// ---------------------------------------------------------------------------------------------
// Canvas copies of pack textures
// ---------------------------------------------------------------------------------------------

/** Draws a loaded pack texture (or a crop of it) into a canvas, optionally transforming its pixels. */
function imageToCanvas(src: THREE.Texture, crop: { x: number; y: number; w: number; h: number } | null, pixels?: (data: Uint8ClampedArray) => void): HTMLCanvasElement {
  const image = src.image as HTMLImageElement;
  const c = crop ?? { x: 0, y: 0, w: image.width, h: image.height };
  const canvas = document.createElement('canvas');
  canvas.width = c.w;
  canvas.height = c.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.drawImage(image, c.x, c.y, c.w, c.h, 0, 0, c.w, c.h);
  if (pixels) {
    const img = ctx.getImageData(0, 0, c.w, c.h);
    pixels(img.data);
    ctx.putImageData(img, 0, 0);
  }
  return canvas;
}

function canvasTexture(canvas: HTMLCanvasElement, color: boolean, repeat: [number, number], rotation = 0, offset: [number, number] = [0, 0], anisotropy = 8): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.center.set(0.5, 0.5);
  t.rotation = rotation;
  t.offset.set(offset[0], offset[1]);
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
  return t;
}

export interface SlateTextures {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
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
    return {
      map: canvasTexture(imageToCanvas(set.map, SLATE_CROP), true, repeat),
      normalMap: canvasTexture(imageToCanvas(set.normalMap, SLATE_CROP), false, repeat),
      roughnessMap: canvasTexture(imageToCanvas(set.roughnessMap, SLATE_CROP), false, repeat),
    };
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

export interface PlankTextures {
  /** Brightened, slightly desaturated copy of weathered_brown_planks (PLANK_TILE per repeat). */
  map: THREE.CanvasTexture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

/** weathered_brown_planks averages ~0.10 linear; real weathered cedar is 0.25–0.30 (silver-brown). */
const PLANK_GAIN = 2.3;
const PLANK_CHROMA = 0.7;

/**
 * The plank set with its albedo lifted 2.6× and 30 % of its orange chroma removed on a canvas:
 * a back-lit fence or a deck under the roof otherwise showed no grain at all (0.10 × the shaded
 * sky ≈ black). COLORS.cedar tints the result.
 */
export function usePlankTextures(): PlankTextures {
  const set = usePbr('weathered_brown_planks', { repeat: [1 / PLANK_TILE, 1 / PLANK_TILE], normalScale: 0.9 });
  const textures = useMemo(() => {
    if (!set.map || !set.normalMap || !set.roughnessMap) throw new Error('weathered_brown_planks: incomplete texture set');
    const canvas = imageToCanvas(set.map, null, (d) => {
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        d[i] = Math.min(255, (lum + (r - lum) * PLANK_CHROMA) * PLANK_GAIN);
        d[i + 1] = Math.min(255, (lum + (g - lum) * PLANK_CHROMA) * PLANK_GAIN);
        d[i + 2] = Math.min(255, (lum + (b - lum) * PLANK_CHROMA) * PLANK_GAIN);
      }
    });
    return { map: canvasTexture(canvas, true, [1 / PLANK_TILE, 1 / PLANK_TILE]), normalMap: set.normalMap, roughnessMap: set.roughnessMap };
  }, [set]);
  useEffect(() => () => textures.map.dispose(), [textures]);
  return textures;
}

export interface LawnTextures {
  /** Desaturated, brightened copy of the aerial grass albedo (4 m tile). */
  map: THREE.CanvasTexture;
  /** The same, turned 90° and offset, for the anti-tiling overlay. */
  mapRotated: THREE.CanvasTexture;
  normalMap: THREE.Texture;
  normalMapRotated: THREE.Texture;
  roughnessMap: THREE.Texture;
  roughnessMapRotated: THREE.Texture;
}

/** How much of the aerial map's chroma is kept (it is an ochre dry-scrub map: hue ~50°). */
const LAWN_CHROMA = 0.35;
/** Brightness gain of the copy, so the green tint stays ≤ 1 (the map averages sRGB 114,97,37). */
const LAWN_GAIN = 1.5;
const LAWN_ROTATION = Math.PI / 2;
const LAWN_OFFSET: [number, number] = [0.37, 0.61];

/**
 * aerial_grass_rock is an aerial dry-scrub / rock map (mean sRGB 114,97,37, hue ~50°): tinted
 * green it still read as hay beside the hue-90° plants. The lawn uses a copy with 35 % of its
 * chroma (mix(luminance, rgb, 0.35)) and 1.5× its brightness, so LAWN_TINT (Ground.tsx) sets
 * the hue and the map only supplies the mottling. Normal / roughness come straight from the pack.
 */
export function useLawnTextures(): LawnTextures {
  const set = usePbr('aerial_grass_rock', { repeat: [1 / GRASS_TILE, 1 / GRASS_TILE], anisotropy: 16 });
  const rotated = usePbr('aerial_grass_rock', { repeat: [1 / GRASS_TILE, 1 / GRASS_TILE], anisotropy: 16, rotation: LAWN_ROTATION, offset: LAWN_OFFSET });
  const textures = useMemo(() => {
    if (!set.map || !set.normalMap || !set.roughnessMap || !rotated.normalMap || !rotated.roughnessMap) throw new Error('aerial_grass_rock: incomplete texture set');
    const canvas = imageToCanvas(set.map, null, (d) => {
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        d[i] = Math.min(255, (lum + (r - lum) * LAWN_CHROMA) * LAWN_GAIN);
        d[i + 1] = Math.min(255, (lum + (g - lum) * LAWN_CHROMA) * LAWN_GAIN);
        d[i + 2] = Math.min(255, (lum + (b - lum) * LAWN_CHROMA) * LAWN_GAIN);
      }
    });
    const repeat: [number, number] = [1 / GRASS_TILE, 1 / GRASS_TILE];
    return {
      map: canvasTexture(canvas, true, repeat, 0, [0, 0], 16),
      mapRotated: canvasTexture(canvas, true, repeat, LAWN_ROTATION, LAWN_OFFSET, 16),
      normalMap: set.normalMap,
      normalMapRotated: rotated.normalMap,
      roughnessMap: set.roughnessMap,
      roughnessMapRotated: rotated.roughnessMap,
    };
  }, [set, rotated]);
  useEffect(
    () => () => {
      textures.map.dispose();
      textures.mapRotated.dispose();
    },
    [textures],
  );
  return textures;
}
