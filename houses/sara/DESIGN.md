# Maison Sara — lightweight model (v2)

The client found the photoreal WebGL walkthrough too heavy ("it takes too long to open and it's not optimal") and
asked for something as clean and simple as the hero scene of https://intellikrib.com/en, but for the home. This app
replaces it.

## Goals and budgets

* Opens instantly on a phone: **no WebGL, no textures, no raster images**. The model is HTML + CSS 3D transforms
  (`transform-style: preserve-3d`) and SVG, like the reference.
* Budgets (production build, gzip): JS ≤ 120 KB, CSS ≤ 25 KB, fonts: Geist variable latin subset only.
  Largest Contentful Paint < 1.5 s on a mid phone; 60 fps rotation; DOM of the model ≤ 300 nodes.
* Visual language of the reference (see `reference.png` and the CSS tokens in `src/styles/tokens.css`):
  warm black `--bg`/`--surface`, bone ink `--ink`, quiet `--ink-2/3`, hairline `--line`, copper `--accent`;
  glass planes with hairline edges and soft diagonal sheen; pill chips with a 1 px line and an icon; Geist type;
  slow sway, light pulses travelling along thin copper lines, a pause button; generous whitespace; nothing heavy.
* Every window of the plans is visible and clickable on the model; choosing a covering shows it immediately in a
  large, accurate front-view drawing of that window.
* The installation standard (MyKurtains): curtains and sheers ALWAYS hang from a ceiling-mounted track with ripple
  fold panels (uniform S-wave from the track to the hem, floor length unless `hemAbove` says something fixed stands
  under the window, compact even stack-back at each side, double track when a sheer is added).

## Files and ownership

| Area | Files | Owner |
|---|---|---|
| Data (read-only for builders) | `src/data/types.ts`, `house.ts` (plans in feet → metres, `HOUSE_META`), `coverings.ts` (catalogue + defaults), `geometry.ts` (`WINDOWS`, `WINDOW_BY_ID`, `windowsByLevel()`, `LEVEL_BY_ID`, `LEVEL_ORDER`, `WALL_GEOMS`, `HOUSE_BOUNDS`, `roomAt`, `stackBackFor`) | lead |
| Store | `src/store/useStore.ts` (`useStore`, `useCovering(id)`, `useT()`, `prefersReducedMotion()`, `window.__house` debug API) | lead |
| Tokens / shell | `src/styles/tokens.css`, `src/main.tsx`, `src/App.tsx` | lead |
| Glass model | `src/scene/**` — exports `HouseModel` | scene builder |
| Covering drawings | `src/illustrations/**` — exports `CoveringIllustration`, `paneStyle`, `CoveringTypeIcon` | illustrations builder |
| Page UI | `src/ui/**` — exports `Header`, `SidePanel`; `layout.css` | UI builder |

## Data model recap (metres)

X runs from the street (front, small X) to the rear; Z from the plan's north (small Z) to its south; Y is up and the
ground floor is Y = 0 (basement −2.74, upper +3.05). Walls are axis-aligned centre-line segments `a → b` with
`thickness`, `baseY`, `height`, `exterior`. A `WindowInstance` has `center {x,y,z}`, `inward` (unit XZ vector into the
room), `width`, `height`, `sill` (above its floor), `ceiling` (floor-to-ceiling), `hemAbove` (0 = floor length),
`isDoor` (patio door), `frosted`, `room`, `level`, `wall`, `opening.at` (distance from `wall.a` to the centre).
Covering state: `{ type, color, open 0..1 (1 = raised / drawn back), tilt -1..1, sheer }`; `colorOption(state)` gives
`{hex, accent?, translucency?, roughness?, metalness?}`.

## Interaction model

* Storey tabs (Tout / Étage / Rez-de-chaussée / Sous-sol) drive `levelFilter`. 'all' shows the whole house slightly
  exploded; a single storey brings it forward, fades the others and labels its rooms and windows.
* Hover a window (model or list) → `hoveredWindowId`; both highlight. Click → `selectWindow(id)` (also focuses its
  storey). The side panel then shows the drawing and the controls; Escape / back returns to the overview.
* Drag to turn the house (and the arrow buttons); it settles back into a slow sway when idle. Pause button stops all
  motion (forced off by `prefers-reduced-motion`).
* French first, English toggle; every label via `useT()`.
