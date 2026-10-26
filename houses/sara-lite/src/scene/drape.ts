/**
 * Curtains and sheers on the glass model follow the installation standard: a ceiling-mounted track, panels from the
 * track to the hem (floor length unless `hemAbove`), the stack-back parked beside the frame. The drape element spans
 * the opening plus one stack-back each side, from the hem to the ceiling; this paints its fabric.
 */
import type { CSSProperties } from 'react';
import type { ColorOption, WindowCoveringState } from '../data/coverings';
import { stackBackFor } from '../data/geometry';
import type { WindowInstance } from '../data/geometry';
import { clamp, rgba, tones } from '../illustrations/color';

export const hasDrape = (s: WindowCoveringState | undefined) => !!s && (s.type === 'curtains' || s.type === 'sheers');

const pc = (v: number) => `${Math.round(v * 1000) / 10}%`;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Placement of the drape on its wall (m, relative to wall.a and the wall base). */
export function drapeBox(w: WindowInstance) {
  const sb = stackBackFor(w.width);
  return { left: r3(w.opening.at - w.width / 2 - sb), width: r3(w.width + 2 * sb), bottom: r3(w.hemAbove), height: r3(w.ceiling - w.hemAbove) };
}

export function drapeStyle(state: WindowCoveringState, color: ColorOption, w: WindowInstance): CSSProperties {
  const ow = w.width;
  const sb = stackBackFor(ow);
  const open = clamp(state.open, 0, 1);
  const hex = color.hex;
  const t = tones(hex, 0.9);
  const voile = state.type === 'sheers';
  const solid = 1 - (color.translucency ?? 0) * 0.5;
  const a = (voile ? 0.62 : 0.92) * solid;
  // One side panel: its stack-back plus the half of the opening it still covers.
  const side = (sb + (ow / 2) * (1 - open)) / (ow + 2 * sb);
  const folds = `repeating-linear-gradient(90deg, ${rgba(t.lo, a)} 0 1px, ${rgba(hex, a)} 1px 2.5px, ${rgba(t.hi, a)} 2.5px 4px, ${rgba(hex, a)} 4px 5px)`;
  const layers = [`${folds} left top / ${pc(side)} 100% no-repeat`, `${folds} right top / ${pc(side)} 100% no-repeat`];
  // A sheer on the second track: drawn across the full width behind the curtains.
  if (state.type === 'curtains' && state.sheer) layers.push('linear-gradient(rgba(246,242,234,0.3), rgba(246,242,234,0.24))');
  return { background: layers.join(', ') };
}
