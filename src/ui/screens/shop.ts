import { play } from '../audio';
import { dialogue } from '../../content/dialogue';
import { potionById } from '../../content/potions';
import { MIASMA_PURE, ownsRelic, relicById, relicLongText } from '../../content/relics';
import { PURIFY_PRICE, RESHUFFLE_COST, buyCard, buyPotion, buyRelic, buyRemove, buySwap, canPurifyAtShop, canSwap, keeperFirstMeet, keeperMulFor, makeShops, miasmaRelicsOf, notMyCard, potionCapacity, priceFor, purifyAtShop, removePrice, reshuffleShop, runMods, shopClosed, shopMulFor, shopService, type ShopStock } from '../../engine/run';
import { TORTOISE_PURIFY_LINE, purifyLine, tortoisePurifyLabel } from '../../content/purify-text';
import { showPurifyPick } from '../purifypick';
import { showPurifyReveal } from '../purifyreveal';
import type { MERCHANT_LINES } from '../../content/qmark-text';
import { heroSpeaker, notice, toast } from '../dialogue';
import { KEEPERS } from '../../content/keepers';
import type { GuestKeeper } from '../../content/shop-text';
import { loadShopText, shopTextNow } from '../shop-text-loader';
import { cardById, cardNameFor } from '../../content/cards';
import { heroOf } from '../../engine/hero';
import type { RunAction } from '../../net/runaction';
import { showPotionSwap } from '../potionswap';
import type { Rarity, RunState } from '../../engine/types';
import { registerScreen } from '../app';
import { actVariantKey, clearKeepBg, screenBg } from '../screenbg';
import { artUrl, eventArtKey } from '../assets';
import { cardNode } from '../cardview';
import { attachCardPeek } from '../cardpeek';
import { showRemoveConfirm } from '../confirm';
import { showDeckPicker } from '../deckview';
import { el, ENTER_MS, keepLoops } from '../dom';
import { renderHud } from '../hud';
import { refitGoods, sceneView } from '../scene';
import { me } from '../../engine/runplayer';

/** 行腳商自己的那幾句（延後模組 `content/qmark-text.ts`；只借型別，不把字拉進首載） */
type MerchantLines = typeof MERCHANT_LINES;

/** 圖示還沒生好時 artUrl 會回一張灰剪影；貨架每格都寫著名字，寧可不放圖也不要排一列灰影 */
function icon(key: string, alt: string): Node | string {
  const url = artUrl('icons', key);
  return url.startsWith('data:') ? '' : el('img', { src: url, alt });
}

