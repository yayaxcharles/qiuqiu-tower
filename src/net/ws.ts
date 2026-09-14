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
 * 流程：開房的人連上、中繼回一句 `hosting`（房登記好了）才把六位數房號秀出來 → 用 LINE 講給對方 → 對方輸入 →
 * 中繼把兩邊接起來，各送一句 `open`。版本檢查在中繼做（連進去時帶打包編號），對不上加入的那一位會被帶原因關掉。
 * 關閉代碼跟 `worker/src/index.ts` 的 `CLOSE` 對照：4409 撞號（要重抽）、4404 沒人開房、4403 滿了、4400 版本、4000 對方離開、4001 對方沒回應。
 *
 * 跟 `rtc.ts` 一樣刻意寫得薄：鎖步、對帳、號碼都在 `session.ts`，這裡只負責把字串送過去。
 */

declare const __RELAY_URL__: string;
/** 正式站的中繼網址（部署 `worker/` 之後 wrangler 印出來的那一個）。本機對著 `wrangler dev` 測時用 `RELAY_URL=` 環境變數蓋掉 */
export const DEFAULT_RELAY = 'https://qiuqiu-relay.qiuqiu-tower.workers.dev';
export function relayUrl(): string {
  const env = typeof __RELAY_URL__ === 'string' ? __RELAY_URL__ : '';
  return (env || DEFAULT_RELAY).replace(/\/+$/, '');
}

/** 中繼自己講的話（不是遊戲訊息） */
type RelayState = 'hosting' | 'open' | 'closed';
interface RelayCtl { m: 'relay'; s: RelayState }
const isCtl = (x: unknown): x is RelayCtl => !!x && typeof x === 'object' && (x as { m?: unknown }).m === 'relay';
/** 撞號的關閉代碼（`worker/src/index.ts` 的 `CLOSE.taken`）：開房的人換一個房號再試 */
const CODE_TAKEN = 4409;

/** 六位數房號。用數字不用字母：口頭講、LINE 打都不會搞混 0／O、1／l */
export function makeCode(rng: () => number = Math.random): string {
  return String(Math.floor(rng() * 1_000_000)).padStart(6, '0');
}

/** 測試用：換掉真的 WebSocket */
export type WsFactory = (url: string) => WebSocket;
const realWs: WsFactory = (url) => new WebSocket(url);

/** 開房的人等對方輸入房號，這段是人手的時間，只給一個「久到不合理」的上限 */
export const HOST_WAIT_MS = 10 * 60_000;
/** 連中繼、等它回話：一兩秒內會回，15 秒沒回就是網路不通（行動網路慢也夠） */
export const JOIN_WAIT_MS = 15_000;
/** 心跳：中繼超過 150 秒沒收到就當這邊死了（背景分頁的計時器會被拉長到約一分鐘一次，還在線內） */
export const PING_MS = 25_000;
/** 房號撞到別人正在用的（4409）就換一個再試，最多幾次 */
const CODE_TRIES = 3;

function wsUrl(code: string, role: 'host' | 'join'): string {
  const base = relayUrl().replace(/^http/, 'ws');
  return `${base}/room/${code}?role=${role}&build=${encodeURIComponent(BUILD)}`;
}

/**
 * 等中繼講某一句話。三種結果：講了（成功）、連線被關掉（照中繼給的原因失敗）、等太久（失敗）。
 * 中繼拒絕的時候是「先接受、再帶原因關掉」，所以原因在 `close` 事件的 `reason` 裡；
 * 連中繼都連不上（伺服器沒開、網路不通）的話 `reason` 是空的，換成講人話的那句。
 */
function untilRelay(ws: WebSocket, want: RelayState, waitMs: number, slowMsg: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (f: () => void): void => { if (!done) { done = true; clearTimeout(timer); f(); } };
    ws.addEventListener('message', (e) => {
      let v: unknown;
      try { v = JSON.parse(String((e as MessageEvent).data)); } catch { return; }
      if (isCtl(v) && v.s === want) finish(resolve);
    });
    ws.addEventListener('close', (e) => {
      const ev = e as CloseEvent;
      finish(() => reject(Object.assign(new Error(ev.reason || '連不上中繼伺服器（網路不通，或伺服器沒開）。檢查網路之後再試一次'), { code: ev.code })));
    });
    const timer = setTimeout(() => finish(() => { reject(new Error(slowMsg)); try { ws.close(); } catch { /* 已經關了 */ } }), waitMs);
  });
}

