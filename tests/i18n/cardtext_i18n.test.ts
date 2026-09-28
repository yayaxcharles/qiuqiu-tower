/**
 * 英日牌面文字產生器（多語系第一片，2026-09-29）：每一張牌、升級前後都寫得出來，而且沒有漏翻的中文。
 * 幾張代表牌釘住句子，改產生器時看得到差在哪。
 */
import { afterAll, describe, expect, it } from 'vitest';
import { cards, cardById } from '../../src/content/cards';
import { _setPackForTest } from '../../src/i18n';
import en from '../../src/i18n/en/index';
import ja from '../../src/i18n/ja/index';
import { describeCard } from '../../src/ui/cardtext';

const CJK = /[㐀-鿿]/;
const ZH_ONLY = /[貓鋪寶獲彈數體們這點層雙對從與闆噹糰]/;

afterAll(() => _setPackForTest('zh', null));

describe('英文牌面', () => {
  it('每張牌升級前後都有字、沒有中文', () => {
    _setPackForTest('en', en);
    const bad: string[] = [];
    for (const c of cards) for (const up of [false, true]) {
      const s = en.describeCard(c, up, 0);
      if (!s || CJK.test(s)) bad.push(`${c.id}${up ? '+' : ''}: ${s}`);
    }
    expect(bad).toEqual([]);
  });
  it('代表牌', () => {
    expect(en.describeCard(cardById['sanjo']!, false, 0)).toBe('Deal 6 damage.');
    expect(en.describeCard(cardById['tanding']!, true, 0)).toBe('Gain 8 Curl.');
  });
});

describe('日文牌面', () => {
  it('每張牌升級前後都有字、沒有繁體字形', () => {
    _setPackForTest('ja', ja);
    const bad: string[] = [];
    for (const c of cards) for (const up of [false, true]) {
      const s = ja.describeCard(c, up, 0);
      if (!s || ZH_ONLY.test(s)) bad.push(`${c.id}${up ? '+' : ''}: ${s}`);
    }
    expect(bad).toEqual([]);
  });
});

describe('繁中不受影響', () => {
  it('沒載語言包時照舊是中文產生器', () => {
    _setPackForTest('zh', null);
    expect(describeCard(cardById['sanjo']!, false)).toBe('造成 6 點傷害。');
  });
});
