import { play } from '../audio';
import { cardById } from '../../content/cards';
import { potionById } from '../../content/potions';
import { relicById } from '../../content/relics';
import type { CombatRewards } from '../../engine/rewards';
import { takeCardReward, upgradeCard } from '../../engine/run';
import type { CardInstance } from '../../engine/types';
import { registerScreen } from '../app';
import { screenBg, tierBgKey } from '../screenbg';
import { artUrl } from '../assets';
import { cardNode } from '../cardview';
import { showDeckPicker } from '../deckview';
import { showPotionSwap } from '../potionswap';
import { el } from '../dom';
import { renderHud } from '../hud';
import { sceneView } from '../scene';

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
  const r = props as CombatRewards & { bonusFish?: number; bonusUpgrades?: number };
  const bonus = r.bonusFish ?? 0;
  const ups = r.bonusUpgrades ?? 0;
  // 打倒關主拿到的信物（塔主令牌）先正式亮一次，按了「收下」才進獎勵清單
  // （使用者 2026-09-03：「第一關過關拿的塔主令牌是突然出現的，完全沒看到哪時候獲得」）。
  // 用 props 帶旗標重進同一個畫面：獎勵早就擲好了，重進不會重擲。
  const bossRelic = r.kind === '塔主' && r.relic ? relicById[r.relic] : undefined;
  if (bossRelic && !(props as { tokenShown?: boolean }).tokenShown) {
    renderHud(app, root);
    const url = artUrl('icons', bossRelic.art);
    const hero = artUrl('sprites', 'hero/ninja_win');
    const stack = el('div', { class: 'loot-stack' },
      el('p', { class: 'loot-above' }, bossRelic.text),
      !url.startsWith('data:') ? el('img', { class: 'chest-loot', src: url, alt: bossRelic.name }) : el('div', { class: 'chest-loot-missing' }),
      el('div', { class: 'loot-below' }, el('span', { class: 'loot-kind' }, '關主的信物'), el('b', { class: 'loot-name' }, bossRelic.name)));
    root.append(sceneView({
      art: stack,
      portrait: hero.startsWith('data:') ? undefined : hero,
      speaker: '球球',
      text: `關主倒下的地方掉了東西……是「${bossRelic.name}」！這就是塔主的信物喵！`,
      actions: [el('button', { class: 'btn primary', onclick: () => { play('relic'); app.show('reward', { ...r, tokenShown: true }); } }, '收下')],
    }));
    return;
  }
  renderHud(app, root);

  // 文案一律寫成完整的句子。「＋17 條小魚乾」讀起來像記帳欄位，不像遊戲在跟你講話
  const items = el('div', { class: 'reward-items' },
    el('div', { class: 'reward-item loot' }, icon('icon/fish', ''),
      el('span', { class: 'reward-line' }, `獲得 ${r.fish} 條小魚乾`)));
  // 獎金另起一行：r.fish 是規格 §5.4 的戰利品，兩個數字不併成一個，玩家才看得出獎金有沒有拿到
  if (bonus > 0) items.append(el('div', { class: 'reward-item loot' }, icon('icon/fish', ''),
    el('span', { class: 'reward-line' }, `事件獎金再拿 ${bonus} 條小魚乾`)));
  // 鏡子走廊：打贏鏡中球球的獎勵是挑牌升級。進畫面就開挑牌疊層（不能取消），挑完那一行改寫成升了哪幾張
  let upLine: HTMLElement | null = null;
  const upFilter = (c: CardInstance): boolean => !c.upgraded && cardById[c.cardId]?.pool !== '壞毛病';
  const want = Math.min(ups, run.deck.filter(upFilter).length);
  if (ups > 0) {
    upLine = el('span', { class: 'reward-line' }, want > 0 ? `跟自己過招學到了：升級 ${want} 張牌` : '跟自己過招學到了……但牌組裡已經沒有可以升級的牌');
    const line = upLine;
    items.append(el('div', { class: 'reward-item loot' }, line));
    if (want > 0) showDeckPicker({
      title: want > 1 ? `選 ${want} 張牌升級` : '選一張牌升級', previewUpgrade: true,
      cards: run.deck, pickable: true, cancellable: false, filter: upFilter, pickCount: want,
      onPick: (uid) => settleUpgrades(uid === null ? [] : [uid]), onPickMany: settleUpgrades,
    });
  }
  function settleUpgrades(uids: readonly number[]): void {
    const names: string[] = [];
    for (const uid of uids) {
      const c = run!.deck.find((x) => x.uid === uid);
      if (!c || !upgradeCard(run!, uid)) continue;
      names.push(`「${cardById[c.cardId]?.name ?? c.cardId}」`);
    }
    if (names.length) { play('upgrade'); if (upLine) upLine.textContent = `${names.join('')}升級了`; }   // 直接改存起來的那一行，不找 last-child（後面還會掛忍具列——審查 #12）
  }
  const relic = r.relic ? relicById[r.relic] : undefined;
  if (relic) items.append(el('div', { class: 'reward-item relic' }, icon(relic.art, relic.name),
    el('span', { class: 'reward-line' },
      el('b', {}, `獲得秘寶「${relic.name}」`), el('em', {}, relic.text))));
  // 忍具帶滿收不下：先問要不要換掉一支（換了就把那一行改成「換成了」）
  const missed = r.potionMissed ? potionById[r.potionMissed] : undefined;
  if (missed && r.potionMissed) {
    const line = el('span', { class: 'reward-line' }, el('b', {}, `忍具帶滿了，「${missed.name}」收不下`), el('em', {}, missed.text));
    items.append(el('div', { class: 'reward-item potion' }, icon(missed.art, missed.name), line));
    const newId = r.potionMissed;
    // 350 毫秒內玩家可能已經按「繼續」回地圖：畫面換掉（這一行不在畫面上）就不問了（2026-09-02 稽核 M-1）
    window.setTimeout(() => { if (!line.isConnected) return; showPotionSwap(run, newId, (idx) => {
      // 狀態列要先拆掉舊的再畫：renderHud 只會往 root 再掛一條（實測疊成兩條）
      if (idx >= 0) { play('relic'); line.replaceChildren(el('b', {}, `換成了「${missed.name}」`), el('em', {}, missed.text)); root.querySelector('.hud')?.remove(); renderHud(app, root); }
    }); }, 350);
  }
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
  // 劇場版面（跟事件、貓窩同一套）：三張牌立在畫面中央，戰利品寫在底下的帶子裡
  root.append(sceneView({
    art: r.cards.length ? cards : '',
    speaker: title,
    text: r.cards.length ? '選一張牌帶走，或是放棄。' : '收拾一下戰利品，繼續往上。',
    extra: [items],
    actions: [el('button', { class: 'btn primary', onclick: () => done(null) }, r.cards.length ? '放棄牌並跳過' : '繼續')],
  }));
});
