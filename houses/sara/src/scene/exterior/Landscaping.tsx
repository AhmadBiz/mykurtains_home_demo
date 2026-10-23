/**
 * Trees (tapered bark trunks with forking branches; crowns of dark noise-deformed sub-lumps —
 * the shaded interior — under a deep shell of alpha-tested leaf-cluster cards that carry the lit
 * tone), conifers (a dark jagged cone inside tiers of drooping needle fronds), shrubs on raised
 * mulch beds, the clipped street hedge in sections, a horizon of mid-distance 3D trees and
 * crossed billboards on the rolling far lawn backed by a continuous tree-line band, field stones
 * sunk in the grade, a mailbox by the driveway and the plank fence on the property lines.
 *
 * Foliage is FIVE merged geometries (solid cores, hedge bodies, cards, trunks + stems, beds),
 * the horizon two, the rocks two, the fence two. All relief is 3D value noise sampled in WORLD
 * space (noise.ts) so overlapping blobs agree where they meet. Every leaf card carries the normal
 * of the crown shell it sits on (geom.ts setNormal), so a crown shades as one surface: the lit
 * side of a tree is lit on every card, the shade side dark on every card, like a wall.
 * Keep-out zones: house footprint X -1.1..13.1 / Z -0.1..10.2 (+ beds), driveway, walkway, street.
 */
import * as THREE from 'three';
import { useMemo } from 'react';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COLORS, GRADE_Y, RAMPS, STREET } from './data';
import { TriangleSoup, UP, cylinderBetween, gridSurface, mergeAll, metreBox, metreRoundedBox, place } from './geom';
import type { Rect, Vec2, Vec3 } from './geom';
import { FAR_TREE_VARIANTS, mulberry32, treelineTexture } from './textures';
import { fbm3, noise3 } from './noise';
import type { Octave } from './noise';
import { LAWN_CX, LAWN_CZ, lawnHeightAt } from './terrain';
import { useDispose } from './hooks';
import { LEAF_MAP_GAIN, PLANK_TILE, useBark, useBlackMetal, useFarTreeAtlas, useFarTrees, useHedgeLeaf, useLeaf, useLeafCards, useMulch, usePlankTextures, usePlanks, useRock } from './materials';
import { SUN_DIR } from '../Lighting';

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
const vS = new THREE.Vector3();

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

