import { applyAction, canApply } from './action';
import type { CoopAction } from './action';
import { applyRunAction, canApplyRun } from './runaction';
import type { RunAction, RunCtx } from './runaction';
import type { ShopStock } from '../engine/run';
import { ActionQueue, Sequencer, diffOf, runCheckOf, syncCheckOf } from './lockstep';
import type { SequencedAction } from './lockstep';
import type { NetMessage, Transport } from './transport';
import type { CombatState, RunState } from '../engine/types';

/**
 * 一場連線對戰的會話：把傳輸層、號碼機、動作佇列黏起來。
 *
 * 兩邊的角色不對稱，這是刻意的（主機排序，使用者 2026-09-11 拍板）：
 * - **主機**持有唯一的號碼機。自己的動作也要先編號再套用——
 *   不然主機照「自己按的順序」套、照「編號的順序」廣播，兩邊照樣分岔。
 * - **客戶端**沒有號碼機。自己的動作只是「請求」，送給主機編號後繞回來才真的生效。
 *   等一個來回（約 100～200 毫秒），畫面靠「動畫先演、狀態等編號回來才套」蓋過去。
 */
export interface SessionHooks {
  /** 主機宣布開局（客戶端收得到；主機自己不會收到自己的） */
  onStart?: (seed: string, diff: number, enc: string) => void;
  /** 真的套進去了幾個動作（畫面拿它決定要演什麼） */
  onApplied?: (applied: SequencedAction[]) => void;
  /** **兩邊算出來不一樣了**。到這裡就該停下來告訴玩家，不要繼續玩兩份不一樣的遊戲 */
  onDesync?: (why: string) => void;
  /** 連線斷了 */
  onClose?: (why: string) => void;
}

export class CoopSession {
  readonly isHost: boolean;
  readonly seat: number;
  private readonly tx: Transport;
  private readonly hooks: SessionHooks;
  private readonly queue = new ActionQueue((a: CoopAction) => (this.cs ? applyAction(this.cs, a) : false));
  /** 只有主機有 */
  private readonly seq: Sequencer | null;
  private cs: CombatState | null = null;
  private dead = false;

  /*
   * 整局那一半（商店、打盹、紙箱）自己的號碼機與佇列。
   *
   * **跟戰鬥那條完全分開數**：戰鬥一場一場換、整局從頭到尾只有一份，
   * 共用一組號碼的話，離開戰鬥再進下一場，號碼會卡在中間等永遠不會來的那一號。
   */
  private readonly runSeq: Sequencer<RunAction> | null;
  /*
   * 請求的去重（兩條通道各一份）。
   *
   * `sent`＝我送出去的請求數，每送一則加一；`seen`＝主機收過的、每個座位最大的那一號。
   * 重複的請求直接丟掉——**不能當成分岔**，那只是封包到了兩次。
   */
  private sentReq = 0;
  private sentRunReq = 0;
  private readonly seenReq = new Map<number, number>();
  private readonly seenRunReq = new Map<number, number>();
  /** 這一則請求是新的嗎（主機用）。舊的或重複的回 false */
  private fresh(seen: Map<number, number>, seat: number, n: number): boolean {
    if ((seen.get(seat) ?? 0) >= n) return false;
    seen.set(seat, n);
    return true;
  }
  private readonly runQueue = new ActionQueue<RunAction>((a) => (this.rctx ? applyRunAction(this.rctx, a) : false));
  /**
   * 整局狀態。**開局設一次就不動**——它從頭到尾只有一份。
   *
   * 原本是每個畫面自己 `attachRun` 進來、離開時設回 null，結果是：地圖與戰鬥畫面
   * 根本沒設，於是走格子的對帳單一到就被「沒有整局狀態」擋掉、什麼都沒比對，
   * 等於白做（實測：兩邊走進不同節點，對帳完全沒有反應）。
   */
  private runState: RunState | null = null;
  /** 現在這一格的貨架（只有罐頭鋪有）。這個才是一格一格換的 */
  private shop: ShopStock | null = null;
  private get rctx(): RunCtx | null {
    return this.runState ? { run: this.runState, shop: this.shop ?? undefined } : null;
  }

