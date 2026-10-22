/**
 * Procedural, size-memoised geometries for window frames, the patio door, glass panes, the
 * selection highlight and the invisible hit box.
 *
 * Local frame of every part (matches WindowInstance): origin at the centre of the opening on the
 * wall centre-line, +X along the wall, +Y up, +Z INTO the room. The interior wall face is at
 * z = +t/2 and the exterior face at z = -t/2 (t = wall thickness). Units are metres.
 *
 * Every builder returns a geometry cached by its dimensions, so the many windows that share a
 * size share one BufferGeometry. All the parts of one material are merged into a single geometry
 * (one draw call per material per window).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Face width of the frame members lining the reveal (head, sill, jambs). */
export const FRAME_FACE = 0.05;
export const MULLION_W = 0.04;
export const RAIL_H = 0.03;
/** Windows wider than this get a central mullion. */
export const MULLION_MIN_WIDTH = 1.5;
/** Interior casing (trim) around the opening on the interior face. */
export const CASING_W = 0.07;
export const CASING_D = 0.015;
/** Tiny stand-off so trim never shares a plane with the wall face. */
export const TRIM_GAP = 0.002;
export const STOOL_T = 0.03;
export const STOOL_PROJ = 0.04;
export const STOOL_HORN = 0.02;
export const APRON_H = 0.07;
/** Exterior stone sill ledge. */
export const LEDGE_PROJ = 0.05;
export const LEDGE_H = 0.05;
export const HIGHLIGHT_BAR = 0.03;
export const HIGHLIGHT_MARGIN = 0.12;
export const HIGHLIGHT_D = 0.012;
export const HIT_MARGIN = 0.1;
export const HIT_DEPTH_EXTRA = 0.3;

/** Patio door proportions. */
const DOOR = {
  track: 0.03,
  stile: 0.06,
  topRail: 0.06,
  bottomRail: 0.14,
  panelDepth: 0.035,
  /** Each sliding panel sits ±this in depth (3 cm apart). */
  panelOffset: 0.015,
  /** Interlock overlap of the two panels at the centre. */
  overlap: 0.04,
  /** Handle height above the floor. */
  handleY: 1.0,
};

export interface Dims {
  width: number;
  height: number;
  wallThickness: number;
}

interface BoxPart {
  w: number;
  h: number;
  d: number;
  x?: number;
  y?: number;
  z?: number;
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

function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (geos.length === 1) return geos[0];
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (!merged) throw new Error('window geometry merge failed');
  return merged;
}

/** Several axis-aligned boxes merged into one geometry. */
function boxes(parts: BoxPart[]): THREE.BufferGeometry {
  return merge(parts.map((p) => new THREE.BoxGeometry(p.w, p.h, p.d).translate(p.x ?? 0, p.y ?? 0, p.z ?? 0)));
}

/** z of the centre of the interior trim layer. */
const trimZ = (t: number) => t / 2 + TRIM_GAP + CASING_D / 2;

/** z at which the highlight outline floats, just in front of the casing. */
export const highlightZ = (t: number) => t / 2 + TRIM_GAP + CASING_D + HIGHLIGHT_D;

// ---------------------------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------------------------

/**
 * All the warm-white woodwork of a window: the frame lining the reveal (head, sill, two jambs,
 * optional central mullion, a thin rail at 60 % height), the interior stool with its apron and
 * the interior casing.
 */
