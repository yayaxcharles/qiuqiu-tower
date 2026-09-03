// 罐頭鋪的稀有度隨關數往上（使用者 2026-09-03：第二關要比較常看到稀有牌、第三關更高）
import { describe, expect, it } from 'vitest';
import { makeShop, newRun } from '../../src/engine/run';

function tally(act: number, n = 300) {
  let rare = 0, uncommon = 0, total = 0, minRare = 99;
  for (let i = 0; i < n; i++) {
    const run = newRun(`shop-rarity-${i}`); run.act = act;
    const shop = makeShop(run);
    expect(shop.cards.length).toBe(5);
    expect(new Set(shop.cards.map((c) => c.def.id)).size).toBe(5);
    expect(shop.cards.filter((c) => c.def.pool === '忍術').length).toBe(3);
    const r = shop.cards.filter((c) => c.def.rarity === '稀有').length;
    rare += r; uncommon += shop.cards.filter((c) => c.def.rarity === '罕見').length; total += 5; minRare = Math.min(minRare, r);
  }
  return { rare: rare / total, uncommon: uncommon / total, minRare };
}

describe('罐頭鋪稀有度隨關數上升', () => {
  const a1 = tally(1), a2 = tally(2), a3 = tally(3);
  it('稀有牌比例：第一關 < 第二關 < 第三關', () => {
    expect(a1.rare).toBeGreaterThan(0.04); expect(a1.rare).toBeLessThan(0.2);
    expect(a2.rare).toBeGreaterThan(a1.rare + 0.1);
    expect(a3.rare).toBeGreaterThan(a2.rare + 0.1);
    expect(a3.rare).toBeGreaterThan(0.4);
  });
  it('第二關每間至少一張稀有、第三關至少兩張；第一關不保底', () => {
    expect(a1.minRare).toBe(0);
    expect(a2.minRare).toBeGreaterThanOrEqual(1);
    expect(a3.minRare).toBeGreaterThanOrEqual(2);
  });
  it('罕見牌在二三關占四成上下（保底補的是稀有，不是罕見）', () => {
    expect(a2.uncommon).toBeGreaterThan(0.3); expect(a3.uncommon).toBeGreaterThan(0.25);
  });
});
