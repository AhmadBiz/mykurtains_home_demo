#!/usr/bin/env node
/**
 * Photo renderer: turns the camera shots listed in photos/shots-*.json into clean, supersampled
 * real-estate stills of the house dressed with the proposal (DEFAULT_COVERINGS).
 *
 *   node scripts/photos.mjs                     — every shot, final quality → photos/<id>.jpg
 *   node scripts/photos.mjs --draft             — quick composition check → photos/drafts/<id>.jpg
 *   node scripts/photos.mjs --only a,b          — only these shot ids
 *   node scripts/photos.mjs --port 4411         — vite preview port (default 4410, use 4400–4499)
 *   node scripts/photos.mjs --build             — force a fresh build (otherwise rebuilt when src/ is newer)
 *
 * Final: 1500×1000 canvas at devicePixelRatio 2 (a 3000×2000 frame, `?dpr=2`), downscaled with
 * Lanczos to 1800×1200, JPEG q88 (python3 + PIL). Draft: 1200×800 at dpr 1, JPEG q85.
 *
 * Shot file format (photos/shots-<anything>.json, an array):
 *   { "id": "salon-01", "title": "Living room", "titleFr": "Salon", "room": "salon", "level": "ground",
 *     "position": [x, y, z], "target": [x, y, z], "fov": 62, "exposure": 0.85,
 *     "overrides": { "w-salon-n": { "open": 0.6 } } }
 * Metres (see src/data/house.ts), fov = VERTICAL degrees. Keep target[1] === position[1] so verticals
 * stay vertical. `overrides` patches the proposal for this shot only (window.__house.setCovering).
 *
 * Each shot: applyProposal → overrides → photo camera → wait until the scene has drawn and two
 * consecutive frames are identical → grab the WebGL canvas (only the canvas: no DOM UI) in the same
 * animation frame it was rendered in.
 *
 * Builds into dist-photos/ (never touches dist/) and serves it with `vite preview --strictPort`.
 * Exit code 1 on any page error, console error, WebGL context loss or failed shot.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'dist-photos');
const PHOTOS = join(ROOT, 'photos');
const DRAFTS = join(PHOTOS, 'drafts');
const EXECUTABLE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const LAUNCH_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-gpu-sandbox'];
/** Per-operation timeout: a 3000×2000 software-GL frame with the stills chain takes tens of seconds. */
const OP_TIMEOUT = 15 * 60 * 1000;

// ---------------------------------------------------------------- args
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name) => {
  const i = argv.indexOf(name);
  if (i >= 0 && i + 1 < argv.length) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : undefined;
};
const DRAFT = flag('--draft');
const FORCE_BUILD = flag('--build');
const PORT = Number(option('--port') ?? 4410);
const ONLY = option('--only') ? new Set(option('--only').split(',').map((s) => s.trim()).filter(Boolean)) : null;

const MODE = DRAFT
  ? { name: 'draft', viewport: { width: 1200, height: 800 }, dpr: 1, out: { width: 1200, height: 800 }, quality: 85, dir: DRAFTS }
  : { name: 'final', viewport: { width: 1500, height: 1000 }, dpr: 2, out: { width: 1800, height: 1200 }, quality: 88, dir: PHOTOS };

// ---------------------------------------------------------------- helpers
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const secs = (t0) => ((Date.now() - t0) / 1000).toFixed(1);

