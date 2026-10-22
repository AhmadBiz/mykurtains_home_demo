/**
 * Catalogue of window coverings the visitor can choose for each window.
 */
export type CoveringType =
  | 'none'
  | 'curtains'
  | 'sheers'
  | 'roller'
  | 'roman'
  | 'cellular'
  | 'venetian'
  | 'vertical'
  | 'shutters';

export interface ColorOption {
  id: string;
  name: string;
  nameFr: string;
  hex: string;
  /** Optional second hex for two-tone looks (e.g. wood grain highlight). */
  accent?: string;
  /** Material hints for the 3D fabric / slat. */
  roughness?: number;
  metalness?: number;
  /** 0..1, how much light passes (sheers / light-filtering rollers). */
  translucency?: number;
}

export interface CoveringTypeDef {
  id: CoveringType;
  name: string;
  nameFr: string;
  description: string;
  descriptionFr: string;
  /** Emoji-ish glyph for the picker cards. */
  glyph: string;
  /** Whether `open` (0 = fully closed/lowered, 1 = fully open/raised/drawn back) applies. */
  hasOpen: boolean;
  openLabel: string;
  openLabelFr: string;
  /** Whether `tilt` (-1..1) applies (slats / louvres / vanes). */
  hasTilt: boolean;
  /** Whether a sheer layer can be added behind (curtains only). */
  hasSheerLayer: boolean;
  colors: ColorOption[];
  defaultColor: string;
  defaultOpen: number;
  defaultTilt: number;
}

export interface WindowCoveringState {
  type: CoveringType;
  color: string;
  /** 0 = closed / lowered / drawn, 1 = fully open / raised / pulled back. */
  open: number;
  /** -1..1 slat tilt; 0 = horizontal (open), ±1 = closed. Only for slatted types. */
  tilt: number;
  /** Curtains: add a sheer layer behind the drapes. */
  sheer: boolean;
}

const FABRICS: ColorOption[] = [
  { id: 'ivory', name: 'Ivory linen', nameFr: 'Lin ivoire', hex: '#efe6d3', roughness: 0.95 },
  { id: 'oat', name: 'Oatmeal', nameFr: 'Avoine', hex: '#d7c8ab', roughness: 0.95 },
  { id: 'charcoal', name: 'Charcoal', nameFr: 'Anthracite', hex: '#3c3f45', roughness: 0.9 },
  { id: 'navy', name: 'Navy velvet', nameFr: 'Velours marine', hex: '#1f2a4a', roughness: 0.7 },
  { id: 'sage', name: 'Sage', nameFr: 'Sauge', hex: '#8fa58a', roughness: 0.95 },
  { id: 'terracotta', name: 'Terracotta', nameFr: 'Terracotta', hex: '#b9664b', roughness: 0.9 },
  { id: 'blush', name: 'Blush', nameFr: 'Rose poudré', hex: '#d9b3a8', roughness: 0.95 },
  { id: 'forest', name: 'Forest green velvet', nameFr: 'Velours vert forêt', hex: '#2f4a3a', roughness: 0.65 },
  { id: 'mustard', name: 'Mustard', nameFr: 'Moutarde', hex: '#c9a13b', roughness: 0.9 },
];

const SHEER_COLORS: ColorOption[] = [
  { id: 'white', name: 'White voile', nameFr: 'Voile blanc', hex: '#ffffff', translucency: 0.6 },
  { id: 'ivory', name: 'Ivory voile', nameFr: 'Voile ivoire', hex: '#f6efe0', translucency: 0.6 },
  { id: 'grey', name: 'Smoke grey', nameFr: 'Gris fumée', hex: '#c9ccd2', translucency: 0.5 },
  { id: 'linen', name: 'Natural linen', nameFr: 'Lin naturel', hex: '#e0d4bb', translucency: 0.45 },
];

const ROLLER_COLORS: ColorOption[] = [
  { id: 'white-lf', name: 'White · light-filtering', nameFr: 'Blanc · tamisant', hex: '#f4f4f2', translucency: 0.35 },
  { id: 'white-bo', name: 'White · blackout', nameFr: 'Blanc · opaque', hex: '#f1f1ee', translucency: 0 },
  { id: 'grey-lf', name: 'Grey · light-filtering', nameFr: 'Gris · tamisant', hex: '#b8bcc2', translucency: 0.3 },
  { id: 'graphite-bo', name: 'Graphite · blackout', nameFr: 'Graphite · opaque', hex: '#45484d', translucency: 0 },
  { id: 'sand', name: 'Sand screen', nameFr: 'Toile sable', hex: '#d6c7a6', translucency: 0.4 },
  { id: 'black-screen', name: 'Black solar screen', nameFr: 'Toile solaire noire', hex: '#2b2d31', translucency: 0.3 },
];

