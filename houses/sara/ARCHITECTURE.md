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

`Scene.tsx` (which also calls `preloadAllTextures()` at import) wires, in order:

1. **Environment — `<Sky/>`** (`Lighting.tsx`): the HDRI `public/hdri/sky_1k.hdr` is loaded once (HDRLoader, float) and
   rebuilt by `useSkyEnvironment()` into two HalfFloat equirects with the sun disc **clamped** out (radiance ≤ `HDRI_CLAMP` = 6):
   `scene.environment` = the *lighting* copy (clamped, rows below the horizon tinted to a lawn albedo, slight warm bias,
   `ENV_INTENSITY` 0.9) and `scene.background` = the clamped-only copy (`BACKGROUND_INTENSITY` 1). Both are rotated by
   `SKY_ROTATION_Y` (π) via `scene.environmentRotation` / `backgroundRotation`, so the measured sun lights the street elevation.
2. **Fog** — `fogExp2`, colour = the HDRI horizon band (`#acb2c1`), density 0.0045 (a clear day).
3. **`<Lighting/>`** — the shadow-casting sun (DirectionalLight along `SUN_DIR`, the sun direction **measured from the HDRI**
   — brightest pixel, 48° elevation — turned by `SKY_ROTATION_Y`) + a weak hemisphere fill; no ambient.
4. **`<RoomLights/>`** — the interior point lights and their instanced ceiling fixtures.
5. **`<Exterior/>`**, **`<House/>`**, **`<WindowMeshes/>`** (mounts the `<Covering>` of each window), **`<Furniture/>`**
   (the last three inside refs used by the reflections pass).
6. **`<Player/>`** in walk mode | **`<OrbitView/>`** in orbit mode.
7. **`<Reflections/>`** — assigns explicit `envMap`s: the indoor RoomEnvironment PMREM to every furniture material and to
   the metal hardware (metalness ≥ 0.5) of the house and windows, the sky to every other standard / physical material
   (re-run whenever the coverings change, because coverings mount new materials).
8. **`<Effects/>`** — the post chain on 'high' (N8AO → SMAA → ACES → vignette).
9. **`<DebugHandles/>`** — keeps `window.__house.scene` / `.gl` pointing at the live scene and renderer.

