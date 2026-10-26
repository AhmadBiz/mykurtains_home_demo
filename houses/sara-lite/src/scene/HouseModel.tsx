import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { COVERING_BY_ID } from '../data/coverings';
import type { CoveringType } from '../data/coverings';
import { HOUSE_BOUNDS, LEVEL_BY_ID, LEVEL_ORDER, WINDOW_BY_ID } from '../data/geometry';
import type { LevelId } from '../data/types';
import { useStore, useT } from '../store/useStore';
import type { LevelFilter } from '../store/useStore';
import { angleDelta, ease, project } from './camera';
import type { Cam, Viewport } from './camera';
import { convexHull, layoutChips, rectExit } from './layout';
import type { Pt, Rect } from './layout';
import { Slab, Walls } from './Level';
import { HOUSE_FRAME, SCENE_LEVELS, SCENE_LEVEL_BY_ID, floorOf, windowAnchor } from './model';
import './scene.css';

type Vars = CSSProperties & Record<`--${string}`, string | number>;
type V3 = [number, number, number];

// -------------------------------------------------------------------------------------------
// View constants
// -------------------------------------------------------------------------------------------
/** Default yaw: the street front (X = min) and the north side (Z = min) face the viewer. */
const YAW0 = 132;
const PITCH0 = -27;
const PITCH_MIN = -52;
const PITCH_MAX = -10;
const SWAY_DEG = 3;
const SWAY_MS = 12000;
const IDLE_MS = 2000;
const TWEEN_MS = 600;

const reducedQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      reducedQuery?.addEventListener('change', cb);
      return () => reducedQuery?.removeEventListener('change', cb);
    },
    () => !!reducedQuery?.matches,
    () => false,
  );
}

const SHORT_TYPE: Record<CoveringType, [string, string]> = {
  none: ['sans habillage', 'bare'],
  curtains: ['rideaux', 'curtains'],
  sheers: ['voilages', 'sheers'],
  roller: ['store à rouleau', 'roller blind'],
  roman: ['store romain', 'roman shade'],
  cellular: ['store cellulaire', 'cellular shade'],
  venetian: ['store vénitien', 'venetian blind'],
  vertical: ['store vertical', 'vertical blind'],
  shutters: ['persiennes', 'shutters'],
};
const stripParen = (s: string) => s.replace(/\s*\(.*\)$/, '');
const snap90 = (deg: number) => ((((Math.round(deg / 90) * 90) % 360) + 360) % 360);

// -------------------------------------------------------------------------------------------
// Framing per filter
// -------------------------------------------------------------------------------------------
interface Frame {
  s: number;
  cx: number;
  cy: number;
  cz: number;
}

/** Scene points whose projection bounds the visible model (chip layout hull). */
const HULL_POINTS: Record<LevelFilter, V3[]> = (() => {
  const pts = (id: LevelId): V3[] => {
    const l = SCENE_LEVEL_BY_ID[id];
    const top = l.y0 + LEVEL_BY_ID[id].ceilingHeight;
    return l.outline.flatMap(([x, z]): V3[] => [[x, l.y0, z], [x, top, z]]);
  };
  const all = LEVEL_ORDER.flatMap(pts);
  return { all, basement: pts('basement'), ground: pts('ground'), upper: pts('upper') };
})();

/**
 * Framing for a filter: the px-per-metre and centre that make the projected content (at the default
 * angle, ± a little sway) fill the stage minus room for the chips, centred. Solved numerically.
 */
