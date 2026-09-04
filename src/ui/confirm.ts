import { cardById } from '../content/cards';
import type { CardInstance } from '../engine/types';
import { cardNode } from './cardview';
import { el } from './dom';
import { lockScreen, overlayRoot, unlockScreen } from './overlay';
import { hideTooltip } from './tooltip';

/**
 * 升級前的確認視窗：把「現在」與「升級後」兩張牌並排放出來，看清楚再決定。
 *
 * 原本是挑完牌就直接升級，玩家完全不知道會變成什麼——牌面上的「升」只有在
 * 升級之後才看得到，等於要先付出代價才知道買到什麼。
 *
 * 疊層的規矩跟挑牌視窗一樣（見 `deckview.ts`）：`lockScreen()` 一定排在疊層貼上去之後，
 * 中間任何一步丟例外都不會變成「畫面鎖住卻沒有東西可以關」。
 */
export function showUpgradeConfirm(card: CardInstance, onDone: (ok: boolean) => void): void {
  const layer = overlayRoot();
  if (!layer) { onDone(false); return; }
  const def = cardById[card.cardId];
  if (!def) { onDone(false); return; }

  // 開之前先關掉還浮著的名詞提示：滑鼠停在某個詞上時疊層蓋上來，mouseleave 不會發生，
  // 提示框就會卡在疊層上面（實測看得到）。
  hideTooltip();
  const overlay = el('div', { class: 'modal-overlay' });
  const dismiss = (ok: boolean): void => {
    overlay.remove();
    unlockScreen();
    hideTooltip();
    onDone(ok);
  };

  const pair = el('div', { class: 'confirm-pair' },
    el('div', { class: 'confirm-side' },
      el('div', { class: 'confirm-label' }, '現在'),
      cardNode({ ...card, upgraded: false })),
    el('div', { class: 'confirm-arrow' }, '→'),
    el('div', { class: 'confirm-side after' },
      el('div', { class: 'confirm-label' }, '磨爪之後'),
      cardNode({ ...card, upgraded: true })));

  overlay.append(el('div', { class: 'modal' },
    el('h2', { class: 'modal-title' }, `要把「${def.name}」磨利嗎？`),
    pair,
    el('div', { class: 'modal-foot' },
      el('button', { class: 'btn', onclick: () => dismiss(false) }, '再看看'),
      el('button', {
        class: 'btn primary',
        // 成交要看得到：升級後那張閃一下金光再收，不要按完畫面就跳走
        onclick: () => {
          pair.querySelector('.confirm-side.after .card')?.classList.add('forged');
          window.setTimeout(() => dismiss(true), 420);
        },
      }, '就磨這張'))));
  // 點旁邊的黑幕＝取消。這一步沒有「非選不可」的情境，一律放行
  overlay.addEventListener('click', (ev) => { if (ev.target === overlay) dismiss(false); });
  layer.append(overlay);
  lockScreen();
}

/**
 * 放生前的確認（使用者 2026-09-04：「放生牌選牌後沒有跳確定」）：把那張牌放大、寫清楚要花多少小魚乾，
 * 按「再看看」回牌堆重挑（呼叫端負責重開挑牌），按「放生」才真的扣錢移牌。
 */
export function showRemoveConfirm(card: CardInstance, cost: number, onDone: (ok: boolean) => void): void {
  const layer = overlayRoot();
  if (!layer) { onDone(false); return; }
  const def = cardById[card.cardId];
  if (!def) { onDone(false); return; }
  hideTooltip();
  const overlay = el('div', { class: 'modal-overlay' });
  const dismiss = (ok: boolean): void => { overlay.remove(); unlockScreen(); hideTooltip(); onDone(ok); };
  const shown = cardNode(card);
  overlay.append(el('div', { class: 'modal' },
    el('h2', { class: 'modal-title' }, `要放生「${def.name}${card.upgraded ? '＋' : ''}」嗎？`),
    el('div', { class: 'confirm-pair' }, el('div', { class: 'confirm-side' }, el('div', { class: 'confirm-label' }, `花 ${cost} 條小魚乾，這張牌從牌組裡永遠拿掉`), shown)),
    el('div', { class: 'modal-foot' },
      el('button', { class: 'btn', onclick: () => dismiss(false) }, '再看看'),
      el('button', { class: 'btn primary', onclick: () => { shown.classList.add('released'); window.setTimeout(() => dismiss(true), 300); } }, '放生'))));
  overlay.addEventListener('click', (ev) => { if (ev.target === overlay) dismiss(false); });
  layer.append(overlay);
  lockScreen();
}
