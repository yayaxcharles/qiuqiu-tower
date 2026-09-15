/**
 * 房間中繼（Cloudflare Worker ＋ Durable Object）。
 *
 * 一個房號＝一個 Durable Object，最多兩條 WebSocket：開房的（host）與加入的（join）。
 * 它**不懂遊戲**：一邊送來的文字原封不動轉給另一邊。自己只講幾句話（`{"m":"relay","s":…}`）：
 *   hosting＝房開好了（給開房的人，瀏覽器端等到這句才把房號秀出來，不靠時間猜）、
 *   open＝兩邊都到了（接回時附 `got`＝我收到你幾則）、closed＝對方走了（附 `why`）、away＝對方斷線了（等他回來）、back＝對方回來了。
 * 鎖步、對帳、號碼全在瀏覽器端（`src/net/session.ts`）。
 *
 * 版本檢查：兩邊連進來都帶打包編號（`build`），對不上就把加入的那一位拒絕掉——
 * 跟貼碼那條路的 `src/net/code.ts` 同一個理由：兩台跑不同的引擎，走第一格就對帳失敗。
 *
 * 拒絕一律「先接受、再帶原因關掉」：直接回 4xx 的話瀏覽器只會看到 1006、沒有原因，玩家不知道該做什麼。
 * `reason` 有 123 位元組的硬上限（超過 runtime 會丟例外、變成 500、瀏覽器又只看到 1006），中文 40 字以內。
 *
 * **中途斷線接回**（使用者 2026-09-15：「斷線的問題可以解決嗎」→「好」）：一邊斷了**不馬上踢掉另一邊**，
 * 留 `GRACE_MS` 等他回來；期間對方送的訊息先記著。為了接回之後**一則不多、一則不少**（鎖步對重複與漏掉都很脆弱），
 * 房間在 storage 記兩樣東西（物件睡著、被踢出記憶體都還在）：
 *   `counts`＝從每一邊收到幾則、轉給（或排隊給）每一邊幾則；`ring:<role>:<n>`＝最近 RING 則轉給這一邊的原文。
 * 回來的人帶 `resume=1&got=<自己收到幾則>`：中繼把第 got+1 則到第 fwd 則補給他、再說 `open` 並附上「我收到你幾則」，
 * 他把中繼沒收到的那幾則補送回來（`src/net/ws.ts`）。兩個方向都是照數字補、不靠猜；遊戲那層一個字都不用改。
 * 每一則遊戲訊息讀 1 列、寫 2 列 storage（免費方案每天十萬列寫入）：正常一局幾千則，一天十幾局。
 * storage 出狀況（額度用完）就照樣轉送、只是這一局接不回去，不能讓所有房間一起卡住（審查 中-3）。
 * 真的走了（回標題、關分頁、分岔停局）瀏覽器會先說一句 `bye`，對方立刻收到 closed、房間清空，不用等。
 *
 * **同一個角色可能同時掛著兩條 socket**（審查 高-1）：網路真的斷掉時，中繼這端的舊 socket 是半開的，
 * `close()` 它對方也不會回應，`getWebSockets` 裡它可能還留好幾分鐘。所以「對方那一條」一律拿**最新接上的那條**
 *（`live()`：附件裡 `at` 最大、沒被標成殭屍的），不能拿 `[0]`；`gone()` 看到同角色有更新的那條就當成換線、不是斷線。
 *
 * 殭屍：手機切背景、換網路不一定會送 close，那條 socket 會一直掛著。瀏覽器每 25 秒送一個 `ping`，
 * 這裡用自動回應（不吵醒物件）回 `pong` 並記時間；鬧鐘每 30 秒看一次，超過 90 秒沒 ping 的當成斷線
 *（照「等他回來」處理，附件標 `zombie` 之後不再重複處理）。
 */
import { DurableObject } from 'cloudflare:workers';

export interface Env { ROOM: DurableObjectNamespace<Room> }

const ROOM_PATH = /^\/room\/([0-9]{6})$/;

/**
 * 哪些網頁可以連（審查 高-2）：中繼網址寫死在打包出去的網頁裡，任何人抓得到；只放行自己的兩個站。
 * 瀏覽器開 WebSocket 一定帶 Origin；沒帶的是腳本（本機 e2e、curl），放行給自己測試用——腳本靠下面的訊息速率擋。
 */
