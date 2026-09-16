/*
 * 打包時把靜態素材的檔名改成「原名－內容雜湊碼」（2026-09-16）。
 *
 * 為什麼要有這支
 * --------------
 * GitHub Pages 對每個檔案一律回 `Cache-Control: max-age=600`（十分鐘），而且改不了。
 * 素材的檔名是固定的（`assets/bg/event_blocked_r0.webp`），所以換了圖之後，
 * 十分鐘內回來的玩家瀏覽器會直接用手上那份舊的，畫面就變成「新程式配舊圖」——
 * 最難查的那種：本機正常、線上有人看到怪東西、過十分鐘又自己好了。
 *
 * 加了雜湊碼之後，內容一變檔名就變，**舊網址永遠對應舊內容**，
 * 新的一版去要的是一個從來沒被快取過的網址，一定拿到新的。
 * 主程式（`main-7ti3UEcU.js`）本來就是 Vite 這樣做的，這支只是把同一招套到素材上。
 *
 * 買到什麼、沒買到什麼
 * --------------------
 * 買到的是「不會拿到過期的圖」。**沒有**買到「少問伺服器幾次」——
 * 瀏覽器照樣照 `max-age=600` 到期就回頭問一次，只是這次拿到的是 304（沒變，不用重傳內容）。
 * 要連問都不問，得再加一層 service worker 做 cache-first，這一輪不做。
 *
 * 規矩
 * ----
 * 1. **不動 `public/` 底下的原始檔名。** 一整套生圖工具（`tools/` 的 Python 腳本、
 *    `tools/codex_jobs/` 的工單）都靠現在的檔名運作。改名只發生在 `dist/`。
 * 2. **`assets/manifest.json` 自己不加雜湊。** 它是入口：瀏覽器每次都得問它一次，
 *    才知道其他檔案的新名字。它加了雜湊就沒人找得到它了。
 * 3. **不碰 Vite 自己打包出來的東西**（`main-*.js`、`main-*.css`、`index.html`）。
 *    那邊本來就有雜湊，而且 `tools/prepush_gate.sh` 要靠 `main-*.js` 這個檔名對帳。
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import type { Plugin } from 'vite';

/** 素材清單的位置（相對於 `dist/`）。它是入口，不加雜湊 */
const MANIFEST_REL = 'assets/manifest.json';

/**
 * 這些副檔名不加雜湊。
 *
 * `.js`／`.css`／`.map` 是 Vite 自己打包的產物（已經有雜湊）；`.html` 是進入點；
 * 其餘幾個是「網址被別人寫死、改了就找不到」的那一類（`robots.txt`、`.webmanifest`、favicon）。
 * 清單以外的副檔名一律加雜湊——這樣以後進了新的素材格式（png、ogg、woff2…）不會漏掉。
 */
const SKIP_EXT = new Set([
  '.html', '.htm', '.js', '.mjs', '.cjs', '.css', '.map', '.json',
  '.txt', '.xml', '.webmanifest', '.ico',
]);

/** 建置端的對照表（`原始相對路徑 → 帶雜湊的相對路徑`）。`tools/check_size.py` 靠它把分關載入的圖認回來 */
const HASH_MAP_REL = join('.vite', 'asset-hashes.json');

