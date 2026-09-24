import { playCard } from './combat';
import type { CombatState } from './types';

/**
 * 瞄準時先算這一下會打掉每隻魔物多少血（使用者 2026-09-24 晚：「指上去但還沒打出去時，就先顯示怪物會扣的血量」）。
 *
 * **在戰鬥的複本上真的打一次**，比對前後每隻魔物的血，不另寫一套傷害公式——另寫一套遲早跟引擎對不上。
 * 防禦先吃、易傷、爪力、多段、蓄氣 ×1.3、秘寶加成、打死之後的連鎖，全部自動算進去。
 * 複本帶同一個亂數狀態（`rng.clone()`），隨機的部分（打隨機一隻、幾段）也跟真的打出去一樣。
 * 戰報可能很長，複製前先只留最後一筆（跟連線重播的複本同一招，見 combat.ts 的 `remoteCombatBefore`）。
 *
 * 回傳：魔物 uid → 會少幾點血（沒少血的不列；最多扣到 0）。打不出去、或複製／試打出錯，回空的（畫面就不畫預覽）。
 */
export function previewHpLoss(cs: CombatState, uid: number, targetUid: number | undefined, seat: number): Map<number, number> {
  const out = new Map<number, number>();
  const log = cs.log;
  let sim: CombatState;
  try {
    cs.log = log.length > 1 ? log.slice(-1) : log;
    sim = structuredClone(cs);
    sim.rng = cs.rng.clone();
  } catch {
    return out;
  } finally {
    cs.log = log;
  }
  try {
    if (!playCard(sim, uid, targetUid, seat)) return out;
  } catch {
    return out;
  }
  for (const e of cs.enemies) {
    if (e.dead || e.hp <= 0) continue;
    const after = sim.enemies.find((x) => x.uid === e.uid);
    const lost = e.hp - Math.max(0, after?.hp ?? 0);
    if (lost > 0) out.set(e.uid, Math.min(lost, e.hp));
  }
  return out;
}
