import type { CardInstance } from '../engine/types';
import { cardNode } from './cardview';
import { el } from './dom';
import { overlayRoot } from './overlay';
import { hideTooltip } from './tooltip';

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

export interface DeckPickerLayout {
  /** 通過濾網、真的點得下去的張數 */
  choices: number;
  /** 關閉鈕按不按得動、黑幕點不點得掉 */
  closable: boolean;
  /** 牌格裡要補的那一行說明；null＝不用補 */
  note: string | null;
}

/**
 * 疊層開起來會長什麼樣。抽成純函式是為了把「會不會鎖死」這件事釘在測試裡。
 *
 * 鎖死長這樣：`cancellable: false`，卻**一張都點不下去**——每張牌都是停用的、關閉鈕也是停用的，
 * 玩家只能重整。會發生的情形有兩種：`pickable` 但濾網一張都不合（或牌組是空的）；
 * 以及 `pickable: false` 的純檢視也寫了 `cancellable: false`（那就完全沒有出口）。
 * 所以判準一律是「有沒有東西可以點」：`choices === 0` 就放行關閉，
 * 並且在真的沒得挑的時候補一行字講清楚為什麼（不然按下去毫無反應，看起來像壞掉）。
 * 有牌可挑時「一定要挑一張」的規矩完全不變。
 */
export function deckPickerLayout(
  opts: Pick<DeckPickerOpts, 'cards' | 'pickable' | 'cancellable' | 'filter'>): DeckPickerLayout {
  const filter = opts.filter;
  const choices = opts.pickable ? opts.cards.filter((c) => (filter ? filter(c) : true)).length : 0;
  const nothingToPick = opts.pickable && choices === 0;
  return {
    choices,
    closable: opts.cancellable || choices === 0,
    note: opts.cards.length === 0 ? '（沒有牌）' : nothingToPick ? '（沒有可以挑的牌）' : null,
  };
}

/** 牌組檢視／挑牌疊層。挑完或關掉都會叫 onPick（沒挑就給 null） */
export function showDeckPicker(opts: DeckPickerOpts): void {
  const layer = overlayRoot();
  if (!layer) { opts.onPick(null); return; }   // 沒有舞台就別把呼叫端的回呼吊在半空
  /**
   * 疊層開著的時候，把底下的畫面層整個停用。全螢幕黑幕只擋得住滑鼠，畫面層的按鈕還留在
   * Tab 順序裡，按 Enter 照樣會被觸發：事件的選項會再跑一次效果（劫富濟貧就會再砍一半小魚乾、
   * 再回一次血、再開一個挑牌視窗），罐頭鋪的「離開」會把地圖畫到底下去。`inert` 連鍵盤焦點
   * 與點擊一起擋掉，正好是這裡要的。**四條出路都要還原**：挑一張、不選、點黑幕、沒得挑只能關。
   */
  const screen = layer.parentElement?.querySelector<HTMLElement>('#screen') ?? null;
  screen?.setAttribute('inert', '');
  const overlay = el('div', { class: 'modal-overlay' });
  /**
   * 收掉疊層。還原畫面層要排在 onPick 之前：呼叫端在 onPick 裡就會重畫畫面、擺上新的按鈕，
   * 這時候畫面層還停用著的話整個遊戲就按不動了（`#screen` 清空重畫不會把 inert 帶走）。
   * 也順手關掉還浮著的名詞提示：滑鼠停在牌面名詞上時整個疊層被移除，
   * mouseleave 不會發生，提示框就變成孤兒黏在畫面上。
   */
  const dismiss = (uid: number | null): void => {
    overlay.remove();
    screen?.removeAttribute('inert');
    hideTooltip();
    opts.onPick(uid);
  };
  const layout = deckPickerLayout(opts);
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
  if (layout.note) grid.append(el('div', { class: 'deck-empty' }, layout.note));
  const close = el('button', { class: 'btn', onclick: () => dismiss(null) },
    opts.pickable && layout.choices > 0 ? '不選' : '關閉');
  // 點旁邊的黑幕等於按關閉；一定要挑一張的時候就不理（但沒得挑就得放行，見 deckPickerLayout）
  if (layout.closable) overlay.addEventListener('click', (ev) => { if (ev.target === overlay) dismiss(null); });
  if (!layout.closable) close.setAttribute('disabled', 'disabled');
  overlay.append(el('div', { class: 'modal' },
    el('h2', { class: 'modal-title' }, opts.title),
    grid,
    el('div', { class: 'modal-foot' }, close)));
  layer.append(overlay);
}
