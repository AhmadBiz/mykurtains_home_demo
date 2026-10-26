/**
 * Procedural CanvasTextures for what the texture pack does not cover: painted trim details
 * (soffit boards, vented soffit panels, the orange-peel of painted PVC / aluminium), the
 * split-face block of the porch body and retaining walls, the foliage maps (leaf speckle, the
 * leaf-cluster / needle-frond card atlas, the horizon tree atlas and tree-line band) and the
 * lawn's macro and blade-grain variation. Every tiling texture is seamless (RepeatWrapping) and
 * deterministic (seeded PRNG). Tiling textures return UV-in-metres maps: the caller's geometry
 * carries metre UVs and `repeat` is 1 / tile.
 */
import * as THREE from 'three';
import { noise3 } from './noise';

/** Small deterministic PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function context2d(w: number, h: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  return ctx;
}

function toTexture(ctx: CanvasRenderingContext2D, tile: number, color: boolean, anisotropy = 8, tileV = tile): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(ctx.canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / tile, 1 / tileV);
  tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = anisotropy; // three clamps this to the device maximum
  tex.needsUpdate = true;
  return tex;
}

/** Non-tiling atlas (clamped, sRGB). */
function toAtlas(ctx: CanvasRenderingContext2D): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(ctx.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

const smoothstep = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const grey = (v: number) => `rgb(${Math.round(v)},${Math.round(v)},${Math.round(v)})`;

/**
 * Tangent-space normal map (OpenGL convention, green = +V = canvas up) from a seamless height
 * field in [0, 1]; `strength` is the slope per unit height across one pixel.
 */
function normalFromHeight(h: Float32Array, w: number, hh: number, strength: number): CanvasRenderingContext2D {
  const ctx = context2d(w, hh);
  const img = ctx.createImageData(w, hh);
  const d = img.data;
  for (let y = 0; y < hh; y++) {
    const yu = (y - 1 + hh) % hh;
    const yd = (y + 1) % hh;
    for (let x = 0; x < w; x++) {
      const xl = (x - 1 + w) % w;
      const xr = (x + 1) % w;
      const du = (h[y * w + xr] - h[y * w + xl]) * 0.5 * strength;
      const dv = (h[yu * w + x] - h[yd * w + x]) * 0.5 * strength;
      const len = Math.hypot(du, dv, 1);
      const i = (y * w + x) * 4;
      d[i] = Math.round(128 + (-du / len) * 127);
      d[i + 1] = Math.round(128 + (-dv / len) * 127);
      d[i + 2] = Math.round(128 + (1 / len) * 127);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return ctx;
}

/**
 * Seamless 2-octave value noise in [-1, 1] at pixel (x, y) of a `size` px tile (wavelengths in
 * px): the four copies shifted by the tile size are blended with bilinear weights, so the edges match.
 */
function tileNoise(x: number, y: number, size: number, w1: number, w2: number, seed: number): number {
  const sample = (px: number, py: number) => noise3(px / w1, py / w1, seed * 0.1, seed) * 0.7 + noise3(px / w2, py / w2, seed * 0.1, seed + 7) * 0.3;
  const fx = x / size;
  const fy = y / size;
  return (
    sample(x, y) * (1 - fx) * (1 - fy) +
    sample(x - size, y) * fx * (1 - fy) +
    sample(x, y - size) * (1 - fx) * fy +
    sample(x - size, y - size) * fx * fy
  );
}

export interface TrimTexture {
  map: THREE.CanvasTexture;
  /** Metres per tile (the map's repeat is already 1 / tile). */
  tile: number;
}

export interface SurfaceTextures {
  map?: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  tile: number;
  dispose(): void;
}

// ---------------------------------------------------------------------------------------------
// Painted trim
// ---------------------------------------------------------------------------------------------

/** Painted tongue-and-groove soffit boards: 4 boards of 10 cm per 0.4 m tile, running along U. */
export function soffitBoardTexture(): TrimTexture {
  const size = 256;
  const tile = 0.4;
  const ctx = context2d(size, size);
  const rnd = mulberry32(41);
  const boards = 4;
  const bh = size / boards;
  for (let b = 0; b < boards; b++) {
    const y = b * bh;
    const v = 238 + Math.floor(rnd() * 8);
    ctx.fillStyle = `rgb(${v},${v - 2},${v - 6})`;
    ctx.fillRect(0, y, size, bh);
    // faint grain
    ctx.fillStyle = 'rgba(0,0,0,0.035)';
    for (let k = 0; k < 6; k++) ctx.fillRect(0, y + 2 + Math.floor(rnd() * (bh - 4)), size, 1);
    // V-groove: shadow line + highlight
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(0, y + bh - 3, size, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(0, y + bh - 1, size, 1);
  }
  return { map: toTexture(ctx, tile, true), tile };
}

/** Vented aluminium soffit: two 0.3 m panels per 0.6 m tile, each with a perforated centre band. */
export function soffitVentTexture(): TrimTexture {
  const size = 256;
  const tile = 0.6;
  const ctx = context2d(size, size);
  ctx.fillStyle = '#f0ede6';
  ctx.fillRect(0, 0, size, size);
  const panels = 2;
  const pw = size / panels;
  for (let p = 0; p < panels; p++) {
    const x = p * pw;
    // panel seam (a small lap) along V
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(x + pw - 2, 0, 2, size);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(x, 0, 1, size);
    // perforated band in the middle third of the panel
    const bx = x + pw * 0.34;
    const bw = pw * 0.32;
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    const pitch = 5;
    for (let yy = 2; yy < size; yy += pitch) {
      for (let xx = bx + 2; xx < bx + bw; xx += pitch) ctx.fillRect(Math.floor(xx), yy, 2, 2);
    }
  }
  return { map: toTexture(ctx, tile, true), tile };
}

/**
 * Painted PVC / aluminium trim (columns, fascia, gutters): a semi-matt roughness that wanders
 * 0.45 ± 0.08 over ~10 cm and a faint orange-peel normal, 0.5 m per tile. Under the sun a flat
 * roughness 0.5 read as smooth plastic beside the textured brick.
 */
export function paintTextures(): SurfaceTextures {
  const size = 256;
  const tile = 0.5;
  const rough = context2d(size, size);
  const img = rough.createImageData(size, size);
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const slow = tileNoise(x, y, size, 48, 18, 11);
      const peel = tileNoise(x, y, size, 7, 3, 23);
      const r = 0.45 + 0.08 * slow + 0.02 * peel;
      const i = (y * size + x) * 4;
      const v = Math.round(255 * THREE.MathUtils.clamp(r, 0, 1));
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
      h[y * size + x] = 0.5 + 0.5 * peel;
    }
  }
  rough.putImageData(img, 0, 0);
  const normal = normalFromHeight(h, size, size, 0.3);
  const set: SurfaceTextures = {
    normalMap: toTexture(normal, tile, false),
    roughnessMap: toTexture(rough, tile, false),
    tile,
    dispose() {
      set.normalMap.dispose();
      set.roughnessMap.dispose();
    },
  };
  return set;
}

// ---------------------------------------------------------------------------------------------
// Split-face concrete block: 0.4 × 0.2 m running bond, 3 mm raked joints, ±4 % tone per block,
// a fractured face (noise height field) → normal map; 1.6 × 0.8 m per tile (4 × 4 blocks).
// ---------------------------------------------------------------------------------------------
export function splitFaceBlockTextures(): SurfaceTextures {
  const w = 1024;
  const hh = 512;
  const tileU = 1.6;
  const tileV = 0.8;
  const pxm = w / tileU; // 640 px per metre
  const blockW = Math.round(0.4 * pxm);
  const blockH = Math.round(0.2 * pxm);
  const joint = Math.max(2, Math.round(0.003 * pxm));
  const rnd = mulberry32(606);
  const rows = Math.round(hh / blockH);
  const cols = Math.round(w / blockW);
  // per-block tone / tilt / fracture seed
  const tone: number[] = [];
  const tiltU: number[] = [];
  const tiltV: number[] = [];
  const bseed: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tone.push(1 + (rnd() - 0.5) * 0.08);
      tiltU.push((rnd() - 0.5) * 0.4);
      tiltV.push((rnd() - 0.5) * 0.4);
      bseed.push(Math.floor(rnd() * 1000));
    }
  }
  const height = new Float32Array(w * hh);
  const albedo = context2d(w, hh);
  const rough = context2d(w, hh);
  const aImg = albedo.createImageData(w, hh);
  const rImg = rough.createImageData(w, hh);
  const base: [number, number, number] = [205, 206, 208];
  const mortar: [number, number, number] = [160, 158, 152];
  for (let y = 0; y < hh; y++) {
    const r = Math.floor(y / blockH);
    const yIn = y - r * blockH;
    const shift = (r % 2) * (blockW / 2); // running bond
    for (let x = 0; x < w; x++) {
      const xs = (x + shift) % w;
      const c = Math.floor(xs / blockW);
      const xIn = xs - c * blockW;
      const k = r * cols + (c % cols);
      const inJoint = xIn < joint || yIn < joint;
      const i = (y * w + x) * 4;
      if (inJoint) {
        // raked joint: recessed, darker, rougher
        height[y * w + x] = 0.05;
        const v = 0.92 + rnd() * 0.08;
        aImg.data[i] = Math.round(mortar[0] * v);
        aImg.data[i + 1] = Math.round(mortar[1] * v);
        aImg.data[i + 2] = Math.round(mortar[2] * v);
        aImg.data[i + 3] = 255;
        const rv = Math.round(255 * 0.95);
        rImg.data[i] = rv;
        rImg.data[i + 1] = rv;
        rImg.data[i + 2] = rv;
        rImg.data[i + 3] = 255;
        continue;
      }
      // fractured face: coarse chips (2.5 cm) + fine grain (6 mm) + a per-block tilt, feathered to the edges
      const u = (xIn - joint) / (blockW - joint);
      const v = (yIn - joint) / (blockH - joint);
      const edge = Math.min(1, Math.min(u, 1 - u) * (blockW / 10), Math.min(v, 1 - v) * (blockH / 10));
      const chips = noise3(x / 16 + bseed[k], y / 16, bseed[k] * 0.37, 3) * 0.6 + noise3(x / 4 + bseed[k], y / 4, 0, 4) * 0.25;
      const hgt = 0.55 + 0.45 * (chips * 0.9 + tiltU[k] * (u - 0.5) + tiltV[k] * (v - 0.5));
      height[y * w + x] = 0.05 + (0.95 * THREE.MathUtils.clamp(hgt, 0, 1) - 0.05) * (0.35 + 0.65 * edge);
      const lit = 0.9 + 0.2 * chips; // the fractured facets catch light differently
      const t = tone[k] * lit * (0.97 + rnd() * 0.06);
      aImg.data[i] = Math.round(THREE.MathUtils.clamp(base[0] * t, 0, 255));
      aImg.data[i + 1] = Math.round(THREE.MathUtils.clamp(base[1] * t, 0, 255));
      aImg.data[i + 2] = Math.round(THREE.MathUtils.clamp(base[2] * t, 0, 255));
      aImg.data[i + 3] = 255;
      const rv = Math.round(255 * THREE.MathUtils.clamp(0.9 + 0.05 * chips, 0, 1));
      rImg.data[i] = rv;
      rImg.data[i + 1] = rv;
      rImg.data[i + 2] = rv;
      rImg.data[i + 3] = 255;
    }
  }
  albedo.putImageData(aImg, 0, 0);
  rough.putImageData(rImg, 0, 0);
  const normal = normalFromHeight(height, w, hh, 4.0);
  const set: SurfaceTextures = {
    map: toTexture(albedo, tileU, true, 8, tileV),
    normalMap: toTexture(normal, tileU, false, 8, tileV),
    roughnessMap: toTexture(rough, tileU, false, 8, tileV),
    tile: tileU,
    dispose() {
      set.map?.dispose();
      set.normalMap.dispose();
      set.roughnessMap.dispose();
    },
  };
  return set;
}

