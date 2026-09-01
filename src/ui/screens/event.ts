import { cardById } from '../../content/cards';
import { dialogue } from '../../content/dialogue';
import { potionById } from '../../content/potions';
import { relicById } from '../../content/relics';
import { FIXED_EVENT_FLOOR_5, eventById } from '../../content/events';
import { addCard, applyRunEffects, removeCard, upgradeCard, type RunEffectOutcome, type RunGain } from '../../engine/run';
import type { CardDef, CardInstance, RunState } from '../../engine/types';
import { registerScreen } from '../app';
import { artUrl } from '../assets';
import { clearKeepBg, screenBg } from '../screenbg';
import { cardNode } from '../cardview';
import { showDeckPicker } from '../deckview';
import { el } from '../dom';
import { renderHud } from '../hud';

/**
 * 事件的插圖。十個事件本來共用同一張空走廊當底圖——文字寫著「轉角站著一隻橘貓山賊」，
 * 畫面上卻什麼都沒有，故事裡的角色不在畫面上，難怪沒有故事感。
 * 每個事件配一張自己的插圖；還沒生好的就不放（`artUrl` 會回灰剪影，那比沒有更糟）。
 */
function eventArt(id: string): HTMLElement | string {
  const url = artUrl('bg', `bg/event_${id}`);
  return url.startsWith('data:') ? '' : el('img', { class: 'event-art', src: url, alt: '' });
}

/**
 * 事件拿到的秘寶／忍具，排成跟戰利品畫面同一種列：圖示、名稱、效果各就各位。
 * 本來只有一行「拿到忍具「鐵爪套」「小魚乾串」」，看不出那是什麼、有什麼用。
 */
function gainRows(gains: readonly RunGain[]): HTMLElement | string {
  if (!gains.length) return '';
  const box = el('div', { class: 'reward-items event-gains' });
  for (const g of gains) {
    const d = g.kind === '秘寶' ? relicById[g.id] : potionById[g.id];
    if (!d) continue;
    const url = artUrl('icons', d.art);
    box.append(el('div', { class: `reward-item ${g.kind === '秘寶' ? 'relic' : 'potion'}` },
      url.startsWith('data:') ? '' : el('img', { src: url, alt: d.name }),
      el('span', { class: 'reward-line' },
        el('b', {}, `拿到${g.kind}「${d.name}」`), el('em', {}, d.text))));
  }
  return box;
}

function cardName(c: CardInstance): string {
  return (cardById[c.cardId]?.name ?? c.cardId) + (c.upgraded ? '＋' : '');
}

