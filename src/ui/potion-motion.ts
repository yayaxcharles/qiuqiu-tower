import type { PotionDef } from '../engine/types';
import { companionPlayableAction, type CompanionMotionAction } from './companion-motion';
import { qiuqiuPlayableAction, type QiuqiuAction } from './qiuqiu-motion';
import type { CombatMotionAction, CombatMotionSource } from './qiuqiu-combat-motion';
import { THROW_POTION_IDS } from './projectile-kinds';

/**
 * 用忍具時四隻貓各演哪個逐格動作（2026-09-22 晚，盤點 docs/審查報告/畫面盤點_2026-09-22.md 問題 1）。
 *
 * 原本只有吃的（飯糰那類）有逐格動作，其餘忍具一按下去，動作畫布收起來、舊版靜態立繪亮 0.7 秒；
 * 三連針還在舊版「擲」與舊版「爪擊」兩張圖之間換三次。
 *
 * 分類沿用舊版靜態姿勢那三路（丟的擲、吃的吃、其餘施術），再照出牌規則補兩條效果：
 * 擋傷害的擺架式（跟淡定、金鐘罩同一套）、抽牌的翻卷軸（跟抽牌的技能牌同一套）。
 */

/** 吃喝的忍具（食物與喝的） */
// 提神茶（喝的）、對半包子（掰開吃的，效果是蜷縮不是回血，照規則會落到施術）是 2026-09-23 內容擴充第一批加的
// 便當（打開來吃）、傳功丹（吞下去）是 2026-09-23 第二批加的：效果不是回血，照規則會落到施術
export const EAT_POTIONS: ReadonlySet<string> = new Set(['onigiri', 'catgrass_tea', 'dried_fish_bundle', 'tuna', 'milk', 'qi_tea', 'share_half', 'bento', 'transfer_pill']);
/**
 * 丟出去的忍具。原本只有手裡劍、三連針；2026-09-22（批次 proj）接上飛行物之後，
 * 鞭炮、麻繩、煙霧彈、貓薄荷球、定身釘、亂石包也是丟出去的（清單與飛什麼在 projectile-kinds.ts）。
 */
export const THROW_POTIONS: ReadonlySet<string> = THROW_POTION_IDS;

export type PotionMotionKind = 'eat' | 'throw' | 'guard' | 'draw' | 'cast';

const GUARD_EFFECTS: ReadonlySet<string> = new Set(['block', 'immuneThisTurn']);

export function potionMotionKind(potion: Pick<PotionDef, 'id' | 'effects'>): PotionMotionKind {
  if (THROW_POTIONS.has(potion.id)) return 'throw';
  const kinds = potion.effects.map((effect) => effect.kind);
  // 回血的也算吃（跟回血的牌同一條規則；九命符對到九命怪貓那張牌，也是吃）
  if (EAT_POTIONS.has(potion.id) || kinds.includes('heal')) return 'eat';
  if (kinds.some((kind) => GUARD_EFFECTS.has(kind))) return 'guard';
  if (kinds.includes('draw')) return 'draw';
  return 'cast';
}

/**
 * 丟的：四隻都用空手擲出（`toss`，2026-09-23）——東西由遊戲另外畫著飛出去，出手前手上不拿任何東西。
 * 原本球球借擲手裏劍、菲菲借彈飛針（出手前手上是一枚手裏劍或一根針，飛出去的卻是鞭炮、煙霧彈⋯⋯），
 * 噹噹、封封借原地推掌、原地一刺（`palm_throw`、`thrust_throw`，現在只當擲出圖還沒下載好時的替身）。
 * 例外：球球丟手裡劍照舊擲手裏劍（手上那枚剛好對）；菲菲的三連針用連針、麻繩用反手甩出去（手上是針、是空的）。
 * 施術：球球、菲菲結印；噹噹、封封運氣。
 */
const ACTIONS: Readonly<Record<CombatMotionSource, Readonly<Record<PotionMotionKind, CombatMotionAction>>>> = {
  qiuqiu: { eat: 'eat', throw: 'toss', guard: 'guard', draw: 'scroll', cast: 'seal' },
  feifei: { eat: 'eat', throw: 'toss', guard: 'guard', draw: 'seal', cast: 'seal' },
  dangdang: { eat: 'eat', throw: 'toss', guard: 'guard', draw: 'focus', cast: 'focus' },
  fengfeng: { eat: 'eat', throw: 'toss', guard: 'guard', draw: 'focus', cast: 'focus' },
};
const OWN: Readonly<Partial<Record<CombatMotionSource, Readonly<Record<string, CombatMotionAction>>>>> = {
  qiuqiu: { shuriken: 'shuriken' },
  feifei: { needle_rain: 'needle_combo', rope: 'needle_backhand' },
};

/** 這一位用這支忍具要播的動作（延後下載的圖還沒到就換成預載的替身，不交還靜態立繪） */
export function potionMotionAction(source: CombatMotionSource, potion: Pick<PotionDef, 'id' | 'effects'>): CombatMotionAction {
  const action = OWN[source]?.[potion.id] ?? ACTIONS[source][potionMotionKind(potion)];
  return source === 'qiuqiu'
    ? qiuqiuPlayableAction(action as QiuqiuAction)
    : companionPlayableAction(source, action as CompanionMotionAction);
}
