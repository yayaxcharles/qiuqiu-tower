import { describe, expect, it } from 'vitest';
import { FEIFEI_CARD_NAME, cardById, cardNameFor, cards } from '../../src/content/cards';
describe('菲菲的牌名', () => {
  it('對照表裡每個牌號都要真的存在', () => {
    for (const id of Object.keys(FEIFEI_CARD_NAME)) expect(cardById[id], id).toBeTruthy();
  });
  it('她看到的是新名字，球球看到的是原名', () => {
    expect(cardNameFor(cardById['liangzhua']!, 'feifei')).toBe('磨利飛針');
    expect(cardNameFor(cardById['liangzhua']!, 'ninja')).toBe('亮出爪子');
    // 2026-09-14 使用者逐張指定的四張共用牌
    expect(cardNameFor(cardById['zhaonishuodeda']!, 'feifei')).toBe('抽牌讓你打');
    expect(cardNameFor(cardById['xianbangniliuzhe']!, 'feifei')).toBe('我們一起擋');
    expect(cardNameFor(cardById['wozaizhe']!, 'feifei')).toBe('大聲吼叫');
    expect(cardNameFor(cardById['hujin']!, 'feifei')).toBe('絕學·貓布袋');
    expect(cardNameFor(cardById['hujin']!, 'ninja'), '球球那邊不動').toBe('絕學·護金');
    expect(cardNameFor(cardById['dieda']!, 'feifei'), '絕學兩字留著').toBe('絕學·連珠針');
  });

  /*
   * 前綴的規矩（使用者 2026-09-12）：絕學留著、忍術拿掉。
   * 拿掉做成通則而不是逐張列——忍術牌有四十幾張，逐張列遲早漏一張。
   */
  it('她手上所有忍術牌都沒有「忍術·」，絕學牌一律留著', () => {
    for (const c of cards) {
      const got = cardNameFor(c, 'feifei');
      expect(got.startsWith('忍術·'), `${c.name} 還掛著忍術`).toBe(false);
      if (c.name.startsWith('絕學·') && !FEIFEI_CARD_NAME[c.id]) {
        expect(got, `${c.name} 的絕學被吃掉了`).toBe(c.name);
      }
      expect(cardNameFor(c, 'ninja'), `${c.name} 球球那邊不該動`).toBe(c.name);
    }
  });

  it('沒列在對照表、也不是忍術的，兩邊一模一樣', () => {
    expect(cardNameFor(cardById['jiejie']!, 'feifei')).toBe('結界');
    expect(cardNameFor(cardById['shunkan']!, 'feifei'), '忍術·瞬間移動 → 瞬間移動').toBe('瞬間移動');
  });
});
