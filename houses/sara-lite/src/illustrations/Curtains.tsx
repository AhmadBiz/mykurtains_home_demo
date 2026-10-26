import { r4, tf } from './layout';
import type { Layout } from './layout';
import { rgba, tones } from './color';

/** Ripple-fold wave pitch when the panel is closed (m) — one light + one dark band. */
const WAVE = 0.11;
const TRACK_H = 0.026;
const TRACK_H2 = 0.042;

interface PanelGeom {
  closedW: number;
  pitch: number;
  top: number;
  hem: number;
  d: string;
}

function panelGeom(L: Layout, trackH: number): PanelGeom {
  const closedW = L.sb + L.ow / 2;
  const n = Math.max(4, Math.round(closedW / WAVE));
  const pitch = closedW / n;
  const top = trackH + 0.004;
  const hem = L.hem;
  const a = 0.012;
  // Straight heading under the track, wavy hem (continuous S-wave seen slightly from above).
  let d = `M0 ${r4(top)}H${r4(closedW)}V${r4(hem)}`;
  for (let k = n - 1; k >= 0; k--) {
    const x = (k + 1) * pitch;
    d += `Q${r4(x - pitch * 0.25)} ${r4(hem + a)} ${r4(x - pitch * 0.5)} ${r4(hem)}T${r4(x - pitch)} ${r4(hem)}`;
  }
  d += 'Z';
  return { closedW, pitch, top, hem, d };
}

interface LayerProps {
  id: string;
  L: Layout;
  hex: string;
  /** 0..1 drawn back. */
  open: number;
  opacity: number;
  /** Voile: softer fold contrast. */
  voile: boolean;
  trackH: number;
}

/** A pair of ripple-fold panels on one track channel. Folds keep their count and get tighter when drawn back. */
function RippleLayer({ id, L, hex, open, opacity, voile, trackH }: LayerProps) {
  const g = panelGeom(L, trackH);
  const t = tones(hex, voile ? 0.55 : 1);
  const width = L.sb + (L.ow / 2) * (1 - open);
  const sx = width / g.closedW;
  const trackL = L.x0 - L.sb;
  const trackR = L.x1 + L.sb;
  const fold = `${id}-fold`;
  const deep = `${id}-deep`;
  const fall = `${id}-fall`;
  const path = `${id}-p`;
  const deepOpacity = voile ? 0.1 + open * 0.25 : 0.12 + open * 0.55;
  const panel = (
    <>
      <use href={`#${path}`} fill={`url(#${fold})`} stroke={t.deep} strokeOpacity={voile ? 0.25 : 0.45} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
      <use href={`#${path}`} fill={`url(#${deep})`} className="ci-anim" style={{ opacity: deepOpacity }} />
      <use href={`#${path}`} fill={`url(#${fall})`} />
    </>
  );
  return (
    <g opacity={opacity}>
      <defs>
        <path id={path} d={g.d} />
        <linearGradient id={fold} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={g.pitch} y2={0} spreadMethod="repeat">
          <stop offset="0" stopColor={t.lo} />
          <stop offset="0.2" stopColor={hex} />
          <stop offset="0.42" stopColor={t.hi} />
          <stop offset="0.6" stopColor={hex} />
          <stop offset="0.84" stopColor={t.lo} />
          <stop offset="1" stopColor={t.lo} />
        </linearGradient>
        <linearGradient id={deep} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={g.pitch} y2={0} spreadMethod="repeat">
          <stop offset="0" stopColor="#000" stopOpacity="0.55" />
          <stop offset="0.3" stopColor="#000" stopOpacity="0" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0.12" />
          <stop offset="0.7" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id={fall} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.32" />
          <stop offset="0.035" stopColor="#000" stopOpacity="0.04" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.03" />
          <stop offset="0.92" stopColor="#000" stopOpacity="0.06" />
          <stop offset="1" stopColor="#000" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <g className="ci-anim" style={{ transform: tf(trackL, 0, sx, 1) }}>{panel}</g>
      <g className="ci-anim" style={{ transform: tf(trackR, 0, -sx, 1) }}>{panel}</g>
    </g>
  );
}

function Track({ id, L, double }: { id: string; L: Layout; double: boolean }) {
  const h = double ? TRACK_H2 : TRACK_H;
  const x = L.x0 - L.sb - 0.035;
  const w = L.ow + 2 * L.sb + 0.07;
  return (
    <g>
      <defs>
        <linearGradient id={`${id}-track`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#cfccc6" />
          <stop offset="0.45" stopColor="#ebe8e3" />
          <stop offset="1" stopColor="#a9a59f" />
        </linearGradient>
      </defs>
      <rect x={x} y={0} width={w} height={h} rx={0.004} fill={`url(#${id}-track)`} />
      {double && <line x1={x} x2={x + w} y1={h / 2} y2={h / 2} stroke="rgba(0,0,0,0.35)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
      <rect x={x} y={h - 0.004} width={w} height={0.004} fill="rgba(0,0,0,0.25)" />
      <rect x={x} y={0} width={0.012} height={h} fill="#8f8b85" />
      <rect x={x + w - 0.012} y={0} width={0.012} height={h} fill="#8f8b85" />
    </g>
  );
}

const SHEER_BACK = '#f3eee5';

/** Curtains (with optional sheer channel) or sheers on a ceiling-mounted ripple-fold track. */
export function RippleFold({ id, L, hex, open, sheerOnly, withSheer, translucency }: {
  id: string;
  L: Layout;
  hex: string;
  open: number;
  sheerOnly: boolean;
  withSheer: boolean;
  translucency: number;
}) {
  const double = withSheer && !sheerOnly;
  const trackH = double ? TRACK_H2 : TRACK_H;
  return (
    <g>
      {double && <RippleLayer id={`${id}-v`} L={L} hex={SHEER_BACK} open={0} opacity={0.5} voile trackH={trackH} />}
      <RippleLayer
        id={`${id}-c`}
        L={L}
        hex={hex}
        open={open}
        opacity={sheerOnly ? 1 - translucency * 0.85 : 1 - translucency * 0.85}
        voile={sheerOnly}
        trackH={trackH}
      />
      {/* faint shadow of the heading on the ceiling line */}
      <rect x={L.x0 - L.sb - 0.035} y={trackH} width={L.ow + 2 * L.sb + 0.07} height={0.012} fill={rgba('#000000', 0.18)} />
      <Track id={id} L={L} double={double} />
    </g>
  );
}
