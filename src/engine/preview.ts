import { playCard } from './combat';
import type { CombatState } from './types';

/** 一隻魔物會少幾點血：沒有隨機的牌 `min === max`；隨機的（醉拳 4～14）是一個範圍 */
export interface HpLoss { min: number; max: number }

/**
 * 瞄準時先算這一下會打掉每隻魔物多少血（使用者 2026-09-24 晚：「指上去但還沒打出去時，就先顯示怪物會扣的血量」）。
 *
 * **在戰鬥的複本上真的打一次**，比對前後每隻魔物的血，不另寫一套傷害公式——另寫一套遲早跟引擎對不上。
 * 防禦先吃、易傷、爪力、多段、蓄氣 ×1.3、秘寶加成、打死之後的連鎖（回血、復活），全部自動算進去。
 * 戰報可能很長，複製前先只留最後一筆（跟連線重播的複本同一招，見 combat.ts 的 `remoteCombatBefore`）。
 *
 * **不偷看骰子**（推前稽核 2026-09-24 中-1）：複本若帶同一個亂數狀態，醉拳這種隨機傷害的牌，預覽顯示的就是這一次必定骰出的數字，
 * 玩家可以「先偷看再決定」、還能用出牌順序操弄。所以試打兩次，一次把所有擲骰都擲成最小、一次擲成最大，
 * 報「最少～最多」；沒有隨機的牌兩次一樣。隨機挑目標的也一樣處理（兩次挑到不同隻，就各自是 0～N）。
 *
 * 打出去會停下來等選牌（`pending`）的牌不預覽：選完之後才觸發的東西算不到，寧可不畫也不要畫錯（推前稽核 低-2）。
 * 回傳：魔物 uid → 會少的血（沒少血的不列；最多扣到 0）。打不出去、要選牌、或複製／試打出錯，回空的（畫面就不畫預覽）。
 */
export function previewHpLoss(cs: CombatState, uid: number, targetUid: number | undefined, seat: number): Map<number, HpLoss> {
  const out = new Map<number, HpLoss>();
  const low = trial(cs, uid, targetUid, seat, 'low');
  const high = low && trial(cs, uid, targetUid, seat, 'high');
  if (!low || !high) return out;
  for (const e of cs.enemies) {
    const a = low.get(e.uid) ?? 0, b = high.get(e.uid) ?? 0;
    if (a > 0 || b > 0) out.set(e.uid, { min: Math.min(a, b), max: Math.max(a, b) });
  }
  return out;
}

/** 在複本上打一次，擲骰一律擲成最小（`low`）或最大（`high`）；回傳每隻少了幾點血，或 null（打不出去、停下來選牌、出錯） */
function trial(cs: CombatState, uid: number, targetUid: number | undefined, seat: number, roll: 'low' | 'high'): Map<number, number> | null {
  const log = cs.log;
  let sim: CombatState;
  try {
    cs.log = log.length > 1 ? log.slice(-1) : log;
    sim = structuredClone(cs);
    sim.rng = cs.rng.clone();
  } catch {
    return null;
  } finally {
    cs.log = log;
  }
  // 只蓋這一顆複本的 `int`：`pick`／`shuffle` 也走它，所以挑目標、洗牌一起被擲成最小或最大
  sim.rng.int = roll === 'low' ? (min: number) => min : (_min: number, max: number) => max;
  try {
    if (!playCard(sim, uid, targetUid, seat) || sim.pending) return null;
  } catch {
    return null;
  }
  const lost = new Map<number, number>();
  for (const e of cs.enemies) {
    if (e.dead || e.hp <= 0) continue;
    const after = sim.enemies.find((x) => x.uid === e.uid);
    const n = e.hp - Math.max(0, after?.hp ?? 0);
    if (n > 0) lost.set(e.uid, Math.min(n, e.hp));
  }
  return lost;
}
