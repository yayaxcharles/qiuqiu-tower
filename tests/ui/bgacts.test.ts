import { describe, expect, it } from 'vitest';
import { bgKeysForAct, deferredBgKeys } from '../../src/ui/bgacts';

describe('底圖分關', () => {
  it('每關拿到自己的戰鬥背景三張、關主戰場一張、節點畫面（貓窩／罐頭鋪／紙箱各三款）', () => {
    expect(bgKeysForAct(1)).toEqual([
      'bg/low', 'bg/low_b', 'bg/low_c', 'bg/boss1',
      'bg/map_tall',
      'bg/screen_chest', 'bg/screen_chest_b', 'bg/screen_chest_c',
      'bg/screen_event',
      'bg/screen_rest', 'bg/screen_rest_b', 'bg/screen_rest_c',
      'bg/screen_shop', 'bg/screen_shop_b', 'bg/screen_shop_c',
    ]);
    expect(bgKeysForAct(2)).toContain('bg/mid_c');
    expect(bgKeysForAct(2)).toContain('bg/screen_shop_mid');
    expect(bgKeysForAct(2)).toContain('bg/screen_shop_mid_c');
    expect(bgKeysForAct(3)).toContain('bg/top_b');
    expect(bgKeysForAct(3)).toContain('bg/screen_rest_top');
    expect(bgKeysForAct(3)).toContain('bg/screen_rest_top_b');
    // 事件與地圖底圖沒做關內變體，不該憑空長出 `_b`
    expect(bgKeysForAct(1)).not.toContain('bg/screen_event_b');
    expect(bgKeysForAct(1)).not.toContain('bg/map_tall_b');
  });

  it('關數超出範圍就夾到 1～3，不要算出 bg/undefined', () => {
    expect(bgKeysForAct(0)).toEqual(bgKeysForAct(1));
    expect(bgKeysForAct(9)).toEqual(bgKeysForAct(3));
    for (const act of [-1, 0, 1, 2, 3, 4, 99]) {
      expect(bgKeysForAct(act).some((k) => k.includes('undefined'))).toBe(false);
    }
  });

  it('可延後的只有二三關專屬那幾張（各關的節點畫面現在一種三款）', () => {
    const skip = deferredBgKeys();
    // 二三關各：戰鬥背景 3＋關主 1＋地圖 1＋事件 1＋（貓窩／罐頭鋪／紙箱各 3 款＝ 9）＝ 15
    expect(skip.size).toBe(30);
    expect([...skip].every((k) => k.startsWith('bg/'))).toBe(true);
  });

  it('第一關會用到的一張都不准延後', () => {
    const skip = deferredBgKeys();
    for (const k of bgKeysForAct(1)) expect(skip.has(k)).toBe(false);
  });

  it('過關畫面、開場幻燈片、事件插圖不在延後名單裡', () => {
    // 2026-09-05 全面體檢點名過的三個雷：`screen_result_win` 第一關過關就要用；
    // 幻燈片與事件插圖根本不是關卡變體，被誤判延後就會現抓、閃一下
    const skip = deferredBgKeys();
    for (const k of ['bg/screen_result_win', 'bg/screen_result_lose', 'bg/screen_title',
      'bg/still_home', 'bg/still_embrace', 'bg/event_toll', 'bg/boss1', 'bg/low']) {
      expect(skip.has(k)).toBe(false);
    }
  });
});
