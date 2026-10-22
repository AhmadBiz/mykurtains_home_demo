import type { Frame } from './builder';
import type { MatKey } from './materials';

/**
 * Reusable low-poly props. Every function draws into a `Frame` whose origin is on the floor
 * under the piece's centre, with the piece's FRONT toward local +Z (for beds: the foot; for
 * seats, cabinets and appliances: the side you face when using them). Dimensions in metres.
 */

const PI = Math.PI;
const H = PI / 2;

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

function legs(f: Frame, key: MatKey, w: number, d: number, h: number, t = 0.05, y0 = 0): void {
  const hx = w / 2 - t / 2;
  const hz = d / 2 - t / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.box(key, t, h, t, [sx * hx, y0 + h / 2, sz * hz]);
}

function roundLegs(f: Frame, key: MatKey, w: number, d: number, h: number, r = 0.015): void {
  const hx = w / 2 - r * 2;
  const hz = d / 2 - r * 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.cyl(key, r, r, h, [sx * hx, h / 2, sz * hz], undefined, 8);
}

function handle(f: Frame, pos: readonly [number, number, number], len = 0.14, vertical = false): void {
  if (vertical) f.box('brass', 0.012, len, 0.012, pos);
  else f.box('brass', len, 0.012, 0.012, pos);
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
}

/** Bed: headboard at local -Z (against the wall), foot at +Z. */
export function bed(f: Frame, o: BedOpts): void {
  const { w, l } = o;
  const frame = o.frame ?? 'walnut';
  const duvet = o.duvet ?? 'linen';
  const thr = o.throw ?? 'sage';
  const headH = o.headH ?? 1.05;
  const baseH = 0.22;
  legs(f, frame, w, l - 0.1, 0.12, 0.06);
  f.box(frame, w + 0.04, baseH, l - 0.06, [0, 0.12 + baseH / 2, 0.03]);
  // mattress + sheet
  f.box('white', w, 0.2, l - 0.14, [0, 0.44, 0.0]);
  // duvet covers the lower 2/3, slightly wider so it drapes over the sides
  const dl = (l - 0.14) * 0.66;
  f.box(duvet, w + 0.06, 0.09, dl, [0, 0.575, (l - 0.14) / 2 - dl / 2]);
  // folded throw at the foot
  f.box(thr, w - 0.16, 0.05, 0.42, [0, 0.645, (l - 0.14) / 2 - 0.3]);
  // pillows
  const pw = Math.min(0.5, w / 2 - 0.08);
  for (const s of [-1, 1]) f.box('white', pw, 0.12, 0.36, [s * (pw / 2 + 0.04), 0.6, -(l - 0.14) / 2 + 0.26]);
  // headboard
  f.box(frame, w + 0.1, headH, 0.06, [0, headH / 2, -l / 2 + 0.03]);
}

export function nightstand(f: Frame, key: MatKey = 'walnut', w = 0.45, withLamp = true): void {
  f.box(key, w, 0.5, 0.4, [0, 0.3, 0]);
  legs(f, 'black', w - 0.04, 0.36, 0.05, 0.03);
  f.box(key, w - 0.06, 0.16, 0.01, [0, 0.42, 0.205]);
  handle(f, [0, 0.42, 0.215], 0.1);
  if (withLamp) tableLamp(f.at(0, 0.55, 0));
}

export function tableLamp(f: Frame, shade: MatKey = 'linen'): void {
  f.cyl('brass', 0.07, 0.09, 0.02, [0, 0.01, 0], undefined, 12);
  f.cyl('brass', 0.012, 0.012, 0.28, [0, 0.16, 0], undefined, 8);
  f.cyl(shade, 0.1, 0.14, 0.18, [0, 0.37, 0], undefined, 14);
}

export function dresser(f: Frame, w = 1.2, h = 0.85, d = 0.5, key: MatKey = 'white', drawers = 3): void {
  f.box(key, w, h - 0.06, d, [0, 0.06 + (h - 0.06) / 2, 0]);
  legs(f, 'black', w - 0.06, d - 0.06, 0.06, 0.04);
  f.box('oak', w + 0.02, 0.025, d + 0.02, [0, h - 0.0125, 0]);
  const dh = (h - 0.14) / drawers;
  for (let i = 0; i < drawers; i++) {
    const y = 0.1 + dh * i + dh / 2;
    f.box(key, w - 0.08, dh - 0.03, 0.012, [0, y, d / 2 + 0.004]);
    handle(f, [0, y, d / 2 + 0.018], Math.min(0.2, w * 0.25));
  }
}

export function wardrobe(f: Frame, w = 1.2, h = 2.0, d = 0.6, key: MatKey = 'white'): void {
  f.box(key, w, h, d, [0, h / 2, 0]);
  f.box('oak', w + 0.02, 0.03, d + 0.02, [0, h - 0.015, 0]);
  // two doors with a seam + handles
  f.box('walnut', 0.006, h - 0.12, 0.012, [0, h / 2, d / 2 + 0.004]);
  for (const s of [-1, 1]) handle(f, [s * 0.05, h * 0.55, d / 2 + 0.014], 0.22, true);
}

