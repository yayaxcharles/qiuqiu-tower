import { hostRoom, joinRoom } from './rtc';
import type { NetMessage, Transport } from './transport';

/**
 * 連線測試頁的程式（`nettest.html`）。**不含任何遊戲內容**。
 *
 * 為什麼要單獨做這一頁：整個連線版剩下唯一的真風險，是「WebRTC 到底連不連得起來」
 * ——那不是寫得對不對的問題，是兩邊的網路環境允不允許。撞到對稱型 NAT 就需要
 * TURN 中繼（要付費或自架）。這件事**越早知道越好**，不該等畫面做完才發現。
 *
 * 所以這頁刻意跟遊戲完全無關：連上、互丟訊息、看順序有沒有亂、有沒有掉。
 * 連得起來，剩下的就都是工。連不起來，整個計畫要重想。
 */

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const logBox = $('log');

function log(msg: string, cls = ''): void {
  const t = new Date().toLocaleTimeString('zh-TW', { hour12: false });
  const line = cls ? `<span class="${cls}">${msg}</span>` : msg;
  logBox.innerHTML = `${logBox.innerHTML === '還沒開始。' ? '' : logBox.innerHTML}\n[${t}] ${line}`;
  logBox.scrollTop = logBox.scrollHeight;
}

let tx: Transport | null = null;
/** 收到的序號，用來檢查有沒有亂序或掉包 */
const got: number[] = [];

function attach(t: Transport): void {
  tx = t;
  $<HTMLButtonElement>('ping').disabled = false;
  $<HTMLButtonElement>('flood').disabled = false;
  log('連上了！', 'ok');
  t.onMessage((m: NetMessage) => {
    if (m.m === 'sync') {
      const n = m.turn;
      got.push(n);
      if (got.length % 10 === 0 || n === 0) {
        const ordered = got.every((v, i) => i === 0 || v >= (got[i - 1] as number));
        log(`收到第 ${n} 則（累計 ${got.length}）${ordered ? '，順序正確' : '，⚠ 順序亂了'}`,
          ordered ? '' : 'bad');
      }
    } else {
      log(`收到：${JSON.stringify(m)}`);
    }
  });
  t.onClose((why) => {
    log(`連線結束：${why}`, 'bad');
    $<HTMLButtonElement>('ping').disabled = true;
    $<HTMLButtonElement>('flood').disabled = true;
  });
}

function show(err: unknown): void {
  log(err instanceof Error ? err.message : String(err), 'bad');
}

// ---- 主機 ----
let pending: { invite: string; accept: (code: string) => Promise<Transport> } | null = null;

$('host').addEventListener('click', () => {
  log('開房中，正在蒐集網路位置（最多五秒）…');
  $<HTMLButtonElement>('host').disabled = true;
  hostRoom().then((r) => {
    pending = r;
    $<HTMLTextAreaElement>('invite').value = r.invite;
    $<HTMLButtonElement>('accept').disabled = false;
    log(`邀請碼好了，${r.invite.length} 個字。複製整串傳給對方。`, 'ok');
  }).catch((e: unknown) => { show(e); $<HTMLButtonElement>('host').disabled = false; });
});

$('accept').addEventListener('click', () => {
  if (!pending) return;
  log('等對方接上…');
  pending.accept($<HTMLTextAreaElement>('answerIn').value)
    .then(attach)
    .catch(show);
});

// ---- 加入 ----
$('join').addEventListener('click', () => {
  log('讀邀請碼、蒐集自己的網路位置（最多五秒）…');
  joinRoom($<HTMLTextAreaElement>('inviteIn').value).then((r) => {
    $<HTMLTextAreaElement>('answer').value = r.answer;
    log(`回應碼好了，${r.answer.length} 個字。整串傳回去給對方。`, 'ok');
    return r.ready.then(attach);
  }).catch(show);
});

// ---- 連上之後 ----
$('ping').addEventListener('click', () => {
  tx?.send({ m: 'sync', turn: 0, fp: 'hello' });
  log('送出一則');
});

$('flood').addEventListener('click', () => {
  for (let i = 1; i <= 50; i++) tx?.send({ m: 'sync', turn: i, fp: 'x' });
  log('連送了 50 則，看對方那邊收到幾則、順序對不對');
});
