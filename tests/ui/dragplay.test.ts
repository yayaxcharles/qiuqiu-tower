import { describe, expect, it } from 'vitest';
import { DRAG_PLAY_THRESHOLD, beginCardDrag, cardDragTo, dropDecision } from '../../src/ui/dragplay';

describe('拖牌出牌', () => {
  it('沒動到門檻就不算拖（那一下留給既有的點擊流程）', () => {
    const s = beginCardDrag(400, 600);
    expect(cardDragTo(s, 403, 604).moved).toBe(false);   // 3+4=7 < 8
    expect(cardDragTo(s, 404, 604).moved).toBe(true);    // 4+4=8
  });

  it('門檻用螢幕像素，位移換算回版面像素', () => {
    // 倍率 2＝畫面放大兩倍：手移動 100 螢幕像素，牌只該在版面上挪 50，看起來才黏在手上
    const s = beginCardDrag(400, 600);
    const to = cardDragTo(s, 400, 500, 2);
    expect(to.dy).toBe(-50);
    expect(cardDragTo(beginCardDrag(400, 600), 400, 500, 1).dy).toBe(-100);
  });

  it('倍率給 0 當成 1，不會算出 Infinity', () => {
    expect(cardDragTo(beginCardDrag(400, 600), 400, 500, 0).dy).toBe(-100);
  });

  it('要選目標的牌：壓在魔物身上就打牠', () => {
    expect(dropDecision({ needsTarget: true, overEnemyUid: 7, leftHand: true }))
      .toEqual({ kind: 'play', targetUid: 7 });
  });

  it('要選目標的牌：沒壓到魔物就退回，不消耗飯糰', () => {
    expect(dropDecision({ needsTarget: true, overEnemyUid: null, leftHand: true }))
      .toEqual({ kind: 'cancel' });
  });

  it('不用選目標的牌：拉離手牌區就打出，壓到誰都無所謂', () => {
    expect(dropDecision({ needsTarget: false, overEnemyUid: null, leftHand: true }))
      .toEqual({ kind: 'play' });
    expect(dropDecision({ needsTarget: false, overEnemyUid: 3, leftHand: true }))
      .toEqual({ kind: 'play' });
  });

  it('不用選目標的牌：沒拉出手牌區＝反悔，放回原處就好', () => {
    expect(dropDecision({ needsTarget: false, overEnemyUid: null, leftHand: false }))
      .toEqual({ kind: 'cancel' });
  });

  it('門檻是橫豎相加不是直線距離', () => {
    // 斜著 5+5：相加 10 過門檻，直線只有 7.07 不過。改成 Math.hypot 這題就會紅
    const s = beginCardDrag(400, 600);
    expect(cardDragTo(s, 405, 605).moved).toBe(true);
    expect(DRAG_PLAY_THRESHOLD).toBe(8);
  });
});
