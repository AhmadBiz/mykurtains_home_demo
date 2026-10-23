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
  /** Height of the room's ceiling above the floor (m) — needed by the ceiling-mounted tracks. */
  ceiling?: number;
}

/** Local y of the floor relative to the opening centre. */
export const floorY = (p: CoveringProps) => -(p.sill + p.height / 2);
