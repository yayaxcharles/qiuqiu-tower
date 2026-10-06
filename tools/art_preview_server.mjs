// 美術改版本機預覽（2026-10-06）：把打包好的 dist 用固定埠 5193 端出來，不連線上、不動存檔以外的東西。
// 用法：node tools/art_preview_server.mjs [dist 路徑]   → 印出網址後一直跑，關掉視窗就停。
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = 'qiuqiu-tower-coop';
const PORT = 5193;
const dist = process.argv[2] || join(fileURLToPath(new URL('..', import.meta.url)), 'dist');
if (!existsSync(join(dist, 'index.html'))) { console.error('dist 裡沒有 index.html，先 SITE_NAME=' + SITE + ' npm run build'); process.exit(2); }
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.ico': 'image/x-icon' };
const prefix = `/${SITE}/`;
createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/' || p === `/${SITE}`) { res.writeHead(302, { location: prefix }); res.end(); return; }
  if (!p.startsWith(prefix)) { res.writeHead(404); res.end('not found'); return; }
  p = p.slice(prefix.length) || 'index.html';
  if (p.endsWith('/')) p += 'index.html';
  const file = normalize(join(dist, p));
  if (!file.startsWith(normalize(dist)) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache' });
  createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1', () => {
  console.log(`http://127.0.0.1:${PORT}${prefix}`);
});
