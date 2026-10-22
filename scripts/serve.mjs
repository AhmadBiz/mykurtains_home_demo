/** Minimal static server for ./dist (local preview of the whole site): node scripts/serve.mjs [port] */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const port = Number(process.argv[2] || 4321);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    let p = decodeURIComponent(url.pathname);
    let file = path.join(root, p);
    if (!file.startsWith(root)) throw new Error('bad path');
    let s = await stat(file).catch(() => null);
    if (s && s.isDirectory()) {
      if (!p.endsWith('/')) { res.writeHead(302, { Location: p + '/' }); return res.end(); }
      file = path.join(file, 'index.html');
      s = await stat(file).catch(() => null);
    }
    if (!s) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(500); res.end('error');
  }
}).listen(port, () => console.log(`serving dist/ at http://localhost:${port}`));
