/**
 * Trees (bark trunks with branches; crowns of noise-deformed overlapping sub-blobs under a shell
 * of alpha-tested leaf-cluster cards), conifers (one continuous jagged cone with drooping tiers
 * and needle-frond cards), shrubs and the clipped street hedge (lumpy plants with leaf cards),
 * a horizon tree line of crossed billboards on the rolling far lawn, field stones sunk in the
 * grade, a mailbox by the driveway and the plank fence on the property lines.
 *
 * Foliage is FOUR merged geometries (solid cores, cards, trunks, billboards), the rocks two, the
 * fence two. All relief is 3D value noise sampled in WORLD space (noise.ts) so overlapping blobs
 * agree where they meet. Keep-out zones: house footprint X -1.1..13.1 / Z -0.1..10.2 (+ beds),
 * driveway, walkway, street.
 */
import * as THREE from 'three';
import { useMemo } from 'react';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COLORS, GRADE_Y, RAMPS, STREET } from './data';
import { TriangleSoup, UP, cylinderBetween, gridSurface, mergeAll, metreBox, metreRoundedBox, place } from './geom';
import type { Vec2, Vec3 } from './geom';
import { mulberry32 } from './textures';
import { canopyOctaves, fbm3, noise3 } from './noise';
import type { Octave } from './noise';
import { LAWN_CX, LAWN_CZ, lawnHeightAt } from './terrain';
import { useDispose } from './hooks';
import { LEAF_MAP_GAIN, PLANK_TILE, useBark, useBlackMetal, useFarTrees, useLeaf, useLeafCards, useMulch, usePlanks, useRock } from './materials';
import { usePbr } from '../materials';

export function Landscaping() {
  return (
    <group name="landscaping">
      <Foliage />
      <FarTrees />
      <Rocks />
      <Mailbox />
      <Fence />
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Foliage builders
// ---------------------------------------------------------------------------------------------
type Rnd = () => number;
const tmpColor = new THREE.Color();
const UP_V = new THREE.Vector3(0, 1, 0);
const X_V = new THREE.Vector3(1, 0, 0);
const vP = new THREE.Vector3();
const vN = new THREE.Vector3();
const vU = new THREE.Vector3();
const vV = new THREE.Vector3();
const vT = new THREE.Vector3();
const vD = new THREE.Vector3();

/** Species tones for one plant: offsetHSL(±0.03, ±0.10, ±0.07), pre-multiplied by the leaf-map gain. */
function tones(dark: string, light: string, rnd: Rnd): [THREE.Color, THREE.Color] {
  const h = (rnd() - 0.5) * 0.06;
  const s = (rnd() - 0.5) * 0.2;
  const l = (rnd() - 0.5) * 0.14;
  const mk = (hex: string) => new THREE.Color(hex).offsetHSL(h, s, l).multiplyScalar(LEAF_MAP_GAIN);
  return [mk(dark), mk(light)];
}

interface Shade {
  dark: THREE.Color;
  light: THREE.Color;
  /** World Y under which the crown darkens (self-occlusion), over `aoDepth` metres, to 0.6×. */
  aoY: number;
  aoDepth: number;
  /** Scale of the slow colour noise across the plant (its crown radius). */
  R: number;
  seed: number;
}

/** Colour of a foliage vertex / card: the species tones mixed by height and a slow colour noise, darkened below aoY. */
function leafColor(out: THREE.Color, s: Shade, wx: number, wy: number, wz: number, tHeight: number): THREE.Color {
  const f = 1 / (0.5 * s.R);
  const cn = (noise3(wx * f, wy * f, wz * f, s.seed + 900) + 1) / 2;
  const mix = THREE.MathUtils.clamp(0.15 + 0.5 * tHeight + 0.35 * cn, 0, 1);
  out.copy(s.dark).lerp(s.light, mix);
  if (wy < s.aoY) out.multiplyScalar(1 - 0.4 * THREE.MathUtils.clamp((s.aoY - wy) / s.aoDepth, 0, 1));
  return out;
}

/** Uniform random unit vector. */
function randomDir(rnd: Rnd, out: THREE.Vector3): THREE.Vector3 {
  const z = rnd() * 2 - 1;
  const a = rnd() * Math.PI * 2;
  const r = Math.sqrt(1 - z * z);
  return out.set(Math.cos(a) * r, z, Math.sin(a) * r);
}

interface BlobSpec {
  /** Undeformed radius and vertical squash. */
  r: number;
  sy: number;
  detail: number;
  centre: Vec3;
  /** Relief octaves in metres (world space). */
  octaves: Octave[];
  shade: Shade;
}

/**
 * One foliage lump: an icosahedron whose vertices are pushed radially by world-space noise
 * (smooth normals, so no facets), coloured by leafColor(), with cylindrical metre UVs for the
 * leaf speckle map.
 */
function blob(b: BlobSpec): THREE.BufferGeometry {
  const raw = new THREE.IcosahedronGeometry(b.r, b.detail);
  raw.deleteAttribute('uv'); // the seamed UVs would stop the seam vertices from merging and tear the surface
  const g = mergeVertices(raw);
  raw.dispose();
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i) * b.sy;
    const z = pos.getZ(i);
    const n = fbm3(b.centre[0] + x, b.centre[1] + y, b.centre[2] + z, b.octaves, b.shade.seed);
    const k = Math.max(0.4, 1 + n / b.r);
    const px = x * k;
    const py = y * k;
    const pz = z * k;
    pos.setXYZ(i, px, py, pz);
    const t = THREE.MathUtils.clamp((y / (b.r * b.sy) + 1) / 2, 0, 1);
    leafColor(tmpColor, b.shade, b.centre[0] + px, b.centre[1] + py, b.centre[2] + pz, t);
    col[i * 3] = tmpColor.r;
    col[i * 3 + 1] = tmpColor.g;
    col[i * 3 + 2] = tmpColor.b;
    uv[i * 2] = Math.atan2(pz, px) * b.r;
    uv[i * 2 + 1] = b.centre[1] + py;
  }
  pos.needsUpdate = true;
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return place(g, b.centre);
}

