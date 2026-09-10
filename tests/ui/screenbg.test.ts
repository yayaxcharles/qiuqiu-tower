import { describe, expect, it } from 'vitest';
import { _setManifestForTest } from '../../src/ui/assets';
import { actVariantKey } from '../../src/ui/screenbg';

/** 只放需要的鍵；其餘一律查不到，`actVariantKey` 就得逐段退回 */
function withBg(...keys: string[]): void {
  const bg: Record<string, string> = {};
  for (const k of keys) bg[k] = `assets/bg/${k.replace('bg/', '')}.webp`;
  _setManifestForTest({ cards: {}, sprites: {}, monsters: {}, icons: {}, bg, review: [] });
}

describe('節點畫面底圖挑圖', () => {
  it('沒帶樓層就只看關數，跟以前一樣', () => {
    withBg('bg/screen_rest', 'bg/screen_rest_mid', 'bg/screen_rest_top');
    expect(actVariantKey('bg/screen_rest', 1)).toBe('bg/screen_rest');
    expect(actVariantKey('bg/screen_rest', 2)).toBe('bg/screen_rest_mid');
    expect(actVariantKey('bg/screen_rest', 3)).toBe('bg/screen_rest_top');
  });

  it('帶樓層就在同一關內輪三款', () => {
    withBg('bg/screen_rest', 'bg/screen_rest_b', 'bg/screen_rest_c');
    expect(actVariantKey('bg/screen_rest', 1, 3)).toBe('bg/screen_rest');
    expect(actVariantKey('bg/screen_rest', 1, 4)).toBe('bg/screen_rest_b');
    expect(actVariantKey('bg/screen_rest', 1, 5)).toBe('bg/screen_rest_c');
    expect(actVariantKey('bg/screen_rest', 1, 6)).toBe('bg/screen_rest');
  });

  it('關數與關內變體疊在一起', () => {
    withBg('bg/screen_shop', 'bg/screen_shop_top', 'bg/screen_shop_top_b', 'bg/screen_shop_top_c');
    expect(actVariantKey('bg/screen_shop', 3, 31)).toBe('bg/screen_shop_top_b');
    expect(actVariantKey('bg/screen_shop', 3, 32)).toBe('bg/screen_shop_top_c');
    expect(actVariantKey('bg/screen_shop', 3, 33)).toBe('bg/screen_shop_top');
  });

  it('變體沒生就逐段退回，不會挑到一張灰剪影', () => {
    // 只有基底那張：`_mid_b` → `_mid` → 原圖
    withBg('bg/screen_chest');
    expect(actVariantKey('bg/screen_chest', 2, 17)).toBe('bg/screen_chest');
    // 有分關沒有關內變體：退到分關那張，不要一路掉回第一關
    withBg('bg/screen_chest', 'bg/screen_chest_mid');
    expect(actVariantKey('bg/screen_chest', 2, 17)).toBe('bg/screen_chest_mid');
  });

  it('同一層永遠同一張：地圖與畫面會反覆重畫，挑圖不能有隨機性', () => {
    withBg('bg/screen_rest', 'bg/screen_rest_b', 'bg/screen_rest_c');
    const once = actVariantKey('bg/screen_rest', 1, 7);
    for (let i = 0; i < 20; i++) expect(actVariantKey('bg/screen_rest', 1, 7)).toBe(once);
  });

  it('樓層是 0、負數、小數也要挑得出東西（開局 floor 可能還沒設好）', () => {
    withBg('bg/screen_rest', 'bg/screen_rest_b', 'bg/screen_rest_c');
    for (const f of [0, -1, -7, 2.6, Number.MAX_SAFE_INTEGER]) {
      const k = actVariantKey('bg/screen_rest', 1, f);
      expect(k.includes('undefined')).toBe(false);
      expect(k.includes('NaN')).toBe(false);
    }
  });

  it('關數超出 1～3 也不會算出 undefined', () => {
    withBg('bg/screen_rest', 'bg/screen_rest_top', 'bg/screen_rest_top_b');
    for (const act of [-1, 0, 4, 99]) {
      expect(actVariantKey('bg/screen_rest', act, 5).includes('undefined')).toBe(false);
    }
  });
});