const ORIGINS = ['https://yayaxcharles.github.io'];
const originOk = (o: string | null): boolean => !o || ORIGINS.includes(o) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(req.url);
      const m = ROOM_PATH.exec(url.pathname);
      if (!m) return new Response('qiuqiu relay：這裡只轉送遊戲訊息，沒有網頁。', { status: 404 });
      if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('要用 WebSocket 連', { status: 426 });
      if (!originOk(req.headers.get('Origin'))) return new Response('這個網頁不能連這個中繼', { status: 403 });
      return await env.ROOM.get(env.ROOM.idFromName(m[1]!)).fetch(req);
    } catch (e) {
      // 沒接住的話瀏覽器只看到 1006、沒有原因（審查 高-3）
      return new Response(`中繼出了狀況：${e instanceof Error ? e.message : String(e)}`, { status: 503 });
    }
  },
} satisfies ExportedHandler<Env>;

type Role = 'host' | 'join';
interface Attach { role: Role; build: string; at: number; zombie?: boolean }
/** 從每一邊收到幾則（got）、轉給每一邊幾則（fwd）。一個 key，一則訊息只寫一列 */
interface Counts { got: Record<Role, number>; fwd: Record<Role, number> }
const ZERO = (): Counts => ({ got: { host: 0, join: 0 }, fwd: { host: 0, join: 0 } });
const otherRole = (r: Role): Role => (r === 'host' ? 'join' : 'host');

// （這個模組是 Worker 入口：除了 handler 與 Durable Object 類別，字串／數字／物件常數**不能** export，workerd 啟動會拒絕）
/**
 * 拒絕的關閉代碼（4000 起是應用程式自訂的區段）。瀏覽器端（`src/net/ws.ts`）照 `reason` 顯示、照代碼判斷撞號要不要重抽、
 * 斷線要不要接回（4001 殭屍是「線路斷了」可以接回；其餘 4xxx 都是「被拒絕」不再試）。
 */
const CLOSE = { taken: 4409, noRoom: 4404, full: 4403, version: 4400, peerLeft: 4000, zombie: 4001, flood: 4429, gone: 4410 } as const;
/** 沒 ping 多久當斷線（瀏覽器每 25 秒一次；背景分頁會被瀏覽器拉長到約一分鐘一次，漏一次還在線內） */
const ZOMBIE_MS = 90_000;
const SWEEP_MS = 30_000;
/** 一邊斷線之後等他回來的時間；超過就當他走了、把另一邊也放掉。瀏覽器端的 `GRACE_MS` 跟這裡一樣 */
const GRACE_MS = 120_000;
/** 每一邊最多記幾則「轉給他的」原文；斷線期間對方送超過這個數就接不回去（正常對局每分鐘不到 40 則） */
const RING = 200;
/** 遊戲訊息一則幾百位元組，超過這個一定不是遊戲在講話 */
const MAX_MSG = 16_384;
/**
 * 每條連線每秒最多幾則（審查 高-2／中-3）：一場正常對局每秒不到 5 則（出牌、對帳、考慮中提示已合併），
 * 接回補送一次最多 20 則。超過就是壞掉或惡意。免費額度是全帳號共用的，一條連線灌一分鐘就能讓當天所有人玩不了。
 * 計數放記憶體：物件睡著會歸零，沒關係——醒來那一秒重新數，惡意的一秒內就會再超。
 */
const MAX_PER_SEC = 25;

/** WebSocket 的 reason 上限 123 位元組；中文一字 3 位元組，40 字剛好在線內 */
const reason = (s: string): string => (s.length > 40 ? s.slice(0, 40) : s);
type Ctl = 'hosting' | 'open' | 'closed' | 'away' | 'back';
const ctl = (s: Ctl, extra: Record<string, unknown> = {}): string => JSON.stringify({ m: 'relay', s, ...extra });
/** 瀏覽器端說「我真的走了」（回標題、關分頁、分岔停局；`src/net/ws.ts` 送的是同一個字串）：不等他回來，對方立刻收到 closed */
const BYE = '{"m":"relay","s":"bye"}';

