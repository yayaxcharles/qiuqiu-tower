import { describe, expect, it } from 'vitest';
import { cardById } from '../../src/content/cards';
import { encounterById } from '../../src/content/enemies';
import { FIXED_EVENT_FLOOR_5, FIXED_EVENTS_FLOOR_5, eventById, events, fixedEventFloor5 } from '../../src/content/events';

describe('事件資料', () => {
  it('55 個事件、id 不重複、每個 1～3 個選項', () => {
    // 46＋封封的四篇專屬事件（2026-09-20）＋內容擴充第一批：5F 第二、三關兩版、球球三篇專屬（2026-09-23）
    expect(events.length).toBe(55);
    expect(new Set(events.map((e) => e.id)).size).toBe(55);
    for (const e of events) {
      expect(eventById[e.id]).toBe(e);
      expect(e.choices.length, e.id).toBeGreaterThanOrEqual(1);
      expect(e.choices.length, e.id).toBeLessThanOrEqual(3);
      expect(e.text.length, e.id).toBeGreaterThan(10);
    }
  });
  it('固定在 5F 的只有大俠那三版，一關一版（2026-09-23 內容擴充第一批）', () => {
    expect(eventById[FIXED_EVENT_FLOOR_5]?.fixedFloor).toBe(5);
    expect(events.filter((e) => e.fixedFloor !== undefined).map((e) => e.id).sort()).toEqual([...FIXED_EVENTS_FLOOR_5].sort());
    expect([1, 2, 3].map(fixedEventFloor5)).toEqual(['daxia_teach', 'daxia_chest', 'daxia_lastpage']);
    // 第一關那版沒標關數（舊存檔第二、三關的 5F 也是它）；後兩版標自己那一關，跟表對得上
    expect(eventById['daxia_teach']?.acts).toBeUndefined();
    expect(eventById['daxia_chest']?.acts).toEqual([2]);
    expect(eventById['daxia_lastpage']?.acts).toEqual([3]);
    for (const id of FIXED_EVENTS_FLOOR_5) expect(eventById[id]?.hero, `${id} 是共用的，四隻都會走到`).toBeUndefined();
    // 關數超出範圍夾到最近的一關，不會回 undefined 讓 5F 變成空格
    expect(fixedEventFloor5(0)).toBe('daxia_teach');
    expect(fixedEventFloor5(9)).toBe('daxia_lastpage');
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