// ---- cards (alpha-tested quads): atlas u ranges of the two cluster types
const ATLAS: Record<'leaf' | 'needle', Vec2> = { leaf: [0, 0.5], needle: [0.5, 1] };

/** A card centred at p with in-plane axes u (atlas u, width w) and v (atlas v, height h); lit along u × v. */
function addCardUV(soup: TriangleSoup, p: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, w: number, h: number, kind: 'leaf' | 'needle', c: THREE.Color): void {
  vN.crossVectors(u, v).normalize();
  const ax = u.x * w * 0.5;
  const ay = u.y * w * 0.5;
  const az = u.z * w * 0.5;
  const bx = v.x * h * 0.5;
  const by = v.y * h * 0.5;
  const bz = v.z * h * 0.5;
  const [u0, u1] = ATLAS[kind];
  soup.setColor(c.r, c.g, c.b);
  soup.quadUV(
    [p.x - ax - bx, p.y - ay - by, p.z - az - bz],
    [p.x + ax - bx, p.y + ay - by, p.z + az - bz],
    [p.x + ax + bx, p.y + ay + by, p.z + az + bz],
    [p.x - ax + bx, p.y - ay + by, p.z - az + bz],
    [u0, 0],
    [u1, 0],
    [u1, 1],
    [u0, 1],
    [vN.x, vN.y, vN.z],
  );
}

/** A leaf-cluster card facing `n` (unit), spun by `spin` in its plane. */
function addLeafCard(soup: TriangleSoup, p: THREE.Vector3, n: THREE.Vector3, size: number, spin: number, c: THREE.Color): void {
  const helper = Math.abs(n.y) < 0.9 ? UP_V : X_V;
  vT.crossVectors(helper, n).normalize();
  vV.crossVectors(n, vT).normalize();
  const cs = Math.cos(spin);
  const sn = Math.sin(spin);
  vU.copy(vT).multiplyScalar(cs).addScaledVector(vV, sn);
  vV.crossVectors(n, vU).normalize();
  addCardUV(soup, p, vU, vV, size, size, 'leaf', c);
}

interface Sink {
  solid: THREE.BufferGeometry[];
  trunks: THREE.BufferGeometry[];
  cards: TriangleSoup;
}

interface Lump {
  c: Vec3;
  r: number;
  sy: number;
}

interface CrownOptions {
  lumps: Lump[];
  octaves: Octave[];
  shade: Shade;
  detail: number;
  cards: number;
  /** Card size (m) and how far outside the lump surface the cards sit. */
  cardSize: number;
  cardOut: number;
  /** Cards below this world Y are dropped (buried in the bed / under the crown). */
  yMin: number;
  /** Vertical centre of the crown and its radius, for the height tone. */
  cy: number;
  R: number;
}

/** Solid lumps + a shell of leaf cards hugging their noisy surface (trees and shrubs). */
function addCrown(sink: Sink, o: CrownOptions, rnd: Rnd): void {
  for (const l of o.lumps) sink.solid.push(blob({ r: l.r, sy: l.sy, detail: o.detail, centre: l.c, octaves: o.octaves, shade: o.shade }));
  for (let k = 0; k < o.cards; k++) {
    const l = o.lumps[Math.floor(rnd() * o.lumps.length)];
    randomDir(rnd, vD);
    const sx = l.c[0] + vD.x * l.r;
    const sy = l.c[1] + vD.y * l.r * l.sy;
    const sz = l.c[2] + vD.z * l.r;
    const kk = Math.max(0.4, 1 + fbm3(sx, sy, sz, o.octaves, o.shade.seed) / l.r);
    const px = l.c[0] + vD.x * l.r * kk;
    const py = l.c[1] + vD.y * l.r * l.sy * kk;
    const pz = l.c[2] + vD.z * l.r * kk;
    if (py < o.yMin) continue;
    // buried inside a neighbouring lump: invisible, skip
    if (o.lumps.some((m) => m !== l && Math.hypot(px - m.c[0], (py - m.c[1]) / m.sy, pz - m.c[2]) < m.r * 0.85)) continue;
    vP.set(px + vD.x * o.cardOut, py + vD.y * o.cardOut, pz + vD.z * o.cardOut);
    vN.set(vD.x + (rnd() - 0.5) * 0.9, vD.y + (rnd() - 0.5) * 0.9, vD.z + (rnd() - 0.5) * 0.9).normalize();
    const t = THREE.MathUtils.clamp((vP.y - (o.cy - o.R)) / (2 * o.R), 0, 1);
    leafColor(tmpColor, o.shade, vP.x, vP.y, vP.z, t);
    addLeafCard(sink.cards, vP, vN, o.cardSize * (0.85 + rnd() * 0.3), rnd() * Math.PI * 2, tmpColor);
  }
}

