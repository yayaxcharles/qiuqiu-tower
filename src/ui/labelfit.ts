/*
 * 戰鬥裡魔物頭上的意圖牌與腳下的名字牌，放不下就縮字（2026-09-30 英日極端版面檢查 中-6、中-7）。
 *
 * 意圖牌是不換行的單行牌子，寬度隨字數；魔物之間只隔約 205 像素。英文長招式加括號補充
 * （「Debuff Belly Drum(Seen Through)」）最寬 249，三隻並排就互相蓋住。名字牌寬只有 190（單位框寬），
 * 英文關主名字（「Cow Cat Second-in-Command」211）超出框、也比旁邊的血條寬。
 * 作法同 `fitCardText`：畫好之後量現場，一次縮 0.5 像素到放得下；放得下的一個像素都不動（繁中全部如此）。
 * 名字牌縮字時**把牌子的高度與行高先釘死**：戰鬥畫面每個單位由下往上疊，名字多高、立繪就往上浮多少，
 * 少 3 像素立繪就往下掉 3 像素（`phone.css` 檔頭那條教訓；角色位置是推前四道門檻之一）。
 * 純計算放這裡（測試直接呼叫），量版面的那一段在 `fitUnitLabels`。
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

function fitIntent(node: HTMLElement): void {
  if (node.offsetWidth <= INTENT_MAX_W) return;
  const base = parseFloat(getComputedStyle(node).fontSize) || 14;
  const s = shrinkToFit(base, base * INTENT_MIN_RATIO, INTENT_MAX_W, (v) => { node.style.fontSize = `${v}px`; return node.offsetWidth; });
  node.style.fontSize = `${s}px`;
  if (node.offsetWidth > INTENT_MAX_W + 0.5) {
    // 縮到下限還是放不下：截成省略號（完整的字在滑過去的提示框裡）
    node.style.boxSizing = 'border-box';
    node.style.maxWidth = `${INTENT_MAX_W}px`;
    node.style.overflow = 'hidden';
    node.style.textOverflow = 'ellipsis';
  }
}

function fitName(node: HTMLElement): void {
  if (node.scrollWidth <= node.clientWidth + 0.5) return;
  const base = parseFloat(getComputedStyle(node).fontSize) || 15;
  // 先把高度與行高釘成現在的樣子，再縮字：立繪的位置不能因為名字變矮而往下掉
  const h = node.offsetHeight;
  node.style.height = `${h}px`;
  node.style.lineHeight = `${h}px`;
  const s = shrinkToFit(base, base * NAME_MIN_RATIO, node.clientWidth, (v) => { node.style.fontSize = `${v}px`; return node.scrollWidth; });
  node.style.fontSize = `${s}px`;
}

/** 畫好之後叫（節點要已經在文件裡）：`field` 是戰場容器 */
export function fitUnitLabels(field: ParentNode): void {
  for (const n of field.querySelectorAll<HTMLElement>('.unit .intent')) fitIntent(n);
  for (const n of field.querySelectorAll<HTMLElement>('.unit .name')) fitName(n);
}
