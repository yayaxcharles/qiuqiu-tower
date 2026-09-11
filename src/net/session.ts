import { canApply } from './action';
import type { CoopAction } from './action';
import { ActionQueue, Sequencer, diffOf, syncCheckOf } from './lockstep';
import type { SequencedAction } from './lockstep';
import type { NetMessage, Transport } from './transport';
import type { CombatState } from '../engine/types';

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
  private readonly queue = new ActionQueue();
  /** 只有主機有 */
  private readonly seq: Sequencer | null;
  private cs: CombatState | null = null;
  private dead = false;

  constructor(tx: Transport, opts: { isHost: boolean; seat: number } & SessionHooks) {
    this.tx = tx;
    this.isHost = opts.isHost;
    this.seat = opts.seat;
    this.hooks = opts;
    this.seq = opts.isHost ? new Sequencer() : null;
    tx.onMessage((m) => { this.handle(m); });
    tx.onClose((w) => { this.dead = true; this.hooks.onClose?.(w); this.trouble?.(w); });
  }

  /** 這一場戰鬥開打了。兩邊要餵同一個 `CombatState`（各自算出來的那一份） */
  attach(cs: CombatState): void { this.cs = cs; }

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
      this.tx.send({ m: 'req', a });   // 客戶端只是請求，等主機編號繞回來才生效
    }
    return true;
  }

  /** 每回合結束時呼叫：把自己的對帳單送過去 */
  endOfTurn(): void {
    if (this.dead || !this.cs) return;
    const c = syncCheckOf(this.cs);
    this.tx.send({ m: 'sync', turn: c.turn, fp: c.fp });
  }

  /*
   * 路線投票。**票存在會話上，不是存在地圖畫面裡**——
   * 畫面每重畫一次就是一個新的閉包，票存在那裡的話重畫就沒了
   * （而重畫正是「有人投了票」的當下要做的事）。
   */
  private readonly ballot = new Map<number, string>();
  /** 目前的票面：索引＝座位，`null`＝還沒投 */
  votes(seats: number): (string | null)[] {
    return Array.from({ length: seats }, (_, i) => this.ballot.get(i) ?? null);
  }
  /** 走到下一格之後要清乾淨，不然下一次選路會直接用上一輪的票 */
  clearVotes(): void { this.ballot.clear(); }
  /** 投一票：我想走地圖上的這一格。兩邊都投完才會真的移動（見 `engine/vote.ts`） */
  vote(node: string): void {
    if (this.dead || this.ballot.has(this.seat)) return;   // 投過就不能改
    this.tx.send({ m: 'vote', seat: this.seat, n: node });
    this.record(this.seat, node);   // 自己那一票也要進來，兩邊的票面才一樣
  }
  /**
   * 票面**有變動**時通知。地圖畫面接這個去重畫與結算。
   *
   * **註冊的當下不補跑**（第一版補了，結果是無限迴圈）：處理函式會重畫地圖，
   * 重畫又會重新註冊，補跑再觸發一次處理函式……沒有盡頭。
   * 註冊前就到的票不會漏掉——畫面每次重畫都直接讀 `votes()` 的現況，
   * 所以「顯示」與「通知」是兩件事，不需要靠補跑把它們兜起來。
   */
  onVote(fn: () => void): void { this.voted = fn; }
  private record(seat: number, node: string): void {
    if (this.ballot.has(seat)) return;   // 同一個人投兩次只算第一次
    this.ballot.set(seat, node);
    this.voted?.();
  }
  private voted: (() => void) | null = null;

  /** 主機用：宣布開局。兩邊各自用同一顆種子跑出同一局 */
  start(seed: string, diff: number, enc: string): void {
    if (this.dead || !this.isHost) return;
    this.tx.send({ m: 'start', seed, diff, enc });
  }

  private handle(m: NetMessage): void {
    if (this.dead) return;
    // 開局訊息在 `attach` 之前就會到（那時還沒有戰鬥），所以要擺在 cs 的檢查之前
    if (m.m === 'vote') { this.record(m.seat, m.n); return; }
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
        if (!canApply(this.cs, m.a)) {
          // 對方送來一個這邊做不出來的動作＝兩邊已經對不上。
          // **不要默默丟掉**：丟掉的話對方以為自己打了那張牌，分岔就這樣被拖進下一回合
          this.stop(`對方送來一個這邊做不出來的動作（${m.a.t}）`);
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
        const why = diffOf(syncCheckOf(this.cs), { turn: m.turn, fp: m.fp });
        if (why) this.stop(why);
        return;
      }
    }
  }

  /** 把一個編號過的動作丟進佇列，並把結果回報給畫面 */
  private ingest(sa: SequencedAction, broadcast = false): void {
    if (!this.cs) return;
    if (broadcast) this.tx.send({ m: 'act', seq: sa.seq, a: sa.a });
    const r = this.queue.receive(this.cs, sa);
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