interface TreeSpec {
  x: number;
  z: number;
  kind: 'round' | 'tall';
  /** Overall height (m). */
  h: number;
}

const TREES: TreeSpec[] = [
  { x: -9, z: -3, kind: 'round', h: 6.5 },
  { x: -5, z: 21.5, kind: 'tall', h: 7 },
  { x: 17.5, z: 2, kind: 'round', h: 7.5 },
  { x: 18, z: 13.5, kind: 'tall', h: 8 },
  { x: 6, z: 15.8, kind: 'round', h: 6 },
  { x: 4, z: -5.8, kind: 'round', h: 5.5 },
  { x: -10.5, z: 23, kind: 'tall', h: 6 },
  { x: 24, z: -3, kind: 'round', h: 8 },
  { x: 26, z: 9, kind: 'tall', h: 9 },
  { x: 12, z: -6.5, kind: 'round', h: 6 },
];

/** Trunk base: a little under the grade so nothing floats. */
const TRUNK_BASE = GRADE_Y - 0.05;

/** Round (deciduous) tree: trunk + 3 branches, 13–17 sub-blobs on a squashed 0.6R shell, 250–400 leaf cards. */
function addRoundTree(sink: Sink, t: TreeSpec, rnd: Rnd, seed: number): void {
  const [dark, light] = tones(COLORS.leafDark, COLORS.leafLight, rnd);
  const R = t.h * 0.3;
  const tr = 0.07 + t.h * 0.022;
  const th = t.h * 0.36;
  const yaw = rnd() * Math.PI * 2;
  sink.trunks.push(cylinderBetween([t.x, TRUNK_BASE, t.z], [t.x, TRUNK_BASE + th + R * 0.5, t.z], tr * 1.15, 9, tr * 0.6));
  const cy = TRUNK_BASE + th + R * 0.85;
  for (let b = 0; b < 3; b++) {
    const a = yaw + (b / 3) * Math.PI * 2 + rnd() * 0.6;
    sink.trunks.push(cylinderBetween([t.x, TRUNK_BASE + th * 0.8, t.z], [t.x + Math.cos(a) * R * 0.5, cy + R * 0.3, t.z + Math.sin(a) * R * 0.5], tr * 0.45, 7, tr * 0.15));
  }
  const shade: Shade = { dark, light, aoY: cy - 0.3 * R, aoDepth: 0.6 * R, R, seed };
  const lumps: Lump[] = [{ c: [t.x, cy, t.z], r: 0.6 * R, sy: 0.85 }];
  const n = 12 + Math.floor(rnd() * 5);
  for (let b = 0; b < n; b++) {
    randomDir(rnd, vD);
    lumps.push({ c: [t.x + vD.x * 0.6 * R, cy + vD.y * 0.48 * R, t.z + vD.z * 0.6 * R], r: R * (0.35 + rnd() * 0.15), sy: 0.8 + rnd() * 0.15 });
  }
  addCrown(sink, { lumps, octaves: canopyOctaves(R), shade, detail: 3, cards: 250 + Math.floor(rnd() * 150), cardSize: THREE.MathUtils.clamp(R * 0.3, 0.5, 0.7), cardOut: 0.1 * R, yMin: cy - 1.1 * R, cy, R }, rnd);
}

/**
 * Conifer: one continuous cone r(y) = 0.19h·(1 − y/h)^0.9 with 9 twisting lobes (±10 %) and the
 * canopy noise, a skirt closing its underside, 11 drooping tiers (flat irregular blobs tucked
 * into the lobes so only branch ends poke out) and ~70 needle fronds per metre of height angled
 * 20–40° downward, which carry the silhouette. The trunk shows only under the bottom 12 % of h.
 */