  constructor(tx: Transport, opts: { isHost: boolean; seat: number } & SessionHooks) {
    this.tx = tx;
    this.isHost = opts.isHost;
    this.seat = opts.seat;
    this.hooks = opts;
    this.seq = opts.isHost ? new Sequencer() : null;
    this.runSeq = opts.isHost ? new Sequencer<RunAction>() : null;
    tx.onMessage((m) => { this.handle(m); });
    tx.onClose((w) => { this.dead = true; this.hooks.onClose?.(w); this.trouble?.(w); });
  }

  /** 這一場戰鬥開打了。兩邊要餵同一個 `CombatState`（各自算出來的那一份） */
  attach(cs: CombatState): void { this.cs = cs; }

  /**
   * 換畫面時把**畫面級**的回呼清乾淨（`App.show()` 進來就叫一次）。
   *
   * 這三個都是單一插槽，本來靠「後註冊蓋掉前一個」運作——可是**不註冊的畫面就會失守**：
   * 事件畫面從來沒註冊過 `onRunApplied`，所以它送出「換忍具」的那一刻，跑的是
   * 上一格留下來的處理函式。實測會被丟回上一場的戰利品畫面，或當場被拉回地圖
   *（稽核 2026-09-11 第二輪 高-2）。
   *
   * 不清 `onStartRun`：那是開局用的，跟畫面無關，而且清掉客戶端就永遠開不了局。
   */
  clearScreenHooks(): void {
    this.applied = null;
    this.runApplied = null;
    this.picked = null;
    this.before = null;
    this.dropped = null;
    /*
     * `trouble` 也要清（稽核第三輪 中-4）。戰鬥畫面掛的那一支會 `render()`，
     * 而那支 `render()` 第一件事是把整頁清空——離開戰鬥之後如果對方斷線，
     * 現在這一頁（地圖、罐頭鋪、事件…）會被**上一場戰鬥的靜止畫面**整個蓋掉。
     * 全域的紅色橫幅走的是建構式的 `onDesync`／`onClose`，不靠這一支，所以清掉不影響回報。
     */
    this.trouble = null;
  }

  /** 這一局開始了。整局只有一份，設一次就不動 */
  useRun(run: RunState): void { this.runState = run; }

  /**
   * 現在這一格的貨架（沒有商店就餵 `null`）。
   *
   * **離開罐頭鋪一定要餵 `null`**：不餵的話，下一格收到一個上一格的遲到買賣，
   * 會拿現在的畫面去套上一格的貨架，那是最難查的一種分岔。
   */
  attachShop(shop: ShopStock | null): void { this.shop = shop; }

  /**
   * 我要做一個整局動作（買東西、打盹、扶人）。回傳 false＝現在做不出來，連送都不該送。
   *
   * 跟戰鬥那條一樣：主機自己的也要先編號再套用，不然主機照「自己按的順序」套、
   * 照「編號的順序」廣播，兩邊照樣分岔。
   */
  submitRun(a: RunAction): boolean {
    if (this.dead || !this.rctx) return false;
    if (a.seat !== this.seat) return false;   // 只能替自己做決定
    if (!canApplyRun(this.rctx, a)) return false;
    if (this.isHost) {
      const sa = (this.runSeq as Sequencer<RunAction>).assign(a);
      this.tx.send({ m: 'ract', seq: sa.seq, a });
      this.ingestRun(sa);
    } else {
      this.sentRunReq += 1;
      this.tx.send({ m: 'rreq', n: this.sentRunReq, a });
    }
    return true;
  }

  /** 有整局動作真的套進去了（畫面靠它重畫、判斷兩個人好了沒） */
  onRunApplied(fn: (a: SequencedAction<RunAction>[]) => void): void { this.runApplied = fn; }
  private runApplied: ((a: SequencedAction<RunAction>[]) => void) | null = null;

