import { CASING, tf } from './layout';
import type { Layout } from './layout';
import { clamp, lightness, shade, tones } from './color';

const hair = { vectorEffect: 'non-scaling-stroke' as const, strokeWidth: 1 };
/** Metric hairline for elements inside CSS-transformed groups (non-scaling strokes glitch there in Chromium). */
const fine = { strokeWidth: 0.0035 };
const WOOD_IDS = new Set(['oak', 'walnut', 'white-wood']);
const MAX_SLATS = 120;

interface SlatProps {
  id: string;
  L: Layout;
  hex: string;
  accent?: string;
  colorId: string;
  open: number;
  tilt: number;
  metal: boolean;
}

/** Gradient across one slat / louvre / vane. `flip` swaps which edge catches the light (tilt sign). */
export function SlatGradient({ id, hex, accent, metal, flip, horizontal }: {
  id: string;
  hex: string;
  accent?: string;
  metal: boolean;
  flip: boolean;
  horizontal?: boolean;
}) {
  const t = tones(hex, metal ? 0.9 : 0.75);
  const a = flip ? t.lo : t.hi;
  const b = flip ? t.hi : t.lo;
  const mid = accent ? shade(accent, 0.1) : hex;
  const dir = horizontal ? { x1: '0', y1: '0', x2: '1', y2: '0' } : { x1: '0', y1: '0', x2: '0', y2: '1' };
  return (
    <linearGradient id={id} {...dir}>
      <stop offset="0" stopColor={a} />
      {metal && <stop offset={flip ? '0.7' : '0.22'} stopColor={shade(hex, 0.45)} />}
      <stop offset="0.45" stopColor={hex} />
      {accent && <stop offset="0.62" stopColor={mid} />}
      {accent && <stop offset="0.7" stopColor={hex} />}
      <stop offset="1" stopColor={b} />
    </linearGradient>
  );
}

/**
 * Venetian blind: 25 mm aluminium (or 50 mm wood) slats. Tilt sets the slat's apparent height (0 = edge-on, see
 * through; ±1 = closed), raising collects the lowest slats into a stack on the bottom rail.
 */
export function Venetian({ id, L, hex, accent, colorId, open, tilt, metal }: SlatProps) {
  const wood = WOOD_IDS.has(colorId);
  const slatW = wood ? 0.05 : 0.025;
  const hr = wood ? 0.05 : 0.035;
  const yS = L.top + hr + 0.003;
  const len = L.oh - hr - 0.026;
  let pitch = wood ? 0.043 : 0.0215;
  let n = Math.floor(len / pitch);
  if (n > MAX_SLATS) {
    n = MAX_SLATS;
    pitch = len / n;
  }
  const d = 1 - open;
  const nLow = clamp(Math.floor((d * len) / pitch - 0.5) + 1, 0, n);
  const stackT = slatW * 0.17;
  const tiltS = Math.max(0.09, Math.sin(Math.abs(tilt) * 1.45));
  const stackTop = yS + nLow * pitch;
  const railY = stackTop + (n - nLow) * stackT;
  const x = L.x0 + 0.01;
  const w = L.ow - 0.02;
  const grad = `${id}-slat`;
  const ladderXs = [L.x0 + L.ow * 0.13, L.x1 - L.ow * 0.13 - 0.01];
  if (L.ow > 1.3) ladderXs.push(L.x0 + L.ow / 2 - 0.005);
  const railFill = shade(hex, lightness(hex) > 0.6 ? -0.08 : 0.06);
  return (
    <g>
      <defs>
        <SlatGradient id={grad} hex={hex} accent={wood ? accent : undefined} metal={metal} flip={tilt < 0} />
      </defs>
      {Array.from({ length: n }, (_, i) => {
        const lowered = i < nLow;
        const y = lowered ? yS + (i + 0.5) * pitch : stackTop + (i - nLow + 0.5) * stackT;
        const s = lowered ? tiltS : (stackT * 0.9) / slatW;
        return (
          <g key={i} className="ci-anim" style={{ transform: tf(0, y, 1, s) }}>
            <rect x={x} y={-slatW / 2} width={w} height={slatW} rx={0.002} fill={`url(#${grad})`} />
          </g>
        );
      })}
      {/* ladder tapes down to the bottom rail */}
      {ladderXs.map((lx, i) => (
        <g key={i} className="ci-anim" style={{ transform: tf(0, yS, 1, (railY - yS) / len) }}>
          <rect x={lx} y={0} width={wood ? 0.024 : 0.009} height={len} fill={wood ? shade(hex, -0.12) : '#ffffff'} opacity={wood ? 0.85 : 0.22} />
        </g>
      ))}
      <g className="ci-anim" style={{ transform: tf(0, railY) }}>
        <rect x={x - 0.003} y={0} width={w + 0.006} height={0.02} rx={0.004} fill={railFill} />
        <rect x={x - 0.003} y={0} width={w + 0.006} height={0.02} rx={0.004} fill="none" stroke="rgba(0,0,0,0.35)" {...fine} />
      </g>
      {/* headrail */}
      <rect x={L.x0 + 0.004} y={L.top} width={L.ow - 0.008} height={hr} rx={0.005} fill={`url(#${grad})`} />
      <rect x={L.x0 + 0.004} y={L.top} width={L.ow - 0.008} height={hr} rx={0.005} fill="none" stroke="rgba(0,0,0,0.35)" {...hair} />
      {/* tilt wand */}
      <rect x={L.x0 + 0.045} y={L.top + hr} width={0.008} height={Math.min(0.75, L.oh * 0.55)} rx={0.004} fill="rgba(225,232,238,0.55)" stroke="rgba(255,255,255,0.35)" {...hair} />
    </g>
  );
}

