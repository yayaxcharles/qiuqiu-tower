import { describe, expect, it } from 'vitest';
import { cardById } from '../../src/content/cards';
import { encounterById } from '../../src/content/enemies';
import { FIXED_EVENT_FLOOR_5, eventById, events } from '../../src/content/events';

describe('事件資料', () => {
  it('38 個事件、id 不重複、每個 1～3 個選項', () => {
    expect(events.length).toBe(38);   // 30＋五個前後集的後集＋2026-09-11 三個（換家的老鼠、磨到只剩一把刀、速成的卷軸）
    expect(new Set(events.map((e) => e.id)).size).toBe(38);
    for (const e of events) {
      expect(eventById[e.id]).toBe(e);
      expect(e.choices.length, e.id).toBeGreaterThanOrEqual(1);
      expect(e.choices.length, e.id).toBeLessThanOrEqual(3);
      expect(e.text.length, e.id).toBeGreaterThan(10);
    }
  });
  it('只有大俠傳功固定在 5F', () => {
    expect(eventById[FIXED_EVENT_FLOOR_5]?.fixedFloor).toBe(5);
    expect(events.filter((e) => e.fixedFloor !== undefined).length).toBe(1);
  });
  it('引用的牌、遭遇都存在；花費為正', () => {
    for (const e of events) for (const c of e.choices) {
      if (c.costFish !== undefined) expect(c.costFish, e.id).toBeGreaterThan(0);
      expect(c.result.length, e.id).toBeGreaterThan(0);
      const walk = (fx: typeof c.outcome) => {
        for (const o of fx) {
          if (o.kind === 'addCard') expect(cardById[o.cardId], `${e.id} addCard`).toBeTruthy();
          if (o.kind === 'fight') expect(encounterById[o.encounterId], `${e.id} fight`).toBeTruthy();
          if (o.kind === 'gamble') { walk(o.win); walk(o.lose); }
        }
      };
      walk(c.outcome);
    }
  });
  it('結果裡球球講的話句尾是喵', () => {
    for (const e of events) for (const c of e.choices) {
      const m = c.result.match(/球球：「([^」]+)」/g) ?? [];
      for (const q of m) expect(q.replace(/[！？。…～」]+$/u, ''), `${e.id}: ${q}`).toMatch(/喵$/u);
    }
  });
});
