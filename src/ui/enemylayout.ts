/**
 * 魔物在戰場上的橫向位置。
 *
 * 抽成沒有畫面相依的純函式，是因為這段算式出過一次真的 bug：
 * 排位置時用了 `cs.enemies` 的完整陣列（含已經倒下的），塔主召喚第二、第三批之後
 * 總數一路變大、新小怪的索引也跟著往後，算出來的座標直接超出舞台 1280
 * （第三批落在 1380，整隻在畫面外）。抽出來就測得到，不用開瀏覽器。
 *
 * 呼叫端的責任：`i` 與 `n` 都只算**活著的**魔物。
 */

/** 舞台寬度。魔物一律排在這個範圍內。 */
export const STAGE_W = 1280;
/** 一隻魔物的欄寬（`.combat .unit` 的 width）。 */
export const UNIT_W = 190;

/** 幾隻的時候彼此間隔多少。越多隻排越緊，不然塞不下。 */
export function enemyStep(n: number): number {
  return n <= 2 ? 210 : n === 3 ? 205 : n === 4 ? 180 : 150;
}

/**
 * 第 `i` 隻（從 0 起算）在 `n` 隻裡的左緣座標。
 * `i < 0` 代表已經倒下、不佔位子的，擺回中央（牠們是隱形的，位置不影響畫面）。
 */
/**
 * 這一拍要照誰排位子。
 *
 * 位子一旦排好就**不動**：兩隻打死後面那隻，前面那隻不該滑到中間（使用者 2026-09-02 回報）。
 * 所以倒下的照樣佔著位子（牠是隱形的，佔著沒差）。只有**新魔物上場**（召喚）才重排，
 * 而且重排時把倒下的清出名單——不清的話塔主召喚第二、第三批會一路排到畫面外（那是原本的 bug）。
 */
export function nextLineup(prev: readonly number[], aliveUids: readonly number[]): number[] {
  const newcomer = aliveUids.some((uid) => !prev.includes(uid));
  return newcomer ? [...aliveUids] : [...prev];
}

export function enemyLeft(i: number, n: number): number {
  if (i < 0) return 780;
  const step = enemyStep(n);
  return Math.round(875 - ((n - 1) * step) / 2 - 95 + i * step);
}