export function rug(f: Frame, w: number, d: number, key: MatKey = 'cream'): void {
  f.box(key, w, 0.012, d, [0, 0.006, 0]);
  f.box('linen', w - 0.16, 0.013, d - 0.16, [0, 0.0065, 0]);
}

/** Plain rug without the inner border (runners, doormats). */
export function plainRug(f: Frame, w: number, d: number, key: MatKey): void {
  f.box(key, w, 0.012, d, [0, 0.006, 0]);
}

// ---------------------------------------------------------------------------------------------
// Seating & tables
// ---------------------------------------------------------------------------------------------

/** Sofa `w` wide, `seats` cushions, back at local -Z. */
export function sofa(f: Frame, w: number, seats: number, fabric: MatKey = 'charcoal', d = 0.9): void {
  const arm = 0.18;
  legs(f, 'black', w - 0.1, d - 0.1, 0.1, 0.05);
  f.box(fabric, w, 0.32, d, [0, 0.1 + 0.16, 0]);
  const inner = w - arm * 2;
  const cw = inner / seats;
  for (let i = 0; i < seats; i++) {
    const x = -inner / 2 + cw * i + cw / 2;
    f.box(fabric, cw - 0.03, 0.16, d - 0.3, [x, 0.5, 0.08]);
    f.box(fabric, cw - 0.05, 0.42, 0.16, [x, 0.72, -d / 2 + 0.26]);
  }
  f.box(fabric, w, 0.5, 0.2, [0, 0.58, -d / 2 + 0.1]);
  for (const s of [-1, 1]) f.box(fabric, arm, 0.55, d, [s * (w / 2 - arm / 2), 0.1 + 0.275, 0]);
}

export function armchair(f: Frame, fabric: MatKey = 'leather'): void {
  sofa(f, 0.85, 1, fabric, 0.85);
}

export function coffeeTable(f: Frame, w = 1.1, d = 0.6, top: MatKey = 'oak'): void {
  f.box(top, w, 0.04, d, [0, 0.42, 0]);
  roundLegs(f, 'black', w - 0.08, d - 0.08, 0.4, 0.018);
  f.box('black', w - 0.2, 0.012, d - 0.2, [0, 0.16, 0]);
  // a couple of books + a bowl
  f.box('navy', 0.25, 0.03, 0.18, [-0.2, 0.455, 0.05]);
  f.box('rust', 0.22, 0.025, 0.16, [-0.2, 0.4825, 0.03]);
  f.lathe('ceramic', [[0.0, 0], [0.09, 0], [0.12, 0.05], [0.1, 0.07]], [0.25, 0.44, 0], 14);
}

export function diningTable(f: Frame, w: number, l: number, key: MatKey = 'walnut'): void {
  f.box(key, w, 0.04, l, [0, 0.74, 0]);
  legs(f, key, w - 0.12, l - 0.12, 0.72, 0.07);
  f.lathe('ceramic', [[0.0, 0], [0.07, 0], [0.09, 0.12], [0.05, 0.22], [0.07, 0.3]], [0, 0.76, 0], 14);
}

/** Dining / desk chair, seat at 0.45, back at local -Z. */
export function chair(f: Frame, key: MatKey = 'oak', seat: MatKey = 'linen'): void {
  f.box(key, 0.44, 0.035, 0.44, [0, 0.44, 0]);
  f.box(seat, 0.4, 0.035, 0.4, [0, 0.475, 0]);
  roundLegs(f, key, 0.42, 0.42, 0.44, 0.016);
  for (const s of [-1, 1]) f.box(key, 0.03, 0.42, 0.03, [s * 0.19, 0.67, -0.2]);
  f.box(key, 0.4, 0.22, 0.025, [0, 0.76, -0.2]);
}

export function stool(f: Frame): void {
  f.cyl('walnut', 0.17, 0.17, 0.05, [0, 0.675, 0], undefined, 14);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + PI / 4;
    f.cyl('black', 0.012, 0.012, 0.66, [Math.cos(a) * 0.12, 0.33, Math.sin(a) * 0.12], [0, 0, 0], 6);
  }
  f.torus('black', 0.13, 0.008, [0, 0.22, 0], [H, 0, 0]);
}

export function bench(f: Frame, w = 1.0, d = 0.35, h = 0.45, key: MatKey = 'oak', cubbies = false): void {
  f.box(key, w, 0.04, d, [0, h - 0.02, 0]);
  legs(f, key, w - 0.04, d - 0.04, h - 0.04, 0.04);
  if (cubbies) {
    f.box(key, w, 0.02, d - 0.04, [0, 0.14, 0]);
    f.box(key, 0.02, h - 0.1, d - 0.06, [0, h / 2, 0]);
    f.box('cardboard', 0.3, 0.2, 0.26, [-w / 4, 0.26, 0.02]);
  }
}

