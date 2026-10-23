/**
 * Reusable props. Every function draws into a `Frame` whose origin is on the floor under the
 * piece's centre, with the piece's FRONT toward local +Z (for beds: the foot; for seats, cabinets
 * and appliances: the side you face when using them). Dimensions in metres, real-world sizes.
 *
 * Edges the visitor gets close to are rounded (`rbox`), turned parts are lathes, repeated items
 * (chairs, stools, hangers, pulls, books, jars, fruit, leaves) are instances.
 */
import { NO_ROT, ONE, cylinder, pyramidFrustum, torus } from './builder';
import type { Frame, Vec3, Rot } from './builder';
import type { MatKey } from './materials';

const PI = Math.PI;
const H = PI / 2;

export const BOOK_COLORS = ['#2f3a5a', '#a8705a', '#8fa58a', '#c9a13b', '#dcd3c0', '#3a3d42', '#6b4a32', '#b9664b', '#1f4a3a', '#e8e1d2'];
const GARMENT_COLORS = ['#e9e4d8', '#3a3d42', '#2f3a5a', '#f4f0e7', '#8fa58a', '#8c8f94', '#a8705a', '#dcd3c0', '#5b6670', '#2e3b63'];
const FRUIT_COLORS = ['#c0392b', '#8fbf4d', '#f39c12', '#f1c40f', '#d35400', '#a93226', '#f7b731'];
const LEAF_COLORS = ['#3f7a3c', '#4c8a44', '#356b33', '#5a9a4e', '#2f6a35'];

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

/** Four turned, tapered legs at the corners of a w × d footprint (thicker at the top). */
function taperedLegs(f: Frame, key: MatKey, w: number, d: number, h: number, rTop = 0.025, rBot = 0.016, inset = 0.05, cz = 0, y0 = 0): void {
  const hx = w / 2 - inset;
  const hz = d / 2 - inset;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.cyl(key, rTop, rBot, h, [sx * hx, y0 + h / 2, cz + sz * hz], NO_ROT, 10);
}

/** Four square-section legs. */
function blockLegs(f: Frame, key: MatKey, w: number, d: number, h: number, t = 0.05, y0 = 0, cz = 0): void {
  const hx = w / 2 - t / 2;
  const hz = d / 2 - t / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.rbox(key, t, h, t, Math.min(0.006, t / 4), [sx * hx, y0 + h / 2, cz + sz * hz], { seg: 1 });
}

/** Shaker door / drawer front: a rounded slab with proud stiles and rails. Front face at z + 0.022. */
function shakerFront(f: Frame, key: MatKey, w: number, h: number, pos: Vec3, rails = true): void {
  f.rbox(key, w, h, 0.016, 0.004, [pos[0], pos[1], pos[2] + 0.008], { seg: 1 });
  if (!rails || w < 0.2 || h < 0.2) return;
  const t = 0.006;
  const s = Math.min(0.065, w * 0.2, h * 0.2);
  const z = pos[2] + 0.016 + t / 2;
  f.box(key, s, h, t, [pos[0] - w / 2 + s / 2, pos[1], z]);
  f.box(key, s, h, t, [pos[0] + w / 2 - s / 2, pos[1], z]);
  f.box(key, w - 2 * s, s, t, [pos[0], pos[1] + h / 2 - s / 2, z]);
  f.box(key, w - 2 * s, s, t, [pos[0], pos[1] - h / 2 + s / 2, z]);
}

export interface Hole {
  /** Centre of the cut-out, local x. */
  x: number;
  w: number;
  d: number;
  /** Centre of the cut-out, local z (default: the slab's centre). */
  z?: number;
}

/** Rectangular slab (centred at `pos`) with an optional rectangular cut-out (sinks, a range). */
function slabWithHole(f: Frame, key: MatKey, w: number, t: number, d: number, pos: Vec3, hole?: Hole): void {
  if (!hole) {
    f.rbox(key, w, t, d, Math.min(0.008, t / 2.5), pos, { seg: 1 });
    return;
  }
  const [cx, cy, cz] = pos;
  const hz = hole.z ?? cz;
  const left = hole.x - hole.w / 2 + w / 2;
  const right = w / 2 - (hole.x + hole.w / 2);
  const front = cz + d / 2 - (hz + hole.d / 2);
  const back = hz - hole.d / 2 - (cz - d / 2);
  const r = Math.min(0.006, t / 2.5);
  if (left > 0.01) f.rbox(key, left, t, d, r, [cx - w / 2 + left / 2, cy, cz], { seg: 1 });
  if (right > 0.01) f.rbox(key, right, t, d, r, [cx + w / 2 - right / 2, cy, cz], { seg: 1 });
  if (back > 0.01) f.rbox(key, hole.w, t, back, r, [cx + hole.x, cy, cz - d / 2 + back / 2], { seg: 1 });
  if (front > 0.01) f.rbox(key, hole.w, t, front, r, [cx + hole.x, cy, cz + d / 2 - front / 2], { seg: 1 });
}

/**
 * Cabinet carcass like the real thing: back, two sides, bottom and two front rails — no top (the
 * counter covers it), so a sink or basin set through the counter shows its bowl, not a lid.
 */
function carcass(f: Frame, mat: MatKey, length: number, d: number, y0: number, h: number): void {
  const t = 0.02;
  f.rbox(mat, length, h, t, 0.004, [0, y0 + h / 2, -d / 2 + t / 2], { seg: 1 });
  for (const s of [-1, 1]) f.rbox(mat, t, h, d, 0.004, [s * (length / 2 - t / 2), y0 + h / 2, 0], { seg: 1 });
  f.rbox(mat, length - 2 * t, t, d - t, 0.004, [0, y0 + t / 2, t / 2], { seg: 1 });
  f.box(mat, length - 2 * t, 0.09, t, [0, y0 + h - 0.045, d / 2 - t / 2]);
  f.box(mat, length - 2 * t, 0.04, t, [0, y0 + 0.04, d / 2 - t / 2]);
}

/** Open-topped box: four walls + a floor (basins, tubs). Inside visible from above. */
function hollowBox(f: Frame, key: MatKey, w: number, h: number, d: number, wall: number, pos: Vec3, r = 0.004): void {
  const [x, y, z] = pos;
  f.rbox(key, w, h, wall, r, [x, y + h / 2, z - d / 2 + wall / 2], { seg: 1 });
  f.rbox(key, w, h, wall, r, [x, y + h / 2, z + d / 2 - wall / 2], { seg: 1 });
  f.rbox(key, wall, h, d - 2 * wall, r, [x - w / 2 + wall / 2, y + h / 2, z], { seg: 1 });
  f.rbox(key, wall, h, d - 2 * wall, r, [x + w / 2 - wall / 2, y + h / 2, z], { seg: 1 });
  f.box(key, w - 2 * wall, wall, d - 2 * wall, [x, y + wall / 2, z]);
}

/** Tall arched kitchen faucet standing at `pos` (riser), the spout arching toward +Z. */
function archedFaucet(f: Frame, pos: Vec3, h = 0.26, reach = 0.11): void {
  const [x, y, z] = pos;
  f.cyl('chrome', 0.022, 0.024, 0.012, [x, y + 0.006, z], NO_ROT, 16);
  f.cyl('chrome', 0.013, 0.013, h, [x, y + h / 2, z], NO_ROT, 12);
  f.torus('chrome', reach, 0.011, [x, y + h, z + reach], [0, H, 0], PI, [8, 20]);
  f.cyl('chrome', 0.011, 0.011, 0.035, [x, y + h - 0.0175, z + 2 * reach], NO_ROT, 10);
  f.cyl('chrome', 0.014, 0.012, 0.01, [x, y + h - 0.04, z + 2 * reach], NO_ROT, 10);
  // lever
  f.cyl('chrome', 0.009, 0.009, 0.07, [x + 0.03, y + h * 0.55, z], [0, 0, H], 8);
  f.cyl('chrome', 0.014, 0.014, 0.03, [x + 0.028, y + h * 0.55, z], [0, 0, H], 10);
}

/** Short bathroom faucet (single hole mixer) at `pos`, spout toward +Z. */
function basinFaucet(f: Frame, pos: Vec3): void {
  const [x, y, z] = pos;
  f.cyl('chrome', 0.02, 0.022, 0.01, [x, y + 0.005, z], NO_ROT, 14);
  f.cyl('chrome', 0.014, 0.014, 0.15, [x, y + 0.08, z], NO_ROT, 12);
  f.cyl('chrome', 0.011, 0.011, 0.11, [x, y + 0.15, z + 0.045], [H, 0, 0], 10);
  f.cyl('chrome', 0.006, 0.006, 0.06, [x, y + 0.19, z - 0.01], [-0.4, 0, 0], 8);
}

/** Pump bottle (soap / shampoo). */
function bottle(f: Frame, pos: Vec3, key: MatKey = 'paintWhite', h = 0.17): void {
  f.lathe(key, [[0, 0], [0.028, 0], [0.03, h * 0.6], [0.022, h * 0.78], [0.012, h * 0.8], [0.012, h * 0.88], [0, h * 0.88]], pos, 16);
  f.cyl('chrome', 0.006, 0.006, 0.03, [pos[0], pos[1] + h * 0.88 + 0.015, pos[2]], NO_ROT, 8);
  f.cyl('chrome', 0.005, 0.005, 0.025, [pos[0], pos[1] + h * 0.88 + 0.03, pos[2] + 0.012], [H, 0, 0], 8);
}

export function cardboardBox(f: Frame, w: number, h: number, d: number, pos: Vec3, rot: Rot = NO_ROT): void {
  f.rbox('cardboard', w, h, d, 0.008, [pos[0], pos[1] + h / 2, pos[2]], { seg: 1, rot });
  f.box('paper', 0.05, 0.002, d + 0.002, [pos[0], pos[1] + h + 0.001, pos[2]], rot);
}

// ---------------------------------------------------------------------------------------------
// Beds & bedroom
// ---------------------------------------------------------------------------------------------

