import { applyAction, canApply } from './action';
import type { CoopAction } from './action';
import { applyRunAction, canApplyRun } from './runaction';
import type { RunAction, RunCtx } from './runaction';
import type { ShopStock } from '../engine/run';
import { ActionQueue, Sequencer, diffOf, runCheckOf, syncCheckOf } from './lockstep';
import type { SequencedAction, SyncCheck } from './lockstep';
import type { LinkStatus, NetMessage, Transport, WireMessage } from './transport';
import type { CombatState, RunState } from '../engine/types';

/** 戰鬥那一條的動作訊息（客戶端的請求、主機編號過的動作）：這兩種要照場次排隊 */
type FightMsg = Extract<NetMessage, { m: 'req' | 'act' }>;

/** 同伴一直沒進場時，我進場多久之後可以替他收回合（2026-09-23 推前審查 低-2，見 `CoopSession.mayForce`） */
export const MATE_ABSENT_MS = 180_000;

/**
 * 「大家各選一個」有哪幾種（2026-09-23 health H-10）。原本是自由字串，畫面送票、讀票、清票、比對種類
 * 任何一處拼錯一個字，那一輪就永遠湊不齊票，而且不報錯；收成聯集之後 tsc 會擋。
 * **線上訊息的格式不變**：`transport.ts` 的 `k` 還是字串，收到時才對照這份。
 */
// `evpurify`＝事件裡兩件以上沾了魔氣、挑一件淨化（2026-09-23 第三批）
const VOTE_KINDS = ['map', 'card', 'relic', 'rwup', 'event', 'evlearn', 'evcard', 'actcard', 'actrelic', 'evpurify'] as const;
export type VoteKind = typeof VOTE_KINDS[number];
function isVoteKind(k: string): k is VoteKind { return (VOTE_KINDS as readonly string[]).includes(k); }

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
  onStart?: (seed: string, diff: number, enc: string, heroes?: string[]) => void;
  /** 真的套進去了幾個動作（畫面拿它決定要演什麼） */
  onApplied?: (applied: SequencedAction[]) => void;
  /** **兩邊算出來不一樣了**。到這裡就該停下來告訴玩家，不要繼續玩兩份不一樣的遊戲 */
  onDesync?: (why: string) => void;
  /** 連線斷了 */
  onClose?: (why: string) => void;
  /** 線路暫時斷了／接回來了（自己或對方）：大廳拿它掛琥珀色橫幅（`lobby.ts` 的 `linkBanner`） */
  onLink?: (s: LinkStatus) => void;
  /**
   * **重新同步了**（2026-09-25）：兩台對不上，改成大家載入主機的存檔點（`run`＝整局狀態的 JSON），回到那一層的地圖重來。
   * 畫面要：讀回整局、`useRun`、清掉戰鬥、換到地圖、告訴玩家。沒接這個的話對不上時照舊整場停下（`onDesync`）
   */
  onResync?: (run: string, why: string) => void;
  /**
   * 存檔點或第幾輪變了（回到地圖、重新同步之後）：畫面把它存進分頁，重新整理之後才接得回來（`rejoin`）。
   * `run` 可能是 null（還沒回到過地圖）
   */
  onCheckpoint?: (run: string | null, gen: number) => void;
}

/** 重新同步最多幾次：同一個錯一再發生（引擎本身有不決定性的地方），重來也沒用，照舊停下來 */
export const MAX_RESYNC = 3;
/** 存檔點一段**包成字串之後**最多幾個字：中繼一則上限 16,384 字，留點空間給外面那層 JSON */
export const SNAP_PART = 12_000;

/**
 * 把存檔點切成幾段。量的是**跳脫之後**的長度（推前稽核 2026-09-25 低-1）：存檔點本身是 JSON，
 * 包進訊息時每個引號、反斜線都要再多一個字，照原長切的話一段可能變成一萬五、離上限只剩一千多，超過中繼會安靜丟掉。
 * 切到一半的雙字元字（表情符號）不怕：單獨那半個會跳脫成 `\\uXXXX`，量得到，收的那邊接回去還是原字。
 */
export function snapParts(json: string): string[] {
  const parts: string[] = [];
  for (let at = 0; at < json.length;) {
    let len = SNAP_PART;
    while (len > 256 && JSON.stringify(json.slice(at, at + len)).length > SNAP_PART) len = Math.floor(len * 0.7);
    parts.push(json.slice(at, at + len));
    at += len;
  }
  return parts;
}
/** 客戶端請了重新同步之後最多等主機多久（毫秒）：等不到就照舊停下 */
export const SNAP_WAIT_MS = 15_000;
/** 重新整理接回的那一次重新同步的原因（畫面看到這一句就換一段提示，不說「對不上」） */
export const REJOIN_WHY = '有人重新整理了網頁，接回來了';

export class CoopSession {
  readonly isHost: boolean;
  readonly seat: number;
  private readonly tx: Transport;
  private readonly hooks: SessionHooks;
  // 這四個（戰鬥與整局的號碼機、佇列）重新同步時換新的，所以不是 readonly（見 `reset`）
  private queue = new ActionQueue((a: CoopAction) => (this.cs ? applyAction(this.cs, a) : false));
  /** 只有主機有 */
  private seq: Sequencer | null;
  private cs: CombatState | null = null;
  private dead = false;
  /*
   * **第幾場戰鬥**（2026-09-14 夜間稽核 高-6）。每 `attach` 一場新的就加一。
   *
   * 兩台各數各的，但進出戰鬥的次序一模一樣（地圖是一起走的），數出來就一樣。
   * `lastCs` 是為了同一場重掛不要多數一次。
   */
  private fight = 0;
  private lastCs: CombatState | null = null;
  /**
   * 畫面正在演「收牌→魔物一隻一隻出手→發新手牌」（見 `hold`）。
   * 這段期間引擎還沒走到下一回合，同伴下一回合的牌套不進去。
   */
  private held = false;
  /**
   * **還輪不到的戰鬥訊息**，照到達順序排（高-6、高-7）。
   *
   * 原本收到就套：這一場還沒進場（對白還在點、門還沒開）就套進上一場、或因為沒有戰鬥直接丟掉；
   * 魔物回合還在演就套進演到一半的狀態。兩種都是「這邊做不出來」→ 整場斷線。
   * 改成先排隊，進場了、演完了再照順序一口氣套。
   */
  private readonly backlog: FightMsg[] = [];
  private draining = false;
  /*
   * 戰鬥的對帳單，**兩邊各存各的、湊成一對才比**（高-5，跟走格子的 `myMarks` 同一招）。
   * 鍵＝`第幾場:第幾回合`。
   */
  private readonly myChecks = new Map<string, SyncCheck>();
  private readonly theirChecks = new Map<string, SyncCheck>();

