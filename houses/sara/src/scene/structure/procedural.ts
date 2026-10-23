import * as THREE from 'three';

/**
 * Procedural CanvasTexture sets for the two surfaces the texture pack does not cover: the painted
 * fibre-cement lap siding of the upper storey and the glazed subway tile of the bathrooms. Each
 * is generated once, lazily, on a square canvas and tiles seamlessly at a real-world size
 * (`metres`), so the structure's world-metre UVs apply unchanged. Every map is deterministic
 * (seeded PRNG) so the house looks the same on every load.
 */

export interface CanvasSet {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  /** Real-world size of one repeat (m). */
  metres: number;
  dispose(): void;
}

/** Deterministic PRNG (mulberry32). */
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

function canvas2d(px: number): CanvasRenderingContext2D | null {
  const c = document.createElement('canvas');
  c.width = px;
  c.height = px;
  return c.getContext('2d');
}

function texture(ctx: CanvasRenderingContext2D | null, metres: number, color: boolean): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(ctx ? ctx.canvas : document.createElement('canvas'));
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / metres, 1 / metres);
  tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function makeSet(a: CanvasRenderingContext2D | null, n: CanvasRenderingContext2D | null, r: CanvasRenderingContext2D | null, metres: number): CanvasSet {
  const set: CanvasSet = {
    map: texture(a, metres, true),
    normalMap: texture(n, metres, false),
    roughnessMap: texture(r, metres, false),
    metres,
    dispose() {
      set.map.dispose();
      set.normalMap.dispose();
      set.roughnessMap.dispose();
    },
  };
  return set;
}

const tmpColor = new THREE.Color();
function shade(hex: string, dl: number): string {
  tmpColor.set(hex).offsetHSL(0, 0, dl);
  return tmpColor.getStyle();
}

const grey = (v: number) => `rgb(${Math.round(v)},${Math.round(v)},${Math.round(v)})`;

// ---------------------------------------------------------------------------------------------
// Lap siding: 0.18 m painted fibre-cement boards, 12 mm shadow lip, semi-matt sheen
// ---------------------------------------------------------------------------------------------

const SIDING_TILE = 0.72; // 4 boards per repeat
const BOARD = 0.18;
const LIP = 0.012;
const SIDING_PX = 512;
const SIDING_COLOR = '#c9c3b7';
/** Painted fibre-cement: semi-matt, the grain streaks modulate it by ±0.1. */
const SIDING_ROUGHNESS = 0.6;

/** Horizontal line wrapped at the tile edge (seamless). */
function hline(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  for (const off of [-SIDING_PX, 0, SIDING_PX]) {
    const x0 = x + off;
    if (x0 + w <= 0 || x0 >= SIDING_PX) continue;
    ctx.fillRect(x0, y, w, h);
  }
}