export interface BedOpts {
  /** Mattress width. */
  w: number;
  /** Overall length incl. headboard. */
  l: number;
  headH?: number;
  frame?: MatKey;
  duvet?: MatKey;
  throw?: MatKey;
  headboard?: MatKey;
}

/** Bed: upholstered headboard at local -Z (against the wall), foot at +Z. Mattress top 0.58 m. */
export function bed(f: Frame, o: BedOpts): void {
  const { w, l } = o;
  const frame = o.frame ?? 'walnut';
  const duvet = o.duvet ?? 'linenWhite';
  const thr = o.throw ?? 'velvetSage';
  const head = o.headboard ?? 'fabricGrey';
  const headH = o.headH ?? 1.1;
  const ml = l - 0.12;
  const mz = 0.04;
  taperedLegs(f, frame, w + 0.04, ml, 0.14, 0.03, 0.02, 0.08, mz);
  f.rbox(frame, w + 0.08, 0.16, ml + 0.04, 0.01, [0, 0.22, mz], { seg: 1 });
  f.rbox('linenWhite', w, 0.06, ml, 0.015, [0, 0.33, mz], { seg: 1 });
  f.rbox('linenWhite', w, 0.22, ml, 0.05, [0, 0.47, mz], { seg: 2 });
  const top = 0.58;
  const dl = ml - 0.55;
  const dz = mz + ml / 2 - dl / 2;
  f.rbox(duvet, w + 0.1, 0.09, dl, 0.04, [0, top + 0.035, dz], { seg: 2 });
  f.rbox(duvet, w + 0.1, 0.07, 0.3, 0.03, [0, top + 0.085, dz - dl / 2 + 0.17], { seg: 2 });
  f.rbox(thr, w - 0.1, 0.045, 0.5, 0.02, [0, top + 0.1, mz + ml / 2 - 0.42], { seg: 2 });
  const pw = Math.min(0.55, w / 2 - 0.06);
  for (const s of [-1, 1]) f.rbox('linenWhite', pw, 0.13, 0.4, 0.05, [s * (pw / 2 + 0.03), top + 0.1, mz - ml / 2 + 0.26], { seg: 2, rot: [-0.35, 0, 0] });
  f.rbox(frame, w + 0.16, headH, 0.05, 0.01, [0, headH / 2, -l / 2 + 0.025], { seg: 1 });
  f.rbox(head, w + 0.1, headH - 0.35, 0.07, 0.03, [0, 0.3 + (headH - 0.35) / 2, -l / 2 + 0.075], { seg: 2 });
}

export function nightstand(f: Frame, key: MatKey = 'walnut', w = 0.45, withLamp = true): void {
  taperedLegs(f, key, w - 0.04, 0.36, 0.12, 0.016, 0.011, 0.02);
  f.rbox(key, w, 0.4, 0.4, 0.008, [0, 0.32, 0], { seg: 1 });
  f.rbox(key, w + 0.02, 0.025, 0.42, 0.006, [0, 0.5325, 0], { seg: 1 });
  f.rbox(key, w - 0.05, 0.15, 0.014, 0.004, [0, 0.43, 0.207], { seg: 1 });
  f.instance('pull', [0, 0.43, 0.214]);
  if (withLamp) tableLamp(f.at(0, 0.545, -0.02));
}

/** Table lamp: turned brass base, linen drum shade lit from inside. ~0.5 m tall. */
export function tableLamp(f: Frame): void {
  f.lathe('brass', [[0, 0], [0.07, 0], [0.075, 0.015], [0.05, 0.03], [0.035, 0.07], [0.03, 0.13], [0.042, 0.2], [0.028, 0.27], [0.012, 0.3], [0.012, 0.36], [0, 0.36]], [0, 0, 0], 20);
  f.lathe('shade', [[0.13, 0], [0.11, 0.2]], [0, 0.31, 0], 24);
  f.lathe('glow', [[0.125, 0.012], [0.106, 0.19]], [0, 0.31, 0], 20);
  f.sphere('glow', 0.03, [0, 0.4, 0], 10);
}

export function dresser(f: Frame, w = 1.2, h = 0.85, d = 0.5, key: MatKey = 'paintWhite', drawers = 3): void {
  taperedLegs(f, 'walnut', w - 0.06, d - 0.06, 0.1, 0.02, 0.013, 0.02);
  f.rbox(key, w, h - 0.13, d, 0.01, [0, 0.1 + (h - 0.13) / 2, 0], { seg: 1 });
  f.rbox('walnut', w + 0.03, 0.03, d + 0.03, 0.008, [0, h - 0.015, 0], { seg: 1 });
  const dh = (h - 0.17) / drawers;
  const cols = w > 1.0 ? 2 : 1;
  for (let i = 0; i < drawers; i++) {
    const y = 0.12 + dh * i + dh / 2;
    for (let c = 0; c < cols; c++) {
      const dw = (w - 0.06) / cols - 0.012;
      const x = -(w - 0.06) / 2 + ((w - 0.06) / cols) * (c + 0.5);
      f.rbox(key, dw, dh - 0.016, 0.014, 0.004, [x, y, d / 2 + 0.007], { seg: 1 });
      f.instance('pull', [x, y, d / 2 + 0.014]);
    }
  }
}

export function wardrobe(f: Frame, w = 1.2, h = 2.0, d = 0.6, key: MatKey = 'paintWhite'): void {
  f.box('paintBlack', w - 0.04, 0.08, d - 0.06, [0, 0.04, -0.02]);
  f.rbox(key, w, h - 0.12, d, 0.01, [0, 0.08 + (h - 0.12) / 2, 0], { seg: 1 });
  f.rbox(key, w + 0.04, 0.05, d + 0.03, 0.006, [0, h - 0.025, 0.01], { seg: 1 });
  const dw = w / 2 - 0.016;
  for (const s of [-1, 1]) {
    shakerFront(f, key, dw, h - 0.2, [s * (dw / 2 + 0.006), 0.08 + (h - 0.2) / 2 + 0.02, d / 2]);
    f.instance('pull', [s * 0.05, h * 0.52, d / 2 + 0.022], [0, 0, H]);
  }
}

/** Rug: a two-tone woven pattern (border + stripes) fitted to the rug, carpet weave normal. */
export function rug(f: Frame, w: number, d: number, key: MatKey = 'rugCream'): void {
  f.rbox(key, w, 0.016, d, 0.006, [0, 0.008, 0], { seg: 1 });
}

/** Runner / doormat (same material family, thinner). */
export function plainRug(f: Frame, w: number, d: number, key: MatKey): void {
  f.rbox(key, w, 0.012, d, 0.005, [0, 0.006, 0], { seg: 1 });
}

// ---------------------------------------------------------------------------------------------
// Seating & tables
// ---------------------------------------------------------------------------------------------

/** Sofa `w` wide, `seats` cushions, back at local -Z. Seat 0.46 m, arm 0.62 m, back 0.86 m. */
export function sofa(f: Frame, w: number, seats: number, fabric: MatKey = 'fabricCharcoal', d = 0.95, cushions: MatKey[] = ['velvetMustard', 'velvetRust']): void {
  const legH = 0.12;
  const baseH = 0.2;
  taperedLegs(f, 'walnut', w - 0.14, d - 0.14, legH, 0.028, 0.018, 0);
  f.rbox(fabric, w, baseH, d, 0.03, [0, legH + baseH / 2, 0], { seg: 2 });
  const arm = 0.2;
  const armTop = 0.62;
  for (const s of [-1, 1]) f.rbox(fabric, arm, armTop - legH, d, 0.05, [s * (w / 2 - arm / 2), legH + (armTop - legH) / 2, 0], { seg: 3 });
  const backD = 0.14;
  const backTop = 0.86;
  const baseTop = legH + baseH;
  f.rbox(fabric, w - 2 * arm + 0.02, backTop - baseTop + 0.02, backD, 0.04, [0, baseTop + (backTop - baseTop) / 2, -d / 2 + backD / 2], { seg: 2 });
  const inner = w - 2 * arm;
  const cw = inner / seats;
  const seatD = d - backD - 0.05;
  for (let i = 0; i < seats; i++) {
    const x = -inner / 2 + cw * (i + 0.5);
    f.rbox(fabric, cw - 0.025, 0.15, seatD, 0.05, [x, baseTop + 0.065, -d / 2 + backD + 0.015 + seatD / 2], { seg: 3 });
    f.rbox(fabric, cw - 0.03, 0.42, 0.15, 0.06, [x, baseTop + 0.34, -d / 2 + backD + 0.07], { seg: 3, rot: [-0.18, 0, 0] });
  }
  if (cushions.length && seats > 0) {
    f.rbox(cushions[0], 0.42, 0.42, 0.12, 0.06, [-inner / 2 + 0.27, baseTop + 0.35, -d / 2 + backD + 0.2], { seg: 3, rot: [-0.2, 0.25, 0] });
    if (seats > 1 && cushions.length > 1) f.rbox(cushions[1], 0.42, 0.42, 0.12, 0.06, [inner / 2 - 0.27, baseTop + 0.35, -d / 2 + backD + 0.2], { seg: 3, rot: [-0.2, -0.25, 0] });
  }
}

export function armchair(f: Frame, fabric: MatKey = 'leather'): void {
  sofa(f, 0.9, 1, fabric, 0.9, []);
}

export function coffeeTable(f: Frame, w = 1.1, d = 0.6, top: MatKey = 'oak'): void {
  f.rbox(top, w, 0.035, d, 0.01, [0, 0.4, 0], { seg: 2 });
  taperedLegs(f, 'paintBlack', w - 0.1, d - 0.1, 0.385, 0.014, 0.01, 0);
  f.rbox('paintBlack', w - 0.16, 0.012, d - 0.16, 0.004, [0, 0.14, 0], { seg: 1 });
  bookStack(f, [-0.25, 0.42, 0.05], 3, 0.1);
  f.lathe('ceramic', [[0, 0], [0.07, 0], [0.12, 0.05], [0.125, 0.075], [0.11, 0.075], [0.1, 0.055], [0.06, 0.02], [0, 0.015]], [0.28, 0.42, -0.02], 20);
  f.cyl('glow', 0.028, 0.028, 0.07, [0.1, 0.455, 0.14], NO_ROT, 12);
}

