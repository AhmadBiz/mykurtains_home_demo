# Architecture — Maison 3D · Habillage de fenêtres

Interactive 3D walkthrough of a two-storey house (with basement) transcribed from the architect's
plans, where the visitor chooses curtains / blinds / shutters for every window.

Stack: **Vite + React 19 + TypeScript + three.js + @react-three/fiber 9 + @react-three/drei 10 + zustand 5**.
No external 3D models — geometry is procedural. Surfaces use a small CC0 PBR texture pack (`public/textures/<id>/`, manifest
`src/data/textures.json`, helpers `src/scene/materials.ts` → `usePbr` / `usePbrMaterial`; most modules write UVs in metres and
configure sets at `size: [1, 1]` so textures tile at real-world scale) and one HDRI sky (`public/hdri/sky_1k.hdr`), so the app
still deploys to Vercel as a static site. Asset URLs go through `assetUrl()` = `import.meta.env.BASE_URL + path`.

## Coordinate system & units

* World units are **metres**, Y up. The source data (`src/data/house.ts`) is authored in **feet** and converted once.
* **X** runs from the **front** of the house (street, small X) to the **rear** (large X).
* **Z** runs from the **north** side of the plan (page top, small Z) to the **south** side (large Z).
* Ground-floor finished floor is **Y = 0**. Basement floor Y = −9 ft, upper floor Y = +10 ft. Lawn (grade) is `HOUSE.gradeY` = −3.5 ft.
* Camera / player yaw convention (three.js default): yaw = rotation about +Y; the camera looks along `(-sin yaw, 0, -cos yaw)`.
  `yaw = -PI/2` looks toward +X (into the house from the street).

## Data (`src/data`)

| File | What |
|---|---|
| `types.ts` | All interfaces (`Level`, `Room`, `WallDef`, `Opening`, `StairFlight`, `Platform`, `HouseData`). Read this first. |
| `house.ts` | `HOUSE` (metres): 3 levels (outline polygons + slab holes), 35 rooms, 77 walls, 54 openings (27 coverable windows incl. the patio door), stairs, landings, porch/balcony platforms, exterior ramps. Also `START_POSITION`, `START_YAW`, `PLAYER_EYE_HEIGHT`, `PLAYER_RADIUS`. |
| `coverings.ts` | Catalogue of the 9 covering types (`COVERING_TYPES`, `COVERING_BY_ID`), colour options, `WindowCoveringState`, `DEFAULT_COVERINGS` (initial look of each window). |
| `geometry.ts` | Derived helpers: `WALL_GEOMS` (length / dir / normal / yaw per wall), `WINDOWS` (every coverable opening with world `center`, `yaw`, `inward` normal, size), `COLLISION_SEGMENTS`, `resolvePlayerCollisions()`, `groundHeightAt()` (floors + stairs + ramps + platforms + grade), `levelForY()`, `roomAt()`, `viewpointForWindow()`, `LEVEL_ENTRY`, point-in-polygon utils. |

Walls are **centre-line segments** `a → b` with `thickness`, `baseY`, `height`. Openings are placed by `at` = distance from `a`
to the opening centre, with `width`, `height`, `sill`. Wall local frame: +X along `a → b`, rotate by `WALL_GEOMS.get(id).yaw` about Y.

Stairs: `dir` is the direction of **ascent**, `y0` the height at the low end, `y1` at the high end. The stair block
(X 10.5–20.5 ft, Z 3–9 ft) holds two U-shaped stairs stacked: A (north half) + B (south half) go up with a landing at
X 10.5–13.5; C (south half) + D (north half) go down. A full-height **spine wall** at Z = 6 ft separates the halves. The
slab of each level has a hole over the block.

## Store (`src/store/useStore.ts`)

