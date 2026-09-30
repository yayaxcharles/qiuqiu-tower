/*
 * 戰鬥裡魔物頭上的意圖牌與腳下的名字牌，放不下就縮字（2026-09-30 英日極端版面檢查 中-6、中-7）。
 * 量版面的轉接器在 `src/i18n/layout.ts`（只有英日語言包才會載入；繁中量過本來就放得下，明擺著跳過）。
 *
 * 意圖牌是不換行的單行牌子，寬度隨字數；魔物之間只隔約 205 像素。英文長招式加括號補充
 * （「Debuff Belly Drum(Seen Through)」）最寬 249，三隻並排就互相蓋住。名字牌寬只有 190（單位框寬），
 * 英文關主名字（「Cow Cat Second-in-Command」211）超出框、也比旁邊的血條寬。
 * 作法同 `fitCardText`：畫好之後量現場，一次縮 0.5 像素到放得下；放得下的一個像素都不動。
 * 名字牌縮字時**把牌子的高度與行高先釘死**：戰鬥畫面每個單位由下往上疊，名字多高、立繪就往上浮多少，
 * 少 3 像素立繪就往下掉 3 像素（`phone.css` 檔頭那條教訓；角色位置是推前四道門檻之一）。
 * 意圖牌縮到下限還放不下改截成省略號：省略號做在牌子裡面包的一層 span 上，**牌子本身保持 `overflow: visible`**——
 * 攻擊牌的紅光圈、落影、關主出招前的暖光是牌子的偽元素（`combat.css` 的 `.i-attack::before/::after`），牌子一設裁切就被切掉。
 */

/** 意圖牌最寬（版面像素）：魔物之間至少隔 205，留 5 像素空隙 */
export const INTENT_MAX_W = 200;
/** 意圖牌字最小縮到原本的幾成（再小就縮到看不清，改用省略號，全文在滑過去的提示框） */
export const INTENT_MIN_RATIO = 0.78;
/** 名字牌字最小縮到原本的幾成 */
export const NAME_MIN_RATIO = 0.8;
/** 每次縮多少像素 */
export const FIT_STEP = 0.5;

/**
 * 從 `size` 起一次縮 `FIT_STEP`，縮到 `width(size) <= max` 或碰到下限 `min` 為止，回傳最後的字級。
 * `width(s)`＝字級 s 時的寬度（由呼叫端設上去量）。
 */
export function shrinkToFit(size: number, min: number, max: number, width: (size: number) => number): number {
  let s = size;
  while (s - FIT_STEP >= min - 1e-9 && width(s) > max + 0.5) s -= FIT_STEP;
  return s;
}

/** 一塊牌子的量與改（轉接器），流程才能脫離瀏覽器驗 */
export interface LabelAdapter {
  /** 原本的字級（還原後、縮字前） */
  baseSize: number;
  /** 現在的寬度 */
  width(): number;
  /** 設字級 */
  setSize(px: number): void;
}

/** 意圖牌：超過 `INTENT_MAX_W` 就縮字；縮到下限還不夠回傳 true（呼叫端改截省略號） */
export function fitIntentWidth(a: LabelAdapter): boolean {
  if (a.width() <= INTENT_MAX_W) return false;
  const s = shrinkToFit(a.baseSize, a.baseSize * INTENT_MIN_RATIO, INTENT_MAX_W, (v) => { a.setSize(v); return a.width(); });
  a.setSize(s);
  return a.width() > INTENT_MAX_W + 0.5;
}

/** 名字牌：比框（`boxWidth`）寬就縮字，回傳有沒有縮（縮之前呼叫端要先釘死高度與行高） */
export function fitNameWidth(a: LabelAdapter, boxWidth: number): boolean {
  if (a.width() <= boxWidth + 0.5) return false;
  a.setSize(shrinkToFit(a.baseSize, a.baseSize * NAME_MIN_RATIO, boxWidth, (v) => { a.setSize(v); return a.width(); }));
  return true;
}