/** A few books lying flat, slightly fanned. */
export function bookStack(f: Frame, pos: Vec3, n = 3, size = 0.12): void {
  let y = pos[1];
  for (let i = 0; i < n; i++) {
    const bw = size * (1.6 + (i % 2) * 0.3);
    const bd = size * (1.2 + ((i * 3) % 2) * 0.25);
    const bh = 0.022 + (i % 3) * 0.006;
    f.instance('book', [pos[0], y, pos[2]], [0, ((i % 3) - 1) * 0.12, 0], [bw, bh, bd], BOOK_COLORS[(i * 3 + n) % BOOK_COLORS.length]);
    y += bh;
  }
}

export function diningTable(f: Frame, w: number, l: number, key: MatKey = 'walnut'): void {
  f.rbox(key, w, 0.04, l, 0.01, [0, 0.74, 0], { seg: 2 });
  f.box(key, w - 0.16, 0.08, 0.03, [0, 0.68, l / 2 - 0.085]);
  f.box(key, w - 0.16, 0.08, 0.03, [0, 0.68, -l / 2 + 0.085]);
  f.box(key, 0.03, 0.08, l - 0.16, [w / 2 - 0.085, 0.68, 0]);
  f.box(key, 0.03, 0.08, l - 0.16, [-w / 2 + 0.085, 0.68, 0]);
  taperedLegs(f, key, w, l, 0.72, 0.035, 0.022, 0.085);
  // centrepiece: a vase with stems + a bowl
  f.lathe('ceramic', [[0, 0], [0.06, 0], [0.085, 0.1], [0.045, 0.2], [0.05, 0.27], [0.058, 0.3], [0.045, 0.3], [0.04, 0.27], [0.035, 0.2], [0, 0.18]], [0, 0.76, 0], 20);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2;
    f.cyl('pingpong', 0.003, 0.004, 0.32, [Math.cos(a) * 0.02, 0.76 + 0.42, Math.sin(a) * 0.02], [Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25], 5);
  }
  f.lathe('walnut', [[0, 0], [0.09, 0], [0.13, 0.04], [0.135, 0.05], [0.12, 0.05], [0.08, 0.018], [0, 0.012]], [0.0, 0.76, l * 0.28], 20);
}

/** Dining / desk chair (instanced), seat at 0.45, back at local -Z. */
export function chair(f: Frame, seat = '#ece6da'): void {
  f.instance('chair', [0, 0, 0], NO_ROT, ONE, seat);
}

export function stool(f: Frame): void {
  f.instance('stool', [0, 0, 0]);
}

export function bench(f: Frame, w = 1.0, d = 0.35, h = 0.45, key: MatKey = 'lightOak', cubbies = false): void {
  f.rbox(key, w, 0.04, d, 0.008, [0, h - 0.02, 0], { seg: 1 });
  if (cubbies) {
    for (const s of [-1, 1]) f.rbox(key, 0.025, h - 0.04, d - 0.02, 0.004, [s * (w / 2 - 0.0125), (h - 0.04) / 2, 0], { seg: 1 });
    f.rbox(key, w - 0.05, 0.02, d - 0.04, 0.004, [0, 0.1, 0], { seg: 1 });
    f.rbox(key, 0.02, h - 0.14, d - 0.06, 0.004, [0, 0.11 + (h - 0.14) / 2, 0], { seg: 1 });
    f.rbox('fabricCream', 0.3, 0.2, d - 0.08, 0.02, [-w / 4, 0.21, 0.0], { seg: 2 });
    f.rbox('fabricCharcoal', 0.3, 0.2, d - 0.08, 0.02, [w / 4, 0.21, 0.0], { seg: 2 });
    f.rbox('leatherLight', w - 0.08, 0.05, d - 0.06, 0.02, [0, h + 0.02, 0.0], { seg: 2 });
  } else {
    taperedLegs(f, key, w - 0.04, d - 0.04, h - 0.04, 0.022, 0.015, 0.02);
    f.rbox('leatherLight', w - 0.08, 0.05, d - 0.06, 0.02, [0, h + 0.02, 0.0], { seg: 2 });
  }
}

export function consoleTable(f: Frame, w = 1.1, d = 0.35, key: MatKey = 'oak'): void {
  f.rbox(key, w, 0.03, d, 0.008, [0, 0.8, 0], { seg: 1 });
  taperedLegs(f, 'paintBlack', w - 0.06, d - 0.06, 0.785, 0.012, 0.009, 0.015);
  f.rbox(key, w - 0.1, 0.02, d - 0.1, 0.004, [0, 0.2, 0], { seg: 1 });
  f.lathe('ceramic', [[0, 0], [0.05, 0], [0.075, 0.1], [0.04, 0.2], [0.045, 0.26], [0.035, 0.26], [0.03, 0.2], [0, 0.18]], [w * 0.3, 0.815, 0], 18);
  bookStack(f, [-w * 0.28, 0.815, 0.02], 2, 0.1);
  f.lathe('brass', [[0, 0], [0.06, 0], [0.09, 0.03], [0.095, 0.04], [0.085, 0.04], [0.055, 0.012], [0, 0.008]], [0.02, 0.815, 0.04], 18);
}

export function desk(f: Frame, w = 1.1, d = 0.55, key: MatKey = 'paintWhite'): void {
  f.rbox(key, w, 0.035, d, 0.008, [0, 0.73, 0], { seg: 1 });
  for (const s of [-1, 1]) f.rbox(key, 0.03, 0.72, d - 0.05, 0.005, [s * (w / 2 - 0.02), 0.36, 0], { seg: 1 });
  f.rbox(key, w - 0.1, 0.02, d - 0.15, 0.004, [0, 0.12, -0.03], { seg: 1 });
  f.rbox(key, w - 0.12, 0.09, 0.014, 0.004, [0, 0.66, d / 2 - 0.02], { seg: 1 });
  f.instance('pull', [0, 0.66, d / 2 - 0.013]);
  // laptop
  f.rbox('plasticBlack', 0.32, 0.014, 0.22, 0.004, [0.05, 0.755, 0.05], { seg: 1 });
  f.rbox('plasticBlack', 0.32, 0.21, 0.008, 0.003, [0.05, 0.85, -0.06], { seg: 1, rot: [-0.3, 0, 0] });
  f.box('screen', 0.29, 0.18, 0.003, [0.05, 0.852, -0.055], [-0.3, 0, 0]);
  f.box('screen', 0.28, 0.1, 0.002, [0.05, 0.755 + 0.008, 0.07]);
  // desk lamp + books + mug
  f.cyl('paintBlack', 0.06, 0.07, 0.015, [-0.38, 0.755, -0.12], NO_ROT, 16);
  f.cyl('paintBlack', 0.008, 0.008, 0.35, [-0.38, 0.93, -0.12], [0.35, 0, 0], 8);
  f.lathe('paintBlack', [[0.06, 0], [0.025, 0.1]], [-0.38, 1.05, 0.02], 16, { rot: [0.6, 0, 0] });
  f.sphere('glow', 0.015, [-0.38, 1.07, 0.03], 8);
  bookStack(f, [0.38, 0.748, -0.12], 3, 0.09);
  f.lathe('ceramic', [[0, 0], [0.038, 0], [0.04, 0.09], [0.034, 0.09], [0.032, 0.012], [0, 0.01]], [-0.2, 0.748, 0.14], 14);
}

export function beanBag(f: Frame, key: MatKey): void {
  f.ellipsoid(key, 0.42, 0.25, 0.42, [0, 0.24, 0], 16);
  f.ellipsoid(key, 0.32, 0.17, 0.32, [0, 0.39, -0.06], 14);
}

// ---------------------------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------------------------

/** Open shelving unit: side panels + `levels` shelves, back at local -Z. */
export function shelfUnit(f: Frame, w: number, h: number, d: number, levels: number, key: MatKey = 'lightOak', back = false): void {
  for (const s of [-1, 1]) f.rbox(key, 0.025, h, d, 0.004, [s * (w / 2 - 0.0125), h / 2, 0], { seg: 1 });
  const step = (h - 0.05) / levels;
  for (let i = 0; i <= levels; i++) f.rbox(key, w - 0.05, 0.025, d, 0.004, [0, 0.0225 + step * i, 0], { seg: 1 });
  if (back) f.box(key, w, h, 0.012, [0, h / 2, -d / 2 + 0.006]);
}

/** Industrial metal shelving (open posts) with cardboard boxes and a few bins. */
export function metalShelving(f: Frame, w: number, h: number, d: number, levels: number): void {
  blockLegs(f, 'paintGrey', w, d, h, 0.035);
  const step = (h - 0.05) / levels;
  for (let i = 0; i <= levels; i++) {
    f.box('paintGrey', w - 0.02, 0.03, d - 0.02, [0, 0.05 + step * i, 0]);
    f.box('paintGrey', w - 0.02, 0.012, 0.03, [0, 0.05 + step * i - 0.02, d / 2 - 0.03]);
  }
  for (let i = 0; i < levels; i++) {
    const y = 0.065 + step * i;
    const n = Math.max(1, Math.floor(w / 0.42));
    for (let j = 0; j < n; j++) {
      if ((i + j) % 3 === 2) continue;
      const bw = 0.3 + ((i * 7 + j * 3) % 3) * 0.04;
      const bh = Math.min(step - 0.08, 0.26 + ((i + j) % 2) * 0.08);
      const x = -w / 2 + 0.05 + bw / 2 + (j * (w - 0.1)) / n;
      if ((i * 5 + j) % 4 === 1) f.rbox('paintGrey', bw, bh * 0.8, d - 0.12, 0.01, [x, y + bh * 0.4, 0], { seg: 1 });
      else cardboardBox(f, bw, bh, d - 0.1, [x, y, 0], [0, ((i + j) % 2) * 0.05, 0]);
    }
  }
}