export function consoleTable(f: Frame, w = 1.1, d = 0.35, key: MatKey = 'oak'): void {
  f.box(key, w, 0.03, d, [0, 0.8, 0]);
  legs(f, 'black', w - 0.06, d - 0.06, 0.785, 0.025);
  f.box(key, w - 0.1, 0.02, d - 0.1, [0, 0.2, 0]);
  f.lathe('ceramic', [[0.0, 0], [0.06, 0], [0.08, 0.12], [0.04, 0.2], [0.05, 0.26]], [w * 0.3, 0.815, 0], 12);
  f.box('navy', 0.22, 0.03, 0.15, [-w * 0.3, 0.83, 0]);
}

export function desk(f: Frame, w = 1.1, d = 0.55, key: MatKey = 'white'): void {
  f.box(key, w, 0.035, d, [0, 0.73, 0]);
  for (const s of [-1, 1]) f.box(key, 0.03, 0.72, d - 0.05, [s * (w / 2 - 0.02), 0.36, 0]);
  f.box(key, w - 0.1, 0.02, d - 0.15, [0, 0.12, 0]);
  // laptop
  f.box('grey', 0.32, 0.015, 0.22, [0.05, 0.755, 0.05]);
  f.box('grey', 0.32, 0.21, 0.01, [0.05, 0.86, -0.06], [-0.25, 0, 0]);
  f.box('screen', 0.29, 0.18, 0.005, [0.05, 0.86, -0.052], [-0.25, 0, 0]);
  f.box('oak', 0.2, 0.025, 0.15, [-0.35, 0.76, -0.1]);
}

export function beanBag(f: Frame, key: MatKey): void {
  f.ellipsoid(key, 0.42, 0.26, 0.42, [0, 0.24, 0], 12);
  f.ellipsoid(key, 0.3, 0.16, 0.3, [0, 0.4, -0.05], 10);
}

// ---------------------------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------------------------

/** Open shelving unit: side panels + `levels` shelves, back at local -Z. */
export function shelfUnit(f: Frame, w: number, h: number, d: number, levels: number, key: MatKey = 'oak', back = false): void {
  for (const s of [-1, 1]) f.box(key, 0.025, h, d, [s * (w / 2 - 0.0125), h / 2, 0]);
  const step = (h - 0.05) / levels;
  for (let i = 0; i <= levels; i++) f.box(key, w - 0.05, 0.025, d, [0, 0.02 + step * i, 0]);
  if (back) f.box(key, w, h, 0.012, [0, h / 2, -d / 2 + 0.006]);
}

/** Industrial metal shelving (open posts) with cardboard boxes. */
export function metalShelving(f: Frame, w: number, h: number, d: number, levels: number): void {
  legs(f, 'grey', w, d, h, 0.035);
  const step = (h - 0.05) / levels;
  for (let i = 0; i <= levels; i++) f.box('grey', w - 0.02, 0.02, d - 0.02, [0, 0.05 + step * i, 0]);
  for (let i = 0; i < levels; i++) {
    const y = 0.06 + step * i;
    const n = Math.max(1, Math.floor(w / 0.42));
    for (let j = 0; j < n; j++) {
      if ((i + j) % 3 === 2) continue;
      const bw = 0.3 + ((i * 7 + j * 3) % 3) * 0.04;
      const bh = Math.min(step - 0.08, 0.26 + ((i + j) % 2) * 0.08);
      const x = -w / 2 + 0.05 + bw / 2 + j * (w - 0.1) / n;
      f.box('cardboard', bw, bh, d - 0.1, [x, y + bh / 2, 0]);
    }
  }
}

/** Wooden pantry / cold-room shelves with rows of jars. */
export function jarShelves(f: Frame, w: number, h: number, d: number, levels: number): void {
  shelfUnit(f, w, h, d, levels, 'oak');
  const step = (h - 0.05) / levels;
  for (let i = 0; i < levels; i++) {
    const y = 0.035 + step * i;
    const n = Math.floor((w - 0.1) / 0.13);
    for (let j = 0; j < n; j++) {
      if ((i * 5 + j) % 4 === 3) continue;
      const x = -w / 2 + 0.1 + j * 0.13;
      const r = 0.04 + ((i + j) % 2) * 0.012;
      const jh = 0.11 + ((i * 3 + j) % 3) * 0.03;
      f.cyl('jar', r, r, jh, [x, y + jh / 2, 0], undefined, 10);
      f.cyl('brass', r + 0.004, r + 0.004, 0.015, [x, y + jh + 0.0075, 0], undefined, 10);
    }
  }
}

