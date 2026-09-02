import { potions } from '../content/potions';
import { relics } from '../content/relics';
import { artUrl } from './assets';
import { el } from './dom';
import { overlayRoot } from './overlay';

/**
 * 秘寶與忍具圖鑑（2026-09-02 使用者：「卡牌圖鑑之外也該做個秘寶、忍具圖鑑，放封面就好」）。
 * 疊層跟卡牌圖鑑同一套（`.compendium`），只是內容換成一列一件：圖、名字、價錢、效果。
 * 圖還沒生好的用名字前兩個字當牌子。
 */
const RELIC_POOLS = ['起始', '常見', '大魔物', '塔主'] as const;
const POOL_NOTE: Record<string, string> = {
  起始: '開局就戴著',
  常見: '紙箱、罐頭鋪、事件',
  大魔物: '打倒大魔物',
  塔主: '過關三選一',
};

function icon(art: string, name: string): HTMLElement {
  const url = artUrl('icons', art);
  return url.startsWith('data:') ? el('span', { class: 'item-icon-name' }, name.slice(0, 2)) : el('img', { class: 'item-icon', src: url, alt: name });
}

export function showItemCompendium(): void {
  const layer = overlayRoot();
  if (!layer || layer.querySelector('.compendium')) return;
  const body = el('div', { class: 'comp-body' });
  for (const pool of RELIC_POOLS) {
    const group = relics.filter((r) => r.pool === pool);
    if (!group.length) continue;
    body.append(el('div', { class: 'comp-section' },
      el('span', { class: 'comp-pool' }, `秘寶・${pool}（${group.length}）`),
      el('span', { class: 'comp-note' }, POOL_NOTE[pool] ?? '')));
    const list = el('div', { class: 'item-grid' });
    for (const r of [...group].sort((a, b) => (a.price ?? 150) - (b.price ?? 150))) {
      list.append(el('div', { class: 'item-row' }, icon(r.art, r.name),
        el('div', { class: 'item-text' }, el('b', {}, r.name), el('em', {}, r.text)),
        el('span', { class: 'item-price' }, `${r.price ?? 150} 條`)));
    }
    body.append(list);
  }
  body.append(el('div', { class: 'comp-section' },
    el('span', { class: 'comp-pool' }, `忍具（${potions.length}）`),
    el('span', { class: 'comp-note' }, '戰鬥獎勵、事件、罐頭鋪；戰鬥中點一下就用，一場最多帶三支（忍具袋、九命鈴可加）')));
  const plist = el('div', { class: 'item-grid' });
  for (const p of potions) {
    plist.append(el('div', { class: 'item-row' }, icon(p.art, p.name),
      el('div', { class: 'item-text' }, el('b', {}, p.name), el('em', {}, p.text)),
      el('span', { class: 'item-price' }, `${p.price} 條`)));
  }
  body.append(plist);

  const close = el('button', { class: 'btn small comp-close' }, '✕ 關閉');
  const box = el('div', { class: 'compendium items' },
    el('div', { class: 'comp-head' }, el('span', { class: 'comp-title' }, '秘寶與忍具圖鑑'), close),
    body);
  const backdrop = el('div', { class: 'comp-backdrop' });
  const dismiss = (): void => { box.remove(); backdrop.remove(); window.removeEventListener('keydown', onKey); };
  const onKey = (ev: KeyboardEvent): void => { if (ev.key === 'Escape') dismiss(); };
  close.addEventListener('click', dismiss);
  backdrop.addEventListener('click', dismiss);
  window.addEventListener('keydown', onKey);
  layer.append(backdrop, box);
}
