import type { CoopAction } from './action';

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
  | { m: 'start'; seed: string; diff: number; enc: string }
  /**
   * 地圖上投一票：我想走這一格。
   *
   * **刻意不走 `CoopAction`**：那條路上的每個動作都要先過 `canApply(cs, …)`，
   * 而地圖上根本沒有 `cs`。而且投票跟鎖步的號碼排序無關——每個座位只投一次，
   * 誰先到都一樣（見 `engine/vote.ts` 的規則）。
   */
  | { m: 'vote'; seat: number; n: string }
  | { m: 'req'; a: CoopAction }
  | { m: 'act'; seq: number; a: CoopAction }
  | { m: 'sync'; turn: number; fp: string };

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
