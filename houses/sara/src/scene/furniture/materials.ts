/**
 * Furniture material factory. Every prop is authored from primitives tagged with a `MatKey`;
 * all primitives of a storey sharing a key are merged into one mesh (one draw call per key per
 * storey) and repeated items are InstancedMeshes, so the whole house of furniture is well under
 * 200 draw calls.
 *
 * The merged geometry carries TWO uv sets (see builder.ts):
 *   uv  — box-projected in the piece's own frame, in METRES → every PBR set is configured for a
 *         1 m × 1 m surface (repeat = 1 / its real-world tile) and tiles at true scale;
 *   uv1 — the primitive's native 0..1 uvs → procedural maps that must fit a surface exactly
 *         (rug patterns, pictures) read `channel = 1`.
 *
 * `useFurnitureMaterials()` suspends until the texture pack is loaded (the whole Scene sits in
 * a Suspense boundary) and returns a lazy, memoised resolver.
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { usePbr } from '../materials';
import type { PbrSet } from '../materials';

export type MatKey =
  // wood
  | 'oak'
  | 'walnut'
  | 'lightOak'
  | 'cabinet'
  // painted / coated
  | 'paintWhite'
  | 'paintBlack'
  | 'paintGrey'
  | 'counter'
  // woven fabric (linen normal, sheen)
  | 'linenWhite'
  | 'fabricGrey'
  | 'fabricCharcoal'
  | 'fabricNavy'
  | 'fabricSage'
  | 'fabricRust'
  | 'fabricMustard'
  | 'fabricCream'
  | 'fabricBlush'
  // velvet (strong sheen)
  | 'velvetNavy'
  | 'velvetRust'
  | 'velvetMustard'
  | 'velvetSage'
  | 'velvetCream'
  | 'velvetForest'
  | 'velvetBlush'
  // leather
  | 'leather'
  | 'leatherLight'
  // rugs (procedural two-tone pattern + carpet normal)
  | 'rugNavy'
  | 'rugRust'
  | 'rugSage'
  | 'rugCream'
  | 'rugCharcoal'
  // wall art (procedural canvases)
  | 'art1'
  | 'art2'
  | 'art3'
  | 'towel'
  // hard surfaces
  | 'ceramic'
  | 'chrome'
  | 'brass'
  | 'steel'
  | 'glass'
  | 'carGlass'
  | 'mirror'
  | 'screen'
  | 'plasticBlack'
  | 'appliance'
  | 'carPaint'
  | 'tyre'
  | 'headlight'
  | 'taillight'
  | 'water'
  | 'jar'
  | 'terracotta'
  | 'soil'
  | 'leaf'
  | 'shade'
  | 'glow'
  | 'cardboard'
  | 'paper'
  | 'fruit'
  | 'pingpong';

export interface FurnitureMaterials {
  get(key: MatKey): THREE.Material;
  dispose(): void;
}

const NO_CAST: ReadonlySet<MatKey> = new Set<MatKey>(['glass', 'carGlass', 'water', 'glow', 'rugNavy', 'rugRust', 'rugSage', 'rugCream', 'rugCharcoal']);
const TRANSPARENT: ReadonlySet<MatKey> = new Set<MatKey>(['glass', 'carGlass', 'water', 'jar']);

export function castsShadow(key: MatKey): boolean {
  return !NO_CAST.has(key);
}

export function isTransparent(key: MatKey): boolean {
  return TRANSPARENT.has(key);
}

// ---------------------------------------------------------------------------------------------
// Procedural canvases (deterministic, ≤ 512 px)
// ---------------------------------------------------------------------------------------------

/** mulberry32 — same look on every load. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(size: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D | null } {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return { c, ctx: c.getContext('2d') };
}

function toTexture(c: HTMLCanvasElement, o: { channel?: number; repeat?: number } = {}): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  if (o.repeat) tex.repeat.set(o.repeat, o.repeat);
  tex.channel = o.channel ?? 0;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** White quartz / marble slab: faint grey veins and a fine speckle. Tiles at 1 m (uv in metres). */
