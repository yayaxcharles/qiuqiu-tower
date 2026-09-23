/**
 * 事件畫面那一塊的載入（2026-09-23 推前審查 低-1）。
 *
 * 事件畫面改成用到才載之後，多了一個風險：地圖預抓那一下網路剛好斷一下，瀏覽器會**記住那個網址失敗**，
 * 之後每次走進事件格都直接失敗（實測 Chrome：同一個網址再載一樣失敗，網址後面換個參數就好）。
 * 連線時只剩「重新整理」一條路＝這一局結束。所以：
 * - 同一時間只抓一次，地圖預抓、走進事件格、載入畫面共用同一次；
 * - 失敗了從錯誤訊息拿出那一塊的網址，加 `?retry=N` 再抓（最多兩次，隔 0.6、1.2 秒）；
 *   錯誤訊息沒寫網址的瀏覽器（Safari）就照原本的方式再試；
 * - 還是失敗就往外丟（載入畫面顯示「再試一次」），而且**下一次再叫會整個重來**，不會永遠卡在上一次的失敗。
 * 事件文案跟事件畫面打成同一塊（除錯總覽經由事件畫面拿文案，見 debug.ts），所以只有一個網址要換。
 */

type Importer = () => Promise<unknown>;

let importer: Importer = () => import('./screens/event');
/** 用網址載入（換了參數的那一次）。拆出來是為了測試換得掉 */
let importUrl: (url: string) => Promise<unknown> = (url) => import(/* @vite-ignore */ url);
let wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

let pending: Promise<unknown> | null = null;
let retries = 0;

/** 從「動態載入失敗」的錯誤訊息裡拿出那一塊的網址（Chrome、Firefox 會寫；Safari 不寫） */
export function failedModuleUrl(error: unknown): string | null {
  const m = /(https?:\/\/[^\s'"]+?\.js)(?:\?[^\s'"]*)?(?=$|[\s'"])/.exec(String(error instanceof Error ? error.message : error));
  return m ? m[1]! : null;
}

async function attempt(): Promise<unknown> {
  try {
    return await importer();
  } catch (first) {
    const url = failedModuleUrl(first);
    for (let i = 1; i <= 2; i++) {
      await wait(600 * i);
      try {
        retries += 1;
        return await (url ? importUrl(`${url}?retry=${retries}`) : importer());
      } catch { /* 再試一次 */ }
    }
    throw first;
  }
}

/** 載入事件畫面（成功過就一直是那一次；失敗了下一次叫會重來） */
export function loadEventScreen(): Promise<unknown> {
  if (!pending) pending = attempt().catch((error: unknown) => { pending = null; throw error; });
  return pending;
}

/** 測試用 */
export function _setEventLoaderForTest(opts: { importer?: Importer; importUrl?: (url: string) => Promise<unknown>; wait?: (ms: number) => Promise<void> } = {}): void {
  if (opts.importer) importer = opts.importer;
  if (opts.importUrl) importUrl = opts.importUrl;
  if (opts.wait) wait = opts.wait;
  pending = null;
  retries = 0;
}
