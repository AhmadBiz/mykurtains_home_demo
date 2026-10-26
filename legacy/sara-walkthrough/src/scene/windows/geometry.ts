/**
 * Procedural, size-memoised geometries for the windows and the patio door: frames, sashes,
 * muntins, interior / exterior trim, glass panes, the selection ring and the invisible hit box.
 *
 * Local frame of every part (matches WindowInstance): origin at the centre of the opening on the
 * wall centre-line, +X along the wall, +Y up, +Z INTO the room. The interior wall face is at
 * z = +t/2 and the exterior face at z = -t/2 (t = wall thickness). Units are metres.
 *
 * Window anatomy (inside → outside):
 *   casing (7 cm, mitred, chamfered back-band) · stool with eased nose · apron
 *   outer frame lining the full reveal (6 cm face, 4 mm chamfer) with a 2 cm rebate step on the
 *   exterior side · 1 cm shadow gap · sash frame (4 cm × 6 cm, chamfered) · double glazing
 *   (two panes 2 cm apart) with SDL muntin bars glued on both faces · mullions between sashes
 *   and transom rails on tall windows · exterior brick-mould casing (6 cm) on a stone sill with
 *   a drip groove.
 *
 * Every builder returns a geometry cached by its dimensions, so the many windows that share a
 * size share one BufferGeometry, and all the parts of one material are merged into a single
 * geometry (one draw call per material per window).
 *
 * CONTRACT WITH THE COVERINGS (../coverings/slats.ts imports FRAME_FACE and CASING_W): the clear
 * opening between the frame members is (w − 2·FRAME_FACE) × (h − 2·FRAME_FACE), and nothing
 * between the jambs protrudes further into the room than z = 0.35·t (mullions and transoms stop
 * at INNER_FRONT·t), so inside-mounted blinds hang in front of everything.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, chamfered, pane, place, sweepProfile } from './profile';
import type { ProfilePoint } from './profile';

/** Face width of the outer frame members lining the reveal (head, sill, jambs). */
export const FRAME_FACE = 0.06;
/** Interior casing (trim) width around the opening on the interior face. */
export const CASING_W = 0.07;

// Outer frame
const INSET = 0.001; // frame pulled back from the wall's reveal faces (no coplanar faces)
const FRAME_R = 0.004;
const STEP_W = 0.02; // rebate stop lip, into the opening, exterior side
const STEP_Z0 = 0.003; // lip starts this far in from the exterior face
// Sash
const SASH_GAP = 0.01;
const SASH_W = 0.04;
const SASH_D = 0.06;
const SASH_R = 0.004;
const MULLION_W = 0.06;
const TRANSOM_H = 0.06;
/** Room-side limit (× t) of mullions / transoms — the coverings' inside-mount contract is 0.35. */
const INNER_FRONT = 0.34;
const COLS_2 = 1.4;
const COLS_3 = 2.0;
const ROWS_2 = 2.2;
const ROWS_3 = 3.2;
const TRANSOM_AT = 0.64;
// Glazing
const GLASS_BURY = 0.01; // pane edge buried in the sash
const PANE_GAP = 0.02;
const MUNTIN_MIN_WIDTH = 1.0;
const MUNTIN_W = 0.02;
const MUNTIN_T = 0.008;
const LITE = 0.45; // target lite size
// Interior trim
const TRIM_GAP = 0.002;
const CASING_IN = 0.01; // casing overlaps the frame face by this much
const CASING_PROUD = 0.025;
const STOOL_T = 0.028;
const STOOL_PROJ = 0.04;
const STOOL_HORN = 0.025;
const STOOL_R = 0.006;
const APRON_H = 0.07;
// Exterior trim
const BRICKMOULD_W = 0.06;
const BRICKMOULD_IN = 0.01;
const BRICKMOULD_PROUD = 0.03;
const SILL_PROJ = 0.06;
const SILL_H = 0.05;
const SILL_HORN = 0.03;
const SILL_TUCK = 0.02;
const SILL_DROP = 0.006;
// Highlight ring and hit box
const HIGHLIGHT_BAR = 0.008;
const HIGHLIGHT_D = 0.005;
const HIGHLIGHT_MARGIN = 0.004;
const HIT_MARGIN = 0.1;
const HIT_DEPTH_EXTRA = 0.3;

