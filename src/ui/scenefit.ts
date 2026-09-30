/*
 * 事件文字讓位給插圖的純判斷（2026-09-30 英日極端版面檢查 中-1；量版面的那一段在 `scene.ts` 的 `fitSceneText`）。
 *
 * 插圖 `fitArt` 最矮縮到 210（`scene.ts`），插圖上緣 18，所以插圖最低會到場景座標 228。
 * 對白框上緣是一段透明漸層（36～60 像素的內距），插圖疊進 30 像素以內算設計、不算蓋住（跟檢查報告同一條線），
 * 所以框頂要在 198 以下；留 2 像素的餘裕，量到框頂在 200 以上就過。
 */

/** 對白框上緣（場景座標）至少要在這裡以下 */
export const SCENE_BOX_LIMIT = 200;
/** 逐級縮排版的類別級數（`.text-fit-1`、`.text-fit-2`；第 3 級是讓文字捲動，不是類別） */
export const SCENE_FIT_LEVELS = 2;
/** 捲動時文字那一塊至少留幾像素高（約三行），再小就不是在讀了 */
export const SCENE_MIN_TEXT = 96;

/** 從第 1 級起挑第一個放得下的級；`deficit(level)` 套上那一級後回傳框頂還差幾像素（≤ 0＝放得下）。都放不下停在最後一級 */
export function pickSceneLevel(deficit: (level: number) => number, max = SCENE_FIT_LEVELS): number {
  for (let l = 1; l <= max; l++) if (deficit(l) <= 0) return l;
  return max;
}

/** 讓文字捲動時的最大高度：現在的高度扣掉還缺的，至少 `min` */
export function scrollMaxHeight(textHeight: number, deficit: number, min = SCENE_MIN_TEXT): number {
  return Math.max(min, Math.round(textHeight - deficit));
}
