import { relicById, relicLongText } from '../content/relics';
import { relicCounter } from '../engine/counters';
import type { RunState } from '../engine/types';
import { artUrl } from './assets';
import { el } from './dom';
import { closeWithScreen, lockScreen, overlayRoot, unlockScreen } from './overlay';
import { hideTooltip } from './tooltip';
import { me } from '../engine/runplayer';

/**
 * 本局秘寶清單（使用者 2026-09-06 拍板）：狀態列只畫最近拿到的 8 件，其餘收成一顆「+N」；
 * 點任何一件秘寶圖示或「+N」就開這個視窗，一行一件（圖、名字、說明），最新的排最前面，
 * 不用再一顆一顆滑上去看提示。疊層規矩同 potionswap.ts：貼上去之後才 lockScreen，關掉就 unlock。
 */
export function showRelicList(run: RunState, seat = 0): void {
  const layer = overlayRoot();
  if (!layer) return;
  hideTooltip();
  const overlay = el('div', { class: 'modal-overlay' });
  const onKey = (ev: KeyboardEvent): void => { if (ev.key === 'Escape') close(); };
  let closed = false;
  // 換到別的畫面時一起收掉（連線時同伴一推進，視窗會留在新畫面上，見 `closeWithScreen`）
  const forget = closeWithScreen(() => close());
  const close = (): void => {
    if (closed) return; closed = true;
    forget();
    window.removeEventListener('keydown', onKey);
    overlay.remove();
    unlockScreen();
    hideTooltip();
  };
  const ids = [...me(run, seat).relics].reverse();   // 最新的排最前面，跟狀態列的順序一致
  const list = el('div', { class: 'swap-list relic-list' });
  for (const id of ids) {
    const r = relicById[id];
    if (!r) continue;
    const url = artUrl('icons', r.art);
    // 套組那幾件多一段集到幾件；跨場計數的（木人樁、撲滿）補一句目前數到幾（2026-09-23 第二批。清單在地圖上開，只看得到跨場那兩件）
    const n = relicCounter(id, me(run, seat));
    list.append(el('div', { class: 'swap-item relic-row' },
      url.startsWith('data:') ? el('b', { class: 'relic-row-name' }, r.name.slice(0, 2)) : el('img', { src: url, alt: r.name }),
      // 箱中箱數的是剩幾次、用完寫「用完了」（2026-09-23 第三批）
      el('div', { class: 'swap-text' }, el('b', {}, r.name), el('em', {}, relicLongText(r, me(run, seat).relics)
        + (r.hooks.chestExtra ? (n ? `（還剩 ${n} 次）` : '（用完了）') : n !== null ? `（目前數到 ${n}）` : '')))));
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
