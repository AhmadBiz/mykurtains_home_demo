/**
 * Full-screen start screen shown while !store.hasStarted: title, description, the three control
 * hints, "Enter the house" (walk mode + pointer lock on desktop), "Dollhouse view" (orbit mode)
 * and a FR/EN toggle. Hidden entirely once the visit has started.
 */
import { useStore, useT } from '../store/useStore';
import { HOUSE_META } from '../data/house';
import { IconDollhouse, IconHouse, IconKeys, IconMouse, IconTarget, IconTouch, IconWalk } from './Hud';
import './hud.css';

export function IntroOverlay() {
  const t = useT();
  const hasStarted = useStore((s) => s.hasStarted);
  const isTouch = useStore((s) => s.isTouch);
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const setHasStarted = useStore((s) => s.setHasStarted);
  const setMode = useStore((s) => s.setMode);

  if (hasStarted) return null;

  const enter = () => {
    setMode('walk');
    setHasStarted(true);
    if (!isTouch) {
      const canvas = document.querySelector('canvas');
      if (canvas) Promise.resolve(canvas.requestPointerLock()).catch(() => undefined);
    }
  };
  const dollhouse = () => {
    setHasStarted(true);
    setMode('orbit');
  };

  return (
    <div className="intro">
      <button
        type="button"
        className="hud-btn hud-lang intro-lang"
        aria-label={t('Passer en anglais', 'Switch to French')}
        onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}
      >
        {lang === 'fr' ? <b>FR</b> : 'FR'}
        <span>/</span>
        {lang === 'en' ? <b>EN</b> : 'EN'}
      </button>

      <div className="intro-card">
        <div className="intro-glyph">
          <IconHouse />
        </div>
        <p className="intro-eyebrow">
          {import.meta.env.BASE_URL !== '/' && (
            <a className="intro-back" href="/">
              ← {t('Toutes les maisons', 'All houses')}
            </a>
          )}
          {t('Visite immersive', 'Immersive tour')}
        </p>
        <h1>
          {HOUSE_META.name}
          <small>{HOUSE_META.address}</small>
        </h1>
        <p className="intro-desc">
          {t(
            'Visitez la maison en 3D et choisissez l’habillage de chaque fenêtre : rideaux, voilages, stores à rouleau, romains, cellulaires, vénitiens, verticaux ou persiennes, dans la couleur de votre choix.',
            'Tour the house in 3D and choose the covering for every window: curtains, sheers, roller, roman, cellular, venetian or vertical blinds, or shutters, in the colour of your choice.',
          )}
        </p>

        <div className="intro-hints">
          <div className="intro-hint">
            {isTouch ? <IconWalk /> : <IconKeys />}
            <div>
              <b>{t('Marcher', 'Walk')}</b>
              <span>{isTouch ? t('Joystick en bas à gauche', 'Joystick, bottom left') : t('WASD ou flèches · Maj : courir', 'WASD or arrows · Shift: run')}</span>
            </div>
          </div>
          <div className="intro-hint">
            {isTouch ? <IconTouch /> : <IconMouse />}
            <div>
              <b>{t('Regarder', 'Look')}</b>
              <span>{isTouch ? t('Glisser sur la moitié droite', 'Drag on the right half') : t('Déplacer la souris', 'Move the mouse')}</span>
            </div>
          </div>
          <div className="intro-hint">
            <IconTarget />
            <div>
              <b>{t('Choisir', 'Select')}</b>
              <span>{isTouch ? t('Visez une fenêtre, puis « Choisir »', 'Aim at a window, then tap “Select”') : t('Visez une fenêtre, cliquez ou E', 'Aim at a window, click or press E')}</span>
            </div>
          </div>
        </div>

        <div className="intro-actions">
          <button type="button" className="hud-primary" onClick={enter} autoFocus>
            <IconWalk />
            {t('Entrer dans la maison', 'Enter the house')}
          </button>
          <button type="button" className="hud-secondary" onClick={dollhouse}>
            <IconDollhouse />
            {t('Vue maquette', 'Dollhouse view')}
          </button>
        </div>
        <p className="intro-foot">
          {t('Vos choix sont enregistrés dans ce navigateur · Aide : touche H', 'Your choices are saved in this browser · Help: press H')}
        </p>
      </div>
    </div>
  );
}
