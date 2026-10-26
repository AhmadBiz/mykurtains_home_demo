/**
 * Screenshots + quick performance read-out of the production build.
 *
 *   node scripts/screenshot.mjs            → screenshots/*.png and a metrics summary
 *   node scripts/screenshot.mjs --preview  → public/preview.jpg (stage only, 'all' view), for the house list
 *
 * Builds when dist/ is missing, serves it with `vite preview` on :4173, drives Chromium through Playwright.
 * Exits 1 when the page logs a console error or throws.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'screenshots');
const PORT = 4173;
const URL = `http://localhost:${PORT}/`;
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PREVIEW = process.argv.includes('--preview');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

// ---------------------------------------------------------------------------------------------
// build + serve
// ---------------------------------------------------------------------------------------------
if (!existsSync(join(ROOT, 'dist', 'index.html'))) {
  console.log('dist/ missing → npm run build');
  const r = spawnSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) process.exit(1);
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
const stopServer = () => {
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
};
process.on('exit', stopServer);

await new Promise((res, rej) => {
  let log = '';
  const t = setTimeout(() => rej(new Error('vite preview did not start:\n' + log)), 20000);
  const on = (d) => {
    log += d;
    if (log.includes(String(PORT))) {
      clearTimeout(t);
      res();
    }
  };
  server.stdout.on('data', on);
  server.stderr.on('data', on);
  server.on('exit', (c) => rej(new Error(`vite preview exited (${c}):\n${log}`)));
});

// ---------------------------------------------------------------------------------------------
// browser helpers
// ---------------------------------------------------------------------------------------------
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const problems = [];

/** Records FCP / LCP before any page script runs. */
const PERF_INIT = () => {
  window.__perf = { fcp: 0, lcp: 0 };
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__perf.fcp = e.startTime;
    }).observe({ type: 'paint', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__perf.lcp = e.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    /* unsupported */
  }
};

