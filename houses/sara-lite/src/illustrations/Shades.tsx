import { r4, tf } from './layout';
import type { Layout } from './layout';
import { clamp, lightness, shade, tones } from './color';

const hair = { vectorEffect: 'non-scaling-stroke' as const, strokeWidth: 1 };
/** Metric hairline for elements inside CSS-transformed groups (non-scaling strokes glitch there in Chromium). */
const fine = { strokeWidth: 0.0035 };

interface ShadeProps {
  id: string;
  L: Layout;
  hex: string;
  accent?: string;
  open: number;
  translucency: number;
}

function railFill(hex: string) {
  return lightness(hex) < 0.38 ? { a: '#4a4c51', b: '#2c2e32' } : { a: '#f1f0ec', b: '#bdbab4' };
}

/** Roller blind: cassette at the top of the opening, flat fabric, bottom bar, bead chain. */
export function Roller({ id, L, hex, open, translucency }: ShadeProps) {
  const cas = 0.065;
  const x = L.x0 + 0.012;
  const w = L.ow - 0.024;
  const y0 = L.top + cas;
  const len = L.oh - cas - 0.006;
  const d = 1 - open;
  const t = tones(hex, 0.5);
  const rail = railFill(hex);
  const chainX = L.x1 - 0.028;
  const chainLen = Math.min(L.oh * 0.62, 1.1);
  return (
    <g>
      <defs>
        <linearGradient id={`${id}-fab`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={t.lo} />
          <stop offset="0.06" stopColor={hex} />
          <stop offset="0.5" stopColor={t.hi} />
          <stop offset="0.94" stopColor={hex} />
          <stop offset="1" stopColor={t.lo} />
        </linearGradient>
        <linearGradient id={`${id}-cas`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={rail.a} />
          <stop offset="1" stopColor={rail.b} />
        </linearGradient>
      </defs>
      <g className="ci-anim" style={{ transform: tf(x, y0, 1, d) }}>
        <rect x={0} y={0} width={w} height={len} fill={`url(#${id}-fab)`} opacity={1 - translucency * 0.6} />
      </g>
      <g className="ci-anim" style={{ transform: tf(0, y0 + d * len) }}>
        <rect x={x - 0.004} y={-0.022} width={w + 0.008} height={0.022} rx={0.004} fill={`url(#${id}-cas)`} />
        <line x1={x - 0.004} x2={x + w + 0.004} y1={0} y2={0} stroke="rgba(0,0,0,0.4)" {...fine} />
      </g>
      {/* bead chain loop */}
      <path
        d={`M${chainX} ${y0}v${chainLen}M${chainX + 0.014} ${y0}v${chainLen}`}
        stroke="#d9d6d0"
        strokeWidth={0.0075}
        strokeLinecap="round"
        strokeDasharray="0 0.013"
        fill="none"
      />
      <path d={`M${chainX} ${y0 + chainLen}q0.007 0.02 0.014 0`} stroke="#d9d6d0" strokeWidth={0.006} fill="none" />
      <rect x={L.x0 + 0.004} y={L.top} width={L.ow - 0.008} height={cas} rx={0.008} fill={`url(#${id}-cas)`} />
      <rect x={L.x0 + 0.004} y={L.top} width={L.ow - 0.008} height={cas} rx={0.008} fill="none" stroke="rgba(0,0,0,0.35)" {...hair} />
    </g>
  );
}

/** Cellular (honeycomb) shade: fine pleats that compress toward the headrail. */
export function Cellular({ id, L, hex, open, translucency }: ShadeProps) {
  const hr = 0.045;
  const x = L.x0 + 0.01;
  const w = L.ow - 0.02;
  const y0 = L.top + hr;
  const len = L.oh - hr - 0.006;
  const m = clamp((0.035 + 0.035 * len) / len, 0, 1);
  const s = m + (1 - m) * (1 - open);
  const t = tones(hex, 0.6);
  const rail = railFill(hex);
  const pleat = 0.032;
  return (
    <g>
      <defs>
        <linearGradient id={`${id}-pl`} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={0} y2={pleat} spreadMethod="repeat">
          <stop offset="0" stopColor={t.deep} />
          <stop offset="0.1" stopColor={t.lo} />
          <stop offset="0.45" stopColor={t.hi} />
          <stop offset="0.8" stopColor={hex} />
          <stop offset="0.94" stopColor={t.lo} />
          <stop offset="1" stopColor={t.deep} />
        </linearGradient>
        <linearGradient id={`${id}-edge`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.22" />
          <stop offset="0.05" stopColor="#000" stopOpacity="0" />
          <stop offset="0.95" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.22" />
        </linearGradient>
        <linearGradient id={`${id}-rail`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={rail.a} />
          <stop offset="1" stopColor={rail.b} />
        </linearGradient>
      </defs>
      <g className="ci-anim" style={{ transform: tf(x, y0, 1, s) }}>
        <g opacity={1 - translucency * 0.5}>
          <rect x={0} y={0} width={w} height={len} fill={`url(#${id}-pl)`} />
          <rect x={0} y={0} width={w} height={len} fill={`url(#${id}-edge)`} />
        </g>
      </g>
      <g className="ci-anim" style={{ transform: tf(0, y0 + s * len) }}>
        <rect x={x} y={-0.02} width={w} height={0.02} rx={0.005} fill={`url(#${id}-rail)`} />
        <line x1={x} x2={x + w} y1={0} y2={0} stroke="rgba(0,0,0,0.35)" {...fine} />
      </g>
      <rect x={L.x0 + 0.004} y={L.top} width={L.ow - 0.008} height={hr} rx={0.006} fill={`url(#${id}-rail)`} />
      <line x1={L.x0 + 0.004} x2={L.x1 - 0.004} y1={L.top + hr} y2={L.top + hr} stroke="rgba(0,0,0,0.35)" {...hair} />
    </g>
  );
}

/** Roman shade: flat fabric with a soft seam every 20 cm; the raised length gathers into neat folds. */
export function Roman({ id, L, hex, accent, open }: ShadeProps) {
  const hr = 0.055;
  const x = L.x0 + 0.01;
  const w = L.ow - 0.02;
  const y0 = L.top + hr;
  const len = L.oh - hr - 0.006;
  const step = 0.2;
  const foldH = 0.085;
  const foldStep = 0.052;
  const raised = open * len;
  const flat = len - raised;
  const kf = raised / step;
  const maxF = Math.ceil(len / step);
  const t = tones(hex, 0.75);
  const clip = `${id}-clip`;
  const stripes = accent ? `${id}-stripes` : '';
  return (
    <g>
      <defs>
        <linearGradient id={`${id}-seam`} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={0} y2={step} spreadMethod="repeat">
          <stop offset="0" stopColor={t.hi} />
          <stop offset="0.5" stopColor={hex} />
          <stop offset="0.8" stopColor={hex} />
          <stop offset="0.96" stopColor={t.lo} />
          <stop offset="1" stopColor={t.lo} />
        </linearGradient>
        <linearGradient id={`${id}-fold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={t.lo} />
          <stop offset="0.12" stopColor={shade(hex, 0.12)} />
          <stop offset="0.4" stopColor={t.hi} />
          <stop offset="0.72" stopColor={hex} />
          <stop offset="1" stopColor={t.deep} />
        </linearGradient>
        <linearGradient id={`${id}-side`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.16" />
          <stop offset="0.04" stopColor="#000" stopOpacity="0" />
          <stop offset="0.96" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.16" />
        </linearGradient>
        {accent && (
          <pattern id={stripes} patternUnits="userSpaceOnUse" width={0.064} height={4}>
            <rect x={0.018} y={0} width={0.008} height={4} fill={accent} opacity={0.85} />
            <rect x={0.032} y={0} width={0.003} height={4} fill={accent} opacity={0.6} />
          </pattern>
        )}
        <clipPath id={clip}>
          <rect className="ci-anim" x={0} y={0} width={w} height={len} style={{ transform: tf(0, 0, 1, flat / len) }} />
        </clipPath>
      </defs>
      <g transform={`translate(${r4(x)} ${r4(y0)})`}>
        <g clipPath={`url(#${clip})`}>
          <rect x={0} y={0} width={w} height={len} fill={`url(#${id}-seam)`} />
          {accent && <rect x={0} y={0} width={w} height={len} fill={`url(#${stripes})`} />}
          <rect x={0} y={0} width={w} height={len} fill={`url(#${id}-side)`} />
        </g>
        {Array.from({ length: maxF }, (_, i) => (
          <g key={i} className="ci-anim" style={{ transform: tf(0, flat + i * foldStep - 0.012), opacity: clamp(kf - i, 0, 1) }}>
            <rect x={-0.004} y={0} width={w + 0.008} height={foldH} rx={0.026} fill={`url(#${id}-fold)`} stroke={t.deep} strokeOpacity={0.55} {...fine} />
            {accent && <rect x={-0.004} y={0} width={w + 0.008} height={foldH} rx={0.026} fill={`url(#${stripes})`} />}
          </g>
        ))}
      </g>
      <rect x={L.x0 + 0.004} y={L.top} width={L.ow - 0.008} height={hr} rx={0.008} fill={`url(#${id}-fold)`} />
      {accent && <rect x={L.x0 + 0.004} y={L.top} width={L.ow - 0.008} height={hr} fill={`url(#${stripes})`} />}
      <line x1={L.x0 + 0.004} x2={L.x1 - 0.004} y1={L.top + hr} y2={L.top + hr} stroke="rgba(0,0,0,0.35)" {...hair} />
    </g>
  );
}
