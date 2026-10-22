/**
 * 2D plan of the current level drawn on a <canvas>:
 *  - small: 170 px square bottom-right (desktop, click → opens the large map) or 120 px top-centre
 *    on touch screens (pointer-events: none so look-drags pass through);
 *  - large (store.panel === 'map'): 440 px centred panel with level tabs; clicking a window tick
 *    (nearest within 14 px) → store.goToWindow(id).
 * The static layer (outline, holes, walls with door gaps, window ticks, labels, north arrow) is
 * rendered once per (level, size, selection, language) into an offscreen canvas; a rAF loop
 * throttled to ~20 fps blits it and draws the player arrow only when the pose changed.
 * Map convention: world X → right, world Z → down (north = page top, street = left).
 */
import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { HOUSE } from '../data/house';
import { COLLISION_SEGMENTS, LEVEL_BY_ID, LEVEL_ORDER, WALL_BY_ID, WINDOWS } from '../data/geometry';
import type { LevelId, Room, WallKind } from '../data/types';
import { playerState, useStore, useT } from '../store/useStore';
import type { Lang } from '../store/useStore';
import { IconClose, IconMap } from './Hud';
import './hud.css';

const SMALL_DESKTOP = 170;
const SMALL_TOUCH = 120;
const LARGE_MAX = 440;
const FRAME_INTERVAL = 50; // ms → ~20 fps
const PICK_RADIUS = 14; // px
const FONT = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const ACCENT = '#f2b544';
const CYAN = '#6fb7ff';

// ------------------------------------------------------------------------------------------------
// Static plan data (metres)
// ------------------------------------------------------------------------------------------------
interface Seg {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  exterior: boolean;
  kind: WallKind;
}
interface Tick {
  id: string;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
}
interface Plan {
  outline: [number, number][];
  holes: [number, number][][];
  walls: Seg[];
  ticks: Tick[];
  rooms: Room[];
}

/** Union of every level outline, so the map does not jump between levels. */
const BBOX = (() => {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const l of HOUSE.levels) {
    for (const [x, z] of l.outline) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  }
  return { minX, minZ, w: maxX - minX, h: maxZ - minZ };
})();

function roomArea(r: Room): number {
  return (r.bounds[2] - r.bounds[0]) * (r.bounds[3] - r.bounds[1]);
}

function buildPlan(level: LevelId): Plan {
  const lvl = LEVEL_BY_ID[level];
  const walls: Seg[] = [];
  for (const s of COLLISION_SEGMENTS) {
    const w = WALL_BY_ID.get(s.wallId);
    if (!w || w.level !== level) continue;
    walls.push({ x1: s.a[0], z1: s.a[1], x2: s.b[0], z2: s.b[1], exterior: w.exterior, kind: w.kind });
  }
  const ticks: Tick[] = [];
  for (const w of WINDOWS) {
    if (w.level !== level) continue;
    // wall direction = inward normal rotated: (inward.z, -inward.x)
    const dx = w.inward[1];
    const dz = -w.inward[0];
    const h = w.width / 2;
    ticks.push({ id: w.id, x1: w.center.x - dx * h, z1: w.center.z - dz * h, x2: w.center.x + dx * h, z2: w.center.z + dz * h });
  }
  // One label per distinct name (the two halls share a name): keep the largest room.
  const byName = new Map<string, Room>();
  for (const r of HOUSE.rooms) {
    if (r.level !== level) continue;
    const prev = byName.get(r.nameFr);
    if (!prev || roomArea(r) > roomArea(prev)) byName.set(r.nameFr, r);
  }
  return { outline: lvl.outline, holes: lvl.holes, walls, ticks, rooms: Array.from(byName.values()) };
}

const PLANS: Record<LevelId, Plan> = { basement: buildPlan('basement'), ground: buildPlan('ground'), upper: buildPlan('upper') };

// ------------------------------------------------------------------------------------------------
// Fit / projection
// ------------------------------------------------------------------------------------------------
interface Fit {
  scale: number;
  ox: number;
  oy: number;
  size: number;
}