/** The solid cores are the shaded interior of a crown: the species' dark tone at 0.55–0.85× (the cards carry the lit tone). */
function coreShade(s: Shade): Shade {
  return { ...s, dark: s.dark.clone().multiplyScalar(0.55), light: s.dark.clone().multiplyScalar(0.85) };
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

/**
 * A card centred at p with in-plane axes u (atlas u, width w) and v (atlas v, height h), wound
 * along u × v; its vertices carry `shell`, the normal of the crown surface it belongs to.
 */
function addCardUV(soup: TriangleSoup, p: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, w: number, h: number, kind: 'leaf' | 'needle', c: THREE.Color, shell: THREE.Vector3): void {
  vN.crossVectors(u, v).normalize();
  const ax = u.x * w * 0.5;
  const ay = u.y * w * 0.5;
  const az = u.z * w * 0.5;
  const bx = v.x * h * 0.5;
  const by = v.y * h * 0.5;
  const bz = v.z * h * 0.5;
  const [u0, u1] = ATLAS[kind];
  soup.setColor(c.r, c.g, c.b);
  soup.setNormal([shell.x, shell.y, shell.z]);
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

/** A leaf-cluster card facing `n` (unit), spun by `spin` in its plane, lit with the `shell` normal. */
function addLeafCard(soup: TriangleSoup, p: THREE.Vector3, n: THREE.Vector3, size: number, spin: number, c: THREE.Color, shell: THREE.Vector3): void {
  const helper = Math.abs(n.y) < 0.9 ? UP_V : X_V;
  vT.crossVectors(helper, n).normalize();
  vV.crossVectors(n, vT).normalize();
  const cs = Math.cos(spin);
  const sn = Math.sin(spin);
  vU.copy(vT).multiplyScalar(cs).addScaledVector(vV, sn);
  vV.crossVectors(n, vU).normalize();
  addCardUV(soup, p, vU, vV, size, size, 'leaf', c, shell);
}

interface Sink {
  solid: THREE.BufferGeometry[];
  hedge: THREE.BufferGeometry[];
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
  /** Card size (m); cards sit between `cardIn` (inside the lump surface, negative) and `cardOut` (proud of it). */
  cardSize: number;
  cardIn: number;
  cardOut: number;
  /** Cards below this world Y are dropped (buried in the bed). */
  yMin: number;
  /** Centre of the crown, its radius and vertical squash: the shell normal and the height tone. */
  centre: Vec3;
  R: number;
  squash: number;
}

/**
 * Solid lumps (the dark interior) + a deep shell of leaf cards around their noisy surface, from
 * 0.3 R inside it to 0.35 R proud of it, so no smooth sphere survives and the crown has depth
 * (trees and shrubs). Cards are lit with the crown's shell normal and get lighter outward.
 */
function addCrown(sink: Sink, o: CrownOptions, rnd: Rnd): void {
  const core = coreShade(o.shade);
  o.lumps.forEach((l, i) => sink.solid.push(blob({ r: l.r, sy: l.sy, detail: i === 0 ? o.detail : Math.max(1, o.detail - 1), centre: l.c, octaves: o.octaves, shade: core })));
  for (let k = 0; k < o.cards; k++) {
    const l = o.lumps[Math.floor(rnd() * o.lumps.length)];
    randomDir(rnd, vD);
    const sx = l.c[0] + vD.x * l.r;
    const sy = l.c[1] + vD.y * l.r * l.sy;
    const sz = l.c[2] + vD.z * l.r;
    const kk = Math.max(0.4, 1 + fbm3(sx, sy, sz, o.octaves, o.shade.seed) / l.r);
    const depth = rnd();
    const out = o.cardIn + (o.cardOut - o.cardIn) * depth;
    const px = l.c[0] + vD.x * (l.r * kk + out);
    const py = l.c[1] + vD.y * (l.r * l.sy * kk + out);
    const pz = l.c[2] + vD.z * (l.r * kk + out);
    if (py < o.yMin) continue;
    // deep inside a lump: invisible, skip
    if (o.lumps.some((m) => Math.hypot(px - m.c[0], (py - m.c[1]) / m.sy, pz - m.c[2]) < m.r * 0.55)) continue;
    vP.set(px, py, pz);
    // shell normal: radial from the crown centre (vertically squashed), slightly jittered
    vS.set(px - o.centre[0], (py - o.centre[1]) / o.squash, pz - o.centre[2]).normalize();
    vS.x += (rnd() - 0.5) * 0.3;
    vS.y += (rnd() - 0.5) * 0.3;
    vS.z += (rnd() - 0.5) * 0.3;
    vS.normalize();
    vN.set(vS.x + (rnd() - 0.5) * 0.9, vS.y + (rnd() - 0.5) * 0.9, vS.z + (rnd() - 0.5) * 0.9).normalize();
    const t = THREE.MathUtils.clamp((vP.y - (o.centre[1] - o.R)) / (2 * o.R), 0, 1);
    leafColor(tmpColor, o.shade, vP.x, vP.y, vP.z, t).multiplyScalar(0.7 + 0.35 * depth);
    addLeafCard(sink.cards, vP, vN, o.cardSize * (0.85 + rnd() * 0.3), rnd() * Math.PI * 2, tmpColor, vS);
  }
}

interface TreeSpec {
  x: number;
  z: number;
  kind: 'round' | 'tall';
  /** Overall height (m). */
  h: number;
  /** Grade under the trunk (default GRADE_Y: the flat lawn). */
  y?: number;
  /** Mid-distance level of detail: fewer, larger cards, coarser lumps, no branches. */
  lod?: boolean;
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

/** Trunk base below the grade so nothing floats. */
const TRUNK_SINK = 0.05;
const onStreet = (x: number) => x > -24 && x < -9;

/** Sixteen real trees at 36–50 m on the rolling lawn (what the stair window frames), at the mid LOD. */
const MID_TREES: TreeSpec[] = (() => {
  const rnd = mulberry32(55);
  const out: TreeSpec[] = [];
  for (let k = 0; k < 16; k++) {
    const ang = (k / 16) * Math.PI * 2 + rnd() * 0.3;
    const r = 36 + rnd() * 14;
    const x = LAWN_CX + Math.cos(ang) * r;
    const z = LAWN_CZ + Math.sin(ang) * r;
    if (onStreet(x)) continue;
    out.push({ x, z, kind: rnd() < 0.35 ? 'tall' : 'round', h: 8 + rnd() * 4, y: lawnHeightAt(x, z), lod: true });
  }
  return out;
})();

/** Crown relief: 0.12 / 0.08 / 0.04 of R at 1.5R / 0.5R / 0.15R (≈ 0.25 R total, no lump keeps a spherical silhouette). */
function crownOctaves(R: number): Octave[] {
  return [
    { wavelength: 1.5 * R, amplitude: 0.12 * R },
    { wavelength: 0.5 * R, amplitude: 0.08 * R },
    { wavelength: 0.15 * R, amplitude: 0.04 * R },
  ];
}

/**
 * Round (deciduous) tree: a trunk tapering from 0.035 h at grade (0.3 m root flare) to 0.012 h at
 * the crown, 5–7 tapered branches forking once at 0.6 R and ending inside the crown, 15–19 dark
 * sub-lumps of 0.25–0.35 R on a 0.65 R shell and 700–1000 cards of 0.9–1.3 m from 0.3 R inside
 * the shell to 0.35 R proud of it, down to the underside.
 */
function addRoundTree(sink: Sink, t: TreeSpec, rnd: Rnd, seed: number): void {
  const [dark, light] = tones(COLORS.leafDark, COLORS.leafLight, rnd);
  const base = (t.y ?? GRADE_Y) - TRUNK_SINK;
  const R = t.h * 0.3;
  const th = t.h * 0.36;
  const cy = base + th + R * 0.85;
  const yaw = rnd() * Math.PI * 2;
  const rGrade = 0.035 * t.h;
  const rFlare = 0.025 * t.h;
  const rCrown = 0.012 * t.h;
  sink.trunks.push(cylinderBetween([t.x, base, t.z], [t.x, base + 0.3, t.z], rGrade, 10, rFlare));
  sink.trunks.push(cylinderBetween([t.x, base + 0.3, t.z], [t.x, cy + 0.2 * R, t.z], rFlare, 10, rCrown));
  if (!t.lod) {
    const tr = 0.02 * t.h;
    const n = 5 + Math.floor(rnd() * 3);
    for (let b = 0; b < n; b++) {
      const a = yaw + (b / n) * Math.PI * 2 + (rnd() - 0.5) * 0.7;
      const elev = THREE.MathUtils.degToRad(25 + rnd() * 30);
      const y0 = base + th * (0.75 + rnd() * 0.2);
      const start: Vec3 = [t.x, y0, t.z];
      const L1 = 0.6 * R;
      const fork: Vec3 = [t.x + Math.cos(a) * Math.cos(elev) * L1, y0 + Math.sin(elev) * L1, t.z + Math.sin(a) * Math.cos(elev) * L1];
      sink.trunks.push(cylinderBetween(start, fork, tr * 0.45, 7, tr * 0.22));
      for (const s of [-1, 1]) {
        const a2 = a + s * THREE.MathUtils.degToRad(20 + rnd() * 15);
        const e2 = elev + THREE.MathUtils.degToRad((rnd() - 0.3) * 30);
        const L2 = 0.35 * R;
        const end: Vec3 = [fork[0] + Math.cos(a2) * Math.cos(e2) * L2, fork[1] + Math.sin(e2) * L2, fork[2] + Math.sin(a2) * Math.cos(e2) * L2];
        sink.trunks.push(cylinderBetween(fork, end, tr * 0.22, 6, tr * 0.1));
      }
    }
  }
  const shade: Shade = { dark, light, aoY: cy - 0.3 * R, aoDepth: 0.6 * R, R, seed };
  const lumps: Lump[] = [{ c: [t.x, cy, t.z], r: 0.6 * R, sy: 0.85 }];
  const n = t.lod ? 9 : 15 + Math.floor(rnd() * 5);
  for (let b = 0; b < n; b++) {
    randomDir(rnd, vD);
    lumps.push({ c: [t.x + vD.x * 0.65 * R, cy + vD.y * 0.5 * R, t.z + vD.z * 0.65 * R], r: R * (0.25 + rnd() * 0.1), sy: 0.85 + rnd() * 0.15 });
  }
  addCrown(
    sink,
    {
      lumps,
      octaves: crownOctaves(R),
      shade,
      detail: t.lod ? 2 : 3,
      cards: t.lod ? 300 : 700 + Math.floor(rnd() * 300),
      cardSize: THREE.MathUtils.clamp(R * 0.45, 0.9, 1.3) * (t.lod ? 1.7 : 1),
      cardIn: -0.3 * R,
      cardOut: 0.35 * R,
      yMin: cy - 1.3 * R,
      centre: [t.x, cy, t.z],
      R,
      squash: 0.85,
    },
    rnd,
  );
}

/**
 * Conifer: a DARK continuous cone r(y) = 0.19h·(1 − y/h)^0.9 (lobes ±4 %, light noise) that is
 * only ever the shaded interior, and tiers every 0.4 m of 24–36 needle-frond cards 0.6–1.6 m
 * long rooted between 0.3 r and 0.75 r from the axis, drooping 20–35°, their planes roughly
 * horizontal (±20° roll) and darkened toward the trunk, which carry the whole silhouette. The
 * trunk shows only under the bottom 12 % of h.
 */
function addConifer(sink: Sink, t: TreeSpec, rnd: Rnd, seed: number): void {
  const [dark, light] = tones(COLORS.coniferDark, COLORS.coniferLight, rnd);
  const base = (t.y ?? GRADE_Y) - TRUNK_SINK;
  const h = t.h;
  const R = 0.19 * h;
  const tr = 0.05 + h * 0.02;
  sink.trunks.push(cylinderBetween([t.x, base, t.z], [t.x, base + h * 0.6, t.z], tr * 1.1, 8, tr * 0.3));
  const y0 = base + 0.12 * h;
  const octaves: Octave[] = [
    { wavelength: 0.5 * R, amplitude: 0.04 * R },
    { wavelength: 0.15 * R, amplitude: 0.02 * R },
  ];
  const shade: Shade = { dark, light, aoY: y0 + 0.2 * h, aoDepth: 0.35 * h, R, seed };
  const core = coreShade(shade);
  const rad = (tt: number) => R * Math.pow(Math.max(0, 1 - tt), 0.9);
  const phase = rnd() * Math.PI * 2;
  /** Radius multiplier at angle a, world height wy, for a ring of radius r. */
  const kAt = (a: number, wy: number, r: number) => {
    const lobes = 1 + 0.04 * Math.sin(9 * a + phase + (wy - base) * 2.5);
    const n = fbm3(t.x + Math.cos(a) * r, wy, t.z + Math.sin(a) * r, octaves, seed);
    return Math.max(0.5, lobes + (0.6 * n) / Math.max(r, 0.3));
  };
  const nu = t.lod ? 24 : 40;
  const nv = t.lod ? 16 : 32;
  const rows: { y: number; r: number; t: number }[] = [
    { y: y0 - 0.06 * h, r: 0.1 * R, t: 0 },
    { y: y0 - 0.03 * h, r: 0.55 * rad(0.12), t: 0 },
  ];
  for (let j = 0; j <= nv - 2; j++) {
    const tt = 0.12 + (j / (nv - 2)) * 0.88;
    rows.push({ y: base + tt * h, r: Math.max(0.012, 0.85 * rad(tt)), t: (tt - 0.12) / 0.88 });
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
        leafColor(tmpColor, core, p[0], p[1], p[2], row.t);
        return { p, uv: [-a * R * 0.5, row.y], c: [tmpColor.r, tmpColor.g, tmpColor.b] };
      },
      true,
    ),
  );
  const slopeUp = R / h; // the cone normal tilts up by dr/dy
  const tierPitch = t.lod ? 0.8 : 0.4;
  for (let y = y0 + 0.02 * h; y < base + 0.97 * h; y += tierPitch * (0.9 + rnd() * 0.2)) {
    const tt = (y - base) / h;
    const r0 = Math.max(0.06, rad(tt));
    const n = t.lod ? 8 : 24 + Math.floor(rnd() * 12);
    for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2;
      const rho = r0 * (0.3 + rnd() * 0.45);
      const L = THREE.MathUtils.clamp(0.5 + 0.8 * r0, 0.6, 1.6) * (0.85 + rnd() * 0.3) * (t.lod ? 1.4 : 1);
      const W = L * (0.38 + rnd() * 0.14);
      vD.set(Math.cos(a), 0, Math.sin(a));
      vT.set(-Math.sin(a), 0, Math.cos(a));
      const droop = THREE.MathUtils.degToRad(20 + rnd() * 15);
      vU.copy(vD).multiplyScalar(Math.cos(droop)).addScaledVector(UP_V, -Math.sin(droop)).normalize();
      vP.set(t.x + vD.x * rho, y + (rnd() - 0.5) * 0.15, t.z + vD.z * rho).addScaledVector(vU, L * 0.5);
      vS.copy(vD).addScaledVector(UP_V, slopeUp).normalize();
      leafColor(tmpColor, shade, vP.x, vP.y, vP.z, (tt - 0.12) / 0.88).multiplyScalar(0.55 + 0.45 * (rho / r0));
      // two crossed planes per frond (near-horizontal spray + its vertical twin, both rolled ±25°):
      // a lone horizontal card is a line from eye level, a lone vertical one a bar from above
      const roll0 = (rnd() - 0.5) * THREE.MathUtils.degToRad(50);
      for (const roll of [roll0, roll0 + Math.PI / 2]) {
        vN.crossVectors(vU, vT);
        vV.copy(vT).multiplyScalar(Math.cos(roll)).addScaledVector(vN, Math.sin(roll)).normalize();
        addCardUV(sink.cards, vP, vU, vV, L, W, 'needle', tmpColor, vS);
      }
    }
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
  [-1.9, 6.42, 0.28],
  [1.3, 10.7, 0.38],
  [3.4, 10.7, 0.42],
  [5.3, 10.7, 0.36],
  [9.2, 10.7, 0.38],
  [8.3, 7.3, 0.34],
];

/**
 * Raised mulch beds under every shrub group (0.3 m past the shrubs, clipped to the wall faces
 * and the paving): a 50 mm slab with a 30 mm rounded lip, so the beds read as a soft-edged
 * mound rather than a flat dark decal.
 */
const SHRUB_BEDS: Rect[] = [
  [0.45, 0.85, 1.35, 3.5],
  [1.9, 0.05, 5.75, 0.74],
  [6.7, -0.95, 13.0, -0.17],
  [13.28, 0.6, 14.1, 6.1],
  [-6.9, 3.0, -2.75, 4.0],
  [-2.3, 6.1, -1.5, 6.62],
  [0.9, 10.38, 5.75, 11.15],
  [8.5, 10.0, 9.9, 11.4],
  [7.85, 6.45, 8.95, 7.95],
];
const BED_H = 0.05;

/** Shrub: dark sub-lumps in the upper half of a 0.5 r shell, 300–400 cards of 0.3–0.45 m with depth, 3–5 stems at the base. */
function addShrub(sink: Sink, x: number, z: number, r: number, yBase: number, rnd: Rnd, seed: number): void {
  const [dark, light] = tones(COLORS.hedgeDark, COLORS.hedgeLight, rnd);
  const cy = yBase + 0.5 * r;
  const shade: Shade = { dark, light, aoY: yBase + 0.35 * r, aoDepth: 0.35 * r, R: r, seed };
  const lumps: Lump[] = [{ c: [x, cy, z], r: 0.6 * r, sy: 0.8 }];
  const n = 5 + Math.floor(rnd() * 3);
  for (let b = 0; b < n; b++) {
    randomDir(rnd, vD);
    const rr = r * (0.35 + rnd() * 0.15);
    lumps.push({ c: [x + vD.x * 0.5 * r, cy - 0.05 * r + Math.abs(vD.y) * 0.3 * r, z + vD.z * 0.5 * r], r: rr, sy: 0.8 + rnd() * 0.15 });
  }
  const stems = 3 + Math.floor(rnd() * 3);
  for (let s = 0; s < stems; s++) {
    const a = rnd() * Math.PI * 2;
    const d = rnd() * 0.25 * r;
    sink.trunks.push(cylinderBetween([x + Math.cos(a) * d * 0.4, yBase - 0.02, z + Math.sin(a) * d * 0.4], [x + Math.cos(a) * d, cy, z + Math.sin(a) * d], 0.012, 5, 0.008));
  }
  addCrown(
    sink,
    { lumps, octaves: crownOctaves(r), shade, detail: 2, cards: 300 + Math.floor(rnd() * 100), cardSize: 0.37, cardIn: -0.3 * r, cardOut: 0.15 * r, yMin: yBase + 0.05, centre: [x, cy, z], R: r, squash: 0.8 },
    rnd,
  );
}

// ---- street hedge: 0.5 m plants of varied height and lean, a 0.2 m chamfered top, lumpy faces, leaf cards, in sections with gaps
const HEDGE_X = STREET.x2 + 1.0;
const HEDGE_W = 0.8;
const HEDGE_H = 1.1;
const HEDGE_PLANT = 0.5;
const HEDGE_CHAMFER = 0.2;
const HEDGE_SECTION: [number, number] = [4, 6];
const HEDGE_GAP = 0.6;
const HEDGE_OCTAVES: Octave[] = [
  { wavelength: 0.18, amplitude: 0.05 },
  { wavelength: 0.07, amplitude: 0.02 },
];
/** The clipped top catches the sun flat-on: its tone is dropped so it stays in the lawn's value range. */
const HEDGE_TOP_TONE = 0.65;

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
    for (let k = 1; k <= 5; k++) {
      const a = a0 + ((a1 - a0) * k) / 5;
      push(cx + Math.cos(a) * c, cy + Math.sin(a) * c, Math.cos(a), Math.sin(a));
    }
  };
  line(hw, 0, hw, HEDGE_H - c, 1, 0, 18, true);
  arc(hw - c, HEDGE_H - c, 0, Math.PI / 2);
  line(hw - c, HEDGE_H, -hw + c, HEDGE_H, 0, 1, 8, false);
  arc(-hw + c, HEDGE_H - c, Math.PI / 2, Math.PI);
  line(-hw, HEDGE_H - c, -hw, 0, -1, 0, 18, false);
  line(-hw, 0, hw, 0, 0, -1, 2, false); // closes the loop on the (buried) bottom
  return pts;
}

