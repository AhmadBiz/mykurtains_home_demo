# MyKurtains · Specs: Photo-overlay app (Option 1) & Native AR app (Option 3)

As of 2026-10-23. Living copy: https://claude.ai/artifact/TYRSX2FEiqJtzrLbJYUTpC

## Context

During a client visit, the installer shows the client each covering type and colour on the client's own window, from a phone, in under a minute per option. Option 1 (photo-overlay web app) ships first; Option 3 (native AR) follows only if the photo tool proves its sales value.

Both apps reuse this repository. The 3D covering models live in the archived photoreal walkthrough (`legacy/sara-walkthrough/`, no longer deployed); the live house page (`houses/sara/`) has lightweight SVG drawings of the same catalogue (`src/illustrations/`). The parts that are hard to get right:

| Asset | Where in the repo | Reuse |
| --- | --- | --- |
| Product catalogue | `legacy/sara-walkthrough/src/data/coverings.ts` | 9 covering types with colour options and the per-window state `{type, color, open, tilt, sheer}`; zebra blinds to be added |
| 3D covering models | `legacy/sara-walkthrough/src/scene/coverings/*.tsx` | Procedural three.js components with a documented local frame (`coverings/types.ts`); render unchanged in both apps |
| PBR texture pack | `legacy/sara-walkthrough/public/textures/`, `src/scene/materials.ts` | Fabric, wood, metal, CC0 (Poly Haven), already web-sized |
| Picker UI | `legacy/sara-walkthrough/src/ui/CoveringPanel.tsx` | Type cards, colour swatches, open and tilt sliders, sheer toggle |
| Installation standard | `legacy/sara-walkthrough/ARCHITECTURE.md` | Ceiling-mounted track with ripple-fold curtains, always |

What is new in both apps: finding the client's window in a real image, perspective-correct placement, client sessions (save, compare, share), and working with poor connectivity on site.

## Shared foundations

Move the catalogue, the covering models and the picker into one package, `packages/coverings/` in this repo, that every house folder and both AR apps import, so a zebra blind is the same model, colours and defaults everywhere.

| Module | Taken from | Contract |
| --- | --- | --- |
| `catalogue.ts` | `legacy/sara-walkthrough/src/data/coverings.ts` | `COVERING_TYPES`, colour options, `WindowCoveringState`, `defaultStateFor(type)`; adds `zebra` |
| `models/*.tsx` + `types.ts` | `legacy/sara-walkthrough/src/scene/coverings/` | One React Three Fiber component per type, pure and prop-driven: `{width, height, sill, ceiling, reveal, isDoor, state, color}` in metres, rendered in a group at the opening centre on the interior face, +X along the wall, +Y up, +Z into the room |
| `materials.ts` + `textures.json` | `legacy/sara-walkthrough/src/scene/materials.ts` | `usePbr(id, {size})`; the JPGs stay in each app's `public/textures/` (a copy script, not a runtime download) |
| `ui/CoveringPicker.tsx` | `legacy/sara-walkthrough/src/ui/CoveringPanel.tsx` | Headless: `{state, onChange, catalogue, lang}`; styling through the existing CSS variables |

Zebra blinds (new type, needed by the sales tool):

| Field | Value |
| --- | --- |
| id, names | `zebra`, Zebra blind / Store zèbre |
| Geometry | Dual-layer roller: front and back fabric bands of alternating sheer and opaque stripes, 7.5 cm each, in an aluminium cassette with a bottom bar |
| State | `open` raises the blind (0 to 1); `tilt` reused as alignment: -1 opaque over opaque (closed, privacy), +1 sheer over opaque (open view) |
| Colours | White, ivory, light grey, charcoal, beige; sheer bands at translucency 0.6, opaque bands at 0 |

Migration, in order: 1. move the files into `packages/coverings/` and add it as an npm workspace; 2. make `houses/sara` import it and run `npm run screenshot` to prove nothing changed; 3. the photo-overlay app imports the same package; 4. the native app consumes the catalogue JSON and glTF exports (Option 3).

## Option 1 — Photo-overlay web app (build first)

A progressive web app, new repo `mykurtains-visualizer`, that runs in the browser on iPhone and Android with no app store: the installer photographs the client's window, marks its four corners, and the chosen covering is rendered in true 3D perspective over the photo with lighting matched to the room. Variants are compared side by side, saved to the client's file, and shared as a link or a branded JPG/PDF. Target: 60 seconds from photo to first rendered option.