// ---------------------------------------------------------------------------------------------
// Foliage textures: the solid canopies carry a tileable leaf-speckle albedo; the ragged edge
// comes from alpha-tested cards cut from a cluster atlas. Both are drawn in LIGHT tones so the
// vertex colour of each plant supplies the species albedo.
// ---------------------------------------------------------------------------------------------

/** A pointed leaf (two arcs) centred at (x, y), `len` long along `angle`, `wid` wide. */
function leafPath(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, wid: number, angle: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(-len / 2, 0);
  ctx.quadraticCurveTo(0, -wid, len / 2, 0);
  ctx.quadraticCurveTo(0, wid, -len / 2, 0);
  ctx.closePath();
  ctx.restore();
}

/**
 * Light leaf tone (sRGB) with a little hue / value variation; `shade` 0..1 darkens. The maps
 * average ~0.6 linear, which LEAF_MAP_GAIN (materials.ts) compensates in the vertex colours.
 */
function leafTone(rnd: () => number, shade: number): string {
  const v = 175 + rnd() * 70;
  const k = 1 - shade * 0.28;
  const r = Math.round(v * 0.86 * k + rnd() * 12);
  const g = Math.round(v * k);
  const b = Math.round(v * 0.72 * k);
  return `rgb(${r},${g},${b})`;
}

