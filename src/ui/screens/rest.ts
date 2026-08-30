import { cardById } from '../../content/cards';
import { dialogue } from '../../content/dialogue';
import { relicById } from '../../content/relics';
import { rest } from '../../engine/run';
import type { CardInstance, RunState } from '../../engine/types';
import { registerScreen } from '../app';
import { screenBg } from '../screenbg';
import { showDeckPicker } from '../deckview';
import { toast } from '../dialogue';
import { clear, el } from '../dom';
import { renderHud } from '../hud';

registerScreen('rest', (app, root) => {
  root.append(screenBg('bg/screen_rest'));
  if (!app.run) { app.show('title'); return; }
  const run: RunState = app.run;   // 收斂成不可為 null 的區域常數：窄化不會跟著進到下面的內部函式
  // 顯示用的回復量：貓草那類秘寶會加倍，而且不會超過缺的血
  const mult = run.relics.reduce((m, id) => m * (relicById[id]?.hooks.restMultiplier ?? 1), 1);
  const heal = Math.min(run.maxHp - run.hp, Math.floor(run.maxHp * 0.3 * mult));
  const upgradable = (c: CardInstance): boolean => !c.upgraded && cardById[c.cardId]?.pool !== '壞毛病';
  let used = false;   // 一個貓窩只能做一件事

  /** 做完事就換成結果版面（按鈕跟著消失），球球吐一句槽，停一下再回地圖 */
  function afterAction(text: string, line: string): void {
    clear(root);
    renderHud(app, root);
    root.append(el('div', { class: 'screen rest' }, el('h1', {}, '貓窩'), el('p', { class: 'rest-result' }, text)));
    toast(line, '球球');
    window.setTimeout(() => app.backToMap(), 900);
  }

  function show(): void {
    renderHud(app, root);
    const nap = el('button', { class: 'btn primary' }, heal > 0 ? `打盹（回復 ${heal} 點生命）` : '打盹（生命已經滿了）');
    nap.addEventListener('click', () => {
      if (used) return;
      used = true;
      rest(run, '打盹');
      afterAction(`球球睡了一下，回復 ${heal} 點生命。`, dialogue.restLines[0] ?? '');
    });

    const sharpen = el('button', { class: 'btn' }, '磨爪（升級一張牌）');
    // rest(run, '磨爪') 沒有 uid 會回 false，所以一定要先挑牌再叫
    sharpen.addEventListener('click', () => {
      if (used) return;
      showDeckPicker({
        title: '磨爪：選一張牌升級', cards: run.deck, pickable: true, cancellable: true, filter: upgradable,
        onPick: (uid) => {
          const c = uid === null ? undefined : run.deck.find((x) => x.uid === uid);
          if (uid === null || !c || used) return;   // 沒挑就回貓窩再選一次
          const name = cardById[c.cardId]?.name ?? c.cardId;
          used = true;
          rest(run, '磨爪', uid);
          afterAction(`「${name}」磨利了，變成「${name}＋」。`, dialogue.restLines[1] ?? '');
        },
      });
    });
    if (!run.deck.some(upgradable)) sharpen.setAttribute('disabled', 'disabled');

    root.append(el('div', { class: 'screen rest' },
      el('h1', {}, '貓窩'),
      el('p', {}, '貓窩暖暖的，只能挑一件事做。'),
      el('div', { class: 'rest-actions' }, nap, sharpen)));
  }

  // 先把貓窩畫出來，14F 塔主戰前那段獨白再蓋上去播（只播一次，旗標在 run.flags，由結算那次存檔帶走）。
  // 反過來先播的話，玩家會對著一片空白的舞台看獨白。
  show();
  if (run.floor === 14) app.playOnce('restBeforeBoss', dialogue.restBeforeBoss, () => { /* 看完就選 */ });
});
