import { artUrl } from './assets';

/**
 * 打擊特效：在角色身上疊一張光效圖，蹦一下就消失。
 *
 * 為什麼需要這個：原本挨打只有「立繪閃紅＋抖一下」，砍中跟被咬中看起來一模一樣，
 * 而且輕輕刮一下跟被打掉半條命也長得一樣。這裡讓每一種結果各有一團自己的光。
 *
 * 掛在**立繪框**（`.sprite-box`）裡，不掛疊層也不掛整個角色節點：
 * 疊層不會跟著角色走；整個角色節點含名字、血條、狀態牌子，
 * 拿它的高度算百分比，同一個數字在高瘦的貓跟扁扁的黃瓜怪身上會落在完全不同的地方
 * （實測黃瓜怪的斬擊飛到牠頭上兩個身位）。立繪框就是那隻生物本人佔的範圍。
 *
 * 定位從**腳底往上算**（`bottom`）而不是從頭頂往下：立繪本來就是底部對齊的
 * （`object-position: center bottom`），從腳底量才對得準每一種體型。
 */

/**
 * 有哪幾種特效：`w` 是**長邊**畫多大、`spin` 是隨機旋轉範圍（連續打才不會每下同一個角度）、
 * `b` 是中心點離腳底多高（立繪框高度的比例）、`peak` 是最濃的時候多不透明。
 *
 * `peak` 只有盾跟煙需要：那兩張是**大片實心**，不透一點會整個把角色蓋掉，
 * 變成「擋下來了但看不到誰在擋」。其他都是細長或鏤空的形狀，不用留縫。
 */
const FX = {
  hit: { w: 150, spin: 180, b: 0.33 },
  slash: { w: 190, spin: 16, b: 0.30 },
  block: { w: 150, spin: 0, b: 0.30, peak: 0.7 },
  heal: { w: 150, spin: 0, b: 0.38 },
  buff: { w: 100, spin: 0, b: 0.5 },
  debuff: { w: 100, spin: 0, b: 0.5 },
  poison: { w: 130, spin: 0, b: 0.38 },
  smoke: { w: 180, spin: 0, b: 0.18, peak: 0.85 },
  // 2026-09-03 晚：魔物出招的回饋（蓄力、詛咒塞牌、看破）。圖檔在 vfx3.json 生，還沒生好就退回相近的那張（見 fxKey）
  charge: { w: 170, spin: 0, b: 0.42, peak: 0.85 },
  curse: { w: 150, spin: 0, b: 0.5 },
  strip: { w: 170, spin: 0, b: 0.45 },
} as const;
const FALLBACK: Partial<Record<keyof typeof FX, keyof typeof FX>> = { charge: 'buff', curse: 'debuff', strip: 'hit' };
// 這組高度是**看著畫面調的**，不是算出來的：立繪框每個體型一樣高，
// 但裡面那隻長得多高完全不一定——黃瓜怪是扁的，只佔框底部一小塊，
// 一開始抓 0.42 的斬擊整個飛到牠上方的空氣裡。寧可偏低：
// 打在身體下半部看起來像砍到，飄在頭上看起來像沒打中。
// 兩個箭頭本來想放「頭上」（0.78），結果黃瓜怪頭上是一片空氣，橘箭頭還飄到戰鬥紀錄上——
// 「頭」在哪這件事每隻都不一樣，改成一律放身上。

export type FxKind = keyof typeof FX;

/**
 * 特效跟著角色體型縮放。
 *
 * 上面那組尺寸是照「中等體型的魔物」抓的。實際看過才發現：同一道斬擊放在小老鼠身上，
 * 刀光比老鼠本人還大一圈，看起來像旁邊有人揮大刀路過，不像牠被砍到。
 * 倍率照立繪寬度來（小 130、中 180、大 230、球球 270），比例才跟身體對得上。
 */
const SIZE_SCALE: readonly [string, number][] = [
  ['size-small', 0.7], ['size-medium', 1], ['size-large', 1.12], ['player', 1.05],
];
// 球球本來給 1.4，畫面上一看火花整個蓋住他，連挨打閃紅都看不到——
// 特效要讓人看清楚「打中了」，不是把被打的人遮起來。
function hostScale(host: Element): number {
  for (const [cls, k] of SIZE_SCALE) if (host.classList.contains(cls)) return k;
  return 1;
}

/**
 * 在 `unit`（一個 `.unit` 節點）身上放一團特效，實際掛的位置是它裡面的立繪框。
 *
 * 圖沒生出來時 `artUrl` 會回一個灰剪影，那個東西疊在臉上很難看，
 * 所以查不到就整個不放——特效是加分項，缺了不能變扣分。
 */
export function burst(unit: Element | null | undefined, kind: FxKind, delay = 0): void {
  const host = unit?.querySelector('.sprite-box');
  if (!unit || !host) return;
  let url = artUrl('icons', `icon/vfx_${kind}`);
  const fb = FALLBACK[kind];
  if (url.startsWith('data:') && fb) url = artUrl('icons', `icon/vfx_${fb}`);
  if (url.startsWith('data:')) return;   // 剪影＝這張還沒生，安靜跳過

  const cfg = FX[kind];
  const img = document.createElement('img');
  img.className = 'vfx';
  img.src = url;
  img.alt = '';
  // 給的是一個**正方形的框**，圖再照原比例塞進去（樣式那邊 object-fit: contain）。
  // 本來只設寬度，結果治療那張是細長的直條（87x256），寬度設 147 高度就被拉到 432——
  // 星星從畫面頂端一路散到手牌上。用長邊定尺寸，什麼形狀的圖都不會爆框。
  const px = `${Math.round(cfg.w * hostScale(unit))}px`;
  img.style.width = px;
  img.style.height = px;
  img.style.bottom = `${cfg.b * 100}%`;
  if (cfg.spin) img.style.setProperty('--vfx-rot', `${(Math.random() * 2 - 1) * cfg.spin}deg`);
  if ('peak' in cfg) img.style.setProperty('--vfx-peak', String(cfg.peak));
  if (delay) img.style.animationDelay = `${delay}ms`;
  img.addEventListener('animationend', () => img.remove());
  // animationend 收不到的情況（動畫被節流、元素提早被拔走再放回）也要有人收尾
  window.setTimeout(() => img.remove(), 1400 + delay);
  host.append(img);
}