/**
 * Seamless leaf speckle, 35 cm per tile: hundreds of overlapping 4–8 cm leaves over a shaded
 * ground, wrapped at the edges, so the leaves still resolve at 5–10 m. Tinted by the canopy's
 * vertex colour; tiled through the cylindrical metre UVs of the blobs.
 */
export function leafSpeckleTexture(): TrimTexture {
  const size = 512;
  const tile = 0.35;
  const ctx = context2d(size, size);
  const rnd = mulberry32(2024);
  ctx.fillStyle = 'rgb(118,132,96)';
  ctx.fillRect(0, 0, size, size);
  const leaves = 760;
  for (let i = 0; i < leaves; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const len = 58 + rnd() * 60; // 4–8 cm
    const wid = len * (0.26 + rnd() * 0.14);
    const a = rnd() * Math.PI * 2;
    // deeper leaves first (darker), the last ones lit
    ctx.fillStyle = leafTone(rnd, 1 - i / leaves);
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        if (x + ox < -len || x + ox > size + len || y + oy < -len || y + oy > size + len) continue;
        leafPath(ctx, x + ox, y + oy, len, wid, a);
        ctx.fill();
        // midrib
        ctx.save();
        ctx.translate(x + ox, y + oy);
        ctx.rotate(a);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(-len * 0.42, -0.7, len * 0.84, 1.4);
        ctx.restore();
        ctx.fillStyle = leafTone(rnd, 1 - i / leaves);
      }
    }
  }
  return { map: toTexture(ctx, tile, true, 16), tile };
}

