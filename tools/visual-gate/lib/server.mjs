// 本機預覽：在閘門自己的行程裡開一個靜態檔伺服器，把 dist/ 掛在 /<網站名>/ 底下。
// 不另外叫 `vite preview`：伺服器跟閘門同一個行程，閘門結束它就跟著關，不會留下要殺的背景行程。
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};

export function startServer(dist, siteName) {
  const prefix = `/${siteName}/`;
  const server = createServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      let p = decodeURIComponent(url.pathname);
      if (p === '/' || p === `/${siteName}`) { res.writeHead(302, { location: prefix }); res.end(); return; }
      if (!p.startsWith(prefix)) { res.writeHead(404); res.end('not found'); return; }
      p = p.slice(prefix.length) || 'index.html';
      if (p.endsWith('/')) p += 'index.html';
      const file = normalize(join(dist, p));
      if (!file.startsWith(normalize(dist)) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return; }
      const size = statSync(file).size;
      const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
      const headers = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'no-cache' };
      if (range) {
        const start = range[1] ? Number(range[1]) : 0;
        const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
        res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
        createReadStream(file, { start, end }).pipe(res);
        return;
      }
      res.writeHead(200, { ...headers, 'content-length': size });
      if (req.method === 'HEAD') { res.end(); return; }
      createReadStream(file).pipe(res);
    } catch (e) {
      res.writeHead(500); res.end(String(e));
    }
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    // 0＝讓系統挑一個沒人用的埠；只聽本機
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ url: `http://127.0.0.1:${port}${prefix}`, port, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }) });
    });
  });
}
