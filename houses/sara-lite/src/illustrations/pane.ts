import type { CSSProperties } from 'react';
import type { ColorOption, WindowCoveringState } from '../data/coverings';

/**
 * STUB — style for the tiny pane on the glass model that hints at a window's covering
 * (e.g. stripes for blinds, soft waves for curtains). Owned by the illustrations builder.
 */
export function paneStyle(state: WindowCoveringState, color: ColorOption): CSSProperties {
  return state.type === 'none' ? {} : { background: `color-mix(in srgb, ${color.hex} 55%, transparent)` };
}
