/**
 * On-screen controls for touch devices (walk mode only): a virtual joystick (bottom-left), a
 * look area (right 60 % of the screen), a round "Select" button and a run toggle (bottom-right).
 * Everything writes the shared `input` object (src/scene/input.ts); the Player consumes it.
 * Native, non-passive touch listeners are used so preventDefault works (React's are passive).
 */
import { useEffect, useRef, useState } from 'react';
import { input } from '../scene/input';
import { useStore, useT } from '../store/useStore';
import './touch.css';

const JOY_RADIUS = 40; // px, max knob travel
const JOY_SCALE = 50; // px of travel → full speed

const clamp1 = (v: number) => Math.min(1, Math.max(-1, v));

function findTouch(list: TouchList, id: number): Touch | null {
  for (let i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i];
  return null;
}

/** Virtual joystick: one captured touch drives input.forward / input.right. */
function Joystick({ label }: { label: string }) {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = base.current;
    const kn = knob.current;
    if (!el || !kn) return;
    let touchId: number | null = null;
    let cx = 0;
    let cy = 0;

    const setKnob = (dx: number, dy: number) => {
      kn.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const release = () => {
      touchId = null;
      input.forward = 0;
      input.right = 0;
      setKnob(0, 0);
      el.classList.remove('is-active');
    };

    const onStart = (e: TouchEvent) => {
      if (touchId !== null) return;
      const t = e.changedTouches[0];
      if (!t) return;
      e.preventDefault();
      touchId = t.identifier;
      const r = el.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      el.classList.add('is-active');
      onMove(e);
    };
    const onMove = (e: TouchEvent) => {
      if (touchId === null) return;
      const t = findTouch(e.changedTouches, touchId);
      if (!t) return;
      e.preventDefault();
      const dx = t.clientX - cx;
      const dy = t.clientY - cy;
      input.forward = clamp1(-dy / JOY_SCALE);
      input.right = clamp1(dx / JOY_SCALE);
      const len = Math.hypot(dx, dy);
      const k = len > JOY_RADIUS ? JOY_RADIUS / len : 1;
      setKnob(dx * k, dy * k);
    };
    const onEnd = (e: TouchEvent) => {
      if (touchId === null || !findTouch(e.changedTouches, touchId)) return;
      e.preventDefault();
      release();
    };

    const opts: AddEventListenerOptions = { passive: false };
    el.addEventListener('touchstart', onStart, opts);
    el.addEventListener('touchmove', onMove, opts);
    el.addEventListener('touchend', onEnd, opts);
    el.addEventListener('touchcancel', onEnd, opts);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
      release();
    };
  }, []);

  return (
    <div className="tc-joy" ref={base} aria-label={label}>
      <div className="tc-joy-knob" ref={knob} />
      <span className="tc-joy-label">{label}</span>
    </div>
  );
}

/** Drag anywhere on the right of the screen to look around (multi-touch safe). */
function LookArea() {
  const area = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const last = new Map<number, { x: number; y: number }>();

    const onStart = (e: TouchEvent) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        last.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
    };
    const onMove = (e: TouchEvent) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        const p = last.get(t.identifier);
        if (!p) continue;
        input.lookDX += t.clientX - p.x;
        input.lookDY += t.clientY - p.y;
        p.x = t.clientX;
        p.y = t.clientY;
      }
    };
    const onEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) last.delete(e.changedTouches[i].identifier);
    };

    const opts: AddEventListenerOptions = { passive: false };
    el.addEventListener('touchstart', onStart, opts);
    el.addEventListener('touchmove', onMove, opts);
    el.addEventListener('touchend', onEnd, opts);
    el.addEventListener('touchcancel', onEnd, opts);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
      last.clear();
      input.lookDX = 0;
      input.lookDY = 0;
    };
  }, []);

  return <div className="tc-look" ref={area} />;
}

/** A button that fires on touchstart (preventDefault suppresses the synthetic click) or on click. */
function TapButton({ className, label, onTap, pressed }: { className: string; label: string; onTap: () => void; pressed?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const tap = useRef(onTap);
  tap.current = onTap;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onStart = (e: TouchEvent) => {
      e.preventDefault();
      el.classList.add('is-pressed');
      tap.current();
    };
    const onEnd = () => el.classList.remove('is-pressed');
    const opts: AddEventListenerOptions = { passive: false };
    el.addEventListener('touchstart', onStart, opts);
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  return (
    <button type="button" ref={ref} className={className} aria-pressed={pressed} onClick={() => tap.current()}>
      {label}
    </button>
  );
}

function Widgets() {
  const t = useT();
  const [running, setRunning] = useState(() => input.sprint);

  const toggleRun = () => {
    input.sprint = !input.sprint;
    setRunning(input.sprint);
  };

  return (
    <div className="tc-layer">
      <LookArea />
      <Joystick label={t('Déplacer', 'Move')} />
      <div className="tc-right">
        <TapButton className={`tc-run${running ? ' is-on' : ''}`} label={t('Courir', 'Run')} onTap={toggleRun} pressed={running} />
        <TapButton
          className="tc-select"
          label={t('Choisir', 'Select')}
          onTap={() => {
            input.selectRequested = true;
          }}
        />
      </div>
    </div>
  );
}

export function TouchControls() {
  const hasStarted = useStore((s) => s.hasStarted);
  const mode = useStore((s) => s.mode);
  const panel = useStore((s) => s.panel);
  if (!hasStarted || mode !== 'walk' || panel !== 'none') return null;
  return <Widgets />;
}
