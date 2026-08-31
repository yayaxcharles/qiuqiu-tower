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

  // 文案一律寫成完整的句子。「＋17 條小魚乾」讀起來像記帳欄位，不像遊戲在跟你講話
  const items = el('div', { class: 'reward-items' },
    el('div', { class: 'reward-item loot' }, icon('icon/fish', ''),
      el('span', { class: 'reward-line' }, `獲得 ${r.fish} 條小魚乾`)));
  // 獎金另起一行：r.fish 是規格 §5.4 的戰利品，兩個數字不併成一個，玩家才看得出獎金有沒有拿到
  if (bonus > 0) items.append(el('div', { class: 'reward-item loot' }, icon('icon/fish', ''),
    el('span', { class: 'reward-line' }, `事件獎金再拿 ${bonus} 條小魚乾`)));
  const relic = r.relic ? relicById[r.relic] : undefined;
  if (relic) items.append(el('div', { class: 'reward-item relic' }, icon(relic.art, relic.name),
    el('span', { class: 'reward-line' },
      el('b', {}, `獲得秘寶「${relic.name}」`), el('em', {}, relic.text))));
  const potion = r.potion ? potionById[r.potion] : undefined;
  if (potion) items.append(el('div', { class: 'reward-item potion' }, icon(potion.art, potion.name),
    el('span', { class: 'reward-line' },
      el('b', {}, `獲得忍具「${potion.name}」`), el('em', {}, potion.text))));

  /** 挑完牌（或跳過）才算這個節點結算完，這時候才存檔回地圖 */
  const done = (cardId: string | null): void => { takeCardReward(run, r, cardId); app.backToMap(); };
  const cards = el('div', { class: 'reward-cards' });
  for (const c of r.cards) cards.append(cardNode(c, { onClick: () => done(c.id) }));

  // 標題依戰鬥種類換句話，打倒塔主不該跟打贏小老鼠共用同一句
  const title = r.kind === '塔主' ? '打倒塔主了' : r.kind === '大魔物' ? '打倒大魔物' : '打贏了';
  root.append(el('div', { class: 'screen reward' },
    el('div', { class: 'reward-banner' }, el('h1', {}, title)),
    el('div', { class: 'reward-loot' },
      el('div', { class: 'reward-loot-label' }, '戰利品'),
      items),
    r.cards.length ? el('h2', {}, '選一張牌帶走') : '',
    cards,
    el('button', { class: 'btn primary', onclick: () => done(null) },
      r.cards.length ? '放棄牌並跳過' : '繼續')));
});