export function bookshelf(f: Frame, w = 0.9, h = 1.8, d = 0.3, levels = 4): void {
  shelfUnit(f, w, h, d, levels, 'walnut', true);
  const step = (h - 0.05) / levels;
  const colours: MatKey[] = ['navy', 'rust', 'sage', 'mustard', 'cream', 'charcoal'];
  for (let i = 0; i < levels; i++) {
    const y = 0.035 + step * i;
    let x = -w / 2 + 0.06;
    let j = 0;
    while (x < w / 2 - 0.12) {
      const bw = 0.025 + ((i * 3 + j) % 3) * 0.01;
      const bh = 0.17 + ((i + j * 2) % 4) * 0.025;
      f.box(colours[(i * 2 + j) % colours.length], bw, bh, d - 0.1, [x + bw / 2, y + bh / 2, 0.0]);
      x += bw + 0.004;
      j++;
      if (j % 7 === 6) x += 0.08;
    }
  }
}

/** Closet rod with hanging garments along local X, at height `h`; back (the wall) at -Z. */
export function hangerRod(f: Frame, length: number, h = 1.7, withShelf = true): void {
  f.cyl('chrome', 0.012, 0.012, length, [0, h, 0], [0, 0, H], 8);
  for (const s of [-1, 1]) f.box('chrome', 0.03, 0.03, 0.26, [s * (length / 2 - 0.02), h, -0.13]);
  if (withShelf) f.box('white', length, 0.025, 0.35, [0, h + 0.22, -0.05]);
  const colours: MatKey[] = ['linen', 'charcoal', 'navy', 'white', 'sage', 'greyFabric', 'rust', 'cream'];
  const n = Math.floor((length - 0.1) / 0.11);
  for (let i = 0; i < n; i++) {
    const x = -length / 2 + 0.08 + i * 0.11;
    f.box('brass', 0.008, 0.08, 0.008, [x, h + 0.03, 0]);
    const gh = 0.55 + ((i * 5) % 4) * 0.12;
    const gd = 0.36 + ((i * 3) % 3) * 0.04;
    f.box(colours[i % colours.length], 0.035, gh, gd, [x, h - 0.01 - gh / 2, 0]);
  }
}

export function coatHooks(f: Frame, w: number, y = 1.6): void {
  f.box('oak', w, 0.06, 0.02, [0, y, 0.01]);
  const n = Math.max(2, Math.floor(w / 0.25));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + w / (n * 2) + (i * w) / n;
    f.cyl('brass', 0.008, 0.008, 0.06, [x, y - 0.01, 0.045], [H, 0, 0], 6);
    if (i % 2 === 0) f.box(i % 4 === 0 ? 'charcoal' : 'rust', 0.26, 0.62, 0.1, [x, y - 0.36, 0.07]);
  }
}

// ---------------------------------------------------------------------------------------------
// Kitchen & laundry
// ---------------------------------------------------------------------------------------------

/** Base cabinets along local X (length), doors facing +Z, quartz counter. */
export function baseCabinets(f: Frame, length: number, d = 0.6, h = 0.9, doors = true): void {
  f.box('black', length, 0.1, d - 0.06, [0, 0.05, -0.03]);
  f.box('white', length, h - 0.14, d, [0, 0.1 + (h - 0.14) / 2, 0]);
  f.box('quartz', length + 0.02, 0.04, d + 0.03, [0, h - 0.02, 0.015]);
  if (doors) {
    const n = Math.max(1, Math.round(length / 0.6));
    const dw = length / n;
    for (let i = 0; i < n; i++) {
      const x = -length / 2 + dw * i + dw / 2;
      f.box('white', dw - 0.02, h - 0.2, 0.012, [x, 0.1 + (h - 0.14) / 2, d / 2 + 0.004]);
      handle(f, [x + dw / 2 - 0.08, h - 0.16, d / 2 + 0.016], 0.12, true);
    }
  }
}

export function upperCabinets(f: Frame, length: number, bottom = 1.45, h = 0.75, d = 0.35): void {
  f.box('white', length, h, d, [0, bottom + h / 2, 0]);
  const n = Math.max(1, Math.round(length / 0.5));
  const dw = length / n;
  for (let i = 0; i < n; i++) {
    const x = -length / 2 + dw * i + dw / 2;
    f.box('white', dw - 0.02, h - 0.04, 0.012, [x, bottom + h / 2, d / 2 + 0.004]);
    handle(f, [x + (i % 2 === 0 ? 1 : -1) * (dw / 2 - 0.05), bottom + 0.12, d / 2 + 0.016], 0.12, true);
  }
}

/** Sink set into a counter whose top is at `top`; faucet at the back (-Z). */
export function sink(f: Frame, top = 0.9, w = 0.6, d = 0.42): void {
  f.box('steel', w, 0.02, d, [0, top + 0.01, 0]);
  f.box('charcoal', w - 0.08, 0.012, d - 0.08, [0, top + 0.022, 0]);
  f.cyl('chrome', 0.015, 0.015, 0.25, [0, top + 0.125, -d / 2 + 0.03], undefined, 8);
  f.box('chrome', 0.02, 0.02, 0.2, [0, top + 0.25, -d / 2 + 0.13]);
}

