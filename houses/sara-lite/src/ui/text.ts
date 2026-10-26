import { COVERING_BY_ID } from '../data/coverings';
import type { CoveringType } from '../data/coverings';
import { LEVEL_ORDER, WINDOWS, windowsByLevel } from '../data/geometry';
import type { WindowInstance } from '../data/geometry';
import type { Lang, LevelFilter } from '../store/useStore';

/** Storey tabs, top floor first. */
export const LEVEL_TABS: LevelFilter[] = ['all', ...[...LEVEL_ORDER].reverse()];

/** Windows grouped by storey → room (computed once, the plans never change). */
export const GROUPS = windowsByLevel();

/** Windows in list order (top floor first, then room). */
export const ORDERED_WINDOWS: WindowInstance[] = GROUPS.flatMap((g) => g.rooms.flatMap((r) => r.windows));

export const windowsIn = (f: LevelFilter) => (f === 'all' ? WINDOWS : WINDOWS.filter((w) => w.level === f));

/** "Salon — fenêtre nord" → "Fenêtre nord" (the room is already the group heading). */
export function shortWindowName(w: WindowInstance, lang: Lang): string {
  const full = lang === 'fr' ? w.nameFr : w.name;
  const i = full.indexOf(' — ');
  const part = i >= 0 ? full.slice(i + 3) : full;
  return part.charAt(0).toUpperCase() + part.slice(1);
}

export const windowName = (w: WindowInstance, lang: Lang) => (lang === 'fr' ? w.nameFr : w.name);

/** Picker / chip label without the parenthetical detail ("Persiennes (volets intérieurs)" → "Persiennes"). */
export function typeName(type: CoveringType, lang: Lang): string {
  const def = COVERING_BY_ID[type];
  const full = lang === 'fr' ? def.nameFr : def.name;
  return full.replace(/\s*\(.*\)\s*$/, '');
}

/** CSS background for a colour swatch / dot (two-tone diagonal when the colour has an accent). */
export const swatchBg = (hex: string, accent?: string) =>
  accent ? `linear-gradient(135deg, ${hex} 0 50%, ${accent} 50% 100%)` : hex;

const CHIP: Record<CoveringType, [string, string]> = {
  none: ['Aucun', 'None'],
  curtains: ['Rideaux', 'Curtains'],
  sheers: ['Voilages', 'Sheers'],
  roller: ['Store à rouleau', 'Roller'],
  roman: ['Store romain', 'Roman'],
  cellular: ['Cellulaire', 'Cellular'],
  venetian: ['Vénitien', 'Venetian'],
  vertical: ['Vertical', 'Vertical'],
  shutters: ['Persiennes', 'Shutters'],
};

/** Short type name for the list chips. */
export const chipName = (type: CoveringType, lang: Lang) => CHIP[type][lang === 'fr' ? 0 : 1];