/** Fit the union bbox into a square canvas; `top` reserves room for the level name / north arrow. */
function fitFor(size: number, pad: number, top: number): Fit {
  const scale = Math.min((size - 2 * pad) / BBOX.w, (size - 2 * pad - top) / BBOX.h);
  const ox = (size - BBOX.w * scale) / 2 - BBOX.minX * scale;
  const oy = top + (size - top - BBOX.h * scale) / 2 - BBOX.minZ * scale;
  return { scale, ox, oy, size };
}
const fitForMode = (size: number, large: boolean) => (large ? fitFor(size, 26, 18) : fitFor(size, 10, 12));
const px = (f: Fit, x: number) => f.ox + x * f.scale;
const py = (f: Fit, z: number) => f.oy + z * f.scale;

function tracePoly(ctx: CanvasRenderingContext2D, f: Fit, poly: [number, number][]) {
  ctx.beginPath();
  poly.forEach(([x, z], i) => (i === 0 ? ctx.moveTo(px(f, x), py(f, z)) : ctx.lineTo(px(f, x), py(f, z))));
  ctx.closePath();
}

// ------------------------------------------------------------------------------------------------
// Drawing
// ------------------------------------------------------------------------------------------------
interface StaticOpts {
  large: boolean;
  lang: Lang;
  selected: string | null;
  levelName: string;
}

