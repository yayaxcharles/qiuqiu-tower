import { play } from '../audio';
import { cardById } from '../../content/cards';
import { potionById } from '../../content/potions';
import { relicById } from '../../content/relics';
import type { CombatRewards } from '../../engine/rewards';
import { closeCardReward, runRng, takeCardReward, upgradeCard } from '../../engine/run';
import { settleRelicPicks } from '../../engine/rewards';
import type { CardInstance } from '../../engine/types';
import { registerScreen } from '../app';
import { allVoted } from '../../engine/vote';
import { screenBg, tierBgKey } from '../screenbg';
import { artUrl } from '../assets';
import { cardNode } from '../cardview';
import { showDeckPicker } from '../deckview';
import { showPotionSwap } from '../potionswap';
import { el } from '../dom';
import { renderHud } from '../hud';
import { sceneView } from '../scene';
import { me } from '../../engine/runplayer';

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
  const seat = app.seat;
  // 戰利品與事件獎金分兩欄送過來（見 app.afterCombat）：CombatRewards 本身沒有 bonusFish 這一欄
  /*
   * `relicSettled`／`relicTaken` **記在戰利品物件上**，不是畫面的區域變數。
   *
   * 這個畫面每挑一次就整個重畫（`app.show('reward', r)` 會把函式從頭再跑一遍），
   * 區域變數每次都歸零——而秘寶結算會擲骰，跑第二次就讓整局的亂數多走一步，
   * 兩台機器當場分岔。戰利品物件是 `props`，重畫時原封不動傳回來，
   * 而且下一場戰鬥自然會換成新的一份，不必記得手動清。
   */
  const r = props as CombatRewards & { bonusFish?: number; bonusUpgrades?: number; relicSettled?: boolean; relicTaken?: boolean; relicSeats?: number[]; upsDone?: boolean };
  const bonus = r.bonusFish ?? 0;
  const ups = r.bonusUpgrades ?? 0;
  /*
   * **連線的回呼要掛在下面那個早退之前**（紙箱與過關畫面踩過同一個坑）。
   * 信物那一段掛完畫面就 `return`，註冊擺在後面就跑不到，
   * 那期間對方挑好了自己這邊完全不會動。
   */
  if (app.coop) {
    const coop = app.coop;
    const alive = (): boolean[] => run.players.map((p) => !p.down);
    /** 秘寶結算好了沒（結算會擲骰，只能跑一次，不然亂數就多走一步） */
    const settleRelics = (): void => {
      if (r.relicSettled || !offers.length) return;
      const picks = coop.picks('relic', run.players.length);
      if (!allVoted(picks, alive())) return;
      r.relicSettled = true;
      const got = settleRelicPicks(runRng(run), offers, picks);
      const id = got[seat];
      if (id) { play('relic'); coop.submitRun({ t: 'relic', seat, id }); }
    };
    /** 鏡子走廊那類「升 N 張牌」：兩邊都挑完才一起套上去 */
    const settleUps = (): void => {
      if (r.upsDone || ups <= 0) return;
      const picks = coop.picks('rwup', run.players.length);
      if (!allVoted(picks, alive())) return;
      r.upsDone = true;
      coop.clearPicks('rwup');
      picks.forEach((v, i) => { if (v !== null) doUpgrades(i, v ? v.split(',').map(Number) : []); });
    };
    /** 牌、升級、秘寶都挑完（而且秘寶真的進了背包）才一起上樓 */
    const maybeGo = (): void => {
      const cardPicks = coop.picks('card', run.players.length);
      if (!allVoted(cardPicks, alive())) return;
      if (ups > 0 && !r.upsDone) return;
      if (offers.length && !r.relicTaken) return;
      coop.clearPicks('card');
      coop.clearPicks('relic');
      /*
       * 兩邊都挑完了：**每個人各拿各的**，照座位順序結算。
       * 順序固定才有一致性——兩台機器各自跑這一段，同一個順序才會得到同一份牌組。
       */
      cardPicks.forEach((id, i) => { if (id !== null) takeCardReward(run, r, id === '' ? null : id, i); });
      closeCardReward(r);   // 全部挑完才關，不然第二位的挑選會落空
      app.backToMap();
    };
    coop.onRunApplied((applied) => {
      // 兩個人的秘寶都真的進背包了才算數（各自送各自那一件，所以要等兩則）
      /*
       * **兩個人的秘寶都真的進背包了才算數**（一人送一則，所以要等兩則）。
       * 只看「有沒有任何一則」的話，第一則一到就放行，先按的那位會在自己的秘寶
       * 還沒入袋前就被帶回地圖——狀態最後會對得上（動作照樣會套用），但畫面上
       * 那件秘寶等於沒出現過。
       */
      const got = new Set(r.relicSeats ?? []);   // 記在戰利品物件上：畫面每挑一次就重畫，區域變數會被清掉
      for (const o of applied) if (o.a.t === 'relic') got.add(o.a.seat);
      r.relicSeats = [...got];
      if (run.players.every((p, i) => p.down || got.has(i))) r.relicTaken = true;
      if (r.relicTaken) maybeGo(); else app.show('reward', r);
    });
    coop.onPick((kind) => {
      if (kind === 'relic') { settleRelics(); app.show('reward', r); return; }
      if (kind === 'rwup') { settleUps(); maybeGo(); return; }
      if (kind !== 'card') return;
      const picks = coop.picks('card', run.players.length);
      if (!allVoted(picks, alive())) { app.show('reward', r); return; }
      maybeGo();
      if (!r.relicTaken && offers.length) app.show('reward', r);
    });
  }

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
  // 魔物自己散掉、一隻都沒打倒的那場：不要寫「獲得 0 條小魚乾」，那看起來像壞掉；直接說清楚為什麼沒有
  const items = r.escaped
    ? el('div', { class: 'reward-items' },
        el('div', { class: 'reward-item loot' },
          el('span', { class: 'reward-line' }, '魔物自己散去了——一隻都沒打倒，牠們身上沒有留下任何東西。')))
    : el('div', { class: 'reward-items' },
        el('div', { class: 'reward-item loot' }, icon('icon/fish', ''),
          el('span', { class: 'reward-line' }, `獲得 ${r.fish} 條小魚乾`)));
  // 修飾詞的歸因：小魚乾為什麼多了／少了、為什麼多一張牌可挑，畫面上要講得出來（體檢 2026-09-05）
  if (r.modifier) items.append(el('div', { class: 'reward-item loot' }, el('span', { class: 'reward-line' }, `這場是「${r.modifier.label}」：${r.modifier.desc}`)));
  // 獎金另起一行：r.fish 是規格 §5.4 的戰利品，兩個數字不併成一個，玩家才看得出獎金有沒有拿到
  if (bonus > 0) items.append(el('div', { class: 'reward-item loot' }, icon('icon/fish', ''),
    el('span', { class: 'reward-line' }, `事件獎金再拿 ${bonus} 條小魚乾`)));
  // 鏡子走廊：打贏鏡中球球的獎勵是挑牌升級。進畫面就開挑牌疊層（不能取消），挑完那一行改寫成升了哪幾張
  let upLine: HTMLElement | null = null;
  const upFilter = (c: CardInstance): boolean => !c.upgraded && cardById[c.cardId]?.pool !== '壞毛病';
  const want = Math.min(ups, me(run, seat).deck.filter(upFilter).length);
  if (ups > 0) {
    upLine = el('span', { class: 'reward-line' }, want > 0 ? `跟自己過招學到了：升級 ${want} 張牌` : '跟自己過招學到了……但牌組裡已經沒有可以升級的牌');
    const line = upLine;
    items.append(el('div', { class: 'reward-item loot' }, line));
    if (want > 0) showDeckPicker({
      title: want > 1 ? `選 ${want} 張牌升級` : '選一張牌升級', previewUpgrade: true,
      cards: me(run, seat).deck, pickable: true, cancellable: false, filter: upFilter, pickCount: want,
      onPick: (uid) => settleUpgrades(uid === null ? [] : [uid]), onPickMany: settleUpgrades,
    });
  }
  /**
   * 挑完要升級的牌。**兩個人時要等兩邊都挑完才動手**（跟事件那邊同一條理由）：
   * 升的是自己的牌，但牌組是兩台機器都在模擬的，對面不知道我升了哪一張就會分岔。
   */
  function settleUpgrades(uids: readonly number[]): void {
    const coop = app.coop;
    if (!coop) { doUpgrades(seat, uids); return; }
    coop.pick('rwup', uids.join(','));
  }
  function doUpgrades(who: number, uids: readonly number[]): void {
    const names: string[] = [];
    for (const uid of uids) {
      const c = me(run!, who).deck.find((x: CardInstance) => x.uid === uid);
      if (!c || !upgradeCard(run!, uid, who)) continue;
      names.push(`「${cardById[c.cardId]?.name ?? c.cardId}」`);
    }
    if (who !== seat) return;
    if (names.length) { play('upgrade'); if (upLine) upLine.textContent = `${names.join('')}升級了`; }   // 直接改存起來的那一行，不找 last-child（後面還會掛忍具列——審查 #12）
  }
  const relic = r.relic ? relicById[r.relic] : undefined;
  if (relic) items.append(el('div', { class: 'reward-item relic' }, icon(relic.art, relic.name),
    el('span', { class: 'reward-line' },
      el('b', {}, `獲得秘寶「${relic.name}」`), el('em', {}, relic.text))));
  /*
   * 兩個人的秘寶（規則三，使用者 2026-09-11：「秘寶則是出現 2 個，跟選路線一樣讓兩個人選，
   * 都選同一個就隨機給一個人，剩下的秘寶就給另一位」）。
   *
   * 排在戰利品清單裡而不是另開一頁：它跟小魚乾、忍具是同一批東西，
   * 分兩頁會讓「這一場拿到什麼」被切成兩半。
   */
  const offers = r.relicOffers ?? [];
  if (offers.length && app.coop) {
    const coop = app.coop;
    const picks = coop.picks('relic', run.players.length);
    const mine = picks[seat] ?? null;
    const row = el('div', { class: 'reward-item relic-offers' });
    row.append(el('span', { class: 'reward-line' }, el('b', {}, '秘寶有兩件，一人挑一件')));
    const box = el('div', { class: 'relic-offer-row' });
    for (const id of offers) {
      const d = relicById[id];
      if (!d) continue;
      const who = picks.map((v, i) => (v === id ? (i === seat ? '你' : '同伴') : '')).filter(Boolean);
      const got = me(run, seat).relics.includes(id);
      const b = el('button', { class: `relic-offer${mine === id ? ' picked' : ''}${got ? ' got' : ''}` },
        icon(d.art, d.name),
        el('span', { class: 'relic-offer-text' }, el('b', {}, d.name), el('em', {}, d.text)),
        who.length ? el('span', { class: 'relic-offer-who' }, who.join('、')) : '');
      if (mine || r.relicSettled) b.setAttribute('disabled', 'disabled');
      else b.addEventListener('click', () => { play('click'); coop.pick('relic', id); });
      box.append(b);
    }
    row.append(box);
    items.append(row);
  }
  // 忍具帶滿收不下：先問要不要換掉一支（換了就把那一行改成「換成了」）
  /*
   * 忍具帶滿收不下——**一人一個背包，滿的人不一定是同一個**（連線版 2026-09-11）。
   * `potionMissedSeats` 記的是哪幾位收不下；全部人都收不下才會走 `potionMissed` 那條舊路。
   */
  const missedId = r.potionMissed ?? (r.potionMissedSeats?.includes(seat) ? r.potion : null);
  const missed = missedId ? potionById[missedId] : undefined;
  if (missed && missedId) {
    const line = el('span', { class: 'reward-line' }, el('b', {}, `忍具帶滿了，「${missed.name}」收不下`), el('em', {}, missed.text));
    items.append(el('div', { class: 'reward-item potion' }, icon(missed.art, missed.name), line));
    const newId = missedId;
    // 350 毫秒內玩家可能已經按「繼續」回地圖：畫面換掉（這一行不在畫面上）就不問了（2026-09-02 稽核 M-1）
    window.setTimeout(() => { if (!line.isConnected) return; showPotionSwap(run, newId, (idx) => {
      // 狀態列要先拆掉舊的再畫：renderHud 只會往 root 再掛一條（實測疊成兩條）
      if (idx >= 0) { play('relic'); line.replaceChildren(el('b', {}, `換成了「${missed.name}」`), el('em', {}, missed.text)); root.querySelector('.hud')?.remove(); renderHud(app, root); }
    }, { seat }); }, 350);
  }
  const potion = r.potion && !missedId ? potionById[r.potion] : undefined;
  if (potion) items.append(el('div', { class: 'reward-item potion' }, icon(potion.art, potion.name),
    el('span', { class: 'reward-line' },
      el('b', {}, `獲得忍具「${potion.name}」`), el('em', {}, potion.text))));

  /**
   * 挑完牌（或跳過）才算這個節點結算完，這時候才存檔回地圖。
   *
   * **兩個人一起玩時要等兩邊都挑完**（規則三：獎勵分開給）。
   * 為什麼不能各走各的：我挑了哪張牌會進我的牌組，而牌組是兩台機器都在模擬的東西
   * ——對面不知道我挑了什麼，下一場我抽到的牌就對不上，當場分岔。
   * 所以挑的動作也要送出去，兩邊都收到才一起結算、一起回地圖。
   *
   * `''` 代表「放棄這張牌」——空字串比 `null` 好傳，而且不會跟任何牌號撞。
   */
  const done = (cardId: string | null): void => {
    if (!app.coop) { takeCardReward(run, r, cardId); closeCardReward(r); app.backToMap(); return; }
    app.coop.pick('card', cardId ?? '');
  };
  const cards = el('div', { class: 'reward-cards' });
  /*
   * 我挑完了沒（兩個人一起玩時）。挑完就把牌鎖住、寫一句「等對方」——
   * 不然按下去之後畫面完全不動，玩家會以為當掉了，然後狂點。
   */
  const myPick = app.coop ? app.coop.picks('card', run.players.length)[app.seat] : undefined;
  const waiting = myPick !== undefined && myPick !== null;
  // 開出升級牌的那一格照升級版畫（名字帶＋、數字是升級後的）
  for (const c of r.cards) {
    cards.append(cardNode(c.id === r.upgradedCard ? { uid: -1, cardId: c.id, upgraded: true } : c,
      waiting ? { disabled: true } : { onClick: () => done(c.id) }));
  }

  // 標題依戰鬥種類換句話，打倒塔主不該跟打贏小老鼠共用同一句
  const title = r.kind === '塔主' ? '打倒塔主了' : r.kind === '大魔物' ? '打倒大魔物' : '打贏了';
  /**
   * **魔物自己散掉那一場要走另一套文案與版面**（稽核 2026-09-10 高-1）。
   *
   * 這三行本來都拿 `r.cards.length` 當「有沒有東西可挑」，以前那條路走不到，
   * 加了「散掉沒戰利品」之後天天走得到，於是畫面同時寫著「打贏了」「收拾一下戰利品，繼續往上」
   * 跟「牠們身上沒有留下任何東西」三句互相打架，中間原本站三張牌的地方整片開天窗。
   * 現在標題、對白、按鈕全部改看 `r.escaped`，中間擺一張球球撲空的立繪把版面填起來。
   */
  /**
   * 中間那塊不准開天窗（稽核 2026-09-10 低-5）。三種情形各給一張圖：
   * 散掉了＝撲空的暈頭姿勢；有牌可挑＝那三張牌；**打贏了但沒牌可挑**＝抱著飯糰吃。
   *
   * 第三種主要是**每一場塔主戰**（`rollRewards` 對塔主一律回 `cards: []`，戰利品是信物與小魚乾），
   * 其次才是牌組收窄到抽不出第三種新牌（`finishCombat` 的 `exclude`：同一張已經有兩張就不再開）。
   * 用「吃飯糰」不用勝利姿勢是因為**塔主那條路前一畫面（信物）左邊剛放過 `ninja_win`**，
   * 按下「收下」再看到同一張放大到中央 360 高，等於連看兩次（稽核 2026-09-10 低-6）。
   * 而且吃東西本來就比較搭底下那句「收拾一下戰利品，繼續往上」。
   */
  const poseArt = (key: string): HTMLElement | '' => {
    const url = artUrl('sprites', key);
    return url.startsWith('data:') ? '' : el('img', { class: 'event-art', src: url, alt: '' });
  };
  const middle = r.escaped ? poseArt('hero/ninja_dizzy')
    : r.cards.length ? cards
      : poseArt('hero/ninja_eat');
  root.append(sceneView({
    art: middle,
    speaker: r.escaped ? '牠散掉了' : title,
    text: r.escaped ? '一團煙散在空氣裡，什麼都沒剩下。走吧。'
      : waiting ? '挑好了，等對方挑完就一起上樓。'
      : r.cards.length ? '選一張牌帶走，或是放棄。' : '收拾一下戰利品，繼續往上。',
    extra: [items],
    actions: [waiting
      // 已經挑完就只留一顆按不下去的鈕：兩個人得一起走，這裡不能讓任何一邊先跑
      ? el('button', { class: 'btn', disabled: 'disabled' }, '等對方…')
      : el('button', { class: 'btn primary', onclick: () => done(null) },
        !r.escaped && r.cards.length ? '放棄牌並跳過' : '繼續')],
  }));
});
