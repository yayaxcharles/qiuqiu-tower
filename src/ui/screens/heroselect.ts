import { registerScreen } from '../app';
import { artUrl, heroArtUrl } from '../assets';
import { cardById, starterDeckFor } from '../../content/cards';
import { relicById } from '../../content/relics';
import { describeCard } from '../cardtext';
import { el } from '../dom';
import { screenBg } from '../screenbg';
import { startRelicFor, type Hero } from '../../engine/hero';

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

const PICKS: Pick[] = [
  {
    hero: 'ninja', name: '球球', tag: '近身 ・ 閃避',
    blurb: '大俠貓的徒弟。衝上去抓，靠隱身閃掉最痛的那一下，蜷縮每回合重新賺。'
      + '想清楚一回合要打多少，然後一次打完。',
    pose: 'hero/ninja',
  },
  {
    hero: 'feifei', name: '菲菲', tag: '毒暗器 ・ 距離',
    blurb: '球球的師妹，怕痛怕到誇張。丟毒針，靠「距離」活著——站得遠打得痛，'
      + '真的被打到就會被逼近一格。毒要滾起來才有威力，前幾回合先退開就好。',
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
    return [...seen].map(([id, n]) => `${cardById[id]?.name ?? id}${n > 1 ? ` x${n}` : ''}`).join('、');
  };

  const detail = el('div', { class: 'hero-detail' });
  const cards = el('div', { class: 'hero-cards' });

  const refresh = (): void => {
    const p = PICKS.find((x) => x.hero === chosen) as Pick;
    const relic = relicById[startRelicFor(chosen)];
    // 起手牌裡最能代表這位角色的那一張，整張畫出來給玩家看（球球是貓抓，菲菲是遠射）
    const keyCard = cardById[chosen === 'feifei' ? 'feifei_yuanshe' : 'sanjo'];
    detail.replaceChildren(
      el('p', { class: 'hero-blurb' }, p.blurb),
      el('div', { class: 'hero-kit' },
        el('div', { class: 'hero-kit-row' }, el('b', {}, '起手十張'), el('span', {}, deckLine(chosen))),
        el('div', { class: 'hero-kit-row' }, el('b', {}, '起始秘寶'),
          el('span', {}, relic ? `${relic.name}：${relic.text}` : '—')),
        keyCard ? el('div', { class: 'hero-kit-row' }, el('b', {}, `代表牌「${keyCard.name}」`),
          el('span', {}, describeCard(keyCard, false))) : ''));
    for (const node of cards.children) {
      node.classList.toggle('selected', node.getAttribute('data-hero') === chosen);
    }
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
      el('button', { class: 'btn primary', onclick: () => app.newRun(seed, difficulty ?? 1, chosen) }, '就他了，出發'),
      el('button', { class: 'btn', onclick: () => app.show('title') }, '再想想'))));
  // 封面那張圖只在標題畫面用，這裡不放：兩隻角色並排時再擺一張大圖會搶掉焦點
  void artUrl;
});
