import { actWalkTransition } from '../acttransition';
import { play } from '../audio';
import { relicById, relicLongText } from '../../content/relics';
import { ACT_NAMES, addCard, advanceAct, relicForPartnerOnly, rollActCards, rollActCardsPerSeat, rollActRelics, takeRelic } from '../../engine/run';
import { allVoted, onlyStanding } from '../../engine/vote';
import { me } from '../../engine/runplayer';
import { heroSpeaker } from '../dialogue';
import { lineFor } from '../../content/dialogue';
import { registerScreen } from '../app';
import { clearKeepBg, screenBg } from '../screenbg';
import { artUrl, heroArtUrl } from '../assets';
import { el, ENTER_MS, keepLoops } from '../dom';
import { cardNode } from '../cardview';
import { renderHud } from '../hud';
import { sceneView } from '../scene';
import { preloadAct } from '../preload';

/**
 * 過關畫面：打倒第一、二關的關主之後（第三關直接進結算，不走這裡）。
 * 做三件事：宣布回滿血、大魔物級秘寶三選一、進下一關。
 *
 * 秘寶只擲一次（`rollActRelics` 會推進整局的亂數），畫面重畫不能重擲，
 * 不然玩家開著開發工具就能刷選項。挑完才呼叫 `advanceAct`——它會回滿血、
 * 生下一關的地圖；存檔交給 backToMap()（規矩：節點結算完才存）。
 */
/**
 * 「繼續往○○前進」裡的那個地名。**不直接用 `ACT_NAMES`**：那組是給木牌與標題用的短名
 *（塔下／塔中／塔頂），塞進句子裡唸起來卡。使用者 2026-09-11 的原話是「塔的中央部位」。
 * 索引是**下一關**的關數（打完第一關時 `run.act` 還是 1，要往第 2 關去）。
 */
const NEXT_PLACE: Record<number, string> = { 1: '塔的中央部位', 2: '塔頂' };

