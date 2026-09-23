import { cards, inHeroCollection } from '../content/cards';
import { el } from './dom';
import { cardNode } from './cardview';
import { localHero } from './assets';
import { overlayRoot } from './overlay';
import { HEROES, heroName, type Hero } from '../engine/hero';

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

/**
 * 這一格在這一位的圖鑑裡叫什麼。
 *
 * 牌名已經照角色換過了（`cardNameFor` 把「忍術·」前綴拿掉），可是分區的標題還寫著「忍術」——
 * 於是噹噹的圖鑑長成「忍術（34）」底下一排完全沒有忍術字樣的拳腳牌，看起來像漏改
 *（使用者 2026-09-17：「噹噹的卡牌也得把所有的忍術字眼移除」）。
 *
 * 只換標題、**不動 `pool` 本身**：池子是規則用的鍵（獎勵、罐頭鋪、機率都照它抽），
 * 換掉會牽動一整排存檔與測試。這裡換的純粹是玩家看到的那四個字。
 * 封封（劍客）的牌名 2026-09-23 也拿掉了「忍術·」（稽核 引擎 低-6），標題跟著換成「劍術」——
 * 契約的「不新增劍術牌池」講的是規則用的池子，這裡只是顯示的字。
 */
export function poolNameFor(pool: string, hero: string): string {
  if (pool !== '忍術') return pool;
  return NINJUTSU_TITLE[hero as Hero] ?? pool;   // 不認得的值照舊寫「忍術」
}
// `Record<Hero, …>`（2026-09-23 health H-2 第 2 塊）：原本是三元式，加第五隻貓漏了會默默寫「忍術」；現在 tsc 會擋
const NINJUTSU_TITLE: Readonly<Record<Hero, string>> = { ninja: '忍術', feifei: '忍術', dangdang: '拳腳', fengfeng: '劍術' };

export function showCompendium(): void {
  const layer = overlayRoot();
  if (!layer || layer.querySelector('.compendium')) return;   // 已經開著就不疊第二層

  let upgraded = false;
  /**
   * 用誰的圖與牌名看。**開局中就開在你正在玩的那位**，從標題畫面開就從球球開始，
   * 兩邊都可以按上面的鈕切。
   *
   * 為什麼要這顆鈕（2026-09-13 使用者回報「雙人的卡牌都沒有菲菲喔?圖片全是球球的」）：
   * 標題畫面還沒開局，`localHero()` 一律回球球，於是整本圖鑑都是他的圖——
   * 而「開局前先看看這角色有什麼牌」正是圖鑑最常被打開的時候。
   */
  let who: string = localHero();
  const grid = el('div', { class: 'comp-body' });

  /** 這一位拿得到的牌（判準見 `inHeroCollection`：起手區照起手十張認，其餘看 `hero` 標記） */
  const forWho = (c: Parameters<typeof inHeroCollection>[0]): boolean => inHeroCollection(c, who);

  const render = (): void => {
    grid.replaceChildren();
    for (const pool of POOL_ORDER) {
      /*
       * `combatOnly` 的戰鬥雜牌（黏液、眼冒金星）不列進圖鑑：那不是「牌組會有的牌」，
       * 是魔物臨時塞進來、打完就沒的東西。
       *
       * **連線牌抽出來另外擺一區**（2026-09-13 稽核 低-7）：`hidden` 拿掉之後，
       * 那 28 張跟著混進忍術與絕學，一個人玩的玩家會看到一堆他永遠抽不到的牌，
       * 而且池子的說明「一般戰鬥獎勵、罐頭鋪常見貨」對它們是假的。
       * 不是藏起來——圖鑑本來就是「全部看得到」的地方——是**擺到自己那一區**，
       * 順便讓「什麼時候才抽得到」寫在標題上。
       */
      const group = cards.filter((c) => c.pool === pool && !c.combatOnly && !c.hidden && !c.coop && forWho(c));
      if (!group.length) continue;
      grid.append(el('div', { class: 'comp-section' },
        el('span', { class: 'comp-pool' }, `${poolNameFor(pool, who)}（${group.length}）`),
        el('span', { class: 'comp-note' }, POOL_NOTE[pool] ?? '')));
      const row = el('div', { class: 'comp-grid' });
      // 同池內照稀有度排：常見→罕見→稀有，找牌時比較有秩序
      const rank: Record<string, number> = { 常見: 0, 罕見: 1, 稀有: 2 };
      for (const def of [...group].sort((a, b) => (rank[a.rarity] ?? 9) - (rank[b.rarity] ?? 9)))
        row.append(cardNode(def, { small: true, upgraded, hero: who }));
      grid.append(row);
    }
    // 連線牌自己一區，擺在最後（見上面 `group` 那段的說明）
    const coop = cards.filter((c) => c.coop && !c.combatOnly && !c.hidden && forWho(c));
    if (coop.length) {
      grid.append(el('div', { class: 'comp-section' },
        el('span', { class: 'comp-pool' }, `雙人（${coop.length}）`),
        el('span', { class: 'comp-note' }, '兩個人一起爬塔才會出現在獎勵與罐頭鋪')));
      const row = el('div', { class: 'comp-grid' });
      const rank: Record<string, number> = { 常見: 0, 罕見: 1, 稀有: 2 };
      for (const def of [...coop].sort((a, b) => (rank[a.rarity] ?? 9) - (rank[b.rarity] ?? 9)))
        row.append(cardNode(def, { small: true, upgraded, hero: who }));
      grid.append(row);
    }
  };

  const check = el('input', { type: 'checkbox', id: 'comp-upg' }) as HTMLInputElement;
  check.addEventListener('change', () => { upgraded = check.checked; render(); });

  // 看誰的牌。正式角色直接排成按鈕，一眼看得出現在在看誰，也少一次點擊。
  const heroBtns = HEROES.map((h) => {
    const b = el('button', { class: 'btn small comp-hero' }, heroName({ hero: h }));
    b.addEventListener('click', () => {
      if (who === h) return;
      who = h;
      for (const o of heroBtns) o.classList.toggle('on', o === b);
      render();
    });
    if (who === h) b.classList.add('on');
    return b;
  });

  const close = el('button', { class: 'btn small comp-close' }, '✕ 關閉');
  const box = el('div', { class: 'compendium' },
    el('div', { class: 'comp-head' },
      el('span', { class: 'comp-title' }, '卡牌圖鑑'),
      el('span', { class: 'comp-heroes' }, ...heroBtns),
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