### User flow

1. Home: list of clients and recent visits, button New visit (client name; address and phone optional).
2. Capture: full-screen rear camera at up to 1920 × 1440 (`getUserMedia`), or a photo from the library. An on-screen guide asks to stand square to the window, keep the ceiling edge and the floor in frame, and not zoom.
3. Mark the window: four draggable corner handles with a 2.5× loupe under the finger; then two taps, where the wall meets the ceiling and where it meets the floor (needed for ceiling-track curtains); then the real window width in cm (default 120). This sets scale and perspective.
4. Visualise: the covering picker from the house demo (type, colour, open amount, slat tilt, sheer layer); every change re-renders in under 100 ms. A long press hides the overlay to show the bare window.
5. Compare: each saved variant becomes a card (A, B, C…); swipe between them, or a split slider across any two; star a favourite.
6. Save and share: the session (photo, corners, variants) is stored on the device at once and synced when online; Share produces a read-only link, or a JPG/PDF with the company logo, product name, colour and, if enabled in Settings, the price.
7. Hand-off: Send to quote exports the measurements and choices as JSON for the quoting workflow (export only in v1).

### How the overlay is computed

- Window plane pose: the four corners and the real width give a homography from the window rectangle (metres) to image pixels (direct linear transform, 8 degrees of freedom). The focal length comes from EXIF `FocalLengthIn35mmFilm` when present, otherwise from the two vanishing points of the rectangle's edges, with the principal point at the image centre; fallback 28 mm equivalent. Decomposing the homography with that focal length gives the rotation and translation of the wall plane.
- Rendering: a transparent three.js canvas sits over the photo; its camera copies the recovered focal length and the photo's aspect; the wall plane is placed at the recovered pose and the covering component from `packages/coverings` is mounted on it with `width`, `height` from the corners, `ceiling` and `sill` from the two taps. Because the models are 3D (curtains stand 14 cm off the wall, blinds sit inside the reveal), the result has real parallax and thickness, not a flat warp.
- Lighting match: the app samples the photo's mean luminance and colour temperature in two zones, the wall around the window and the glass; ambient and key light follow the wall zone, a soft backlight behind sheers and light-filtering fabrics follows the glass zone; exposure and white balance of the render are matched to the photo's statistics; a soft contact shadow is drawn where the covering meets the wall.
- Occlusion: v1 replaces the window area with the render. v1.1 adds a quick brush to mask objects in front of the window (plants, furniture) so they stay in front of the covering.
- Export: the photo and the render are composited on an offscreen canvas at photo resolution (JPEG quality 90) for sharing and PDF.

### Screens

| Screen | Content | Notes |
| --- | --- | --- |
| Home | Clients, recent visits, New visit | Search by name |
| Capture | Camera preview, shutter, library, framing guide | Locks orientation to the photo |
| Mark window | Photo, 4 corner handles, ceiling and floor taps, width in cm | Loupe, undo, auto-snap to strong edges (optional) |
| Visualise | Photo + 3D overlay, picker drawer | Long press shows the bare window |
| Compare | Variant cards, split slider, favourite | Up to 8 variants per photo |
| Session | Photos of this visit, variants, notes | Add another window |
| Share | Link, JPG, PDF, Send to quote | Price toggle respects Settings |
| Settings | Language FR/EN, logo, prices on/off, catalogue version, storage used | |

### Data model

| Entity | Fields |
| --- | --- |
| Client | id, name, address?, phone?, email?, createdAt |
| Visit | id, clientId, createdAt, notes, photos[] |
| Photo | id, blob (JPEG ≤ 1920 px, ≤ 2 MB), width, height, focal35?, corners[4] (px), ceilingLine, floorLine, windowWidthCm, variants[] |
| Variant | id, state `WindowCoveringState` (type, color, open, tilt, sheer), label, favourite, createdAt, renderUrl? |

### Technical stack and repo layout

| Layer | Choice | Why |
| --- | --- | --- |
| App | Vite + React 19 + TypeScript, three.js + React Three Fiber, zustand | Same stack as the house demo; the package drops in |
| Coverings | `@mykurtains/coverings` from this repo (git dependency or npm workspace) | One catalogue and one set of models |
| Storage on device | IndexedDB via Dexie | Works offline, photos stay on the phone |
| Sync, auth, share links | Supabase (Postgres, Storage, Auth with magic link) | Hosted, cheap, row-level security per company |
| Offline | vite-plugin-pwa: app shell, catalogue, textures cached; installable on the home screen | Client basements have no signal |
| Hosting | Vercel, same account; a share page at `/s/<id>` reads from Supabase | |

