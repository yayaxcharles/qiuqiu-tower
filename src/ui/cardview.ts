import { cardStats } from '../engine/deck';
import type { CardDef, CardInstance } from '../engine/types';
import { artUrl, cardArtKey, localHero } from './assets';
import { attachCardPeek } from './cardpeek';
import { cardName } from '../i18n/names';
import { upgradedChangedChars } from './carddiff';
import { el } from './dom';
import { cardTypeLabel, describeCardText, term } from '../i18n';
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
  /**
   * 用**誰**的圖與牌名畫（不填＝這一局玩的那位）。
   *
   * 只有卡牌圖鑑在用：從標題畫面開圖鑑時還沒開局，`localHero()` 一律回球球，
   * 於是整本圖鑑都是他的圖——而那正是最需要「開局前先看看這角色有什麼牌」的時候
   *（2026-09-13 使用者從標題畫面開，看到雙人牌全是球球的圖）。
   */
  hero?: string;
  /** 同伴出牌預覽明確指定另一位；圖鑑不填，保留角色自己的原圖。 */
  partnerHero?: string;
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
  // 升級反而變貴的也要標（見血封喉＋ 3→4，夜間稽核 低-7）：只標變便宜的話，貓窩預覽時看不出來，升完才發現一般回合打不出來
  const costUp = upgraded && (def.upgrade.cost ?? def.cost) > def.cost;

  const node = el('div', { class: cls.join(' ') },
    el('div', { class: costDown ? 'card-cost cost-down' : costUp ? 'card-cost cost-up' : 'card-cost' }, String(cost)),
    el('img', { class: 'card-art', src: artUrl('cards', cardArtKey(def.art, opts.hero, opts.partnerHero)), alt: cardName(def, opts.hero ?? localHero()), draggable: 'false' }),
    el('div', { class: 'card-name' }, cardName(def, opts.hero ?? localHero()) + (upgraded ? '＋' : '')),
    el('div', { class: 'card-text' }, markupKeywords(describeCardText(def, upgraded, plays), changed)),
    el('div', { class: 'card-type' }, cardTypeLabel(def.type), ...(def.coop ? [el('span', { class: 'coop-tag' }, `· ${term('雙人')}`)] : [])));

  if (uid !== null) node.dataset['uid'] = String(uid);
  const onClick = opts.onClick;
  if (onClick) node.addEventListener('click', () => { if (!opts.disabled) onClick(); });
  // 手機橫拿按住放大看（2026-09-23 polish 第 8 條）：打不出來的牌也要讀得到，所以每張都掛；桌機不作用
  attachCardPeek(node);
  fitCardText(node);
  return node;
}

/**
 * 牌面文字放不下時逐級退讓（2026-09-06 字體放大後的保險；2026-09-30 英日極端版面檢查 高-3、中-5 補了後面三級）。
 * 牌面高度固定，牌池最長的牌（42 字）剛好四行。要量高度得先掛進畫面，所以排到下一個畫格；
 * 那時還沒掛上（例如只拿來量尺寸）或不在瀏覽器裡（測試）就跳過。放得下的牌一個像素都不動（繁中全部如此）。
 *
 * 先處理牌名，因為牌名換行會多佔一行的高度、規則文字要在那之後才量：
 *   ① 牌名固定一行，放不下就一路縮到 9px；
 *   ② 縮到 9px 還放不下（英文「Secret Art: Thousand-Pound Drop」這種）就換成兩行、字改 `NAME_WRAP_SIZE`，不再切掉字母。
 * 規則文字：
 *   ③ 字從 15／13 一路每次降 0.5，最低 10；
 *   ④ 縮到 10 還被切（英文連線牌尾巴那句單人規則）：先把行距 1.3 收到 1.2，再一次 2 像素縮牌圖高度（最多縮到七成），
 *      把高度讓給文字。牌圖是裝飾，最後才動它；字不再縮，手機上 10 像素已經很小。
 */
export const NAME_WRAP_SIZE = 0.85;   // 換兩行時牌名字級是原本的幾成
export const ART_MIN_RATIO = 0.7;     // 牌圖最多縮到原高的幾成

function fitCardText(node: HTMLElement): void {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return;
  window.requestAnimationFrame(() => {
    const t = node.querySelector<HTMLElement>('.card-text');
    if (!t || !node.isConnected) return;
    // 牌名固定一行（英日的牌名比中文長，2026-09-29 多語系）：放不下就一路縮到放得下，最小 9px；再不行換兩行
    const name = node.querySelector<HTMLElement>('.card-name');
    if (name) {
      let ns = parseFloat(getComputedStyle(name).fontSize);
      for (let i = 0; i < 16 && name.scrollWidth > name.clientWidth && ns > 9; i++) {
        ns -= 0.5;
        name.style.fontSize = `${ns}px`;
      }
      if (name.scrollWidth > name.clientWidth) {
        name.style.fontSize = '';
        const base = parseFloat(getComputedStyle(name).fontSize);
        name.classList.add('wrap');
        let ws = Math.round(base * NAME_WRAP_SIZE * 2) / 2;
        name.style.fontSize = `${ws}px`;
        // 兩行放不下（單字太長或還是三行）再縮，最低 10
        for (let i = 0; i < 6 && ws > 10 && (name.scrollWidth > name.clientWidth || name.scrollHeight > ws * 1.2 * 2 + 6); i++) {
          ws -= 0.5;
          name.style.fontSize = `${ws}px`;
        }
      }
    }
    let size = parseFloat(getComputedStyle(t).fontSize);
    for (let i = 0; i < 10 && t.scrollHeight > t.clientHeight && size > 10; i++) {
      size -= 0.5;
      t.style.fontSize = `${size}px`;
    }
    if (t.scrollHeight > t.clientHeight) {
      t.style.lineHeight = '1.2';
      const art = node.querySelector<HTMLElement>('.card-art');
      if (art && t.scrollHeight > t.clientHeight) {
        const full = art.offsetHeight;   // 版面高度（不受手牌歪斜、舞台縮放影響）
        let h = full;
        for (let i = 0; i < 16 && t.scrollHeight > t.clientHeight && h - 2 >= full * ART_MIN_RATIO; i++) {
          h -= 2;
          art.style.height = `${h}px`;
        }
      }
    }
  });
}
