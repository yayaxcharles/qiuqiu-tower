import { afterEach, describe, expect, it, vi } from 'vitest';
import { _setManifestForTest, coopArtUrls, heroArtUrls, heroOfKey, heroSpriteUrls, isCoopOnlyArt, preloadArt } from '../../src/ui/assets';
import { preloadAct } from '../../src/ui/preload';

/*
 * 首載只載共用與球球的圖，角色專屬的（菲菲）選好角色才補（總稽核 2026-09-14 F 中-1、中-3）。
 * 併回單機版之前她的 300 多張圖全被算進每個人的開場下載，首載從 9.7 MB 變 18.4 MB。
 */
const FAKE = {
  cards: { 'card/sanjo': 'assets/cards/card/sanjo.webp', 'card/feifei_feizhen': 'assets/cards/card/feifei_feizhen.webp' },
  sprites: {
    'hero/ninja_claw': 'assets/sprites/hero/ninja_claw.webp', 'hero/cover': 'assets/sprites/hero/cover.webp',
    'hero/feifei_attack': 'assets/sprites/hero/feifei_attack.webp',
    'rat_idle': 'assets/sprites/rat_idle.webp',
    // 2026-09-18 補的四張非戰鬥姿勢，戰鬥暖圖不該碰到它們
    'hero/ninja_nap': 'assets/sprites/hero/ninja_nap.webp', 'hero/ninja_sharpen': 'assets/sprites/hero/ninja_sharpen.webp',
    'hero/ninja_helpup': 'assets/sprites/hero/ninja_helpup.webp', 'hero/ninja_walk': 'assets/sprites/hero/ninja_walk.webp',
  },
  monsters: {},
  icons: { 'icon/map_hero_low': 'assets/icons/map_hero_low.webp', 'icon/map_hero_feifei_low': 'assets/icons/map_hero_feifei_low.webp' },
  bg: {
    'bg/event_toll': 'assets/bg/event_toll.webp', 'bg/event_feifei_toll': 'assets/bg/event_feifei_toll.webp',
    'bg/event_feifei_toll_r0': 'assets/bg/event_feifei_toll_r0.webp', 'bg/feifei_still_teach': 'assets/bg/feifei_still_teach.webp',
    'bg/event_feifei_trace': 'assets/bg/event_feifei_trace.webp',
  },
  review: [],
};

