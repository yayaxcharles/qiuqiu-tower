import { registerScreen } from '../app';
import { artUrl, heroArtUrl } from '../assets';
import { cardById, cardNameFor, starterDeckFor } from '../../content/cards';
import { relicById } from '../../content/relics';
import { describeCard } from '../cardtext';
import { el } from '../dom';
import { screenBg } from '../screenbg';
import { heroPronoun, startRelicFor, type Hero } from '../../engine/hero';

/**
 * 選角色（2026-09-12，使用者：「開頭進地圖前可以選角色」）。
 *
 * 排在「新的一局」與序章之間：選完才開局，因為序章、起手牌、起始秘寶三樣都跟角色綁在一起。
 *
 * **武士不在這裡**：他沒有自己的立繪、也沒有一張專屬牌，實際上只是「球球扣掉隱身牌」。
 * 放上來只會讓玩家選到一個空殼（設計稿第一節寫得很清楚）。他的 `Hero` 型別留著，
 * 哪天真的補齊了再加一格。
 */
interface Pick { hero: Hero; name: string; tag: string; blurb: string; pose: string }

/** 選角畫面右邊整張畫出來的「代表牌」。**牌號要真的存在**，見 `refresh` 裡的說明 */
export const KEY_CARD: Readonly<Record<string, string>> = { ninja: 'sanjo', feifei: 'feifei_feizhen' };

const PICKS: Pick[] = [
  {
    hero: 'ninja', name: '球球', tag: '近身 ・ 閃避',
    blurb: '大俠貓的徒弟，綁著藍頭巾。膽子大，做事急，看見紙箱就想鑽。師父被魔氣控制後，他追進魔塔，要把師父和被搶走的小魚乾都帶回來。',
    pose: 'hero/ninja',
  },
  {
    hero: 'feifei', name: '菲菲', tag: '毒 ・ 攻擊帶蜷縮',
    blurb: '怕痛的暹羅貓，球球的師妹。進塔只為找回師父與師兄。攻擊牌多半自帶蜷縮，能邊打邊擋；毒針累積中毒，逐步消耗對手。',
    pose: 'hero/ninja',   // 立繪鍵一律寫球球版的，`heroArtUrl` 會換成她自己的（見 assets.ts）
  },
];

registerScreen('heroselect', (app, root, props) => {
  const { seed, difficulty } = (props ?? {}) as { seed?: string; difficulty?: number };
  let chosen: Hero = 'ninja';

  /** 這位角色的起手十張長什麼樣：同一張牌收成「x N」，順序照牌組 */
  const deckLine = (hero: Hero): string => {
    const seen = new Map<string, number>();
    for (const id of starterDeckFor(hero)) seen.set(id, (seen.get(id) ?? 0) + 1);
    return [...seen].map(([id, n]) => {
      const d = cardById[id];
      return `${d ? cardNameFor(d, hero) : id}${n > 1 ? ` x${n}` : ''}`;
    }).join('、');
  };

  const detail = el('div', { class: 'hero-detail' });
  const cards = el('div', { class: 'hero-cards' });
  const goBtn = el('button', { class: 'btn primary', onclick: () => app.newRun(seed, difficulty ?? 1, chosen) });

  const refresh = (): void => {
    const p = PICKS.find((x) => x.hero === chosen) as Pick;
    const relic = relicById[startRelicFor(chosen)];
    /*
     * 起手牌裡最能代表這位角色的那一張，整張畫出來給玩家看（球球是貓抓，菲菲是飛針）。
     *
     * 這裡查不到牌號時後面是 `keyCard ? … : ''`——**整列靜靜消失，不報錯也不會讓測試變紅**。
     * 2026-09-12 就這樣壞過：原本指著「遠射」，那張牌隨著距離機制一起刪掉了，
     * 於是選菲菲時看不到代表牌、選球球時看得到，只有人眼抓得出來。
     * `heroselect.test.ts` 現在盯著這兩個牌號真的存在。
     */
    const keyCard = cardById[KEY_CARD[chosen] ?? 'sanjo'];
    detail.replaceChildren(
      el('p', { class: 'hero-blurb' }, p.blurb),
      el('div', { class: 'hero-kit' },
        el('div', { class: 'hero-kit-row' }, el('b', {}, '起手十張'), el('span', {}, deckLine(chosen))),
        el('div', { class: 'hero-kit-row' }, el('b', {}, '起始秘寶'),
          el('span', {}, relic ? `${relic.name}：${relic.text}` : '—')),
        keyCard ? el('div', { class: 'hero-kit-row' }, el('b', {}, `代表牌「${cardNameFor(keyCard, chosen)}」`),   // 牌名一律過 cardNameFor（總稽核 C 低-6）
          el('span', {}, describeCard(keyCard, false))) : ''));
    for (const node of cards.children) {
      node.classList.toggle('selected', node.getAttribute('data-hero') === chosen);
    }
    goBtn.textContent = `就${heroPronoun({ hero: chosen })}了，出發`;
  };

  for (const p of PICKS) {
    const url = heroArtUrl(p.hero, p.pose);
    cards.append(el('div', {
      class: 'hero-card', 'data-hero': p.hero,
      onclick: () => { chosen = p.hero; refresh(); },
    },
      el('div', { class: 'hero-portrait' },
        el('div', { class: 'ground-shadow' }),
        url.startsWith('data:') ? el('div', { class: 'hero-portrait-missing' }, p.name)
          : el('img', { src: url, alt: p.name })),
      el('div', { class: 'hero-name' }, p.name),
      el('div', { class: 'hero-tag' }, p.tag)));
  }
  refresh();

  root.append(screenBg('bg/screen_title'));
  root.append(el('div', { class: 'heroselect' },
    el('h2', {}, '這一趟由誰去？'),
    cards,
    detail,
    el('div', { class: 'heroselect-buttons' },
      // 選菲菲時要寫「她」（2026-09-13 實機看到的）。**文字要在 `refresh` 裡更新**——
      // 只在建立時算一次的話，挑了她之後按鈕還是指著他
      goBtn,
      el('button', { class: 'btn', onclick: () => app.show('title') }, '再想想'))));
  // 封面那張圖只在標題畫面用，這裡不放：兩隻角色並排時再擺一張大圖會搶掉焦點
  void artUrl;
});