export function range(f: Frame): void {
  f.box('steel', 0.76, 0.9, 0.65, [0, 0.45, 0]);
  f.box('black', 0.76, 0.02, 0.65, [0, 0.905, 0]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.cyl('grey', 0.09, 0.09, 0.012, [sx * 0.18, 0.92, sz * 0.14], undefined, 12);
  f.box('screen', 0.6, 0.35, 0.012, [0, 0.42, 0.33]);
  f.box('chrome', 0.6, 0.02, 0.03, [0, 0.72, 0.34]);
  f.box('black', 0.76, 0.1, 0.05, [0, 0.95, -0.3]);
}

export function rangeHood(f: Frame, bottom = 1.5): void {
  f.box('steel', 0.76, 0.06, 0.5, [0, bottom + 0.03, 0.08]);
  f.box('steel', 0.4, 0.35, 0.3, [0, bottom + 0.06 + 0.175, -0.02]);
}

export function fridge(f: Frame, w = 0.85, h = 1.8, d = 0.72): void {
  f.box('steel', w, h, d, [0, h / 2, 0]);
  f.box('charcoal', w - 0.04, 0.008, 0.006, [0, h * 0.62, d / 2 + 0.003]);
  f.box('charcoal', 0.008, h - 0.04, 0.006, [0, h / 2, d / 2 + 0.003]);
  handle(f, [-0.1, h * 0.38, d / 2 + 0.03], 0.35, true);
  handle(f, [-0.1, h * 0.8, d / 2 + 0.03], 0.2, true);
}

/** Front-loading washer / dryer, door on +Z. */
export function appliance(f: Frame, kind: 'washer' | 'dryer'): void {
  const s = 0.6;
  f.box('white', s, 0.85, s, [0, 0.425, 0]);
  f.torus('chrome', 0.18, 0.02, [0, 0.42, s / 2 + 0.01]);
  f.cyl(kind === 'washer' ? 'screen' : 'grey', 0.16, 0.16, 0.012, [0, 0.42, s / 2 + 0.006], [H, 0, 0], 16);
  f.box('grey', 0.5, 0.06, 0.012, [0, 0.78, s / 2 + 0.006]);
  f.cyl('chrome', 0.02, 0.02, 0.014, [0.18, 0.78, s / 2 + 0.013], [H, 0, 0], 8);
}

// ---------------------------------------------------------------------------------------------
// Bathroom
// ---------------------------------------------------------------------------------------------

/** Toilet; tank against the wall at -Z, bowl toward +Z. */
export function toilet(f: Frame): void {
  f.box('ceramic', 0.2, 0.38, 0.4, [0, 0.19, 0.0]);
  f.cyl('ceramic', 0.19, 0.15, 0.36, [0, 0.19, 0.12], undefined, 14);
  f.cyl('ceramic', 0.2, 0.2, 0.04, [0, 0.4, 0.12], undefined, 14);
  f.box('ceramic', 0.42, 0.42, 0.18, [0, 0.6, -0.21]);
  f.box('chrome', 0.04, 0.02, 0.02, [0.12, 0.82, -0.21]);
}

export function pedestalSink(f: Frame): void {
  f.cyl('ceramic', 0.08, 0.12, 0.72, [0, 0.36, 0], undefined, 12);
  f.lathe('ceramic', [[0.04, 0], [0.22, 0], [0.27, 0.1], [0.25, 0.13], [0.0, 0.13]], [0, 0.72, 0.04], 16);
  f.cyl('chrome', 0.014, 0.014, 0.18, [0, 0.92, -0.16], undefined, 8);
  f.box('chrome', 0.02, 0.02, 0.14, [0, 1.0, -0.1]);
}

/** Vanity cabinet with counter, 1 or 2 vessel sinks; back against the wall at -Z. */
export function vanity(f: Frame, w: number, basins: 1 | 2, d = 0.55, h = 0.85): void {
  f.box('black', w - 0.1, 0.1, d - 0.06, [0, 0.05, -0.03]);
  f.box('white', w, h - 0.14, d, [0, 0.1 + (h - 0.14) / 2, 0]);
  f.box('quartz', w + 0.02, 0.04, d + 0.02, [0, h - 0.02, 0.01]);
  const n = Math.round(w / 0.5);
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w / n) * (i + 0.5);
    f.box('white', w / n - 0.02, h - 0.2, 0.012, [x, 0.1 + (h - 0.14) / 2, d / 2 + 0.004]);
    handle(f, [x, h - 0.22, d / 2 + 0.016], 0.12);
  }
  const xs = basins === 2 ? [-w / 4, w / 4] : [0];
  for (const x of xs) {
    f.lathe('ceramic', [[0.12, 0], [0.2, 0], [0.22, 0.1], [0.2, 0.13], [0.0, 0.13]], [x, h, 0.02], 16);
    f.cyl('chrome', 0.012, 0.012, 0.22, [x, h + 0.11, -d / 2 + 0.08], undefined, 8);
    f.box('chrome', 0.02, 0.02, 0.12, [x, h + 0.21, -d / 2 + 0.13]);
  }
}

