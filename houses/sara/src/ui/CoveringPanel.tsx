/**
 * Picker for the selected window: covering type, colour, open / tilt sliders, optional sheer
 * layer, apply-to-room / floor / house and reset. DOM overlay rendered as a sibling of the
 * canvas — right side on desktop, bottom sheet on phones (see panels.css).
 *
 * Shown when store.panel === 'covering' && store.selectedWindowId. Every store read uses a
 * narrow selector so the panel never re-renders on per-frame data.
 */
import { useCallback, useEffect } from 'react';
import type { SyntheticEvent } from 'react';
import { COVERING_BY_ID, COVERING_TYPES, DEFAULT_COVERINGS, colorOption, defaultStateFor } from '../data/coverings';
import type { ColorOption } from '../data/coverings';
import { LEVEL_BY_ID, WINDOW_BY_ID } from '../data/geometry';
import type { WindowInstance } from '../data/geometry';
import { useStore, useT } from '../store/useStore';
import './panels.css';

/** Keep pointer / click events inside the panel from reaching document-level scene handlers. */
const stop = (e: SyntheticEvent) => e.stopPropagation();

/** Escape closes the panel while it is open. */
function useEscape(onEscape: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onEscape]);
}

function swatchBackground(c: ColorOption): string {
  return c.accent ? `linear-gradient(135deg, ${c.hex} 0 50%, ${c.accent} 50% 100%)` : c.hex;
}

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function CoveringPanel() {
  const panel = useStore((s) => s.panel);
  const id = useStore((s) => s.selectedWindowId);
  if (panel !== 'covering' || !id) return null;
  const w = WINDOW_BY_ID.get(id);
  if (!w) return null;
  // key = id → switching windows remounts the body (scroll back to top).
  return <CoveringPanelBody key={id} w={w} />;
}

