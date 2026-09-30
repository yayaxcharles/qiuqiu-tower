/*
 * 開局祝福：旁白讓位給卡片說明（2026-09-30 英日極端版面檢查 高-4；量版面的轉接器在 `src/i18n/layout.ts`，只有英日語言包才會載入）。
 *
 * 卡片架釘在畫面上面、旁白框貼底往上長，兩塊各自定位、互相看不到高度。繁中旁白兩行、留得下；
 * 英文旁白四行，最多蓋住第四張卡的說明 64 像素（手機 76），代價類祝福的「Max HP −8」就被旁白壓住讀不出來。
 * 作法同罐頭鋪的 `fitGoods`：畫好之後量現場，撞到了才一級一級退讓，沒撞到一個像素都不動。
 * 不動主圖與卡片本身的大小：先縮旁白的字與行距、再收下內距與主角那一句，最後才把卡片排整排縮一點（原點在上緣）。
 */

/** 卡片底邊跟旁白第一行至少隔幾像素（舞台座標） */
export const BLESS_GAP = 4;
/** 卡片排最多縮到幾倍：再小 13 像素的說明字就讀不到了 */
export const BLESS_MIN_SCALE = 0.85;
/** 退讓的類別級數（`.bless-fit-1`、`.bless-fit-2`；第 3 級是縮卡片排，不是類別） */
export const BLESS_CLASS_LEVELS = 2;

/** 從第 1 級起挑第一個不撞的級；`overlap(level)` 套上那一級後回傳還蓋住幾像素（≤ 0＝不撞）。都撞停在最後一級 */
export function pickBlessLevel(overlap: (level: number) => number, max = BLESS_CLASS_LEVELS): number {
  for (let l = 1; l <= max; l++) if (overlap(l) <= 0) return l;
  return max;
}

/** 卡片排要縮成幾倍才不撞：`overlap` 是還蓋住幾像素，`rowHeight` 是卡片排現在的高（原點在上緣，底邊上移量＝高×(1−倍數)） */
export function blessRowScale(overlap: number, rowHeight: number, min = BLESS_MIN_SCALE): number {
  if (overlap <= 0 || rowHeight <= 0) return 1;
  return Math.max(min, Math.min(1, 1 - overlap / rowHeight));
}

export interface BlessAdapter {
  /** 還原：退讓的類別與卡片排的縮放都拿掉 */
  reset(): void;
  /** 套上第 `level`（1～2）級的類別 */
  setLevel(level: number): void;
  /** 旁白蓋住卡片幾像素（已含 `BLESS_GAP`；≤ 0＝不撞） */
  overlap(): number;
  /** 卡片排現在的高 */
  rowHeight(): number;
  /** 把卡片排縮成 `scale` 倍 */
  scaleRow(scale: number): void;
}

/** 整個流程（冪等）。回傳最後停在第幾級：0 原樣、1～2 縮旁白、3 連卡片排都縮 */
export function runBlessFit(a: BlessAdapter): number {
  a.reset();
  if (a.overlap() <= 0) return 0;
  const level = pickBlessLevel((l) => { a.setLevel(l); return a.overlap(); });
  const left = a.overlap();
  if (left <= 0 || level < BLESS_CLASS_LEVELS) return level;
  const s = blessRowScale(left, a.rowHeight());
  if (s < 1) a.scaleRow(s);
  return BLESS_CLASS_LEVELS + 1;
}
