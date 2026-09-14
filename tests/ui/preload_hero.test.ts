import { afterEach, describe, expect, it } from 'vitest';
import { _setManifestForTest, coopArtUrls, heroArtUrls, heroOfKey, heroSpriteUrls, isCoopOnlyArt } from '../../src/ui/assets';

/*
 * 首載只載共用與球球的圖，角色專屬的（菲菲）選好角色才補（總稽核 2026-09-14 F 中-1、中-3）。
 * 併回單機版之前她的 300 多張圖全被算進每個人的開場下載，首載從 9.7 MB 變 18.4 MB。
 */
const FAKE = {
  cards: { 'card/sanjo': 'assets/cards/card/sanjo.webp', 'card/feifei_feizhen': 'assets/cards/card/feifei_feizhen.webp' },
  sprites: {
    'hero/ninja_claw': 'assets/sprites/hero/ninja_claw.webp', 'hero/cover': 'assets/sprites/hero/cover.webp',
    'hero/feifei_attack': 'assets/sprites/hero/feifei_attack.webp', 'hero/samurai_idle': 'assets/sprites/hero/samurai_idle.webp',
    'rat_idle': 'assets/sprites/rat_idle.webp',
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
  afterEach(() => { _setManifestForTest({ cards: {}, sprites: {}, monsters: {}, icons: {}, bg: {}, review: [] }); });

  it('heroOfKey：帶 feifei 的鍵是她的，其餘（含球球的）算共用', () => {
    expect(heroOfKey('card/feifei_feizhen')).toBe('feifei');
    expect(heroOfKey('hero/feifei_attack')).toBe('feifei');
    expect(heroOfKey('bg/event_feifei_toll_r0')).toBe('feifei');
    expect(heroOfKey('bg/feifei_still_teach')).toBe('feifei');
    expect(heroOfKey('icon/map_hero_feifei_low')).toBe('feifei');
    expect(heroOfKey('hero/samurai_idle')).toBe('samurai');
    for (const k of ['card/sanjo', 'hero/ninja_claw', 'bg/event_toll', 'rat_idle', 'card/biepengzhenjian']) expect(heroOfKey(k), k).toBeNull();
  });

  it('戰鬥暖圖只暖這一局登場的角色', () => {
    _setManifestForTest(FAKE);
    const ninja = heroSpriteUrls(['ninja']);
    expect(ninja.some((u) => u.includes('ninja_claw'))).toBe(true);
    expect(ninja.some((u) => u.includes('feifei'))).toBe(false);
    expect(ninja.some((u) => u.includes('samurai'))).toBe(false);
    expect(ninja.some((u) => u.includes('hero/cover')), '標題那張本來就不暖').toBe(false);
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
    expect(hers.some((u) => u.includes('sanjo') || u.includes('ninja') || u.includes('samurai'))).toBe(false);
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
});
