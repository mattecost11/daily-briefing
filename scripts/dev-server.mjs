// Zero-dependency static server for local preview of the docs/ folder.
// Usage: npm run serve  (then open http://localhost:4173)

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..', 'docs');
const PORT = Number(process.env.PORT || 4173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      let path = decodeURIComponent(url.pathname);
      if (path.endsWith('/')) path += 'index.html';
      const filePath = join(ROOT, path);
      if (!filePath.startsWith(ROOT)) {
        res.writeHead(400).end('bad path');
        return;
      }
      const s = await stat(filePath).catch(() => null);
      if (!s || !s.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
        return;
      }
      const type = MIME[extname(filePath)] || 'application/octet-stream';
      const buf = await readFile(filePath);
      res.writeHead(200, {
        'Content-Type': type,
        'Cache-Control': 'no-store',
        'Service-Worker-Allowed': '/'
      });
      res.end(buf);
    } catch (e) {
      res.writeHead(500).end(String(e));
    }
  })
  .listen(PORT, () => {
    console.log(`Daily Briefing preview on http://localhost:${PORT}`);
  });
