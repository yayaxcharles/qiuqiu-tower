/**
 * 動作圖集的「已解開」快取（2026-09-21 實機追蹤後加的）。
 *
 * 逐格動作是用畫布的 drawImage 從一張 1774×887 的圖集裁一格來畫。追蹤看到：每張圖集第一次
 * 畫到畫布時，瀏覽器在主執行緒同步解碼 webp，一次 12～18 毫秒（CPU 降速 4 倍時 58～73）——
 * 占出牌那一拍卡頓的一半以上；而且那份解碼快取只放得下四五張，爪擊四張輪流用就一直被擠掉重解。
 * 預載時的 `img.decode()` 對畫布沒有幫助。
 *
 * 改成預先解開存成 ImageBitmap，畫的時候直接拿它畫。兩個實測過的細節：
 * - **要從圖檔資料解，不能從 <img> 解**：`createImageBitmap(<img>)` 在 Chrome 是主執行緒同步解碼，
 *   33 張擠在一起讓序章卡了 0.45 秒（降速 4 倍 2.1 秒）。`fetch` 拿到檔案（瀏覽器快取裡就有）
 *   再 `createImageBitmap(blob)`，解碼會在背景執行緒做。
 * - **一次解一張**，排隊慢慢來，不跟開場畫面搶。
 * 解開後每張約 6 MB，兩隻貓加敵人可能三百多 MB，所以依裝置記憶體設總上限，超過就先釋放：
 * 1. 預先解好、還沒畫過的，**後排進來的先放**——資料檔裡常用動作（待機、爪擊）排在前面，
 *    上限小時保住常用的、放掉罕用的。只看「最久沒用」的話，預先解好卻還沒畫過的常用圖
 *    會排在最前面先被丟（實測 4 GB 裝置連線時，球球的爪擊四張全被擠掉、出牌又當場解碼）；
 * 2. 都畫過的，放最久沒畫的。
 * 被釋放或還沒解好的，呼叫端照舊畫原本的 <img>（當場解碼，跟以前一樣），並排一次「正在用」的解開。
 */

const MB = 1024 * 1024;
function defaultBudget(): number {
  const gb = typeof navigator === 'undefined' ? undefined : (navigator as { deviceMemory?: number }).deviceMemory;
  if (gb === undefined) return 224 * MB;
  return (gb >= 8 ? 384 : gb >= 4 ? 224 : 128) * MB;
}

let budgetBytes = defaultBudget();
/** `score` 越小越先放：畫過的是遞增的使用序號（正數），預先解好沒畫過的是負的排隊序號（後排的更小）。 */
type Entry = { bitmap: ImageBitmap; bytes: number; score: number };
const ready = new Map<HTMLImageElement, Entry>();
const queued = new Map<HTMLImageElement, boolean>();   // 值＝排的時候是不是正要畫它
const queue: HTMLImageElement[] = [];
let useClock = 0;
let prepareClock = 0;
let draining: Promise<void> | null = null;
let usedBytes = 0;

/** 這張圖已經解開就回傳點陣圖（並記為剛用過），否則回 undefined。 */
export function decodedAtlas(image: HTMLImageElement): ImageBitmap | undefined {
  const entry = ready.get(image);
  if (!entry) return undefined;
  entry.score = ++useClock;
  return entry.bitmap;
}

function store(image: HTMLImageElement, bitmap: ImageBitmap, inUse: boolean): void {
  const bytes = bitmap.width * bitmap.height * 4;
  ready.set(image, { bitmap, bytes, score: inUse ? ++useClock : -(++prepareClock) });
  usedBytes += bytes;
  while (usedBytes > budgetBytes && ready.size > 0) {
    let victim: HTMLImageElement | undefined;
    let lowest = Infinity;
    for (const [candidate, entry] of ready) {
      if (entry.score < lowest) { lowest = entry.score; victim = candidate; }
    }
    const entry = ready.get(victim!)!;
    ready.delete(victim!);
    usedBytes -= entry.bytes;
    entry.bitmap.close();
  }
}

async function drain(): Promise<void> {
  for (let image = queue.shift(); image; image = queue.shift()) {
    try {
      const response = await fetch(image.src);
      if (!response.ok) continue;
      store(image, await createImageBitmap(await response.blob()), queued.get(image) ?? false);
    } catch {
      // 拿不到就算了：呼叫端照舊畫 <img>
    } finally {
      queued.delete(image);
    }
  }
}

/**
 * 排進背景解開的佇列。圖還沒載好、載入失敗、瀏覽器不支援，或已經解好／排著隊，都不重排。
 * `inUse`：畫的時候發現沒解好才排的（正要用），解好後當作剛畫過，不會一進來就被當成罕用的放掉。
 * 回傳整條佇列跑完的時間點（要等解好再啟用時用）。
 */
export function prepareDecodedAtlas(image: HTMLImageElement, inUse = false): Promise<void> {
  const supported = typeof createImageBitmap === 'function' && typeof fetch === 'function';
  if (supported && !ready.has(image) && !queued.has(image) && image.complete && image.naturalWidth) {
    queued.set(image, inUse);
    queue.push(image);
    draining ??= drain().finally(() => { draining = null; });
  }
  return draining ?? Promise.resolve();
}

/** 測試用：清空快取並可改上限。 */
export function _resetDecodedAtlasForTest(budget = 224 * MB): void {
  for (const entry of ready.values()) entry.bitmap.close();
  ready.clear();
  queued.clear();
  queue.length = 0;
  draining = null;
  usedBytes = 0;
  useClock = 0;
  prepareClock = 0;
  budgetBytes = budget;
}