/**
 * Card atlas (alpha), 1024 × 512: left half a broadleaf cluster (~60 leaves fanning from the
 * centre), right half a conifer frond — a tapered spine along U with three layers of thin
 * needles angled toward the tip, dense at the spine and feathered at the ends so the 0.5 alpha
 * test leaves a ragged branch rather than a bar. Transparent background.
 */
export function leafCardTexture(): THREE.CanvasTexture {
  const size = 512;
  const ctx = context2d(size * 2, size);
  const rnd = mulberry32(77);
  ctx.clearRect(0, 0, size * 2, size);
  // ---- broadleaf cluster
  const cx = size / 2;
  const cy = size / 2;
  for (let i = 0; i < 64; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * size * 0.34;
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d;
    const len = 52 + rnd() * 40;
    const wid = len * (0.3 + rnd() * 0.12);
    const ang = a + (rnd() - 0.5) * 0.8;
    ctx.fillStyle = leafTone(rnd, 0.6 - (i / 64) * 0.6);
    leafPath(ctx, x, y, len, wid, ang);
    ctx.fill();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(-len * 0.4, -1, len * 0.8, 2);
    ctx.restore();
  }
  // ---- conifer frond: spine from x0 (trunk end) to x1 (tip)
  const x0 = size + 24;
  const x1 = size * 2 - 20;
  const span = x1 - x0;
  ctx.lineCap = 'round';
  const needleTone = (shade: number) => {
    const v = 150 + rnd() * 60;
    const k = 1 - shade * 0.35;
    return `rgb(${Math.round(v * 0.8 * k)},${Math.round(v * k)},${Math.round(v * 0.66 * k)})`;
  };
  // three layers: deep (dark, long, sparse), middle, top (light, short, dense) — thick and
  // dense enough near the spine to survive the 0.5 alpha test and its mipmaps as a fluffy
  // branch, thinning toward the needle tips so the outline frays instead of ending in a bar
  for (const [width, pitch, reachK, shade, angle] of [
    [3.2, 2.8, 1.0, 0.7, 64],
    [2.8, 2.2, 0.82, 0.35, 56],
    [2.2, 1.8, 0.62, 0.05, 48],
  ]) {
    for (let x = x0 + 4; x < x1 - 6; x += pitch) {
      const t = (x - x0) / span;
      // needles shorten toward the tip (feathered) and are a little shorter at the base
      const taper = Math.sin(Math.PI * (0.15 + 0.85 * (1 - t))) * (0.75 + 0.25 * (1 - t));
      const reach = 112 * reachK * taper * (0.7 + rnd() * 0.3);
      if (reach < 3) continue;
      const rad = THREE.MathUtils.degToRad(angle + (rnd() - 0.5) * 18);
      for (const s of [-1, 1]) {
        ctx.strokeStyle = needleTone(shade + rnd() * 0.25);
        // tapered needle: a thick inner half and a thin outer half
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(x, cy + s * 1.5);
        ctx.lineTo(x + Math.cos(rad) * reach * 0.55, cy + s * Math.sin(rad) * reach * 0.55);
        ctx.stroke();
        ctx.lineWidth = width * 0.55;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(rad) * reach * 0.5, cy + s * Math.sin(rad) * reach * 0.5);
        ctx.lineTo(x + Math.cos(rad) * reach, cy + s * Math.sin(rad) * reach);
        ctx.stroke();
      }
    }
  }
  // tapered spine, 5 px at the base to 1.5 px at the tip
  const spineSteps = 24;
  for (let k = 0; k < spineSteps; k++) {
    const t0 = k / spineSteps;
    const t1 = (k + 1) / spineSteps;
    ctx.strokeStyle = `rgb(${150 - Math.round(t0 * 30)},${126 - Math.round(t0 * 20)},${96 - Math.round(t0 * 16)})`;
    ctx.lineWidth = 5 - 3.5 * t0;
    ctx.beginPath();
    ctx.moveTo(x0 + span * t0, cy + Math.sin(t0 * 5) * 2);
    ctx.lineTo(x0 + span * t1, cy + Math.sin(t1 * 5) * 2);
    ctx.stroke();
  }
  // tip: a tuft of short needles
  ctx.lineWidth = 1.6;
  for (let k = 0; k < 14; k++) {
    const a = (rnd() - 0.5) * 1.6;
    ctx.strokeStyle = needleTone(rnd() * 0.3);
    ctx.beginPath();
    ctx.moveTo(x1 - 8, cy);
    ctx.lineTo(x1 - 8 + Math.cos(a) * (12 + rnd() * 14), cy + Math.sin(a) * (12 + rnd() * 14));
    ctx.stroke();
  }
  return toAtlas(ctx);
}

