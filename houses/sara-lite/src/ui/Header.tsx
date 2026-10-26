import { useEffect } from 'react';
import { HOUSE_META } from '../data/house';
import { LEVEL_BY_ID, WINDOW_BY_ID } from '../data/geometry';
import { useStore, useT } from '../store/useStore';
import type { Lang, LevelFilter } from '../store/useStore';
import { LEVEL_TABS } from './text';

const SHOW_BACK = import.meta.env.BASE_URL !== '/';

/** House name and address, storey tabs (segmented pill control) and the FR/EN switch. */
export function Header() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const levelFilter = useStore((s) => s.levelFilter);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const pickLevel = (l: LevelFilter) => {
    const s = useStore.getState();
    const sel = s.selectedWindowId ? WINDOW_BY_ID.get(s.selectedWindowId) : undefined;
    // Leaving the selected window's storey returns the panel to the overview.
    if (sel && l !== 'all' && sel.level !== l) s.selectWindow(null);
    s.setLevelFilter(l);
  };

  const levelLabel = (l: LevelFilter) => (l === 'all' ? t('Tout', 'All') : lang === 'fr' ? LEVEL_BY_ID[l].nameFr : LEVEL_BY_ID[l].name);

  return (
    <header className="hd">
      <div className="hd-id">
        {SHOW_BACK && (
          <a className="hd-back" href="../">
            <span aria-hidden="true">←</span> {t('Toutes les maisons', 'All houses')}
          </a>
        )}
        <h1 className="hd-name">{lang === 'fr' ? HOUSE_META.name : HOUSE_META.nameEn}</h1>
        <p className="hd-addr">{HOUSE_META.address}</p>
      </div>
      <div className="hd-ctrl">
        <div className="seg hd-tabs" role="group" aria-label={t('Étage affiché', 'Storey shown')}>
          {LEVEL_TABS.map((l) => (
            <button key={l} type="button" className="seg-btn" aria-pressed={levelFilter === l} onClick={() => pickLevel(l)}>
              {levelLabel(l)}
            </button>
          ))}
        </div>
        <div className="seg hd-lang" role="group" aria-label={t('Langue', 'Language')}>
          {(['fr', 'en'] as Lang[]).map((l) => (
            <button
              key={l}
              type="button"
              className="seg-btn"
              aria-pressed={lang === l}
              lang={l}
              aria-label={l === 'fr' ? 'Français' : 'English'}
              onClick={() => setLang(l)}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