async function newPage(viewport, label) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'fr-CA' });
  const page = await ctx.newPage();
  await page.addInitScript(PERF_INIT);
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`[${label}] console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`[${label}] pageerror: ${e.message}`));
  return { ctx, page };
}

/** Navigate and wait until the model has placed its chips and the first ease-in has settled. */
async function open(page, settle = 1400) {
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForSelector('.hm-chip[data-placed]', { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  await sleep(settle);
}

const house = (page, fn, ...args) => page.evaluate(([f, a]) => window.__house[f](...a), [fn, args]);
const shot = (page, name, opts = {}) => page.screenshot({ path: join(OUT, `${name}.png`), ...opts });

// ---------------------------------------------------------------------------------------------
// --preview: thumbnail for the house list
// ---------------------------------------------------------------------------------------------
if (PREVIEW) {
  const { ctx, page } = await newPage({ width: 1200, height: 750 }, 'preview');
  await open(page, 400);
  // Full-bleed stage: hide the header and the panel so the stage is exactly 1200×750.
  await page.addStyleTag({
    content: `.hd,.panel{display:none!important}
      .app,.layout{display:block!important;height:auto!important;padding:0!important;margin:0!important}
      .stage{width:1200px!important;height:750px!important;margin:0!important;border-radius:0!important;border:0!important}`,
  });
  await house(page, 'level', 'all');
  await sleep(2600); // re-layout of the model and the chips, then let the sway ease in
  const out = join(ROOT, 'public', 'preview.jpg');
  await page.locator('.stage').screenshot({ path: out, type: 'jpeg', quality: 82 });
  const box = await page.locator('.stage').boundingBox();
  console.log(`preview → ${out} (${Math.round(box.width)}×${Math.round(box.height)}, ${kb(statSync(out).size)})`);
  await ctx.close();
  await browser.close();
  stopServer();
  if (problems.length) {
    console.log('\nERRORS\n' + problems.join('\n'));
    process.exit(1);
  }
  process.exit(0);
}

mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------------------------------------
// desktop 1440×900
// ---------------------------------------------------------------------------------------------
{
  const { ctx, page } = await newPage({ width: 1440, height: 900 }, 'desktop');

  // transferred bytes by resource type (first, cold load)
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  const types = new Map();
  const bytes = { Document: 0, Script: 0, Stylesheet: 0, Font: 0, Other: 0 };
  const files = [];
  cdp.on('Network.responseReceived', (e) => types.set(e.requestId, { type: e.type, url: e.response.url }));
  cdp.on('Network.loadingFinished', (e) => {
    const r = types.get(e.requestId);
    if (!r) return;
    const k = r.type in bytes ? r.type : 'Other';
    bytes[k] += e.encodedDataLength;
    files.push(`${k.padEnd(10)} ${kb(e.encodedDataLength).padStart(9)}  ${r.url.replace(URL, '/')}`);
  });

  await open(page);
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });

  const m = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    return {
      dcl: nav.domContentLoadedEventEnd,
      fcp: window.__perf.fcp,
      lcp: window.__perf.lcp,
      stageNodes: document.querySelector('.stage').querySelectorAll('*').length,
      modelNodes: document.querySelectorAll('.stage .hm-layer *').length,
      overflowX: document.documentElement.scrollWidth > innerWidth,
    };
  });

  await shot(page, '01-overview');
  for (const [i, l] of [['02', 'upper'], ['03', 'ground'], ['04', 'basement']]) {
    await house(page, 'level', l);
    await sleep(1500);
    if (l === 'upper') m.stageNodesUpper = await page.evaluate(() => document.querySelector('.stage').querySelectorAll('*').length);
    await shot(page, `${i}-${l}`);
  }

  // drag the stage ~200 px over 2 s and count animation frames meanwhile
  await house(page, 'level', 'all');
  await sleep(1500);
  const box = await page.locator('.stage').boundingBox();
  const cx = box.x + box.width * 0.45;
  const cy = box.y + box.height * 0.55;
  await page.evaluate(() => {
    window.__frames = [];
    const tick = (t) => {
      window.__frames.push(t);
      if (!window.__stopFrames) requestAnimationFrame(tick);
    };
    window.__stopFrames = false;
    requestAnimationFrame(tick);
  });
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  const t0 = Date.now();
  const STEPS = 60;
  for (let s = 1; s <= STEPS; s++) {
    await page.mouse.move(cx + (200 * s) / STEPS, cy + (10 * s) / STEPS);
    const wait = t0 + (2000 * s) / STEPS - Date.now();
    if (wait > 0) await sleep(wait);
  }
  await page.mouse.up();
  const fr = await page.evaluate(() => {
    window.__stopFrames = true;
    const f = window.__frames;
    const gaps = f.slice(1).map((t, i) => t - f[i]);
    const span = f[f.length - 1] - f[0];
    return {
      frames: f.length,
      fps: ((f.length - 1) * 1000) / span,
      worst: Math.max(...gaps),
      over33: gaps.filter((g) => g > 33.4).length,
    };
  });
  await sleep(1200);
  await shot(page, '05-rotated');

  // one panel screenshot per covering type
  const cases = [
    ['10-curtains-sheer', 'w-ch1-e', { type: 'curtains', color: 'navy', open: 0.65, sheer: true }],
    ['11-sheers', 'w-sam-e', { type: 'sheers', color: 'white', open: 0.15 }],
    ['12-roller', 'w-ch6-n', { type: 'roller', color: 'grey-lf', open: 0.55 }],
    ['13-roman', 'w-ch2-e', { type: 'roman', color: 'olive', open: 0.45 }],
    ['14-cellular', 'w-ch5-n', { type: 'cellular', color: 'cream', open: 0.35 }],
    ['15-venetian', 'w-familiale-e', { type: 'venetian', color: 'oak', open: 0.2, tilt: 0.4 }],
    ['16-vertical', 'd-patio', { type: 'vertical', color: 'ivory-fabric', open: 0.3, tilt: 0.5 }],
    ['17-shutters', 'w-ch3-w', { type: 'shutters', color: 'white', open: 0.15, tilt: 0.3 }],
    ['18-none', 'w-escalier', { type: 'none', color: 'none' }],
    ['19-curtains-kitchen', 'w-cuisine-s', { type: 'curtains', color: 'sage', open: 0.7, sheer: false }],
  ];
  for (const [name, id, patch] of cases) {
    await house(page, 'set', id, patch);
    await house(page, 'select', id);
    await sleep(1100);
    const sel = await page.evaluate(() => window.__house.state().selectedWindowId);
    if (sel !== id) problems.push(`[desktop] ${name}: selected ${sel}, expected ${id}`);
    await page.evaluate(() => document.querySelector('.panel')?.scrollTo(0, 0));
    await shot(page, name, { clip: await page.locator('.panel').boundingBox() });
    if (name === '10-curtains-sheer') await shot(page, '06-selected');
  }
  await house(page, 'select', null);
  await ctx.close();

  console.log('\nTransferred on a cold load (encoded bytes, as served by vite preview):');
  for (const f of files.sort()) console.log('  ' + f);
  for (const [k, v] of Object.entries(bytes)) if (v) console.log(`  total ${k.padEnd(10)} ${kb(v)}`);
  console.log('\nDesktop 1440×900');
  console.log(`  DOMContentLoaded        ${m.dcl.toFixed(0)} ms`);
  console.log(`  First contentful paint  ${m.fcp.toFixed(0)} ms`);
  console.log(`  Largest contentful paint ${m.lcp.toFixed(0)} ms`);
  console.log(`  DOM nodes in .stage     ${m.stageNodes} ('all') · ${m.stageNodesUpper} ('upper') · model planes only ${m.modelNodes}`);
  console.log(`  Horizontal overflow     ${m.overflowX ? 'YES' : 'no'}`);
  console.log(
    `  Drag rotation (2 s)     ${fr.frames} frames · ${fr.fps.toFixed(1)} fps · worst gap ${fr.worst.toFixed(1)} ms · ${fr.over33} gaps > 33 ms`,
  );
}

// ---------------------------------------------------------------------------------------------
// phone 390×844
// ---------------------------------------------------------------------------------------------
{
  const { ctx, page } = await newPage({ width: 390, height: 844 }, 'phone');
  await open(page);
  const pm = await page.evaluate(() => ({
    fcp: window.__perf.fcp,
    lcp: window.__perf.lcp,
    overflowX: document.documentElement.scrollWidth > innerWidth,
  }));
  await shot(page, 'm1-overview');
  await house(page, 'select', 'w-salon-n');
  await sleep(1600); // smooth scroll to the sheet
  await shot(page, 'm2-selected');
  await house(page, 'select', null);
  await page.evaluate(() => window.scrollTo(0, 0));
  await house(page, 'level', 'upper');
  await sleep(1500);
  await shot(page, 'm3-upper');
  const ov = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  await ctx.close();
  console.log('\nPhone 390×844');
  console.log(`  FCP ${pm.fcp.toFixed(0)} ms · LCP ${pm.lcp.toFixed(0)} ms · horizontal overflow ${pm.overflowX || ov ? 'YES' : 'no'}`);
}

await browser.close();
stopServer();
console.log(`\nScreenshots in ${OUT}`);
if (problems.length) {
  console.log('\nERRORS\n' + problems.join('\n'));
  process.exit(1);
}
process.exit(0);