function frameFor(filter: LevelFilter, vp: Viewport): Frame {
  const narrow = vp.w < 640;
  const all = filter === 'all';
  const mx = narrow ? (all ? 30 : 34) : all ? Math.min(190, Math.max(110, vp.w * 0.13)) : Math.min(200, Math.max(110, vp.w * 0.14));
  const my = narrow ? (all ? 34 : 56) : all ? Math.max(40, vp.h * 0.07) : Math.max(64, vp.h * 0.13);
  const halfW = Math.max(40, vp.w / 2 - mx);
  const halfH = Math.max(40, vp.h / 2 - my);
  const pts = HULL_POINTS[filter];
  const l = all ? null : SCENE_LEVEL_BY_ID[filter];
  const f: Frame = l
    ? { s: 30, cx: l.cx, cy: (l.y0 + l.y0 + LEVEL_BY_ID[l.id].ceilingHeight) / 2, cz: l.cz }
    : { s: 30, cx: HOUSE_FRAME.cx, cy: (HOUSE_FRAME.y0 + HOUSE_FRAME.y1) / 2, cz: HOUSE_FRAME.cz };
  const a = (YAW0 * Math.PI) / 180;
  for (let iter = 0; iter < 5; iter++) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const yaw of [YAW0 - 6, YAW0, YAW0 + 6]) {
      const cam: Cam = { yaw, pitch: PITCH0, ...f };
      for (const [x, y, z] of pts) {
        const p = project(cam, vp, x, y, z);
        x0 = Math.min(x0, p[0]);
        x1 = Math.max(x1, p[0]);
        y0 = Math.min(y0, p[1]);
        y1 = Math.max(y1, p[1]);
      }
    }
    // re-centre (screen x ↔ world (cos a, sin a) in XZ, screen y ↔ world −y), then rescale
    const ox = (x0 + x1) / 2 - vp.w / 2;
    const oy = (y0 + y1) / 2 - vp.h / 2;
    f.cx += (ox / f.s) * Math.cos(a);
    f.cz += (ox / f.s) * Math.sin(a);
    f.cy -= oy / (f.s * Math.cos((PITCH0 * Math.PI) / 180));
    f.s *= Math.min(halfW / ((x1 - x0) / 2), halfH / ((y1 - y0) / 2));
  }
  return f;
}

// -------------------------------------------------------------------------------------------
// Chips
// -------------------------------------------------------------------------------------------
interface ChipSpec {
  key: string;
  /** Window chip: scene anchor + outward vector. Storey chip: level id. */
  anchor?: V3;
  outward?: [number, number];
  level?: LevelId;
}

interface Motion {
  yaw: number;
  pitch: number;
  vel: number;
  dragging: boolean;
  pointerId: number;
  downX: number;
  downY: number;
  lastX: number;
  lastY: number;
  lastMoveT: number;
  moved: boolean;
  suppressClick: boolean;
  lastInput: number;
  amp: number;
  phase: number;
  angleTween: { y0: number; y1: number; p0: number; p1: number; t0: number } | null;
  frame: Frame;
  frameTween: { from: Frame; to: Frame; t0: number } | null;
  u0: number;
  vp: Viewport;
  lastT: number;
  raf: number;
  visible: boolean;
  allowSway: boolean;
  instant: boolean;
  filter: LevelFilter;
  chips: ChipSpec[];
  chipPos: Map<string, Pt>;
  chipSize: Map<string, [number, number]>;
  obstacle: Rect | null;
  textAngle: number;
}

