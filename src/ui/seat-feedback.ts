import { getStatus } from '../engine/statuses';
import type { PlayerCombat } from '../engine/types';

/**
 * 魔物對**某一位**做了什麼：擋下幾點、閃過沒、被塞牌、被看破、被吹散手牌（2026-09-23 health H-1）。
 *
 * **為什麼不再讀戰報句子**：畫面原本拿句子開頭（「蜷縮擋下了」「塞進你的」「的身法」）決定要不要演。
 * 09-15 連線時引擎把擋下那行改成「球球的蜷縮擋下了」，畫面沒跟著改——從那天起連線時自己擋下攻擊，
 * 「擋住 N」飄字、盾牌光、鏘聲整個不見；塞牌、看破的光一律打在自己這格，同伴中招也亮在我身上；
 * 兩位同角色時「球球閃過了」分不出是誰。句子一改就安靜失效、不報錯，這專案又常改文案。
 *
 * 現在全部改看**這一位自己的數字**：擋下與閃過看引擎替畫面記的累計（`blockedTotal`／`dodgedTotal`，
 * 引擎不讀、不進指紋），其餘看狀態差。抽成純函式放這裡，是照 health H-5 的止血規矩：
 * `combat.ts` 只接線，判斷本身可以用引擎真的跑一場來測。
 */
export interface SeatFeedbackSnap {
  /** 整場擋下的點數累計 */
  guarded: number;
  /** 整場閃過的次數 */
  dodged: number;
  /** 手上＋三個牌堆的總張數：戰鬥裡只有魔物塞牌（`giveCards`）會生出新牌 */
  cards: number;
  /** 爪力＋貓步（破功、震散拆的是這兩個） */
  growth: number;
  /** 隱身＋潛水（看破拆的是這兩個；閃過會自己用掉一層隱身，要扣掉） */
  hide: number;
  /** 下回合多抽／少抽幾張（吹散手牌扣的是這個） */
  drawNext: number;
}

export function seatFeedbackSnap(p: PlayerCombat): SeatFeedbackSnap {
  return {
    guarded: p.blockedTotal ?? 0,
    dodged: p.dodgedTotal ?? 0,
    cards: p.hand.length + p.drawPile.length + p.discardPile.length + p.exhaustPile.length,
    growth: getStatus(p, '爪力') + getStatus(p, '貓步'),
    hide: getStatus(p, '隱身') + getStatus(p, '潛水'),
    drawNext: p.drawNextTurn,
  };
}

export interface SeatFeedback {
  /** 這一拍擋下幾點（多段攻擊加總） */
  blocked: number;
  dodged: boolean;
  /** 被塞了牌 */
  cursed: boolean;
  /** 成長被拆、或囤的隱身潛水被拆（不算閃過自己用掉的那幾層） */
  stripped: boolean;
  /** 下回合少抽幾張 */
  blown: number;
}

/**
 * 同一位在一拍前後的差。`before` 缺（這一拍才冒出來的座位）就當什麼都沒發生。
 *
 * 被塞牌、被看破、被吹散只在**魔物出手的那一拍**有意義，由呼叫端擋（`acting.size > 0`）：
 * 回合開始抽牌、潛水換隱身、下回合抽牌數歸零也會動到這幾個數字。
 * 已知的漏網：毛線手套在同一拍補回 1 點爪力、剛好抵掉被拆的那 1 點時認不出來（淨值沒變）。
 */
export function seatFeedback(before: SeatFeedbackSnap | undefined, after: SeatFeedbackSnap): SeatFeedback {
  if (!before) return { blocked: 0, dodged: false, cursed: false, stripped: false, blown: 0 };
  const dodges = Math.max(0, after.dodged - before.dodged);
  return {
    blocked: Math.max(0, after.guarded - before.guarded),
    dodged: dodges > 0,
    cursed: after.cards > before.cards,
    stripped: after.growth < before.growth || before.hide - after.hide > dodges,
    blown: Math.max(0, before.drawNext - after.drawNext),
  };
}
