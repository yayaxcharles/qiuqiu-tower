import { el, stageFrame } from './dom';
import { overlayRoot } from './overlay';

/**
 * 手機橫拿時「按住一張牌放大看」（2026-09-23 polish 第 8 條）。
 *
 * 手機橫拿舞台只縮到 0.50～0.54，手牌上的說明實際只有 7 像素上下；牌面放不下更大的字（見 phone.css 檔頭）。
 * 所以比照手機牌類遊戲的做法：按住 0.32 秒，在旁邊放一張大的給你看，放開就收，**不會出牌**；
 * 輕點照舊（出牌、選目標）。只有手機（觸控＋螢幕短邊小於 600，`html[data-device="phone"]`）才開，
 * 桌機用滑鼠一律不走這條（滑鼠本來就有滑過去抬起來＋名詞提示）。
 */

/** 按住多久才放大（毫秒）：比一般輕點（約 100～150）長一截，又不會久到以為沒反應 */
export const PEEK_HOLD_MS = 320;
/** 手指移動超過這麼多（螢幕像素）就當成不是按住 */
export const PEEK_MOVE_PX = 10;
/** 放大後說明文字在螢幕上至少幾像素 */
export const PEEK_TEXT_PX = 12;

type Box = Readonly<{ x: number; y: number; w: number; h: number }>;

/**
 * 放大的那張擺哪、放多大（舞台座標 1280×720）。
 * `card`＝原本那張牌（左上角＋未旋轉的寬高），`stageScale`＝舞台縮放（螢幕像素 ÷ 舞台像素），`textPx`＝牌上說明的字級（舞台像素）。
 * 放大倍數照「說明在螢幕上 12 像素」算、夾在 1.4～2.2；擺在牌的另一側（手指按在牌上，不能擋到放大的那張），上下置中、不出舞台。
 */
export function peekLayout(card: Box, stageScale: number, textPx: number): { left: number; top: number; scale: number } {
  const k = stageScale > 0 ? stageScale : 1;
  const scale = Math.min(2.2, Math.max(1.4, PEEK_TEXT_PX / (Math.max(1, textPx) * k)));
  const w = card.w * scale;
  const h = card.h * scale;
  const cx = card.x + card.w / 2;
  const gap = 24;
  const left = cx < 640
    ? Math.min(1280 - w - 8, card.x + card.w + gap)
    : Math.max(8, card.x - gap - w);
  const top = Math.max(8, Math.min(720 - h - 8, (720 - h) / 2));
  return { left, top, scale };
}

/** 這一下要不要放大：按住夠久、手沒怎麼動、而且是手機的手指 */
export function shouldPeek(heldMs: number, movedPx: number, pointerType: string, device: string | undefined): boolean {
  return pointerType !== 'mouse' && device === 'phone' && heldMs >= PEEK_HOLD_MS && movedPx <= PEEK_MOVE_PX;
}

function phone(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset['device'] === 'phone';
}

/** 把原本那張複製一份、放大擺好。複製品沒有事件（cloneNode 不帶監聽），也不吃手指 */
function showPeek(node: HTMLElement): HTMLElement | null {
  const layer = overlayRoot();
  const stage = layer?.closest<HTMLElement>('#stage') ?? layer?.parentElement;
  if (!layer || !stage || !node.isConnected) return null;
  const f = stageFrame(stage);
  const r = node.getBoundingClientRect();
  // 牌在扇形裡是轉過的：外框比牌大，位置用外框的中心、大小用牌本身
  const w = node.offsetWidth;
  const h = node.offsetHeight;
  const cx = (r.left + r.width / 2 - f.left) * f.k;
  const cy = (r.top + r.height / 2 - f.top) * f.k;
  const text = node.querySelector<HTMLElement>('.card-text');
  const textPx = text ? parseFloat(getComputedStyle(text).fontSize) : 13;
  const { left, top, scale } = peekLayout({ x: cx - w / 2, y: cy - h / 2, w, h }, 1 / f.k, textPx);
  const clone = node.cloneNode(true) as HTMLElement;
  clone.removeAttribute('style');
  clone.removeAttribute('data-uid');   // 只是給人看的複製品，別被照 uid 找牌的程式（出牌飛出去、同伴考慮中）當成手上那張
  clone.classList.remove('dealt', 'selected', 'nope', 'dragging', 'no-touch', 'flying');
  clone.style.transform = `scale(${scale.toFixed(3)})`;
  const wrap = el('div', { class: 'card-peek', style: `left:${Math.round(left)}px;top:${Math.round(top)}px;width:${Math.round(w * scale)}px;height:${Math.round(h * scale)}px` }, clone);
  layer.append(wrap);
  return wrap;
}

/** 掛到一張牌上。桌機（滑鼠、或 html 不是 phone）什麼都不做 */
export function attachCardPeek(node: HTMLElement): void {
  let timer = 0;
  let start: { x: number; y: number; t: number; type: string } | null = null;
  let shown: HTMLElement | null = null;
  // 這一次按住的收尾：手指真的離開螢幕才算完（見 lifted）
  let lift: AbortController | null = null;
  // 放大過就不是輕點：手指放開後那一下 click 要攔掉，不然放開就把牌打出去了（攔法同 dragplay.ts）。
  // **放大那一刻就先攔好、手指離開後再等 450 毫秒才撤**，不是收起來才開始算：
  // 按住期間瀏覽器可能先送 pointercancel（網址列伸縮、手指微滑被當成捲動，實機腳本截圖時也會），
  // 若從那時起算，手指按得久一點、放開時早過了時限，那一下 click 照樣把牌打出去（實機腳本三次有一次）
  const disarm = (): void => { node.removeEventListener('click', swallow, true); };
  const swallow = (e: Event): void => { e.stopPropagation(); e.preventDefault(); disarm(); };
  const removePeek = (): void => { shown?.remove(); shown = null; };
  const lifted = (): void => {
    removePeek();
    lift?.abort();
    lift = null;
    window.setTimeout(disarm, 450);
  };
  const cancelHold = (): void => { window.clearTimeout(timer); timer = 0; start = null; };
  node.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'mouse' || !phone()) return;
    start = { x: ev.clientX, y: ev.clientY, t: performance.now(), type: ev.pointerType };
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = 0;
      if (!start || !shouldPeek(performance.now() - start.t, 0, start.type, document.documentElement.dataset['device'])) return;
      shown = showPeek(node);
      if (!shown) return;
      node.addEventListener('click', swallow, true);
      // 手指放開時這張牌可能已經被重畫掉（收不到 pointerup），或這一下已經被瀏覽器作廢：整個視窗一起聽，放大的那張一定收得掉
      lift?.abort();
      lift = new AbortController();
      for (const type of ['pointerup', 'touchend', 'touchcancel'] as const) window.addEventListener(type, lifted, { signal: lift.signal });
    }, PEEK_HOLD_MS);
  });
  node.addEventListener('pointermove', (ev) => {
    if (!start || shown) return;
    if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > PEEK_MOVE_PX) cancelHold();
  });
  node.addEventListener('pointerup', () => { cancelHold(); if (shown) lifted(); });
  // 被瀏覽器作廢：放大的那張先收，攔 click 的留到手指真的離開（lifted）
  node.addEventListener('pointercancel', () => { cancelHold(); removePeek(); });
  // 安卓長按會跳選單：手機上牌不給選單
  node.addEventListener('contextmenu', (ev) => { if (phone()) ev.preventDefault(); });
}