function makeQuartz(): THREE.CanvasTexture {
  const S = 512;
  const { c, ctx } = canvas(S);
  if (!ctx) return toTexture(c);
  const r = rng(1234);
  ctx.fillStyle = '#f1efea';
  ctx.fillRect(0, 0, S, S);
  // soft cloudy variation
  for (let i = 0; i < 40; i++) {
    const g = ctx.createRadialGradient(r() * S, r() * S, 0, r() * S, r() * S, 60 + r() * 160);
    g.addColorStop(0, `rgba(190,188,182,${(0.05 + r() * 0.08).toFixed(3)})`);
    g.addColorStop(1, 'rgba(190,188,182,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }
  // veins (wrapped so the tile is seamless)
  ctx.lineCap = 'round';
  for (let v = 0; v < 7; v++) {
    const x0 = r() * S;
    const y0 = r() * S;
    const len = 200 + r() * 400;
    const ang = r() * Math.PI;
    for (const [ox, oy] of [[0, 0], [-S, 0], [S, 0], [0, -S], [0, S]]) {
      ctx.beginPath();
      ctx.moveTo(x0 + ox, y0 + oy);
      let x = x0 + ox;
      let y = y0 + oy;
      let a = ang;
      for (let s = 0; s < 8; s++) {
        a += (r() - 0.5) * 0.9;
        const nx = x + Math.cos(a) * (len / 8);
        const ny = y + Math.sin(a) * (len / 8);
        ctx.quadraticCurveTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 30, nx, ny);
        x = nx;
        y = ny;
      }
      ctx.strokeStyle = `rgba(150,146,138,${(0.12 + r() * 0.18).toFixed(3)})`;
      ctx.lineWidth = 0.8 + r() * 2.2;
      ctx.stroke();
    }
  }
  // speckle
  for (let i = 0; i < 2600; i++) {
    const g = r();
    ctx.fillStyle = g < 0.5 ? `rgba(120,116,110,${(0.08 + r() * 0.2).toFixed(3)})` : `rgba(255,255,255,${(0.15 + r() * 0.3).toFixed(3)})`;
    ctx.fillRect(r() * S, r() * S, 1 + r() * 1.5, 1 + r() * 1.5);
  }
  return toTexture(c);
}

/** Two-tone rug: wide border, inner field with a fine stripe and a woven noise. Read on uv1 (fits the rug). */
function makeRug(field: string, border: string, accent: string, seed: number): THREE.CanvasTexture {
  const S = 256;
  const { c, ctx } = canvas(S);
  if (!ctx) return toTexture(c, { channel: 1 });
  const r = rng(seed);
  ctx.fillStyle = border;
  ctx.fillRect(0, 0, S, S);
  const b = Math.round(S * 0.09);
  ctx.fillStyle = accent;
  ctx.fillRect(b, b, S - 2 * b, S - 2 * b);
  const b2 = b + Math.round(S * 0.025);
  ctx.fillStyle = field;
  ctx.fillRect(b2, b2, S - 2 * b2, S - 2 * b2);
  // inner stripes
  ctx.fillStyle = accent;
  for (let y = b2 + 14; y < S - b2 - 8; y += 22) ctx.fillRect(b2 + 10, y, S - 2 * b2 - 20, 2);
  // fringe hint at the two short ends
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let x = 0; x < S; x += 4) {
    ctx.fillRect(x, 0, 2, 3);
    ctx.fillRect(x, S - 3, 2, 3);
  }
  // weave noise
  for (let i = 0; i < 6000; i++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
    ctx.fillRect(r() * S, r() * S, 1.5, 1.5);
  }
  return toTexture(c, { channel: 1 });
}

/** Abstract canvas: a pale ground with a handful of translucent colour fields. Read on uv1. */
function makeArt(palette: string[], seed: number): THREE.CanvasTexture {
  const S = 256;
  const { c, ctx } = canvas(S);
  if (!ctx) return toTexture(c, { channel: 1 });
  const r = rng(seed);
  ctx.fillStyle = '#ece7dc';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = palette[i % palette.length];
    ctx.globalAlpha = 0.55 + r() * 0.4;
    const w = 40 + r() * 150;
    const h = 30 + r() * 150;
    const x = r() * (S - w);
    const y = r() * (S - h);
    if (r() < 0.4) {
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, r() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(x, y, w, h);
    }
  }
  ctx.globalAlpha = 1;
  // a few brush strokes
  ctx.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    ctx.strokeStyle = palette[Math.floor(r() * palette.length)];
    ctx.lineWidth = 2 + r() * 6;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(r() * S, r() * S);
    ctx.lineTo(r() * S, r() * S);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return toTexture(c, { channel: 1 });
}