function addConifer(sink: Sink, t: TreeSpec, rnd: Rnd, seed: number): void {
  const [dark, light] = tones(COLORS.coniferDark, COLORS.coniferLight, rnd);
  const h = t.h;
  const R = 0.19 * h;
  const tr = 0.05 + h * 0.02;
  sink.trunks.push(cylinderBetween([t.x, TRUNK_BASE, t.z], [t.x, TRUNK_BASE + h * 0.6, t.z], tr * 1.1, 8, tr * 0.3));
  const y0 = TRUNK_BASE + 0.12 * h;
  const octaves = canopyOctaves(R);
  const shade: Shade = { dark, light, aoY: y0 + 0.2 * h, aoDepth: 0.35 * h, R, seed };
  const rad = (tt: number) => R * Math.pow(Math.max(0, 1 - tt), 0.9);
  const phase = rnd() * Math.PI * 2;
  /** Radius multiplier at angle a, world height wy, for a ring of radius r. */
  const kAt = (a: number, wy: number, r: number) => {
    const lobes = 1 + 0.1 * Math.sin(9 * a + phase + (wy - TRUNK_BASE) * 2.5);
    const n = fbm3(t.x + Math.cos(a) * r, wy, t.z + Math.sin(a) * r, octaves, seed);
    return Math.max(0.35, lobes + (1.6 * n) / Math.max(r, 0.3));
  };
  const nu = 48;
  const nv = 40;
  const rows: { y: number; r: number; t: number }[] = [
    { y: y0 - 0.06 * h, r: 0.1 * R, t: 0 },
    { y: y0 - 0.03 * h, r: 0.65 * rad(0.12), t: 0 },
  ];
  for (let j = 0; j <= nv - 2; j++) {
    const tt = 0.12 + (j / (nv - 2)) * 0.88;
    rows.push({ y: TRUNK_BASE + tt * h, r: Math.max(0.012, rad(tt)), t: (tt - 0.12) / 0.88 });
  }
  sink.solid.push(
    gridSurface(
      nu,
      nv,
      (i, j) => {
        const a = -(i / nu) * Math.PI * 2; // clockwise from above = rightward seen from outside
        const row = rows[j];
        const r = row.r * kAt(a, row.y, row.r);
        const p: Vec3 = [t.x + Math.cos(a) * r, row.y, t.z + Math.sin(a) * r];
        leafColor(tmpColor, shade, p[0], p[1], p[2], row.t);
        return { p, uv: [-a * R * 0.5, row.y], c: [tmpColor.r, tmpColor.g, tmpColor.b] };
      },
      true,
    ),
  );
  const tiers = 11;
  for (let l = 0; l < tiers; l++) {
    const tt = 0.14 + (l / (tiers - 1)) * 0.74 + (rnd() - 0.5) * 0.03;
    const r = (0.8 + rnd() * 0.2) * rad(tt);
    const jitter = r * 0.3;
    sink.solid.push(
      blob({
        r,
        sy: 0.3 + rnd() * 0.12,
        detail: 2,
        centre: [t.x + (rnd() - 0.5) * jitter, TRUNK_BASE + tt * h, t.z + (rnd() - 0.5) * jitter],
        octaves: [
          { wavelength: 0.7 * r, amplitude: 0.32 * r },
          { wavelength: 0.25 * r, amplitude: 0.1 * r },
          { wavelength: 0.12 * r, amplitude: 0.04 * r },
        ],
        shade: { ...shade, seed: seed + 1 + l },
      }),
    );
  }
  const fronds = Math.round(70 * h);
  for (let k = 0; k < fronds; k++) {
    const tt = 0.13 + rnd() * 0.85;
    const y = TRUNK_BASE + tt * h;
    const r0 = Math.max(0.05, rad(tt));
    const a = rnd() * Math.PI * 2;
    const r = r0 * kAt(a, y, r0);
    vD.set(Math.cos(a), 0, Math.sin(a));
    vT.set(-Math.sin(a), 0, Math.cos(a));
    const down = THREE.MathUtils.degToRad(30 + (rnd() - 0.5) * 20);
    vU.copy(vD).multiplyScalar(Math.cos(down)).addScaledVector(UP_V, -Math.sin(down)).normalize();
    const roll = (rnd() - 0.5) * THREE.MathUtils.degToRad(70);
    vN.crossVectors(vU, vT);
    vV.copy(vT).multiplyScalar(Math.cos(roll)).addScaledVector(vN, Math.sin(roll)).normalize();
    const w = 0.55 * (0.8 + rnd() * 0.4);
    const hh = 0.35 * (0.8 + rnd() * 0.4);
    vP.set(t.x + vD.x * (r + 0.02), y, t.z + vD.z * (r + 0.02)).addScaledVector(vU, w * 0.4);
    leafColor(tmpColor, shade, vP.x, vP.y, vP.z, (tt - 0.12) / 0.88);
    addCardUV(sink.cards, vP, vU, vV, w, hh, 'needle', tmpColor);
  }
}

/** Shrubs: [x, z, radius]. In the beds along the walls and beside the walkway. */
const SHRUBS: [number, number, number][] = [
  [1.05, 1.35, 0.42],
  [1.05, 2.35, 0.36],
  [1.05, 3.2, 0.4],
  [2.3, 0.45, 0.34],
  [3.7, 0.45, 0.4],
  [5.3, 0.45, 0.36],
  [7.2, -0.48, 0.38],
  [8.9, -0.48, 0.42],
  [10.6, -0.48, 0.36],
  [12.5, -0.48, 0.4],
  [13.6, 1.1, 0.38],
  [13.6, 2.7, 0.42],
  [13.6, 5.6, 0.36],
  [-3.2, 3.55, 0.4],
  [-4.6, 3.45, 0.36],
  [-6.5, 3.6, 0.32],
  [-1.9, 6.6, 0.3],
  [1.3, 10.7, 0.38],
  [3.4, 10.7, 0.42],
  [5.3, 10.7, 0.36],
  [9.2, 10.7, 0.38],
  [8.0, 7.2, 0.34],
];

/** Shrub: 6–8 sub-blobs of 0.5–0.7 r in the upper half of a 0.5 r shell, ~120 leaf cards of 20–25 cm. */
function addShrub(sink: Sink, x: number, z: number, r: number, rnd: Rnd, seed: number): void {
  const [dark, light] = tones(COLORS.hedgeDark, COLORS.hedgeLight, rnd);
  const cy = GRADE_Y + 0.5 * r;
  const shade: Shade = { dark, light, aoY: GRADE_Y + 0.35 * r, aoDepth: 0.35 * r, R: r, seed };
  const lumps: Lump[] = [{ c: [x, cy, z], r: 0.65 * r, sy: 0.8 }];
  const n = 5 + Math.floor(rnd() * 3);
  for (let b = 0; b < n; b++) {
    randomDir(rnd, vD);
    const rr = r * (0.5 + rnd() * 0.2);
    lumps.push({ c: [x + vD.x * 0.5 * r, cy - 0.05 * r + Math.abs(vD.y) * 0.3 * r, z + vD.z * 0.5 * r], r: rr, sy: 0.8 + rnd() * 0.15 });
  }
  addCrown(sink, { lumps, octaves: canopyOctaves(r), shade, detail: 2, cards: 110 + Math.floor(rnd() * 30), cardSize: 0.22, cardOut: 0.06 * r, yMin: GRADE_Y + 0.06, cy, R: r }, rnd);
}