/** 遞迴列出 `root` 底下所有檔案，回傳相對 `root` 的路徑（一律用斜線） */
function listFiles(root: string, sub = ''): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(root, sub), { withFileTypes: true })) {
    const rel = sub ? `${sub}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...listFiles(root, rel));
    else out.push(rel);
  }
  return out;
}

/**
 * 內容雜湊碼：sha256 取前 8 碼（base64url）。
 *
 * 只吃檔案內容，不吃時間、不吃路徑——所以**同樣的內容重建兩次會得到同樣的碼**。
 * 這一條是這支外掛能不能用的前提：要是每次打包所有圖都變成新網址，
 * 每次部署等於叫全部玩家重抓 30 MB，比不加還糟。
 */
function hashOf(buf: Uint8Array): string {
  return createHash('sha256').update(buf).digest('base64url').slice(0, 8);
}

/** 把巢狀結構裡的字串換成帶雜湊的路徑；換掉的原路徑登記進 `used` */
function swapPaths(node: unknown, renamed: Map<string, string>, used: Set<string>): unknown {
  if (typeof node === 'string') {
    const hashed = renamed.get(node);
    if (hashed === undefined) return node;
    used.add(node);
    return hashed;
  }
  if (Array.isArray(node)) return node.map((v) => swapPaths(v, renamed, used));
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) out[k] = swapPaths(v, renamed, used);
    return out;
  }
  return node;
}

/** 蒐集巢狀結構裡所有「看起來是檔案路徑」的字串，拿去驗檔案在不在 */
function collectPaths(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') {
    if (node.includes('/') && extname(node) !== '') out.push(node);
  } else if (Array.isArray(node)) {
    for (const v of node) collectPaths(v, out);
  } else if (node && typeof node === 'object') {
    for (const v of Object.values(node as Record<string, unknown>)) collectPaths(v, out);
  }
  return out;
}

export function assetHash(): Plugin {
  let root = '';
  let outDir = '';
  /** Vite 自己打包出來的檔案（`assets/main-*.js` 那些），一律不碰 */
  const emitted = new Set<string>();

  return {
    name: 'qiuqiu-asset-hash',
    apply: 'build',
    configResolved(cfg) {
      root = cfg.root;
      outDir = resolve(cfg.root, cfg.build.outDir);
    },
    writeBundle(_options, bundle) {
      for (const name of Object.keys(bundle)) emitted.add(name.split('\\').join('/'));
    },
    closeBundle() {
      // `public/` 是在 `renderStart` 就複製進 `dist/` 的（Vite 的 `prepareOutDir`），
      // 所以 `closeBundle` 這個最後的鉤子裡，素材與打包產物都已經在位子上了
      if (!existsSync(outDir)) return;

      const renamed = new Map<string, string>();
      const byExt = new Map<string, number>();
      for (const rel of listFiles(outDir).sort()) {
        const name = rel.slice(rel.lastIndexOf('/') + 1);
        if (name.startsWith('.')) continue;                 // `.nojekyll` 這一類不能改名
        if (rel === MANIFEST_REL) continue;                 // 入口，見檔頭第 2 條
        if (emitted.has(rel)) continue;                     // Vite 自己的產物，見檔頭第 3 條
        const ext = extname(name);
        if (ext === '' || SKIP_EXT.has(ext.toLowerCase())) continue;

        const abs = join(outDir, rel);
        const hashed = `${rel.slice(0, rel.length - ext.length)}-${hashOf(readFileSync(abs))}${ext}`;
        renameSync(abs, join(outDir, hashed));
        renamed.set(rel, hashed);
        byExt.set(ext.toLowerCase(), (byExt.get(ext.toLowerCase()) ?? 0) + 1);
      }

      // ---- 把清單改寫成新路徑 ----
      const manifestPath = join(outDir, MANIFEST_REL);
      if (!existsSync(manifestPath)) {
        throw new Error(`[素材雜湊] 找不到 ${MANIFEST_REL}——沒有它，改了名的圖全遊戲都找不到`);
      }
      const used = new Set<string>();
      const next = swapPaths(
        JSON.parse(readFileSync(manifestPath, 'utf-8')) as unknown, renamed, used,
      ) as Record<string, unknown>;

      /*
       * 不走清單分類的靜態檔另外列一份平表（`原始相對路徑 → 帶雜湊的相對路徑`）。
       *
       * 音效（`assets/sfx/*.mp3`）、背景音樂（`bgm/*.mp3`）、過場影片（`video/*.mp4`）
       * 這三類在程式裡是**照名字現組路徑**的（`audio.ts`／`bgm.ts`／`video.ts`），
       * 從來沒進過 `manifest.json` 的分類。執行期由 `assets.ts` 的 `fileUrl()` 查這張表；
       * 查不到就照原路徑走（開發伺服器就是這條，那邊的檔名本來就沒有雜湊）。
       *
       * 只放「清單分類沒用到的」46 筆，不放全部 1327 筆：清單是每次開遊戲都得重新問一次的入口，
       * 多塞一份完整對照表會讓它從 75 KB 變成快 200 KB。
       */
      const files: Record<string, string> = {};
      for (const [orig, hashed] of renamed) if (!used.has(orig)) files[orig] = hashed;
      next['files'] = files;

      // 清單指到的檔案要真的在。這一條擋的是「改名漏了一批、畫面全變灰剪影」那種靜音失效
      const missing = collectPaths(next).filter((p) => !existsSync(join(outDir, p)));
      if (missing.length > 0) {
        throw new Error(`[素材雜湊] 清單指到 ${missing.length} 個不存在的檔案，前幾個：\n${missing.slice(0, 5).join('\n')}`);
      }
      // 壓成一行：這是每次開遊戲都要下載的入口，省下來的都是實打實的首載時間
      writeFileSync(manifestPath, JSON.stringify(next), 'utf-8');

      // ---- 建置端的對照表（不進 dist、不上線）----
      // `tools/check_size.py` 要拿它把 `docs/分關載入.json` 裡的原始路徑對回改名後的檔案，
      // 不然 880 張分關載入的圖會被當成首載、大小檢查必定超標
      const mapPath = join(root, HASH_MAP_REL);
      mkdirSync(join(root, '.vite'), { recursive: true });
      writeFileSync(mapPath, JSON.stringify(Object.fromEntries(renamed), null, 1) + '\n', 'utf-8');

      const tally = [...byExt].sort().map(([ext, n]) => `${ext} ${n}`).join('、');
      console.log(`[素材雜湊] ${renamed.size} 個檔案加上內容雜湊碼（${tally}）；清單另列 ${Object.keys(files).length} 筆不走分類的`);
    },
  };
}
