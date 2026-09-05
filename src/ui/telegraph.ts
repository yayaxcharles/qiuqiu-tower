import { showsTelegraph } from '../content/enemies';
import { willAct } from '../engine/combat';
import type { CombatState, EnemyCombat } from '../engine/types';

/**
 * 下一個要出手、而且該亮預告的魔物 uid（沒有就回 undefined）。
 *
 * 抽成沒有畫面相依的純函式，理由跟 `enemylayout.ts` 一樣：這裡的條件只要漏一項就會演出假預告
 * （蹲低發光了卻什麼都沒發生），而那種錯只在特定狀態下才出得來，開瀏覽器碰不到。
 *
 * **這個函式只讀不寫**：下一個是誰是拿索引偷看 `cs.enemyQueue[0]`，不是 `shift()`。
 * 預告是演出層，動到佇列就會吃掉一隻魔物的回合——測試釘死了「呼叫前後戰鬥狀態一個位元都不變」。
 */
/**
 * 這一拍這隻魔物到底會不會出手。畫面層兩個地方要問同一個問題：要不要亮預告、剛剛那拍該不該
 * 演出手的動作——判準必須跟引擎 `stepEnemyTurn` 一致，不然會演出根本沒發生的事。
 *
 * **定身擋的是整個動作，不只攻擊**（使用者 2026-09-02 實玩：「定身敵人好像只能阻止攻擊？偷竊照偷」，
 * 引擎那次修了，畫面這邊漏跟）。所以山賊被定住時「搶劫」不該演、招財貓的「招手」也不該演。
 * 沉睡同理：睡著的什麼都不做。
 */
export { willAct } from '../engine/combat';

export function telegraphTarget(cs: CombatState): number | undefined {
  if (cs.phase !== 'player') return undefined;
  const uid = cs.enemyQueue?.[0];
  if (uid === undefined) return undefined;
  const e = cs.enemies.find((x) => x.uid === uid);
  if (!e || !showsTelegraph(e.enemyId)) return undefined;
  // 亮了卻不會出手的都排除，不然是演一場假的
  return willAct(e) ? uid : undefined;
}
