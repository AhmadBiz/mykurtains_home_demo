# Photos — Maison Sara, dressed with the MyKurtains proposal

Realistic stills of every room, rendered from the 3D model with the proposed window coverings
(`DEFAULT_COVERINGS` in `src/data/coverings.ts`), so the client can choose. The renderer is
`scripts/photos.mjs`; the app's **photo mode** does the rest (fixed still camera, no UI, no window
highlights, ceilings and interior lights on, best quality).

## 1. Add a shot

Create (or extend) a file `photos/shots-<anything>.json` — an array of shots:

```json
[
  {
    "id": "salon-01",
    "title": "Living room — north window",
    "titleFr": "Salon — fenêtre nord",
    "room": "g-salon",
    "level": "ground",
    "position": [6.55, 1.35, 3.45],
    "target": [8.4, 1.35, 0.0],
    "fov": 62,
    "exposure": 0.85,
    "overrides": { "w-salon-n": { "open": 0.6 } }
  }
]
```

| Field | Meaning |
|---|---|
| `id` | file name of the photo (`photos/<id>.jpg`); letters, digits, `-`, `_`, `.`; unique across all shot files |
| `title` / `titleFr`, `room`, `level` | captions / bookkeeping (room id from `HOUSE.rooms`, level `ground` / `upper` / `basement`) — not used by the renderer |
| `position`, `target` | camera and aim point, **metres**: X street → rear, Z north → south, Y up |
| `fov` | **vertical** field of view in degrees (the frame is 3:2, so 62° vertical ≈ 85° horizontal) |
| `exposure` | optional ACES exposure (`gl.toneMappingExposure`), default **0.85** = the app's |
| `overrides` | optional per-shot changes to the proposal: `{ windowId: Partial<WindowCoveringState> }`, e.g. `{ "type": "roller", "color": "sand", "open": 0.3 }` (see `COVERING_TYPES` in `src/data/coverings.ts`) |

Floor heights: ground Y = 0, upper Y = 3.048, basement Y = −2.743. A natural interior eye height is
**floor + 1.2 to 1.45 m**. Room bounds (wall centre-lines) are `HOUSE.rooms[].bounds = [x1, z1, x2, z2]`;
windows (`WINDOWS` in `src/data/geometry.ts`) give `center`, `inward` normal and size. Quick list:
`npx tsx -e "import {WINDOWS} from './src/data/geometry'; for (const w of WINDOWS) console.log(w.id, w.room?.id, w.center.toArray().map(v=>v.toFixed(2)))"`.

Every shot starts from the full proposal (`__house.applyProposal()`), then applies its `overrides`, so
shots never leak changes into each other.

## 2. Render

```bash
node scripts/photos.mjs --draft                 # all shots, composition check → photos/drafts/<id>.jpg
node scripts/photos.mjs --draft --only salon-01 # just one
node scripts/photos.mjs --only salon-01,cuisine-01   # final → photos/<id>.jpg
node scripts/photos.mjs --port 4412             # another free port (4400–4499) if 4410 is busy
node scripts/photos.mjs --build                 # force a rebuild of dist-photos/
```

* **Draft**: 1200×800 canvas at dpr 1, JPEG q85, in `photos/drafts/`. Use it to frame the shot.
* **Final**: 1500×1000 canvas at dpr 2 (`?dpr=2` → a 3000×2000 render, AO at full resolution with
  64 samples), downscaled with Lanczos to **1800×1200**, JPEG q88 (4:4:4), in `photos/`.
* The script builds the app into `dist-photos/` when it is missing or older than `src/` / `public/`
  (it never touches `dist/`), serves it with `vite preview --strictPort`, renders each shot, prints
  the time per shot, and exits 1 on any page error, WebGL context loss or failed shot.
* Only the WebGL canvas is captured (read in the same animation frame it was drawn), after two
  consecutive identical frames — no HUD, no half-applied state.

### How long it takes here (4-core container, SwiftShader software WebGL)

TIMINGS_PLACEHOLDER

Render several shots per invocation: the start-up (shader compilation, texture upload) is paid once.
Two renders at the same time on this machine only slow each other down (CPU-bound).

## 3. Photographer's notes

* **Straight verticals**: keep `target[1] === position[1]` (a level camera). Frame higher or lower
  by moving the camera, not by tilting it. The script warns when a shot is tilted.
* **Lens**: 55–65° vertical reads as a real-estate wide angle; above ~70° the corners stretch.
  A camera just inside a doorway or in a corner shows two walls and makes small rooms read larger.
  Mind the near plane (3 cm) and walls: a camera closer than ~15 cm to a wall sees through nothing,
  but furniture right in front of the lens fills the frame — check the draft.
* **Show the hero**: the curtains hang from a ceiling track to ~1 cm above the floor. Frame so the
  track at the ceiling AND the hem on the floor are both in the picture (low sofas and beds in the
  foreground hide the hem — move the camera to the side of them or raise it to ~1.45 m).
* **Exposure**: ACES filmic, so it is forgiving. 0.85 is right for sunny ground-floor rooms;
  +0.15 to +0.35 for the darker rooms. Raising it also blows out the view through the windows
  (sky and lawn go white) — a real interior photo does the same, but keep the curtain fabric from
  clipping: light fabrics (ivory, white voile) against a bright window clip first.
* **Sun**: the sun comes from the street side and the north (it rakes the front / north elevations,
  elevation 48°). North-facing and street-facing windows throw sharp sun patches on the floor and
  through the voile; south / rear windows (kitchen sink, master south, bedroom 2, walk-in 2) are in
  shade and the room is lit by the sky and the ceiling lights.
* **Tricky rooms**:
  * **Basement** (bedrooms 5 / 6, family room, bathroom 3): small high windows (53 cm tall, sill
    near the ceiling) and 2.44 m ceilings → dark; start at exposure 1.1–1.25. The floor-length
    drapes there are the point of the proposal (they make the small windows read large): frame the
    whole wall, track to floor.
  * **Stairwell** (12 ft window `w-escalier`, sand solar-screen roller): bright, tall; shoot from the
    landing or from the hall with a narrower fov so the window is not tiny; exposure ~0.75–0.85.
  * **Walk-ins, bathrooms, powder room**: small rooms — shoot from the door, fov 60–70, exposure ~1.0.
  * **Open living / dining / patio**: one big space; one wide shot from the hall side plus one
    toward the patio door works better than a shot per room.
* Interior lights are always on (warm 3000 K); ceilings are always drawn in photo mode.

## Photo mode API (console / scripts)

```js
__house.applyProposal();                          // all windows back to the proposal
__house.setCovering('w-salon-n', { open: 0.6 });  // per-shot override
__house.photo({ position: [6.55, 1.35, 3.45], target: [8.4, 1.35, 0], fov: 62, exposure: 0.85 });
__house.setMode('walk');                          // leave the photo mode
```

Open the app with `?dpr=2` to supersample the canvas (the photo mode itself does not change the
pixel ratio).
