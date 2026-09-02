import { actWalkTransition } from '../acttransition';
import { play } from '../audio';
import { relicById } from '../../content/relics';
import { ACT_NAMES, addCard, advanceAct, rollActCards, rollActRelics, takeRelic } from '../../engine/run';
import { registerScreen } from '../app';
import { clearKeepBg, screenBg } from '../screenbg';
import { artUrl } from '../assets';
import { el } from '../dom';
import { cardNode } from '../cardview';
import { renderHud } from '../hud';
import { sceneView } from '../scene';

/**
 * 過關畫面：打倒第一、二關的關主之後（第三關直接進結算，不走這裡）。
 * 做三件事：宣布回滿血、大魔物級秘寶三選一、進下一關。
 *
 * 秘寶只擲一次（`rollActRelics` 會推進整局的亂數），畫面重畫不能重擲，
 * 不然玩家開著開發工具就能刷選項。挑完才呼叫 `advanceAct`——它會回滿血、
 * 生下一關的地圖；存檔交給 backToMap()（規矩：節點結算完才存）。
 */
registerScreen('actclear', (app, root) => {
  root.append(screenBg('bg/screen_result_win'));
  const run = app.run;
  if (!run) { app.show('title'); return; }
  const picks = rollActRelics(run);
  const cardPicks = rollActCards(run);
  let pickedCard: string | null = null;   // 只擲一次、只挑一張；重畫不重擲
  let pickedRelic: string | null = null;
  play('victory');

  const done = (relicId: string | null): void => {
    if (relicId) { takeRelic(run, relicId); play('relic'); }
    advanceAct(run);
    // 三秒的走路轉場（使用者點名要的儀式感）：背景已經是下一關的色調，
    // 走完才落地到新地圖；backToMap 在轉場回呼裡跑＝存檔照舊在節點結算時寫
    actWalkTransition(app.stage, run.floor + 1, () => app.backToMap());
  };

  function render(): void {
    if (!run) return;
    clearKeepBg(root);
    renderHud(app, root);
    // 秘寶三選一：大圖示的方塊，點了亮起、可換選；跟牌一樣按「出發」才一起結算
    const relicRow = el('div', { class: 'pick-row' });
    for (const id of picks) {
      const d = relicById[id];
      if (!d) continue;
      const url = artUrl('icons', d.art);
      const node = el('div', { class: `pick-tile${pickedRelic === id ? ' selected' : ''}` },
        url.startsWith('data:') ? '' : el('img', { src: url, alt: d.name }),
        el('b', {}, d.name),
        el('em', {}, d.text));
      node.addEventListener('click', () => { pickedRelic = pickedRelic === id ? null : id; play('click'); render(); });
      relicRow.append(node);
    }
    // 稀有牌三選一：點了亮起、可換選；帶不帶都能出發
    const cardRow = el('div', { class: 'reward-cards' });
    for (const c of cardPicks) {
      cardRow.append(cardNode(c, {
        small: true,
        selected: pickedCard === c.id,
        onClick: () => { pickedCard = pickedCard === c.id ? null : c.id; play('click'); render(); },
      }));
    }
    const next = ACT_NAMES[run.act] ?? '塔頂';
    const goLabel = pickedCard ? `帶著新招上${next}` : `出發，上${next}`;
    // 劇場版面：秘寶一排、牌一排立在畫面中央；說明與出發鈕在底下的帶子裡
    root.append(sceneView({
      art: el('div', { class: 'scene-picks' },
        picks.length ? el('div', { class: 'pick-label' }, '挑一件秘寶') : '',
        picks.length ? relicRow : '',
        cardPicks.length ? el('div', { class: 'pick-label' }, '挑一張牌（可不挑）') : '',
        cardPicks.length ? cardRow : ''),
      speaker: `${ACT_NAMES[run.act - 1] ?? ''}破關`,
      text: `球球歇了口氣，體力全滿。前方就是${next}。`,
      actions: [el('button', {
        class: 'btn primary',
        onclick: () => { if (pickedCard) addCard(run, pickedCard); done(pickedRelic); },
      }, goLabel)],
    }));
  }
  render();
});
