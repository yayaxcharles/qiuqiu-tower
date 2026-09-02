/**
 * 收牌動畫的節拍：每張牌錯開多久出發、引擎要等多久才可以重畫。
 *
 * 2026-09-02 使用者回報「有些牌在回合結束時不會飛進去右方，直接留在場上」。
 * 病根：出發間隔固定 38 毫秒、引擎固定等 330 毫秒就重畫——手牌一多（千里眼、順風耳抽到八到十張），
 * 第九張要等 304 毫秒才出發、第十張 342 毫秒，重畫時它們還沒動（或剛動一點點），
 * 看起來就是「別的牌飛走了、這幾張留在原地然後被抹掉」。
 *
 * 改法：牌多就把間隔壓縮（整排出發時間封頂在 190 毫秒內），引擎等到**最後一張也飛了八成五**再重畫。
 * 六張以內的節奏跟原本幾乎一樣，十張時也只比原本多等兩百多毫秒，不會拖。
 */
export const COLLECT_FLY = 300;        // 一張牌飛到「結束回合」要多久
export const COLLECT_STAGGER = 38;     // 每張牌最多錯開多久出發
export const COLLECT_MIN_WAIT = 330;   // 引擎至少等這麼久（沒牌可收時呼叫端直接結算，不走這裡）
const COLLECT_SPREAD_MAX = 190;        // 整排牌的出發時間最多攤在這麼長的區間裡（六張×38 剛好，六張以內節奏不變）
const COLLECT_DONE_RATIO = 0.85;       // 最後一張飛到這個比例才重畫（剩下那一截已經縮到看不見）

export function collectTiming(cards: number): { stagger: number; wait: number } {
  if (cards <= 0) return { stagger: 0, wait: 0 };
  const stagger = Math.min(COLLECT_STAGGER, COLLECT_SPREAD_MAX / Math.max(1, cards - 1));
  const lastStart = (cards - 1) * stagger;
  const wait = Math.max(COLLECT_MIN_WAIT, Math.round(lastStart + COLLECT_FLY * COLLECT_DONE_RATIO));
  return { stagger, wait };
}
