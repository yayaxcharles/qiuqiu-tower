import { describe, expect, it } from 'vitest';
import { cardById } from '../../src/content/cards';
import { encounterById, encountersOfPool } from '../../src/content/enemies';
import { FIXED_EVENT_FLOOR_5, FIXED_EVENTS_FLOOR_5, eventById, events, fixedEventFloor5 } from '../../src/content/events';
// 球球第二批的開頭與結果延後載入，這支一載入才填回事件資料（2026-09-23 b2fin）；不載的話下面「每篇都有字」驗不到那十八篇
import '../../src/content/event-text-b2';

describe('事件資料', () => {
  it('78 個事件、id 不重複、每個 1～3 個選項（條件選項另外算，最多再一條、排在最後）', () => {
    // 46＋封封的四篇專屬事件（2026-09-20）＋內容擴充第一批：5F 第二、三關兩版、球球三篇專屬（2026-09-23）
    // ＋內容擴充第二批：兩條鏈六集、關卡限定九篇、連線限定三篇（2026-09-23）＋第三批：稀有事件 5 篇
    expect(events.length).toBe(78);
    expect(new Set(events.map((e) => e.id)).size).toBe(78);
    for (const e of events) {
      expect(eventById[e.id]).toBe(e);
      const base = e.choices.filter((c) => !c.requires);
      expect(base.length, e.id).toBeGreaterThanOrEqual(1);
      expect(base.length, e.id).toBeLessThanOrEqual(3);
      expect(e.choices.length - base.length, `${e.id} 的條件選項`).toBeLessThanOrEqual(1);
      // 條件選項一律加在最後：既有選項的索引與結果圖一張都不能動（劇本 design2 決定 5）
      expect(e.choices.slice(0, base.length).every((c) => !c.requires), `${e.id} 的條件選項不在最後`).toBe(true);
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
          // 打大魔物池的（`pool`，2026-09-23 第三批 睡著的大魔物）不看 `encounterId`：這一關那一池一定有遭遇
          if (o.kind === 'fight' && o.pool) for (const a of e.acts ?? [1, 2, 3]) expect(encountersOfPool(o.pool, a).length, `${e.id} 第 ${a} 關的${o.pool}池`).toBeGreaterThan(0);
          else if (o.kind === 'fight') expect(encounterById[o.encounterId], `${e.id} fight`).toBeTruthy();
          if (o.kind === 'gamble') { walk(o.win); walk(o.lose); }
          if (o.kind === 'lottery') for (const t of o.table) walk(t.effects);
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
