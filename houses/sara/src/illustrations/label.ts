import type { ColorOption, CoveringType, WindowCoveringState } from '../data/coverings';

type Lang = 'fr' | 'en';

const NAMES: Record<CoveringType, [string, string]> = {
  none: ['Fenêtre sans habillage', 'Bare window'],
  curtains: ['Rideaux à plis ondulés', 'Ripple-fold curtains'],
  sheers: ['Voilages à plis ondulés', 'Ripple-fold sheers'],
  roller: ['Store à rouleau', 'Roller blind'],
  roman: ['Store romain', 'Roman shade'],
  cellular: ['Store cellulaire', 'Cellular shade'],
  venetian: ['Store vénitien', 'Venetian blind'],
  vertical: ['Store vertical', 'Vertical blind'],
  shutters: ['Volets intérieurs', 'Plantation shutters'],
};

const pct = (v: number) => `${Math.round(v * 100)} %`;
const pctEn = (v: number) => `${Math.round(v * 100)}%`;

/** Accessible description of a drawing, e.g. "Rideaux à plis ondulés, avoine, ouverts à 75 %". */
export function coveringLabel(state: WindowCoveringState, color: ColorOption, lang: Lang): string {
  const [fr, en] = NAMES[state.type];
  if (state.type === 'none') return lang === 'fr' ? fr : en;
  const cName = (lang === 'fr' ? color.nameFr : color.name).toLowerCase();
  const o = state.open;
  const tilt = Math.abs(state.tilt);
  const parts: string[] = [lang === 'fr' ? fr : en, cName];
  switch (state.type) {
    case 'curtains':
    case 'sheers':
      parts.push(lang === 'fr' ? (o <= 0.01 ? 'fermés' : `ouverts à ${pct(o)}`) : o <= 0.01 ? 'closed' : `${pctEn(o)} open`);
      if (state.type === 'curtains' && state.sheer) parts.push(lang === 'fr' ? 'avec voilage' : 'with a sheer');
      break;
    case 'roller':
    case 'roman':
    case 'cellular':
      parts.push(lang === 'fr' ? (o <= 0.01 ? 'baissé' : `relevé à ${pct(o)}`) : o <= 0.01 ? 'lowered' : `${pctEn(o)} raised`);
      break;
    case 'venetian':
      parts.push(lang === 'fr' ? (o <= 0.01 ? 'baissé' : `relevé à ${pct(o)}`) : o <= 0.01 ? 'lowered' : `${pctEn(o)} raised`);
      parts.push(lang === 'fr' ? `lames inclinées à ${pct(tilt)}` : `slats ${pctEn(tilt)} closed`);
      break;
    case 'vertical':
      parts.push(lang === 'fr' ? (o <= 0.01 ? 'fermé' : `tiré à ${pct(o)}`) : o <= 0.01 ? 'closed' : `${pctEn(o)} drawn`);
      parts.push(lang === 'fr' ? `lames inclinées à ${pct(tilt)}` : `vanes ${pctEn(tilt)} closed`);
      break;
    case 'shutters':
      parts.push(lang === 'fr' ? (o <= 0.01 ? 'panneaux fermés' : `panneaux ouverts à ${pct(o)}`) : o <= 0.01 ? 'panels closed' : `panels ${pctEn(o)} open`);
      parts.push(lang === 'fr' ? `lames inclinées à ${pct(tilt)}` : `louvres ${pctEn(tilt)} closed`);
      break;
  }
  return parts.join(', ');
}
