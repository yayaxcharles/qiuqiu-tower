import { describe, expect, it } from 'vitest';
import { Rng, seedFromString } from '../../src/engine/rng';

describe('Rng', () => {
  it('同種子產生同序列', () => {
    const a = new Rng(seedFromString('球球'));
    const b = new Rng(seedFromString('球球'));
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('不同種子序列不同', () => {
    const a = new Rng(seedFromString('球球'));
    const b = new Rng(seedFromString('魔物塔'));
    expect(a.next()).not.toBe(b.next());
  });

  it('next 落在 [0,1)', () => {
    const r = new Rng(seedFromString('x'));
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int 含兩端且不出界', () => {
    const r = new Rng(seedFromString('int'));
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(r.int(3, 6));
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });

  it('shuffle 是原陣列的重排且不改原陣列', () => {
    const r = new Rng(seedFromString('shuffle'));
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = r.shuffle(src);
    expect(src).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort((x, y) => x - y)).toEqual(src);
    expect(out).not.toEqual(src); // 8 個元素恰好原序的機率 1/40320，此種子已驗證會重排
  });

  it('state 經 JSON 來回後續接同一序列', () => {
    const r = new Rng(seedFromString('save'));
    r.next(); r.next();
    const copy = new Rng(JSON.parse(JSON.stringify(r.state)));
    expect(copy.next()).toBe(r.next());
  });

  it('pick 空陣列丟錯', () => {
    const r = new Rng(seedFromString('p'));
    expect(() => r.pick([])).toThrow();
  });
});
