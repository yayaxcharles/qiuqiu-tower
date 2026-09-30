/*
 * 提示框的縱向位置（2026-09-30 英日極端版面檢查 中-3）。
 *
 * 提示框原本一律從錨點往上 90 像素開始往下長，沒判斷下緣：英文、日文的說明長，滑過左下角的忍具格時
 * 框高 350～485 像素，下緣被舞台切掉最多 170 像素（繁中也有，最多 57）。
 * 現在：放得下就照原樣（一個像素都不動）；下緣會出界就改放到錨點上方（下緣貼在錨點上緣往上 8 像素）；
 * 上方也放不下（錨點在上半畫面）就整塊往上推到剛好貼著舞台下緣。純計算，測試直接呼叫。
 */

/** 舞台高（1280×720 座標）與提示框離舞台邊的最小距離 */
export const TIP_STAGE_H = 720;
export const TIP_MARGIN = 8;
/** 原本的做法：框頂在錨點上緣往上 90 */
export const TIP_LIFT = 90;

/**
 * `anchorTop`＝錨點上緣（舞台座標）、`height`＝提示框現在的高。回傳框頂。
 * 框比舞台還高（不可能，最高量到 485）就貼上緣，讓上半截看得到。
 */
export function tipTop(anchorTop: number, height: number, stageH = TIP_STAGE_H, margin = TIP_MARGIN): number {
  const usual = Math.max(0, anchorTop - TIP_LIFT);
  if (usual + height <= stageH - margin) return usual;
  const above = anchorTop - margin - height;
  if (above >= margin) return above;
  return Math.max(margin, stageH - margin - height);
}
