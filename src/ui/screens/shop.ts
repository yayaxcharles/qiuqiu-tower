import { play } from '../audio';
import { dialogue } from '../../content/dialogue';
import { potionById } from '../../content/potions';
import { relicById } from '../../content/relics';
import { RESHUFFLE_COST, buyCard, buyPotion, buyRelic, buyRemove, makeShop, potionCapacity, priceFor, reshuffleShop, shopMulFor } from '../../engine/run';
import type { RunAction } from '../../net/runaction';
import { showPotionSwap } from '../potionswap';
import type { RunState } from '../../engine/types';
import { registerScreen } from '../app';
import { actVariantKey, clearKeepBg, screenBg } from '../screenbg';
import { artUrl } from '../assets';
import { cardNode } from '../cardview';
import { showRemoveConfirm } from '../confirm';
import { showDeckPicker } from '../deckview';
import { el } from '../dom';
import { renderHud } from '../hud';
import { sceneView } from '../scene';
import { me } from '../../engine/runplayer';

/** 圖示還沒生好時 artUrl 會回一張灰剪影；貨架每格都寫著名字，寧可不放圖也不要排一列灰影 */
function icon(key: string, alt: string): Node | string {
  const url = artUrl('icons', key);
  return url.startsWith('data:') ? '' : el('img', { src: url, alt });
}

