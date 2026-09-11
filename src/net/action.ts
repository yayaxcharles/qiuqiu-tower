import { canPlay, forceReady, playCard, resolveChoice, setReady, usePotion } from '../engine/combat';
import type { CombatState } from '../engine/types';

/**
 * 一個玩家的動作——**連線上傳的就是這個**（鎖步連線的核心）。
 *
 * 鎖步的意思是：兩邊各跑一份一模一樣的引擎，只傳「誰做了什麼」，不傳遊戲狀態。
 * 一個動作二十幾個位元組，所以延遲、頻寬完全不是問題；代價是兩邊**必須**算出
 * 一模一樣的結果，這由引擎的決定性保證（見 `tools/engine_pure.test.ts`）。
 *
 * 欄位名字刻意用一個字母：這東西每回合要傳十幾次，而且將來要塞進房間碼裡。
 */
export type CoopAction =
  /** 打一張牌。`u`＝手牌 uid、`g`＝目標魔物 uid（不用選目標就不填） */
  | { t: 'card'; seat: number; u: number; g?: number }
  /** 喝一瓶忍具 */
  | { t: 'potion'; seat: number; id: string; g?: number }
  /** 把「選幾張牌」的暫停解掉（消耗、保留、丟棄那些） */
  | { t: 'choose'; seat: number; u: number[] }
  /** 舉手／收回手（`on: false`＝我反悔了，還要再想想） */
  | { t: 'ready'; seat: number; on: boolean }
  /** 對方走開了，替他收回合。`w`＝要替誰收 */
  | { t: 'force'; seat: number; w: number };

/**
 * 把一個收到的動作套到戰鬥上。**這是連線訊息進入引擎的唯一入口。**
 *
 * 為什麼只留一個入口：兩邊各自把訊息翻譯成引擎呼叫的話，翻譯規則遲早會走鐘
 * （一邊多做了一件事、一邊少做了一件），而鎖步分岔的當下不會報錯，
 * 要等好幾回合畫面對不上才發現。集中在這裡，兩邊跑的就是同一段程式碼。
 *
 * 回傳 `false`＝這個動作**不合法**（手牌裡沒這張、座位不對、已經舉手了…）。
 * 合法性由引擎自己判（`canPlay` 那些），這裡不另外寫一套——寫兩套就會有兩套說法。
 * 收到不合法的動作代表兩邊已經不同步了，呼叫端應該當場停下來報錯，
 * 不要默默跳過繼續跑（那只會把分岔往後拖，更難查）。
 */
export function applyAction(cs: CombatState, a: CoopAction): boolean {
  if (cs.phase !== 'player') return false;
  switch (a.t) {
    case 'card': return playCard(cs, a.u, a.g, a.seat);
    case 'potion': return usePotion(cs, a.id, a.g, a.seat);
    case 'choose': return resolveChoice(cs, a.u);
    case 'ready': { setReady(cs, a.seat, a.on); return true; }
    case 'force': { forceReady(cs, a.w); return true; }
  }
}

/**
 * 這個動作**現在**做得出來嗎——送出去之前先自己問一次。
 *
 * 不是為了安全（對方大可傳任何東西過來），是為了**早點抓到分岔**：
 * 自己這邊就已經不合法的動作，送出去對方一定也做不出來，那代表畫面跟引擎
 * 已經對不上了，在送出的那一刻就該停，不要等對方回報。
 */
export function canApply(cs: CombatState, a: CoopAction): boolean {
  if (cs.phase !== 'player') return false;
  switch (a.t) {
    case 'card': return canPlay(cs, a.u, a.g, a.seat).ok;
    case 'potion': return !cs.pending && !!cs.players[a.seat] && !cs.players[a.seat]!.down && !cs.players[a.seat]!.ready;
    case 'choose': return cs.pending !== null;
    case 'ready': return !!cs.players[a.seat] && !cs.players[a.seat]!.down;
    case 'force': return !!cs.players[a.w] && !cs.players[a.w]!.down && !cs.players[a.w]!.ready;
  }
}
