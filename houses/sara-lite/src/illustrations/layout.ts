import { stackBackFor } from '../data/geometry';
import type { WindowInstance } from '../data/geometry';

/** Wall margin left and right of the curtain stack-back (m). */
export const WALL_MARGIN = 0.35;
/** Interior casing (trim) width around the opening (m). */
export const CASING = 0.07;

/**
 * Front view of one window seen from inside the room, in SVG user units = metres.
 * x grows to the right; y grows DOWN from the ceiling (y = 0) to the floor (y = H).
 */
export interface Layout {
  W: number;
  H: number;
  /** Opening left / right edges and width. */
  x0: number;
  x1: number;
  ow: number;
  /** Opening top / bottom (sill, or floor for the patio door) and height. */
  top: number;
  bot: number;
  oh: number;
  /** Curtain stack-back on each side. */
  sb: number;
  /** y of a floor-length (or hemAbove) curtain hem. */
  hem: number;
  isDoor: boolean;
  frosted: boolean;
}

export function layoutFor(win: WindowInstance): Layout {
  const sb = stackBackFor(win.width);
  const W = win.width + 2 * sb + 2 * WALL_MARGIN;
  // Two-storey stairwell windows reach above this level's ceiling: show the whole opening.
  const H = Math.max(win.ceiling, win.sill + win.height + 0.32);
  const x0 = WALL_MARGIN + sb;
  const top = H - (win.sill + win.height);
  const bot = H - win.sill;
  return {
    W,
    H,
    x0,
    x1: x0 + win.width,
    ow: win.width,
    top,
    bot,
    oh: win.height,
    sb,
    hem: H - (win.hemAbove > 0 ? win.hemAbove + 0.01 : 0.01),
    isDoor: win.isDoor,
    frosted: win.frosted,
  };
}

/** CSS transform string in SVG user units (px == user unit inside SVG). */
export const tf = (x: number, y: number, sx = 1, sy = 1) =>
  `translate(${r4(x)}px, ${r4(y)}px) scale(${r4(sx)}, ${r4(sy)})`;

export const r4 = (v: number) => Math.round(v * 10000) / 10000;
