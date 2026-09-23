import { BUILD } from './code';
import type { LinkStatus, NetMessage, Transport } from './transport';

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
 * 關閉代碼跟 `worker/src/index.ts` 的 `CLOSE` 對照：4409 撞號（要重抽）、4404 沒人開房、4403 滿了、4400 版本、
 * 4000 對方離開、4001 太久沒回應（可以接回）、4410 房間已經關了（接不回去）、4429 訊息太多。
 *
 * **中途斷線接回**（使用者 2026-09-15）：線路斷了（1006 那種，不是被拒絕）就自動用同一個房號、同一個身分接回，
 * 最多試 `GRACE_MS`。接回要**一則不多、一則不少**（鎖步對重複與漏掉都很脆弱），做法是兩邊都數：
 *   - 我數「收到對方幾則」（`recv`），接回時告訴中繼 `got=recv`，它把我漏掉的補給我、再說 `open`；
 *   - 中繼數「收到我幾則」，`open` 裡附上，我把它沒收到的那幾則從 `history` 補送回去。
 * 斷線期間送的訊息也只是進 `history` 排隊，接回一起送（補送完才算接回，期間送的照樣排在後面，順序不亂）。
 * 遊戲那層（`session.ts`）完全不用知道斷過線，只透過 `onStatus` 收到 away／back（自己）、peerAway／peerBack（對方）
 * 去畫橫幅、暫停操作。關分頁、重新整理會先跟中繼說一句 `bye`（`pagehide`），對方立刻知道、不用等。
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

/** 中繼自己講的話（不是遊戲訊息）。`open` 在接回時附 `got`＝它收到我幾則；`closed` 附 `why`＝為什麼結束 */
type RelayState = 'hosting' | 'open' | 'closed' | 'away' | 'back';
interface RelayCtl { m: 'relay'; s: RelayState; got?: number; why?: string }
const isCtl = (x: unknown): x is RelayCtl => !!x && typeof x === 'object' && (x as { m?: unknown }).m === 'relay';
/** 撞號的關閉代碼（`worker/src/index.ts` 的 `CLOSE.taken`）：開房的人換一個房號再試 */
const CODE_TAKEN = 4409;
/** 「我真的走了」（跟 `worker/src/index.ts` 的 `BYE` 一字不差）：對方立刻收到 closed，不用等 */
export const BYE = '{"m":"relay","s":"bye"}';
/**
 * 這些關閉代碼是「線路斷了」不是「被拒絕」，要接回：1006 沒有關閉訊框（網路斷）、1005 沒帶代碼（邊緣節點或代理關的）、
 * 1001／1011～1013 伺服器那邊重啟或出錯、4001 被中繼當殭屍踢掉（我的 ping 沒送到，多半也是網路）。
 * 其餘（4000 對方走了、4410 房間關了、4400 版本…）不再試。中繼自己關的一律帶代碼，所以 1005 不會是它。
 */
const RESUMABLE = new Set([1001, 1005, 1006, 1011, 1012, 1013, 4001]);

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
/** 心跳：中繼超過 90 秒沒收到就當這邊斷了（背景分頁的計時器會被拉長到約一分鐘一次，漏一次還在線內） */
export const PING_MS = 25_000;
/**
 * **自己斷線要自己看得出來**（2026-09-22 連線盤點 問題 2，使用者裁定只改網頁端、不動中繼）。
 *
 * 原本只靠瀏覽器的「連線關閉」事件：中繼收到關閉時不回關閉訊框，瀏覽器要等到逾時（實測 10～16 秒、代碼 1006）
 * 才宣告關閉，這段時間斷線的那一方手牌全灰、什麼提示都沒有；網路真的斷掉（手機換基地台）甚至可能更久。
 * 現在頁面在前景時每秒問中繼一次 `ping`（中繼的自動回應回 `pong`，不吵醒物件、不算進每秒訊息上限），
 * 超過 `STALL_MS` 什麼都沒收到（連 pong 都沒有）就先跟畫面說 `away`，收到任何東西就說 `back`。
 * 只是提早講，**不自己砍線重連**：真的斷了照舊等關閉事件走 `reconnect`（一則不多一則不少那一套不動）。
 *
 * 不誤報的三個條件：分頁在背景不量（瀏覽器把計時器拉長到一分鐘一次，量出來一定「很久沒收到」）；
 * 兩次檢查之間隔太久（主執行緒卡住、剛切回前景）那一段不算；正常延遲有三秒多的餘裕（每秒問一次，回音通常零點幾秒就到）。
 */
