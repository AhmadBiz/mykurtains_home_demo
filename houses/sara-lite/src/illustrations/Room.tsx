import { memo } from 'react';
import { CASING } from './layout';
import type { Layout } from './layout';

/* Quiet interior palette: dim warm wall, slightly lighter painted trim, dark bronze sashes, bright daylight glass. */
const WALL_HI = '#3a3631';
const WALL_LO = '#211e1b';
const TRIM = '#45403a';
const TRIM_HI = '#57514a';
const TRIM_LO = '#2a2723';
const FRAME = '#57524b';
const FRAME_HI = '#6e685f';
const HAIR = 'rgba(245,243,240,0.10)';
const SHADOW = 'rgba(0,0,0,0.35)';

const hair = { vectorEffect: 'non-scaling-stroke' as const, strokeWidth: 1 };

function rectPath(x: number, y: number, w: number, h: number): string {
  return `M${x} ${y}h${w}v${h}h${-w}Z`;
}

/** Window panes (glass areas between sash members) for the frame cut-outs and the muntins. */
function panes(L: Layout): { x: number; y: number; w: number; h: number }[] {
  const fw = 0.05;
  if (L.isDoor) {
    const pw = L.ow / 2 + 0.025;
    const sf = 0.065;
    return [
      { x: L.x0 + sf, y: L.top + sf, w: pw - 2 * sf, h: L.oh - 2 * sf - 0.02 },
      { x: L.x0 + L.ow - pw + sf, y: L.top + sf, w: pw - 2 * sf, h: L.oh - 2 * sf - 0.02 },
    ];
  }
  if (L.ow >= 1.4) {
    const mull = 0.06;
    const pw = (L.ow - 2 * fw - mull) / 2;
    return [
      { x: L.x0 + fw, y: L.top + fw, w: pw, h: L.oh - 2 * fw },
      { x: L.x0 + fw + pw + mull, y: L.top + fw, w: pw, h: L.oh - 2 * fw },
    ];
  }
  return [{ x: L.x0 + fw, y: L.top + fw, w: L.ow - 2 * fw, h: L.oh - 2 * fw }];
}

function muntins(L: Layout, ps: { x: number; y: number; w: number; h: number }[]): string {
  if (L.isDoor || L.frosted || L.ow < 1) return '';
  let d = '';
  for (const p of ps) {
    const cols = Math.min(3, Math.max(1, Math.round(p.w / 0.42)));
    const rows = Math.min(4, Math.max(1, Math.round(p.h / 0.45)));
    for (let c = 1; c < cols; c++) d += `M${p.x + (p.w * c) / cols} ${p.y}v${p.h}`;
    for (let r = 1; r < rows; r++) d += `M${p.x} ${p.y + (p.h * r) / rows}h${p.w}`;
  }
  return d;
}

