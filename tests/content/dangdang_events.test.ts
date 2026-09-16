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

  it('圖生完了，所以他自己的地圖排得到，別人的排不到', () => {
    // 2026-09-17 早上圖生完、`artPending` 拿掉了。這條從「都排不到」翻成
    // 「只有他排得到」——職業獨占那道關卡還在，別人照樣看不到
    for (const e of his) expect(e.artPending, `${e.title} 還掛著待圖旗標？圖已經生完了`).toBeUndefined();
    const idsOn = (hero: string): Set<string> => {
      const seen = new Set<string>();
      for (let i = 0; i < 60; i++) {
        for (const act of [1, 2, 3]) {
          const m = generateMap(new Rng(seedFromString(`dd-ev-${hero}-${i}`)),
            { act, bossIds: ['nekomata'], flags: {}, hero });
          for (const n of m.nodes) if (n.eventId) seen.add(n.eventId);
        }
      }
      return seen;
    };
    const mine = idsOn('dangdang');
    expect(his.some((e) => mine.has(e.id)), '六十張地圖裡一次都沒排到他的事件').toBe(true);
    for (const hero of ['ninja', 'feifei']) {
      const theirs = idsOn(hero);
      for (const e of his) expect(theirs.has(e.id), `${e.title} 排進 ${hero} 的地圖了`).toBe(false);
    }
  });

  it('待圖那道閘門本身還活著（拿一篇臨時掛上去驗）', () => {
    /*
     * 閘門是 2026-09-17 為了「稿子一次寫完、圖排在後面幾批」加的。
     * 他的四篇現在圖都有了，所以改成臨時掛一篇上去驗——
     * 哪天 `map.ts` 那一行被刪掉，這條會紅。
     */
    const one = his[0]!;
    const idx = events.indexOf(one);
    events[idx] = { ...one, artPending: true };
    try {
      const seen = new Set<string>();
      for (let i = 0; i < 60; i++) {
        const m = generateMap(new Rng(seedFromString(`dd-gate-${i}`)),
          { act: 1, bossIds: ['nekomata'], flags: {}, hero: 'dangdang' });
        for (const n of m.nodes) if (n.eventId) seen.add(n.eventId);
      }
      expect(seen.has(one.id), '掛了待圖旗標還是排得到＝閘門失效了').toBe(false);
      expect(seen.size, '整批事件一個都沒排到？那這條測試失效了').toBeGreaterThan(10);
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