registerScreen('shop', (app, root) => {
  root.append(screenBg(actVariantKey('bg/screen_shop', app.run?.act ?? 1, app.run?.floor)));
  if (!app.run) { app.show('title'); return; }
  const run: RunState = app.run;   // 收斂成不可為 null 的區域常數：窄化不會跟著進到下面的內部函式
  // 進貨只做一次：makeShop 會推進 run.rng，每次重畫都叫的話買一樣東西整個貨架就換一批
  const shop = makeShop(run);
  const line = dialogue.shopkeeper[Math.floor(Math.random() * dialogue.shopkeeper.length)] ?? '';

  /*
   * 兩個人一起逛（連線版 2026-09-11）。
   *
   * **貨架共用、錢包各自**：架上的東西只有一份，誰先買到就是誰的；
   * 每個人付的錢照自己的折扣秘寶算（見 `priceFor`）。
   *
   * 所有會改到東西的動作都要走 `act()`——直接呼叫引擎的話只有自己這台會動，
   * 對面的貨架還留著那一格，下一次對帳就分岔。
   */
  const seat = app.seat;
  const coop = app.coop;
  /*
   * 我倒下了：引擎本來就擋著（`canApplyRun` 對倒下的人一律回 false），
   * 可是畫面照樣把貨架、放生、重整貨架亮著——按下去毫無反應、沒有音效也沒有老闆搖頭，
   * 玩家只會以為當掉了（稽核第三輪 中-3，跟戰鬥那邊已經修掉的是同一個症狀）。
   */
  const iDown = !!coop && !!me(run, seat).down;
  if (coop) {
    coop.attachShop(shop);
    // 離開這一格時一定要斷開，不然下一格收到一則遲到的買東西，會拿新畫面去套舊貨架
    app.disposers.push(() => coop.attachShop(null));
  }
  /** 誰按了「離開」。兩個人都按了才真的上樓——先按的那位不該把還在逛的人拖走 */
  const done = new Set<number>();
  const allDone = (): boolean => run.players.every((p, i) => p.down || done.has(i));

  /**
   * 做一件會改到東西的事。單機直接做；連線送出去，等編號繞回來才真的生效。
   *
   * 回傳 false＝現在做不出來（錢不夠、被買走了）。連線時回 true 只代表「送出去了」，
   * 真正的結果要看 `onRunApplied`——**所以呼叫端不可以在這裡就播音效**，
   * 不然搶輸的那一位會聽到成交聲卻什麼都沒買到。
   */
  const act = (a: RunAction, local: () => boolean): boolean => {
    if (!coop) return local();
    return coop.submitRun(a);
  };

  /**
   * 老闆站在對白框左邊講話（劇場版面）；立繪沒生好就只留對白。
   *
   * 表情三張：招呼（keeper）、成交（keeper_happy）、錢不夠（keeper_no）。
   * 買賣成交跟「按了買不起的東西」原本都沒有任何回應——後者尤其糟，格子是暗的、
   * 點下去整個畫面一動也不動，玩家分不出「不能買」跟「按錯地方沒按到」。
   * 只換一張圖、`MOOD_MS` 之後換回招呼，遊戲節奏一格都沒有變長。
   */
  const MOOD_MS = 1500;
  type Mood = 'idle' | 'happy' | 'no';
  let mood: Mood = 'idle';
  let moodTimer = 0;
  function keeperArt(): string | undefined {
    // 新表情沒生好就退回招呼那張，退不了才整個不放（跟原本一樣）
    for (const key of mood === 'idle' ? ['shop/keeper'] : [`shop/keeper_${mood}`, 'shop/keeper']) {
      const url = artUrl('sprites', key);
      if (!url.startsWith('data:')) return url;
    }
    return undefined;
  }
  // 換畫面時把還沒到期的表情計時器拆掉。
  // **不能靠 `root.isConnected` 判斷畫面還在不在**：`root` 就是 `app.screen`，那是建構式裡建一次的
  // 常駐節點，`show()`（`app.ts:92`）只對它跑 `clear()`、從來不換掉它，所以 `isConnected` 永遠是 true。
  // 沒拆的話：買完東西馬上按「離開」，1.5 秒後計時器照樣觸發 → `render()` → `clearKeepBg(root)`，
  // **地圖被整個抹掉、換成剛才那家店的貨架**，而且那份貨架是活的、還能再買一輪（稽核 2026-09-10 高-1）。
  app.disposers.push(() => window.clearTimeout(moodTimer));
  /**
   * 換老闆的表情。**只換立繪那張圖，不重畫整頁**（使用者 2026-09-10：
   * 「罐頭鋪橘貓老闆動畫時，離開商店按鈕好像會不能點、暫時鎖住？」）。
   *
   * 原本每次都 `render()`，而表情 1.5 秒後還會自己再回到招呼那張、**再重畫一次**。
   * 那一下會把畫面上每一個節點都換成新的，包含「離開」那顆鈕——
   * 玩家正壓著按鈕的時候撞上這一拍，按下去的是舊節點、放開的是新節點，
   * 瀏覽器就不會發出 click，那顆鈕看起來就是「按了沒反應」。時間點又剛好落在表情動畫的尾巴，
   * 所以體感是「老闆在動的時候按不動」。
   *
   * 貨架真的變了（買到東西、重新進貨）由呼叫端自己 `render()`；
   * 買不起那種只是換個臉，本來就不必重畫任何東西。
   */
  function setMood(m: Mood): void {
    mood = m;
    window.clearTimeout(moodTimer);
    if (m !== 'idle') moodTimer = window.setTimeout(() => setMood('idle'), MOOD_MS);
    const img = root.querySelector<HTMLImageElement>('.scene-portrait');
    const url = keeperArt();
    // 比 `getAttribute` 不比 `img.src`：後者的 getter 回的是解析過的絕對網址，
    // 跟 `artUrl` 給的相對路徑永遠不相等，那個判斷等於沒作用（稽核 2026-09-10 低-5）
    if (img && url && img.getAttribute('src') !== url) img.src = url;
  }

  /**
   * 貨架上的一格：圖、名字、說明、價錢。賣掉了寫「賣掉了」；買不起或現在拿不了（例如忍具帶滿）
   * 就變淡、點不動，但價錢照樣寫著——「賣掉了」與「買不起」是兩件事，不要混成同一個樣子。
   */
  /** 價錢牌：特價的把原價劃掉、特價紅字放大（使用者 2026-09-04：「要明顯」） */
  function priceNode(price: number, sold: boolean, base?: number, sale?: number): HTMLElement {
    if (sold) return el('div', { class: 'price' }, '賣掉了');
    if (sale && base !== undefined) {
      const orig = Math.round(base * shopMulFor(run, seat));
      return el('div', { class: 'price sale' }, el('s', {}, String(orig)), el('b', {}, `${price} 條小魚乾`));
    }
    return el('div', { class: 'price' }, `${price} 條小魚乾`);
  }
  const saleTag = (sale?: number): HTMLElement | '' => (sale ? el('div', { class: 'sale-tag' }, `特價 ${Math.round(sale * 10)} 折`) : '');

  function stall(key: string, name: string, text: string, price: number,
    sold: boolean, blocked: boolean, buy: () => void, base?: number, sale?: number): HTMLElement {
    const afford = me(run, seat).fish >= price;
    const node = el('div', { class: `shop-item${sold ? ' sold' : afford && !blocked ? '' : ' poor'}${sale && !sold ? ' on-sale' : ''}` },
      saleTag(sold ? undefined : sale),
      icon(key, name),
      el('div', { class: 'shop-name' }, name),
      el('div', { class: 'small' }, text),
      priceNode(price, sold, base, sale));
    if (!sold && !blocked && afford && !iDown) node.addEventListener('click', buy);
    else if (!sold) node.addEventListener('click', () => setMood('no'));   // 買不起：老闆搖頭，不再是死按鈕
    return node;
  }

  /** 一個掛著木牌標籤的貨架，跟戰利品畫面同一套 */
  function shelf(label: string, body: HTMLElement, extra = ''): HTMLElement {
    return el('div', { class: `shelf ${extra}`.trim() },
      el('div', { class: 'shelf-label' }, label), body);
  }

  /**
   * 成交了：播音效、老闆笑一下、重畫。
   *
   * 單機按下去就是成交；連線時這支要**等動作繞回來才叫**（見 `act` 的說明），
   * 不然兩個人同時搶同一格，搶輸的那位會聽到成交聲、看到貨架沒變。
   */
  function bought(sound: 'buy' | 'relic' | 'upgrade'): void {
    if (coop) return;   // 連線的統一由 onRunApplied 處理
    play(sound); setMood('happy'); render();
  }

  /** 離開：單機直接走；連線要兩個人都按了才一起上樓 */
  function leaveBtn(): HTMLElement {
    if (!coop) return el('button', { class: 'btn primary', onclick: () => app.backToMap() }, '離開');
    const mine = done.has(seat);
    const btn = el('button', { class: 'btn primary', onclick: () => { if (!mine) coop.submitRun({ t: 'done', seat }); } },
      mine ? '等對方逛完…' : '逛好了');
    if (mine) btn.setAttribute('disabled', 'disabled');
    return btn;
  }

  function render(): void {
    clearKeepBg(root);
    renderHud(app, root);

    const cards = el('div', { class: 'shop-row' });
    shop.cards.forEach((it, i) => {
      const price = priceFor(run, it, seat);
      const buyable = !it.sold && !iDown && me(run, seat).fish >= price;
      const slot = el('div', { class: `shop-item card-item${it.sold ? ' sold' : buyable ? '' : ' poor'}${it.sale && !it.sold ? ' on-sale' : ''}` },
        saleTag(it.sold ? undefined : it.sale),
        cardNode(it.upgraded ? { uid: -1, cardId: it.def.id, upgraded: true } : it.def, { small: true, disabled: !buyable, onClick: () => { act({ t: 'buy', seat, k: 'card', i }, () => buyCard(run, shop, i, seat)) && bought('buy'); } }),   // 升級格照＋版畫
        priceNode(price, it.sold, it.base, it.sale));
      // 停用的牌面 cardNode 自己把點擊吃掉了，買不起要在外框接才收得到
      if (!it.sold && !buyable) slot.addEventListener('click', () => setMood('no'));
      cards.append(slot);
    });

    // 秘寶與忍具分成兩個貨架。本來兩種混在同一排，玩家看不出哪個是整局有效的秘寶、
    // 哪個是喝掉就沒的忍具（使用者的原話：「上面是卡牌 下面是藥水? 感覺可以分區或框起來」）
    const relics = el('div', { class: 'shop-row' });
    shop.relics.forEach((it, i) => {
      const d = relicById[it.id];
      if (!d) return;
      // 已經有的秘寶買不下去（buyRelic 會擋），當成賣掉，不要讓玩家白按
      const owned = me(run, seat).relics.includes(it.id);
      relics.append(stall(d.art, d.name, d.text, priceFor(run, it, seat), it.sold || owned, false,
        () => { act({ t: 'buy', seat, k: 'relic', i }, () => buyRelic(run, shop, i, seat)) && bought('relic'); }, it.base, it.sale));
    });
    const potions = el('div', { class: 'shop-row' });
    shop.potions.forEach((it, i) => {
      const d = potionById[it.id];
      if (!d) return;
      // 帶滿了還是能買：先問要換掉哪一支，選了才付錢（2026-09-02）
      const full = me(run, seat).potions.length >= potionCapacity(run, seat);
      const price = priceFor(run, it, seat);
      const poor = me(run, seat).fish < price;
      potions.append(stall(d.art, d.name, full ? `${d.text}（帶滿了，買了要換掉一支）` : d.text, price, it.sold, poor,
        () => {
          if (!full) { act({ t: 'buy', seat, k: 'potion', i }, () => buyPotion(run, shop, i, undefined, seat)) && bought('buy'); return; }
          showPotionSwap(run, it.id, (idx) => { if (idx >= 0) act({ t: 'buy', seat, k: 'potion', i, r: idx }, () => buyPotion(run, shop, i, idx, seat)) && bought('buy'); }, { apply: false, seat });
        }, it.base, it.sale));
    });

    // 放生：挑完先跳確認（使用者 2026-09-04：「選牌後沒有跳確定」），按「再看看」回牌堆重挑
    const pickRelease = (): void => showDeckPicker({
      title: `放生一張牌（${me(run, seat).removeCost} 條小魚乾）`, cards: me(run, seat).deck, pickable: true, cancellable: true,
      onPick: (uid) => {
        const c = uid === null ? undefined : me(run, seat).deck.find((x) => x.uid === uid);
        if (uid === null || !c) { render(); return; }
        showRemoveConfirm(c, me(run, seat).removeCost, (ok) => {
          if (!ok) { pickRelease(); return; }
          // 放生成功也要重畫：牌組少一張、小魚乾也扣了（本來靠 setMood 順便重畫，那條路已經拆掉）
          if (act({ t: 'scrub', seat, u: uid }, () => buyRemove(run, uid, seat))) bought('upgrade');
          render();
        });
      },
    });
    const remove = el('button', {
      class: 'btn',
      onclick: () => pickRelease(),
    }, `放生一張牌：${me(run, seat).removeCost} 條小魚乾`);
    if (iDown || me(run, seat).fish < me(run, seat).removeCost || me(run, seat).deck.length === 0) remove.setAttribute('disabled', 'disabled');
    // 重整貨架：75 條、每店一次，牌／秘寶／忍具沒賣掉的格子全部換一批（2026-09-07 從「只換牌格」擴大）
    const reshuffle = el('button', { class: 'btn', onclick: () => { act({ t: 'shuffle', seat }, () => reshuffleShop(run, shop, seat)) && bought('buy'); } },
      shop.reshuffled ? '貨架已重整過' : `重整貨架：${RESHUFFLE_COST} 條小魚乾`);
    // 有沒有東西可換要看三區加總，不能只看牌格（稽核 2026-09-07 中 1）：
    // 牌全買光但秘寶或忍具還在架上時，引擎讓你換、按鈕卻是灰的，等於這次改動玩家碰不到
    const anyLeft = [...shop.cards, ...shop.relics, ...shop.potions].some((it) => !it.sold);
    if (iDown || shop.reshuffled || me(run, seat).fish < RESHUFFLE_COST || !anyLeft) reshuffle.setAttribute('disabled', 'disabled');

    // 劇場版面：貨架站在中上方（新招一排、秘寶與忍具一排），老闆站在對白框左邊講話，
    // 放生與離開兩顆鈕排在對白框裡。本來是一塊面板把店景遮掉大半、老闆縮在角落配一顆小泡泡。
    const goods = el('div', { class: 'scene-goods' },
      shelf('新招', cards, `shelf-cards${shop.cards.length >= 6 ? ' six' : ''}`),
      el('div', { class: `shop-shelves${shop.relics.length >= 3 ? ' six' : ''}` }, shelf('秘寶', relics), shelf('忍具', potions)));   // 珍品架多一格時六格並排，格子縮一點
    root.append(sceneView({
      art: goods,
      portrait: keeperArt(),
      speaker: '橘貓老闆',
      text: iDown ? '球球倒在門口，只能看著同伴逛。' : line,
      actions: [reshuffle, remove, leaveBtn()],
    }));
  }

  if (coop) {
    coop.onRunApplied((applied) => {
      for (const one of applied) {
        if (one.a.t === 'done') done.add(one.a.seat);
        else if (one.a.seat === seat) { play(one.a.t === 'buy' && one.a.k === 'relic' ? 'relic' : one.a.t === 'scrub' ? 'upgrade' : 'buy'); setMood('happy'); }
      }
      if (allDone()) { app.backToMap(); return; }
      render();
    });
  }

  render();
});