// ---------------------------------------------------------------------------------------------
// Horizon trees: five silhouettes in a 1600 × 640 atlas (two broadleaf, two conifer, one bare),
// each in three tone bands (sunlit top 1.0, mid 0.7, base 0.4), the alpha edge eroded with
// noise so the outline is ragged, a few holes in the crowns. Drawn LIGHT (tone 1.0 ≈ sRGB
// 200,214,170); COLORS.farTree brings a lit crown to ≈ #4d6e3a and the fog does the rest.
// ---------------------------------------------------------------------------------------------
export interface FarTreeVariant {
  /** Atlas u range. */
  u: [number, number];
  /** Natural width / height of the silhouette. */
  aspect: number;
  conifer: boolean;
}

const FAR_CELL_W = 320;
const FAR_CELL_H = 640;
const FAR_CELLS = 5;

export const FAR_TREE_VARIANTS: FarTreeVariant[] = [
  { u: [0 / FAR_CELLS, 1 / FAR_CELLS], aspect: 0.62, conifer: false },
  { u: [1 / FAR_CELLS, 2 / FAR_CELLS], aspect: 0.5, conifer: false },
  { u: [2 / FAR_CELLS, 3 / FAR_CELLS], aspect: 0.48, conifer: true },
  { u: [3 / FAR_CELLS, 4 / FAR_CELLS], aspect: 0.36, conifer: true },
  { u: [4 / FAR_CELLS, 5 / FAR_CELLS], aspect: 0.55, conifer: false },
];

function farTone(k: number, hueShift = 0): string {
  return `rgb(${Math.round(200 * k * (1 - hueShift))},${Math.round(214 * k)},${Math.round(170 * k * (1 + hueShift))})`;
}