  /*
   * 整局那一半（商店、打盹、紙箱）自己的號碼機與佇列。
   *
   * **跟戰鬥那條完全分開數**：戰鬥一場一場換、整局從頭到尾只有一份，
   * 共用一組號碼的話，離開戰鬥再進下一場，號碼會卡在中間等永遠不會來的那一號。
   */
  private runSeq: Sequencer<RunAction> | null;
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
  private runQueue = new ActionQueue<RunAction>((a) => this.applyRun(a));
  /**
   * 罐頭鋪的動作比貨架早到（審查 2026-09-15 高-2）：同伴先進店買東西，我還沒走到那一格——
   * 一個人倒下時很常見：站著的那位一票就定案、當場進店；倒下的還停在上一頁沒按「繼續」，
   * 他的票要等我回到地圖補跑才結算、才 `attachShop`。這段空檔裡買賣到了，以前直接判「做不出來」→ 整場停。
   * 現在先留著、`attachShop` 時照順序補套；主機收到 `rreq` 也一樣先發號碼（對方那台已經照自己的貨架驗過）。
   */
  private readonly earlyShop: RunAction[] = [];
  private static isShopAction(a: RunAction): boolean { return a.t === 'buy' || a.t === 'scrub' || a.t === 'shuffle' || a.t === 'purify'; }
  private applyRun(a: RunAction): boolean {
    if (!this.rctx) return false;
    if (!this.shops && CoopSession.isShopAction(a)) { this.earlyShop.push(a); return true; }
    return applyRunAction(this.rctx, a);
  }
  /**
   * 整局狀態。**開局設一次就不動**——它從頭到尾只有一份。
   *
   * 原本是每個畫面自己 `attachRun` 進來、離開時設回 null，結果是：地圖與戰鬥畫面
   * 根本沒設，於是走格子的對帳單一到就被「沒有整局狀態」擋掉、什麼都沒比對，
   * 等於白做（實測：兩邊走進不同節點，對帳完全沒有反應）。
   */
  private runState: RunState | null = null;
  /** 現在這一格的貨架（只有罐頭鋪有；每個座位一份，各逛各的）。這個才是一格一格換的 */
  private shops: ShopStock[] | null = null;
  private get rctx(): RunCtx | null {
    return this.runState ? { run: this.runState, shops: this.shops ?? undefined } : null;
  }

  /**
   * `resume`＝**重新整理之後接回**（2026-09-25）：接著分頁存著的第幾輪與存檔點。這種會話一開始什麼都不收（`awaitingSnap`），
   * 等畫面掛好回呼叫 `rejoin()` 才開始：主機拿自己的存檔點重新同步、客戶端請主機重新同步。
   * 中繼補過來的、重新整理之前那一輪的舊訊息，就在這段期間被丟掉
   */
  constructor(tx: Transport, opts: { isHost: boolean; seat: number; resume?: { gen: number; checkpoint: string | null } } & SessionHooks) {
    this.tx = tx;
    this.isHost = opts.isHost;
    this.seat = opts.seat;
    this.hooks = opts;
    this.seq = opts.isHost ? new Sequencer() : null;
    this.runSeq = opts.isHost ? new Sequencer<RunAction>() : null;
    if (opts.resume) { this.gen = opts.resume.gen; this.checkpointJson = opts.resume.checkpoint; this.awaitingSnap = true; this.resuming = true; }
    tx.onMessage((m) => { this.handle(m); });
    // 自己主動關的（`leave`／`stop`）不再往上報：那不是出問題，報了會多一條「連線出問題：自己關掉了」的橫幅
    tx.onClose((w) => { if (this.dead) return; this.dead = true; this.hooks.onClose?.(w); this.trouble?.(w); });
    // 中途斷線接回（2026-09-15）：傳輸層自己接、自己補，這裡只記「現在能不能操作」並轉給畫面
    tx.onStatus?.((s) => {
      if (s === 'away') this.suspendedFlag = true;
      else if (s === 'back') this.suspendedFlag = false;
      this.hooks.onLink?.(s);
      this.linkHook?.(s);
    });
  }

  /**
   * 自己的線路斷了、正在接回：期間戰鬥畫面不收操作（`canAct` 看這個）。
   * 對方斷了**不算**：自己這邊還是可以出牌，動作會排隊、他回來就補到他那邊。
   */
  private suspendedFlag = false;
  get suspended(): boolean { return this.suspendedFlag; }

  /** 自己離開（回標題、開單機局）：跟中繼說一聲、關掉線路，對方立刻看到「對方離開了」（審查 2026-09-15 中-1） */
  leave(): void {
    if (this.dead) return;
    this.dead = true;
    this.tx.close();
  }
  private linkHook: ((s: LinkStatus) => void) | null = null;
  /** 畫面掛的線路狀態回呼（換畫面會清；全域橫幅走建構式的 `onLink`） */
  onLink(fn: (s: LinkStatus) => void): void { this.linkHook = fn; }

