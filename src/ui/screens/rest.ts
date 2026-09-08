import { play } from '../audio';
import { cardById } from '../../content/cards';
import { dialogue, pick } from '../../content/dialogue';
import { fullPrepAvailable, fullPrepHeal, napHeal, rest } from '../../engine/run';
import type { CardInstance, RunState } from '../../engine/types';
import { registerScreen } from '../app';
import { artUrl } from '../assets';
import { actVariantKey, clearKeepBg, screenBg } from '../screenbg';
import { showUpgradeConfirm } from '../confirm';
import { showDeckPicker } from '../deckview';
import { toast } from '../dialogue';
import { el } from '../dom';
import { burst } from '../fx';
import { cardNode } from '../cardview';
import { renderHud } from '../hud';
import { sceneView } from '../scene';

/** 球球蜷在貓窩旁的立繪；圖還沒生好就不放 */
function heroPortrait(): string | undefined {
  const url = artUrl('sprites', 'hero/ninja_curl');
  return url.startsWith('data:') ? undefined : url;
}

registerScreen('rest', (app, root) => {
  root.append(screenBg(actVariantKey('bg/screen_rest', app.run?.act ?? 1)));
  if (!app.run) { app.show('title'); return; }
  const run: RunState = app.run;   // 收斂成不可為 null 的區域常數：窄化不會跟著進到下面的內部函式
  // 顯示用的回復量：貓草那類秘寶會加倍，而且不會超過缺的血
  const heal = Math.min(run.maxHp - run.hp, napHeal(run));   // 算法跟引擎共用（貓草倍率＋貓草種子固定加成）
  const upgradable = (c: CardInstance): boolean => !c.upgraded && cardById[c.cardId]?.pool !== '壞毛病';
  let used = false;   // 一個貓窩只能做一件事

  /** 做完事就換成結果版面（按鈕跟著消失），球球吐一句槽，停一下再回地圖 */
  function afterAction(text: string, line: string, card?: CardInstance): void {
    clearKeepBg(root);
    renderHud(app, root);
    // 磨好的牌放大秀出來、打鐵發金光（本來只有一行字，使用者：「不太有回饋感」）
    let art: HTMLElement | '' = '';
    if (card) {
      const node = cardNode(card);
      node.classList.add('showcase-card', 'upgrade', 'forged');
      art = el('div', { class: 'showcase' }, node);
      window.setTimeout(() => burst(node, 'buff'), 60);
    }
    root.append(sceneView({ art, portrait: heroPortrait(), text }));
    toast(line, '球球');
    window.setTimeout(() => app.backToMap(), card ? 1500 : 900);
  }

  function show(): void {
    renderHud(app, root);
    const finalRest = run.act >= 3 && run.floor === 44;   // 師父前一格：回滿（引擎 napHeal 同一條規則）
    const nap = el('button', { class: 'btn primary' }, heal > 0 ? (finalRest ? `打盹（上樓前好好睡一覺：回滿 ${heal} 點生命）` : `打盹（回復 ${heal} 點生命）`) : '打盹（生命已經滿了）');
    nap.addEventListener('click', () => {
      if (used) return;
      used = true;
      rest(run, '打盹');
      play('heal');
      afterAction(`球球睡了一下，回復 ${heal} 點生命。`, pick(dialogue.restNapLines));
    });

    const sharpen = el('button', { class: 'btn' }, '磨爪（升級一張牌，順便回一成血）');
    // rest(run, '磨爪') 沒有 uid 會回 false，所以一定要先挑牌再叫
    /** 開牌堆挑一張。「再看看」要回到這裡重挑，不是退回貓窩再選一次打盹／磨爪（使用者 2026-09-02 回報）。
     *  磨爪與全力準備共用這條，差在結算叫哪個 choice、結束那句話怎麼寫 */
    const pickCard = (choice: '磨爪' | '全力準備' = '磨爪'): void => {
      showDeckPicker({
        title: `${choice}：選一張牌升級`, cards: run.deck, pickable: true, cancellable: true, filter: upgradable,
        previewUpgrade: true,
        onPick: (uid) => {
          const c = uid === null ? undefined : run.deck.find((x) => x.uid === uid);
          if (uid === null || !c || used) return;   // 按取消才真的回貓窩
          // 先讓玩家看到升級後長什麼樣再決定。按「再看看」就回到牌堆重挑，不算用掉這次機會。
          showUpgradeConfirm(c, (ok) => {
            if (used) return;
            if (!ok) { pickCard(choice); return; }
            const name = cardById[c.cardId]?.name ?? c.cardId;
            used = true;
            const fish = run.fish;
            const hpBefore = run.hp;
            rest(run, choice, uid);
            play('upgrade');
            const line = choice === '全力準備'
              ? `「${name}」磨利了，變成「${name}＋」；${fish} 條小魚乾全吃了，回復 ${run.hp - hpBefore} 點生命。`
              : `「${name}」磨利了，變成「${name}＋」。`;
            afterAction(line, pick(dialogue.restSharpenLines), c);
          });
        },
      });
    };
    sharpen.addEventListener('click', () => { if (!used) pickCard(); });
    if (!run.deck.some(upgradable)) sharpen.setAttribute('disabled', 'disabled');

    // 全力準備（44F、難度 4 起；玩家 2026-09-08 建議）：升級一張牌＋回一成血，再把全部小魚乾換成生命（÷10）、魚乾歸零。
    // 打盹照舊回滿，這個給「上樓前想升級又想多回一點」的人。血滿或魚乾不到 10 條時跟磨爪沒差，就不擺出來
    let prep: HTMLElement | null = null;
    if (fullPrepAvailable(run) && run.fish >= 10 && run.hp < run.maxHp) {
      const h = fullPrepHeal(run);
      const gain = Math.min(h.total, run.maxHp - run.hp);
      prep = el('button', { class: 'btn two-line' },
        el('span', {}, '全力準備（升級一張牌）'),
        el('span', { class: 'sub' }, `回 ${gain} 點：一成 ${h.tenth} ＋ ${run.fish} 條小魚乾換 ${h.fromFish}${gain < h.total ? '（回到滿）' : ''}，魚乾歸零`));
      prep.addEventListener('click', () => { if (!used) pickCard('全力準備'); });
      if (!run.deck.some(upgradable)) prep.setAttribute('disabled', 'disabled');
    }

    // 劇場版面：底圖就是貓窩本身，球球蜷在左邊，對白框裡直接放兩個選項
    root.append(sceneView({
      portrait: heroPortrait(),
      speaker: '貓窩',
      text: '貓窩暖暖的，只能挑一件事做。',
      actions: prep ? [nap, sharpen, prep] : [nap, sharpen],
    }));
  }

  // 先把貓窩畫出來，14F 塔主戰前那段獨白再蓋上去播（只播一次，旗標在 run.flags，由結算那次存檔帶走）。
  // 反過來先播的話，玩家會對著一片空白的舞台看獨白。
  show();
  // 「floor === 14」在跨關累計後只會中第一關（第二三關是 29、44）——用關內樓層判斷，
  // 獨白內容也依關數換（前兩關的關主不是師父，師父的戲留到第三關）
  if (run.floor % 15 === 14) {
    const monologue = dialogue.restBeforeBossByAct[run.act - 1] ?? dialogue.restBeforeBossByAct[0]!;
    app.playOnce(`restBeforeBoss${run.act}`, monologue, () => { /* 看完就選 */ });
  }
});
