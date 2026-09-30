/*
 * 狀態列放不下時逐級退讓（2026-09-30 英日極端版面檢查 高-1、高-2；2026-10-01 審查後修正）。
 *
 * 狀態列是固定 1280 寬、不換行的一橫排；英文、日文的字比繁中長，難度牌子、長關名、秘寶一多，
 * 右邊的音樂、音效、語音、分享鈕就被擠出舞台，連生命條也被擠成幾個像素。
 * 作法跟罐頭鋪的 `fitGoods` 一樣：畫好之後量現場，「放不下」才一級一級退讓；放得下一個像素都不動（繁中平常的畫面不受影響）。
 *
 * 「放不下」有兩種：①最右邊那顆鈕的右緣超出舞台（1280）；②生命條比它自己的字還窄（字被切掉，看不到血量）。
 * 生命條本來就是整列唯一會縮的格，繁中原本靠它吸收一點點超出（縮到 120 也還讀得到）；所以不給固定下限，
 * 只看「有沒有窄到放不下自己的字」。兩種的缺口加起來就是還缺多少像素。
 *
 * 退讓的順序（每一級都保留全部功能，字用滑過去的提示框補回來）：
 *   0 原樣（秘寶滿了照舊會先進「擠」的那一級）
 *   1 擠：秘寶、忍具圖示與間距縮一級（`.crowded`）
 *   2 音樂、音效、語音、分享鈕只留圖示
 *   3 難度牌子縮成短標、牌組與圖鑑鈕只留圖示
 *   4 從最舊的秘寶開始收進「+N」，直到放得下
 * 純流程放這裡（測試用假的版面餵進去驗），量版面、改類別的那一段（轉接器）在 `hud.ts`。
 */

export const HUD_WIDTH = 1280;
/** 每一級要加在 `.hud` 上的類別（第 0 級不加） */
export const HUD_LEVEL_CLASSES: readonly string[] = ['crowded', 't-icons', 't-short'];
/** 缺口在幾像素以內不算：量到的位置都是整數像素，右緣剛好 1280 就是放得下，1281 就是掉出去 1 像素 */
export const HUD_SLACK = 0;
/** 生命條要比自己的字寬多留幾像素（左右框線各 2；字剛好放進框線裡面就算放得下） */
export const HP_PAD = 4;

/** 第 `level` 級要掛的類別（累加：第 2 級＝擠＋只留圖示） */
export function hudClassesFor(level: number): string[] {
  return HUD_LEVEL_CLASSES.slice(0, Math.max(0, Math.min(level, HUD_LEVEL_CLASSES.length)));
}

/** 還缺多少像素：右緣超出舞台的量，加上生命條比自己的字窄的量（生命條看不見就不算） */
export function hudShortfall(lastRight: number, hpWidth: number, textWidth: number): number {
  return Math.max(0, lastRight - HUD_WIDTH) + (hpWidth > 0 ? Math.max(0, textWidth + HP_PAD - hpWidth) : 0);
}

/** 狀態列的版面轉接器：量與改都經過它，流程才能脫離瀏覽器驗 */
export interface HudAdapter {
  /** 回到原樣：退讓的類別拿掉（`.crowded` 回到依秘寶數決定的樣子）、收起來的秘寶放回去 */
  reset(): void;
  /** 套上第 `level` 級（1 以上）的類別 */
  apply(level: number): void;
  /** 現在還缺多少像素（≤ `HUD_SLACK`＝放得下） */
  shortfall(): number;
  /** 把最舊的一顆秘寶收進「+N」，沒得收回傳 false */
  drop(): boolean;
}

/**
 * 跑完整個退讓流程（冪等：先 `reset` 再量，所以轉向之後可以重跑）。
 * 回傳最後停在第幾級（0＝原樣、4＝收過秘寶）。
 */
export function runHudFit(a: HudAdapter): number {
  a.reset();
  if (a.shortfall() <= HUD_SLACK) return 0;
  let l = 1;
  for (; l <= HUD_LEVEL_CLASSES.length; l++) {
    a.apply(l);
    if (a.shortfall() <= HUD_SLACK) return l;
  }
  let n = 0;
  while (n < 64 && a.shortfall() > HUD_SLACK && a.drop()) n++;   // 64 是保險，量測壞掉時不會無限迴圈
  return n ? HUD_LEVEL_CLASSES.length + 1 : HUD_LEVEL_CLASSES.length;
}
