import { BUILD } from './code';
import type { NetMessage, Transport } from './transport';

/**
 * 房號連線：兩台瀏覽器都連到 Cloudflare 上的中繼（`worker/`），由它轉送訊息。
 *
 * 為什麼不再兩台直連（`rtc.ts`）：直連只用 STUN 問對外位置，碰到手機網路（電信商多人共用一個對外位址）
 * 或對稱式 NAT 就穿不過去，畫面永遠是「連不上對方」——使用者 2026-09-14 深夜跟朋友試了很多次都是這樣。
 * 中繼是雙方都**主動往外連**，哪種網路都連得上；代價是多一支小後端（免費額度夠朋友之間玩）。
 * 直連那條路留著當備用（中繼掛了還能貼碼玩）。
 *
 * 流程：開房的人拿到六位數房號 → 用 LINE 講給對方 → 對方輸入 → 中繼把兩邊接起來，各送一句 `relay open`。
 * 版本檢查在中繼做（連進去時帶打包編號），對不上加入的那一位會被帶原因關掉。
 *
 * 跟 `rtc.ts` 一樣刻意寫得薄：鎖步、對帳、號碼都在 `session.ts`，這裡只負責把字串送過去。
 */

declare const __RELAY_URL__: string;
/** 正式站的中繼網址（部署 `worker/` 之後 wrangler 印出來的那一個）。本機測試用 `RELAY_URL=` 環境變數蓋掉 */
export const DEFAULT_RELAY = 'https://qiuqiu-relay.qiuqiu-tower.workers.dev';
export function relayUrl(): string {
  const env = typeof __RELAY_URL__ === 'string' ? __RELAY_URL__ : '';
  return (env || DEFAULT_RELAY).replace(/\/+$/, '');
}

/** 中繼自己講的話（不是遊戲訊息）：兩邊都到了、或對方走了 */
interface RelayCtl { m: 'relay'; s: 'open' | 'closed' }
const isCtl = (x: unknown): x is RelayCtl => !!x && typeof x === 'object' && (x as { m?: unknown }).m === 'relay';

/** 六位數房號。用數字不用字母：口頭講、LINE 打都不會搞混 0／O、1／l */
export function makeCode(rng: () => number = Math.random): string {
  return String(Math.floor(rng() * 1_000_000)).padStart(6, '0');
}

/** 測試用：換掉真的 WebSocket */
export type WsFactory = (url: string) => WebSocket;
const realWs: WsFactory = (url) => new WebSocket(url);

/** 開房的人等對方輸入房號，這段是人手的時間，只給一個「久到不合理」的上限 */
export const HOST_WAIT_MS = 10 * 60_000;
/** 加入的人按下去之後，中繼一兩秒內就會回話；15 秒沒回就是網路不通 */
export const JOIN_WAIT_MS = 15_000;
/** 房號撞到別人正在用的（4409）就換一個再試，最多幾次 */
const CODE_TRIES = 3;

function wsUrl(code: string, role: 'host' | 'join'): string {
  const base = relayUrl().replace(/^http/, 'ws');
  return `${base}/room/${code}?role=${role}&build=${encodeURIComponent(BUILD)}`;
}

/**
 * 連上中繼、等它說「兩邊都到了」。三種結果：開了（成功）、被關掉（照中繼給的原因失敗）、等太久（失敗）。
 * 中繼拒絕的時候是「先接受、再帶原因關掉」，所以原因在 `close` 事件的 `reason` 裡；
 * 連中繼都連不上（伺服器沒開、網路不通）的話 `reason` 是空的，換成講人話的那句。
 */
function untilRelayOpen(ws: WebSocket, waitMs: number, slowMsg: string): Promise<{ code: number }> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (f: () => void): void => { if (!done) { done = true; clearTimeout(timer); f(); } };
    ws.addEventListener('message', (e) => {
      let v: unknown;
      try { v = JSON.parse(String((e as MessageEvent).data)); } catch { return; }
      if (isCtl(v) && v.s === 'open') finish(() => resolve({ code: 0 }));
    });
    ws.addEventListener('close', (e) => {
      const ev = e as CloseEvent;
      finish(() => reject(Object.assign(new Error(ev.reason || '連不上中繼伺服器（網路不通，或伺服器沒開）。檢查網路之後再試一次'), { code: ev.code })));
    });
    ws.addEventListener('error', () => { /* 接著一定會來 close，原因在那裡 */ });
    const timer = setTimeout(() => finish(() => { reject(new Error(slowMsg)); try { ws.close(); } catch { /* 已經關了 */ } }), waitMs);
  });
}

function wrap(ws: WebSocket): Transport {
  let onMsg: ((m: NetMessage) => void) | null = null;
  let onClose: ((w: string) => void) | null = null;
  let closed = false;
  const die = (why: string): void => { if (!closed) { closed = true; onClose?.(why); try { ws.close(); } catch { /* 已經關了 */ } } };
  ws.addEventListener('message', (e) => {
    let v: unknown;
    try { v = JSON.parse(String((e as MessageEvent).data)); } catch { die('收到看不懂的訊息，可能兩邊不是同一版'); return; }
    if (isCtl(v)) { if (v.s === 'closed') die('對方離開了'); return; }   // 中繼的話不交給遊戲
    onMsg?.(v as NetMessage);
  });
  ws.addEventListener('close', (e) => { die((e as CloseEvent).reason || '連線結束了'); });
  return {
    send: (m) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); },
    onMessage: (fn) => { onMsg = fn; },
    onClose: (fn) => { onClose = fn; },
    close: () => { die('自己關掉了'); },
  };
}

/** 開房：拿到房號 → 對方輸入之後 `ready` 才有結果 */
export async function hostRoom(opts: { ws?: WsFactory; rng?: () => number } = {}): Promise<{ code: string; ready: Promise<Transport> }> {
  const mk = opts.ws ?? realWs;
  let lastErr: unknown = null;
  for (let i = 0; i < CODE_TRIES; i++) {
    const code = makeCode(opts.rng);
    const ws = mk(wsUrl(code, 'host'));
    const ready = untilRelayOpen(ws, HOST_WAIT_MS, '等了十分鐘對方都沒加入。回標題重新開房一次');
    // 房號撞到正在用的：中繼會馬上帶 4409 關掉。等一下下看有沒有被拒絕，沒有就是房開好了
    const taken = await Promise.race([
      ready.then(() => false, (e: unknown) => (e as { code?: number }).code === 4409 ? true : Promise.reject(e)),
      new Promise<false>((r) => setTimeout(() => r(false), 1500)),
    ]).catch((e: unknown) => { lastErr = e; return false; });
    if (lastErr) throw lastErr;
    if (taken === true) continue;
    return { code, ready: ready.then(() => wrap(ws)) };
  }
  throw new Error('連續抽到別人正在用的房號，再開一次');
}

/** 加入：輸入房號 → 連上就有 Transport */
export async function joinRoom(code: string, opts: { ws?: WsFactory } = {}): Promise<Transport> {
  const clean = code.replace(/\D/g, '');
  if (clean.length !== 6) throw new Error('房號是六位數字，請再看一次對方給的房號');
  const ws = (opts.ws ?? realWs)(wsUrl(clean, 'join'));
  await untilRelayOpen(ws, JOIN_WAIT_MS, '等了 15 秒中繼都沒回話。檢查網路之後再試一次');
  return wrap(ws);
}