const ROMAN_COLORS: ColorOption[] = [
  { id: 'natural', name: 'Natural linen', nameFr: 'Lin naturel', hex: '#ddd0b6', roughness: 0.95 },
  { id: 'white', name: 'Soft white', nameFr: 'Blanc doux', hex: '#f3efe6', roughness: 0.95 },
  { id: 'slate', name: 'Slate', nameFr: 'Ardoise', hex: '#5b6670', roughness: 0.9 },
  { id: 'olive', name: 'Olive', nameFr: 'Olive', hex: '#7f8a5a', roughness: 0.95 },
  { id: 'indigo', name: 'Indigo', nameFr: 'Indigo', hex: '#2e3b63', roughness: 0.9 },
  { id: 'stripe', name: 'Ticking stripe', nameFr: 'Rayure coutil', hex: '#e9e4d8', accent: '#3c4a6b', roughness: 0.95 },
];

const CELLULAR_COLORS: ColorOption[] = [
  { id: 'white', name: 'Bright white', nameFr: 'Blanc éclatant', hex: '#fbfbf9', translucency: 0.4 },
  { id: 'cream', name: 'Cream', nameFr: 'Crème', hex: '#f0e8d4', translucency: 0.4 },
  { id: 'dove', name: 'Dove grey', nameFr: 'Gris tourterelle', hex: '#cdd0d4', translucency: 0.3 },
  { id: 'espresso', name: 'Espresso · blackout', nameFr: 'Espresso · opaque', hex: '#4a3a30', translucency: 0 },
];

const VENETIAN_COLORS: ColorOption[] = [
  { id: 'white-alu', name: 'White aluminium', nameFr: 'Aluminium blanc', hex: '#f2f2f0', roughness: 0.5, metalness: 0.2 },
  { id: 'silver', name: 'Brushed silver', nameFr: 'Argent brossé', hex: '#b9bcc1', roughness: 0.35, metalness: 0.6 },
  { id: 'black', name: 'Matte black', nameFr: 'Noir mat', hex: '#2a2b2e', roughness: 0.7, metalness: 0.1 },
  { id: 'oak', name: 'Natural oak wood', nameFr: 'Bois de chêne', hex: '#c9a26b', accent: '#a57f4b', roughness: 0.8 },
  { id: 'walnut', name: 'Walnut wood', nameFr: 'Bois de noyer', hex: '#6b4a32', accent: '#4e3524', roughness: 0.8 },
  { id: 'white-wood', name: 'White painted wood', nameFr: 'Bois peint blanc', hex: '#f6f3ec', roughness: 0.8 },
];

const VERTICAL_COLORS: ColorOption[] = [
  { id: 'white', name: 'White PVC', nameFr: 'PVC blanc', hex: '#f4f4f1', roughness: 0.6 },
  { id: 'ivory-fabric', name: 'Ivory fabric', nameFr: 'Tissu ivoire', hex: '#ece3cf', roughness: 0.95 },
  { id: 'grey-fabric', name: 'Grey fabric', nameFr: 'Tissu gris', hex: '#9fa3a9', roughness: 0.95 },
  { id: 'charcoal', name: 'Charcoal', nameFr: 'Anthracite', hex: '#44474c', roughness: 0.8 },
];

const SHUTTER_COLORS: ColorOption[] = [
  { id: 'white', name: 'Classic white', nameFr: 'Blanc classique', hex: '#f7f5f0', roughness: 0.6 },
  { id: 'cream', name: 'Antique cream', nameFr: 'Crème antique', hex: '#efe6d2', roughness: 0.6 },
  { id: 'grey', name: 'Pebble grey', nameFr: 'Gris galet', hex: '#a9adb2', roughness: 0.6 },
  { id: 'oak', name: 'Stained oak', nameFr: 'Chêne teint', hex: '#b58b57', accent: '#8f6a3f', roughness: 0.75 },
  { id: 'black', name: 'Black', nameFr: 'Noir', hex: '#232427', roughness: 0.6 },
];