// ---- street hedge: 0.5 m plants with a chamfered top, lumpy faces, leaf cards
const HEDGE_X = STREET.x2 + 1.0;
const HEDGE_W = 0.8;
const HEDGE_H = 1.1;
const HEDGE_PLANT = 0.5;
const HEDGE_CHAMFER = 0.12;
const HEDGE_OCTAVES: Octave[] = [
  { wavelength: 0.18, amplitude: 0.05 },
  { wavelength: 0.07, amplitude: 0.02 },
];

interface ProfilePoint {
  x: number;
  y: number;
  /** Outward 2D normal. */
  nx: number;
  ny: number;
  /** Perimeter distance from the start (metres). */
  s: number;
}

/** Cross-section of a hedge plant (closed loop, ~5 cm spacing), starting at the bottom-right corner and going up the +X face. */
function hedgeProfile(): ProfilePoint[] {
  const pts: ProfilePoint[] = [];
  const hw = HEDGE_W / 2;
  const c = HEDGE_CHAMFER;
  let s = 0;
  const push = (x: number, y: number, nx: number, ny: number) => {
    if (pts.length) {
      const q = pts[pts.length - 1];
      s += Math.hypot(x - q.x, y - q.y);
    }
    pts.push({ x, y, nx, ny, s });
  };
  const line = (x0: number, y0: number, x1: number, y1: number, nx: number, ny: number, n: number, includeStart: boolean) => {
    for (let k = includeStart ? 0 : 1; k <= n; k++) push(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n, nx, ny);
  };
  const arc = (cx: number, cy: number, a0: number, a1: number) => {
    for (let k = 1; k <= 4; k++) {
      const a = a0 + ((a1 - a0) * k) / 4;
      push(cx + Math.cos(a) * c, cy + Math.sin(a) * c, Math.cos(a), Math.sin(a));
    }
  };
  line(hw, 0, hw, HEDGE_H - c, 1, 0, 20, true);
  arc(hw - c, HEDGE_H - c, 0, Math.PI / 2);
  line(hw - c, HEDGE_H, -hw + c, HEDGE_H, 0, 1, 12, false);
  arc(-hw + c, HEDGE_H - c, Math.PI / 2, Math.PI);
  line(-hw, HEDGE_H - c, -hw, 0, -1, 0, 20, false);
  line(-hw, 0, hw, 0, 0, -1, 2, false); // closes the loop on the (buried) bottom
  return pts;
}

const HEDGE_PROFILE = hedgeProfile();

function addHedgeRun(sink: Sink, za: number, zb: number, rnd: Rnd, seed: number): void {
  const [dark, light] = tones(COLORS.hedgeDark, COLORS.hedgeLight, rnd);
  const yBase = GRADE_Y - 0.02;
  const n = Math.max(1, Math.round((zb - za) / HEDGE_PLANT));
  const len = (zb - za) / n;
  const nu = HEDGE_PROFILE.length - 1;
  const nv = Math.max(4, Math.round(len / 0.05));
  for (let k = 0; k < n; k++) {
    const z0 = za + len * k;
    const z1 = z0 + len;
    const cx = HEDGE_X + (rnd() - 0.5) * 0.12;
    const shade: Shade = { dark, light, aoY: GRADE_Y + 0.3, aoDepth: 0.35, R: 0.6, seed: seed + k };
    const vertex = (i: number, z: number) => {
      const q = HEDGE_PROFILE[i];
      const wx = cx + q.x;
      const wy = yBase + q.y;
      let d = q.ny < -0.5 ? 0 : fbm3(wx, wy, z, HEDGE_OCTAVES, seed + k);
      if (q.ny > 0.6) d *= 2; // the clipped top is the lumpiest
      const p: Vec3 = [wx + q.nx * d, wy + q.ny * d, z];
      leafColor(tmpColor, shade, p[0], p[1], p[2], q.y / HEDGE_H);
      return { p, c: [tmpColor.r, tmpColor.g, tmpColor.b] as Vec3, uv: [q.s, z] as Vec2 };
    };
    sink.solid.push(gridSurface(nu, nv, (i, j) => vertex(i, z0 + ((z1 - z0) * j) / nv), true));
    // end caps (fans), so the ±6 cm offsets between plants show a leafy end rather than a hole
    const caps = new TriangleSoup(1);
    for (const [z, want] of [
      [z0, [0, 0, -1]],
      [z1, [0, 0, 1]],
    ] as [number, Vec3][]) {
      const centre: Vec3 = [cx, yBase + HEDGE_H / 2, z];
      for (let i = 0; i < nu; i++) {
        const a = vertex(i, z);
        const b = vertex(i + 1, z);
        caps.setColor(a.c[0], a.c[1], a.c[2]);
        caps.triUV(centre, a.p, b.p, [cx, centre[1]], [a.p[0], a.p[1]], [b.p[0], b.p[1]], want);
      }
    }
    sink.solid.push(caps.build());
    // leaf cards on the top and the two faces
    const cards = Math.round(200 * len);
    for (let c = 0; c < cards; c++) {
      const i = Math.floor(rnd() * (nu - 2)); // every point but the buried bottom edge
      const q = HEDGE_PROFILE[i];
      const v = vertex(i, z0 + 0.03 + rnd() * (len - 0.06));
      vP.set(v.p[0] + q.nx * 0.03, v.p[1] + q.ny * 0.03, v.p[2]);
      vN.set(q.nx + (rnd() - 0.5) * 0.7, q.ny + (rnd() - 0.5) * 0.7, (rnd() - 0.5) * 0.7).normalize();
      tmpColor.setRGB(v.c[0], v.c[1], v.c[2]);
      addLeafCard(sink.cards, vP, vN, 0.2 + rnd() * 0.06, rnd() * Math.PI * 2, tmpColor);
    }
  }
}