/** Wooden pantry / cold-room shelves with rows of preserve jars. */
export function jarShelves(f: Frame, w: number, h: number, d: number, levels: number): void {
  shelfUnit(f, w, h, d, levels, 'lightOak');
  const step = (h - 0.05) / levels;
  for (let i = 0; i < levels; i++) {
    const y = 0.035 + step * i;
    const n = Math.floor((w - 0.1) / 0.12);
    for (let j = 0; j < n; j++) {
      if ((i * 5 + j) % 4 === 3) continue;
      const x = -w / 2 + 0.1 + j * 0.12;
      const s = 0.85 + ((i + j) % 3) * 0.15;
      f.instance('jar', [x, y, (((i * 3 + j) % 2) - 0.5) * 0.06], NO_ROT, [s, s * (0.9 + ((i * j) % 2) * 0.3), s]);
    }
  }
}

export function bookshelf(f: Frame, w = 0.9, h = 1.8, d = 0.3, levels = 4): void {
  shelfUnit(f, w, h, d, levels, 'walnut', true);
  const step = (h - 0.05) / levels;
  for (let i = 0; i < levels; i++) {
    const y = 0.035 + step * i;
    let x = -w / 2 + 0.05;
    let j = 0;
    while (x < w / 2 - 0.1) {
      const bw = 0.022 + ((i * 3 + j) % 4) * 0.009;
      const bh = 0.17 + ((i + j * 2) % 4) * 0.028;
      const lean = j % 9 === 8 ? -0.18 : 0;
      f.instance('book', [x + bw / 2 - lean * 0.08, y, 0.0], [0, 0, lean], [bw, bh, d - 0.09], BOOK_COLORS[(i * 2 + j) % BOOK_COLORS.length]);
      x += bw + 0.003;
      j++;
      if (j % 7 === 6) x += 0.07;
    }
    // a small object on every other shelf
    if (i % 2 === 1) f.lathe('ceramic', [[0, 0], [0.04, 0], [0.05, 0.06], [0.03, 0.12], [0.035, 0.14], [0.028, 0.14], [0.025, 0.12], [0, 0.11]], [w / 2 - 0.09, y, 0.02], 14);
  }
}

/** Closet rod with hanging garments along local X, at height `h`; back (the wall) at -Z. */
export function hangerRod(f: Frame, length: number, h = 1.7, withShelf = true): void {
  f.cyl('chrome', 0.012, 0.012, length, [0, h, 0], [0, 0, H], 10);
  for (const s of [-1, 1]) {
    f.rbox('chrome', 0.03, 0.03, 0.26, 0.006, [s * (length / 2 - 0.02), h, -0.13], { seg: 1 });
    f.box('chrome', 0.06, 0.1, 0.012, [s * (length / 2 - 0.02), h, -0.26]);
  }
  if (withShelf) f.rbox('paintWhite', length, 0.025, 0.35, 0.004, [0, h + 0.22, -0.05], { seg: 1 });
  const n = Math.floor((length - 0.1) / 0.11);
  for (let i = 0; i < n; i++) {
    const x = -length / 2 + 0.08 + i * 0.11;
    const yaw = ((i * 7) % 5 - 2) * 0.06;
    f.instance('hangerHook', [x, h + 0.012, 0], [0, yaw, 0]);
    const gh = 0.55 + ((i * 5) % 4) * 0.12;
    const gd = 0.8 + ((i * 3) % 3) * 0.3;
    f.instance('garment', [x, h + 0.012, 0], [0, yaw, 0], [1, gh / 0.7, gd], GARMENT_COLORS[i % GARMENT_COLORS.length]);
  }
}

/** Hook rail on a wall at -Z with a couple of coats. */
export function coatHooks(f: Frame, w: number, y = 1.6): void {
  f.rbox('lightOak', w, 0.07, 0.02, 0.004, [0, y, 0.01], { seg: 1 });
  const n = Math.max(2, Math.floor(w / 0.25));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + w / (n * 2) + (i * w) / n;
    f.cyl('brass', 0.007, 0.007, 0.07, [x, y - 0.01, 0.055], [H, 0, 0], 8);
    f.sphere('brass', 0.011, [x, y - 0.01, 0.092], 8);
    if (i % 2 === 0) f.instance('garment', [x, y + 0.02, 0.07], [0, (i % 4 === 0 ? 1 : -1) * 0.15, 0], [0.75, 0.95, 1.6], i % 4 === 0 ? '#3a3d42' : '#a8705a');
  }
}

export function linenStack(f: Frame, w: number, levels: number, h: number): void {
  shelfUnit(f, w, h, 0.35, levels, 'paintWhite');
  const step = (h - 0.05) / levels;
  const cols: MatKey[] = ['towel', 'fabricCream', 'fabricSage', 'linenWhite', 'fabricNavy', 'fabricBlush'];
  for (let i = 0; i < levels; i++) {
    for (let j = 0; j < 2; j++) {
      const x = -w / 4 + (j * w) / 2;
      const y0 = 0.035 + step * i;
      f.rbox(cols[(i + j) % cols.length], w / 2 - 0.1, 0.06, 0.3, 0.02, [x, y0 + 0.03, 0], { seg: 2 });
      f.rbox(cols[(i + j + 2) % cols.length], w / 2 - 0.12, 0.055, 0.28, 0.02, [x, y0 + 0.0875, 0], { seg: 2 });
      f.rbox(cols[(i + j + 4) % cols.length], w / 2 - 0.13, 0.05, 0.27, 0.02, [x, y0 + 0.14, 0], { seg: 2 });
    }
  }
}

export function wallShelf(f: Frame, w: number, y: number, d = 0.25, key: MatKey = 'lightOak'): void {
  f.rbox(key, w, 0.03, d, 0.006, [0, y, d / 2], { seg: 1 });
  for (const s of [-1, 1]) f.box('paintBlack', 0.02, 0.1, d - 0.04, [s * (w / 2 - 0.06), y - 0.065, d / 2 - 0.02]);
}

// ---------------------------------------------------------------------------------------------
// Kitchen & laundry
// ---------------------------------------------------------------------------------------------

export interface CabinetOpts {
  doors?: boolean;
  mat?: MatKey;
  counter?: boolean;
  /** Counter overhang toward -Z (breakfast bar). */
  overhang?: number;
  /** Sink / range cut-out in the counter (local coordinates of the cabinet run). */
  hole?: Hole;
  /** A row of drawers above the doors. */
  drawers?: boolean;
  /** Local x ranges to leave without doors (an appliance fills them). */
  skip?: [number, number][];
  /** Local x range the doors are laid out in (default: the whole run). */
  doorSpan?: [number, number];
}

/** Base cabinets along local X (length), shaker doors facing +Z, stone counter. Top at `h`. */
export function baseCabinets(f: Frame, length: number, d = 0.6, h = 0.9, o: CabinetOpts = {}): void {
  const mat = o.mat ?? 'paintWhite';
  f.box('paintBlack', length - 0.02, 0.1, d - 0.08, [0, 0.05, -0.04]);
  const bodyH = h - 0.14;
  carcass(f, mat, length, d, 0.1, bodyH);
  if (o.doors ?? true) {
    const [s0, s1] = o.doorSpan ?? [-length / 2, length / 2];
    const n = Math.max(1, Math.round((s1 - s0) / 0.55));
    const dw = (s1 - s0) / n;
    for (let i = 0; i < n; i++) {
      const x = s0 + dw * i + dw / 2;
      if (o.skip?.some(([a, b]) => x > a && x < b)) continue;
      const doorW = dw - 0.016;
      if (o.drawers) {
        const drH = 0.16;
        shakerFront(f, mat, doorW, drH, [x, h - 0.06 - drH / 2, d / 2]);
        f.instance('pull', [x, h - 0.06 - drH / 2, d / 2 + 0.022]);
        const doorH = bodyH - drH - 0.05;
        shakerFront(f, mat, doorW, doorH, [x, 0.12 + doorH / 2, d / 2]);
        f.instance('pull', [x + (i % 2 === 0 ? 1 : -1) * (doorW / 2 - 0.05), 0.12 + doorH - 0.1, d / 2 + 0.022], [0, 0, H]);
      } else {
        const doorH = bodyH - 0.03;
        shakerFront(f, mat, doorW, doorH, [x, 0.115 + doorH / 2, d / 2]);
        f.instance('pull', [x + (i % 2 === 0 ? 1 : -1) * (doorW / 2 - 0.05), 0.115 + doorH - 0.1, d / 2 + 0.022], [0, 0, H]);
      }
    }
  }
  if (o.counter ?? true) {
    const over = o.overhang ?? 0;
    slabWithHole(f, 'counter', length + 0.03, 0.04, d + 0.03 + over, [0, h - 0.02, -over / 2], o.hole);
  }
}

export function upperCabinets(f: Frame, length: number, bottom = 1.45, h = 0.75, d = 0.35): void {
  f.rbox('paintWhite', length, h, d, 0.005, [0, bottom + h / 2, 0], { seg: 1 });
  f.box('paintWhite', length + 0.02, 0.05, d + 0.015, [0, bottom + h - 0.025, 0.005]);
  const n = Math.max(1, Math.round(length / 0.45));
  const dw = length / n;
  for (let i = 0; i < n; i++) {
    const x = -length / 2 + dw * i + dw / 2;
    shakerFront(f, 'paintWhite', dw - 0.016, h - 0.08, [x, bottom + h / 2 - 0.02, d / 2]);
    f.instance('knob', [x + (i % 2 === 0 ? 1 : -1) * (dw / 2 - 0.05), bottom + 0.1, d / 2 + 0.022]);
  }
  // under-cabinet light strip
  f.box('glow', length - 0.1, 0.008, 0.02, [0, bottom + 0.004, d / 2 - 0.03]);
}