/** Irregular blob: a polygon whose radius wobbles with noise (no circle survives). */
function raggedBlob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, seed: number, wobble = 0.35): void {
  ctx.beginPath();
  const n = 14;
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * Math.PI * 2;
    const rr = r * (1 + wobble * noise3(Math.cos(a) * 1.7 + seed, Math.sin(a) * 1.7, seed * 0.3, 9));
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (k === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

/** Erodes the alpha edge of a cell with 2-octave noise (ragged silhouette) and punches a few holes. */
function erodeCell(ctx: CanvasRenderingContext2D, x0: number, w: number, h: number, seed: number, rnd: () => number): void {
  const img = ctx.getImageData(x0, 0, w, h);
  const d = img.data;
  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = d[i * 4 + 3];
  const R = 10;
  const probes: [number, number][] = [
    [R, 0],
    [-R, 0],
    [0, R],
    [0, -R],
    [R * 0.7, R * 0.7],
    [-R * 0.7, -R * 0.7],
    [R * 0.7, -R * 0.7],
    [-R * 0.7, R * 0.7],
  ];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (alpha[i] === 0) continue;
      let edge = false;
      for (const [dx, dy] of probes) {
        const xx = Math.round(x + dx);
        const yy = Math.round(y + dy);
        if (xx < 0 || yy < 0 || xx >= w || yy >= h || alpha[yy * w + xx] === 0) {
          edge = true;
          break;
        }
      }
      if (!edge) continue;
      const n = noise3(x / 15, y / 15, seed, 21) * 0.7 + noise3(x / 5, y / 5, seed, 22) * 0.3;
      if (n > -0.08) d[i * 4 + 3] = 0;
    }
  }
  // holes
  for (let k = 0; k < 7; k++) {
    const hx = Math.round(w * (0.25 + rnd() * 0.5));
    const hy = Math.round(h * (0.12 + rnd() * 0.5));
    const hr = 4 + rnd() * 3;
    for (let y = hy - hr; y <= hy + hr; y++) {
      for (let x = hx - hr; x <= hx + hr; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        if (Math.hypot(x - hx, y - hy) <= hr) d[(y * w + x) * 4 + 3] = 0;
      }
    }
  }
  ctx.putImageData(img, x0, 0);
}

