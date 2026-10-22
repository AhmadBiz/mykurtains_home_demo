/**
 * Exterior-only lookups and constants (metres). Everything positional derives from HOUSE so the
 * visuals stay in sync with groundHeightAt() in src/data/geometry.ts.
 */
import { HOUSE } from '../../data/house';
import { WALL_BY_ID } from '../../data/geometry';
import { FT } from '../../data/types';
import type { Platform, StairFlight } from '../../data/types';

function ramp(id: string): StairFlight {
  const r = HOUSE.ramps.find((f) => f.id === id);
  if (!r) throw new Error(`Exterior: missing ramp ${id}`);
  return r;
}

function platform(id: string): Platform {
  const p = HOUSE.platforms.find((f) => f.id === id);
  if (!p) throw new Error(`Exterior: missing platform ${id}`);
  return p;
}

export const RAMPS = {
  perron: ramp('rp-perron'),
  driveway: ramp('rp-driveway'),
  balcon: ramp('rp-balcon'),
  side: ramp('rp-side'),
};

export const PLATFORMS = {
  perron: platform('pl-perron'),
  balcon: platform('pl-balcon'),
  sideLanding: platform('pl-side-landing'),
};

export const GRADE_Y = HOUSE.gradeY;

/** Half thickness of an exterior wall (used to tuck decks / roofs into the wall volume). */
export const EXT_HALF_WALL = (WALL_BY_ID.get('g-ext-e2')?.thickness ?? FT) / 2;

/** Street strip (X range) and the curb on the house side. */
export const STREET = { x1: -20, x2: -14, zHalf: 60, curbW: 0.2, curbH: 0.12 };

/** Small lift of paved surfaces above the lawn plane so nothing z-fights. */
export const PAVING_LIFT = 0.02;

/** Underside of the porch / balcony roofs (top at ROOF_TOP). Kept just under the upper slab (3.048). */
export const SMALL_ROOF_TOP = 3.02;
export const SMALL_ROOF_THICKNESS = 0.12;

export const COLORS = {
  concrete: '#cbc8c0',
  concreteDark: '#b5b2aa',
  asphalt: '#8f8f8b',
  road: '#4b4c4e',
  curb: '#bdbab2',
  fascia: '#ebe8e1',
  soffit: '#d8d4cb',
  shingle: '#3a3b3e',
  membrane: '#6a6c70',
  deck: '#8a6a4b',
  post: '#7a5c40',
  rail: '#8c6d4f',
  trunk: '#6b4e34',
  fence: '#b08d62',
  hedge: '#3f6b3a',
  mailbox: '#2b2b2e',
  flag: '#c8352b',
} as const;

/** Balcony railing / stair constants shared by Platforms.tsx and Steps.tsx. */
export const RAILING = { postSize: 0.1, height: 1.07, balusterSize: 0.035, balusterSpacing: 0.125 } as const;

/** X positions of the two balcony-stair handrails (inside the stair width), shared with the deck posts. */
export function balconyStairRailX(): [number, number] {
  const [x1, , x2] = RAMPS.balcon.bounds;
  return [x1 + RAILING.postSize / 2, x2 - RAILING.postSize / 2];
}
