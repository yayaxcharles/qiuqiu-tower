import { potionById } from '../content/potions';
import { relicById } from '../content/relics';
import type { App } from './app';
import { artUrl } from './assets';
import { showDeckPicker } from './deckview';
import { el } from './dom';
import { attachTooltip } from './tooltip';

/**
 * 上方狀態列：樓層、生命、小魚乾、秘寶、忍具、牌組、種子。
 *
 * 忍具在這裡**只是畫出來給人看**，按不動：規格 §8.4 修訂後忍具搬到戰場的左下角，
 * 而且戰鬥中這一列的生命與忍具兩格是用 CSS 隱藏的（戰鬥途中 `run.potions` 是過期值）。
 */
/**
 * 上一次畫的小魚乾數，用來判斷「這次是不是變了」。
 *
 * 買東西、拿獎勵、事件給錢，原本都只是這個數字**默默換一個值**——
 * 按下去跟沒按下去看起來一樣，這是「只是點擊」感最重的一處。
 * 記在模組層而不是整局狀態裡：這純粹是畫面上的事，不該存進存檔。
 * 連種子一起記，換一局要從頭算，不然新局第一次畫就會平白蹦一下。
 */
let lastFish: { seed: string; n: number } | null = null;

export function renderHud(app: App, root: HTMLElement): HTMLElement {
  const run = app.run;
  const hud = el('div', { class: 'hud' });
  root.append(hud);
  if (!run) return hud;   // 沒有整局就掛個空殼，不要讓畫面整個掛掉

  const pct = run.maxHp > 0 ? Math.max(0, Math.round((run.hp / run.maxHp) * 100)) : 0;
  const hp = el('div', { class: 'hud-hp' },
    el('div', { class: 'hud-hp-bar', style: `width:${pct}%` }),
    el('span', {}, `${run.hp} / ${run.maxHp} 生命`));

  const fish = el('div', { class: 'hud-fish' },
    el('img', { src: artUrl('icons', 'icon/fish'), alt: '' }),
    el('span', {}, String(run.fish)));
  attachTooltip(fish, '小魚乾');
  const diff = lastFish && lastFish.seed === run.seed ? run.fish - lastFish.n : 0;
  if (diff !== 0) {
    fish.classList.add(diff > 0 ? 'gain' : 'spend');
    fish.append(el('span', { class: 'hud-fish-diff' }, `${diff > 0 ? '+' : ''}${diff}`));
  }
  lastFish = { seed: run.seed, n: run.fish };

  const relics = el('div', { class: 'hud-relics' });
  for (const id of run.relics) {
    const r = relicById[id];
    if (!r) continue;
    const node = el('div', { class: 'hud-relic' }, el('img', { src: artUrl('icons', r.art), alt: r.name }));
    node.title = `${r.name}：${r.text}`;
    relics.append(node);
  }

  const potions = el('div', { class: 'hud-potions' });
  for (let i = 0; i < 3; i++) {
    const id = run.potions[i];
    const p = id ? potionById[id] : undefined;
    const slot = el('div', { class: `hud-potion${p ? '' : ' empty'}` });
    if (id && p) {
      slot.append(el('img', { src: artUrl('icons', p.art), alt: p.name }));
      slot.title = `${p.name}：${p.text}`;
    }
    potions.append(slot);
  }

  const deckBtn = el('button', {
    class: 'btn small',
    onclick: () => showDeckPicker({
      title: `牌組（${run.deck.length} 張）`, cards: run.deck, pickable: false, cancellable: true, onPick: () => { /* 只是看看 */ },
    }),
  }, `牌組 ${run.deck.length}`);

  hud.append(
    el('div', { class: 'hud-floor' }, run.floor > 0 ? `${run.floor}F` : '塔下'),
    hp, fish, relics, potions, deckBtn,
    el('div', { class: 'hud-seed' }, `種子 ${run.seed}`));
  return hud;
}
