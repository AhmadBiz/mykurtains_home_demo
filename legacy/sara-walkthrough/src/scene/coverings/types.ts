import type { ColorOption, WindowCoveringState } from '../../data/coverings';

/**
 * Every covering component is rendered inside a group positioned at the CENTRE of the window
 * opening, on the INTERIOR FACE of the wall:
 *   - local +X runs along the wall (to the right when you stand in the room facing the window)
 *   - local +Y is up
 *   - local +Z points INTO the room (z = 0 is the interior wall surface; the glass sits at z = -reveal)
 *
 * Units are metres. Components must be pure functions of their props (no store access) so they can
 * be reused by the picker preview.
 */
export interface CoveringProps {
  /** Width of the window opening (m). */
  width: number;
  /** Height of the window opening (m). */
  height: number;
  /** Height of the sill above the floor (m). 0 for patio doors. */
  sill: number;
  /** Depth from the interior wall face to the glass (m) = wall thickness / 2. */
  reveal: number;
  /** True for patio doors (floor-length coverings, vanes stack to the side, no sill mount). */
  isDoor: boolean;
  state: WindowCoveringState;
  color: ColorOption;
  /**
   * Height of the room's ceiling above the floor (m) — LEVEL_BY_ID[level].ceilingHeight. The
   * ceiling-mounted tracks of curtains / sheers sit flush under it, i.e. at local
   * y = ceiling − sill − height / 2.
   */
  ceiling: number;
  /**
   * Free run along the wall from the left (−X) and right (+X) edge of the opening to the nearest
   * obstruction beside it at track height — a perpendicular wall's face less its crown moulding,
   * or a fixture — with a 1 cm margin (m; may be negative when a wall or its crown overlaps the
   * opening's edge). Ceiling tracks stop there instead of running a full stack-back past the edge.
   * Omitted = unobstructed.
   */
  sideRoom?: [number, number];
  /**
   * Lowest height above the floor the fabric's hem may hang at (m): set where a counter, a tub or
   * a stair stands under the window, so floor-length fabric stops just above it. Omitted = floor
   * length (hem 1 cm above the floor).
   */
  hemAbove?: number;
}

/** Local y of the floor relative to the opening centre. */
export const floorY = (p: CoveringProps) => -(p.sill + p.height / 2);