export class Room extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // 心跳不吵醒物件：runtime 自己回 pong 並記下時間，`alarm` 再拿時間判斷誰死了
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  override async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const role = url.searchParams.get('role');
    const build = url.searchParams.get('build') ?? '';
    const resume = url.searchParams.get('resume') === '1';
    const got = Math.max(0, Math.floor(Number(url.searchParams.get('got') ?? '0') || 0));
    if (role !== 'host' && role !== 'join') return new Response('role 要是 host 或 join', { status: 400 });
    const st = this.ctx.storage;
    const hostLive = this.live('host');
    const joinLive = this.live('join');
    const peer = role === 'host' ? joinLive : hostLive;

    let refuse: { code: number; why: string } | null = null;
    if (resume) {
      // 接回：房間還在、對方版本一樣、漏掉的還補得回來。自己那一條舊的 socket 還掛著也沒關係（下面會換掉）
      const counts = await this.counts();
      if (!counts) refuse = { code: CLOSE.gone, why: '斷線太久，房間已經關了。兩邊回標題重新開房' };
      else if (peer && this.attach(peer)?.build !== build) refuse = { code: CLOSE.version, why: '版本不一樣（有一邊的頁面比較舊），兩邊都重新整理再開一次房' };
      else if (got > counts.fwd[role] || counts.fwd[role] - got > RING) refuse = { code: CLOSE.gone, why: '斷線期間漏掉太多訊息，接不回去。兩邊回標題重新開房' };
    } else if (role === 'host') {
      // 新開房：房裡還有人（不管是連著的、還是斷線等同伴回來的）都不能用這個房號，換一個
      if (hostLive || joinLive) refuse = { code: CLOSE.taken, why: '這個房號已經有人在用' };
    } else if (!hostLive) refuse = { code: CLOSE.noRoom, why: '找不到這個房號：對方還沒開房，或房號打錯了' };
    else if (joinLive) refuse = { code: CLOSE.full, why: '這個房間已經有人加入了' };
    else if ((await this.get<number>('away:join')) !== undefined) refuse = { code: CLOSE.full, why: '房間裡的同伴斷線中，正在等對方回來' };
    else if (this.attach(hostLive)?.build !== build) {
      refuse = { code: CLOSE.version, why: '版本不一樣（有一邊的頁面比較舊），兩邊都重新整理再開一次房' };
    }

    const pair = new WebSocketPair();
    const client = pair[0]!;
    const server = pair[1]!;
    if (!refuse && role === 'join' && !resume) {
      // 開房的那條正在關（背景分頁、換網路）時 send 會丟例外；當他已經走了，照「沒人開房」拒絕（審查 高-3）
      try { hostLive!.send(ctl('open')); } catch { refuse = { code: CLOSE.noRoom, why: '找不到這個房號：對方剛離開了，請對方重新開房' }; }
    }
    if (refuse) {
      server.accept();
      server.close(refuse.code, reason(refuse.why));
      return new Response(null, { status: 101, webSocket: client });
    }
    this.ctx.acceptWebSocket(server, [role]);
    server.serializeAttachment({ role, build, at: Date.now() } satisfies Attach);
    if (resume) {
      // 同一個人換了新的連線：舊的那幾條（多半是網路斷了、close 訊框沒到）標成殭屍、關掉。
      // 先接受新的再關舊的，`gone` 才認得出是換線不是斷線；標了殭屍 `live()` 就不會再挑到它
      for (const old of this.ctx.getWebSockets(role)) {
        if (old === server) continue;
        const a = this.attach(old);
        if (a) { try { old.serializeAttachment({ ...a, zombie: true } satisfies Attach); } catch { /* 附件寫不進去就算了 */ } }
        try { old.close(1000, '同一個人換了新的連線'); } catch { /* 早就斷了 */ }
        this.rate.delete(old);
      }
      try {
        await st.delete(`away:${role}`);
        const counts = (await st.get<Counts>('counts')) ?? ZERO();
        // 漏掉的補給他：第 got+1 則到第 fwd 則，照順序、在 open 之前
        const keys: string[] = [];
        for (let i = got + 1; i <= counts.fwd[role]; i++) keys.push(`ring:${role}:${i % RING}`);
        const ring = keys.length ? await st.get<string>(keys) : new Map<string, string>();
        for (const k of keys) { const s = ring.get(k); if (s !== undefined) server.send(s); }
        server.send(ctl('open', { got: counts.got[role] }));
      } catch {
        // storage 讀不到：接上但不補（open 不帶 got＝瀏覽器當它全收到）。差了幾則的話下一次對帳會抓到、停下來講清楚
        try { server.send(ctl('open')); } catch { /* 剛接上又斷了，close 事件會再走一次 gone */ }
      }
      if (peer) { try { peer.send(ctl('back')); } catch { /* 對方那一瞬間斷了 */ } }
      else if ((await this.get<number>(`away:${otherRole(role)}`)) !== undefined) { try { server.send(ctl('away')); } catch { /* 同上 */ } }
    } else {
      try {
        if (role === 'host') { await st.deleteAll(); await st.put('counts', ZERO()); }   // 新開房：上一局殘留的全清掉（房號用完可以重用）
        else { const c = (await st.get<Counts>('counts')) ?? ZERO(); c.got.join = 0; c.fwd.join = 0; await st.put('counts', c); }
      } catch { /* storage 壞了：這一局沒有接回功能，其餘照常 */ }
      try { server.send(ctl(role === 'host' ? 'hosting' : 'open')); } catch { /* 對方那一瞬間就走了，close 事件會收尾 */ }
    }
    try {
      if ((await st.getAlarm()) === null) await st.setAlarm(Date.now() + SWEEP_MS);
    } catch { /* 排不到鬧鐘只是少了殭屍清掃，連線本身照常 */ }
    return new Response(null, { status: 101, webSocket: client });
  }

  /** 每條連線這一秒送了幾則（記憶體，睡著歸零） */
  private readonly rate = new Map<WebSocket, { sec: number; n: number }>();
  private tooFast(ws: WebSocket): boolean {
    const sec = Math.floor(Date.now() / 1000);
    const r = this.rate.get(ws);
    if (!r || r.sec !== sec) { this.rate.set(ws, { sec, n: 1 }); return false; }
    r.n += 1;
    return r.n > MAX_PER_SEC;
  }

  private attach(ws: WebSocket): Attach | null {
    try { return (ws.deserializeAttachment() ?? null) as Attach | null; } catch { return null; }
  }

  /** storage 讀一個 key；讀不到（額度用完、壞了）就當沒有 */
  private async get<T>(key: string): Promise<T | undefined> {
    try { return await this.ctx.storage.get<T>(key); } catch { return undefined; }
  }
  private async counts(): Promise<Counts | undefined> { return this.get<Counts>('counts'); }

  /** 這個角色**現在活著的那一條**：附件 `at` 最大、沒被標成殭屍的（同角色可能同時掛兩條，見檔頭） */
  private live(role: Role): WebSocket | undefined {
    let best: WebSocket | undefined;
    let at = -1;
    for (const s of this.ctx.getWebSockets(role)) {
      const a = this.attach(s);
      if (!a || a.zombie) continue;
      if (a.at > at) { at = a.at; best = s; }
    }
    return best;
  }

  private other(ws: WebSocket): WebSocket | undefined {
    const role = this.attach(ws)?.role;
    return role ? this.live(otherRole(role)) : undefined;
  }

  override async webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer): Promise<void> {
    if (typeof msg !== 'string' || msg.length > MAX_MSG) return;   // 遊戲只傳 JSON 文字
    if (msg === BYE) { await this.wipe(); this.bye(ws, CLOSE.peerLeft, '對方離開了'); return; }
    if (this.tooFast(ws)) { await this.wipe(); this.bye(ws, CLOSE.flood, '對方送的訊息太多，被中繼踢掉了', '訊息太多，被中繼踢掉了'); return; }
    const a = this.attach(ws);
    if (!a) return;
    const to = otherRole(a.role);
    // 先記再轉：對方不在（斷線中）也照記，他回來時照數字補（見檔頭）。storage 壞了照樣轉送
    try {
      const st = this.ctx.storage;
      const c = (await st.get<Counts>('counts')) ?? ZERO();
      c.got[a.role] += 1;
      c.fwd[to] += 1;
      await st.put({ counts: c, [`ring:${to}:${c.fwd[to] % RING}`]: msg });
    } catch { /* 額度用完或壞了：這一局接不回去，但不能讓所有房間一起卡住（審查 中-3） */ }
    try { this.live(to)?.send(msg); } catch { /* 對方正在關，他回來會照數字補到 */ }
  }

  override async webSocketClose(ws: WebSocket): Promise<void> { await this.gone(ws); }
  override async webSocketError(ws: WebSocket): Promise<void> { await this.gone(ws); }

  /** 一邊斷了：不踢另一邊，記下時間（只記第一次）、告訴他「對方斷線了」，等 `GRACE_MS`（鬧鐘會來看有沒有回來） */
  private async gone(ws: WebSocket): Promise<void> {
    this.rate.delete(ws);
    const a = this.attach(ws);
    if (!a) return;
    // 同一個人已經換了新的連線（接回時舊的被關掉、或半開的舊線終於死了）：不是斷線
    if (this.ctx.getWebSockets(a.role).some((s) => s !== ws && (this.attach(s)?.at ?? 0) > a.at)) return;
    if ((await this.counts()) === undefined) return;   // 房間已經結束（bye 之後）
    if ((await this.get<number>(`away:${a.role}`)) !== undefined) return;   // 已經記過：殭屍掃描每 30 秒會再來一次，不能把時間往後推（審查 高-1）
    const peer = this.live(otherRole(a.role));
    if (peer) { try { peer.send(ctl('away')); } catch { /* 對方也在斷 */ } }
    try {
      const st = this.ctx.storage;
      await st.put({ [`away:${a.role}`]: Date.now() });
      if ((await st.getAlarm()) === null) await st.setAlarm(Date.now() + SWEEP_MS);
    } catch { /* storage 壞了：對方看得到 away，但不會自動到期；他自己回標題就好 */ }
  }

  /** 每 30 秒掃一次：太久沒 ping 的當斷線；斷線超過 `GRACE_MS` 沒回來的當走了、另一邊放掉；房裡還有人（或還有人在等）就再排下一次 */
  override async alarm(): Promise<void> {
    const now = Date.now();
    const st = this.ctx.storage;
    for (const ws of this.ctx.getWebSockets()) {
      const a = this.attach(ws);
      if (!a || a.zombie) continue;   // 標過的不再處理（半開的舊線可能還要好幾分鐘才真的消失）
      const last = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? a.at;
      if (now - last > ZOMBIE_MS) {
        try { ws.serializeAttachment({ ...a, zombie: true } satisfies Attach); } catch { /* 附件寫不進去就算了 */ }
        await this.gone(ws);   // 自己關的 socket 不一定會觸發 webSocketClose，這裡先記
        try { ws.close(CLOSE.zombie, reason('太久沒有回應（可能網路斷了）')); } catch { /* 早就斷了 */ }
      }
    }
    for (const role of ['host', 'join'] as const) {
      const away = await this.get<number>(`away:${role}`);
      if (away !== undefined && now - away > GRACE_MS) {
        const peer = this.live(otherRole(role));
        await this.wipe();
        if (peer) this.kick(peer, CLOSE.peerLeft, '對方斷線太久，沒有回來');
        return;   // 房間結束，不再排鬧鐘
      }
    }
    const waiting = (await this.get<number>('away:host')) !== undefined || (await this.get<number>('away:join')) !== undefined;
    try { if (this.ctx.getWebSockets().length || waiting) await st.setAlarm(now + SWEEP_MS); } catch { /* 排不到就等下一則訊息再排 */ }
  }

  /** 房間結束：計數、暫存、斷線標記全清（下一位可以用同一個房號重開） */
  private async wipe(): Promise<void> {
    try { await this.ctx.storage.deleteAll(); } catch { /* 清不掉的話下一位開房會再清一次 */ }
  }

  /** 把這一條帶原因關掉（先說一聲 closed 附原因，瀏覽器端好分辨） */
  private kick(ws: WebSocket, code: number, why: string): void {
    try { ws.send(ctl('closed', { why })); } catch { /* 對方也走了 */ }
    try { ws.close(code, reason(why)); } catch { /* 已經關了 */ }
    this.rate.delete(ws);
  }

  /** 這一條真的走了：另一邊帶原因關掉、自己也關（房間由呼叫端 `wipe`） */
  private bye(ws: WebSocket, code: number, whyOther: string, whySelf = whyOther): void {
    const other = this.other(ws);
    if (other) this.kick(other, code, whyOther);
    // 自己這條也帶原因關（審查 高-1 的另一半：原本不帶原因，被當殭屍踢掉時畫面只會說「連不上中繼伺服器」）
    try { ws.close(code === CLOSE.peerLeft ? 1000 : code, code === CLOSE.peerLeft ? '' : reason(whySelf)); } catch { /* 已經關了 */ }
    this.rate.delete(ws);
  }
}