/** Under-mount stainless sink in a counter whose top is at `top` (the cut-out comes from the cabinets). */
export function sink(f: Frame, top = 0.9, w = 0.6, d = 0.42): void {
  hollowBox(f, 'steel', w, 0.2, d, 0.008, [0, top - 0.205, 0]);
  f.cyl('plasticBlack', 0.03, 0.03, 0.004, [0, top - 0.195, 0], NO_ROT, 14);
  f.cyl('chrome', 0.035, 0.035, 0.003, [0, top - 0.193, 0], NO_ROT, 16, true);
  archedFaucet(f, [0, top, -d / 2 - 0.05]);
  bottle(f, [w / 2 - 0.08, top, -d / 2 - 0.06], 'ceramic', 0.15);
}

/** 30" slide-in gas range: oven door with window, control strip with five knobs, four burners. */
export function rangeSlideIn(f: Frame, d = 0.65): void {
  const w = 0.76;
  f.box('plasticBlack', w - 0.04, 0.1, d - 0.08, [0, 0.05, -0.04]);
  f.rbox('steel', w, 0.8, d, 0.01, [0, 0.5, 0], { seg: 1 });
  // oven door + handle
  f.rbox('steel', w - 0.04, 0.5, 0.025, 0.008, [0, 0.4, d / 2 + 0.012], { seg: 1 });
  f.box('screen', 0.5, 0.2, 0.004, [0, 0.42, d / 2 + 0.027]);
  for (const s of [-1, 1]) f.cyl('chrome', 0.011, 0.011, 0.05, [s * 0.3, 0.62, d / 2 + 0.05], [H, 0, 0], 8);
  f.cyl('chrome', 0.013, 0.013, 0.68, [0, 0.62, d / 2 + 0.075], [0, 0, H], 12);
  // storage drawer below
  f.rbox('steel', w - 0.04, 0.12, 0.02, 0.006, [0, 0.19, d / 2 + 0.01], { seg: 1 });
  // control strip at the front edge of the top
  f.rbox('steel', w, 0.07, 0.07, 0.008, [0, 0.935, d / 2 - 0.035], { seg: 1 });
  f.box('screen', 0.14, 0.03, 0.004, [0, 0.94, d / 2 + 0.002]);
  for (const x of [-0.3, -0.19, 0.19, 0.3]) f.instance('knob', [x, 0.935, d / 2 + 0.002], NO_ROT, [1.6, 1.6, 1]);
  // cooktop: black enamel + four burners with cast grates
  f.rbox('screen', w - 0.02, 0.014, d - 0.1, 0.004, [0, 0.907, -0.03], { seg: 1 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * 0.19;
      const z = -0.04 + sz * 0.13;
      f.cyl('paintBlack', 0.045, 0.045, 0.016, [x, 0.922, z], NO_ROT, 16);
      f.cyl('paintBlack', 0.028, 0.028, 0.01, [x, 0.935, z], NO_ROT, 12);
      f.box('paintBlack', 0.25, 0.008, 0.012, [x, 0.935, z - 0.125]);
      f.box('paintBlack', 0.25, 0.008, 0.012, [x, 0.935, z + 0.125]);
      f.box('paintBlack', 0.012, 0.008, 0.25, [x - 0.125, 0.935, z]);
      f.box('paintBlack', 0.012, 0.008, 0.25, [x + 0.125, 0.935, z]);
      f.box('paintBlack', 0.25, 0.006, 0.01, [x, 0.936, z], [0, PI / 4, 0]);
      f.box('paintBlack', 0.25, 0.006, 0.01, [x, 0.936, z], [0, -PI / 4, 0]);
    }
  }
}

/**
 * Stainless island chimney hood hanging from the ceiling (`ceiling`), canopy bottom at `bottom`:
 * a pyramid canopy (w × d base tapering to a 0.32 m square top over 0.28 m) on a 6 mm folded rim
 * lip, its underside a plate with a 2 cm recess holding a 0.7 × 0.3 baffle-filter tray (three
 * grooves) between two lamps, and a two-piece telescoping chimney (3 mm seam at mid-height).
 */
export function rangeHood(f: Frame, bottom: number, ceiling: number, w = 0.9, d = 0.5): void {
  const lip = 0.006;
  const canopyH = 0.28;
  const topW = 0.32;
  // folded rim lip: a 6 mm band around the base, 2 mm proud of the sloped faces above it
  const ow = w + 0.004;
  const od = d + 0.004;
  for (const s of [-1, 1]) {
    f.box('steel', ow, lip, lip, [0, bottom + lip / 2, s * (od / 2 - lip / 2)]);
    f.box('steel', lip, lip, od - 2 * lip, [s * (ow / 2 - lip / 2), bottom + lip / 2, 0]);
  }
  f.geom('steel', pyramidFrustum(w, d, topW, topW, canopyH - lip), [0, bottom + lip, 0]);
  // underside: a plate (inside the lip) around the filter recess
  const pt = 0.004;
  const pw = ow - 2 * lip;
  const pd = od - 2 * lip;
  const tw = 0.7;
  const td = 0.3;
  const rec = 0.02;
  const sideW = (pw - tw) / 2;
  const sideD = (pd - td) / 2;
  for (const s of [-1, 1]) {
    f.box('steel', sideW, pt, pd, [s * (tw / 2 + sideW / 2), bottom + pt / 2, 0]);
    f.box('steel', tw, pt, sideD, [0, bottom + pt / 2, s * (td / 2 + sideD / 2)]);
    // recess reveal, 2 cm tall
    f.box('steel', tw, rec, pt, [0, bottom + rec / 2, s * (td / 2 - pt / 2)]);
    f.box('steel', pt, rec, td, [s * (tw / 2 - pt / 2), bottom + rec / 2, 0]);
  }
  // baffle tray at the top of the recess, three dark grooves along it
  f.box('steel', tw + 0.004, 0.01, td + 0.004, [0, bottom + rec + 0.005, 0]);
  for (const z of [-0.075, 0, 0.075]) f.box('plasticBlack', tw - 0.06, 0.006, 0.016, [0, bottom + rec + 0.002, z]);
  // lamps in the plate either side of the tray
  for (const s of [-1, 1]) f.cyl('glow', 0.025, 0.025, 0.004, [s * (tw / 2 + sideW / 2), bottom - 0.001, 0], NO_ROT, 12);
  // chimney: the lower duct cover sits on the canopy, the upper one telescopes 3 mm inside it
  const c0 = bottom + canopyH;
  const mid = (c0 + ceiling) / 2;
  f.rbox('steel', 0.25, mid - c0, 0.25, 0.004, [0, (c0 + mid) / 2, 0], { seg: 1 });
  f.rbox('steel', 0.244, ceiling - mid, 0.244, 0.004, [0, (mid + ceiling) / 2, 0], { seg: 1 });
}

/** French-door fridge, doors on +Z. */
export function fridge(f: Frame, w = 0.9, h = 1.78, d = 0.72): void {
  f.box('plasticBlack', w - 0.06, 0.06, d - 0.1, [0, 0.03, -0.03]);
  f.rbox('steel', w, h - 0.06, d, 0.015, [0, 0.06 + (h - 0.06) / 2, 0], { seg: 2 });
  const split = h * 0.6;
  const doorW = w / 2 - 0.012;
  for (const s of [-1, 1]) {
    f.rbox('steel', doorW, h - split - 0.08, 0.03, 0.012, [s * (doorW / 2 + 0.006), split + (h - split - 0.08) / 2 + 0.02, d / 2 + 0.015], { seg: 2 });
    const hx = s * 0.055;
    for (const dy of [-0.2, 0.2]) f.cyl('chrome', 0.009, 0.009, 0.04, [hx, split + 0.45 + dy, d / 2 + 0.05], [H, 0, 0], 8);
    f.cyl('chrome', 0.012, 0.012, 0.5, [hx, split + 0.45, d / 2 + 0.072], NO_ROT, 12);
  }
  f.rbox('steel', w - 0.024, split - 0.09, 0.03, 0.012, [0, 0.07 + (split - 0.09) / 2, d / 2 + 0.015], { seg: 2 });
  for (const s of [-1, 1]) f.cyl('chrome', 0.009, 0.009, 0.04, [s * 0.25, split - 0.1, d / 2 + 0.05], [H, 0, 0], 8);
  f.cyl('chrome', 0.012, 0.012, 0.58, [0, split - 0.1, d / 2 + 0.072], [0, 0, H], 12);
}

/** Integrated dishwasher front panel in a cabinet run (front at +Z, counter above). */
export function dishwasherFront(f: Frame, w = 0.6, h = 0.86): void {
  f.rbox('steel', w - 0.012, h - 0.14, 0.02, 0.006, [0, 0.1 + (h - 0.14) / 2, 0.01], { seg: 1 });
  f.box('plasticBlack', w - 0.06, 0.03, 0.004, [0, h - 0.07, 0.022]);
  for (const s of [-1, 1]) f.cyl('chrome', 0.008, 0.008, 0.035, [s * (w / 2 - 0.08), h - 0.13, 0.037], [H, 0, 0], 8);
  f.cyl('chrome', 0.011, 0.011, w - 0.12, [0, h - 0.13, 0.055], [0, 0, H], 10);
}

/** Front-loading washer / dryer, door on +Z. */
export function appliance(f: Frame, kind: 'washer' | 'dryer'): void {
  const s = 0.6;
  f.box('plasticBlack', s - 0.06, 0.04, s - 0.08, [0, 0.02, -0.02]);
  f.rbox('appliance', s, 0.81, s, 0.02, [0, 0.445, 0], { seg: 2 });
  // porthole: chrome ring, dark drum behind a domed glass
  f.torus('chrome', 0.19, 0.02, [0, 0.42, s / 2 + 0.01]);
  f.cyl('plasticBlack', 0.17, 0.17, 0.02, [0, 0.42, s / 2], [H, 0, 0], 24);
  f.cyl('paintGrey', 0.14, 0.14, 0.004, [0, 0.42, s / 2 + 0.012], [H, 0, 0], 24);
  f.ellipsoid('glass', 0.17, 0.17, 0.05, [0, 0.42, s / 2 + 0.02], 20);
  // control panel
  f.rbox('appliance', s - 0.04, 0.1, 0.03, 0.006, [0, 0.8, s / 2 - 0.01], { seg: 1 });
  f.box('screen', 0.16, 0.05, 0.004, [-0.1, 0.8, s / 2 + 0.006]);
  f.instance('knob', [0.17, 0.8, s / 2 + 0.006], NO_ROT, [1.8, 1.8, 1]);
  if (kind === 'washer') f.box('plasticBlack', 0.2, 0.03, 0.004, [-0.1, 0.72, s / 2 + 0.003]);
}