function drawStatic(ctx: CanvasRenderingContext2D, plan: Plan, f: Fit, o: StaticOpts) {
  const k = o.large ? 1.5 : 1;

  // slab
  tracePoly(ctx, f, plan.outline);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.stroke();

  // holes (stair voids)
  for (const h of plan.holes) {
    tracePoly(ctx, f, h);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fill();
    ctx.setLineDash([3, 2]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // walls (gaps at doors come from COLLISION_SEGMENTS)
  ctx.lineCap = 'round';
  for (const s of plan.walls) {
    ctx.beginPath();
    ctx.moveTo(px(f, s.x1), py(f, s.z1));
    ctx.lineTo(px(f, s.x2), py(f, s.z2));
    if (s.kind === 'railing') {
      ctx.lineWidth = 1 * k;
      ctx.strokeStyle = 'rgba(200, 210, 225, 0.6)';
      ctx.setLineDash([2, 2]);
    } else {
      ctx.lineWidth = (s.exterior ? 2.2 : 1.1) * k;
      ctx.strokeStyle = s.kind === 'halfwall' ? 'rgba(223, 228, 236, 0.7)' : '#dfe4ec';
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // windows (ticks along the wall), selected one amber
  for (const w of plan.ticks) {
    const sel = w.id === o.selected;
    ctx.beginPath();
    ctx.moveTo(px(f, w.x1), py(f, w.z1));
    ctx.lineTo(px(f, w.x2), py(f, w.z2));
    ctx.lineWidth = (sel ? 4 : 2.6) * k;
    ctx.strokeStyle = sel ? ACCENT : CYAN;
    if (sel) {
      ctx.shadowColor = ACCENT;
      ctx.shadowBlur = 8;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // room labels (large only)
  if (o.large) {
    ctx.font = `600 10px ${FONT}`;
    ctx.fillStyle = 'rgba(238, 240, 244, 0.72)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const r of plan.rooms) {
      const [x1, z1, x2, z2] = r.bounds;
      const maxW = Math.max(24, (x2 - x1) * f.scale + 10);
      drawLabel(ctx, o.lang === 'fr' ? r.nameFr : r.name, px(f, (x1 + x2) / 2), py(f, (z1 + z2) / 2), maxW);
    }
  }

  // north arrow (top right) + level name (top left)
  const m = o.large ? 12 : 7;
  const nx = f.size - m - 6;
  ctx.beginPath();
  ctx.moveTo(nx, m);
  ctx.lineTo(nx + 4, m + 10);
  ctx.lineTo(nx, m + 7);
  ctx.lineTo(nx - 4, m + 10);
  ctx.closePath();
  ctx.fillStyle = 'rgba(238, 240, 244, 0.85)';
  ctx.fill();
  ctx.font = `700 ${o.large ? 12 : 10}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('N', nx, m + 12);

  ctx.font = `600 ${o.large ? 12 : 10}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(238, 240, 244, 0.85)';
  ctx.fillText(o.levelName, m, m);
}

/** Centred label; wraps onto two lines at the space nearest the middle when it does not fit. */
function drawLabel(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, maxW: number) {
  if (ctx.measureText(text).width <= maxW) {
    ctx.fillText(text, cx, cy);
    return;
  }
  let split = -1;
  for (let i = text.indexOf(' '); i >= 0; i = text.indexOf(' ', i + 1)) {
    if (split < 0 || Math.abs(i - text.length / 2) < Math.abs(split - text.length / 2)) split = i;
  }
  if (split < 0) {
    ctx.fillText(text, cx, cy, maxW);
    return;
  }
  ctx.fillText(text.slice(0, split), cx, cy - 6, maxW);
  ctx.fillText(text.slice(split + 1), cx, cy + 6, maxW);
}

function drawPlayer(ctx: CanvasRenderingContext2D, f: Fit, large: boolean, x: number, z: number, yaw: number) {
  const r = large ? 9 : 6.5;
  const inset = r + 3;
  let cx = px(f, x);
  let cy = py(f, z);
  const clamped = cx < inset || cx > f.size - inset || cy < inset || cy > f.size - inset;
  cx = Math.min(f.size - inset, Math.max(inset, cx));
  cy = Math.min(f.size - inset, Math.max(inset, cy));
  // camera looks along (-sin yaw, -cos yaw) in XZ; map X → right, Z → down
  const ang = Math.atan2(-Math.cos(yaw), -Math.sin(yaw));
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ang);
  ctx.globalAlpha = clamped ? 0.55 : 1;
  if (large) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 42, -0.5, 0.5);
    ctx.closePath();
    ctx.fillStyle = 'rgba(242, 181, 68, 0.14)';
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(-r * 0.8, r * 0.7);
  ctx.lineTo(-r * 0.4, 0);
  ctx.lineTo(-r * 0.8, -r * 0.7);
  ctx.closePath();
  ctx.fillStyle = ACCENT;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.lineWidth = 1.2;
  ctx.lineJoin = 'round';
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function distToSegment(x: number, y: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((x - x1) * dx + (y - y1) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (x1 + dx * t), y - (y1 + dy * t));
}

// ------------------------------------------------------------------------------------------------
// Canvas component (shared by both sizes)
// ------------------------------------------------------------------------------------------------
interface MapCanvasProps {
  level: LevelId;
  size: number;
  large: boolean;
  /** Draw the player arrow (only when the displayed level is the player's level). */
  showPlayer: boolean;
  interactive: boolean;
}

function MapCanvas({ level, size, large, showPlayer, interactive }: MapCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const fitRef = useRef<Fit>(fitForMode(size, large));
  const lang = useStore((s) => s.lang);
  const selected = useStore((s) => s.selectedWindowId);
  const goToWindow = useStore((s) => s.goToWindow);
  const t = useT();
  const levelName = lang === 'fr' ? LEVEL_BY_ID[level].nameFr : LEVEL_BY_ID[level].name;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const pxSize = Math.round(size * dpr);
    canvas.width = pxSize;
    canvas.height = pxSize;
    const fit = fitForMode(size, large);
    fitRef.current = fit;

    // static layer, rendered once
    const stat = document.createElement('canvas');
    stat.width = pxSize;
    stat.height = pxSize;
    const sctx = stat.getContext('2d');
    if (sctx) {
      sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawStatic(sctx, PLANS[level], fit, { large, lang, selected, levelName });
    }

    let raf = 0;
    let lastTime = -Infinity;
    let lx = NaN;
    let lz = NaN;
    let lyaw = NaN;
    const render = (now: number) => {
      raf = requestAnimationFrame(render);
      if (now - lastTime < FRAME_INTERVAL) return;
      const ps = playerState;
      if (ps.x === lx && ps.z === lz && ps.yaw === lyaw) return;
      lastTime = now;
      lx = ps.x;
      lz = ps.z;
      lyaw = ps.yaw;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, pxSize, pxSize);
      ctx.drawImage(stat, 0, 0);
      if (showPlayer) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawPlayer(ctx, fit, large, ps.x, ps.z, ps.yaw);
      }
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [level, size, large, lang, selected, levelName, showPlayer]);

  const onClick = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    if (!interactive) return;
    const canvas = ref.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width > 0 ? size / rect.width : 1;
    const x = (e.clientX - rect.left) * sx;
    const y = (e.clientY - rect.top) * sx;
    const f = fitRef.current;
    let best: string | null = null;
    let bestD = PICK_RADIUS;
    for (const w of PLANS[level].ticks) {
      const d = distToSegment(x, y, px(f, w.x1), py(f, w.z1), px(f, w.x2), py(f, w.z2));
      if (d < bestD) {
        bestD = d;
        best = w.id;
      }
    }
    if (best) goToWindow(best);
  };

  return (
    <canvas
      ref={ref}
      style={{ width: size, height: size }}
      onClick={onClick}
      role={interactive ? 'img' : undefined}
      aria-label={`${t('Plan', 'Floor plan')} — ${levelName}`}
    />
  );
}

// ------------------------------------------------------------------------------------------------
// Small (always visible) map
// ------------------------------------------------------------------------------------------------
function SmallMap({ isTouch, orbit }: { isTouch: boolean; orbit: boolean }) {
  const t = useT();
  const level = useStore((s) => s.level);
  const togglePanel = useStore((s) => s.togglePanel);
  const size = isTouch ? SMALL_TOUCH : SMALL_DESKTOP;
  const cls = `hud-chip mm-small${isTouch ? ' is-touch' : ''}${orbit ? ' is-orbit' : ''}`;
  return (
    <div className={cls} onClick={isTouch ? undefined : () => togglePanel('map')} title={isTouch ? undefined : t('Agrandir le plan (M)', 'Enlarge the map (M)')}>
      <MapCanvas level={level} size={size} large={false} showPlayer interactive={false} />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// Large map panel
// ------------------------------------------------------------------------------------------------
function largeSize(): number {
  return Math.max(200, Math.min(LARGE_MAX, window.innerWidth - 56, window.innerHeight - 190));
}

function LargeMap() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const level = useStore((s) => s.level);
  const setPanel = useStore((s) => s.setPanel);
  const [size, setSize] = useState(largeSize);
  // Level shown in the big map; falls back to the player's level whenever that changes.
  const [picked, setPicked] = useState<{ level: LevelId; base: LevelId } | null>(null);
  const viewLevel = picked && picked.base === level ? picked.level : level;

  useEffect(() => {
    const onResize = () => setSize(largeSize());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setPanel('none');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPanel]);

  const close = () => setPanel('none');

  return (
    <div className="mm-backdrop" onClick={close} role="presentation">
      <div className="mm-large" style={{ width: size + 28 }} role="dialog" aria-modal="true" aria-label={t('Plan de la maison', 'House plan')} onClick={(e) => e.stopPropagation()}>
        <div className="mm-head">
          <h2>
            <IconMap />
            {t('Plan', 'Map')}
          </h2>
          <div className="hud-pills" role="group" aria-label={t('Étage affiché', 'Displayed floor')}>
            {LEVEL_ORDER.map((id) => (
              <button
                key={id}
                type="button"
                className={`hud-pill${viewLevel === id ? ' is-active' : ''}`}
                aria-pressed={viewLevel === id}
                onClick={() => setPicked({ level: id, base: level })}
              >
                {lang === 'fr' ? LEVEL_BY_ID[id].nameFr : LEVEL_BY_ID[id].name}
              </button>
            ))}
          </div>
          <button type="button" className="hud-icon-btn" aria-label={t('Fermer', 'Close')} onClick={close}>
            <IconClose />
          </button>
        </div>
        <MapCanvas level={viewLevel} size={size} large showPlayer={viewLevel === level} interactive />
        <div className="mm-foot">{t('Cliquez sur une fenêtre (trait bleu) pour vous y rendre', 'Click a window (blue tick) to go there')}</div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// Root
// ------------------------------------------------------------------------------------------------
export function MiniMap() {
  const hasStarted = useStore((s) => s.hasStarted);
  const panel = useStore((s) => s.panel);
  const isTouch = useStore((s) => s.isTouch);
  const mode = useStore((s) => s.mode);
  if (!hasStarted) return null;
  if (panel === 'map') return <LargeMap />;
  // The desktop covering panel (right drawer, z 40) would hide all but a sliver of the small map.
  if (!isTouch && panel === 'covering') return null;
  return <SmallMap isTouch={isTouch} orbit={mode === 'orbit'} />;
}
