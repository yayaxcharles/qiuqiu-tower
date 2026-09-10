import { describe, expect, it } from 'vitest';
import type { MonsterPose } from '../../src/ui/assets';
import { monsterPose } from '../../src/ui/monsterpose';

/** 這隻的姿勢生好了哪幾張；預設四張都有 */
const has = (...poses: MonsterPose[]) => (p: MonsterPose): boolean => poses.includes(p);
const ALL = has('idle', 'attack', 'hurt', 'block');
const base = { attacking: false, hurt: false, dead: false, block: 0, has: ALL };

describe('魔物選圖', () => {
  it('沒事就是待機', () => {
    expect(monsterPose(base)).toBe('idle');
  });

  it('身上有防禦就畫防禦圖，不必是出防禦招那一拍', () => {
    // 縮殼是被打痛才觸發、鱗甲是牠回合結束才長，兩個都不在出招那一步
    expect(monsterPose({ ...base, block: 14 })).toBe('block');
  });

  it('出招優先於挨打：牠出招那一拍同時掉血（噎到、反彈）也要畫出招圖', () => {
    expect(monsterPose({ ...base, attacking: true, hurt: true })).toBe('attack');
  });

  it('挨打優先於防禦：擋著的時候被打穿，要看得出牠痛了', () => {
    expect(monsterPose({ ...base, hurt: true, block: 14 })).toBe('hurt');
  });

  it('倒下的一律待機，倒下有自己那套演法', () => {
    expect(monsterPose({ ...base, dead: true, hurt: true, block: 14 })).toBe('idle');
  });

  it('姿勢沒生好就往下退，不會叫出灰剪影', () => {
    expect(monsterPose({ ...base, hurt: true, has: has('idle') })).toBe('idle');
    expect(monsterPose({ ...base, block: 14, has: has('idle') })).toBe('idle');
    // 有挨打圖沒防禦圖：挨打照畫，防禦退回待機
    expect(monsterPose({ ...base, hurt: true, has: has('idle', 'hurt') })).toBe('hurt');
    expect(monsterPose({ ...base, block: 14, has: has('idle', 'hurt') })).toBe('idle');
  });

  it('出招圖不查有沒有生：monsterUrl 自己會退回待機', () => {
    expect(monsterPose({ ...base, attacking: true, has: has('idle') })).toBe('attack');
  });
});
