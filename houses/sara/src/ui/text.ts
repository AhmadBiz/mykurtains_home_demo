import { COVERING_BY_ID } from '../data/coverings';
import { HOUSE_META } from '../data/house';
import type { LevelId } from '../data/types';
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

/**
 * One short name per covering type, used everywhere a type is named in a sentence or a chip (list rows, model
 * chips). The scene should import this table (`shortTypeName`) instead of keeping its own.
 */
export const SHORT_TYPE_NAMES: Record<CoveringType, [fr: string, en: string]> = {
  none: ['Aucun', 'None'],
  curtains: ['Rideaux', 'Curtains'],
  sheers: ['Voilages', 'Sheers'],
  roller: ['Store à rouleau', 'Roller shade'],
  roman: ['Store romain', 'Roman shade'],
  cellular: ['Store cellulaire', 'Cellular shade'],
  venetian: ['Store vénitien', 'Venetian blind'],
  vertical: ['Store vertical', 'Vertical blind'],
  shutters: ['Volets intérieurs', 'Interior shutters'],
};

/** Short type name for the list chips (and the model chips). */
export const chipName = (type: CoveringType, lang: Lang) => SHORT_TYPE_NAMES[type][lang === 'fr' ? 0 : 1];
export const shortTypeName = chipName;

/** One-word labels for the compact type picker (the full name heads the note under it). */
const PICKER: Record<CoveringType, [string, string]> = {
  none: ['Aucun', 'None'],
  curtains: ['Rideaux', 'Curtains'],
  sheers: ['Voilages', 'Sheers'],
  roller: ['Rouleau', 'Roller'],
  roman: ['Romain', 'Roman'],
  cellular: ['Cellulaire', 'Cellular'],
  venetian: ['Vénitien', 'Venetian'],
  vertical: ['Vertical', 'Vertical'],
  shutters: ['Volets', 'Shutters'],
};
export const pickerName = (type: CoveringType, lang: Lang) => PICKER[type][lang === 'fr' ? 0 : 1];

/**
 * Full catalogue name without its parenthetical ("Rideaux à plis ondulés"). Falls back to the short name when the
 * catalogue name does not contain the picker word (e.g. "Persiennes" for the type the picker calls "Volets").
 */
export function fullTypeName(type: CoveringType, lang: Lang): string {
  const def = COVERING_BY_ID[type];
  const full = (lang === 'fr' ? def.nameFr : def.name).replace(/\s*\(.*\)\s*$/, '');
  return full.toLowerCase().includes(pickerName(type, lang).toLowerCase()) ? full : chipName(type, lang);
}

/** Short storey names for tight spots (the window stepper). */
export const LEVEL_SHORT: Record<LevelId, [string, string]> = {
  upper: ['Étage', 'Upper'],
  ground: ['RDC', 'Ground'],
  basement: ['Sous-sol', 'Basement'],
};

/** French address (Québec style) until HOUSE_META carries `addressFr`. */
const ADDRESS_FR_FALLBACK = '6274, boul. des Rossignols, Laval (Québec) H7L 5V6';

/**
 * Address split so the country can be dropped on narrow screens; the postal code never breaks
 * ("H7L 5V6" joined with a no-break space).
 */
export function addressParts(lang: Lang): { main: string; country: string } {
  const meta = HOUSE_META as typeof HOUSE_META & { addressFr?: string };
  const raw = lang === 'fr' ? meta.addressFr ?? ADDRESS_FR_FALLBACK : meta.address;
  const nb = raw.replace(/\b([A-Z]\d[A-Z]) (\d[A-Z]\d)\b/, '$1\u00a0$2');
  const m = nb.match(/^(.*?)(,\s*Canada)$/);
  return m ? { main: m[1], country: m[2] } : { main: nb, country: '' };
}

/** Storey ⇄ URL hash. */
export const LEVEL_HASH: Record<LevelId, string> = { upper: 'etage', ground: 'rez', basement: 'sous-sol' };