export function makeSiding(): CanvasSet {
  const s = SIDING_PX / SIDING_TILE; // px per metre
  const boardPx = Math.round(BOARD * s);
  const lipPx = Math.max(3, Math.round(LIP * s));
  const r = rng(4242);

  // ---- albedo + roughness (canvas top = world up); the same grain streaks go on both ----
  const a = canvas2d(SIDING_PX);
  const ro = canvas2d(SIDING_PX);
  if (a && ro) {
    a.fillStyle = SIDING_COLOR;
    a.fillRect(0, 0, SIDING_PX, SIDING_PX);
    ro.fillStyle = grey(SIDING_ROUGHNESS * 255);
    ro.fillRect(0, 0, SIDING_PX, SIDING_PX);
    const boards = Math.round(SIDING_TILE / BOARD);
    for (let b = 0; b < boards; b++) {
      const y0 = b * boardPx;
      const y1 = (b + 1) * boardPx;
      // every board its own batch of paint: ±4.5 % lightness, slightly different sheen
      a.fillStyle = shade(SIDING_COLOR, (r() - 0.5) * 0.09);
      a.fillRect(0, y0, SIDING_PX, y1 - y0);
      ro.fillStyle = grey((SIDING_ROUGHNESS + (r() - 0.5) * 0.06) * 255);
      ro.fillRect(0, y0, SIDING_PX, y1 - y0);
      // wood-grain embossing of the board face
      for (let k = 0; k < 90; k++) {
        const x = r() * SIDING_PX;
        const y = y0 + 2 + r() * (y1 - y0 - lipPx - 4);
        const w = 40 + r() * 260;
        a.fillStyle = `rgba(80,74,66,${(0.03 + r() * 0.05).toFixed(3)})`;
        hline(a, x, y, w, 1);
        ro.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)';
        hline(ro, x, y, w, 1);
      }
      // the lip at the bottom of the board faces down: in shadow, and rougher (unsanded edge)
      a.fillStyle = 'rgba(0,0,0,0.45)';
      a.fillRect(0, y1 - lipPx, SIDING_PX, lipPx);
      ro.fillStyle = 'rgba(255,255,255,0.3)';
      ro.fillRect(0, y1 - lipPx, SIDING_PX, lipPx);
      // soft shadow the lip casts on the top of the board below (which starts at y1, wrapping)
      const shadowPx = Math.round(0.045 * s);
      const yb = y1 % SIDING_PX;
      const grad = a.createLinearGradient(0, yb, 0, yb + shadowPx);
      grad.addColorStop(0, 'rgba(0,0,0,0.4)');
      grad.addColorStop(0.35, 'rgba(0,0,0,0.16)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      a.fillStyle = grad;
      a.fillRect(0, yb, SIDING_PX, shadowPx);
      // lit rounded bottom edge just above the lip
      a.fillStyle = 'rgba(255,255,255,0.22)';
      a.fillRect(0, y1 - lipPx - 1, SIDING_PX, 1);
    }
  }

  // ---- tangent-space normal map (OpenGL convention: green = +V = up) ----
  const n = canvas2d(SIDING_PX);
  if (n) {
    const img = n.createImageData(SIDING_PX, SIDING_PX);
    const d = img.data;
    const tilt = Math.sin((7 * Math.PI) / 180); // board face leans out at the bottom
    const faceG = Math.round(128 + tilt * 127);
    const faceB = Math.round(128 + Math.cos((7 * Math.PI) / 180) * 127);
    const lipG = Math.round(128 - 0.86 * 127);
    const lipB = Math.round(128 + 0.51 * 127);
    const grain = rng(99);
    for (let y = 0; y < SIDING_PX; y++) {
      const inBoard = y % boardPx;
      const isLip = inBoard >= boardPx - lipPx;
      for (let x = 0; x < SIDING_PX; x++) {
        const i = (y * SIDING_PX + x) * 4;
        const jitter = Math.round((grain() - 0.5) * 6);
        d[i] = 128 + jitter;
        d[i + 1] = isLip ? lipG : faceG + Math.round((grain() - 0.5) * 4);
        d[i + 2] = isLip ? lipB : faceB;
        d[i + 3] = 255;
      }
    }
    n.putImageData(img, 0, 0);
  }

  return makeSet(a, n, ro, SIDING_TILE);
}

// ---------------------------------------------------------------------------------------------
// Glazed subway tile: 30 × 10 cm running bond, 3 mm grout, cushioned edges
// ---------------------------------------------------------------------------------------------

const TILE_REPEAT = 0.6; // 2 tiles × 6 courses per repeat
const TILE_W = 0.3;
const TILE_H = 0.1;
const GROUT = 0.003;
/** Width of the rounded (cushion) edge of every tile, and its drop in mm. */
const CUSHION = 0.008;
const CUSHION_DROP = 1.2;
const TILE_PX = 1024;
const TILE_RGB: [number, number, number] = [0xf1, 0xf1, 0xee];
const GROUT_RGB: [number, number, number] = [0xc9, 0xc7, 0xc0];
const TILE_ROUGHNESS = 0.28;
const GROUT_ROUGHNESS = 0.9;

