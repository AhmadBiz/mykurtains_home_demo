# Real-looking room photos for Maison Sara

The 3D model gives accurate renders of every room (exact windows, coverings and colours) but they look like renders.
These tools turn each render into a real-looking photograph with an image model: the render is sent as the reference
image, so the camera, walls and windows stay exactly as in Sara's plans, and the prompt (`prompts.json`) describes the
room, the proposed window covering on each window (ceiling-track ripple-fold curtains, linen roman shades, roller
blinds) and the photographic style.

1. Renders: `cd legacy/sara-walkthrough && node scripts/photos.mjs` (shots in `photos/shots-*.json`, output
   `photos/<id>.jpg`).
2. Photos, automatically: add an image API key to the cloud environment (environment settings → Network secrets, or an
   environment variable) named `OPENAI_API_KEY` (OpenAI, model `gpt-image-1` by default) or `GEMINI_API_KEY` (Google,
   `gemini-2.5-flash-image`), start a new session, then:
   ```bash
   node docs/photo-generation/generate.mjs --dry-run
   node docs/photo-generation/generate.mjs --variants 2
   ```
   Results: `legacy/sara-walkthrough/photos/real/<id>-v1.png …` and `manifest.json`.
3. Photos, by hand (no key): `node docs/photo-generation/generate.mjs --print` prints one prompt per room; in ChatGPT or
   Gemini, attach the room's render (`legacy/sara-walkthrough/photos/<id>.jpg`) and paste its prompt.

Check every result against the proposal before it goes to the client: image models sometimes add a curtain rod,
shorten curtains, or move a window. Regenerate those.