export function farTreeTexture(): THREE.CanvasTexture {
  const w = FAR_CELL_W * FAR_CELLS;
  const h = FAR_CELL_H;
  const ctx = context2d(w, h);
  const rnd = mulberry32(303);
  ctx.clearRect(0, 0, w, h);
  const trunkStyle = 'rgb(104,92,80)';
  /** Tone band by height fraction t (0 base → 1 top). */
  const band = (t: number, jitter: number) => 0.4 + 0.3 * smoothstep((t - 0.1) / 0.4) + 0.3 * smoothstep((t - 0.55) / 0.35) + jitter;

  // ---- broadleaf A (round, wide) and B (tall oval)
  const broadleaf = (cell: number, rx: number, ry: number, crownTop: number, blobs: number, seed: number) => {
    const x0 = cell * FAR_CELL_W;
    const cx = x0 + FAR_CELL_W / 2;
    const crownBottom = h * 0.9; // trunk visible under the lowest branches only (≤ 1.5 m of a 10 m tree)
    ctx.fillStyle = trunkStyle;
    ctx.fillRect(cx - 7, h * 0.6, 14, h * 0.4);
    // branches up into the crown
    ctx.strokeStyle = trunkStyle;
    ctx.lineWidth = 4;
    for (let b = 0; b < 4; b++) {
      ctx.beginPath();
      ctx.moveTo(cx, h * 0.7);
      ctx.lineTo(cx + (rnd() - 0.5) * 120, h * 0.4 + rnd() * 60);
      ctx.stroke();
    }
    const cy = (crownTop + crownBottom) / 2;
    const items: { x: number; y: number; r: number; t: number }[] = [];
    for (let i = 0; i < blobs; i++) {
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd());
      const x = cx + Math.cos(a) * d * rx;
      const y = cy + Math.sin(a) * d * ry;
      const r = 16 + rnd() * 22;
      items.push({ x, y, r, t: 1 - (y - crownTop) / (crownBottom - crownTop) });
    }
    items.sort((p, q) => q.y - p.y); // low (dark) first, lit top last
    items.forEach((it, i) => {
      ctx.fillStyle = farTone(band(it.t, (rnd() - 0.5) * 0.12), (rnd() - 0.5) * 0.08);
      raggedBlob(ctx, it.x, it.y, it.r, seed + i, 0.4);
    });
  };
  broadleaf(0, 96, 150, h * 0.08, 78, 10);
  broadleaf(1, 72, 200, h * 0.05, 70, 50);

  // ---- conifers: stacked tiers with torn, drooping tips
  const conifer = (cell: number, halfBase: number, tiers: number, seed: number) => {
    const x0 = cell * FAR_CELL_W;
    const cx = x0 + FAR_CELL_W / 2;
    ctx.fillStyle = trunkStyle;
    ctx.fillRect(cx - 5, h * 0.86, 10, h * 0.14);
    for (let i = 0; i < tiers; i++) {
      const t = i / (tiers - 1);
      const y = h * 0.95 - t * h * 0.9;
      const half = halfBase * (1 - t) * (0.9 + rnd() * 0.2) + 5;
      const tierH = (h * 0.9) / tiers;
      ctx.fillStyle = farTone(band(t, (rnd() - 0.5) * 0.1), (rnd() - 0.5) * 0.06);
      ctx.beginPath();
      ctx.moveTo(cx, y - tierH * 2.2);
      const n = 12;
      for (let k = 0; k <= n; k++) {
        const u = k / n;
        const px = cx - half + u * half * 2;
        const droop = Math.abs(u - 0.5) * 2;
        const py = y + droop * tierH * 1.2 + noise3(px / 9 + seed, y / 9, seed, 31) * tierH * 0.9;
        ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
  };
  conifer(2, 76, 22, 70);
  conifer(3, 56, 28, 90);

  // ---- bare tree: trunk and recursive branches, a few last leaves
  {
    const cell = 4;
    const x0 = cell * FAR_CELL_W;
    const cx = x0 + FAR_CELL_W / 2;
    ctx.strokeStyle = 'rgb(118,106,94)';
    ctx.lineCap = 'round';
    const branch = (x: number, y: number, ang: number, len: number, width: number, depth: number) => {
      const ex = x + Math.cos(ang) * len;
      const ey = y + Math.sin(ang) * len;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      if (depth === 0) return;
      const n = 2 + Math.floor(rnd() * 2);
      for (let k = 0; k < n; k++) {
        const t = 0.45 + rnd() * 0.5;
        const bx = x + Math.cos(ang) * len * t;
        const by = y + Math.sin(ang) * len * t;
        branch(bx, by, ang + (rnd() - 0.5) * 1.2, len * (0.5 + rnd() * 0.25), Math.max(1, width * 0.6), depth - 1);
      }
      branch(ex, ey, ang + (rnd() - 0.5) * 0.6, len * (0.55 + rnd() * 0.2), Math.max(1, width * 0.65), depth - 1);
    };
    branch(cx, h, -Math.PI / 2, h * 0.3, 12, 4);
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = farTone(0.5 + rnd() * 0.4, 0.1);
      raggedBlob(ctx, cx + (rnd() - 0.5) * 200, h * 0.15 + rnd() * h * 0.45, 7 + rnd() * 9, 300 + i, 0.5);
    }
  }
  for (let c = 0; c < FAR_CELLS; c++) erodeCell(ctx, c * FAR_CELL_W, FAR_CELL_W, FAR_CELL_H, 100 + c * 13, rnd);
  return toAtlas(ctx);
}

/**
 * Continuous tree line (alpha), 1024 × 256 tiling along U: a dense wood seen edge-on — solid
 * mid / base tones below a ragged crown line of blobs and conifer spikes, so no horizon shows
 * between the trunks of the billboard rings in front of it.
 */