registerScreen('event', (app, root, props) => {
  root.append(screenBg('bg/screen_event'));
  if (!app.run) { app.show('title'); return; }
  const run: RunState = app.run;   // 收斂成不可為 null 的區域常數：窄化不會跟著進到下面的內部函式
  const { eventId } = props as { eventId?: string };
  const ev = eventId ? eventById[eventId] : undefined;
  // 節點沒帶事件 id 就別停在一片空白，直接回地圖。這裡走 show 不走 backToMap：
  // backToMap 會存檔，而這是「進節點」的當下、節點還沒結算，存下去就違反「節點結算完才存」的規矩
  // （引擎保證事件節點一定帶得到 eventId，所以這條路今天走不到，但規矩要處處成立）
  if (!ev) { app.show('map'); return; }

  /** 事件的每一條路都收在這個版面：結果一句話，加一顆按鈕（挑牌那條路先不放按鈕，傳 ''） */
  function panel(resultText: string, note: string | null, button: Node | string,
    gains: readonly RunGain[] = [], art?: string): void {
    clearKeepBg(root);
    renderHud(app, root);
    // 結果畫面預設沿用同一張插圖：選完之後畫面整個換掉的話，前後接不起來。
    // 但選項自己有 `resultArt` 時就換成那張——像貓薄荷「採一把」那種，
    // 有專屬的結果圖才看得出「我剛剛真的做了那件事」。
    root.append(el('div', { class: 'screen event' },
      ev ? eventArt(art ?? ev.id) : '',
      el('p', { class: 'event-result' }, resultText),
      gainRows(gains),
      note ? el('p', { class: 'event-note' }, note) : '',
      button));
  }
  let resultArt: string | undefined;   // 這一次選的選項有沒有專屬結果圖
  const finish = (resultText: string, note: string | null = null, gains: readonly RunGain[] = []): void =>
    panel(resultText, note, el('button', { class: 'btn primary', onclick: () => app.backToMap() }, '繼續'), gains, resultArt);

  /** 選一招（大俠傳功那種）：挑完就收尾，也可以都不要 */
  function chooseCard(resultText: string, defs: CardDef[], gains: readonly RunGain[] = []): void {
    clearKeepBg(root);
    renderHud(app, root);
    const grid = el('div', { class: 'reward-cards' });
    for (const c of defs) grid.append(cardNode(c, { onClick: () => { addCard(run, c.id); finish(resultText, `學會了「${c.name}」`, gains); } }));
    root.append(el('div', { class: 'screen event' },
      el('p', { class: 'event-result' }, resultText),
      el('h2', {}, '選一招'),
      grid,
      el('button', { class: 'btn', onclick: () => finish(resultText, '一招都沒挑', gains) }, '都不要')));
  }

  /**
   * 把 `applyRunEffects` 回來的那一個待處理結果收乾淨。回 null 就是效果都跑完了，
   * 直接顯示結果；要玩家挑牌就開挑牌疊層；是一場架就交給戰鬥畫面。
   *
   * `notes` 是引擎一路記下來的「實際發生了什麼」（賭飯糰中了哪一邊、忍具收不收得下、
   * 隨機撿到哪一張牌）。挑牌那條路自己還會再補一句，所以用 `noteLine` 接起來一起顯示。
   */
  function settle(outcome: RunEffectOutcome, resultText: string, notes: string[], gains: RunGain[]): void {
    const noteLine = (extra?: string): string | null => {
      const all = extra ? [...notes, extra] : notes;
      return all.length ? all.join('；') : null;
    };
    if (!outcome) { finish(resultText, noteLine(), gains); return; }
    if ('needs' in outcome) {
      const up = outcome.needs === 'upgradeCard';
      const filter = up ? (c: CardInstance) => !c.upgraded && cardById[c.cardId]?.pool !== '壞毛病' : () => true;
      // 一張都不合就直接跳過（疊層本身也擋得住鎖死，但沒得挑還開一個空視窗只是煩人）
      if (!run.deck.some(filter)) { finish(resultText, noteLine(up ? '沒有可以升級的牌' : '沒有牌可以移除'), gains); return; }
      // 先把結果版面畫出來（含更新過的狀態列）再開疊層，別讓那一排舊選項留在疊層後面：
      // 效果已經跑掉了，選項卻還在，看起來像還能再選一次。按鈕等挑完牌才由 finish 補上。
      panel(resultText, null, '', gains, resultArt);
      showDeckPicker({
        title: up ? '選一張牌升級' : '選一張牌移除',
        previewUpgrade: up,   // 升級才需要看「變成什麼樣」；移除不用
        cards: run.deck, pickable: true, cancellable: false, filter,
        onPick: (uid) => {
          const c = uid === null ? undefined : run.deck.find((x) => x.uid === uid);
          if (uid === null || !c) { finish(resultText, noteLine(), gains); return; }
          const name = cardName(c);
          if (up) { upgradeCard(run, uid); finish(resultText, noteLine(`「${name}」升級了`), gains); }
          else { removeCard(run, uid); finish(resultText, noteLine(`丟掉了「${name}」`), gains); }
        },
      });
      return;
    }
    if ('chooseCard' in outcome) { chooseCard(resultText, outcome.chooseCard, gains); return; }
    // 打一場：戰鬥畫面會把獎金一路帶到戰後結算，這裡不存檔（節點還沒結束）
    const f = outcome.fight;
    panel(resultText, noteLine(), el('button', { class: 'btn primary', onclick: () => app.startFight(f.encounterId, false, f.bonusFish) }, '開打'), gains, resultArt);
  }

  renderHud(app, root);
  const choices = el('div', { class: 'event-choices' });
  for (const c of ev.choices) {
    const cost = c.costFish ?? 0;
    // 選項自己的文案就寫著要付多少（「付 30 小魚乾」「買一顆（20 小魚乾）」），這裡不要再補一次價錢；
    // 付不起才補一句話講清楚為什麼按不動。小魚乾由畫面扣，引擎的 applyRunEffects 不管 costFish。
    const poor = cost > run.fish;
    const btn = el('button', { class: 'btn' }, c.label + (poor ? '（小魚乾不夠）' : ''));
    if (poor) btn.setAttribute('disabled', 'disabled');
    else btn.addEventListener('click', () => {
      if (cost > run.fish) return;   // 保險：畫面畫完之後小魚乾又變少的話（目前不會發生）也不能透支
      run.fish = Math.max(0, run.fish - cost);
      resultArt = c.resultArt;
      const notes: string[] = [];
      const gains: RunGain[] = [];
      settle(applyRunEffects(run, c.outcome, notes, gains), c.result, notes, gains);
    });
    choices.append(btn);
  }
  root.append(el('div', { class: 'screen event' },
    el('h1', {}, ev.title),
    eventArt(ev.id),
    el('p', { class: 'event-text' }, ev.text),
    choices));

  // 5F 大俠傳功：撿到秘笈那段只播一次，旗標寫在 run.flags，由結算那次存檔帶走
  if (ev.id === FIXED_EVENT_FLOOR_5) app.playOnce('secretScroll', dialogue.secretScroll, () => { /* 看完就直接選 */ });
});
