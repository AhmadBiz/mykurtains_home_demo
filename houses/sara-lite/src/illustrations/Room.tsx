import { memo } from 'react';
import { CASING, ROOM_BLEED } from './layout';
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
/** Floor and ceiling planes, seen only when a drawing spills past them. */
const FLOOR_HI = '#1d1a17';
const FLOOR_LO = '#141210';
const CEILING = '#2c2925';

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
  // Soft light falloff centred on the window, in metres, so it holds however the drawing is cropped.
  const cx = L.x0 + L.ow / 2;
  const cy = L.top + L.oh / 2;
  const r = Math.max(2.2, L.oh * 0.9 + 1.2);
  return (
    <>
      <radialGradient id={`${id}-wall`} gradientUnits="userSpaceOnUse" cx={cx} cy={cy} r={r}>
        <stop offset="0" stopColor={WALL_HI} />
        <stop offset="1" stopColor={WALL_LO} />
      </radialGradient>
      <linearGradient id={`${id}-floor`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={FLOOR_HI} />
        <stop offset="1" stopColor={FLOOR_LO} />
      </linearGradient>
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
  const { H, x0, x1, ow, top, bot, oh } = L;
  const ps = panes(L);
  const frameD = rectPath(x0, top, ow, oh) + ps.map((p) => rectPath(p.x, p.y, p.w, p.h)).join('');
  const mun = muntins(L, ps);
  const stoolY = bot;
  // Wall, crown and baseboard run past the drawing's box: the visible part is chosen by the viewBox.
  const bx = -ROOM_BLEED;
  const bw = L.W + 2 * ROOM_BLEED;
  return (
    <g>
      <rect x={bx} y={-ROOM_BLEED} width={bw} height={ROOM_BLEED} fill={CEILING} />
      <rect x={bx} y={0} width={bw} height={H} fill={`url(#${id}-wall)`} />
      <rect x={bx} y={H} width={bw} height={ROOM_BLEED} fill={`url(#${id}-floor)`} />
      {/* crown */}
      <rect x={bx} y={0} width={bw} height={0.05} fill={`url(#${id}-trim)`} />
      <rect x={bx} y={0.05} width={bw} height={0.014} fill={SHADOW} opacity={0.5} />
      <line x1={bx} x2={bx + bw} y1={0.05} y2={0.05} stroke={HAIR} {...hair} />
      {/* baseboard */}
      <rect x={bx} y={H - 0.1} width={bw} height={0.1} fill={TRIM} />
      <rect x={bx} y={H - 0.1} width={bw} height={0.012} fill={TRIM_HI} />
      <line x1={bx} x2={bx + bw} y1={H - 0.1} y2={H - 0.1} stroke={HAIR} {...hair} />
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
      <line x1={bx} x2={bx + bw} y1={H - 0.001} y2={H - 0.001} stroke="rgba(245,243,240,0.14)" {...hair} />
    </g>
  );
});

/* Fixtures under windows whose curtains stop short of the floor: quiet silhouettes, so the short hem reads as intended. */
const BODY = '#3f3b36';
const BODY_LO = '#2f2c28';
const CHROME = '#77726a';
const RISE = 0.19;
const RUN = 0.267;

/** A gooseneck spout (front view, slightly turned) from its base up to `topY`. */
function Gooseneck({ x, baseY, topY }: { x: number; baseY: number; topY: number }) {
  const rad = Math.min(0.06, Math.max(0.03, (baseY - topY) * 0.25));
  const sx = x - rad;
  const d = `M${sx} ${baseY}V${topY + rad}A${rad} ${rad} 0 0 1 ${sx + 2 * rad} ${topY + rad}v${Math.min(0.07, rad * 1.2)}`;
  return (
    <g>
      <rect x={sx - 0.03} y={baseY - 0.012} width={0.06} height={0.012} rx={0.004} fill={CHROME} />
      <path d={d} fill="none" stroke={CHROME} strokeWidth={0.022} strokeLinecap="round" />
      <path d={d} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={1} vectorEffect="non-scaling-stroke" transform="translate(-0.005 0)" />
      <path d={`M${sx + 0.012} ${baseY - 0.07}l0.06 -0.025`} stroke={CHROME} strokeWidth={0.012} strokeLinecap="round" />
    </g>
  );
}