/** Patio door proportions. */
const DOOR = {
  face: 0.05,
  track: 0.03,
  headTrack: 0.025,
  ridge: 0.008,
  stile: 0.07,
  topRail: 0.07,
  bottomRail: 0.14,
  panelDepth: 0.035,
  /** Each sliding panel sits ±this in depth. */
  panelOffset: 0.025,
  /** Interlock overlap of the two panels at the centre. */
  overlap: 0.04,
  handleY: 1.0,
  pull: 0.26,
  pullR: 0.011,
};

export interface Dims {
  width: number;
  height: number;
  wallThickness: number;
}

const cache = new Map<string, THREE.BufferGeometry>();

/** Cache key with millimetre precision. */
const key = (...parts: (number | string)[]): string =>
  parts.map((p) => (typeof p === 'number' ? Math.round(p * 1000) : p)).join('|');

function cached(k: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = cache.get(k);
  if (!g) {
    g = build();
    cache.set(k, g);
  }
  return g;
}

/** Merges parts into one geometry. RoundedBoxGeometry is non-indexed, so every part is flattened first. */
function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (geos.length === 0) return new THREE.BufferGeometry();
  if (geos.length === 1) return geos[0];
  const flat = geos.map((g) => {
    if (!g.index) return g;
    const f = g.toNonIndexed();
    g.dispose();
    return f;
  });
  const merged = mergeGeometries(flat, false);
  for (const g of flat) g.dispose();
  if (!merged) throw new Error('window geometry merge failed');
  return merged;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const X = { x: 1, y: 0, z: 0 };
const Y = { x: 0, y: 1, z: 0 };
const Z = { x: 0, y: 0, z: 1 };
const NX = { x: -1, y: 0, z: 0 };
const NZ = { x: 0, y: 0, z: -1 };
const MITRE = { slope: 1 };
const CAP = { cap: true };

// ---------------------------------------------------------------------------------------------
// Moulding profiles (u = across from the inner edge outward, v = out of the wall face)
// ---------------------------------------------------------------------------------------------

/** 7 cm flat casing with an eased inner edge and a 2 cm chamfered back-band. */
const CASING_PROFILE: ProfilePoint[] = [
  { u: 0, v: 0 },
  { u: 0, v: 0.009 },
  { u: 0.003, v: 0.012 },
  { u: 0.05, v: 0.012 },
  { u: 0.05, v: CASING_PROUD },
  { u: 0.062, v: CASING_PROUD },
  { u: CASING_W, v: 0.017 },
  { u: CASING_W, v: 0 },
];

/** Apron board, bevelled along its bottom edge (u = up from the bottom edge). */
const APRON_PROFILE: ProfilePoint[] = [
  { u: 0, v: 0 },
  { u: 0, v: 0.006 },
  { u: 0.006, v: 0.012 },
  { u: APRON_H, v: 0.012 },
  { u: APRON_H, v: 0 },
];

/** Exterior brick mould: low inner lip rising in an ogee to the outer edge. */
const BRICKMOULD_PROFILE: ProfilePoint[] = [
  { u: 0, v: 0 },
  { u: 0, v: 0.012 },
  { u: 0.018, v: 0.012 },
  { u: 0.03, v: 0.026, smooth: true },
  { u: 0.05, v: BRICKMOULD_PROUD, smooth: true },
  { u: BRICKMOULD_W, v: 0.022 },
  { u: BRICKMOULD_W, v: 0 },
];

/**
 * Stone sill section in (u = y, v = z) relative to its inner top edge (tucked under the frame):
 * top sloped away from the house, square nose, drip groove under the nose.
 */
function sillProfile(): ProfilePoint[] {
  const nose = -(SILL_TUCK + SILL_PROJ);
  return [
    { u: 0, v: 0 },
    { u: -SILL_DROP, v: nose },
    { u: -0.044, v: nose },
    { u: -0.044, v: nose + 0.012 },
    { u: -0.038, v: nose + 0.012 },
    { u: -0.038, v: nose + 0.022 },
    { u: -0.044, v: nose + 0.022 },
    { u: -SILL_H, v: -SILL_TUCK },
    { u: -SILL_H, v: 0 },
  ];
}

// ---------------------------------------------------------------------------------------------
// Trim builders shared by windows and the patio door
// ---------------------------------------------------------------------------------------------

