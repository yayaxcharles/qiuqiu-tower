import { showsTelegraph } from '../content/enemies';
import { getStatus } from '../engine/statuses';
import type { CombatState } from '../engine/types';

/**
 * 下一個要出手、而且該亮預告的魔物 uid（沒有就回 undefined）。
 *
 * 抽成沒有畫面相依的純函式，理由跟 `enemylayout.ts` 一樣：這裡的條件只要漏一項就會演出假預告
 * （蹲低發光了卻什麼都沒發生），而那種錯只在特定狀態下才出得來，開瀏覽器碰不到。
 *
 * **這個函式只讀不寫**：下一個是誰是拿索引偷看 `cs.enemyQueue[0]`，不是 `shift()`。
 * 預告是演出層，動到佇列就會吃掉一隻魔物的回合——測試釘死了「呼叫前後戰鬥狀態一個位元都不變」。
 */
export function telegraphTarget(cs: CombatState): number | undefined {
  if (cs.phase !== 'player') return undefined;
  const uid = cs.enemyQueue?.[0];
  if (uid === undefined) return undefined;
  const e = cs.enemies.find((x) => x.uid === uid);
  if (!e || !showsTelegraph(e.enemyId)) return undefined;
  // 亮了卻不會出手的都排除，不然是演一場假的：
  // 倒下的、剛爬起來這拍不出招的、被定身的（整個動作被擋掉）、睡著的（什麼都不做）
  if (e.dead || e.justRevived) return undefined;
  if (getStatus(e, '定身') > 0 || getStatus(e, '沉睡') > 0) return undefined;
  return uid;
}
