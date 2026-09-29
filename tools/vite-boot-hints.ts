/*
 * 開場提示（2026-09-29 效能：封面早一點出來）：打包時在 `index.html` 的 <head> 多寫幾行「先抓」的提示。
 *
 * 為什麼要有這支
 * --------------
 * 封面出現之前要依序等三段：
 *   1. 下載主程式（約 218 KB，壓縮後）；
 *   2. 主程式跑起來之後才**開始**抓素材清單 `assets/manifest.json`（約 46 KB）與繁中底子 `zh`（+ `cardtext`）；
 *   3. 清單到了才畫封面。
 * 第 2 段是排隊排出來的：清單的網址其實打包時就知道（檔名固定、後面夾打包編號），
 * 只是瀏覽器要等主程式跑到 `loadManifest()` 那一行才知道要抓它。慢網路（來回 150 毫秒、處理器慢 4 倍）量到
 * 主程式 1.6 秒才跑到那一行，清單 2.1 秒才到。
 *
 * 這支讓瀏覽器一讀到 <head> 就把清單與 `zh` 那兩小塊跟主程式**一起**抓：
 * - 清單：`<link rel="preload" as="fetch" crossorigin>`。**網址要跟 `assets.ts` 的 `loadManifest()` 一字不差**
 *  （同一個打包編號），`crossorigin` 也不能漏——`fetch()` 預設是 cors＋同源帶憑證，提示的請求模式要跟它一樣，
 *   瀏覽器才認得是同一個、直接拿去用；對不上的話會**抓兩次**，反而更慢；
 * - `zh` 與它靜態引用的分塊：`<link rel="modulepreload">`（繁中底子每個人開場都要，見 `i18n/index.ts` 的 `initLang`）。
 *   不改成靜態引用：那會把它併進主程式、動到分包的測試（`event_text_split` 那一類）。
 *
 * 只在打包時做（`apply: 'build'`）；開發伺服器不需要。只動 `index.html`，連線測試頁不動。
 */
import type { HtmlTagDescriptor, Plugin } from 'vite';

/** `zh` 分塊的來源檔（找它在打包結果裡叫什麼名字） */
const ZH_ENTRY = /\/src\/i18n\/zh\.ts$/;

export function bootHints(buildTag: string): Plugin {
  let base = '/';
  return {
    name: 'qiuqiu-boot-hints',
    apply: 'build',
    configResolved(cfg) { base = cfg.base; },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!/(?:^|\/)index\.html$/.test(ctx.filename.split('\\').join('/'))) return html;
        const tags: HtmlTagDescriptor[] = [{
          tag: 'link',
          attrs: { rel: 'preload', as: 'fetch', crossorigin: true, href: `${base}assets/manifest.json${buildTag ? `?v=${buildTag}` : ''}` },
          injectTo: 'head',
        }];
        const bundle = ctx.bundle ?? {};
        const zh = Object.values(bundle).find((c) => c.type === 'chunk' && ZH_ENTRY.test((c.facadeModuleId ?? '').split('\\').join('/')));
        if (zh && zh.type === 'chunk') {
          for (const file of [zh.fileName, ...zh.imports]) {
            const href = `${base}${file}`;
            if (html.includes(`"${href}"`)) continue;   // 主程式本來就先抓的（Vite 自己寫的 modulepreload）不重寫
            tags.push({ tag: 'link', attrs: { rel: 'modulepreload', crossorigin: true, href }, injectTo: 'head' });
          }
        }
        return { html, tags };
      },
    },
  };
}
