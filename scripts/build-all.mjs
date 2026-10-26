/**
 * Builds the whole site into ./dist:
 *   dist/index.html            landing page listing every house (from houses.json + site/index.html)
 *   dist/houses/<id>/          each house app, built with Vite base "/houses/<id>/"
 *
 * Usage: node scripts/build-all.mjs [--site-only] [--house <id>]
 */
import { readFileSync, writeFileSync, rmSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const siteOnly = args.includes('--site-only');
const only = args.includes('--house') ? args[args.indexOf('--house') + 1] : null;

const houses = JSON.parse(readFileSync(path.join(root, 'houses.json'), 'utf8'));
const dist = path.join(root, 'dist');

const run = (cmd, cwd) => {
  console.log(`\n$ ${cmd}   (in ${path.relative(root, cwd) || '.'})`);
  execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, CI: '1' } });
};

if (!siteOnly) {
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(path.join(dist, 'houses'), { recursive: true });

  for (const h of houses) {
    if (only && h.id !== only) continue;
    const dir = path.join(root, 'houses', h.id);
    if (!existsSync(path.join(dir, 'package.json'))) throw new Error(`houses/${h.id}/package.json not found`);
    const installCmd = existsSync(path.join(dir, 'package-lock.json')) ? 'npm ci --no-audit --no-fund' : 'npm install --no-audit --no-fund';
    if (!existsSync(path.join(dir, 'node_modules'))) run(installCmd, dir);
    run('npx tsc -b', dir);
    run(`npx vite build --base /houses/${h.id}/`, dir);
    cpSync(path.join(dir, 'dist'), path.join(dist, 'houses', h.id), { recursive: true });
    console.log(`✓ houses/${h.id} → dist/houses/${h.id}`);
  }
} else {
  mkdirSync(dist, { recursive: true });
}

// ---- landing page ----
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cards = houses
  .map((h) => {
    const thumb = h.thumbnail ? `/houses/${h.id}/${h.thumbnail}` : '';
    const stats = (h.stats || []).map((s) => `<li>${esc(s)}</li>`).join('');
    return `
      <a class="card" href="/houses/${esc(h.id)}/">
        <div class="thumb">
          ${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy" onerror="this.remove()" />` : ''}
          <div class="thumb-fallback" aria-hidden="true">🏠</div>
        </div>
        <div class="body">
          ${h.client ? `<div class="client">${esc(h.client)}</div>` : ''}
          <h2>${esc(h.name)}</h2>
          ${h.address ? `<div class="address">📍 ${esc(h.address)}</div>` : h.nameEn ? `<div class="sub">${esc(h.nameEn)}</div>` : ''}
          <p>${esc(h.description || '')}</p>
          ${stats ? `<ul class="stats">${stats}</ul>` : ''}
          <span class="cta">Ouvrir la maquette <span aria-hidden="true">→</span></span>
        </div>
      </a>`;
  })
  .join('\n');

const template = readFileSync(path.join(root, 'site', 'index.html'), 'utf8');
writeFileSync(path.join(dist, 'index.html'), template.replace('<!--HOUSES-->', cards).replace('<!--COUNT-->', String(houses.length)));
for (const f of ['styles.css', 'favicon.svg']) {
  const src = path.join(root, 'site', f);
  if (existsSync(src)) cpSync(src, path.join(dist, f));
}
console.log(`\n✓ landing page with ${houses.length} house(s) → dist/index.html`);
