/**
 * Small procedural CanvasTextures for painted trim details that the texture pack does not cover
 * (soffit boards, vented soffit panels). Every texture tiles seamlessly (RepeatWrapping), is at
 * most 512 px and is deterministic (seeded PRNG). All return UV-in-metres textures: the caller's
 * geometry carries metre UVs and `repeat` is 1 / tile.
 */
import * as THREE from 'three';

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

function toTexture(ctx: CanvasRenderingContext2D, tile: number, color: boolean, anisotropy = 8): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(ctx.canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / tile, 1 / tile);
  tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = anisotropy; // three clamps this to the device maximum
  tex.needsUpdate = true;
  return tex;
}

export interface TrimTexture {
  map: THREE.CanvasTexture;
  /** Metres per tile (the map's repeat is already 1 / tile). */
  tile: number;
}

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

// ---------------------------------------------------------------------------------------------
// Foliage textures (finding 1 / 4 / 5 / 6): the solid canopies carry a tileable leaf-speckle
// albedo; the ragged edge comes from alpha-tested cards cut from a cluster atlas. Both are
// drawn in LIGHT tones so the vertex colour of each plant supplies the species albedo.
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
 * Seamless leaf speckle, 12 cm per tile: hundreds of small overlapping leaves over a shaded
 * ground, wrapped at the edges. Tinted by the canopy's vertex colour; tiled through the
 * cylindrical metre UVs of the blobs.
 */
export function leafSpeckleTexture(): TrimTexture {
  const size = 256;
  const tile = 0.12;
  const ctx = context2d(size, size);
  const rnd = mulberry32(2024);
  ctx.fillStyle = 'rgb(138,150,110)';
  ctx.fillRect(0, 0, size, size);
  const leaves = 520;
  for (let i = 0; i < leaves; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const len = 14 + rnd() * 16;
    const wid = len * (0.28 + rnd() * 0.14);
    const a = rnd() * Math.PI * 2;
    // deeper leaves first (darker), the last ones lit
    ctx.fillStyle = leafTone(rnd, 1 - i / leaves);
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        if (x + ox < -len || x + ox > size + len || y + oy < -len || y + oy > size + len) continue;
        leafPath(ctx, x + ox, y + oy, len, wid, a);
        ctx.fill();
      }
    }
  }
  return { map: toTexture(ctx, tile, true, 16), tile };
}

/**
 * Card atlas (alpha): left half a broadleaf cluster (~40 leaves fanning from the centre), right
 * half a conifer frond (a stem with short needles). Transparent background, alphaTest 0.5.
 */
export function leafCardTexture(): THREE.CanvasTexture {
  const size = 256;
  const ctx = context2d(size * 2, size);
  const rnd = mulberry32(77);
  ctx.clearRect(0, 0, size * 2, size);
  // ---- broadleaf cluster
  const cx = size / 2;
  const cy = size / 2;
  for (let i = 0; i < 44; i++) {
    const a = rnd() * Math.PI * 2;
    const d = rnd() * size * 0.32;
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d;
    const len = 24 + rnd() * 18;
    const wid = len * (0.3 + rnd() * 0.12);
    ctx.fillStyle = leafTone(rnd, 0.6 - (i / 44) * 0.6);
    leafPath(ctx, x, y, len, wid, a + (rnd() - 0.5) * 0.8);
    ctx.fill();
  }
  // ---- conifer frond: a stem across the tile with two layers of needles both sides, dense enough
  // to survive the 0.5 alpha test as a fluffy branch rather than a few hairs
  const x0 = size + 14;
  const x1 = size * 2 - 14;
  ctx.lineCap = 'round';
  for (const [width, pitch, reachK, shade] of [
    [5, 3.2, 1, 0.45],
    [3.5, 2.6, 0.8, 0.1],
  ]) {
    ctx.lineWidth = width;
    for (let x = x0 + 6; x < x1 - 4; x += pitch) {
      const t = (x - x0) / (x1 - x0);
      const reach = 54 * reachK * (1 - t * 0.5) * (0.75 + rnd() * 0.25);
      for (const s of [-1, 1]) {
        ctx.strokeStyle = leafTone(rnd, shade + rnd() * 0.25);
        ctx.beginPath();
        ctx.moveTo(x, cy + s * 2);
        ctx.lineTo(x + 12 + rnd() * 8, cy + s * reach);
        ctx.stroke();
      }
    }
  }
  ctx.strokeStyle = 'rgb(150,126,96)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x0, cy);
  ctx.lineTo(x1, cy);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(ctx.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Distant tree silhouettes for the horizon billboards: a round crown and a conifer, each
 * 256 × 512 of a 512 × 512 atlas, shaded darker at the base. Drawn in LIGHT desaturated tones
 * (average ≈ 0.4 linear); the material colour supplies the distant-foliage albedo.
 */
export function farTreeTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 512;
  const ctx = context2d(w, h);
  const rnd = mulberry32(303);
  ctx.clearRect(0, 0, w, h);
  const tone = (k: number) => `rgb(${Math.round(150 * k)},${Math.round(176 * k)},${Math.round(134 * k)})`;
  // ---- round crown: ~70 overlapping discs, the top ones lighter
  const trunkX = 128;
  ctx.fillStyle = 'rgb(120,104,88)';
  ctx.fillRect(trunkX - 7, h * 0.72, 14, h * 0.28);
  for (let i = 0; i < 70; i++) {
    const t = i / 70;
    const a = rnd() * Math.PI * 2;
    const d = rnd() * 72;
    const x = trunkX + Math.cos(a) * d * 1.15;
    const y = h * 0.42 + Math.sin(a) * d - t * 30;
    const r = 34 + rnd() * 30;
    ctx.fillStyle = tone(0.55 + t * 0.6);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // ---- conifer: stacked drooping tiers
  const cx = 384;
  ctx.fillStyle = 'rgb(120,104,88)';
  ctx.fillRect(cx - 6, h * 0.84, 12, h * 0.16);
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    const y = h * 0.94 - t * h * 0.86;
    const half = 100 * (1 - t) + 6;
    ctx.fillStyle = tone(0.5 + t * 0.6);
    ctx.beginPath();
    ctx.moveTo(cx, y - 60);
    for (let k = 0; k <= 10; k++) {
      const u = k / 10;
      ctx.lineTo(cx - half + u * half * 2, y + Math.sin(u * Math.PI * 5) * 9 + (rnd() - 0.5) * 8);
    }
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(ctx.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------------------------
// Lawn macro variation (finding 2): blurred value noise as aoMap (37 m) + a yellow-green
// scorched-patch lightMap (9 m), both seamless and sampled through the metre UVs (channel 0).
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
  /** Warm (yellow-green) irradiance patches, 9 m per tile. */
  lightMap: THREE.CanvasTexture;
}

export function lawnMacroTextures(): LawnMacroTextures {
  const ao = toTexture(noiseCanvas(64, 5, 913, 0.72, 1.0, [1, 1, 1]), 37, false, 4);
  const light = toTexture(noiseCanvas(64, 6, 517, 0.0, 1.0, [0.95, 0.9, 0.45]), 9, true, 4);
  ao.channel = 0;
  light.channel = 0;
  return { aoMap: ao, lightMap: light };
}