/** Small deterministic hash → [0, 1) for a per-tile value. */
function hash(a: number, b: number, salt: number): number {
  let h = (a * 374761393 + b * 668265263 + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function makeSubwayTile(): CanvasSet {
  const px = TILE_PX;
  const s = px / TILE_REPEAT; // px per metre
  const mmPerPx = 1000 / s;
  const tileW = TILE_W * s;
  const tileH = TILE_H * s;
  const halfGroutMm = (GROUT / 2) * 1000;
  const cushionMm = CUSHION * 1000;
  const r = rng(7331);

  // height field (mm) + per-pixel tile id (-1 = grout)
  const h = new Float32Array(px * px);
  const tile = new Int16Array(px * px);
  for (let y = 0; y < px; y++) {
    const row = Math.floor(y / tileH);
    const off = (row % 2) * (tileW / 2);
    const v = y - row * tileH;
    for (let x = 0; x < px; x++) {
      const xx = x + off;
      const col = Math.floor(xx / tileW) % 2;
      const u = xx - Math.floor(xx / tileW) * tileW;
      const d = Math.min(u, tileW - u, v, tileH - v) * mmPerPx - halfGroutMm;
      const i = y * px + x;
      if (d <= 0) {
        h[i] = 0;
        tile[i] = -1;
      } else {
        h[i] = CUSHION_DROP * Math.sin((Math.min(d, cushionMm) / cushionMm) * (Math.PI / 2));
        tile[i] = row * 2 + col;
      }
    }
  }

  const a = canvas2d(px);
  const n = canvas2d(px);
  const ro = canvas2d(px);
  if (a && n && ro) {
    const ia = a.createImageData(px, px);
    const inn = n.createImageData(px, px);
    const ir = ro.createImageData(px, px);
    const da = ia.data;
    const dn = inn.data;
    const dr = ir.data;
    for (let y = 0; y < px; y++) {
      const ym = (y + px - 1) % px;
      const yp = (y + 1) % px;
      for (let x = 0; x < px; x++) {
        const i = y * px + x;
        const o = i * 4;
        const t = tile[i];
        const noise = r() - 0.5;
        // tangent-space normal from the height gradient (+V is up = canvas -y), plus a tiny
        // random tilt per tile so the glaze reflects a little differently on every tile
        const dhdx = (h[y * px + ((x + 1) % px)] - h[y * px + ((x + px - 1) % px)]) / (2 * mmPerPx);
        const dhdy = (h[yp * px + x] - h[ym * px + x]) / (2 * mmPerPx);
        let nx = -dhdx;
        let ny = dhdy;
        if (t >= 0) {
          nx += (hash(t, 1, 11) - 0.5) * 0.03;
          ny += (hash(t, 2, 11) - 0.5) * 0.03;
        }
        const len = Math.hypot(nx, ny, 1);
        dn[o] = Math.round(128 + (nx / len) * 127);
        dn[o + 1] = Math.round(128 + (ny / len) * 127);
        dn[o + 2] = Math.round(128 + (1 / len) * 127);
        dn[o + 3] = 255;
        if (t >= 0) {
          const tint = 1 + (hash(t, 3, 11) - 0.5) * 0.04 + noise * 0.015;
          da[o] = Math.min(255, Math.round(TILE_RGB[0] * tint));
          da[o + 1] = Math.min(255, Math.round(TILE_RGB[1] * tint));
          da[o + 2] = Math.min(255, Math.round(TILE_RGB[2] * tint * (1 - (hash(t, 4, 11) - 0.5) * 0.02)));
          const rough = TILE_ROUGHNESS + (hash(t, 5, 11) - 0.5) * 0.08 + noise * 0.03;
          dr[o] = dr[o + 1] = dr[o + 2] = Math.round(rough * 255);
        } else {
          const g = 1 + noise * 0.12;
          da[o] = Math.round(GROUT_RGB[0] * g);
          da[o + 1] = Math.round(GROUT_RGB[1] * g);
          da[o + 2] = Math.round(GROUT_RGB[2] * g);
          dr[o] = dr[o + 1] = dr[o + 2] = Math.round((GROUT_ROUGHNESS + noise * 0.08) * 255);
        }
        da[o + 3] = 255;
        dr[o + 3] = 255;
      }
    }
    a.putImageData(ia, 0, 0);
    n.putImageData(inn, 0, 0);
    ro.putImageData(ir, 0, 0);
  }

  return makeSet(a, n, ro, TILE_REPEAT);
}
