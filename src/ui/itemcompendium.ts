import { N_, t, term } from '../i18n';
import { potionName, potionText, relicLong, relicName, relicText } from '../i18n/names';
import { potions } from '../content/potions';
import { MIASMA_PURE, relicById, relics, RELIC_SETS, setCount, setMembers } from '../content/relics';
import type { RelicSet } from '../engine/types';
import { artUrl } from './assets';
import { el } from './dom';
import { overlayRoot } from './overlay';

/**
 * 秘寶與忍具圖鑑（2026-09-02 使用者：「卡牌圖鑑之外也該做個秘寶、忍具圖鑑，放封面就好」）。
 * 疊層跟卡牌圖鑑同一套（`.compendium`），只是內容換成一列一件：圖、名字、價錢、效果。
 * 圖還沒生好的用名字前兩個字當牌子。
 */
// 罐頭鋪、事件是 2026-09-23 第二批的兩個限定池（美術 art2 報告：圖鑑原本沒有這兩區，那 6 件不會出現）
const RELIC_POOLS = ['起始', '常見', '大魔物', '塔主', '罐頭鋪', '事件'] as const;
const POOL_NOTE: Record<string, string> = {
  起始: N_('開局就戴著'),
  常見: N_('紙箱、罐頭鋪、事件'),
  大魔物: N_('打倒大魔物'),
  塔主: N_('過關三選一'),
  罐頭鋪: N_('只擺在罐頭鋪最右邊的「店長私藏」（一半的店有）'),
  事件: N_('只從特定的事件拿得到'),
};
/** 圖鑑裡的秘寶區名：限定池寫成「罐頭鋪限定」「事件限定」，不然「秘寶‧事件」讀起來像是事件本身 */
const POOL_TITLE: Record<string, string> = { 罐頭鋪: N_('罐頭鋪限定'), 事件: N_('事件限定') };

function icon(art: string, name: string): HTMLElement {
  const url = artUrl('icons', art);
  return url.startsWith('data:') ? el('span', { class: 'item-icon-name' }, name.slice(0, 2)) : el('img', { class: 'item-icon', src: url, alt: name });
}

/**
 * 套組那一區（2026-09-23 第二批，事件劇本第八節）：三件並排，身上有的框金色（沒有的照常顯示圖，
 * 原本畫全黑剪影、深色底上看不見，2026-09-24 改），標題寫集到幾件。
 * `owned`＝這一局身上的秘寶（標題畫面拿存檔那一局的；沒有進行中的局就是空的，寫 0）。
 */
function setSection(owned: readonly string[]): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const set of Object.keys(RELIC_SETS) as RelicSet[]) {
    const members = setMembers(set);
    const got = setCount(set, owned);
    out.push(el('div', { class: 'comp-section' },
      el('span', { class: 'comp-pool' }, t('{set}套組（集到 {got}／{of}）', { set: term(set), got, of: members.length })),
      el('span', { class: 'comp-note' }, t('{text}{done}', { text: t(RELIC_SETS[set].text), done: got >= RELIC_SETS[set].need ? t('（已生效）') : '' })))); // i18n-dynamic (content/relics.ts RELIC_SETS[set].text)
    out.push(el('div', { class: 'item-set' }, ...members.map((r) => el('div', { class: `item-set-slot${owned.includes(r.id) ? ' owned' : ''}` },
      icon(r.art, relicName(r)), el('b', {}, relicName(r))))));
  }
  return out;
}

export function showItemCompendium(owned: readonly string[] = []): void {
  const layer = overlayRoot();
  if (!layer || layer.querySelector('.compendium')) return;
  const body = el('div', { class: 'comp-body' });
  body.append(...setSection(owned));
  for (const pool of RELIC_POOLS) {
    const group = relics.filter((r) => r.pool === pool);
    if (!group.length) continue;
    body.append(el('div', { class: 'comp-section' },
      el('span', { class: 'comp-pool' }, t('秘寶‧{title}（{n}）', { title: POOL_TITLE[pool] ? t(POOL_TITLE[pool]) : term(pool), n: group.length })),
      el('span', { class: 'comp-note' }, t(POOL_NOTE[pool] ?? ''))));
    const list = el('div', { class: 'item-grid' });
    for (const r of [...group].sort((a, b) => (a.price ?? 150) - (b.price ?? 150))) {
      list.append(el('div', { class: 'item-row' }, icon(r.art, relicName(r)),
        el('div', { class: 'item-text' }, el('b', {}, relicName(r)), el('em', {}, relicLong(r, owned))),
        el('span', { class: 'item-price' }, t('{price} 條', { price: r.price ?? 150 }))));
      // 淨化版跟在原件下面一格（2026-09-23 第三批，design3 6-1）：`淨化` 池不自成一區、抽不到也買不到。
      // `unseen` 只是記號，圖照常顯示（2026-09-24 拿掉全黑剪影，見 screens.css）
      const pure = relicById[MIASMA_PURE[r.id] ?? ''];
      if (pure) list.append(el('div', { class: `item-row pure${owned.includes(pure.id) ? '' : ' unseen'}` }, icon(pure.art, relicName(pure)),
        el('div', { class: 'item-text' }, el('b', {}, t('{name}（淨化後）', { name: relicName(pure) })), el('em', {}, relicText(pure))),
        el('span', { class: 'item-price' }, t('淨化'))));
    }
    body.append(list);
  }
  body.append(el('div', { class: 'comp-section' },
    el('span', { class: 'comp-pool' }, t('忍具（{n}）', { n: potions.length })),
    el('span', { class: 'comp-note' }, t('戰鬥獎勵、事件、罐頭鋪；戰鬥中點一下就用，一場最多帶三支（難度 4 以上只有兩支；忍具袋、九命鈴可加）'))));
  const plist = el('div', { class: 'item-grid' });
  // 照價錢排，跟上面秘寶那幾區同一套（2026-09-11）。本來是照 `potions` 的陣列順序，
  // 而新忍具一律往陣列尾端加——結果七支新的全擠在最下面像附錄，
  // 而且同樣 40 條的麻繩與胡椒罐會被隔得老遠，玩家沒辦法比價
  // 沒標價的照引擎的保底值 45（ 的 POTION_PRICE），跟下面那行顯示的數字同一套
  for (const p of [...potions].sort((a, b) => (a.price ?? 45) - (b.price ?? 45))) {
    plist.append(el('div', { class: 'item-row' }, icon(p.art, potionName(p)),
      el('div', { class: 'item-text' }, el('b', {}, potionName(p)), el('em', {}, potionText(p))),
      el('span', { class: 'item-price' }, t('{price} 條', { price: p.price ?? 45 }))));
  }
  body.append(plist);

  const close = el('button', { class: 'btn small comp-close' }, `✕ ${t('關閉')}`);
  const box = el('div', { class: 'compendium items' },
    el('div', { class: 'comp-head' }, el('span', { class: 'comp-title' }, t('秘寶與忍具圖鑑')), close),
    body);
  const backdrop = el('div', { class: 'comp-backdrop' });
  const dismiss = (): void => { box.remove(); backdrop.remove(); window.removeEventListener('keydown', onKey); };
  const onKey = (ev: KeyboardEvent): void => { if (ev.key === 'Escape') dismiss(); };
  close.addEventListener('click', dismiss);
  backdrop.addEventListener('click', dismiss);
  window.addEventListener('keydown', onKey);
  layer.append(backdrop, box);
}
