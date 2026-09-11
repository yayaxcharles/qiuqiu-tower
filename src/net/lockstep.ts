import type { CoopAction } from './action';
import { combatFingerprint, runFingerprint } from './hash';
import type { CombatState, RunState } from '../engine/types';

/**
 * 主機排序（使用者 2026-09-11 拍板）。
 *
 * 鎖步要成立，兩邊**套用動作的順序必須一模一樣**，但天生就不一樣：
 * 甲打了一張牌，甲這邊立刻生效、乙那邊要等封包；同一時間乙也打了一張。
 * 甲看到的順序是（甲、乙），乙看到的是（乙、甲）——兩邊當場分岔。
 * 兩張牌打同一隻怪，先後會換出不同的擊倒判定與抽牌，不是理論問題。
 *
 * 解法：**只有主機發號碼。** 所有動作都先送到主機，主機給一個遞增的編號再廣播，
 * 兩邊一律照編號套用。誰先按、封包誰先到都無所謂，編號只有一份。
 *
 * 代價：非主機那一方打自己的牌，要等一個來回（約 100～200 毫秒）才真的生效。
 * 蓋過去的方法是**動畫先演、狀態等編號回來才套**——那是畫面層的事，不在這裡。
 */

/**
 * 主機編過號的動作，這就是線上真正傳的東西。
 *
 * 泛型是因為**整局那一半也走同一套**（商店買東西、打盹、扶人）：
 * 那些動作改的是 `RunState` 不是 `CombatState`，但「順序只有一份、缺號要等、
 * 重複要丟」這三條規則一模一樣。寫兩套的話遲早有一套會漏掉其中一條。
 */
export interface SequencedAction<A = CoopAction> { seq: number; a: A }

/**
 * 主機的號碼機。**整場只有一台機器持有一個**，這是「順序只有一份」的來源。
 *
 * 主機自己的動作也要走同一支——不然主機會照「自己按的順序」套用、
 * 卻照「編號的順序」廣播，兩邊照樣分岔。這是這種架構最常見的坑。
 */
export class Sequencer<A = CoopAction> {
  private n = 0;
  /** 給一個動作編號。號碼從 1 開始，只增不減也不重複 */
  assign(a: A): SequencedAction<A> {
    this.n += 1;
    return { seq: this.n, a };
  }
  get issued(): number { return this.n; }
}

/** 套用的結果。`failed` 有東西＝已經不同步了，呼叫端要當場停下來，不要默默跳過 */
export interface ApplyResult<A = CoopAction> {
  /** 這一次真正套進去的（照編號順序） */
  applied: SequencedAction<A>[];
  /** 引擎拒絕的那一個。出現這個就代表兩邊的狀態已經對不上了 */
  failed?: SequencedAction<A>;
  /** 還在等的號碼（收到後面的、前面的還沒到）。正常情況是 undefined */
  waitingFor?: number;
}

/**
 * 動作佇列：**只照編號套用，缺號就等**。
 *
 * 為什麼要等而不是照收到的順序跑：封包順序沒有保證（就算通道保證了，
 * 主機廣播給自己是本機、給對方要走網路，兩條路的時間不一樣）。
 * 照號碼套用是唯一能讓兩邊一致的作法。
 *
 * 重複的號碼直接丟掉——重送、回聲都可能讓同一個動作到兩次，
 * 套兩次就是多打一張牌，而且兩邊多打的次數還不見得一樣。
 */
export class ActionQueue<A = CoopAction> {
  /**
   * `apply`＝把一個動作真的套下去，回傳 false＝引擎拒絕（＝已經分岔）。
   *
   * **套用的對象由呼叫端閉包起來**，不是每次呼叫再傳進來：戰鬥會換場、
   * 整局狀態只有一份，而佇列的號碼是連續的——對象跟著號碼一起換手才不會錯位。
   */
  constructor(private readonly apply: (a: A) => boolean) {}
  /** 下一個要套用的號碼 */
  private next = 1;
  private buffered = new Map<number, A>();

  /** 已經套用到第幾號 */
  get applied(): number { return this.next - 1; }
  /** 還卡在佇列裡等前面號碼的有幾個 */
  get waiting(): number { return this.buffered.size; }

  /**
   * 收到一個編號過的動作，把**接得上的**全部照順序套進去。
   *
   * 收到 5 但還缺 3、4 的話，5 會先存著；等 3 到了就套 3，4 到了就一口氣套 4、5。
   */
  receive(sa: SequencedAction<A>): ApplyResult<A> {
    if (sa.seq < this.next) return { applied: [] };          // 早就套過了（重送、回聲）
    if (this.buffered.has(sa.seq)) return { applied: [] };   // 同一個號碼來兩次
    this.buffered.set(sa.seq, sa.a);

    const applied: SequencedAction<A>[] = [];
    while (this.buffered.has(this.next)) {
      const a = this.buffered.get(this.next) as A;
      this.buffered.delete(this.next);
      const one: SequencedAction<A> = { seq: this.next, a };
      if (!this.apply(a)) {
        // 引擎拒絕了：兩邊狀態已經對不上。**號碼不往前推**，
        // 停在這裡讓呼叫端看得到是卡在哪一號，比默默跳過好查太多
        return { applied, failed: one };
      }
      this.next += 1;
      applied.push(one);
    }
    return this.buffered.size ? { applied, waitingFor: this.next } : { applied };
  }
}

/** 每回合結束互相對一次的訊息。`rfp`＝整局的指紋（戰鬥外也要對） */
export interface SyncCheck { turn: number; fp: string; rfp?: string }

/** 這一刻的對帳單 */
export function syncCheckOf(cs: CombatState): SyncCheck {
  return { turn: cs.turn, fp: combatFingerprint(cs) };
}

/**
 * 走到下一格時的對帳單。**沒有戰鬥，只對整局。**
 * `turn: -1` 是給 `diffOf` 認的記號：這一則不比回合數（整局沒有回合可言）。
 */
export function runCheckOf(run: RunState): SyncCheck {
  return { turn: -1, fp: '', rfp: runFingerprint(run) };
}

/**
 * 對方報來的對帳單跟自己合不合。
 *
 * 回傳 `null`＝合得上；回傳字串＝**已經分岔了**，字串是給玩家看的說明。
 * 分岔了就該停下來，不要讓兩個人繼續玩兩份不一樣的遊戲——
 * 鎖步最糟的情況不是出錯，是**錯了還繼續跑**。
 */
export function diffOf(mine: SyncCheck, theirs: SyncCheck): string | null {
  // 整局的對帳單（`turn: -1`）：只比整局，不比戰況
  if (mine.turn === -1 || theirs.turn === -1) {
    if (mine.rfp && theirs.rfp && mine.rfp !== theirs.rfp) {
      return `走到下一格時整局的狀態對不上（${mine.rfp} / ${theirs.rfp}）`;
    }
    return null;
  }
  if (mine.turn !== theirs.turn) return `回合對不上（我第 ${mine.turn} 回合、對方第 ${theirs.turn} 回合）`;
  if (mine.fp !== theirs.fp) return `第 ${mine.turn} 回合的戰況對不上（${mine.fp} / ${theirs.fp}）`;
  if (mine.rfp && theirs.rfp && mine.rfp !== theirs.rfp) return `整局的狀態對不上（${mine.rfp} / ${theirs.rfp}）`;
  return null;
}
