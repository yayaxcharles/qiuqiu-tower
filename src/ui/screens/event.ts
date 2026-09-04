import { play } from '../audio';
import { cardById } from '../../content/cards';
import { dialogue } from '../../content/dialogue';
import { potionById } from '../../content/potions';
import { relicById } from '../../content/relics';
import { FIXED_EVENT_FLOOR_5, eventById } from '../../content/events';
import { addCard, applyRunEffects, removeCard, upgradeCard, type RunEffectOutcome, type RunGain } from '../../engine/run';
import type { CardDef, CardInstance, RunState } from '../../engine/types';
import { registerScreen } from '../app';
import { artUrl } from '../assets';
import { actVariantKey, clearKeepBg, screenBg } from '../screenbg';
import { cardNode } from '../cardview';
import { showDeckPicker } from '../deckview';
import { showPotionSwap } from '../potionswap';
import { el } from '../dom';
import { burst } from '../fx';
import { renderHud } from '../hud';
import { sceneView } from '../scene';

/**
 * 結果畫面要秀出來的牌：學會的彈出來、升級的打鐵發金光、丟掉的化成煙散掉、被塞的壞毛病抖一下。
 * 本來只有一行字「「淡定」被丟掉了」（使用者 2026-09-02：「感覺不太有回饋感」）。
 */
type ShowKind = 'learn' | 'upgrade' | 'remove' | 'curse';
type Showcase = { kind: ShowKind; card: CardInstance }[];

function showcaseNode(items: Showcase): HTMLElement {
  const box = el('div', { class: 'showcase' });
  for (const it of items) {
    const node = cardNode(it.card);
    node.classList.add('showcase-card', it.kind);
    if (it.kind === 'upgrade') node.classList.add('forged');
    box.append(node);
    // 特效要等節點進到文件裡才量得到位置
    window.setTimeout(() => burst(node, it.kind === 'remove' ? 'smoke' : it.kind === 'curse' ? 'debuff' : 'buff'), it.kind === 'remove' ? 420 : 60);
  }
  return box;
}

/** 拿到的秘寶／忍具放大彈出來（框裡那一列照舊寫名稱與效果） */
function gainsNode(gains: readonly RunGain[]): HTMLElement | '' {
  const box = el('div', { class: 'showcase icons' });
  for (const g of gains) {
    const d = g.kind === '秘寶' ? relicById[g.id] : potionById[g.id];
    const url = d ? artUrl('icons', d.art) : '';
    if (!d || url.startsWith('data:')) continue;
    const node = el('img', { class: 'showcase-icon', src: url, alt: d.name });
    box.append(node);
    window.setTimeout(() => burst(node, 'buff'), 60);
  }
  return box.childElementCount ? box : '';
}

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
    // 帶滿收不下的忍具要寫清楚（不然看起來像拿到了）；換掉舊的之後由 finish 的回呼改成「換成了」
    box.append(el('div', { class: `reward-item ${g.kind === '秘寶' ? 'relic' : 'potion'}${g.missed ? ' missed' : ''}`, 'data-gain': g.id },
      url.startsWith('data:') ? '' : el('img', { src: url, alt: d.name }),
      el('span', { class: 'reward-line' },
        el('b', {}, g.missed ? `忍具帶滿了，「${d.name}」收不下` : `拿到${g.kind}「${d.name}」`), el('em', {}, d.text))));
  }
  return box;
}

function cardName(c: CardInstance): string {
  return (cardById[c.cardId]?.name ?? c.cardId) + (c.upgraded ? '＋' : '');
}