`App.tsx` owns the `<Canvas>` (ACES tone mapping at exposure 0.85, sRGB output, PCF shadow map, fov 70; keyed on `quality`
because `antialias` is a renderer constructor option — 'low' = MSAA, dpr 0.75–1, 2048 shadow map and no post-processing;
'high' = dpr 1–1.75, 4096 shadow map and the post chain; with post-processing on, the ACES curve is applied by the
`<ToneMapping>` effect since postprocessing's output pass does not tone-map).

| File | Owner / responsibility |
|---|---|
| `House.tsx` (+ `structure/`) | Walls (with openings cut out), floor slabs per level (outline minus holes), per-room floor finishes, ceilings, stairs + landings + railings, interior door frames & open door leaves, exterior doors (front door with glazing, garage door, side door), baseboards. Honours `showCeilings` and, in orbit mode, hides levels above `orbitLevel` and that level's ceiling. Exterior faces: brick on the ground storey, horizontal siding on the upper storey, concrete for the exposed foundation (matches the elevations). |
| `Exterior.tsx` (+ `exterior/`) | Lawn, driveway, walkway, porch (slab, columns, small roof), porch steps, balcony deck + railing + posts + stairs to the yard, side-door landing + steps, hip roofs with eaves over the upper storey, trees/shrubs, fence/hedge. Uses `HOUSE.platforms` / `HOUSE.ramps` for positions. |
| `WindowMeshes.tsx` | For every `WINDOWS` entry: frame, glass, sill, interior casing; patio door panels; hover/selected highlight; an invisible hit mesh with `userData.windowId` for the Player's centre raycast; R3F pointer events (`onClick → selectWindow`) for orbit mode; mounts `<Covering>` on the interior face. |
| `coverings/*` | One component per covering type (see `coverings/types.ts` for the local frame contract and the props: size, sill, reveal, `ceiling` height, `sideRoom` free track run each side, `hemAbove`). `index.tsx` dispatches. Pure, prop-driven, procedural. `Curtains.tsx` / `Sheers.tsx` (+ `fabric.ts`) implement the ceiling-track ripple-fold standard above. |
| `Furniture.tsx` (+ `furniture/`) | Low-poly props so each room reads as what it is (beds, sofas, kitchen, bathrooms, car in the garage…). Positions from `HOUSE.rooms` bounds. |
| `Player.tsx` | First-person controller: pointer-lock mouse look, WASD/arrows, shift sprint, touch input via `input`, collision (`resolvePlayerCollisions`), stairs/ramps (`groundHeightAt`), teleport requests, level detection, centre raycast → `playerState.aimedWindowId`, click / E / touch-select → `selectWindow`. |
| `OrbitView.tsx` | Dollhouse camera (drei `OrbitControls`) for the orbit mode. |
| `Lighting.tsx` | **Environment**: `useSkyEnvironment()` → `{ lighting, background }` (HDRI → sun-clamped HalfFloat equirects; the lighting copy has the rows below the horizon tinted to a lawn albedo `GROUND_TINT` and a slight warm bias) and `<Sky/>` which installs them as `scene.environment` / `scene.background` rotated by `SKY_ROTATION_Y`. **Sun**: `<Lighting/>` = a shadow-casting DirectionalLight (intensity 5.5, `#fff1dc`, 4096² map on 'high' / 2048² on 'low', ±20 m ortho frustum ≈ 1 cm texels) placed along `SUN_DIR` = the sun direction **measured in the HDRI** (`HDRI_SUN_DIR`, elevation 48°) rotated by `SKY_ROTATION_Y` (exports `SUN_DIR` / `SUN_POSITION` / `SUN_TARGET`), so lit faces, cast shadows and the visible disc agree; plus a weak hemisphere fill (0.12, no ambient). **Reflection contract**: `useIndoorEnvironment()` / `indoorEnvironment(gl)` (a PMREM of three's RoomEnvironment with its light panels clamped, cached per renderer), `applyIndoorEnvironment(material, env)` / `INDOOR_ENV_INTENSITY`, and `applySkyEnvironment(material, sky)`. `Scene.tsx`'s `<Reflections/>` pass hands the indoor map to every furniture material and to the metal hardware of the house and windows, and gives **every other** standard/physical material the sky as an explicit `envMap` (intensity × `ENV_INTENSITY`, rotation = `SKY_ROTATION_Y`): three ignores `material.envMapIntensity` on materials that fall back to `scene.environment`, so without this pass every per-material value in the modules is dead. |
| `RoomLights.tsx` | Interior lighting, no shadows: one warm (~3000 K, `#ffe3c0`) PointLight per room (physical decay 2, intensity from the distance to the nearest wall, range = room diagonal × 1.4, source 20–25 cm below the ceiling so each fixture haloes the ceiling) — two recessed spots in the six big rooms, a bare bulb in the garage, a pendant + flush mounts in the stairwell void, closets under 2 m² get a fixture but no light (37 lights in all, `ROOM_LIGHT_COUNT`). Fixtures drawn as 4 InstancedMeshes. In orbit mode the housings of the hidden storeys and of the top visible storey are hidden and the hidden storeys' lights dimmed to 0. |
| `Effects.tsx` | Post-processing on 'high' only (`@react-three/postprocessing`, `multisampling 0`): **N8AO** (quality 'medium', half-res with depth-aware upsampling, radius 0.9 m walking / 2.5 m dollhouse, intensity 1.5, distance falloff 0.6, its gamma correction switched off so the buffer stays linear) → **SMAA** → **ACES** filmic `<ToneMapping>` → a light **vignette** (offset 0.3, darkness 0.15). Returns nothing on 'low'. |

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
