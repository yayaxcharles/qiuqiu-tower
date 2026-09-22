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
export const EAT_POTIONS: ReadonlySet<string> = new Set(['onigiri', 'catgrass_tea', 'dried_fish_bundle', 'tuna', 'milk']);
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
 * 丟的：球球擲手裏劍、菲菲彈飛針（三連針用連針，一次連出好幾根；麻繩用反手甩出去那一套）；
 * 噹噹、封封沒有投擲動作，改用原地推掌、原地一刺（沒有衝上前，因為東西是丟出去的）。
 * 那兩個是借同一套圖的「丟東西版」（`palm_throw`、`thrust_throw`）：出手格放出、飛到才算命中（companion-motion.ts）。
 * 施術：球球、菲菲結印；噹噹、封封運氣。
 */
const ACTIONS: Readonly<Record<CombatMotionSource, Readonly<Record<PotionMotionKind, CombatMotionAction>>>> = {
  qiuqiu: { eat: 'eat', throw: 'shuriken', guard: 'guard', draw: 'scroll', cast: 'seal' },
  feifei: { eat: 'eat', throw: 'shuriken', guard: 'guard', draw: 'seal', cast: 'seal' },
  dangdang: { eat: 'eat', throw: 'palm_throw', guard: 'guard', draw: 'focus', cast: 'focus' },
  fengfeng: { eat: 'eat', throw: 'thrust_throw', guard: 'guard', draw: 'focus', cast: 'focus' },
};
const OWN: Readonly<Partial<Record<CombatMotionSource, Readonly<Record<string, CombatMotionAction>>>>> = {
  feifei: { needle_rain: 'needle_combo', rope: 'needle_backhand' },
};

/** 這一位用這支忍具要播的動作（延後下載的圖還沒到就換成預載的替身，不交還靜態立繪） */
export function potionMotionAction(source: CombatMotionSource, potion: Pick<PotionDef, 'id' | 'effects'>): CombatMotionAction {
  const action = OWN[source]?.[potion.id] ?? ACTIONS[source][potionMotionKind(potion)];
  return source === 'qiuqiu'
    ? qiuqiuPlayableAction(action as QiuqiuAction)
    : companionPlayableAction(source, action as CompanionMotionAction);
}
