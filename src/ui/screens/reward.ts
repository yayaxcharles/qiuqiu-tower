import { potionById } from '../../content/potions';
import { relicById } from '../../content/relics';
import type { CombatRewards } from '../../engine/rewards';
import { takeCardReward } from '../../engine/run';
import { registerScreen } from '../app';
import { screenBg, tierBgKey } from '../screenbg';
import { artUrl } from '../assets';
import { cardNode } from '../cardview';
import { el } from '../dom';
import { renderHud } from '../hud';

/**
 * 圖示還沒生好時 `artUrl` 會回一張灰剪影 data URI。這裡每個項目旁邊都有名字與說明，
 * 與其排一排認不出來的灰影，不如整個不放圖（等美術批次落地就會自己出現）。
 */
function icon(key: string, alt: string): Node | string {
  const url = artUrl('icons', key);
  return url.startsWith('data:') ? '' : el('img', { src: url, alt });
}

registerScreen('reward', (app, root, props) => {
  // 獎勵是戰鬥的延續，沿用同一張戰場背景，玩家不會覺得換了地方
  root.append(screenBg(tierBgKey(app.run?.floor ?? 1)));
  const run = app.run;
  if (!run) { app.show('title'); return; }
  // 戰利品與事件獎金分兩欄送過來（見 app.afterCombat）：CombatRewards 本身沒有 bonusFish 這一欄
  const r = props as CombatRewards & { bonusFish?: number };
  const bonus = r.bonusFish ?? 0;
  renderHud(app, root);

  const items = el('div', { class: 'reward-items' },
    el('div', { class: 'reward-item' }, icon('icon/fish', ''), `＋${r.fish} 小魚乾`));
  // 獎金另起一行：r.fish 是規格 §5.4 的戰利品，兩個數字不併成一個，玩家才看得出獎金有沒有拿到
  if (bonus > 0) items.append(el('div', { class: 'reward-item' }, icon('icon/fish', ''), `＋${bonus} 小魚乾（事件獎金）`));
  const relic = r.relic ? relicById[r.relic] : undefined;
  if (relic) items.append(el('div', { class: 'reward-item' }, icon(relic.art, relic.name), `秘寶「${relic.name}」：${relic.text}`));
  const potion = r.potion ? potionById[r.potion] : undefined;
  if (potion) items.append(el('div', { class: 'reward-item' }, icon(potion.art, potion.name), `忍具「${potion.name}」：${potion.text}`));

  /** 挑完牌（或跳過）才算這個節點結算完，這時候才存檔回地圖 */
  const done = (cardId: string | null): void => { takeCardReward(run, r, cardId); app.backToMap(); };
  const cards = el('div', { class: 'reward-cards' });
  for (const c of r.cards) cards.append(cardNode(c, { onClick: () => done(c.id) }));

  root.append(el('div', { class: 'screen reward' },
    el('h1', {}, r.kind === '大魔物' ? '打倒大魔物' : '打贏了'),
    items,
    r.cards.length ? el('h2', {}, '選一張牌帶走') : '',
    cards,
    el('button', { class: 'btn primary', onclick: () => done(null) }, r.cards.length ? '不拿牌，繼續' : '繼續')));
});