function CoveringPanelBody({ w }: { w: WindowInstance }) {
  const id = w.id;
  const t = useT();
  const stored = useStore((s) => s.coverings[id]);
  const state = stored ?? DEFAULT_COVERINGS[id] ?? defaultStateFor('none');
  const isTouch = useStore((s) => s.isTouch);
  const mode = useStore((s) => s.mode);
  const selectWindow = useStore((s) => s.selectWindow);
  const goToWindow = useStore((s) => s.goToWindow);
  const setCoveringType = useStore((s) => s.setCoveringType);
  const updateCovering = useStore((s) => s.updateCovering);
  const applyToRoom = useStore((s) => s.applyToRoom);
  const applyToLevel = useStore((s) => s.applyToLevel);
  const applyToAll = useStore((s) => s.applyToAll);
  const resetCovering = useStore((s) => s.resetCovering);

  const close = useCallback(() => selectWindow(null), [selectWindow]);
  useEscape(close);

  const def = COVERING_BY_ID[state.type];
  const color = colorOption(state);
  const level = LEVEL_BY_ID[w.level];
  const room = w.room;
  const openPct = Math.round(state.open * 100);
  const tiltPct = Math.round(state.tilt * 100);
  const tiltText = `${tiltPct > 0 ? '+' : ''}${tiltPct}`;

  const confirmApplyAll = () => {
    if (window.confirm(t('Appliquer cet habillage à toutes les fenêtres de la maison ?', 'Apply this covering to every window in the house?'))) applyToAll(id);
  };

  return (
    <aside
      className="pnl pnl--right"
      role="dialog"
      aria-label={t('Habillage de la fenêtre', 'Window covering')}
      onPointerDown={stop}
      onMouseDown={stop}
      onTouchStart={stop}
      onClick={stop}
    >
      <div className="pnl-handle" aria-hidden="true" />
      <header className="pnl-head">
        <div className="pnl-head-text">
          <h2 className="pnl-title">{t(w.nameFr, w.name)}</h2>
          <p className="pnl-sub">
            {room ? `${t(room.nameFr, room.name)} · ` : ''}
            {t(level.nameFr, level.name)}
          </p>
        </div>
        <div className="pnl-head-actions">
          <button type="button" className="pnl-btn pnl-btn--small" onClick={() => goToWindow(id)} title={t('Se placer devant cette fenêtre', 'Stand in front of this window')}>
            <EyeIcon />
            {t('Voir', 'View')}
          </button>
          <button type="button" className="pnl-btn pnl-btn--icon" aria-label={t('Fermer', 'Close')} title={t('Fermer (Échap)', 'Close (Esc)')} onClick={close}>
            ×
          </button>
        </div>
      </header>

      <div className="pnl-body">
        {/* ---- type picker ---- */}
        <section className="pnl-section">
          <div className="pnl-label">
            <span>{t('Type d’habillage', 'Covering type')}</span>
          </div>
          <div className="pnl-types" role="radiogroup" aria-label={t('Type d’habillage', 'Covering type')}>
            {COVERING_TYPES.map((d) => {
              const selected = d.id === state.type;
              return (
                <button
                  key={d.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={selected ? 'pnl-type is-selected' : 'pnl-type'}
                  title={t(d.descriptionFr, d.description)}
                  onClick={() => setCoveringType(id, d.id)}
                >
                  <span className="pnl-type-glyph" aria-hidden="true">{d.glyph}</span>
                  <span className="pnl-type-name">{t(d.nameFr, d.name)}</span>
                </button>
              );
            })}
          </div>
          <p className="pnl-desc">{t(def.descriptionFr, def.description)}</p>
        </section>

        {/* ---- colour swatches ---- */}
        {def.id !== 'none' && (
          <section className="pnl-section">
            <div className="pnl-label">
              <span>{t('Couleur', 'Colour')}</span>
              <span className="pnl-value">{t(color.nameFr, color.name)}</span>
            </div>
            <div className="pnl-swatches" role="radiogroup" aria-label={t('Couleur', 'Colour')}>
              {def.colors.map((c) => {
                const selected = c.id === state.color;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={t(c.nameFr, c.name)}
                    title={t(c.nameFr, c.name)}
                    className={selected ? 'pnl-swatch is-selected' : 'pnl-swatch'}
                    style={{ background: swatchBackground(c) }}
                    onClick={() => updateCovering(id, { color: c.id })}
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* ---- open amount ---- */}
        {def.hasOpen && (
          <section className="pnl-section">
            <label className="pnl-label" htmlFor={`pnl-open-${id}`}>
              <span>{t(def.openLabelFr, def.openLabel)}</span>
              <span className="pnl-value">{openPct}&nbsp;%</span>
            </label>
            <input
              id={`pnl-open-${id}`}
              className="pnl-range"
              type="range"
              min={0}
              max={100}
              step={1}
              value={openPct}
              onChange={(e) => updateCovering(id, { open: Number(e.target.value) / 100 })}
            />
          </section>
        )}

        {/* ---- slat tilt ---- */}
        {def.hasTilt && (
          <section className="pnl-section">
            <label className="pnl-label" htmlFor={`pnl-tilt-${id}`}>
              <span>{t('Inclinaison des lames', 'Slat tilt')}</span>
              <span className="pnl-value">{tiltText}</span>
            </label>
            <input
              id={`pnl-tilt-${id}`}
              className="pnl-range pnl-range--center"
              type="range"
              min={-100}
              max={100}
              step={1}
              value={tiltPct}
              onChange={(e) => updateCovering(id, { tilt: Number(e.target.value) / 100 })}
            />
            <p className="pnl-caption">{t('0 = lames à plat · ±100 = lames fermées', '0 = slats flat · ±100 = slats closed')}</p>
          </section>
        )}

        {/* ---- sheer layer ---- */}
        {def.hasSheerLayer && (
          <section className="pnl-section">
            <button type="button" role="switch" aria-checked={state.sheer} className="pnl-switch" onClick={() => updateCovering(id, { sheer: !state.sheer })}>
              <span>{t('Ajouter un voilage derrière', 'Add a sheer layer')}</span>
              <span className="pnl-switch-track" aria-hidden="true" />
            </button>
          </section>
        )}

        {/* ---- apply ---- */}
        <section className="pnl-section">
          <div className="pnl-label">
            <span>{t('Appliquer ce choix', 'Apply this choice')}</span>
          </div>
          <div className="pnl-stack">
            <button type="button" className="pnl-btn pnl-btn--block" disabled={!room} onClick={() => applyToRoom(id)}>
              {t('Appliquer à la pièce', 'Apply to room')}
            </button>
            <button type="button" className="pnl-btn pnl-btn--block" onClick={() => applyToLevel(id)}>
              {t('Appliquer à l’étage', 'Apply to floor')}
            </button>
            <button type="button" className="pnl-btn pnl-btn--block pnl-btn--accent" onClick={confirmApplyAll}>
              {t('Appliquer à toute la maison', 'Apply to the whole house')}
            </button>
          </div>
          <button type="button" className="pnl-link" onClick={() => resetCovering(id)}>
            {t('Réinitialiser cette fenêtre', 'Reset this window')}
          </button>
        </section>
      </div>

      {!isTouch && mode === 'walk' && (
        <div className="pnl-foot">{t('Cliquez sur la scène pour reprendre la visite', 'Click the scene to resume walking')}</div>
      )}
    </aside>
  );
}
