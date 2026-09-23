/**
 * 大檔讓路（2026-09-23 主控派工：慢網路下剛拿到的牌圖空著、結果圖排很久）。
 *
 * 逐格動作的圖集一張 0.3～1.3 MB，一隻貓二三十張、合計 20～35 MB，原本在開新局那一刻就**全部同時**開抓。
 * 實測（限速約 1.6 Mbps、本機預覽 HTTP/1.1，一個主機最多開 6 條連線）：地圖出來幾秒後 6 條連線全被
 * 這幾張大圖集、背景音樂、跳過了還在下載的開頭影片佔住，每條只分到三十幾 KB/s；之後要的小圖
 *（事件主圖、結果圖、牌面）再怎麼插隊都要排到有一條空出來，實測排了約 12 秒。
 *
 * 所以大圖集改走這一條：
 * - **同時最多 `limit` 張**（`armHeavyLane` 設，主程式開機時設成 2）：6 條連線至少留 3 條給小圖；
 * - **開場那一批（`preloadArt`＋第一關的魔物）抓完之前不開始**（`holdHeavyLane`，主程式開機時掛上）：
 *   畫面上馬上要用的小圖先到；
 * - 還要設 `fetchPriority = 'low'`：正式網站是 HTTP/2（沒有 6 條的限制），優先權才是它讓路的方式；
 * - **正要畫的插隊**（`urgent`）：戰鬥裡第一次播到延後下載的動作時排到最前面。
 *
 * 動作圖集還沒到時畫面照舊交還靜態立繪（`combat.ts` 的 `mountMotion` 看 `ready()`／`drawable()`），
 * 所以晚到只是「晚一點才動起來」，不會空白。
 *
 * 沒有 `armHeavyLane` 的時候（測試、動作試玩頁）這一條等於不存在：設好網址就走，跟原本一模一樣。
 */

type Job = { image: HTMLImageElement; url: string; done: Promise<void>; settle: () => void; started: boolean };

let limit = Infinity;
let holds = 0;
let active = 0;
const waiting: Job[] = [];
const jobs = new WeakMap<HTMLImageElement, Job>();

/**
 * 一張大圖集要開抓的時候叫這支（不要自己設 `image.src`）。回傳「這一張載完（或失敗）」的時間點。
 * 同一張叫第二次沿用第一次的；`urgent` 會把還在排隊的那張移到最前面。
 */
export function loadHeavy(image: HTMLImageElement, url: string, urgent = false): Promise<void> {
  const known = jobs.get(image);
  if (known) {
    if (urgent && !known.started) {
      const at = waiting.indexOf(known);
      if (at > 0) { waiting.splice(at, 1); waiting.unshift(known); }
    }
    return known.done;
  }
  let settle = (): void => {};
  const done = new Promise<void>((r) => { settle = r; });
  const job: Job = { image, url, done, settle, started: false };
  jobs.set(image, job);
  if (urgent) waiting.unshift(job); else waiting.push(job);
  pump();
  return done;
}

/**
 * 一張卡住（一直沒載完也沒失敗）不能讓整條路停住：佔位最多這麼久，時間到就讓出位子（那張照樣繼續下載）。
 * 1.3 MB 的圖集在 1.6 Mbps、跟別人分頻寬時要二三十秒，所以放寬到 90 秒。
 */
const SLOT_MAX_MS = 90_000;

function start(job: Job): void {
  job.started = true;
  if (limit === Infinity) { job.image.src = job.url; job.settle(); return; }
  active += 1;
  let freed = false;
  const free = (): void => {
    if (freed) return;
    freed = true;
    clearTimeout(cap);
    active -= 1;
    job.settle();
    pump();
  };
  const cap = setTimeout(free, SLOT_MAX_MS);
  if (typeof job.image.addEventListener === 'function') {
    job.image.addEventListener('load', free, { once: true });
    job.image.addEventListener('error', free, { once: true });
  }
  try { job.image.fetchPriority = 'low'; } catch { /* 不支援就算了 */ }
  job.image.src = job.url;
  // 沒有事件可掛的環境（極簡的假影像），或瀏覽器快取裡本來就有、設完網址當下就好了
  if (typeof job.image.addEventListener !== 'function' || (job.image.complete && job.image.naturalWidth > 0)) free();
}

function pump(): void {
  while (holds === 0 && active < limit && waiting.length) start(waiting.shift()!);
}

/** 開機時設：同時最多抓幾張大圖集（主程式設 2） */
export function armHeavyLane(max: number): void {
  limit = Math.max(1, Math.floor(max));
  pump();
}

/**
 * 先別開抓，等手上這件事做完（主程式：開場那一批圖抓完）。回傳「做完了」的那一支，叫第二次沒作用。
 * 保險：最多擋 `maxMs`，時間到自己放行——開場那一批要是有哪張一直不結束，大圖集也不能永遠不抓。
 */
export function holdHeavyLane(maxMs = 90_000): () => void {
  holds += 1;
  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    clearTimeout(timer);
    holds -= 1;
    pump();
  };
  const timer = setTimeout(release, maxMs);
  return release;
}

/** 測試用：現在的狀態 */
export function _heavyLaneStateForTest(): { limit: number; holds: number; active: number; waiting: string[] } {
  return { limit, holds, active, waiting: waiting.map((j) => j.url) };
}

/** 測試用：回到「沒有這一條」的樣子 */
export function _resetHeavyLaneForTest(): void {
  limit = Infinity; holds = 0; active = 0; waiting.length = 0;
}