/** Ceramic bowl with fruit, base at the origin. */
export function fruitBowl(f: Frame): void {
  f.lathe('ceramic', [[0, 0], [0.07, 0], [0.14, 0.035], [0.17, 0.09], [0.16, 0.095], [0.145, 0.085], [0.12, 0.045], [0, 0.025]], [0, 0, 0], 24);
  const spots: [number, number, number][] = [[0, 0.03, 0], [0.07, 0.035, 0.02], [-0.06, 0.035, 0.04], [0.02, 0.04, -0.07], [-0.03, 0.04, -0.03], [0.05, 0.06, -0.04], [-0.01, 0.075, 0.03]];
  spots.forEach(([x, y, z], i) => {
    const s = 0.85 + (i % 3) * 0.12;
    f.instance('fruit', [x, y, z], [0, i * 0.7, 0], [s, s * (i % 2 === 0 ? 1 : 1.15), s], FRUIT_COLORS[i % FRUIT_COLORS.length]);
  });
}

// ---------------------------------------------------------------------------------------------
// Bathroom
// ---------------------------------------------------------------------------------------------

/** Toilet; tank against the wall at -Z, elongated bowl toward +Z. */
export function toilet(f: Frame): void {
  f.lathe('ceramic', [[0, 0], [0.14, 0], [0.17, 0.04], [0.15, 0.18], [0.19, 0.3], [0.2, 0.37], [0.19, 0.39], [0, 0.39]], [0, 0, 0.1], 24, { scale: [1, 1, 1.3] });
  f.geom('ceramic', torus(0.165, 0.03, PI * 2, 8, 28), [0, 0.405, 0.1], { rot: [H, 0, 0], scale: [1, 1.3, 0.45], uv: { kind: 'native', su: 1, sv: 0.2 } });
  f.geom('ceramic', cylinder(0.185, 0.185, 0.02, 28), [0, 0.43, 0.09], { scale: [1, 1, 1.3], uv: { kind: 'native', su: 1.2, sv: 0.02 } });
  f.rbox('ceramic', 0.4, 0.4, 0.17, 0.015, [0, 0.59, -0.205], { seg: 2 });
  f.rbox('ceramic', 0.42, 0.03, 0.19, 0.008, [0, 0.805, -0.205], { seg: 1 });
  f.cyl('chrome', 0.018, 0.018, 0.012, [0.12, 0.826, -0.205], NO_ROT, 12);
  for (const s of [-1, 1]) f.cyl('chrome', 0.012, 0.012, 0.03, [s * 0.1, 0.43, -0.07], NO_ROT, 8);
}

export function pedestalSink(f: Frame): void {
  f.lathe('ceramic', [[0.1, 0], [0.11, 0.02], [0.07, 0.12], [0.06, 0.5], [0.09, 0.68], [0.13, 0.72]], [0, 0, 0], 20);
  f.lathe('ceramic', [[0, 0], [0.14, 0], [0.24, 0.05], [0.28, 0.12], [0.28, 0.14], [0.25, 0.14], [0.24, 0.12], [0.17, 0.04], [0.06, 0.02], [0, 0.02]], [0, 0.72, 0.04], 24, { scale: [1, 1, 0.85] });
  basinFaucet(f, [0, 0.86, -0.2]);
  bottle(f, [0.2, 0.86, -0.16], 'paintWhite', 0.14);
}

/** Vanity cabinet with a stone top, 1 or 2 under-mount basins; back against the wall at -Z. */
export function vanity(f: Frame, w: number, basins: 1 | 2, d = 0.55, h = 0.86, mat: MatKey = 'paintWhite'): void {
  const xs = basins === 2 ? [-w / 4, w / 4] : [0];
  f.box('paintBlack', w - 0.06, 0.1, d - 0.08, [0, 0.05, -0.04]);
  const bodyH = h - 0.14;
  carcass(f, mat, w, d, 0.1, bodyH);
  const n = Math.max(1, Math.round(w / 0.45));
  const dw = w / n;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + dw * (i + 0.5);
    const doorH = bodyH - 0.03;
    shakerFront(f, mat, dw - 0.016, doorH, [x, 0.115 + doorH / 2, d / 2]);
    f.instance('pull', [x + (i % 2 === 0 ? 1 : -1) * (dw / 2 - 0.05), 0.115 + doorH - 0.1, d / 2 + 0.022], [0, 0, H]);
  }
  for (const x of xs) {
    slabWithHole(f, 'counter', basins === 2 ? w / 2 + 0.015 : w + 0.03, 0.04, d + 0.03, [x, h - 0.02, 0.01], { x: 0, w: 0.4, d: 0.34 });
    // under-mount basin: its rim sits inside the counter slab, the bowl shows through the cut-out
    f.lathe('ceramic', [[0, 0], [0.1, 0], [0.18, 0.05], [0.215, 0.13], [0.215, 0.145], [0.195, 0.145], [0.19, 0.13], [0.16, 0.05], [0.08, 0.025], [0, 0.025]], [x, h - 0.175, 0.01], 24, { scale: [1, 1, 0.85] });
    f.cyl('chrome', 0.02, 0.02, 0.003, [x, h - 0.148, 0.01], NO_ROT, 12);
    basinFaucet(f, [x, h, -d / 2 + 0.09]);
  }
  bottle(f, [w / 2 - 0.12, h, -d / 2 + 0.12], 'paintWhite', 0.16);
  f.rbox('towel', 0.3, 0.06, 0.2, 0.02, [-w / 2 + 0.22, h + 0.03, 0.02], { seg: 2 });
}

export function mirror(f: Frame, w: number, h: number, yCentre: number, frame: MatKey = 'plasticBlack'): void {
  f.rbox(frame, w + 0.06, h + 0.06, 0.025, 0.004, [0, yCentre, 0.0125], { seg: 1 });
  f.box('mirror', w, h, 0.012, [0, yCentre, 0.028]);
}

/** Framed abstract canvas on a wall at -Z. */
export function picture(f: Frame, w: number, h: number, yCentre: number, art: MatKey, frame: MatKey = 'oak'): void {
  f.rbox(frame, w + 0.06, h + 0.06, 0.03, 0.004, [0, yCentre, 0.015], { seg: 1 });
  f.box('linenWhite', w + 0.0, h + 0.0, 0.012, [0, yCentre, 0.031]);
  f.box(art, w - 0.06, h - 0.06, 0.012, [0, yCentre, 0.033]);
}

/** Freestanding oval tub, long axis along local X, `w` wide. Rim at `h`. */
export function tub(f: Frame, l = 1.7, w = 0.8, h = 0.58): void {
  const r = w / 2;
  const prof: [number, number][] = [[0, 0], [r - 0.1, 0], [r - 0.02, 0.06], [r, 0.25], [r, h - 0.03], [r - 0.03, h], [r - 0.09, h], [r - 0.11, h - 0.04], [r - 0.11, 0.2], [r - 0.2, 0.09], [0, 0.08]];
  f.lathe('ceramic', prof, [0, 0, 0], 32, { scale: [l / w, 1, 1] });
  f.geom('water', cylinder(r - 0.12, r - 0.12, 0.004, 32), [0, h - 0.12, 0], { scale: [l / w, 1, 1], uv: { kind: 'native', su: 1, sv: 1 } });
  // floor-mounted filler on the +Z side
  f.cyl('chrome', 0.03, 0.035, 0.012, [0.0, 0.006, r + 0.14], NO_ROT, 16);
  f.cyl('chrome', 0.014, 0.014, 0.9, [0.0, 0.45, r + 0.14], NO_ROT, 12);
  f.torus('chrome', 0.1, 0.011, [0.0, 0.9, r + 0.04], [0, -H, 0], PI, [8, 18]);
  f.cyl('chrome', 0.011, 0.011, 0.04, [0.0, 0.88, r - 0.06], NO_ROT, 10);
  f.cyl('chrome', 0.006, 0.006, 0.07, [0.03, 0.6, r + 0.14], [0, 0, H], 8);
  // towel over one end
  f.rbox('towel', 0.3, 0.06, 0.5, 0.02, [-l / 2 + 0.22, h + 0.01, 0], { seg: 2 });
  bottle(f, [l / 2 - 0.25, h, r - 0.06], 'paintWhite', 0.15);
}

