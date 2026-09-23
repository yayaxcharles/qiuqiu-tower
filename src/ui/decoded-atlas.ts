/**
 * 動作圖集的「已解開」快取（2026-09-21 實機追蹤後加的）。
 *
 * 逐格動作是用畫布的 drawImage 從一張 1774×887 的圖集裁一格來畫。追蹤看到：每張圖集第一次
 * 畫到畫布時，瀏覽器在主執行緒同步解碼 webp，一次 12～18 毫秒（CPU 降速 4 倍時 58～73）——
 * 占出牌那一拍卡頓的一半以上；而且那份解碼快取只放得下四五張，爪擊四張輪流用就一直被擠掉重解。
 * 預載時的 `img.decode()` 對畫布沒有幫助。
 *
 * 改成預先解開存成 ImageBitmap，畫的時候直接拿它畫。實測過的細節：
 * - **要從圖檔資料解，不能從 <img> 解**：`createImageBitmap(<img>)` 在 Chrome 是主執行緒同步解碼，
 *   33 張擠在一起讓序章卡了 0.45 秒（降速 4 倍 2.1 秒）。`fetch` 拿到檔案（瀏覽器快取裡就有；
 *   檔名帶內容雜湊，強制用快取是安全的）再 `createImageBitmap(blob)`，解碼會在背景執行緒做。
 * - **一次解一張**，排隊慢慢來；「正要畫」的插隊到最前面。
 * 解開後每張約 6 MB，兩隻貓加敵人可能三百多 MB，所以依裝置記憶體設總上限，超過就先放分數低的：
 * - 畫過的，分數是畫的那一刻的使用序號；最久沒畫的先放。
 * - 預先解好、還沒畫過的，分數是「排隊當下的使用序號」再減一點點（後排的減得多）：
 *   比排隊之後才畫過的低、比排隊之前就沒再用的舊圖高。換角色開第二局時先放上一局的舊圖；
 *   同一批裡資料檔排在前面的常用動作（待機、爪擊）保得住，後面罕用的先放。
 * - 「正要畫」而排的（包括開戰就要畫的魔物），解好時當作剛畫過。
 * - 預先解的那張算得出「一存進去就會被放掉」，就乾脆不下載、不解（2026-09-23，見 `drain`）。
 * 被放掉或還沒解好的，呼叫端照舊畫原本的 <img>（當場解碼，跟以前一樣），並排一次「正要畫」。
 */

const MB = 1024 * 1024;
function defaultBudget(): number {
  const gb = typeof navigator === 'undefined' ? undefined : (navigator as { deviceMemory?: number }).deviceMemory;
  if (gb !== undefined) return (gb >= 8 ? 384 : gb >= 4 ? 224 : 128) * MB;
  // 拿不到裝置記憶體（Safari、Firefox）：觸控裝置多半是手機，舊 iPhone 分頁記憶體很緊，保守一點
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return (coarse ? 128 : 224) * MB;
}

let budgetBytes = defaultBudget();
type Entry = { bitmap: ImageBitmap; bytes: number; score: number };
type Request = { inUse: boolean; clock: number; seq: number; waiters: Array<() => void> };
const ready = new Map<HTMLImageElement, Entry>();
const queued = new Map<HTMLImageElement, Request>();
const queue: HTMLImageElement[] = [];
/** 讀檔或解碼失敗過的：這一輪網頁不再重試（離線、檔案被換掉），照舊畫 <img> 就好。 */
let failed = new WeakSet<HTMLImageElement>();
let draining = false;
let useClock = 0;
let prepareClock = 0;
let usedBytes = 0;

/** 這張圖已經解開就回傳點陣圖（並記為剛用過），否則回 undefined。 */
export function decodedAtlas(image: HTMLImageElement): ImageBitmap | undefined {
  const entry = ready.get(image);
  if (!entry) return undefined;
  entry.score = ++useClock;
  return entry.bitmap;
}

/** 預先解好、還沒畫過的分數（見檔頭）：排隊當下的使用序號，後排的減得多 */
const preparedScore = (request: Request): number => request.clock - request.seq * 1e-6;

/**
 * 分數是 `score`、大小是 `bytes` 的新一張存進去之後留不留得住（2026-09-23 稽核 ui 低-3）。
 *
 * `store` 超過上限時從分數最低的開始放，同分先放先存進去的（`Map` 照存入順序走，新的一張排最後）。
 * 所以留得住＝分數不比它高的全放掉之後，總量不超過上限。
 */
export function survivesBudget(bytes: number, score: number,
  entries: Iterable<Readonly<{ bytes: number; score: number }>>, used: number, budget: number): boolean {
  let freed = 0;
  for (const entry of entries) if (entry.score <= score) freed += entry.bytes;
  return used + bytes - freed <= budget;
}