  /*
   * 回呼可以**事後換**：會話在開房那一刻就建好了，那時戰鬥畫面還不存在；
   * 而且每進一場新的戰鬥都要換一組（舊畫面的 render 指向已經被丟掉的節點）。
   * 所以不能只在建構時收。
   */
  private applied: ((a: SequencedAction[]) => void) | null = null;
  private trouble: ((why: string) => void) | null = null;
  /** 有動作真的套進引擎了（畫面靠它決定要演什麼、要不要收回合） */
  onApplied(fn: (a: SequencedAction[]) => void): void { this.applied = fn; }
  /**
   * 我送出去的那一下**沒算數**（主機那邊已經來不及了）。
   * 畫面接這個把「送出中」的鎖放開，並重畫回真實的狀態。
   */
  onDropped(fn: () => void): void { this.dropped = fn; }
  private dropped: (() => void) | null = null;
  /**
   * **套用之前**那一刻。畫面用它存一份快照，套用完才有東西可以比對出「變了什麼」。
   *
   * 為什麼不讓畫面自己在收到訊息時存：訊息到達與真的套用之間隔著佇列
   *（缺號要等、重複要丟），畫面看不到那個時機。只有會話知道「下一行就要套下去了」。
   */
  beforeApply(fn: () => void): void { this.before = fn; }
  private before: (() => void) | null = null;
  /**
   * 主機宣布開局（只有客戶端收得到）。
   *
   * **可能在註冊之前就到了**：連線一通主機就送，而客戶端要等 `ready` 那個承諾
   * 解出來才建得了會話。所以先到的那一則會被存起來，註冊的當下立刻補跑。
   */
  onStartRun(fn: (seed: string, diff: number, enc: string) => void): void {
    this.startRun = fn;
    if (this.pendingStart) { const s = this.pendingStart; this.pendingStart = null; fn(s.seed, s.diff, s.enc); }
  }
  private startRun: ((seed: string, diff: number, enc: string) => void) | null = null;
  private pendingStart: { seed: string; diff: number; enc: string } | null = null;
  /** 分岔或斷線。**這個一定要接**：不接的話兩個人會繼續玩兩份不一樣的遊戲 */
  onTrouble(fn: (why: string) => void): void { this.trouble = fn; }

  /** 已經停掉了（分岔或斷線）。停掉之後什麼都不再做 */
  get stopped(): boolean { return this.dead; }

  /**
   * 我要做一個動作。回傳 false＝這個動作現在做不出來，**連送都不該送**。
   *
   * 送出前先自己問一次不是為了安全（對方大可傳任何東西過來），
   * 是為了早點抓到分岔：自己這邊就不合法的動作，對方一定也做不出來，
   * 那代表畫面跟引擎已經對不上，在送出的那一刻就該發現。
   */
  submit(a: CoopAction): boolean {
    if (this.dead || !this.cs) return false;
    if (a.seat !== this.seat && a.t !== 'force') return false;   // 只能替自己做決定（強制收回合除外）
    if (!canApply(this.cs, a)) return false;
    if (this.isHost) {
      const sa = (this.seq as Sequencer).assign(a);
      this.tx.send({ m: 'act', seq: sa.seq, a });
      this.ingest(sa);   // 主機自己也走佇列：套用順序＝廣播順序
    } else {
      this.sentReq += 1;
      this.tx.send({ m: 'req', n: this.sentReq, a });   // 客戶端只是請求，等主機編號繞回來才生效
    }
    return true;
  }

  /** 每回合結束時呼叫：把自己的對帳單送過去（順便帶上整局的指紋） */
  endOfTurn(): void {
    if (this.dead || !this.cs) return;
    const c = syncCheckOf(this.cs);
    const rfp = this.rctx ? runCheckOf(this.rctx.run).rfp : undefined;
    this.tx.send({ m: 'sync', turn: c.turn, fp: c.fp, ...(rfp ? { rfp } : {}) });
  }

