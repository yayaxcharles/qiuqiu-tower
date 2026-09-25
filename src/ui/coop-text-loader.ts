/**
 * 連線兩人版台詞（`content/coop-pair-text.ts`：關主前一晚、每關第一個貓窩的閒聊、三隻關主的同伴接話）的延後載入（2026-09-25）。
 *
 * 只有連線用得到，首載程式的預算又只剩一點點，所以拆成一塊：地圖畫面在連線時先在背景叫一次（`screens/map.ts`），
 * 走進貓窩、打到關主時多半早就到了。同一時間只抓一次；失敗了下一次叫會重來（同 `shop-text-loader.ts` 的做法）。
 * 載不到就退回單人版（兩台各播各的），不會卡住。
 */
type CoopText = typeof import('../content/coop-pair-text');

let loaded: CoopText | null = null;
let pending: Promise<CoopText> | null = null;
let importer: () => Promise<CoopText> = () => import('../content/coop-pair-text');

export function loadCoopText(): Promise<CoopText> {
  if (loaded) return Promise.resolve(loaded);
  pending ??= importer().then((m) => { loaded = m; return m; }, (e: unknown) => { pending = null; throw e; });
  return pending;
}

/**
 * 到了就**當場**叫（貓窩剛畫好、關主開場要接著播，不能晚一拍），還沒到就等它；載不到或等超過 `waitMs` 叫 `fn(null)`，
 * 畫面退回單人版（網路很慢時關主開場不能一直卡著）。`fn` 保證只叫一次。
 */
export function withCoopText(fn: (m: CoopText | null) => void, waitMs = 3000): void {
  if (loaded) { fn(loaded); return; }
  let done = false;
  const once = (m: CoopText | null): void => { if (done) return; done = true; clearTimeout(timer); fn(m); };
  const timer = setTimeout(() => once(null), waitMs);
  loadCoopText().then(once, () => once(null));
}

/** 測試用 */
export function _setCoopTextImporterForTest(fn: () => Promise<CoopText>): void {
  importer = fn;
  loaded = null;
  pending = null;
}
