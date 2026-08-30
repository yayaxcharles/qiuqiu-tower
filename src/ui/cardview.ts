import { cardStats } from '../engine/deck';
import type { CardDef, CardInstance } from '../engine/types';
import { artUrl } from './assets';
import { describeCard } from './cardtext';
import { el } from './dom';
import { markupKeywords } from './tooltip';

export interface CardViewOpts {
  /** 只有傳牌表定義（沒有 uid）時才看這個；傳牌張實例的話以實例上的升級狀態為準 */
  upgraded?: boolean;
  onClick?: () => void;
  small?: boolean;
  selected?: boolean;
  disabled?: boolean;
}

/** 畫一張牌：費用、圖、名字、規則文字（名詞會自動變成可提示的）、牌型 */
export function cardNode(card: CardInstance | CardDef, opts: CardViewOpts = {}): HTMLElement {
  let def: CardDef;
  let upgraded: boolean;
  let cost: number;
  let uid: number | null = null;
  if ('uid' in card) {
    // 升級後的費用問引擎的 cardStats，牌面不要自己再算一套，免得跟戰鬥算出來的不一樣
    const stats = cardStats(card);
    def = stats.def;
    upgraded = card.upgraded;
    cost = stats.cost;
    uid = card.uid;
  } else {
    def = card;
    upgraded = opts.upgraded ?? false;
    cost = upgraded ? (def.upgrade.cost ?? def.cost) : def.cost;
  }

  // 牌型決定底紋顏色、稀有度決定邊框（見 components.css）——兩件事各自一個類別
  const cls = ['card', `type-${def.type}`, `rarity-${def.rarity}`];
  if (opts.small) cls.push('small');
  if (opts.selected) cls.push('selected');
  if (opts.disabled) cls.push('disabled');
  if (opts.onClick && !opts.disabled) cls.push('clickable');

  const node = el('div', { class: cls.join(' ') },
    el('div', { class: 'card-cost' }, String(cost)),
    el('img', { class: 'card-art', src: artUrl('cards', def.art), alt: def.name, draggable: 'false' }),
    el('div', { class: 'card-name' }, def.name + (upgraded ? '＋' : '')),
    el('div', { class: 'card-text' }, markupKeywords(describeCard(def, upgraded))),
    el('div', { class: 'card-type' }, def.type));

  if (uid !== null) node.dataset['uid'] = String(uid);
  const onClick = opts.onClick;
  if (onClick) node.addEventListener('click', () => { if (!opts.disabled) onClick(); });
  return node;
}
