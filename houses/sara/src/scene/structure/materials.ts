import * as THREE from 'three';
import { K } from './keys';

/**
 * Procedural materials for the structure. Everything is generated on a 2D canvas at first use
 * (no network assets) and cached for the lifetime of the app. Textures tile in WORLD metres: the
 * geometry writes UVs in metres and each texture's `repeat` is 1 / its physical size.
 */

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

/** Deterministic PRNG (mulberry32) so the facade looks the same on every load. */
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

const tmpColor = new THREE.Color();
/** CSS colour string = hex shifted in lightness by `dl` (-1..1). */
function shade(hex: string, dl: number): string {
  tmpColor.set(hex).offsetHSL(0, 0, dl);
  return tmpColor.getStyle();
}

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number, sx: number, sy: number) => void;

/**
 * Builds a repeating CanvasTexture covering `widthM × heightM` metres. `sx` / `sy` passed to the
 * drawer are pixels per metre. Falls back to a 1×1 texture when 2D canvas is unavailable.
 */
function makeTexture(px: number, py: number, widthM: number, heightM: number, draw: Draw): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = py;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx, px, py, px / widthM, py / heightM);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / widthM, 1 / heightM);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/** Fills a rect given in metres, wrapping horizontally so planks / bricks tile seamlessly. */
function fillWrap(ctx: CanvasRenderingContext2D, widthM: number, x: number, y: number, w: number, h: number, sx: number, sy: number): void {
  for (const off of [-widthM, 0, widthM]) {
    const x0 = x + off;
    if (x0 + w <= 0 || x0 >= widthM) continue;
    ctx.fillRect(x0 * sx, y * sy, w * sx, h * sy);
  }
}

// ---------------------------------------------------------------------------------------------
// Texture generators
// ---------------------------------------------------------------------------------------------

const BRICK_W = 1.05; // 5 bricks of 0.21 pitch
const BRICK_H = 0.6; // 8 courses of 0.075 pitch
function drawBrick(ctx: CanvasRenderingContext2D, w: number, h: number, sx: number, sy: number): void {
  const r = rng(11);
  const pitch = 0.21;
  const course = 0.075;
  const mortar = 0.01;
  const palette = ['#9d4f3b', '#a85a45', '#8e4535', '#b2654e', '#96513e', '#a3624c', '#8a4232', '#ad5d47'];
  ctx.fillStyle = '#d8d1c4';
  ctx.fillRect(0, 0, w, h);
  const rows = Math.round(BRICK_H / course);
  const cols = Math.round(BRICK_W / pitch);
  const bw = pitch - mortar;
  const bh = course - mortar;
  for (let row = 0; row < rows; row++) {
    const offset = row % 2 ? pitch / 2 : 0;
    const y0 = row * course + mortar / 2;
    for (let i = 0; i < cols; i++) {
      // bricks straddling the canvas edge are drawn on both sides in the same colour (seamless tiling)
      const x0 = i * pitch + offset + mortar / 2;
      ctx.fillStyle = shade(palette[Math.floor(r() * palette.length)], (r() - 0.5) * 0.07);
      fillWrap(ctx, BRICK_W, x0, y0, bw, bh, sx, sy);
      ctx.fillStyle = 'rgba(40,20,15,0.16)';
      for (let k = 0; k < 6; k++) {
        fillWrap(ctx, BRICK_W, x0 + r() * bw, y0 + r() * bh, (2 + r() * 5) / sx, (1 + r() * 2) / sy, sx, sy);
      }
      ctx.fillStyle = 'rgba(255,230,210,0.08)';
      fillWrap(ctx, BRICK_W, x0, y0, bw, 2 / sy, sx, sy);
    }
  }
}

