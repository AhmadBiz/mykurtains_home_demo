/** Centred spinner shown while the UI chunk loads (Suspense fallback). */
import { useT } from '../store/useStore';
import './hud.css';

export function LoadingFallback() {
  const t = useT();
  return (
    <div className="lf" role="status" aria-live="polite">
      <div className="lf-spinner" aria-hidden="true" />
      <span>{t('Chargement…', 'Loading…')}</span>
    </div>
  );
}
