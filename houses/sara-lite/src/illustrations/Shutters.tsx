import { tf } from './layout';
import type { Layout } from './layout';
import { tones } from './color';
import { SlatGradient } from './Slats';

const hair = { vectorEffect: 'non-scaling-stroke' as const, strokeWidth: 1 };
/** Metric hairline for elements inside CSS-transformed groups (non-scaling strokes glitch there in Chromium). */
const fine = { strokeWidth: 0.0035 };
const LOUVRE = 0.089;
/** Panels swing up to this angle (radians) when fully open: they rest foreshortened against the side walls. */
const MAX_SWING = (80 * Math.PI) / 180;

interface Props {
  id: string;
  L: Layout;
  hex: string;
  accent?: string;
  open: number;
  tilt: number;
}

/** One louvred panel in local coordinates (hinge at x = 0). */
function Panel({ pw, ph, louvre, frame, edge, s, rod }: {
  pw: number;
  ph: number;
  louvre: string;
  frame: string;
  edge: string;
  s: number;
  rod: string;
}) {
  const st = 0.045;
  const tr = 0.075;
  const br = 0.095;
  const mid = 0.065;
  const sections: [number, number][] =
    ph > 1.25
      ? [
          [tr, ph / 2 - mid / 2],
          [ph / 2 + mid / 2, ph - br],
        ]
      : [[tr, ph - br]];
  const lw = pw - 2 * st;
  return (
    <>
      {sections.map(([a, b], si) => {
        const n = Math.max(1, Math.floor((b - a) / 0.076));
        const p = (b - a) / n;
        return (
          <g key={si}>
            {Array.from({ length: n }, (_, k) => (
              <g key={k} className="ci-anim" style={{ transform: tf(0, a + (k + 0.5) * p, 1, s) }}>
                <rect x={st} y={-LOUVRE / 2} width={lw} height={LOUVRE} rx={0.01} fill={louvre} />
              </g>
            ))}
            <rect x={pw / 2 - 0.006} y={a + 0.012} width={0.012} height={b - a - 0.024} rx={0.006} fill={rod} />
          </g>
        );
      })}
      <path
        d={`M0 0h${pw}v${ph}h${-pw}Z` + sections.map(([a, b]) => `M${st} ${a}v${b - a}h${lw}v${a - b}Z`).join('')}
        fill={frame}
        fillRule="evenodd"
        stroke={edge}
        {...fine}
      />
    </>
  );
}

/**
 * Plantation shutters: two (four when the opening is wider than 1.4 m) louvred panels in a hanging frame inside the
 * casing. Tilt turns the louvres; opening swings the panels (bi-fold pairs for four panels) toward the side walls.
 */
export function Shutters({ id, L, hex, accent, open, tilt }: Props) {
  const ft = 0.028;
  const nP = L.ow > 1.4 ? 4 : 2;
  const X0 = L.x0 + ft;
  const IW = L.ow - 2 * ft;
  const py = L.top + ft;
  const ph = L.oh - 2 * ft;
  const pw = IW / nP;
  const c = Math.cos(open * MAX_SWING);
  const s = Math.max(0.16, Math.sin(Math.abs(tilt) * 1.45));
  const t = tones(hex, 0.7);
  const louvre = `url(#${id}-lv)`;
  const frame = `url(#${id}-fr)`;
  const panel = <Panel pw={pw} ph={ph} louvre={louvre} frame={frame} edge={t.deep} s={s} rod={t.lo} />;
  const placements: { x: number; sx: number }[] =
    nP === 2
      ? [
          { x: X0, sx: c },
          { x: X0 + IW, sx: -c },
        ]
      : [
          { x: X0, sx: c },
          { x: X0 + pw * c, sx: c },
          { x: X0 + IW, sx: -c },
          { x: X0 + IW - pw * c, sx: -c },
        ];
  return (
    <g>
      <defs>
        <SlatGradient id={`${id}-lv`} hex={hex} accent={accent} metal={false} flip={tilt < 0} />
        <linearGradient id={`${id}-fr`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={t.hi} />
          <stop offset="0.5" stopColor={hex} />
          {accent && <stop offset="0.75" stopColor={accent} />}
          <stop offset="1" stopColor={t.lo} />
        </linearGradient>
      </defs>
      {/* hanging frame */}
      <path
        d={`M${L.x0} ${L.top}h${L.ow}v${L.oh}h${-L.ow}Z M${X0} ${py}v${ph}h${IW}v${-ph}Z`}
        fill={hex}
        fillRule="evenodd"
        stroke={t.deep}
        {...hair}
      />
      {placements.map((p, i) => (
        <g key={i} className="ci-anim" style={{ transform: tf(p.x, py, p.sx, 1) }}>
          {panel}
        </g>
      ))}
    </g>
  );
}
