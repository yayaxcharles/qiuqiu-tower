import { cardStats } from '../engine/deck';
import type { CardDef, CardInstance } from '../engine/types';
import { artUrl } from './assets';
import { describeCard, upgradedChangedChars } from './cardtext';
import { el } from './dom';
import { markupKeywords } from './tooltip';

export interface CardViewOpts {
  /** 只有傳牌表定義（沒有 uid）時才看這個；傳牌張實例的話以實例上的升級狀態為準 */
  upgraded?: boolean;
  onClick?: () => void;
  small?: boolean;
  selected?: boolean;
  disabled?: boolean;
  /** 分身術這場已經打過幾次（`cs.cardPlays`）：牌面要印這次實際打幾點 */
  plays?: number;
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
  // 連線牌用**白色**底（使用者 2026-09-11 指定）。跟牌型分開是刻意的：
  // 這批裡忍術與絕學都有，型別該顯示的還是顯示，只是紙的顏色換一種——
  // 玩家一眼就分得出「這張要有同伴才有用」
  if (def.coop) cls.push('coop');
  if (opts.small) cls.push('small');
  if (opts.selected) cls.push('selected');
  if (opts.disabled) cls.push('disabled');
  if (opts.onClick && !opts.disabled) cls.push('clickable');

  // 升級動到哪裡就標哪裡（使用者 2026-09-07：「才知道升級跟沒升級牌的差異」）。
  // 費用比的是牌表上的升級費用，不是畫面上顯示的 cost：顯示值對牌張實例走 cardStats，
  // 語意是「這張牌現在幾費」，未來若把秘寶減費（毛線球、破卷軸，目前在 combat.canPlay 才扣）
  // 併進去，拿它來比就會把「戴了減費秘寶」誤標成「升級變便宜」。
  const plays = opts.plays ?? 0;
  const changed = upgraded ? upgradedChangedChars(def, plays) : undefined;
  const costDown = upgraded && (def.upgrade.cost ?? def.cost) < def.cost;

  const node = el('div', { class: cls.join(' ') },
    el('div', { class: costDown ? 'card-cost cost-down' : 'card-cost' }, String(cost)),
    el('img', { class: 'card-art', src: artUrl('cards', def.art), alt: def.name, draggable: 'false' }),
    el('div', { class: 'card-name' }, def.name + (upgraded ? '＋' : '')),
    el('div', { class: 'card-text' }, markupKeywords(describeCard(def, upgraded, plays), changed)),
    el('div', { class: 'card-type' }, def.type));

  if (uid !== null) node.dataset['uid'] = String(uid);
  const onClick = opts.onClick;
  if (onClick) node.addEventListener('click', () => { if (!opts.disabled) onClick(); });
  fitCardText(node);
  return node;
}

/**
 * 規則文字太長就自動縮一級（2026-09-06 字體放大後的保險）：牌面高度固定，牌池最長的牌（42 字）剛好四行；
 * 之後補牌若寫到五行，這裡把字從 15／13 一路每次降 0.5，最低 10，直到不溢出。
 * 要量高度得先掛進畫面，所以排到下一個畫格；那時還沒掛上（例如只拿來量尺寸）或不在瀏覽器裡（測試）就跳過。
 */
function fitCardText(node: HTMLElement): void {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return;
  window.requestAnimationFrame(() => {
    const t = node.querySelector<HTMLElement>('.card-text');
    if (!t || !node.isConnected) return;
    let size = parseFloat(getComputedStyle(t).fontSize);
    for (let i = 0; i < 10 && t.scrollHeight > t.clientHeight && size > 10; i++) {
      size -= 0.5;
      t.style.fontSize = `${size}px`;
    }
  });
}
