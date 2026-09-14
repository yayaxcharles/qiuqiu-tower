/**
 * 房間中繼（Cloudflare Worker ＋ Durable Object）。
 *
 * 一個房號＝一個 Durable Object，最多兩條 WebSocket：開房的（host）與加入的（join）。
 * 它**不懂遊戲**：一邊送來的文字原封不動轉給另一邊，兩邊都在了就各送一句 `{"m":"relay","s":"open"}`，
 * 一邊斷線就送另一邊 `{"m":"relay","s":"closed"}` 再把它關掉。鎖步、對帳、號碼全在瀏覽器端（`src/net/session.ts`）。
 *
 * 狀態就是「現在連著的 socket」（`ctx.getWebSockets`），不存任何東西：房間用完自然空掉，不用清理。
 * 用的是 WebSocket 休眠 API（`acceptWebSocket`）：兩邊都在等對方出牌的時候物件會睡著，不算計時費。
 *
 * 版本檢查：兩邊連進來都帶打包編號（`build`），對不上就把加入的那一位拒絕掉——
 * 跟貼碼那條路的 `src/net/code.ts` 同一個理由：兩台跑不同的引擎，走第一格就對帳失敗。
 *
 * 拒絕一律「先接受、再帶原因關掉」：直接回 4xx 的話瀏覽器只會看到 1006、沒有原因，玩家不知道該做什麼。
 */
import { DurableObject } from 'cloudflare:workers';

export interface Env { ROOM: DurableObjectNamespace<Room> }

const ROOM_PATH = /^\/room\/([0-9]{6})$/;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const m = ROOM_PATH.exec(url.pathname);
    if (!m) return new Response('qiuqiu relay：這裡只轉送遊戲訊息，沒有網頁。', { status: 200 });
    if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('要用 WebSocket 連', { status: 426 });
    return env.ROOM.get(env.ROOM.idFromName(m[1]!)).fetch(req);
  },
} satisfies ExportedHandler<Env>;

type Role = 'host' | 'join';
interface Attach { role: Role; build: string }

/** 拒絕的關閉代碼（4000 起是應用程式自訂的區段）。瀏覽器端照 `reason` 顯示，代碼給程式判斷 */
export const CLOSE = { taken: 4409, noRoom: 4404, full: 4403, version: 4400, peerLeft: 4000 } as const;

export class Room extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) { super(ctx, env); }

  override fetch(req: Request): Response {
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
    else if (role === 'join' && (hosts[0]!.deserializeAttachment() as Attach).build !== build) {
      refuse = { code: CLOSE.version, why: '對方開的遊戲版本跟你不一樣（有一邊的頁面比較舊）。兩邊都重新整理頁面，再開一次房' };
    }

    const pair = new WebSocketPair();
    const client = pair[0]!;
    const server = pair[1]!;
    if (refuse) {
      server.accept();
      server.close(refuse.code, refuse.why);
      return new Response(null, { status: 101, webSocket: client });
    }
    this.ctx.acceptWebSocket(server, [role]);
    server.serializeAttachment({ role, build } satisfies Attach);
    if (role === 'join') {
      const open = JSON.stringify({ m: 'relay', s: 'open' });
      hosts[0]!.send(open);
      server.send(open);
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  private other(ws: WebSocket): WebSocket | undefined {
    const { role } = ws.deserializeAttachment() as Attach;
    return this.ctx.getWebSockets(role === 'host' ? 'join' : 'host')[0];
  }

  override webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer): void {
    if (typeof msg !== 'string') return;   // 遊戲只傳 JSON 文字
    this.other(ws)?.send(msg);
  }

  override webSocketClose(ws: WebSocket): void { this.bye(ws); }
  override webSocketError(ws: WebSocket): void { this.bye(ws); }

  /** 一邊走了：告訴另一邊、把它也關掉，房間就空了（下一位可以用同一個房號重開） */
  private bye(ws: WebSocket): void {
    const other = this.other(ws);
    if (other) {
      try { other.send(JSON.stringify({ m: 'relay', s: 'closed' })); } catch { /* 對方也走了 */ }
      try { other.close(CLOSE.peerLeft, '對方離開了'); } catch { /* 已經關了 */ }
    }
    try { ws.close(); } catch { /* 已經關了 */ }
  }
}
