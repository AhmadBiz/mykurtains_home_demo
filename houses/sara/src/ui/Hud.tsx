/**
 * DOM overlays outside the Canvas (walk + orbit modes):
 *  - top bar (60 px): title + level pills on the left, action buttons on the right;
 *  - orbit mode: an extra "show up to" row of level pills (store.orbitLevel);
 *  - walk mode: centred crosshair + aimed-window tooltip (polled from playerState via rAF),
 *    "click to resume" pill when the pointer is not locked, bottom-left hint bar;
 *  - "selected window" badge when a window is selected but its panel is closed;
 *  - help modal (store.panel === 'help').
 * Every piece subscribes to the narrow store slice it needs. All labels go through useT(fr, en).
 */
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { LEVEL_BY_ID, LEVEL_ORDER, WINDOW_BY_ID } from '../data/geometry';
import { HOUSE_META } from '../data/house';
import type { LevelId } from '../data/types';
import { playerState, useStore, useT } from '../store/useStore';
import type { Lang } from '../store/useStore';
import './hud.css';

/** True when the app is served from the multi-house site (base = /houses/<id>/), where '/' lists every house. */
const IS_MULTI_HOUSE_SITE = import.meta.env.BASE_URL !== '/';

// ------------------------------------------------------------------------------------------------
// Icons (inline SVG, stroke = currentColor). Exported so the intro overlay can reuse them.
// ------------------------------------------------------------------------------------------------
function Svg({ children, viewBox = '0 0 24 24' }: { children: ReactNode; viewBox?: string }) {
  return (
    <svg viewBox={viewBox} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
export const IconHouse = () => (
  <Svg>
    <path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
  </Svg>
);
export const IconWindows = () => (
  <Svg>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M12 3v18M3 12h18" />
  </Svg>
);
export const IconMap = () => (
  <Svg>
    <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" />
  </Svg>
);
export const IconWalk = () => (
  <Svg>
    <circle cx="13" cy="4" r="1.8" />
    <path d="M13.5 8l-3 1.5-1.5 4M13.5 8l1 4.5 2.5 2 1 5.5M13.5 8l-1.5 6-3 4-2 3M12 14l3 3" />
  </Svg>
);
export const IconDollhouse = () => (
  <Svg>
    <path d="M12 2l9 5v10l-9 5-9-5V7l9-5zM12 12l9-5M12 12v10M12 12L3 7" />
  </Svg>
);
export const IconCeiling = () => (
  <Svg>
    <path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5" />
  </Svg>
);
export const IconHelp = () => (
  <Svg>
    <circle cx="12" cy="12" r="9.5" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.7M12 17h.01" />
  </Svg>
);
export const IconQuality = () => (
  <Svg>
    <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
  </Svg>
);
export const IconPin = () => (
  <Svg>
    <path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </Svg>
);
export const IconClose = () => (
  <Svg>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const IconRestart = () => (
  <Svg>
    <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
  </Svg>
);
export const IconMouse = () => (
  <Svg>
    <rect x="7" y="3" width="10" height="18" rx="5" />
    <path d="M12 7v3" />
  </Svg>
);
export const IconKeys = () => (
  <Svg>
    <rect x="9" y="3" width="6" height="6" rx="1.2" />
    <rect x="2" y="11" width="6" height="6" rx="1.2" />
    <rect x="9" y="11" width="6" height="6" rx="1.2" />
    <rect x="16" y="11" width="6" height="6" rx="1.2" />
  </Svg>
);
export const IconTouch = () => (
  <Svg>
    <path d="M9 11V5a2 2 0 1 1 4 0v6M13 10a2 2 0 1 1 4 0v2M17 12a2 2 0 1 1 4 0v4a6 6 0 0 1-6 6h-2a6 6 0 0 1-5-2.7L4 14a2 2 0 0 1 3.2-2.4L9 13" />
  </Svg>
);
export const IconTarget = () => (
  <Svg>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </Svg>
);

// ------------------------------------------------------------------------------------------------
// Level labels
// ------------------------------------------------------------------------------------------------
const SHORT_LEVEL: Record<LevelId, { fr: string; en: string }> = {
  basement: { fr: 'S-S', en: 'Bsmt' },
  ground: { fr: 'RDC', en: 'Ground' },
  upper: { fr: 'Étage', en: 'Upper' },
};

function LevelPills({ active, onPick, lang }: { active: LevelId; onPick: (l: LevelId) => void; lang: Lang }) {
  return (
    <div className="hud-pills" role="group">
      {LEVEL_ORDER.map((id) => {
        const lvl = LEVEL_BY_ID[id];
        const long = lang === 'fr' ? lvl.nameFr : lvl.name;
        const short = SHORT_LEVEL[id][lang];
        return (
          <button
            key={id}
            type="button"
            className={`hud-pill${active === id ? ' is-active' : ''}`}
            aria-pressed={active === id}
            aria-label={long}
            title={long}
            onClick={() => onPick(id)}
          >
            <span className="hud-pill-long">{long}</span>
            <span className="hud-pill-short">{short}</span>
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// Top bar
// ------------------------------------------------------------------------------------------------
function TopBar() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const level = useStore((s) => s.level);
  const mode = useStore((s) => s.mode);
  const panel = useStore((s) => s.panel);
  const showCeilings = useStore((s) => s.showCeilings);
  const quality = useStore((s) => s.quality);
  const goToLevel = useStore((s) => s.goToLevel);
  const togglePanel = useStore((s) => s.togglePanel);
  const setPanel = useStore((s) => s.setPanel);
  const setMode = useStore((s) => s.setMode);
  const setShowCeilings = useStore((s) => s.setShowCeilings);
  const setLang = useStore((s) => s.setLang);
  const setQuality = useStore((s) => s.setQuality);

  const toggleMode = () => {
    if (mode === 'walk') {
      setPanel('none');
      setMode('orbit');
    } else {
      setMode('walk');
    }
  };

  const labelWindows = t('Fenêtres', 'Windows');
  const labelMap = t('Plan', 'Map');
  const labelMode = mode === 'walk' ? t('Maquette', 'Dollhouse') : t('Visite', 'Walk');
  const labelCeilings = t('Plafonds', 'Ceilings');
  const labelLang = t('Passer en anglais', 'Switch to French');
  const labelHelp = t('Aide', 'Help');
  const labelQuality = quality === 'high' ? 'HD' : t('Éco', 'Eco');

  return (
    <header className="hud-top">
      <div className="hud-chip hud-left">
        <div className="hud-title">
          {IS_MULTI_HOUSE_SITE && (
            <a className="hud-back" href="/" title={t('Toutes les maisons', 'All houses')} aria-label={t('Toutes les maisons', 'All houses')}>
              ←
            </a>
          )}
          <IconHouse />
          <span>{HOUSE_META.name}</span>
          <span className="hud-title-sub">· {t('Habillage de fenêtres', 'Window coverings')}</span>
        </div>
        <LevelPills active={level} onPick={goToLevel} lang={lang} />
      </div>
      <nav className="hud-chip hud-right" aria-label={t('Actions', 'Actions')}>
        <button type="button" className={`hud-btn${panel === 'windows' ? ' is-active' : ''}`} aria-label={labelWindows} title={`${labelWindows} (L)`} onClick={() => togglePanel('windows')}>
          <IconWindows />
          <span className="hud-btn-label">{labelWindows}</span>
        </button>
        <button type="button" className={`hud-btn${panel === 'map' ? ' is-active' : ''}`} aria-label={labelMap} title={`${labelMap} (M)`} onClick={() => togglePanel('map')}>
          <IconMap />
          <span className="hud-btn-label">{labelMap}</span>
        </button>
        <button type="button" className="hud-btn" aria-label={labelMode} title={`${labelMode} (Tab)`} onClick={toggleMode}>
          {mode === 'walk' ? <IconDollhouse /> : <IconWalk />}
          <span className="hud-btn-label">{labelMode}</span>
        </button>
        <button type="button" className="hud-btn" aria-label={labelCeilings} aria-pressed={showCeilings} title={`${labelCeilings} (C)`} onClick={() => setShowCeilings(!showCeilings)}>
          <IconCeiling />
          <span className="hud-btn-label">{labelCeilings}</span>
        </button>
        <button type="button" className="hud-btn hud-lang" aria-label={labelLang} title={labelLang} onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}>
          {lang === 'fr' ? <b>FR</b> : 'FR'}
          <span>/</span>
          {lang === 'en' ? <b>EN</b> : 'EN'}
        </button>
        <button type="button" className={`hud-btn${panel === 'help' ? ' is-active' : ''}`} aria-label={labelHelp} title={`${labelHelp} (H)`} onClick={() => togglePanel('help')}>
          <IconHelp />
          <span className="hud-btn-label">{labelHelp}</span>
        </button>
        <button
          type="button"
          className="hud-btn"
          aria-label={t('Qualité graphique', 'Graphics quality')}
          aria-pressed={quality === 'high'}
          title={quality === 'high' ? t('Haute qualité — cliquer pour le mode éco', 'High quality — click for eco mode') : t('Mode éco — cliquer pour la haute qualité', 'Eco mode — click for high quality')}
          onClick={() => setQuality(quality === 'high' ? 'low' : 'high')}
        >
          <IconQuality />
          <span className="hud-btn-label">{labelQuality}</span>
        </button>
      </nav>
    </header>
  );
}

// ------------------------------------------------------------------------------------------------
// Orbit mode: which level is the top-most shown
// ------------------------------------------------------------------------------------------------
function OrbitRow() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const orbitLevel = useStore((s) => s.orbitLevel);
  const setOrbitLevel = useStore((s) => s.setOrbitLevel);
  return (
    <div className="hud-chip hud-orbit">
      <span>{t("Afficher jusqu'à", 'Show up to')}</span>
      <LevelPills active={orbitLevel} onPick={setOrbitLevel} lang={lang} />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// Crosshair + aimed-window tooltip (walk mode, no panel open)
// ------------------------------------------------------------------------------------------------
function Crosshair({ isTouch, pointerLocked }: { isTouch: boolean; pointerLocked: boolean }) {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const [aimed, setAimed] = useState<string | null>(null);

  useEffect(() => {
    let raf = 0;
    let last: string | null | undefined;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const id = playerState.aimedWindowId;
      if (id !== last) {
        last = id;
        setAimed(id);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const active = isTouch || pointerLocked;
  const win = aimed && active ? WINDOW_BY_ID.get(aimed) : undefined;
  const cls = `hud-cross${win ? ' is-aiming' : ''}${active ? '' : ' is-idle'}`;

  return (
    <>
      <div className={cls} aria-hidden="true" />
      {win && (
        <div className="hud-chip hud-aim" role="status">
          <span className="hud-aim-name">{lang === 'fr' ? win.nameFr : win.name}</span>
          <span className="hud-aim-hint">
            {isTouch ? t('Appuyez sur Choisir', 'Tap Select') : t("Cliquer pour choisir l'habillage", 'Click to choose a covering')}
          </span>
        </div>
      )}
      {!isTouch && !pointerLocked && <div className="hud-resume">{t('Cliquez pour reprendre la visite', 'Click to resume the tour')}</div>}
    </>
  );
}

// ------------------------------------------------------------------------------------------------
// Bottom-left hint bar (walk mode)
// ------------------------------------------------------------------------------------------------
function HintBar({ isTouch }: { isTouch: boolean }) {
  const t = useT();
  if (isTouch) {
    return (
      <div className="hud-chip hud-hints is-touch">
        {t('Joystick : marcher · glisser à droite : regarder', 'Joystick: walk · drag on the right: look around')}
      </div>
    );
  }
  return (
    <div className="hud-chip hud-hints">
      <span>
        <kbd>WASD</kbd>/<kbd>{t('flèches', 'arrows')}</kbd> {t(': marcher', ': walk')} · <kbd>{t('souris', 'mouse')}</kbd> {t(': regarder', ': look')} ·{' '}
        <kbd>E</kbd> {t('ou clic : choisir une fenêtre', 'or click: choose a window')} · <kbd>1</kbd>
        <kbd>2</kbd>
        <kbd>3</kbd> {t(': étages', ': floors')} · <kbd>Tab</kbd> {t(': maquette', ': dollhouse')}
      </span>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// Selected window badge (window selected, covering panel closed)
// ------------------------------------------------------------------------------------------------
function SelectedBadge({ id, orbit, isTouch }: { id: string; orbit: boolean; isTouch: boolean }) {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const setPanel = useStore((s) => s.setPanel);
  const win = WINDOW_BY_ID.get(id);
  if (!win) return null;
  return (
    <button type="button" className={`hud-chip hud-badge${orbit ? ' is-orbit' : ''}${isTouch ? ' is-touch' : ''}`} onClick={() => setPanel('covering')} title={t("Ouvrir le choix d'habillage", 'Open the covering picker')}>
      <IconPin />
      <span className="hud-badge-name">{lang === 'fr' ? win.nameFr : win.name}</span>
      <span className="hud-badge-cta">{t('Habiller ›', 'Dress ›')}</span>
    </button>
  );
}

// ------------------------------------------------------------------------------------------------
// Help modal
// ------------------------------------------------------------------------------------------------
function HelpModal({ isTouch }: { isTouch: boolean }) {
  const t = useT();
  const setPanel = useStore((s) => s.setPanel);
  const goToStart = useStore((s) => s.goToStart);

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
  const restart = () => {
    setPanel('none');
    goToStart();
  };

  return (
    <div className="hud-help-backdrop" onClick={close} role="presentation">
      <div className="hud-help" role="dialog" aria-modal="true" aria-labelledby="hud-help-title" onClick={(e) => e.stopPropagation()}>
        <div className="hud-help-head">
          <h2 id="hud-help-title">
            <IconHelp />
            {t('Aide', 'Help')}
          </h2>
          <button type="button" className="hud-icon-btn" aria-label={t('Fermer', 'Close')} onClick={close}>
            <IconClose />
          </button>
        </div>
        <p>
          {t(
            "Promenez-vous dans la maison en 3D. Visez une fenêtre et cliquez dessus pour choisir son habillage : rideaux, voilages, stores (à rouleau, romains, cellulaires, vénitiens, verticaux) ou persiennes, puis la couleur, l'ouverture et l'inclinaison. Chaque fenêtre peut être différente, et un choix peut s'appliquer à toute la pièce, à l'étage ou à la maison.",
            'Walk through the house in 3D. Aim at a window and click it to choose its covering: curtains, sheers, blinds (roller, roman, cellular, venetian, vertical) or shutters, then the colour, opening and tilt. Every window can be different, and a choice can be applied to the whole room, floor or house.',
          )}
        </p>
        <p>
          {t(
            'Vos choix sont enregistrés dans ce navigateur. Pour les partager, envoyez le lien du site accompagné d’une capture d’écran.',
            'Your choices are saved in this browser. To share them, send the link to the site along with a screenshot.',
          )}
        </p>

        <h3>{t('Commandes', 'Controls')}</h3>
        {isTouch ? (
          <ul className="hud-help-list">
            <li>
              <kbd>{t('Joystick', 'Joystick')}</kbd>
              <span>{t('marcher (bas à gauche)', 'walk (bottom left)')}</span>
            </li>
            <li>
              <kbd>{t('Glisser', 'Drag')}</kbd>
              <span>{t('regarder autour (moitié droite de l’écran)', 'look around (right half of the screen)')}</span>
            </li>
            <li>
              <kbd>{t('Choisir', 'Select')}</kbd>
              <span>{t('choisir la fenêtre visée', 'pick the window under the crosshair')}</span>
            </li>
            <li>
              <kbd>{t('Courir', 'Run')}</kbd>
              <span>{t('marcher plus vite', 'walk faster')}</span>
            </li>
          </ul>
        ) : (
          <ul className="hud-help-list">
            <li>
              <kbd>WASD</kbd>
              <span>{t('ou flèches : marcher (ZQSD sur AZERTY)', 'or arrows: walk (ZQSD on AZERTY)')}</span>
            </li>
            <li>
              <kbd>{t('Souris', 'Mouse')}</kbd>
              <span>{t('regarder autour · Maj : courir', 'look around · Shift: run')}</span>
            </li>
            <li>
              <kbd>{t('Clic', 'Click')}</kbd>
              <span>{t('ou E : choisir la fenêtre visée', 'or E: pick the window under the crosshair')}</span>
            </li>
            <li>
              <kbd>Échap</kbd>
              <span>{t('libérer la souris (cliquer pour reprendre)', 'free the mouse (click to resume)')}</span>
            </li>
          </ul>
        )}

        <h3>{t('Raccourcis', 'Shortcuts')}</h3>
        <ul className="hud-help-list">
          <li>
            <kbd>1 · 2 · 3</kbd>
            <span>{t('sous-sol · rez-de-chaussée · étage', 'basement · ground floor · upper floor')}</span>
          </li>
          <li>
            <kbd>Tab</kbd>
            <span>{t('visite ⇄ maquette (vue en coupe)', 'walk ⇄ dollhouse (cut-away view)')}</span>
          </li>
          <li>
            <kbd>L</kbd>
            <span>{t('liste des fenêtres', 'window list')}</span>
          </li>
          <li>
            <kbd>M</kbd>
            <span>{t('plan de l’étage', 'floor plan')}</span>
          </li>
          <li>
            <kbd>C</kbd>
            <span>{t('afficher / masquer les plafonds', 'show / hide ceilings')}</span>
          </li>
          <li>
            <kbd>H</kbd>
            <span>{t('cette aide', 'this help')}</span>
          </li>
        </ul>

        <div className="hud-help-actions">
          <button type="button" className="hud-secondary" onClick={restart}>
            <IconRestart />
            {t('Recommencer', 'Back to start')}
          </button>
          <button type="button" className="hud-primary" onClick={close}>
            {t('Fermer', 'Close')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// Root
// ------------------------------------------------------------------------------------------------
export function Hud() {
  const hasStarted = useStore((s) => s.hasStarted);
  const mode = useStore((s) => s.mode);
  const panel = useStore((s) => s.panel);
  const isTouch = useStore((s) => s.isTouch);
  const pointerLocked = useStore((s) => s.pointerLocked);
  const selectedWindowId = useStore((s) => s.selectedWindowId);

  if (!hasStarted) return null;

  const walking = mode === 'walk';
  const showBadge = selectedWindowId !== null && (panel === 'none' || panel === 'map');

  return (
    <>
      <TopBar />
      {mode === 'orbit' && <OrbitRow />}
      {walking && panel === 'none' && <Crosshair isTouch={isTouch} pointerLocked={pointerLocked} />}
      {walking && panel !== 'windows' && <HintBar isTouch={isTouch} />}
      {showBadge && selectedWindowId && <SelectedBadge id={selectedWindowId} orbit={!walking} isTouch={isTouch} />}
      {panel === 'help' && <HelpModal isTouch={isTouch} />}
    </>
  );
}
