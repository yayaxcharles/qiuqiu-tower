/** 建一個節點：屬性用字串，事件用 onclick 這種鍵餵函式 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, attrs: Record<string, string | ((ev: Event) => void)> = {}, ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'function') node.addEventListener(k.replace(/^on/, '').toLowerCase(), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/**
 * 整頁重畫之後，把 `root` 裡所有**無限循環**的 CSS 動畫（火光、浮塵、呼吸、意圖牌、稀有牌流光）接回同一個起點 `t0`
 *（畫面第一次進場的時間，見 `App.loopT0`；畫面稽核 2026-09-24 第 1、3、4 項）。
 *
 * 重建的節點上的動畫一律從頭播，每重畫一次火光就暗一下、浮塵整片瞬移。起點都釘在同一刻，
 * 新節點算出來的進度就跟被換掉的舊節點一模一樣，看起來沒有斷。各元素自己的 `animation-delay` 錯開照樣算。
 * 只動正在跑的 CSS 動畫：暫停的、有限次的（進場動畫）、程式自己開的 `animate()` 都不碰。`except` 那一支（手牌起伏）由呼叫端自己接。
 * 已知限制：**起跑延遲為正**、用延遲等另一段進場動畫播完才開始的循環（目前只有事件結果頁的 `.showcase-icon`，
 * `loot-float .6s` 延遲），被釘到過去的起點會立刻生效、蓋掉前面那段；那一頁不走這支，今天碰不到，
 * 以後要在會呼叫這支的畫面加這種動畫，改用負延遲或先排除（程式碼稽核 2026-09-24 低-3）。
 */
export function keepLoops(root: Element, t0: number, except = ''): void {
  if (typeof root.getAnimations !== 'function') return;
  for (const a of root.getAnimations({ subtree: true })) {
    const name = (a as Animation & { animationName?: string }).animationName;
    if (name && name !== except && a.playState === 'running' && a.effect?.getTiming().iterations === Infinity) a.startTime = t0;
  }
}

/**
 * 螢幕座標換算成 1280×720 舞台座標要用的原點與倍率。
 *
 * 舞台（`#stage`）整個被 `transform: scale()` 縮過，量到的螢幕像素要先扣掉舞台左上角、
 * 再乘上 `k` 才是舞台像素。**要在用的當下現量**，不能開頭量一次存起來：
 * 中途改視窗大小的話倍率就對不上了（稽核 2026-09-10 中-3）。
 */
export function stageFrame(stage: Element): { left: number; top: number; k: number } {
  const r = stage.getBoundingClientRect();
  return { left: r.left, top: r.top, k: r.width > 0 ? 1280 / r.width : 1 };
}