/** Alcove tub with shower: long axis along X, wall at -Z; riser + head at the -X end. */
export function tubShower(f: Frame, l = 1.5, w = 0.7, h = 0.55): void {
  const t = 0.05;
  f.rbox('ceramic', l, h, t, 0.015, [0, h / 2, w / 2 - t / 2], { seg: 1 });
  f.rbox('ceramic', l, h, t, 0.015, [0, h / 2, -w / 2 + t / 2], { seg: 1 });
  f.rbox('ceramic', t, h, w - 2 * t, 0.015, [-l / 2 + t / 2, h / 2, 0], { seg: 1 });
  f.rbox('ceramic', t, h, w - 2 * t, 0.015, [l / 2 - t / 2, h / 2, 0], { seg: 1 });
  f.box('ceramic', l - 2 * t, 0.06, w - 2 * t, [0, 0.03, 0]);
  f.box('water', l - 0.12, 0.004, w - 0.12, [0, h - 0.1, 0]);
  f.cyl('chrome', 0.03, 0.03, 0.004, [l / 2 - 0.22, 0.062, 0], NO_ROT, 14);
  // shower: riser, head, mixer, spout
  const rx = -l / 2 + 0.1;
  const wz = -w / 2 + 0.03;
  f.cyl('chrome', 0.013, 0.013, 1.45, [rx, h + 0.75, wz], NO_ROT, 10);
  f.cyl('chrome', 0.011, 0.011, 0.3, [rx, h + 1.5, wz + 0.14], [H, 0, 0], 8);
  f.cyl('chrome', 0.07, 0.07, 0.02, [rx, h + 1.47, wz + 0.29], [0.55, 0, 0], 20);
  f.cyl('chrome', 0.045, 0.045, 0.04, [rx, h + 0.45, wz], [H, 0, 0], 16);
  f.cyl('chrome', 0.008, 0.008, 0.1, [rx + 0.04, h + 0.45, wz + 0.03], [0, 0, H], 8);
  f.cyl('chrome', 0.011, 0.011, 0.12, [rx, h + 0.15, wz + 0.05], [H, 0, 0], 10);
  // glass screen on the shower end
  f.box('glass', 0.8, 1.45, 0.008, [-l / 2 + 0.4, h + 0.725, w / 2 - 0.02]);
  f.rbox('chrome', 0.8, 0.025, 0.025, 0.006, [-l / 2 + 0.4, h + 1.45, w / 2 - 0.02], { seg: 1 });
  f.rbox('chrome', 0.025, 1.45, 0.025, 0.006, [-l / 2 + 0.8, h + 0.725, w / 2 - 0.02], { seg: 1 });
  f.rbox('chrome', 0.025, 1.45, 0.025, 0.006, [-l / 2 + 0.0125, h + 0.725, w / 2 - 0.02], { seg: 1 });
  bottle(f, [l / 2 - 0.12, h, -w / 2 + 0.08], 'paintWhite', 0.18);
  bottle(f, [l / 2 - 0.2, h, -w / 2 + 0.1], 'fabricSage', 0.14);
  f.rbox('towel', 0.3, 0.05, 0.22, 0.02, [l / 2 - 0.3, h + 0.025, w / 2 - 0.12], { seg: 2 });
}

/**
 * Glass shower stall: tray w×d, back wall at -Z, solid side wall at -X·side; glass on the
 * +X·side and +Z faces (side = -1 mirrors it for a corner on the other hand).
 */
export function showerStall(f: Frame, w = 1.0, d = 1.0, h = 2.0, side: 1 | -1 = 1): void {
  const gx = (w / 2 - 0.006) * side;
  const rx = (-w / 2 + 0.3) * side;
  f.rbox('ceramic', w, 0.08, d, 0.015, [0, 0.04, 0], { seg: 1 });
  f.box('ceramic', w - 0.1, 0.004, d - 0.1, [0, 0.081, 0]);
  f.cyl('chrome', 0.045, 0.045, 0.004, [rx * 0.3, 0.084, 0.1], NO_ROT, 16);
  f.box('glass', 0.008, h - 0.08, d, [gx, 0.08 + (h - 0.08) / 2, 0]);
  f.box('glass', w - 0.012, h - 0.08, 0.008, [-0.006 * side, 0.08 + (h - 0.08) / 2, d / 2 - 0.006]);
  f.rbox('chrome', 0.025, h - 0.08, 0.025, 0.006, [(w / 2 - 0.0125) * side, 0.08 + (h - 0.08) / 2, d / 2 - 0.0125], { seg: 1 });
  f.rbox('chrome', 0.025, 0.025, d, 0.006, [(w / 2 - 0.0125) * side, h - 0.0125, 0], { seg: 1 });
  f.rbox('chrome', w, 0.025, 0.025, 0.006, [0, h - 0.0125, d / 2 - 0.0125], { seg: 1 });
  f.rbox('chrome', 0.025, 0.025, 0.04, 0.006, [(-w / 2 + 0.0125) * side, 1.0, d / 2 - 0.006], { seg: 1 });
  f.rbox('chrome', 0.025, 0.025, 0.04, 0.006, [(-w / 2 + 0.0125) * side, 1.7, d / 2 - 0.006], { seg: 1 });
  f.cyl('chrome', 0.009, 0.009, 0.3, [(w / 2 - 0.06) * side, 1.1, d / 2 + 0.02], NO_ROT, 10);
  for (const dy of [-0.12, 0.12]) f.cyl('chrome', 0.007, 0.007, 0.035, [(w / 2 - 0.06) * side, 1.1 + dy, d / 2 + 0.006], [H, 0, 0], 8);
  // rain head on a ceiling arm, riser, thermostatic mixer
  f.cyl('chrome', 0.011, 0.011, 0.3, [rx, h - 0.15, -d / 2 + 0.15], [H, 0, 0], 8);
  f.cyl('chrome', 0.1, 0.1, 0.012, [rx, h - 0.16, -d / 2 + 0.3], NO_ROT, 24);
  f.cyl('chrome', 0.013, 0.013, 1.2, [rx, 1.1, -d / 2 + 0.025], NO_ROT, 10);
  f.cyl('chrome', 0.045, 0.045, 0.04, [rx, 1.05, -d / 2 + 0.03], [H, 0, 0], 16);
  f.cyl('chrome', 0.008, 0.008, 0.09, [rx + 0.04 * side, 1.05, -d / 2 + 0.06], [0, 0, H], 8);
  // corner shelf with bottles
  f.box('counter', 0.25, 0.02, 0.25, [(-w / 2 + 0.13) * side, 1.0, -d / 2 + 0.13], [0, side * PI / 4, 0]);
  bottle(f, [(-w / 2 + 0.1) * side, 1.01, -d / 2 + 0.1], 'paintWhite', 0.17);
  bottle(f, [(-w / 2 + 0.2) * side, 1.01, -d / 2 + 0.16], 'fabricSage', 0.13);
}

/** Chrome towel bar on a wall at -Z with a hanging towel. */
export function towelBar(f: Frame, w = 0.6, y = 1.1): void {
  for (const s of [-1, 1]) f.cyl('chrome', 0.012, 0.012, 0.06, [s * (w / 2 - 0.03), y, 0.03], [H, 0, 0], 8);
  f.cyl('chrome', 0.009, 0.009, w, [0, y, 0.06], [0, 0, H], 10);
  f.rbox('towel', w - 0.14, 0.52, 0.045, 0.015, [0, y - 0.24, 0.062], { seg: 2 });
}

// ---------------------------------------------------------------------------------------------
// Living room & misc
// ---------------------------------------------------------------------------------------------

export function tvUnit(f: Frame, w = 1.4, key: MatKey = 'walnut'): void {
  taperedLegs(f, 'paintBlack', w - 0.1, 0.34, 0.12, 0.014, 0.01, 0.02);
  f.rbox(key, w, 0.36, 0.42, 0.01, [0, 0.3, 0], { seg: 1 });
  const dw = w / 2 - 0.012;
  for (const s of [-1, 1]) {
    f.rbox(key, dw, 0.3, 0.014, 0.004, [s * (dw / 2 + 0.006), 0.3, 0.214], { seg: 1 });
    f.instance('pull', [s * 0.06, 0.3, 0.221]);
  }
  f.rbox('plasticBlack', 0.3, 0.05, 0.2, 0.01, [w * 0.3, 0.505, -0.05], { seg: 1 });
}

/** Thin TV standing on a surface at `y` (screen faces +Z). */
export function tv(f: Frame, w = 1.2, y = 0.5): void {
  const h = w * 0.56;
  f.rbox('plasticBlack', w, h, 0.03, 0.004, [0, y + 0.1 + h / 2, 0], { seg: 1 });
  f.box('screen', w - 0.02, h - 0.02, 0.004, [0, y + 0.1 + h / 2, 0.017]);
  f.rbox('plasticBlack', 0.25, 0.1, 0.03, 0.006, [0, y + 0.05, -0.01], { seg: 1 });
  f.rbox('plasticBlack', 0.6, 0.012, 0.2, 0.004, [0, y + 0.006, 0], { seg: 1 });
}

/** Floor lamp: brass stem, linen drum shade lit from inside. 1.6 m. */
export function floorLamp(f: Frame): void {
  f.lathe('brass', [[0, 0], [0.14, 0], [0.15, 0.012], [0.09, 0.025], [0.03, 0.035], [0.012, 0.05], [0, 0.05]], [0, 0, 0], 24);
  f.cyl('brass', 0.011, 0.011, 1.4, [0, 0.74, 0], NO_ROT, 10);
  f.lathe('shade', [[0.21, 0], [0.19, 0.34]], [0, 1.3, 0], 28);
  f.lathe('glow', [[0.2, 0.012], [0.182, 0.33]], [0, 1.3, 0], 24);
  f.sphere('glow', 0.035, [0, 1.45, 0], 10);
}

/** Potted plant: terracotta pot (lathe), soil, 10–16 leaves radially (tall: on a trunk). */
export function plant(f: Frame, tall = false): void {
  const ph = tall ? 0.38 : 0.24;
  const pr = tall ? 0.17 : 0.13;
  f.lathe('terracotta', [[0, 0], [pr - 0.04, 0], [pr, ph - 0.02], [pr + 0.01, ph], [pr - 0.015, ph], [pr - 0.03, ph - 0.03], [pr - 0.05, 0.04], [0, 0.03]], [0, 0, 0], 24);
  f.cyl('soil', pr - 0.025, pr - 0.025, 0.01, [0, ph - 0.035, 0], NO_ROT, 20);
  if (tall) {
    f.cyl('walnut', 0.018, 0.028, 1.0, [0, ph - 0.04 + 0.5, 0], NO_ROT, 8);
    const n = 16;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const y = ph + 0.45 + t * 0.55;
      const az = i * 2.4 + 0.3;
      const tilt = 0.45 + ((i * 7) % 5) * 0.12;
      const s = 1.0 + ((i * 3) % 3) * 0.2;
      f.at(0, y, 0, az).instance('leaf', [0, 0, 0.02], [tilt, 0, 0], [s, s, s], LEAF_COLORS[i % LEAF_COLORS.length]);
    }
  } else {
    const n = 12;
    for (let i = 0; i < n; i++) {
      const az = (i / n) * PI * 2 + (i % 2) * 0.2;
      const tilt = 0.5 + ((i * 5) % 4) * 0.18;
      const s = 0.8 + ((i * 3) % 3) * 0.2;
      f.at(0, ph - 0.03, 0, az).instance('leaf', [0, 0, 0.03], [tilt, 0, 0], [s, s, s], LEAF_COLORS[i % LEAF_COLORS.length]);
    }
  }
}

