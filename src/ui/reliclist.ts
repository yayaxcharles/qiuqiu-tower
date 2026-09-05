import { relicById } from '../content/relics';
import type { RunState } from '../engine/types';
import { artUrl } from './assets';
import { el } from './dom';
import { lockScreen, overlayRoot, unlockScreen } from './overlay';
import { hideTooltip } from './tooltip';

/**
 * 本局秘寶清單（使用者 2026-09-06 拍板）：狀態列只畫最近拿到的 8 件，其餘收成一顆「+N」；
 * 點任何一件秘寶圖示或「+N」就開這個視窗，一行一件（圖、名字、說明），最新的排最前面，
 * 不用再一顆一顆滑上去看提示。疊層規矩同 potionswap.ts：貼上去之後才 lockScreen，關掉就 unlock。
 */
export function showRelicList(run: RunState): void {
  const layer = overlayRoot();
  if (!layer) return;
  hideTooltip();
  const overlay = el('div', { class: 'modal-overlay' });
  const onKey = (ev: KeyboardEvent): void => { if (ev.key === 'Escape') close(); };
  const close = (): void => {
    window.removeEventListener('keydown', onKey);
    overlay.remove();
    unlockScreen();
    hideTooltip();
  };
  const ids = [...run.relics].reverse();   // 最新的排最前面，跟狀態列的順序一致
  const list = el('div', { class: 'swap-list relic-list' });
  for (const id of ids) {
    const r = relicById[id];
    if (!r) continue;
    const url = artUrl('icons', r.art);
    list.append(el('div', { class: 'swap-item relic-row' },
      url.startsWith('data:') ? el('b', { class: 'relic-row-name' }, r.name.slice(0, 2)) : el('img', { src: url, alt: r.name }),
      el('div', { class: 'swap-text' }, el('b', {}, r.name), el('em', {}, r.text))));
  }
  overlay.append(el('div', { class: 'modal swap-modal relic-modal' },
    el('h2', { class: 'modal-title' }, `本局秘寶（${ids.length} 件）`),
    ids.length ? list : el('p', { class: 'relic-empty' }, '還沒有秘寶。'),
    el('div', { class: 'modal-foot' }, el('button', { class: 'btn', onclick: close }, '關閉'))));
  overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });
  layer.append(overlay);
  window.addEventListener('keydown', onKey);
  lockScreen();
}