Repo layout: `src/app` (routes and screens), `src/capture` (camera, EXIF), `src/geometry` (homography, focal estimate, pose), `src/render` (R3F scene, lighting match, export), `src/data` (Dexie schema, sync), `src/share` (link page, PDF), `public/textures` (copied from the package by a script).

Architecture: the four screens (Capture → Mark window → Visualise/compare → Share/export) run in the phone's PWA; Geometry (homography, focal length, wall pose) feeds Render (three.js, lighting match, export), which uses the shared coverings package; the local store (IndexedDB) syncs to Supabase (auth, Postgres, storage) when online; the share page on Vercel reads from Supabase.

### Non-functional requirements

| Requirement | Target |
| --- | --- |
| Devices | iOS Safari 16+, Android Chrome 110+; phones first, tablets supported |
| Performance | Picker change to new frame < 100 ms; export < 3 s; first load < 4 MB over the network, then offline |
| Privacy | Photos stay on the device unless the installer shares; share links expire after 90 days; no third-party analytics on client photos |
| Languages | French first, English toggle (same `useT` pattern) |
| Accessibility | Touch targets ≥ 44 px, works one-handed, readable in sunlight (high-contrast picker) |

### Acceptance tests

- [ ] Photo to first rendered covering in under 60 s on an iPhone 12 and a mid-range Android.
- [ ] Corners dragged off-axis by up to 25° still give a covering whose top edge follows the ceiling line within 1 % of the image width.
- [ ] All catalogue types including zebra render over a photo with correct scale (a 120 cm window shows a 120 cm covering).
- [ ] Session survives app close, airplane mode and reopening; syncs when back online without duplicates.
- [ ] Share link opens on a client's phone without an account and shows the favourite variant first.
- [ ] Export JPG matches what was on screen (same crop, same lighting).

### Milestones (one developer, six weeks)

| Workstream | Weeks |
| --- | --- |
| Shared package, zebra type | 1 to 2 |
| Capture, corner tool | 1½ to 2½ |
| Perspective, 3D overlay | 2 to 3 |
| Picker, compare, lighting match | 3 to 4 |
| Sessions, sync, share, PDF, PWA | 4 to 5 |
| Field test (3 visits), fixes | 5 to 6 |

## Option 3 — Native AR app

A native app for iPhone and Android that anchors the covering to the client's real wall and keeps it there while the phone moves, with the same catalogue, models and sessions as Option 1. Build it only after Option 1 has been used on real visits (see Sequencing); budget roughly three to four times Option 1.

### Platform choice

| Approach | Tracking | Code reuse from the web app | Verdict |
| --- | --- | --- | --- |
| Swift + ARKit (iOS) and Kotlin + ARCore (Android), RealityKit / Filament rendering | Best: plane detection, LiDAR depth and people occlusion on Pro iPhones, persistent anchors | Catalogue JSON and glTF models only; UI rewritten twice | Highest quality, two code bases |
| Unity + AR Foundation (one project, both stores) | Very good on both platforms through ARKit and ARCore | Catalogue JSON and glTF models; UI rewritten once in Unity | Recommended if Option 3 goes ahead: one team, one code base |
| React Native + ViroReact or Expo AR | Good, less control over occlusion and lighting | Catalogue, picker logic and session code largely reused | Fastest for a web team, weakest AR quality |
| WebXR in the browser | Android Chrome only; iPhone Safari has no AR session today | Everything | Not viable for a team or clients on iPhones |

### User flow

