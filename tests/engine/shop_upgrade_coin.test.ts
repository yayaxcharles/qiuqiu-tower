// 零錢罐當下生效且八折；升級牌機率也套用到罐頭鋪與事件選牌（使用者 2026-09-04）
import { describe, expect, it } from 'vitest';
import { eventById } from '../../src/content/events';
import { applyRunEffects, buyCard, buyRelic, makeShop, newRun, repriceShop, takeRelic, upgradeChanceFor } from '../../src/engine/run';

describe('零錢罐', () => {
  it('在店裡買到零錢罐，其餘商品當下就變八折', () => {
    const run = newRun('jar'); run.fish = 999;
    const shop = makeShop(run);
    shop.relics[0] = { id: 'coin_jar', base: 120, price: 120, sold: false };
    const before = shop.cards.map((c) => c.price);
    expect(buyRelic(run, shop, 0)).toBe(true);
    shop.cards.forEach((c, i) => expect(c.price).toBe(Math.round(before[i]! * 0.8)));
    for (const p of shop.potions) expect(p.price).toBe(Math.round(p.base * 0.8));
    expect(shop.relics[0]!.price, '賣掉的那格不重標').toBe(120);
  });
  it('已經帶著零錢罐再逛店，定價一開始就是八折；repriceShop 對照 base', () => {
    const run = newRun('jar2'); takeRelic(run, 'coin_jar');
    const shop = makeShop(run);
    for (const c of shop.cards) expect(c.price).toBe(Math.round(c.base * 0.8));
    repriceShop(run, shop);
    for (const c of shop.cards) expect(c.price).toBe(Math.round(c.base * 0.8));
  });
});

describe('升級牌也在罐頭鋪與事件選牌出現', () => {
  it('機率照關數（10／20／40%）；買到那格就是升級牌', () => {
    for (const [act, p] of [[1, 0.1], [2, 0.2], [3, 0.4]] as const) {
      let n = 0;
      for (let i = 0; i < 800; i++) { const run = newRun(`su${act}-${i}`); run.act = act; expect(upgradeChanceFor(run)).toBe(p); if (makeShop(run).cards.some((c) => c.upgraded)) n++; }
      expect(n / 800, `第 ${act} 關`).toBeGreaterThan(p - 0.04); expect(n / 800, `第 ${act} 關`).toBeLessThan(p + 0.04);
    }
    const run = newRun('buy-up'); run.fish = 9999; run.act = 3;
    let shop = makeShop(run); let tries = 0;
    while (!shop.cards.some((c) => c.upgraded) && tries++ < 50) shop = makeShop(run);
    const i = shop.cards.findIndex((c) => c.upgraded);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(buyCard(run, shop, i)).toBe(true);
    expect(run.deck[run.deck.length - 1]!.upgraded).toBe(true);
  });
  it('事件三選一（大俠傳功）在第三關約四成有一張升級版', () => {
    const ev = eventById['daxia_teach']!;
    let n = 0, total = 0;
    for (let i = 0; i < 600; i++) {
      const run = newRun(`ev-up-${i}`); run.act = 3;
      const out = applyRunEffects(run, ev.choices[0]!.outcome);
      if (out && 'chooseCard' in out) { total++; if (out.upgradedCard) { n++; expect(out.chooseCard.some((c) => c.id === out.upgradedCard)).toBe(true); } }
    }
    expect(total).toBe(600);
    expect(n / total).toBeGreaterThan(0.35); expect(n / total).toBeLessThan(0.45);
  });
});