export const PROBE_MS = 1000;
export const STALL_MS = 3500;
/** 分頁在不在前景（沒有 document 的環境＝測試或背景工作，一律當不在，不量） */
const pageVisible = (): boolean => typeof document !== 'undefined' && document.visibilityState === 'visible';
/** 斷線之後最多花多久接回（跟中繼的 `GRACE_MS` 一樣）；超過就當這一局散了 */
export const GRACE_MS = 120_000;
/** 自己送過的最近幾則留著（接回時補送中繼沒收到的那幾則）；斷線期間的操作也在這裡排隊 */
export const HISTORY = 256;
/** 重連的間隔：馬上、1 秒、2 秒、4 秒、之後每 8 秒 */
const RETRY_MS = [0, 1000, 2000, 4000, 8000];
/** 補送給中繼的速度：每秒超過 25 則會被踢，一次送 20 則、隔一秒再送 */
const RESEND_BATCH = 20;
/** 房號撞到別人正在用的（4409）就換一個再試，最多幾次 */
const CODE_TRIES = 3;

function wsUrl(code: string, role: 'host' | 'join', resumeGot?: number): string {
  const base = relayUrl().replace(/^http/, 'ws');
  return `${base}/room/${code}?role=${role}&build=${encodeURIComponent(BUILD)}${resumeGot === undefined ? '' : `&resume=1&got=${resumeGot}`}`;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => { setTimeout(r, ms); });

/**
 * 等中繼講某一句話。三種結果：講了（成功，回那一句）、連線被關掉（照中繼給的原因失敗，帶關閉代碼）、等太久（失敗）。
 * 中繼拒絕的時候是「先接受、再帶原因關掉」，所以原因在 `close` 事件的 `reason` 裡；
 * 連中繼都連不上（伺服器沒開、網路不通）的話 `reason` 是空的，換成講人話的那句。
 */
function untilRelay(ws: WebSocket, want: RelayState, waitMs: number, slowMsg: string): Promise<RelayCtl> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (f: () => void): void => { if (!done) { done = true; clearTimeout(timer); f(); } };
    ws.addEventListener('message', (e) => {
      let v: unknown;
      try { v = JSON.parse(String((e as MessageEvent).data)); } catch { return; }
      if (isCtl(v) && v.s === want) finish(() => resolve(v));
    });
    ws.addEventListener('close', (e) => {
      const ev = e as CloseEvent;
      finish(() => reject(Object.assign(new Error(ev.reason || '連不上中繼伺服器（網路不通，或伺服器沒開）。檢查網路之後再試一次'), { code: ev.code })));
    });
    const timer = setTimeout(() => finish(() => { reject(new Error(slowMsg)); try { ws.close(); } catch { /* 已經關了 */ } }), waitMs);
  });
}

/**
 * 心跳：**連上中繼就開始送**，不是等對方加入才送（審查 高-1）。開房的人等朋友輸入房號那幾分鐘一則都不送的話，
 * 中繼的鬧鐘就把他當殭屍踢掉，而且關掉時沒有原因，畫面只會說「連不上中繼伺服器」。
 * 沒開好之前送不出去沒關係（`readyState` 不是 OPEN 就跳過）；關掉就停。
 */
function keepAlive(ws: WebSocket): () => void {
  const ping = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send('ping'); }, PING_MS);
  const stop = (): void => { clearInterval(ping); };
  ws.addEventListener('close', stop);
  return stop;
}

/** 接回要用的東西：同一個房號、同一個身分、同一個開 socket 的辦法 */
interface Link { code: string; role: 'host' | 'join'; mk: WsFactory }