  /*
   * 走格子的對帳：**要對同一格才有意義**。
   *
   * 兩邊走進同一格的時間差了幾十毫秒（各自的投票結算不會同時跑完），
   * 收到的當下對方可能還停在上一格；直接比會把「他還沒走到」誤判成分岔——
   * 第一版就是這樣，開局第一步就炸。所以兩邊各自把「在這一格的指紋」存起來，
   * 湊成一對才比。
   */
  private readonly myMarks = new Map<string, string>();
  private readonly theirMarks = new Map<string, string>();
  /** 我走過的格子、他走過的格子，各記一串（順序就是走法） */
  private readonly myPath: string[] = [];
  private readonly theirPath: string[] = [];
  private matchMark(key: string): void {
    /*
     * **先比「有沒有走進同一格」，再比那一格的狀態**（稽核 2026-09-11 中-9）。
     *
     * 只用鑰匙配對的話，真的走岔時兩邊各存各的、永遠湊不成一對，
     * 於是一個字都不會報——而「走進不一樣的節點」正是這支對帳最想抓的那件事。
     * 兩邊走過的格子順序必須一模一樣，所以同一個序位上的名字不同就是走岔了。
     */
    const n = Math.min(this.myPath.length, this.theirPath.length);
    for (let i = 0; i < n; i++) {
      if (this.myPath[i] !== this.theirPath[i]) {
        this.stop(`走進了不一樣的格子（我第 ${i + 1} 步走「${this.myPath[i]}」、對方走「${this.theirPath[i]}」）`);
        return;
      }
    }
    const a = this.myMarks.get(key);
    const b = this.theirMarks.get(key);
    if (a === undefined || b === undefined) return;
    this.myMarks.delete(key);
    this.theirMarks.delete(key);
    if (a !== b) this.stop(`走到「${key}」的時候，整局的狀態對不上（${a} / ${b}）`);
  }

  /**
   * 走到下一格時對一次整局。**這是戰鬥外唯一的對帳點。**
   *
   * 沒有它的話，地圖、商店、事件裡的分岔要拖到下一場戰鬥才炸開，
   * 而那時的錯誤訊息會指著戰鬥，真正的病根在好幾十秒之前的另一個畫面。
   *
   * `key`＝這一格的名字（節點編號）。
   */
  syncRun(run: RunState, key: string): void {
    if (this.dead) return;
    const c = runCheckOf(run);
    this.myMarks.set(key, c.rfp ?? '');
    this.myPath.push(key);
    this.tx.send({ m: 'sync', turn: c.turn, fp: c.fp, ...(c.rfp ? { rfp: c.rfp } : {}), k: key });
    this.matchMark(key);
  }

