import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { _setManifestForTest, hasHeroSprite, heroSpriteKey, type Manifest } from '../src/ui/assets';

/**
 * 菲菲的立繪涵蓋率（2026-09-12）。
 *
 * `heroSpriteKey` 有三層退路，所以**少一張圖不會報錯**——畫面照樣有東西，
 * 只是換成另一個姿勢。這很好，但也表示「漏生一張圖」完全是靜音的。
 *
 * 這條測試盯住那條最要命的底線：**退到最後不可以退回球球的圖**。
 * 玩菲菲卻突然跳出一隻灰虎斑，比姿勢不精準難看得多（`assets.ts` 自己也是這樣寫的）。
 * 順便把「哪些用她自己的、哪些走退路」印出來，生圖生到哪一目了然。
 *
 * `POSE_KEYS` 要跟 `combat.ts` 的 `POSE` 表一致——`sprites_exist.test.ts` 已經
 * 用同一份名單釘住球球那邊，這裡沿用同樣的做法。
 */
// 型別跟著正本走（2026-09-23 低-2：手寫的 monsters 形狀跟 `Manifest` 早就對不上，
// `_setManifestForTest` 一直沒被型別檢查照到才沒發現）
const manifest = JSON.parse(readFileSync('public/assets/manifest.json', 'utf-8')) as Manifest;
_setManifestForTest(manifest);

const POSES = [
  'idle', 'attack', 'hit', 'dodge', 'hungry', 'win', 'lose', 'curl', 'power', 'hurt',
  'skill', 'throw', 'claw', 'kick', 'dash', 'punch', 'guard', 'eat', 'choke', 'dizzy',
  'focus', 'scroll', 'belly', 'lazy', 'puff', 'stealth', 'iron', 'roar', 'taiji',
  'qinggong', 'down',
];
const keyOf = (pose: string): string => (pose === 'idle' ? 'hero/ninja' : `hero/ninja_${pose}`);

describe('菲菲的立繪', () => {
  it('每個姿勢都解得出圖，而且**一定是她自己的**（絕不退回球球）', () => {
    const wrong: string[] = [];
    for (const pose of POSES) {
      const key = heroSpriteKey('feifei', keyOf(pose));
      if (!manifest.sprites[key]) wrong.push(`${pose}：解出 ${key}，清單裡沒這張`);
      else if (!key.includes('feifei')) wrong.push(`${pose}：退回球球的 ${key}`);
    }
    expect(wrong, `\n  ${wrong.join('\n  ')}\n`).toEqual([]);
  });

  it('球球自己一點都沒被動到', () => {
    for (const pose of POSES) expect(heroSpriteKey('ninja', keyOf(pose))).toBe(keyOf(pose));
  });

  it('印一份涵蓋清單', () => {
    const own = POSES.filter((p) => hasHeroSprite('feifei', keyOf(p)));
    const fell = POSES.filter((p) => !own.includes(p))
      .map((p) => `${p}→${heroSpriteKey('feifei', keyOf(p)).replace('hero/feifei_', '')}`);
    // eslint-disable-next-line no-console
    console.log(`  她自己畫好的 ${own.length}/${POSES.length}：${own.join('、')}`);
    // eslint-disable-next-line no-console
    if (fell.length) console.log(`  走退路的 ${fell.length}：${fell.join('、')}`);
    expect(own.length).toBeGreaterThan(0);
  });
});
