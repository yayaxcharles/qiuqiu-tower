import { play } from '../audio';
import { cardById } from '../../content/cards';
import { dialogue } from '../../content/dialogue';
import { potionById } from '../../content/potions';
import { relicById } from '../../content/relics';
import { FIXED_EVENT_FLOOR_5, eventById } from '../../content/events';
import { addCard, applyRunEffects, removeCard, runMods, runRng, upgradeCard, type RunEffectOutcome, type RunGain } from '../../engine/run';
import { allVoted, settleVotes } from '../../engine/vote';
import type { CardDef, CardInstance, RunState } from '../../engine/types';
import { registerScreen } from '../app';
import { artUrl } from '../assets';
import { actVariantKey, clearKeepBg, screenBg } from '../screenbg';
import { cardNode } from '../cardview';
import { showUpgradeConfirm } from '../confirm';
import { showDeckPicker } from '../deckview';
import { showPotionSwap } from '../potionswap';
import { el } from '../dom';
import { burst } from '../fx';
import { renderHud } from '../hud';
import { sceneView } from '../scene';
import { me } from '../../engine/runplayer';

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
    // 特效包一層再放：`.card` 自己是 `overflow: hidden`，丟牌那團煙（201 像素、中心壓得低）
    // 掛在牌上會被裁掉下緣約 48 像素，牌底出現一條硬邊（稽核 2026-09-10 低-1）。
    // `.fx-host` 沒有裁切，尺寸完全跟著牌走，版面一格都不動。
    const host = el('span', { class: 'fx-host' }, node);
    box.append(host);
    // 特效要等節點進到文件裡才量得到位置
    window.setTimeout(() => burst(host, it.kind === 'remove' ? 'smoke' : it.kind === 'curse' ? 'debuff' : 'buff'), it.kind === 'remove' ? 420 : 60);
  }
  return box;
}

/**
 * 拿到的秘寶／忍具放大彈出來，**效果直接寫在那顆跳動的圖示上方**
 *（使用者 2026-09-10：「效果應該要在跳動的這個圖案上方也有大字顯示」）。
 *
 * 原本圖示是孤零零一顆，要往下掃到對白框裡那一列才知道它是什麼、有什麼用——
 * 跟紙箱那次同一個毛病（說明離主體太遠）。排法照紙箱退路版那一套：
 * 效果在上、圖示在中、「秘寶／忍具＋名字」在下，一眼從上讀到下。
 * **不共用 `.loot-stack` 那個類別**：它自己帶著一條 `.scene:has(.loot-stack) .scene-art { top: 56px }`，
 * 跟 `.scene-art:has(.showcase)` 的 `translate(-50%, -78%)` 疊起來會把整塊推到畫面外
 *（實測效果那行整條被切掉）。另開 `.gain-stack`，只借排版不借定位。
 * 帶滿收不下的忍具不放大（那不是「拿到」），留給對白框裡那一列去說明。
 */