function wrap(first: WebSocket, link: Link, stopPing0: () => void): Transport {
  let ws = first;
  let stopPing = stopPing0;
  let onMsg: ((m: NetMessage) => void) | null = null;
  let onClose: ((w: string) => void) | null = null;
  let onStatus: ((s: LinkStatus) => void) | null = null;
  // 監聽器掛上之前就到的遊戲訊息先收著（跟 `session.ts` 的 pendingStart 同一招）：不然只要呼叫端多一個 await，開局訊息就無聲消失
  const pending: NetMessage[] = [];
  let closed = false;   // 真的結束了：自己關、對方走了、被拒絕、接不回去
  let away = false;     // 線路斷了、正在接回（含補送中）；期間送的只進 history 排隊
  let gen = 0;          // 第幾次接回：補送到一半又斷了，舊的那一輪不可以再宣布「接回來了」
  let sent = 0;         // 自己送出去第幾則（斷線期間排隊的也算）
  const history: { i: number; s: string }[] = [];
  let recv = 0;         // 收到對方幾則遊戲訊息（中繼的話與 pong 不算）——接回時告訴中繼從第幾則補
  let attempting: WebSocket | null = null;   // 接回途中正在試的那一條（中繼補來的舊訊息會先到它上面）
  let heard = Date.now();   // 現在這條線最後一次收到東西的時間（pong 也算）
  let stalled = false;      // 已經跟畫面說過「斷了」、之後還沒收到任何東西
  let lastTick = Date.now();
  /** 每秒一次：問一聲、看多久沒收到（見 `STALL_MS` 的說明）。背景、斷線接回中、已經結束都不量 */
  const probe = setInterval(() => {
    const now = Date.now();
    const gap = now - lastTick;
    lastTick = now;
    if (closed || away || !pageVisible()) { heard = now; return; }
    if (gap > PROBE_MS * 3) heard = now;   // 上一次檢查到現在隔太久：頁面剛被凍住或剛切回前景，這段不算
    /*
     * 晚了半拍以上：是**自己**卡住（主執行緒被大量載圖、慢手機卡了兩三秒），不是對方沒回（2026-09-23 稽核 低-3）。
     * 卡住期間心跳送不出去、回音也排在這一拍後面才處理，照算就先誤報一次 away、下一則回音再報 back，
     * 戰鬥畫面連重畫兩次、切斷正在演的動作。晚掉的那一段不算沒收到——只扣這一拍的延遲，
     * 計時器準時的時候完全不動，真的斷線照樣在 3.5 秒多一點就報。
     */
    else if (gap > PROBE_MS * 1.5) heard = Math.min(now, heard + gap - PROBE_MS);
    if (ws.readyState === WebSocket.OPEN) ws.send('ping');
    if (!stalled && now - heard > STALL_MS) { stalled = true; onStatus?.('away'); }
  }, PROBE_MS);
  /** 關分頁、重新整理：先跟中繼說一聲，對方立刻知道我走了（審查 中-1）。手機切走不一定觸發，那就走斷線那條路 */
  const onHide = (): void => { if (!closed && !away && ws.readyState === WebSocket.OPEN) { try { ws.send(BYE); } catch { /* 已經關了 */ } } };
  if (typeof window !== 'undefined') window.addEventListener('pagehide', onHide);
  const die = (why: string): void => {
    if (closed) return;
    closed = true;
    stopPing();
    clearInterval(probe);
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', onHide);
    onClose?.(why);
    try { ws.close(); } catch { /* 已經關了 */ }
  };
  /** 收到一則：pong 丟掉、中繼的話（closed／away／back）轉成事件、遊戲訊息數一則交給遊戲 */
  const deliver = (sock: WebSocket, raw: string): void => {
    if (sock !== ws && sock !== attempting) return;   // 早就換掉的那一條（保險；瀏覽器在 close 之後本來就不會再給 message）
    if (sock === ws) {
      heard = Date.now();
      // 前面先講了「斷了」，結果線其實還活著（只是慢）：講回來。斷線接回中（away）由接回那一支自己講 back
      if (stalled) { stalled = false; if (!away) onStatus?.('back'); }
    }
    if (raw === 'pong') return;   // 心跳的回聲
    let v: unknown;
    try { v = JSON.parse(raw); } catch { die('收到看不懂的訊息，可能兩邊不是同一版'); return; }
    if (isCtl(v)) {
      if (v.s === 'closed') die(v.why ?? '對方離開了');
      else if (v.s === 'away') onStatus?.('peerAway');
      else if (v.s === 'back') onStatus?.('peerBack');
      return;   // hosting／open 由等待的那一支接；中繼的話不交給遊戲
    }
    recv += 1;
    if (onMsg) onMsg(v as NetMessage); else pending.push(v as NetMessage);
  };
  const listen = (sock: WebSocket): void => {
    sock.addEventListener('message', (e) => { deliver(sock, String((e as MessageEvent).data)); });
    sock.addEventListener('close', (e) => {
      if (sock !== ws || closed) return;   // 接回途中試的那幾條、或早就結束了：不理
      stopPing();
      const ev = e as CloseEvent;
      if (RESUMABLE.has(ev.code)) void reconnect(); else die(ev.reason || '連線結束了');
    });
  };
  listen(first);

  /**
   * 把中繼沒收到的那幾則補送回去（第 got+1 則起），分批：一次 20 則、隔一秒再送，不然會被當灌爆踢掉。
   * 補送期間新送的也排在 history 後面，這裡會一併送完（審查 低-6：不能讓新訊息插隊）。回 false＝途中又斷了或結束了
   */
  const resend = async (got: number, sock: WebSocket, g: number): Promise<boolean> => {
    let cursor = got;
    for (;;) {
      if (g !== gen || closed) return false;
      const todo = history.filter((h) => h.i > cursor).slice(0, RESEND_BATCH);
      if (!todo.length) return true;
      for (const h of todo) sock.send(h.s);
      cursor = todo[todo.length - 1]!.i;
      if (history.some((h) => h.i > cursor)) await sleep(1000);
    }
  };
  const reconnect = async (): Promise<void> => {
    const g = ++gen;
    away = true;
    onStatus?.('away');
    const t0 = Date.now();
    for (let attempt = 0; !closed && g === gen; attempt++) {
      const wait = RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)] as number;
      if (wait) await sleep(wait);
      if (closed || g !== gen) return;
      if (Date.now() - t0 > GRACE_MS) { die('重新連線失敗：兩分鐘內接不回去。兩邊回標題重新開房'); return; }
      const sock = link.mk(wsUrl(link.code, link.role, recv));
      const ping = keepAlive(sock);
      attempting = sock;
      listen(sock);   // 中繼補來的舊訊息會在 open 之前到，一開始就要有人收
      try {
        const open = await untilRelay(sock, 'open', JOIN_WAIT_MS, '等了 15 秒中繼都沒回話');
        ws = sock; stopPing = ping; attempting = null;
        heard = Date.now(); stalled = false;   // 新的那條從現在開始量
        // 補送完才算接回：期間送的照樣排隊、順序不亂
        if (!(await resend(open.got ?? sent, sock, g))) return;
        away = false;
        onStatus?.('back');
        return;
      } catch (e) {
        ping();
        if (attempting === sock) attempting = null;
        const code = (e as { code?: number }).code;
        // 被中繼拒絕（房間已經關了、版本不同、房號被別人用了…）：不用再試。連不上（1006、逾時）：照間隔再試
        if (code !== undefined && !RESUMABLE.has(code)) { die((e as Error).message); return; }
      }
    }
  };
  return {
    send: (m) => {
      const s = JSON.stringify(m);
      sent += 1;
      history.push({ i: sent, s });
      if (history.length > HISTORY) history.shift();
      if (!away && ws.readyState === WebSocket.OPEN) ws.send(s);
    },
    onMessage: (fn) => { onMsg = fn; for (const m of pending.splice(0)) fn(m); },
    onClose: (fn) => { onClose = fn; },
    onStatus: (fn) => { onStatus = fn; },
    close: () => {
      // 自己走了就先跟中繼講一聲：對方立刻收到 closed，不用等
      if (!closed && ws.readyState === WebSocket.OPEN) { try { ws.send(BYE); } catch { /* 已經關了 */ } }
      die('自己關掉了');
    },
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
    const stopPing = keepAlive(ws);
    const hosting = untilRelay(ws, 'hosting', JOIN_WAIT_MS, '等了 15 秒中繼都沒回話。檢查網路之後再試一次');
    const opened = untilRelay(ws, 'open', HOST_WAIT_MS, '等了十分鐘對方都沒加入。回標題重新開房一次');
    opened.catch(() => { /* 撞號重抽時這條也會被拒絕；有人接 `ready` 才需要看 */ });
    try {
      await hosting;
    } catch (e) {
      if ((e as { code?: number }).code === CODE_TAKEN) continue;
      throw e;
    }
    return { code, ready: opened.then(() => wrap(ws, { code, role: 'host', mk }, stopPing)), cancel: () => { stopPing(); try { ws.close(); } catch { /* 已經關了 */ } } };
  }
  throw new Error('連續抽到別人正在用的房號，再開一次');
}

/** 加入：輸入房號 → `ready` 連上就有 Transport；`cancel` 給大廳「回標題」用 */
export function joinRoom(code: string, opts: { ws?: WsFactory } = {}): Joining {
  const clean = code.replace(/\D/g, '');
  if (clean.length !== 6) return { ready: Promise.reject(new Error('房號是六位數字，請再看一次對方給的房號')), cancel: () => {} };
  const mk = opts.ws ?? realWs;
  const ws = mk(wsUrl(clean, 'join'));
  const stopPing = keepAlive(ws);
  const ready = untilRelay(ws, 'open', JOIN_WAIT_MS, '等了 15 秒中繼都沒回話。檢查網路之後再試一次').then(() => wrap(ws, { code: clean, role: 'join', mk }, stopPing));
  return { ready, cancel: () => { stopPing(); try { ws.close(); } catch { /* 已經關了 */ } } };
}