export function mirror(f: Frame, w: number, h: number, yCentre: number, frame: MatKey = 'black'): void {
  f.box(frame, w + 0.06, h + 0.06, 0.025, [0, yCentre, 0.0125]);
  f.box('mirror', w, h, 0.012, [0, yCentre, 0.028]);
}

export function picture(f: Frame, w: number, h: number, yCentre: number, art: MatKey, frame: MatKey = 'oak'): void {
  f.box(frame, w + 0.05, h + 0.05, 0.03, [0, yCentre, 0.015]);
  f.box(art, w, h, 0.012, [0, yCentre, 0.032]);
  f.box('linen', w * 0.45, h * 0.3, 0.013, [w * 0.1, yCentre - h * 0.12, 0.0325]);
}

/** Freestanding tub, long axis along local X, `w` wide (rounded ends). */
export function tub(f: Frame, l = 1.7, w = 0.8, h = 0.58): void {
  const r = w / 2;
  const prof: [number, number][] = [[0.0, 0], [r - 0.08, 0], [r, h * 0.6], [r, h], [r - 0.08, h], [r - 0.1, h - 0.1], [0.0, h - 0.1]];
  const mid = l - w;
  f.box('ceramic', mid, h, w, [0, h / 2, 0]);
  f.lathe('ceramic', prof, [-mid / 2, 0, 0], 20);
  f.lathe('ceramic', prof, [mid / 2, 0, 0], 20);
  f.box('water', l - 0.3, 0.01, w - 0.2, [0, h - 0.12, 0]);
  f.cyl('chrome', 0.014, 0.014, 0.9, [0, 0.45, r + 0.08], undefined, 8);
  f.box('chrome', 0.02, 0.02, 0.16, [0, 0.9, r + 0.01]);
}

/** Alcove tub with shower: long axis along X, wall at -Z; riser + head at the -X end. */
export function tubShower(f: Frame, l = 1.5, w = 0.7, h = 0.55): void {
  f.box('ceramic', l, h, w, [0, h / 2, 0]);
  f.box('water', l - 0.16, 0.01, w - 0.16, [0, h - 0.1, 0]);
  f.cyl('chrome', 0.014, 0.014, 1.5, [-l / 2 + 0.1, h + 0.75, -w / 2 + 0.05], undefined, 8);
  f.box('chrome', 0.02, 0.02, 0.22, [-l / 2 + 0.1, h + 1.5, -w / 2 + 0.16]);
  f.cyl('chrome', 0.07, 0.07, 0.02, [-l / 2 + 0.1, h + 1.46, -w / 2 + 0.27], [0.5, 0, 0], 12);
  f.box('chrome', 0.03, 0.03, 0.08, [-l / 2 + 0.1, h + 0.45, -w / 2 + 0.04]);
  // glass screen on the shower end
  f.box('glass', 0.8, 1.45, 0.01, [-l / 2 + 0.4, h + 0.725, w / 2 - 0.005]);
  f.box('chrome', 0.8, 0.02, 0.02, [-l / 2 + 0.4, h + 1.45, w / 2 - 0.005]);
  f.box('chrome', 0.02, 1.45, 0.02, [-l / 2 + 0.8, h + 0.725, w / 2 - 0.005]);
}

/**
 * Glass shower stall: tray w×d, back wall at -Z, solid side wall at -X·side; glass on the
 * +X·side and +Z faces (side = -1 mirrors it for a corner on the other hand).
 */
export function showerStall(f: Frame, w = 1.0, d = 1.0, h = 2.0, side: 1 | -1 = 1): void {
  const gx = (w / 2 - 0.005) * side; // glass side-panel x
  const rx = (-w / 2 + 0.3) * side; // riser x (on the solid-wall side)
  f.box('ceramic', w, 0.08, d, [0, 0.04, 0]);
  f.box('charcoal', w - 0.12, 0.005, d - 0.12, [0, 0.083, 0]);
  f.box('glass', 0.01, h - 0.08, d, [gx, 0.08 + (h - 0.08) / 2, 0]);
  f.box('glass', w - 0.01, h - 0.08, 0.01, [-0.005 * side, 0.08 + (h - 0.08) / 2, d / 2 - 0.005]);
  f.box('chrome', 0.025, h - 0.08, 0.025, [(w / 2 - 0.0125) * side, 0.08 + (h - 0.08) / 2, d / 2 - 0.0125]);
  f.box('chrome', 0.025, 0.025, d, [(w / 2 - 0.0125) * side, h - 0.0125, 0]);
  f.box('chrome', w, 0.025, 0.025, [0, h - 0.0125, d / 2 - 0.0125]);
  handle(f, [(w / 2 - 0.03) * side, 1.05, d / 2 - 0.2], 0.3, true);
  f.cyl('chrome', 0.014, 0.014, 1.2, [rx, 1.0, -d / 2 + 0.03], undefined, 8);
  f.box('chrome', 0.02, 0.02, 0.25, [rx, 1.85, -d / 2 + 0.14]);
  f.cyl('chrome', 0.08, 0.08, 0.02, [rx, 1.82, -d / 2 + 0.26], [0.35, 0, 0], 12);
  f.box('chrome', 0.03, 0.03, 0.08, [rx, 1.0, -d / 2 + 0.03]);
}