/** Counter + faucet, tub, or stair flight under the window. Drawn in front of the covering. */
export const Fixture = memo(function Fixture({ L }: { L: Layout }) {
  if (!L.obstacle || L.hemAbove <= 0) return null;
  const { H } = L;
  const cx = L.x0 + L.ow / 2;
  const bx = -ROOM_BLEED;
  const bw = L.W + 2 * ROOM_BLEED;
  if (L.obstacle === 'counter') {
    const top = H - 0.91;
    const kick = 0.1;
    let joints = '';
    for (let k = -12; k <= 12; k++) {
      const x = cx + 0.3 + k * 0.6;
      if (x > bx && x < bx + bw) joints += `M${x} ${top + 0.04}V${H - kick}`;
    }
    return (
      <g>
        <rect x={bx} y={top + 0.04} width={bw} height={H - kick - top - 0.04} fill={BODY} />
        <rect x={bx} y={H - kick} width={bw} height={kick} fill={BODY_LO} />
        <path d={joints} stroke={HAIR} {...hair} />
        <path d={joints} stroke="rgba(0,0,0,0.3)" {...hair} transform="translate(0.004 0)" />
        <rect x={bx} y={top} width={bw} height={0.04} fill={TRIM_HI} />
        <line x1={bx} x2={bx + bw} y1={top} y2={top} stroke="rgba(245,243,240,0.2)" {...hair} />
        <rect x={bx} y={top + 0.04} width={bw} height={0.01} fill={SHADOW} opacity={0.6} />
        <Gooseneck x={cx} baseY={top} topY={H - (L.hemAbove - 0.03)} />
      </g>
    );
  }
  if (L.obstacle === 'tub') {
    const rim = H - 0.56;
    const tw = Math.max(1.52, L.ow + 0.4);
    const tx = cx - tw / 2;
    return (
      <g>
        <rect x={tx} y={rim + 0.04} width={tw} height={H - rim - 0.04} fill={BODY} />
        <rect x={tx} y={rim + 0.04} width={tw} height={0.012} fill={SHADOW} opacity={0.6} />
        <rect x={tx - 0.015} y={rim} width={tw + 0.03} height={0.045} rx={0.02} fill={TRIM_HI} />
        <line x1={tx} x2={tx + tw} y1={rim} y2={rim} stroke="rgba(245,243,240,0.2)" {...hair} />
        <rect x={tx} y={rim} width={tw} height={H - rim} fill="none" stroke={HAIR} {...hair} />
        {L.hemAbove > 0.75 && <Gooseneck x={cx} baseY={rim} topY={H - (L.hemAbove - 0.03)} />}
      </g>
    );
  }
  // Stairs: the landing at hemAbove under the left of the window, the flight stepping down to the right.
  const land = H - L.hemAbove;
  const n = Math.max(1, Math.round(L.hemAbove / RISE));
  const rise = L.hemAbove / n;
  let d = `M${bx} ${H}V${land}H${L.x0}`;
  let nos = `M${bx} ${land}H${L.x0 + 0.03}`;
  for (let k = 1; k < n; k++) {
    const x = L.x0 + k * RUN;
    const y = land + k * rise;
    d += `V${y}H${x}`;
    nos += `M${x - RUN} ${y}H${x + 0.03}`;
  }
  d += `V${H}Z`;
  return (
    <g>
      <path d={d} fill={BODY} />
      <path d={nos} stroke={TRIM_HI} strokeWidth={0.025} />
      <path d={d} fill="none" stroke={HAIR} {...hair} />
    </g>
  );
});