export function windowWoodwork({ width: w, height: h, wallThickness: t }: Dims): THREE.BufferGeometry {
  return cached(key('ww', w, h, t), () => {
    const F = FRAME_FACE;
    const parts: BoxPart[] = [
      { w, h: F, d: t, y: h / 2 - F / 2 }, // head
      { w, h: F, d: t, y: -h / 2 + F / 2 }, // sill
      { w: F, h: h - 2 * F, d: t, x: -(w / 2 - F / 2) }, // jamb
      { w: F, h: h - 2 * F, d: t, x: w / 2 - F / 2 }, // jamb
      { w: w - 2 * F, h: RAIL_H, d: t * 0.5, y: -h / 2 + 0.6 * h }, // horizontal rail at 60 %
    ];
    if (w > MULLION_MIN_WIDTH) parts.push({ w: MULLION_W, h: h - 2 * F, d: t * 0.7 });
    // Interior stool: sits on the inner half of the sill (2 mm proud of it), projects into the
    // room and runs past the casing on both sides (horns).
    const stoolTop = -h / 2 + F + TRIM_GAP;
    const stoolDepth = t / 2 + STOOL_PROJ - 0.005;
    parts.push({
      w: w + 2 * CASING_W + 2 * STOOL_HORN,
      h: STOOL_T,
      d: stoolDepth,
      y: stoolTop - STOOL_T / 2,
      z: 0.005 + stoolDepth / 2,
    });
    const z = trimZ(t);
    // apron under the stool
    parts.push({ w: w + 2 * CASING_W, h: APRON_H, d: CASING_D, y: stoolTop - STOOL_T - APRON_H / 2, z });
    // casing: head piece + two legs that stop on the stool
    parts.push({ w: w + 2 * CASING_W, h: CASING_W, d: CASING_D, y: h / 2 + CASING_W / 2, z });
    const legH = h / 2 - stoolTop;
    const legY = stoolTop + legH / 2;
    parts.push({ w: CASING_W, h: legH, d: CASING_D, x: -(w / 2 + CASING_W / 2), y: legY, z });
    parts.push({ w: CASING_W, h: legH, d: CASING_D, x: w / 2 + CASING_W / 2, y: legY, z });
    return boxes(parts);
  });
}

/** Exterior stone sill ledge projecting 5 cm outside, tucked 1 cm under the frame sill. */
export function windowLedge({ width: w, height: h, wallThickness: t }: Dims): THREE.BufferGeometry {
  return cached(key('wl', w, h, t), () =>
    boxes([
      {
        w: w + 2 * LEDGE_PROJ,
        h: LEDGE_H,
        d: LEDGE_PROJ + 0.04,
        y: -h / 2 + 0.01 - LEDGE_H / 2,
        z: -t / 2 + (0.04 - LEDGE_PROJ) / 2,
      },
    ]),
  );
}

/** Single glass pane at the wall centre (z = 0); its edges are buried in the frame members. */
export function windowGlass({ width: w, height: h }: Dims): THREE.BufferGeometry {
  return cached(key('wg', w, h), () => new THREE.PlaneGeometry(w - FRAME_FACE, h - FRAME_FACE));
}

// ---------------------------------------------------------------------------------------------
// Patio door (two sliding panels: A fixed on the exterior track, B operating on the interior one)
// ---------------------------------------------------------------------------------------------

interface DoorLayout {
  /** Inner opening width between the jambs. */
  wi: number;
  /** y of the centre of the inner opening (between track and head). */
  cy: number;
  /** Panel width / height. */
  pw: number;
  ph: number;
  xA: number;
  xB: number;
  zA: number;
  zB: number;
}

function doorLayout({ width: w, height: h }: Dims): DoorLayout {
  const F = FRAME_FACE;
  const wi = w - 2 * F;
  const hi = h - F - DOOR.track;
  const pw = wi / 2 + DOOR.overlap;
  return {
    wi,
    cy: (DOOR.track - F) / 2,
    pw,
    ph: hi - 0.01,
    xA: -wi / 2 + pw / 2,
    xB: wi / 2 - pw / 2,
    zA: -DOOR.panelOffset,
    zB: DOOR.panelOffset,
  };
}

function panelFrame(L: DoorLayout, x: number, z: number): BoxPart[] {
  const { pw, ph, cy } = L;
  const S = DOOR.stile;
  const D = DOOR.panelDepth;
  return [
    { w: S, h: ph, d: D, x: x - pw / 2 + S / 2, y: cy, z },
    { w: S, h: ph, d: D, x: x + pw / 2 - S / 2, y: cy, z },
    { w: pw - 2 * S, h: DOOR.topRail, d: D, x, y: cy + ph / 2 - DOOR.topRail / 2, z },
    { w: pw - 2 * S, h: DOOR.bottomRail, d: D, x, y: cy - ph / 2 + DOOR.bottomRail / 2, z },
  ];
}

/** Aluminium: outer frame lining the reveal, bottom track + threshold rail, both panel frames. */
export function doorAluminium(d: Dims): THREE.BufferGeometry {
  const { width: w, height: h, wallThickness: t } = d;
  return cached(key('da', w, h, t), () => {
    const F = FRAME_FACE;
    const L = doorLayout(d);
    const jambH = h - F - DOOR.track;
    const parts: BoxPart[] = [
      { w, h: F, d: t, y: h / 2 - F / 2 }, // head
      { w, h: DOOR.track, d: t, y: -h / 2 + DOOR.track / 2 }, // bottom track
      { w: F, h: jambH, d: t, x: -(w / 2 - F / 2), y: L.cy }, // jamb
      { w: F, h: jambH, d: t, x: w / 2 - F / 2, y: L.cy }, // jamb
      { w: L.wi, h: 0.012, d: 0.02, y: -h / 2 + DOOR.track + 0.006 }, // raised threshold rail
    ];
    const panels: [number, number][] = [
      [L.xA, L.zA],
      [L.xB, L.zB],
    ];
    for (const [x, z] of panels) parts.push(...panelFrame(L, x, z));
    return boxes(parts);
  });
}

