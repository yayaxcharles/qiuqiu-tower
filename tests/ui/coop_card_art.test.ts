import { beforeEach, describe, expect, it } from 'vitest';
import { _setManifestForTest, cardArtKey, coopArtUrls, heroArtUrls, isCoopOnlyArt, setLocalHero, setLocalPartnerHero } from '../../src/ui/assets';

describe('合作牌使用實際搭檔的插圖', () => {
  beforeEach(() => {
    setLocalHero('ninja');
    _setManifestForTest({
      cards: {
        'card/fenyiban': 'assets/cards/base.webp',
        'card/feifei_fenyiban': 'assets/cards/feifei.webp',
        'card/dangdang_fenyiban': 'assets/cards/dangdang.webp',
        'card/fengfeng_fenyiban': 'assets/cards/fengfeng.webp',
        'card/coop_feifei_ninja_fenyiban': 'assets/cards/pair_nf.webp',
        'card/coop_dangdang_ninja_fenyiban': 'assets/cards/pair_nd.webp',
        'card/coop_dangdang_feifei_fenyiban': 'assets/cards/pair_fd.webp',
        'card/coop_fengfeng_ninja_fenyiban': 'assets/cards/pair_fn.webp',
      },
      sprites: {}, monsters: {}, icons: {}, bg: {}, review: [],
    });
  });

  it.each([
    ['ninja', 'feifei', 'card/coop_feifei_ninja_fenyiban'],
    ['feifei', 'ninja', 'card/coop_feifei_ninja_fenyiban'],
    ['ninja', 'dangdang', 'card/coop_dangdang_ninja_fenyiban'],
    ['dangdang', 'ninja', 'card/coop_dangdang_ninja_fenyiban'],
    ['feifei', 'dangdang', 'card/coop_dangdang_feifei_fenyiban'],
    ['dangdang', 'feifei', 'card/coop_dangdang_feifei_fenyiban'],
    ['fengfeng', 'ninja', 'card/coop_fengfeng_ninja_fenyiban'],
    ['ninja', 'fengfeng', 'card/coop_fengfeng_ninja_fenyiban'],
  ])('%s 與 %s 兩個座位看到同一對角色', (hero, partner, expected) => {
    expect(cardArtKey('card/fenyiban', hero, partner)).toBe(expected);
  });

  it('沒有同伴、同角色組隊或缺少混搭圖時保留自己的圖', () => {
    expect(cardArtKey('card/fenyiban', 'feifei')).toBe('card/feifei_fenyiban');
    expect(cardArtKey('card/fenyiban', 'feifei', 'feifei')).toBe('card/feifei_fenyiban');
    expect(cardArtKey('card/fenyiban', 'feifei', 'samurai')).toBe('card/feifei_fenyiban');
    expect(cardArtKey('card/sanjo', 'ninja', 'feifei')).toBe('card/sanjo');
  });

  it('合作預載包含混搭圖，單人角色預載不下載混搭圖', () => {
    expect(coopArtUrls().some((url) => url.endsWith('pair_nf.webp'))).toBe(true);
    expect(isCoopOnlyArt('card/coop_dangdang_feifei_fenyiban')).toBe(true);
    expect(isCoopOnlyArt('card/coop_fengfeng_ninja_fenyiban')).toBe(true);
    expect(heroArtUrls(['feifei']).some((url) => url.includes('pair_'))).toBe(false);
  });

  it('本局預設用搭檔圖，指定圖鑑角色時不沿用本局搭檔', () => {
    setLocalPartnerHero('feifei');
    expect(cardArtKey('card/fenyiban')).toBe('card/coop_feifei_ninja_fenyiban');
    expect(cardArtKey('card/fenyiban', 'ninja')).toBe('card/fenyiban');
    setLocalPartnerHero(undefined);
    expect(cardArtKey('card/fenyiban')).toBe('card/fenyiban');
  });

  it('切換角色清掉上一場搭檔，避免單人與除錯圖鑑帶入舊配對', () => {
    setLocalPartnerHero('dangdang');
    setLocalHero('feifei');
    expect(cardArtKey('card/fenyiban')).toBe('card/feifei_fenyiban');
  });
});
