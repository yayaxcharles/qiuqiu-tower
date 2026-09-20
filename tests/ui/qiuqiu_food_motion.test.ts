import { describe, expect, it } from 'vitest';
import { cardStats } from '../../src/engine/deck';
import { qiuqiuCardAction } from '../../src/ui/qiuqiu-motion';

describe('球球食物卡動作', () => {
  it.each([false, true])('偷吃術升級=%s 使用吃飯動作，補充飯糰與抽牌仍照原規則', (upgraded) => {
    const card = { uid: 1, cardId: 'touchi', upgraded };
    const stats = cardStats(card);
    expect(qiuqiuCardAction(card.cardId, undefined, 0, upgraded)).toBe('eat');
    expect(stats.effects).toEqual(upgraded
      ? [{ kind: 'energy', n: 1 }, { kind: 'draw', n: 1 }]
      : [{ kind: 'energy', n: 1 }]);
  });

  it.each(['xianshuile', 'guixi', 'tianmao', 'jiuming', 'fanpu'])('%s 保留既有恢復動作', (cardId) => {
    expect(qiuqiuCardAction(cardId, undefined, 0)).toBe('eat');
    expect(qiuqiuCardAction(cardId, undefined, 0, true)).toBe('eat');
  });
});