export const COVERING_TYPES: CoveringTypeDef[] = [
  {
    id: 'none', name: 'No covering', nameFr: 'Aucun habillage', glyph: '▢',
    description: 'Bare window, full view.', descriptionFr: 'Fenêtre nue, vue dégagée.',
    hasOpen: false, openLabel: '', openLabelFr: '', hasTilt: false, hasSheerLayer: false,
    colors: [{ id: 'none', name: '—', nameFr: '—', hex: '#ffffff' }], defaultColor: 'none', defaultOpen: 1, defaultTilt: 0,
  },
  {
    id: 'curtains', name: 'Curtains (drapes)', nameFr: 'Rideaux', glyph: '🪟',
    description: 'Two pleated fabric panels on a rod. Slide open or closed.', descriptionFr: 'Deux panneaux de tissu plissé sur tringle. Ouvrir ou fermer.',
    hasOpen: true, openLabel: 'Drawn back', openLabelFr: 'Ouverture', hasTilt: false, hasSheerLayer: true,
    colors: FABRICS, defaultColor: 'ivory', defaultOpen: 0.7, defaultTilt: 0,
  },
  {
    id: 'sheers', name: 'Sheers (voile)', nameFr: 'Voilages', glyph: '〰',
    description: 'Light, translucent panels that soften the light.', descriptionFr: 'Panneaux légers et translucides qui tamisent la lumière.',
    hasOpen: true, openLabel: 'Drawn back', openLabelFr: 'Ouverture', hasTilt: false, hasSheerLayer: false,
    colors: SHEER_COLORS, defaultColor: 'white', defaultOpen: 0.1, defaultTilt: 0,
  },
  {
    id: 'roller', name: 'Roller blind', nameFr: 'Store à rouleau', glyph: '▬',
    description: 'A flat fabric that rolls up into a tube at the top.', descriptionFr: 'Toile plate qui s’enroule dans un tube au sommet.',
    hasOpen: true, openLabel: 'Raised', openLabelFr: 'Relevé', hasTilt: false, hasSheerLayer: false,
    colors: ROLLER_COLORS, defaultColor: 'white-lf', defaultOpen: 0.5, defaultTilt: 0,
  },
  {
    id: 'roman', name: 'Roman shade', nameFr: 'Store romain', glyph: '≡',
    description: 'Fabric that folds into soft horizontal pleats as it rises.', descriptionFr: 'Tissu qui se replie en plis horizontaux en remontant.',
    hasOpen: true, openLabel: 'Raised', openLabelFr: 'Relevé', hasTilt: false, hasSheerLayer: false,
    colors: ROMAN_COLORS, defaultColor: 'natural', defaultOpen: 0.4, defaultTilt: 0,
  },
  {
    id: 'cellular', name: 'Cellular (honeycomb) shade', nameFr: 'Store cellulaire', glyph: '⬡',
    description: 'Insulating honeycomb pleats, compact when raised.', descriptionFr: 'Plis alvéolés isolants, compacts une fois relevés.',
    hasOpen: true, openLabel: 'Raised', openLabelFr: 'Relevé', hasTilt: false, hasSheerLayer: false,
    colors: CELLULAR_COLORS, defaultColor: 'white', defaultOpen: 0.5, defaultTilt: 0,
  },
  {
    id: 'venetian', name: 'Venetian blind', nameFr: 'Store vénitien', glyph: '☰',
    description: 'Horizontal slats you can tilt or raise.', descriptionFr: 'Lamelles horizontales que l’on incline ou relève.',
    hasOpen: true, openLabel: 'Raised', openLabelFr: 'Relevé', hasTilt: true, hasSheerLayer: false,
    colors: VENETIAN_COLORS, defaultColor: 'white-alu', defaultOpen: 0, defaultTilt: 0.3,
  },
  {
    id: 'vertical', name: 'Vertical blind', nameFr: 'Store vertical', glyph: '|||',
    description: 'Vertical vanes that rotate and draw to one side. Ideal for patio doors.', descriptionFr: 'Lames verticales qui pivotent et se tirent sur le côté. Idéal pour les portes-patio.',
    hasOpen: true, openLabel: 'Drawn back', openLabelFr: 'Ouverture', hasTilt: true, hasSheerLayer: false,
    colors: VERTICAL_COLORS, defaultColor: 'white', defaultOpen: 0, defaultTilt: 0.4,
  },
  {
    id: 'shutters', name: 'Plantation shutters', nameFr: 'Persiennes (volets intérieurs)', glyph: '▥',
    description: 'Hinged louvred panels. Tilt the louvres or swing the panels open.', descriptionFr: 'Panneaux à lames articulés. Inclinez les lames ou ouvrez les panneaux.',
    hasOpen: true, openLabel: 'Panels swung open', openLabelFr: 'Panneaux ouverts', hasTilt: true, hasSheerLayer: false,
    colors: SHUTTER_COLORS, defaultColor: 'white', defaultOpen: 0, defaultTilt: 0.2,
  },
];

