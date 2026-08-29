import { potionById } from '../content/potions';
import { relicById } from '../content/relics';
import type { App } from './app';
import { artUrl } from './assets';
import { showDeckPicker } from './deckview';
import { el } from './dom';
import { attachTooltip } from './tooltip';

export interface HudOpts {
  /** 戰鬥畫面才給：按下忍具要做什麼。地圖／商店這些不能用忍具，就不傳 */
  onPotion?: (potionId: string, index: number) => void;
}

/** 上方狀態列：樓層、生命、小魚乾、秘寶、忍具、牌組、種子 */
export function renderHud(app: App, root: HTMLElement, opts: HudOpts = {}): HTMLElement {
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
      const onPotion = opts.onPotion;
      if (onPotion) { slot.classList.add('usable'); slot.addEventListener('click', () => onPotion(id, i)); }
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
