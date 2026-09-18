import { describe, expect, it } from 'vitest';
import { _setManifestForTest, hasHeroSprite, heroSpriteKey } from '../../src/ui/assets';

/**
 * 立繪的退路：她沒畫的姿勢要退到**她自己**最接近的一張，不是退回球球的。
 * 玩菲菲卻突然冒出一隻灰虎斑，比姿勢不精準難看得多。
 */
const sprites = (keys: string[]) => {
  _setManifestForTest({
    cards: {}, monsters: {}, icons: {}, bg: {}, review: [],
    sprites: Object.fromEntries(keys.map((k) => [k, `assets/${k}.webp`])),
  });
};
const NINJA_POSES = ['hero/ninja', 'hero/ninja_attack', 'hero/ninja_claw', 'hero/ninja_kick',
  'hero/ninja_dash', 'hero/ninja_punch', 'hero/ninja_down', 'hero/ninja_choke', 'hero/ninja_curl',
  'hero/ninja_guard', 'hero/ninja_hurt', 'hero/ninja_skill', 'hero/ninja_focus', 'hero/ninja_eat'];

describe('菲菲的立繪退路', () => {
  it('她有自己的那一張時就用自己的（補圖之後不該再退回基本出招）', () => {
    sprites([...NINJA_POSES, 'hero/feifei_idle', 'hero/feifei_attack', 'hero/feifei_claw',
      'hero/feifei_kick', 'hero/feifei_dash', 'hero/feifei_punch', 'hero/feifei_down', 'hero/feifei_choke']);
    for (const p of ['claw', 'kick', 'dash', 'punch', 'down', 'choke']) {
      expect(heroSpriteKey('feifei', `hero/ninja_${p}`), p).toBe(`hero/feifei_${p}`);
      expect(hasHeroSprite('feifei', `hero/ninja_${p}`), p).toBe(true);
    }
  });

  it('她沒畫的姿勢**一定不會**退回球球的圖', () => {
    sprites([...NINJA_POSES, 'hero/feifei_idle', 'hero/feifei_attack', 'hero/feifei_curl',
      'hero/feifei_hurt', 'hero/feifei_skill']);
    for (const p of ['claw', 'kick', 'dash', 'punch', 'down', 'choke', 'guard', 'focus', 'eat']) {
      const got = heroSpriteKey('feifei', `hero/ninja_${p}`);
      expect(got.startsWith('hero/feifei'), `${p} 退到了球球的圖：${got}`).toBe(true);
      expect(hasHeroSprite('feifei', `hero/ninja_${p}`), `${p} 嚴格版要回 false`).toBe(false);
    }
  });

  /*
   * 2026-09-18 補的四張非戰鬥姿勢（貓窩的打盹／磨東西／扶同伴，加過關走路）。
   * 這四個姿勢名沒進退路表的話，缺圖的角色會直接掉回球球那張——貓窩裡冒出一隻灰虎斑。
   */
  it('貓窩與走路那四張：有自己的就用自己的，沒有的退到自己的蜷縮或站姿', () => {
    sprites([...NINJA_POSES, 'hero/ninja_nap', 'hero/ninja_sharpen', 'hero/ninja_helpup', 'hero/ninja_walk',
      'hero/feifei_idle', 'hero/feifei_curl', 'hero/feifei_nap']);
    expect(heroSpriteKey('feifei', 'hero/ninja_nap')).toBe('hero/feifei_nap');
    // 睡著退蜷縮，其餘退站姿；三張都還沒生的那一位一律退回自己的圖，不會變成球球
    expect(heroSpriteKey('dangdang', 'hero/ninja_nap'), '連站姿都沒有才回原鍵').toBe('hero/ninja_nap');
    for (const p of ['sharpen', 'helpup', 'walk']) {
      expect(heroSpriteKey('feifei', `hero/ninja_${p}`), p).toBe('hero/feifei_idle');
      expect(hasHeroSprite('feifei', `hero/ninja_${p}`), `${p} 嚴格版要回 false`).toBe(false);
    }
    sprites([...NINJA_POSES, 'hero/feifei_idle', 'hero/feifei_curl']);
    expect(heroSpriteKey('feifei', 'hero/ninja_nap'), '她沒生睡著那張就退回自己的蜷縮').toBe('hero/feifei_curl');
  });
});