1. Sign in (same company account as Option 1) and pick or create the client visit.
2. Scan: move the phone slowly; the app detects the wall plane around the window and shows a mesh hint.
3. Place: tap the top-left and bottom-right corners of the window on the wall plane (or confirm an automatic rectangle found from the plane's edges and the brightness of the glass); the ceiling edge is detected from the ceiling plane, or tapped. The real width is read from the AR measurement, no tape needed, and the window is saved as an anchor.
4. Visualise: the covering stands on the wall in 3D; walk around it, look from the side, open and close it with the slider, swap types and colours; it stays in place.
5. Occlusion and light: the environment light estimate drives the render; on LiDAR devices the depth map hides the covering behind furniture; people walking in front are masked.
6. Capture: photo or short video of the live view for the client's file; variants saved with the anchor so a second visit re-finds the window.
7. Share and quote: identical to Option 1 (same backend, same share page, same JSON export).

### Technical requirements

| Area | Requirement |
| --- | --- |
| Devices | iPhone 11 and later (LiDAR models get occlusion), Android with ARCore support list; iOS 16+, Android 10+ |
| Models | The procedural three.js coverings exported to glTF at three open states (closed, half, open) plus slat tilt as a morph or bone rig; roller, roman and cellular as a single scalable mesh with a clamped UV; ripple-fold curtains as a 24-frame morph sequence; file size per type under 2 MB |
| Materials | Same PBR texture pack; metal and glass use the AR environment probe for reflections |
| Anchoring | Persistent anchors per window stored with the visit (ARKit world map or ARCore cloud anchors) so the covering reappears on a return visit |
| Lighting | Platform light estimation (intensity, colour temperature, directional estimate on iOS) feeds the render; shadows cast onto the detected wall and floor planes |
| Backend | Shared with Option 1: same Supabase project, tables and share page |
| Offline | Works without signal; sync on return |
| Release | TestFlight and Google Play internal track for the installers; store listing optional, since the app is a sales tool, not a consumer product |

### Acceptance tests

- [ ] The covering stays within 1 cm of its placed position after walking 3 m away and back.
- [ ] A 120 cm window measured by the app is within 2 cm of the tape measurement.
- [ ] On a LiDAR iPhone, a chair in front of the window hides the curtain behind it.
- [ ] A variant saved on visit one reappears on the same window on visit two without re-placing.
- [ ] Every catalogue type, zebra included, matches the web app's look side by side on the same window.

## Sequencing and decision

Start Option 1 now in its own repo with the shared package extracted first; decide on Option 3 after twenty real client visits with the photo tool, using the criteria below.

| Signal from the field (first 20 visits) | Move to Option 3 if |
| --- | --- |
| Time from photo to first option | Median above 90 s despite the corner tool |
| Clients asking to see the covering from another angle or while walking | More than 1 visit in 3 |
| Windows the photo tool could not handle (bay windows, corner windows, strong backlight) | More than 1 window in 5 |
| Closed sales where the installer credits the visual | Below 1 in 4, with feedback that the still image did not convince |

What Option 1 builds that Option 3 inherits: the `@mykurtains/coverings` package and its catalogue JSON, a glTF export script for the models, the Supabase project (clients, visits, variants, share links), the share page, the PDF and quote exports, and the FR/EN strings.

## Appendix

Catalogue as it stands in `legacy/sara-walkthrough/src/data/coverings.ts`, plus the zebra type to add. Controls: open = raised or drawn back (0 to 1), tilt = slat or vane angle (-1 to 1), sheer = second layer.

| Type (id) | Model | Controls | Colours |
| --- | --- | --- | --- |
| Ripple-fold curtains (`curtains`) | Ceiling track, continuous S-wave panels to the floor; double track with a sheer | open, sheer | 9 fabrics (linen, velvet) |
| Ripple-fold sheers (`sheers`) | Same track system, translucent voile | open | 4 voiles |
| Roller blind (`roller`) | Cassette, flat fabric, bottom bar, chain | open | 6 (light-filtering, blackout, screen) |
| Roman shade (`roman`) | Flat folds that stack at the top, headrail | open | 6 |
| Cellular shade (`cellular`) | Honeycomb body, compresses when raised | open | 4 |
| Venetian blind (`venetian`) | Horizontal slats, aluminium or wood, ladder tapes | open, tilt | 6 |
| Vertical blind (`vertical`) | Vanes on a headrail, draw to one side | open, tilt | 4 |
| Plantation shutters (`shutters`) | Hinged louvred panels, bi-fold on wide windows | open (swing), tilt | 5 |
| Zebra blind (`zebra`, to add) | Dual-layer banded roller, 7.5 cm stripes, cassette | open, tilt (band alignment) | 5 |

Package extraction checklist:

- [ ] `packages/coverings/` created as an npm workspace with catalogue, models, materials, textures manifest and the headless picker
- [ ] `houses/sara` imports the package; `npm run screenshot` shows no visual change
- [ ] Zebra blind implemented and visible in the house demo and the picker
- [ ] `scripts/export-gltf.mjs` writes one glTF per type and open state (needed only by Option 3, cheap to add now)
- [ ] Catalogue exported as JSON for non-web consumers
- [ ] Package README documents the local frame contract and the ceiling-track standard