registerScreen('shop', (app, root, props) => {
  // 行腳商的攤子擺在樓梯轉角，底圖用事件畫面那張，不是罐頭鋪裡面（2026-09-23 第三批）
  const merchantBg = !!(props as { merchant?: unknown } | null)?.merchant;
  root.append(screenBg(merchantBg ? actVariantKey('bg/screen_event', app.run?.act ?? 1) : actVariantKey('bg/screen_shop', app.run?.act ?? 1, app.run?.floor)));
  if (!app.run) { app.show('title'); return; }
  const run: RunState = app.run;   // 收斂成不可為 null 的區域常數：窄化不會跟著進到下面的內部函式
  // 貨架在走進這一格時就抽好了（`enterNode`），這裡只接過來；除錯模式直接跳進來才自己抽。
  // 進貨只做一次：makeShops 會推進 run.rng，每次重畫都叫的話買一樣東西整個貨架就換一批
  const shops = (props as { shops?: ShopStock[] } | null)?.shops ?? makeShops(run);
  /*
   * 行腳商（問號格變化，2026-09-23 內容擴充第三批，設計稿 3-2、3-6）：沿用這個畫面，貨架是 `makeMerchant` 那一份。
   * 先一段開頭（揭曉圖＋這一位的那段話）、按一下才攤開貨架；對白框換成行腳商講話，只做一筆生意，沒有放生、沒有重整貨架。
   * 開頭那一段只是換個畫法、不動任何東西，連線時兩台各看各的、不用對齊。
   */
  const mer = (props as { merchant?: { opening: string; lines?: MerchantLines } } | null)?.merchant;
  const pickLine = (list: readonly string[]): string => list[Math.floor(Math.random() * list.length)] ?? '';
  let line = mer ? pickLine(mer.lines?.enter ?? []) : pickLine(dialogue.shopkeeper);
  let intro = !!mer;

  /*
   * 兩個人一起逛，**各逛各的**（使用者 2026-09-15：「不如各逛各的？跟戰鬥完選牌一樣」）。
   *
   * 每個座位一份貨架（`makeShops`，照座位順序連抽，兩台抽出來一樣），畫面只畫自己那份；
   * 買賣、放生、重整貨架都只動自己的貨架與錢包，每個人付的錢照自己的折扣秘寶算（見 `priceFor`）。
   * 「離開」還是要兩個人都按才上樓。之前（2026-09-11 版）是共用一份、誰先買到就是誰的。
   *
   * 所有會改到東西的動作都要走 `act()`——直接呼叫引擎的話只有自己這台會動，
   * 對面的錢與牌組還是舊的，下一次對帳就分岔。
   */
  const seat = app.seat;
  const shop = shops[seat] ?? shops[0]!;   // 單機只有一份
  const coop = app.coop;
  /*
   * 誰顧店（2026-09-23 內容擴充第三批 新J，design3 4-4）：名牌、立繪、木牌、服務照這一位；台詞在延後模組（`shop-text.ts`）。
   * 對白框：**第一次見到**這位＝旁白一句＋店主進店那句＋自己回一句；之後再遇到＝店主隨機碎念一句（design3 4-5）。
   * 這一間買滿 3 樣（放生、服務都算）換成「買太多」那兩句；離店時自己講一句、回到地圖的吐司。
   * 橘貓老闆照舊：隨機一句 `dialogue.shopkeeper`，其餘一個字都不動。
   */
  const K = KEEPERS[shop.keeper ?? 'orange'];
  const guest: GuestKeeper | undefined = shop.keeper && shop.keeper !== 'orange' ? shop.keeper : undefined;
  const hero = heroOf(me(run, seat));
  // 第一次見到這位：旗標由引擎在走進格子時寫（`meetKeeper`，推前審查五 低-1），畫面只讀
  const firstMeet = !!guest && keeperFirstMeet(run);
  type Talk = { text: string; reply?: string };
  const chatterPick = Math.random();   // 碎念挑哪一句只是畫面的事，跟橘貓老闆那句同一個做法（不動整局亂數）
  function openingTalk(): Talk {
    const t = guest ? shopTextNow()?.KEEPER_TEXT[guest] : undefined;
    if (!guest) return { text: line };
    if (!t) return { text: '……' };   // 台詞還在路上（地圖上多半早就抓好了）：先只放名字與木牌，到了再補
    const h = t.byHero[hero];
    return firstMeet ? { text: h.enter[0], reply: h.enter[1] } : { text: t.chatter[Math.floor(chatterPick * t.chatter.length)] ?? '' };
  }
  /*
   * 第一次見到這位的旁白放畫面正上方那一條（`notice`），不放進對白框：對白框只擠得下兩行（店主一句＋自己回一句），
   * 再多一行框頂就壓到貨架最下面那排價錢（2026-09-23 實機量過）。欠條那句跟它同一個位置，晚一拍才講，兩條不疊在一起。
   */
  let narrated = false;
  function narrate(): void {
    const t = guest ? shopTextNow()?.KEEPER_TEXT[guest] : undefined;
    if (narrated || !t || !firstMeet) return;
    narrated = true;
    notice(t.firstMeet);
  }
  let talk: Talk | null = null;   // null＝還在開場那一段（台詞晚到時照開場補上）
  /** 這一間買了幾樣（放生、服務都算）：滿 3 樣換成「買太多」那兩句，只換一次 */
  let boughtN = 0;
  function countBuy(): void {
    boughtN += 1;
    const t = guest ? shopTextNow()?.KEEPER_TEXT[guest] : undefined;
    if (t && boughtN === 3) talk = { text: t.byHero[hero].tooMuch[0], reply: t.byHero[hero].tooMuch[1] };
  }
  /** 離店那一句（回到地圖的吐司）；台詞沒到就不講 */
  function sayLeave(): void {
    const t = guest ? shopTextNow()?.KEEPER_TEXT[guest] : undefined;
    if (t) toast(t.byHero[hero].leave, heroSpeaker());
  }
  let alive = true;
  app.disposers.push(() => { alive = false; });
  if (guest && !shopTextNow()) {
    void loadShopText().then(() => {
      if (!alive) return;
      render();
      greet();
    }).catch(() => undefined);
  }
  /*
   * 我倒下了：引擎本來就擋著（`canApplyRun` 對倒下的人一律回 false），
   * 可是畫面照樣把貨架、放生、重整貨架亮著——按下去毫無反應、沒有音效也沒有老闆搖頭，
   * 玩家只會以為當掉了（稽核第三輪 中-3，跟戰鬥那邊已經修掉的是同一個症狀）。
   */
  const iDown = !!coop && !!me(run, seat).down;
  if (coop) {
    coop.attachShop(shops);   // `enterNode` 已經掛過；除錯或重畫進來再掛一次也沒差
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
    if (coop.suspended) { setMood('no'); return false; }   // 自己的線路斷了、正在接回：按了也要等接回才生效，先搖頭免得玩家重按（審查 2026-09-15 低-7）
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
    // 新表情沒生好就退回招呼那張，退不了才整個不放（跟原本一樣）。行腳商用自己那三張（鍵照對照表：`shop/merchant`、`_happy`、`_no`）
    // 罐頭鋪的鍵照這位店主（`shop/keeper_tortoise_happy` → `shop/keeper_tortoise`）
    const base = mer ? 'shop/merchant' : K.art;
    for (const key of mood === 'idle' ? [base] : [`${base}_${mood}`, base]) {
      const url = artUrl('sprites', key);
      if (!url.startsWith('data:')) return url;
    }
    return undefined;
  }
  // 換畫面時把還沒到期的表情計時器拆掉。
  // **不能靠 `root.isConnected` 判斷畫面還在不在**：安靜重畫時 `root` 一直是同一個節點；淡入換場時它會變成
  // 退場層、墊在底下淡出 220 毫秒才拔掉（見 screenswap.ts），那段時間 `isConnected` 還是 true。
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
    // 行腳商按了買不起的：換成他那一句（設計稿 3-6）。只換字、不重畫（理由同上）
    if (mer && m === 'no' && mer.lines && !shopClosed(shop)) say(mer.lines.poor);
  }
  /** 行腳商換一句話（對白框裡那一行字就地換掉，不重畫整頁） */
  function say(text: string): void {
    line = text;
    const node = root.querySelector('.scene-text');
    if (node && !intro) { node.textContent = text; refitGoods(root); }   // 換一句可能變兩行：貨架重新讓位（實機驗收五 中）
  }

  /**
   * 貨架上的一格：圖、名字、說明、價錢。賣掉了寫「賣掉了」；買不起或現在拿不了（例如忍具帶滿）
   * 就變淡、點不動，但價錢照樣寫著——「賣掉了」與「買不起」是兩件事，不要混成同一個樣子。
   */
  /**
   * 價錢牌：特價的把原價劃掉、特價紅字放大（使用者 2026-09-04：「要明顯」）。
   * 店主的帳本（第一件半價）、批發箱（忍具半價）打的折也一樣劃掉原價（2026-09-23 第二批）：只看「比原價便宜」，不分是誰給的。
   */
  function priceNode(price: number, sold: boolean, base?: number, sale?: number, soldText = '賣掉了', item?: object): HTMLElement {
    if (sold) return el('div', { class: 'price' }, soldText);
    // 行腳商劃掉的原價只乘難度（他不吃零錢罐、錢袋那些，原價也不該照它們算）
    // 掌櫃的加價算進「原價」（2026-09-23 第三批）：不然特價那格劃掉的是沒加價的數，跟打完折的價錢對不起來；婆婆的七五折照樣算折扣、劃掉原價
    const orig = base === undefined ? price
      : Math.round(base * (mer ? runMods(run).shopMul : shopMulFor(run, seat) * Math.max(1, item ? keeperMulFor(shop, item) : 1)));
    if (base !== undefined && (sale || price < orig)) {
      return el('div', { class: 'price sale' }, el('s', {}, String(orig)), el('b', {}, `${price} 條小魚乾`));
    }
    return el('div', { class: 'price' }, `${price} 條小魚乾`);
  }
  const saleTag = (sale?: number): HTMLElement | '' => (sale ? el('div', { class: 'sale-tag' }, `特價 ${Math.round(sale * 10)} 折`) : '');
  /** 帳本的半價還沒用掉：每一格掛一個小牌子，讓人知道「現在買哪一件都半價」 */
  const ledgerOn = (): boolean => !shop.merchant && !shop.anyBought && me(run, seat).relics.some((id) => relicById[id]?.hooks.shopFirstItemHalf);
  /** 行腳商收攤了：買下的那格寫「買下了」、其他格子寫「收攤了」（`shopClosed`） */
  const closedText = (sold: boolean): string | undefined => (shopClosed(shop) ? (sold ? '買下了' : '收攤了') : undefined);
  const ledgerTag = (sold: boolean): HTMLElement | '' => (!sold && ledgerOn() ? el('div', { class: 'sale-tag ledger' }, '第一件半價') : '');

  function stall(key: string, name: string, text: string, price: number,
    sold: boolean, blocked: boolean, buy: () => void, base?: number, sale?: number, soldText?: string,
    /** 忍具的稀有度（2026-09-23 內容擴充第一批）：名字底下一個小牌子，秘寶不帶 */
    rarity?: Rarity,
    /** 秘寶的「店長私藏」那一格（罐頭鋪限定池，2026-09-23 第二批）：名字底下一個小牌子 */
    limited?: boolean,
    /** 貨架上那一格本身（2026-09-23 第三批）：劃掉的原價要算店主的加價（`priceNode`） */
    item?: object): HTMLElement {
    const afford = me(run, seat).fish >= price;
    const node = el('div', { class: `shop-item${sold ? ' sold' : afford && !blocked ? '' : ' poor'}${sale && !sold ? ' on-sale' : ''}${limited ? ' limited' : ''}` },
      sale ? saleTag(sold ? undefined : sale) : ledgerTag(sold),
      icon(key, name),
      el('div', { class: 'shop-name' }, name),
      rarity ? el('div', { class: `potion-rarity rarity-${rarity}` }, rarity) : '',
      limited ? el('div', { class: 'potion-rarity rarity-limited' }, '店長私藏') : '',
      el('div', { class: 'small', title: text }, text),   // 貨架上最多四行（screens.css），全文放在滑鼠提示
      priceNode(price, sold, base, sale, soldText, item));
    if (!sold && !blocked && afford && !iDown) node.addEventListener('click', buy);
    else if (!sold) node.addEventListener('click', () => setMood('no'));   // 買不起：老闆搖頭，不再是死按鈕
    // 手機橫拿說明只有 6～7 像素、格子又放不下更大的字：按住放大看，放開不會買（2026-09-23 polish，主控裁定四；桌機不作用）
    attachCardPeek(node);
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
  function bought(sound: 'buy' | 'relic' | 'upgrade', counts = true): void {
    if (coop) return;   // 連線的統一由 onRunApplied 處理
    if (counts) countBuy();
    play(sound); setMood('happy'); merchantDeal(); render();
  }
  /** 行腳商成交了：換成他那一句（收攤那一刻） */
  function merchantDeal(): void { if (mer?.lines) say(pickLine(mer.lines.bought)); }
  /** 回地圖。行腳商那裡一樣都沒買就走，他丟下一句再走（設計稿 3-6）；客座店主那裡自己講離店那一句（`sayLeave`） */
  function leave(): void {
    if (mer?.lines && !shop.anyBought) toast(mer.lines.left, '行腳商');
    app.backToMap();
    sayLeave();
  }

  /** 離開：單機直接走；連線要兩個人都按了才一起上樓 */
  function leaveBtn(): HTMLElement {
    if (!coop) return el('button', { class: 'btn primary', onclick: leave }, mer ? '走了' : '離開');
    const mine = done.has(seat);
    const btn = el('button', { class: 'btn primary', onclick: () => { if (!mine) coop.submitRun({ t: 'done', seat }); } },
      mine ? '等同伴逛完…' : '逛好了');
    if (mine) btn.setAttribute('disabled', 'disabled');
    return btn;
  }

  /**
   * 上一次畫的是開頭那段還是貨架（畫面抖動稽核 2026-09-24 第 1 項）：同一段再畫一次（買完、放生、重整、服務、同伴買了東西）
   * 就是「內容換一點」，對白框與立繪不再從透明滑進來（`calm`），循環動畫接回原進度（`keepLoops`）；
   * 第一次進門、開頭換成貨架那一下照舊播進場。
   * 上一次畫完還沒滿 `ENTER_MS` 也照舊播：客座店主的台詞檔晚一步到、進門那段彈入還沒播完就重畫，
   * 改畫成靜止版的話框和立繪一格跳到定位（推前稽核 2026-09-24 低-1）
   */
  let drawn: 'intro' | 'stall' | null = null;
  let drawnAt = 0;
  function render(): void {
    const mode = mer && intro ? 'intro' : 'stall';
    const calm = drawn === mode && performance.now() - drawnAt > ENTER_MS;
    drawn = mode;
    paint(calm);
    keepLoops(root, app.loopT0);
    if (!calm) drawnAt = performance.now();
  }
  function paint(calm: boolean): void {
    clearKeepBg(root);
    renderHud(app, root);
    if (flashPure) { root.querySelector(`.hud-relic[data-relic="${flashPure}"]`)?.classList.add('purified'); flashPure = null; }
    // 行腳商的開頭：揭曉圖＋這一位的那段話，按一下才攤開貨架（只換畫法，不動任何東西）
    if (mer && intro) {
      const url = artUrl('bg', eventArtKey('q_merchant'));
      root.append(sceneView({
        art: url.startsWith('data:') ? '' : el('img', { class: 'event-art', src: url, alt: '' }),
        speaker: '行腳商',
        text: mer.opening,
        actions: [el('button', { class: 'btn primary', onclick: () => { intro = false; play('click'); render(); } }, '看看貨架（只能挑一樣）')],
        calm,
      }));
      return;
    }
    const closed = shopClosed(shop);   // 行腳商收攤了（只做一筆生意）

    const cards = el('div', { class: 'shop-row' });
    shop.cards.forEach((it, i) => {
      const price = priceFor(run, it, seat, shop);
      // 貨架照自己的角色抽，同伴的專屬招式不會擺上來；這道保險留著，萬一擺上來也寫清楚、不要只是變淡
      const theirs = notMyCard(run, it.def, seat);
      const gone = it.sold || closed;
      const buyable = !gone && !iDown && !theirs && me(run, seat).fish >= price;
      const slot = el('div', { class: `shop-item card-item${gone ? ' sold' : buyable ? '' : ' poor'}${it.sale && !it.sold ? ' on-sale' : ''}` },
        it.sale ? saleTag(it.sold ? undefined : it.sale) : ledgerTag(it.sold),
        cardNode(it.upgraded ? { uid: -1, cardId: it.def.id, upgraded: true } : it.def, { small: true, disabled: !buyable, onClick: () => { act({ t: 'buy', seat, k: 'card', i }, () => buyCard(run, shop, i, seat)) && bought('buy'); } }),   // 升級格照＋版畫
        theirs && !it.sold ? el('div', { class: 'price' }, '同伴的牌') : priceNode(price, gone, it.base, it.sale, closedText(it.sold), it));
      // 停用的牌面 cardNode 自己把點擊吃掉了，買不起要在外框接才收得到
      if (!gone && !buyable) slot.addEventListener('click', () => setMood('no'));
      cards.append(slot);
    });

    // 秘寶與忍具分成兩個貨架。本來兩種混在同一排，玩家看不出哪個是整局有效的秘寶、
    // 哪個是喝掉就沒的忍具（使用者的原話：「上面是卡牌 下面是藥水? 感覺可以分區或框起來」）
    const relics = el('div', { class: 'shop-row' });
    shop.relics.forEach((it, i) => {
      const d = relicById[it.id];
      if (!d) return;
      // 已經有的秘寶買不下去（buyRelic 會擋），當成賣掉，不要讓玩家白按
      const owned = ownsRelic(me(run, seat).relics, it.id);   // 淨化版在身上也算有（推前審查五 高-3，跟 `buyRelic` 同一個判準）
      // 自己已經有、架上卻還沒賣掉的，寫「你已經有了」：寫「賣掉了」的話同伴明明還買得到（連線稽核 高-8）
      relics.append(stall(d.art, d.name, relicLongText(d, me(run, seat).relics, true), priceFor(run, it, seat, shop), it.sold || owned || closed, false,
        () => { act({ t: 'buy', seat, k: 'relic', i }, () => buyRelic(run, shop, i, seat)) && bought('relic'); }, it.base, it.sale,
        closedText(it.sold) ?? (!it.sold && owned ? '你已經有了' : undefined), undefined, !!it.limited, it));
    });
    const potions = el('div', { class: 'shop-row' });
    shop.potions.forEach((it, i) => {
      const d = potionById[it.id];
      if (!d) return;
      // 帶滿了還是能買：先問要換掉哪一支，選了才付錢（2026-09-02）
      const full = me(run, seat).potions.length >= potionCapacity(run, seat);
      const price = priceFor(run, it, seat, shop);
      const poor = me(run, seat).fish < price;
      potions.append(stall(d.art, d.name, full ? `${d.text}（帶滿了，買了要換掉一支）` : d.text, price, it.sold || closed, poor,
        () => {
          if (!full) { act({ t: 'buy', seat, k: 'potion', i }, () => buyPotion(run, shop, i, undefined, seat)) && bought('buy'); return; }
          showPotionSwap(run, it.id, (idx) => { if (idx >= 0) act({ t: 'buy', seat, k: 'potion', i, r: idx }, () => buyPotion(run, shop, i, idx, seat)) && bought('buy'); }, { apply: false, seat });
        }, it.base, it.sale, closedText(it.sold), d.rarity, undefined, it));
    });

    // 放生：挑完先跳確認（使用者 2026-09-04：「選牌後沒有跳確定」），按「再看看」回牌堆重挑
    // 阿福那間放生半價（2026-09-23 第三批）：價錢一律問 `removePrice(…, shop)`，按鈕、確認框、引擎同一個數
    const releaseCost = removePrice(run, seat, shop);
    const pickRelease = (): void => showDeckPicker({
      title: `放生一張牌（${releaseCost} 條小魚乾）`, cards: me(run, seat).deck, pickable: true, cancellable: true,
      onPick: (uid) => {
        const c = uid === null ? undefined : me(run, seat).deck.find((x) => x.uid === uid);
        if (uid === null || !c) { render(); return; }
        showRemoveConfirm(c, releaseCost, (ok) => {
          if (!ok) { pickRelease(); return; }
          // 放生成功也要重畫：牌組少一張、小魚乾也扣了（本來靠 setMood 順便重畫，那條路已經拆掉）
          if (act({ t: 'scrub', seat, u: uid }, () => buyRemove(run, uid, seat, shop))) bought('upgrade');
          render();
        });
      },
    });
    const remove = el('button', {
      class: 'btn',
      onclick: () => pickRelease(),
    }, `放生一張牌：${releaseCost} 條小魚乾${me(run, seat).relics.some((id) => relicById[id]?.hooks.removeCostFixed !== undefined) ? '（會員價，不再漲）' : K.removeMul < 1 ? '（半價）' : ''}`);
    if (iDown || me(run, seat).fish < releaseCost || me(run, seat).deck.length === 0) remove.setAttribute('disabled', 'disabled');
    // 重整貨架：75 條、每店一次，牌／秘寶／忍具沒賣掉的格子全部換一批（2026-09-07 從「只換牌格」擴大）。重整不算「買了一樣」
    const reshuffle = el('button', { class: 'btn', onclick: () => { act({ t: 'shuffle', seat }, () => reshuffleShop(run, shop, seat)) && bought('buy', false); } },
      shop.reshuffled ? '貨架已重整過' : `重整貨架：${RESHUFFLE_COST} 條小魚乾`);
    // 有沒有東西可換要看三區加總，不能只看牌格（稽核 2026-09-07 中 1）：
    // 牌全買光但秘寶或忍具還在架上時，引擎讓你換、按鈕卻是灰的，等於這次改動玩家碰不到
    const anyLeft = [...shop.cards, ...shop.relics, ...shop.potions].some((it) => !it.sold);
    if (iDown || shop.reshuffled || me(run, seat).fish < RESHUFFLE_COST || !anyLeft) reshuffle.setAttribute('disabled', 'disabled');

    // 劇場版面：貨架站在中上方（新招一排、秘寶與忍具一排），老闆站在對白框左邊講話，
    // 放生與離開兩顆鈕排在對白框裡。本來是一塊面板把店景遮掉大半、老闆縮在角落配一顆小泡泡。
    // 客座店主的招牌木牌（2026-09-23 第三批）掛在新牌那座架子上緣的右邊（跟左邊「新牌」同一塊木牌料）：掛在架子上，不多佔一排的高度。
    // 婆婆的六格忍具跟秘寶排同一排（七格並排）：設計稿寫兩排三格，實機排兩排會整排沉到對白框底下（報告有截圖）
    const cardShelf = shelf('新牌', cards, `shelf-cards${shop.cards.length >= 6 ? ' six' : ''}`);
    if (K.sign) cardShelf.append(el('div', { class: 'shelf-label shop-sign' }, K.sign));
    const goods = el('div', { class: 'scene-goods' },
      cardShelf,
      // 珍品架多一格時六格並排，格子縮一點；再加店長私藏（2026-09-23 第二批）七格並排，再縮一級。
      // 第三批起數「秘寶＋忍具」一共幾格（婆婆一件秘寶＋六支忍具＝七格）：橘貓老闆的忍具永遠三格，算出來跟以前一樣
      el('div', { class: `shop-shelves${shop.relics.length + shop.potions.length >= 6 ? ' six' : ''}${shop.relics.length + shop.potions.length >= 7 ? ' seven' : ''}` }, shelf('秘寶', relics), shelf('忍具', potions)));
    const t = talk ?? openingTalk();
    root.append(sceneView({
      art: goods,
      portrait: keeperArt(),
      speaker: mer ? '行腳商' : K.name,
      // 行腳商那裡不是客座店主，`openingTalk` 回的就是 `line`（`say` 換過的那一句）
      text: iDown ? `${heroSpeaker()}倒在門口，只能看著同伴逛。` : t.text,   // 倒下的可能是菲菲（連線稽核 中-5）
      // 自己回的那一句（2026-09-23 第三批）：名字寫本機這一位（`heroSpeaker`），台詞照角色挑（`shop-text.ts`）
      extra: !iDown && t.reply ? [el('div', { class: 'dialogue-text scene-text shop-reply' }, `${heroSpeaker()}：「${t.reply}」`)] : [],
      // 行腳商沒有放生、沒有重整貨架（設計稿 3-2）
      actions: mer ? [leaveBtn()] : [reshuffle, remove, serviceBtn(), leaveBtn()],
      calm,
    }));
    // 行腳商的立繪畫布大一號（360×480，照頭寬縮完背後的貨擔塞不進 332×420）：樣式表照這個 class 把框放大、每像素一樣大（實機驗收五 低-4）
    if (mer) root.querySelector('.scene-portrait')?.classList.add('merchant');
  }

  /** 進門那一拍：初見旁白（正上方那一條），帶欠條的話晚一拍再講那一句 */
  function greet(): void {
    const first = firstMeet && !narrated;
    narrate();
    if (!shop.entryFee) return;
    if (first) window.setTimeout(() => { if (alive) sayDebt(); }, 2800); else sayDebt();
  }

  /*
   * ===== 店主的服務（2026-09-23 內容擴充第三批 新J，design3 4-2、4-4）=====
   * 對白框裡第三顆鈕（跟放生、重整並排）。阿福「舊招換新招」：一間一次、判準問引擎（`canSwap`），連線走 `act()`、等動作繞回來才講話（見 `afterService`）。
   * 婆婆「請婆婆淨化」（身上有沾了魔氣的秘寶才出現）：接淨化那條線（b3rare）的 `canPurifyAtShop`／`purifyAtShop`、`{ t: 'purify' }`、
   * `showPurifyPick` 與台詞 `purify-text.ts`（2026-09-24 b3int 合併後照 b3shop 報告第五節接上）：一件直接淨化、兩件以上跳挑選窗（可以先不要），
   * 判準問引擎，連線等動作繞回來才講話（`afterPurify`）。
   */
  /** 送出去還沒繞回來的那一筆（連線時要等 `onRunApplied` 才知道換成了什麼） */
  let pendingService: { kind: 'swap'; uid: number; oldName: string } | null = null;
  /** 剛淨化好的那一件淨化版：下一次畫狀態列時那一格閃一下白金光（跟貓窩的清心香同一個 `.hud-relic.purified`） */
  let flashPure: string | null = null;
  function serviceBtn(): HTMLElement | '' {
    const svc = shopService(shop);
    if (svc?.kind === 'purify') return purifyBtn();
    if (!svc || svc.kind !== 'swap') return '';
    const btn = el('button', { class: 'btn', onclick: () => pickSwap(svc.cost) }, shop.serviced ? '這間已經換過一招了' : `${svc.label}：${svc.cost} 條小魚乾`);
    if (iDown || !me(run, seat).deck.some((c) => canSwap(run, shop, c.uid, seat))) btn.setAttribute('disabled', 'disabled');
    return btn;
  }
  const pickSwap = (cost: number): void => showDeckPicker({
    title: `舊招換新招（${cost} 條小魚乾）：挑一張，換成隨機一張罕見以上的牌`, cards: me(run, seat).deck, pickable: true, cancellable: true,
    onPick: (uid) => {
      const c = uid === null ? undefined : me(run, seat).deck.find((x) => x.uid === uid);
      const def = c ? cardById[c.cardId] : undefined;
      if (uid === null || !c || !def) { render(); return; }
      pendingService = { kind: 'swap', uid, oldName: cardNameFor(def, hero) };
      if (act({ t: 'buy', seat, k: 'swap', u: uid }, () => buySwap(run, shop, uid, seat) !== null) && !coop) afterService();
      else render();   // 換不成（錢不夠、連線斷著）或連線送出去等繞回來：照樣把牌組視窗收掉後的畫面重畫一次
    },
  });
  function purifyBtn(): HTMLElement | '' {
    const list = miasmaRelicsOf(run, seat);
    if (!list.length) return '';
    const go = (id: string | null): void => {
      if (!id) return;
      if (act({ t: 'purify', seat, id }, () => purifyAtShop(run, shop, id, seat)) && !coop) afterPurify(id);
    };
    const btn = el('button', { class: 'btn', onclick: () => (list.length === 1 ? go(list[0]!) : showPurifyPick(list, go, { cancellable: true })) },
      shop.purified ? '這間已經淨化過了' : tortoisePurifyLabel(PURIFY_PRICE));
    if (iDown || !list.some((id) => canPurifyAtShop(run, shop, id, seat))) btn.setAttribute('disabled', 'disabled');
    return btn;
  }
  /** 淨化好了：系統提示哪一件變成哪一件、婆婆那句＋自己回一句、那一格閃白金光（單機當下叫；連線等動作繞回來才叫） */
  function afterPurify(id: string): void {
    const pure = MIASMA_PURE[id] ?? '';
    notice(`「${relicById[id]?.name ?? id}」淨化成「${relicById[pure]?.name ?? pure}」了。`);
    talk = { text: TORTOISE_PURIFY_LINE, reply: purifyLine(hero) };
    flashPure = pure;
    countBuy();   // 服務也算「買了一樣」（design3 4-5）
    play('upgrade'); setMood('happy');
    if (!coop) render();
    showPurifyReveal([id]);   // 淨化結果視窗（2026-09-25）：疊層不會被店裡重畫掃掉，連線時繞回來那一次重畫也一樣
  }
  /** 服務做完了：系統提示一行、對白框換成自己那一句、老闆笑一下（單機當下叫；連線等動作繞回來才叫） */
  function afterService(): void {
    const s = pendingService;
    pendingService = null;
    if (!s) return;
    const text = shopTextNow();
    const now = me(run, seat).deck.find((x) => x.uid === s.uid);
    const def = now ? cardById[now.cardId] : undefined;
    if (def) notice(`「${s.oldName}」換成了「${cardNameFor(def, hero)}」`);
    if (text) talk = { text: (talk ?? openingTalk()).text, reply: text.SWAP_LINES[hero] };
    // 服務也算「買了一樣」（design3 4-5）。連線時由 `onRunApplied` 叫、它自己會重畫，這裡不重畫
    countBuy();
    play('upgrade'); setMood('happy');
    if (!coop) render();
  }
  /** 帶「山賊的欠條」第一次進門那一句：客座店主講自己的（design3 4-5），橘貓老闆照舊 */
  function sayDebt(): void {
    const t = guest ? shopTextNow()?.KEEPER_TEXT[guest] : undefined;
    const fee = shop.entryFee ?? 0;
    if (t) notice(`${t.short}：「${t.debt}」${fee < 10 ? `（身上只有 ${fee} 條，全收走了）` : ''}`);
    else notice(`老闆認得那張欠條，先收走 ${fee} 條小魚乾`);
  }

  if (coop) {
    coop.onRunApplied((applied) => {
      for (const one of applied) {
        if (one.a.t === 'done') done.add(one.a.seat);
        // 店主的服務繞回來了（2026-09-23 第三批）：這時才講「換成了什麼」、換對白（`afterService` 自己播聲、自己算一樣）
        else if (one.a.seat === seat && one.a.t === 'buy' && one.a.k === 'swap') afterService();
        else if (one.a.seat === seat && one.a.t === 'purify') afterPurify(one.a.id);   // 婆婆淨化繞回來了（2026-09-24 b3int）
        // 換忍具（`swap`，由 potionswap 送出）不是買東西，不播買賣聲（總稽核 B 低-5）
        else if (one.a.seat === seat && one.a.t !== 'swap') {
          play(one.a.t === 'buy' && one.a.k === 'relic' ? 'relic' : one.a.t === 'scrub' ? 'upgrade' : 'buy'); setMood('happy');
          if (one.a.t === 'buy' || one.a.t === 'scrub') countBuy();   // 重整不算「買了一樣」
          if (one.a.t === 'buy') merchantDeal();
        }
      }
      if (allDone()) { leave(); return; }
      render();
    });
  }

  render();
  // 山賊的欠條（2026-09-23 第二批）：進門就被收走的那幾條要講出來，不然狀態列的小魚乾少了一截卻不知道為什麼。
  // 客座店主的台詞還沒到就等到了再講（上面 `loadShopText` 那一段，同一支 `greet`）
  if (!guest || shopTextNow()) greet();
});