describe('角色專屬的圖分開載', () => {
  afterEach(() => {
    _setManifestForTest({ cards: {}, sprites: {}, monsters: {}, icons: {}, bg: {}, review: [] });
    vi.unstubAllGlobals();
  });

  it('heroOfKey：帶 feifei 的鍵是她的，其餘（含球球的）算共用', () => {
    expect(heroOfKey('card/feifei_feizhen')).toBe('feifei');
    expect(heroOfKey('hero/feifei_attack')).toBe('feifei');
    expect(heroOfKey('bg/event_feifei_toll_r0')).toBe('feifei');
    expect(heroOfKey('bg/feifei_still_teach')).toBe('feifei');
    expect(heroOfKey('icon/map_hero_feifei_low')).toBe('feifei');
    expect(heroOfKey('codex/relic_old_sword_tassel')).toBe('fengfeng');
    for (const k of ['card/sanjo', 'hero/ninja_claw', 'bg/event_toll', 'rat_idle', 'card/biepengzhenjian']) expect(heroOfKey(k), k).toBeNull();
  });

  it('封封起始秘寶隨角色補載，故事場景維持實際播放時才載', () => {
    _setManifestForTest({
      cards: {}, sprites: {}, monsters: {}, review: [],
      icons: {
        'codex/relic_old_sword_tassel': 'assets/icons/relic_old_sword_tassel.webp',
      },
      bg: {
        'bg/fengfeng_story_top': 'assets/bg/fengfeng_story_top.webp',
        'bg/fengfeng_coop_feifei_top': 'assets/bg/fengfeng_coop_feifei_top.webp',
        'bg/event_fengfeng_toll': 'assets/bg/event_fengfeng_toll.webp',
      },
    });

    const fengfeng = heroArtUrls(['fengfeng']);
    expect(fengfeng).toContain('/assets/icons/relic_old_sword_tassel.webp');
    expect(fengfeng).toContain('/assets/bg/event_fengfeng_toll.webp');
    expect(fengfeng.some((url) => url.includes('story_top') || url.includes('coop_feifei_top'))).toBe(false);
    expect(heroArtUrls(['ninja']).some((url) => url.includes('old_sword_tassel'))).toBe(false);
  });

  it('戰鬥暖圖只暖這一局登場的角色', () => {
    _setManifestForTest(FAKE);
    const ninja = heroSpriteUrls(['ninja']);
    expect(ninja.some((u) => u.includes('ninja_claw'))).toBe(true);
    expect(ninja.some((u) => u.includes('feifei'))).toBe(false);
    expect(ninja.some((u) => u.includes('hero/cover')), '標題那張本來就不暖').toBe(false);
    // 貓窩三張與過關走路那張戰鬥裡用不到，暖了只會擋在魔物立繪前面（2026-09-18）
    for (const p of ['nap', 'sharpen', 'helpup', 'walk']) expect(ninja.some((u) => u.includes(`ninja_${p}`)), p).toBe(false);
    const both = heroSpriteUrls(['ninja', 'feifei']);
    expect(both.some((u) => u.includes('feifei_attack'))).toBe(true);
    expect(heroSpriteUrls([undefined]), '舊存檔沒寫角色＝球球').toEqual(ninja);
  });

  it('選好角色補載：只有那一位的鍵，結果圖與幻燈片照樣點到才載；球球沒有專屬鍵', () => {
    _setManifestForTest(FAKE);
    const hers = heroArtUrls(['feifei']);
    expect(hers.some((u) => u.includes('feifei_feizhen'))).toBe(true);
    expect(hers.some((u) => u.includes('feifei_attack'))).toBe(true);
    expect(hers.some((u) => u.includes('map_hero_feifei'))).toBe(true);
    expect(hers.some((u) => u.includes('event_feifei_toll.webp'))).toBe(true);
    expect(hers.some((u) => u.includes('_r0')), '結果圖點到才載').toBe(false);
    expect(hers.some((u) => u.includes('still')), '幻燈片推開關主門才載').toBe(false);
    expect(hers.some((u) => u.includes('sanjo') || u.includes('ninja'))).toBe(false);
    expect(heroArtUrls(['ninja'])).toEqual([]);
    expect(heroArtUrls([undefined])).toEqual([]);
  });

  it('雙人專屬牌的牌面進大廳才補：球球版與菲菲版都算，單機牌不算', () => {
    _setManifestForTest({
      ...FAKE,
      cards: {
        'card/sanjo': 'assets/cards/card/sanjo.webp',
        'card/fenyiban': 'assets/cards/card/fenyiban.webp', 'card/feifei_fenyiban': 'assets/cards/card/feifei_fenyiban.webp',
      },
    });
    const urls = coopArtUrls();
    expect(urls.some((u) => u.endsWith('/fenyiban.webp'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/feifei_fenyiban.webp'))).toBe(true);
    expect(urls.some((u) => u.includes('sanjo'))).toBe(false);
    expect(isCoopOnlyArt('card/fenyiban')).toBe(true);
    expect(isCoopOnlyArt('card/feifei_fenyiban')).toBe(true);
    expect(isCoopOnlyArt('card/sanjo')).toBe(false);
  });

  it('啟動預載保留正常底圖，但結果圖一律等實際進入結果頁才載', async () => {
    const sources: string[] = [];
    class FakeImage {
      private value = '';
      set src(value: string) { this.value = value; sources.push(value); }
      get src(): string { return this.value; }
      async decode(): Promise<void> { /* src 紀錄就是可觀察結果 */ }
    }
    vi.stubGlobal('Image', FakeImage);
    _setManifestForTest({
      cards: {}, sprites: {}, monsters: {}, icons: {}, review: [],
      bg: {
        'bg/event_toll': 'assets/bg/event_toll.webp',
        'bg/event_toll_r0': 'assets/bg/event_toll_r0.webp',
        'bg/event_toll_r12': 'assets/bg/event_toll_r12.webp',
      },
    });

    await preloadArt();

    expect(sources).toContain('/assets/bg/event_toll.webp');
    expect(sources.some((source) => /_r(?:0|12)\.webp$/.test(source))).toBe(false);
  });

  it('分關預載只補本局角色的專屬事件底圖', async () => {
    const sources: string[] = [];
    class FakeImage {
      set src(value: string) { sources.push(value); }
      async decode(): Promise<void> { /* src 紀錄就是可觀察結果 */ }
    }
    vi.stubGlobal('Image', FakeImage);
    _setManifestForTest({
      cards: {}, sprites: {}, monsters: {}, icons: {}, review: [],
      bg: {
        'bg/event_feifei_trace': 'assets/bg/event_feifei_trace.webp',
        'bg/event_dangdang_lining': 'assets/bg/event_dangdang_lining.webp',
      },
    });

    await preloadAct(1, 'feifei');

    expect(sources).toContain('/assets/bg/event_feifei_trace.webp');
    expect(sources).not.toContain('/assets/bg/event_dangdang_lining.webp');
  });
});
