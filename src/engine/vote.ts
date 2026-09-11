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
