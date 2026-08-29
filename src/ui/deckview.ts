import type { CardInstance } from '../engine/types';
import { cardNode } from './cardview';
import { el } from './dom';

export interface DeckPickerOpts {
  title: string;
  cards: CardInstance[];
  /** true＝要玩家挑一張（放生、磨爪、事件用）；false＝只是翻牌組來看 */
  pickable: boolean;
  /** false＝不給關，一定要挑一張 */
  cancellable: boolean;
  filter?: (c: CardInstance) => boolean;
  onPick: (uid: number | null) => void;
}

/** 牌組檢視／挑牌疊層。挑完或關掉都會叫 onPick（沒挑就給 null） */
export function showDeckPicker(opts: DeckPickerOpts): void {
  const stage = document.getElementById('stage');
  if (!stage) { opts.onPick(null); return; }   // 沒有舞台就別把呼叫端的回呼吊在半空
  const overlay = el('div', { class: 'modal-overlay' });
  /**
   * 收掉疊層。順手把還浮著的名詞提示也清掉：滑鼠停在牌面名詞上時整個疊層被移除，
   * mouseleave 不會發生，提示框就變成孤兒黏在畫面上（tooltip.ts 沒有對外的關閉函式）。
   */
  const dismiss = (uid: number | null): void => {
    overlay.remove();
    for (const t of stage.querySelectorAll('.tooltip')) t.remove();
    opts.onPick(uid);
  };
  const grid = el('div', { class: 'deck-grid' });
  for (const c of opts.cards) {
    const ok = opts.filter ? opts.filter(c) : true;
    const pick = opts.pickable && ok;
    grid.append(cardNode(c, {
      small: true,
      disabled: opts.pickable && !ok,
      onClick: pick ? () => dismiss(c.uid) : undefined,
    }));
  }
  if (opts.cards.length === 0) grid.append(el('div', { class: 'deck-empty' }, '（沒有牌）'));
  const close = el('button', { class: 'btn', onclick: () => dismiss(null) }, opts.pickable ? '不選' : '關閉');
  // 點旁邊的黑幕等於按關閉；不給關的時候（一定要挑一張）就不理
  if (opts.cancellable) overlay.addEventListener('click', (ev) => { if (ev.target === overlay) dismiss(null); });
  if (!opts.cancellable) close.setAttribute('disabled', 'disabled');
  overlay.append(el('div', { class: 'modal' },
    el('h2', { class: 'modal-title' }, opts.title),
    grid,
    el('div', { class: 'modal-foot' }, close)));
  stage.append(overlay);
}
