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

/** Rear patio slab at the foot of the balcony stairs. */
export const PATIO = { w: 3.2, d: 2.6 };

export const COLORS = {
  /** Painted PVC / aluminium trim (fascia, soffit, columns): 70–75 % reflectance, not 85 %. */
  trim: '#e6e2d8',
  curb: '#d2d3d4',
  /** Cool tint that neutralises the warm concrete_wall_008 map (sRGB 141,133,112 → grey; it landed at an olive-khaki under the warm sun). */
  concrete: '#c4cfe6',
  /** Bark-mulch beds (finding 3: ~15 % albedo, no longer a 4 % black rectangle). */
  mulch: '#66503e',
  rock: '#8b857b',
  /** Split-face block of the porch body and the driveway retaining wall (over the procedural block map). */
  block: '#c9ccd0',
  /** Ballasted (light gravel) membrane of the flat porch / balcony roofs. */
  membrane: '#b9b7b0',
  /** Weathered cedar: lifts weathered_brown_planks (~0.10 linear) to a silver-brown 0.25–0.30. */
  cedar: '#d9d0c6',
  /** Foliage albedos (finding 1): real leaf values, dark → lit side of each species. */
  leafDark: '#2d4a22',
  leafLight: '#557a3a',
  coniferDark: '#2a472c',
  coniferLight: '#4a7542',
  hedgeDark: '#2f4d27',
  hedgeLight: '#52803f',
  /** Horizon billboards: the atlas' sunlit band (≈ sRGB 200,214,170) × this ≈ #4d6e3a, the lit tone of the 3D crowns; the fog does the desaturation. */
  farTree: '#63825c',
  mailbox: '#232326',
  flag: '#c8352b',
} as const;

/** Balcony railing / stair constants shared by Platforms.tsx and Steps.tsx. */
export const RAILING = { postSize: 0.1, height: 1.07, balusterRadius: 0.008, balusterSpacing: 0.11, topRailW: 0.09, topRailH: 0.045 } as const;

/** X positions of the two balcony-stair handrails (inside the stair width), shared with the deck posts. */
export function balconyStairRailX(): [number, number] {
  const [x1, , x2] = RAMPS.balcon.bounds;
  return [x1 + RAILING.postSize / 2, x2 - RAILING.postSize / 2];
}