  /*
   * 「大家各選一個」：地圖走哪一格、獎勵拿哪張牌、秘寶挑哪一件。
   *
   * **選擇存在會話上，不是存在畫面裡**——畫面每重畫一次就是一個新的閉包，
   * 存在那裡的話重畫就沒了（而重畫正是「有人選了」的當下要做的事）。
   *
   * 用標籤分開不同的選擇：同一個畫面裡可能同時在選牌與選秘寶，
   * 混在一起的話「他選好了沒」會算錯。
   */
  private readonly ballots = new Map<string, Map<number, string>>();
  private box(kind: string): Map<number, string> {
    let b = this.ballots.get(kind);
    if (!b) { b = new Map(); this.ballots.set(kind, b); }
    return b;
  }
  /** 目前的選擇：索引＝座位，`null`＝還沒選 */
  picks(kind: string, seats: number): (string | null)[] {
    const b = this.box(kind);
    return Array.from({ length: seats }, (_, i) => b.get(i) ?? null);
  }
  /** 這一輪結束就清乾淨，不然下一次會直接沿用上一輪的選擇 */
  clearPicks(kind: string): void { this.ballots.delete(kind); }
  /**
   * 我選了。兩邊都選完才會真的生效（規則見 `engine/vote.ts`）。
   *
   * **被擋下來要出聲**（2026-09-11）：這支原本是靜靜地 `return`，於是連線一停，
   * 畫面上按什麼都毫無反應、主控台也一片乾淨，完全查不出是哪一步斷的。
   * 跟戰鬥那邊 `playCard 在 canPlay 放行後仍失敗` 同一套作法——那行字已經抓到過兩個坑。
   * 回傳 `false`＝沒送出去。
   */
  pick(kind: string, value: string): boolean {
    if (this.dead) { console.error(`連線已經停了，「${kind}」的選擇沒送出去`); return false; }
    if (this.box(kind).has(this.seat)) { console.error(`「${kind}」這一輪已經選過了，不能改`); return false; }
    this.tx.send({ m: 'pick', seat: this.seat, k: kind, v: value });
    this.record(kind, this.seat, value);   // 自己那一份也要進來，兩邊的票面才一樣
    return true;
  }
  /**
   * 有人選了（含自己）時通知。畫面接這個去重畫與結算。
   *
   * **註冊的當下不補跑**（第一版補了，結果是無限迴圈）：處理函式會重畫畫面，
   * 重畫又會重新註冊，補跑再觸發一次……沒有盡頭。
   * 註冊前就到的選擇不會漏掉——畫面每次重畫都直接讀 `picks()` 的現況，
   * 所以「顯示」與「通知」是兩件事，不需要靠補跑把它們兜起來。
   */
  onPick(fn: (kind: string) => void): void { this.picked = fn; }
  private record(kind: string, seat: number, value: string): void {
    const b = this.box(kind);
    if (b.has(seat)) return;   // 同一個人選兩次只算第一次
    b.set(seat, value);
    this.picked?.(kind);
  }
  private picked: ((kind: string) => void) | null = null;

  /** 主機用：宣布開局。兩邊各自用同一顆種子跑出同一局 */
  start(seed: string, diff: number, enc: string): void {
    if (this.dead || !this.isHost) return;
    this.tx.send({ m: 'start', seed, diff, enc });
  }

  private handle(m: NetMessage): void {
    if (this.dead) return;
    // 開局訊息在 `attach` 之前就會到（那時還沒有戰鬥），所以要擺在 cs 的檢查之前
    if (m.m === 'pick') { this.record(m.k, m.seat, m.v); return; }
    if (m.m === 'drop') { this.dropped?.(); return; }   // 我那一則沒算數：把手放開（見 `onDropped`）
    // 整局那一條不需要戰鬥狀態，所以要擺在 cs 的檢查之前（商店、打盹點本來就沒有 cs）
    if (this.handleRun(m)) return;
    // 走格子的對帳也一樣沒有 cs。存起來等自己也走到那一格再比（見 `syncRun`）
    if (m.m === 'sync' && m.turn === -1) {
      if (m.k && m.rfp) { this.theirMarks.set(m.k, m.rfp); this.theirPath.push(m.k); this.matchMark(m.k); }
      return;
    }
    if (m.m === 'start') {
      if (this.isHost) return;
      this.hooks.onStart?.(m.seed, m.diff, m.enc);
      if (this.startRun) this.startRun(m.seed, m.diff, m.enc);
      else this.pendingStart = { seed: m.seed, diff: m.diff, enc: m.enc };   // 還沒註冊就先存著
      return;
    }
    if (!this.cs) return;
    switch (m.m) {
      case 'req':
        // 只有主機收得到請求：編號之後廣播，自己也照號碼套
        if (!this.isHost || !this.seq) return;
        if (!this.fresh(this.seenReq, m.a.seat, m.n)) return;   // 同一則到兩次：丟掉，不是分岔
        if (!canApply(this.cs, m.a)) {
          /*
           * **這是「來不及」，不是分岔。**
           *
           * 客戶端的狀態比主機慢一個來回，所以它很可能在魔物已經倒下、
           * 或回合已經收掉之後才送出一張牌——送的當下在它那邊完全合法。
           * 第一版把這個當成分岔整場停掉，實測光是連點兩張牌就會踩到。
           *
           * 真正的分岔靠**指紋**抓（每回合、每走一格各對一次），那個才可靠；
           * 這裡只要不編號、回一則「沒算數」讓對方把手放開就好。
           * 主控台留一行，不然這種丟掉會完全無聲。
           */
          console.error(`對方那一下來不及了，沒算數（${m.a.t}）`);
          this.tx.send({ m: 'drop', n: m.n });
          return;
        }
        this.ingest(this.seq.assign(m.a), true);
        return;
      case 'act':
        // 客戶端收主機編號過的動作。主機自己不會收到（自己的走 submit）
        if (this.isHost) return;
        this.ingest({ seq: m.seq, a: m.a });
        return;
      case 'sync': {
        const mine = syncCheckOf(this.cs);
        const rfp = this.rctx ? runCheckOf(this.rctx.run).rfp : undefined;
        const why = diffOf({ ...mine, ...(rfp ? { rfp } : {}) }, { turn: m.turn, fp: m.fp, ...(m.rfp ? { rfp: m.rfp } : {}) });
        if (why) this.stop(why);
        return;
      }
    }
  }

