import { LEVEL_BY_ID, stackBackFor } from '../data/geometry';
import type { WindowInstance } from '../data/geometry';
import type { CoveringType } from '../data/coverings';

/** Wall margin left and right of the curtain stack-back (m). */
export const WALL_MARGIN = 0.35;
/** Interior casing (trim) width around the opening (m). */
export const CASING = 0.07;
/** Every drawing is framed at this width / height, so the panel never changes height between windows or types. */
export const FRAME_ASPECT = 5 / 4;
/** How far the wall, crown, baseboard, floor and ceiling planes run past the drawing's nominal box (m). */
export const ROOM_BLEED = 6;

/** What stands under a window whose curtains stop short of the floor. */
export type Obstacle = 'counter' | 'tub' | 'stairs';

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
  /** Height above the floor of the fixed obstacle under the window (0 = none). */
  hemAbove: number;
  obstacle: Obstacle | null;
  isDoor: boolean;
  frosted: boolean;
}

/** The lead may attach `obstacle` to the window; until then it is inferred from the room. */
function obstacleFor(win: WindowInstance): Obstacle | null {
  if (win.hemAbove <= 0) return null;
  const given = (win as WindowInstance & { obstacle?: Obstacle }).obstacle;
  if (given) return given;
  const room = win.room?.id ?? '';
  if (/escalier|stair/.test(room)) return 'stairs';
  if (/cuisine|kitchen/.test(room)) return 'counter';
  if (/sdb|bath/.test(room)) return 'tub';
  return null;
}

export function layoutFor(win: WindowInstance): Layout {
  const sb = stackBackFor(win.width);
  const W = win.width + 2 * sb + 2 * WALL_MARGIN;
  // The real ceiling: a window in a double-height wall (the stairwell) rises to the upper storey's ceiling.
  const lvl = LEVEL_BY_ID[win.level];
  const tall = win.wall.baseY + win.wall.height > lvl.wallTop + 0.01;
  const H = tall ? LEVEL_BY_ID.upper.floorY + LEVEL_BY_ID.upper.ceilingHeight - lvl.floorY : win.ceiling;
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
    hemAbove: win.hemAbove,
    obstacle: obstacleFor(win),
    isDoor: win.isDoor,
    frosted: win.frosted,
  };
}

export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Curtains and sheers (and a vertical blind on the patio door) are shown floor to ceiling with the whole track. */
export const fullHeightFrame = (L: Layout, type: CoveringType) =>
  type === 'curtains' || type === 'sheers' || (type === 'vertical' && L.isDoor);

/**
 * The part of the wall the drawing shows, always at FRAME_ASPECT.
 * Ceiling-mounted coverings: floor to ceiling, opening + stack-back + margin.
 * Everything else: cropped to the opening and its casing, with the ceiling / floor only when they are close.
 */
export function frameFor(L: Layout, type: CoveringType): Frame {
  let x: number, y: number, w: number, h: number;
  if (fullHeightFrame(L, type)) {
    x = 0;
    w = L.W;
    y = 0;
    h = L.H;
    // Too wide for the box: give up some of the wall margin first (keep 0.12 m beyond the stack-back).
    if (w / h > FRAME_ASPECT) {
      const trim = Math.min((w - h * FRAME_ASPECT) / 2, WALL_MARGIN - 0.12);
      x += trim;
      w -= 2 * trim;
    }
  } else {
    const m = Math.max(CASING + 0.4, 0.35 * L.ow);
    x = L.x0 - m;
    w = L.ow + 2 * m;
    y = L.top <= 0.5 ? 0 : L.top - CASING - 0.3;
    let b = L.isDoor ? L.H : Math.min(L.H, L.bot + 0.45);
    if (L.H - b < 0.4) b = L.H;
    h = b - y;
  }
  if (w / h < FRAME_ASPECT) {
    // Too tall: show more wall on both sides.
    const nw = h * FRAME_ASPECT;
    x -= (nw - w) / 2;
    w = nw;
  } else if (w / h > FRAME_ASPECT) {
    // Too wide: show more of the wall above and below, within floor and ceiling, then a strip of floor.
    const nh = w / FRAME_ASPECT;
    const grow = nh - h;
    const below = L.H - (y + h);
    const down = Math.min(below, Math.max(grow / 2, grow - y));
    const up = Math.min(y, grow - down);
    // whatever is left spills below the floor line, where the floor plane is drawn
    y -= up;
    h = nh;
  }
  return { x, y, w, h };
}

/** CSS transform string in SVG user units (px == user unit inside SVG). */
export const tf = (x: number, y: number, sx = 1, sy = 1) =>
  `translate(${r4(x)}px, ${r4(y)}px) scale(${r4(sx)}, ${r4(sy)})`;

export const r4 = (v: number) => Math.round(v * 10000) / 10000;
