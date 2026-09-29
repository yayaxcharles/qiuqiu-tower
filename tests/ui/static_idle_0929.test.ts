import { describe, expect, it } from 'vitest';
import COMBAT_RAW from '../../src/ui/screens/combat.ts?raw';
import { SIDE_MOTION_KINDS, staticIdle } from '../../src/ui/enemy-motion';

// 2026-09-29 使用者：「待機一直在原地走路好怪」「待機時都有原本圖片」——
// 從橫向捲軸搬來、待機其實是走路片段的那幾套，站著時改畫原本的待機立繪，出招、倒下才掛逐格畫布。
describe('走路當待機的魔物：待機改畫原本立繪', () => {
  it('走路／爬行當待機的 15 套都在名單裡；飄浮、滑行、開車、有真待機片段的不在', () => {
    const walk = ['armor_ghost', 'drum_tanuki', 'frog_daimyo', 'frog_daimyo_p2', 'iron_arhat', 'iron_claw', 'iron_claw_p2',
      'kappa', 'mask_dancer', 'orange_king', 'orange_king_p2', 'tanuki_lord', 'tanuki_lord_p2', 'wraith_samurai', 'plated_beetle'];
    for (const k of walk) expect(staticIdle(k as never), k).toBe(true);
    for (const k of ['lantern_ghost', 'tengu', 'vacuum', 'roomba_king', 'guardian_statue', 'orange_bandit', 'rat', 'ninja']) expect(staticIdle(k as never), k).toBe(false);
    expect(SIDE_MOTION_KINDS.filter((k) => staticIdle(k)).length).toBe(15);
  });

  it('戰鬥畫面：待機交還靜態立繪、出招演完收掉畫布，而且記成 idle（下次出招才會重播）', () => {
    const c = COMBAT_RAW.replace(/\r\n/g, '\n');
    expect(c).toContain("|| (!keepAttack && action === 'idle' && staticIdle(kind)));");
    // 畫布拿掉時逐格迴圈也要停（審查 高-1）
    expect(c.match(/state\.actor\.pause\(\);/g)?.length).toBe(2);
    expect(c).toContain("if (action === 'idle' && !keepAttack) state.action = 'idle';");
    const play = c.slice(c.indexOf('const playEnemyMotion = (uid: number, action: EnemyMotionAction): void => {'));
    expect(play.slice(0, 700)).toContain("if (action === 'idle' && staticIdle(state.kind)) {");
  });
});
