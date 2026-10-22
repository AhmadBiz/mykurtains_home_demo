/**
 * Drawer listing every coverable window, grouped by level then room, with the current covering
 * type and colour of each. Clicking a row teleports in front of that window (store.goToWindow).
 * DOM overlay rendered as a sibling of the canvas — left side on desktop, bottom sheet on phones.
 *
 * Shown when store.panel === 'windows'.
 */
import { useCallback, useEffect, useRef } from 'react';
import type { SyntheticEvent } from 'react';
import { COVERING_BY_ID, DEFAULT_COVERINGS, colorOption, defaultStateFor } from '../data/coverings';
import { LEVEL_ORDER, WINDOWS, windowsByLevel } from '../data/geometry';
import type { WindowInstance } from '../data/geometry';
import { useStore, useT } from '../store/useStore';
import './panels.css';

/** Static grouping (house data never changes at runtime). Upper floor first. */
const GROUPS = windowsByLevel();

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

/**
 * Window names are authored as "Room — detail"; under a room heading the room part is noise,
 * so the row shows the detail (capitalised). The full name goes in the title attribute.
 */
function shortName(full: string): string {
  const i = full.indexOf(' — ');
  if (i < 0) return full;
  const rest = full.slice(i + 3).trim();
  return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : full;
}

export function WindowList() {
  const panel = useStore((s) => s.panel);
  if (panel !== 'windows') return null;
  return <WindowListBody />;
}

function WindowListBody() {
  const t = useT();
  const setPanel = useStore((s) => s.setPanel);
  const selectedWindowId = useStore((s) => s.selectedWindowId);
  const goToWindow = useStore((s) => s.goToWindow);
  const resetAllCoverings = useStore((s) => s.resetAllCoverings);

  const close = useCallback(() => setPanel('none'), [setPanel]);
  useEscape(close);

  const confirmResetAll = () => {
    if (window.confirm(t('Réinitialiser l’habillage de toutes les fenêtres ?', 'Reset the coverings of every window?'))) resetAllCoverings();
  };

  return (
    <aside
      className="pnl pnl--left"
      role="dialog"
      aria-label={t('Fenêtres de la maison', 'Windows of the house')}
      onPointerDown={stop}
      onMouseDown={stop}
      onTouchStart={stop}
      onClick={stop}
    >
      <div className="pnl-handle" aria-hidden="true" />
      <header className="pnl-head">
        <div className="pnl-head-text">
          <h2 className="pnl-title">{t('Fenêtres de la maison', 'Windows of the house')}</h2>
          <p className="pnl-sub">{t('Cliquez sur une fenêtre pour vous placer devant', 'Click a window to stand in front of it')}</p>
        </div>
        <div className="pnl-head-actions">
          <button type="button" className="pnl-btn pnl-btn--icon" aria-label={t('Fermer', 'Close')} title={t('Fermer (Échap)', 'Close (Esc)')} onClick={close}>
            ×
          </button>
        </div>
      </header>

      <div className="pnl-body">
        <div className="pnl-summary">
          <span>{t(`${WINDOWS.length} fenêtres · ${LEVEL_ORDER.length} niveaux`, `${WINDOWS.length} windows · ${LEVEL_ORDER.length} levels`)}</span>
          <button type="button" className="pnl-btn pnl-btn--small pnl-btn--danger" onClick={confirmResetAll}>
            {t('Tout réinitialiser', 'Reset all')}
          </button>
        </div>

        {GROUPS.map(({ level, rooms }) => (
          <section key={level.id} aria-label={t(level.nameFr, level.name)}>
            <h3 className="pnl-level">{t(level.nameFr, level.name)}</h3>
            {rooms.map(({ room, windows }) => (
              <div key={room?.id ?? 'no-room'}>
                <h4 className="pnl-room">{room ? t(room.nameFr, room.name) : t('Autres', 'Other')}</h4>
                {windows.map((w) => (
                  <WindowRow key={w.id} w={w} selected={w.id === selectedWindowId} onGo={goToWindow} />
                ))}
              </div>
            ))}
          </section>
        ))}
      </div>
    </aside>
  );
}

function WindowRow({ w, selected, onGo }: { w: WindowInstance; selected: boolean; onGo: (id: string) => void }) {
  const t = useT();
  const ref = useRef<HTMLButtonElement>(null);
  const stored = useStore((s) => s.coverings[w.id]);
  const state = stored ?? DEFAULT_COVERINGS[w.id] ?? defaultStateFor('none');
  const def = COVERING_BY_ID[state.type];
  const none = state.type === 'none';
  const hex = colorOption(state).hex;

  // bring the selected window into view when the list opens / the selection changes
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const full = t(w.nameFr, w.name);
  return (
    <button
      ref={ref}
      type="button"
      className={selected ? 'pnl-row is-selected' : 'pnl-row'}
      aria-current={selected ? 'true' : undefined}
      title={full}
      onClick={() => onGo(w.id)}
    >
      <span className="pnl-row-name">{shortName(full)}</span>
      <span className="pnl-chip">
        <span className={none ? 'pnl-dot pnl-dot--none' : 'pnl-dot'} style={none ? undefined : { background: hex }} aria-hidden="true" />
        <span className="pnl-chip-text">{t(def.nameFr, def.name)}</span>
      </span>
    </button>
  );
}