// ---------------------------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------------------------

interface Sets {
  oak: PbrSet;
  walnut: PbrSet;
  lightOak: PbrSet;
  cabinet: PbrSet;
  linen: PbrSet;
  velvet: PbrSet;
  carpet: PbrSet;
  leather: PbrSet;
  leatherLight: PbrSet;
}

const ENV = 0.9;

function createResolver(t: Sets): FurnitureMaterials {
  const cache = new Map<MatKey, THREE.Material>();
  const canvases: THREE.CanvasTexture[] = [];
  const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ envMapIntensity: ENV, ...p });
  const phys = (p: THREE.MeshPhysicalMaterialParameters) => new THREE.MeshPhysicalMaterial({ envMapIntensity: ENV, ...p });
  /** Spread of a PBR set with its own normalScale vector (the set's is shared). */
  // `s.props` holds only the maps the set has (linen / velvet have no colour map; an explicit
  // `map: undefined` makes three warn on every material constructed from them).
  const pbr = (s: PbrSet, normalScale: number) => ({ ...s.props, normalScale: new THREE.Vector2(normalScale, normalScale) });
  const canvasTex = (tex: THREE.CanvasTexture) => {
    canvases.push(tex);
    return tex;
  };

  const linen = (color: string, extra: THREE.MeshPhysicalMaterialParameters = {}) =>
    phys({ color, ...pbr(t.linen, 0.7), roughness: 1, sheen: 0.3, sheenRoughness: 0.8, sheenColor: new THREE.Color(color).offsetHSL(0, 0, 0.15), envMapIntensity: 0.6, ...extra });
  const velvet = (color: string) =>
    phys({ color, ...pbr(t.velvet, 0.6), roughness: 0.85, sheen: 0.8, sheenRoughness: 0.55, sheenColor: new THREE.Color(color).offsetHSL(0, 0.05, 0.22), envMapIntensity: 0.6 });
  const rug = (field: string, border: string, accent: string, seed: number) =>
    phys({
      color: '#ffffff',
      map: canvasTex(makeRug(field, border, accent, seed)),
      normalMap: t.carpet.normalMap,
      roughnessMap: t.carpet.roughnessMap,
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughness: 1,
      sheen: 0.35,
      sheenRoughness: 0.9,
      sheenColor: new THREE.Color(field).offsetHSL(0, 0, 0.12),
      envMapIntensity: 0.4,
    });
  const art = (palette: string[], seed: number) => std({ color: '#ffffff', map: canvasTex(makeArt(palette, seed)), roughness: 0.85, envMapIntensity: 0.4 });
  const metal = (color: string, roughness: number, extra: THREE.MeshStandardMaterialParameters = {}) => std({ color, roughness, metalness: 1, envMapIntensity: 1.1, ...extra });

  const create = (key: MatKey): THREE.Material => {
    switch (key) {
      // ---- wood
      case 'oak':
        return std({ ...pbr(t.oak, 0.7), roughness: 0.95 });
      case 'walnut':
        return std({ ...pbr(t.walnut, 0.6), roughness: 0.9 });
      case 'lightOak':
        return std({ ...pbr(t.lightOak, 0.6), color: '#e9dfd0', roughness: 0.95 });
      case 'cabinet':
        return phys({ ...pbr(t.cabinet, 0.5), roughness: 0.8, clearcoat: 0.15, clearcoatRoughness: 0.4 });
      // ---- painted
      case 'paintWhite':
        return phys({ color: '#f2efe8', roughness: 0.38, clearcoat: 0.25, clearcoatRoughness: 0.3, envMapIntensity: 0.7 });
      case 'paintBlack':
        return std({ color: '#1f2023', roughness: 0.5, metalness: 0.6, envMapIntensity: 0.8 });
      case 'paintGrey':
        return std({ color: '#8d9297', roughness: 0.5, metalness: 0.45 });
      case 'counter':
        return phys({ color: '#ffffff', map: canvasTex(makeQuartz()), roughness: 0.2, clearcoat: 0.3, clearcoatRoughness: 0.1, envMapIntensity: 1 });
      // ---- fabric
      case 'linenWhite':
        return linen('#f4f0e7');
      case 'fabricGrey':
        return linen('#8a8d92');
      case 'fabricCharcoal':
        return linen('#3b3e44');
      case 'fabricNavy':
        return linen('#2d3756');
      case 'fabricSage':
        return linen('#8ea388');
      case 'fabricRust':
        return linen('#a96d55');
      case 'fabricMustard':
        return linen('#c9a13b');
      case 'fabricCream':
        return linen('#ddd4c1');
      case 'fabricBlush':
        return linen('#d9b3a8');
      // ---- velvet
      case 'velvetNavy':
        return velvet('#20294a');
      case 'velvetRust':
        return velvet('#9a5a44');
      case 'velvetMustard':
        return velvet('#b8912f');
      case 'velvetSage':
        return velvet('#6f8a6b');
      case 'velvetCream':
        return velvet('#d8cbb2');
      case 'velvetForest':
        return velvet('#2f4a3a');
      case 'velvetBlush':
        return velvet('#c99c92');
      // ---- leather
      case 'leather':
        return std({ ...pbr(t.leather, 0.8), roughness: 0.9, envMapIntensity: 0.8 });
      case 'leatherLight':
        return std({ ...pbr(t.leatherLight, 0.7), color: '#e6ddcc', roughness: 0.9, envMapIntensity: 0.7 });
      // ---- rugs
      case 'rugNavy':
        return rug('#33406a', '#1f2742', '#c8bfa8', 11);
      case 'rugRust':
        return rug('#b07a62', '#7d4e3a', '#e8d6bf', 12);
      case 'rugSage':
        return rug('#9bae95', '#6b8066', '#e6e2d3', 13);
      case 'rugCream':
        return rug('#ded5c2', '#b9ad93', '#8c7f68', 14);
      case 'rugCharcoal':
        return rug('#4a4d53', '#2d3035', '#b9b4aa', 15);
      // ---- art / textiles
      case 'art1':
        return art(['#2f3a5a', '#c9a13b', '#e8e1d2', '#a8705a'], 21);
      case 'art2':
        return art(['#8fa58a', '#2f4a3a', '#efe6d3', '#b9664b'], 22);
      case 'art3':
        return art(['#3c3f45', '#d9b3a8', '#c9ccd2', '#1f2a4a'], 23);
      case 'towel':
        return phys({ color: '#f6f3ee', normalMap: t.carpet.normalMap, normalScale: new THREE.Vector2(1, 1), roughness: 1, sheen: 0.45, sheenRoughness: 0.9, sheenColor: new THREE.Color('#ffffff'), envMapIntensity: 0.5 });
      // ---- hard surfaces
      case 'ceramic':
        return phys({ color: '#f8f8f6', roughness: 0.12, clearcoat: 0.6, clearcoatRoughness: 0.08, envMapIntensity: 1 });
      case 'chrome':
        return metal('#e9ebee', 0.2);
      case 'brass':
        return metal('#d7b063', 0.32);
      case 'steel':
        return phys({ color: '#c9ccd0', roughness: 0.35, metalness: 0.9, anisotropy: 0.6, envMapIntensity: 1.1 });
      case 'glass':
        // Shower screens / porthole: near-black pane blended as `reflection + 0.9 × view` (see
        // windows/materials.ts) instead of a lit pale-blue wash over the tiles behind.
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
          envMapIntensity: 1.2,
        });
      case 'carGlass':
        return phys({ color: '#1d2a33', transparent: true, opacity: 0.55, roughness: 0.03, metalness: 0.2, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.3 });
      case 'mirror':
        // a perfect reflector would only mirror the sky HDRI (no planar reflections), reading as a window
        return metal('#cfd5db', 0.14, { envMapIntensity: 0.6 });
      case 'screen':
        return std({ color: '#06070a', roughness: 0.1, metalness: 0.2, envMapIntensity: 1.2 });
      case 'plasticBlack':
        return std({ color: '#17181a', roughness: 0.5, metalness: 0.05 });
      case 'appliance':
        return phys({ color: '#f2f2f0', roughness: 0.3, clearcoat: 0.3, clearcoatRoughness: 0.2, envMapIntensity: 0.8 });
      case 'carPaint':
        return phys({ color: '#28374d', roughness: 0.38, metalness: 0.75, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.2 });
      case 'tyre':
        return std({ color: '#141414', roughness: 0.95 });
      case 'headlight':
        return std({ color: '#ffffff', emissive: '#fff6e0', emissiveIntensity: 1.6, roughness: 0.1 });
      case 'taillight':
        return std({ color: '#8a1010', emissive: '#ff2a1a', emissiveIntensity: 1.2, roughness: 0.15 });
      case 'water':
        return phys({ color: '#8fc4d6', transparent: true, opacity: 0.5, roughness: 0.03, metalness: 0, depthWrite: false, envMapIntensity: 1.2 });
      case 'jar':
        return phys({ color: '#d8a556', transparent: true, opacity: 0.72, roughness: 0.12, clearcoat: 0.5, depthWrite: false, envMapIntensity: 1 });
      case 'terracotta':
        return std({ color: '#a0603f', roughness: 0.85 });
      case 'soil':
        return std({ color: '#2e2419', roughness: 1 });
      case 'leaf':
        return phys({ color: '#ffffff', roughness: 0.6, side: THREE.DoubleSide, sheen: 0.25, sheenColor: new THREE.Color('#cfe8b8'), envMapIntensity: 0.6 });
      case 'shade':
        return phys({ color: '#f1e8d6', ...pbr(t.linen, 0.5), roughness: 1, emissive: '#ffd9a6', emissiveIntensity: 0.35, side: THREE.DoubleSide, envMapIntensity: 0.4 });
      case 'glow':
        return std({ color: '#fff1d6', emissive: '#ffe3b8', emissiveIntensity: 3, side: THREE.DoubleSide });
      case 'cardboard':
        return std({ color: '#b08f62', roughness: 0.9 });
      case 'paper':
        return std({ color: '#ffffff', roughness: 0.85, envMapIntensity: 0.5 });
      case 'fruit':
        return phys({ color: '#ffffff', roughness: 0.35, clearcoat: 0.4, clearcoatRoughness: 0.25 });
      case 'pingpong':
        return std({ color: '#1f5a3a', roughness: 0.7 });
    }
  };

  return {
    get(key) {
      let m = cache.get(key);
      if (!m) {
        m = create(key);
        cache.set(key, m);
      }
      return m;
    },
    dispose() {
      for (const m of cache.values()) m.dispose();
      cache.clear();
      for (const c of canvases) c.dispose();
      canvases.length = 0;
    },
  };
}

