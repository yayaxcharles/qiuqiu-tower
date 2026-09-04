// 罐頭鋪：每店一件特價、重整貨架一次、二三關珍品架（使用者 2026-09-04）
import { describe, expect, it } from 'vitest';
import { relicById } from '../../src/content/relics';
import { RESHUFFLE_COST, SALE_RATES, TREASURE_MIN_PRICE, buyCard, makeShop, newRun, repriceShop, reshuffleShop, takeRelic } from '../../src/engine/run';

describe('特價', () => {
  it('每間店剛好一件特價，折數只會是 7／5／4／3 折，比例接近 45／30／15／10；特價 = 原價 × 折數', () => {
    const count = new Map<number, number>();
    for (let i = 0; i < 2000; i++) {
      const run = newRun(`sale${i}`); run.act = 1 + (i % 3);
      const shop = makeShop(run);
      const all = [...shop.cards, ...shop.relics, ...shop.potions];
      const on = all.filter((x) => x.sale);
      expect(on.length).toBe(1);
      const it = on[0]!;
      expect(SALE_RATES.some(([r]) => r === it.sale)).toBe(true);
      expect(it.price).toBe(Math.round(it.base * it.sale!));
      count.set(it.sale!, (count.get(it.sale!) ?? 0) + 1);
    }
    for (const [rate, w] of SALE_RATES) { const share = (count.get(rate) ?? 0) / 2000; expect(share, `${rate} 折`).toBeGreaterThan(w / 100 - 0.05); expect(share, `${rate} 折`).toBeLessThan(w / 100 + 0.05); }
  });
  it('買到零錢罐重標時，特價格照舊乘折數', () => {
    const run = newRun('sale-jar');
    const shop = makeShop(run);
    takeRelic(run, 'coin_jar'); repriceShop(run, shop);
    for (const it of [...shop.cards, ...shop.relics, ...shop.potions]) expect(it.price).toBe(Math.round(it.base * 0.8 * (it.sale ?? 1)));
  });
});

describe('重整貨架', () => {
  it('75 條、每店一次；賣掉的格子維持原牌、沒賣的換成不重複的新牌；特價折數留在原格子', () => {
    const run = newRun('reshuffle'); run.fish = 999;
    const shop = makeShop(run);
    const before = shop.cards.map((c) => c.def.id);
    expect(buyCard(run, shop, 1)).toBe(true); expect(buyCard(run, shop, 3)).toBe(true);
    const fish = run.fish;
    const saleSlot = shop.cards.findIndex((c) => c.sale && !c.sold);
    expect(reshuffleShop(run, shop)).toBe(true);
    expect(fish - run.fish).toBe(RESHUFFLE_COST);
    expect(shop.cards[1]!.def.id).toBe(before[1]); expect(shop.cards[1]!.sold).toBe(true);
    expect(shop.cards[3]!.def.id).toBe(before[3]); expect(shop.cards[3]!.sold).toBe(true);
    for (const i of [0, 2, 4]) { expect(shop.cards[i]!.sold).toBe(false); expect(before.includes(shop.cards[i]!.def.id), `第 ${i} 格要換新牌`).toBe(false); }
    expect(new Set(shop.cards.map((c) => c.def.id)).size).toBe(5);
    if (saleSlot >= 0) expect(shop.cards[saleSlot]!.sale).toBeTruthy();
    expect(reshuffleShop(run, shop), '只能一次').toBe(false);
  });
  it('錢不夠不能重整', () => {
    const run = newRun('poor'); run.fish = 50;
    const shop = makeShop(run);
    expect(reshuffleShop(run, shop)).toBe(false);
    expect(shop.reshuffled).toBeFalsy();
  });
});

describe('珍品架', () => {
  it('第一關兩件常見秘寶；第二三關第三件是大魔物池、標價至少 250', () => {
    const r1 = newRun('t1'); expect(makeShop(r1).relics.length).toBe(2);
    for (const act of [2, 3]) {
      const run = newRun(`t${act}`); run.act = act;
      const shop = makeShop(run);
      expect(shop.relics.length).toBe(3);
      const t = shop.relics[2]!;
      expect(relicById[t.id]!.pool).toBe('大魔物');
      expect(t.base).toBeGreaterThanOrEqual(TREASURE_MIN_PRICE);
    }
  });
});