function loadShots() {
  if (!existsSync(PHOTOS)) return [];
  const files = readdirSync(PHOTOS).filter((f) => /^shots-.*\.json$/.test(f)).sort();
  const shots = [];
  const seen = new Map();
  for (const f of files) {
    let list;
    try {
      list = JSON.parse(readFileSync(join(PHOTOS, f), 'utf8'));
    } catch (e) {
      throw new Error(`${f}: invalid JSON (${e.message})`);
    }
    if (!Array.isArray(list)) throw new Error(`${f}: expected an array of shots`);
    for (const s of list) {
      const where = `${f} → ${s?.id ?? '(no id)'}`;
      if (!s || typeof s.id !== 'string' || !/^[\w.-]+$/.test(s.id)) throw new Error(`${where}: "id" must be a file-name-safe string`);
      const vec = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
      if (!vec(s.position) || !vec(s.target)) throw new Error(`${where}: "position" and "target" must be [x, y, z] numbers (metres)`);
      if (typeof s.fov !== 'number' || s.fov < 10 || s.fov > 120) throw new Error(`${where}: "fov" must be a vertical angle in degrees (10–120)`);
      if (s.exposure !== undefined && (typeof s.exposure !== 'number' || s.exposure <= 0)) throw new Error(`${where}: "exposure" must be > 0`);
      if (seen.has(s.id)) throw new Error(`${where}: duplicate id (also in ${seen.get(s.id)})`);
      seen.set(s.id, f);
      if (Math.abs(s.target[1] - s.position[1]) > 1e-6) console.warn(`  note: ${s.id}: target.y ≠ position.y — the camera is tilted, verticals will converge`);
      shots.push({ ...s, file: f });
    }
  }
  return shots;
}

/** Newest mtime under a directory (recursive). */
function newestMtime(path) {
  const st = statSync(path);
  if (!st.isDirectory()) return st.mtimeMs;
  let m = st.mtimeMs;
  for (const e of readdirSync(path)) m = Math.max(m, newestMtime(join(path, e)));
  return m;
}

function ensureBuild() {
  const index = join(OUT_DIR, 'index.html');
  const sources = ['src', 'public', 'index.html', 'vite.config.ts'].map((p) => join(ROOT, p)).filter(existsSync);
  const stale = !existsSync(index) || Math.max(...sources.map(newestMtime)) > statSync(index).mtimeMs;
  if (!FORCE_BUILD && !stale) return;
  const t0 = Date.now();
  console.log(`building into dist-photos/ (${FORCE_BUILD ? 'forced' : existsSync(index) ? 'sources changed' : 'missing'})…`);
  const r = spawnSync('npx', ['vite', 'build', '--outDir', OUT_DIR, '--emptyOutDir', '--logLevel', 'warn'], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) throw new Error('vite build failed');
  console.log(`  built in ${secs(t0)} s`);
}

function portOpen(port) {
  return new Promise((done) => {
    const sock = createConnection({ port, host: '127.0.0.1' });
    sock.once('connect', () => (sock.destroy(), done(true)));
    sock.once('error', () => (sock.destroy(), done(false)));
  });
}

async function waitForPort(port, timeoutMs = 60000) {
  const t0 = Date.now();
  while (!(await portOpen(port))) {
    if (Date.now() - t0 > timeoutMs) throw new Error(`port ${port} not open after ${timeoutMs} ms`);
    await sleep(250);
  }
}

/** PNG (data URL) → resized JPEG via python3 + PIL (Lanczos). */
function encodeJpeg(dataUrl, outFile, { width, height }, quality) {
  const tmp = join(tmpdir(), `photo-${process.pid}-${Date.now()}.png`);
  writeFileSync(tmp, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));
  const py = `
import sys
from PIL import Image
src, dst, w, h, q = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
im = Image.open(src)
im.load()
alpha_min = im.getchannel('A').getextrema()[0] if im.mode == 'RGBA' else 255
im = im.convert('RGB')
if im.size != (w, h):
    im = im.resize((w, h), Image.LANCZOS, reducing_gap=3.0)
im.save(dst, 'JPEG', quality=q, subsampling=0, optimize=True, progressive=True)
print(f"{im.size[0]}x{im.size[1]} alpha_min={alpha_min}")
`;
  const r = spawnSync('python3', ['-I', '-c', py, tmp, outFile, String(width), String(height), String(quality)], { encoding: 'utf8' });
  rmSync(tmp, { force: true });
  if (r.status !== 0) throw new Error(`PIL encode failed: ${r.stderr}`);
  return r.stdout.trim();
}

const IGNORE = [/swiftshader/i, /software webgl/i, /GPU stall due to ReadPixels/i, /falling back to software/i, /GroupMarkerNotSet/i, /PCFSoftShadowMap/i];
const isIgnorable = (text) => IGNORE.some((re) => re.test(text));

