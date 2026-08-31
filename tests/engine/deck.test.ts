import { describe, expect, it } from 'vitest';
import { HAND_LIMIT, cardStats, discardHand, draw, findCard, moveCard } from '../../src/engine/deck';
import { Rng, seedFromString } from '../../src/engine/rng';
import { blankPlayer, inst } from '../helpers';

describe('牌堆', () => {
  it('cardStats：升級版覆蓋費用／效果／關鍵字', () => {
    expect(cardStats(inst('sanjo', 1)).effects).toEqual([{ kind: 'damage', amount: 6 }]);
    expect(cardStats(inst('sanjo', 1, true)).effects).toEqual([{ kind: 'damage', amount: 9 }]);
    expect(cardStats(inst('shuaiguo', 2)).cost).toBe(2);
    expect(cardStats(inst('shuaiguo', 2, true)).cost).toBe(0);
    expect(cardStats(inst('taxue', 3)).keywords).toEqual(['消耗']);
    expect(cardStats(inst('taxue', 3, true)).keywords).toEqual([]);
    expect(cardStats(inst('sanjo', 1, true)).name).toBe('貓抓＋');
  });
  it('抽牌：抽牌堆空時把棄牌堆洗回，同種子同順序', () => {
    const rng = new Rng(seedFromString('deck'));
    const p = blankPlayer(['sanjo', 'sanjo', 'tanding']);
    p.discardPile = [inst('kawarimi', 9), inst('qianliyan', 10)];
    const got = draw(p, 5, rng);
    expect(got.length).toBe(5);
    expect(p.hand.length).toBe(5); expect(p.drawPile.length).toBe(0); expect(p.discardPile.length).toBe(0);
    const rng2 = new Rng(seedFromString('deck'));
    const q = blankPlayer(['sanjo', 'sanjo', 'tanding']);
    q.discardPile = [inst('kawarimi', 9), inst('qianliyan', 10)];
    expect(draw(q, 5, rng2).map((c) => c.uid)).toEqual(got.map((c) => c.uid));
  });
  it('手牌上限 10，多的留在抽牌堆', () => {
    const p = blankPlayer(Array(15).fill('sanjo'));
    draw(p, 12, new Rng(seedFromString('x')));
    expect(p.hand.length).toBe(HAND_LIMIT); expect(p.drawPile.length).toBe(5);
  });
  it('抽到「內力不足」失去 1 顆飯糰', () => {
    const p = blankPlayer(['neili']);
    draw(p, 1, new Rng(seedFromString('x')));
    expect(p.energy).toBe(2);
    p.energy = 0; p.drawPile = [inst('neili', 5)];
    draw(p, 1, new Rng(seedFromString('x')));
    expect(p.energy).toBe(0);
  });
  it('棄手牌：保留關鍵字與 retained 名單留下', () => {
    const p = blankPlayer();
    p.hand = [inst('sanjo', 1), inst('tanding', 2), inst('sanjo', 3)];
    p.retained = [2];
    discardHand(p);
    expect(p.hand.map((c) => c.uid)).toEqual([2]);
    expect(p.discardPile.map((c) => c.uid)).toEqual([1, 3]);
    expect(p.retained).toEqual([]);
  });
  it('moveCard 與 findCard', () => {
    const p = blankPlayer(['sanjo', 'tanding']);
    expect(findCard(p, 1)?.pile).toBe('draw');
    expect(moveCard(p, 1, 'hand')).toBe(true); expect(findCard(p, 1)?.pile).toBe('hand');
    expect(moveCard(p, 1, 'exhaust')).toBe(true); expect(p.exhaustPile.length).toBe(1);
    expect(moveCard(p, 2, 'drawTop')).toBe(true); expect(p.drawPile[0]?.uid).toBe(2);
    expect(moveCard(p, 99, 'hand')).toBe(false);
  });
});
