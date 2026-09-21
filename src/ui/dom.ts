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