/** Defs for the room: wall falloff, outdoor glass, sheen. */
export function RoomDefs({ id, L }: { id: string; L: Layout }) {
  const cx = (L.x0 + L.ow / 2) / L.W;
  const cy = (L.top + L.oh / 2) / L.H;
  return (
    <>
      <radialGradient id={`${id}-wall`} cx={cx} cy={cy} r={0.85} gradientTransform={`translate(${cx} ${cy}) scale(1 ${L.W / L.H}) translate(${-cx} ${-cy})`}>
        <stop offset="0" stopColor={WALL_HI} />
        <stop offset="1" stopColor={WALL_LO} />
      </radialGradient>
      <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="0" y2="1">
        {L.frosted ? (
          <>
            <stop offset="0" stopColor="#d4d8d8" />
            <stop offset="0.55" stopColor="#c3c8c8" />
            <stop offset="1" stopColor="#b3b9b6" />
          </>
        ) : (
          <>
            <stop offset="0" stopColor="#7f9db4" />
            <stop offset="0.5" stopColor="#adbfc8" />
            <stop offset="0.74" stopColor="#c3cdcb" />
            <stop offset="0.86" stopColor="#9fb09a" />
            <stop offset="1" stopColor="#7e9177" />
          </>
        )}
      </linearGradient>
      <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0.18" stopColor="#ffffff" stopOpacity="0" />
        <stop offset="0.38" stopColor="#ffffff" stopOpacity={L.frosted ? 0.1 : 0.16} />
        <stop offset="0.44" stopColor="#ffffff" stopOpacity="0" />
        <stop offset="0.58" stopColor="#ffffff" stopOpacity="0.06" />
        <stop offset="0.66" stopColor="#ffffff" stopOpacity="0" />
      </linearGradient>
      <linearGradient id={`${id}-trim`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={TRIM_HI} />
        <stop offset="1" stopColor={TRIM} />
      </linearGradient>
      <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#8d8a85" />
        <stop offset="1" stopColor="#4e4b46" />
      </linearGradient>
    </>
  );
}

/** Wall, crown, baseboard, casing, sashes, glass and stool. Static for a given window. */
export const Room = memo(function Room({ id, L }: { id: string; L: Layout }) {
  const { W, H, x0, x1, ow, top, bot, oh } = L;
  const ps = panes(L);
  const frameD = rectPath(x0, top, ow, oh) + ps.map((p) => rectPath(p.x, p.y, p.w, p.h)).join('');
  const mun = muntins(L, ps);
  const stoolY = bot;
  return (
    <g>
      <rect x={0} y={0} width={W} height={H} fill={`url(#${id}-wall)`} />
      {/* crown */}
      <rect x={0} y={0} width={W} height={0.05} fill={`url(#${id}-trim)`} />
      <rect x={0} y={0.05} width={W} height={0.014} fill={SHADOW} opacity={0.5} />
      <line x1={0} x2={W} y1={0.05} y2={0.05} stroke={HAIR} {...hair} />
      {/* baseboard */}
      <rect x={0} y={H - 0.1} width={W} height={0.1} fill={TRIM} />
      <rect x={0} y={H - 0.1} width={W} height={0.012} fill={TRIM_HI} />
      <line x1={0} x2={W} y1={H - 0.1} y2={H - 0.1} stroke={HAIR} {...hair} />
      {/* casing */}
      <rect x={x0 - CASING - 0.012} y={top - CASING - 0.012} width={ow + 2 * CASING + 0.024} height={(L.isDoor ? H : bot) - top + CASING + 0.012} fill={SHADOW} opacity={0.35} />
      <rect x={x0 - CASING} y={top - CASING} width={ow + 2 * CASING} height={(L.isDoor ? H : bot) - top + CASING} fill={`url(#${id}-trim)`} />
      <rect x={x0 - CASING} y={top - CASING} width={ow + 2 * CASING} height={(L.isDoor ? H : bot) - top + CASING} fill="none" stroke={HAIR} {...hair} />
      {/* glass */}
      <rect x={x0} y={top} width={ow} height={oh} fill={`url(#${id}-glass)`} />
      <rect x={x0} y={top} width={ow} height={oh} fill={`url(#${id}-sheen)`} />
      {/* sashes / sliding panels */}
      <path d={frameD} fill={FRAME} fillRule="evenodd" />
      {ps.map((p, i) => (
        <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} fill="none" stroke="rgba(0,0,0,0.35)" {...hair} />
      ))}
      {mun && <path d={mun} stroke={FRAME} strokeWidth={0.018} fill="none" />}
      <rect x={x0} y={top} width={ow} height={oh} fill="none" stroke={FRAME_HI} {...hair} />
      {L.isDoor ? (
        <>
          {/* the sliding (room-side) panel overlaps the fixed one at the centre */}
          <rect x={x0 + ow / 2 - 0.025} y={top} width={0.065} height={oh} fill={FRAME_HI} />
          <line x1={x0 + ow / 2 - 0.025} x2={x0 + ow / 2 - 0.025} y1={top} y2={bot} stroke="rgba(0,0,0,0.45)" {...hair} />
          <rect x={x0 + ow / 2 + 0.008} y={H - 1.08} width={0.016} height={0.22} rx={0.008} fill="#9a958d" />
          <rect x={x0 - 0.01} y={H - 0.022} width={ow + 0.02} height={0.022} fill={`url(#${id}-metal)`} />
        </>
      ) : (
        <>
          {/* stool (interior sill) and apron */}
          <rect x={x0 - CASING} y={stoolY + 0.03} width={ow + 2 * CASING} height={0.075} fill={TRIM} />
          <rect x={x0 - CASING} y={stoolY + 0.03} width={ow + 2 * CASING} height={0.012} fill={SHADOW} opacity={0.6} />
          <rect x={x0 - CASING - 0.035} y={stoolY} width={ow + 2 * CASING + 0.07} height={0.03} fill={TRIM_HI} />
          <line x1={x0 - CASING - 0.035} x2={x1 + CASING + 0.035} y1={stoolY} y2={stoolY} stroke="rgba(245,243,240,0.16)" {...hair} />
          <line x1={x0 - CASING - 0.035} x2={x1 + CASING + 0.035} y1={stoolY + 0.03} y2={stoolY + 0.03} stroke={TRIM_LO} {...hair} />
        </>
      )}
      {/* floor line */}
      <line x1={0} x2={W} y1={H - 0.001} y2={H - 0.001} stroke="rgba(245,243,240,0.14)" {...hair} />
    </g>
  );
});