/** Interior casing of the door (head + two full-height legs), no stool. */
export function doorTrim({ width: w, height: h, wallThickness: t }: Dims): THREE.BufferGeometry {
  return cached(key('dt', w, h, t), () => {
    const z = trimZ(t);
    return boxes([
      { w: w + 2 * CASING_W, h: CASING_W, d: CASING_D, y: h / 2 + CASING_W / 2, z },
      { w: CASING_W, h, d: CASING_D, x: -(w / 2 + CASING_W / 2), z },
      { w: CASING_W, h, d: CASING_D, x: w / 2 + CASING_W / 2, z },
    ]);
  });
}

/** Pull handles (interior + exterior) on the latch stile of the operating panel, at the jamb. */
export function doorHandle(d: Dims): THREE.BufferGeometry {
  return cached(key('dh', d.width, d.height), () => {
    const L = doorLayout(d);
    const x = L.xB + L.pw / 2 - DOOR.stile / 2;
    const y = -d.height / 2 + DOOR.handleY;
    const front = L.zB + DOOR.panelDepth / 2;
    const back = L.zB - DOOR.panelDepth / 2;
    return boxes([
      { w: 0.02, h: 0.05, d: 0.02, x, y, z: front + 0.01 }, // bracket
      { w: 0.025, h: 0.24, d: 0.022, x, y, z: front + 0.031 }, // interior pull bar
      { w: 0.02, h: 0.05, d: 0.015, x, y, z: back - 0.0075 },
      { w: 0.025, h: 0.2, d: 0.018, x, y, z: back - 0.024 }, // exterior pull bar
    ]);
  });
}

/** One glass pane per panel, each at its panel's depth. */
export function doorGlass(d: Dims): THREE.BufferGeometry {
  return cached(key('dg', d.width, d.height), () => {
    const L = doorLayout(d);
    const gw = L.pw - 2 * DOOR.stile + 0.02;
    const gh = L.ph - DOOR.topRail - DOOR.bottomRail + 0.02;
    const gy = L.cy + (DOOR.bottomRail - DOOR.topRail) / 2;
    return merge([
      new THREE.PlaneGeometry(gw, gh).translate(L.xA, gy, L.zA),
      new THREE.PlaneGeometry(gw, gh).translate(L.xB, gy, L.zB),
    ]);
  });
}

// ---------------------------------------------------------------------------------------------
// Highlight outline and hit box
// ---------------------------------------------------------------------------------------------

/** Thin rectangular outline a little larger than the casing (for a door it stops at the floor). */
export function highlightFrame({ width: w, height: h }: Dims, isDoor: boolean): THREE.BufferGeometry {
  return cached(key('hl', w, h, isDoor ? 'door' : 'win'), () => {
    const M = HIGHLIGHT_MARGIN;
    const B = HIGHLIGHT_BAR;
    const ox = w / 2 + M;
    const top = h / 2 + M;
    const bottom = isDoor ? -h / 2 + 0.02 : -(h / 2 + M);
    const sideH = top - bottom - B;
    const sideY = (top + bottom) / 2;
    return boxes([
      { w: 2 * ox + B, h: B, d: HIGHLIGHT_D, y: top },
      { w: 2 * ox + B, h: B, d: HIGHLIGHT_D, y: bottom },
      { w: B, h: sideH, d: HIGHLIGHT_D, x: -ox, y: sideY },
      { w: B, h: sideH, d: HIGHLIGHT_D, x: ox, y: sideY },
    ]);
  });
}

/** Invisible picking volume: the opening + 10 cm margin, reaching 15 cm out of each wall face. */
export function hitBox({ width: w, height: h, wallThickness: t }: Dims): THREE.BufferGeometry {
  return cached(key('hb', w, h, t), () => new THREE.BoxGeometry(w + 2 * HIT_MARGIN, h + 2 * HIT_MARGIN, t + HIT_DEPTH_EXTRA));
}