function store(image: HTMLImageElement, bitmap: ImageBitmap, request: Request): void {
  const bytes = bitmap.width * bitmap.height * 4;
  const score = request.inUse ? ++useClock : preparedScore(request);
  ready.set(image, { bitmap, bytes, score });
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
  draining = true;
  try {
    for (let image = queue.shift(); image; image = queue.shift()) {
      const request = queued.get(image)!;
      try {
        /*
         * 預先解（還沒人要畫）的那張，存進去就會被擠掉的話就不做（2026-09-23 稽核 ui 低-3）。
         * 同一批預先解的分數一張比一張低，快取滿了之後每張新解好的都是最低分、存進去立刻 `close()`——
         * 手機（上限 128 MB、放得下約 20 張）球球開局會多下載＋解開約 23 張再丟掉，白耗處理器與電池。
         * 解開後的大小就是圖本身的長寬，<img> 載好時就知道，不必真的解一次才算得出來。
         * 正要畫的（`inUse`）照舊一定解；這裡跳過的沒記成失敗，真的要畫時會再排一次、插隊解。
         */
        const bytes = image.naturalWidth * image.naturalHeight * 4;
        if (!request.inUse && Number.isFinite(bytes) && bytes > 0
          && !survivesBudget(bytes, preparedScore(request), ready.values(), usedBytes, budgetBytes)) continue;
        const response = await fetch(image.src, { cache: 'force-cache' });
        if (!response.ok) throw new Error(`讀不到 ${image.src}`);
        store(image, await createImageBitmap(await response.blob()), request);
      } catch {
        failed.add(image);   // 拿不到就算了：呼叫端照舊畫 <img>，也不一直重試
      } finally {
        queued.delete(image);
        for (const done of request.waiters) done();
      }
    }
  } finally {
    draining = false;
  }
}

/**
 * 排進背景解開的佇列，回傳「這一張處理完」的時間點（解好、失敗或不支援都算處理完）。
 * 圖還沒載好、失敗過、瀏覽器不支援，或已經解好，都不排。
 * `inUse`：正要畫它（畫的時候發現沒解好、開戰就要畫的魔物）——插隊到最前面，解好時當作剛畫過。
 */
export function prepareDecodedAtlas(image: HTMLImageElement, inUse = false): Promise<void> {
  const supported = typeof createImageBitmap === 'function' && typeof fetch === 'function';
  if (!supported || ready.has(image) || failed.has(image) || !image.complete || !image.naturalWidth) return Promise.resolve();
  const pending = queued.get(image);
  if (pending) {
    if (inUse && !pending.inUse) {
      pending.inUse = true;
      const at = queue.indexOf(image);
      if (at > 0) { queue.splice(at, 1); queue.unshift(image); }
    }
    return new Promise((done) => { pending.waiters.push(done); });
  }
  const request: Request = { inUse, clock: useClock, seq: ++prepareClock, waiters: [] };
  queued.set(image, request);
  if (inUse) queue.unshift(image); else queue.push(image);
  const settled = new Promise<void>((done) => { request.waiters.push(done); });
  if (!draining) void drain();
  return settled;
}

/**
 * 等這張圖「載好」（下載完、瀏覽器知道長寬），之後才能排進上面的背景解開。
 *
 * **不呼叫 `img.decode()`**（清理 2026-09-22）：畫布畫的是背景解開的點陣圖，`decode()` 另外解出來的
 * 那一份畫布用不到——等於每張圖集白解一次，那份解碼結果還跟著 <img> 一直留在記憶體裡
 *（實測每隻貓多占 89～203 MB）。
 *
 * 已經載好就馬上結束；壞圖（complete 但 naturalWidth 是 0）與載入失敗一律往外丟，呼叫端的退路才接得到。
 * 沒有事件可掛的環境（測試用的極簡假影像）當作載好。
 */
export function imageLoaded(image: HTMLImageElement): Promise<void> {
  return new Promise<void>((done, fail) => {
    if (image.complete && image.naturalWidth > 0) { done(); return; }
    if (typeof image.addEventListener !== 'function') { done(); return; }
    const broken = (): void => fail(new Error(`圖片載入失敗：${image.src}`));
    // 走到這裡還是 complete＝已經載入失敗過，load／error 不會再來，不先擋掉就永遠等不到結果
    if (image.complete) { broken(); return; }
    image.addEventListener('load', () => done(), { once: true });
    image.addEventListener('error', broken, { once: true });
  });
}

/** 測試用：清空快取並可改上限。 */
export function _resetDecodedAtlasForTest(budget = 224 * MB): void {
  for (const entry of ready.values()) entry.bitmap.close();
  ready.clear();
  queued.clear();
  queue.length = 0;
  failed = new WeakSet();
  draining = false;
  usedBytes = 0;
  useClock = 0;
  prepareClock = 0;
  budgetBytes = budget;
}
