import { describe, expect, it } from 'vitest';

import { enemies, showsTelegraph } from '../../src/content/enemies';

/**
 * 出招預告（2026-09-04 拍板）：魔物動手前先亮半拍，讓人讀得懂下一拍要發生什麼。
 * 使用者裁決「只給關主與菁英」——小怪維持現在的節奏，會蹲下去的那隻才是重點。
 */
describe('出招預告的適用範圍', () => {
  it('關主（塔主）與菁英（大魔物）會亮', () => {
    for (const e of enemies) {
      if (e.pool === '塔主' || e.pool === '大魔物') {
        expect(showsTelegraph(e.id), `${e.name}（${e.pool}）`).toBe(true);
      }
    }
  });

  it('弱、中、強、召喚池的怪不會亮', () => {
    for (const e of enemies) {
      if (e.pool !== '塔主' && e.pool !== '大魔物') {
        expect(showsTelegraph(e.id), `${e.name}（${e.pool}）`).toBe(false);
      }
    }
  });

  it('查不到的魔物 id 不會亮（不要因為打錯字就整場閃）', () => {
    expect(showsTelegraph('沒有這隻')).toBe(false);
  });
});