/**
 * Vertical blind: 89 mm vanes from a headrail mounted over the casing. Tilt = vane apparent width (0 = edge-on),
 * opening draws the vanes to a stack on the left.
 */
export function Vertical({ id, L, hex, open, tilt, metal }: SlatProps) {
  const vaneW = 0.089;
  const left = L.x0 - CASING - 0.04;
  const span = L.ow + 2 * CASING + 0.08;
  const hy = L.top - CASING - 0.065;
  const vt = hy + 0.05;
  const vb = L.isDoor ? L.H - 0.015 : L.bot - 0.012;
  const n = Math.round((span - vaneW) / 0.08) + 1;
  const pitch = (span - vaneW) / (n - 1);
  const pe = pitch * (1 - open) + 0.013 * open;
  const sTilt = Math.max(0.07, Math.sin(Math.abs(tilt) * 1.5));
  const s = sTilt * (1 - open) + 0.28 * open;
  const grad = `${id}-vane`;
  return (
    <g>
      <defs>
        <SlatGradient id={grad} hex={hex} metal={metal} flip={tilt < 0} horizontal />
      </defs>
      {Array.from({ length: n }, (_, i) => (
        <g key={i} className="ci-anim" style={{ transform: tf(left + vaneW / 2 + i * pe, 0, s, 1) }}>
          <rect x={-vaneW / 2} y={vt} width={vaneW} height={vb - vt} fill={`url(#${grad})`} stroke="rgba(0,0,0,0.22)" {...fine} />
        </g>
      ))}
      <rect x={left - 0.01} y={hy} width={span + 0.02} height={0.05} rx={0.006} fill="#e9e7e2" />
      <rect x={left - 0.01} y={hy + 0.038} width={span + 0.02} height={0.012} fill="rgba(0,0,0,0.18)" />
      <rect x={left - 0.01} y={hy} width={span + 0.02} height={0.05} rx={0.006} fill="none" stroke="rgba(0,0,0,0.35)" {...hair} />
      {/* wand on the stack side */}
      <rect x={left + 0.012} y={hy + 0.05} width={0.008} height={Math.min(1.1, (vb - vt) * 0.6)} rx={0.004} fill="rgba(225,232,238,0.55)" stroke="rgba(255,255,255,0.35)" {...hair} />
    </g>
  );
}