/**
 * Picture-frame casing on a wall face: head + two legs mitred at the top corners, legs ending
 * square at `legBottom`. `inner` is the casing's inner edge offset from the opening edge (positive
 * = overlapping the frame). `out` is +Z (interior face) or −Z (exterior face).
 */
function casing(parts: THREE.BufferGeometry[], profile: ProfilePoint[], w: number, h: number, inner: number, zFace: number, out: THREE.Vector3Like, legBottom: number): void {
  const xi = w / 2 - inner; // inner edge of the legs
  const yi = h / 2 - inner; // inner edge of the head
  // head: runs +X at the inner edge, across = +Y
  parts.push(place(sweepProfile(profile, 2 * xi, MITRE, MITRE), { x: -xi, y: yi, z: zFace }, X, Y, out));
  // legs: run +Y from the bottom, across = away from the opening
  const legH = yi - legBottom;
  parts.push(place(sweepProfile(profile, legH, CAP, MITRE), { x: -xi, y: legBottom, z: zFace }, Y, NX, out));
  parts.push(place(sweepProfile(profile, legH, CAP, MITRE), { x: xi, y: legBottom, z: zFace }, Y, X, out));
}

// ---------------------------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------------------------

interface Cell {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

interface Layout {
  /** Clear opening between the outer frame members. */
  wi: number;
  hi: number;
  cols: number;
  rows: number;
  cells: Cell[];
  /** x of each mullion centre, y of each transom centre. */
  mullions: number[];
  transoms: number[];
}

function layout({ width: w, height: h }: Dims): Layout {
  const wi = w - 2 * FRAME_FACE;
  const hi = h - 2 * FRAME_FACE;
  const cols = w > COLS_3 ? 3 : w > COLS_2 ? 2 : 1;
  const rows = h > ROWS_3 ? 3 : h > ROWS_2 ? 2 : 1;
  const cw = (wi - (cols - 1) * MULLION_W) / cols;
  const xs: [number, number][] = [];
  const mullions: number[] = [];
  for (let i = 0; i < cols; i++) {
    const x0 = -wi / 2 + i * (cw + MULLION_W);
    xs.push([x0, x0 + cw]);
    if (i < cols - 1) mullions.push(x0 + cw + MULLION_W / 2);
  }
  const ys: [number, number][] = [];
  const transoms: number[] = [];
  if (rows === 1) ys.push([-hi / 2, hi / 2]);
  else if (rows === 2) {
    const yT = -hi / 2 + TRANSOM_AT * hi;
    ys.push([-hi / 2, yT - TRANSOM_H / 2], [yT + TRANSOM_H / 2, hi / 2]);
    transoms.push(yT);
  } else {
    const ch = (hi - 2 * TRANSOM_H) / 3;
    for (let r = 0; r < 3; r++) {
      const y0 = -hi / 2 + r * (ch + TRANSOM_H);
      ys.push([y0, y0 + ch]);
      if (r < 2) transoms.push(y0 + ch + TRANSOM_H / 2);
    }
  }
  const cells: Cell[] = [];
  for (const [y0, y1] of ys) for (const [x0, x1] of xs) cells.push({ x0, x1, y0, y1 });
  return { wi, hi, cols, rows, cells, mullions, transoms };
}

/** Sash outer rectangle inside a cell (1 cm shadow gap all round). */
function sashRect(c: Cell): Cell {
  return { x0: c.x0 + SASH_GAP, x1: c.x1 - SASH_GAP, y0: c.y0 + SASH_GAP, y1: c.y1 - SASH_GAP };
}

/** Clear (visible) glass rectangle of a sash. */
function glassRect(c: Cell): Cell {
  const s = sashRect(c);
  return { x0: s.x0 + SASH_W, x1: s.x1 - SASH_W, y0: s.y0 + SASH_W, y1: s.y1 - SASH_W };
}

/** Muntin bars (both faces of the glass) dividing a sash into ~45 cm lites. Horizontal bars butt against the vertical ones. */
function muntins(parts: THREE.BufferGeometry[], c: Cell): void {
  const g = glassRect(c);
  const gw = g.x1 - g.x0;
  const gh = g.y1 - g.y0;
  const nx = clamp(Math.round(gw / LITE), 1, 3);
  const ny = clamp(Math.round(gh / LITE), 1, 4);
  if (nx === 1 && ny === 1) return;
  const zs = [MUNTIN_T / 2 + 0.002, -PANE_GAP - MUNTIN_T / 2 - 0.002];
  const cy = (g.y0 + g.y1) / 2;
  const vx: number[] = [];
  for (let i = 1; i < nx; i++) vx.push(g.x0 + (gw * i) / nx);
  for (const z of zs) {
    for (const x of vx) parts.push(box(MUNTIN_W, gh + 2 * GLASS_BURY, MUNTIN_T, x, cy, z));
    for (let j = 1; j < ny; j++) {
      const y = g.y0 + (gh * j) / ny;
      // segments between the vertical bars (and the sash), buried 1 cm in the sash at the ends
      const edges = [g.x0 - GLASS_BURY, ...vx.flatMap((x) => [x - MUNTIN_W / 2, x + MUNTIN_W / 2]), g.x1 + GLASS_BURY];
      for (let k = 0; k < edges.length; k += 2) {
        const s = edges[k];
        const e = edges[k + 1];
        parts.push(box(e - s, MUNTIN_W, MUNTIN_T, (s + e) / 2, y, z));
      }
    }
  }
}

/**
 * All the white painted parts of a window, merged: outer frame + rebate steps, sashes, mullions
 * and transoms, muntins, interior casing / stool / apron, exterior brick mould.
 */
export function windowWoodwork(d: Dims): THREE.BufferGeometry {
  const { width: w, height: h, wallThickness: t } = d;
  return cached(key('ww', w, h, t), () => {
    const F = FRAME_FACE;
    const L = layout(d);
    const parts: THREE.BufferGeometry[] = [];
    const depth = t - 2 * INSET;
    // outer frame lining the reveal
    parts.push(chamfered(w - 2 * INSET, F - INSET, depth, FRAME_R, 0, h / 2 - INSET - (F - INSET) / 2, 0)); // head
    parts.push(chamfered(w - 2 * INSET, F - INSET, depth, FRAME_R, 0, -h / 2 + INSET + (F - INSET) / 2, 0)); // sill member
    parts.push(chamfered(F - INSET, L.hi, depth, FRAME_R, -(w / 2 - INSET - (F - INSET) / 2), 0, 0)); // jambs
    parts.push(chamfered(F - INSET, L.hi, depth, FRAME_R, w / 2 - INSET - (F - INSET) / 2, 0, 0));
    // mullions (full inner height) and transom segments (between the mullions)
    const innerFront = INNER_FRONT * t;
    const mullD = innerFront + t / 2 - INSET;
    const mullZ = (innerFront - t / 2 + INSET) / 2;
    for (const x of L.mullions) parts.push(chamfered(MULLION_W, L.hi, mullD, FRAME_R, x, 0, mullZ));
    for (const y of L.transoms) {
      for (let i = 0; i < L.cols; i++) {
        const c = L.cells[i];
        parts.push(chamfered(c.x1 - c.x0, TRANSOM_H, mullD, FRAME_R, (c.x0 + c.x1) / 2, y, mullZ));
      }
    }
    // per sash cell: rebate steps (exterior side), sash frame, muntins
    const stepZ0 = -t / 2 + STEP_Z0;
    const stepZ1 = -SASH_D / 2 - 0.002;
    const stepD = stepZ1 - stepZ0;
    const stepZ = (stepZ0 + stepZ1) / 2;
    for (const c of L.cells) {
      const cw = c.x1 - c.x0;
      const ch = c.y1 - c.y0;
      const cx = (c.x0 + c.x1) / 2;
      const cy = (c.y0 + c.y1) / 2;
      if (stepD > 0.004) {
        parts.push(box(cw, STEP_W, stepD, cx, c.y0 + STEP_W / 2, stepZ));
        parts.push(box(cw, STEP_W, stepD, cx, c.y1 - STEP_W / 2, stepZ));
        parts.push(box(STEP_W, ch - 2 * STEP_W, stepD, c.x0 + STEP_W / 2, cy, stepZ));
        parts.push(box(STEP_W, ch - 2 * STEP_W, stepD, c.x1 - STEP_W / 2, cy, stepZ));
      }
      const s = sashRect(c);
      const sw = s.x1 - s.x0;
      const sh = s.y1 - s.y0;
      const sx = (s.x0 + s.x1) / 2;
      const sy = (s.y0 + s.y1) / 2;
      parts.push(chamfered(SASH_W, sh, SASH_D, SASH_R, s.x0 + SASH_W / 2, sy, 0)); // stiles
      parts.push(chamfered(SASH_W, sh, SASH_D, SASH_R, s.x1 - SASH_W / 2, sy, 0));
      parts.push(chamfered(sw - 2 * SASH_W, SASH_W, SASH_D, SASH_R, sx, s.y1 - SASH_W / 2, 0)); // rails
      parts.push(chamfered(sw - 2 * SASH_W, SASH_W, SASH_D, SASH_R, sx, s.y0 + SASH_W / 2, 0));
      if (w >= MUNTIN_MIN_WIDTH) muntins(parts, c);
    }
    // interior: stool (eased edges) on the sill member, apron under it, casing legs on the stool
    const stoolTop = -h / 2 + F + 0.003;
    const stoolBack = SASH_D / 2 + SASH_GAP + 0.005;
    const stoolFront = t / 2 + TRIM_GAP + CASING_PROUD + STOOL_PROJ;
    const trimHalf = w / 2 + CASING_W - CASING_IN;
    parts.push(chamfered(2 * (trimHalf + STOOL_HORN), STOOL_T, stoolFront - stoolBack, STOOL_R, 0, stoolTop - STOOL_T / 2, (stoolFront + stoolBack) / 2));
    const apronBottom = stoolTop - STOOL_T - APRON_H;
    parts.push(place(sweepProfile(APRON_PROFILE, 2 * trimHalf, CAP, CAP), { x: -trimHalf, y: apronBottom, z: t / 2 + TRIM_GAP }, X, Y, Z));
    casing(parts, CASING_PROFILE, w, h, CASING_IN, t / 2 + TRIM_GAP, Z, stoolTop);
    // exterior: brick mould down onto the stone sill
    casing(parts, BRICKMOULD_PROFILE, w, h, BRICKMOULD_IN, -t / 2 - TRIM_GAP, NZ, -h / 2 - 0.002);
    return merge(parts);
  });
}

/** Exterior stone sill: tucked 2 cm under the frame, projecting 6 cm beyond the wall, with horns past the brick mould. */
export function windowSill({ width: w, height: h, wallThickness: t }: Dims): THREE.BufferGeometry {
  return cached(key('ws', w, h, t), () => {
    const half = w / 2 + BRICKMOULD_W - BRICKMOULD_IN + SILL_HORN;
    return place(sweepProfile(sillProfile(), 2 * half, CAP, CAP), { x: -half, y: -h / 2 + 0.003, z: -t / 2 + SILL_TUCK }, X, Y, Z);
  });
}

/**
 * The glazing of every sash as ONE front-sided mesh: the room-side face at the wall centre
 * (z = 0, facing the room) and the exterior face of the double glazing 2 cm out (facing the
 * street). Each face is only ever seen from its own side, so FrontSide culls the other one and
 * the glass costs a single draw call per window — and, on the transmission material, never
 * triggers three's extra back-face pass. Edges are buried 1 cm in the sash.
 */
export function windowGlazing(d: Dims): THREE.BufferGeometry {
  return cached(key('wg', d.width, d.height), () => merge(layout(d).cells.flatMap((c) => [cellPane(c, 0, false), cellPane(c, -PANE_GAP, true)])));
}

function cellPane(c: Cell, z: number, back: boolean): THREE.BufferGeometry {
  const g = glassRect(c);
  return pane(g.x1 - g.x0 + 2 * GLASS_BURY, g.y1 - g.y0 + 2 * GLASS_BURY, (g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2, z, back);
}

// ---------------------------------------------------------------------------------------------
// Patio door (two sliding panels: A fixed on the exterior track, B operating on the interior one)
// ---------------------------------------------------------------------------------------------

interface DoorLayout {
  /** Clear width between the jambs. */
  wi: number;
  bottom: number;
  top: number;
  /** Panel size and centre y. */
  pw: number;
  ph: number;
  py: number;
  xA: number;
  xB: number;
  zA: number;
  zB: number;
}

function doorLayout({ width: w, height: h }: Dims): DoorLayout {
  const wi = w - 2 * DOOR.face;
  const bottom = -h / 2 + DOOR.track;
  const top = h / 2 - DOOR.face;
  const ph = top - bottom - DOOR.headTrack - DOOR.ridge - 0.006;
  const pw = wi / 2 + DOOR.overlap / 2;
  return {
    wi,
    bottom,
    top,
    pw,
    ph,
    py: bottom + DOOR.ridge + 0.003 + ph / 2,
    xA: -wi / 2 + pw / 2,
    xB: wi / 2 - pw / 2,
    zA: -DOOR.panelOffset,
    zB: DOOR.panelOffset,
  };
}

function panelFrame(parts: THREE.BufferGeometry[], L: DoorLayout, x: number, z: number): void {
  const { pw, ph, py } = L;
  const S = DOOR.stile;
  const D = DOOR.panelDepth;
  const r = 0.003;
  parts.push(chamfered(S, ph, D, r, x - pw / 2 + S / 2, py, z));
  parts.push(chamfered(S, ph, D, r, x + pw / 2 - S / 2, py, z));
  parts.push(chamfered(pw - 2 * S, DOOR.topRail, D, r, x, py + ph / 2 - DOOR.topRail / 2, z));
  parts.push(chamfered(pw - 2 * S, DOOR.bottomRail, D, r, x, py - ph / 2 + DOOR.bottomRail / 2, z));
}

/** Aluminium: outer frame lining the reveal, bottom track with two ridges, head track, both panel frames. */
export function doorAluminium(d: Dims): THREE.BufferGeometry {
  const { width: w, height: h, wallThickness: t } = d;
  return cached(key('da', w, h, t), () => {
    const F = DOOR.face;
    const L = doorLayout(d);
    const depth = t - 2 * INSET;
    const jambH = L.top - (-h / 2 + INSET);
    const parts: THREE.BufferGeometry[] = [
      chamfered(w - 2 * INSET, F - INSET, depth, 0.003, 0, h / 2 - INSET - (F - INSET) / 2, 0), // head
      chamfered(F - INSET, jambH, depth, 0.003, -(w / 2 - INSET - (F - INSET) / 2), (L.top - h / 2 + INSET) / 2, 0), // jambs
      chamfered(F - INSET, jambH, depth, 0.003, w / 2 - INSET - (F - INSET) / 2, (L.top - h / 2 + INSET) / 2, 0),
      box(L.wi, DOOR.track - INSET, depth, 0, -h / 2 + INSET + (DOOR.track - INSET) / 2, 0), // bottom track
      box(L.wi, DOOR.ridge, 0.012, 0, L.bottom + DOOR.ridge / 2, L.zA), // ridges the panels ride on
      box(L.wi, DOOR.ridge, 0.012, 0, L.bottom + DOOR.ridge / 2, L.zB),
      box(L.wi, DOOR.headTrack, 2 * DOOR.panelOffset + DOOR.panelDepth + 0.01, 0, L.top - DOOR.headTrack / 2, 0), // head track
    ];
    panelFrame(parts, L, L.xA, L.zA);
    panelFrame(parts, L, L.xB, L.zB);
    return merge(parts);
  });
}

/** White trim of the door: interior casing legs to the floor and the exterior brick mould. */
export function doorTrim({ width: w, height: h, wallThickness: t }: Dims): THREE.BufferGeometry {
  return cached(key('dt', w, h, t), () => {
    const parts: THREE.BufferGeometry[] = [];
    casing(parts, CASING_PROFILE, w, h, CASING_IN, t / 2 + TRIM_GAP, Z, -h / 2 + 0.001);
    casing(parts, BRICKMOULD_PROFILE, w, h, BRICKMOULD_IN, -t / 2 - TRIM_GAP, NZ, -h / 2 + 0.001);
    return merge(parts);
  });
}

/** Stainless pulls (interior + exterior) with stand-offs and a thumb-turn on the latch stile of the operating panel. */
export function doorHandle(d: Dims): THREE.BufferGeometry {
  return cached(key('dh', d.width, d.height), () => {
    const L = doorLayout(d);
    const x = L.xB + L.pw / 2 - DOOR.stile / 2;
    const y = -d.height / 2 + DOOR.handleY;
    const front = L.zB + DOOR.panelDepth / 2;
    const back = L.zB - DOOR.panelDepth / 2;
    const parts: THREE.BufferGeometry[] = [];
    const pull = (z0: number, dir: 1 | -1, len: number, standoff: number) => {
      const zc = z0 + dir * (standoff + DOOR.pullR);
      parts.push(new THREE.CylinderGeometry(DOOR.pullR, DOOR.pullR, len, 12).translate(x, y, zc));
      for (const dy of [-len / 2 + 0.03, len / 2 - 0.03]) {
        parts.push(new THREE.CylinderGeometry(0.007, 0.007, standoff + DOOR.pullR, 8).rotateX(Math.PI / 2).translate(x, y + dy, z0 + (dir * (standoff + DOOR.pullR)) / 2));
      }
    };
    pull(front, 1, DOOR.pull, 0.035);
    pull(back, -1, DOOR.pull * 0.8, 0.03);
    // thumb-turn above the interior pull
    parts.push(new THREE.CylinderGeometry(0.014, 0.014, 0.008, 12).rotateX(Math.PI / 2).translate(x, y + DOOR.pull / 2 + 0.05, front + 0.004));
    parts.push(box(0.006, 0.02, 0.006, x, y + DOOR.pull / 2 + 0.05, front + 0.011));
    return merge(parts);
  });
}

/** Half the glazing-unit thickness of a door panel: room-side face at +DOOR_PANE, exterior face at −DOOR_PANE. */
const DOOR_PANE = 0.006;

/**
 * Glazing of both sliding panels as one front-sided mesh (see windowGlazing): the room-side face
 * of each panel faces the room, the exterior face faces the street.
 */
export function doorGlazing(d: Dims): THREE.BufferGeometry {
  return cached(key('dg', d.width, d.height), () => {
    const L = doorLayout(d);
    const gw = L.pw - 2 * DOOR.stile + 2 * GLASS_BURY;
    const gh = L.ph - DOOR.topRail - DOOR.bottomRail + 2 * GLASS_BURY;
    const gy = L.py + (DOOR.bottomRail - DOOR.topRail) / 2;
    return merge([L.xA, L.xB].flatMap((x, i) => {
      const z = i === 0 ? L.zA : L.zB;
      return [pane(gw, gh, x, gy, z + DOOR_PANE, false), pane(gw, gh, x, gy, z - DOOR_PANE, true)];
    }));
  });
}

// ---------------------------------------------------------------------------------------------
// Highlight ring and hit box
// ---------------------------------------------------------------------------------------------

/** z of the front face of the interior casing's back-band. */
const casingFrontZ = (t: number) => t / 2 + TRIM_GAP + CASING_PROUD;

/** z at which the highlight ring floats, just in front of the casing. */
export const highlightZ = (t: number) => casingFrontZ(t) + HIGHLIGHT_D / 2 + 0.002;

/**
 * Thin chamfered ring hugging the outer edge of the interior trim (casing + stool horns + apron);
 * for a door it stops at the floor.
 */
export function highlightFrame({ width: w, height: h }: Dims, isDoor: boolean): THREE.BufferGeometry {
  return cached(key('hl', w, h, isDoor ? 'door' : 'win'), () => {
    const M = HIGHLIGHT_MARGIN;
    const B = HIGHLIGHT_BAR;
    const trimHalf = w / 2 + CASING_W - CASING_IN;
    const ox = (isDoor ? trimHalf : trimHalf + STOOL_HORN) + M + B / 2;
    const top = h / 2 + CASING_W - CASING_IN + M + B / 2;
    const bottom = isDoor ? -h / 2 + 0.006 + B / 2 : -h / 2 + FRAME_FACE + 0.003 - STOOL_T - APRON_H - M - B / 2;
    const sideH = top - bottom - B;
    const sideY = (top + bottom) / 2;
    return merge([
      chamfered(2 * ox + B, B, HIGHLIGHT_D, 0.0015, 0, top, 0),
      chamfered(2 * ox + B, B, HIGHLIGHT_D, 0.0015, 0, bottom, 0),
      chamfered(B, sideH, HIGHLIGHT_D, 0.0015, -ox, sideY, 0),
      chamfered(B, sideH, HIGHLIGHT_D, 0.0015, ox, sideY, 0),
    ]);
  });
}

/** Invisible picking volume: the opening + 10 cm margin, reaching 15 cm out of each wall face. */
export function hitBox({ width: w, height: h, wallThickness: t }: Dims): THREE.BufferGeometry {
  return cached(key('hb', w, h, t), () => new THREE.BoxGeometry(w + 2 * HIT_MARGIN, h + 2 * HIT_MARGIN, t + HIT_DEPTH_EXTRA));
}
