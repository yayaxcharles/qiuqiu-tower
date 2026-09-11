import type { CoopAction } from './action';
import type { RunAction } from './runaction';

/**
 * 線上真正傳的訊息。刻意壓得很短：每回合要傳十幾次。
 *
 * - `req`：客戶端的請求。**還沒有號碼**——號碼只有主機發得出來。
 * - `act`：主機廣播的、編號過的動作。兩邊照號碼套用。
 * - `sync`：每回合結束的對帳單。
 */
export type NetMessage =
  /**
   * 開局。主機挑好種子與難度之後送一次，兩邊**各自**用它跑 `newCoopRun`——
   * 傳的是種子不是整局狀態（那是鎖步的整個重點：引擎完全決定性，
   * 同一顆種子在兩台機器上長出一模一樣的地圖、牌組、魔物）。
   */
  /*
   * `heroes`＝**每個座位各玩誰**（2026-09-12）。開房的人挑，兩邊照同一份開局，
   * 起手牌與起始秘寶才算得出一樣的東西（那是鎖步的前提）。
   * 沒帶這個欄位就是兩邊都球球（舊版本連上來時的樣子）。
   */
  | { m: 'start'; seed: string; diff: number; enc: string; heroes?: string[] }
  /**
   * 一次「大家各選一個」：地圖走哪一格、獎勵拿哪張牌、秘寶挑哪一件。
   * `k`＝這是在選什麼（`map`／`card`／`relic`），`v`＝選了什麼。
   *
   * **刻意不走 `CoopAction`**：那條路上的每個動作都要先過 `canApply(cs, …)`，
   * 而地圖與獎勵畫面根本沒有 `cs`。而且這種選擇跟鎖步的號碼排序無關——
   * 每個座位只選一次，誰先到都一樣（規則見 `engine/vote.ts`）。
   */
  | { m: 'pick'; seat: number; k: string; v: string }
  /**
   * 客戶端的請求。`n`＝**送信者自己的流水號**，一送一遞增。
   *
   * 為什麼請求也要編號：同一則請求可能到兩次（重送、回聲）。主機看到兩次就發兩個號碼，
   * 等於同一張牌打了兩下；而第二下一定做不出來（牌已經不在手上），
   * 於是被當成分岔、整場停掉——明明只是封包重複而已。
   * 主機記住每個座位收到的最大號，比它小或一樣的直接丟掉。
   */
  | { m: 'req'; n: number; a: CoopAction }
  /**
   * 主機回：**你那一則請求沒算數**（`n`＝請求的流水號）。
   *
   * 什麼時候會發生：客戶端的畫面比主機慢一個來回，所以它可能在「魔物已經倒下」
   * 之後才送出一張牌——送的當下在它那邊完全合法。這不是分岔，是**來不及**，
   * 跟兩個人搶同一格商品是同一類事。主機不編號、回這一則，客戶端把手放開就好。
   */
  | { m: 'drop'; n: number }
  | { m: 'act'; seq: number; a: CoopAction }
  /**
   * 整局那一半（商店、打盹、紙箱）的請求與編號動作。跟 `req`／`act` 同一套規矩，
   * 只是套用的對象是 `RunState` 不是這一場戰鬥——所以**號碼機也是另一台**，
   * 兩條通道各數各的，不然離開戰鬥再回來號碼就接不上了。
   */
  | { m: 'rreq'; n: number; a: RunAction }
  | { m: 'ract'; seq: number; a: RunAction }
  /**
   * 對帳單。`turn: -1` 是走格子時的整局對帳（沒有戰鬥可比），`k`＝**對的是哪一格**。
   *
   * 為什麼要帶格子的名字：兩邊走進同一格的時間差了幾十毫秒，
   * 收到的當下對方可能還停在上一格——直接比就會把「他還沒走到」誤判成分岔。
   * 帶上名字，就變成「我們在同一格上的狀態一不一樣」，那才是真正要問的問題。
   */
  | { m: 'sync'; turn: number; fp: string; rfp?: string; k?: string };

/**
 * 傳輸層的介面。**刻意抽成介面**，因為真正的實作（WebRTC）在測試環境跑不起來，
 * 而會話邏輯（誰發號碼、缺號怎麼補、對帳對不上怎麼辦）才是真正會出錯的地方。
 * 把兩者分開，會出錯的那一半就測得到了。
 */
export interface Transport {
  send(msg: NetMessage): void;
  /** 收到訊息時呼叫。同一時間只會有一個 */
  onMessage(fn: (msg: NetMessage) => void): void;
  /** 連線斷了 */
  onClose(fn: (why: string) => void): void;
  close(): void;
}

/**
 * 測試用的對接傳輸：兩端直接互相塞訊息，中間可以插隊、複製、延遲。
 *
 * 為什麼要能插隊與複製：真實網路本來就會這樣，而**鎖步對這兩件事特別脆弱**
 * ——順序錯就分岔、重複就多打一張牌。用得出來才測得到。
 */
export class LoopbackPair {
  readonly a: Transport;
  readonly b: Transport;
  /** 設成 true 就把訊息留在手上，`flush` 時才送（可以順便打亂順序） */
  hold = false;
  private heldToA: NetMessage[] = [];
  private heldToB: NetMessage[] = [];
  private onA: ((m: NetMessage) => void) | null = null;
  private onB: ((m: NetMessage) => void) | null = null;
  private closedA: ((w: string) => void) | null = null;
  private closedB: ((w: string) => void) | null = null;

  constructor() {
    this.a = {
      send: (m) => { if (this.hold) this.heldToB.push(m); else this.onB?.(m); },
      onMessage: (fn) => { this.onA = fn; },
      onClose: (fn) => { this.closedA = fn; },
      close: () => { this.closedB?.('對方離線'); },
    };
    this.b = {
      send: (m) => { if (this.hold) this.heldToA.push(m); else this.onA?.(m); },
      onMessage: (fn) => { this.onB = fn; },
      onClose: (fn) => { this.closedB = fn; },
      close: () => { this.closedA?.('對方離線'); },
    };
  }

  /** 把留著的訊息送出去。`reverse` ＝倒過來送（模擬封包亂序） */
  flush(opts: { reverse?: boolean; duplicate?: boolean } = {}): void {
    const toA = opts.reverse ? [...this.heldToA].reverse() : [...this.heldToA];
    const toB = opts.reverse ? [...this.heldToB].reverse() : [...this.heldToB];
    this.heldToA = []; this.heldToB = [];
    for (const m of toA) { this.onA?.(m); if (opts.duplicate) this.onA?.(m); }
    for (const m of toB) { this.onB?.(m); if (opts.duplicate) this.onB?.(m); }
  }
}