  /**
   * 這一場戰鬥開打了（兩邊要餵同一個 `CombatState`，各自算出來的那一份）；`null`＝這一場分出勝負了。
   *
   * **畫面要把回呼都掛好之後才叫**：進場前先到的動作是在這一刻才套下去的，
   * 那時沒人在聽的話，「兩個人都舉手了」就沒有人收回合。
   *
   * **分出勝負就要餵 `null`**：之後才到的、屬於這一場的請求一律當成來不及丟掉，
   * 不可以留著等下一場套（牌號每場都從牌組複製，下一場手上很可能真的有同一個號碼）。
   */
  attach(cs: CombatState | null): void {
    if (cs && cs !== this.lastCs) {
      this.fight += 1; this.lastCs = cs; this.held = false;
      this.enteredAt = Date.now();   // 同伴一直沒進場時的長上限從這一刻算（見 `mayForce`）
      if (!this.dead) this.send({ m: 'here', f: this.fight });   // 告訴同伴我進場了（見 `mateHere`）
    }
    // 這一場結束（`attach(null)`）也把暫停放掉（總稽核 B 中-3）：魔物回合演到一半有人倒下、
    // 畫面被 `afterCombat` 接手時，`runEnemyTurn` 跑不到尾巴的 `release()`，會話會一直停在 held；
    // 原本靠下一場 `attach(cs)` 順便復原，那是別支的副作用，不可靠
    if (!cs) this.held = false;
    this.cs = cs;
    this.drain();
  }

  /**
   * 畫面開始演收牌與魔物回合了：戰鬥動作先排隊、不套，也不收新的（2026-09-14 夜間稽核 高-7）。
   *
   * 兩台演完的時間不一樣（手牌張數、背景分頁的計時器被節流、慢的手機），
   * 快的那台先發到新手牌就出牌，慢的那台還停在魔物回合中間、新手牌還沒抽，
   * 那張牌套不進去 → `第 N 號動作在這邊做不出來`。主機這邊也一樣：演到一半收到請求，
   * 拿演到一半的狀態去判，會把合法的牌當成來不及丟掉。
   *
   * 要在「最後一個人舉手」那一刻**同步**叫（`onApplied` 裡），不能晚一拍。演完一定要 `release()`。
   */
  hold(): void { this.held = true; }

  /** 同伴宣布進場過的最新一場（`here` 訊息）。場次兩台數法一樣，所以直接跟 `fight` 比 */
  private mateFight = 0;
  /**
   * 同伴也進到**現在這一場**的戰鬥畫面了嗎（2026-09-23 稽核 中-1）。
   * 「替他收回合」的閒置計時從這一刻才起算；他還沒進場之前 `submit` 也不收替他收回合。
   */
  get mateHere(): boolean { return this.cs !== null && this.mateFight >= this.fight; }
  /** 我進到這一場的時間（只拿來算同伴沒進場的長上限，不進鎖步） */
  private enteredAt = 0;
  /**
   * 現在可不可以替同伴收回合（2026-09-23 推前審查 低-2）。
   *
   * 同伴進場了就可以（還要閒置夠久，那是畫面那一層的事）。可是他一直掛在劇情、關主門、事件結果頁不點的話，
   * 只看「進場了沒」這邊就永遠只能乾等或回標題——所以給一條長上限：我進場滿 `MATE_ABSENT_MS` 他還沒進來，也可以。
   * 看的是**這一台**自己的時間：送出去的是一個明確的動作，兩台照編號套用，不會因為兩台時鐘不同而分岔。
   */
  get mayForce(): boolean {
    return this.mateHere || (this.cs !== null && Date.now() - this.enteredAt >= MATE_ABSENT_MS);
  }
  /** 演完了：把排隊的動作照順序套下去 */
  release(): void {
    this.held = false;
    this.drain();
  }

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
  clearScreenHooks(screen?: string): void {
    /*
     * 換到**別的**畫面時，之前補跑過的票可以再補一次（見 `onPick`）：
     * 事件結果頁收到同伴走地圖的票會忽略，那一票得等地圖畫面出來再補給它。
     * 同一個畫面重畫（`app.show('map')` 自己叫自己）不清，補跑才不會一直循環。
     */
    if (screen !== this.lastScreen) { this.replayed.clear(); this.lastScreen = screen; }
    if (screen === 'map') {
      // 回到地圖＝上一格收乾淨了，沒接的動作不會再有人要——**除了上一次走進格子之後才投的票帶來的那些**
      //（審查 2026-09-15 高-2 的另一半）：同伴一票定案、進店、按了「逛好了」，我這時才從上一頁回到地圖，
      // 那一則要留給下一格的畫面，清掉的話我按「逛好了」會永遠等他
      const keep = this.unhandledRun.filter((x) => x.e > this.enteredEpoch);
      this.unhandledRun.length = 0;
      this.unhandledRun.push(...keep);
    }
    this.applied = null;
    this.runApplied = null;
    this.picked = null;
    this.before = null;
    this.dropped = null;
    this.hinted = null;
    /*
     * `trouble` 也要清（稽核第三輪 中-4）。戰鬥畫面掛的那一支會 `render()`，
     * 而那支 `render()` 第一件事是把整頁清空——離開戰鬥之後如果對方斷線，
     * 現在這一頁（地圖、罐頭鋪、事件…）會被**上一場戰鬥的靜止畫面**整個蓋掉。
     * 全域的紅色橫幅走的是建構式的 `onDesync`／`onClose`，不靠這一支，所以清掉不影響回報。
     */
    this.trouble = null;
    this.linkHook = null;
  }

  /** 這一局開始了。整局只有一份，設一次就不動 */
  useRun(run: RunState): void { this.runState = run; }

