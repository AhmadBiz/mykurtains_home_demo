import type { ReactNode } from 'react';
import type { CoveringType } from '../data/coverings';

export interface CoveringTypeIconProps {
  type: CoveringType;
  size?: number;
}

/* 24 × 24 line icons: 1.5 px strokes in currentColor with round caps and joins (the reference's chip-icon style). */
const ICONS: Record<CoveringType, ReactNode> = {
  // Bare window: frame, mullion and transom, a glint.
  none: (
    <>
      <rect x="4.5" y="3.5" width="15" height="17" rx="1.5" />
      <path d="M12 3.5v17M4.5 12h15" />
      <path d="M7 9l2.5-2.5" />
    </>
  ),
  // Ceiling track, two wave-fold panels drawn back.
  curtains: (
    <>
      <path d="M3 3.5h18" />
      <path d="M5 3.5v16.5q1.25 1 2.5 0t2.5 0V3.5" />
      <path d="M14 3.5v16.5q1.25 1 2.5 0t2.5 0V3.5" />
      <path d="M7.5 6v12M16.5 6v12" />
    </>
  ),
  // Ceiling track, one voile with soft S-folds.
  sheers: (
    <>
      <path d="M3 3.5h18" />
      <path d="M8 6c-1.2 3 1.2 6 0 9s.8 4 0 5" />
      <path d="M12 6c-1.2 3 1.2 6 0 9s.8 4 0 5" />
      <path d="M16 6c-1.2 3 1.2 6 0 9s.8 4 0 5" />
      <path d="M5 3.5v16.5M19 3.5v16.5" />
    </>
  ),
  // Cassette, flat fabric half down, bottom bar, bead chain.
  roller: (
    <>
      <rect x="3.5" y="3.5" width="17" height="3" rx="1.5" />
      <path d="M5.5 6.5v8.5h13V6.5" />
      <path d="M5 15h14" />
      <path d="M20.5 6.5v9" strokeDasharray="0 2.2" />
    </>
  ),
  // Headrail, flat fabric, stacked soft folds.
  roman: (
    <>
      <path d="M3.5 4h17" />
      <path d="M5.5 4v8M18.5 4v8" />
      <path d="M5.5 12q6.5 2.6 13 0" />
      <path d="M5.5 12q-.9 1.6 0 3q6.5 2.6 13 0q.9-1.6 0-3" />
      <path d="M5.5 15q-.9 1.6 0 3q6.5 2.6 13 0q.9-1.6 0-3" />
    </>
  ),
  // Headrail and honeycomb pleats (zig-zag edges).
  cellular: (
    <>
      <path d="M3.5 4h17" />
      <path d="M5.5 4l-1 2.25 1 2.25-1 2.25 1 2.25-1 2.25 1 2.25" />
      <path d="M18.5 4l1 2.25-1 2.25 1 2.25-1 2.25 1 2.25-1 2.25" />
      <path d="M5.5 8.5h13M5.5 13h13M5.5 17.5h13" />
    </>
  ),
  // Headrail, horizontal slats, tilt wand.
  venetian: (
    <>
      <path d="M3.5 4h17" />
      <path d="M5 7.5h14M5 11h14M5 14.5h14M5 18h14" />
      <path d="M8 4v14M16 4v14" opacity="0.55" />
    </>
  ),
  // Headrail and hanging vanes.
  vertical: (
    <>
      <path d="M3.5 4h17" />
      <rect x="5" y="6.5" width="2.5" height="13.5" rx="1" />
      <rect x="10.75" y="6.5" width="2.5" height="13.5" rx="1" />
      <rect x="16.5" y="6.5" width="2.5" height="13.5" rx="1" />
    </>
  ),
  // Two louvred panels in a frame.
  shutters: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" />
      <path d="M12 3.5v17" />
      <path d="M6 7.5h3.5M6 10.5h3.5M6 13.5h3.5M6 16.5h3.5M14.5 7.5H18M14.5 10.5H18M14.5 13.5H18M14.5 16.5H18" />
    </>
  ),
};

/** Line icon for a covering type (picker cards, chips). Decorative: pair it with a visible label. */
export function CoveringTypeIcon({ type, size = 24 }: CoveringTypeIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[type]}
    </svg>
  );
}
