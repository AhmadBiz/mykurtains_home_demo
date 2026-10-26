import { memo, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { COVERING_BY_ID, COVERING_TYPES, colorOption } from '../data/coverings';
import { LEVEL_BY_ID, WINDOWS, WINDOW_BY_ID } from '../data/geometry';
import type { WindowInstance } from '../data/geometry';
import { CoveringIllustration } from '../illustrations/CoveringIllustration';
import { CoveringTypeIcon } from '../illustrations/CoveringTypeIcon';
import { prefersReducedMotion, useCovering, useStore, useT } from '../store/useStore';
import type { Lang } from '../store/useStore';
import { closeWindow, useHistorySync } from './nav';
import { GROUPS, LEVEL_SHORT, ORDERED_WINDOWS, chipName, fullTypeName, pickerName, shortWindowName, swatchBg, windowsIn } from './text';

const PHONE = '(max-width: 959.98px)';

/** Live media-query match (phone layout switches a few behaviours, not just styles). */
function useMedia(query: string) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

/**
 * Right-hand panel: the overview of every window (grouped by storey → room), or, when a window is
 * selected, its drawing and the covering controls. On phones it stacks under the model as a sheet.
 */
export function SidePanel() {
  const t = useT();
  const selectedId = useStore((s) => s.selectedWindowId);
  const panelRef = useRef<HTMLElement>(null);
  const prevSelected = useRef<string | null>(null);
  useHistorySync();

  // Escape returns to the overview.
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) closeWindow();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectedId]);

  // Selection: bring the panel to its top (phones scroll the page to the sheet).
  // Back to the overview: return focus to the row of the window we came from.
  useEffect(() => {
    const panel = panelRef.current;
    const prev = prevSelected.current;
    prevSelected.current = selectedId;
    if (!panel) return;
    if (selectedId) {
      panel.scrollTop = 0;
      if (window.matchMedia(PHONE).matches) {
        panel.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
      }
    } else if (prev) {
      const active = document.activeElement;
      if (!active || active === document.body || panel.contains(active)) {
        panel.querySelector<HTMLButtonElement>(`[data-win="${prev}"]`)?.focus();
      }
    }
  }, [selectedId]);

  const win = selectedId ? WINDOW_BY_ID.get(selectedId) : undefined;
  return (
    <aside className="panel" ref={panelRef} aria-label={t('Habillage des fenêtres', 'Window coverings')}>
      {win ? <WindowView key={win.id} win={win} /> : <Overview />}
    </aside>
  );
}

// -------------------------------------------------------------------------------------------
// Overview
// -------------------------------------------------------------------------------------------

