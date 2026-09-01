import { cardStats } from '../engine/deck';
import type { CardInstance } from '../engine/types';
import { cardNode } from './cardview';
import { el } from './dom';
import { lockScreen, overlayRoot, unlockScreen } from './overlay';
import { hideTooltip } from './tooltip';

export interface DeckPickerOpts {
  title: string;
  cards: CardInstance[];
  /** true＝要玩家挑一張（放生、磨爪、事件用）；false＝只是翻牌組來看 */
  pickable: boolean;
  /** false＝不給關，一定要挑一張 */
  cancellable: boolean;
  filter?: (c: CardInstance) => boolean;
  /**
   * true＝滑鼠移到牌上時，旁邊浮出「升級後」的完整牌面。
   *
   * 磨爪與事件的升級都只列出現在的牌，玩家挑的時候根本不知道升級後會變怎樣
   * （使用者的原話：「我還是不知道升級後的牌會變怎樣」）。升級的差異寫在牌表的
   * `upgrade` 裡，畫一張 `upgraded: true` 的牌就是了，不用另外描述差在哪。
   */
  previewUpgrade?: boolean;
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
  hideTooltip();   // 同 confirm.ts：疊層蓋上來時 mouseleave 不會發生，提示框會卡在上面
  const overlay = el('div', { class: 'modal-overlay' });
  /**
   * 收掉疊層。**四條出路都會走到這裡**：挑一張、不選、點黑幕、沒得挑只能關，所以鎖一定還得掉。
   * `unlockScreen()` 排在 onPick 之前的理由見 `overlay.ts`。
   * 也順手關掉還浮著的名詞提示：滑鼠停在牌面名詞上時整個疊層被移除，
   * mouseleave 不會發生，提示框就變成孤兒黏在畫面上。
   */
  const dismiss = (uid: number | null): void => {
    hidePreview();
    overlay.remove();
    unlockScreen();
    hideTooltip();
    opts.onPick(uid);
  };
  const layout = deckPickerLayout(opts);
  const grid = el('div', { class: 'deck-grid' });

  /**
   * 「升級後」的浮動預覽。位置用舞台座標算：舞台整個被 `transform: scale()` 縮過，
   * 所以量到的螢幕像素要除以縮放比才是舞台像素。放不下右邊就翻到左邊。
   */
  let preview: HTMLElement | null = null;
  const hidePreview = (): void => { preview?.remove(); preview = null; };
  function showPreview(node: HTMLElement, c: CardInstance): void {
    hidePreview();
    const stage = document.getElementById('stage');
    if (!stage) return;
    const k = 1280 / stage.getBoundingClientRect().width;
    const or = overlay.getBoundingClientRect();
    const cr = node.getBoundingClientRect();
    const box = el('div', { class: 'upgrade-preview' },
      el('div', { class: 'upgrade-preview-label' }, '升級後'),
      cardNode(cardStats(c).def, { upgraded: true }));
    // 右邊放不下（牌 170 寬＋間距）就翻到左邊
    const right = (cr.right - or.left) * k + 14;
    const flip = right + 186 > 1280;
    box.style.left = `${flip ? (cr.left - or.left) * k - 186 : right}px`;
    box.style.top = `${Math.min((cr.top - or.top) * k - 10, 720 - 300)}px`;
    overlay.append(box);
    preview = box;
  }

  for (const c of opts.cards) {
    const ok = opts.filter ? opts.filter(c) : true;
    const pick = opts.pickable && ok;
    const node = cardNode(c, {
      small: true,
      disabled: opts.pickable && !ok,
      // 選中的牌先彈一下再收視窗。原本是點下去視窗立刻消失，
      // 玩家連自己選到哪一張都來不及看清楚，升級／移除更是完全沒有「成交」的感覺。
      onClick: pick ? () => { node.classList.add('picked'); hidePreview(); window.setTimeout(() => dismiss(c.uid), 260); } : undefined,
    });
    if (opts.previewUpgrade && ok) {
      node.addEventListener('mouseenter', () => showPreview(node, c));
      node.addEventListener('mouseleave', hidePreview);
    }
    grid.append(node);
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
  /**
   * 上鎖**一定要排在疊層貼上去之後**。前面每一步都可能丟例外——最現實的是 `cardNode` →
   * `cardStats` 碰到牌表已經沒有的牌 id 就丟「未知的牌」（改過牌 id 的舊存檔就會這樣）。
   * 要是先鎖再組疊層，那一丟例外就變成：畫面層停用了，畫面上卻沒有任何疊層可以關掉，
   * 滑鼠點不動、Tab 也跳不進去，玩家只能重整；重整後按「續玩」再按一次「牌組」又鎖回去。
   * 擺到這裡之後，最壞情況退回成「按鈕按下去沒反應」，遊戲照樣能玩。
   */
  lockScreen();
}