const SIDING_W = 1.0;
const SIDING_H = 0.72; // 4 boards of 0.18
function drawSiding(ctx: CanvasRenderingContext2D, w: number, h: number, sx: number, sy: number): void {
  const r = rng(23);
  const board = 0.18;
  ctx.fillStyle = '#cbc6bc';
  ctx.fillRect(0, 0, w, h);
  const n = Math.round(SIDING_H / board);
  for (let b = 0; b < n; b++) {
    const y0 = b * board;
    ctx.fillStyle = shade('#cbc6bc', (r() - 0.5) * 0.05);
    ctx.fillRect(0, y0 * sy, w, board * sy);
    // faint horizontal grain (wrapped so the texture tiles without a seam)
    for (let k = 0; k < 40; k++) {
      ctx.fillStyle = `rgba(90,85,78,${(0.03 + r() * 0.04).toFixed(3)})`;
      fillWrap(ctx, SIDING_W, r() * SIDING_W, y0 + 0.01 + r() * (board - 0.02), (30 + r() * 220) / sx, 1 / sy, sx, sy);
    }
    // shadow cast by the board above onto the top of this board (canvas top = world up)
    const grad = ctx.createLinearGradient(0, y0 * sy, 0, (y0 + 0.025) * sy);
    grad.addColorStop(0, 'rgba(0,0,0,0.38)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y0 * sy, w, 0.025 * sy);
    // lit bottom edge of the board
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(0, (y0 + board) * sy - 2, w, 2);
  }
}

interface PlankStyle {
  widthM: number;
  heightM: number;
  plank: number;
  palette: string[];
  seed: number;
  grain: number;
}

function drawPlanks(style: PlankStyle): Draw {
  return (ctx, w, h, sx, sy) => {
    const r = rng(style.seed);
    ctx.fillStyle = style.palette[0];
    ctx.fillRect(0, 0, w, h);
    const rows = Math.round(style.heightM / style.plank);
    for (let row = 0; row < rows; row++) {
      const y0 = row * style.plank;
      let x = -r() * 0.9;
      while (x < style.widthM) {
        const len = 0.45 + r() * 0.85;
        ctx.fillStyle = shade(style.palette[Math.floor(r() * style.palette.length)], (r() - 0.5) * 0.06);
        fillWrap(ctx, style.widthM, x, y0, len, style.plank, sx, sy);
        // grain lines
        for (let k = 0; k < style.grain; k++) {
          ctx.fillStyle = `rgba(70,45,20,${(0.05 + r() * 0.1).toFixed(3)})`;
          const gy = y0 + 0.004 + r() * (style.plank - 0.008);
          const gx = x + r() * len * 0.5;
          fillWrap(ctx, style.widthM, gx, gy, (0.2 + r() * 0.6) * len, 1 / sy, sx, sy);
        }
        // end joint
        ctx.fillStyle = 'rgba(40,25,10,0.55)';
        fillWrap(ctx, style.widthM, x + len - 1 / sx, y0, 2 / sx, style.plank, sx, sy);
        x += len;
      }
      // seam between plank rows
      ctx.fillStyle = 'rgba(40,25,10,0.45)';
      ctx.fillRect(0, (y0 + style.plank) * sy - 1, w, 1);
    }
  };
}

const HARDWOOD: PlankStyle = {
  widthM: 1.5,
  heightM: 1.0,
  plank: 0.125,
  palette: ['#b8884f', '#c29258', '#ae7c48', '#bd8d55', '#b27f4c', '#c69a62', '#a9794a'],
  seed: 37,
  grain: 12,
};
const LAMINATE: PlankStyle = {
  widthM: 1.3,
  heightM: 0.95,
  plank: 0.19,
  palette: ['#d6bb93', '#cfb389', '#dcc39d', '#d2b68e', '#c9ad84'],
  seed: 51,
  grain: 6,
};

const TILE_W = 1.2;
function drawTile(ctx: CanvasRenderingContext2D, w: number, h: number, sx: number, sy: number): void {
  const r = rng(71);
  const tile = 0.6;
  const grout = 0.006;
  ctx.fillStyle = '#b5b2ac';
  ctx.fillRect(0, 0, w, h);
  const n = Math.round(TILE_W / tile);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x0 = i * tile + grout / 2;
      const y0 = j * tile + grout / 2;
      ctx.fillStyle = shade('#d9d8d4', (r() - 0.5) * 0.03);
      ctx.fillRect(x0 * sx, y0 * sy, (tile - grout) * sx, (tile - grout) * sy);
      for (let k = 0; k < 14; k++) {
        ctx.fillStyle = `rgba(110,110,105,${(0.025 + r() * 0.03).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse((x0 + r() * tile) * sx, (y0 + r() * tile) * sy, 8 + r() * 40, 5 + r() * 25, r() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

const CONCRETE_W = 1.5;
function drawConcrete(ctx: CanvasRenderingContext2D, w: number, h: number, sx: number, sy: number): void {
  const r = rng(97);
  ctx.fillStyle = '#a2a19e';
  ctx.fillRect(0, 0, w, h);
  for (let k = 0; k < 6000; k++) {
    const g = 120 + Math.floor(r() * 90);
    ctx.fillStyle = `rgba(${g},${g},${g - 3},${(0.08 + r() * 0.12).toFixed(3)})`;
    ctx.fillRect(r() * (w - 3), r() * (h - 3), 1 + r() * 2, 1 + r() * 2);
  }
  for (let k = 0; k < 25; k++) {
    ctx.fillStyle = `rgba(60,60,58,${(0.03 + r() * 0.04).toFixed(3)})`;
    fillWrap(ctx, CONCRETE_W, r() * CONCRETE_W, r() * (CONCRETE_W - 0.01), (20 + r() * 160) / sx, (1 + r() * 2) / sy, sx, sy);
  }
}

// ---------------------------------------------------------------------------------------------
// Material cache
// ---------------------------------------------------------------------------------------------

const textures = new Map<string, THREE.Texture>();
function texture(name: string, make: () => THREE.Texture): THREE.Texture {
  let t = textures.get(name);
  if (!t) {
    t = make();
    textures.set(name, t);
  }
  return t;
}

function std(params: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial(params);
}

function createMaterial(key: string): THREE.Material {
  if (key.startsWith('paint:')) return std({ color: key.slice(6), roughness: 0.92 });
  switch (key) {
    case K.brick:
      return std({ map: texture('brick', () => makeTexture(1024, 576, BRICK_W, BRICK_H, drawBrick)), roughness: 0.95 });
    case K.siding:
      return std({ map: texture('siding', () => makeTexture(512, 368, SIDING_W, SIDING_H, drawSiding)), roughness: 0.8 });
    case K.concrete:
      return std({ map: texture('concrete', () => makeTexture(512, 512, CONCRETE_W, CONCRETE_W, drawConcrete)), roughness: 0.95 });
    case K.trim:
      return std({ color: '#f4f2ee', roughness: 0.55 });
    case K.oak:
      return std({ color: '#b5895a', roughness: 0.6 });
    case K.soffit:
      return std({ color: '#e9e6e0', roughness: 0.9 });
    case K.slab:
      return std({ color: '#e4e1db', roughness: 0.9 });
    case K.ceiling:
      return std({ color: '#f7f6f3', roughness: 0.95, side: THREE.FrontSide });
    case 'floor:hardwood':
      return std({ map: texture('hardwood', () => makeTexture(1536, 1024, HARDWOOD.widthM, HARDWOOD.heightM, drawPlanks(HARDWOOD))), roughness: 0.5 });
    case 'floor:laminate':
      return std({ map: texture('laminate', () => makeTexture(1024, 768, LAMINATE.widthM, LAMINATE.heightM, drawPlanks(LAMINATE))), roughness: 0.45 });
    case 'floor:tile':
      return std({ map: texture('tile', () => makeTexture(512, 512, TILE_W, TILE_W, drawTile)), roughness: 0.35 });
    case 'floor:carpet':
      return std({ color: '#8b8985', roughness: 1 });
    case 'floor:concrete':
      return std({ map: texture('concrete', () => makeTexture(512, 512, CONCRETE_W, CONCRETE_W, drawConcrete)), roughness: 0.95 });
    case 'floor:epoxy':
      return std({ color: '#9fa4a8', roughness: 0.3, metalness: 0.05 });
    case K.doorLeaf:
      return std({ color: '#f3f1ec', roughness: 0.5 });
    case K.doorDark:
      return std({ color: '#2f3337', roughness: 0.5 });
    case K.doorGrey:
      return std({ color: '#8a8f94', roughness: 0.55 });
    case K.handle:
      return std({ color: '#3a3a3c', roughness: 0.35, metalness: 0.7 });
    case K.garage:
      return std({ color: '#ece8df', roughness: 0.6 });
    case K.glass:
      return new THREE.MeshPhysicalMaterial({
        color: '#cfe3ee',
        transparent: true,
        opacity: 0.35,
        roughness: 0.08,
        metalness: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
    default:
      return std({ color: '#ff00ff' });
  }
}

const materials = new Map<string, THREE.Material>();

/** Shared material for a bucket key (created on first use; needs a DOM for the canvas textures). */
export function materialFor(key: string): THREE.Material {
  let m = materials.get(key);
  if (!m) {
    m = createMaterial(key);
    materials.set(key, m);
  }
  return m;
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