const HEDGE_PROFILE = hedgeProfile();

function addHedgePlants(sink: Sink, za: number, zb: number, shade0: Shade, rnd: Rnd, seed: number): void {
  const yBase = GRADE_Y - 0.02;
  const n = Math.max(1, Math.round((zb - za) / HEDGE_PLANT));
  const len = (zb - za) / n;
  const nu = HEDGE_PROFILE.length - 1;
  const nv = Math.max(4, Math.round(len / 0.05));
  for (let k = 0; k < n; k++) {
    const z0 = za + len * k;
    const z1 = z0 + len;
    const cx = HEDGE_X + (rnd() - 0.5) * 0.12;
    const hScale = 1 + ((rnd() - 0.5) * 0.16) / HEDGE_H; // ±8 cm
    const lean = (rnd() - 0.5) * THREE.MathUtils.degToRad(6); // ±3°
    const shade: Shade = { ...shade0, seed: seed + k };
    const vertex = (i: number, z: number) => {
      const q = HEDGE_PROFILE[i];
      const y = q.y * hScale;
      const wx = cx + q.x + Math.tan(lean) * y;
      const wy = yBase + y;
      let d = q.ny < -0.5 ? 0 : fbm3(wx, wy, z, HEDGE_OCTAVES, seed + k);
      if (q.ny > 0.6) d *= 1.6; // the clipped top is the lumpiest
      const p: Vec3 = [wx + q.nx * d, wy + q.ny * d, z];
      leafColor(tmpColor, shade, p[0], p[1], p[2], q.y / HEDGE_H);
      if (q.ny > 0.6) tmpColor.multiplyScalar(HEDGE_TOP_TONE);
      return { p, c: [tmpColor.r, tmpColor.g, tmpColor.b] as Vec3, uv: [q.s, z] as Vec2, n: [q.nx, q.ny, 0] as Vec3 };
    };
    sink.hedge.push(gridSurface(nu, nv, (i, j) => vertex(i, z0 + ((z1 - z0) * j) / nv), true));
    // end caps (fans), so the offsets between plants and the section gaps show a leafy end rather than a hole
    const caps = new TriangleSoup(1);
    for (const [z, want] of [
      [z0, [0, 0, -1]],
      [z1, [0, 0, 1]],
    ] as [number, Vec3][]) {
      const centre: Vec3 = [cx, yBase + (HEDGE_H * hScale) / 2, z];
      for (let i = 0; i < nu; i++) {
        const a = vertex(i, z);
        const b = vertex(i + 1, z);
        caps.setColor(a.c[0], a.c[1], a.c[2]);
        caps.triUV(centre, a.p, b.p, [cx, centre[1]], [a.p[0], a.p[1]], [b.p[0], b.p[1]], want);
      }
    }
    sink.hedge.push(caps.build());
    // leaf cards over both faces and the top, 4–12 cm proud with strong tilt, lit with the face normal
    const cards = Math.round(250 * len);
    for (let c = 0; c < cards; c++) {
      const i = Math.floor(rnd() * (nu - 2)); // every point but the buried bottom edge
      const q = HEDGE_PROFILE[i];
      const v = vertex(i, z0 + 0.03 + rnd() * (len - 0.06));
      const out = 0.04 + rnd() * 0.08;
      vP.set(v.p[0] + q.nx * out, v.p[1] + q.ny * out, v.p[2]);
      vN.set(q.nx + (rnd() - 0.5) * 0.9, q.ny + (rnd() - 0.5) * 0.9, (rnd() - 0.5) * 0.9).normalize();
      vS.set(v.n[0], v.n[1], v.n[2]);
      tmpColor.setRGB(v.c[0], v.c[1], v.c[2]).multiplyScalar(0.85 + out * 2.5);
      addLeafCard(sink.cards, vP, vN, 0.22 + rnd() * 0.08, rnd() * Math.PI * 2, tmpColor, vS);
    }
  }
}

