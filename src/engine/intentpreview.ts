import { addStatus, computeAttack, getStatus } from './statuses';
import type { EnemyCombat, EnemyEffect, Unit } from './types';

/**
 * 魔物這一招每一個打人的效果，照引擎出招的順序預演出來的數字（總稽核 2026-09-16 乙 中-1）。
 *
 * 意圖牌子與提示框原本各自拿「現在的狀態」算，跟 `runEnemyEffects` 逐條結算的結果兩個方向都會錯：
 * - 鏡貓一招學兩張（淬毒·改→見血封喉）：前一張先幫你上毒，後一張照「上完毒之後」的層數打。
 *   實測你身上 2 層時牌子寫 5、實際打 12；三關強力塗毒＋→見血封喉＋，牌子 12、實際 38。
 * - 你身上 0 層毒、鏡貓有爪力時，牌子寫「攻 3」，實際是撲空、0 點。
 * - 蓄力只加倍**第一個**打人的效果（引擎的 `useCharge`），牌子卻每一下都乘二。
 * - 同一招前面給你翻肚、給自己爪力，後面那一下要吃到（「盯上你了」→ 貓抓：牌子 9、實際 13）。
 *
 * 只讀不寫：狀態都在複本上疊。數字是蜷縮與隱身之前的量（牌子一向這樣寫）。
 */
export interface HitPreview {
  fx: EnemyEffect;
  /** 一下的傷害（`damage` 連打時是每一下；`damageRandom` 是最小值） */
  dmg: number;
  /** `damageRandom` 的最大值 */
  dmgMax?: number;
  /** `damageByPlayerStatus`：出手那一刻你身上的層數 */
  stacks?: number;
}

export function previewEnemyHits(e: EnemyCombat, effects: readonly EnemyEffect[], defender: Unit, charged = !!e.charged): HitPreview[] {
  const me: Unit = { ...e, statuses: { ...e.statuses } };
  const you: Unit = { ...defender, statuses: { ...defender.statuses } };
  let mult = charged;
  const useCharge = (): number => { if (!mult) return 1; mult = false; return 2; };
  const out: HitPreview[] = [];
  for (const fx of effects) {
    switch (fx.kind) {
      // 蓄力不加倍穿透招（跟 `actions.ts` 同一條規則，預告要跟實際打出來的一致）
      case 'damage': { const x = useCharge(); out.push({ fx, dmg: computeAttack(fx.amount * (fx.pierce ? 1 : x), me, you) }); break; }
      case 'damageRandom': {
        const x = useCharge();
        out.push({ fx, dmg: computeAttack(fx.min * x, me, you), dmgMax: computeAttack(fx.max * x, me, you) });
        break;
      }
      case 'selfDestruct': { const x = useCharge(); out.push({ fx, dmg: computeAttack(fx.amount * x, me, you) }); return out; }
      case 'damageByPlayerStatus': {
        const x = useCharge();   // 引擎撲空也照樣用掉蓄力
        const n = getStatus(you, fx.name);
        out.push({ fx, stacks: n, dmg: n > 0 ? computeAttack(n * (fx.mul ?? 1) * x, me, you) : 0 });
        if (fx.consume && n > 0) addStatus(you, fx.name, -n);
        break;
      }
      case 'statusPlayer': addStatus(you, fx.name, fx.amount); break;
      case 'statusSelf': addStatus(me, fx.name, fx.amount); break;
      default: break;
    }
  }
  return out;
}
