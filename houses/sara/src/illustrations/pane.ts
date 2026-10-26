import type { CSSProperties } from 'react';
import type { ColorOption, WindowCoveringState } from '../data/coverings';
import { clamp, rgba, shade, tones } from './color';

/** Faint daylight on the dark glass of the model. */
const SKY = 'linear-gradient(170deg, rgba(185,210,228,0.26), rgba(185,210,228,0.09) 58%, rgba(150,185,140,0.14))';

const pc = (v: number) => `${Math.round(v * 1000) / 10}%`;

/**
 * Style for the tiny pane (30–110 px) on each window of the glass model: CSS gradients only, hinting the covering in
 * its colour and state. Layers are listed top-first; the last one is the glass.
 *
 * `mirror`: the pane's CSS left is the room's right (the wall's normal points away from the room), so a vertical
 * blind, which stacks on the left as seen from inside, is anchored at the CSS right.
 */
export function paneStyle(state: WindowCoveringState, color: ColorOption, mirror = false): CSSProperties {
  const hex = color.hex;
  const t = tones(hex, 0.9);
  const open = clamp(state.open, 0, 1);
  const tilt = Math.abs(clamp(state.tilt, -1, 1));
  const solid = 1 - (color.translucency ?? 0) * 0.5;
  const c = (a: number) => rgba(hex, a * solid);
  const layers: string[] = [];

  switch (state.type) {
    case 'none':
      break;
    case 'curtains':
    case 'sheers': {
      const voile = state.type === 'sheers';
      const a = voile ? 0.8 : 0.94;
      // Each side covers half of (1 − open), plus a sliver for the stack at the frame.
      const side = Math.max(0.07, ((1 - open) / 2) * 1.02);
      const folds = `repeating-linear-gradient(90deg, ${rgba(t.lo, a * solid)} 0 1px, ${c(a)} 1px 2.5px, ${rgba(t.hi, a * solid)} 2.5px 4px, ${c(a)} 4px 5px)`;
      layers.push(`${folds} left top / ${pc(side)} 100% no-repeat`);
      layers.push(`${folds} right top / ${pc(side)} 100% no-repeat`);
      if (state.type === 'curtains' && state.sheer) layers.push('linear-gradient(rgba(246,242,234,0.38), rgba(246,242,234,0.32))');
      break;
    }
    case 'roller':
    case 'roman':
    case 'cellular': {
      const drop = state.type === 'cellular' ? 0.06 + 0.94 * (1 - open) : Math.max(0.05, 1 - open);
      const size = `left top / 100% ${pc(drop)} no-repeat`;
      layers.push(`linear-gradient(${rgba(t.deep, 0.9)}, ${rgba(t.deep, 0.9)}) left ${pc(drop)} / 100% 2px no-repeat`);
      layers.push(`linear-gradient(${rgba(t.hi, 0.95)}, ${rgba(t.hi, 0.95)}) left top / 100% 2px no-repeat`);
      if (state.type === 'roman') layers.push(`repeating-linear-gradient(180deg, transparent 0 4px, ${rgba(t.lo, 0.8)} 4px 5px) ${size}`);
      if (state.type === 'cellular') layers.push(`repeating-linear-gradient(180deg, transparent 0 1.5px, ${rgba(t.lo, 0.55)} 1.5px 2.2px) ${size}`);
      layers.push(`linear-gradient(180deg, ${c(0.96)}, ${c(0.9)}) ${size}`);
      break;
    }
    case 'venetian': {
      const drop = Math.max(0.06, 1 - open);
      // Slat fraction of the 4 px pitch follows the tilt: thin lines when open, nearly solid when closed.
      const f = 0.25 + 0.55 * tilt;
      const s = `${(4 * f).toFixed(2)}px`;
      layers.push(
        `repeating-linear-gradient(180deg, ${rgba(t.hi, 0.95)} 0 ${s}, ${rgba(shade(hex, -0.35), 0.35 + 0.5 * tilt)} ${s} 4px) left top / 100% ${pc(drop)} no-repeat`,
      );
      break;
    }
    case 'vertical': {
      const cover = Math.max(0.08, 1 - open);
      const f = 0.25 + 0.75 * tilt * (1 - open) + 0.2 * open;
      const s = `${(4 * Math.min(1, f)).toFixed(2)}px`;
      layers.push(
        `repeating-linear-gradient(90deg, ${rgba(t.hi, 0.95)} 0 ${s}, ${rgba(shade(hex, -0.3), 0.3 + 0.4 * tilt)} ${s} 4px) ${mirror ? 'right' : 'left'} top / ${pc(cover)} 100% no-repeat`,
      );
      break;
    }
    case 'shutters': {
      // Panels swing open from the middle: each side keeps (1 − open) / 2 of the width (min. a sliver).
      const side = Math.max(0.1, (1 - open) / 2);
      const f = 0.35 + 0.65 * tilt;
      const s = `${(4 * f).toFixed(2)}px`;
      const louvres = `repeating-linear-gradient(180deg, ${rgba(t.hi, 0.95)} 0 ${s}, ${rgba(t.lo, 0.45 + 0.4 * tilt)} ${s} 4px)`;
      const stile = `linear-gradient(90deg, ${c(1)} 0 2px, transparent 2px calc(100% - 2px), ${c(1)} calc(100% - 2px))`;
      layers.push(`${stile} left top / ${pc(side)} 100% no-repeat`, `${stile} right top / ${pc(side)} 100% no-repeat`);
      layers.push(`${louvres} left top / ${pc(side)} 100% no-repeat`, `${louvres} right top / ${pc(side)} 100% no-repeat`);
      break;
    }
  }
  layers.push(SKY);
  return { background: layers.join(', ') };
}