/**
 * Loads (suspending) the furniture's texture sets and returns the key → material resolver.
 * Wood sets are rotated so the grain runs along U: the builder projects U along a piece's length
 * on tops and along its height on turned legs.
 */
export function useFurnitureMaterials(): FurnitureMaterials {
  const oak = usePbr('wood_table_001', { size: [1, 1], rotation: Math.PI / 2 });
  const walnut = usePbr('dark_wood', { size: [1, 1] });
  const lightOak = usePbr('kitchen_wood', { size: [1, 1], rotation: Math.PI / 2 });
  // cabinet fronts keep the texture's native vertical grain (stiles)
  const cabinet = usePbr('kitchen_wood', { size: [1, 1] });
  const linen = usePbr('fabric_pattern_05', { size: [1, 1] });
  const velvet = usePbr('velour_velvet', { size: [1, 1] });
  const carpet = usePbr('fabric_pattern_07', { size: [1, 1] });
  const leather = usePbr('brown_leather', { size: [1, 1] });
  const leatherLight = usePbr('leather_white', { size: [1, 1] });
  const mats = useMemo(
    () => createResolver({ oak, walnut, lightOak, cabinet, linen, velvet, carpet, leather, leatherLight }),
    [oak, walnut, lightOak, cabinet, linen, velvet, carpet, leather, leatherLight],
  );
  useEffect(() => () => mats.dispose(), [mats]);
  return mats;
}
