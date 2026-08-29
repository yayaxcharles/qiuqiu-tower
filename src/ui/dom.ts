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
