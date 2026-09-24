/**
 * 這一台的網路快不快（2026-09-23 主控裁定：讓路只在量到慢的時候才生效）。
 *
 * 大圖集讓路（`heavy-lane.ts`）與背景音樂延後在慢網路下是大改善（1.6 Mbps：手牌圖 15→12 秒、點事件到結果圖 9→2.6 秒），
 * 但一般寬頻用不著讓，讓了反而逐格動作晚到：20 Mbps 快速點掉序章時，第一場戰鬥前 9 秒只看得到靜態立繪。
 * 大多數玩家是寬頻，所以**快的時候完全照原本的做法**，量到慢才讓路。
 *
 * 怎麼量：開機後開場那一批圖一開抓就計時，**2.5 秒內收到 1 MB 就是快**（約 3.2 Mbps 以上），收不到就是慢。
 * 看的是瀏覽器自己記的每個檔「收了幾個位元組、什麼時候收完」（Resource Timing），不另外下載測速檔；
 * 快取裡本來就有的（回鍋玩家）一下子就收完，算快。
 * 瀏覽器說在省流量、或連線是 2G／3G（`navigator.connection`，Chrome 系才有），直接當慢，不用等。
 * 量不了（沒有 `PerformanceObserver`）當快——照原本的行為。
 */
export type NetSpeed = 'fast' | 'slow';

/** 2.5 秒收 1 MB：約 400 KB/s（3.2 Mbps）。1.6 Mbps 在這段時間大約只收得到一半 */
const FAST_BYTES = 1_000_000;
const WINDOW_MS = 2500;

let verdict: Promise<NetSpeed> = Promise.resolve('fast');
let known: NetSpeed | null = 'fast';

/** 量出來的結果（還在量就等）。沒開始量（測試、動作試玩頁）＝快 */
export function netSpeed(): Promise<NetSpeed> { return verdict; }

/** 現在知道的結果；還在量回 `null` */
export function knownNetSpeed(): NetSpeed | null { return known; }

type Conn = { saveData?: boolean; effectiveType?: string };

/** 開始量（主程式開機、開場那一批開抓的同時叫）。回傳結果 */
export function probeNetSpeed(): Promise<NetSpeed> {
  known = null;
  verdict = new Promise<NetSpeed>((resolve) => {
    let observer: PerformanceObserver | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const decide = (v: NetSpeed): void => {
      if (known !== null) return;
      known = v;
      observer?.disconnect();
      if (timer !== undefined) clearTimeout(timer);
      resolve(v);
    };
    const conn = (typeof navigator === 'undefined' ? undefined : (navigator as { connection?: Conn }).connection);
    if (conn?.saveData || /^(slow-2g|2g|3g)$/.test(conn?.effectiveType ?? '')) { decide('slow'); return; }
    if (typeof PerformanceObserver === 'undefined' || typeof performance === 'undefined') { decide('fast'); return; }
    const t0 = performance.now();
    let bytes = 0;
    try {
      observer = new PerformanceObserver((list) => {
        for (const e of list.getEntries() as PerformanceResourceTiming[]) {
          if (e.responseEnd < t0) continue;   // 開機前就收完的（程式本身）不算
          bytes += e.encodedBodySize || e.transferSize || 0;
        }
        if (bytes >= FAST_BYTES) decide('fast');
      });
      observer.observe({ type: 'resource', buffered: true });
    } catch { decide('fast'); return; }
    timer = setTimeout(() => decide(bytes >= FAST_BYTES ? 'fast' : 'slow'), WINDOW_MS);
  });
  return verdict;
}

/** 測試用：直接指定結果 */
export function _setNetSpeedForTest(v: NetSpeed | null): void {
  known = v;
  verdict = v === null ? new Promise<NetSpeed>(() => undefined) : Promise.resolve(v);
}
