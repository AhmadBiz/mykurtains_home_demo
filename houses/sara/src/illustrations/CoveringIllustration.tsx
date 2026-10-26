import { useEffect, useId, useLayoutEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import type { ColorOption, WindowCoveringState } from '../data/coverings';
import type { WindowInstance } from '../data/geometry';
import { useStore } from '../store/useStore';
import { clamp } from './color';
import { RippleFold } from './Curtains';
import { coveringLabel } from './label';
import { frameFor, layoutFor, r4 } from './layout';
import type { Frame } from './layout';
import { Fixture, Room, RoomDefs } from './Room';
import { Cellular, Roller, Roman } from './Shades';
import { Shutters } from './Shutters';
import { Venetian, Vertical } from './Slats';
import './illustrations.css';

export interface CoveringIllustrationProps {
  win: WindowInstance;
  state: WindowCoveringState;
  color: ColorOption;
}

const VB_MS = 300;
const vbString = (f: Frame) => `${r4(f.x)} ${r4(f.y)} ${r4(f.w)} ${r4(f.h)}`;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Sets the svg's viewBox directly (not through React): snaps when the window changes, glides over 300 ms when only
 * the covering type changes the framing (e.g. a roller blind's close crop → floor-to-ceiling curtains).
 */
function useViewBox(target: Frame, winId: string) {
  const ref = useRef<SVGSVGElement>(null);
  const cur = useRef<{ f: Frame; win: string } | null>(null);
  const raf = useRef(0);
  useLayoutEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    cancelAnimationFrame(raf.current);
    const from = cur.current;
    const set = (f: Frame) => {
      cur.current = { f, win: winId };
      svg.setAttribute('viewBox', vbString(f));
    };
    if (!from || from.win !== winId || reducedMotion()) {
      set(target);
      return;
    }
    const a = from.f;
    if (vbString(a) === vbString(target)) return;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = easeInOut(Math.min(1, (now - t0) / VB_MS));
      set({ x: a.x + (target.x - a.x) * k, y: a.y + (target.y - a.y) * k, w: a.w + (target.w - a.w) * k, h: a.h + (target.h - a.h) * k });
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, [target, winId]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return ref;
}

/**
 * Front view of the selected window as seen from inside the room, drawn to scale (viewBox in metres) at a fixed 5:4
 * framing: floor to ceiling with the whole track for curtains and sheers, a close crop on the casing for blinds,
 * shades and shutters. The covering is shown in its current state and colour; state changes animate with CSS
 * transitions (transform / opacity), the framing with a short viewBox glide.
 */
export function CoveringIllustration({ win, state, color }: CoveringIllustrationProps) {
  const lang = useStore((s) => s.lang);
  const id = 'ci' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const L = useMemo(() => layoutFor(win), [win]);
  const frame = useMemo(() => frameFor(L, state.type), [L, state.type]);
  const svgRef = useViewBox(frame, win.id);
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
      ref={svgRef}
      className="ci-svg"
      width="500"
      height="400"
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
      <Fixture L={L} />
    </svg>
  );
}