export const COVERING_BY_ID: Record<CoveringType, CoveringTypeDef> = Object.fromEntries(
  COVERING_TYPES.map((t) => [t.id, t]),
) as Record<CoveringType, CoveringTypeDef>;

export function defaultStateFor(type: CoveringType): WindowCoveringState {
  const def = COVERING_BY_ID[type];
  return { type, color: def.defaultColor, open: def.defaultOpen, tilt: def.defaultTilt, sheer: false };
}

export function colorOption(state: WindowCoveringState): ColorOption {
  const def = COVERING_BY_ID[state.type];
  return def.colors.find((c) => c.id === state.color) ?? def.colors[0];
}

/**
 * Initial look of the house when it is first opened — a furnished, lived-in default so the
 * visitor immediately sees a variety of coverings. Keys are window ids from house.ts.
 */
export const DEFAULT_COVERINGS: Record<string, WindowCoveringState> = {
  // ground floor
  'w-salon-n': { type: 'curtains', color: 'oat', open: 0.75, tilt: 0, sheer: true },
  'w-sam-n': { type: 'curtains', color: 'oat', open: 0.75, tilt: 0, sheer: true },
  'w-sam-e': { type: 'sheers', color: 'white', open: 0.15, tilt: 0, sheer: false },
  'w-sam-s': { type: 'sheers', color: 'white', open: 0.15, tilt: 0, sheer: false },
  'd-patio': { type: 'vertical', color: 'ivory-fabric', open: 0.3, tilt: 0.5, sheer: false },
  'w-cuisine-s': { type: 'roller', color: 'sand', open: 0.6, tilt: 0, sheer: false },
  'w-sdeau-n': { type: 'venetian', color: 'white-alu', open: 0, tilt: 0.6, sheer: false },
  'w-escalier': { type: 'none', color: 'none', open: 1, tilt: 0, sheer: false },
  'w-garage-s': { type: 'none', color: 'none', open: 1, tilt: 0, sheer: false },
  // upper floor
  'w-ch1-e': { type: 'curtains', color: 'navy', open: 0.65, tilt: 0, sheer: true },
  'w-ch1-n': { type: 'curtains', color: 'navy', open: 0.65, tilt: 0, sheer: true },
  'w-ch1-s': { type: 'curtains', color: 'navy', open: 0.65, tilt: 0, sheer: true },
  'w-walkin1-n': { type: 'cellular', color: 'cream', open: 0.3, tilt: 0, sheer: false },
  'w-sdb1-e': { type: 'roller', color: 'white-lf', open: 0.4, tilt: 0, sheer: false },
  'w-sdb1-s': { type: 'roller', color: 'white-lf', open: 0.4, tilt: 0, sheer: false },
  'w-ch2-e': { type: 'roman', color: 'olive', open: 0.45, tilt: 0, sheer: false },
  'w-walkin2-s': { type: 'cellular', color: 'white', open: 0.5, tilt: 0, sheer: false },
  'w-ch3-s': { type: 'shutters', color: 'white', open: 0, tilt: 0.25, sheer: false },
  'w-ch3-w': { type: 'shutters', color: 'white', open: 0, tilt: 0.25, sheer: false },
  'w-ch4-w': { type: 'curtains', color: 'sage', open: 0.6, tilt: 0, sheer: false },
  'w-sdb2-n': { type: 'venetian', color: 'white-wood', open: 0, tilt: 0.5, sheer: false },
  // basement
  'w-ch5-n': { type: 'cellular', color: 'dove', open: 0.4, tilt: 0, sheer: false },
  'w-ch6-n': { type: 'roller', color: 'graphite-bo', open: 0.5, tilt: 0, sheer: false },
  'w-ch6-e': { type: 'roller', color: 'graphite-bo', open: 0.5, tilt: 0, sheer: false },
  'w-familiale-e': { type: 'venetian', color: 'oak', open: 0, tilt: 0.3, sheer: false },
  'w-familiale-s': { type: 'venetian', color: 'oak', open: 0, tilt: 0.3, sheer: false },
  'w-sdb3-n': { type: 'roller', color: 'white-bo', open: 0.3, tilt: 0, sheer: false },
};
