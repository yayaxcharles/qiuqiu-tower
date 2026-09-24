import { playCard } from './combat';
import type { CombatState } from './types';

/** 一隻魔物會少幾點血：沒有隨機的牌 `min === max`；隨機的（醉拳 4～14、暗器匣隨機打一隻）是一個範圍 */
export interface HpLoss { min: number; max: number }

/** 場上最多幾隻魔物：隨機挑目標時，每一隻都要被「挑到」過一次（見下面） */
const MAX_PICK = 6;

/**
 * 瞄準時先算這一下會打掉每隻魔物多少血（使用者 2026-09-24 晚：「指上去但還沒打出去時，就先顯示怪物會扣的血量」）。
 *
 * **在戰鬥的複本上真的打一次**，比對前後每隻魔物的血，不另寫一套傷害公式——另寫一套遲早跟引擎對不上。
 * 防禦先吃、易傷、爪力、多段、蓄氣 ×1.3、秘寶加成、打死之後的連鎖（回血、復活），全部自動算進去。
 * 戰報可能很長，複製前先只留最後一筆（跟連線重播的複本同一招，見 combat.ts 的 `remoteCombatBefore`）。
 *
 * **不偷看骰子**（推前稽核 2026-09-24 中-1）：複本若帶同一個亂數狀態，醉拳這種隨機傷害的牌，預覽顯示的就是這一次必定骰出的數字，
 * 玩家可以「先偷看再決定」、還能用出牌順序操弄。所以擲骰一律被固定：先試「全擲最小」與「全擲最大」兩次，
 * 兩次結果一樣就沒有隨機，直接報；不一樣就再試「每次都擲第 k 小」（k＝1…），讓隨機挑目標（暗器匣）時每一隻都被挑到過，
 * 每隻魔物取所有試打的最少～最多（複審 低-1：只試兩端時，三隻中間那隻不會被挑到）。
 *
 * 打出去會停下來等選牌（`pending`）的牌不預覽：選完之後才觸發的東西算不到，寧可不畫也不要畫錯（推前稽核 低-2）。
 * 回傳：魔物 uid → 會少的血（沒少血的不列；最多扣到 0）。打不出去、要選牌、或複製／試打出錯，回空的（畫面就不畫預覽）。
 */
export function previewHpLoss(cs: CombatState, uid: number, targetUid: number | undefined, seat: number): Map<number, HpLoss> {
  const out = new Map<number, HpLoss>();
  const low = trial(cs, uid, targetUid, seat, 0);
  const high = low && trial(cs, uid, targetUid, seat, Infinity);
  if (!low || !high) return out;
  const runs = [low, high];
  if (!sameLoss(low, high)) {
    for (let k = 1; k < MAX_PICK; k++) {
      const r = trial(cs, uid, targetUid, seat, k);
      if (r) runs.push(r);
    }
  }
  for (const e of cs.enemies) {
    const got = runs.map((r) => r.get(e.uid) ?? 0);
    const max = Math.max(...got);
    if (max > 0) out.set(e.uid, { min: Math.min(...got), max });
  }
  return out;
}

function sameLoss(a: Map<number, number>, b: Map<number, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

/**
 * 在複本上打一次，擲骰一律擲成「第 k 小」（0＝最小、Infinity＝最大，超過範圍就停在最大）。
 * 回傳每隻少了幾點血，或 null（打不出去、停下來選牌、出錯）
 */
function trial(cs: CombatState, uid: number, targetUid: number | undefined, seat: number, k: number): Map<number, number> | null {
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
  // 只蓋這一顆複本的 `int`：`pick`／`shuffle` 也走它，所以挑目標、洗牌一起被固定
  sim.rng.int = (min: number, max: number) => Math.min(max, min + k);
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
