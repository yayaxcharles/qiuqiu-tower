import { describe, expect, it } from 'vitest';
import { events } from '../../src/content/events';
import { eventTextFor } from '../../src/content/dialogue';
import { generateMap } from '../../src/engine/map';
import { Rng, seedFromString } from '../../src/engine/rng';

/**
 * 噹噹的四篇專屬事件（2026-09-17），以及事件的「插圖還沒生」閘門。
 *
 * 牌早就有這道閘門（`CardDef.hidden`），事件一直沒有——因為在這之前，
 * 事件都是先有圖才寫文案。他反過來：稿子一次寫完，圖排在後面幾批。
 */
describe('噹噹的專屬事件', () => {
  const his = events.filter((e) => e.hero === 'dangdang');

  it('四篇都在，而且只排給他', () => {
    expect(his.map((e) => e.id)).toEqual(
      ['dangdang_lining', 'dangdang_toolbox', 'dangdang_old_dent', 'dangdang_jammed_gate']);
    for (const e of his) expect(e.choices.length, e.title).toBe(3);
  });

  it('插圖還沒生好，所以一張地圖都不會排到（連他自己的也不會）', () => {
    for (const e of his) expect(e.artPending, `${e.title} 沒掛待圖旗標`).toBe(true);
    const seen = new Set<string>();
    for (const hero of ['ninja', 'feifei', 'dangdang']) {
      for (let i = 0; i < 40; i++) {
        for (const act of [1, 2, 3]) {
          const m = generateMap(new Rng(seedFromString(`dd-ev-${hero}-${i}`)),
            { act, bossIds: ['nekomata'], flags: {}, hero });
          for (const n of m.nodes) if (n.eventId) seen.add(n.eventId);
        }
      }
    }
    for (const e of his) expect(seen.has(e.id), `${e.title} 排進地圖了，圖還沒生`).toBe(false);
    expect(seen.size, '整批事件一個都沒排到？那這條測試失效了').toBeGreaterThan(10);
  });

  it('待圖旗標真的擋得住：拿掉旗標就排得到', () => {
    // 反向檢查——不然哪天閘門失效（例如 `map.ts` 那一行被刪掉），上一條會照樣綠
    const one = his[0]!;
    const patched = { ...one, artPending: undefined };
    const idx = events.indexOf(one);
    events[idx] = patched;
    try {
      const seen = new Set<string>();
      for (let i = 0; i < 60; i++) {
        const m = generateMap(new Rng(seedFromString(`dd-on-${i}`)),
          { act: 1, bossIds: ['nekomata'], flags: {}, hero: 'dangdang' });
        for (const n of m.nodes) if (n.eventId) seen.add(n.eventId);
      }
      expect(seen.has(one.id), '拿掉待圖旗標之後還是排不到，閘門以外還有東西擋著').toBe(true);
    } finally {
      events[idx] = one;
    }
  });

  it('他的事件文字本來就是他的，不會再被換一次', () => {
    for (const e of his) {
      expect(eventTextFor('dangdang', e.text)).toBe(e.text);
      expect(e.text, `${e.title} 的開頭沒提到他`).toContain('噹噹');
      for (const c of e.choices) expect(c.result).toContain('噹噹');
    }
  });

  it('有發生事的選項都配了結果圖鍵，什麼都不做的沒有', () => {
    for (const e of his) {
      for (const [i, c] of e.choices.entries()) {
        const happens = c.outcome.filter((o) => o.kind !== 'flag').length > 0;
        expect(!!c.resultArt, `${e.title} 第 ${i + 1} 個選項`).toBe(happens);
        if (c.resultArt) expect(c.resultArt).toBe(`${e.id}_r${i}`);
      }
    }
  });
});