function Overview() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const levelFilter = useStore((s) => s.levelFilter);
  const count = windowsIn(levelFilter).length;
  const groups = levelFilter === 'all' ? GROUPS : GROUPS.filter((g) => g.level.id === levelFilter);

  const resetAll = () => {
    if (window.confirm(t('Réinitialiser l’habillage de toutes les fenêtres ?', 'Reset the coverings of every window?'))) {
      useStore.getState().resetAllCoverings();
    }
  };

  return (
    <div className="sp sp-overview">
      <div className="sp-head">
        <p className="sp-eyebrow">{t('Habillage des fenêtres', 'Window coverings')}</p>
        <h2 className="sp-title">
          {count} {count > 1 ? t('fenêtres', 'windows') : t('fenêtre', 'window')}
        </h2>
        <p className="sp-help">
          {t('Choisissez une fenêtre sur la maquette ou dans la liste.', 'Choose a window on the model or in the list.')}
        </p>
      </div>

      {groups.map((g) => (
        <section className="sp-level" key={g.level.id} aria-label={lang === 'fr' ? g.level.nameFr : g.level.name}>
          {levelFilter === 'all' && <h3 className="sp-level-name">{lang === 'fr' ? g.level.nameFr : g.level.name}</h3>}
          {g.rooms.map((r) => (
            <div className="sp-room" key={r.room?.id ?? 'other'}>
              <h4 className="sp-room-name">{r.room ? (lang === 'fr' ? r.room.nameFr : r.room.name) : t('Autres', 'Other')}</h4>
              <ul className="sp-rows">
                {r.windows.map((w) => (
                  <li key={w.id}>
                    <Row win={w} lang={lang} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}

      <div className="sp-foot">
        <button type="button" className="quiet" onClick={resetAll}>
          {t('Tout réinitialiser', 'Reset everything')}
        </button>
      </div>
    </div>
  );
}

const Row = memo(function Row({ win, lang }: { win: WindowInstance; lang: Lang }) {
  const hot = useStore((s) => s.hoveredWindowId === win.id);
  const state = useCovering(win.id);
  const color = colorOption(state);
  const name = shortWindowName(win, lang);
  const type = chipName(state.type, lang);
  const leave = () => {
    if (useStore.getState().hoveredWindowId === win.id) useStore.getState().setHovered(null);
  };
  return (
    <button
      type="button"
      className="row"
      data-win={win.id}
      data-hot={hot || undefined}
      aria-label={`${lang === 'fr' ? win.nameFr : win.name} · ${type}`}
      onPointerEnter={(e) => {
        // Touch has no hover: a tap would otherwise leave the row (and the model window) lit.
        if (e.pointerType === 'mouse') useStore.getState().setHovered(win.id);
      }}
      onPointerLeave={leave}
      onFocus={() => useStore.getState().setHovered(win.id)}
      onBlur={leave}
      onClick={() => useStore.getState().selectWindow(win.id)}
    >
      <span className="row-name">{name}</span>
      <span className="chip" aria-hidden="true">
        <CoveringTypeIcon type={state.type} size={16} />
        <span className="chip-text">{type}</span>
        {state.type !== 'none' && <span className="dot" style={{ background: swatchBg(color.hex, color.accent) }} />}
      </span>
    </button>
  );
});

// -------------------------------------------------------------------------------------------
// Selected window
// -------------------------------------------------------------------------------------------

function WindowView({ win }: { win: WindowInstance }) {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const fr = lang === 'fr';
  const state = useCovering(win.id);
  const def = COVERING_BY_ID[state.type];
  const color = colorOption(state);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [status, setStatus] = useState('');
  const statusTimer = useRef(0);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    return () => window.clearTimeout(statusTimer.current);
  }, []);

  const phone = useMedia(PHONE);
  // The stepper walks the whole house (selectWindow brings the next storey forward); the count is per storey.
  const all = ORDERED_WINDOWS;
  const gIdx = all.findIndex((w) => w.id === win.id);
  const siblings = all.filter((w) => w.level === win.level);
  const idx = siblings.findIndex((w) => w.id === win.id);
  const go = (d: number) => {
    const next = all[(gIdx + d + all.length) % all.length];
    useStore.getState().selectWindow(next.id);
  };
  const showOnModel = () => {
    document.querySelector('.stage')?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  };

  const s = useStore.getState;
  const flash = (msg: string) => {
    setStatus(msg);
    window.clearTimeout(statusTimer.current);
    statusTimer.current = window.setTimeout(() => setStatus(''), 2600);
  };
  const plural = (n: number) => (n > 1 ? t(`${n} fenêtres`, `${n} windows`) : t('1 fenêtre', '1 window'));
  const applyRoom = () => {
    s().applyToRoom(win.id);
    flash(t('Appliqué à la pièce', 'Applied to the room') + ' · ' + plural(WINDOWS.filter((w) => w.room && w.room.id === win.room?.id).length));
  };
  const applyLevel = () => {
    s().applyToLevel(win.id);
    flash(t('Appliqué à l’étage', 'Applied to the storey') + ' · ' + plural(siblings.length));
  };
  const applyAll = () => {
    if (!window.confirm(t('Appliquer cet habillage à toutes les fenêtres de la maison ?', 'Apply this covering to every window in the house?'))) return;
    s().applyToAll(win.id);
    flash(t('Appliqué à toute la maison', 'Applied to the whole house') + ' · ' + plural(WINDOWS.length));
  };
  const reset = () => {
    s().resetCovering(win.id);
    flash(t('Fenêtre réinitialisée', 'Window reset'));
  };

  const roomName = win.room ? (fr ? win.room.nameFr : win.room.name) : '';
  const levelName = fr ? LEVEL_BY_ID[win.level].nameFr : LEVEL_BY_ID[win.level].name;
  const levelShort = LEVEL_SHORT[win.level][fr ? 0 : 1];
  // Lead with the room the homeowner knows; the window is the detail.
  const title = roomName || (fr ? win.nameFr : win.name);
  const sub = roomName ? `${shortWindowName(win, lang)} · ${levelName}` : levelName;

  return (
    <div className="sp sp-window">
      <div className="sp-nav">
        <button type="button" className="back" onClick={closeWindow}>
          <span aria-hidden="true">←</span> {t('Toutes les fenêtres', 'All windows')}
        </button>
        <div className="stepper">
          <button type="button" className="icon-btn" onClick={() => go(-1)} aria-label={t('Fenêtre précédente', 'Previous window')}>
            <Chevron dir={-1} />
          </button>
          <span className="stepper-n" aria-hidden="true">
            <span className="stepper-lv">{levelShort} · </span>
            {idx + 1} / {siblings.length}
          </span>
          <span className="sr-only" aria-live="polite">
            {t(`Fenêtre ${idx + 1} sur ${siblings.length}`, `Window ${idx + 1} of ${siblings.length}`)}
          </span>
          <button type="button" className="icon-btn" onClick={() => go(1)} aria-label={t('Fenêtre suivante', 'Next window')}>
            <Chevron dir={1} />
          </button>
        </div>
      </div>

      <div className="sp-head">
        <h2 className="sp-wtitle" ref={headingRef} tabIndex={-1}>
          {title}
        </h2>
        {phone ? (
          <button type="button" className="sp-sub sp-locate" onClick={showOnModel} title={t('Voir sur la maquette', 'Show on the model')}>
            <span>{sub}</span>
            <LocateIcon />
            <span className="sr-only">{t(' — voir sur la maquette', ' — show on the model')}</span>
          </button>
        ) : (
          <p className="sp-sub">{sub}</p>
        )}
      </div>

      <div className="sp-figure">
        <CoveringIllustration win={win} state={state} color={color} />
      </div>

      <section className="field" aria-labelledby="f-type">
        <div className="field-label">
          <span id="f-type">{t('Type d’habillage', 'Covering type')}</span>
        </div>
        <div className="types">
          {COVERING_TYPES.map((d) => (
            <button
              key={d.id}
              type="button"
              className="type-card"
              aria-pressed={state.type === d.id}
              onClick={() => s().setCoveringType(win.id, d.id)}
            >
              <CoveringTypeIcon type={d.id} size={18} />
              <span className="type-label">{pickerName(d.id, lang)}</span>
            </button>
          ))}
        </div>
        <p className="field-note">
          <strong>{fullTypeName(state.type, lang)}</strong> · {fr ? def.descriptionFr : def.description}
        </p>
      </section>

      {state.type !== 'none' && (
        <section className="field" aria-labelledby="f-color">
          <div className="field-label">
            <span id="f-color">{t('Couleur', 'Colour')}</span>
            <span className="field-value">{fr ? color.nameFr : color.name}</span>
          </div>
          <div className="swatches">
            {def.colors.map((c) => (
              <button
                key={c.id}
                type="button"
                className="swatch"
                aria-pressed={c.id === color.id}
                aria-label={fr ? c.nameFr : c.name}
                title={fr ? c.nameFr : c.name}
                style={{ background: swatchBg(c.hex, c.accent) }}
                onClick={() => s().updateCovering(win.id, { color: c.id })}
              />
            ))}
          </div>
        </section>
      )}

      {def.hasOpen && (
        <Slider
          id="f-open"
          label={fr ? def.openLabelFr : def.openLabel}
          value={state.open}
          min={0}
          max={1}
          display={`${Math.round(state.open * 100)} %`}
          fill
          onChange={(v) => s().updateCovering(win.id, { open: v })}
        />
      )}
      {def.hasTilt && (
        <Slider
          id="f-tilt"
          label={t('Inclinaison des lames', 'Slat tilt')}
          value={state.tilt}
          min={-1}
          max={1}
          display={`${Math.round(state.tilt * 90)}°`}
          onChange={(v) => s().updateCovering(win.id, { tilt: v })}
        />
      )}
      {def.hasSheerLayer && (
        <div className="field field-row">
          <span id="f-sheer" className="field-label-text">
            {t('Voilage derrière (double rail)', 'Sheer behind (double track)')}
          </span>
          <button
            type="button"
            role="switch"
            className="switch"
            aria-checked={state.sheer}
            aria-labelledby="f-sheer"
            onClick={() => s().updateCovering(win.id, { sheer: !state.sheer })}
          >
            <span className="switch-knob" />
          </button>
        </div>
      )}

      <section className="field" aria-labelledby="f-apply">
        <div className="field-label">
          <span id="f-apply">{t('Appliquer à', 'Apply to')}</span>
        </div>
        <div className="pills">
          <button type="button" className="pill" onClick={applyRoom} disabled={!win.room}>
            {t('la pièce', 'the room')}
          </button>
          <button type="button" className="pill" onClick={applyLevel}>
            {t('l’étage', 'the storey')}
          </button>
          <button type="button" className="pill" onClick={applyAll}>
            {t('toute la maison', 'the whole house')}
          </button>
        </div>
        <p className="status" role="status" aria-live="polite">
          {status}
        </p>
      </section>

      <div className="sp-foot">
        <button type="button" className="quiet" onClick={reset}>
          {t('Réinitialiser cette fenêtre', 'Reset this window')}
        </button>
      </div>
    </div>
  );
}

function Slider({ id, label, value, min, max, display, fill, onChange }: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  display: string;
  fill?: boolean;
  onChange: (v: number) => void;
}) {
  const p = ((value - min) / (max - min)) * 100;
  const style = { '--p': `${p}%` } as CSSProperties;
  return (
    <div className="field">
      <div className="field-label">
        <label htmlFor={id}>{label}</label>
        <span className="field-value">{display}</span>
      </div>
      <input
        id={id}
        className="range"
        data-fill={fill || undefined}
        type="range"
        min={min}
        max={max}
        step={0.01}
        value={value}
        aria-valuetext={display}
        style={style}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
      />
    </div>
  );
}

function Chevron({ dir }: { dir: 1 | -1 }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={dir > 0 ? 'M6 3.5 10.5 8 6 12.5' : 'M10 3.5 5.5 8 10 12.5'} />
    </svg>
  );
}

function LocateIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 13V3.5M4 7l4-4 4 4" />
    </svg>
  );
}
