#!/usr/bin/env node
/**
 * Headless visual smoke test: builds (if needed), serves dist/ with `vite preview`, drives the app
 * through the debug API (window.__house, see src/store/useStore.ts) and saves PNGs to screenshots/.
 *
 *   npm run screenshot                 — the full tour → screenshots/*.png
 *   npm run screenshot -- --preview    — only public/preview.png: a 1200×750 shot of the <canvas>
 *                                        (no HUD) from the exterior-front viewpoint in 'high' quality,
 *                                        used as the thumbnail on the multi-house landing page.
 *   QUALITY=low npm run screenshot     — run the tour in the other quality tier ('high' is the default).
 *   ONLY=w-salon-n,w-ch1-e npm run screenshot
 *                                      — only the listed shots (comma-separated base names); every other
 *                                        view is skipped (the covering changes are still applied in order).
 *
 * Under SwiftShader a frame of the realism build takes several seconds (4096 shadow map, 37 lights,
 * post-processing), hence the long timeouts and the initial settle before the first shot.
 *
 * Exit code 1 when a page error or console error occurred (software-WebGL warnings are ignored).
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { createConnection } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'screenshots');
const PREVIEW_FILE = join(ROOT, 'public', 'preview.png');
const PORT = 4173;
const URL = `http://localhost:${PORT}`;
const PREVIEW_MODE = process.argv.includes('--preview');
const VIEWPORT = PREVIEW_MODE ? { width: 1200, height: 750 } : { width: 1280, height: 800 };
const QUALITY = PREVIEW_MODE ? 'high' : process.env.QUALITY === 'low' ? 'low' : 'high';
/** Optional shot filter (ONLY=name,name…); unset = the whole tour. */
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',').map((s) => s.trim()).filter(Boolean)) : null;
const want = (...names) => !ONLY || names.some((n) => ONLY.has(n));
/** Per-operation timeout: a software-GL frame can take > 5 s and a screenshot waits for one. */
const OP_TIMEOUT = 240000;
/** Exterior-front vantage (metres / radians) shared by the tour and the preview. */
const EXTERIOR_FRONT = [-14, -1.07 + 1.68, 16, -Math.PI / 2 + 0.25];

const TOUR = ['w-salon-n', 'd-patio', 'w-ch1-e', 'w-ch3-w', 'w-sdb2-n', 'w-familiale-e', 'w-escalier', 'w-cuisine-s'];
const CHANGES = {
  'w-salon-n': { type: 'shutters', color: 'oak', open: 0, tilt: 0.3 },
  'd-patio': { type: 'curtains', color: 'charcoal', open: 0.5, sheer: true },
  'w-ch1-e': { type: 'venetian', color: 'walnut', open: 0.3, tilt: 0.6 },
  'w-ch3-w': { type: 'roller', color: 'graphite-bo', open: 0.2 },
};

// ---------------------------------------------------------------- helpers
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findExecutable() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(base)) return undefined;
  const candidates = [];
  for (const dir of readdirSync(base)) {
    for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell', 'chrome-linux/chromium', 'chrome']) {
      const p = join(base, dir, rel);
      if (existsSync(p) && statSync(p).isFile()) candidates.push({ p, headlessShell: dir.includes('headless_shell') });
    }
  }
  // prefer the full chromium over the headless shell
  candidates.sort((a, b) => Number(a.headlessShell) - Number(b.headlessShell));
  return candidates[0]?.p;
}

function waitForPort(port, timeoutMs = 30000) {
  const t0 = Date.now();
  return new Promise((resolveP, reject) => {
    const tryOnce = () => {
      const sock = createConnection({ port, host: '127.0.0.1' });
      sock.once('connect', () => {
        sock.destroy();
        resolveP();
      });
      sock.once('error', () => {
        sock.destroy();
        if (Date.now() - t0 > timeoutMs) reject(new Error(`port ${port} not open after ${timeoutMs} ms`));
        else setTimeout(tryOnce, 250);
      });
    };
    tryOnce();
  });
}

const IGNORE = [/swiftshader/i, /software webgl/i, /GPU stall due to ReadPixels/i, /falling back to software/i, /GroupMarkerNotSet/i];
const isIgnorable = (text) => IGNORE.some((re) => re.test(text));

