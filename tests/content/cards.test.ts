import { describe, expect, it } from 'vitest';
import { STARTER_DECK, cardById, cards } from '../../src/content/cards';

describe('牌資料', () => {
  it('數量：起手 3、忍術 52、絕學 31、壞毛病 8', () => {
    const count = (pool: string) => cards.filter((c) => c.pool === pool).length;
    expect(count('起手')).toBe(3);
    expect(count('忍術')).toBe(52);
    expect(count('絕學')).toBe(31);
    expect(count('壞毛病')).toBe(8);
    expect(cards.length).toBe(94);
  });
  it('id 與名稱不重複', () => {
    expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length);
    expect(new Set(cards.map((c) => c.name)).size).toBe(cards.length);
    for (const c of cards) expect(cardById[c.id]).toBe(c);
  });
  it('費用 0～3，插圖鍵就是自己的牌號', () => {
    // 2026-08-30 起每張牌都有專屬插圖，鍵一律是 `card/<自己的 id>`。
    // 這條比「格式對不對」嚴格：兩張牌不小心指到同一張圖也會被抓到。
    for (const c of cards) {
      expect(c.cost, c.name).toBeGreaterThanOrEqual(0);
      expect(c.cost, c.name).toBeLessThanOrEqual(3);
      expect(c.art, c.name).toBe(`card/${c.id}`);
    }
  });
  it('非壞毛病的牌都有升級內容', () => {
    for (const c of cards.filter((x) => x.pool !== '壞毛病')) {
      const u = c.upgrade;
      expect(u.cost !== undefined || u.effects !== undefined || u.keywords !== undefined, c.name).toBe(true);
    }
  });
  it('壞毛病一律不可打出且無效果', () => {
    for (const c of cards.filter((x) => x.pool === '壞毛病')) {
      expect(c.keywords).toContain('不可打出');
      expect(c.effects).toEqual([]);
    }
  });
  it('目標模式與效果一致', () => {
    for (const c of cards) {
      const hitsAll = c.effects.some((e) => ('target' in e && e.target === 'all'));
      const hitsOne = c.effects.some((e) =>
        (e.kind === 'damage' && e.target !== 'all') || e.kind === 'damageRandom' || e.kind === 'damageEqualBlock' ||
        e.kind === 'stealBlock' || e.kind === 'transferDebuffs' || e.kind === 'removeStatuses' ||
        (e.kind === 'status' && e.target === 'enemy') || e.kind === 'drawIfTargetStatus');
      if (hitsAll) expect(c.target, c.name).toBe('all');
      else if (hitsOne) expect(c.target, c.name).toBe('enemy');
      else if (c.pool === '壞毛病') expect(c.target, c.name).toBe('none');
      else expect(c.target, c.name).toBe('self');
    }
  });
  it('連抓加成的牌有上限', () => {
    for (const c of cards) for (const e of c.effects)
      if (e.kind === 'damage' && e.scaleWithCombo) expect(e.comboCap, c.name).toBeGreaterThan(0);
  });
  it('起手牌組 10 張', () => {
    expect(STARTER_DECK).toEqual([
      'sanjo', 'sanjo', 'sanjo', 'sanjo', 'sanjo',
      'tanding', 'tanding', 'tanding', 'tanding', 'kawarimi',
    ]);
    for (const id of STARTER_DECK) expect(cardById[id]?.pool).toBe('起手');
  });
});