export function treelineTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 256;
  const ctx = context2d(w, h);
  const rnd = mulberry32(808);
  ctx.clearRect(0, 0, w, h);
  // solid body (base tone) with a mid band above
  ctx.fillStyle = farTone(0.42);
  ctx.fillRect(0, h * 0.55, w, h * 0.45);
  ctx.fillStyle = farTone(0.6);
  ctx.fillRect(0, h * 0.4, w, h * 0.2);
  // crown line: overlapping blobs, wrapped at the sides
  for (let i = 0; i < 110; i++) {
    const x = rnd() * w;
    const y = h * (0.28 + rnd() * 0.22);
    const r = 18 + rnd() * 30;
    ctx.fillStyle = farTone(0.6 + rnd() * 0.35, (rnd() - 0.5) * 0.08);
    for (const ox of [-w, 0, w]) raggedBlob(ctx, x + ox, y, r, 500 + i, 0.4);
  }
  // conifer spikes
  for (let i = 0; i < 26; i++) {
    const x = rnd() * w;
    const top = h * (0.05 + rnd() * 0.2);
    const half = 12 + rnd() * 14;
    ctx.fillStyle = farTone(0.55 + rnd() * 0.3);
    for (const ox of [-w, 0, w]) {
      ctx.beginPath();
      ctx.moveTo(x + ox, top);
      for (let k = 1; k <= 8; k++) {
        const t = k / 8;
        ctx.lineTo(x + ox + half * t * (1 + (rnd() - 0.5) * 0.3), top + (h * 0.5 - top) * t);
      }
      for (let k = 8; k >= 1; k--) {
        const t = k / 8;
        ctx.lineTo(x + ox - half * t * (1 + (rnd() - 0.5) * 0.3), top + (h * 0.5 - top) * t);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(ctx.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------------------------
// Lawn variation: blurred value noise as aoMap (37 m) + a warm-green irradiance lightMap (9 m),
// both seamless and sampled through the metre UVs (channel 0); a 0.3 m blade-grain tile that
// modulates albedo and roughness so the first 3 m carry 3–5 mm grain.
// ---------------------------------------------------------------------------------------------

/** Seamless blurred value noise in [lo, hi] (grey), `size` px. */
function noiseCanvas(size: number, cells: number, seed: number, lo: number, hi: number, tint: [number, number, number]): CanvasRenderingContext2D {
  const rnd = mulberry32(seed);
  const lattice: number[] = [];
  for (let i = 0; i < cells * cells; i++) lattice.push(rnd());
  const at = (i: number, j: number) => lattice[((j + cells) % cells) * cells + ((i + cells) % cells)];
  const ctx = context2d(size, size);
  const img = ctx.createImageData(size, size);
  const sm = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells;
      const fy = (y / size) * cells;
      const i = Math.floor(fx);
      const j = Math.floor(fy);
      const tx = sm(fx - i);
      const ty = sm(fy - j);
      const v = (at(i, j) * (1 - tx) + at(i + 1, j) * tx) * (1 - ty) + (at(i, j + 1) * (1 - tx) + at(i + 1, j + 1) * tx) * ty;
      const k = lo + (hi - lo) * v;
      const o = (y * size + x) * 4;
      img.data[o] = Math.round(255 * k * tint[0]);
      img.data[o + 1] = Math.round(255 * k * tint[1]);
      img.data[o + 2] = Math.round(255 * k * tint[2]);
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return ctx;
}

export interface LawnMacroTextures {
  /** Occlusion-style brightness variation, 0.72..1, 37 m per tile. */
  aoMap: THREE.CanvasTexture;
  /** Warm-green irradiance patches, 9 m per tile. */
  lightMap: THREE.CanvasTexture;
  /** Blade grain, 0.3 m per tile (grey, mean ≈ 0.5). */
  blade: THREE.CanvasTexture;
}

/** Blade grain: ~2000 short near-vertical strokes of random brightness over mid grey, wrapped. */
function bladeCanvas(size: number): CanvasRenderingContext2D {
  const ctx = context2d(size, size);
  const rnd = mulberry32(4711);
  ctx.fillStyle = grey(118);
  ctx.fillRect(0, 0, size, size);
  ctx.lineCap = 'round';
  for (let i = 0; i < 2200; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const len = 6 + rnd() * 16;
    const a = -Math.PI / 2 + (rnd() - 0.5) * 1.1;
    const v = 60 + rnd() * 160;
    ctx.strokeStyle = grey(v);
    ctx.lineWidth = 1.2 + rnd() * 2.2;
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const px = x + ox;
        const py = y + oy;
        if (px < -len || px > size + len || py < -len || py > size + len) continue;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len);
        ctx.stroke();
      }
    }
  }
  return ctx;
}

export function lawnMacroTextures(): LawnMacroTextures {
  const ao = toTexture(noiseCanvas(64, 5, 913, 0.72, 1.0, [1, 1, 1]), 37, false, 4);
  const light = toTexture(noiseCanvas(64, 6, 517, 0.0, 1.0, [0.85, 0.95, 0.6]), 9, true, 4);
  const blade = toTexture(bladeCanvas(256), 0.3, false, 16);
  ao.channel = 0;
  light.channel = 0;
  return { aoMap: ao, lightMap: light, blade };
}
