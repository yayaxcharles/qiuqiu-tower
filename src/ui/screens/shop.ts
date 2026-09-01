import { play } from '../audio';
import { dialogue } from '../../content/dialogue';
import { potionById } from '../../content/potions';
import { relicById } from '../../content/relics';
import { buyCard, buyPotion, buyRelic, buyRemove, makeShop } from '../../engine/run';
import type { RunState } from '../../engine/types';
import { registerScreen } from '../app';
import { clearKeepBg, screenBg } from '../screenbg';
import { artUrl } from '../assets';
import { cardNode } from '../cardview';
import { showDeckPicker } from '../deckview';
import { el } from '../dom';
import { renderHud } from '../hud';

/** 圖示還沒生好時 artUrl 會回一張灰剪影；貨架每格都寫著名字，寧可不放圖也不要排一列灰影 */
function icon(key: string, alt: string): Node | string {
  const url = artUrl('icons', key);
  return url.startsWith('data:') ? '' : el('img', { src: url, alt });
}

registerScreen('shop', (app, root) => {
  root.append(screenBg('bg/screen_shop'));
  if (!app.run) { app.show('title'); return; }
  const run: RunState = app.run;   // 收斂成不可為 null 的區域常數：窄化不會跟著進到下面的內部函式
  // 進貨只做一次：makeShop 會推進 run.rng，每次重畫都叫的話買一樣東西整個貨架就換一批
  const shop = makeShop(run);
  const line = dialogue.shopkeeper[Math.floor(Math.random() * dialogue.shopkeeper.length)] ?? '';

  /**
   * 貨架上的一格：圖、名字、說明、價錢。賣掉了寫「賣掉了」；買不起或現在拿不了（例如忍具帶滿）
   * 就變淡、點不動，但價錢照樣寫著——「賣掉了」與「買不起」是兩件事，不要混成同一個樣子。
   */
  function stall(key: string, name: string, text: string, price: number,
    sold: boolean, blocked: boolean, buy: () => void): HTMLElement {
    const afford = run.fish >= price;
    const node = el('div', { class: `shop-item${sold ? ' sold' : afford && !blocked ? '' : ' poor'}` },
      icon(key, name),
      el('div', { class: 'shop-name' }, name),
      el('div', { class: 'small' }, text),
      el('div', { class: 'price' }, sold ? '賣掉了' : `${price} 條小魚乾`));
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
      cards.append(el('div', { class: `shop-item card-item${it.sold ? ' sold' : buyable ? '' : ' poor'}` },
        cardNode(it.def, { small: true, disabled: !buyable, onClick: () => { if (buyCard(run, shop, i)) { play('buy'); render(); } } }),
        el('div', { class: 'price' }, it.sold ? '賣掉了' : `${it.price} 條小魚乾`)));
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
        () => { if (buyRelic(run, shop, i)) { play('relic'); render(); } }));
    });
    const potions = el('div', { class: 'shop-row' });
    shop.potions.forEach((it, i) => {
      const d = potionById[it.id];
      if (!d) return;
      // 忍具最多帶三支，帶滿了就買不下去（buyPotion 會擋）：講明原因，不要假裝是賣掉了
      const full = run.potions.length >= 3;
      potions.append(stall(d.art, d.name, full ? `${d.text}（忍具帶滿了）` : d.text, it.price, it.sold, full,
        () => { if (buyPotion(run, shop, i)) { play('buy'); render(); } }));
    });

    const remove = el('button', {
      class: 'btn',
      onclick: () => showDeckPicker({
        title: `放生一張牌（${run.removeCost} 條小魚乾）`, cards: run.deck, pickable: true, cancellable: true,
        onPick: (uid) => { if (uid !== null) { buyRemove(run, uid); play('upgrade'); } render(); },
      }),
    }, `放生一張牌：${run.removeCost} 條小魚乾`);
    if (run.fish < run.removeCost || run.deck.length === 0) remove.setAttribute('disabled', 'disabled');

    // 老闆站在左上角，台詞裝進他旁邊的泡泡——本來只有一行灰字寫著「橘貓老闆：「…」」，
    // 店裡看不到老闆，跟對白框沒有立繪是同一個毛病。
    const keeperUrl = artUrl('sprites', 'shop/keeper');
    const head = el('div', { class: 'shop-head' },
      keeperUrl.startsWith('data:') ? '' : el('img', { class: 'shop-keeper', src: keeperUrl, alt: '橘貓老闆' }),
      el('div', { class: 'shop-head-text' },
        el('div', { class: 'shop-sign' }, '罐頭鋪'),
        el('div', { class: 'shop-bubble' }, line)));

    root.append(el('div', { class: 'screen shop' },
      head,
      shelf('新招', cards, 'shelf-cards'),
      el('div', { class: 'shop-shelves' },
        shelf('秘寶', relics),
        shelf('忍具', potions)),
      el('div', { class: 'shop-actions' },
        remove,
        el('button', { class: 'btn primary', onclick: () => app.backToMap() }, '離開'))));
  }

  render();
});
