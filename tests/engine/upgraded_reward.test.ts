// 第二關起戰鬥獎勵開出升級牌（使用者 2026-09-04：第二關 20%、第三關 40%，三張裡一張是＋版）
import { describe, expect, it } from 'vitest';
import { rollRewards } from '../../src/engine/rewards';
import { Rng, seedFromString } from '../../src/engine/rng';
import { newRun, takeCardReward } from '../../src/engine/run';

describe('獎勵開出升級牌', () => {
  it('機率照關數：0／20%／40%，而且升級的那張一定在三張裡', () => {
    const rate = (p: number) => {
      let n = 0;
      for (let i = 0; i < 2000; i++) {
        const r = rollRewards(new Rng(seedFromString(`up${p}-${i}`)), '戰鬥', [], 0, true, { upgradeChance: p });
        if (r.upgradedCard) { n++; expect(r.cards.some((c) => c.id === r.upgradedCard)).toBe(true); }
      }
      return n / 2000;
    };
    expect(rate(0)).toBe(0);
    expect(rate(0.2)).toBeGreaterThan(0.17); expect(rate(0.2)).toBeLessThan(0.23);
    expect(rate(0.4)).toBeGreaterThan(0.36); expect(rate(0.4)).toBeLessThan(0.44);
  });
  it('挑到那張就是升級版進牌組；挑別張是一般版', () => {
    const run = newRun('take-up');
    const r = rollRewards(new Rng(seedFromString('take')), '戰鬥', [], 0, true, { upgradeChance: 1 });
    const up = r.upgradedCard!; expect(up).toBeTruthy();
    const other = r.cards.find((c) => c.id !== up)!.id;
    takeCardReward(run, { ...r, cards: [...r.cards] }, up);
    expect(run.deck[run.deck.length - 1]!.upgraded).toBe(true);
    takeCardReward(run, { ...r, cards: [...r.cards] }, other);
    expect(run.deck[run.deck.length - 1]!.upgraded).toBe(false);
  });
});
