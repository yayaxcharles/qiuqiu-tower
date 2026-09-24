import { BASE, manifestImagePaths } from './assets';

/**
 * 掛上圖片離線快取（`public/sw.js`，2026-09-24 使用者：「我想優化載入的速度」）。
 *
 * 只在打包版掛：開發伺服器的檔名沒有雜湊碼，掛了也收不到東西，反而讓改圖之後看不到新圖。
 * 瀏覽器不支援、或註冊失敗（私密視窗、檔案協定）就算了，遊戲照常從網路抓。
 * 掛好之後把「這一版素材清單裡所有圖的路徑」傳過去，快取裡舊版換掉的圖就被清掉（見 sw.js 的 `keep`）。
 * 要在 `loadManifest()` 之後叫——清單還沒到的話名單是空的，sw.js 會當成「清單沒載到」而不清。
 */
export function registerAssetCache(): void {
  const dev = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV;
  if (dev || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE }).catch(() => undefined);
  void navigator.serviceWorker.ready.then((reg) => {
    reg.active?.postMessage({ type: 'keep', paths: manifestImagePaths().map((p) => `${BASE}${p}`) });
  }).catch(() => undefined);
}
