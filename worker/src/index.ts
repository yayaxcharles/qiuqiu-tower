/**
 * 房間中繼（Cloudflare Worker ＋ Durable Object）。
 *
 * 一個房號＝一個 Durable Object，最多兩條 WebSocket：開房的（host）與加入的（join）。
 * 它**不懂遊戲**：一邊送來的文字原封不動轉給另一邊。自己只講四句話（`{"m":"relay","s":…}`）：
 *   hosting＝房開好了（給開房的人，瀏覽器端等到這句才把房號秀出來，不靠時間猜）、
 *   open＝兩邊都到了、closed＝對方走了。鎖步、對帳、號碼全在瀏覽器端（`src/net/session.ts`）。
 *
 * 狀態就是「現在連著的 socket」（`ctx.getWebSockets`）加每條 socket 的附件，不存任何東西：
 * 房間用完自然空掉。用的是 WebSocket 休眠 API（`acceptWebSocket`）：兩邊都在等對方出牌的時候物件會睡著，不算計時費。
 *
 * 版本檢查：兩邊連進來都帶打包編號（`build`），對不上就把加入的那一位拒絕掉——
 * 跟貼碼那條路的 `src/net/code.ts` 同一個理由：兩台跑不同的引擎，走第一格就對帳失敗。
 *
 * 拒絕一律「先接受、再帶原因關掉」：直接回 4xx 的話瀏覽器只會看到 1006、沒有原因，玩家不知道該做什麼。
 * `reason` 有 123 位元組的硬上限（超過 runtime 會丟例外、變成 500、瀏覽器又只看到 1006），中文 40 字以內。
 *
 * 殭屍房：手機切背景、換網路不一定會送 close，那條 socket 會一直掛著、房號被佔住。
 * 瀏覽器每 25 秒送一個 `ping`，這裡用自動回應（不吵醒物件）回 `pong` 並記時間；鬧鐘每分鐘看一次，
 * 超過 150 秒沒 ping 的當成死了、照「對方離開」處理。
 */
import { DurableObject } from 'cloudflare:workers';

export interface Env { ROOM: DurableObjectNamespace<Room> }

const ROOM_PATH = /^\/room\/([0-9]{6})$/;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const m = ROOM_PATH.exec(url.pathname);
    if (!m) return new Response('qiuqiu relay：這裡只轉送遊戲訊息，沒有網頁。', { status: 404 });
    if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('要用 WebSocket 連', { status: 426 });
    return env.ROOM.get(env.ROOM.idFromName(m[1]!)).fetch(req);
  },
} satisfies ExportedHandler<Env>;

type Role = 'host' | 'join';
interface Attach { role: Role; build: string; at: number }

/** 拒絕的關閉代碼（4000 起是應用程式自訂的區段）。瀏覽器端（`src/net/ws.ts`）照 `reason` 顯示、照代碼判斷撞號要不要重抽 */
export const CLOSE = { taken: 4409, noRoom: 4404, full: 4403, version: 4400, peerLeft: 4000, zombie: 4001 } as const;
/** 沒 ping 多久當死了（瀏覽器每 25 秒一次；背景分頁會被瀏覽器拉長到約一分鐘一次） */
const ZOMBIE_MS = 150_000;
const SWEEP_MS = 60_000;
/** 遊戲訊息一則幾百位元組，超過這個一定不是遊戲在講話 */
const MAX_MSG = 16_384;

/** WebSocket 的 reason 上限 123 位元組；中文一字 3 位元組，40 字剛好在線內 */
const reason = (s: string): string => (s.length > 40 ? s.slice(0, 40) : s);
const ctl = (s: 'hosting' | 'open' | 'closed'): string => JSON.stringify({ m: 'relay', s });

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
    if (role !== 'host' && role !== 'join') return new Response('role 要是 host 或 join', { status: 400 });
    const hosts = this.ctx.getWebSockets('host');
    const joins = this.ctx.getWebSockets('join');

    let refuse: { code: number; why: string } | null = null;
    if (role === 'host' && hosts.length) refuse = { code: CLOSE.taken, why: '這個房號已經有人在用' };
    else if (role === 'join' && !hosts.length) refuse = { code: CLOSE.noRoom, why: '找不到這個房號：對方還沒開房，或房號打錯了' };
    else if (role === 'join' && joins.length) refuse = { code: CLOSE.full, why: '這個房間已經有人加入了' };
    else if (role === 'join' && this.attach(hosts[0]!)?.build !== build) {
      refuse = { code: CLOSE.version, why: '版本不一樣（有一邊的頁面比較舊），兩邊都重新整理再開一次房' };
    }

    const pair = new WebSocketPair();
    const client = pair[0]!;
    const server = pair[1]!;
    if (refuse) {
      server.accept();
      server.close(refuse.code, reason(refuse.why));
      return new Response(null, { status: 101, webSocket: client });
    }
    this.ctx.acceptWebSocket(server, [role]);
    server.serializeAttachment({ role, build, at: Date.now() } satisfies Attach);
    if (role === 'host') {
      server.send(ctl('hosting'));
    } else {
      hosts[0]!.send(ctl('open'));
      server.send(ctl('open'));
    }
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + SWEEP_MS);
    return new Response(null, { status: 101, webSocket: client });
  }

  private attach(ws: WebSocket): Attach | null {
    try { return (ws.deserializeAttachment() ?? null) as Attach | null; } catch { return null; }
  }

  private other(ws: WebSocket): WebSocket | undefined {
    const role = this.attach(ws)?.role;
    if (!role) return undefined;
    return this.ctx.getWebSockets(role === 'host' ? 'join' : 'host')[0];
  }

  override webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer): void {
    if (typeof msg !== 'string' || msg.length > MAX_MSG) return;   // 遊戲只傳 JSON 文字
    try { this.other(ws)?.send(msg); } catch { /* 對方正在關，沒送到的那一則對方也不需要了 */ }
  }

  override webSocketClose(ws: WebSocket): void { this.bye(ws, CLOSE.peerLeft, '對方離開了'); }
  override webSocketError(ws: WebSocket): void { this.bye(ws, CLOSE.peerLeft, '對方離開了'); }

  /** 每分鐘掃一次：太久沒 ping 的當殭屍踢掉；房裡還有人就再排下一次 */
  override async alarm(): Promise<void> {
    const now = Date.now();
    for (const ws of this.ctx.getWebSockets()) {
      const last = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? this.attach(ws)?.at ?? 0;
      if (now - last > ZOMBIE_MS) this.bye(ws, CLOSE.zombie, '對方沒有回應（可能網路斷了）');
    }
    if (this.ctx.getWebSockets().length) await this.ctx.storage.setAlarm(now + SWEEP_MS);
  }

  /** 一邊走了：告訴另一邊、把它也關掉，房間就空了（下一位可以用同一個房號重開） */
  private bye(ws: WebSocket, code: number, why: string): void {
    const other = this.other(ws);
    if (other) {
      try { other.send(ctl('closed')); } catch { /* 對方也走了 */ }
      try { other.close(code, reason(why)); } catch { /* 已經關了 */ }
    }
    try { ws.close(); } catch { /* 已經關了 */ }
  }
}