function Foliage() {
  const leaf = useLeaf();
  const cardMat = useLeafCards();
  const bark = useBark();
  const [, pz1] = RAMPS.perron.bounds;
  const [, , , dz2] = RAMPS.driveway.bounds;

  const { solid, cards, trunks } = useMemo(() => {
    const rnd = mulberry32(7);
    const sink: Sink = { solid: [], trunks: [], cards: new TriangleSoup(1) };
    let seed = 100;
    for (const t of TREES) {
      if (t.kind === 'round') addRoundTree(sink, t, rnd, seed++);
      else addConifer(sink, t, rnd, seed++);
    }
    for (const [x, z, r] of SHRUBS) addShrub(sink, x, z, r, rnd, seed++);
    // hedge along the street: gaps at the walkway, the driveway and the mailbox; the south run stops
    // 1.3 m short of the walkway so its end is not in the visitor's face at the start viewpoint
    const runs: [number, number][] = [
      [-8, pz1 - 1.3],
      [dz2 + 0.9, 14.5],
    ];
    for (const [za, zb] of runs) {
      addHedgeRun(sink, za, zb, rnd, seed);
      seed += 40;
    }
    return { solid: mergeAll(sink.solid), cards: sink.cards.build(), trunks: mergeAll(sink.trunks) };
  }, [pz1, dz2]);
  useDispose(solid, cards, trunks);

  return (
    <group name="foliage">
      <mesh geometry={trunks} material={bark} castShadow />
      <mesh geometry={solid} material={leaf} castShadow receiveShadow />
      <mesh geometry={cards} material={cardMat} castShadow receiveShadow />
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Horizon tree line: crossed alpha billboards on the rolling far lawn (one draw call)
// ---------------------------------------------------------------------------------------------
function FarTrees() {
  const mat = useFarTrees();
  const geom = useMemo(() => {
    const rnd = mulberry32(55);
    const soup = new TriangleSoup(1);
    const add = (x: number, z: number, h: number, conifer: boolean) => {
      const y = lawnHeightAt(x, z) - 0.3;
      const w = h * 0.5;
      const yaw = rnd() * Math.PI;
      const k = 0.8 + rnd() * 0.3;
      soup.setColor(k, k, k);
      const [u0, u1] = conifer ? ATLAS.needle : ATLAS.leaf;
      for (const a of [yaw, yaw + Math.PI / 2]) {
        const dx = (Math.cos(a) * w) / 2;
        const dz = (Math.sin(a) * w) / 2;
        soup.quadUV([x - dx, y, z - dz], [x + dx, y, z + dz], [x + dx, y + h, z + dz], [x - dx, y + h, z - dz], [u0, 0], [u1, 0], [u1, 1], [u0, 1], [-dz, 0, dx]);
      }
    };
    const onStreet = (x: number) => x > -24 && x < -9;
    // a few trees at mid distance (what used to be the 18 solid far trees)
    for (let k = 0; k < 16; k++) {
      const ang = (k / 16) * Math.PI * 2 + rnd() * 0.3;
      const r = 36 + rnd() * 14;
      const x = LAWN_CX + Math.cos(ang) * r;
      const z = LAWN_CZ + Math.sin(ang) * r;
      if (onStreet(x)) continue;
      add(x, z, 8 + rnd() * 3, rnd() < 0.35);
    }
    // the ring: two jittered rows, 3 m pitch
    for (const [radius, jitter] of [
      [57, 2.5],
      [68, 3.5],
    ]) {
      const n = Math.round((Math.PI * 2 * radius) / 3);
      for (let k = 0; k < n; k++) {
        const ang = ((k + (rnd() - 0.5) * 0.5) / n) * Math.PI * 2;
        const r = radius + (rnd() - 0.5) * 2 * jitter;
        const x = LAWN_CX + Math.cos(ang) * r;
        const z = LAWN_CZ + Math.sin(ang) * r;
        if (onStreet(x)) continue;
        add(x, z, 8 + rnd() * 4, rnd() < 0.35);
      }
    }
    return soup.build();
  }, []);
  useDispose(geom);
  return <mesh geometry={geom} material={mat} />;
}

// ---------------------------------------------------------------------------------------------
// Field stones (in the beds and at tree feet): noisy, flat-bottomed, sunk 30 % into the grade on a mulch ring
// ---------------------------------------------------------------------------------------------
const ROCKS: [number, number, number, number][] = [
  [0.9, 0.55, 0.3, 0.9],
  [-2.6, 3.6, 0.26, 2.1],
  [13.6, 4.2, 0.34, 0.4],
  [6.7, -0.5, 0.22, 1.6],
  [-8.6, -2.2, 0.4, 3.0],
  [17.0, 2.9, 0.3, 0.2],
  [7.1, 15.2, 0.36, 1.1],
];
const ROCK_OCTAVES: Octave[] = [
  { wavelength: 0.6, amplitude: 0.12 },
  { wavelength: 0.2, amplitude: 0.05 },
];

function Rocks() {
  const rock = useRock();
  const mulch = useMulch();
  const { stones, rings } = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    const ringSoup = new TriangleSoup(1);
    ROCKS.forEach(([x, z, r, yaw], idx) => {
      const raw = new THREE.IcosahedronGeometry(1, 3);
      const g = mergeVertices(raw);
      raw.dispose();
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const px = pos.getX(i);
        const py = pos.getY(i);
        const pz = pos.getZ(i);
        const k = 1 + fbm3(px, py, pz, ROCK_OCTAVES, 400 + idx);
        pos.setXYZ(i, px * k, Math.max(py * k * 0.62, -0.45), pz * k);
      }
      pos.needsUpdate = true;
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2 * r, uv.getY(i) * r);
      g.computeVertexNormals();
      g.scale(r, r, r);
      parts.push(place(g, [x, GRADE_Y + 0.3 * r, z], yaw));
      // mulch ring at the foot
      const n = 14;
      const rr = r * 1.35;
      const y = GRADE_Y + 0.038;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2;
        const a1 = ((i + 1) / n) * Math.PI * 2;
        ringSoup.tri([x, y, z], [x + Math.cos(a0) * rr, y, z + Math.sin(a0) * rr], [x + Math.cos(a1) * rr, y, z + Math.sin(a1) * rr], UP);
      }
    });
    return { stones: mergeAll(parts), rings: ringSoup.build() };
  }, []);
  useDispose(stones, rings);
  return (
    <group name="rocks">
      <mesh geometry={stones} material={rock} castShadow receiveShadow />
      <mesh geometry={rings} material={mulch} receiveShadow />
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Mailbox by the driveway
// ---------------------------------------------------------------------------------------------
function Mailbox() {
  const [, , , dz2] = RAMPS.driveway.bounds;
  const planks = usePlanks();
  const black = useBlackMetal();
  const flagMat = useMemo(() => new THREE.MeshStandardMaterial({ color: COLORS.flag, roughness: 0.55, metalness: 0.2 }), []);
  const postGeom = useMemo(() => mergeAll([place(metreRoundedBox(0.1, 1.15, 0.1, 0.01, { swap: true }), [0, 0.525, 0]), place(metreBox(0.46, 0.04, 0.26), [0, 1.08, 0])]), []);
  const boxGeom = useMemo(() => mergeAll([place(metreRoundedBox(0.5, 0.24, 0.22, 0.05, {}, 2), [0, 1.22, 0]), place(metreRoundedBox(0.52, 0.03, 0.24, 0.008), [0, 1.09, 0])]), []);
  const flagGeom = useMemo(() => mergeAll([place(metreBox(0.03, 0.16, 0.02), [0.14, 1.26, 0.125]), place(metreBox(0.03, 0.03, 0.03), [0.14, 1.18, 0.125])]), []);
  useDispose(flagMat, postGeom, boxGeom, flagGeom);
  return (
    <group name="mailbox" position={[STREET.x2 + 0.55, GRADE_Y - 0.03, dz2 + 0.4]}>
      <mesh geometry={postGeom} material={planks} castShadow />
      <mesh geometry={boxGeom} material={black} castShadow />
      <mesh geometry={flagGeom} material={flagMat} />
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Fence (rear and side property lines, with gate gaps)
// ---------------------------------------------------------------------------------------------
interface FenceLine {
  /** Axis the line runs along. */
  axis: 'x' | 'z';
  /** Fixed coordinate. */
  at: number;
  from: number;
  to: number;
  /** Direction (along the fixed axis) toward the house; planks go on the other side. */
  inward: 1 | -1;
}

const FENCE_LINES: FenceLine[] = [
  { axis: 'z', at: 20, from: -8, to: 4, inward: -1 },
  { axis: 'z', at: 20, from: 5.2, to: 18, inward: -1 },
  { axis: 'x', at: -8, from: -12, to: 0, inward: 1 },
  { axis: 'x', at: -8, from: 1.2, to: 20, inward: 1 },
  { axis: 'x', at: 18, from: -12, to: 0, inward: -1 },
  { axis: 'x', at: 18, from: 1.2, to: 20, inward: -1 },
];
const FENCE_H = 1.2;
const PLANK_W = 0.14;
const PLANK_T = 0.02;
const PLANK_PITCH = PLANK_W + 0.02;
const POST_PITCH = 2.4;
const POST = 0.1;
const RAIL_OFF = 0.07;
const PLANK_OFF = 0.1;
/** Gap rows of weathered_brown_planks (512 px) → v (metres) of the lower edge of board k. */
const plankV = (k: number) => PLANK_TILE * (1 - (20 + 39.4 * ((k % 13) + 1)) / 512);

/** Five faces of a vertical plank with the texture's board k mapped exactly across its width. */
function plankQuads(soup: TriangleSoup, cx: number, cz: number, along: Vec2, normal: Vec2, y0: number, y1: number, k: number, grain: number): void {
  const ax = (along[0] * PLANK_W) / 2;
  const az = (along[1] * PLANK_W) / 2;
  const nx = (normal[0] * PLANK_T) / 2;
  const nz = (normal[1] * PLANK_T) / 2;
  const FL: Vec2 = [cx - ax + nx, cz - az + nz];
  const FR: Vec2 = [cx + ax + nx, cz + az + nz];
  const BR: Vec2 = [cx + ax - nx, cz + az - nz];
  const BL: Vec2 = [cx - ax - nx, cz - az - nz];
  const vb = plankV(k);
  const P = (p: Vec2, y: number): Vec3 => [p[0], y, p[1]];
  const uv = (across: number, y: number): Vec2 => [y + grain, vb + across];
  const nF: Vec3 = [normal[0], 0, normal[1]];
  const nB: Vec3 = [-normal[0], 0, -normal[1]];
  soup.quadUV(P(FL, y0), P(FR, y0), P(FR, y1), P(FL, y1), uv(0, y0), uv(PLANK_W, y0), uv(PLANK_W, y1), uv(0, y1), nF);
  soup.quadUV(P(BL, y0), P(BR, y0), P(BR, y1), P(BL, y1), uv(0, y0), uv(PLANK_W, y0), uv(PLANK_W, y1), uv(0, y1), nB);
  soup.quadUV(P(FL, y1), P(FR, y1), P(BR, y1), P(BL, y1), uv(0, y1), uv(PLANK_W, y1), uv(PLANK_W, y1 + PLANK_T), uv(0, y1 + PLANK_T), UP);
  soup.quadUV(P(FL, y0), P(FL, y1), P(BL, y1), P(BL, y0), uv(0, y0), uv(0, y1), uv(PLANK_T, y1), uv(PLANK_T, y0), [-along[0], 0, -along[1]]);
  soup.quadUV(P(FR, y0), P(FR, y1), P(BR, y1), P(BR, y0), uv(0, y0), uv(0, y1), uv(PLANK_T, y1), uv(PLANK_T, y0), [along[0], 0, along[1]]);
}

function Fence() {
  const planks = usePlanks();
  const set = usePbr('weathered_brown_planks', { repeat: [1 / PLANK_TILE, 1 / PLANK_TILE], normalScale: 0.9 });
  const plankMat = useMemo(() => new THREE.MeshStandardMaterial({ ...set.props, vertexColors: true, roughness: 0.85, envMapIntensity: 0.7 }), [set]);

  const { plankGeom, frameGeom } = useMemo(() => {
    const rnd = mulberry32(31);
    const soup = new TriangleSoup(1);
    const frame: THREE.BufferGeometry[] = [];
    let k = 0;
    for (const line of FENCE_LINES) {
      const len = line.to - line.from;
      const along: Vec2 = line.axis === 'x' ? [1, 0] : [0, 1];
      const normal: Vec2 = line.axis === 'x' ? [0, -line.inward] : [-line.inward, 0];
      const at = (t: number, off: number): Vec2 => (line.axis === 'x' ? [t, line.at + off] : [line.at + off, t]);
      // posts with caps
      const n = Math.max(1, Math.ceil(len / POST_PITCH));
      for (let p = 0; p <= n; p++) {
        const [px, pz] = at(line.from + (len * p) / n, 0);
        const h = FENCE_H + 0.1;
        frame.push(place(metreRoundedBox(POST, h + 0.05, POST, 0.008, { swap: true, offset: [px + pz, 0] }), [px, GRADE_Y - 0.05 + (h + 0.05) / 2, pz]));
        frame.push(place(metreRoundedBox(POST + 0.04, 0.03, POST + 0.04, 0.008), [px, GRADE_Y + h + 0.015, pz]));
      }
      // two rails on the outside face of the posts
      const railOff = -line.inward * RAIL_OFF;
      for (const yy of [GRADE_Y + 0.3, GRADE_Y + 0.95]) {
        const [mx, mz] = at(line.from + len / 2, railOff);
        frame.push(place(line.axis === 'x' ? metreBox(len, 0.08, 0.04) : metreBox(0.04, 0.08, len, { swap: true }), [mx, yy, mz]));
      }
      // planks outside the rails
      const plankOff = -line.inward * PLANK_OFF;
      for (let t = line.from + 0.09; t <= line.to - 0.07; t += PLANK_PITCH) {
        const [cx, cz] = at(t, plankOff);
        const y0 = GRADE_Y + 0.05;
        const y1 = y0 + FENCE_H - 0.05 + (rnd() - 0.5) * 0.03;
        const shade = 0.78 + rnd() * 0.22;
        soup.setColor(shade, shade, shade);
        plankQuads(soup, cx, cz, along, normal, y0, y1, k++, rnd() * PLANK_TILE);
      }
    }
    return { plankGeom: soup.build(), frameGeom: mergeAll(frame) };
  }, []);
  useDispose(plankMat, plankGeom, frameGeom);

  return (
    <group name="fence">
      <mesh geometry={frameGeom} material={planks} castShadow />
      <mesh geometry={plankGeom} material={plankMat} castShadow receiveShadow />
    </group>
  );
}
