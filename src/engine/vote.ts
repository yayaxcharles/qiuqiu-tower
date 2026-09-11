import type { Rng } from './rng';

/**
 * 兩個人一起選路線（連線版 2026-09-11）。
 *
 * 規則跟秘寶撞件同一套（使用者早先拍板「跟選路線一樣讓兩個人選」）：
 * **選一樣就走那一格；選不一樣就擲一次骰，兩格各一半機會。**
 *
 * 為什麼不是「主機說了算」：那會讓第二個人變成乘客，兩個人一起玩的意義少一半。
 * 也不是「要談到同意為止」：那在遊戲裡只會變成互相等待，而且沒有介面可以談。
 * 擲骰至少是公平的，而且**兩邊各自算、結果一樣**（用的是整局的亂數）。
 *
 * 擲骰只在真的分歧時發生——**選一樣就一次骰都不擲**，
 * 不然單人局跟「兩個人剛好同意」的亂數走向會不一樣，之後的地圖與獎勵全部位移。
 */
export function settleVotes(rng: Rng, votes: readonly (string | null)[]): string | null {
  const cast = votes.filter((v): v is string => v !== null);
  if (cast.length === 0) return null;              // 還沒有人投
  const uniq = [...new Set(cast)];
  if (uniq.length === 1) return uniq[0] as string; // 同意，不擲骰
  return rng.pick(uniq);
}

/** 大家都投了嗎（倒下的人不算——他沒得選，見規則四） */
export function allVoted(votes: readonly (string | null)[], standing: readonly boolean[]): boolean {
  let any = false;
  for (let i = 0; i < votes.length; i++) {
    if (!standing[i]) continue;
    any = true;
    if (votes[i] === null) return false;
  }
  return any;
}

/**
 * 把**倒下的人**那幾票洗掉（連線版 2026-09-11 第二輪稽核 高-5）。
 *
 * `allVoted` 本來就跳過倒下的座位，所以站著的人一投完就立刻結算——
 * 可是結算用的是整個票面陣列，倒下那一票**照到達的時機**可能在裡面也可能不在：
 * 站著那台先收到自己的票就結算（只有一票），倒下那台先收到自己的票、
 * 等站著的票到了才結算（兩票都在）。於是兩台發出去的牌不一樣、`nextUid` 差一個，
 * 下一格對帳就炸開；選路線更糟，票面不同會決定「要不要擲骰」。
 *
 * **結算前一律先洗一次**，結果就跟票到達的順序無關了。
 * 這是真正擋得住競態的那一道；畫面把倒下的按鈕停用只是順手不讓他按。
 */
export function onlyStanding(
  votes: readonly (string | null)[], standing: readonly boolean[],
): (string | null)[] {
  return votes.map((v, i) => (standing[i] ? v : null));
}
