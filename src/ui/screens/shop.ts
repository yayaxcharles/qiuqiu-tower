import { dialogue } from '../../content/dialogue';
import { potionById } from '../../content/potions';
import { relicById } from '../../content/relics';
import { buyCard, buyPotion, buyRelic, buyRemove, makeShop } from '../../engine/run';
import type { RunState } from '../../engine/types';
import { registerScreen } from '../app';
import { artUrl } from '../assets';
import { cardNode } from '../cardview';
import { showDeckPicker } from '../deckview';
import { clear, el } from '../dom';
import { renderHud } from '../hud';

/** 圖示還沒生好時 artUrl 會回一張灰剪影；貨架每格都寫著名字，寧可不放圖也不要排一列灰影 */
function icon(key: string, alt: string): Node | string {
  const url = artUrl('icons', key);
  return url.startsWith('data:') ? '' : el('img', { src: url, alt });
}

registerScreen('shop', (app, root) => {
  if (!app.run) { app.show('title'); return; }
  const run: RunState = app.run;   // 收斂成不可為 null 的區域常數：窄化不會跟著進到下面的內部函式
  // 進貨只做一次：makeShop 會推進 run.rng，每次重畫都叫的話買一樣東西整個貨架就換一批
  const shop = makeShop(run);
  const line = dialogue.shopkeeper[Math.floor(Math.random() * dialogue.shopkeeper.length)] ?? '';

  /**
   * 貨架上的一格：圖、名字、說明、價錢。賣掉了寫「售出」；買不起或現在拿不了（例如忍具帶滿）
   * 就變淡、點不動，但價錢照樣寫著——「售出」與「買不起」是兩件事，不要混成同一個樣子。
   */
  function stall(key: string, name: string, text: string, price: number,
    sold: boolean, blocked: boolean, buy: () => void): HTMLElement {
    const afford = run.fish >= price;
    const node = el('div', { class: `shop-item${sold ? ' sold' : afford && !blocked ? '' : ' poor'}` },
      icon(key, name),
      el('div', { class: 'shop-name' }, name),
      el('div', { class: 'small' }, text),
      el('div', { class: 'price' }, sold ? '售出' : `${price} 小魚乾`));
    if (!sold && !blocked && afford) node.addEventListener('click', buy);
    return node;
  }

  function render(): void {
    clear(root);
    renderHud(app, root);

    const cards = el('div', { class: 'shop-row' });
    shop.cards.forEach((it, i) => {
      const buyable = !it.sold && run.fish >= it.price;
      cards.append(el('div', { class: `shop-item card-item${it.sold ? ' sold' : buyable ? '' : ' poor'}` },
        cardNode(it.def, { small: true, disabled: !buyable, onClick: () => { if (buyCard(run, shop, i)) render(); } }),
        el('div', { class: 'price' }, it.sold ? '售出' : `${it.price} 小魚乾`)));
    });

    const goods = el('div', { class: 'shop-row' });
    shop.relics.forEach((it, i) => {
      const d = relicById[it.id];
      if (!d) return;
      // 已經有的秘寶買不下去（buyRelic 會擋），當成賣掉，不要讓玩家白按
      const owned = run.relics.includes(it.id);
      goods.append(stall(d.art, d.name, d.text, it.price, it.sold || owned, false,
        () => { if (buyRelic(run, shop, i)) render(); }));
    });
    shop.potions.forEach((it, i) => {
      const d = potionById[it.id];
      if (!d) return;
      // 忍具最多帶三支，帶滿了就買不下去（buyPotion 會擋）：講明原因，不要假裝是售出
      const full = run.potions.length >= 3;
      goods.append(stall(d.art, d.name, full ? `${d.text}（忍具帶滿了）` : d.text, it.price, it.sold, full,
        () => { if (buyPotion(run, shop, i)) render(); }));
    });

    const remove = el('button', {
      class: 'btn',
      onclick: () => showDeckPicker({
        title: `放生一張牌（${run.removeCost} 小魚乾）`, cards: run.deck, pickable: true, cancellable: true,
        onPick: (uid) => { if (uid !== null) buyRemove(run, uid); render(); },
      }),
    }, `放生一張牌：${run.removeCost} 小魚乾`);
    if (run.fish < run.removeCost || run.deck.length === 0) remove.setAttribute('disabled', 'disabled');

    root.append(el('div', { class: 'screen shop' },
      el('h1', {}, '罐頭鋪'),
      el('p', { class: 'shopkeeper' }, `橘貓老闆：「${line}」`),
      cards,
      goods,
      el('div', { class: 'shop-actions' },
        remove,
        el('button', { class: 'btn primary', onclick: () => app.backToMap() }, '離開'))));
  }

  render();
});