registerScreen('event', (app, root, props) => {
  root.append(screenBg(actVariantKey('bg/screen_event', app.run?.act ?? 1)));
  if (!app.run) { app.show('title'); return; }
  const run: RunState = app.run;   // 收斂成不可為 null 的區域常數：窄化不會跟著進到下面的內部函式
  const { eventId } = props as { eventId?: string };
  const ev = eventId ? eventById[eventId] : undefined;
  // 節點沒帶事件 id 就別停在一片空白，直接回地圖。這裡走 show 不走 backToMap：
  // backToMap 會存檔，而這是「進節點」的當下、節點還沒結算，存下去就違反「節點結算完才存」的規矩
  // （引擎保證事件節點一定帶得到 eventId，所以這條路今天走不到，但規矩要處處成立）
  if (!ev) { app.show('map'); return; }
  const title = ev.title;

  /**
   * 事件的每一條路都收在這個劇場版面：插圖立在中上、結果一句話寫在對白框、按鈕排在框裡
   * （挑牌那條路先不放按鈕，傳 ''）。
   */
  function panel(resultText: string, note: string | null, button: Node | string,
    gains: readonly RunGain[] = [], art?: string, show: Showcase = []): void {
    clearKeepBg(root);
    renderHud(app, root);
    // 結果畫面預設沿用同一張插圖：選完之後畫面整個換掉的話，前後接不起來。
    // 但選項自己有 `resultArt` 時就換成那張——像貓薄荷「採一把」那種，
    // 有專屬的結果圖才看得出「我剛剛真的做了那件事」。
    // 有牌要秀（學會／升級／丟掉）就把牌放在插圖的位置；只拿到秘寶忍具就放大圖示
    const illo = ev ? eventArt(art ?? ev.id) : '';
    const artNode = show.length ? showcaseNode(show) : gains.length ? (gainsNode(gains) || illo) : illo;
    // 賭局要有結果的感覺（使用者 2026-09-03：「碗掀開了應該要有結果，直接小魚乾加減了，沒感受到贏還是輸」）：
    // 引擎記的「中了！／沒中……」不只寫成一行小字，還蓋一個大戳章＋音效
    const won = note?.includes('中了！') ?? false;
    const lost = note?.includes('沒中') ?? false;
    const stamp = won || lost ? el('div', { class: `gamble-stamp ${won ? 'win' : 'lose'}` }, won ? '賭贏了！' : '賭輸了……') : '';
    if (won) play('victory'); else if (lost) play('defeat');
    root.append(sceneView({
      art: artNode,
      speaker: title,
      text: resultText,
      extra: [stamp, gainRows(gains), note ? el('p', { class: 'event-note' }, note) : ''],
      actions: button ? [button] : [],
    }));
  }
  let resultArt: string | undefined;   // 這一次選的選項有沒有專屬結果圖
  const finish = (resultText: string, note: string | null = null, gains: readonly RunGain[] = [], show: Showcase = []): void => {
    panel(resultText, note, el('button', { class: 'btn primary', onclick: () => app.backToMap() }, '繼續'), gains, resultArt, show);
    // 忍具帶滿收不下的（gains 裡標 missed）：結果畫好之後一支一支問要不要換掉舊的
    const missed = gains.filter((g) => g.kind === '忍具' && g.missed);
    const askNext = (i: number): void => {
      const g = missed[i];
      if (!g) return;
      if (!root.querySelector('.reward-item.missed')) return;   // 玩家已經離開這個畫面（2026-09-02 稽核 M-1）
      showPotionSwap(run, g.id, (idx) => {
        if (idx >= 0) {
          play('relic'); root.querySelector('.hud')?.remove(); renderHud(app, root);   // 先拆舊的，不然疊兩條
          const row = root.querySelector(`.reward-item.missed[data-gain="${g.id}"]`);
          const d = potionById[g.id];
          if (row && d) { row.classList.remove('missed'); row.querySelector('b')!.textContent = `換成了「${d.name}」`; }
        }
        askNext(i + 1);
      });
    };
    if (missed.length) window.setTimeout(() => askNext(0), 400);
  };

  /** 選一招（大俠傳功那種）：牌排在中上方（插圖的位置），挑完就收尾，也可以都不要 */
  function chooseCard(resultText: string, defs: CardDef[], gains: readonly RunGain[] = [], upgradedCard?: string): void {
    clearKeepBg(root);
    renderHud(app, root);
    const grid = el('div', { class: 'reward-cards' });
    for (const c of defs) {
      const up = c.id === upgradedCard;   // 開出升級版的那張：照＋版畫、學到就是升級牌（使用者 2026-09-04）
      grid.append(cardNode(up ? { uid: -1, cardId: c.id, upgraded: true } : c, { onClick: () => { const got = addCard(run, c.id, up); finish(resultText, `學會了「${c.name}${up ? '＋' : ''}」`, gains, [{ kind: 'learn', card: got }]); } }));
    }
    root.append(sceneView({
      art: grid,
      speaker: title,
      text: `${resultText}　選一招帶走。`,
      actions: [el('button', { class: 'btn', onclick: () => finish(resultText, '一招都沒挑', gains) }, '都不要')],
    }));
  }

  /**
   * 把 `applyRunEffects` 回來的那一個待處理結果收乾淨。回 null 就是效果都跑完了，
   * 直接顯示結果；要玩家挑牌就開挑牌疊層；是一場架就交給戰鬥畫面。
   *
   * `notes` 是引擎一路記下來的「實際發生了什麼」（賭飯糰中了哪一邊、忍具收不收得下、
   * 隨機撿到哪一張牌）。挑牌那條路自己還會再補一句，所以用 `noteLine` 接起來一起顯示。
   */
  function settle(outcome: RunEffectOutcome, resultText: string, notes: string[], gains: RunGain[], added: CardInstance[] = []): void {
    const noteLine = (extra?: string): string | null => {
      const all = extra ? [...notes, extra] : notes;
      return all.length ? all.join('；') : null;
    };
    // 效果直接塞進牌組的牌（撿到、學會、被塞壞毛病）也要秀
    const gotShow: Showcase = added.map((c) => ({ kind: cardById[c.cardId]?.pool === '壞毛病' ? 'curse' : 'learn', card: c }));
    if (!outcome) { finish(resultText, noteLine(), gains, gotShow); return; }
    if ('needs' in outcome) {
      const up = outcome.needs === 'upgradeCard';
      const filter = up ? (c: CardInstance) => !c.upgraded && cardById[c.cardId]?.pool !== '壞毛病' : () => true;
      // 一張都不合就直接跳過（疊層本身也擋得住鎖死，但沒得挑還開一個空視窗只是煩人）
      const usable = run.deck.filter(filter).length;
      if (usable === 0) { finish(resultText, noteLine(up ? '沒有可以升級的牌' : '沒有牌可以移除'), gains); return; }
      // 要挑的張數可能比牌組裡合格的還多（例如只剩一張沒升級過的牌卻要升兩張），
      // 那就以實際挑得到的為準，不然確認鈕永遠按不下去、玩家被鎖在疊層裡
      const want = Math.min(outcome.n, usable);
      const verb = up ? '升級' : '移除';
      /** 把挑好的牌一次結算完，說明文字寫成「「A」「B」升級了」 */
      const settleCards = (uids: readonly number[]): void => {
        const names: string[] = [];
        const show: Showcase = [...gotShow];
        for (const uid of uids) {
          const c = run.deck.find((x) => x.uid === uid);
          if (!c) continue;
          names.push(cardName(c));
          const before = { ...c };   // 丟掉的牌要用「丟掉前」的樣子秀
          if (up) upgradeCard(run, uid); else removeCard(run, uid);
          show.push(up ? { kind: 'upgrade', card: c } : { kind: 'remove', card: before });
          play(up ? 'upgrade' : 'dodge');
        }
        const note = names.length
          ? `「${names.join('」「')}」${up ? '升級了' : '被丟掉了'}`
          : undefined;
        finish(resultText, noteLine(note), gains, show);
      };
      // 先把結果版面畫出來（含更新過的狀態列）再開疊層，別讓那一排舊選項留在疊層後面：
      // 效果已經跑掉了，選項卻還在，看起來像還能再選一次。按鈕等挑完牌才由 finish 補上。
      panel(resultText, null, '', gains, resultArt);
      showDeckPicker({
        title: want > 1 ? `選 ${want} 張牌${verb}` : `選一張牌${verb}`,
        previewUpgrade: up,   // 升級才需要看「變成什麼樣」；移除不用
        cards: run.deck, pickable: true, cancellable: false, filter,
        pickCount: want,
        onPick: (uid) => settleCards(uid === null ? [] : [uid]),
        onPickMany: settleCards,
      });
      return;
    }
    if ('chooseCard' in outcome) { chooseCard(resultText, outcome.chooseCard, gains, outcome.upgradedCard); return; }
    // 打一場：戰鬥畫面會把獎金一路帶到戰後結算，這裡不存檔（節點還沒結束）
    const f = outcome.fight;
    panel(resultText, noteLine(), el('button', { class: 'btn primary', onclick: () => {
      if (app.run) app.run.pendingAfterFight = f.afterWin;   // 秘寶等獎勵打贏才發（使用者 2026-09-04）
      app.startFight(f.encounterId, false, f.bonusFish, f.bonusUpgrades ?? 0);
    } }, '開打'), gains, resultArt);
  }

  renderHud(app, root);
  const choices: HTMLElement[] = [];
  for (const c of ev.choices) {
    const cost = c.costFish ?? 0;
    // 選項自己的文案就寫著要付多少（「付 30 小魚乾」「買一顆（20 小魚乾）」），這裡不要再補一次價錢；
    // 付不起才補一句話講清楚為什麼按不動。小魚乾由畫面扣，引擎的 applyRunEffects 不管 costFish。
    const poor = cost > run.fish;
    const btn = el('button', { class: 'btn' }, c.label + (poor ? '（小魚乾不夠）' : ''));
    if (poor) btn.setAttribute('disabled', 'disabled');
    else btn.addEventListener('click', () => {
      if (cost > run.fish) return;   // 保險：畫面畫完之後小魚乾又變少的話（目前不會發生）也不能透支
      play('click');
      run.fish = Math.max(0, run.fish - cost);
      resultArt = c.resultArt;
      const notes: string[] = [];
      const gains: RunGain[] = [];
      const had = new Set(run.deck.map((x) => x.uid));
      const outcome = applyRunEffects(run, c.outcome, notes, gains);
      settle(outcome, c.result, notes, gains, run.deck.filter((x) => !had.has(x.uid)));
    });
    choices.push(btn);
  }
  // 劇場版面：插圖立在中上、事件敘述寫在對白框、選項一列一顆排在框裡（事件名當名牌）
  root.append(sceneView({ art: eventArt(ev.id), speaker: title, text: ev.text, actions: choices, column: true }));

  // 5F 大俠傳功：撿到秘笈那段只播一次，旗標寫在 run.flags，由結算那次存檔帶走
  if (ev.id === FIXED_EVENT_FLOOR_5) app.playOnce('secretScroll', dialogue.secretScroll, () => { /* 看完就直接選 */ });
});