// ---------------------------------------------------------------------------------------------
// Living room & misc
// ---------------------------------------------------------------------------------------------

export function tvUnit(f: Frame, w = 1.4, key: MatKey = 'walnut'): void {
  f.box(key, w, 0.4, 0.4, [0, 0.3, 0]);
  legs(f, 'black', w - 0.08, 0.34, 0.1, 0.03);
  f.box('black', 0.004, 0.3, 0.01, [0, 0.3, 0.203]);
  f.box(key, w - 0.3, 0.02, 0.3, [0, 0.22, 0]);
}

/** Thin TV standing on a surface at `y` (screen faces +Z). */
export function tv(f: Frame, w = 1.2, y = 0.5): void {
  const h = w * 0.56;
  f.box('black', w, h, 0.035, [0, y + 0.1 + h / 2, 0]);
  f.box('screen', w - 0.03, h - 0.03, 0.006, [0, y + 0.1 + h / 2, 0.02]);
  f.box('black', 0.3, 0.1, 0.04, [0, y + 0.05, -0.0]);
  f.box('black', 0.5, 0.012, 0.2, [0, y + 0.006, 0]);
}

export function floorLamp(f: Frame, shade: MatKey = 'linen'): void {
  f.cyl('brass', 0.14, 0.15, 0.02, [0, 0.01, 0], undefined, 14);
  f.cyl('brass', 0.012, 0.012, 1.5, [0, 0.77, 0], undefined, 8);
  f.cyl(shade, 0.17, 0.21, 0.32, [0, 1.62, 0], undefined, 16);
}

export function plant(f: Frame, tall = false): void {
  const ph = tall ? 0.4 : 0.26;
  f.lathe('terracotta', [[0.0, 0], [0.11, 0], [0.15, ph], [0.16, ph + 0.02], [0.12, ph + 0.02]], [0, 0, 0], 14);
  f.cyl('walnut', 0.12, 0.12, 0.02, [0, ph, 0], undefined, 12);
  if (tall) {
    f.cyl('walnut', 0.02, 0.025, 0.9, [0, ph + 0.45, 0], undefined, 6);
    const tops: [number, number, number][] = [[0, 1.25, 0], [0.08, 1.12, 0.04], [-0.08, 1.08, -0.05], [0.03, 1.02, 0.08], [-0.04, 1.0, -0.08], [0.05, 1.38, -0.04]];
    for (const [x, y, z] of tops) f.ellipsoid('leaf', 0.2, 0.15, 0.2, [x, ph + y - 0.3, z], 8);
  } else {
    const tops: [number, number, number][] = [[0, 0.2, 0], [0.08, 0.14, 0.04], [-0.07, 0.16, -0.05], [0.02, 0.12, 0.09], [-0.03, 0.13, -0.09]];
    for (const [x, y, z] of tops) f.ellipsoid('leaf', 0.16, 0.12, 0.16, [x, ph + y, z], 8);
  }
}

/** Simplified sedan facing local +Z (front at +Z), ~4.5 × 1.8 m. */
export function car(f: Frame): void {
  const L = 4.5;
  const W = 1.8;
  f.box('carBody', W, 0.55, L, [0, 0.6, 0]);
  f.box('carBody', W - 0.15, 0.5, 2.3, [0, 1.12, -0.25]);
  f.box('screen', W - 0.12, 0.32, 2.34, [0, 1.17, -0.25]);
  f.box('carBody', W - 0.5, 0.06, L - 0.4, [0, 0.35, 0]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    f.cyl('tyre', 0.33, 0.33, 0.24, [sx * 0.8, 0.33, sz * 1.45], [0, 0, H], 16);
    f.cyl('steel', 0.17, 0.17, 0.25, [sx * 0.8, 0.33, sz * 1.45], [0, 0, H], 10);
  }
  for (const sx of [-1, 1]) {
    f.box('linen', 0.32, 0.14, 0.03, [sx * 0.6, 0.72, L / 2 + 0.005]);
    f.box('rust', 0.3, 0.1, 0.03, [sx * 0.62, 0.72, -L / 2 - 0.005]);
  }
  f.box('black', W - 0.2, 0.16, 0.06, [0, 0.42, L / 2 + 0.02]);
  f.box('steel', 0.9, 0.06, 0.02, [0, 0.52, L / 2 + 0.01]);
}