export function HouseModel() {
  const levelFilter = useStore((s) => s.levelFilter);
  const selectedId = useStore((s) => s.selectedWindowId);
  const hoveredId = useStore((s) => s.hoveredWindowId);
  const paused = useStore((s) => s.motionPaused);
  const coverings = useStore((s) => s.coverings);
  const lang = useStore((s) => s.lang);
  const fr = lang === 'fr';
  const t = useT();
  const reduced = useReducedMotion();
  /** Room names on the slabs turn in 90° steps to stay readable as the house turns. */
  const [textAngle, setTextAngle] = useState(() => snap90(YAW0));

  const rootRef = useRef<HTMLDivElement>(null);
  const tiltEls = useRef(new Set<HTMLDivElement>());
  const worldEls = useRef(new Set<HTMLDivElement>());
  const ctrlRef = useRef<HTMLDivElement>(null);
  const chipEls = useRef(new Map<string, HTMLButtonElement>());
  const lineEls = useRef(new Map<string, SVGGElement>());

  const regTilt = useCallback((el: HTMLDivElement | null) => {
    if (el) tiltEls.current.add(el);
  }, []);
  const regWorld = useCallback((el: HTMLDivElement | null) => {
    if (el) worldEls.current.add(el);
  }, []);

  const m = useRef<Motion>({
    yaw: YAW0,
    pitch: PITCH0,
    vel: 0,
    dragging: false,
    pointerId: -1,
    downX: 0,
    downY: 0,
    lastX: 0,
    lastY: 0,
    lastMoveT: 0,
    moved: false,
    suppressClick: false,
    lastInput: -Infinity,
    amp: 0,
    phase: 0,
    angleTween: null,
    frame: { s: 30, cx: HOUSE_FRAME.cx, cy: 0, cz: HOUSE_FRAME.cz },
    frameTween: null,
    u0: 30,
    vp: { w: 1000, h: 700, p: 2600 },
    lastT: 0,
    raf: 0,
    visible: true,
    allowSway: true,
    instant: false,
    filter: 'all',
    chips: [],
    chipPos: new Map(),
    chipSize: new Map(),
    obstacle: null,
    textAngle: snap90(YAW0),
  }).current;

  // ---------------------------------------------------------------------------------------
  // The motion loop: writes transforms and chip positions, never React state.
  // ---------------------------------------------------------------------------------------
  const tickRef = useRef<(now: number) => void>(() => {});
  const kick = useCallback(() => {
    if (!m.raf && m.visible) m.raf = requestAnimationFrame((now) => tickRef.current(now));
  }, [m]);

  tickRef.current = (now: number) => {
    m.raf = 0;
    const root = rootRef.current;
    if (!root || !tiltEls.current.size) return;
    const dt = m.lastT ? Math.min(64, Math.max(0, now - m.lastT)) : 16;
    m.lastT = now;

    // angles
    if (m.angleTween) {
      const at = m.angleTween;
      const k = m.instant ? 1 : ease((now - at.t0) / TWEEN_MS);
      m.yaw = at.y0 + (at.y1 - at.y0) * k;
      m.pitch = at.p0 + (at.p1 - at.p0) * k;
      if (k >= 1) m.angleTween = null;
    }
    if (!m.dragging && Math.abs(m.vel) > 0.0004) {
      m.yaw += m.vel * dt;
      m.vel *= Math.exp(-dt / 300);
    } else if (!m.dragging) m.vel = 0;

    // sway (folds in smoothly; never jumps)
    const swayTarget = m.allowSway && !m.dragging && !m.angleTween && m.vel === 0 && now - m.lastInput > IDLE_MS ? 1 : 0;
    m.amp += (swayTarget - m.amp) * Math.min(1, dt / 900);
    if (Math.abs(swayTarget - m.amp) < 0.002) m.amp = swayTarget;
    if (m.amp > 0) m.phase += dt;
    const sway = SWAY_DEG * Math.sin((2 * Math.PI * m.phase) / SWAY_MS) * m.amp;

    // framing
    let commit = false;
    if (m.frameTween) {
      const ft = m.frameTween;
      const k = m.instant ? 1 : ease((now - ft.t0) / TWEEN_MS);
      m.frame = {
        s: ft.from.s + (ft.to.s - ft.from.s) * k,
        cx: ft.from.cx + (ft.to.cx - ft.from.cx) * k,
        cy: ft.from.cy + (ft.to.cy - ft.from.cy) * k,
        cz: ft.from.cz + (ft.to.cz - ft.from.cz) * k,
      };
      if (k >= 1) {
        m.frameTween = null;
        commit = true;
      }
    }
    if (commit) {
      // re-rasterise at the new size: --u carries the scale, the transform goes back to scale 1
      m.u0 = m.frame.s;
      root.style.setProperty('--u', `${m.u0.toFixed(3)}px`);
    }
    const f = m.frame;
    const k = f.s / m.u0;
    const yaw = m.yaw + sway;
    const tiltT = `rotateX(${m.pitch.toFixed(3)}deg) rotateY(${yaw.toFixed(3)}deg)`;
    const worldT =
      `scale3d(${k.toFixed(5)},${k.toFixed(5)},${k.toFixed(5)}) ` +
      `translate3d(${(-f.cx * m.u0).toFixed(2)}px,${(f.cy * m.u0).toFixed(2)}px,${(-f.cz * m.u0).toFixed(2)}px)`;
    for (const el of tiltEls.current) el.style.transform = tiltT;
    for (const el of worldEls.current) el.style.transform = worldT;

    if (!m.dragging && !m.angleTween && Math.abs(angleDelta(m.textAngle, m.yaw)) > 52) {
      m.textAngle = snap90(m.yaw);
      setTextAngle(m.textAngle);
    }

    const chipsMoving = placeChips({ yaw, pitch: m.pitch, ...f }, dt);

    const busy = m.dragging || !!m.angleTween || !!m.frameTween || m.vel !== 0 || m.amp > 0 || (m.allowSway && swayTarget === 0) || chipsMoving;
    if (busy) kick();
  };

  /** Project, lay out and write the chips and their lines. Returns true while they still glide. */
  function placeChips(cam: Cam, dt: number): boolean {
    const vp = m.vp;
    if (!m.chips.length) return false;
    const hull = convexHull(HULL_POINTS[m.filter].map(([x, y, z]) => {
      const p = project(cam, vp, x, y, z);
      return [p[0], p[1]] as Pt;
    }));
    let hx = 0;
    let hy = 0;
    for (const q of hull) {
      hx += q[0];
      hy += q[1];
    }
    hx /= hull.length;
    hy /= hull.length;

    const anchors: Pt[] = [];
    const ins = m.chips.map((c, i) => {
      let size = m.chipSize.get(c.key);
      const el = chipEls.current.get(c.key);
      if (!size && el) {
        size = [el.offsetWidth, el.offsetHeight];
        m.chipSize.set(c.key, size);
      }
      const [w, h] = size ?? [120, 30];
      let a: Pt;
      let dir: Pt;
      if (c.anchor) {
        const p = project(cam, vp, c.anchor[0], c.anchor[1], c.anchor[2]);
        a = [p[0], p[1]];
        const o = c.outward ?? [0, 0];
        const q = project(cam, vp, c.anchor[0] + o[0], c.anchor[1], c.anchor[2] + o[1]);
        let ox = q[0] - p[0];
        let oy = q[1] - p[1];
        const ol = Math.hypot(ox, oy);
        const rx = a[0] - hx;
        const ry = a[1] - hy;
        const rl = Math.hypot(rx, ry) || 1;
        const wgt = Math.min(1, ol / (cam.s * 0.45));
        ox = ol > 0 ? (ox / ol) * wgt : 0;
        oy = ol > 0 ? (oy / ol) * wgt : 0;
        const dx = ox + (rx / rl) * 0.75;
        const dy = oy + (ry / rl) * 0.75;
        const dl = Math.hypot(dx, dy) || 1;
        dir = [dx / dl, dy / dl];
      } else {
        // storey chip: anchor on the slab corner on its side of the model
        const l = SCENE_LEVEL_BY_ID[c.level!];
        const side = c.level === 'ground' ? 1 : -1;
        let best: Pt = [hx, hy];
        let bestX = side > 0 ? -Infinity : Infinity;
        for (const [x, z] of l.outline) {
          const p = project(cam, vp, x, l.y0, z);
          if ((side > 0 && p[0] > bestX) || (side < 0 && p[0] < bestX)) {
            bestX = p[0];
            best = [p[0], p[1]];
          }
        }
        a = best;
        dir = [side, 0];
      }
      anchors[i] = a;
      return { anchor: a, dir, hw: w / 2, hh: h / 2 };
    });

    const narrow = vp.w < 640;
    const stage: Rect = { x0: 8, y0: 8, x1: vp.w - 8, y1: vp.h - 8 };
    const obstacles = m.obstacle ? [m.obstacle] : [];
    const target = layoutChips(ins, hull, stage, obstacles, narrow ? 4 : 8, narrow ? 4 : 10);

    let moving = false;
    const a = 1 - Math.exp(-dt / 70);
    m.chips.forEach((c, i) => {
      const el = chipEls.current.get(c.key);
      const g = lineEls.current.get(c.key);
      const tgt = target[i];
      let p = m.chipPos.get(c.key);
      if (!p || m.instant) p = [tgt[0], tgt[1]];
      else {
        p = [p[0] + (tgt[0] - p[0]) * a, p[1] + (tgt[1] - p[1]) * a];
        if (Math.abs(tgt[0] - p[0]) > 0.25 || Math.abs(tgt[1] - p[1]) > 0.25) moving = true;
        else p = [tgt[0], tgt[1]];
      }
      m.chipPos.set(c.key, p);
      const { hw, hh } = ins[i];
      if (el) {
        el.style.transform = `translate3d(${(p[0] - hw).toFixed(1)}px,${(p[1] - hh).toFixed(1)}px,0)`;
        if (!el.hasAttribute('data-placed')) el.setAttribute('data-placed', '');
      }
      if (g) {
        const an = anchors[i];
        const e = rectExit(p, hw, hh, an);
        const ln = g.children;
        for (let j = 0; j < 2; j++) {
          const l = ln[j];
          l.setAttribute('x1', e[0].toFixed(1));
          l.setAttribute('y1', e[1].toFixed(1));
          l.setAttribute('x2', an[0].toFixed(1));
          l.setAttribute('y2', an[1].toFixed(1));
        }
        const dot = ln[2];
        dot.setAttribute('cx', an[0].toFixed(1));
        dot.setAttribute('cy', an[1].toFixed(1));
      }
    });
    return moving;
  }

  // ---------------------------------------------------------------------------------------
  // Size, visibility, framing
  // ---------------------------------------------------------------------------------------
  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (!w || !h) return;
    const p = Math.round(Math.max(w, h) * 2.6);
    m.vp = { w, h, p };
    root.style.setProperty('--persp', `${p}px`);
    const c = ctrlRef.current;
    m.obstacle = c ? { x0: c.offsetLeft - 4, y0: c.offsetTop - 4, x1: c.offsetLeft + c.offsetWidth + 4, y1: c.offsetTop + c.offsetHeight + 4 } : null;
    const target = frameFor(m.filter, m.vp);
    if (m.frameTween) m.frameTween.to = target;
    else {
      m.frame = target;
      m.u0 = target.s;
      root.style.setProperty('--u', `${m.u0.toFixed(3)}px`);
    }
    m.chipPos.clear();
    kick();
  }, [m, kick]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    measure();
    // first frame synchronously, so the model never paints untransformed
    cancelAnimationFrame(m.raf);
    m.raf = 0;
    tickRef.current(performance.now());
    // chip widths change once the web font is in
    let alive = true;
    document.fonts?.ready.then(() => {
      if (!alive) return;
      m.chipSize.clear();
      kick();
    });
    const ro = new ResizeObserver(() => measure());
    ro.observe(root);
    const io = new IntersectionObserver(([e]) => {
      m.visible = e.isIntersecting;
      if (m.visible) {
        m.lastT = 0;
        kick();
      }
    });
    io.observe(root);
    return () => {
      alive = false;
      ro.disconnect();
      io.disconnect();
      cancelAnimationFrame(m.raf);
      m.raf = 0;
    };
  }, [m, measure, kick]);

  // storey focus
  useEffect(() => {
    if (m.filter === levelFilter) return;
    m.filter = levelFilter;
    m.frameTween = { from: { ...m.frame }, to: frameFor(levelFilter, m.vp), t0: performance.now() };
    kick();
  }, [levelFilter, m, kick]);

  // motion preferences: stopping folds the current sway into the yaw, so the house stops where it is
  useEffect(() => {
    if (paused || reduced) {
      m.yaw += SWAY_DEG * Math.sin((2 * Math.PI * m.phase) / SWAY_MS) * m.amp;
      m.amp = 0;
    }
    m.allowSway = !paused && !reduced;
    m.instant = reduced;
    kick();
  }, [paused, reduced, m, kick]);

  // a selected window on the far side: turn the house just enough to face it
  useEffect(() => {
    const w = selectedId ? WINDOW_BY_ID.get(selectedId) : undefined;
    if (!w) return;
    const out: [number, number] = [-w.inward[0], -w.inward[1]];
    const face = (Math.atan2(-out[0], out[1]) * 180) / Math.PI;
    const d = angleDelta(face, m.yaw);
    if (Math.abs(d) <= 80) return;
    const yaw1 = m.yaw - Math.sign(d) * (Math.abs(d) - 60);
    m.vel = 0;
    m.angleTween = { y0: m.yaw, y1: yaw1, p0: m.pitch, p1: m.pitch, t0: performance.now() };
    m.lastInput = performance.now();
    kick();
  }, [selectedId, m, kick]);

  // ---------------------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------------------
  const turnTo = (yaw1: number, pitch1 = m.pitch) => {
    m.yaw += SWAY_DEG * Math.sin((2 * Math.PI * m.phase) / SWAY_MS) * m.amp;
    m.amp = 0;
    m.vel = 0;
    m.angleTween = { y0: m.yaw, y1: yaw1, p0: m.pitch, p1: pitch1, t0: performance.now() };
    m.lastInput = performance.now();
    kick();
  };
  const turnBy = (deg: number) => turnTo((m.angleTween ? m.angleTween.y1 : m.yaw) + deg);
  const resetView = () => turnTo(m.yaw + angleDelta(m.yaw, YAW0), PITCH0);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.hm-ctrl, .hm-chip')) return;
    m.pointerId = e.pointerId;
    m.downX = m.lastX = e.clientX;
    m.downY = m.lastY = e.clientY;
    m.lastMoveT = performance.now();
    m.moved = false;
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== m.pointerId) return;
    const now = performance.now();
    if (!m.moved) {
      if (Math.hypot(e.clientX - m.downX, e.clientY - m.downY) < 5) return;
      m.moved = true;
      m.dragging = true;
      // fold the sway into the yaw so nothing jumps
      m.yaw += SWAY_DEG * Math.sin((2 * Math.PI * m.phase) / SWAY_MS) * m.amp;
      m.amp = 0;
      m.angleTween = null;
      rootRef.current?.setPointerCapture(e.pointerId);
      rootRef.current?.setAttribute('data-drag', '');
    }
    const dx = e.clientX - m.lastX;
    const dy = e.clientY - m.lastY;
    const dtm = Math.max(1, now - m.lastMoveT);
    const dYaw = dx * 0.32;
    m.yaw += dYaw;
    if (e.pointerType === 'mouse') m.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, m.pitch - dy * 0.18));
    m.vel = m.vel * 0.6 + (dYaw / dtm) * 0.4;
    m.lastX = e.clientX;
    m.lastY = e.clientY;
    m.lastMoveT = now;
    m.lastInput = now;
    kick();
  };
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== m.pointerId) return;
    m.pointerId = -1;
    if (m.dragging) {
      m.dragging = false;
      m.suppressClick = true;
      if (performance.now() - m.lastMoveT > 80) m.vel = 0;
      m.vel = Math.max(-0.22, Math.min(0.22, m.vel));
      rootRef.current?.removeAttribute('data-drag');
      m.lastInput = performance.now();
      kick();
    }
  };
  const onClickCapture = (e: ReactMouseEvent) => {
    if (m.suppressClick) {
      m.suppressClick = false;
      e.stopPropagation();
      e.preventDefault();
    }
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.hm-chip')) return;
    if (e.key === 'ArrowLeft') turnBy(-15);
    else if (e.key === 'ArrowRight') turnBy(15);
    else if (e.key === 'ArrowUp') turnTo(m.angleTween ? m.angleTween.y1 : m.yaw, Math.max(PITCH_MIN, m.pitch - 6));
    else if (e.key === 'ArrowDown') turnTo(m.angleTween ? m.angleTween.y1 : m.yaw, Math.min(PITCH_MAX, m.pitch + 6));
    else return;
    e.preventDefault();
  };

  // ---------------------------------------------------------------------------------------
  // Render data
  // ---------------------------------------------------------------------------------------
  const poolWin = WINDOW_BY_ID.get(selectedId ?? '') ?? WINDOW_BY_ID.get(hoveredId ?? '');
  const pools = useMemo(() => {
    const out: Partial<Record<LevelId, [number, number]>> = {};
    if (poolWin) out[poolWin.level] = [poolWin.center.x + poolWin.inward[0] * 1.1, poolWin.center.z + poolWin.inward[1] * 1.1];
    return out;
  }, [poolWin]);


  interface ChipView extends ChipSpec {
    label: string;
    sub: string;
    sel: boolean;
    hov: boolean;
    onClick: () => void;
    aria: string;
    i: number;
  }
  const chips: ChipView[] = useMemo(() => {
    if (levelFilter === 'all') {
      return [...LEVEL_ORDER].reverse().map((id, i) => {
        const n = SCENE_LEVEL_BY_ID[id].windows.length;
        const name = fr ? LEVEL_BY_ID[id].nameFr : LEVEL_BY_ID[id].name;
        const sub = fr ? `${n} fenêtres` : `${n} windows`;
        return {
          key: `lv-${id}`,
          level: id,
          label: name,
          sub,
          sel: false,
          hov: false,
          aria: `${name} · ${sub}`,
          onClick: () => useStore.getState().setLevelFilter(id),
          i,
        };
      });
    }
    return SCENE_LEVEL_BY_ID[levelFilter].windows.map((w, i) => {
      const room = w.room ? stripParen(fr ? w.room.nameFr : w.room.name) : fr ? w.nameFr : w.name;
      const type = coverings[w.id]?.type ?? 'none';
      const sub = SHORT_TYPE[type][fr ? 0 : 1];
      return {
        key: w.id,
        anchor: windowAnchor(w),
        outward: [-w.inward[0], -w.inward[1]] as [number, number],
        label: room,
        sub,
        sel: selectedId === w.id,
        hov: hoveredId === w.id,
        aria: `${fr ? w.nameFr : w.name} · ${fr ? COVERING_BY_ID[type].nameFr : COVERING_BY_ID[type].name}`,
        onClick: () => useStore.getState().selectWindow(w.id),
        i,
      };
    });
  }, [levelFilter, fr, coverings, selectedId, hoveredId]);

  const chipKeys = chips.map((c) => c.key + c.label + c.sub).join('|');
  useLayoutEffect(() => {
    m.chips = chips.map(({ key, anchor, outward, level }) => ({ key, anchor, outward, level }));
    m.chipSize.clear();
    kick();
    // chip text changes (language, covering) re-measure; positions glide
  }, [chipKeys, chips, m, kick]);

  const cast = useMemo(() => {
    const pad = 2.2;
    const [x0, z0, x1, z1] = HOUSE_BOUNDS;
    return { '--x': x0 - pad, '--y': floorOf('basement') - 0.04, '--z': z0 - pad, '--len': x1 - x0 + pad * 2, '--dep': z1 - z0 + pad * 2 } as Vars;
  }, []);

  const motionOn = !paused && !reduced;

  return (
    <div
      ref={rootRef}
      className="hm"
      data-filter={levelFilter}
      data-still={motionOn ? undefined : ''}
      tabIndex={0}
      role="group"
      aria-roledescription={t('maquette 3D', '3D model')}
      aria-label={t('Maquette de la maison — glissez ou utilisez les flèches pour la faire tourner', 'House model — drag or use the arrow keys to turn it')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClickCapture={onClickCapture}
      onKeyDown={onKeyDown}
    >
      <svg className="hm-defs" width="0" height="0" aria-hidden="true">
        <defs>
          <radialGradient id="hm-pool-grad">
            <stop offset="0" style={{ stopColor: 'var(--accent)', stopOpacity: 0.32 }} />
            <stop offset="0.55" style={{ stopColor: 'var(--accent)', stopOpacity: 0.1 }} />
            <stop offset="1" style={{ stopColor: 'var(--accent)', stopOpacity: 0 }} />
          </radialGradient>
        </defs>
      </svg>
      {/*
        One flat layer per storey part, painted bottom → top: [slab, walls] per storey. The camera always
        looks from above, so this painter's order is exact and Chrome only depth-sorts the vertical
        walls of one storey among themselves (its BSP sorting of many crossing planes is not reliable).
      */}
      {SCENE_LEVELS.map((l) => {
        const dim = levelFilter !== 'all' && levelFilter !== l.id;
        return (
          <Fragment key={l.id}>
            <div className="hm-layer" data-dim={dim ? '' : undefined} aria-hidden="true">
              <div className="hm-tilt" ref={regTilt}>
                <div className="hm-world" ref={regWorld}>
                  {l.id === 'basement' && <div className="hm-cast" style={cast} />}
                  <Slab level={l} showLabels={levelFilter === l.id} pool={pools[l.id] ?? null} fr={fr} textAngle={textAngle} />
                </div>
              </div>
            </div>
            <div className="hm-layer" data-dim={dim ? '' : undefined}>
              <div className="hm-tilt" ref={regTilt}>
                <div className="hm-world" ref={regWorld}>
                  <Walls level={l} dim={dim} />
                </div>
              </div>
            </div>
          </Fragment>
        );
      })}

      <svg className="hm-lines" aria-hidden="true">
        {chips.map((c) => (
          <g
            key={c.key}
            ref={(el) => {
              if (el) lineEls.current.set(c.key, el);
              else lineEls.current.delete(c.key);
            }}
            data-on={c.sel || c.hov ? '' : undefined}
            style={{ '--i': c.i } as Vars}
          >
            <line className="hm-ln" />
            <line className="hm-pulse" pathLength={100} />
            <circle className="hm-dot" r={2.5} />
          </g>
        ))}
      </svg>

      <div className="hm-chips">
        {chips.map((c) => (
          <button
            key={c.key}
            ref={(el) => {
              if (el) chipEls.current.set(c.key, el);
              else chipEls.current.delete(c.key);
            }}
            type="button"
            className="hm-chip"
            data-kind={c.level ? 'level' : 'win'}
            data-sel={c.sel ? '' : undefined}
            data-hov={c.hov ? '' : undefined}
            style={{ '--i': c.i } as Vars}
            aria-label={c.aria}
            aria-pressed={c.level ? undefined : c.sel}
            onClick={c.onClick}
            onPointerEnter={c.level ? undefined : () => useStore.getState().setHovered(c.key)}
            onPointerLeave={
              c.level
                ? undefined
                : () => {
                    if (useStore.getState().hoveredWindowId === c.key) useStore.getState().setHovered(null);
                  }
            }
          >
            {c.level ? (
              <svg className="hm-ic" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 2.5 14 5.5 8 8.5 2 5.5Z M2 8.2l6 3 6-3 M2 10.9l6 3 6-3" />
              </svg>
            ) : (
              <svg className="hm-ic" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 2.5h10v11H3Z M8 2.5v11 M3 8h10" />
              </svg>
            )}
            <span className="hm-chip-t">{c.label}</span>
            <span className="hm-chip-s">{c.sub}</span>
          </button>
        ))}
      </div>

      <p className="hm-hint" aria-hidden="true">
        {t('Glissez pour tourner', 'Drag to turn')}
      </p>

      <div ref={ctrlRef} className="hm-ctrl">
        <div className="hm-turns">
          <button type="button" aria-label={t('Tourner à gauche', 'Turn left')} onClick={() => turnBy(-45)}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M10 3.5 5.5 8l4.5 4.5" />
            </svg>
          </button>
          <button type="button" aria-label={t('Vue initiale', 'Reset view')} onClick={resetView}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3.2 8a4.8 4.8 0 1 0 1.4-3.4M3.2 2.8v2.6h2.6" />
            </svg>
          </button>
          <button type="button" aria-label={t('Tourner à droite', 'Turn right')} onClick={() => turnBy(45)}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M6 3.5 10.5 8 6 12.5" />
            </svg>
          </button>
        </div>
        <button
          type="button"
          className="hm-pause"
          aria-label={paused ? t('Reprendre le mouvement', 'Resume motion') : t('Mettre le mouvement en pause', 'Pause motion')}
          aria-pressed={paused}
          disabled={reduced}
          onClick={() => useStore.getState().setMotionPaused(!paused)}
        >
          {motionOn ? (
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M6 4v8M10 4v8" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M5.5 3.8v8.4L12 8Z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
