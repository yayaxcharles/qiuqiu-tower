import { describe, expect, it } from 'vitest';
import {
  DANGDANG_EVENT_TEXT, EVENT_COND_HINTS, FEIFEI_EVENT_TEXT, FENGFENG_EVENT_TEXT, condHint, eventTextFor, lotteryAfter,
} from '../../src/content/event-text';
import { EVENT_COND_HINTS_B3, LOTTERY_AFTER } from '../../src/content/event-text-b3rare';
import { eventById } from '../../src/content/events';
import { rareEvents } from '../../src/content/events-rare';
import { purifyLine } from '../../src/content/purify-text';
import { HEROES, heroName } from '../../src/engine/hero';

/*
 * 內容擴充第三批的稀有事件文字（2026-09-23，設計稿 design3 照抄＋大俠貓那篇的替代版）：
 * 四隻各一份、抽到之後的那一句、神龕【魔氣】的條件提示句、淨化那一句。改回壞寫法（少一段、名字寫錯、提示句漏一隻、封封講喵）都要紅。
 */
const OTHERS = ['feifei', 'dangdang', 'fengfeng'] as const;
const TABLE = { feifei: FEIFEI_EVENT_TEXT, dangdang: DANGDANG_EVENT_TEXT, fengfeng: FENGFENG_EVENT_TEXT } as const;
const shrineCond = eventById['broken_shrine']!.choices.find((c) => c.requires)!;
/** 每一篇（加上神龕的條件選項）球球那份的每一段：開頭與每個選項的結果 */
const SEGMENTS: [string, string][] = [
  ...rareEvents.flatMap((e) => [[e.id, e.text], ...e.choices.map((c) => [e.id, c.result])] as [string, string][]),
  ['broken_shrine', shrineCond.result],
];

describe('稀有事件四隻各一份（整段換掉，不是換名字）', () => {
  it.each(OTHERS)('%s：每一段都有自己的版本、寫的是自己的名字、沒有球球開口', (hero) => {
    const name = heroName({ hero });
    for (const [id, raw] of SEGMENTS) {
      expect(TABLE[hero][raw], `${hero} ${id} 少一段：${raw.slice(0, 20)}`).toBeTruthy();
      const shown = eventTextFor(hero, raw);
      expect(shown).not.toBe(raw);
      expect(shown, `${hero} ${id}`).toContain(name);
      expect(shown, `${hero} ${id} 還有球球開口`).not.toContain('球球：「');
      if (hero !== 'feifei') expect(shown, `${hero} ${id} 講了喵`).not.toContain('喵');
    }
  });

  it('球球那份：他講的每一句句尾都是喵', () => {
    for (const [id, t] of SEGMENTS) {
      for (const q of t.match(/球球：「([^」]+)」/g) ?? []) expect(q.replace(/[！？。…～」]+$/u, ''), `${id}: ${q}`).toMatch(/喵$/u);
    }
  });

  it('菲菲不講喵、旁白指她用「她」不用「牠」', () => {
    for (const [id, raw] of SEGMENTS) {
      const shown = eventTextFor('feifei', raw);
      expect(shown, id).not.toContain('喵');
      expect(shown, id).not.toMatch(/菲菲[^。！？]*?牠/u);
    }
  });

  it('噹噹、封封喊大俠貓、不喊師父', () => {
    for (const hero of ['dangdang', 'fengfeng'] as const) {
      for (const [id, raw] of SEGMENTS) expect(eventTextFor(hero, raw), `${hero} ${id}`).not.toContain('師父');
    }
  });

  it('選項標籤四隻共用（五篇都沒有「忍術牌」，噹噹不用換字）', () => {
    for (const e of rareEvents) for (const c of e.choices) {
      expect(c.label).not.toContain('忍術');
      for (const hero of OTHERS) expect(eventTextFor(hero, c.label)).toBe(c.label);
    }
  });

  it('大俠貓那篇是替代版：本人不出場（主控裁決 2），只有窩、毛、葫蘆和舊紙', () => {
    const e = eventById['rare_catnip_master']!;
    const all = HEROES.flatMap((h) => [e.text, ...e.choices.map((c) => c.result)].map((t) => eventTextFor(h, t)));
    for (const t of all) {
      expect(t).not.toMatch(/四腳朝天地躺著|一掌|跳回塔頂|紫光一亮|含含糊糊地說|師父瞇著眼|大俠貓瞇著眼/u);
    }
    for (const h of HEROES) {
      const intro = eventTextFor(h, e.text);
      for (const w of ['貓形窩', '一撮灰色帶深紋的毛', '酒葫蘆', '摺起來的舊紙']) expect(intro, `${h} 開頭少了「${w}」（圖上有畫）`).toContain(w);
    }
    // 圖①是捧著舊紙看、圖②抱著葫蘆、圖③蜷在窩裡睡：三段結果各講到那一件
    for (const h of HEROES) {
      expect(eventTextFor(h, e.choices[0]!.result)).toContain('舊紙');
      expect(eventTextFor(h, e.choices[1]!.result)).toContain('葫蘆');
      expect(eventTextFor(h, e.choices[2]!.result)).toContain('窩');
    }
  });
});

describe('抽到之後的那一句', () => {
  it('籤筒五籤、大魔物兩種，四隻都有；跟引擎寫進提示的那一行（`tier`）對得上', () => {
    for (const [id, table] of Object.entries(LOTTERY_AFTER)) {
      const tiers = new Set(eventById[id]!.choices.flatMap((c) => c.outcome.flatMap((o) => (o.kind === 'lottery' ? o.table.map((t) => t.tier) : []))));
      expect([...tiers].sort(), id).toEqual(Object.keys(table).sort());
      for (const tier of tiers) for (const hero of HEROES) {
        const line = lotteryAfter(id, ['別的提示', tier], hero);
        expect(line, `${id} ${tier} ${hero}`).toBeTruthy();
        expect(line).toContain(heroName({ hero }));
        if (hero !== 'ninja') expect(line).not.toContain('喵');
      }
    }
    expect(lotteryAfter('rare_hot_spring', ['抽到：上上籤！'], 'ninja'), '不是抽獎的事件').toBe('');
    expect(lotteryAfter('rare_fortune_sticks', ['回復了 15 點生命'], 'ninja'), '提示裡沒有籤').toBe('');
  });
});

describe('神龕【魔氣】的條件提示句、淨化那一句', () => {
  it('四隻都有、寫的是那一位；第二批那十篇的表一個字沒動', () => {
    for (const hero of HEROES) {
      const h = condHint('broken_shrine', hero);
      expect(h, hero).toBe(EVENT_COND_HINTS_B3['broken_shrine']![hero]);
      expect(h).toContain(heroName({ hero }));
      if (hero !== 'ninja') expect(h).not.toContain('喵');
    }
    expect(Object.keys(EVENT_COND_HINTS)).not.toContain('broken_shrine');
    expect(condHint('sleeping_guard', 'feifei'), '第二批的照舊查得到').toBe(EVENT_COND_HINTS['sleeping_guard']!['feifei']);
  });

  it('點完清心香那一句四隻各一句，只有球球講喵', () => {
    for (const hero of HEROES) {
      const line = purifyLine(hero);
      expect(line).toBeTruthy();
      expect(line.endsWith('喵。')).toBe(hero === 'ninja');
    }
    expect(new Set(HEROES.map(purifyLine)).size).toBe(4);
  });
});
