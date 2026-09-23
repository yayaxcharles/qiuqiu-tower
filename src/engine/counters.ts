import { relicById } from '../content/relics';
import type { PlayerCombat, RunPlayer } from './types';

/**
 * 計數型秘寶圖示右下角要疊的數字（2026-09-23 內容擴充第二批）。沒有計數的秘寶回 null（不疊）。
 *
 * 照殺戮尖塔的做法：圖上不畫字，數字由畫面疊（美術 art2 在五張圖的右下角留了 44×44 透明）。
 * - 木人樁（跨戰鬥）：戰鬥中看這一場的那一份（`PlayerCombat.relicCounters`），地圖上看整局那一份
 * - 撲滿（跨關）：整局那一份（戰鬥中不會動）
 * - 沙漏、線香（每 N 回合）：只有戰鬥中有，這一場的回合數除以 N 的餘數（第 N 回合發動那一拍是 0）
 * - 暗器匣（每回合第 N 張）：只有戰鬥中有，這一回合打了幾張（到 N 就停在 N）
 * 引擎自己不讀這支，純粹給畫面（`ui/hud.ts`）；寫在引擎這一側是因為規則跟著掛鉤走，測試不必開畫面。
 */
export function relicCounter(id: string, rp: RunPlayer | undefined, combat?: { turn: number; p: PlayerCombat }): number | null {
  const h = relicById[id]?.hooks;
  if (!h) return null;
  if (h.attackCounterDouble) return (combat?.p.relicCounters ?? rp?.counters)?.[id] ?? 0;
  if (h.nodeCounterFish) return rp?.counters?.[id] ?? 0;
  if (h.everyNTurns) return combat ? combat.turn % h.everyNTurns.n : null;
  if (h.onNthCard) return combat ? Math.min(combat.p.cardsPlayedThisTurn, h.onNthCard.n) : null;
  // 2026-09-23 第三批：探路杖（數到第幾個問號格，0～2）、箱中箱（**剩幾次**，用完是 0，畫面把圖示變灰，見 `relicSpent`）
  if (h.qmarkEvery) return rp?.counters?.[id] ?? 0;
  if (h.chestExtra) return Math.max(0, h.chestExtra - (rp?.counters?.[id] ?? 0));
  return null;
}

/** 次數型秘寶用完了（箱中箱：開過兩個紙箱之後）。畫面把圖示變灰、說明補「用完了」（2026-09-23 第三批） */
export function relicSpent(id: string, rp: RunPlayer | undefined): boolean {
  const h = relicById[id]?.hooks;
  return !!h?.chestExtra && (rp?.counters?.[id] ?? 0) >= h.chestExtra;
}

/** 一串秘寶各自的計數（給狀態列比對「有沒有變」用：數字變了才要重畫那一列） */
export function relicCounterKey(ids: readonly string[], rp: RunPlayer | undefined, combat?: { turn: number; p: PlayerCombat }): string {
  return ids.map((id) => relicCounter(id, rp, combat)).filter((n) => n !== null).join(',');
}