  /**
   * 現在這一格的貨架（每個座位一份；沒有商店就餵 `null`）。走進罐頭鋪那一格時 `enterNode` 就先掛上，
   * 畫面還沒開同伴的買賣就到也接得住（審查 2026-09-15 投票 低-3）。
   *
   * **離開罐頭鋪一定要餵 `null`**：不餵的話，下一格收到一個上一格的遲到買賣，
   * 會拿現在的畫面去套上一格的貨架，那是最難查的一種分岔。
   */
  attachShop(shops: ShopStock[] | null): void {
    this.shops = shops;
    // 比貨架早到的買賣現在補套（見 `earlyShop`）。做不出來＝兩邊真的對不上，照樣停
    if (!shops || !this.earlyShop.length) return;
    const ctx = this.rctx;
    if (!ctx) return;
    for (const a of this.earlyShop.splice(0)) {
      if (!applyRunAction(ctx, a)) { this.desync(`比貨架早到的整局動作在這邊做不出來（${a.t}）`); return; }
    }
  }

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
      this.send({ m: 'ract', seq: sa.seq, a });
      this.ingestRun(sa);
    } else {
      this.sentRunReq += 1;
      this.send({ m: 'rreq', n: this.sentRunReq, a });
    }
    return true;
  }

  /** 有整局動作真的套進去了（畫面靠它重畫、判斷兩個人好了沒） */
  /**
   * 沒人接的整局動作先存著，畫面掛上就補給它（審查 中-2）。
   *
   * 走格子投票後投的那位是同步結算、當場進店；先投的要等票繞回來。這個空檔裡同伴按「逛好了」／「打盹」，
   * 動作照樣套進引擎（不會分岔），但畫面那份「誰做完了」是區域變數，錯過就永遠補不回來——
   * 我這台按下「逛好了」變成灰的「等對方逛完…」，同伴早就上樓了，兩個人互等到天亮。
   * 補跑排到下一拍（註冊時畫面還沒畫完）；進地圖時清掉（那時不可能還有沒接的）。
   */
  onRunApplied(fn: (a: SequencedAction<RunAction>[]) => void): void {
    this.runApplied = fn;
    if (this.unhandledRun.length) setTimeout(() => { const pend = this.unhandledRun.splice(0).map((x) => x.a); if (pend.length && this.runApplied === fn && !this.dead) fn(pend); }, 0);
  }
  private runApplied: ((a: SequencedAction<RunAction>[]) => void) | null = null;
  /** 沒人接的整局動作，附「到的時候已經有幾張走格子的票」（`e`），回到地圖時靠它分辨是上一格的還是下一格的 */
  private readonly unhandledRun: { e: number; a: SequencedAction<RunAction> }[] = [];
  /** 走格子的票到目前為止幾張（自己與同伴都算） */
  private mapEpoch = 0;
  /** 上一次走進格子（`syncRun`）時的 `mapEpoch` */
  private enteredEpoch = 0;

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
  /** 同伴點選了哪張牌（`u: null`＝取消或打出了）。純提示，畫面拿來畫「考慮中」；換畫面會被清掉 */
  onHint(fn: (seat: number, u: number | null) => void): void { this.hinted = fn; }
  private hinted: ((seat: number, u: number | null) => void) | null = null;
  /** 我點選了哪張牌，告訴同伴（不進鎖步、不進對帳）。連線停了就不送 */
  hint(u: number | null): void {
    if (this.dead) return;
    this.send({ m: 'hint', seat: this.seat, u });
  }
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
  onStartRun(fn: (seed: string, diff: number, enc: string, heroes?: string[]) => void): void {
    this.startRun = fn;
    if (this.pendingStart) { const s = this.pendingStart; this.pendingStart = null; fn(s.seed, s.diff, s.enc, s.heroes); }
  }
  private startRun: ((seed: string, diff: number, enc: string, heroes?: string[]) => void) | null = null;
  private pendingStart: { seed: string; diff: number; enc: string; heroes?: string[] } | null = null;
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
    if (this.dead || !this.cs || this.held) return false;   // 魔物回合演出中不收（見 `hold`）
    if (a.seat !== this.seat && a.t !== 'force') return false;   // 只能替自己做決定（強制收回合除外）
    // 同伴還沒進場（還在看塔頂段落、關主開場）就替他收回合，他一進戰鬥第一回合就沒了（2026-09-23 稽核 中-1）；
    // 他掛著不進來太久的長上限見 `mayForce`（推前審查 低-2）
    if (a.t === 'force' && !this.mayForce) return false;
    if (!canApply(this.cs, a)) return false;
    if (this.isHost) {
      const sa = (this.seq as Sequencer).assign(a);
      this.send({ m: 'act', seq: sa.seq, a, f: this.fight });
      this.ingest(sa);   // 主機自己也走佇列：套用順序＝廣播順序
    } else {
      this.sentReq += 1;
      // 帶上場次與回合：到得太晚、已經換場或換回合的，主機當成來不及丟掉（見 `take`）
      this.send({ m: 'req', n: this.sentReq, a, f: this.fight, turn: this.cs.turn });   // 客戶端只是請求，等主機編號繞回來才生效
    }
    return true;
  }

  /**
   * 最後一個人舉手的那一刻呼叫：記下這一刻的對帳單、送一份給對方（順便帶上整局的指紋）。
   *
   * **比的是兩邊各自記下的那一份，不是收到當下的狀態**（2026-09-14 夜間稽核 高-5）。
   * 原本收到對帳單就拿「現在」去比，可是手上沒牌的那台不必等收牌動畫，
   * 當場就開演魔物回合、把手牌丟掉了——對方的單子晚一拍到，一定對不上。
   * 倒下的人手上永遠沒牌，所以有人倒下之後第一次收回合必定整場斷線。
   *
   * 先比再送：比出分岔就停在這裡，不要再把單子送出去。
   */
  endOfTurn(): void {
    if (this.dead || !this.cs) return;
    const c = syncCheckOf(this.cs);
    const rfp = this.rctx ? runCheckOf(this.rctx.run).rfp : undefined;
    const key = `${this.fight}:${c.turn}`;
    this.myChecks.set(key, { ...c, ...(rfp ? { rfp } : {}) });
    const g0 = this.gen;
    this.matchTurn(key);
    // 比出不同、當場重新同步了（換了一輪）：這張單子屬於上一輪，不送——送了會在新一輪留一張永遠配不到、
    // 哪天場次回合剛好撞號又被拿來比的舊單子
    if (this.dead || this.gen !== g0) return;
    this.send({ m: 'sync', turn: c.turn, fp: c.fp, ...(rfp ? { rfp } : {}), f: this.fight });
  }

  /** 同一場、同一回合的兩張對帳單都到了才比；比過就丟 */
  private matchTurn(key: string): void {
    const a = this.myChecks.get(key);
    const b = this.theirChecks.get(key);
    if (!a || !b) return;
    this.myChecks.delete(key);
    this.theirChecks.delete(key);
    const why = diffOf(a, b);
    if (why) this.desync(why);
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
        this.desync(`走進了不一樣的格子（我第 ${i + 1} 步走「${this.myPath[i]}」、對方走「${this.theirPath[i]}」）`);
        return;
      }
    }
    const a = this.myMarks.get(key);
    const b = this.theirMarks.get(key);
    if (a === undefined || b === undefined) return;
    this.myMarks.delete(key);
    this.theirMarks.delete(key);
    if (a !== b) this.desync(`走到「${key}」的時候，整局的狀態對不上（${a} / ${b}）`);
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
    this.enteredEpoch = this.mapEpoch;   // 走進這一格了：之後回到地圖時，這之前到的沒人接的動作都是這一格以前的
    const c = runCheckOf(run);
    this.myMarks.set(key, c.rfp ?? '');
    this.myPath.push(key);
    this.send({ m: 'sync', turn: c.turn, fp: c.fp, ...(c.rfp ? { rfp: c.rfp } : {}), k: key });
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
  private readonly ballots = new Map<VoteKind, Map<number, string>>();
  private box(kind: VoteKind): Map<number, string> {
    let b = this.ballots.get(kind);
    if (!b) { b = new Map(); this.ballots.set(kind, b); }
    return b;
  }
  /** 目前的選擇：索引＝座位，`null`＝還沒選 */
  picks(kind: VoteKind, seats: number): (string | null)[] {
    const b = this.box(kind);
    return Array.from({ length: seats }, (_, i) => b.get(i) ?? null);
  }
  /** 這一輪結束就清乾淨，不然下一次會直接沿用上一輪的選擇 */
  clearPicks(kind: VoteKind): void { this.ballots.delete(kind); this.replayed.delete(kind); }
  /**
   * 我選了。兩邊都選完才會真的生效（規則見 `engine/vote.ts`）。
   *
   * **被擋下來要出聲**（2026-09-11）：這支原本是靜靜地 `return`，於是連線一停，
   * 畫面上按什麼都毫無反應、主控台也一片乾淨，完全查不出是哪一步斷的。
   * 跟戰鬥那邊 `playCard 在 canPlay 放行後仍失敗` 同一套作法——那行字已經抓到過兩個坑。
   * 回傳 `false`＝沒送出去。
   */
  pick(kind: VoteKind, value: string): boolean {
    if (this.dead) { console.error(`連線已經停了，「${kind}」的選擇沒送出去`); return false; }
    if (this.box(kind).has(this.seat)) { console.error(`「${kind}」這一輪已經選過了，不能改`); return false; }
    this.send({ m: 'pick', seat: this.seat, k: kind, v: value });
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
  onPick(fn: (kind: VoteKind) => void): void {
    this.picked = fn;
    /*
     * **晚到的畫面要補跑一次**（2026-09-14 夜間審查）。
     *
     * 票只在「收到的那一刻」通知畫面。倒下的人自己不投票，所以他那台如果**晚一步**才進這個畫面
     *（還停在事件結果頁沒按「繼續」、分頁放在背景計時器被節流），同伴的票早就到了、
     * 被上一個畫面忽略掉，之後再也不會有票進來觸發結算——他那台永遠停在地圖上。
     * 他是主機的話，同伴下一場出的每一張牌都在他這邊排隊，整局卡死。
     *
     * 補跑排到下一拍（註冊時畫面還沒畫完），而且**同一種選擇、同樣的票數只補一次**：
     * 處理函式常常會重畫畫面、重畫又會重新註冊，沒有這一條就是無限迴圈（第一版踩過，見上面）。
     */
    if (this.replayTimer === null) this.replayTimer = setTimeout(() => { this.replay(); }, 0);
  }
  /** 每一種選擇上一次補跑時有幾票；票數沒變就不再補 */
  private readonly replayed = new Map<VoteKind, number>();
  private replayTimer: ReturnType<typeof setTimeout> | null = null;
  private replay(): void {
    this.replayTimer = null;
    // 每一輪都重新查：處理函式可能當場結算、清掉票，或換掉畫面
    for (const kind of [...this.ballots.keys()]) {
      const box = this.ballots.get(kind);
      if (this.dead || !this.picked) return;
      if (!box || !box.size || (this.replayed.get(kind) ?? 0) >= box.size) continue;
      this.replayed.set(kind, box.size);
      this.picked(kind);
    }
  }
  /** 上一次換到的是哪個畫面：**換了畫面**才重新允許補跑（同一個畫面重畫不算，不然又是無限迴圈） */
  private lastScreen: string | undefined;
  private record(kind: VoteKind, seat: number, value: string): void {
    const b = this.box(kind);
    if (b.has(seat)) return;   // 同一個人選兩次只算第一次
    b.set(seat, value);
    if (kind === 'map') this.mapEpoch += 1;
    this.picked?.(kind);
  }
  private picked: ((kind: VoteKind) => void) | null = null;

  /** 主機用：宣布開局。兩邊各自用同一顆種子跑出同一局 */
  start(seed: string, diff: number, enc: string, heroes?: string[]): void {
    if (this.dead || !this.isHost) return;
    this.send({ m: 'start', seed, diff, enc, ...(heroes ? { heroes } : {}) });
  }

  private handle(m: WireMessage): void {
    if (this.dead) return;
    if (this.handleResync(m)) return;
    if (this.awaitingSnap) return;   // 在等主機的存檔點：這一輪剩下的都不算了
    if ((m.g ?? 0) !== this.gen) return;   // 上一輪（重新同步之前）還在路上的，丟掉
    // 開局訊息在 `attach` 之前就會到（那時還沒有戰鬥），所以要擺在 cs 的檢查之前
    // 對面送來的種類是字串：不認得的（兩台版本不同）畫面本來就不理，記一行就丟，不進票箱（health H-10）
    if (m.m === 'pick') { if (isVoteKind(m.k)) this.record(m.k, m.seat, m.v); else console.warn(`不認得的投票種類「${m.k}」，丟掉`); return; }
    // 我那一則沒算數：把手放開（見 `onDropped`）。**只認最新那一則**：更早那則的 drop 遲到（保險絲跳掉之後又送了新的），
    // 不能拿它解鎖、更不能把剛送出的選牌當成沒算數而把視窗彈回來（審查 中-4）
    if (m.m === 'drop') { if (m.n >= this.sentReq) this.dropped?.(); return; }
    if (m.m === 'hint') { if (m.seat !== this.seat) this.hinted?.(m.seat, m.u); return; }   // 純提示，不碰狀態
    // 同伴進場了（可能比我早，那時我這邊的場次還沒跟上；記最大的就好）
    if (m.m === 'here') { this.mateFight = Math.max(this.mateFight, m.f); return; }
    // 整局那一條不需要戰鬥狀態，所以要擺在 cs 的檢查之前（商店、打盹點本來就沒有 cs）
    if (this.handleRun(m)) return;
    // 走格子的對帳也一樣沒有 cs。存起來等自己也走到那一格再比（見 `syncRun`）
    if (m.m === 'sync' && m.turn === -1) {
      if (m.k && m.rfp) { this.theirMarks.set(m.k, m.rfp); this.theirPath.push(m.k); this.matchMark(m.k); }
      return;
    }
    // 戰鬥的對帳同理：存起來，等自己那一張也記下了再比（見 `endOfTurn`）。不看現在的 cs
    if (m.m === 'sync') {
      const key = `${m.f ?? this.fight}:${m.turn}`;
      this.theirChecks.set(key, { turn: m.turn, fp: m.fp, ...(m.rfp ? { rfp: m.rfp } : {}) });
      this.matchTurn(key);
      return;
    }
    if (m.m === 'start') {
      if (this.isHost) return;
      this.hooks.onStart?.(m.seed, m.diff, m.enc, m.heroes);
      if (this.startRun) this.startRun(m.seed, m.diff, m.enc, m.heroes);
      else this.pendingStart = { seed: m.seed, diff: m.diff, enc: m.enc, ...(m.heroes ? { heroes: m.heroes } : {}) };   // 還沒註冊就先存著
      return;
    }
    switch (m.m) {
      case 'req':
        // 只有主機收得到請求：編號之後廣播，自己也照號碼套
        if (!this.isHost || !this.seq) return;
        if (!this.fresh(this.seenReq, m.a.seat, m.n)) return;   // 同一則到兩次：丟掉，不是分岔
        this.backlog.push(m);
        this.drain();
        return;
      case 'act':
        // 客戶端收主機編號過的動作。主機自己不會收到（自己的走 submit）
        if (this.isHost) return;
        this.backlog.push(m);
        this.drain();
        return;
    }
  }

  /**
   * 把排隊的戰鬥訊息照順序處理掉，**處理到第一個還輪不到的就停**（後面的一定也輪不到：場次只增不減）。
   *
   * 三種情況：
   * - 屬於**已經打完的**那一場（場次比現在舊、或就是現在這場但已經 `attach(null)`）→ 丟掉
   * - 屬於**還沒進場的**那一場、或畫面正在演魔物回合（`hold`）→ 留著
   * - 其他 → 現在處理
   *
   * 處理的過程會回呼畫面，畫面可能當場 `hold()`、`attach(null)` 或 `release()`，
   * 所以每一則都重新判斷；`draining` 擋掉重入（`release` 在迴圈裡被叫到時，外圈會接著跑）。
   */
  private drain(): void {
    if (this.draining) return;
    this.draining = true;
    try {
      while (!this.dead && this.backlog.length) {
        const m = this.backlog[0] as FightMsg;
        const f = m.f ?? this.fight;
        const over = f < this.fight || (f === this.fight && !this.cs && this.lastCs !== null);
        if (!over && (f > this.fight || !this.cs || this.held)) break;
        this.backlog.shift();
        if (over) this.stale(m);
        else this.take(m);
      }
    } finally {
      this.draining = false;
    }
  }

  /** 輪到了：請求就編號（做不出來回「沒算數」），編號過的動作就照號碼套 */
  private take(m: FightMsg): void {
    if (m.m === 'act') { this.ingest({ seq: m.seq, a: m.a }); return; }
    /*
     * **上一回合送出、演出期間才輪到的請求不算**（夜間審查 低-3）。
     * 主機按結束回合的同一刻，客戶端按了「替他收回合」：那一則在魔物回合演出時排隊，
     * 演完才套下去，主機新回合一開始就被收回合。出牌也一樣——上一手的牌號可能又被抽回手上。
     */
    if (m.turn !== undefined && m.turn !== (this.cs as CombatState).turn) {
      console.error(`對方那一下是上一回合的，沒算數（${m.a.t}）`);
      this.send({ m: 'drop', n: m.n });
      return;
    }
    if (!canApply(this.cs as CombatState, m.a)) {
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
      this.send({ m: 'drop', n: m.n });
      return;
    }
    this.ingest((this.seq as Sequencer).assign(m.a), true);
  }

  /**
   * 屬於已經打完那一場的訊息。
   *
   * 請求＝來不及（最後一刀落下的同時對方又點了一張牌），回「沒算數」就好。
   * 編號過的動作就不一樣了：主機在分出勝負之後不會再發這一場的號碼，收到代表兩邊對「哪一刀分出勝負」
   * 的看法不同，而且這一號不套、佇列就永遠卡在這裡——只能停。
   */
  private stale(m: FightMsg): void {
    if (m.m === 'req') {
      console.error(`對方那一下屬於已經打完的那一場，沒算數（${m.a.t}）`);
      this.send({ m: 'drop', n: m.n });
      return;
    }
    this.desync(`第 ${m.seq} 號動作屬於已經打完的那一場（${m.a.t}）`);
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
      // 我還沒走進罐頭鋪、貨架還沒掛：買賣先發號碼、留著等貨架（見 `earlyShop`），不能靜靜丟掉
      if (!(this.shops === null && CoopSession.isShopAction(m.a)) && !canApplyRun(this.rctx, m.a)) return true;
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
    if (broadcast) this.send({ m: 'ract', seq: sa.seq, a: sa.a });
    const r = this.runQueue.receive(sa);
    if (r.applied.length) { if (this.runApplied) this.runApplied(r.applied); else this.unhandledRun.push(...r.applied.map((a) => ({ e: this.mapEpoch, a }))); }
    if (r.failed) this.desync(`第 ${r.failed.seq} 號整局動作在這邊做不出來（${r.failed.a.t}）`);
  }

  /** 把一個編號過的動作丟進佇列，並把結果回報給畫面 */
  private ingest(sa: SequencedAction, broadcast = false): void {
    if (!this.cs) return;
    if (broadcast) this.send({ m: 'act', seq: sa.seq, a: sa.a, f: this.fight });
    this.before?.();   // 套用前先讓畫面存一份快照（見 `beforeApply`）
    const r = this.queue.receive(sa);
    if (r.applied.length) { this.hooks.onApplied?.(r.applied); this.applied?.(r.applied); }
    if (r.failed) this.desync(`第 ${r.failed.seq} 號動作在這邊做不出來（${r.failed.a.t}）`);
  }

  /* ================= 重新同步（2026-09-25 使用者：「先做重新同步」） =================
   *
   * 原本兩台一對不上（指紋、走格子、編號動作套不進去）整場就停，兩個人只能回標題重開。
   * 現在改成：**主機把「最近一次回到地圖時的整局狀態」（存檔點）傳給對方，兩台都載入同一份，一起回到那一層的地圖重來**。
   * 代價是那一格（例如打到一半的戰鬥）要重打；好處是整局不會斷。
   *
   * 為什麼選「回到地圖」而不是「就地對齊」：對不上的那一刻兩台可能在不同畫面、戰鬥演到一半、商店各開各的貨架，
   * 這些有一部分存在畫面的區域變數裡，傳整局狀態也補不回來。地圖是兩個人都走完上一格才會回到的地方，
   * 那時沒有戰鬥、商店、事件在進行，整局狀態就是全部。
   */

  /** 第幾輪：重新同步一次加一。送出的每一則都帶著（`send`），收到不是這一輪的就丟 */
  private gen = 0;
  /** 最近一次回到地圖時的整局狀態（JSON）。只有主機的那一份會被用到 */
  private checkpointJson: string | null = null;
  private resyncs = 0;
  /** 客戶端請了重新同步、還在等主機的存檔點：這段期間收到的都不算、自己也不送 */
  private awaitingSnap = false;
  /** 重新整理接回的會話、畫面還沒叫 `rejoin`（見 `handleResync`） */
  private resuming = false;
  private snapTimer: ReturnType<typeof setTimeout> | null = null;
  /** 正在收的存檔點（切段收，收齊才用） */
  private snapIn: { g: number; id: number | undefined; parts: string[]; got: number } | null = null;
  /** 載入過的存檔點編號（重新整理接回的存檔點靠它分新舊，見 `handleResync`）。記全部不只上一份：更早的一份萬一重複到也認得（稽核第三輪 低-4） */
  private seenSnapIds = new Set<number>();

  /** 每一則都帶上這一輪；等存檔點的期間只送「請重新同步」那一則 */
  private send(m: NetMessage): void {
    if (this.awaitingSnap && m.m !== 'resync') return;
    this.tx.send({ ...m, g: this.gen });
  }

  /**
   * 回到地圖了：記下這一刻的整局狀態當存檔點（地圖畫面每次畫都叫）。
   * 第一次回到地圖之前（序章、開局祝福）沒有存檔點，那段對不上照舊停下
   */
  checkpoint(run: RunState): void {
    if (this.dead || this.over) return;
    this.checkpointJson = JSON.stringify(run);
    this.hooks.onCheckpoint?.(this.checkpointJson, this.gen);
  }

  /**
   * 重新整理之後接回（建構時帶 `resume` 的會話，畫面把回呼都掛好之後叫一次）：
   * 主機拿分頁存著的存檔點直接重新同步、推給對方；客戶端請主機重新同步（`re`：不管我記的是第幾輪，主機都要回）。
   * 主機沒有存檔點（重新整理前還沒回到過地圖）就接不回來
   */
  rejoin(): void {
    if (this.dead) return;
    this.resuming = false;
    const why = REJOIN_WHY;
    if (this.isHost) {
      // 還在等的狀態留著，直到下一拍真的重新同步（`hostResync` 會解開）：這段期間中繼補來的舊訊息照丟，
      // 不然手上還沒有整局（`useRun` 要等重新同步之後），套到一半會出事
      if (this.checkpointJson) this.queueHostResync(why, false); else this.stop('重新整理之前還沒回到過地圖，接不回剛剛那一局');
      return;
    }
    this.awaitingSnap = true;
    if (this.snapTimer !== null) clearTimeout(this.snapTimer);
    this.snapTimer = setTimeout(() => { this.snapTimer = null; this.awaitingSnap = false; this.stop(`${why}（等不到主機的存檔點）`); }, SNAP_WAIT_MS);
    this.send({ m: 'resync', g: this.gen, why, re: true });
  }

  /**
   * 這一局打完了（全滅或通關，`app.ts` 的 `afterCombat`；推前稽核 2026-09-25 中-2）：之後有人重新整理就不接回——
   * 存檔點是最後一次回到地圖時的整局，接回等於把兩個人拉回最後一戰之前（悔棋）。離開頁面也改回當場跟中繼說一聲
   */
  private over = false;
  runOver(): void {
    this.over = true;
    this.tx.stayOnReload?.(false);
  }

  /** 對不上了：能重新同步就重新同步；不能（沒有存檔點、次數用完、畫面沒接）才照舊停下 */
  private desync(why: string): void {
    // 整局打完之後才判到對不上（例如最後一回合的對帳晚到）：不理。重新同步會把兩個人從結算畫面拉回地圖＝悔棋（推前稽核 第三輪 低-3）
    if (this.dead || this.awaitingSnap || this.resyncQueued || this.over) return;
    if (!this.checkpointJson || this.resyncs >= MAX_RESYNC || !this.hooks.onResync) { this.stop(why); return; }
    // eslint-disable-next-line no-console
    console.warn('[連線] 兩台對不上，重新同步：', why);
    if (this.isHost) { this.queueHostResync(why); return; }
    // **先標成「在等」再送**：存檔點可能在 `send` 還沒返回前就回來了（對接得很快的時候），
    // 反過來的話收到存檔點、清掉等待之後，又被這裡標回「在等」，最後等到逾時停下
    this.awaitingSnap = true;
    this.snapTimer = setTimeout(() => { this.snapTimer = null; this.awaitingSnap = false; this.stop(`${why}（等不到主機的存檔點）`); }, SNAP_WAIT_MS);
    this.send({ m: 'resync', g: this.gen, why });
  }

  /**
   * 主機的重新同步**排到下一拍才做**（推前稽核 2026-09-25 高-1、低-2、低-3）。
   * 對不上常常是畫面自己叫出來的（走進格子時對帳、收回合時對帳）：當場換掉整局的話，叫的那段畫面流程回去之後照樣往下走——
   * 主機被帶進那一格、客戶端回到地圖，兩台互等、卡死。排到下一拍，正在跑的流程先跑完，再被地圖整個換掉
   *（等素材、演動畫的後段各自看 `app.run`／`app.cs` 換了就退場）。排著的期間再對不上不重複排：同一次收信可能判兩次。
   */
  private resyncQueued = false;
  private queueHostResync(why: string, counted = true): void {
    if (this.resyncQueued) return;
    this.resyncQueued = true;
    setTimeout(() => { this.resyncQueued = false; if (!this.dead && !this.over) this.hostResync(why, counted); }, 0);
  }

  /** 主機：換到新的一輪、把存檔點切段送出去、自己也載入它。`counted`＝算不算進「最多幾次」（重新整理接回的不算：那不是引擎出錯） */
  private hostResync(why: string, counted = true): void {
    const json = this.checkpointJson as string;
    this.awaitingSnap = false;   // 只有重新整理接回的主機會停在這個狀態（`rejoin`）
    if (counted) this.resyncs += 1;
    this.gen += 1;
    this.reset();
    const parts = snapParts(json);
    const id = Math.floor(Math.random() * 2 ** 31);   // 每一份存檔點一個編號（重新整理接回時分新舊用）
    parts.forEach((part, i) => this.send({ m: 'snap', g: this.gen, i, n: parts.length, part, why, id }));
    this.hooks.onCheckpoint?.(json, this.gen);
    this.hooks.onResync?.(json, why);
  }

  /** 重新同步那兩種訊息。回傳 true＝處理掉了 */
  private handleResync(m: WireMessage): boolean {
    // 重新整理接回、還沒叫 `rejoin` 之前：中繼補過來的（建構的當下就會交過來）一律不理，畫面的回呼還沒接好。
    // 丟掉的存檔點不可惜：`rejoin` 會再要一份新的
    if (this.resuming) return m.m === 'resync' || m.m === 'snap';
    if (m.m === 'resync') {
      if (!this.isHost) return true;
      // 客戶端重新整理後接回：不管它記的是第幾輪都要回（它的記錄可能慢一拍）；我沒有存檔點就接不回來
      if (m.re) {
        if (this.over) this.stop('對方重新整理了，這一局已經打完，不再接回');
        else if (this.checkpointJson && !this.dead) this.queueHostResync(m.why, false);
        else this.stop('對方重新整理了，但這一局還沒回到過地圖，接不回來');
        return true;
      }
      // 客戶端發現對不上。它發現時的那一輪已經被我換掉了（我這邊早一步重新同步過）就不理
      if (m.g === this.gen) this.desync(m.why);
      return true;
    }
    if (m.m !== 'snap') return false;
    // 重新整理接回的存檔點：不看輪次、只要不是剛載入過的那一份就收（推前稽核 低-4）。主機的分頁記錄萬一寫失敗、
    // 輪次落後，照「比我新才收」的規矩會被丟掉，之後兩台一個在地圖、一個還在戰鬥，互等、也沒有任何提示
    const rejoinSnap = m.why === REJOIN_WHY;
    if (this.isHost || this.over || (rejoinSnap ? m.id !== undefined && this.seenSnapIds.has(m.id) : m.g <= this.gen)) return true;
    if (!this.snapIn || this.snapIn.g !== m.g || this.snapIn.id !== m.id) this.snapIn = { g: m.g, id: m.id, parts: Array.from({ length: m.n }, () => ''), got: 0 };
    const box = this.snapIn;
    if (m.i < 0 || m.i >= box.parts.length || box.parts[m.i]) return true;   // 超出範圍或重複到的那段
    box.parts[m.i] = m.part;
    box.got += 1;
    if (box.got < box.parts.length) return true;
    this.snapIn = null;
    if (this.snapTimer !== null) { clearTimeout(this.snapTimer); this.snapTimer = null; }
    this.awaitingSnap = false;
    if (!rejoinSnap) this.resyncs += 1;   // 重新整理接回不算進「最多幾次」（主機那邊同一個規矩，推前稽核 低-2）
    this.gen = m.g;
    if (m.id !== undefined) this.seenSnapIds.add(m.id);
    this.reset();
    const json = box.parts.join('');
    this.checkpointJson = json;   // 載入的就是新的存檔點（我這台之後再重新整理，也接得回這一份）
    this.hooks.onCheckpoint?.(json, this.gen);
    this.hooks.onResync?.(json, m.why);
    return true;
  }

  /** 換到新的一輪：號碼機、佇列、排隊中的動作、對帳單、票箱、走過的格子全部歸零（兩台在同一個點上一起歸零） */
  private reset(): void {
    this.queue = new ActionQueue((a: CoopAction) => (this.cs ? applyAction(this.cs, a) : false));
    this.runQueue = new ActionQueue<RunAction>((a) => this.applyRun(a));
    if (this.isHost) { this.seq = new Sequencer(); this.runSeq = new Sequencer<RunAction>(); }
    this.cs = null; this.lastCs = null; this.fight = 0; this.held = false; this.mateFight = 0;
    this.backlog.length = 0;
    this.myChecks.clear(); this.theirChecks.clear();
    this.sentReq = 0; this.sentRunReq = 0; this.seenReq.clear(); this.seenRunReq.clear();
    this.earlyShop.length = 0; this.shops = null;
    this.myMarks.clear(); this.theirMarks.clear(); this.myPath.length = 0; this.theirPath.length = 0;
    this.ballots.clear(); this.replayed.clear();
    if (this.replayTimer !== null) { clearTimeout(this.replayTimer); this.replayTimer = null; }
    this.unhandledRun.length = 0; this.mapEpoch = 0; this.enteredEpoch = 0;
    this.runState = null;   // 畫面載入存檔點之後會 `useRun` 新的那一份
  }

  private stop(why: string): void {
    if (this.dead) return;
    this.dead = true;
    this.hooks.onDesync?.(why);
    this.trouble?.(why);
    this.tx.close();
  }
}