function wrap(ws: WebSocket): Transport {
  let onMsg: ((m: NetMessage) => void) | null = null;
  let onClose: ((w: string) => void) | null = null;
  // 監聽器掛上之前就到的遊戲訊息先收著（跟 `session.ts` 的 pendingStart 同一招）：不然只要呼叫端多一個 await，開局訊息就無聲消失
  const pending: NetMessage[] = [];
  let closed = false;
  const ping = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send('ping'); }, PING_MS);
  const die = (why: string): void => { if (!closed) { closed = true; clearInterval(ping); onClose?.(why); try { ws.close(); } catch { /* 已經關了 */ } } };
  ws.addEventListener('message', (e) => {
    const raw = String((e as MessageEvent).data);
    if (raw === 'pong') return;   // 心跳的回聲
    let v: unknown;
    try { v = JSON.parse(raw); } catch { die('收到看不懂的訊息，可能兩邊不是同一版'); return; }
    if (isCtl(v)) { if (v.s === 'closed') die('對方離開了'); return; }   // 中繼的話不交給遊戲
    if (onMsg) onMsg(v as NetMessage); else pending.push(v as NetMessage);
  });
  ws.addEventListener('close', (e) => { die((e as CloseEvent).reason || '連線結束了'); });
  return {
    send: (m) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); },
    onMessage: (fn) => { onMsg = fn; for (const m of pending.splice(0)) fn(m); },
    onClose: (fn) => { onClose = fn; },
    close: () => { die('自己關掉了'); },
  };
}

export interface Hosting { code: string; ready: Promise<Transport>; cancel: () => void }
export interface Joining { ready: Promise<Transport>; cancel: () => void }

/**
 * 開房：連上、等中繼回 `hosting`（房登記好了）才回傳房號；對方輸入之後 `ready` 才有結果。
 * 撞號（4409）就換一個房號再連，最多三次。`cancel` 給大廳「回標題」用：不關的話那條連線會一直等，十分鐘後還會回頭改畫面。
 */
export async function hostRoom(opts: { ws?: WsFactory; rng?: () => number } = {}): Promise<Hosting> {
  const mk = opts.ws ?? realWs;
  for (let i = 0; i < CODE_TRIES; i++) {
    const code = makeCode(opts.rng);
    const ws = mk(wsUrl(code, 'host'));
    const hosting = untilRelay(ws, 'hosting', JOIN_WAIT_MS, '等了 15 秒中繼都沒回話。檢查網路之後再試一次');
    const opened = untilRelay(ws, 'open', HOST_WAIT_MS, '等了十分鐘對方都沒加入。回標題重新開房一次');
    opened.catch(() => { /* 撞號重抽時這條也會被拒絕；有人接 `ready` 才需要看 */ });
    try {
      await hosting;
    } catch (e) {
      if ((e as { code?: number }).code === CODE_TAKEN) continue;
      throw e;
    }
    return { code, ready: opened.then(() => wrap(ws)), cancel: () => { try { ws.close(); } catch { /* 已經關了 */ } } };
  }
  throw new Error('連續抽到別人正在用的房號，再開一次');
}

/** 加入：輸入房號 → `ready` 連上就有 Transport；`cancel` 給大廳「回標題」用 */
export function joinRoom(code: string, opts: { ws?: WsFactory } = {}): Joining {
  const clean = code.replace(/\D/g, '');
  if (clean.length !== 6) return { ready: Promise.reject(new Error('房號是六位數字，請再看一次對方給的房號')), cancel: () => {} };
  const ws = (opts.ws ?? realWs)(wsUrl(clean, 'join'));
  const ready = untilRelay(ws, 'open', JOIN_WAIT_MS, '等了 15 秒中繼都沒回話。檢查網路之後再試一次').then(() => wrap(ws));
  return { ready, cancel: () => { try { ws.close(); } catch { /* 已經關了 */ } } };
}
