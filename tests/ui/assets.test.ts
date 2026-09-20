import { describe, expect, it } from 'vitest';
import {
  _setManifestForTest, artUrl, heroOfKey, heroSpriteKey, heroSpriteUrls,
  hasMonsterPose, monsterUrl, TITLE_ART,
} from '../../src/ui/assets';

describe('素材查表', () => {
  it('封封的角色鍵、姿勢、首頁圖與預載都歸到封封', () => {
    _setManifestForTest({
      cards: { 'card/fengfeng_pingzhan': 'assets/cards/fengfeng_pingzhan.webp' },
      sprites: {
        'hero/fengfeng_idle': 'assets/sprites/hero/fengfeng_idle.webp',
        'hero/fengfeng_claw': 'assets/sprites/hero/fengfeng_claw.webp',
        'hero/fengfeng_cover': 'assets/sprites/hero/fengfeng_cover.webp',
        'hero/fengfeng_nap': 'assets/sprites/hero/fengfeng_nap.webp',
      },
      monsters: {}, icons: {}, bg: {}, review: [],
    });
    expect(heroOfKey('card/fengfeng_pingzhan')).toBe('fengfeng');
    expect(heroOfKey('hero/fengfeng_idle')).toBe('fengfeng');
    expect(heroSpriteKey('fengfeng', 'hero/ninja_claw')).toBe('hero/fengfeng_claw');
    expect(TITLE_ART.has('hero/fengfeng_cover')).toBe(true);
    const urls = heroSpriteUrls(['fengfeng']);
    expect(urls.some((url) => url.endsWith('fengfeng_claw.webp'))).toBe(true);
    expect(urls.some((url) => url.endsWith('fengfeng_nap.webp'))).toBe(false);
    expect(urls.some((url) => url.endsWith('fengfeng_cover.webp'))).toBe(false);
  });

  it('有圖給路徑，缺圖給剪影', () => {
    _setManifestForTest({
      cards: { 'ninja/01': 'assets/cards/ninja/01.webp' },
      sprites: {},
      monsters: { 'codex/monster_rat': { idle: 'assets/monsters/rat_idle.webp' } },
      icons: {},
      bg: {},
      review: [],
    });
    expect(artUrl('cards', 'ninja/01')).toContain('assets/cards/ninja/01.webp');
    expect(artUrl('cards', 'ninja/99').startsWith('data:image/svg+xml')).toBe(true);
    expect(monsterUrl('codex/monster_rat', 'idle')).toContain('rat_idle');
    expect(monsterUrl('codex/monster_rat', 'attack')).toContain('rat_idle');   // 沒有攻擊圖就退回待機圖
    expect(monsterUrl('codex/monster_none', 'idle').startsWith('data:')).toBe(true);
  });

  /*
   * 原本這裡守著「影菲菲的圖還沒進倉就先借影球球那組」。
   * 那張替身對照表 2026-09-18 拿掉了（她的五張 2026-09-15 當天就進倉，表空了三天），
   * 所以改成守現在真正的行為：**有自己的鍵就用自己的，查無鍵退成剪影、不會借別隻的圖**。
   */
  it('魔物立繪只認自己的鍵，查不到就退成剪影', () => {
    _setManifestForTest({
      cards: {}, sprites: {}, icons: {}, bg: {}, review: [],
      monsters: {
        'codex/monster_shadow_cat': { idle: 'assets/monsters/shadow_cat_idle.webp', down: 'assets/monsters/shadow_cat_down.webp' },
        'codex/monster_shadow_feifei': { idle: 'assets/monsters/shadow_feifei_idle.webp' },
      },
    });
    expect(monsterUrl('codex/monster_shadow_feifei', 'idle')).toContain('shadow_feifei_idle');
    expect(monsterUrl('codex/monster_shadow_feifei', 'attack'), '自己沒有的姿勢退回自己的待機圖').toContain('shadow_feifei_idle');
    expect(hasMonsterPose('codex/monster_shadow_feifei', 'down'), '別隻有、自己沒有的姿勢回 false').toBe(false);
    expect(monsterUrl('codex/monster_shadow_none', 'idle').startsWith('data:'), '查不到的鍵是剪影').toBe(true);
  });
});
