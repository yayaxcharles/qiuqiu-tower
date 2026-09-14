import { describe, expect, it } from 'vitest';
import { allVoted, settleVotes } from '../../src/engine/vote';
import { Rng, seedFromString } from '../../src/engine/rng';

/*
 * 兩個人一起選路（連線版 2026-09-11）。規則跟秘寶撞件同一套：
 * 選一樣就走，選不一樣就擲一次骰。
 */
const rng = (s: string): Rng => new Rng(seedFromString(s));

describe('路線投票', () => {
  it('選一樣就走那一格，**而且一次骰都不擲**', () => {
    const r = rng('same');
    const before = { ...r.state };
    expect(settleVotes(r, ['a', 'a'])).toBe('a');
    expect(r.state, '意見一致就不該動到亂數——動了的話之後的地圖與獎勵全部位移').toEqual(before);
  });

  it('選不一樣就擲骰，而且兩格都可能被選中', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) seen.add(settleVotes(rng(`v${i}`), ['a', 'b']) ?? '');
    expect(seen).toEqual(new Set(['a', 'b']));
  });

  it('同一顆種子擲出同一格（兩台機器各自算，結果要一樣）', () => {
    for (const s of ['x', 'y', 'z']) {
      expect(settleVotes(rng(s), ['a', 'b'])).toBe(settleVotes(rng(s), ['a', 'b']));
    }
  });

  it('只有一個人投（另一位倒下）：就走他選的，不擲骰', () => {
    const r = rng('solo');
    const before = { ...r.state };
    expect(settleVotes(r, ['a', null])).toBe('a');
    expect(r.state).toEqual(before);
  });

  it('沒人投就回 null（不要隨便挑一格走）', () => {
    expect(settleVotes(rng('none'), [null, null])).toBeNull();
  });

  it('單機：一票就是結果', () => {
    expect(settleVotes(rng('one'), ['a'])).toBe('a');
  });
});

describe('要不要結算', () => {
  it('每個站著的人都投了才算數', () => {
    expect(allVoted([null, null], [true, true])).toBe(false);
    expect(allVoted(['a', null], [true, true]), '還有人沒投').toBe(false);
    expect(allVoted(['a', 'b'], [true, true])).toBe(true);
  });

  it('倒下的人不用投——不然一個人倒下就再也走不了路', () => {
    expect(allVoted(['a', null], [true, false]), '他倒下了，不等他').toBe(true);
  });

  it('全倒了就回 false（那時候已經輸了，輪不到選路）', () => {
    expect(allVoted([null, null], [false, false])).toBe(false);
  });
});