zustand store `useStore` — `mode` (`walk` | `orbit`), `level` (where the player is), `panel`, `selectedWindowId`,
`hoveredWindowId`, `coverings` (per window id → `WindowCoveringState`, persisted to localStorage), `teleport` request
(`{position, yaw, seq}` consumed by the Player), `pointerLocked`, `isTouch`, `quality`, `showCeilings`, `orbitLevel`,
`hasStarted`, `lang` (`fr` default, `en`). Actions: `selectWindow`, `setCoveringType`, `updateCovering`, `applyToRoom/Level/All`,
`resetCovering`, `goToWindow(id)` (teleports in front of it and opens the panel), `goToLevel`, `goToStart`, …

`playerState` (same file) is a **mutable, non-reactive** object with the live `x, y, z, yaw, pitch, aimedWindowId` —
written by the Player each frame, read by the minimap / HUD via requestAnimationFrame. `useT()` returns `(fr, en) => string`.

`src/scene/input.ts` — mutable `input` object (forward / right / lookDX / lookDY / sprint / selectRequested) shared by
keyboard+mouse handlers and the touch controls.

`window.__house` — debug/automation API (`teleport`, `goToWindow`, `setCovering`, `setMode`, `start`, `state`, `player`, `windows`, plus `scene` / `gl` set by `Scene.tsx`),
used by `scripts/screenshot.mjs`.

## Installation standard (MyKurtains)

Curtains and sheers are **always ceiling-mounted track systems with ripple-fold (wave) panels**: a slim aluminium
channel fixed flush to the ceiling (a double track when a sheer layer is added: sheer behind, drape in front), the
fabric hangs from carriers via snap tape so the top edge is the same continuous S-wave as the rest of the panel
(no pleated header, no rod, no rings, no finials), uniform wave depth from top to hem, floor length (hem ≈ 1 cm
above the floor), and the stack-back is compact and regular at each side when drawn open. `coverings/Curtains.tsx`
and `coverings/Sheers.tsx` must model exactly this.

## Scene composition (`src/scene`)

`Scene.tsx` wires: `<Sky>` (from `Lighting.tsx`: `scene.environment` = the HDRI's sun-clamped, ground-tinted *lighting* copy,
`scene.background` = the sun-clamped copy, both rotated by `SKY_ROTATION_Y` so the measured sun lights the street elevation) + `fogExp2`
(colour = the HDRI horizon band) + `<Lighting>` + `<RoomLights>` + `<Exterior>` + `<House>` + `<WindowMeshes>` + `<Furniture>` + (`<Player>` | `<OrbitView>`) + `<Effects>`.
`App.tsx` owns the `<Canvas>` (ACES tone mapping, sRGB output, PCF shadow map; keyed on `quality` because `antialias` is a
renderer constructor option — 'low' = MSAA and no post-processing, 'high' = post chain).