// ---------------------------------------------------------------- main
async function main() {
  if (!existsSync(join(DIST, 'index.html'))) {
    console.log('dist/ missing — running vite build');
    const r = spawnSync('npx', ['vite', 'build'], { cwd: ROOT, stdio: 'inherit' });
    if (r.status !== 0) throw new Error('vite build failed');
  }
  mkdirSync(OUT, { recursive: true });

  // detached → own process group, so killing the group also stops the vite child that npx spawns
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  server.stdout.on('data', () => {});
  server.stderr.on('data', (d) => process.stderr.write(`[preview] ${d}`));
  let serverKilled = false;
  const killServer = () => {
    if (serverKilled) return;
    serverKilled = true;
    const signalGroup = (sig) => {
      try {
        process.kill(-server.pid, sig);
      } catch {
        try {
          server.kill(sig);
        } catch {
          /* already gone */
        }
      }
    };
    signalGroup('SIGTERM');
    setTimeout(() => signalGroup('SIGKILL'), 1500).unref();
  };
  process.on('exit', killServer);

  const errors = [];
  const warnings = [];
  const screenshots = [];
  let contextLost = false;
  let browser;
  try {
    await waitForPort(PORT);

    const executablePath = findExecutable();
    const launchOpts = {
      headless: true,
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-gpu-sandbox'],
    };
    if (executablePath) launchOpts.executablePath = executablePath;
    try {
      browser = await chromium.launch(launchOpts);
    } catch (e) {
      console.warn(`launch with executablePath failed (${e.message}); retrying with the default browser`);
      delete launchOpts.executablePath;
      browser = await chromium.launch(launchOpts);
    }
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    page.setDefaultTimeout(OP_TIMEOUT);

    page.on('console', (msg) => {
      const type = msg.type();
      const text = msg.text();
      if (type === 'error') {
        if (/Context Lost/i.test(text)) {
          contextLost = true;
          warnings.push(text);
        } else if (!isIgnorable(text)) errors.push(text);
        else warnings.push(text);
      } else if (type === 'warning' && !isIgnorable(text)) warnings.push(text);
    });
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.__house === 'object', null, { timeout: 30000 });

    const frames = async (n = 2) =>
      page.evaluate(
        (count) =>
          new Promise((done) => {
            let i = 0;
            const tick = () => (++i >= count ? done() : requestAnimationFrame(tick));
            requestAnimationFrame(tick);
          }),
        n,
      );
    const SETTLE_FRAMES = 3;
    // Renderer statistics are accumulated over the settle frames (the post-processing chain resets
    // gl.info on every pass, so a single read only ever sees the final screen quad).
    const settle = async (ms) => {
      await sleep(ms);
      await page.evaluate(() => {
        const info = window.__house?.gl?.info;
        if (info) {
          info.autoReset = false;
          info.reset();
        }
      });
      await frames(SETTLE_FRAMES);
    };
    const shot = async (name, assessment = '') => {
      const file = join(OUT, `${name}.png`);
      // per-frame draw calls / triangles, averaged over the settle frames (window.__house.gl is set by
      // Scene.tsx). Read BEFORE the screenshot: page.screenshot waits for fresh frames, and with
      // autoReset off those would be accumulated too and inflate the per-frame estimate several-fold.
      const info = await page.evaluate((n) => {
        const info = window.__house?.gl?.info;
        if (!info) return 'n/a';
        const r = info.render;
        const s = `~${Math.round(r.calls / n)} calls, ~${Math.round(r.triangles / n)} tris per frame`;
        info.autoReset = true;
        return s;
      }, SETTLE_FRAMES);
      const t0 = Date.now();
      await page.screenshot({ path: file, timeout: OP_TIMEOUT });
      screenshots.push(`screenshots/${name}.png`);
      console.log(`  shot ${name}.png (${((Date.now() - t0) / 1000).toFixed(1)} s, ${info})${assessment ? ' — ' + assessment : ''}`);
    };
    const api = (fn, ...args) => page.evaluate(([f, a]) => new Function('a', `return (${f})(window.__house, ...a)`)(a), [fn, args]);
    // The scene mounts under its own <Suspense fallback={null}> (textures + HDRI), independent of the
    // HUD's `.lf` spinner: wait for the HUD, then for the scene graph to exist (Scene.tsx sets
    // window.__house.scene once it is mounted) and for a frame that actually drew it (info.render
    // .calls is the last frame's draw-call count; an empty scene draws nothing and the shot is blank).
    const waitForScene = async () => {
      await page.waitForFunction(() => !document.querySelector('.lf'), null, { timeout: OP_TIMEOUT });
      await page.waitForFunction(
        () => {
          const h = window.__house;
          return !!h?.scene && h.scene.children.length > 5 && (h.gl?.info?.render?.calls ?? 0) > 0;
        },
        null,
        { timeout: OP_TIMEOUT, polling: 500 },
      );
      await frames(2);
    };

    // ---- start
    await api('(h, q) => h.state().setQuality(q)', QUALITY);
    await api('(h) => h.start()');
    await waitForScene();
    // Software GL needs a long first settle (texture upload + shader compilation) or the shot is black.
    await settle(8000);

    if (PREVIEW_MODE) {
      await api('(h, v) => h.teleport(...v)', EXTERIOR_FRONT);
      await settle(3000);
      mkdirSync(dirname(PREVIEW_FILE), { recursive: true });
      // An element screenshot is a clip of the page, so the HUD overlaying the canvas would still be
      // captured: hide every other element for the shot (visibility is inherited but overridable).
      // Only the first <canvas> (the WebGL one) is kept — the minimap is a 2D canvas in the HUD.
      await page.addStyleTag({ content: '* { visibility: hidden !important; }' });
      await page.evaluate(() => document.querySelector('canvas')?.style.setProperty('visibility', 'visible', 'important'));
      await frames(2);
      await page.locator('canvas').first().screenshot({ path: PREVIEW_FILE, timeout: OP_TIMEOUT });
      screenshots.push('public/preview.png');
      console.log('  shot public/preview.png (canvas only, 1200×750, quality high)');
      await browser.close().catch(() => {});
      browser = undefined;
      killServer();
      const summary = { errors, warnings, screenshots, contextLost };
      console.log(JSON.stringify(summary, null, 2));
      return errors.length > 0 ? 1 : 0;
    }

    if (want('01-start')) await shot('01-start');

    // ---- window tour (default coverings)
    for (const id of TOUR) {
      if (!want(id)) continue;
      await api('(h, id) => h.goToWindow(id)', id);
      await settle(1200);
      await shot(id);
    }

    // ---- change some coverings
    for (const [id, patch] of Object.entries(CHANGES)) {
      await api('(h, id, patch) => h.setCovering(id, patch)', id, patch);
      if (!want(`${id}-changed`)) continue;
      await api('(h, id) => h.goToWindow(id)', id);
      await settle(1200);
      await shot(`${id}-changed`);
    }

    // ---- panels
    if (want('panel-windows', 'panel-covering')) {
      await api('(h) => h.setPanel("windows")');
      await settle(500);
      if (want('panel-windows')) await shot('panel-windows');
      await api('(h) => h.state().selectWindow("w-ch1-e")');
      await settle(500);
      if (want('panel-covering')) await shot('panel-covering');
      await api('(h) => h.setPanel("none")');
    }

    // ---- orbit / dollhouse
    if (want('orbit-ground', 'orbit-upper', 'orbit-basement')) {
      await api('(h) => { h.setMode("orbit"); h.state().setOrbitLevel("ground"); }');
      await settle(1500);
      if (want('orbit-ground')) await shot('orbit-ground');
      await api('(h) => h.state().setOrbitLevel("upper")');
      await settle(1200);
      if (want('orbit-upper')) await shot('orbit-upper');
      await api('(h) => h.state().setOrbitLevel("basement")');
      await settle(1200);
      if (want('orbit-basement')) await shot('orbit-basement');
    }

    // ---- exterior views
    if (want('exterior-front', 'exterior-rear')) {
      await api('(h) => h.setMode("walk")');
      await settle(300);
      await api('(h, v) => h.teleport(...v)', EXTERIOR_FRONT);
      await settle(1500);
      if (want('exterior-front')) await shot('exterior-front');
      await api('(h) => h.teleport(22, -1.07 + 1.68, 17, Math.PI / 2 - 0.3)');
      await settle(1500);
      if (want('exterior-rear')) await shot('exterior-rear');
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    killServer();
  }

  const summary = { errors, warnings, screenshots, contextLost };
  console.log(JSON.stringify(summary, null, 2));
  const failed = errors.length > 0 || (contextLost && screenshots.length === 0);
  return failed ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