/** Sedan facing local +Z (front at +Z), ~4.5 × 1.8 m, 1.42 m high. */
export function car(f: Frame): void {
  const L = 4.5;
  const W = 1.8;
  f.box('plasticBlack', W - 0.3, 0.2, L - 0.9, [0, 0.28, 0]);
  f.rbox('carPaint', W, 0.55, L, 0.12, [0, 0.6, 0], { seg: 3 });
  // cabin: tinted glass band, roof, pillars
  f.rbox('carGlass', W - 0.22, 0.42, 2.3, 0.1, [0, 1.08, -0.25], { seg: 3 });
  f.rbox('carPaint', W - 0.34, 0.07, 1.95, 0.025, [0, 1.3, -0.3], { seg: 2 });
  for (const s of [-1, 1]) {
    f.rbox('carPaint', 0.06, 0.44, 0.09, 0.015, [s * (W / 2 - 0.16), 1.08, 0.75], { seg: 1, rot: [0.55, 0, 0] });
    f.rbox('carPaint', 0.06, 0.44, 0.09, 0.015, [s * (W / 2 - 0.14), 1.08, -0.3], { seg: 1 });
    f.rbox('carPaint', 0.06, 0.44, 0.09, 0.015, [s * (W / 2 - 0.16), 1.08, -1.3], { seg: 1, rot: [-0.5, 0, 0] });
    // mirrors
    f.rbox('carPaint', 0.16, 0.08, 0.1, 0.02, [s * (W / 2 + 0.06), 0.98, 0.65], { seg: 1 });
    // wheels
    for (const sz of [-1, 1]) {
      f.cyl('tyre', 0.33, 0.33, 0.235, [s * 0.78, 0.33, sz * 1.45], [0, 0, H], 28);
      f.cyl('chrome', 0.21, 0.21, 0.24, [s * 0.78, 0.33, sz * 1.45], [0, 0, H], 20);
      f.cyl('plasticBlack', 0.06, 0.06, 0.25, [s * 0.78, 0.33, sz * 1.45], [0, 0, H], 10);
    }
    // lights
    f.rbox('headlight', 0.42, 0.12, 0.06, 0.02, [s * 0.58, 0.74, L / 2 - 0.02], { seg: 1, rot: [0, s * 0.25, 0] });
    f.rbox('taillight', 0.34, 0.1, 0.05, 0.02, [s * 0.6, 0.76, -L / 2 + 0.015], { seg: 1 });
    // door seam lines
    f.box('plasticBlack', 0.004, 0.42, 0.008, [s * (W / 2 + 0.001), 0.62, -0.3]);
  }
  f.rbox('plasticBlack', 0.9, 0.18, 0.05, 0.02, [0, 0.52, L / 2 - 0.01], { seg: 1 });
  f.rbox('plasticBlack', W - 0.1, 0.14, 0.14, 0.05, [0, 0.4, L / 2 - 0.04], { seg: 2 });
  f.rbox('plasticBlack', W - 0.1, 0.14, 0.14, 0.05, [0, 0.4, -L / 2 + 0.04], { seg: 2 });
  f.box('paper', 0.3, 0.1, 0.006, [0, 0.55, -L / 2 - 0.003]);
  f.box('paper', 0.3, 0.1, 0.006, [0, 0.42, L / 2 + 0.003]);
}

export function pingPongTable(f: Frame): void {
  const L = 2.74;
  const W = 1.525;
  f.rbox('pingpong', L, 0.025, W, 0.006, [0, 0.76, 0], { seg: 1 });
  f.box('paper', L, 0.003, 0.02, [0, 0.774, 0]);
  f.box('paper', L, 0.003, 0.02, [0, 0.774, W / 2 - 0.01]);
  f.box('paper', L, 0.003, 0.02, [0, 0.774, -W / 2 + 0.01]);
  f.box('paper', 0.02, 0.003, W, [L / 2 - 0.01, 0.774, 0]);
  f.box('paper', 0.02, 0.003, W, [-L / 2 + 0.01, 0.774, 0]);
  blockLegs(f, 'paintGrey', L - 0.5, W - 0.3, 0.745, 0.04);
  f.box('paintGrey', L - 0.5, 0.04, 0.04, [0, 0.3, (W - 0.3) / 2 - 0.02]);
  f.box('paintGrey', L - 0.5, 0.04, 0.04, [0, 0.3, -(W - 0.3) / 2 + 0.02]);
  f.box('fabricCharcoal', 0.006, 0.15, W + 0.3, [0, 0.76 + 0.085, 0]);
  f.box('paper', 0.01, 0.012, W + 0.3, [0, 0.76 + 0.155, 0]);
  for (const s of [-1, 1]) f.rbox('paintBlack', 0.03, 0.17, 0.03, 0.006, [0, 0.76 + 0.085, s * (W / 2 + 0.14)], { seg: 1 });
  f.cyl('fabricRust', 0.08, 0.08, 0.012, [0.6, 0.78, 0.3], [0, 0, 0], 18);
  f.rbox('walnut', 0.03, 0.012, 0.1, 0.004, [0.6, 0.78, 0.42], { seg: 1 });
  f.cyl('plasticBlack', 0.08, 0.08, 0.012, [-0.7, 0.78, -0.25], [0, 0, 0], 18);
  f.rbox('walnut', 0.03, 0.012, 0.1, 0.004, [-0.7, 0.78, -0.37], { seg: 1 });
  f.sphere('paper', 0.02, [-0.4, 0.795, -0.2], 8);
}

export function furnace(f: Frame, ceiling: number): void {
  f.rbox('paintGrey', 0.6, 1.5, 0.7, 0.012, [0, 0.75, 0], { seg: 1 });
  f.rbox('paintGrey', 0.5, 0.5, 0.02, 0.006, [0, 0.5, 0.355], { seg: 1 });
  f.box('plasticBlack', 0.3, 0.18, 0.01, [0, 1.1, 0.355]);
  f.box('screen', 0.1, 0.04, 0.004, [0, 1.12, 0.362]);
  f.cyl('steel', 0.09, 0.09, ceiling - 1.5, [0.1, 1.5 + (ceiling - 1.5) / 2, -0.1], NO_ROT, 16);
  f.rbox('steel', 0.4, 0.3, 0.3, 0.01, [0.1, ceiling - 0.5, -0.1], { seg: 1 });
  f.rbox('steel', 0.25, 0.25, 1.2, 0.01, [0.1, ceiling - 0.3, 0.5], { seg: 1 });
  f.cyl('steel', 0.05, 0.05, 1.0, [-0.2, 1.75, -0.2], [0, 0, H], 12);
}

export function waterHeater(f: Frame): void {
  f.cyl('appliance', 0.3, 0.3, 1.46, [0, 0.77, 0], NO_ROT, 24);
  f.cyl('paintGrey', 0.31, 0.31, 0.06, [0, 0.03, 0], NO_ROT, 24);
  f.lathe('appliance', [[0.3, 0], [0.26, 0.05], [0.12, 0.08], [0, 0.08]], [0, 1.5, 0], 24);
  for (const s of [-1, 1]) f.cyl('chrome', 0.015, 0.015, 0.9, [s * 0.1, 2.0, 0], NO_ROT, 8);
  f.box('paintGrey', 0.14, 0.1, 0.03, [0, 0.4, 0.3]);
  f.cyl('chrome', 0.012, 0.012, 0.12, [0.25, 0.25, 0.1], [0, 0, H], 8);
}

export function electricalPanel(f: Frame): void {
  f.rbox('paintGrey', 0.4, 0.7, 0.1, 0.006, [0, 1.5, 0.05], { seg: 1 });
  f.rbox('paintGrey', 0.36, 0.64, 0.012, 0.004, [0, 1.5, 0.106], { seg: 1 });
  f.box('plasticBlack', 0.01, 0.2, 0.014, [0.14, 1.5, 0.108]);
  f.cyl('steel', 0.02, 0.02, 0.4, [-0.1, 1.05, 0.03], NO_ROT, 10);
}

/** Workbench with a pegboard, toolbox and jars. */
export function workbench(f: Frame, w = 1.8, d = 0.6): void {
  f.rbox('lightOak', w, 0.05, d, 0.006, [0, 0.875, 0], { seg: 1 });
  blockLegs(f, 'paintGrey', w - 0.08, d - 0.08, 0.85, 0.05);
  f.rbox('lightOak', w - 0.2, 0.025, d - 0.1, 0.004, [0, 0.25, 0], { seg: 1 });
  f.rbox('fabricRust', 0.45, 0.2, 0.22, 0.01, [-0.4, 1.0, 0], { seg: 1 });
  f.cyl('plasticBlack', 0.01, 0.01, 0.2, [-0.4, 1.12, 0], [0, 0, H], 8);
  f.rbox('paintGrey', 0.3, 0.03, 0.2, 0.006, [0.3, 0.915, -0.1], { seg: 1 });
  f.instance('jar', [0.65, 0.9, -0.15]);
  f.instance('jar', [0.52, 0.9, -0.1], NO_ROT, [0.8, 0.8, 0.8]);
  f.rbox('cardboard', w, 0.8, 0.02, 0.004, [0, 1.5, -d / 2 - 0.01], { seg: 1 });
  for (let i = 0; i < 6; i++) {
    const x = -w / 2 + 0.25 + i * 0.26;
    f.cyl('chrome', 0.006, 0.006, 0.06, [x, 1.75, -d / 2 + 0.03], [H, 0, 0], 6);
    f.rbox(i % 2 ? 'paintGrey' : 'plasticBlack', 0.035, 0.28 + (i % 3) * 0.08, 0.025, 0.006, [x, 1.58 - (i % 3) * 0.04, -d / 2 + 0.03], { seg: 1 });
  }
}