| File | Owner / responsibility |
|---|---|
| `House.tsx` (+ `structure/`) | Walls (with openings cut out), floor slabs per level (outline minus holes), per-room floor finishes, ceilings, stairs + landings + railings, interior door frames & open door leaves, exterior doors (front door with glazing, garage door, side door), baseboards. Honours `showCeilings` and, in orbit mode, hides levels above `orbitLevel` and that level's ceiling. Exterior faces: brick on the ground storey, horizontal siding on the upper storey, concrete for the exposed foundation (matches the elevations). |
| `Exterior.tsx` (+ `exterior/`) | Lawn, driveway, walkway, porch (slab, columns, small roof), porch steps, balcony deck + railing + posts + stairs to the yard, side-door landing + steps, hip roofs with eaves over the upper storey, trees/shrubs, fence/hedge. Uses `HOUSE.platforms` / `HOUSE.ramps` for positions. |
| `WindowMeshes.tsx` | For every `WINDOWS` entry: frame, glass, sill, interior casing; patio door panels; hover/selected highlight; an invisible hit mesh with `userData.windowId` for the Player's centre raycast; R3F pointer events (`onClick → selectWindow`) for orbit mode; mounts `<Covering>` on the interior face. |
| `coverings/*` | One component per covering type (see `coverings/types.ts` for the local frame contract). `index.tsx` dispatches. Pure, prop-driven, procedural. |
| `Furniture.tsx` (+ `furniture/`) | Low-poly props so each room reads as what it is (beds, sofas, kitchen, bathrooms, car in the garage…). Positions from `HOUSE.rooms` bounds. |
| `Player.tsx` | First-person controller: pointer-lock mouse look, WASD/arrows, shift sprint, touch input via `input`, collision (`resolvePlayerCollisions`), stairs/ramps (`groundHeightAt`), teleport requests, level detection, centre raycast → `playerState.aimedWindowId`, click / E / touch-select → `selectWindow`. |
| `OrbitView.tsx` | Dollhouse camera (drei `OrbitControls`) for the orbit mode. |
| `Lighting.tsx` | Shadow-casting sun aligned with the HDRI's measured sun direction rotated by `SKY_ROTATION_Y` (exports `SUN_DIR` / `SUN_POSITION` / `SUN_TARGET`), a weak hemisphere fill (no ambient), `useSkyEnvironment()` → `{ lighting, background }` (HDRI → sun-clamped equirects; the lighting copy has the rows below the horizon tinted to a lawn albedo and a slight warm bias), `<Sky/>`, and the indoor-reflection contract `useIndoorEnvironment()` / `indoorEnvironment(gl)` / `applyIndoorEnvironment(material, env)` / `INDOOR_ENV_INTENSITY` (a PMREM of three's RoomEnvironment, cached per renderer) and `applySkyEnvironment(material, sky)`. `Scene.tsx`'s `<Reflections/>` pass hands the indoor map to every furniture material and to the metal hardware of the house and windows, and gives **every other** standard/physical material the sky as an explicit `envMap` (intensity × `ENV_INTENSITY`, rotation = `SKY_ROTATION_Y`): three ignores `material.envMapIntensity` on materials that fall back to `scene.environment`, so without this pass every per-material value in the modules is dead. |
| `RoomLights.tsx` | One warm point light per room (two recessed spots in the big rooms, pendant + flush mounts in the stairwell void; 37 lights) with instanced ceiling fixtures. No shadows. Housings of the top visible storey are hidden in orbit mode. |
| `Effects.tsx` | Post-processing on 'high' only: N8AO (quality 'medium', half-res, radius 0.9 m walking / 2.5 m dollhouse) + SMAA + ACES tone mapping + a light vignette (`@react-three/postprocessing`). |

## UI (`src/ui`)

`Hud.tsx` (top bar: title, level pills, walk/orbit toggle, buttons for windows list / map / help / language / quality; crosshair
and aimed-window tooltip in walk mode; hints), `MiniMap.tsx` (2D canvas plan of the current level with player arrow),
`CoveringPanel.tsx` (picker for the selected window), `WindowList.tsx` (drawer listing every window by level/room → `goToWindow`),
`IntroOverlay.tsx` (start screen & instructions), `TouchControls.tsx` (joystick + look area + select button on touch devices),
`LoadingFallback.tsx`.

Design language: dark glass panels (`--panel`), amber accent (`--accent`), rounded 14px, Inter/system font, works at phone width.
Default language French with an English toggle (all labels through `useT(fr, en)`; data already carries `name` / `nameFr`).

## Scripts

* `npm run dev` / `npm run build` (tsc + vite) / `npm run preview`
* `npx tsx scripts/validate-house.ts` — data sanity + reachability of every room and window viewpoint
* `npm run screenshot` — Playwright + bundled Chromium: builds, serves, drives `window.__house`, saves PNGs to `screenshots/`
  (`QUALITY=low` for the Éco tier). `npm run screenshot -- --preview` writes only `public/preview.png` (1200×750 canvas-only
  exterior-front shot, the thumbnail on the multi-house landing page).