  /** 整局那一條的收信。跟戰鬥那條規矩一樣，只是對象不同 */
  private handleRun(m: NetMessage): boolean {
    if (m.m === 'rreq') {
      if (!this.isHost || !this.runSeq || !this.rctx) return true;
      if (!this.fresh(this.seenRunReq, m.a.seat, m.n)) return true;   // 同一則到兩次：丟掉
      /*
       * **做不出來就安靜地不發號碼，不停整場。**
       *
       * 這裡跟戰鬥那條刻意不一樣：戰鬥中「你手上根本沒這張牌」只可能是分岔，
       * 但商店裡「這格剛剛被對方買走了」是**天天都會發生的搶標**——
       * 兩個人同時看上同一張牌，本來就只有一個人買得到。
       * 沒發號碼就等於什麼都沒發生，兩邊的狀態照樣一致；
       * 請求的人下一次重畫就會看到那格寫著「賣掉了」。
       */
      if (!canApplyRun(this.rctx, m.a)) return true;
      this.ingestRun(this.runSeq.assign(m.a), true);
      return true;
    }
    if (m.m === 'ract') {
      if (this.isHost) return true;   // 主機自己的走 submitRun
      this.ingestRun({ seq: m.seq, a: m.a });
      return true;
    }
    return false;
  }

  private ingestRun(sa: SequencedAction<RunAction>, broadcast = false): void {
    if (broadcast) this.tx.send({ m: 'ract', seq: sa.seq, a: sa.a });
    const r = this.runQueue.receive(sa);
    if (r.applied.length) this.runApplied?.(r.applied);
    if (r.failed) this.stop(`第 ${r.failed.seq} 號整局動作在這邊做不出來（${r.failed.a.t}）`);
  }

  /** 把一個編號過的動作丟進佇列，並把結果回報給畫面 */
  private ingest(sa: SequencedAction, broadcast = false): void {
    if (!this.cs) return;
    if (broadcast) this.tx.send({ m: 'act', seq: sa.seq, a: sa.a });
    this.before?.();   // 套用前先讓畫面存一份快照（見 `beforeApply`）
    const r = this.queue.receive(sa);
    if (r.applied.length) { this.hooks.onApplied?.(r.applied); this.applied?.(r.applied); }
    if (r.failed) this.stop(`第 ${r.failed.seq} 號動作在這邊做不出來（${r.failed.a.t}）`);
  }

  private stop(why: string): void {
    if (this.dead) return;
    this.dead = true;
    this.hooks.onDesync?.(why);
    this.trouble?.(why);
    this.tx.close();
  }
}