function gainsNode(gains: readonly RunGain[]): HTMLElement | '' {
  const box = el('div', { class: 'showcase icons' });
  for (const g of gains) {
    if (g.missed) continue;
    const d = g.kind === '秘寶' ? relicById[g.id] : potionById[g.id];
    const url = d ? artUrl('icons', d.art) : '';
    if (!d || url.startsWith('data:')) continue;
    // 包一層才放得下特效：`<img>` 不能有子節點（見 fx.ts 的 burst）
    const node = el('img', { class: 'showcase-icon', src: url, alt: d.name });
    const host = el('span', { class: 'fx-host' }, node);
    box.append(el('div', { class: 'gain-stack' },
      el('p', { class: 'loot-above' }, d.text),
      host,
      el('div', { class: 'loot-below' },
        el('span', { class: 'loot-kind' }, g.kind),
        el('b', { class: 'loot-name' }, d.name))));
    window.setTimeout(() => burst(host, 'buff'), 60);
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

  /*
   * 兩個人一起遇到同一件事（連線版 2026-09-11）。
   *
   * **選項用投票**（跟選路線一樣）：兩個人各投一個，投一樣就照那個走、
   * 投不一樣就擲一次骰（規則與理由見 `engine/vote.ts`）。一件事只會發生一次，
   * 總不能一個人在賭博、另一個人在摸貓。
   *
   * **效果對兩個人各跑一次**：回血就兩個人都回、扣錢就兩個人都扣。
   * 那是「這件事發生在你們身上」最直觀的意思，也跟戰利品「各拿一份」同一套。
   */
  const seat = app.seat;
  const coop = app.coop;
  /*
   * **選擇不可以在畫面收尾時清掉**（2026-09-11 實測的坑）。
   *
   * 這裡本來掛了一個 `clearPicks` 的收尾，想說離開這一格就清乾淨。可是「有人投票」
   * 的當下要重畫畫面，而重畫＝`app.show()`＝**先跑收尾再重建**——於是每投一票就被
   * 自己清掉一次，兩邊永遠湊不齊、畫面完全沒反應、主控台也不會叫。
   * 清的時機只有一個：**票結算完的那一刻**（下面設定的地方）。
   */
  let chosen = -1;   // 已經定案的選項（-1＝還在投票）

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
    /**
     * **插圖當底、戰利品疊在上面**（2026-09-11）。
     *
     * 原本是三選一：有牌就放牌、有秘寶忍具就放圖示、都沒有才放插圖。
     * 那表示**凡是有收穫的選項都看不到結果圖**——而「有收穫」正是最值得畫一張圖的時候。
     * 實際數過（2026-09-11 稽核重數）：60 個配了結果圖的選項裡，24 個沒有戰利品、
     * 舊寫法看得到；另外 36 個有收穫的（13 個只給忍具秘寶、21 個只給牌、2 個兩者都有）
     * 在舊寫法下永遠看不到自己的結果圖。
     * 最有力的證據是這段註解自己舉的例子：貓薄荷「採一把」拿兩支忍具，
     * 所以那張 `catnip_field_take` 從上線到現在**從來沒被玩家看見過**（稽核 2026-09-11 高-1）。
     *
     * 改成疊層：插圖鋪底，牌與圖示浮在它前面。兩者都看得到，版面高度不變
     *（`.event-art-stack` 是 `position: relative`，疊上去的那層絕對定位、不佔空間）。
     * 插圖沒生好時退回原本的行為，不會開天窗。
     */
    const illo = ev ? eventArt(art ?? ev.id) : '';
    const loot = show.length ? showcaseNode(show) : gains.length ? gainsNode(gains) : '';
    const artNode = loot && illo
      ? el('div', { class: 'event-art-stack' }, illo, el('div', { class: 'event-art-loot' }, loot))
      : (loot || illo);
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
      }, missed.length > 1 ? { progress: `第 ${i + 1}／${missed.length} 支`, seat } : { seat });
    };
    if (missed.length) window.setTimeout(() => askNext(0), 400);
  };

  /** 選一招（大俠傳功那種）：牌排在中上方（插圖的位置），挑完就收尾，也可以都不要 */
  function chooseCard(resultText: string, defs: CardDef[], gains: readonly RunGain[] = [], upgradedCard?: string): void {
    clearKeepBg(root);
    renderHud(app, root);
    /*
     * **兩個人時要等兩邊都挑完才動手**（跟挑牌升級同一條理由）：學到的牌會進自己的牌組，
     * 而牌組是兩台機器都在模擬的，對面不知道我學了哪一張就會分岔。
     * `''` ＝一招都不要（空字串比 null 好傳，也不會跟任何牌的編號撞）。
     */
    const learn = (cardId: string): void => {
      if (!coop) { takeLearn(seat, cardId); return; }
      coop.onPick((kind) => {
        if (kind !== 'evlearn') return;
        const all = coop.picks('evlearn', run.players.length);
        if (!allVoted(all, run.players.map((p) => !p.down))) return;
        coop.clearPicks('evlearn');
        all.forEach((v, i) => { if (v) takeLearn(i, v, i !== seat); });
        if (!all[seat]) finish(resultText, '一招都沒挑', gains);
      });
      coop.pick('evlearn', cardId);
    };
    const takeLearn = (who: number, cardId: string, quiet = false): void => {
      const def = defs.find((d) => d.id === cardId);
      if (!def) return;
      const up = def.id === upgradedCard;
      const got = addCard(run, def.id, up, who);
      if (quiet) return;
      finish(resultText, `學會了「${def.name}${up ? '＋' : ''}」`, gains, [{ kind: 'learn', card: got }]);
    };

    const grid = el('div', { class: 'reward-cards' });
    const mine = coop ? coop.picks('evlearn', run.players.length)[seat] : null;
    for (const c of defs) {
      const up = c.id === upgradedCard;   // 開出升級版的那張：照＋版畫、學到就是升級牌（使用者 2026-09-04）
      grid.append(cardNode(up ? { uid: -1, cardId: c.id, upgraded: true } : c,
        mine !== null && mine !== undefined ? { disabled: true } : { onClick: () => learn(c.id) }));
    }
    root.append(sceneView({
      art: grid,
      speaker: title,
      text: mine ? `${resultText}　挑好了，等同伴挑完。` : `${resultText}　選一招帶走。`,
      actions: [el('button', { class: 'btn', onclick: () => learn('') }, '都不要')],
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
      const usable = me(run, seat).deck.filter(filter).length;
      if (usable === 0) { finish(resultText, noteLine(up ? '沒有可以升級的牌' : '沒有牌可以移除'), gains); return; }
      // 要挑的張數可能比牌組裡合格的還多（例如只剩一張沒升級過的牌卻要升兩張），
      // 那就以實際挑得到的為準，不然確認鈕永遠按不下去、玩家被鎖在疊層裡
      const want = Math.min(outcome.n, usable);
      const verb = up ? '升級' : '移除';
      /**
       * 把挑好的牌一次結算完，說明文字寫成「「A」「B」升級了」。
       *
       * **兩個人時要等兩邊都挑完才動手**：挑的是自己的牌，但牌組是兩台機器都在模擬的東西，
       * 對面不知道我丟了哪一張，下一場我抽到的牌就對不上、當場分岔。
       * 走「大家各選一個」那條通道（`evcard`），值是牌號用逗號串起來（空字串＝一張都沒挑）。
       */
      const applyPicks = (who: number, uids: readonly number[]): { names: string[]; show: Showcase } => {
        const names: string[] = [];
        const show: Showcase = [];
        for (const uid of uids) {
          const c = me(run, who).deck.find((x) => x.uid === uid);
          if (!c) continue;
          names.push(cardName(c));
          const before = { ...c };   // 丟掉的牌要用「丟掉前」的樣子秀
          if (up) upgradeCard(run, uid, who); else removeCard(run, uid, who);
          if (who === seat) show.push(up ? { kind: 'upgrade', card: c } : { kind: 'remove', card: before });
        }
        return { names, show };
      };
      const finishPicks = (names: string[], show: Showcase): void => {
        if (names.length) play(up ? 'upgrade' : 'dodge');
        const note = names.length
          ? `「${names.join('」「')}」${up ? '升級了' : '被丟掉了'}`
          : undefined;
        finish(resultText, noteLine(note), gains, [...gotShow, ...show]);
      };
      const settleCards = (uids: readonly number[]): void => {
        if (!coop) { const r = applyPicks(seat, uids); finishPicks(r.names, r.show); return; }
        coop.onPick((kind) => {
          if (kind !== 'evcard') return;
          const all = coop.picks('evcard', run.players.length);
          if (!allVoted(all, run.players.map((p) => !p.down))) return;
          coop.clearPicks('evcard');   // 結算完才清（收尾時清會把票清掉）
          // 照座位順序套，兩台機器算出來的牌組才一樣
          const mineOut = { names: [] as string[], show: [] as Showcase };
          all.forEach((v, i) => {
            if (v === null) return;
            const list = v ? v.split(',').map(Number) : [];
            const r = applyPicks(i, list);
            if (i === seat) { mineOut.names = r.names; mineOut.show = r.show; }
          });
          finishPicks(mineOut.names, mineOut.show);
        });
        coop.pick('evcard', uids.join(','));
      };
      // 先把結果版面畫出來（含更新過的狀態列）再開疊層，別讓那一排舊選項留在疊層後面：
      // 效果已經跑掉了，選項卻還在，看起來像還能再選一次。按鈕等挑完牌才由 finish 補上。
      panel(resultText, null, '', gains, resultArt);
      const openPicker = (): void => showDeckPicker({
        title: want > 1 ? `選 ${want} 張牌${verb}` : `選一張牌${verb}`,
        previewUpgrade: up,   // 升級才需要看「變成什麼樣」；移除不用
        cards: me(run, seat).deck, pickable: true, cancellable: false, filter,
        pickCount: want,
        onPick: (uid) => {
          if (uid === null) { settleCards([]); return; }
          const c = me(run, seat).deck.find((x) => x.uid === uid);
          // 升級一張時跟貓窩磨爪一樣先問「就磨這張／再看看」，按「再看看」回牌堆重挑
          //（使用者 2026-09-06：事件裡選好牌左鍵就直接升級了，其他地方都有這一步）
          if (up && c) { showUpgradeConfirm(c, (ok) => { if (ok) settleCards([uid]); else openPicker(); }); return; }
          settleCards([uid]);
        },
        onPickMany: settleCards,
      });
      openPicker();
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

  /**
   * 真的去做這個選項。單機是按下去就跑；連線是**兩個人都投完票之後**才跑，
   * 而且兩台機器各跑一次（引擎是決定性的，跑出來一樣）。
   */
  function take(index: number): void {
    const c = ev?.choices[index];
    if (!c) return;
    const cost = c.costFish ?? 0;
    resultArt = c.resultArt;
    const notes: string[] = [];
    const gains: RunGain[] = [];
    const had = new Set(me(run, seat).deck.map((x) => x.uid));
    /*
     * 小魚乾由畫面扣（引擎的 `applyRunEffects` 不管 `costFish`）——
     * 連線時**兩個人各付各的**：這件事是兩個人一起做的，好處也兩個人一起拿。
     * 付不起的人扣到 0 為止（`Math.max`），不會變成負的。
     */
    const seats = coop ? run.players.map((_, i) => i).filter((i) => !run.players[i]?.down) : [seat];
    for (const i of seats) me(run, i).fish = Math.max(0, me(run, i).fish - cost);
    // 效果一位一位跑，順序固定（座位由小到大），兩台機器抽出來的東西才一樣
    let outcome: RunEffectOutcome = null;
    for (const i of seats) {
      const o = applyRunEffects(run, c.outcome, i === seat ? notes : undefined, i === seat ? gains : undefined, i);
      if (i === seat) outcome = o;
    }
    settle(outcome, c.result, notes, gains, me(run, seat).deck.filter((x) => !had.has(x.uid)));
  }

  renderHud(app, root);
  const choices: HTMLElement[] = [];
  const votes = coop ? coop.picks('event', run.players.length) : [];
  ev.choices.forEach((c, index) => {
    const cost = c.costFish ?? 0;
    // 選項自己的文案就寫著要付多少（「付 30 小魚乾」「買一顆（20 小魚乾）」），這裡不要再補一次價錢；
    // 付不起才補一句話講清楚為什麼按不動。
    const poor = cost > me(run, seat).fish;
    // 誰投了這一項：兩個人才知道對方想選什麼（跟地圖上的小記號同一套）
    const who = votes.map((v, i) => (v === String(index) ? (i === seat ? '你' : '同伴') : '')).filter(Boolean);
    const btn = el('button', { class: 'btn' }, c.label + (poor ? '（小魚乾不夠）' : '') + (who.length ? `　← ${who.join('、')}` : ''));
    if (poor || (coop && votes[seat] !== null && votes[seat] !== undefined)) btn.setAttribute('disabled', 'disabled');
    else btn.addEventListener('click', () => {
      if (cost > me(run, seat).fish) return;   // 保險：畫面畫完之後小魚乾又變少的話也不能透支
      play('click');
      if (coop) { coop.pick('event', String(index)); return; }   // 兩個人都投完才真的做（見 onPick）
      take(index);
    });
    choices.push(btn);
  });
  /**
   * 難度 4 起的共用提示（2026-09-11）。
   *
   * `run.ts` 對事件效果有兩條看不見的修正：扣血 ×1.5（`unlucky`）、賭運氣的成功率 ×0.7。
   * 選項上寫的是難度 1～3 的值，難度 4 以上照著按就會被坑（文案審閱 2026-09-11 列為高優先）。
   *
   * **寫成一行共用提示，不是塞進每個按鈕**：把兩組數字並列寫進標籤會讓最長的那顆變成 73 個字
   *（實測「買一顆吃（花費 20 條…難度 1–3 50%／難度 4–5 35%…）」），而選項是一列一顆撐滿框的，
   * 三個選項的事件會把對白框頂高到蓋住插圖 38 像素。一行提示講完同一件事，佔一行。
   *
   * 只在真的會受影響的事件出現（有扣血或有賭運氣），沒受影響的不要平白嚇人。
   */
  /**
   * 只看最上層就夠，**不用遞迴進 `gamble` 的輸贏兩邊**（稽核 2026-09-11 提過，但那一條是多慮的）：
   * 藏在 `gamble` 裡的扣血確實看不到，可是那個 `gamble` 本身就被 ×0.7 改過、
   * 已經讓提示出現了，所以不會有「該提示卻沒提示」的情形。
   */
  const risky = ev.choices.some((c) => c.outcome.some((o) => o.kind === 'damage' || o.kind === 'gamble'));
  const extra = runMods(run).unlucky && risky
    ? [el('p', { class: 'event-note' }, '這個難度下：事件造成的傷害 ×1.5，賭運氣的成功率 ×0.7（選項上寫的是基本值）')]
    : [];
  // 劇場版面：插圖立在中上、事件敘述寫在對白框、選項一列一顆排在框裡（事件名當名牌）
  root.append(sceneView({ art: eventArt(ev.id), speaker: title, text: ev.text, extra, actions: choices, column: true }));

  if (coop) {
    coop.onPick((kind) => {
      if (kind !== 'event' || chosen >= 0 || !ev) return;
      const now = coop.picks('event', run.players.length);
      if (!allVoted(now, run.players.map((p) => !p.down))) { app.show('event', props); return; }
      const pickStr = settleVotes(runRng(run), now);
      if (pickStr === null) return;
      chosen = Number(pickStr);
      coop.clearPicks('event');
      take(chosen);
    });
  }

  // 5F 大俠傳功：撿到秘笈那段只播一次，旗標寫在 run.flags，由結算那次存檔帶走
  if (ev.id === FIXED_EVENT_FLOOR_5) app.playOnce('secretScroll', dialogue.secretScroll, () => { /* 看完就直接選 */ });
});