/** A hedge run broken into 4–6 m sections with 0.6 m gaps (a kept hedge is several plants, not one extrusion). */
function addHedgeRun(sink: Sink, za: number, zb: number, rnd: Rnd, seed: number): void {
  const [dark, light] = tones(COLORS.hedgeDark, COLORS.hedgeLight, rnd);
  const shade: Shade = { dark, light, aoY: GRADE_Y + 0.3, aoDepth: 0.35, R: 0.6, seed };
  let z = za;
  let k = 0;
  while (z < zb - 0.5) {
    let end = Math.min(z + HEDGE_SECTION[0] + rnd() * (HEDGE_SECTION[1] - HEDGE_SECTION[0]), zb);
    if (zb - end < 1.5) end = zb;
    addHedgePlants(sink, z, end, shade, rnd, seed + k * 50);
    z = end + HEDGE_GAP;
    k++;
  }
}

function Foliage() {
  const leaf = useLeaf();
  const hedgeLeaf = useHedgeLeaf();
  const cardMat = useLeafCards();
  const bark = useBark();
  const mulch = useMulch();
  const [, pz1] = RAMPS.perron.bounds;
  const [, , , dz2] = RAMPS.driveway.bounds;

  const { solid, hedge, cards, trunks, beds } = useMemo(() => {
    const rnd = mulberry32(7);
    const sink: Sink = { solid: [], hedge: [], trunks: [], cards: new TriangleSoup(1) };
    let seed = 100;
    for (const t of [...TREES, ...MID_TREES]) {
      if (t.kind === 'round') addRoundTree(sink, t, rnd, seed++);
      else addConifer(sink, t, rnd, seed++);
    }
    const bedParts: THREE.BufferGeometry[] = [];
    for (const [x1, z1, x2, z2] of SHRUB_BEDS) bedParts.push(place(metreRoundedBox(x2 - x1, BED_H, z2 - z1, 0.03, { offset: [x1, z1] }), [(x1 + x2) / 2, GRADE_Y + BED_H / 2 - 0.004, (z1 + z2) / 2]));
    for (const [x, z, r] of SHRUBS) {
      const onBed = SHRUB_BEDS.some((b) => x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3]);
      addShrub(sink, x, z, r, onBed ? GRADE_Y + BED_H - 0.004 : GRADE_Y, rnd, seed++);
    }
    // hedge along the street: gaps at the walkway, the driveway and the mailbox; the south run stops
    // 1.3 m short of the walkway so its end is not in the visitor's face at the start viewpoint
    const runs: [number, number][] = [
      [-8, pz1 - 1.3],
      [dz2 + 0.9, 14.5],
    ];
    for (const [za, zb] of runs) {
      addHedgeRun(sink, za, zb, rnd, seed);
      seed += 400;
    }
    return { solid: mergeAll(sink.solid), hedge: mergeAll(sink.hedge), cards: sink.cards.build(), trunks: mergeAll(sink.trunks), beds: mergeAll(bedParts) };
  }, [pz1, dz2]);
  useDispose(solid, hedge, cards, trunks, beds);

  return (
    <group name="foliage">
      <mesh geometry={beds} material={mulch} receiveShadow />
      <mesh geometry={trunks} material={bark} castShadow />
      <mesh geometry={solid} material={leaf} castShadow receiveShadow />
      <mesh geometry={hedge} material={hedgeLeaf} castShadow receiveShadow />
      <mesh geometry={cards} material={cardMat} castShadow receiveShadow />
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Horizon: two rings of three-plane alpha billboards (5 silhouettes, per-tree sun side, tint and
// height jitter) beyond 60 m, and a continuous tree-line band behind them (two draw calls).
// ---------------------------------------------------------------------------------------------
const RINGS: [number, number][] = [
  [60, 3],
  [72, 4],
];
const BAND_RADIUS = 84;
const BAND_H = 6;
const BAND_TILE = 12;
const sunXZ = new THREE.Vector2(SUN_DIR.x, SUN_DIR.z).normalize();

function FarTrees() {
  const atlas = useFarTreeAtlas();
  const treeMat = useFarTrees(atlas);
  const band = useMemo(() => treelineTexture(), []);
  const bandMat = useFarTrees(band);
  const { trees, bandGeom } = useMemo(() => {
    const rnd = mulberry32(55);
    const soup = new TriangleSoup(1);
    const c = new THREE.Color();
    const add = (x: number, z: number, h: number) => {
      const y = lawnHeightAt(x, z) - 0.3;
      const p = rnd();
      const variant = FAR_TREE_VARIANTS[p < 0.3 ? 2 + Math.floor(rnd() * 2) : p < 0.38 ? 4 : Math.floor(rnd() * 2)];
      const w = h * variant.aspect * (0.85 + rnd() * 0.3);
      const yaw = rnd() * Math.PI;
      // the viewer at the house sees the face turned toward it: lit when that face looks at the sun
      const dx = x - LAWN_CX;
      const dz = z - LAWN_CZ;
      const len = Math.hypot(dx, dz) || 1;
      const lit = 0.55 + 0.45 * Math.max(0, -(dx / len) * sunXZ.x - (dz / len) * sunXZ.y);
      const value = lit * (0.85 + rnd() * 0.3);
      const hue = (rnd() - 0.5) * 0.16; // ±8 % between the red and blue channels: a hue shift of the tint
      c.setRGB(value * (1 + hue), value, value * (1 - hue));
      const [u0, u1] = variant.u;
      // self-shadowed base: the bottom vertices at 0.6× (the lower third averages ~0.7×)
      const lo: Vec3 = [c.r * 0.6, c.g * 0.6, c.b * 0.6];
      const hi: Vec3 = [c.r, c.g, c.b];
      for (const a of [yaw, yaw + Math.PI / 3, yaw + (2 * Math.PI) / 3]) {
        const ax = (Math.cos(a) * w) / 2;
        const az = (Math.sin(a) * w) / 2;
        const n: Vec3 = [-az, 0, ax];
        soup.triUVC([x - ax, y, z - az], [x + ax, y, z + az], [x + ax, y + h, z + az], [u0, 0], [u1, 0], [u1, 1], lo, lo, hi, n);
        soup.triUVC([x - ax, y, z - az], [x + ax, y + h, z + az], [x - ax, y + h, z - az], [u0, 0], [u1, 1], [u0, 1], lo, hi, hi, n);
      }
    };
    for (const [radius, jitter] of RINGS) {
      const n = Math.round((Math.PI * 2 * radius) / 3);
      for (let k = 0; k < n; k++) {
        const ang = ((k + (rnd() - 0.5) * 0.5) / n) * Math.PI * 2;
        const r = radius + (rnd() - 0.5) * 2 * jitter;
        const x = LAWN_CX + Math.cos(ang) * r;
        const z = LAWN_CZ + Math.sin(ang) * r;
        if (onStreet(x)) continue;
        add(x, z, 7 + rnd() * 7);
      }
    }
    // tree-line band: a ring of quads facing the house, tiled every BAND_TILE metres of arc
    const bandSoup = new TriangleSoup(1);
    const segs = Math.round((Math.PI * 2 * BAND_RADIUS) / 4);
    for (let k = 0; k < segs; k++) {
      const a0 = (k / segs) * Math.PI * 2;
      const a1 = ((k + 1) / segs) * Math.PI * 2;
      const x0 = LAWN_CX + Math.cos(a0) * BAND_RADIUS;
      const z0 = LAWN_CZ + Math.sin(a0) * BAND_RADIUS;
      const x1 = LAWN_CX + Math.cos(a1) * BAND_RADIUS;
      const z1 = LAWN_CZ + Math.sin(a1) * BAND_RADIUS;
      const y0 = lawnHeightAt(x0, z0) - 0.5;
      const y1 = lawnHeightAt(x1, z1) - 0.5;
      const u0 = (a0 * BAND_RADIUS) / BAND_TILE;
      const u1 = (a1 * BAND_RADIUS) / BAND_TILE;
      const lit = 0.55 + 0.45 * Math.max(0, -Math.cos((a0 + a1) / 2) * sunXZ.x - Math.sin((a0 + a1) / 2) * sunXZ.y);
      const lo: Vec3 = [lit * 0.7, lit * 0.7, lit * 0.7];
      const hi: Vec3 = [lit, lit, lit];
      const n: Vec3 = [-Math.cos(a0), 0, -Math.sin(a0)];
      bandSoup.triUVC([x0, y0, z0], [x1, y1, z1], [x1, y1 + BAND_H, z1], [u0, 0], [u1, 0], [u1, 1], lo, lo, hi, n);
      bandSoup.triUVC([x0, y0, z0], [x1, y1 + BAND_H, z1], [x0, y0 + BAND_H, z0], [u0, 0], [u1, 1], [u0, 1], lo, hi, hi, n);
    }
    return { trees: soup.build(), bandGeom: bandSoup.build() };
  }, []);
  useDispose(trees, bandGeom, band);
  return (
    <group name="horizon">
      <mesh geometry={trees} material={treeMat} />
      <mesh geometry={bandGeom} material={bandMat} />
    </group>
  );
}

// ---------------------------------------------------------------------------------------------
// Field stones (in the beds and at tree feet): noisy, faceted, flat-bottomed, sunk 30 % into the grade on a mulch ring
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
  { wavelength: 0.6, amplitude: 0.1 },
  { wavelength: 0.2, amplitude: 0.05 },
];

function Rocks() {
  const rock = useRock();
  const mulch = useMulch();
  const { stones, rings } = useMemo(() => {
    const rnd = mulberry32(91);
    const parts: THREE.BufferGeometry[] = [];
    const ringSoup = new TriangleSoup(1);
    ROCKS.forEach(([x, z, r0, yaw], idx) => {
      const r = r0 * (0.8 + rnd() * 0.45); // 20–30 % size variation per group
      const raw = new THREE.IcosahedronGeometry(1, 2);
      const g = mergeVertices(raw);
      raw.dispose();
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      // 2–3 flat facet cuts: planes at 0.72–0.88 of the radius
      const cuts: { n: THREE.Vector3; d: number }[] = [];
      const nCuts = 2 + Math.floor(rnd() * 2);
      for (let c = 0; c < nCuts; c++) cuts.push({ n: randomDir(rnd, new THREE.Vector3()).setY(Math.abs(rnd() - 0.3)).normalize(), d: 0.72 + rnd() * 0.16 });
      for (let i = 0; i < pos.count; i++) {
        const px = pos.getX(i);
        const py = pos.getY(i);
        const pz = pos.getZ(i);
        const k = 1 + fbm3(px, py, pz, ROCK_OCTAVES, 400 + idx);
        vP.set(px * k, py * k * 0.7, pz * k);
        for (const cut of cuts) {
          const over = vP.dot(cut.n) - cut.d;
          if (over > 0) vP.addScaledVector(cut.n, -over);
        }
        pos.setXYZ(i, vP.x, Math.max(vP.y, -0.45), vP.z);
      }
      pos.needsUpdate = true;
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2 * r, uv.getY(i) * r);
      g.scale(r, r, r);
      const flat = g.toNonIndexed(); // flat facets: a rock, not an egg
      g.dispose();
      flat.computeVertexNormals();
      parts.push(place(flat, [x, GRADE_Y + 0.25 * r, z], yaw));
      // mulch / soil ring at the foot (0.1 m past the contact)
      const n = 14;
      const rr = r * 1.1 + 0.1;
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
  const set = usePlankTextures();
  // same weathered-cedar lift as usePlanks (the per-plank vertex colour varies it ±11 %)
  const plankMat = useMemo(
    () => new THREE.MeshStandardMaterial({ map: set.map, normalMap: set.normalMap, roughnessMap: set.roughnessMap, normalScale: new THREE.Vector2(0.9, 0.9), color: COLORS.cedar, vertexColors: true, roughness: 0.8, envMapIntensity: 1.0 }),
    [set],
  );

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
