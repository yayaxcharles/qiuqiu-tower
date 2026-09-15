import { describe, expect, it } from 'vitest';
import { _setManifestForTest, artUrl, hasMonsterPose, monsterUrl } from '../../src/ui/assets';

describe('素材查表', () => {
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
   * 影菲菲（鏡中球球照到菲菲時的變裝）的五張姿勢還在生。
   * 清單裡查不到那個鍵時**要退回影球球那組**，不能掉成灰剪影——
   * 一隻沒有五官的灰團在鏡子走廊裡打你，比暫時借用影球球的立繪難看得多。
   */
  it('立繪還沒進倉的鍵退回替身，不掉成剪影；圖進倉之後就不走替身了', () => {
    const shadowCat = { idle: 'assets/monsters/shadow_cat_idle.webp', down: 'assets/monsters/shadow_cat_down.webp' };
    _setManifestForTest({ cards: {}, sprites: {}, monsters: { 'codex/monster_shadow_cat': shadowCat }, icons: {}, bg: {}, review: [] });
    expect(monsterUrl('codex/monster_shadow_feifei', 'idle')).toContain('shadow_cat_idle');
    expect(monsterUrl('codex/monster_shadow_feifei', 'idle').startsWith('data:'), '不可以是剪影').toBe(false);
    expect(hasMonsterPose('codex/monster_shadow_feifei', 'down')).toBe(true);
    expect(hasMonsterPose('codex/monster_shadow_feifei', 'attack'), '替身也沒有的姿勢照樣回 false').toBe(false);

    // 圖進倉之後：有自己的鍵就用自己的
    _setManifestForTest({
      cards: {}, sprites: {}, icons: {}, bg: {}, review: [],
      monsters: { 'codex/monster_shadow_cat': shadowCat, 'codex/monster_shadow_feifei': { idle: 'assets/monsters/shadow_feifei_idle.webp' } },
    });
    expect(monsterUrl('codex/monster_shadow_feifei', 'idle')).toContain('shadow_feifei_idle');
  });
});
