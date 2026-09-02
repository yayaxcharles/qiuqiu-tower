import { cards } from '../content/cards';
import { el } from './dom';
import { cardNode } from './cardview';
import { overlayRoot } from './overlay';

/**
 * 卡牌圖鑑：整個牌庫一覽（依牌池分區），右上角勾「顯示升級版」整頁切成＋版數值。
 * 使用者點名要的：拿牌獎勵時想知道「這張升級後長怎樣」「還有哪些牌可以期待」，
 * 現在只有貓窩磨爪的預覽看得到升級版。
 *
 * 疊層蓋在任何畫面上（掛在 overlayRoot），Esc 或右上角 ✕ 關掉。
 * 不鎖畫面（lockScreen）：圖鑑是查資料，不是劇情，玩家可能想邊看邊比對戰場。
 */
const POOL_ORDER = ['起手', '忍術', '絕學', '壞毛病'] as const;
const POOL_NOTE: Record<string, string> = {
  起手: '開局的十張牌就從這裡來',
  忍術: '一般戰鬥獎勵、罐頭鋪常見貨',
  絕學: '大魔物、事件、過關獎勵的高階牌',
  壞毛病: '事件踩雷才會拿到的牌，靠貓窩或事件移除',
};

export function showCompendium(): void {
  const layer = overlayRoot();
  if (!layer || layer.querySelector('.compendium')) return;   // 已經開著就不疊第二層

  let upgraded = false;
  const grid = el('div', { class: 'comp-body' });

  const render = (): void => {
    grid.replaceChildren();
    for (const pool of POOL_ORDER) {
      // `combatOnly` 的戰鬥雜牌（黏液、眼冒金星）不列進圖鑑：那不是「牌組會有的牌」，
      // 是魔物臨時塞進來、打完就沒的東西
      const group = cards.filter((c) => c.pool === pool && !c.combatOnly);
      if (!group.length) continue;
      grid.append(el('div', { class: 'comp-section' },
        el('span', { class: 'comp-pool' }, `${pool}（${group.length}）`),
        el('span', { class: 'comp-note' }, POOL_NOTE[pool] ?? '')));
      const row = el('div', { class: 'comp-grid' });
      // 同池內照稀有度排：常見→罕見→稀有，找牌時比較有秩序
      const rank: Record<string, number> = { 常見: 0, 罕見: 1, 稀有: 2 };
      for (const def of [...group].sort((a, b) => (rank[a.rarity] ?? 9) - (rank[b.rarity] ?? 9)))
        row.append(cardNode(def, { small: true, upgraded }));
      grid.append(row);
    }
  };

  const check = el('input', { type: 'checkbox', id: 'comp-upg' }) as HTMLInputElement;
  check.addEventListener('change', () => { upgraded = check.checked; render(); });
  const close = el('button', { class: 'btn small comp-close' }, '✕ 關閉');
  const box = el('div', { class: 'compendium' },
    el('div', { class: 'comp-head' },
      el('span', { class: 'comp-title' }, '卡牌圖鑑'),
      el('label', { class: 'comp-upg', for: 'comp-upg' }, check, '顯示升級版（＋）'),
      close),
    grid);

  // 半透明背幕：接住圖鑑外的點擊（點外面＝關閉），免得誤點到底下的畫面
  const backdrop = el('div', { class: 'comp-backdrop' });
  const dismiss = (): void => {
    box.remove(); backdrop.remove();
    window.removeEventListener('keydown', onKey);
  };
  const onKey = (ev: KeyboardEvent): void => { if (ev.key === 'Escape') dismiss(); };
  close.addEventListener('click', dismiss);
  backdrop.addEventListener('click', dismiss);
  window.addEventListener('keydown', onKey);

  render();
  layer.append(backdrop, box);
}