// ---------------------------------------------------------------- main
async function main() {
  const all = loadShots();
  const shots = ONLY ? all.filter((s) => ONLY.has(s.id)) : all;
  if (ONLY) for (const id of ONLY) if (!all.some((s) => s.id === id)) console.warn(`  note: --only ${id}: no such shot`);
  if (shots.length === 0) {
    console.log('no shots to render (add photos/shots-*.json, see photos/README.md)');
    return 0;
  }
  console.log(`${shots.length} shot(s), ${MODE.name}: ${MODE.viewport.width}×${MODE.viewport.height} @ dpr ${MODE.dpr} → ${MODE.out.width}×${MODE.out.height} JPEG q${MODE.quality}`);
  mkdirSync(MODE.dir, { recursive: true });

  ensureBuild();
  if (await portOpen(PORT)) throw new Error(`port ${PORT} is already in use — pass --port <free port 4400-4499>`);

  // detached → own process group, so killing the group also stops the vite child that npx spawns
  const server = spawn('npx', ['vite', 'preview', '--outDir', OUT_DIR, '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  server.stdout.on('data', () => {});
  server.stderr.on('data', (d) => process.stderr.write(`[preview] ${d}`));
  let serverKilled = false;
  const killServer = () => {
    if (serverKilled) return;
    serverKilled = true;
    for (const sig of ['SIGTERM']) {
      try {
        process.kill(-server.pid, sig);
      } catch {
        try {
          server.kill(sig);
        } catch {
          /* gone */
        }
      }
    }
    setTimeout(() => {
      try {
        process.kill(-server.pid, 'SIGKILL');
      } catch {
        /* gone */
      }
    }, 1500).unref();
  };
  process.on('exit', killServer);
  process.on('SIGINT', () => (killServer(), process.exit(130)));

  const errors = [];
  const rendered = [];
  let contextLost = false;
  let browser;
  const tAll = Date.now();
  try {
    await waitForPort(PORT);
    browser = await chromium.launch({ headless: true, executablePath: EXECUTABLE, args: LAUNCH_ARGS, timeout: 120000 });
    const page = await browser.newPage({ viewport: MODE.viewport, deviceScaleFactor: 1 });
    page.setDefaultTimeout(OP_TIMEOUT);
    page.on('console', (msg) => {
      const text = msg.text();
      if (msg.type() !== 'error') return;
      if (/Context Lost/i.test(text)) contextLost = true;
      else if (!isIgnorable(text)) errors.push(text);
    });
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

    const api = (fn, ...args) => page.evaluate(([f, a]) => new Function('a', `return (${f})(window.__house, ...a)`)(a), [fn, args]);
    /**
     * Runs in the page, in the animation frame right AFTER R3F's render (R3F re-queues its loop first
     * thing, so a callback queued now runs after it in the same frame, before the buffer is presented):
     * a 96×64 luminance signature of the canvas is compared with the previous call's; when the two
     * frames match (max difference ≤ 1/255) the full-resolution PNG of THIS frame is returned too.
     */
    const grab = () =>
      page.evaluate(
        () =>
          new Promise((done) =>
            requestAnimationFrame(() => {
              const c = document.querySelector('canvas');
              const t = document.createElement('canvas');
              t.width = 96;
              t.height = 64;
              const ctx = t.getContext('2d', { willReadFrequently: true });
              ctx.drawImage(c, 0, 0, 96, 64);
              const d = ctx.getImageData(0, 0, 96, 64).data;
              const sig = new Array(d.length / 4);
              let sum = 0;
              for (let i = 0; i < d.length; i += 4) {
                const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
                sig[i / 4] = Math.round(y);
                sum += y;
              }
              const prev = window.__photoPrevSig;
              window.__photoPrevSig = sig;
              let delta = Infinity;
              if (prev && prev.length === sig.length) {
                delta = 0;
                for (let i = 0; i < sig.length; i++) delta = Math.max(delta, Math.abs(sig[i] - prev[i]));
              }
              const stable = delta <= 1;
              done({ stable, delta, mean: sum / sig.length, w: c.width, h: c.height, png: stable ? c.toDataURL('image/png') : null });
            }),
          ),
      );

    console.log(`loading the app (port ${PORT})…`);
    const tLoad = Date.now();
    await page.goto(`http://localhost:${PORT}/?dpr=${MODE.dpr}`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => typeof window.__house === 'object', null, { timeout: 60000 });
    // Enter photo mode at the first shot straight away (forces quality 'high', ceilings, no UI).
    await api('(h) => h.applyProposal()');
    await api('(h, c) => h.photo(c)', { position: shots[0].position, target: shots[0].target, fov: shots[0].fov, exposure: shots[0].exposure });
    await page.waitForFunction(
      () => {
        const h = window.__house;
        return !!h?.scene && h.scene.children.length > 5 && (h.frames ?? 0) > 0;
      },
      null,
      { timeout: OP_TIMEOUT, polling: 500 },
    );
    // Software GL: the first frame compiles every shader and uploads every texture (minutes); the
    // per-shot stability check below takes care of anything that settles later.
    console.log(`  app ready in ${secs(tLoad)} s`);

    const windowIds = new Set(await api('(h) => h.windows'));

    for (const s of shots) {
      const t0 = Date.now();
      try {
        for (const id of Object.keys(s.overrides ?? {})) if (!windowIds.has(id)) throw new Error(`override for unknown window "${id}"`);
        await api('(h) => h.applyProposal()');
        for (const [id, patch] of Object.entries(s.overrides ?? {})) await api('(h, id, p) => h.setCovering(id, p)', id, patch);
        await api('(h, c) => h.photo(c)', { position: s.position, target: s.target, fov: s.fov, exposure: s.exposure });
        // The store change is committed synchronously (zustand → React sync lane) before page.evaluate
        // returns, so the next frame already shows the new state (it compiles any new covering shader
        // and refreshes the frozen shadow map). A final frame costs over a minute here, so no blind
        // waiting: grab that frame's signature, then keep the first frame identical to its predecessor
        // (a late change, e.g. the reflection pass, only costs one more frame).
        await page.evaluate(() => {
          window.__photoPrevSig = null;
        });
        let tg = Date.now();
        await grab();
        const frameLog = [`${secs(tg)}`];
        let shot = null;
        let last = null;
        let grabs = 1;
        for (let i = 0; i < 6 && !shot; i++) {
          tg = Date.now();
          last = await grab();
          grabs += 1;
          frameLog.push(`${secs(tg)}${last.stable ? '' : `(Δ${last.delta})`}`);
          if (last.stable) shot = last;
        }
        if (!shot) throw new Error(`the frame never stabilised (6 tries, last difference ${last?.delta})`);
        if (shot.mean < 2) throw new Error(`the captured frame is black (mean luminance ${shot.mean.toFixed(2)})`);
        const file = join(MODE.dir, `${s.id}.jpg`);
        tg = Date.now();
        const info = encodeJpeg(shot.png, file, MODE.out, MODE.quality);
        frameLog.push(`encode ${secs(tg)}`);
        rendered.push(file);
        console.log(`  ${s.id}: ${secs(t0)} s — ${grabs} frames [${frameLog.join(', ')} s], canvas ${shot.w}×${shot.h} → ${info}, mean luma ${shot.mean.toFixed(0)} → ${file.slice(ROOT.length + 1)}`);
      } catch (e) {
        errors.push(`${s.id}: ${e.message}`);
        console.error(`  ${s.id}: FAILED after ${secs(t0)} s — ${e.message}`);
      }
      if (contextLost) {
        errors.push('WebGL context lost');
        break;
      }
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    killServer();
  }
  console.log(`done: ${rendered.length}/${shots.length} shot(s) in ${secs(tAll)} s`);
  if (errors.length) {
    console.error('errors:');
    for (const e of errors) console.error(`  - ${e}`);
  }
  return errors.length > 0 || rendered.length < shots.length ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
