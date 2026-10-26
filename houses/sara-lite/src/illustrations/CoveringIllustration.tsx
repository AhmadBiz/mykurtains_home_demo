import type { ColorOption, WindowCoveringState } from '../data/coverings';
import type { WindowInstance } from '../data/geometry';

export interface CoveringIllustrationProps {
  win: WindowInstance;
  state: WindowCoveringState;
  color: ColorOption;
}

/** STUB — front-view SVG of a window with its covering. Owned by the illustrations builder. */
export function CoveringIllustration({ win }: CoveringIllustrationProps) {
  return <svg viewBox="0 0 100 100" role="img" aria-label={win.nameFr} />;
}
