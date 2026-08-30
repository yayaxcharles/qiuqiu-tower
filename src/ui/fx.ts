import { artUrl } from './assets';

/**
 * 打擊特效：在角色身上疊一張光效圖，蹦一下就消失。
 *
 * 為什麼需要這個：原本挨打只有「立繪閃紅＋抖一下」，砍中跟被咬中看起來一模一樣，
 * 而且輕輕刮一下跟被打掉半條命也長得一樣。這裡讓每一種結果各有一團自己的光。
 *
 * 掛在角色節點裡（跟浮動數字同一個作法），不掛疊層：
 * 特效要跟著角色的位置走，角色一倒下特效也該跟著消失。
 */

/** 有哪幾種特效，各自畫多大、轉幾度。`spin` 是隨機旋轉範圍，讓連續打不會每下都同一個角度。 */
const FX = {
  hit: { w: 150, spin: 180, y: 0.42 },
  slash: { w: 230, spin: 22, y: 0.42 },
  block: { w: 170, spin: 0, y: 0.46 },
  heal: { w: 140, spin: 0, y: 0.5 },
  buff: { w: 100, spin: 0, y: 0.3 },
  debuff: { w: 100, spin: 0, y: 0.3 },
  poison: { w: 130, spin: 0, y: 0.45 },
  smoke: { w: 180, spin: 0, y: 0.5 },
} as const;

export type FxKind = keyof typeof FX;

/**
 * 在 `host` 上放一團特效。`host` 要是有 position 的節點（`.unit` 就是）。
 *
 * 圖沒生出來時 `artUrl` 會回一個灰剪影，那個東西疊在臉上很難看，
 * 所以查不到就整個不放——特效是加分項，缺了不能變扣分。
 */
export function burst(host: Element | null | undefined, kind: FxKind, delay = 0): void {
  if (!host) return;
  const url = artUrl('icons', `icon/vfx_${kind}`);
  if (url.startsWith('data:')) return;   // 剪影＝這張還沒生，安靜跳過

  const cfg = FX[kind];
  const img = document.createElement('img');
  img.className = 'vfx';
  img.src = url;
  img.alt = '';
  img.style.width = `${cfg.w}px`;
  img.style.top = `${cfg.y * 100}%`;
  if (cfg.spin) img.style.setProperty('--vfx-rot', `${(Math.random() * 2 - 1) * cfg.spin}deg`);
  if (delay) img.style.animationDelay = `${delay}ms`;
  img.addEventListener('animationend', () => img.remove());
  // animationend 收不到的情況（動畫被節流、元素提早被拔走再放回）也要有人收尾
  window.setTimeout(() => img.remove(), 1400 + delay);
  host.append(img);
}
