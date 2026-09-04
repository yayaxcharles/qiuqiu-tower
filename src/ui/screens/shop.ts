import { play } from '../audio';
import { dialogue } from '../../content/dialogue';
import { potionById } from '../../content/potions';
import { relicById } from '../../content/relics';
import { RESHUFFLE_COST, buyCard, buyPotion, buyRelic, buyRemove, makeShop, potionCapacity, reshuffleShop, shopMulFor } from '../../engine/run';
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

/** 圖示還沒生好時 artUrl 會回一張灰剪影；貨架每格都寫著名字，寧可不放圖也不要排一列灰影 */
function icon(key: string, alt: string): Node | string {
  const url = artUrl('icons', key);
  return url.startsWith('data:') ? '' : el('img', { src: url, alt });
}

registerScreen('shop', (app, root) => {
  root.append(screenBg(actVariantKey('bg/screen_shop', app.run?.act ?? 1)));
  if (!app.run) { app.show('title'); return; }
  const run: RunState = app.run;   // 收斂成不可為 null 的區域常數：窄化不會跟著進到下面的內部函式
  // 進貨只做一次：makeShop 會推進 run.rng，每次重畫都叫的話買一樣東西整個貨架就換一批
  const shop = makeShop(run);
  const line = dialogue.shopkeeper[Math.floor(Math.random() * dialogue.shopkeeper.length)] ?? '';
  // 老闆站在對白框左邊講話（劇場版面）；立繪沒生好就只留對白
  const keeperUrl = artUrl('sprites', 'shop/keeper');
  const keeper = keeperUrl.startsWith('data:') ? undefined : keeperUrl;

  /**
   * 貨架上的一格：圖、名字、說明、價錢。賣掉了寫「賣掉了」；買不起或現在拿不了（例如忍具帶滿）
   * 就變淡、點不動，但價錢照樣寫著——「賣掉了」與「買不起」是兩件事，不要混成同一個樣子。
   */
  /** 價錢牌：特價的把原價劃掉、特價紅字放大（使用者 2026-09-04：「要明顯」） */
  function priceNode(price: number, sold: boolean, base?: number, sale?: number): HTMLElement {
    if (sold) return el('div', { class: 'price' }, '賣掉了');
    if (sale && base !== undefined) {
      const orig = Math.round(base * shopMulFor(run));
      return el('div', { class: 'price sale' }, el('s', {}, String(orig)), el('b', {}, `${price} 條小魚乾`));
    }
    return el('div', { class: 'price' }, `${price} 條小魚乾`);
  }
  const saleTag = (sale?: number): HTMLElement | '' => (sale ? el('div', { class: 'sale-tag' }, `特價 ${Math.round(sale * 10)} 折`) : '');

  function stall(key: string, name: string, text: string, price: number,
    sold: boolean, blocked: boolean, buy: () => void, base?: number, sale?: number): HTMLElement {
    const afford = run.fish >= price;
    const node = el('div', { class: `shop-item${sold ? ' sold' : afford && !blocked ? '' : ' poor'}${sale && !sold ? ' on-sale' : ''}` },
      saleTag(sold ? undefined : sale),
      icon(key, name),
      el('div', { class: 'shop-name' }, name),
      el('div', { class: 'small' }, text),
      priceNode(price, sold, base, sale));
    if (!sold && !blocked && afford) node.addEventListener('click', buy);
    return node;
  }

  /** 一個掛著木牌標籤的貨架，跟戰利品畫面同一套 */
  function shelf(label: string, body: HTMLElement, extra = ''): HTMLElement {
    return el('div', { class: `shelf ${extra}`.trim() },
      el('div', { class: 'shelf-label' }, label), body);
  }

  function render(): void {
    clearKeepBg(root);
    renderHud(app, root);

    const cards = el('div', { class: 'shop-row' });
    shop.cards.forEach((it, i) => {
      const buyable = !it.sold && run.fish >= it.price;
      cards.append(el('div', { class: `shop-item card-item${it.sold ? ' sold' : buyable ? '' : ' poor'}${it.sale && !it.sold ? ' on-sale' : ''}` },
        saleTag(it.sold ? undefined : it.sale),
        cardNode(it.upgraded ? { uid: -1, cardId: it.def.id, upgraded: true } : it.def, { small: true, disabled: !buyable, onClick: () => { if (buyCard(run, shop, i)) { play('buy'); render(); } } }),   // 升級格照＋版畫
        priceNode(it.price, it.sold, it.base, it.sale)));
    });

    // 秘寶與忍具分成兩個貨架。本來兩種混在同一排，玩家看不出哪個是整局有效的秘寶、
    // 哪個是喝掉就沒的忍具（使用者的原話：「上面是卡牌 下面是藥水? 感覺可以分區或框起來」）
    const relics = el('div', { class: 'shop-row' });
    shop.relics.forEach((it, i) => {
      const d = relicById[it.id];
      if (!d) return;
      // 已經有的秘寶買不下去（buyRelic 會擋），當成賣掉，不要讓玩家白按
      const owned = run.relics.includes(it.id);
      relics.append(stall(d.art, d.name, d.text, it.price, it.sold || owned, false,
        () => { if (buyRelic(run, shop, i)) { play('relic'); render(); } }, it.base, it.sale));
    });
    const potions = el('div', { class: 'shop-row' });
    shop.potions.forEach((it, i) => {
      const d = potionById[it.id];
      if (!d) return;
      // 帶滿了還是能買：先問要換掉哪一支，選了才付錢（2026-09-02）
      const full = run.potions.length >= potionCapacity(run);
      const poor = run.fish < it.price;
      potions.append(stall(d.art, d.name, full ? `${d.text}（帶滿了，買了要換掉一支）` : d.text, it.price, it.sold, poor,
        () => {
          if (!full) { if (buyPotion(run, shop, i)) { play('buy'); render(); } return; }
          showPotionSwap(run, it.id, (idx) => { if (idx >= 0 && buyPotion(run, shop, i, idx)) { play('buy'); render(); } }, { apply: false });
        }, it.base, it.sale));
    });

    // 放生：挑完先跳確認（使用者 2026-09-04：「選牌後沒有跳確定」），按「再看看」回牌堆重挑
    const pickRelease = (): void => showDeckPicker({
      title: `放生一張牌（${run.removeCost} 條小魚乾）`, cards: run.deck, pickable: true, cancellable: true,
      onPick: (uid) => {
        const c = uid === null ? undefined : run.deck.find((x) => x.uid === uid);
        if (uid === null || !c) { render(); return; }
        showRemoveConfirm(c, run.removeCost, (ok) => {
          if (!ok) { pickRelease(); return; }
          if (buyRemove(run, uid)) play('upgrade');
          render();
        });
      },
    });
    const remove = el('button', {
      class: 'btn',
      onclick: () => pickRelease(),
    }, `放生一張牌：${run.removeCost} 條小魚乾`);
    if (run.fish < run.removeCost || run.deck.length === 0) remove.setAttribute('disabled', 'disabled');
    // 重整貨架：75 條、每店一次，只換沒賣掉的牌格（使用者 2026-09-04）
    const reshuffle = el('button', { class: 'btn', onclick: () => { if (reshuffleShop(run, shop)) { play('buy'); render(); } } },
      shop.reshuffled ? '貨架已重整過' : `重整貨架：${RESHUFFLE_COST} 條小魚乾`);
    if (shop.reshuffled || run.fish < RESHUFFLE_COST || shop.cards.every((c) => c.sold)) reshuffle.setAttribute('disabled', 'disabled');

    // 劇場版面：貨架站在中上方（新招一排、秘寶與忍具一排），老闆站在對白框左邊講話，
    // 放生與離開兩顆鈕排在對白框裡。本來是一塊面板把店景遮掉大半、老闆縮在角落配一顆小泡泡。
    const goods = el('div', { class: 'scene-goods' },
      shelf('新招', cards, 'shelf-cards'),
      el('div', { class: `shop-shelves${shop.relics.length >= 3 ? ' six' : ''}` }, shelf('秘寶', relics), shelf('忍具', potions)));   // 珍品架多一格時六格並排，格子縮一點
    root.append(sceneView({
      art: goods,
      portrait: keeper,
      speaker: '橘貓老闆',
      text: line,
      actions: [reshuffle, remove, el('button', { class: 'btn primary', onclick: () => app.backToMap() }, '離開')],
    }));
  }

  render();
});
