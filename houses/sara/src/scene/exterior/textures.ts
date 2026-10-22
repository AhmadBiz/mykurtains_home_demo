/**
 * Procedural CanvasTextures for the exterior (no network assets). Every texture tiles seamlessly
 * (RepeatWrapping) and is deterministic (seeded PRNG), so the scene looks the same on every load.
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

function context2d(size: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  return ctx;
}

function toTexture(ctx: CanvasRenderingContext2D, repeat: [number, number], anisotropy: number): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(ctx.canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy; // three clamps this to the device maximum
  tex.needsUpdate = true;
  return tex;
}

/** Filled disc drawn with wrap-around copies so the tile stays seamless. */
function wrappedDisc(ctx: CanvasRenderingContext2D, size: number, x: number, y: number, r: number): void {
  for (const dx of [-size, 0, size]) {
    for (const dy of [-size, 0, size]) {
      const cx = x + dx;
      const cy = y + dy;
      if (cx + r < 0 || cx - r > size || cy + r < 0 || cy - r > size) continue;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export interface NoiseTextureOptions {
  size?: number;
  base: string;
  tints: string[];
  count: number;
  minRadius: number;
  maxRadius: number;
  alpha: number;
  seed: number;
  /** Single-pixel grey speckles (count) and their alpha. */
  speckles?: number;
  speckleAlpha?: number;
  repeat: [number, number];
  anisotropy?: number;
}

/** Soft blotchy noise: a base colour plus many translucent discs in a few tints. */
export function noiseTexture(o: NoiseTextureOptions): THREE.CanvasTexture {
  const size = o.size ?? 256;
  const ctx = context2d(size);
  const rnd = mulberry32(o.seed);
  ctx.fillStyle = o.base;
  ctx.fillRect(0, 0, size, size);
  ctx.globalAlpha = o.alpha;
  for (let i = 0; i < o.count; i++) {
    ctx.fillStyle = o.tints[Math.floor(rnd() * o.tints.length)];
    const r = o.minRadius + rnd() * (o.maxRadius - o.minRadius);
    wrappedDisc(ctx, size, rnd() * size, rnd() * size, r);
  }
  if (o.speckles) {
    ctx.globalAlpha = o.speckleAlpha ?? 0.2;
    for (let i = 0; i < o.speckles; i++) {
      const v = Math.floor(rnd() * 255);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(Math.floor(rnd() * size), Math.floor(rnd() * size), 1, 1);
    }
  }
  ctx.globalAlpha = 1;
  return toTexture(ctx, o.repeat, o.anisotropy ?? 4);
}

/** Charcoal asphalt shingles: staggered rows with a shadow line under each course + granules. */
export function shingleTexture(repeat: [number, number]): THREE.CanvasTexture {
  const size = 256;
  const ctx = context2d(size);
  const rnd = mulberry32(1234);
  const rowH = 32; // 8 courses per tile
  const shW = 64; // 4 shingles per course
  ctx.fillStyle = '#2b2c2f';
  ctx.fillRect(0, 0, size, size);
  for (let row = 0; row < size / rowH; row++) {
    const off = row % 2 === 0 ? 0 : shW / 2;
    const y = row * rowH;
    for (let k = -1; k <= size / shW; k++) {
      const x = k * shW + off;
      const v = 52 + Math.floor(rnd() * 20);
      ctx.fillStyle = `rgb(${v},${v + 1},${v + 3})`;
      ctx.fillRect(x + 1, y, shW - 2, rowH - 3);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, y + rowH - 3, size, 3);
  }
  ctx.globalAlpha = 0.22;
  for (let i = 0; i < 2500; i++) {
    const g = 80 + Math.floor(rnd() * 110);
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.fillRect(Math.floor(rnd() * size), Math.floor(rnd() * size), 1, 1);
  }
  ctx.globalAlpha = 1;
  return toTexture(ctx, repeat, 8);
}

export interface PlankTextureOptions {
  /** Base RGB (0..255). */
  base: [number, number, number];
  /** Per-plank brightness variation, 0..1. */
  variation: number;
  /** Planks across one tile (stripes along the texture's V axis). */
  planks: number;
  /** Gap between planks in pixels. */
  gap: number;
  seed: number;
  repeat: [number, number];
  /** Grain lines per plank. */
  grain?: number;
}

/** Wood / composite boards: vertical stripes with gaps, slight colour variation and grain. */
export function plankTexture(o: PlankTextureOptions): THREE.CanvasTexture {
  const size = 256;
  const ctx = context2d(size);
  const rnd = mulberry32(o.seed);
  ctx.fillStyle = '#1e1a16';
  ctx.fillRect(0, 0, size, size);
  const w = size / o.planks;
  for (let p = 0; p < o.planks; p++) {
    const d = (rnd() - 0.5) * 2 * o.variation;
    const rgb = o.base.map((c) => Math.max(0, Math.min(255, Math.round(c * (1 + d)))));
    ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    ctx.fillRect(p * w + o.gap / 2, 0, w - o.gap, size);
    const lines = o.grain ?? 6;
    for (let i = 0; i < lines; i++) {
      const gx = p * w + o.gap / 2 + 1 + rnd() * (w - o.gap - 2);
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.08)';
      ctx.fillRect(Math.floor(gx), 0, 1, size);
    }
  }
  return toTexture(ctx, o.repeat, 8);
}

export function lawnTexture(): THREE.CanvasTexture {
  return noiseTexture({
    size: 512,
    base: '#6f9a4e',
    tints: ['#628c43', '#7aa455', '#5e8540', '#86ad5c', '#6a9449'],
    count: 1400,
    minRadius: 3,
    maxRadius: 42,
    alpha: 0.18,
    seed: 11,
    speckles: 6000,
    speckleAlpha: 0.08,
    repeat: [40, 40],
    anisotropy: 8,
  });
}

export function asphaltTexture(repeat: [number, number]): THREE.CanvasTexture {
  return noiseTexture({
    base: '#8f8f8b',
    tints: ['#85857f', '#9a9a95', '#7f7f7a'],
    count: 500,
    minRadius: 2,
    maxRadius: 18,
    alpha: 0.2,
    seed: 23,
    speckles: 5000,
    speckleAlpha: 0.15,
    repeat,
    anisotropy: 8,
  });
}

export function concreteTexture(repeat: [number, number]): THREE.CanvasTexture {
  return noiseTexture({
    base: '#cbc8c0',
    tints: ['#c2bfb7', '#d3d0c8', '#bdbab2'],
    count: 400,
    minRadius: 3,
    maxRadius: 24,
    alpha: 0.22,
    seed: 37,
    speckles: 3000,
    speckleAlpha: 0.1,
    repeat,
  });
}

export function leafTexture(repeat: [number, number]): THREE.CanvasTexture {
  return noiseTexture({
    base: '#3f6b3a',
    tints: ['#4a7a42', '#365f33', '#558a4a', '#2f5430'],
    count: 1600,
    minRadius: 2,
    maxRadius: 7,
    alpha: 0.55,
    seed: 53,
    repeat,
  });
}