registerScreen('actclear', (app, root, props) => {
  root.append(screenBg('bg/screen_result_win'));
  const run = app.run;
  if (!run) { app.show('title'); return; }
  // 一進過關畫面就開始抓下一關的魔物立繪（玩家看幻燈片、挑秘寶的這幾十秒剛好用，稽核 2026-09-04 低 21）；
  // 鏡中變裝看座位 0 的角色，跟戰鬥裡實際換裝同一個判準（總稽核 2026-09-16 甲 低-4）
  void preloadAct(run.act + 1, run.players[0]?.hero);
  const picks = rollActRelics(run);
  // 連線時每一位各一份牌（連線稽核 高-9）：兩台都照座位順序抽完全部，各拿自己那一份畫。
  // 單機走原本那一支，亂數走向不變
  const cardPicks = app.coop ? (rollActCardsPerSeat(run)[app.seat] ?? []) : rollActCards(run);
  let pickedCard: string | null = null;   // 只擲一次、只挑一張；重畫不重擲
  let pickedRelic: string | null = null;
  play('victory');

  /*
   * 兩個人一起過關（連線版 2026-09-11）：秘寶與牌**各挑各的**（同一份清單，重複也沒關係——
   * 過關的三選一本來就是給「這一位」的，不是爭搶的戰利品）。
   *
   * **兩個人都按了出發才一起上樓**：`advanceAct` 會回滿血、生下一關的地圖，
   * 一個人先跑的話，另一個人的整局還停在上一關，下一次對帳直接分岔。
   *
   * 挑的結果走選擇通道（不走整局動作那條）：選擇本身就會傳到對面，
   * 兩台機器照同一個座位順序各套一次就好，不需要再排一次號碼。
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
  let advanced = false;   // `advanceAct` 每台機器只能跑一次（它會生新地圖、推進亂數）
  /** 「關主的信物」那一頁還亮著：同伴的票補跑進來時不要 `render()` 把它洗掉（審查 中-1） */
  let revealing = false;
  /** 兩邊都挑完、已經結算：之後任何遲到的票都不准再重畫回三選一 */
  let settled = false;
  const iDown = !!coop && !!me(run, seat).down;   // 倒下的人沒得挑（規則四）

  const go = (): void => {
    if (advanced) return;
    advanced = true;
    advanceAct(run);
    // 三秒的走路轉場（使用者點名要的儀式感）：背景已經是下一關的色調，
    // 走完才落地到新地圖；backToMap 在轉場回呼裡跑＝存檔照舊在節點結算時寫
    let completed = false;
    const cancel = actWalkTransition(app.stage, run.floor + 1, () => { completed = true; app.backToMap(); });
    app.disposers.push(() => { if (!completed) cancel(); });
  };
  const done = (relicId: string | null): void => {
    if (!relicId) { go(); return; }
    takeRelic(run, relicId, seat); play('relic');
    const def = relicById[relicId];
    if (!def) { go(); return; }
    // 打倒關主拿到的秘寶要正式亮一次（使用者 2026-09-03：「第一關打完的塔主令牌哪時候拿到的看不太出來」）：
    // 跟紙箱同一套——圖放大立在中上、效果在圖上方、名字在圖下方，球球講一句，按了才上路
    clearKeepBg(root);
    renderHud(app, root);
    const url = artUrl('icons', def.art);
    const hero = heroArtUrl(me(run, seat).hero, 'hero/ninja_win');
    const next = ACT_NAMES[run.act] ?? '塔頂';
    const stack = el('div', { class: 'loot-stack' },
      el('p', { class: 'loot-above' }, def.text),
      !url.startsWith('data:') ? el('img', { class: 'chest-loot', src: url, alt: def.name }) : el('div', { class: 'chest-loot-missing' }),
      el('div', { class: 'loot-below' }, el('span', { class: 'loot-kind' }, '秘寶'), el('b', { class: 'loot-name' }, def.name)));
    root.append(sceneView({
      art: stack,
      portrait: hero.startsWith('data:') ? undefined : hero,
      speaker: heroSpeaker(),
      text: lineFor(me(run, seat).hero, `關主留下的東西……「${def.name}」到手了喵！`),
      actions: [el('button', { class: 'btn primary', onclick: go }, `帶著它上${next}`)],
    }));
  };

  /**
   * 點選秘寶或牌**不整頁重畫**，只換「選中」的樣子與底下那顆鈕（畫面抖動稽核 2026-09-24 第 2 項）：
   * 整頁重畫會讓對白框從下面再滑上來一次、已選那張的「✓ 選這個」章消失再彈出、稀有牌流光從頭跑、背景暗一下。
   * `tiles`／`cardEls`／`goBtn` 是現在畫面上那一份，`render()` 每次重新登記。
   */
  const tiles = new Map<string, HTMLElement>();
  const cardEls = new Map<string, HTMLElement>();
  let goBtn: HTMLElement | null = null;
  /** 秘寶一定要挑一件、送出去了就只能等（連線）：鈕上的字與能不能按 */
  function goState(sent: boolean): { label: string; off: boolean } {
    const next = ACT_NAMES[run!.act] ?? '塔頂';
    // 有秘寶可挑卻沒挑就不放行：原本按鈕文字只看有沒有選牌，一件塔主池秘寶按下去就無聲消失（體檢 2026-09-05）
    const mustPickRelic = picks.length > 0 && !pickedRelic;
    return { label: sent ? '等同伴挑完…' : mustPickRelic ? '先挑一件秘寶' : pickedCard ? `帶著新招上${next}` : `出發，上${next}`, off: mustPickRelic || sent };
  }
  function refresh(): void {
    // 這一下才變成選中的，拿掉 `kept`：它的勾章要彈出來（`kept` 是重畫前就選著的那張，見 screens.css）
    const mark = (n: HTMLElement, on: boolean): void => { if (on && !n.classList.contains('selected')) n.classList.remove('kept'); n.classList.toggle('selected', on); };
    for (const [id, n] of tiles) mark(n, pickedRelic === id);
    for (const [id, n] of cardEls) mark(n, pickedCard === id);
    const g = goState(false);
    if (!goBtn) return;
    goBtn.textContent = g.label;
    goBtn.classList.toggle('disabled', g.off);
    if (g.off) goBtn.setAttribute('disabled', 'true'); else goBtn.removeAttribute('disabled');
  }

  let drawn = false;   // 三選一畫過了沒：再畫一次（連線時同伴投票）就是同一段內容，不再播進場
  // 上一次畫完還沒滿 `ENTER_MS`（同伴先挑好、我這邊補跑票下一拍就重畫）照舊播進場，不然對白框一格跳到定位（推前稽核 2026-09-24 低-1）
  let drawnAt = 0;
  function render(): void {
    if (!run) return;
    const calm = drawn && performance.now() - drawnAt > ENTER_MS;
    drawn = true;
    clearKeepBg(root);
    renderHud(app, root);
    tiles.clear(); cardEls.clear();
    // 連線：送出去之後就不能改了（改了兩邊的清單會對不上）
    const sent = coop ? coop.picks('actrelic', run.players.length)[seat] !== null : false;
    // 秘寶三選一：大圖示的方塊，點了亮起、可換選；跟牌一樣按「出發」才一起結算
    const relicRow = el('div', { class: 'pick-row' });
    for (const id of picks) {
      const d = relicById[id];
      if (!d) continue;
      const url = artUrl('icons', d.art);
      // 連線時清單照「有一位用得到」開，鎖住我的那件（封封的蓄氣秘寶給菲菲看）要講明白，不然她會以為挑了有用（主控 2026-09-23）
      const partnerOnly = relicForPartnerOnly(run, id, seat);
      const node = el('div', { class: `pick-tile${pickedRelic === id ? ` selected${calm ? ' kept' : ''}` : ''}${partnerOnly ? ' partner-only' : ''}` },
        url.startsWith('data:') ? '' : el('img', { src: url, alt: d.name }),
        el('b', {}, d.name),
        partnerOnly ? el('span', { class: 'pick-tile-note' }, '同伴才用得到') : '',
        el('em', {}, relicLongText(d, me(run, seat).relics, true)));   // 師門那兩件多一段集到幾件（2026-09-23 第二批），挑的時候就看得到湊不湊得成
      if (!sent && !iDown) node.addEventListener('click', () => { pickedRelic = pickedRelic === id ? null : id; play('click'); refresh(); });
      tiles.set(id, node);
      relicRow.append(node);
    }
    // 稀有牌三選一：點了亮起、可換選；帶不帶都能出發
    const cardRow = el('div', { class: 'reward-cards' });
    for (const c of cardPicks) {
      const node = cardNode(c, {
        small: true,
        selected: pickedCard === c.id,
        disabled: sent || iDown,
        onClick: () => { if (!sent && !iDown) { pickedCard = pickedCard === c.id ? null : c.id; play('click'); refresh(); } },
      });
      if (calm && pickedCard === c.id) node.classList.add('kept');
      cardEls.set(c.id, node);
      cardRow.append(node);
    }
    const { label: goLabel, off } = goState(sent);
    // 劇場版面：秘寶一排、牌一排立在畫面中央；說明與出發鈕在底下的帶子裡
    root.append(sceneView({
      art: el('div', { class: 'scene-picks' },
        picks.length ? el('div', { class: 'pick-label' }, '挑一件秘寶') : '',
        picks.length ? relicRow : '',
        cardPicks.length ? el('div', { class: 'pick-label' }, '挑一張牌（也可以不挑）') : '',
        cardPicks.length ? cardRow : ''),
      // 文案 2026-09-11 改（使用者）：「破關」像在講整個遊戲通關，但這只是過了一關；
      // 「通過」才是「爬過這一段、還要繼續往上」的意思
      speaker: `通過${ACT_NAMES[run.act - 1] ?? ''}`,
      text: `${heroSpeaker()}歇了口氣，回復完體力，繼續往${NEXT_PLACE[run.act] ?? '塔頂'}前進。`,
      actions: [goBtn = el('button', {
        class: 'btn primary' + (off ? ' disabled' : ''),
        ...(off ? { disabled: 'true' } : {}),
        onclick: () => {
          if (picks.length > 0 && !pickedRelic) return;   // 點選不重畫了，按下去的當下才看（見 `refresh`）
          // 單機：挑完就走。兩個人：把挑的送出去，等對方也挑完才一起結算、一起上樓
          if (coop) { coop.pick('actrelic', pickedRelic ?? ''); coop.pick('actcard', pickedCard ?? ''); return; }
          if (pickedCard) addCard(run, pickedCard, false, seat);
          done(pickedRelic);
        },
      }, goLabel)],
      calm,
    }));
    keepLoops(root, app.loopT0);   // 稀有牌流光、底圖火光接回原進度（連線時同伴投票那次重畫）
    if (!calm) drawnAt = performance.now();
  }
  /*
   * **連線的回呼要掛在下面那個早退之前。**
   *
   * 信物那一段掛完畫面就 `return`，而過關畫面幾乎每次都會走那一段
   *（打倒關主本來就會掉信物）——註冊擺在函式尾巴等於永遠跑不到，
   * 對方挑好了自己這邊完全不會動。紙箱那邊踩過同一個坑。
   */
  if (coop) {
    coop.onPick((kind) => {
      if ((kind !== 'actrelic' && kind !== 'actcard') || advanced || settled || !run) return;
      const alive = run.players.map((p) => !p.down);
      const rp = onlyStanding(coop.picks('actrelic', run.players.length), alive);   // 結算前先洗掉倒下的人那幾票：不洗的話結果會跟票到達的順序有關（稽核第二輪 高-5）
      const cp = onlyStanding(coop.picks('actcard', run.players.length), alive);
      if (!allVoted(rp, alive) || !allVoted(cp, alive)) { if (!revealing) render(); return; }
      settled = true;
      // 兩邊都挑完了：照座位順序各拿各的（順序固定，兩台機器算出來的牌組才一樣）
      coop.clearPicks('actrelic'); coop.clearPicks('actcard');   // 結算完才清
      cp.forEach((id, i) => { if (id) addCard(run, id, false, i); });
      rp.forEach((id, i) => { if (id) takeRelic(run, id, i); });
      const mine = rp[seat];
      if (mine) { play('relic'); done(mine); } else go();
    });
  }

  // 關主留下的信物（塔主令牌）先正式亮一次，按了「收下」才進三選一
  // （使用者 2026-09-03：「獲得塔主令牌我還是沒看到動畫或事件呈現」——關主戰打贏不走獎勵畫面，信物是 finishCombat 直接收進包包的）
  const bossRelicId = (props as { bossRelic?: string | null } | undefined)?.bossRelic ?? null;
  const bossRelic = bossRelicId ? relicById[bossRelicId] : undefined;
  if (bossRelic) {
    revealing = true;
    clearKeepBg(root);
    renderHud(app, root);
    const url = artUrl('icons', bossRelic.art);
    const hero = heroArtUrl(me(run, seat).hero, 'hero/ninja_win');
    const stack = el('div', { class: 'loot-stack' },
      el('p', { class: 'loot-above' }, bossRelic.text),
      !url.startsWith('data:') ? el('img', { class: 'chest-loot', src: url, alt: bossRelic.name }) : el('div', { class: 'chest-loot-missing' }),
      el('div', { class: 'loot-below' }, el('span', { class: 'loot-kind' }, '關主的信物'), el('b', { class: 'loot-name' }, bossRelic.name)));
    root.append(sceneView({
      art: stack,
      portrait: hero.startsWith('data:') ? undefined : hero,
      speaker: heroSpeaker(),
      text: lineFor(me(run, seat).hero, `關主倒下的地方掉了東西……是「${bossRelic.name}」！這就是塔主的信物喵！`),
      actions: [el('button', { class: 'btn primary', onclick: () => { revealing = false; play('relic'); render(); } }, '收下')],
    }));
    return;
  }

  render();
});
