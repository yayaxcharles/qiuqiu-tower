/*
 * 狀態列放不下時逐級退讓（2026-09-30 英日極端版面檢查 高-1、高-2）。
 *
 * 狀態列是固定 1280 寬、不換行的一橫排，各格都不肯縮；英文、日文的字比繁中長，
 * 難度牌子、長關名、秘寶一多，右邊的音樂、音效、語音、分享鈕就被擠出舞台，點不到，
 * 連生命條也被擠成幾個像素。一條寫死的樣式顧不到每一種組合，所以跟罐頭鋪的 `fitGoods` 同一個作法：
 * 畫好之後量現場，超出右緣才一級一級退讓；沒超出就一個像素都不動（繁中平常的畫面不受影響）。
 * 純判斷放這裡（測試直接呼叫），量版面、加類別的那一段在 `hud.ts` 的 `fitHud`。
 *
 * 退讓的順序（每一級都保留全部功能，字用滑過去的提示框補回來）：
 *   0 原樣（秘寶滿了照舊會先進「擠」的那一級）
 *   1 擠：秘寶、忍具圖示與間距縮一級（`.crowded`）
 *   2 音樂、音效、語音、分享鈕只留圖示
 *   3 難度牌子縮成短標、牌組與圖鑑鈕只留圖示
 *   4 從最舊的秘寶開始收進「+N」，直到放得下
 */

/**
 * 最右邊那顆鈕的右緣不能超過 `HUD_WIDTH - HUD_PAD`。`HUD_PAD` 是 0：線畫在舞台邊，不畫在右內距（14）上——
 * 原本擠的時候按鈕就可以吃掉右內距、只要沒掉出舞台就算放得下，繁中有些「剛好放得下」的組合靠的就是這 14 像素，
 * 線畫在內距上會把它們也推去退讓（繁中畫面不能變）。真的放不下、掉出舞台才退讓。
 */
export const HUD_WIDTH = 1280;
export const HUD_PAD = 0;
/** 每一級要加在 `.hud` 上的類別（第 0 級不加） */
export const HUD_LEVEL_CLASSES: readonly string[] = ['crowded', 't-icons', 't-short'];
/** 最多退到第幾級（第 4 級＝收秘寶，不是類別） */
export const HUD_MAX_LEVEL = HUD_LEVEL_CLASSES.length + 1;
/** 超出幾像素以內不算（小數點誤差；量測腳本也是超出舞台 1 像素才算掉出去） */
export const HUD_SLACK = 1;

/** 第 `level` 級要掛的類別（累加：第 2 級＝擠＋只留圖示） */
export function hudClassesFor(level: number): string[] {
  return HUD_LEVEL_CLASSES.slice(0, Math.max(0, Math.min(level, HUD_LEVEL_CLASSES.length)));
}

/**
 * 從第 `from` 級起，挑第一個放得下的級：`over(level)` 套上那一級之後回傳右邊超出幾像素（≤ 0＝放得下）。
 * 每一級都放不下就停在最後一級（呼叫端再去收秘寶）。
 */
export function pickHudLevel(over: (level: number) => number, from = 0, max = HUD_LEVEL_CLASSES.length): number {
  for (let l = from; l <= max; l++) if (over(l) <= HUD_SLACK) return l;
  return max;
}

/**
 * 一顆一顆收掉最舊的秘寶，直到放得下或沒得收。`over()` 現在超出幾像素、`drop()` 收一顆回傳有沒有收成。
 * 回傳收掉幾顆。`limit` 是保險，避免量測壞掉時無限迴圈。
 */
export function dropUntilFits(over: () => number, drop: () => boolean, limit = 64): number {
  let n = 0;
  while (n < limit && over() > HUD_SLACK && drop()) n++;
  return n;
}

/** 右緣：最右邊那顆的左緣加寬度（版面座標，不受舞台縮放與動畫縮放影響） */
export function hudOverflow(lastLeft: number, lastWidth: number): number {
  return lastLeft + lastWidth - (HUD_WIDTH - HUD_PAD);
}

/** 「🔊 SFX」拆成圖示與字（沒有空白就整段當字）：只留圖示時把字藏起來，字放在提示框 */
export function splitIcon(text: string): { icon: string; label: string } {
  const m = /^(\S+)(\s.*)$/s.exec(text);
  return m ? { icon: m[1]!, label: m[2]! } : { icon: '', label: text };
}
