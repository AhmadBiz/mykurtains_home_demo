import { useId, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { ColorOption, WindowCoveringState } from '../data/coverings';
import type { WindowInstance } from '../data/geometry';
import { useStore } from '../store/useStore';
import { clamp } from './color';
import { RippleFold } from './Curtains';
import { coveringLabel } from './label';
import { layoutFor, r4 } from './layout';
import { Room, RoomDefs } from './Room';
import { Cellular, Roller, Roman } from './Shades';
import { Shutters } from './Shutters';
import { Venetian, Vertical } from './Slats';
import './illustrations.css';

export interface CoveringIllustrationProps {
  win: WindowInstance;
  state: WindowCoveringState;
  color: ColorOption;
}

/**
 * Front view of the selected window as seen from inside the room, drawn to scale (viewBox in metres, floor to
 * ceiling, opening + curtain stack-back + wall margin), with its covering in its current state and colour.
 * State changes animate with CSS transitions (transform / opacity), no per-frame React work.
 */
export function CoveringIllustration({ win, state, color }: CoveringIllustrationProps) {
  const lang = useStore((s) => s.lang);
  const id = 'ci' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const L = useMemo(() => layoutFor(win), [win]);
  const open = clamp(state.open, 0, 1);
  const tilt = clamp(state.tilt, -1, 1);
  const translucency = color.translucency ?? 0;
  const label = coveringLabel(state, color, lang);
  const common = { id: `${id}-k`, L, hex: color.hex, accent: color.accent, open };

  let covering: ReactNode = null;
  switch (state.type) {
    case 'curtains':
      covering = <RippleFold {...common} sheerOnly={false} withSheer={state.sheer} translucency={translucency} />;
      break;
    case 'sheers':
      covering = <RippleFold {...common} sheerOnly withSheer={false} translucency={translucency || 0.6} />;
      break;
    case 'roller':
      covering = <Roller {...common} translucency={translucency} />;
      break;
    case 'roman':
      covering = <Roman {...common} translucency={translucency} />;
      break;
    case 'cellular':
      covering = <Cellular {...common} translucency={translucency} />;
      break;
    case 'venetian':
      covering = <Venetian {...common} colorId={color.id} tilt={tilt} metal={(color.metalness ?? 0) >= 0.15} />;
      break;
    case 'vertical':
      covering = <Vertical {...common} colorId={color.id} tilt={tilt} metal={false} />;
      break;
    case 'shutters':
      covering = <Shutters {...common} tilt={tilt} />;
      break;
    case 'none':
      break;
  }

  return (
    <svg
      className="ci-svg"
      viewBox={`0 0 ${r4(L.W)} ${r4(L.H)}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={label}
      data-covering={state.type}
    >
      <defs>
        <RoomDefs id={id} L={L} />
      </defs>
      <Room id={id} L={L} />
      {/* key: a new covering type mounts fresh (no cross-type transitions) */}
      <g key={state.type}>{covering}</g>
    </svg>
  );
}
