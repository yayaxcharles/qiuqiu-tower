import type { CoopAction } from '../net/action';
import type { CardInstance } from '../engine/types';

/**
 * 同伴剛打出哪一張（使用者 2026-09-15：「完全不知道隊友做了什麼」）。
 *
 * 動作只帶牌的 uid，而套用之後那張牌已經離開他的手牌（棄牌堆、消耗堆，能力牌甚至不在任何堆裡），
 * 所以要拿**套用之前**的手牌快照來對：`session.beforeApply` 那一刻把每一位的手牌抄一份，
 * 套用完再用 uid 回頭找。純函式，戰鬥畫面只負責畫。
 */
export interface MatePlay { seat: number; card: CardInstance; turn: number }

export function matePlays(
  applied: readonly { a: CoopAction }[],
  mySeat: number,
  handsBefore: readonly (readonly CardInstance[] | undefined)[],
  turn: number,
): MatePlay[] {
  const out: MatePlay[] = [];
  for (const { a } of applied) {
    if (a.t !== 'card' || a.seat === mySeat) continue;   // 自己的不用掛，自己知道打了什麼
    const card = handsBefore[a.seat]?.find((c) => c.uid === a.u);
    if (card) out.push({ seat: a.seat, card, turn });
  }
  return out;
}