export function pingPongTable(f: Frame): void {
  const L = 2.74;
  const W = 1.525;
  f.box('pingpong', L, 0.03, W, [0, 0.76, 0]);
  f.box('white', L, 0.004, 0.02, [0, 0.777, 0]);
  f.box('white', L, 0.004, 0.02, [0, 0.777, W / 2 - 0.01]);
  f.box('white', L, 0.004, 0.02, [0, 0.777, -W / 2 + 0.01]);
  f.box('white', 0.02, 0.004, W, [L / 2 - 0.01, 0.777, 0]);
  f.box('white', 0.02, 0.004, W, [-L / 2 + 0.01, 0.777, 0]);
  legs(f, 'grey', L - 0.5, W - 0.3, 0.745, 0.05);
  f.box('charcoal', 0.012, 0.15, W + 0.3, [0, 0.76 + 0.09, 0]);
  f.box('white', 0.014, 0.012, W + 0.3, [0, 0.76 + 0.16, 0]);
  for (const s of [-1, 1]) f.box('black', 0.03, 0.17, 0.03, [0, 0.76 + 0.085, s * (W / 2 + 0.14)]);
  f.box('rust', 0.16, 0.012, 0.16, [0.6, 0.79, 0.3]);
  f.sphere('white', 0.02, [-0.4, 0.8, -0.2], 6);
}

export function furnace(f: Frame, ceiling: number): void {
  f.box('grey', 0.6, 1.5, 0.7, [0, 0.75, 0]);
  f.box('black', 0.3, 0.2, 0.01, [0, 1.1, 0.355]);
  f.cyl('steel', 0.08, 0.08, ceiling - 1.5, [0.1, 1.5 + (ceiling - 1.5) / 2, -0.1], undefined, 10);
  f.box('steel', 0.4, 0.3, 0.3, [0.1, ceiling - 0.5, -0.1]);
  f.box('steel', 0.25, 0.25, 1.2, [0.1, ceiling - 0.3, 0.5]);
}

export function waterHeater(f: Frame): void {
  f.cyl('white', 0.3, 0.3, 1.5, [0, 0.75, 0], undefined, 16);
  f.cyl('grey', 0.31, 0.31, 0.06, [0, 0.03, 0], undefined, 16);
  f.cyl('grey', 0.31, 0.31, 0.04, [0, 1.52, 0], undefined, 16);
  for (const s of [-1, 1]) f.cyl('chrome', 0.015, 0.015, 0.9, [s * 0.1, 1.95, 0], undefined, 6);
}

export function electricalPanel(f: Frame): void {
  f.box('grey', 0.4, 0.7, 0.1, [0, 1.5, 0.05]);
  f.box('steel', 0.36, 0.64, 0.012, [0, 1.5, 0.106]);
  f.box('black', 0.008, 0.2, 0.014, [0.14, 1.5, 0.108]);
}

export function wallShelf(f: Frame, w: number, y: number, d = 0.25, key: MatKey = 'oak'): void {
  f.box(key, w, 0.03, d, [0, y, d / 2]);
  for (const s of [-1, 1]) f.box('black', 0.02, 0.08, d - 0.04, [s * (w / 2 - 0.06), y - 0.055, d / 2 - 0.02]);
}

/** Toolbox + jars on a workbench top at `y`. */
export function workbench(f: Frame, w = 1.8, d = 0.6): void {
  f.box('oak', w, 0.05, d, [0, 0.875, 0]);
  legs(f, 'grey', w - 0.08, d - 0.08, 0.85, 0.05);
  f.box('oak', w - 0.2, 0.025, d - 0.1, [0, 0.25, 0]);
  f.box('rust', 0.45, 0.2, 0.22, [-0.4, 1.0, 0]);
  f.box('grey', 0.3, 0.03, 0.2, [0.3, 0.915, -0.1]);
  f.cyl('jar', 0.05, 0.05, 0.12, [0.65, 0.96, -0.15], undefined, 10);
  f.cyl('jar', 0.04, 0.04, 0.1, [0.52, 0.95, -0.12], undefined, 10);
  // pegboard with a few tools
  f.box('cardboard', w, 0.8, 0.02, [0, 1.5, -d / 2 - 0.01]);
  for (let i = 0; i < 5; i++) f.box('grey', 0.03, 0.3 + (i % 2) * 0.15, 0.03, [-w / 2 + 0.3 + i * 0.3, 1.45, -d / 2 + 0.02]);
}

export function linenStack(f: Frame, w: number, levels: number, h: number): void {
  shelfUnit(f, w, h, 0.35, levels, 'white');
  const step = (h - 0.05) / levels;
  const cols: MatKey[] = ['white', 'linen', 'sage', 'cream', 'navy'];
  for (let i = 0; i < levels; i++) {
    for (let j = 0; j < 2; j++) {
      const x = -w / 4 + (j * w) / 2;
      f.box(cols[(i + j) % cols.length], w / 2 - 0.1, 0.07, 0.3, [x, 0.035 + step * i + 0.035, 0]);
      f.box(cols[(i + j + 2) % cols.length], w / 2 - 0.12, 0.06, 0.28, [x, 0.035 + step * i + 0.1, 0]);
    }
  }
}
